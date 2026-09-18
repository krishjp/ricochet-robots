# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Next.js dev server at http://localhost:3000
npm run dev:server    # multiplayer Socket.IO server at http://localhost:3001 (tsx watch)
npm run build         # production build; also runs type-checking (including server/)
npm run build:server  # esbuild bundle of server/ into dist-server/
npm run start:server  # run the bundled server (what Render runs)
npm run lint          # next lint
npm test              # vitest unit tests for solver.ts, gameId.ts, boardGenerator.ts, and server/lobby.ts
```

Tests live next to the code they cover (`*.test.ts` under `src/app/ricochet/lib/` and `server/`) and only exercise the pure logic modules. Nothing in `components/`, the pages, or the socket wiring in `server/index.ts` is tested.

## Architecture

A Ricochet Robots puzzle game: Next.js 15 App Router, React 18, Tailwind 3, `lucide-react` icons. The Next.js app is deployed on Vercel (`@vercel/speed-insights` is in `layout.tsx`) and is entirely client-side. Multiplayer uses a separate Socket.IO server in `server/`, deployed on Render. Nothing is persisted.

Routes:

- `/` (`src/app/page.tsx`): landing page for choosing Solo or Multiplayer.
- `/ricochet`: solo play.
- `/ricochet/multiplayer`: multiplayer lobbies (see "Multiplayer" below).

Solo:

- `src/app/ricochet/page.tsx` It is a `'use client'` component that holds all game state (robots, walls, target, selection, move count, animation flags) and passes props and callbacks down to the presentational components in `ricochet/components/`.
- `src/app/ricochet/lib/` holds the pure game logic:
  - `types.ts`: shared types, including the worker message types. It also exports the `orbitron` `next/font` instance that the components import.
  - `constants.ts`: `BOARD_SIZE` (16), `ROBOT_COLORS` (the order matters for Game ID encoding), `ANIMATION_DURATION_MS`, `REVERSE_WALL_TYPE_MAP`, and the generator's limits on solution length and search size.
  - `solver.ts`: `moveLogic` (slides a robot until it hits a wall, a robot, or the board edge), `calculateMoves`, and `findOptimalPath`.
  - `boardGenerator.ts`: random board generation and `generateSolvablePuzzle`.
  - `gameId.ts`: encodes and decodes a game state as a shareable string.
  - `solver.worker.ts` and `useSolverWorker.ts`: run generation and solving on a Web Worker (see below).

### Background solving

The main thread never generates or solves puzzles.

- **New game:** `page.tsx` sends a `generate` job to the worker. The worker returns the new board together with its optimal solution.
- **Loaded Game ID:** the page sends a `solve` job instead.
- **Showing the solution:** "Show Optimal Solution" plays back the stored solution. The button reads "Solving..." until the solution arrives.
- **Replacing a job:** `useSolverWorker` delivers only the latest job's result. If a new job starts while the worker is busy, it terminates the worker and starts a fresh one.

Keep everything the worker imports free of browser-only and `next/font` code. Use `import type` when a worker-side module imports from `types.ts`, because `types.ts` loads `next/font`.
- `src/app/styles/ricochet-styles.ts` centralizes the Tailwind class strings (`styles.*` and the per-color `colors` map). Put new styling there instead of inline in the components. `grid-cols-16` is a custom utility defined in `tailwind.config.ts`.

### Multiplayer

The server is authoritative. It generates each puzzle, keeps the solution secret until the round ends, validates every demonstrated move with `calculateMoves`, and broadcasts a full `LobbySnapshot` after every change. Clients render what the snapshot says. The only client-only state is each player's private practice board during the thinking phase.

- `src/app/ricochet/lib/protocol.ts`: the typed Socket.IO events and snapshot shape shared by the client and the server. It uses type-only imports, like everything else the server bundles.
- `server/lobby.ts`: the `Lobby` class, a pure state machine with no sockets that is unit-tested with fake timers. The round flow is `waiting → generating → thinking → demonstrating → revealed`.
  - **Thinking:** players lock in a move count. The first lock-in starts `BID_COUNTDOWN_MS`. A player can only lower their own lock-in, and a lowered lock-in counts as a new one.
  - **Demonstrating:** bids are ordered by fewest moves, then by lock-in order. Each bidder gets `DEMO_TIME_LIMIT_MS` to reach the target in no more moves than they locked in. Running out of moves, running out of time, forfeiting, or being offline when the turn comes passes the turn to the next bidder.
  - **Revealed:** a successful demonstration scores 1 point. In every case the optimal solution is then revealed.
  - **Host:** the host is the earliest-joined connected player. Only the host can start or skip a round.
- `server/index.ts`: Socket.IO wiring, lobby codes, and seat ownership.
  - Each player holds a secret `token`. The client keeps it in `sessionStorage` and uses it to rejoin after a reconnect or reload.
  - A newer socket for the same player takes the seat over and sends the old socket `lobby:ended`.
  - A disconnected player keeps their seat for `RECONNECT_GRACE_MS`.
- `server/generatePuzzle.ts` runs `generateSolvablePuzzle` on a `worker_threads` worker (`server/puzzleWorker.ts`) so generation doesn't block other lobbies. The worker path uses the running file's extension, `.ts` under tsx and `.js` in the bundle.
- Client: `useLobby` (socket connection, rejoin, and actions), `useCountdown` (converts server deadlines to local time using `serverTime`), `usePathPlayback` (plays back the revealed solution), and the components `LobbyEntry` and `MultiplayerPanel`.
- Deployment: `render.yaml` defines the Render web service. Set `CLIENT_ORIGIN` on Render to the site's origin(s), comma-separated, for CORS. Set `NEXT_PUBLIC_MULTIPLAYER_URL` on Vercel to the Render URL; it defaults to `http://localhost:3001`. Lobbies live in memory, so run exactly one instance. A restart or a free-plan spin-down ends every lobby.

### Board model

- Coordinates: `x` is the column and `y` is the row. `y = 0` is the top (north) row.
- Cell keys are `"x,y"` strings made by `posKey()`.
- `Walls` is a sparse map from a cell key to `{north, east, south, west}` flags. A wall between two cells may be stored on either cell, so movement code checks both the current cell's side and the neighbor's opposite side.
- The outer border walls and the 2x2 center block walls are written into `walls` explicitly.
- Robots are rendered as an absolutely positioned overlay (`Robots.tsx`) on top of the CSS grid (`Board.tsx`). Moves animate with CSS `transform` transitions that take `ANIMATION_DURATION_MS`.

### Solver and generator

`findOptimalPath` is an exact breadth-first search over full board states, so the first solution it finds is optimal.

- **State encoding:** each robot's cell index (`y * 16 + x`) is packed into one number.
- **Visited set:** the key keeps the target robot in its own slot and sorts the other three robots, because they are interchangeable for reaching the goal. Don't drop robot identity for the target robot.
- **Pruning:** `targetLowerBounds` gives the fewest moves the target robot could need from each cell, assuming a blocker is always available. It never overestimates, so the search can prune states that can't finish within `maxDepth`, and it detects unreachable targets immediately.
- **Limits:** a result has `path: null` when there is no solution within `maxDepth`, or when the search visits more than `maxStates` states.

`generateSolvablePuzzle` keeps generating random boards until the exact solver finds a solution of `MIN_SOLUTION_MOVES` to `MAX_SOLUTION_MOVES` moves. It gives each board at most `GENERATOR_STATE_BUDGET` states. It then returns the board and its solution together.

`MAX_SOLUTION_MOVES` (12) and `GENERATOR_STATE_BUDGET` (200,000) only constrain what the *generator* is willing to hand a player; they are not a limit of the solver itself. `findOptimalPath`'s own default (`maxDepth: 30`, `maxStates: 3_000_000`) is far larger, and boards needing more than 12 moves or well over a million states do exist and solve correctly — see the "known worst-case board" test in `solver.test.ts` (12 moves, ~1.2M states) and the harder ones found alongside it (up to 15 moves, ~2.9M states) that just weren't kept.

Movement rules are defined once, in `solver.ts`. The UI's `calculateMoves` and the solver's precomputed stop table both derive from `moveLogic`/`hasWall`.

### Game ID format

`encodeGameId` and `decodeGameId` produce and parse uppercase hex in three dash-separated parts:

```
<robotCount><x><y> per robot in ROBOT_COLORS order - <targetColorIndex><x><y> - <x><y><wallType> per walled cell
```

`decodeGameId` validates the whole string against a regex and returns `null` for any malformed ID. It requires exactly 4 robots on distinct cells.

`wallType` is an index into `REVERSE_WALL_TYPE_MAP`, where 0–3 are corner pairs and 4–7 are single sides. `getWallType` records only the first matching type for each cell. If you add new wall shapes, update `getWallType`, `REVERSE_WALL_TYPE_MAP` and the generator together.

## Config quirks

- The repo has two PostCSS configs. `postcss.config.js` is the Tailwind 3 setup that matches the installed deps. `postcss.config.mjs` references `@tailwindcss/postcss` (Tailwind 4), which is not installed.
- `eslint.config.mjs` is a flat config, using `@eslint/eslintrc`'s `FlatCompat` to load `eslint-config-next`'s legacy-style configs under ESLint 9.
- `next lint` is deprecated as of Next.js 15 and will be removed in Next.js 16; migrating to the ESLint CLI directly (`npx @next/codemod@canary next-lint-to-eslint-cli .`) is a future task, not yet done.
