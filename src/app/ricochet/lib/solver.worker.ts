// /app/ricochet/lib/solver.worker.ts
// Runs puzzle generation and solving off the main thread. See useSolverWorker.ts.
import type { SolverRequest, SolverResponse } from './types';
import { generateSolvablePuzzle } from './boardGenerator';
import { findOptimalPath } from './solver';

self.onmessage = (event: MessageEvent<SolverRequest>) => {
    const request = event.data;
    const response: SolverResponse = request.type === 'generate'
        ? { id: request.id, type: request.type, ...generateSolvablePuzzle() }
        : { id: request.id, type: request.type, state: request.state, solution: findOptimalPath(request.state.robots, request.state.walls, request.state.target) };
    self.postMessage(response);
};
