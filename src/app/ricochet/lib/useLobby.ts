'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ActionResult, ClientToServerEvents, JoinResult, LobbySnapshot, ServerToClientEvents, Session } from './protocol';
import type { Position, RobotColor } from './types';

const SERVER_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_URL ?? 'http://localhost:3001';
const ACK_TIMEOUT_MS = 10_000;
// Per tab, so a reload rejoins the same seat but two tabs can hold two different players.
const SESSION_KEY = 'ricochet-multiplayer-session';

const readSession = (): Session | null => {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) as Session : null;
    } catch {
        return null;
    }
};
const writeSession = (session: Session | null) => {
    try {
        if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        else sessionStorage.removeItem(SESSION_KEY);
    } catch {
        // Storage is unavailable (e.g. blocked site data); the seat just won't survive a reload.
    }
};

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Connects to the multiplayer server and tracks this tab's lobby. The server is the source of
 * truth: every change arrives as a full `LobbySnapshot`.
 */
export function useLobby() {
    const socketRef = useRef<GameSocket | null>(null);
    const [connected, setConnected] = useState(false);
    // True until the first connection has tried to rejoin a stored seat.
    const [restoring, setRestoring] = useState(true);
    const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    // Server time minus local time, for showing server deadlines on this device's clock.
    const [clockOffset, setClockOffset] = useState(0);
    const [notice, setNotice] = useState<string | null>(null);
    // The latest snapshot, so actions can tag themselves with the round and move count they were made against.
    const snapshotRef = useRef<LobbySnapshot | null>(null);
    // A demo move awaiting the server. Clicks are ignored meanwhile, since they'd be based on the pre-move board.
    const movePendingRef = useRef(false);

    const exitLobby = useCallback((reason: string | null) => {
        writeSession(null);
        setSnapshot(null);
        setPlayerId(null);
        setNotice(reason);
    }, []);

    useEffect(() => {
        const socket: GameSocket = io(SERVER_URL);
        socketRef.current = socket;

        // Also fires after automatic reconnects, which is when a stored seat needs reclaiming.
        socket.on('connect', () => {
            setConnected(true);
            const session = readSession();
            if (!session) {
                setRestoring(false);
                return;
            }
            socket.timeout(ACK_TIMEOUT_MS).emitWithAck('lobby:rejoin', session).then(
                result => result.ok ? setPlayerId(result.playerId) : exitLobby(result.error),
                () => setNotice('The server did not respond. Retrying...'),
            ).finally(() => setRestoring(false));
        });
        socket.on('disconnect', () => setConnected(false));
        socket.on('lobby:state', state => {
            snapshotRef.current = state;
            setSnapshot(state);
            setClockOffset(state.serverTime - Date.now());
        });
        socket.on('lobby:ended', exitLobby);

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [exitLobby]);

    const enter = useCallback((result: JoinResult) => {
        if (!result.ok) {
            setNotice(result.error);
            return;
        }
        writeSession({ code: result.code, playerId: result.playerId, token: result.token });
        setPlayerId(result.playerId);
        setNotice(null);
    }, []);

    const report = useCallback((result: ActionResult) => {
        setNotice(result.ok ? null : result.error);
    }, []);

    const onTimeout = useCallback(() => setNotice('The server did not respond. Check your connection and try again.'), []);

    // A socket that only exists after mount, with a short timeout on every acknowledgement.
    const withSocket = useCallback((run: (socket: GameSocket) => Promise<void>) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
            setNotice('Not connected to the multiplayer server yet.');
            return;
        }
        return run(socket).catch(onTimeout);
    }, [onTimeout]);

    const round = useCallback(() => snapshotRef.current?.roundNumber ?? 0, []);

    return {
        connected,
        restoring,
        snapshot: playerId ? snapshot : null,
        playerId,
        clockOffset,
        notice,
        dismissNotice: useCallback(() => setNotice(null), []),
        createLobby: useCallback((name: string) => withSocket(s => s.timeout(ACK_TIMEOUT_MS).emitWithAck('lobby:create', { name }).then(enter)), [withSocket, enter]),
        joinLobby: useCallback((code: string, name: string) => withSocket(s => s.timeout(ACK_TIMEOUT_MS).emitWithAck('lobby:join', { code, name }).then(enter)), [withSocket, enter]),
        leaveLobby: useCallback(() => {
            socketRef.current?.emit('lobby:leave', () => {});
            exitLobby(null);
        }, [exitLobby]),
        startRound: useCallback(() => withSocket(s => s.timeout(ACK_TIMEOUT_MS).emitWithAck('round:start', { round: round() }).then(report)), [withSocket, report, round]),
        skipRound: useCallback(() => withSocket(s => s.timeout(ACK_TIMEOUT_MS).emitWithAck('round:skip', { round: round() }).then(report)), [withSocket, report, round]),
        placeBid: useCallback((moves: number) => withSocket(s => s.timeout(ACK_TIMEOUT_MS).emitWithAck('bid:place', { round: round(), moves }).then(report)), [withSocket, report, round]),
        demoMove: useCallback((color: RobotColor, to: Position) => {
            if (movePendingRef.current) return;
            const moveIndex = snapshotRef.current?.demo?.movesMade ?? 0;
            const sent = withSocket(s => s.timeout(ACK_TIMEOUT_MS).emitWithAck('demo:move', { round: round(), moveIndex, color, to }).then(report));
            if (!sent) return;
            movePendingRef.current = true;
            sent.finally(() => { movePendingRef.current = false; });
        }, [withSocket, report, round]),
        forfeitDemo: useCallback(() => withSocket(s => s.timeout(ACK_TIMEOUT_MS).emitWithAck('demo:forfeit', { round: round() }).then(report)), [withSocket, report, round]),
    };
}
