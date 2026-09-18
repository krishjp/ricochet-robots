# Ricochet Robots

A [Ricochet Robots](https://en.wikipedia.org/wiki/Ricochet_Robot) puzzle game built with Next.js 15, React 18, and Tailwind, with solo play and real-time multiplayer lobbies for up to 8 players. Slide robots in straight lines until they hit a wall, another robot, or the board edge, and get the target robot onto its target in as few moves as possible.

Puzzles are generated randomly and solved exactly in the background: a Web Worker runs a breadth-first search over full board states so the shown "optimal solution" is guaranteed shortest, without blocking the UI. Puzzles can also be shared and reloaded via a compact Game ID.

See [CLAUDE.md](./CLAUDE.md) for architecture, the board model, the solver/generator, and the Game ID format.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and choose Solo or Multiplayer. For multiplayer, also run the lobby server in a second terminal:

```bash
npm run dev:server   # Socket.IO server on http://localhost:3001
```

Other scripts:

```bash
npm run build          # production build; also runs type-checking
npm run build:server   # bundle the multiplayer server into dist-server/
npm run lint           # next lint
npm test               # vitest unit tests
```

## Multiplayer rules

1. Everyone in the lobby gets the same puzzle and looks for a solution. Practice moves are private.
2. Lock in a move count once you have a solution. The first lock-in starts a 30 second timer. Until it ends, anyone can lock in, and you can lower your own number. Several players can lock in the same number. Whoever locked in first goes first.
3. When time's up, the lowest lock-in has 60 seconds to play their solution live, in no more moves than they locked in. If they fail, the next-lowest player gets a turn.
4. A successful demonstration scores a point, and then everyone sees the optimal route.

## Deploy

- **Web app (Vercel):** uses `@vercel/speed-insights`. Set `NEXT_PUBLIC_MULTIPLAYER_URL` to the Render server's URL.
- **Multiplayer server (Render):** create a Blueprint from `render.yaml`, then set `CLIENT_ORIGIN` to the web app's origin, e.g. `https://your-app.vercel.app`. Comma-separate multiple origins. Lobbies are held in memory, so run a single instance. On the free plan the server sleeps when idle, and the first connection afterwards can take up to a minute.
