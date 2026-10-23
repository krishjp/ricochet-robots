'use client';
import { useState } from 'react';
import { Target, Bot, Copy, Crown, WifiOff, Play, SkipForward, Lock, RotateCcw, Undo2, Loader2, LogOut, Trophy, Sparkles, X } from 'lucide-react';
import { orbitron } from '../lib/types';
import type { LobbySnapshot } from '../lib/protocol';
import { LOCK_IN_COUNTDOWN_MS, MAX_PLAYERS, MAX_ROUTE_MOVES } from '../lib/constants';
import { useCountdown } from '../lib/useCountdown';
import { styles, colors } from '../../styles/ricochet-styles';

// Which route the board is showing (or last showed) after the round ends.
export type ShownRoute = 'winner' | 'optimal' | null;

interface MultiplayerPanelProps {
    snapshot: LobbySnapshot;
    playerId: string;
    clockOffset: number;
    notice: string | null;
    localMoves: number;
    localSolved: boolean;
    // The route currently playing back, if any.
    replaying: ShownRoute;
    onDismissNotice: () => void;
    onStart: () => void;
    onSkip: () => void;
    onLockIn: () => void;
    onUndoLocal: () => void;
    onResetLocal: () => void;
    onShowSolution: () => void;
    onReplay: (which: 'winner' | 'optimal') => void;
    onLeave: () => void;
}

export default function MultiplayerPanel(props: MultiplayerPanelProps) {
    const { snapshot, playerId, notice, onDismissNotice, onLeave } = props;
    const [copied, setCopied] = useState(false);

    const copyInvite = async () => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/ricochet/multiplayer?code=${snapshot.code}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard unavailable; the code is shown for sharing by hand.
        }
    };

    return (
        <div className={styles.panelContainer}>
            <div className={styles.panelCard}>
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <p className="text-xs uppercase text-slate-500">Lobby code</p>
                        <p className={`${orbitron.className} text-2xl font-black tracking-widest`}>{snapshot.code}</p>
                    </div>
                    <button onClick={copyInvite} className={`${styles.buttonBase} ${styles.buttonBlue} w-32`}>
                        <Copy size={16} /> {copied ? 'Copied!' : 'Invite Link'}
                    </button>
                </div>
            </div>

            {notice && (
                <div className={styles.notice} role="alert">
                    <span>{notice}</span>
                    <button onClick={onDismissNotice} title="Dismiss"><X size={16} /></button>
                </div>
            )}

            {snapshot.puzzle && (
                <div className={styles.panelCard}>
                    <h2 className={`${orbitron.className} text-xl font-normal mb-2`}>Round {snapshot.roundNumber} Target</h2>
                    <div className="flex items-center gap-2">
                        <Target className={`w-8 h-8 ${colors[snapshot.puzzle.target.color].target}`} />
                        <Bot className={`w-8 h-8 ${colors[snapshot.puzzle.target.color].text}`} />
                        <span className="capitalize text-lg font-medium">{snapshot.puzzle.target.color} Robot</span>
                    </div>
                </div>
            )}

            <div className={styles.panelCard}>
                <PhaseStatus {...props} />
            </div>

            <Players snapshot={snapshot} playerId={playerId} />

            <button onClick={onLeave} className={`${styles.buttonBase} ${styles.buttonSlate}`}>
                <LogOut size={18} /> Leave Lobby
            </button>
        </div>
    );
}

function PhaseStatus({ snapshot, playerId, clockOffset, localMoves, localSolved, replaying, onStart, onSkip, onLockIn, onUndoLocal, onResetLocal, onShowSolution, onReplay }: MultiplayerPanelProps) {
    const countdown = useCountdown(snapshot.countdownEndsAt, clockOffset);

    const isHost = snapshot.hostId === playerId;
    const nameOf = (id: string | null) => snapshot.players.find(p => p.id === id)?.name ?? 'A player who left';
    const myLockIn = snapshot.lockIns.find(l => l.playerId === playerId);
    const title = (text: string) => <h2 className={`${orbitron.className} text-xl font-normal mb-2`}>{text}</h2>;
    const plural = (n: number) => `${n} ${n === 1 ? 'move' : 'moves'}`;

    switch (snapshot.phase) {
        case 'waiting':
            return (
                <>
                    {title('Waiting Room')}
                    <p className="text-slate-600 mb-3">
                        {snapshot.players.length} / {MAX_PLAYERS} players. {isHost ? 'Start whenever everyone has joined.' : 'Waiting for the host to start.'}
                    </p>
                    {isHost && (
                        <button onClick={onStart} className={`${styles.buttonBase} ${styles.buttonGreen} w-full`}><Play size={20} /> Start Game</button>
                    )}
                </>
            );

        case 'generating':
            return (
                <div className="flex items-center gap-3 text-slate-600">
                    <Loader2 className="animate-spin" /> Generating a puzzle...
                </div>
            );

        case 'thinking': {
            const improves = !myLockIn || localMoves < myLockIn.moves;
            return (
                <>
                    {title('Find a Route')}
                    {countdown === null
                        ? <p className="text-slate-600 mb-3">No one has locked in yet. The first lock-in starts a {LOCK_IN_COUNTDOWN_MS / 1000} second timer.</p>
                        : <p className="mb-3"><span className={`${styles.countdown} text-red-600`}>{countdown}s</span> <span className="text-slate-600">left to beat the best route</span></p>}

                    <div className="mb-3">
                        <p className={`${orbitron.className} mb-2`}>Your route: <span className="text-slate-600">{localMoves} / {MAX_ROUTE_MOVES}</span></p>
                        <div className="flex gap-2">
                            <button onClick={onUndoLocal} disabled={localMoves === 0} className={`${styles.buttonBase} ${styles.buttonSlate} ${styles.buttonDisabled} py-1 text-sm`}><Undo2 size={14} /> Undo</button>
                            <button onClick={onResetLocal} disabled={localMoves === 0} className={`${styles.buttonBase} ${styles.buttonBlue} ${styles.buttonDisabled} py-1 text-sm`}><RotateCcw size={14} /> Reset</button>
                        </div>
                    </div>
                    {localSolved ? (
                        <>
                            <button onClick={onLockIn} disabled={!improves} className={`${styles.buttonBase} ${styles.buttonGreen} ${styles.buttonDisabled} w-full mb-2`}>
                                <Lock size={18} /> Lock in {plural(localMoves)}
                            </button>
                            {!improves && <p className="text-sm text-slate-500">Undo or reset and find a route shorter than {plural(myLockIn!.moves)} to improve your lock-in.</p>}
                        </>
                    ) : localMoves >= MAX_ROUTE_MOVES ? (
                        <p className="text-sm text-slate-500">Routes are limited to {MAX_ROUTE_MOVES} moves. Undo a move or reset to keep trying.</p>
                    ) : (
                        <p className="text-sm text-slate-500">Move the robots on your board. Once the target robot reaches the target, lock in your route.</p>
                    )}
                    {myLockIn && <p className="text-sm text-slate-500 mt-2">Your {plural(myLockIn.moves)} route is locked in. You can still replace it with a shorter one.</p>}
                    <p className="text-xs text-slate-400 mt-2">Only you can see your board. Other players only see how many moves you locked in.</p>
                    {isHost && snapshot.lockIns.length === 0 && (
                        <button onClick={onSkip} className={`${styles.buttonBase} ${styles.buttonSlate} w-full mt-3`}><SkipForward size={18} /> Skip Puzzle</button>
                    )}
                </>
            );
        }

        case 'revealed': {
            const outcome = snapshot.outcome!;
            const replayButton = (which: 'winner' | 'optimal', label: string) => (
                <button onClick={() => onReplay(which)} disabled={replaying !== null} className={`${styles.buttonBase} ${styles.buttonPurple}`}>
                    {replaying === which ? <><Loader2 size={18} className="animate-spin" /> Playing {label}...</> : <><Play size={18} /> Replay {label}</>}
                </button>
            );
            return (
                <>
                    {title('Round Over')}
                    <p className="text-lg font-semibold mb-2 flex items-center gap-2">
                        {outcome.winnerId
                            ? <><Trophy className="text-amber-500" size={20} /> {outcome.winnerId === playerId ? 'You score' : `${nameOf(outcome.winnerId)} scores`} with {plural(outcome.moves!)}!</>
                            : 'Nobody solved this one.'}
                    </p>
                    {outcome.solution && <p className="text-slate-600 mb-3">Optimal solution: {plural(outcome.solution.length)}.</p>}
                    <div className="flex flex-col gap-2">
                        {outcome.winningRoute && replayButton('winner', 'Winning Route')}
                        {outcome.solution
                            ? replayButton('optimal', 'Optimal Route')
                            : isHost
                                ? <button onClick={onShowSolution} className={`${styles.buttonBase} ${styles.buttonPurple}`}><Sparkles size={18} /> Show Optimal Solution</button>
                                : <p className="text-sm text-slate-500">Waiting for the host to show the optimal solution.</p>}
                        {isHost
                            ? <button onClick={onStart} className={`${styles.buttonBase} ${styles.buttonGreen}`}><SkipForward size={18} /> Next Puzzle</button>
                            : <p className="text-sm text-slate-500">Waiting for the host to start the next puzzle.</p>}
                    </div>
                </>
            );
        }
    }
}

function Players({ snapshot, playerId }: { snapshot: LobbySnapshot; playerId: string }) {
    const lockInOrder = new Map(snapshot.lockIns.map((l, i) => [l.playerId, { moves: l.moves, rank: i + 1 }]));
    const players = [...snapshot.players].sort((a, b) => b.score - a.score);
    const winnerId = snapshot.outcome?.winnerId ?? null;

    return (
        <div className={styles.panelCard}>
            <h2 className={`${orbitron.className} text-xl font-normal mb-2`}>Players</h2>
            <ul>
                {players.map(p => {
                    const lockIn = lockInOrder.get(p.id);
                    return (
                        <li key={p.id} className={`${styles.playerRow} ${winnerId === p.id ? styles.playerRowActive : ''}`}>
                            <span className="w-6 text-right font-bold tabular-nums">{p.score}</span>
                            <span className={`truncate ${p.connected ? '' : 'text-slate-400'}`}>
                                {p.name}{p.id === playerId && <span className="text-slate-400"> (you)</span>}
                            </span>
                            {snapshot.hostId === p.id && <span title="Host"><Crown size={14} className="text-amber-500 shrink-0" /></span>}
                            {!p.connected && <span title="Reconnecting"><WifiOff size={14} className="text-slate-400 shrink-0" /></span>}
                            {lockIn && (
                                <span className={styles.lockInBadge} title={`Lock-in #${lockIn.rank}`}>
                                    #{lockIn.rank} · {lockIn.moves}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
