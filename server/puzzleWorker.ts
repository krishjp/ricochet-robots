// Generates one puzzle off the server's event loop, so a slow board doesn't stall every lobby.
import { parentPort } from 'node:worker_threads';
import { generateSolvablePuzzle } from '../src/app/ricochet/lib/boardGenerator';

parentPort!.postMessage(generateSolvablePuzzle());
