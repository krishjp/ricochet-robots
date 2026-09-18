// /app/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, Users, Target, ArrowRight } from 'lucide-react';

import Header from './ricochet/components/Header';
import HowToPlayModal from './ricochet/components/Info';
import Board from './ricochet/components/Board';
import RobotsComponent from './ricochet/components/Robots';
import { orbitron } from './ricochet/lib/types';
import { BID_COUNTDOWN_MS, MAX_PLAYERS, ROBOT_COLORS } from './ricochet/lib/constants';
import { DEMO_SOLUTION, DEMO_STATE } from './ricochet/lib/demoPuzzle';
import { usePathPlayback } from './ricochet/lib/usePathPlayback';
import { styles, colors } from './styles/ricochet-styles';

// Pause on the solved board, and before the first move, between loops of the demo.
const DEMO_PAUSE_MS = 2000;

const noop = () => {};

export default function HomePage() {
    const [showHelp, setShowHelp] = useState(false);
    const { robots, playing, play } = usePathPlayback();

    // Loop the demo solution, unless the visitor prefers reduced motion.
    useEffect(() => {
        if (playing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        play(DEMO_STATE.robots, DEMO_SOLUTION, DEMO_PAUSE_MS);
    }, [playing, play]);

    return (
        <>
            <Header onShowHelp={() => setShowHelp(true)} />
            <main className={styles.mainContainer}>
                <div className="relative w-full max-w-lg lg:max-w-xl xl:max-w-2xl aspect-square" aria-hidden>
                    <Board walls={DEMO_STATE.walls} target={DEMO_STATE.target} possibleMoves={[]} onMove={noop} onCellClick={noop} />
                    <RobotsComponent robots={robots ?? DEMO_STATE.robots} walls={DEMO_STATE.walls} selectedRobot={null} onRobotClick={noop} />
                </div>

                <div className={styles.panelContainer}>
                    <div className={styles.panelCard}>
                        <h2 className={`${orbitron.className} text-xl font-normal mb-2`}>Choose a Mode</h2>
                        <p className="text-slate-600">
                            Slide robots until they hit something, and get the target robot onto its{' '}
                            <Target size={16} className={`inline align-text-bottom ${colors.red.target}`} /> in as few moves as you can.
                        </p>
                        <div className="flex gap-1 mt-3">
                            {ROBOT_COLORS.map(color => <Bot key={color} className={`w-7 h-7 ${colors[color].text}`} strokeWidth={1.5} />)}
                        </div>
                    </div>

                    <div className={styles.panelCard}>
                        <h2 className={`${orbitron.className} text-xl font-normal mb-2 flex items-center gap-2`}>
                            <Bot className={colors.blue.text} /> Solo
                        </h2>
                        <p className="text-slate-600 mb-4">
                            Play generated puzzles at your own pace, then compare your moves with the optimal solution.
                        </p>
                        <Link href="/ricochet" className={`${styles.buttonBase} ${styles.buttonBlue}`}>
                            Play Solo <ArrowRight size={20} />
                        </Link>
                    </div>

                    <div className={styles.panelCard}>
                        <h2 className={`${orbitron.className} text-xl font-normal mb-2 flex items-center gap-2`}>
                            <Users className={colors.green.text} /> Multiplayer
                        </h2>
                        <p className="text-slate-600 mb-4">
                            Up to {MAX_PLAYERS} players share one board. Lock in your move count, beat the others within{' '}
                            {BID_COUNTDOWN_MS / 1000} seconds, then prove it on the board.
                        </p>
                        <Link href="/ricochet/multiplayer" className={`${styles.buttonBase} ${styles.buttonGreen}`}>
                            Play Multiplayer <ArrowRight size={20} />
                        </Link>
                    </div>
                </div>
            </main>
            {showHelp && <HowToPlayModal onClose={() => setShowHelp(false)} />}
        </>
    );
}
