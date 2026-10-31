import { describe, expect, it } from 'vitest';
import { TokenBucket, WindowLimiter } from './rateLimit';

describe('TokenBucket', () => {
    it('allows a burst, then refills over time', () => {
        let now = 0;
        const bucket = new TokenBucket(3, 1, () => now);
        expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, true, false]);
        now = 1000;
        expect([bucket.take(), bucket.take()]).toEqual([true, false]);
    });

    it('never banks more than its capacity', () => {
        let now = 0;
        const bucket = new TokenBucket(2, 1, () => now);
        now = 60_000;
        expect([bucket.take(), bucket.take(), bucket.take()]).toEqual([true, true, false]);
    });
});

describe('WindowLimiter', () => {
    it('limits each key separately within the window', () => {
        let now = 0;
        const limiter = new WindowLimiter(2, 1000, () => now);
        expect([limiter.tryHit('a'), limiter.tryHit('a'), limiter.tryHit('a')]).toEqual([true, true, false]);
        expect(limiter.tryHit('b')).toBe(true);
        now = 1001;
        expect(limiter.tryHit('a')).toBe(true);
    });

    it('only counts recorded events toward isFull', () => {
        const limiter = new WindowLimiter(1, 1000, () => 0);
        expect(limiter.isFull('a')).toBe(false);
        limiter.record('a');
        expect(limiter.isFull('a')).toBe(true);
    });

    it('forgets keys with nothing left in the window when pruned', () => {
        let now = 0;
        const limiter = new WindowLimiter(1, 1000, () => now);
        limiter.record('a');
        now = 2000;
        limiter.prune();
        expect(limiter.isFull('a')).toBe(false);
    });
});
