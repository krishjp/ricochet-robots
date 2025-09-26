// /app/ricochet/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { Dices } from 'lucide-react';

// Styles & Components
import { styles } from '../styles/ricochet-styles';
import Header from './components/Header';
import HowToPlayModal from './components/Info';
import Board from './components/Board';
import RobotsComponent from './components/Robots';
import Panel from './components/Panel';

// Logic, Types, & Constants
import { GameState, Robots, OptimalPathStep, RobotColor, Position } from './lib/types';
import { generateSolvablePuzzle } from './lib/boardGenerator';
import { encodeGameId, decodeGameId } from './lib/gameId';
import { findOptimalPath, calculateMoves } from './lib/solver';
import { ROBOT_COLORS, ANIMATION_DURATION_MS } from './lib/constants';


export default function RicochetRobotsPage() {
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [initialState, setInitialState] = useState<string | null>(null); // Storing initial robots as string
    
    const [selectedRobot, setSelectedRobot] = useState<RobotColor | null>(null);
    const [moveCount, setMoveCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [solved, setSolved] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [solveStats, setSolveStats] = useState<{ time: number; states: number } | null>(null);
    
    const [gameId, setGameId] = useState<string>('');
    const [inputId, setInputId] = useState<string>('');
    const [copied, setCopied] = useState<boolean>(false);
    const [showHelp, setShowHelp] = useState<boolean>(false);

    const setupNewGame = useCallback(() => {
        setLoading(true);
        setTimeout(() => {
            const newState = generateSolvablePuzzle();
            setGameState(newState);
            setInitialState(JSON.stringify(newState.robots));
            setGameId(encodeGameId(newState));
            setMoveCount(0);
            setSolved(false);
            setSelectedRobot(null);
            setSolveStats(null);
            setLoading(false);
        }, 10);
    }, []);

    useEffect(() => {
        setupNewGame();
    }, [setupNewGame]);

    const handleLoadGame = () => {
        const loadedState = decodeGameId(inputId);
        if (loadedState) {
            setGameState(loadedState);
            setInitialState(JSON.stringify(loadedState.robots));
            setGameId(inputId.toUpperCase());
            setMoveCount(0);
            setSolved(false);
            setSelectedRobot(null);
            setInputId('');
        } else {
            alert("Invalid DriftingDroids Game ID!");
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(gameId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
        if (!initialState || isAnimating) return;
        const initialRobots = JSON.parse(initialState);
        setGameState(prev => ({ ...prev!, robots: initialRobots }));
        setMoveCount(0);
        setSelectedRobot(null);
        setSolved(false);
        setSolveStats(null);
    };

    const animateSolution = useCallback((steps: OptimalPathStep[]) => {
        if (!steps || steps.length === 0 || !initialState) return;
        setIsAnimating(true);
        resetRound(); // Reset to start before animating

        let stepIndex = 0;
        const interval = setInterval(() => {
            if (stepIndex >= steps.length) {
                clearInterval(interval);
                setIsAnimating(false);
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
    }, [initialState]);

    const solve = useCallback(() => {
        if (!initialState || !gameState || isAnimating) return;

        const startTime = performance.now();
        const startRobots: Robots = JSON.parse(initialState);
        const { path, statesExplored } = findOptimalPath(startRobots, gameState.walls, gameState.target);
        console.log(path, statesExplored);
        const endTime = performance.now();

        if (path) animateSolution(path);

        setSolveStats({
            time: endTime - startTime,
            states: statesExplored,
        });

    }, [initialState, gameState, isAnimating, animateSolution]);

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
                            solveStats={solveStats}
                            onInputChange={setInputId}
                            onReset={resetRound}
                            onNewGame={setupNewGame}
                            onSolve={solve}
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