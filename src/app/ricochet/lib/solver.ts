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

type HeapNode = {
    robots: Robots;
    path: OptimalPathStep[];
    score: number;
};

class MinHeap {
    private heap: HeapNode[];

    constructor() {
        this.heap = [];
    }

    public insert(node: HeapNode): void {
        this.heap.push(node);
        this.bubbleUp(this.heap.length - 1);
    }

    public extractMin(): HeapNode | null {
        if (this.heap.length === 0) return null;
        this.swap(0, this.heap.length - 1);
        const min = this.heap.pop()!;
        this.sinkDown(0);
        return min;
    }

    public isEmpty(): boolean {
        return this.heap.length === 0;
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].score <= this.heap[index].score) break;
            this.swap(index, parentIndex);
            index = parentIndex;
        }
    }

    private sinkDown(index: number): void {
        const left = 2 * index + 1;
        const right = 2 * index + 2;
        let smallest = index;

        if (left < this.heap.length && this.heap[left].score < this.heap[smallest].score) {
            smallest = left;
        }
        if (right < this.heap.length && this.heap[right].score < this.heap[smallest].score) {
            smallest = right;
        }
        if (smallest !== index) {
            this.swap(index, smallest);
            this.sinkDown(smallest);
        }
    }

    private swap(i: number, j: number): void {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }
}

export const findOptimalPath = (
    startRobots: Robots, 
    walls: Walls, 
    target: TargetChip
): { path: OptimalPathStep[] | null, statesExplored: number } => {
    
    const openSet = new MinHeap();
    openSet.insert({
        robots: startRobots,
        path: [],
        score: 0,
    });

    const visited = new Set<string>();
    let statesExplored = 0;

    while (!openSet.isEmpty()) {
        const { robots, path } = openSet.extractMin()!;
        statesExplored++;

        const stateKey = JSON.stringify(Object.values(robots).map(p => posKey(p)).sort());
        if (visited.has(stateKey)) {
            continue;
        }
        visited.add(stateKey);

        if (robots[target.color].x === target.x && robots[target.color].y === target.y) {
            return { path, statesExplored };
        }

        for (const color of ROBOT_COLORS) {
            const possibleMoves = calculateMoves(robots[color], robots, walls);

            for (const move of possibleMoves) {
                const newRobots = structuredClone(robots);
                newRobots[color] = { ...newRobots[color], ...move };
                
                const nextStateKey = JSON.stringify(Object.values(newRobots).map(p => posKey(p)).sort());
                if (!visited.has(nextStateKey)) {
                     const newPath = [...path, { color: color, pos: move }];
                    
                    const g = newPath.length;
                    const score = g;

                    openSet.insert({ robots: newRobots, path: newPath, score });
                }
            }
        }
    }

    return { path: null, statesExplored };
};