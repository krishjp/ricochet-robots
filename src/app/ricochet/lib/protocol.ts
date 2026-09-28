// /app/ricochet/lib/protocol.ts
// Socket.IO messages between the multiplayer page and the lobby server (server/).
// Type-only imports: the server bundles this file, and types.ts loads next/font.
import type { GameState, OptimalPathStep } from './types';

// waiting → generating → thinking → revealed → (next round) generating …
export type LobbyPhase = 'waiting' | 'generating' | 'thinking' | 'revealed';

export type PlayerInfo = { id: string; name: string; score: number; connected: boolean };

// One robot move: which robot, and the cell it slides to. Routes and solutions are lists of these.
export type RouteStep = OptimalPathStep;

// Listed in ranking order: fewest moves first, and earlier lock-ins first among equal lengths.
// Only the length is public while the round is running; the routes themselves stay on the server.
export type LockInInfo = { playerId: string; moves: number };

// `winningRoute` is the best locked-in route (null if nobody locked in). `solution` is the optimal
// route, which stays hidden until the host chooses to show it.
export type RoundOutcome = {
    winnerId: string | null;
    moves: number | null;
    winningRoute: RouteStep[] | null;
    solution: RouteStep[] | null;
};

export type LobbySnapshot = {
    code: string;
    hostId: string | null;
    players: PlayerInfo[];
    phase: LobbyPhase;
    roundNumber: number;
    puzzle: GameState | null;
    lockIns: LockInInfo[];
    // Timestamps are in server time; clients correct for clock skew using `serverTime`.
    countdownEndsAt: number | null;
    outcome: RoundOutcome | null;
    serverTime: number;
};

export type ActionResult = { ok: true } | { ok: false; error: string };
export type JoinResult = { ok: true; code: string; playerId: string; token: string } | { ok: false; error: string };
export type Session = { code: string; playerId: string; token: string };

type Ack<T> = (result: T) => void;

// Round actions carry the `roundNumber` the client was looking at, so a late or retried message
// can't land on a newer round.
type RoundRef = { round: number };

export interface ClientToServerEvents {
    'lobby:create': (payload: { name: string }, ack: Ack<JoinResult>) => void;
    'lobby:join': (payload: { code: string; name: string }, ack: Ack<JoinResult>) => void;
    // Reclaims a seat after a reconnect or page reload.
    'lobby:rejoin': (payload: Session, ack: Ack<JoinResult>) => void;
    'lobby:leave': (ack: Ack<ActionResult>) => void;
    'round:start': (payload: RoundRef, ack: Ack<ActionResult>) => void;
    'round:skip': (payload: RoundRef, ack: Ack<ActionResult>) => void;
    // Locks in a full route from the puzzle's starting position. The server replays and validates it.
    'route:lockIn': (payload: RoundRef & { route: RouteStep[] }, ack: Ack<ActionResult>) => void;
    // Host only, once the round is over: reveals the optimal route to everyone.
    'solution:show': (payload: RoundRef, ack: Ack<ActionResult>) => void;
}

export interface ServerToClientEvents {
    'lobby:state': (snapshot: LobbySnapshot) => void;
    // This connection no longer holds a seat, e.g. the same player opened the lobby in another tab.
    'lobby:ended': (reason: string) => void;
}
