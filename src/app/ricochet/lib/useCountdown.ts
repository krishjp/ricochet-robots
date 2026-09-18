'use client';
import { useEffect, useState } from 'react';

/** Whole seconds left until a server-time deadline, or null without one. `clockOffset` is server time minus local time. */
export function useCountdown(endsAt: number | null, clockOffset: number): number | null {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (endsAt === null) return;
        setNow(Date.now());
        const interval = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(interval);
    }, [endsAt]);

    return endsAt === null ? null : Math.max(0, Math.ceil((endsAt - clockOffset - now) / 1000));
}
