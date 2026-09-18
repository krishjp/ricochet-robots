// /app/ricochet/lib/gameId.ts
import type { GameState, Robots, TargetChip, Walls } from './types';
import { ROBOT_COLORS, REVERSE_WALL_TYPE_MAP } from './constants';
import { posKey } from './solver';

const getWallType = (wall: { [key: string]: boolean }): number | null => {
    if (wall.north && wall.west) return 0;
    if (wall.north && wall.east) return 1;
    if (wall.south && wall.west) return 2;
    if (wall.south && wall.east) return 3;
    if (wall.north) return 4;
    if (wall.south) return 5;
    if (wall.west) return 6;
    if (wall.east) return 7;
    return null;
};

export const encodeGameId = (gameState: GameState): string => {
    const robotColors = Object.keys(gameState.robots) as (keyof Robots)[];
    const numRobots = robotColors.length;
    const robotPositionsStr = ROBOT_COLORS
        .filter(color => robotColors.includes(color))
        .map(color => {
            const robot = gameState.robots[color];
            return `${robot.x.toString(16)}${robot.y.toString(16)}`;
        }).join('');
    const robotStr = `${numRobots.toString(16)}${robotPositionsStr}`;
    const targetColor = gameState.target.color;
    const targetIndex = ROBOT_COLORS.indexOf(targetColor);
    const targetStr = `${targetIndex.toString(16)}${gameState.target.x.toString(16)}${gameState.target.y.toString(16)}`;
    const wallStr = Object.entries(gameState.walls).map(([key, value]) => {
        const type = getWallType(value);
        if (type === null) return '';
        const [x, y] = key.split(',').map(Number);
        return `${x.toString(16)}${y.toString(16)}${type}`;
    }).join('');
    return `${robotStr}-${targetStr}-${wallStr}`.toUpperCase();
};

// <robot count><x><y> per robot - <target color index><x><y> - <x><y><wall type> per walled cell
const GAME_ID_PATTERN = /^([0-9a-f])((?:[0-9a-f]{2})*)-([0-9a-f]{3})-((?:[0-9a-f]{3})*)$/;

// Returns null for any malformed ID rather than a partially built state.
export const decodeGameId = (gameId: string): GameState | null => {
    const match = gameId.trim().toLowerCase().match(GAME_ID_PATTERN);
    if (!match) return null;
    const [, countStr, robotStr, targetStr, wallStr] = match;
    const hex = (digit: string) => parseInt(digit, 16);

    if (hex(countStr) !== ROBOT_COLORS.length || robotStr.length !== ROBOT_COLORS.length * 2) return null;
    const robots: Robots = {} as Robots;
    ROBOT_COLORS.forEach((color, i) => {
        robots[color] = { x: hex(robotStr[i * 2]), y: hex(robotStr[i * 2 + 1]), color };
    });
    if (new Set(ROBOT_COLORS.map(color => posKey(robots[color]))).size !== ROBOT_COLORS.length) return null;

    const targetIndex = hex(targetStr[0]);
    if (targetIndex >= ROBOT_COLORS.length) return null;
    const target: TargetChip = { x: hex(targetStr[1]), y: hex(targetStr[2]), color: ROBOT_COLORS[targetIndex] };

    const walls: Walls = {};
    for (let i = 0; i < wallStr.length; i += 3) {
        const type = hex(wallStr[i + 2]);
        if (type >= REVERSE_WALL_TYPE_MAP.length) return null;
        const key = `${hex(wallStr[i])},${hex(wallStr[i + 1])}`;
        walls[key] = { ...walls[key], ...REVERSE_WALL_TYPE_MAP[type] };
    }
    return { robots, walls, target };
};