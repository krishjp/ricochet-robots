import { describe, expect, it } from 'vitest';
import { DEMO_SOLUTION, DEMO_STATE } from './demoPuzzle';
import { findOptimalPath } from './solver';

describe('demo puzzle', () => {
    it('decodes, and its stored solution is the optimal one', () => {
        expect(DEMO_STATE).not.toBeNull();
        const { path } = findOptimalPath(DEMO_STATE.robots, DEMO_STATE.walls, DEMO_STATE.target);
        expect(path).toEqual(DEMO_SOLUTION);
    });
});
