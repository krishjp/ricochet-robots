'use client';
import { useState } from 'react';
import { Target, Bot, Copy, Crown, WifiOff, Play, SkipForward, Lock, Flag, RotateCcw, Loader2, LogOut, Trophy, X } from 'lucide-react';
import { orbitron } from '../lib/types';
import type { LobbySnapshot } from '../lib/protocol';
import { BID_COUNTDOWN_MS, MAX_BID_MOVES, MAX_PLAYERS } from '../lib/constants';
import { useCountdown } from '../lib/useCountdown';
import { styles, colors } from '../../styles/ricochet-styles';

interface MultiplayerPanelProps {
    snapshot: LobbySnapshot;
    playerId: string;
    clockOffset: number;
    notice: string | null;
    localMoves: number;
    localSolved: boolean;
    replaying: boolean;
    onDismissNotice: () => void;
    onStart: () => void;
    onSkip: () => void;
    onBid: (moves: number) => void;
    onForfeit: () => void;
    onResetLocal: () => void;
    onReplay: () => void;
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

function PhaseStatus({ snapshot, playerId, clockOffset, localMoves, localSolved, replaying, onStart, onSkip, onBid, onForfeit, onResetLocal, onReplay }: MultiplayerPanelProps) {
    const [bidInput, setBidInput] = useState('');
    const countdown = useCountdown(snapshot.countdownEndsAt, clockOffset);
    const demoCountdown = useCountdown(snapshot.demo?.endsAt ?? null, clockOffset);

    const isHost = snapshot.hostId === playerId;
    const nameOf = (id: string | null) => snapshot.players.find(p => p.id === id)?.name ?? 'A player who left';
    const myBid = snapshot.bids.find(b => b.playerId === playerId);
    const canBidWith = (moves: number) => !myBid || moves < myBid.moves;
    const title = (text: string) => <h2 className={`${orbitron.className} text-xl font-normal mb-2`}>{text}</h2>;

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
            const bid = Number(bidInput);
            const validBid = Number.isInteger(bid) && bid >= 1 && bid <= MAX_BID_MOVES && canBidWith(bid);
            return (
                <>
                    {title('Find a Solution')}
                    {countdown === null
                        ? <p className="text-slate-600 mb-3">No one has locked in yet. The first lock-in starts a {BID_COUNTDOWN_MS / 1000} second timer.</p>
                        : <p className="mb-3"><span className={`${styles.countdown} text-red-600`}>{countdown}s</span> <span className="text-slate-600">left to beat the best lock-in</span></p>}

                    <div className="flex items-center justify-between mb-3">
                        <span className={`${orbitron.className}`}>Your moves: <span className="text-slate-600">{localMoves}</span></span>
                        <button onClick={onResetLocal} className={`${styles.buttonBase} ${styles.buttonBlue} py-1 text-sm`}><RotateCcw size={14} /> Reset</button>
                    </div>
                    {localSolved && (
                        <button
                            onClick={() => onBid(localMoves)}
                            disabled={!canBidWith(localMoves)}
                            className={`${styles.buttonBase} ${styles.buttonGreen} ${styles.buttonDisabled} w-full mb-2`}
                        >
                            <Lock size={18} /> Lock in {localMoves} {localMoves === 1 ? 'move' : 'moves'}
                        </button>
                    )}
                    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (validBid) { onBid(bid); setBidInput(''); } }}>
                        <input
                            type="number"
                            min={1}
                            max={MAX_BID_MOVES}
                            placeholder="Moves"
                            value={bidInput}
                            onChange={e => setBidInput(e.target.value)}
                            className={`${styles.input} flex-grow`}
                        />
                        <button type="submit" disabled={!validBid} className={`${styles.buttonBase} ${styles.buttonPurple} w-28`}><Lock size={16} /> Lock In</button>
                    </form>
                    {myBid && <p className="text-sm text-slate-500 mt-2">You locked in {myBid.moves}. You can still lower it.</p>}
                    <p className="text-xs text-slate-400 mt-2">Your practice moves are only visible to you.</p>
                    {isHost && snapshot.bids.length === 0 && (
                        <button onClick={onSkip} className={`${styles.buttonBase} ${styles.buttonSlate} w-full mt-3`}><SkipForward size={18} /> Skip Puzzle</button>
                    )}
                </>
            );
        }

        case 'demonstrating': {
            const demo = snapshot.demo!;
            const mine = demo.playerId === playerId;
            return (
                <>
                    {title(mine ? 'Your Turn!' : `${nameOf(demo.playerId)} is demonstrating`)}
                    <p className="mb-2"><span className={`${styles.countdown} ${mine ? 'text-red-600' : ''}`}>{demoCountdown}s</span></p>
                    <p className={`${orbitron.className} mb-2`}>Moves: <span className="text-slate-600">{demo.movesMade} / {demo.bid}</span></p>
                    {mine ? (
                        <>
                            <p className="text-slate-600 mb-3">Show your {demo.bid}-move solution. Select a robot, then a highlighted tile.</p>
                            <button onClick={onForfeit} className={`${styles.buttonBase} ${styles.buttonRed} w-full`}><Flag size={18} /> Give Up</button>
                        </>
                    ) : (
                        <p className="text-slate-600">If they don&apos;t reach the target in {demo.bid} moves before time runs out, the next lock-in gets a turn.</p>
                    )}
                </>
            );
        }

        case 'revealed': {
            const outcome = snapshot.outcome!;
            return (
                <>
                    {title('Round Over')}
                    <p className="text-lg font-semibold mb-2 flex items-center gap-2">
                        {outcome.winnerId
                            ? <><Trophy className="text-amber-500" size={20} /> {outcome.winnerId === playerId ? 'You score' : `${nameOf(outcome.winnerId)} scores`} with {outcome.moves} {outcome.moves === 1 ? 'move' : 'moves'}!</>
                            : 'Nobody solved this one.'}
                    </p>
                    <p className="text-slate-600 mb-3">Optimal solution: {outcome.solution.length} moves.</p>
                    <div className="flex flex-col gap-2">
                        <button onClick={onReplay} disabled={replaying} className={`${styles.buttonBase} ${styles.buttonPurple}`}>
                            {replaying ? <><Loader2 size={18} className="animate-spin" /> Showing Optimal Route...</> : <><Play size={18} /> Replay Optimal Route</>}
                        </button>
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
    const bidOrder = new Map(snapshot.bids.map((b, i) => [b.playerId, { moves: b.moves, rank: i + 1 }]));
    const players = [...snapshot.players].sort((a, b) => b.score - a.score);

    return (
        <div className={styles.panelCard}>
            <h2 className={`${orbitron.className} text-xl font-normal mb-2`}>Players</h2>
            <ul>
                {players.map(p => {
                    const bid = bidOrder.get(p.id);
                    const failed = snapshot.failedPlayerIds.includes(p.id);
                    const active = snapshot.demo?.playerId === p.id;
                    return (
                        <li key={p.id} className={`${styles.playerRow} ${active ? styles.playerRowActive : ''}`}>
                            <span className="w-6 text-right font-bold tabular-nums">{p.score}</span>
                            <span className={`truncate ${p.connected ? '' : 'text-slate-400'}`}>
                                {p.name}{p.id === playerId && <span className="text-slate-400"> (you)</span>}
                            </span>
                            {snapshot.hostId === p.id && <span title="Host"><Crown size={14} className="text-amber-500 shrink-0" /></span>}
                            {!p.connected && <span title="Reconnecting"><WifiOff size={14} className="text-slate-400 shrink-0" /></span>}
                            {bid && (
                                <span className={`${styles.bidBadge} ${failed ? styles.bidBadgeFailed : ''}`} title={`Lock-in #${bid.rank}`}>
                                    #{bid.rank} · {bid.moves}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
