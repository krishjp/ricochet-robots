// One multiplayer lobby: its players, scores, and the current round's state machine.
// Socket handling lives in index.ts; this module only sees player ids and connection ids.
import { randomBytes, randomUUID } from 'node:crypto';
import type { GameState, Position, RobotColor, Robots, SolveResult } from '../src/app/ricochet/lib/types';
import type { ActionResult, LobbyPhase, LobbySnapshot, RouteStep } from '../src/app/ricochet/lib/protocol';
import {
    BOARD_SIZE, LOCK_IN_COUNTDOWN_MS, MAX_NAME_LENGTH, MAX_PLAYERS, MAX_ROUTE_MOVES,
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

// `seq` orders lock-ins, so equal-length routes rank first-come, first-served.
type LockIn = { playerId: string; route: RouteStep[]; seq: number };

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

// Replays an untrusted route from the puzzle's start. Returns a clean copy of the route if every move
// is legal and it ends with the target robot on the target, otherwise an error for the player.
export const validateRoute = (state: GameState, route: unknown): { ok: true; route: RouteStep[] } | { ok: false; error: string } => {
    if (!Array.isArray(route) || route.length === 0) return fail('Submit the moves of your route.');
    if (route.length > MAX_ROUTE_MOVES) return fail(`Routes can be at most ${MAX_ROUTE_MOVES} moves long.`);

    let robots: Robots = state.robots;
    const cleaned: RouteStep[] = [];
    for (const step of route) {
        const { color, pos } = (step ?? {}) as Partial<RouteStep>;
        if (!ROBOT_COLORS.includes(color as RobotColor) || !isPosition(pos)) return fail('That route is not valid.');
        const robotColor = color as RobotColor;
        const legal = calculateMoves(robots[robotColor], robots, state.walls).some(p => p.x === pos.x && p.y === pos.y);
        if (!legal) return fail('That route contains a move the rules do not allow.');
        robots = { ...robots, [robotColor]: { color: robotColor, x: pos.x, y: pos.y } };
        cleaned.push({ color: robotColor, pos: { x: pos.x, y: pos.y } });
    }

    const { target } = state;
    if (robots[target.color].x !== target.x || robots[target.color].y !== target.y) {
        return fail('That route does not get the target robot to the target.');
    }
    return { ok: true, route: cleaned };
};

export class Lobby {
    private players: Player[] = []; // join order
    private phase: LobbyPhase = 'waiting';
    private roundNumber = 0;
    private puzzle: Puzzle | null = null;
    private lockIns: LockIn[] = []; // kept in ranking order
    private lockInSeq = 0;
    private countdownEndsAt: number | null = null;
    private outcome: { winnerId: string | null; route: RouteStep[] | null } | null = null;
    // Set once the host shows the optimal route after the round ends.
    private solutionShown = false;
    // The lock-in countdown.
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

    // Ends a puzzle nobody has locked in on, without awarding a point. The host can then show the solution.
    skipRound(playerId: string, round: unknown): ActionResult {
        if (playerId !== this.hostId) return fail('Only the host can skip a puzzle.');
        if (round !== this.roundNumber) return fail(STALE_ROUND);
        if (this.phase !== 'thinking' || this.lockIns.length > 0) return fail('The puzzle can only be skipped before anyone locks in.');
        this.reveal(null);
        return ok;
    }

    lockInRoute(playerId: string, round: unknown, route: unknown): ActionResult {
        if (round !== this.roundNumber) return fail(STALE_ROUND);
        if (this.phase !== 'thinking' || !this.puzzle) return fail('Lock-ins are closed for this round.');
        const result = validateRoute(this.puzzle.state, route);
        if (!result.ok) return result;

        const moves = result.route.length;
        const existing = this.lockIns.find(l => l.playerId === playerId);
        // A repeat of the same length (double-click, retry) keeps the original route and place in line.
        if (existing?.route.length === moves) return ok;
        if (existing && moves > existing.route.length) {
            return fail(`You already locked in ${existing.route.length} moves; only a shorter route can replace it.`);
        }

        // A shorter route counts as a new lock-in, so it goes behind earlier routes of the same length.
        this.lockIns = this.lockIns.filter(l => l.playerId !== playerId);
        this.lockIns.push({ playerId, route: result.route, seq: ++this.lockInSeq });
        this.lockIns.sort((a, b) => a.route.length - b.route.length || a.seq - b.seq);

        if (this.countdownEndsAt === null) {
            this.countdownEndsAt = Date.now() + LOCK_IN_COUNTDOWN_MS;
            this.timer = setTimeout(() => this.finishRound(), LOCK_IN_COUNTDOWN_MS);
        }
        this.changed();
        return ok;
    }

    showSolution(playerId: string, round: unknown): ActionResult {
        if (playerId !== this.hostId) return fail('Only the host can show the optimal solution.');
        if (round !== this.roundNumber) return fail(STALE_ROUND);
        if (this.phase !== 'revealed') return fail('The optimal solution can be shown once the round is over.');
        if (!this.solutionShown) {
            this.solutionShown = true;
            this.changed();
        }
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
            lockIns: this.lockIns.map(l => ({ playerId: l.playerId, moves: l.route.length })),
            countdownEndsAt: this.countdownEndsAt,
            outcome: this.phase === 'revealed' && this.outcome
                ? {
                    winnerId: this.outcome.winnerId,
                    moves: this.outcome.route?.length ?? null,
                    winningRoute: this.outcome.route,
                    solution: this.solutionShown ? this.puzzle?.solution.path ?? [] : null,
                }
                : null,
            serverTime: now,
        };
    }

    // --- Round flow ---

    // The countdown ran out: the best locked-in route wins. Routes were validated when they were
    // locked in, so the winner scores even if they have since gone offline.
    private finishRound() {
        const best = this.lockIns[0];
        const winner = best && this.player(best.playerId);
        if (winner) winner.score++;
        this.reveal(winner ? best : null);
    }

    private reveal(winning: LockIn | null) {
        this.clearTimer();
        this.countdownEndsAt = null;
        this.phase = 'revealed';
        this.outcome = { winnerId: winning?.playerId ?? null, route: winning?.route ?? null };
        this.changed();
    }

    private resetRound() {
        this.clearTimer();
        this.puzzle = null;
        this.lockIns = [];
        this.countdownEndsAt = null;
        this.outcome = null;
        this.solutionShown = false;
    }

    // --- Helpers ---

    private removePlayer(playerId: string) {
        const player = this.player(playerId);
        if (!player) return;
        if (player.removeTimer) clearTimeout(player.removeTimer);
        this.players = this.players.filter(p => p !== player);
        this.lockIns = this.lockIns.filter(l => l.playerId !== playerId);
        // The countdown only runs while someone has a route locked in.
        if (this.phase === 'thinking' && this.lockIns.length === 0 && this.countdownEndsAt !== null) {
            this.clearTimer();
            this.countdownEndsAt = null;
        }

        if (this.players.length === 0) {
            this.dispose();
            this.deps.onEmpty();
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
