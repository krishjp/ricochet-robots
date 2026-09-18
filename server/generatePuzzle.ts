import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Puzzle } from './lobby';

// Under tsx this module runs as puzzleWorker.ts's sibling .ts file; in the esbuild bundle, as .js.
const WORKER_PATH = path.join(__dirname, `puzzleWorker${path.extname(__filename)}`);

export const generatePuzzle = (): Promise<Puzzle> => new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH);
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => reject(new Error(`Puzzle worker exited with code ${code}`)));
});
