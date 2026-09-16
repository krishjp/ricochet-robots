// /app/ricochet/lib/solver.ts
import type { Walls, Robot, Robots, OptimalPathStep, Position, TargetChip, SolveResult } from './types';
import { ROBOT_COLORS, BOARD_SIZE } from './constants';

type Direction = 'north' | 'east' | 'south' | 'west';
const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];
const DELTA: Record<Direction, Position> = { north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 } };
const OPPOSITE: Record<Direction, Direction> = { north: 'south', east: 'west', south: 'north', west: 'east' };

export const posKey = (p: Position): string => `${p.x},${p.y}`;

// A wall may be stored on either cell it separates, so check both sides. The board edge counts as a wall.
const hasWall = (x: number, y: number, direction: Direction, walls: Walls): boolean => {
    const nx = x + DELTA[direction].x;
    const ny = y + DELTA[direction].y;
    if (nx < 0 || ny < 0 || nx >= BOARD_SIZE || ny >= BOARD_SIZE) return true;
    return !!walls[posKey({ x, y })]?.[direction] || !!walls[posKey({ x: nx, y: ny })]?.[OPPOSITE[direction]];
};

export const moveLogic = (x: number, y: number, direction: Direction, currentRobots: Robots, walls: Walls): Position | null => {
    const robotPositions = new Set(Object.values(currentRobots).map(p => posKey(p)));
    const { x: dx, y: dy } = DELTA[direction];
    let cx = x, cy = y;
    while (!hasWall(cx, cy, direction, walls) && !robotPositions.has(posKey({ x: cx + dx, y: cy + dy }))) {
        cx += dx;
        cy += dy;
    }
    return (cx !== x || cy !== y) ? { x: cx, y: cy } : null;
};

export const calculateMoves = (robot: Robot, currentRobots: Robots, walls: Walls): Position[] => {
    const moves: Position[] = [];
    for (const direction of DIRECTIONS) {
        const newPos = moveLogic(robot.x, robot.y, direction, currentRobots, walls);
        if (newPos) moves.push(newPos);
    }
    return moves;
};

// --- Solver ---
// The search works on cell indices (y * BOARD_SIZE + x). A board state is one number
// holding each robot's cell in 8 bits, in ROBOT_COLORS order.

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
const UNREACHABLE = 255;
const [NORTH, EAST, SOUTH, WEST] = [0, 1, 2, 3];

const cellIndex = (p: Position): number => p.y * BOARD_SIZE + p.x;
const cellPos = (cell: number): Position => ({ x: cell % BOARD_SIZE, y: Math.floor(cell / BOARD_SIZE) });

const pack = (cells: number[]): number => cells[0] + cells[1] * 0x100 + cells[2] * 0x10000 + cells[3] * 0x1000000;
const unpack = (state: number, cells: number[]) => {
    cells[0] = state & 0xff;
    cells[1] = (state >>> 8) & 0xff;
    cells[2] = (state >>> 16) & 0xff;
    cells[3] = state >>> 24;
};

// The non-target robots are interchangeable as far as the goal is concerned, so they are
// sorted in the visited-set key. The target robot always keeps its own slot.
const canonicalKey = (cells: number[], targetIdx: number): number => {
    let a = -1, b = -1, c = -1;
    for (let i = 0; i < cells.length; i++) {
        if (i === targetIdx) continue;
        if (a < 0) a = cells[i]; else if (b < 0) b = cells[i]; else c = cells[i];
    }
    if (a > b) [a, b] = [b, a];
    if (b > c) [b, c] = [c, b];
    if (a > b) [a, b] = [b, a];
    return a + b * 0x100 + c * 0x10000 + cells[targetIdx] * 0x1000000;
};

// stops[cell * 4 + dir] is where a robot starting on `cell` lands on a board with no other robots.
const precomputeStops = (walls: Walls): Uint8Array => {
    const stops = new Uint8Array(CELL_COUNT * 4);
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        const { x, y } = cellPos(cell);
        DIRECTIONS.forEach((direction, dir) => {
            const landing = moveLogic(x, y, direction, {} as Robots, walls);
            stops[cell * 4 + dir] = landing ? cellIndex(landing) : cell;
        });
    }
    return stops;
};

// Lower bound on the moves the target robot needs from each cell: the number of wall-free
// straight lines to the target, as if a blocking robot were always available to stop it.
// It never overestimates, so it is safe to prune with. UNREACHABLE means no solution exists.
const targetLowerBounds = (walls: Walls, target: Position): Uint8Array => {
    const bounds = new Uint8Array(CELL_COUNT).fill(UNREACHABLE);
    const queue = [cellIndex(target)];
    bounds[queue[0]] = 0;
    for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        for (const direction of DIRECTIONS) {
            let { x, y } = cellPos(cell);
            while (!hasWall(x, y, direction, walls)) {
                x += DELTA[direction].x;
                y += DELTA[direction].y;
                const origin = cellIndex({ x, y });
                if (bounds[origin] === UNREACHABLE) {
                    bounds[origin] = bounds[cell] + 1;
                    queue.push(origin);
                }
            }
        }
    }
    return bounds;
};

// Where robot `r` lands moving in `dir`, with the other robots as blockers.
const slide = (cells: number[], r: number, dir: number, stops: Uint8Array): number => {
    const from = cells[r];
    let to = stops[from * 4 + dir];
    if (to === from) return from;
    const column = from % BOARD_SIZE;
    for (let i = 0; i < cells.length; i++) {
        if (i === r) continue;
        const o = cells[i];
        // East/west stops are on the same row, so the index range alone keeps `o` on it.
        if (dir === NORTH) { if (o % BOARD_SIZE === column && o < from && o >= to) to = o + BOARD_SIZE; }
        else if (dir === SOUTH) { if (o % BOARD_SIZE === column && o > from && o <= to) to = o - BOARD_SIZE; }
        else if (dir === WEST) { if (o < from && o >= to) to = o + 1; }
        else if (dir === EAST) { if (o > from && o <= to) to = o - 1; }
    }
    return to;
};

export type SolveOptions = { maxDepth?: number; maxStates?: number };

/**
 * Breadth-first search over full board states (every robot's position), so the first
 * solution found is optimal. Returns a null path if no solution exists within
 * `maxDepth` moves, or if the search gives up after visiting `maxStates` states.
 */
export const findOptimalPath = (startRobots: Robots, walls: Walls, target: TargetChip, { maxDepth = 30, maxStates = 3_000_000 }: SolveOptions = {}): SolveResult => {
    const startTime = performance.now();
    const done = (path: OptimalPathStep[] | null, statesExplored: number): SolveResult =>
        ({ path, statesExplored, timeMs: performance.now() - startTime });

    const stops = precomputeStops(walls);
    const lowerBounds = targetLowerBounds(walls, target);
    const targetIdx = ROBOT_COLORS.indexOf(target.color);
    const targetCell = cellIndex(target);
    const start = ROBOT_COLORS.map(color => cellIndex(startRobots[color]));

    if (start[targetIdx] === targetCell) return done([], 1);
    if (lowerBounds[start[targetIdx]] > maxDepth) return done(null, 1);

    // Parallel arrays of search nodes: the packed state, the parent's index, and the move
    // that produced the node (robot index * 256 + destination cell).
    const nodes = [pack(start)];
    const parents = [-1];
    const moves = [0];
    const visited = new Set<number>([canonicalKey(start, targetIdx)]);

    const buildPath = (node: number, lastMove: number): OptimalPathStep[] => {
        const codes = [lastMove];
        for (let n = node; parents[n] !== -1; n = parents[n]) codes.push(moves[n]);
        return codes.reverse().map(code => ({ color: ROBOT_COLORS[code >> 8], pos: cellPos(code & 0xff) }));
    };

    const cells = [0, 0, 0, 0];
    let layerStart = 0;
    for (let depth = 1; depth <= maxDepth && layerStart < nodes.length; depth++) {
        const layerEnd = nodes.length;
        for (let n = layerStart; n < layerEnd; n++) {
            unpack(nodes[n], cells);
            for (let r = 0; r < cells.length; r++) {
                const from = cells[r];
                for (let dir = 0; dir < 4; dir++) {
                    const to = slide(cells, r, dir, stops);
                    if (to === from) continue;
                    const move = r * 0x100 + to;
                    if (r === targetIdx && to === targetCell) return done(buildPath(n, move), visited.size);

                    cells[r] = to;
                    if (depth + lowerBounds[cells[targetIdx]] <= maxDepth) {
                        const key = canonicalKey(cells, targetIdx);
                        if (!visited.has(key)) {
                            visited.add(key);
                            nodes.push(pack(cells));
                            parents.push(n);
                            moves.push(move);
                        }
                    }
                    cells[r] = from;
                }
            }
            if (visited.size > maxStates) return done(null, visited.size);
        }
        layerStart = layerEnd;
    }
    return done(null, visited.size);
};
