// /app/ricochet/lib/solver.ts
import { Walls, Robot, Robots, OptimalPathStep, Position, TargetChip } from './types';
import { ROBOT_COLORS, BOARD_SIZE } from './constants';

export const posKey = (p: Position): string => `${p.x},${p.y}`;

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

export const findOptimalPath = (startRobots: Robots, walls: Walls, target: TargetChip): { path: OptimalPathStep[] | null, statesExplored: number } => {
    const reverseMoves = precomputeReverseMoves(walls);
    const targetDistances = runBackwardsBfs(target, reverseMoves);

    const q: { robots: Robots; path: OptimalPathStep[] }[] = [{ robots: startRobots, path: [] }];
    const visited = new Set<string>([JSON.stringify(Object.values(startRobots).map(p => posKey(p)).sort())]);
    let bestPath: OptimalPathStep[] | null = null;
    let bestLength = Infinity;

    while (q.length > 0) {
        const { robots, path } = q.shift()!;
        const targetRobotPosKey = posKey(robots[target.color]);
        const movesFromTarget = targetDistances.get(targetRobotPosKey);

        if (movesFromTarget !== undefined) {
            const totalLength = path.length + movesFromTarget;
            if (totalLength < bestLength) {
                bestLength = totalLength;
                let backwardPath: OptimalPathStep[] = [];
                let pathTracePos: Robot = robots[target.color];
                let currentRobotsInTrace = robots;
                let currentDist = movesFromTarget;
                
                while (currentDist > 0) {
                    const moves = calculateMoves(pathTracePos, currentRobotsInTrace, walls);
                    const nextStep = moves.find(move => targetDistances.get(posKey(move)) === currentDist - 1);
                    if (nextStep) {
                        backwardPath.push({ color: target.color, pos: nextStep });
                        const nextRobots = structuredClone(currentRobotsInTrace);
                        nextRobots[target.color] = { ...nextRobots[target.color], ...nextStep };
                        currentRobotsInTrace = nextRobots;
                        pathTracePos = { ...nextStep, color: target.color };
                        currentDist--;
                    } else { break; }
                }
                bestPath = [...path, ...backwardPath];
            }
        }
        
        if (path.length + 1 >= bestLength) continue;

        for (const color of ROBOT_COLORS) {
            const possibleMoves = calculateMoves(robots[color], robots, walls);
            for (const move of possibleMoves) {
                const newRobots = structuredClone(robots);
                newRobots[color] = { ...newRobots[color], ...move };
                const stateKey = JSON.stringify(Object.values(newRobots).map(p => posKey(p)).sort());
                if (!visited.has(stateKey)) {
                    visited.add(stateKey);
                    q.push({ robots: newRobots, path: [...path, { color: color, pos: move }] });
                }
            }
        }
    }
    return { path: bestPath, statesExplored: visited.size };
};