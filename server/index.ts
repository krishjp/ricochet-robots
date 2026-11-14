// Entry point for the multiplayer lobby server (Socket.IO). Deployed separately from the Next.js app; see render.yaml.
// The wiring lives in gameServer.ts.
import { createGameServer } from './gameServer';
import { generatePuzzle } from './generatePuzzle';

const PORT = Number(process.env.PORT) || 3001;
// Comma-separated list of allowed browser origins, e.g. the Vercel deployment's URL.
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000').split(',').map(o => o.trim()).filter(Boolean);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

const LOG_CLIENT_ADDRESSES = process.env.LOG_CLIENT_ADDRESSES === 'true';

const { httpServer } = createGameServer({ clientOrigins: CLIENT_ORIGINS, generatePuzzle, trustProxy: TRUST_PROXY, logClientAddresses: LOG_CLIENT_ADDRESSES });

httpServer.listen(PORT, () => {
    console.log(`Multiplayer server listening on :${PORT}, allowing origins: ${CLIENT_ORIGINS.join(', ')}`);
});
