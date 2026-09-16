# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # dev server at http://localhost:3000 (/ redirects to /ricochet; temporary redirect, no landing page by design)
npm run build   # production build; also runs type-checking
npm run lint    # next lint
npm test        # vitest unit tests for solver.ts, gameId.ts, and boardGenerator.ts
```

Tests live next to the code they cover (`*.test.ts` under `src/app/ricochet/lib/`) and only exercise the pure logic modules — nothing in `components/` or `page.tsx` is tested.

## Architecture

A single-page Ricochet Robots puzzle game: Next.js 14 App Router, React 18, Tailwind 3, `lucide-react` icons. Deployed on Vercel (`@vercel/speed-insights` is in `layout.tsx`). Everything runs client-side. There is no backend or persistence.

- `src/app/ricochet/page.tsx` is the only route. It is a `'use client'` component that holds all game state (robots, walls, target, selection, move count, animation flags) and passes props and callbacks down to the presentational components in `ricochet/components/`.
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
- `eslint.config.mjs` is a flat config that uses `@eslint/eslintrc`, which is also not in `package.json`.
