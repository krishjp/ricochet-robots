'use client';
import { useState, useEffect, useCallback } from 'react';
import { Target, Bot, RotateCcw, RefreshCw, Dices, ArrowRight } from 'lucide-react';
import { styles, colors, ANIMATION_SPEED_MS } from '../styles/ricochet-styles';

const BOARD_SIZE = 16;
const ROBOT_COLORS = ["red", "blue", "green", "yellow"] as const;
type RobotColor = typeof ROBOT_COLORS[number];
type Position = { x: number; y: number };
type Robot = Position & { color: RobotColor };
type Robots = { [key in RobotColor]: Robot };
type Walls = { [key: string]: { north?: boolean; east?: boolean; south?: boolean; west?: boolean } };
type TargetChip = Position & { color: RobotColor };
type OptimalPathStep = { color: RobotColor, pos: Position };
const posKey = (p: Position) => `${p.x},${p.y}`;

const moveLogic = (x: number, y: number, direction: 'north' | 'south' | 'east' | 'west', currentRobots: Robots, walls: Walls): Position | null => {
    const robotPositions = new Set(Object.values(currentRobots).map(p => posKey(p)));
    let newPos = { x, y };
    if (direction === 'north') {
        while (newPos.y > 0 && !walls[posKey(newPos)]?.north && !walls[posKey({x: newPos.x, y: newPos.y - 1})]?.south && !robotPositions.has(posKey({x: newPos.x, y: newPos.y - 1}))) newPos.y--;
    } else if (direction === 'south') {
        while (newPos.y < BOARD_SIZE - 1 && !walls[posKey(newPos)]?.south && !walls[posKey({x: newPos.x, y: newPos.y + 1})]?.north && !robotPositions.has(posKey({x: newPos.x, y: newPos.y + 1}))) newPos.y++;
    } else if (direction === 'west') {
        while (newPos.x > 0 && !walls[posKey(newPos)]?.west && !walls[posKey({x: newPos.x - 1, y: newPos.y})]?.east && !robotPositions.has(posKey({x: newPos.x - 1, y: newPos.y}))) newPos.x--;
    } else if (direction === 'east') {
        while (newPos.x < BOARD_SIZE - 1 && !walls[posKey(newPos)]?.east && !walls[posKey({x: newPos.x + 1, y: newPos.y})]?.west && !robotPositions.has(posKey({x: newPos.x + 1, y: newPos.y}))) newPos.x++;
    }
    return (newPos.x !== x || newPos.y !== y) ? newPos : null;
};
const calculateMoves = (robot: Robot, currentRobots: Robots, walls: Walls): Position[] => {
    const moves: Position[] = [];
    const directions: ('north' | 'south' | 'east' | 'west')[] = ['north', 'south', 'east', 'west'];
    for (const direction of directions) {
        const newPos = moveLogic(robot.x, robot.y, direction, currentRobots, walls);
        if(newPos) moves.push(newPos);
    }
    return moves;
};


/**
 * Pre-computes all possible "last moves" for every square.
 * For a given square, it finds all other squares from which a robot could have moved to land there.
 * This is the core of the backwards search.
 * It ignores other robots, as the backwards search from the target doesn't have robots on the board yet.
 * @returns A map where key is a position string and value is an array of positions that can move to the key.
 */
const precomputeReverseMoves = (walls: Walls): Map<string, Position[]> => {
    const reverseMoves = new Map<string, Position[]>();
    const emptyRobots = {} as Robots; // Use an empty robot set for wall-only calculations

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const currentPos = { x, y };
            const key = posKey(currentPos);
            if (!reverseMoves.has(key)) {
                reverseMoves.set(key, []);
            }
            
            const directions: ('north' | 'south' | 'east' | 'west')[] = ['north', 'south', 'east', 'west'];
            for (const dir of directions) {
                const landingPos = moveLogic(x, y, dir, emptyRobots, walls);
                if (landingPos) {
                    const landingKey = posKey(landingPos);
                    if (!reverseMoves.has(landingKey)) {
                        reverseMoves.set(landingKey, []);
                    }
                    reverseMoves.get(landingKey)!.push(currentPos);
                }
            }
        }
    }
    return reverseMoves;
};


/**
 * Performs a Breadth-First Search starting from the target square backwards.
 * It uses the pre-computed reverse moves to find the shortest path from the target to all other squares.
 * @returns A map where the key is a position string and the value is the minimum number of moves from the target.
 */
const runBackwardsBfs = (target: Position, reverseMoves: Map<string, Position[]>): Map<string, number> => {
    const distances = new Map<string, number>();
    const queue: { pos: Position; dist: number }[] = [];

    const startKey = posKey(target);
    distances.set(startKey, 0);
    queue.push({ pos: target, dist: 0 });

    while (queue.length > 0) {
        const { pos, dist } = queue.shift()!;
        const key = posKey(pos);
        
        const possibleOrigins = reverseMoves.get(key) || [];
        for (const originPos of possibleOrigins) {
            const originKey = posKey(originPos);
            if (!distances.has(originKey)) {
                distances.set(originKey, dist + 1);
                queue.push({ pos: originPos, dist: dist + 1 });
            }
        }
    }
    return distances;
};

const generateInitialBoardState = (): { robots: Robots; walls: Walls; target: TargetChip } => {
    const walls: Walls = {};
    const center = BOARD_SIZE / 2 - 1;
    const centerPositions = new Set<string>();

    for (let i = center; i <= center + 1; i++) {
        for (let j = center; j <= center + 1; j++) {
            centerPositions.add(posKey({x: i, y: j}));
            if (!walls[posKey({x: i, y: j})]) walls[posKey({x: i, y: j})] = {};
            if (i === center) walls[posKey({x: i, y: j})]!.west = true;
            if (i === center + 1) walls[posKey({x: i, y: j})]!.east = true;
            if (j === center) walls[posKey({x: i, y: j})]!.north = true;
            if (j === center + 1) walls[posKey({x: i, y: j})]!.south = true;
        }
    }

    for (let i = 0; i < BOARD_SIZE; i++) {
        if (!walls[posKey({ x: i, y: 0 })]) walls[posKey({ x: i, y: 0 })] = {};
        walls[posKey({ x: i, y: 0 })]!.north = true;
        if (!walls[posKey({ x: i, y: BOARD_SIZE - 1 })]) walls[posKey({ x: i, y: BOARD_SIZE - 1 })] = {};
        walls[posKey({ x: i, y: BOARD_SIZE - 1 })]!.south = true;
        if (!walls[posKey({ x: 0, y: i })]) walls[posKey({ x: 0, y: i })] = {};
        walls[posKey({ x: 0, y: i })]!.west = true;
        if (!walls[posKey({ x: BOARD_SIZE - 1, y: i })]) walls[posKey({ x: BOARD_SIZE - 1, y: i })] = {};
        walls[posKey({ x: BOARD_SIZE - 1, y: i })]!.east = true;
    }

    const forbiddenForWalls = new Set<string>(centerPositions);
    const centerStart = center - 1;
    for (let i = centerStart; i < centerStart + 3; i++) {
        for (let j = centerStart; j < centerStart + 3; j++) {
            forbiddenForWalls.add(posKey({x: i, y: j}));
        }
    }

    const wallCount = 20;
    let placedWalls = 0;
    let attempts = 0;
    while(placedWalls < wallCount && attempts < 1000) {
        attempts++;
        const x = Math.floor(Math.random() * BOARD_SIZE);
        const y = Math.floor(Math.random() * BOARD_SIZE);
        
        let isSpaceClear = true;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (forbiddenForWalls.has(posKey({ x: x + dx, y: y + dy }))) {
                    isSpaceClear = false;
                    break;
                }
            }
            if (!isSpaceClear) break;
        }
        
        if (isSpaceClear) {
            const key = posKey({x,y});
            if (!walls[key]) walls[key] = {};
            const orientation = Math.floor(Math.random() * 4);
            if (orientation === 0) { walls[key]!.north = true; walls[key]!.west = true; }
            else if (orientation === 1) { walls[key]!.north = true; walls[key]!.east = true; }
            else if (orientation === 2) { walls[key]!.south = true; walls[key]!.west = true; }
            else { walls[key]!.south = true; walls[key]!.east = true; }

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    forbiddenForWalls.add(posKey({ x: x + dx, y: y + dy }));
                }
            }
            placedWalls++;
        }
    }

    const occupied = new Set<string>();
    const placeItem = (): Position => {
        let pos;
        do {
            pos = {
                x: Math.floor(Math.random() * BOARD_SIZE),
                y: Math.floor(Math.random() * BOARD_SIZE),
            };
        } while (occupied.has(posKey(pos)) || centerPositions.has(posKey(pos)));
        occupied.add(posKey(pos));
        return pos;
    };

    const robots: Robots = {} as Robots;
    ROBOT_COLORS.forEach(color => {
        const { x, y } = placeItem();
        robots[color] = { x, y, color };
    });
    const targetPos = placeItem();
    const targetColor = ROBOT_COLORS[Math.floor(Math.random() * ROBOT_COLORS.length)];
    const target: TargetChip = { ...targetPos, color: targetColor };
    
    return { robots, walls, target };
};

export default function RicochetRobotsPage() {
    const [robots, setRobots] = useState<Robots | null>(null);
    const [walls, setWalls] = useState<Walls | null>(null);
    const [target, setTarget] = useState<TargetChip | null>(null);
    const [selectedRobot, setSelectedRobot] = useState<RobotColor | null>(null);
    const [moveCount, setMoveCount] = useState(0);
    const [initialState, setInitialState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [solved, setSolved] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    const setupNewGame = useCallback(() => {
        setLoading(true);
        setSolved(false);
        setIsAnimating(false);
        setSelectedRobot(null);

        setTimeout(() => {
            let foundPuzzle = false;
            while (!foundPuzzle) {
                const { robots, walls, target } = generateInitialBoardState();
                
                const reverseMoves = precomputeReverseMoves(walls);

                const targetDistances = runBackwardsBfs(target, reverseMoves);

                const q: { robots: Robots; path: OptimalPathStep[] }[] = [{ robots: robots, path: [] }];
                const visited = new Set<string>([JSON.stringify(Object.values(robots).map(p => posKey(p)).sort())]);
                let optimalLength: number | null = null;
    
                while(q.length > 0) {
                    const { robots: currentRobots, path } = q.shift()!;
                    const targetRobotPos = posKey(currentRobots[target.color]);
                    const movesFromTarget = targetDistances.get(targetRobotPos);

                    if (movesFromTarget !== undefined) {
                        const totalMoves = path.length + movesFromTarget;
                        if(optimalLength === null || totalMoves < optimalLength) {
                            optimalLength = totalMoves;
                        }
                    }

                    if (path.length >= 5 || (optimalLength !== null && path.length >= optimalLength)) {
                        continue;
                    }

                    for (const color of ROBOT_COLORS) {
                        const possibleMoves = calculateMoves(currentRobots[color], currentRobots, walls);
                        for (const move of possibleMoves) {
                            const newRobots = structuredClone(currentRobots);
                            newRobots[color] = { ...newRobots[color], ...move };
                            const stateKey = JSON.stringify(Object.values(newRobots).map(p => posKey(p)).sort());

                            if (!visited.has(stateKey)) {
                                visited.add(stateKey);
                                const newPath = [...path, { color: color, pos: move }];
                                q.push({ robots: newRobots, path: newPath });
                            }
                        }
                    }
                }

                if (optimalLength !== null && optimalLength >= 4 && optimalLength <= 12) {
                    setRobots(robots);
                    setWalls(walls);
                    setTarget(target);
                    setInitialState(JSON.stringify(robots));
                    setMoveCount(0);
                    setLoading(false);
                    foundPuzzle = true;
                }
            }
        }, 10); // 10ms timeout
    }, []);

    useEffect(() => {
        setupNewGame();
    }, [setupNewGame]);
    

    const handleCellClick = (x: number, y: number) => {
       if (solved || isAnimating) return;
        const robotColor = ROBOT_COLORS.find(c => robots![c].x === x && robots![c].y === y);
        if (robotColor) {
            setSelectedRobot(robotColor);
        }
    };

    const handleMove = (pos: Position) => {
        if (!selectedRobot || !robots || !target || isAnimating) return;
        setRobots(prev => {
            const newRobots = { ...prev! };
            newRobots[selectedRobot] = { ...newRobots[selectedRobot], ...pos };
            
            if (newRobots[target.color]!.x === target.x && newRobots[target.color]!.y === target.y) {
                setSolved(true);
                setSelectedRobot(null);
            }
            return newRobots;
        });
        setMoveCount(prev => prev + 1);
    };
    
    const animateSolution = useCallback((steps: OptimalPathStep[]) => {
        if (!steps || steps.length === 0) return;
        
        setIsAnimating(true);
        setRobots(JSON.parse(initialState!));
        setMoveCount(0);
        setSelectedRobot(null);
        setSolved(false);

        let stepIndex = 0;
        const interval = setInterval(() => {
            if (stepIndex >= steps.length) {
                clearInterval(interval);
                setIsAnimating(false);
                setSolved(true);
                return;
            }

            const move = steps[stepIndex];
            setRobots(prev => {
                const newRobots = { ...prev! };
                newRobots[move.color] = { ...newRobots[move.color], ...move.pos };
                return newRobots;
            });
            setMoveCount(prev => prev + 1);
            stepIndex++;
        }, ANIMATION_SPEED_MS + 50);
    }, [initialState]);
    
    const solve = useCallback(() => {
        if (!initialState || !walls || !target || isAnimating) return;

        const startRobots: Robots = JSON.parse(initialState);
        const reverseMoves = precomputeReverseMoves(walls);
        const targetDistances = runBackwardsBfs(target, reverseMoves);

        const q: { robots: Robots; path: OptimalPathStep[] }[] = [{ robots: startRobots, path: [] }];
        const visited = new Set<string>([JSON.stringify(Object.values(startRobots).map(p => posKey(p)).sort())]);
        
        let bestPath: OptimalPathStep[] | null = null;
        let bestLength = Infinity;

        while (q.length > 0) {
            const { robots, path } = q.shift()!; // 'robots' here is the current state (the meeting point)
            
            const targetRobotPosKey = posKey(robots[target.color]);
            const movesFromTarget = targetDistances.get(targetRobotPosKey);

            if (movesFromTarget !== undefined) {
                const totalLength = path.length + movesFromTarget;
                if (totalLength < bestLength) {
                    bestLength = totalLength;

                    let backwardPath: OptimalPathStep[] = [];
                    let pathTracePos: Robot = robots[target.color];
                    let currentRobotsInTrace = robots;
                    let currentDist = movesFromTarget;

                    while (currentDist > 0) {
                        const moves = calculateMoves({ ...pathTracePos, color: target.color }, currentRobotsInTrace, walls);
                        
                        const nextStep = moves.find(move => targetDistances.get(posKey(move)) === currentDist - 1);

                        if (nextStep) {
                            backwardPath.push({ color: target.color, pos: nextStep });
                            
                            const nextRobots = structuredClone(currentRobotsInTrace);
                            nextRobots[target.color] = { ...nextRobots[target.color], ...nextStep };
                            currentRobotsInTrace = nextRobots;
                            pathTracePos = { ...nextStep, color: target.color };
                            currentDist--;
                        } else {
                            break;
                        }
                    }
                    bestPath = [...path, ...backwardPath];
                }
            }
            
            if (path.length + 1 >= bestLength) continue;

            for (const color of ROBOT_COLORS) {
                const possibleMoves = calculateMoves(robots[color], robots, walls);
                for (const move of possibleMoves) {
                    const newRobots = structuredClone(robots);
                    newRobots[color] = { ...newRobots[color], ...move };
                    const stateKey = JSON.stringify(Object.values(newRobots).map(p => posKey(p)).sort());

                    if (!visited.has(stateKey)) {
                        visited.add(stateKey);
                        q.push({ robots: newRobots, path: [...path, { color: color, pos: move }] });
                    }
                }
            }
        }
        
        if (bestPath) {
            animateSolution(bestPath);
        }
    }, [initialState, walls, target, animateSolution]);
    
    const resetRound = () => {
        if (!initialState || isAnimating) return;
        setRobots(JSON.parse(initialState));
        setMoveCount(0);
        setSelectedRobot(null);
        setSolved(false);
    };

    const handleBackgroundClick = (e: React.MouseEvent<HTMLElement>) => {
        if (e.target === e.currentTarget) {
            setSelectedRobot(null);
        }
    };


    if (loading || !robots || !walls || !target) {
        return (
            <div className={styles.loadingContainer}>
                <div className="flex flex-col items-center gap-4">
                    <Dices className={styles.loadingSpinner} />
                    <p className="text-xl">Generating a solvable puzzle...</p>
                </div>
            </div>
        );
    }
    
    const possibleMoves = selectedRobot ? calculateMoves(robots[selectedRobot], robots, walls) : [];
    
    return (
        <main className={styles.mainContainer} onClick={handleBackgroundClick}>
            <div className="relative w-full max-w-lg lg:max-w-xl xl:max-w-2xl aspect-square">
                <div className={styles.boardContainer}>
                    {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, i) => {
                        const x = i % BOARD_SIZE;
                        const y = Math.floor(i / BOARD_SIZE);
                        const wall = walls[posKey({ x, y })];
                        const isTarget = target.x === x && target.y === y;
                        const isMoveTarget = possibleMoves.some(p => p.x === x && p.y === y);

                        let cellClasses = 'border-2 border-transparent';
                        cellClasses += ' border-b-slate-200 border-r-slate-200';
                        if (x === 0) cellClasses += ' border-l-slate-200';
                        if (y === 0) cellClasses += ' border-t-slate-200';
                        if (wall?.north) cellClasses += ' !border-t-slate-800';
                        if (wall?.south) cellClasses += ' !border-b-slate-800';
                        if (wall?.west) cellClasses += ' !border-l-slate-800';
                        if (wall?.east) cellClasses += ' !border-r-slate-800';

                        return (
                            <div
                                key={`cell-${i}`}
                                className={`${styles.cell} ${cellClasses}`}
                                style={{gridColumn: x + 1, gridRow: y + 1}}
                                onClick={() => isMoveTarget ? handleMove({x,y}) : handleCellClick(x,y)}
                            >
                                {isTarget && <Target className={styles.target(target.color)} strokeWidth={1.5} />}
                                {isMoveTarget && <div className={styles.moveIndicator}></div>}
                            </div>
                        );
                    })}
                </div>
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                     {Object.values(robots).map(robot => {
                        const isSelected = selectedRobot === robot.color;
                        const robotWall = walls[posKey(robot)];
                        const baseInset = '10%'; 
                        const wallInset = '12%'; 
                        const robotContainerStyle = {
                            top: robotWall?.north ? wallInset : baseInset,
                            bottom: robotWall?.south ? wallInset : baseInset,
                            left: robotWall?.west ? wallInset : baseInset,
                            right: robotWall?.east ? wallInset : baseInset,
                        };
                        return (
                            <div
                                key={robot.color}
                                className="absolute w-[6.25%] h-[6.25%]" // 100% / 16 cells = 6.25%
                                style={{
                                    transform: `translate(${robot.x * 100}%, ${robot.y * 100}%)`,
                                    transition: `transform ${ANIMATION_SPEED_MS}ms cubic-bezier(0.4, 0.2, 0, 1)`,
                                }}
                            >
                                <div className={styles.robotContainer} style={robotContainerStyle}>
                                    <Bot
                                        className={styles.robotIcon(robot.color, isSelected)}
                                        strokeWidth={1.5}
                                        onClick={() => handleCellClick(robot.x, robot.y)}
                                        style={{ pointerEvents: 'auto' }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className={styles.panelContainer}>
                 <h1 className="text-4xl font-bold text-slate-700">Ricochet Robots</h1>
                <div className={styles.panelCard}>
                    <h2 className={styles.panelTitle}>Target</h2>
                    <div className="flex items-center gap-2">
                        <Target className={`w-8 h-8 ${colors[target.color].target}`} />
                        <Bot className={`w-8 h-8 ${colors[target.color].text}`} />
                        <span className='capitalize text-lg font-medium'>{target.color} Robot</span>
                    </div>
                </div>
                <div className={styles.panelCard}>
                    <h2 className={styles.panelTitle}>Game Info</h2>
                    <p className="text-lg">Moves: <span className="font-bold text-slate-600">{moveCount}</span></p>
                    {solved && !isAnimating && <p className="text-2xl font-bold text-green-600 mt-2 animate-pulse">Puzzle Solved!</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={resetRound} disabled={isAnimating} className={`${styles.buttonBase} ${styles.buttonBlue}`}><RotateCcw size={20}/> Reset</button>
                    <button onClick={setupNewGame} disabled={isAnimating} className={`${styles.buttonBase} ${styles.buttonGreen}`}><Dices size={20}/> New Game</button>
                </div>
                 <button onClick={solve} disabled={isAnimating} className={`${styles.buttonBase} ${styles.buttonPurple}`}>
                    <ArrowRight size={20}/> Show Optimal Solution
                 </button>
            </div>
        </main>
    );
}