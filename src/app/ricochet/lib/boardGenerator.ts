// /app/ricochet/lib/boardGenerator.ts
import { GameState, Position, Robot, Robots, TargetChip, Walls, OptimalPathStep } from './types';
import { BOARD_SIZE, ROBOT_COLORS } from './constants';
import { posKey } from './solver'; // Re-using posKey

export const moveLogic = (x: number, y: number, direction: 'north' | 'south' | 'east' | 'west', currentRobots: Robots, walls: Walls): Position | null => {
    const robotPositions = new Set(Object.values(currentRobots).map(p => posKey(p)));
    let newPos = { x, y };
    if (direction === 'north') {
        while (newPos.y > 0 && !walls[posKey(newPos)]?.north && !walls[posKey({x: newPos.x, y: newPos.y - 1})]?.south && !robotPositions.has(posKey({x: newPos.x, y: newPos.y - 1}))) newPos.y--;
    } else if (direction === 'south') {
        while (newPos.y < BOARD_SIZE - 1 && !walls[posKey(newPos)]?.south && !walls[posKey({x: newPos.x, y: newPos.y + 1})]?.north && !robotPositions.has(posKey({x: newPos.x, y: newPos.y + 1}))) newPos.y++;
    } else if (direction === 'west') {
        while (newPos.x > 0 && !walls[posKey(newPos)]?.west && !walls[posKey({x: newPos.x - 1, y: newPos.y})]?.east && !robotPositions.has(posKey({x: newPos.x - 1, y: newPos.y}))) newPos.x--;
    } else if (direction === 'east') {
        while (newPos.x < BOARD_SIZE - 1 && !walls[posKey(newPos)]?.east && !walls[posKey({x: newPos.x + 1, y: newPos.y})]?.west && !robotPositions.has(posKey({x: newPos.x + 1, y: newPos.y}))) newPos.x++;
    }
    return (newPos.x !== x || newPos.y !== y) ? newPos : null;
};
export const calculateMoves = (robot: Robot, currentRobots: Robots, walls: Walls): Position[] => {
    const moves: Position[] = [];
    const directions: ('north' | 'south' | 'east' | 'west')[] = ['north', 'south', 'east', 'west'];
    for (const direction of directions) {
        const newPos = moveLogic(robot.x, robot.y, direction, currentRobots, walls);
        if(newPos) moves.push(newPos);
    }
    return moves;
};

/**
 * Pre-computes all possible "last moves" for every square.
 * For a given square, it finds all other squares from which a robot could have moved to land there.
 * This is the core of the backwards search.
 * It ignores other robots, as the backwards search from the target doesn't have robots on the board yet.
 * @returns A map where key is a position string and value is an array of positions that can move to the key.
 */
export const precomputeReverseMoves = (walls: Walls): Map<string, Position[]> => {
    const reverseMoves = new Map<string, Position[]>();
    const emptyRobots = {} as Robots;
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const currentPos = { x, y };
            const key = posKey(currentPos);
            if (!reverseMoves.has(key)) reverseMoves.set(key, []);
            const directions: ('north' | 'south' | 'east' | 'west')[] = ['north', 'south', 'east', 'west'];
            for (const dir of directions) {
                const landingPos = moveLogic(x, y, dir, emptyRobots, walls);
                if (landingPos) {
                    const landingKey = posKey(landingPos);
                    if (!reverseMoves.has(landingKey)) reverseMoves.set(landingKey, []);
                    reverseMoves.get(landingKey)!.push(currentPos);
                }
            }
        }
    }
    return reverseMoves;
};


/**
 * Performs a Breadth-First Search starting from the target square backwards.
 * It uses the pre-computed reverse moves to find the shortest path from the target to all other squares.
 * @returns A map where the key is a position string and the value is the minimum number of moves from the target.
 */
export const runBackwardsBfs = (target: Position, reverseMoves: Map<string, Position[]>): Map<string, number> => {
    const distances = new Map<string, number>();
    const queue: { pos: Position; dist: number }[] = [];

    const startKey = posKey(target);
    distances.set(startKey, 0);
    queue.push({ pos: target, dist: 0 });

    while (queue.length > 0) {
        const { pos, dist } = queue.shift()!;
        const key = posKey(pos);
        
        const possibleOrigins = reverseMoves.get(key) || [];
        for (const originPos of possibleOrigins) {
            const originKey = posKey(originPos);
            if (!distances.has(originKey)) {
                distances.set(originKey, dist + 1);
                queue.push({ pos: originPos, dist: dist + 1 });
            }
        }
    }
    return distances;
};

export const generateInitialBoardState = (): { robots: Robots; walls: Walls; target: TargetChip } => {
    console.log("Generating board...");
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
                flipper ? wallObj.east = true: wallObj.west = true; 
                placedThisWall = true; 
            }
            else if (isOnLeftEdge && !wallObj.east || isOnRightEdge && !wallObj.west) { 
                flipper ? wallObj.north = true: wallObj.south = true; 
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

export const generateSolvablePuzzle = (): GameState => {
    console.log("Generating new solvable puzzle...");
    let foundPuzzle = false;
    let state: GameState | null = null;

    while (!foundPuzzle) {
        const { robots, walls, target } = generateInitialBoardState();
        
        const reverseMoves = precomputeReverseMoves(walls);
        const targetDistances = runBackwardsBfs(target, reverseMoves);
        const q: { robots: Robots; path: OptimalPathStep[] }[] = [{ robots: robots, path: [] }];
        const visited = new Set<string>([JSON.stringify(Object.values(robots).map(p => posKey(p)).sort())]);
        let optimalLength: number | null = null;
    
        while(q.length > 0) {
            const { robots: currentRobots, path } = q.shift()!;
            const targetRobotPos = posKey(currentRobots[target.color]);
            const movesFromTarget = targetDistances.get(targetRobotPos);
            
            if (movesFromTarget !== undefined) {
                const totalMoves = path.length + movesFromTarget;
                if(optimalLength === null || totalMoves < optimalLength) {
                    optimalLength = totalMoves;
                }
            }
            if (path.length >= 5 || (optimalLength !== null && path.length >= optimalLength)) continue;
            for (const color of ROBOT_COLORS) {
                const possibleMoves = calculateMoves(currentRobots[color], currentRobots, walls);
                for (const move of possibleMoves) {
                    const newRobots = structuredClone(currentRobots);
                    newRobots[color] = { ...newRobots[color], ...move };
                    const stateKey = JSON.stringify(Object.values(newRobots).map(p => posKey(p)).sort());

                    if (!visited.has(stateKey)) {
                        visited.add(stateKey);
                        const newPath = [...path, { color: color, pos: move }];
                        q.push({ robots: newRobots, path: newPath });
                    }
                }
            }
        }

        if (optimalLength !== null && optimalLength >= 4 && optimalLength <= 12) {
            state = { robots, walls, target };
            foundPuzzle = true;
        }
    }
    return state!;
};