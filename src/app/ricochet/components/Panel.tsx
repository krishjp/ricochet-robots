// /app/ricochet/components/Panel.tsx
'use client';
import { Target, Bot, RotateCcw, Dices, ArrowRight, Copy, Upload } from 'lucide-react';
import { TargetChip , orbitron } from '../lib/types';
import { styles, colors } from '../../styles/ricochet-styles';

interface PanelProps {
    target: TargetChip;
    moveCount: number;
    solved: boolean;
    isAnimating: boolean;
    gameId: string;
    inputId: string;
    copied: boolean;
    solveStats: { time: number; states: number } | null;
    onInputChange: (value: string) => void;
    onReset: () => void;
    onNewGame: () => void;
    onSolve: () => void;
    onCopy: () => void;
    onLoadGame: () => void;
}

export default function Panel({ target, moveCount, solved, isAnimating, gameId, inputId, copied, solveStats, onInputChange, onReset, onNewGame, onSolve, onCopy, onLoadGame }: PanelProps) {
    return (
        <div className={styles.panelContainer}>
            <div className={styles.panelCard}>
                <h2 className={`${orbitron.className} text-xl font-normal mb-2 `}>Target</h2>
                <div className="flex items-center gap-2">
                    <Target className={`w-8 h-8 ${colors[target.color].target}`} />
                    <Bot className={`w-8 h-8 ${colors[target.color].text}`} />
                    <span className='capitalize text-lg font-medium'>{target.color} Robot</span>
                </div>
            </div>

            <div className={styles.panelCard}>
                <h2 className={`${orbitron.className} text-xl font-normal mb-2 `}>Game Info</h2>
                <p className={`${orbitron.className} text-lg font-normal mb-2 justify-between`}>Moves: <span className=" text-slate-600">{moveCount}</span></p>
                {solved && !isAnimating && <p className="text-2xl font-bold text-green-600 mt-2 animate-pulse">Puzzle Solved!</p>}
                {solveStats && (
                    <div className="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-500 space-y-1">
                        <div className={`${orbitron.className} text-base font-normal mb-2 flex justify-between`}>
                            <span>Solve Time:</span>
                            <span className="font-normal text-base text-slate-600">{(solveStats.time).toFixed(2)}ms</span>
                        </div>
                        <div className={`${orbitron.className} text-base font-normal mb-2 flex justify-between`}>
                            <span>Moves Explored:</span>
                            <span className="font-normal text-base text-slate-600">{solveStats.states.toLocaleString()}</span>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <button onClick={onReset} disabled={isAnimating} className={`${styles.buttonBase} ${styles.buttonBlue}`}><RotateCcw size={20}/> Reset</button>
                <button onClick={onNewGame} disabled={isAnimating} className={`${styles.buttonBase} ${styles.buttonGreen}`}><Dices size={20}/> New Game</button>
            </div>
             <button onClick={onSolve} disabled={isAnimating} className={`${styles.buttonBase} ${styles.buttonPurple}`}>
                <ArrowRight size={20}/> Show Optimal Solution
             </button>

             <div className="space-y-4">
                <div className={styles.panelCard}>
                    <h2 className={`${orbitron.className} text-xl font-normal mb-2 `}>Game ID</h2>
                    <div className="flex gap-2">
                        <input type="text" readOnly value={gameId} className="flex-grow bg-slate-100 px-2 py-1 rounded-md text-sm text-slate-600 truncate" />
                        <button onClick={onCopy} className={`${styles.buttonBase} ${styles.buttonBlue} w-24`}><Copy size={16}/> {copied ? 'Copied!' : 'Copy'}</button>
                    </div>
                </div>

                <div className={styles.panelCard}>
                     <h2 className={`${orbitron.className} text-xl font-normal mb-2 `}>Load a Game</h2>
                     <div className="flex gap-2">
                        <input type="text" placeholder="Paste a Game ID..." value={inputId} onChange={(e) => onInputChange(e.target.value)} className="flex-grow bg-white border border-slate-300 px-2 py-1 rounded-md text-sm" />
                        <button onClick={onLoadGame} disabled={!inputId} className={`${styles.buttonBase} ${styles.buttonGreen} w-24`}><Upload size={16}/> Load</button>
                    </div>
                </div>
             </div>
        </div>
    );
}