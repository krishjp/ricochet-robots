import { describe, expect, it } from 'vitest';
import { secondsLeft } from './useCountdown';

describe('secondsLeft', () => {
    it('counts down to a server deadline, rounding partial seconds up', () => {
        expect(secondsLeft(60_000, 0, 0)).toBe(60);
        expect(secondsLeft(60_000, 0, 59_001)).toBe(1);
        expect(secondsLeft(60_000, 0, 60_000)).toBe(0);
    });

    it('never goes negative once the deadline has passed', () => {
        expect(secondsLeft(60_000, 0, 90_000)).toBe(0);
    });

    it("corrects for a client clock that disagrees with the server's", () => {
        // The server's clock reads 5s ahead of this device, so the deadline is 5s further away locally.
        expect(secondsLeft(65_000, 5_000, 0)).toBe(60);
        // The server's clock reads 5s behind: only 55s remain on the local clock.
        expect(secondsLeft(55_000, -5_000, 0)).toBe(60);
        expect(secondsLeft(60_000, -5_000, 0)).toBe(65);
    });
});
