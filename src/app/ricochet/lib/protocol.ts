// /app/ricochet/lib/protocol.ts
// Socket.IO messages between the multiplayer page and the lobby server (server/).
// Type-only imports: the server bundles this file, and types.ts loads next/font.
import type { GameState, OptimalPathStep, Position, RobotColor, Robots } from './types';

// waiting → generating → thinking → demonstrating → revealed → (next round) generating …
// `demonstrating` is skipped when nobody locks in before the host skips the puzzle.
export type LobbyPhase = 'waiting' | 'generating' | 'thinking' | 'demonstrating' | 'revealed';

export type PlayerInfo = { id: string; name: string; score: number; connected: boolean };

// Listed in demonstration order: fewest moves first, and earlier lock-ins first among equal bids.
export type BidInfo = { playerId: string; moves: number };

export type DemoInfo = { playerId: string; bid: number; robots: Robots; movesMade: number; endsAt: number };

// `solution` is only sent once the round is over, so clients can't peek at it.
export type RoundOutcome = { winnerId: string | null; moves: number | null; solution: OptimalPathStep[] };

export type LobbySnapshot = {
    code: string;
    hostId: string | null;
    players: PlayerInfo[];
    phase: LobbyPhase;
    roundNumber: number;
    puzzle: GameState | null;
    bids: BidInfo[];
    // Timestamps are in server time; clients correct for clock skew using `serverTime`.
    countdownEndsAt: number | null;
    failedPlayerIds: string[];
    demo: DemoInfo | null;
    outcome: RoundOutcome | null;
    serverTime: number;
};

export type ActionResult = { ok: true } | { ok: false; error: string };
export type JoinResult = { ok: true; code: string; playerId: string; token: string } | { ok: false; error: string };
export type Session = { code: string; playerId: string; token: string };

type Ack<T> = (result: T) => void;

// Round actions carry the `roundNumber` the client was looking at, so a late or retried message
// can't land on a newer round. Demo moves also carry `moveIndex` (the move count the client
// saw), so a double-click can't apply a second move computed from a stale board.
type RoundRef = { round: number };

export interface ClientToServerEvents {
    'lobby:create': (payload: { name: string }, ack: Ack<JoinResult>) => void;
    'lobby:join': (payload: { code: string; name: string }, ack: Ack<JoinResult>) => void;
    // Reclaims a seat after a reconnect or page reload.
    'lobby:rejoin': (payload: Session, ack: Ack<JoinResult>) => void;
    'lobby:leave': (ack: Ack<ActionResult>) => void;
    'round:start': (payload: RoundRef, ack: Ack<ActionResult>) => void;
    'round:skip': (payload: RoundRef, ack: Ack<ActionResult>) => void;
    'bid:place': (payload: RoundRef & { moves: number }, ack: Ack<ActionResult>) => void;
    'demo:move': (payload: RoundRef & { moveIndex: number; color: RobotColor; to: Position }, ack: Ack<ActionResult>) => void;
    'demo:forfeit': (payload: RoundRef, ack: Ack<ActionResult>) => void;
}

export interface ServerToClientEvents {
    'lobby:state': (snapshot: LobbySnapshot) => void;
    // This connection no longer holds a seat, e.g. the same player opened the lobby in another tab.
    'lobby:ended': (reason: string) => void;
}
