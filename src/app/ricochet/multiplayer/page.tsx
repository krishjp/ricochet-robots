// /app/ricochet/multiplayer/page.tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Dices, Users } from 'lucide-react';

import { styles } from '../../styles/ricochet-styles';
import { orbitron } from '../lib/types';
import Header from '../components/Header';
import HowToPlayModal from '../components/Info';
import Board from '../components/Board';
import RobotsComponent from '../components/Robots';
import LobbyEntry from '../components/LobbyEntry';
import MultiplayerPanel from '../components/MultiplayerPanel';

import type { Position, RobotColor, Robots } from '../lib/types';
import type { LobbySnapshot } from '../lib/protocol';
import { calculateMoves } from '../lib/solver';
import { ROBOT_COLORS } from '../lib/constants';
import { useLobby } from '../lib/useLobby';
import { usePathPlayback } from '../lib/usePathPlayback';

// How long the solved board stays up (winning move's slide included) before the optimal route replays.
const SOLVED_HOLD_MS = 3000;
// Shorter pause when nobody solved it, since there's no winning board to look at.
const UNSOLVED_HOLD_MS = 1500;

type Lobby = ReturnType<typeof useLobby>;

export default function MultiplayerPage() {
    const lobby = useLobby();
    const [showHelp, setShowHelp] = useState(false);

    return (
        <>
            <Header onShowHelp={() => setShowHelp(true)} />
            {lobby.snapshot && lobby.playerId ? (
                // Remounting per puzzle resets the practice board, selection, and playback.
                <Round
                    key={`${lobby.snapshot.roundNumber}-${lobby.snapshot.puzzle ? 'ready' : 'pending'}`}
                    lobby={lobby}
                    snapshot={lobby.snapshot}
                    playerId={lobby.playerId}
                />
            ) : (
                <LobbyEntry
                    connected={lobby.connected}
                    restoring={lobby.restoring}
                    notice={lobby.notice}
                    onDismissNotice={lobby.dismissNotice}
                    onCreate={lobby.createLobby}
                    onJoin={lobby.joinLobby}
                />
            )}
            {showHelp && <HowToPlayModal onClose={() => setShowHelp(false)} />}
        </>
    );
}

function Round({ lobby, snapshot, playerId }: { lobby: Lobby; snapshot: LobbySnapshot; playerId: string }) {
    const { phase, puzzle, demo, outcome } = snapshot;

    // Private practice board for the thinking phase. Other players never see these moves.
    const [practiceRobots, setPracticeRobots] = useState<Robots | null>(puzzle?.robots ?? null);
    const [practiceMoves, setPracticeMoves] = useState(0);
    const [selectedRobot, setSelectedRobot] = useState<RobotColor | null>(null);
    // The last demonstrated position stays on screen until the optimal-route replay starts.
    const [lastDemoRobots, setLastDemoRobots] = useState<Robots | null>(null);
    const playback = usePathPlayback();
    const { play } = playback;

    const isMyDemo = phase === 'demonstrating' && demo?.playerId === playerId;
    const interactive = phase === 'thinking' || isMyDemo;

    useEffect(() => {
        if (demo) setLastDemoRobots(demo.robots);
    }, [demo]);

    useEffect(() => setSelectedRobot(null), [phase, demo?.playerId]);

    const replay = useCallback((delayMs = 0) => {
        if (puzzle && outcome) play(puzzle.robots, outcome.solution, delayMs);
    }, [puzzle, outcome, play]);

    // Play the optimal route automatically once, when the round ends.
    const autoPlayedRef = useRef(false);
    useEffect(() => {
        if (phase !== 'revealed' || autoPlayedRef.current) return;
        autoPlayedRef.current = true;
        replay(outcome?.winnerId ? SOLVED_HOLD_MS : UNSOLVED_HOLD_MS);
    }, [phase, outcome, replay]);

    let robots: Robots | null = null;
    if (puzzle) {
        if (phase === 'thinking') robots = practiceRobots;
        else if (phase === 'demonstrating') robots = demo?.robots ?? puzzle.robots;
        else if (phase === 'revealed') robots = playback.robots ?? outcome?.winningRobots ?? lastDemoRobots ?? puzzle.robots;
    }

    const practiceSolved = !!(phase === 'thinking' && puzzle && practiceRobots
        && practiceRobots[puzzle.target.color].x === puzzle.target.x
        && practiceRobots[puzzle.target.color].y === puzzle.target.y);

    const handleCellClick = (x: number, y: number) => {
        if (!interactive || !robots) return;
        const color = ROBOT_COLORS.find(c => robots![c].x === x && robots![c].y === y);
        if (color) setSelectedRobot(color);
    };

    const handleMove = (pos: Position) => {
        if (!selectedRobot || !interactive) return;
        if (isMyDemo) {
            lobby.demoMove(selectedRobot, pos);
            return;
        }
        if (practiceSolved) return;
        setPracticeRobots(prev => prev && { ...prev, [selectedRobot]: { ...prev[selectedRobot], ...pos } });
        setPracticeMoves(n => n + 1);
    };

    const resetPractice = () => {
        setPracticeRobots(puzzle?.robots ?? null);
        setPracticeMoves(0);
        setSelectedRobot(null);
    };

    // Shown on the winning board until the optimal-route replay takes over.
    const solvedBanner = phase === 'revealed' && outcome?.winnerId && !playback.robots
        ? `${outcome.winnerId === playerId ? 'You' : snapshot.players.find(p => p.id === outcome.winnerId)?.name ?? 'A player'} solved it in ${outcome.moves} ${outcome.moves === 1 ? 'move' : 'moves'}!`
        : null;

    const possibleMoves = interactive && selectedRobot && robots && puzzle && !(phase === 'thinking' && practiceSolved)
        ? calculateMoves(robots[selectedRobot], robots, puzzle.walls)
        : [];

    return (
        <main className={styles.mainContainer} onClick={e => { if (e.target === e.currentTarget) setSelectedRobot(null); }}>
            <div className="relative w-full max-w-lg lg:max-w-xl xl:max-w-2xl aspect-square">
                {puzzle && robots ? (
                    <>
                        <Board
                            walls={puzzle.walls}
                            target={puzzle.target}
                            possibleMoves={possibleMoves}
                            onMove={handleMove}
                            onCellClick={handleCellClick}
                        />
                        <RobotsComponent
                            robots={robots}
                            walls={puzzle.walls}
                            selectedRobot={interactive ? selectedRobot : null}
                            onRobotClick={handleCellClick}
                        />
                        {solvedBanner && (
                            <div className={`${styles.solvedBanner} ${orbitron.className}`} role="status">
                                <CheckCircle2 size={22} /> {solvedBanner}
                            </div>
                        )}
                    </>
                ) : (
                    <div className={styles.boardPlaceholder}>
                        {phase === 'generating'
                            ? <><Dices className={styles.loadingSpinner} /><p className="text-xl">Generating a solvable puzzle...</p></>
                            : <><Users className="w-16 h-16" /><p className="text-xl">Share the lobby code, then start the game.</p></>}
                    </div>
                )}
            </div>
            <MultiplayerPanel
                snapshot={snapshot}
                playerId={playerId}
                clockOffset={lobby.clockOffset}
                notice={lobby.notice}
                localMoves={practiceMoves}
                localSolved={practiceSolved}
                replaying={playback.playing}
                onDismissNotice={lobby.dismissNotice}
                onStart={lobby.startRound}
                onSkip={lobby.skipRound}
                onBid={lobby.placeBid}
                onForfeit={lobby.forfeitDemo}
                onResetLocal={resetPractice}
                onReplay={() => replay()}
                onLeave={lobby.leaveLobby}
            />
        </main>
    );
}
