// /app/ricochet/lib/gameId.ts
import { GameState, Robots, TargetChip, Walls } from './types';
import { ROBOT_COLORS, REVERSE_WALL_TYPE_MAP } from './constants';

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

export const decodeGameId = (gameId: string): GameState | null => {
    try {
        const parts = gameId.toLowerCase().split('-');
        if (parts.length !== 3) return null;
        const [robotStr, targetStr, wallStr] = parts;
        const numRobots = parseInt(robotStr[0], 16);
        const robotPositionsStr = robotStr.substring(1);
        const robots: Robots = {} as Robots;
        for (let i = 0; i < numRobots; i++) {
            const color = ROBOT_COLORS[i];
            const hexPair = robotPositionsStr.substring(i * 2, i * 2 + 2);
            const x = parseInt(hexPair[0], 16);
            const y = parseInt(hexPair[1], 16);
            robots[color] = { x, y, color };
        }
        const targetColor = ROBOT_COLORS[parseInt(targetStr[0], 16)];
        const targetX = parseInt(targetStr[1], 16);
        const targetY = parseInt(targetStr[2], 16);
        const target: TargetChip = { x: targetX, y: targetY, color: targetColor };
        const walls: Walls = {};
        for (let i = 0; i < wallStr.length; i += 3) {
            const wallChunk = wallStr.substring(i, i + 3);
            const x = parseInt(wallChunk[0], 16);
            const y = parseInt(wallChunk[1], 16);
            const type = parseInt(wallChunk[2], 16);
            const key = `${x},${y}`;
            walls[key] = { ...walls[key], ...REVERSE_WALL_TYPE_MAP[type] };
        }
        return { robots, walls, target };
    } catch (error) {
        console.error("Failed to decode Game ID:", error);
        return null;
    }
};