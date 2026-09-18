// /app/ricochet/components/Header.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Lightbulb } from 'lucide-react';
import { orbitron } from '../lib/types';

interface HeaderProps {
    onShowHelp: () => void;
}

export default function Header({ onShowHelp }: HeaderProps) {
    const isHome = usePathname() === '/';

    return (
        // This wrapper allows the background and border to be full-width
        <div className="w-full bg-slate-100 border-b border-slate-300 shadow-sm">
            <header className="max-w-7xl mx-auto py-2 px-4 flex justify-between items-center text-slate-700">
                <div className="flex items-center gap-2">
                    {!isHome && (
                        <Link
                            href="/"
                            title="Back to mode selection"
                            aria-label="Back to mode selection"
                            className="p-2 rounded-full hover:bg-slate-200 transition-colors"
                        >
                            <ArrowLeft size={24} />
                        </Link>
                    )}
                    <h1 className={`${orbitron.className} text-3xl md:text-4xl font-black tracking-wide`}>
                        <Link href="/">Ricochet Robots</Link>
                    </h1>
                </div>
                <button
                    onClick={onShowHelp}
                    title="How to Play"
                    className="p-2 rounded-full hover:bg-slate-200 transition-colors"
                >
                    <Lightbulb size={24} />
                </button>
            </header>
        </div>
    );
}