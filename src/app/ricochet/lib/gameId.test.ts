import { describe, it, expect } from 'vitest';
import { encodeGameId, decodeGameId } from './gameId';
import type { GameState } from './types';

const sampleState: GameState = {
    robots: {
        red: { x: 1, y: 2, color: 'red' },
        blue: { x: 10, y: 15, color: 'blue' },
        green: { x: 0, y: 0, color: 'green' },
        yellow: { x: 15, y: 0, color: 'yellow' },
    },
    walls: {
        '5,5': { north: true, west: true },
        '6,6': { south: true },
        '7,7': { east: true },
    },
    target: { x: 1, y: 2, color: 'red' },
};

describe('encodeGameId / decodeGameId round trip', () => {
    it('decodes back to the same robots, target, and walls that were encoded', () => {
        const id = encodeGameId(sampleState);
        const decoded = decodeGameId(id);
        expect(decoded).toEqual(sampleState);
    });

    it('is case-insensitive on decode', () => {
        const id = encodeGameId(sampleState);
        expect(decodeGameId(id.toLowerCase())).toEqual(sampleState);
    });
});

describe('decodeGameId validation', () => {
    it('rejects a string that does not match the game ID shape', () => {
        expect(decodeGameId('not-a-game-id')).toBeNull();
        expect(decodeGameId('')).toBeNull();
    });

    it('rejects a robot count that does not match ROBOT_COLORS', () => {
        const id = encodeGameId(sampleState).replace(/^4/, '3');
        expect(decodeGameId(id)).toBeNull();
    });

    it('rejects overlapping robots', () => {
        const overlapping: GameState = {
            ...sampleState,
            robots: { ...sampleState.robots, blue: sampleState.robots.red },
        };
        // encodeGameId doesn't validate, so build the ID directly to exercise decode's own check.
        const id = encodeGameId(overlapping);
        expect(decodeGameId(id)).toBeNull();
    });

    it('rejects a target color index out of range', () => {
        const id = encodeGameId(sampleState);
        const [robotPart, , wallPart] = id.split('-');
        const badTarget = 'F' + id.split('-')[1].slice(1);
        expect(decodeGameId(`${robotPart}-${badTarget}-${wallPart}`)).toBeNull();
    });

    it('rejects an unknown wall type', () => {
        const id = encodeGameId(sampleState);
        const [robotPart, targetPart] = id.split('-');
        expect(decodeGameId(`${robotPart}-${targetPart}-00F`)).toBeNull();
    });
});
