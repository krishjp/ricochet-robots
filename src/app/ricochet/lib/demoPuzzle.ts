// /app/ricochet/lib/demoPuzzle.ts
// A fixed puzzle and its optimal solution, played on a loop on the landing page.
import type { GameState, OptimalPathStep } from './types';
import { decodeGameId } from './gameId';

export const DEMO_GAME_ID = '4E6F801E8-0E1-7707828718830000F2F011041F5016F172042F5026F273043F5036F374044F3046F475045F5056F576046F2062F677047F5076F778048F5086F879049F5096F97A04AF50A6FA7B04BF20B6FB7C00CF50C6FC7D04DF50D6FD7E04EF20E0FE7FF3D423107D2DA0231B83B62B40280833462A21D83';

export const DEMO_STATE: GameState = decodeGameId(DEMO_GAME_ID)!;

export const DEMO_SOLUTION: OptimalPathStep[] = [
    { color: 'yellow', pos: { x: 14, y: 15 } },
    { color: 'red', pos: { x: 14, y: 14 } },
    { color: 'blue', pos: { x: 14, y: 8 } },
    { color: 'blue', pos: { x: 14, y: 0 } },
    { color: 'red', pos: { x: 14, y: 1 } },
];
