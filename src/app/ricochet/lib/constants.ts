// /app/ricochet/lib/constants.ts
import type { RobotColor } from './types';

export const BOARD_SIZE = 16;
export const ROBOT_COLORS: readonly RobotColor[] = ["red", "blue", "green", "yellow"];
export const ANIMATION_DURATION_MS = 550;

// Puzzle generation: accepted range for the optimal solution length, and how many states
// the solver may visit on one candidate board before that board is discarded.
export const MIN_SOLUTION_MOVES = 4;
export const MAX_SOLUTION_MOVES = 12;
export const GENERATOR_STATE_BUDGET = 200_000;

// For Game ID encoding/decoding
export const REVERSE_WALL_TYPE_MAP = [
    { north: true, west: true },
    { north: true, east: true },
    { south: true, west: true },
    { south: true, east: true },
    { north: true },
    { south: true },
    { west: true },
    { east: true },
];
// Multiplayer lobbies
export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 20;
export const MAX_BID_MOVES = 99;
// Starts at the first lock-in; others can lock in until it runs out.
export const BID_COUNTDOWN_MS = 30_000;
// How long each bidder gets to play their solution before the next bidder's turn.
export const DEMO_TIME_LIMIT_MS = 60_000;
// How long a disconnected player keeps their seat (and score) before being removed.
export const RECONNECT_GRACE_MS = 60_000;
