// /app/ricochet/lib/useSolverWorker.ts
'use client';
import { useCallback, useEffect, useRef } from 'react';
import type { SolverJob, SolverRequest, SolverResponse } from './types';

/**
 * Runs generation and solving jobs on a Web Worker. Only the most recent job's result
 * is delivered; starting a new job cancels the old one.
 */
export function useSolverWorker(onResult: (response: SolverResponse) => void) {
    const workerRef = useRef<Worker | null>(null);
    const pendingIdRef = useRef<number | null>(null);
    const nextIdRef = useRef(0);
    const onResultRef = useRef(onResult);

    useEffect(() => {
        onResultRef.current = onResult;
    }, [onResult]);

    const stopWorker = useCallback(() => {
        workerRef.current?.terminate();
        workerRef.current = null;
        pendingIdRef.current = null;
    }, []);

    useEffect(() => stopWorker, [stopWorker]);

    return useCallback((job: SolverJob) => {
        // A busy worker can't be interrupted mid-search, so replace it instead of queueing behind a stale job.
        if (pendingIdRef.current !== null) stopWorker();

        if (!workerRef.current) {
            const worker = new Worker(new URL('./solver.worker.ts', import.meta.url));
            worker.onmessage = (event: MessageEvent<SolverResponse>) => {
                if (event.data.id !== pendingIdRef.current) return;
                pendingIdRef.current = null;
                onResultRef.current(event.data);
            };
            workerRef.current = worker;
        }

        const request: SolverRequest = { ...job, id: ++nextIdRef.current };
        pendingIdRef.current = request.id;
        workerRef.current.postMessage(request);
    }, [stopWorker]);
}
