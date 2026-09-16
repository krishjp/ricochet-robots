# Ricochet Robots

A single-page [Ricochet Robots](https://en.wikipedia.org/wiki/Ricochet_Robot) puzzle game built with Next.js 14, React 18, and Tailwind. Slide robots in straight lines until they hit a wall, another robot, or the board edge, and get the target robot onto its target in as few moves as possible.

Puzzles are generated randomly and solved exactly in the background: a Web Worker runs a breadth-first search over full board states so the shown "optimal solution" is guaranteed shortest, without blocking the UI. Puzzles can also be shared and reloaded via a compact Game ID.

See [CLAUDE.md](./CLAUDE.md) for architecture, the board model, the solver/generator, and the Game ID format.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/ricochet`, the game's only route.

Other scripts:

```bash
npm run build   # production build; also runs type-checking
npm run lint    # next lint
```

There is no test suite; `npm run build` is the main correctness check.

## Deploy on Vercel

The app is deployed on Vercel and uses `@vercel/speed-insights`. See the [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for details on deploying elsewhere.
