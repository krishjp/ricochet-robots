import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Puzzle } from './lobby';

// Under tsx this module runs as puzzleWorker.ts's sibling .ts file; in the esbuild bundle, as .js.
const EXTENSION = path.extname(__filename);
const WORKER_PATH = path.join(__dirname, `puzzleWorker${EXTENSION}`);
// Worker threads don't inherit tsx's loader, so under tsx a small bootstrap registers it before loading the .ts worker.
const spawnWorker = () => EXTENSION === '.ts'
    ? new Worker(`require('tsx/cjs'); require(${JSON.stringify(WORKER_PATH)});`, { eval: true })
    : new Worker(WORKER_PATH);

export const generatePuzzle = (): Promise<Puzzle> => new Promise((resolve, reject) => {
    const worker = spawnWorker();
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Puzzle worker exited with code ${code}`)));
});
