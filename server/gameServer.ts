// The multiplayer server's HTTP + Socket.IO wiring, built by a factory so tests can run it on an ephemeral port.
// All lobby state is in memory, so run a single instance.
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { Server, type Socket } from 'socket.io';
import type { ActionResult, ClientToServerEvents, JoinResult, ServerToClientEvents } from '../src/app/ricochet/lib/protocol';
import { Lobby, normalizeName, type Puzzle } from './lobby';
import { TokenBucket, WindowLimiter } from './rateLimit';

type SocketData = { code?: string; playerId?: string };
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// No 0/O or 1/I, so codes survive being read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export type GameServerOptions = {
    // Browser origins allowed to connect (CORS).
    clientOrigins: string[];
    generatePuzzle: () => Promise<Puzzle>;
    // Behind a reverse proxy (Render), the peer address is the proxy's: read the client from X-Forwarded-For instead.
    trustProxy?: boolean;
    // Logs the raw X-Forwarded-For header and the address used for rate limiting on every connection,
    // to check what the host's proxy sends. Addresses are personal data: switch it off once verified.
    logClientAddresses?: boolean;
    // New lobbies are refused beyond this many.
    maxLobbies?: number;
    // A lobby with no activity for this long is closed, even if players are still connected.
    lobbyIdleMs?: number;
    sweepIntervalMs?: number;
    // Per socket: a burst of `burst` events, refilling `perSecond`.
    eventBurst?: number;
    eventsPerSecond?: number;
    // Per address: lobbies created, and failed joins (code guesses), within one minute.
    createsPerMinute?: number;
    failedJoinsPerMinute?: number;
};

const DEFAULTS = {
    maxLobbies: 200,
    lobbyIdleMs: 60 * 60_000,
    sweepIntervalMs: 60_000,
    eventBurst: 20,
    eventsPerSecond: 5,
    createsPerMinute: 5,
    failedJoinsPerMinute: 20,
};

// Routes are at most a couple of KB; anything much bigger is not a real client.
const MAX_PAYLOAD_BYTES = 16 * 1024;

export function createGameServer(options: GameServerOptions) {
    const config = { ...DEFAULTS, ...options };

    const httpServer = createServer((req, res) => {
        // Render's health check.
        if (req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
            return;
        }
        res.writeHead(404).end();
    });

    const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
        cors: { origin: config.clientOrigins },
        maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    });

    const lobbies = new Map<string, Lobby>();
    const lastActivity = new Map<string, number>();
    // The one socket allowed to act for each player. A newer connection (reload, second tab) takes the seat over.
    const socketsByPlayer = new Map<string, GameSocket>();
    const createLimiter = new WindowLimiter(config.createsPerMinute, 60_000);
    const failedJoinLimiter = new WindowLimiter(config.failedJoinsPerMinute, 60_000);

    const clientAddress = (socket: GameSocket): string => {
        if (config.trustProxy) {
            // The last entry is the one our own proxy appended; earlier ones can be forged by the client.
            const forwarded = socket.handshake.headers['x-forwarded-for']?.toString();
            const last = forwarded?.split(',').pop()?.trim();
            if (last) return last;
        }
        return socket.handshake.address;
    };

    const createLobby = (): Lobby => {
        let code: string;
        do {
            code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
        } while (lobbies.has(code));

        const lobby: Lobby = new Lobby(code, {
            generatePuzzle: config.generatePuzzle,
            onChange: () => {
                lastActivity.set(code, Date.now());
                io.to(code).emit('lobby:state', lobby.snapshot());
            },
            onEmpty: () => {
                lobbies.delete(code);
                lastActivity.delete(code);
            },
        });
        lobbies.set(code, lobby);
        lastActivity.set(code, Date.now());
        return lobby;
    };

    // Closes lobbies nobody has touched for a while (e.g. everyone left a tab open and walked away).
    const sweep = () => {
        const cutoff = Date.now() - config.lobbyIdleMs;
        for (const [code, lobby] of lobbies) {
            if ((lastActivity.get(code) ?? 0) > cutoff) continue;
            lobbies.delete(code);
            lastActivity.delete(code);
            for (const playerId of lobby.close()) socketsByPlayer.delete(playerId);
            io.to(code).emit('lobby:ended', 'This lobby was closed after being idle for too long.');
            io.in(code).socketsLeave(code);
        }
        createLimiter.prune();
        failedJoinLimiter.prune();
    };
    const sweeper = setInterval(sweep, config.sweepIntervalMs);
    sweeper.unref();

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
        const address = clientAddress(socket);
        if (config.logClientAddresses) {
            console.log(`[connect] x-forwarded-for=${socket.handshake.headers['x-forwarded-for'] ?? '(none)'} peer=${socket.handshake.address} limited-as=${address}`);
        }

        // Throttle every event from this socket before any handler runs.
        const bucket = new TokenBucket(config.eventBurst, config.eventsPerSecond);
        socket.use(([, ...args], next) => {
            if (bucket.take()) return next();
            const ack = args[args.length - 1];
            if (typeof ack === 'function') ack({ ok: false, error: "You're doing that too fast. Wait a moment and try again." });
        });

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
            if (lobbies.size >= config.maxLobbies) return { ok: false, error: 'The server is full right now. Try again in a few minutes.' };
            if (!createLimiter.tryHit(address)) return { ok: false, error: "You're creating lobbies too fast. Wait a minute and try again." };
            return join(createLobby(), payload.name);
        }));

        socket.on('lobby:join', (payload, ack) => respond(ack, (): JoinResult => {
            if (failedJoinLimiter.isFull(address)) return { ok: false, error: 'Too many wrong codes. Wait a minute and try again.' };
            const lobby = typeof payload?.code === 'string' ? lobbies.get(payload.code.trim().toUpperCase()) : undefined;
            if (!lobby) {
                failedJoinLimiter.record(address);
                return { ok: false, error: 'No lobby with that code.' };
            }
            if (seat()?.lobby === lobby) return { ok: false, error: "You're already in this lobby." };
            return join(lobby, payload.name);
        }));

        socket.on('lobby:rejoin', (payload, ack) => respond(ack, (): JoinResult => {
            const { code, playerId, token } = payload ?? {};
            const lobby = typeof code === 'string' ? lobbies.get(code) : undefined;
            if (!lobby || typeof playerId !== 'string' || typeof token !== 'string') return { ok: false, error: 'That lobby has closed.' };
            const result = lobby.reconnect(playerId, token, socket.id);
            if (!result.ok) return result;
            // A socket holds one seat. Reclaiming a different one lets go of the old seat as if this tab had
            // closed, so it isn't left looking connected to a socket that can no longer act for it.
            const current = seat();
            if (current && !(current.lobby === lobby && current.playerId === playerId)) {
                releaseSeat();
                current.lobby.disconnect(current.playerId, socket.id);
            }
            return takeSeat(lobby, playerId, token);
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
        socket.on('route:lockIn', (payload, ack) => act(ack, (lobby, id) => lobby.lockInRoute(id, payload?.round, payload?.route)));
        socket.on('solution:show', (payload, ack) => act(ack, (lobby, id) => lobby.showSolution(id, payload?.round)));

        socket.on('disconnect', () => {
            const current = seat();
            releaseSeat();
            current?.lobby.disconnect(current.playerId, socket.id);
        });
    });

    return {
        httpServer,
        lobbyCount: () => lobbies.size,
        sweep,
        close: async () => {
            clearInterval(sweeper);
            for (const lobby of lobbies.values()) lobby.close();
            lobbies.clear();
            await io.close();
        },
    };
}
