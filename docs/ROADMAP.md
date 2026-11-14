# Roadmap

Ideas and improvements that are not built yet. Roughly ordered by value for effort within each section. Check the code before starting any of them: this file is a plan, not a record of what exists.

## Improvements

- **Accessibility.** Keyboard control for selecting and moving robots, ARIA labels on cells and robots, and a colorblind-safe mode (a shape or symbol per robot). Robot color is the only identifier today.
- **Persist small preferences.** The player name is already remembered in `localStorage`. Next: best solo move counts per Game ID, and a "seen the tutorial" flag. Wrap every access in try/catch, as `LobbyEntry` does.
- **Share the Game ID from multiplayer.** After a round, let players copy the board's Game ID to replay it solo. `encodeGameId` already exists; the lobby snapshot carries the puzzle state.
- **Test the React hooks.** `useLobby` and `usePathPlayback` have no tests. The countdown math is covered (`secondsLeft`); the hooks themselves need a jsdom environment and a React test renderer.
- **Server hardening, next steps.** A timeout on puzzle generation (the worker thread has none), a cap on concurrent generations, and structured logs for rejected or throttled events.

## Features

- **Daily puzzle.** Seed the generator from the date so everyone gets the same board, with a Wordle-style share string ("Solved in 9, optimal 7"). Needs a seedable RNG in `boardGenerator.ts`; Game IDs already make boards portable.
- **Solo scoring and hints.** Show par (the optimal move count) with a star rating. A "hint" that reveals only the next move of the stored solution; the worker already computes it.
- **Difficulty levels.** `MIN_SOLUTION_MOVES` and `MAX_SOLUTION_MOVES` are constants. Expose them as Easy, Medium, and Hard, for solo and as a host setting in multiplayer.
- **Multiplayer polish.** A match mode (first to N points), spectator seats, emoji reactions, rematch with the same players, a ready check before a round, and bots that lock in a route after a fixed delay for practice or to fill a lobby.
- **Replay and review.** After a round, step through any player's locked-in route against the optimal one. The server holds every route, so snapshots would need to reveal them once the round ends.
- **Board variety.** Moving walls, other board sizes, or the official game's wildcard target. The wall-type table in `gameId.ts` must change together with the generator and `getWallType`.
- **Installable PWA.** A manifest and offline support for solo play. Mobile controls already exist.
