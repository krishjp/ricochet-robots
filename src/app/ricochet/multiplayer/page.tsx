// /app/ricochet/multiplayer/page.tsx
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Dices, Sparkles, Users } from 'lucide-react';

import { styles } from '../../styles/ricochet-styles';
import { orbitron } from '../lib/types';
import Header from '../components/Header';
import HowToPlayModal from '../components/Info';
import Board from '../components/Board';
import RobotsComponent from '../components/Robots';
import LobbyEntry from '../components/LobbyEntry';
import MultiplayerPanel, { type ShownRoute } from '../components/MultiplayerPanel';

import type { Position, RobotColor, Robots } from '../lib/types';
import type { LobbySnapshot, RouteStep } from '../lib/protocol';
import { calculateMoves } from '../lib/solver';
import { MAX_ROUTE_MOVES, ROBOT_COLORS } from '../lib/constants';
import { useLobby } from '../lib/useLobby';
import { usePathPlayback } from '../lib/usePathPlayback';

// Pause on the starting board before a route plays back, so everyone sees where it begins.
const PLAYBACK_DELAY_MS = 1000;

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
    const { phase, puzzle, outcome } = snapshot;

    // Private practice board for the thinking phase. Other players never see these moves; the
    // route is only sent to the server when the player locks it in.
    const [practiceRobots, setPracticeRobots] = useState<Robots | null>(puzzle?.robots ?? null);
    const [practiceRoute, setPracticeRoute] = useState<RouteStep[]>([]);
    const [selectedRobot, setSelectedRobot] = useState<RobotColor | null>(null);
    const [shown, setShown] = useState<ShownRoute>(null);
    const playback = usePathPlayback();
    const { play } = playback;

    const interactive = phase === 'thinking';

    useEffect(() => setSelectedRobot(null), [phase]);

    const playRoute = useCallback((which: Exclude<ShownRoute, null>, delayMs = 0) => {
        const route = which === 'winner' ? outcome?.winningRoute : outcome?.solution;
        if (!puzzle || !route) return;
        setShown(which);
        play(puzzle.robots, route, delayMs);
    }, [puzzle, outcome, play]);

    // When the round ends, everyone watches the winning route once.
    const winnerPlayedRef = useRef(false);
    useEffect(() => {
        if (phase !== 'revealed' || winnerPlayedRef.current) return;
        winnerPlayedRef.current = true;
        playRoute('winner', PLAYBACK_DELAY_MS);
    }, [phase, playRoute]);

    // Then the optimal route plays once, as soon as the host reveals it.
    const optimalPlayedRef = useRef(false);
    useEffect(() => {
        if (!outcome?.solution || optimalPlayedRef.current) return;
        optimalPlayedRef.current = true;
        playRoute('optimal', PLAYBACK_DELAY_MS);
    }, [outcome?.solution, playRoute]);

    let robots: Robots | null = null;
    if (puzzle) robots = phase === 'thinking' ? practiceRobots : playback.robots ?? puzzle.robots;

    const practiceSolved = !!(phase === 'thinking' && puzzle && practiceRobots
        && practiceRobots[puzzle.target.color].x === puzzle.target.x
        && practiceRobots[puzzle.target.color].y === puzzle.target.y);
    const atRouteLimit = practiceRoute.length >= MAX_ROUTE_MOVES;

    const handleCellClick = (x: number, y: number) => {
        if (!interactive || !robots) return;
        const color = ROBOT_COLORS.find(c => robots![c].x === x && robots![c].y === y);
        if (color) setSelectedRobot(color);
    };

    const handleMove = (pos: Position) => {
        if (!selectedRobot || !interactive || practiceSolved || atRouteLimit) return;
        const color = selectedRobot;
        setPracticeRobots(prev => prev && { ...prev, [color]: { ...prev[color], ...pos } });
        setPracticeRoute(prev => [...prev, { color, pos }]);
    };

    const resetPractice = () => {
        setPracticeRobots(puzzle?.robots ?? null);
        setPracticeRoute([]);
        setSelectedRobot(null);
    };

    const nameOf = (id: string | null) => snapshot.players.find(p => p.id === id)?.name ?? 'A player';
    let banner: { text: string; optimal: boolean } | null = null;
    if (phase === 'revealed' && outcome) {
        if (shown === 'winner' && outcome.winnerId) {
            const who = outcome.winnerId === playerId ? 'You' : nameOf(outcome.winnerId);
            banner = { text: `${who} solved it in ${outcome.moves} ${outcome.moves === 1 ? 'move' : 'moves'}!`, optimal: false };
        } else if (shown === 'optimal' && outcome.solution) {
            banner = { text: `Optimal route: ${outcome.solution.length} ${outcome.solution.length === 1 ? 'move' : 'moves'}`, optimal: true };
        }
    }

    const possibleMoves = interactive && selectedRobot && robots && puzzle && !practiceSolved && !atRouteLimit
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
                        {banner && (
                            <div className={`${banner.optimal ? styles.optimalBanner : styles.solvedBanner} ${orbitron.className}`} role="status">
                                {banner.optimal ? <Sparkles size={22} /> : <CheckCircle2 size={22} />} {banner.text}
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
                localMoves={practiceRoute.length}
                localSolved={practiceSolved}
                replaying={playback.playing ? shown : null}
                onDismissNotice={lobby.dismissNotice}
                onStart={lobby.startRound}
                onSkip={lobby.skipRound}
                onLockIn={() => lobby.lockInRoute(practiceRoute)}
                onResetLocal={resetPractice}
                onShowSolution={lobby.showSolution}
                onReplay={which => playRoute(which)}
                onLeave={lobby.leaveLobby}
            />
        </main>
    );
}
