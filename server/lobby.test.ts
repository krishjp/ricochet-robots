import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lobby, type Puzzle } from './lobby';
import type { GameState } from '../src/app/ricochet/lib/types';
import { BID_COUNTDOWN_MS, DEMO_TIME_LIMIT_MS, MAX_PLAYERS, RECONNECT_GRACE_MS } from '../src/app/ricochet/lib/constants';
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
const WINNING_MOVE = { color: 'red', to: { x: 0, y: 5 } };
const WASTED_MOVE = { color: 'red', to: { x: 14, y: 0 } };

// A demo move made with the round and move count the client currently sees.
const move = (lobby: Lobby, playerId: string, color: string, to: unknown) => {
    const { roundNumber, demo } = lobby.snapshot();
    return lobby.demoMove(playerId, roundNumber, demo?.movesMade ?? 0, color, to);
};

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

describe('bidding', () => {
    it('starts the countdown at the first lock-in and only allows lowering a bid', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        expect(lobby.snapshot().countdownEndsAt).toBeNull();

        expect(lobby.placeBid(ids[0], 1, 5)).toEqual({ ok: true });
        expect(lobby.snapshot().countdownEndsAt).toBe(Date.now() + BID_COUNTDOWN_MS);
        expect(lobby.placeBid(ids[0], 1, 6)).toMatchObject({ ok: false });
        expect(lobby.placeBid(ids[0], 1, 0)).toMatchObject({ ok: false });
        expect(lobby.placeBid(ids[0], 1, 2.5)).toMatchObject({ ok: false });
        expect(lobby.placeBid(ids[0], 1, 4)).toEqual({ ok: true });
    });

    it('orders equal bids by who locked in first, and a lowered bid counts as a new lock-in', async () => {
        const { lobby, ids } = await setup(3);
        await startThinking(lobby, ids[0]);
        lobby.placeBid(ids[0], 1, 3);
        lobby.placeBid(ids[1], 1, 4);
        lobby.placeBid(ids[2], 1, 3);
        expect(lobby.snapshot().bids.map(b => b.playerId)).toEqual([ids[0], ids[2], ids[1]]);

        lobby.placeBid(ids[1], 1, 3);
        expect(lobby.snapshot().bids.map(b => b.playerId)).toEqual([ids[0], ids[2], ids[1]]);
    });

    it('lets the host skip a puzzle nobody has locked in on', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        expect(lobby.skipRound(ids[1], 1)).toMatchObject({ ok: false });
        expect(lobby.skipRound(ids[0], 1)).toEqual({ ok: true });
        expect(lobby.snapshot().outcome).toEqual({ winnerId: null, moves: null, winningRobots: null, solution: puzzle.solution.path });
    });
});

describe('demonstrating', () => {
    const toDemo = async (bids: number[]) => {
        const setupResult = await setup(bids.length);
        const { lobby, ids } = setupResult;
        await startThinking(lobby, ids[0]);
        bids.forEach((moves, i) => lobby.placeBid(ids[i], 1, moves));
        vi.advanceTimersByTime(BID_COUNTDOWN_MS);
        expect(lobby.snapshot().phase).toBe('demonstrating');
        return setupResult;
    };

    it('gives the lowest bidder the first turn and hides the solution until the round ends', async () => {
        const { lobby, ids } = await toDemo([3, 2]);
        const snapshot = lobby.snapshot();
        expect(snapshot.demo).toMatchObject({ playerId: ids[1], bid: 2, movesMade: 0, robots: state.robots });
        expect(snapshot.outcome).toBeNull();
        expect(lobby.placeBid(ids[0], 1, 1)).toMatchObject({ ok: false });
    });

    it('awards the point and reveals the optimal solution on a successful demonstration', async () => {
        const { lobby, ids } = await toDemo([2]);
        expect(move(lobby, ids[0], WINNING_MOVE.color, WINNING_MOVE.to)).toEqual({ ok: true });

        const snapshot = lobby.snapshot();
        expect(snapshot.phase).toBe('revealed');
        expect(snapshot.outcome).toEqual({
            winnerId: ids[0],
            moves: 1,
            winningRobots: { ...state.robots, red: { color: 'red', ...WINNING_MOVE.to } },
            solution: puzzle.solution.path,
        });
        expect(snapshot.players[0].score).toBe(1);
    });

    it('rejects moves from other players and moves the rules do not allow', async () => {
        const { lobby, ids } = await toDemo([2, 3]);
        expect(move(lobby, ids[1], WINNING_MOVE.color, WINNING_MOVE.to)).toMatchObject({ ok: false });
        expect(move(lobby, ids[0], 'red', { x: 0, y: 3 })).toMatchObject({ ok: false });
        expect(move(lobby, ids[0], 'purple', WINNING_MOVE.to)).toMatchObject({ ok: false });
        expect(move(lobby, ids[0], 'red', { x: -1, y: 0 })).toMatchObject({ ok: false });
        expect(lobby.snapshot().demo?.movesMade).toBe(0);
    });

    it('passes the turn on when a bidder runs out of moves, runs out of time, or forfeits', async () => {
        const { lobby, ids } = await toDemo([1, 2, 2, 3]);

        move(lobby, ids[0], WASTED_MOVE.color, WASTED_MOVE.to);
        expect(lobby.snapshot().demo).toMatchObject({ playerId: ids[1], movesMade: 0, robots: state.robots });

        vi.advanceTimersByTime(DEMO_TIME_LIMIT_MS);
        expect(lobby.snapshot().demo?.playerId).toBe(ids[2]);

        expect(lobby.forfeitDemo(ids[2], 1)).toEqual({ ok: true });
        expect(lobby.snapshot().demo?.playerId).toBe(ids[3]);
        expect(lobby.snapshot().failedPlayerIds).toEqual([ids[0], ids[1], ids[2]]);

        move(lobby, ids[3], WINNING_MOVE.color, WINNING_MOVE.to);
        expect(lobby.snapshot().outcome?.winnerId).toBe(ids[3]);
    });

    it('skips offline bidders and ends with no winner when every bidder fails', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        lobby.placeBid(ids[0], 1, 1);
        lobby.placeBid(ids[1], 1, 2);
        lobby.disconnect(ids[0], 'conn-0');
        vi.advanceTimersByTime(BID_COUNTDOWN_MS);
        expect(lobby.snapshot().demo?.playerId).toBe(ids[1]);

        lobby.forfeitDemo(ids[1], 1);
        const snapshot = lobby.snapshot();
        expect(snapshot.phase).toBe('revealed');
        expect(snapshot.outcome?.winnerId).toBeNull();
        expect(snapshot.players.every(p => p.score === 0)).toBe(true);
    });

    it('lets the host start the next round once the solution is revealed', async () => {
        const { lobby, ids } = await toDemo([2]);
        expect(lobby.startRound(ids[0], lobby.snapshot().roundNumber)).toMatchObject({ ok: false });
        move(lobby, ids[0], WINNING_MOVE.color, WINNING_MOVE.to);
        await startThinking(lobby, ids[0]);
        expect(lobby.snapshot()).toMatchObject({ roundNumber: 2, bids: [], outcome: null, failedPlayerIds: [] });
        expect(lobby.snapshot().players[0].score).toBe(1);
    });
});

describe('concurrent and stale actions', () => {
    it('breaks ties between near-simultaneous lock-ins by arrival order, and ignores repeated lock-ins', async () => {
        const { lobby, ids } = await setup(3);
        await startThinking(lobby, ids[0]);
        lobby.placeBid(ids[1], 1, 4);
        lobby.placeBid(ids[0], 1, 4);
        // A double-clicked lock-in keeps its original place ahead of later equal bids.
        expect(lobby.placeBid(ids[1], 1, 4)).toEqual({ ok: true });
        lobby.placeBid(ids[2], 1, 4);
        expect(lobby.snapshot().bids.map(b => b.playerId)).toEqual([ids[1], ids[0], ids[2]]);
    });

    it('rejects lock-ins that arrive after the countdown ends', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        lobby.placeBid(ids[0], 1, 5);
        vi.advanceTimersByTime(BID_COUNTDOWN_MS);
        expect(lobby.placeBid(ids[1], 1, 3)).toMatchObject({ ok: false });
        expect(lobby.snapshot().bids).toHaveLength(1);
    });

    it('rejects actions aimed at an earlier round', async () => {
        const { lobby, ids } = await setup(2);
        await startThinking(lobby, ids[0]);
        lobby.skipRound(ids[0], 1);
        await startThinking(lobby, ids[0]);
        expect(lobby.snapshot().roundNumber).toBe(2);
        expect(lobby.placeBid(ids[1], 1, 3)).toMatchObject({ ok: false });
        expect(lobby.skipRound(ids[0], 1)).toMatchObject({ ok: false });
        expect(lobby.snapshot()).toMatchObject({ phase: 'thinking', bids: [] });
    });

    it('treats a repeated start request as a duplicate instead of skipping the new puzzle', async () => {
        const { lobby, ids } = await setup(1);
        expect(lobby.startRound(ids[0], 0)).toEqual({ ok: true });
        expect(lobby.startRound(ids[0], 0)).toEqual({ ok: true });
        await vi.advanceTimersByTimeAsync(0);
        expect(lobby.snapshot()).toMatchObject({ roundNumber: 1, phase: 'thinking' });
    });

    it('ignores a second demo move computed from the same board', async () => {
        const { lobby, ids } = await setup(1);
        await startThinking(lobby, ids[0]);
        lobby.placeBid(ids[0], 1, 3);
        vi.advanceTimersByTime(BID_COUNTDOWN_MS);
        expect(lobby.demoMove(ids[0], 1, 0, 'green', { x: 15, y: 1 })).toEqual({ ok: true });
        expect(lobby.demoMove(ids[0], 1, 0, 'green', { x: 0, y: 15 })).toMatchObject({ ok: false });
        expect(lobby.snapshot().demo).toMatchObject({ movesMade: 1 });
    });
});
