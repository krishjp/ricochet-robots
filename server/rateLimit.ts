// Small in-memory rate limiters for the multiplayer server. Both take a clock so tests can drive them.

// Allows bursts up to `capacity` events, refilling `refillPerSecond` tokens per second.
export class TokenBucket {
    private tokens: number;
    private last: number;

    constructor(
        private readonly capacity: number,
        private readonly refillPerSecond: number,
        private readonly now: () => number = Date.now,
    ) {
        this.tokens = capacity;
        this.last = now();
    }

    take(): boolean {
        const t = this.now();
        this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSecond);
        this.last = t;
        if (this.tokens < 1) return false;
        this.tokens--;
        return true;
    }
}

// At most `max` recorded events per key within a sliding `windowMs`.
export class WindowLimiter {
    private hits = new Map<string, number[]>();

    constructor(
        private readonly max: number,
        private readonly windowMs: number,
        private readonly now: () => number = Date.now,
    ) {}

    isFull(key: string): boolean {
        return this.recent(key).length >= this.max;
    }

    record(key: string) {
        this.hits.set(key, [...this.recent(key), this.now()]);
    }

    // Records the event unless the key is already at its limit; returns whether it was allowed.
    tryHit(key: string): boolean {
        if (this.isFull(key)) return false;
        this.record(key);
        return true;
    }

    // Drops keys with no events left in the window, so the map doesn't grow with every address ever seen.
    prune() {
        for (const key of [...this.hits.keys()]) {
            if (this.recent(key).length === 0) this.hits.delete(key);
        }
    }

    private recent(key: string): number[] {
        const cutoff = this.now() - this.windowMs;
        return (this.hits.get(key) ?? []).filter(t => t > cutoff);
    }
}
