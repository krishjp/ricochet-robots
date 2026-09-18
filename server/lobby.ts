// One multiplayer lobby: its players, scores, and the current round's state machine.
// Socket handling lives in index.ts; this module only sees player ids and connection ids.
import { randomBytes, randomUUID } from 'node:crypto';
import type { GameState, Position, RobotColor, Robots, SolveResult } from '../src/app/ricochet/lib/types';
import type { ActionResult, LobbyPhase, LobbySnapshot } from '../src/app/ricochet/lib/protocol';
import {
    BID_COUNTDOWN_MS, BOARD_SIZE, DEMO_TIME_LIMIT_MS, MAX_BID_MOVES, MAX_NAME_LENGTH, MAX_PLAYERS,
    RECONNECT_GRACE_MS, ROBOT_COLORS,
} from '../src/app/ricochet/lib/constants';
import { calculateMoves } from '../src/app/ricochet/lib/solver';

export type Puzzle = { state: GameState; solution: SolveResult };

export type LobbyDeps = {
    generatePuzzle: () => Promise<Puzzle>;
    // Called after every state change; the caller broadcasts `snapshot()`.
    onChange: () => void;
    // Called once the last player has left. The lobby is unusable afterwards.
    onEmpty: () => void;
};

type Player = {
    id: string;
    name: string;
    token: string;
    score: number;
    // The socket currently holding this seat, or null while disconnected.
    connectionId: string | null;
    removeTimer: ReturnType<typeof setTimeout> | null;
};

// `seq` orders lock-ins, so equal bids are demonstrated first-come, first-served.
type Bid = { playerId: string; moves: number; seq: number };
type Demo = { bid: Bid; robots: Robots; movesMade: number; endsAt: number };

const ok: ActionResult = { ok: true };
const STALE_ROUND = 'That round is already over.';
const fail = (error: string) => ({ ok: false as const, error });

export const normalizeName = (name: unknown): string | null => {
    if (typeof name !== 'string') return null;
    const trimmed = name.trim().replace(/\s+/g, ' ');
    return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
};

const isPosition = (p: unknown): p is Position => {
    const { x, y } = (p ?? {}) as Partial<Position>;
    return Number.isInteger(x) && Number.isInteger(y) && x! >= 0 && y! >= 0 && x! < BOARD_SIZE && y! < BOARD_SIZE;
};

export class Lobby {
    private players: Player[] = []; // join order
    private phase: LobbyPhase = 'waiting';
    private roundNumber = 0;
    private puzzle: Puzzle | null = null;
    private bids: Bid[] = []; // kept in demonstration order
    private bidSeq = 0;
    private countdownEndsAt: number | null = null;
    private failed: string[] = [];
    private demo: Demo | null = null;
    private outcome: { winnerId: string | null; moves: number | null } | null = null;
    // The bid countdown or the current demonstration's time limit; never both at once.
    private timer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    constructor(readonly code: string, private readonly deps: LobbyDeps) {}

    // The earliest-joined connected player, so an offline host doesn't stall the lobby.
    get hostId(): string | null {
        return (this.players.find(p => p.connectionId) ?? this.players[0])?.id ?? null;
    }

    addPlayer(rawName: unknown, connectionId: string): { ok: true; playerId: string; token: string } | { ok: false; error: string } {
        const name = normalizeName(rawName);
        if (!name) return fail(`Names must be 1-${MAX_NAME_LENGTH} characters.`);
        if (this.players.length >= MAX_PLAYERS) return fail(`This lobby is full (${MAX_PLAYERS} players max).`);
        if (this.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return fail('That name is already taken in this lobby.');

        const player: Player = { id: randomUUID(), name, token: randomBytes(16).toString('hex'), score: 0, connectionId, removeTimer: null };
        this.players.push(player);
        this.changed();
        return { ok: true, playerId: player.id, token: player.token };
    }

    reconnect(playerId: string, token: string, connectionId: string): ActionResult {
        const player = this.player(playerId);
        if (!player || player.token !== token) return fail('Your seat in this lobby has expired.');
        if (player.removeTimer) clearTimeout(player.removeTimer);
        player.removeTimer = null;
        player.connectionId = connectionId;
        this.changed();
        return ok;
    }

    // Ignored if the player has since reconnected on another connection.
    disconnect(playerId: string, connectionId: string) {
        const player = this.player(playerId);
        if (!player || player.connectionId !== connectionId) return;
        player.connectionId = null;
        player.removeTimer = setTimeout(() => this.removePlayer(playerId), RECONNECT_GRACE_MS);
        this.changed();
    }

    leave(playerId: string) {
        this.removePlayer(playerId);
    }

    // `seenRound` is the round the host was looking at. If a newer one exists, this is a duplicate
    // request (double-click, retry) and succeeds without starting yet another round.
    startRound(playerId: string, seenRound: unknown): ActionResult {
        if (playerId !== this.hostId) return fail('Only the host can start a round.');
        if (typeof seenRound === 'number' && seenRound < this.roundNumber) return ok;
        if (this.phase !== 'waiting' && this.phase !== 'revealed') return fail('A round is already in progress.');

        this.resetRound();
        this.phase = 'generating';
        const round = ++this.roundNumber;
        this.changed();

        this.deps.generatePuzzle().then(
            puzzle => {
                if (this.disposed || round !== this.roundNumber) return;
                this.puzzle = puzzle;
                this.phase = 'thinking';
                this.changed();
            },
            error => {
                console.error(`[lobby ${this.code}] puzzle generation failed`, error);
                if (this.disposed || round !== this.roundNumber) return;
                this.phase = 'waiting';
                this.changed();
            },
        );
        return ok;
    }

    // Ends a puzzle nobody has locked in on, revealing the solution without awarding a point.
    skipRound(playerId: string, round: unknown): ActionResult {
        if (playerId !== this.hostId) return fail('Only the host can skip a puzzle.');
        if (round !== this.roundNumber) return fail(STALE_ROUND);
        if (this.phase !== 'thinking' || this.bids.length > 0) return fail('The puzzle can only be skipped before anyone locks in.');
        this.reveal(null, null);
        return ok;
    }

    placeBid(playerId: string, round: unknown, moves: unknown): ActionResult {
        if (round !== this.roundNumber) return fail(STALE_ROUND);
        if (this.phase !== 'thinking') return fail('Lock-ins are closed for this round.');
        if (typeof moves !== 'number' || !Number.isInteger(moves) || moves < 1 || moves > MAX_BID_MOVES) {
            return fail(`Lock in a whole number of moves from 1 to ${MAX_BID_MOVES}.`);
        }
        const existing = this.bids.find(b => b.playerId === playerId);
        // A repeat of the same lock-in (double-click, retry) keeps its original place in line.
        if (existing?.moves === moves) return ok;
        if (existing && moves > existing.moves) return fail(`You already locked in ${existing.moves}; you can only lower it.`);

        // A lowered bid counts as a new lock-in, so it goes behind earlier bids of the same number.
        this.bids = this.bids.filter(b => b.playerId !== playerId);
        this.bids.push({ playerId, moves, seq: ++this.bidSeq });
        this.bids.sort((a, b) => a.moves - b.moves || a.seq - b.seq);

        if (this.countdownEndsAt === null) {
            this.countdownEndsAt = Date.now() + BID_COUNTDOWN_MS;
            this.timer = setTimeout(() => this.startDemonstrations(), BID_COUNTDOWN_MS);
        }
        this.changed();
        return ok;
    }

    demoMove(playerId: string, round: unknown, moveIndex: unknown, color: unknown, to: unknown): ActionResult {
        const demo = this.demo;
        if (round !== this.roundNumber) return fail(STALE_ROUND);
        if (this.phase !== 'demonstrating' || !demo || !this.puzzle || demo.bid.playerId !== playerId) {
            return fail("It's not your turn to demonstrate.");
        }
        // The board changed since the client chose this move (e.g. a second click before the first landed).
        if (moveIndex !== demo.movesMade) return fail('That move was based on an outdated board, so it was ignored.');
        if (!ROBOT_COLORS.includes(color as RobotColor) || !isPosition(to)) return fail('Invalid move.');

        const robotColor = color as RobotColor;
        const { walls, target } = this.puzzle.state;
        const legal = calculateMoves(demo.robots[robotColor], demo.robots, walls).some(p => p.x === to.x && p.y === to.y);
        if (!legal) return fail('That robot cannot move there.');

        demo.robots = { ...demo.robots, [robotColor]: { color: robotColor, x: to.x, y: to.y } };
        demo.movesMade++;

        const targetRobot = demo.robots[target.color];
        if (targetRobot.x === target.x && targetRobot.y === target.y) {
            this.player(playerId)!.score++;
            this.reveal(playerId, demo.movesMade);
        } else if (demo.movesMade >= demo.bid.moves) {
            this.failDemo();
        } else {
            this.changed();
        }
        return ok;
    }

    forfeitDemo(playerId: string, round: unknown): ActionResult {
        if (round !== this.roundNumber) return fail(STALE_ROUND);
        if (this.phase !== 'demonstrating' || this.demo?.bid.playerId !== playerId) return fail("It's not your turn to demonstrate.");
        this.failDemo();
        return ok;
    }

    snapshot(): LobbySnapshot {
        const now = Date.now();
        return {
            code: this.code,
            hostId: this.hostId,
            players: this.players.map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connectionId !== null })),
            phase: this.phase,
            roundNumber: this.roundNumber,
            puzzle: this.puzzle?.state ?? null,
            bids: this.bids.map(b => ({ playerId: b.playerId, moves: b.moves })),
            countdownEndsAt: this.countdownEndsAt,
            failedPlayerIds: [...this.failed],
            demo: this.demo && {
                playerId: this.demo.bid.playerId,
                bid: this.demo.bid.moves,
                robots: this.demo.robots,
                movesMade: this.demo.movesMade,
                endsAt: this.demo.endsAt,
            },
            outcome: this.phase === 'revealed' && this.outcome
                ? { ...this.outcome, solution: this.puzzle?.solution.path ?? [] }
                : null,
            serverTime: now,
        };
    }

    // --- Round flow ---

    private startDemonstrations() {
        this.clearTimer();
        this.countdownEndsAt = null;
        this.phase = 'demonstrating';
        this.startNextDemo();
    }

    // Gives the turn to the best remaining bid. Bidders who are offline when their turn comes are skipped.
    private startNextDemo() {
        let next: Bid | undefined;
        while ((next = this.bids.find(b => !this.failed.includes(b.playerId)))) {
            if (this.player(next.playerId)?.connectionId) break;
            this.failed.push(next.playerId);
        }
        if (!next || !this.puzzle) {
            this.reveal(null, null);
            return;
        }
        this.demo = { bid: next, robots: this.puzzle.state.robots, movesMade: 0, endsAt: Date.now() + DEMO_TIME_LIMIT_MS };
        this.timer = setTimeout(() => this.failDemo(), DEMO_TIME_LIMIT_MS);
        this.changed();
    }

    private failDemo() {
        this.clearTimer();
        if (this.demo) this.failed.push(this.demo.bid.playerId);
        this.demo = null;
        this.startNextDemo();
    }

    private reveal(winnerId: string | null, moves: number | null) {
        this.clearTimer();
        this.countdownEndsAt = null;
        this.demo = null;
        this.phase = 'revealed';
        this.outcome = { winnerId, moves };
        this.changed();
    }

    private resetRound() {
        this.clearTimer();
        this.puzzle = null;
        this.bids = [];
        this.countdownEndsAt = null;
        this.failed = [];
        this.demo = null;
        this.outcome = null;
    }

    // --- Helpers ---

    private removePlayer(playerId: string) {
        const player = this.player(playerId);
        if (!player) return;
        if (player.removeTimer) clearTimeout(player.removeTimer);
        this.players = this.players.filter(p => p !== player);
        this.bids = this.bids.filter(b => b.playerId !== playerId);

        if (this.players.length === 0) {
            this.dispose();
            this.deps.onEmpty();
        } else if (this.demo?.bid.playerId === playerId) {
            this.failDemo();
        } else {
            this.changed();
        }
    }

    private dispose() {
        this.disposed = true;
        this.clearTimer();
        for (const p of this.players) if (p.removeTimer) clearTimeout(p.removeTimer);
    }

    private player(id: string) {
        return this.players.find(p => p.id === id);
    }

    private clearTimer() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private changed() {
        if (!this.disposed) this.deps.onChange();
    }
}
