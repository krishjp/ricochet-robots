// /app/ricochet/components/HowToPlayModal.tsx
'use client';
import { X } from 'lucide-react';
import { orbitron } from '../lib/types';

interface HowToPlayModalProps {
    onClose: () => void;
}

export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-slate-800 text-white p-8 rounded-lg max-w-md w-full relative shadow-2xl">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <X size={24} />
                </button>
                {/* <h2 className="text-3xl font-bold mb-4">How To Play</h2> */}
                <p className={`${orbitron.className} text-4xl font-normal text-center`}>
                    Ricochet Robots Info Page under construction
                </p>
            </div>
        </div>
    );
}