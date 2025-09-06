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
        while (newPos.y > 0 && !walls[posKey(newPos)]?.north && !walls[posKey({x: newPos.x, y: newPos.y - 1})]?.south && !robotPositions.has(posKey({x: newPos.x, y: newPos.y - 1}))) {
            newPos.y--;
        }
    } else if (direction === 'south') {
        while (newPos.y < BOARD_SIZE - 1 && !walls[posKey(newPos)]?.south && !walls[posKey({x: newPos.x, y: newPos.y + 1})]?.north && !robotPositions.has(posKey({x: newPos.x, y: newPos.y + 1}))) {
            newPos.y++;
        }
    } else if (direction === 'west') {
        while (newPos.x > 0 && !walls[posKey(newPos)]?.west && !walls[posKey({x: newPos.x - 1, y: newPos.y})]?.east && !robotPositions.has(posKey({x: newPos.x - 1, y: newPos.y}))) {
            newPos.x--;
        }
    } else if (direction === 'east') {
        while (newPos.x < BOARD_SIZE - 1 && !walls[posKey(newPos)]?.east && !walls[posKey({x: newPos.x + 1, y: newPos.y})]?.west && !robotPositions.has(posKey({x: newPos.x + 1, y: newPos.y}))) {
            newPos.x++;
        }
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

const isReachable = (startRobots: Robots, walls: Walls, target: TargetChip): boolean => {
    const q: {robots: Robots}[] = [{robots: startRobots}];
    const visited = new Set<string>([JSON.stringify(Object.values(startRobots).map(p => posKey(p)).sort())]);
    let iterations = 0;

    while (q.length > 0) {
        iterations++;
        if (iterations > 15000) return false;

        const { robots: currentRobots } = q.shift()!;
        
        if (currentRobots[target.color].x === target.x && currentRobots[target.color].y === target.y) {
            return true;
        }

        for (const color of ROBOT_COLORS) {
            const directions: ('north' | 'south' | 'east' | 'west')[] = ['north', 'south', 'east', 'west'];
            for (const direction of directions) {
                const newPos = moveLogic(currentRobots[color].x, currentRobots[color].y, direction, currentRobots, walls);
                if (newPos) {
                    const nextRobots = JSON.parse(JSON.stringify(currentRobots)) as Robots;
                    nextRobots[color] = { ...nextRobots[color], ...newPos };
                    const key = JSON.stringify(Object.values(nextRobots).map(p => posKey(p)).sort());
                    if(!visited.has(key)) {
                         visited.add(key);
                         q.push({robots: nextRobots});
                    }
                }
            }
        }
    }
    return false;
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
        setSelectedRobot(null);
        setSolved(false);
        setIsAnimating(false);

        const generate = () => {
            const { robots, walls, target } = generateInitialBoardState();
            if (isReachable(robots, walls, target)) {
                setRobots(robots);
                setWalls(walls);
                setTarget(target);
                setInitialState(JSON.stringify(robots));
                setMoveCount(0);
                setLoading(false);
            } else {
                setTimeout(generate, 0);
            }
        };
        generate();
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
        }, ANIMATION_SPEED_MS + 50); // Add a small buffer to the animation speed
    }, [initialState]);
    
    const solve = useCallback(() => {
        if (!initialState || !walls || !target) return;
        
        const startRobots: Robots = JSON.parse(initialState);
        const q: { robots: Robots; path: OptimalPathStep[] }[] = [{ robots: startRobots, path: [] }];
        const visited = new Set<string>([JSON.stringify(Object.values(startRobots).map(p => posKey(p)).sort())]);
        
        while (q.length > 0) {
            const { robots: currentRobots, path } = q.shift()!;
            
            if (currentRobots[target.color].x === target.x && currentRobots[target.color].y === target.y) {
                animateSolution(path);
                return;
            }

            if (path.length > 25) continue;

            for (const color of ROBOT_COLORS) {
                 const possibleMoves = calculateMoves(currentRobots[color], currentRobots, walls);
                 for (const move of possibleMoves) {
                    const newRobots = JSON.parse(JSON.stringify(currentRobots)) as Robots;
                    newRobots[color].x = move.x;
                    newRobots[color].y = move.y;
                    
                    const stateKey = JSON.stringify(Object.values(newRobots).map(p => posKey(p)).sort());

                    if (!visited.has(stateKey)) {
                        visited.add(stateKey);
                        const newPath = [...path, { color: color, pos: move }];
                        q.push({ robots: newRobots, path: newPath });
                    }
                }
            }
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
                {/* Robots are now rendered in an overlay to allow smooth transitions across the grid */}
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
                                <div
                                    className={styles.robotContainer}
                                    style={robotContainerStyle}
                                >
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