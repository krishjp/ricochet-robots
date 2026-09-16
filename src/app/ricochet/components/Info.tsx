// /app/ricochet/components/HowToPlayModal.tsx
'use client';
import { X, Bot, Target, Dices, ArrowRight } from 'lucide-react';
import { orbitron } from '../lib/types';

interface HowToPlayModalProps {
    onClose: () => void;
}

export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-slate-800 text-white p-8 rounded-lg max-w-lg w-full relative shadow-2xl max-h-[85vh] overflow-y-auto">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                    <X size={24} />
                </button>

                <h2 className={`${orbitron.className} text-3xl font-black mb-6`}>How To Play</h2>

                <section className="mb-6">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Target size={20} className="text-red-500" /> Objective
                    </h3>
                    <p className="text-slate-300 leading-relaxed">
                        Get the target-colored robot onto the matching target tile, shown by the{' '}
                        <Target size={16} className="inline text-red-500 align-text-bottom" strokeWidth={1.5} /> icon on the board,
                        in as few moves as possible.
                    </p>
                </section>

                <section className="mb-6">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Bot size={20} className="text-blue-500" /> Moving Robots
                    </h3>
                    <ul className="text-slate-300 leading-relaxed list-disc list-inside space-y-1">
                        <li>Click or tap a robot to select it. Its possible moves light up on the board.</li>
                        <li>Click a highlighted tile to slide the robot there.</li>
                        <li>Robots slide in a straight line and don&apos;t stop until they hit a wall, the edge of the board, or another robot.</li>
                        <li>Any robot can move, not just the target-colored one &mdash; the other three are useful as blockers to stop the target robot in the right place.</li>
                    </ul>
                </section>

                <section className="mb-6">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <ArrowRight size={20} className="text-purple-500" /> Solving
                    </h3>
                    <p className="text-slate-300 leading-relaxed">
                        Your move count is tracked as you play. Once the solver finishes analyzing the board, &quot;Show Optimal Solution&quot;
                        plays back the shortest possible solution so you can compare it to your own. &quot;Reset&quot; returns the robots to
                        their starting positions without leaving the puzzle.
                    </p>
                </section>

                <section>
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                        <Dices size={20} className="text-green-500" /> New Puzzles &amp; Sharing
                    </h3>
                    <p className="text-slate-300 leading-relaxed">
                        &quot;New Game&quot; generates a fresh, randomly-walled board with a guaranteed solution. Every puzzle has a
                        Game ID you can copy and share &mdash; paste one into the load field to play that exact board yourself.
                    </p>
                </section>
            </div>
        </div>
    );
}
