// Drives the real Socket.IO wiring over local sockets, with puzzle generation stubbed out.
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type {
    ActionResult, ClientToServerEvents, JoinResult, LobbySnapshot, ServerToClientEvents,
} from '../src/app/ricochet/lib/protocol';
import type { GameState } from '../src/app/ricochet/lib/types';
import { findOptimalPath } from '../src/app/ricochet/lib/solver';
import { createGameServer, type GameServerOptions } from './gameServer';
import type { Puzzle } from './lobby';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

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

const servers: { close: () => Promise<void> }[] = [];
const clients: Client[] = [];

const start = async (options: Partial<GameServerOptions> = {}) => {
    const server = createGameServer({ clientOrigins: [], generatePuzzle: () => Promise.resolve(puzzle), ...options });
    await new Promise<void>(resolve => server.httpServer.listen(0, resolve));
    servers.push(server);
    const { port } = server.httpServer.address() as AddressInfo;
    return { server, url: `http://localhost:${port}` };
};

const client = async (url: string): Promise<Client> => {
    const socket: Client = connect(url, { forceNew: true });
    clients.push(socket);
    await new Promise<void>(resolve => socket.once('connect', resolve));
    return socket;
};

// Resolves with the first snapshot (current or future) the predicate accepts.
const snapshotWhere = (socket: Client, accept: (s: LobbySnapshot) => boolean) =>
    new Promise<LobbySnapshot>(resolve => {
        const listener = (s: LobbySnapshot) => {
            if (!accept(s)) return;
            socket.off('lobby:state', listener);
            resolve(s);
        };
        socket.on('lobby:state', listener);
    });

const joined = (result: JoinResult) => {
    if (!result.ok) throw new Error(result.error);
    return result;
};

afterEach(async () => {
    for (const c of clients.splice(0)) c.disconnect();
    for (const s of servers.splice(0)) await s.close();
});

describe('lobbies over sockets', () => {
    it('plays a round: create, join, start, and lock in', async () => {
        const { url } = await start();
        const host = await client(url);
        const guest = await client(url);

        const created = joined(await host.emitWithAck('lobby:create', { name: 'Host' }));
        const guestJoin = joined(await guest.emitWithAck('lobby:join', { code: created.code.toLowerCase(), name: 'Guest' }));

        const thinking = snapshotWhere(guest, s => s.phase === 'thinking');
        expect(await guest.emitWithAck('round:start', { round: 0 })).toMatchObject({ ok: false }); // not the host
        expect(await host.emitWithAck('round:start', { round: 0 })).toEqual({ ok: true });
        const round = (await thinking).roundNumber;

        const lockedIn = snapshotWhere(host, s => s.phase === 'thinking' && s.lockIns.length === 1);
        expect(await guest.emitWithAck('route:lockIn', { round, route: [{ color: 'red', pos: { x: 0, y: 5 } }] })).toEqual({ ok: true });
        expect((await lockedIn).lockIns).toEqual([{ playerId: guestJoin.playerId, moves: 1 }]);
    });

    it('rejects unknown codes and routes that do not solve the puzzle', async () => {
        const { url } = await start();
        const a = await client(url);
        expect(await a.emitWithAck('lobby:join', { code: 'NOPE1', name: 'A' })).toMatchObject({ ok: false });

        joined(await a.emitWithAck('lobby:create', { name: 'A' }));
        const thinking = snapshotWhere(a, s => s.phase === 'thinking');
        await a.emitWithAck('round:start', { round: 0 });
        const { roundNumber } = await thinking;
        const bad = await a.emitWithAck('route:lockIn', { round: roundNumber, route: [{ color: 'red', pos: { x: 3, y: 3 } }] });
        expect(bad).toMatchObject({ ok: false });
    });

    it('sends actions from a socket with no seat back an error', async () => {
        const { url } = await start();
        const a = await client(url);
        expect(await a.emitWithAck('round:start', { round: 0 })).toEqual({ ok: false, error: "You're not in a lobby." });
    });
});

describe('seats', () => {
    it('lets a reloaded player rejoin with their token, and keeps their seat through a disconnect', async () => {
        const { url } = await start();
        const first = await client(url);
        const session = joined(await first.emitWithAck('lobby:create', { name: 'Ann' }));
        const other = await client(url);
        joined(await other.emitWithAck('lobby:join', { code: session.code, name: 'Bob' }));

        const offline = snapshotWhere(other, s => s.players.some(p => p.name === 'Ann' && !p.connected));
        first.disconnect();
        await offline;

        const second = await client(url);
        expect(await second.emitWithAck('lobby:rejoin', { code: session.code, playerId: session.playerId, token: 'wrong' })).toMatchObject({ ok: false });
        const back = snapshotWhere(second, s => s.players.every(p => p.connected));
        expect(await second.emitWithAck('lobby:rejoin', { code: session.code, playerId: session.playerId, token: session.token })).toMatchObject({ ok: true });
        expect((await back).players.map(p => p.name)).toEqual(['Ann', 'Bob']);
    });

    it('lets a newer socket take over a seat and ends the old one', async () => {
        const { url } = await start();
        const first = await client(url);
        const session = joined(await first.emitWithAck('lobby:create', { name: 'Ann' }));

        const ended = new Promise<string>(resolve => first.once('lobby:ended', resolve));
        const second = await client(url);
        expect(await second.emitWithAck('lobby:rejoin', session)).toMatchObject({ ok: true });
        expect(await ended).toMatch(/another tab/);

        // The old socket can no longer act for the seat.
        expect(await first.emitWithAck('round:start', { round: 0 })).toEqual({ ok: false, error: "You're not in a lobby." });
        expect(await second.emitWithAck('round:start', { round: 0 })).toEqual({ ok: true });
    });

    it('lets go of the old seat when a socket reclaims a different one, so it does not look connected forever', async () => {
        const { url } = await start();
        const hostA = await client(url);
        const hostB = await client(url);
        const a = joined(await hostA.emitWithAck('lobby:create', { name: 'HostA' }));
        const b = joined(await hostB.emitWithAck('lobby:create', { name: 'HostB' }));

        const dualA = await client(url);
        const dualB = await client(url);
        joined(await dualA.emitWithAck('lobby:join', { code: a.code, name: 'Dual' }));
        const seatB = joined(await dualB.emitWithAck('lobby:join', { code: b.code, name: 'Dual' }));

        // dualA, seated in A, now reclaims the seat in B (a crafted client; the UI never does this).
        const offlineInA = snapshotWhere(hostA, s => s.players.some(p => p.name === 'Dual' && !p.connected));
        expect(await dualA.emitWithAck('lobby:rejoin', seatB)).toMatchObject({ ok: true });
        expect((await offlineInA).players.find(p => p.name === 'Dual')?.connected).toBe(false);

        // The socket only hears from the lobby it holds a seat in now.
        const heardAfter: string[] = [];
        dualA.on('lobby:state', s => heardAfter.push(s.code));
        await hostA.emitWithAck('round:start', { round: 0 });
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(heardAfter).not.toContain(a.code);

        // Closing it now marks the seat in B offline, and A's seat stays offline rather than "connected" forever.
        const offlineInB = snapshotWhere(hostB, s => s.players.some(p => p.name === 'Dual' && !p.connected));
        dualA.disconnect();
        await offlineInB;
    });

    it('moves a player out of their old lobby when they join another', async () => {
        const { url, server } = await start();
        const a = await client(url);
        const b = await client(url);
        const first = joined(await a.emitWithAck('lobby:create', { name: 'Ann' }));
        const second = joined(await b.emitWithAck('lobby:create', { name: 'Bob' }));
        expect(server.lobbyCount()).toBe(2);

        // Ann is alone in her lobby, so leaving it for Bob's closes it.
        joined(await a.emitWithAck('lobby:join', { code: second.code, name: 'Ann' }));
        expect(server.lobbyCount()).toBe(1);
        expect(await b.emitWithAck('lobby:join', { code: first.code, name: 'Bob2' })).toMatchObject({ ok: false });
    });
});

describe('limits', () => {
    it('refuses new lobbies beyond the cap', async () => {
        const { url } = await start({ maxLobbies: 1, createsPerMinute: 100 });
        const a = await client(url);
        const b = await client(url);
        joined(await a.emitWithAck('lobby:create', { name: 'A' }));
        expect(await b.emitWithAck('lobby:create', { name: 'B' })).toMatchObject({ ok: false, error: expect.stringMatching(/full/) });
    });

    it('limits how many lobbies one address can create per minute', async () => {
        const { url } = await start({ createsPerMinute: 2 });
        const results: ActionResult[] = [];
        for (let i = 0; i < 3; i++) {
            const c = await client(url);
            results.push(await c.emitWithAck('lobby:create', { name: `P${i}` }));
        }
        expect(results.map(r => r.ok)).toEqual([true, true, false]);
    });

    it('blocks an address that keeps guessing codes', async () => {
        const { url } = await start({ failedJoinsPerMinute: 2 });
        const c = await client(url);
        const errors: string[] = [];
        for (const code of ['AAAAA', 'BBBBB', 'CCCCC']) {
            const result = await c.emitWithAck('lobby:join', { code, name: 'X' });
            errors.push(result.ok ? '' : result.error);
        }
        expect(errors[0]).toMatch(/No lobby/);
        expect(errors[2]).toMatch(/Too many/);
    });

    it('throttles a socket that floods events', async () => {
        const { url } = await start({ eventBurst: 3, eventsPerSecond: 0.001 });
        const c = await client(url);
        const results = await Promise.all(Array.from({ length: 6 }, () => c.emitWithAck('round:start', { round: 0 })));
        const throttled = results.filter(r => !r.ok && /too fast/.test(r.error));
        expect(throttled).toHaveLength(3);
    });

    it('closes idle lobbies and tells their players', async () => {
        const { url, server } = await start({ lobbyIdleMs: 0, sweepIntervalMs: 60_000 });
        const c = await client(url);
        joined(await c.emitWithAck('lobby:create', { name: 'A' }));
        const ended = new Promise<string>(resolve => c.once('lobby:ended', resolve));
        await new Promise(resolve => setTimeout(resolve, 5));
        server.sweep();
        expect(await ended).toMatch(/idle/);
        expect(server.lobbyCount()).toBe(0);
    });
});
