import { describe, it, expect } from 'vitest';
import { generateInitialBoardState, generateSolvablePuzzle } from './boardGenerator';
import { posKey } from './solver';
import { BOARD_SIZE, ROBOT_COLORS, MIN_SOLUTION_MOVES, MAX_SOLUTION_MOVES } from './constants';

const CENTER_CELLS = new Set(['7,7', '7,8', '8,7', '8,8']);

describe('generateInitialBoardState', () => {
    it('places all 4 robots and the target on distinct, in-bounds, non-center cells', () => {
        const { robots, target } = generateInitialBoardState();
        const positions = [...ROBOT_COLORS.map(color => robots[color]), target];

        const keys = positions.map(posKey);
        expect(new Set(keys).size).toBe(keys.length);

        for (const { x, y } of positions) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(BOARD_SIZE);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThan(BOARD_SIZE);
            expect(CENTER_CELLS.has(posKey({ x, y }))).toBe(false);
        }
    });

    it('walls in the full board border', () => {
        const { walls } = generateInitialBoardState();
        for (let i = 0; i < BOARD_SIZE; i++) {
            expect(walls[posKey({ x: i, y: 0 })]?.north).toBe(true);
            expect(walls[posKey({ x: i, y: BOARD_SIZE - 1 })]?.south).toBe(true);
            expect(walls[posKey({ x: 0, y: i })]?.west).toBe(true);
            expect(walls[posKey({ x: BOARD_SIZE - 1, y: i })]?.east).toBe(true);
        }
    });
});

describe('generateSolvablePuzzle', () => {
    it('only returns puzzles whose optimal solution is within the configured move range', () => {
        const { solution } = generateSolvablePuzzle();
        expect(solution.path).not.toBeNull();
        expect(solution.path!.length).toBeGreaterThanOrEqual(MIN_SOLUTION_MOVES);
        expect(solution.path!.length).toBeLessThanOrEqual(MAX_SOLUTION_MOVES);
    }, 20000);
});
