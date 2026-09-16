// /app/ricochet/lib/boardGenerator.ts
import type { GameState, Position, Robots, TargetChip, Walls, SolveResult } from './types';
import { BOARD_SIZE, ROBOT_COLORS, MIN_SOLUTION_MOVES, MAX_SOLUTION_MOVES, GENERATOR_STATE_BUDGET } from './constants';
import { posKey, findOptimalPath } from './solver';

export const generateInitialBoardState = (): { robots: Robots; walls: Walls; target: TargetChip } => {
    const walls: Walls = {};
    const center = BOARD_SIZE / 2 - 1;

    // 3x3 forbidden zone first
    const forbiddenForWalls = new Set<string>();
    const centerStart = center - 1;
    for (let i = centerStart; i < centerStart + 4; i++) {
        for (let j = centerStart; j < centerStart + 4; j++) {
            forbiddenForWalls.add(posKey({ x: i, y: j }));
        }
    }

    // 2x2 Center Block walls
    const centerPositions = new Set<string>();
    for (let i = center; i <= center + 1; i++) {
        for (let j = center; j <= center + 1; j++) {
            const key = posKey({x: i, y: j});
            centerPositions.add(key);
            walls[key] = {}; // Initialize the wall object for the cell
            if (i === center) walls[key]!.west = true;
            if (i === center + 1) walls[key]!.east = true;
            if (j === center) walls[key]!.north = true;
            if (j === center + 1) walls[key]!.south = true;
        }
    }

    for (let i = 0; i < BOARD_SIZE; i++) {
        const topKey = posKey({ x: i, y: 0 });
        const bottomKey = posKey({ x: i, y: BOARD_SIZE - 1 });
        const leftKey = posKey({ x: 0, y: i });
        const rightKey = posKey({ x: BOARD_SIZE - 1, y: i });
        
        if (!walls[topKey]) walls[topKey] = {};
        walls[topKey]!.north = true;
        
        if (!walls[bottomKey]) walls[bottomKey] = {};
        walls[bottomKey]!.south = true;

        if (!walls[leftKey]) walls[leftKey] = {};
        walls[leftKey]!.west = true;
        
        if (!walls[rightKey]) walls[rightKey] = {};
        walls[rightKey]!.east = true;
    }
    
    const wallCount = 20;
    let placedWalls = 0;
    let attempts = 0;
    while(placedWalls < wallCount && attempts < 1000) {
        attempts++;
        const x = Math.floor(Math.random() * BOARD_SIZE);
        const y = Math.floor(Math.random() * BOARD_SIZE);
        const key = posKey({x,y});

        if (forbiddenForWalls.has(key)) continue;

        const isOnTopEdge = y === 0;
        const isOnBottomEdge = y === BOARD_SIZE - 1;
        const isOnLeftEdge = x === 0;
        const isOnRightEdge = x === BOARD_SIZE - 1;
        const isCorner = (isOnTopEdge || isOnBottomEdge) && (isOnLeftEdge || isOnRightEdge);
        const isOnEdge = isOnTopEdge || isOnBottomEdge || isOnLeftEdge || isOnRightEdge;

        if (isCorner) continue;

        let placedThisWall = false;
        const flipper = Math.round(Math.random());
        if (isOnEdge) {
            // single-segment wall
            const wallObj = walls[key] || {};
            if (isOnTopEdge && !wallObj.south || isOnBottomEdge && !wallObj.north) {
                if (flipper) wallObj.east = true; else wallObj.west = true;
                placedThisWall = true;
            }
            else if (isOnLeftEdge && !wallObj.east || isOnRightEdge && !wallObj.west) {
                if (flipper) wallObj.north = true; else wallObj.south = true;
                placedThisWall = true;
            }
            if (placedThisWall) { walls[key] = wallObj; }

        } else {
            if (walls[key]) continue;
            
            const orientation = Math.floor(Math.random() * 4);
            if (orientation === 0) { walls[key] = { north: true, west: true }; }
            else if (orientation === 1) { walls[key] = { north: true, east: true }; }
            else if (orientation === 2) { walls[key] = { south: true, west: true }; }
            else { walls[key] = { south: true, east: true }; }
            placedThisWall = true;
        }
        
        if (placedThisWall) {
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    forbiddenForWalls.add(posKey({ x: x + dx, y: y + dy }));
                }
            }
            placedWalls++;
        }
    }

    const occupied = new Set<string>();
    const placeItem = (): Position => {
        let pos;
        do {
            pos = {
                x: Math.floor(Math.random() * BOARD_SIZE),
                y: Math.floor(Math.random() * BOARD_SIZE),
            };
        } while (occupied.has(posKey(pos)) || centerPositions.has(posKey(pos)));
        occupied.add(posKey(pos));
        return pos;
    };

    const robots: Robots = {} as Robots;
    ROBOT_COLORS.forEach(color => {
        const { x, y } = placeItem();
        robots[color] = { x, y, color };
    });
    const targetPos = placeItem();
    const targetColor = ROBOT_COLORS[Math.floor(Math.random() * ROBOT_COLORS.length)];
    const target: TargetChip = { ...targetPos, color: targetColor };
    
    return { robots, walls, target };
};

/**
 * Generates random boards until one has an optimal solution between MIN_SOLUTION_MOVES
 * and MAX_SOLUTION_MOVES. The solution is returned too, so it is ready before play starts.
 */
export const generateSolvablePuzzle = (): { state: GameState; solution: SolveResult } => {
    while (true) {
        const state = generateInitialBoardState();
        const solution = findOptimalPath(state.robots, state.walls, state.target, { maxDepth: MAX_SOLUTION_MOVES, maxStates: GENERATOR_STATE_BUDGET });
        if (solution.path && solution.path.length >= MIN_SOLUTION_MOVES) return { state, solution };
    }
};
