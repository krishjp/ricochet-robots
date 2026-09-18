// Multiplayer lobby server (Socket.IO). Deployed separately from the Next.js app; see render.yaml.
// All lobby state is in memory, so run a single instance.
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import type { ActionResult, ClientToServerEvents, JoinResult, ServerToClientEvents } from '../src/app/ricochet/lib/protocol';
import { Lobby, normalizeName } from './lobby';
import { generatePuzzle } from './generatePuzzle';

type SocketData = { code?: string; playerId?: string };
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const PORT = Number(process.env.PORT) || 3001;
// Comma-separated list of allowed browser origins, e.g. the Vercel deployment's URL.
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000').split(',').map(o => o.trim()).filter(Boolean);

// No 0/O or 1/I, so codes survive being read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

const httpServer = createServer((req, res) => {
    // Render's health check.
    if (req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
        return;
    }
    res.writeHead(404).end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: CLIENT_ORIGINS },
});

const lobbies = new Map<string, Lobby>();
// The one socket allowed to act for each player. A newer connection (reload, second tab) takes the seat over.
const socketsByPlayer = new Map<string, GameSocket>();

const createLobby = (): Lobby => {
    let code: string;
    do {
        code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (lobbies.has(code));

    const lobby: Lobby = new Lobby(code, {
        generatePuzzle,
        onChange: () => io.to(code).emit('lobby:state', lobby.snapshot()),
        onEmpty: () => lobbies.delete(code),
    });
    lobbies.set(code, lobby);
    return lobby;
};

// Socket.IO payloads come from untrusted clients: ignore calls without an ack callback, and never throw.
const respond = <T>(ack: unknown, run: () => T) => {
    if (typeof ack !== 'function') return;
    try {
        ack(run());
    } catch (error) {
        console.error(error);
        ack({ ok: false, error: 'Something went wrong on the server.' });
    }
};

io.on('connection', (socket: GameSocket) => {
    const seat = (): { lobby: Lobby; playerId: string } | null => {
        const { code, playerId } = socket.data;
        const lobby = code ? lobbies.get(code) : undefined;
        return lobby && playerId && socketsByPlayer.get(playerId) === socket ? { lobby, playerId } : null;
    };

    const releaseSeat = () => {
        const { code, playerId } = socket.data;
        if (code) socket.leave(code);
        if (playerId && socketsByPlayer.get(playerId) === socket) socketsByPlayer.delete(playerId);
        socket.data = {};
    };

    const takeSeat = (lobby: Lobby, playerId: string, token: string): JoinResult => {
        const previous = socketsByPlayer.get(playerId);
        if (previous && previous !== socket) {
            previous.leave(lobby.code);
            previous.data = {};
            previous.emit('lobby:ended', 'This seat was opened in another tab or window.');
        }
        socketsByPlayer.set(playerId, socket);
        socket.data = { code: lobby.code, playerId };
        socket.join(lobby.code);
        // The broadcast from joining went out before this socket was in the room.
        socket.emit('lobby:state', lobby.snapshot());
        return { ok: true, code: lobby.code, playerId, token };
    };

    // Joining a lobby while seated in another one leaves the old one.
    const leaveCurrent = () => {
        const current = seat();
        releaseSeat();
        current?.lobby.leave(current.playerId);
    };

    const join = (lobby: Lobby, name: unknown): JoinResult => {
        const result = lobby.addPlayer(name, socket.id);
        if (!result.ok) return result;
        leaveCurrent();
        return takeSeat(lobby, result.playerId, result.token);
    };

    // Runs a lobby action for the socket's current seat.
    const act = (ack: unknown, action: (lobby: Lobby, playerId: string) => ActionResult) =>
        respond(ack, (): ActionResult => {
            const current = seat();
            return current ? action(current.lobby, current.playerId) : { ok: false, error: "You're not in a lobby." };
        });

    socket.on('lobby:create', (payload, ack) => respond(ack, (): JoinResult => {
        if (!normalizeName(payload?.name)) return { ok: false, error: 'Enter a name first.' };
        return join(createLobby(), payload.name);
    }));

    socket.on('lobby:join', (payload, ack) => respond(ack, (): JoinResult => {
        const lobby = typeof payload?.code === 'string' ? lobbies.get(payload.code.trim().toUpperCase()) : undefined;
        if (!lobby) return { ok: false, error: 'No lobby with that code.' };
        if (seat()?.lobby === lobby) return { ok: false, error: "You're already in this lobby." };
        return join(lobby, payload.name);
    }));

    socket.on('lobby:rejoin', (payload, ack) => respond(ack, (): JoinResult => {
        const { code, playerId, token } = payload ?? {};
        const lobby = typeof code === 'string' ? lobbies.get(code) : undefined;
        if (!lobby || typeof playerId !== 'string' || typeof token !== 'string') return { ok: false, error: 'That lobby has closed.' };
        const result = lobby.reconnect(playerId, token, socket.id);
        return result.ok ? takeSeat(lobby, playerId, token) : result;
    }));

    socket.on('lobby:leave', ack => respond(ack, (): ActionResult => {
        leaveCurrent();
        return { ok: true };
    }));

    // Every handler runs to completion on Node's single thread and Lobby's methods are synchronous,
    // so actions never interleave: the order they reach the server is the order they apply in,
    // which is also what breaks ties between equal lock-ins. Clients' clocks are never trusted.
    socket.on('round:start', (payload, ack) => act(ack, (lobby, id) => lobby.startRound(id, payload?.round)));
    socket.on('round:skip', (payload, ack) => act(ack, (lobby, id) => lobby.skipRound(id, payload?.round)));
    socket.on('bid:place', (payload, ack) => act(ack, (lobby, id) => lobby.placeBid(id, payload?.round, payload?.moves)));
    socket.on('demo:move', (payload, ack) => act(ack, (lobby, id) => lobby.demoMove(id, payload?.round, payload?.moveIndex, payload?.color, payload?.to)));
    socket.on('demo:forfeit', (payload, ack) => act(ack, (lobby, id) => lobby.forfeitDemo(id, payload?.round)));

    socket.on('disconnect', () => {
        const current = seat();
        releaseSeat();
        current?.lobby.disconnect(current.playerId, socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Multiplayer server listening on :${PORT}, allowing origins: ${CLIENT_ORIGINS.join(', ')}`);
});
