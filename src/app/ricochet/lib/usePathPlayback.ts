'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OptimalPathStep, Robots } from './types';
import { ANIMATION_DURATION_MS } from './constants';

/** Plays a solution back one move at a time, from a starting position, at the robots' animation speed. */
export function usePathPlayback() {
    const [robots, setRobots] = useState<Robots | null>(null);
    const [playing, setPlaying] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stop = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        setPlaying(false);
    }, []);

    useEffect(() => stop, [stop]);

    // After `delayMs`, jumps to `start` and plays `steps`. Until then `robots` keeps its previous value.
    const play = useCallback((start: Robots, steps: OptimalPathStep[], delayMs = 0) => {
        stop();
        setPlaying(true);
        let stepIndex = 0;
        const next = () => {
            if (stepIndex >= steps.length) {
                timerRef.current = null;
                setPlaying(false);
                return;
            }
            const { color, pos } = steps[stepIndex++];
            setRobots(prev => prev && { ...prev, [color]: { ...prev[color], ...pos } });
            timerRef.current = setTimeout(next, ANIMATION_DURATION_MS + 50);
        };
        timerRef.current = setTimeout(() => {
            setRobots(start);
            timerRef.current = setTimeout(next, ANIMATION_DURATION_MS);
        }, delayMs);
    }, [stop]);

    return { robots, playing, play, stop };
}
