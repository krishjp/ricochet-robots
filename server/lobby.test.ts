import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby, type Puzzle } from './lobby';
import type { GameState } from '../src/app/ricochet/lib/types';
import type { RouteStep } from '../src/app/ricochet/lib/protocol';
import { LOCK_IN_COUNTDOWN_MS, MAX_PLAYERS, MAX_ROUTE_MOVES, RECONNECT_GRACE_MS } from '../src/app/ricochet/lib/constants';
import { findOptimalPath } from '../src/app/ricochet/lib/solver';

// Red slides south from (0,0) and is stopped on the target at (0,5) by blue: a one-move puzzle.
const state: GameState = {
    robots: {
        red: { color: 'red', x: 0, y: 0 },
        blue: { color: 'blue', x: 0, y: 6 },
        green: { color: 'green', x: 15, y: 15 },
        yellow: { color: 'yellow', x: 15, y: 0 },
    },
    walls: {},
    target: { color: 'red', x: 0, y: 5 },
};
const puzzle: Puzzle = { state, solution: findOptimalPath(state.robots, state.walls, state.target) };
const WINNING_MOVE: RouteStep = { color: 'red', pos: { x: 0, y: 5 } };

// A valid route of exactly `moves` moves: yellow slides back and forth along the top row
// (stopped by red at (0,0) going west), then red makes the winning move.
const routeOf = (moves: number): RouteStep[] => [
    ...Array.from({ length: moves - 1 }, (_, i): RouteStep => ({ color: 'yellow', pos: { x: i % 2 === 0 ? 1 : 15, y: 0 } })),
    WINNING_MOVE,
];

const setup = async (playerCount: number) => {
    const onEmpty = vi.fn();
    const lobby = new Lobby('ABCDE', { generatePuzzle: () => Promise.resolve(puzzle), onChange: () => {}, onEmpty });
    const ids = Array.from({ length: playerCount }, (_, i) => {
        const result = lobby.addPlayer(`Player ${i}`, `conn-${i}`);
        if (!result.ok) throw new Error(result.error);
        return result.playerId;
    });
    return { lobby, ids, onEmpty };
};

const startThinking = async (lobby: Lobby, hostId: string) => {
    expect(lobby.startRound(hostId, lobby.snapshot().roundNumber)).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(0); // let the generated puzzle resolve
    expect(lobby.snapshot().phase).toBe('thinking');
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('joining', () => {
    it(`caps a lobby at ${MAX_PLAYERS} players and rejects duplicate names`, async () => {
        const { lobby } = await setup(MAX_PLAYERS);
        expect(lobby.addPlayer('Late', 'conn-late')).toMatchObject({ ok: false });

        const { lobby: small } = await setup(1);
        expect(small.addPlayer(' player  0 ', 'conn-x')).toMatchObject({ ok: false });
        expect(small.addPlayer('   ', 'conn-y')).toMatchObject({ ok: false });
    });

    it('only lets the host start a round', async () => {
        const { lobby, ids } = await setup(2);
        expect(lobby.startRound(ids[1], lobby.snapshot().roundNumber)).toMatchObject({ ok: false });
        await startThinking(lobby, ids[0]);
    });

    it('hands hosting to the next connected player while the host is offline', async () => {
        const { lobby, ids } = await setup(2);
        lobby.disconnect(ids[0], 'conn-0');
        expect(lobby.snapshot().hostId).toBe(ids[1]);
        expect(lobby.reconnect(ids[0], 'wrong-token', 'conn-new')).toMatchObject({ ok: false });
    });

    it('removes players who stay offline past the grace period, and reports an empty lobby', async () => {
        const { lobby, ids, onEmpty } = await setup(1);
        lobby.disconnect(ids[0], 'conn-0');
        vi.advanceTimersByTime(RECONNECT_GRACE_MS);
        expect(onEmpty).toHaveBeenCalledOnce();
    });
});

describe('locking in', () => {
    it('starts the countdown at the first lock-in and only accepts shorter replacement routes', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        expect(lobby.snapshot().countdownEndsAt).toBeNull();

        expect(lobby.lockInRoute(ids[0], 1, routeOf(5))).toEqual({ ok: true });
        expect(lobby.snapshot().countdownEndsAt).toBe(Date.now() + LOCK_IN_COUNTDOWN_MS);
        expect(lobby.lockInRoute(ids[0], 1, routeOf(6))).toMatchObject({ ok: false });
        expect(lobby.lockInRoute(ids[0], 1, routeOf(3))).toEqual({ ok: true });
        expect(lobby.snapshot().lockIns).toEqual([{ playerId: ids[0], moves: 3 }]);
    });

    it('rejects routes that break the rules or do not solve the puzzle', async () => {
        const { lobby, ids } = await setup(1);
        await startThinking(lobby, ids[0]);
        const rejected = [
            [],
            'not a route',
            [{ color: 'yellow', pos: { x: 1, y: 0 } }], // legal, but the target robot never arrives
            [{ color: 'red', pos: { x: 0, y: 3 } }], // robots can't stop mid-slide
            [{ color: 'purple', pos: { x: 0, y: 5 } }],
            [{ color: 'red', pos: { x: -1, y: 0 } }],
            [{ color: 'red' }],
            [null],
        ];
        for (const route of rejected) expect(lobby.lockInRoute(ids[0], 1, route)).toMatchObject({ ok: false });
        expect(lobby.snapshot()).toMatchObject({ lockIns: [], countdownEndsAt: null });
    });

    it(`accepts routes up to ${MAX_ROUTE_MOVES} moves and rejects longer ones`, async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        expect(lobby.lockInRoute(ids[0], 1, routeOf(MAX_ROUTE_MOVES + 1))).toMatchObject({ ok: false });
        expect(lobby.lockInRoute(ids[1], 1, routeOf(MAX_ROUTE_MOVES))).toEqual({ ok: true });
    });

    it('ranks shorter routes first, then earlier lock-ins, and a replacement counts as a new lock-in', async () => {
        const { lobby, ids } = await setup(3);
        await startThinking(lobby, ids[0]);
        lobby.lockInRoute(ids[0], 1, routeOf(3));
        lobby.lockInRoute(ids[1], 1, routeOf(4));
        lobby.lockInRoute(ids[2], 1, routeOf(3));
        expect(lobby.snapshot().lockIns.map(l => l.playerId)).toEqual([ids[0], ids[2], ids[1]]);

        lobby.lockInRoute(ids[1], 1, routeOf(3));
        expect(lobby.snapshot().lockIns.map(l => l.playerId)).toEqual([ids[0], ids[2], ids[1]]);
    });

    it('never sends routes to clients before the round ends', async () => {
        const { lobby, ids } = await setup(1);
        await startThinking(lobby, ids[0]);
        lobby.lockInRoute(ids[0], 1, routeOf(2));
        expect(JSON.stringify(lobby.snapshot())).not.toContain('"pos"');
    });

    it('lets the host skip a puzzle nobody has locked in on', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        expect(lobby.skipRound(ids[1], 1)).toMatchObject({ ok: false });
        expect(lobby.skipRound(ids[0], 1)).toEqual({ ok: true });
        expect(lobby.snapshot().outcome).toEqual({ winnerId: null, moves: null, winningRoute: null, solution: null });
    });

    it('stops the countdown if every locked-in player leaves', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        lobby.lockInRoute(ids[1], 1, routeOf(2));
        lobby.leave(ids[1]);
        expect(lobby.snapshot()).toMatchObject({ phase: 'thinking', lockIns: [], countdownEndsAt: null });
        vi.advanceTimersByTime(LOCK_IN_COUNTDOWN_MS);
        expect(lobby.snapshot().phase).toBe('thinking');
    });
});

describe('round end', () => {
    const toReveal = async (routeLengths: number[]) => {
        const setupResult = await setup(routeLengths.length);
        const { lobby, ids } = setupResult;
        await startThinking(lobby, ids[0]);
        routeLengths.forEach((moves, i) => lobby.lockInRoute(ids[i], 1, routeOf(moves)));
        vi.advanceTimersByTime(LOCK_IN_COUNTDOWN_MS);
        expect(lobby.snapshot().phase).toBe('revealed');
        return setupResult;
    };

    it('awards the shortest route when the countdown ends and shares it, but keeps the optimal route hidden', async () => {
        const { lobby, ids } = await toReveal([3, 2]);
        const snapshot = lobby.snapshot();
        expect(snapshot.outcome).toEqual({ winnerId: ids[1], moves: 2, winningRoute: routeOf(2), solution: null });
        expect(snapshot.players.find(p => p.id === ids[1])?.score).toBe(1);
        expect(snapshot.players.find(p => p.id === ids[0])?.score).toBe(0);
        expect(lobby.lockInRoute(ids[0], 1, routeOf(1))).toMatchObject({ ok: false });
    });

    it('still awards an offline winner, since their route was already checked', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        lobby.lockInRoute(ids[1], 1, routeOf(1));
        lobby.disconnect(ids[1], 'conn-1');
        vi.advanceTimersByTime(LOCK_IN_COUNTDOWN_MS);
        expect(lobby.snapshot().outcome?.winnerId).toBe(ids[1]);
    });

    it('only lets the host show the optimal route, and only after the round ends', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        expect(lobby.showSolution(ids[0], 1)).toMatchObject({ ok: false });
        lobby.lockInRoute(ids[1], 1, routeOf(2));
        vi.advanceTimersByTime(LOCK_IN_COUNTDOWN_MS);

        expect(lobby.showSolution(ids[1], 1)).toMatchObject({ ok: false });
        expect(lobby.snapshot().outcome?.solution).toBeNull();
        expect(lobby.showSolution(ids[0], 1)).toEqual({ ok: true });
        expect(lobby.showSolution(ids[0], 1)).toEqual({ ok: true });
        expect(lobby.snapshot().outcome?.solution).toEqual(puzzle.solution.path);
    });

    it('lets the host start the next round once this one is over', async () => {
        const { lobby, ids } = await toReveal([2]);
        lobby.showSolution(ids[0], 1);
        await startThinking(lobby, ids[0]);
        expect(lobby.snapshot()).toMatchObject({ roundNumber: 2, lockIns: [], outcome: null, countdownEndsAt: null });
        expect(lobby.snapshot().players[0].score).toBe(1);

        // The next round's solution starts hidden again.
        lobby.skipRound(ids[0], 2);
        expect(lobby.snapshot().outcome?.solution).toBeNull();
    });

    it('cannot start a new round while one is running', async () => {
        const { lobby, ids } = await setup(1);
        await startThinking(lobby, ids[0]);
        lobby.lockInRoute(ids[0], 1, routeOf(2));
        expect(lobby.startRound(ids[0], lobby.snapshot().roundNumber)).toMatchObject({ ok: false });
    });
});

describe('concurrent and stale actions', () => {
    it('breaks ties between near-simultaneous lock-ins by arrival order, and ignores repeated lock-ins', async () => {
        const { lobby, ids } = await setup(3);
        await startThinking(lobby, ids[0]);
        lobby.lockInRoute(ids[1], 1, routeOf(4));
        lobby.lockInRoute(ids[0], 1, routeOf(4));
        // A double-clicked lock-in keeps its original place ahead of later equal routes.
        expect(lobby.lockInRoute(ids[1], 1, routeOf(4))).toEqual({ ok: true });
        lobby.lockInRoute(ids[2], 1, routeOf(4));
        expect(lobby.snapshot().lockIns.map(l => l.playerId)).toEqual([ids[1], ids[0], ids[2]]);
    });

    it('rejects lock-ins that arrive after the countdown ends', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        lobby.lockInRoute(ids[0], 1, routeOf(5));
        vi.advanceTimersByTime(LOCK_IN_COUNTDOWN_MS);
        expect(lobby.lockInRoute(ids[1], 1, routeOf(3))).toMatchObject({ ok: false });
        expect(lobby.snapshot().outcome?.winnerId).toBe(ids[0]);
    });

    it('rejects actions aimed at an earlier round', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        lobby.skipRound(ids[0], 1);
        await startThinking(lobby, ids[0]);
        expect(lobby.snapshot().roundNumber).toBe(2);
        expect(lobby.lockInRoute(ids[1], 1, routeOf(3))).toMatchObject({ ok: false });
        expect(lobby.skipRound(ids[0], 1)).toMatchObject({ ok: false });
        expect(lobby.showSolution(ids[0], 1)).toMatchObject({ ok: false });
        expect(lobby.snapshot()).toMatchObject({ phase: 'thinking', lockIns: [] });
    });

    it('treats a repeated start request as a duplicate instead of skipping the new puzzle', async () => {
        const { lobby, ids } = await setup(1);
        expect(lobby.startRound(ids[0], 0)).toEqual({ ok: true });
        expect(lobby.startRound(ids[0], 0)).toEqual({ ok: true });
        await vi.advanceTimersByTimeAsync(0);
        expect(lobby.snapshot()).toMatchObject({ roundNumber: 1, phase: 'thinking' });
    });
});
