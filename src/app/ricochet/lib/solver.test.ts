import { describe, it, expect } from 'vitest';
import { moveLogic, calculateMoves, findOptimalPath, posKey } from './solver';
import type { Robots, Walls, TargetChip } from './types';

// Default corner placement keeps unused robots out of the way of a test's board.
const makeRobots = (overrides: Partial<Robots> = {}): Robots => ({
    red: { x: 0, y: 0, color: 'red' },
    blue: { x: 15, y: 0, color: 'blue' },
    green: { x: 0, y: 15, color: 'green' },
    yellow: { x: 15, y: 15, color: 'yellow' },
    ...overrides,
});

describe('posKey', () => {
    it('formats a position as "x,y"', () => {
        expect(posKey({ x: 3, y: 7 })).toBe('3,7');
    });
});

describe('moveLogic', () => {
    it('slides to the board edge when nothing blocks it', () => {
        const robots = makeRobots({ red: { x: 5, y: 5, color: 'red' } });
        expect(moveLogic(5, 5, 'south', robots, {})).toEqual({ x: 5, y: 15 });
        expect(moveLogic(5, 5, 'north', robots, {})).toEqual({ x: 5, y: 0 });
        expect(moveLogic(5, 5, 'east', robots, {})).toEqual({ x: 15, y: 5 });
        expect(moveLogic(5, 5, 'west', robots, {})).toEqual({ x: 0, y: 5 });
    });

    it('stops before a wall on the far side of the current cell', () => {
        const walls: Walls = { '5,5': { south: true } };
        expect(moveLogic(5, 0, 'south', makeRobots(), walls)).toEqual({ x: 5, y: 5 });
    });

    it('stops before a wall stored on the neighboring cell', () => {
        // A wall between (5,5) and (5,6), recorded on the far side.
        const walls: Walls = { '5,6': { north: true } };
        expect(moveLogic(5, 0, 'south', makeRobots(), walls)).toEqual({ x: 5, y: 5 });
    });

    it('stops next to another robot instead of passing through it', () => {
        const robots = makeRobots({ blue: { x: 5, y: 8, color: 'blue' } });
        expect(moveLogic(5, 0, 'south', robots, {})).toEqual({ x: 5, y: 7 });
    });

    it('returns null when the robot cannot move in that direction', () => {
        const robots = makeRobots({ red: { x: 0, y: 5, color: 'red' } });
        expect(moveLogic(0, 5, 'west', robots, {})).toBeNull();
    });
});

describe('calculateMoves', () => {
    it('returns one landing position per direction the robot can actually move', () => {
        const robots = makeRobots({ red: { x: 5, y: 5, color: 'red' } });
        const moves = calculateMoves(robots.red, robots, {});
        expect(moves).toHaveLength(4);
        expect(moves).toContainEqual({ x: 5, y: 15 });
        expect(moves).toContainEqual({ x: 5, y: 0 });
        expect(moves).toContainEqual({ x: 15, y: 5 });
        expect(moves).toContainEqual({ x: 0, y: 5 });
    });

    it('omits directions where the robot is already flush against a wall', () => {
        // Default corners for the other 3 robots would otherwise block red's slide; move them out of the way.
        const robots: Robots = {
            red: { x: 0, y: 0, color: 'red' },
            blue: { x: 8, y: 8, color: 'blue' },
            green: { x: 9, y: 8, color: 'green' },
            yellow: { x: 8, y: 9, color: 'yellow' },
        };
        const moves = calculateMoves(robots.red, robots, {});
        expect(moves).toHaveLength(2);
        expect(moves).toContainEqual({ x: 15, y: 0 });
        expect(moves).toContainEqual({ x: 0, y: 15 });
    });
});

describe('findOptimalPath', () => {
    it('returns an empty path when the target robot already sits on the target', () => {
        const target: TargetChip = { x: 0, y: 0, color: 'red' };
        const result = findOptimalPath(makeRobots(), {}, target);
        expect(result.path).toEqual([]);
    });

    it('finds a one-move solution when a wall stops the robot exactly on the target', () => {
        const robots = makeRobots({ red: { x: 5, y: 0, color: 'red' } });
        const walls: Walls = { '5,5': { south: true } };
        const target: TargetChip = { x: 5, y: 5, color: 'red' };
        const result = findOptimalPath(robots, walls, target);
        expect(result.path).toEqual([{ color: 'red', pos: { x: 5, y: 5 } }]);
    });

    it('finds the optimal multi-move solution when another robot must move first to act as a blocker', () => {
        const robots = makeRobots({
            red: { x: 5, y: 0, color: 'red' },
            green: { x: 0, y: 6, color: 'green' },
        });
        // Stops green's eastward slide at (5,6), which then blocks red's southward slide at (5,5).
        const walls: Walls = { '5,6': { east: true } };
        const target: TargetChip = { x: 5, y: 5, color: 'red' };
        const result = findOptimalPath(robots, walls, target);
        expect(result.path).toHaveLength(2);
        expect(result.path?.[0]).toEqual({ color: 'green', pos: { x: 5, y: 6 } });
        expect(result.path?.[1]).toEqual({ color: 'red', pos: { x: 5, y: 5 } });
    });

    it('returns a null path when no solution exists within maxDepth', () => {
        const robots = makeRobots({ red: { x: 5, y: 0, color: 'red' } });
        const target: TargetChip = { x: 5, y: 5, color: 'red' };
        // Reaching (5,5) needs at least one move; a zero-move budget can't find it.
        const result = findOptimalPath(robots, {}, target, { maxDepth: 0 });
        expect(result.path).toBeNull();
    });

    it('gives up and returns a null path once maxStates is exceeded', () => {
        const robots = makeRobots({ red: { x: 5, y: 0, color: 'red' } });
        const target: TargetChip = { x: 5, y: 5, color: 'red' };
        const walls: Walls = { '5,6': { east: true } };
        const result = findOptimalPath(robots, walls, target, { maxDepth: 30, maxStates: 1 });
        expect(result.path).toBeNull();
        expect(result.statesExplored).toBeGreaterThan(1);
    });
});
