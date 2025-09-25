// /app/ricochet/components/Header.tsx
'use client';
import { Lightbulb } from 'lucide-react';
import { orbitron } from '../lib/types';

interface HeaderProps {
    onShowHelp: () => void;
}

export default function Header({ onShowHelp }: HeaderProps) {
    return (
        // This wrapper allows the background and border to be full-width
        <div className="w-full bg-slate-100 border-b border-slate-300 shadow-sm">
            <header className="max-w-7xl mx-auto py-2 px-4 flex justify-between items-center text-slate-700">
                <h1 className={`${orbitron.className} text-3xl md:text-4xl font-black tracking-wide`}>
                    Ricochet Robots
                </h1>
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