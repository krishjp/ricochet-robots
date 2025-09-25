// /app/ricochet/lib/constants.ts
import { RobotColor } from './types';

export const BOARD_SIZE = 16;
export const ROBOT_COLORS: readonly RobotColor[] = ["red", "blue", "green", "yellow"];
export const ANIMATION_DURATION_MS = 550;

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