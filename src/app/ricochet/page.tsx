// /app/ricochet/page.tsx
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Dices } from 'lucide-react';

// Styles & Components
import { styles } from '../styles/ricochet-styles';
import Header from './components/Header';
import HowToPlayModal from './components/Info';
import Board from './components/Board';
import RobotsComponent from './components/Robots';
import Panel from './components/Panel';

// Logic, Types, & Constants
import { GameState, Robots, OptimalPathStep, RobotColor, Position, SolveResult, SolverResponse } from './lib/types';
import { encodeGameId, decodeGameId } from './lib/gameId';
import { calculateMoves } from './lib/solver';
import { useSolverWorker } from './lib/useSolverWorker';
import { ROBOT_COLORS, ANIMATION_DURATION_MS } from './lib/constants';


export default function RicochetRobotsPage() {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [initialRobots, setInitialRobots] = useState<Robots | null>(null);

    const [selectedRobot, setSelectedRobot] = useState<RobotColor | null>(null);
    const [moveCount, setMoveCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [solved, setSolved] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    // Computed in the background as soon as a game starts; null while the worker is still solving.
    const [solution, setSolution] = useState<SolveResult | null>(null);
    const [solutionShown, setSolutionShown] = useState(false);

    const [gameId, setGameId] = useState<string>('');
    const [inputId, setInputId] = useState<string>('');
    const [copied, setCopied] = useState<boolean>(false);
    const [showHelp, setShowHelp] = useState<boolean>(false);

    const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopAnimation = useCallback(() => {
        if (animationRef.current) clearInterval(animationRef.current);
        animationRef.current = null;
        setIsAnimating(false);
    }, []);

    useEffect(() => stopAnimation, [stopAnimation]);

    const startGame = useCallback((state: GameState) => {
        stopAnimation();
        setGameState(state);
        setInitialRobots(state.robots);
        setGameId(encodeGameId(state));
        setMoveCount(0);
        setSolved(false);
        setSelectedRobot(null);
        setSolutionShown(false);
    }, [stopAnimation]);

    const handleWorkerResult = useCallback((response: SolverResponse) => {
        if (response.type === 'generate') {
            startGame(response.state);
            setLoading(false);
        }
        setSolution(response.solution);
    }, [startGame]);

    const runSolverJob = useSolverWorker(handleWorkerResult);

    const setupNewGame = useCallback(() => {
        setLoading(true);
        setSolution(null);
        runSolverJob({ type: 'generate' });
    }, [runSolverJob]);

    useEffect(() => {
        setupNewGame();
    }, [setupNewGame]);

    const handleLoadGame = () => {
        if (isAnimating) return;
        const loadedState = decodeGameId(inputId);
        if (loadedState) {
            startGame(loadedState);
            setInputId('');
            setSolution(null);
            runSolverJob({ type: 'solve', state: loadedState });
        } else {
            alert("Invalid DriftingDroids Game ID!");
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(gameId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard API is unavailable outside secure contexts or when permission is denied;
            // the ID stays visible in the read-only field for manual copying.
        }
    };

    const handleCellClick = (x: number, y: number) => {
        if (solved || isAnimating) return;
        const robotColor = ROBOT_COLORS.find(c => gameState!.robots[c].x === x && gameState!.robots[c].y === y);
        if (robotColor) {
            setSelectedRobot(robotColor);
        }
    };

    const handleMove = (pos: Position) => {
        if (!selectedRobot || !gameState || isAnimating) return;

        const newRobots = { ...gameState.robots };
        newRobots[selectedRobot] = { ...newRobots[selectedRobot], ...pos };

        setGameState(prev => ({ ...prev!, robots: newRobots }));
        setMoveCount(prev => prev + 1);

        if (newRobots[gameState.target.color]!.x === gameState.target.x && newRobots[gameState.target.color]!.y === gameState.target.y) {
            setSolved(true);
            setSelectedRobot(null);
        }
    };

    const resetRound = () => {
        if (!initialRobots || isAnimating) return;
        setGameState(prev => ({ ...prev!, robots: initialRobots }));
        setMoveCount(0);
        setSelectedRobot(null);
        setSolved(false);
        setSolutionShown(false);
    };

    const animateSolution = (steps: OptimalPathStep[]) => {
        if (!initialRobots) return;
        stopAnimation();
        // Return to the starting position before playing the solution
        setGameState(prev => ({ ...prev!, robots: initialRobots }));
        setMoveCount(0);
        setSelectedRobot(null);
        setSolved(false);
        setIsAnimating(true);

        let stepIndex = 0;
        animationRef.current = setInterval(() => {
            if (stepIndex >= steps.length) {
                stopAnimation();
                setSolved(true);
                return;
            }
            const move = steps[stepIndex];
            setGameState(prev => {
                const newRobots = { ...prev!.robots };
                newRobots[move.color] = { ...newRobots[move.color], ...move.pos };
                return { ...prev!, robots: newRobots };
            });
            setMoveCount(prev => prev + 1);
            stepIndex++;
        }, ANIMATION_DURATION_MS + 50);
    };

    const showSolution = () => {
        if (!solution?.path || isAnimating) return;
        setSolutionShown(true);
        animateSolution(solution.path);
    };

    return (
    <>
        <Header onShowHelp={() => setShowHelp(true)} />

        {loading || !gameState ? (
            <main className={styles.loadingContainer}>
                <div className="flex flex-row items-center gap-4">
                    <Dices className={styles.loadingSpinner} />
                    <p className="text-xl">Generating a solvable puzzle...</p>
                </div>
            </main>
        ) : (
            (() => {
                const possibleMoves = selectedRobot
                    ? calculateMoves(gameState.robots[selectedRobot], gameState.robots, gameState.walls)
                    : [];
                const solverStatus = !solution ? 'solving' : solution.path ? 'ready' : 'unsolvable';

                return (
                    <main className={styles.mainContainer} onClick={(e) => { if (e.target === e.currentTarget) setSelectedRobot(null); }}>
                        <div className="relative w-full max-w-lg lg:max-w-xl xl:max-w-2xl aspect-square">
                            <Board
                                walls={gameState.walls}
                                target={gameState.target}
                                possibleMoves={possibleMoves}
                                onMove={handleMove}
                                onCellClick={handleCellClick}
                            />
                            <RobotsComponent
                                robots={gameState.robots}
                                walls={gameState.walls}
                                selectedRobot={selectedRobot}
                                onRobotClick={handleCellClick}
                            />
                        </div>
                        <Panel
                            target={gameState.target}
                            moveCount={moveCount}
                            solved={solved}
                            isAnimating={isAnimating}
                            gameId={gameId}
                            inputId={inputId}
                            copied={copied}
                            solverStatus={solverStatus}
                            solveStats={solutionShown && solution ? { time: solution.timeMs, states: solution.statesExplored } : null}
                            onInputChange={setInputId}
                            onReset={resetRound}
                            onNewGame={setupNewGame}
                            onSolve={showSolution}
                            onCopy={handleCopy}
                            onLoadGame={handleLoadGame}
                        />
                    </main>
                );
            })()
        )}

        {showHelp && <HowToPlayModal onClose={() => setShowHelp(false)} />}
    </>
    )
};
