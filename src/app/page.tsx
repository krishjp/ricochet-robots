'use client';
import { useState, useEffect, useCallback } from 'react';
import { Target, Bot, RotateCcw, RefreshCw, Dices, ArrowRight } from 'lucide-react';

// --- TYPES AND CONSTANTS ---
const BOARD_SIZE = 16;
const ROBOT_COLORS = ["red", "blue", "green", "yellow"] as const;
type RobotColor = typeof ROBOT_COLORS[number];
type Position = { x: number; y: number };
type Robot = Position & { color: RobotColor };
type Robots = { [key in RobotColor]: Robot };
type Walls = { [key: string]: { north?: boolean; east?: boolean; south?: boolean; west?: boolean } };
// This is the corrected type. The target color must be one of the robot colors.
type TargetChip = Position & { color: RobotColor };

// --- HELPER FUNCTIONS ---
const posKey = (p: Position) => `${p.x},${p.y}`;

const generateInitialBoardState = (): { robots: Robots; walls: Walls; target: TargetChip } => {
    const walls: Walls = {};
    const center = BOARD_SIZE / 2 - 1;

    // --- WALL GENERATION ---

    // 1. Center 2x2 block walls
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

    // 2. Outer walls
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

    // 3. Random L-shaped walls
    const wallCount = 12;
    for(let i=0; i<wallCount; i++){
        let x, y;
        do {
            x = Math.floor(Math.random() * BOARD_SIZE);
            y = Math.floor(Math.random() * BOARD_SIZE);
        } while (centerPositions.has(posKey({x,y})) || walls[posKey({x,y})]);

        if (!walls[posKey({x, y})]) walls[posKey({x, y})] = {};
        const orientation = Math.floor(Math.random() * 4);
        if(orientation === 0){ // North-West corner -> wall north and west
            walls[posKey({x, y})]!.north = true;
            walls[posKey({x, y})]!.west = true;
        } else if (orientation === 1){ // North-East
            walls[posKey({x, y})]!.north = true;
            walls[posKey({x, y})]!.east = true;
        } else if (orientation === 2){ // South-West
            walls[posKey({x, y})]!.south = true;
            walls[posKey({x, y})]!.west = true;
        } else { // South-East
            walls[posKey({x, y})]!.south = true;
            walls[posKey({x, y})]!.east = true;
        }
    }

    // --- ITEM PLACEMENT ---
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


// --- GAME COMPONENT ---
export default function RicochetRobotsPage() {
    const [robots, setRobots] = useState<Robots | null>(null);
    const [walls, setWalls] = useState<Walls | null>(null);
    const [target, setTarget] = useState<TargetChip | null>(null);
    const [selectedRobot, setSelectedRobot] = useState<RobotColor | null>(null);
    const [moveCount, setMoveCount] = useState(0);
    const [optimalMoves, setOptimalMoves] = useState<string[] | null>(null);
    const [initialState, setInitialState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [solved, setSolved] = useState(false);

    const isReachable = useCallback((startRobots: Robots, walls: Walls, target: TargetChip): boolean => {
        const q: {robots: Robots}[] = [{robots: startRobots}];
        const visited = new Set<string>([JSON.stringify(Object.values(startRobots).map(p => posKey(p)).sort())]);
        let iterations = 0;

        while (q.length > 0) {
            iterations++;
            if (iterations > 5000) return false; // Safety break

            const { robots: currentRobots } = q.shift()!;
            
            if (currentRobots[target.color].x === target.x && currentRobots[target.color].y === target.y) {
                return true;
            }

            for (const color of ROBOT_COLORS) {
                const robotPositions = new Set(Object.values(currentRobots).map(posKey));

                // Move North
                let y = currentRobots[color].y;
                while (y > 0 && !walls[posKey({x: currentRobots[color].x, y})]?.north && !robotPositions.has(posKey({x: currentRobots[color].x, y: y-1}))) y--;
                if(y !== currentRobots[color].y) {
                    const nextRobots = JSON.parse(JSON.stringify(currentRobots)) as Robots;
                    nextRobots[color].y = y;
                    const key = JSON.stringify(Object.values(nextRobots).map(p => posKey(p)).sort());
                    if(!visited.has(key)) { visited.add(key); q.push({robots: nextRobots}); }
                }

                // Move South, West, East (similar logic)
                // South
                y = currentRobots[color].y;
                while (y < BOARD_SIZE - 1 && !walls[posKey({x: currentRobots[color].x, y})]?.south && !robotPositions.has(posKey({x: currentRobots[color].x, y: y+1}))) y++;
                if(y !== currentRobots[color].y) {
                    const nextRobots = JSON.parse(JSON.stringify(currentRobots)) as Robots;
                    nextRobots[color].y = y;
                    const key = JSON.stringify(Object.values(nextRobots).map(p => posKey(p)).sort());
                    if(!visited.has(key)) { visited.add(key); q.push({robots: nextRobots}); }
                }

                // West
                let x = currentRobots[color].x;
                while (x > 0 && !walls[posKey({x, y: currentRobots[color].y})]?.west && !robotPositions.has(posKey({x: x-1, y: currentRobots[color].y}))) x--;
                if(x !== currentRobots[color].x) {
                    const nextRobots = JSON.parse(JSON.stringify(currentRobots)) as Robots;
                    nextRobots[color].x = x;
                    const key = JSON.stringify(Object.values(nextRobots).map(p => posKey(p)).sort());
                    if(!visited.has(key)) { visited.add(key); q.push({robots: nextRobots}); }
                }

                // East
                x = currentRobots[color].x;
                while (x < BOARD_SIZE - 1 && !walls[posKey({x, y: currentRobots[color].y})]?.east && !robotPositions.has(posKey({x: x+1, y: currentRobots[color].y}))) x++;
                if(x !== currentRobots[color].x) {
                    const nextRobots = JSON.parse(JSON.stringify(currentRobots)) as Robots;
                    nextRobots[color].x = x;
                    const key = JSON.stringify(Object.values(nextRobots).map(p => posKey(p)).sort());
                    if(!visited.has(key)) { visited.add(key); q.push({robots: nextRobots}); }
                }
            }
        }
        return false;
    }, []);

    const setupNewGame = useCallback(() => {
        setLoading(true);
        setSelectedRobot(null);
        setOptimalMoves(null);
        setSolved(false);

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
                setTimeout(generate, 0); // Try again asynchronously
            }
        };
        generate();
    }, [isReachable]);

    useEffect(() => {
        setupNewGame();
    }, [setupNewGame]);

    const calculateMoves = (robot: Robot, currentRobots: Robots, walls: Walls): Position[] => {
        const moves: Position[] = [];
        const robotPositions = new Set(Object.values(currentRobots).filter(r => r.color !== robot.color).map(posKey));
        
        // North
        let y = robot.y;
        while (y > 0 && !walls[posKey({ x: robot.x, y })]?.north && !robotPositions.has(posKey({ x: robot.x, y: y - 1 }))) y--;
        if (y !== robot.y) moves.push({ x: robot.x, y });

        // South
        y = robot.y;
        while (y < BOARD_SIZE - 1 && !walls[posKey({ x: robot.x, y })]?.south && !robotPositions.has(posKey({ x: robot.x, y: y + 1 }))) y++;
        if (y !== robot.y) moves.push({ x: robot.x, y });

        // West
        let x = robot.x;
        while (x > 0 && !walls[posKey({ x, y: robot.y })]?.west && !robotPositions.has(posKey({ x: x - 1, y: robot.y }))) x--;
        if (x !== robot.x) moves.push({ x, y: robot.y });

        // East
        x = robot.x;
        while (x < BOARD_SIZE - 1 && !walls[posKey({ x, y: robot.y })]?.east && !robotPositions.has(posKey({ x: x + 1, y: robot.y }))) x++;
        if (x !== robot.x) moves.push({ x, y: robot.y });
        
        return moves;
    };
    
    const handleCellClick = (x: number, y: number) => {
       if (solved) return;
        const robotColor = ROBOT_COLORS.find(c => robots![c].x === x && robots![c].y === y);
        if (robotColor) {
            setSelectedRobot(robotColor);
        }
    };

    const handleMove = (pos: Position) => {
        if (!selectedRobot || !robots || !target) return;
        setRobots(prev => {
            const newRobots = { ...prev! };
            newRobots[selectedRobot] = { ...newRobots[selectedRobot], ...pos };
            
            if (newRobots[target.color]!.x === target.x && newRobots[target.color]!.y === target.y) {
                setSolved(true);
            }

            return newRobots;
        });
        setMoveCount(prev => prev + 1);
        setSelectedRobot(null);
    };

    const solve = () => {
        if (!initialState || !walls || !target) return;
        
        const startRobots: Robots = JSON.parse(initialState);
        const q: { robots: Robots; path: string[] }[] = [{ robots: startRobots, path: [] }];
        const visited = new Set<string>([JSON.stringify(Object.values(startRobots).map((p: Robot) => posKey(p)).sort())]);
        
        while (q.length > 0) {
            const { robots: currentRobots, path } = q.shift()!;
            
            if (currentRobots[target.color].x === target.x && currentRobots[target.color].y === target.y) {
                setOptimalMoves(path);
                return;
            }

            if (path.length > 25) continue; // Safety break for performance

            for (const color of ROBOT_COLORS) {
                 const possibleMoves = calculateMoves(currentRobots[color], currentRobots, walls);
                 for (const move of possibleMoves) {
                    const newRobots = JSON.parse(JSON.stringify(currentRobots)) as Robots;
                    newRobots[color].x = move.x;
                    newRobots[color].y = move.y;
                    
                    const stateKey = JSON.stringify(Object.values(newRobots).map((p: Robot) => posKey(p)).sort());

                    if (!visited.has(stateKey)) {
                        visited.add(stateKey);
                        const newPath = [...path, `${color} to ${move.x},${move.y}`];
                        q.push({ robots: newRobots, path: newPath });
                    }
                }
            }
        }
        setOptimalMoves(["Could not find a solution in a reasonable time."]);
    };
    
    const resetRound = () => {
        if (!initialState) return;
        setRobots(JSON.parse(initialState));
        setMoveCount(0);
        setSelectedRobot(null);
        setOptimalMoves(null);
        setSolved(false);
    };

    if (loading || !robots || !walls || !target) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <div className="flex flex-col items-center gap-4">
                    <Dices className="w-16 h-16 animate-spin" />
                    <p className="text-xl">Generating a solvable puzzle...</p>
                </div>
            </div>
        );
    }
    
    const possibleMoves = selectedRobot ? calculateMoves(robots[selectedRobot], robots, walls) : [];
    const colorMap = {
        red: { text: 'text-red-400', border: 'border-red-400', target: 'text-red-500' },
        blue: { text: 'text-blue-400', border: 'border-blue-400', target: 'text-blue-500' },
        green: { text: 'text-green-400', border: 'border-green-400', target: 'text-green-500' },
        yellow: { text: 'text-yellow-400', border: 'border-yellow-400', target: 'text-yellow-500' },
    };

    return (
        <main className="flex flex-col lg:flex-row items-center justify-center min-h-screen bg-gray-900 p-4 gap-8">
            <div className="grid grid-cols-16 border-2 border-cyan-400 aspect-square w-full max-w-lg lg:max-w-xl xl:max-w-2xl bg-gray-800">
                {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, i) => {
                    const x = i % BOARD_SIZE;
                    const y = Math.floor(i / BOARD_SIZE);
                    const wall = walls[posKey({ x, y })];
                    const robot = Object.values(robots).find(r => r.x === x && r.y === y);
                    const isTarget = target.x === x && target.y === y;
                    const isMoveTarget = possibleMoves.some(p => p.x === x && p.y === y);

                    let wallClasses = 'border-cyan-600/20';
                    if (wall?.north) wallClasses += ' border-t-2';
                    if (wall?.south) wallClasses += ' border-b-2';
                    if (wall?.west) wallClasses += ' border-l-2';
                    if (wall?.east) wallClasses += ' border-r-2';

                    return (
                        <div
                            key={i}
                            className={`aspect-square flex items-center justify-center relative ${wallClasses}`}
                            style={{gridColumn: x + 1, gridRow: y + 1}}
                            onClick={() => isMoveTarget ? handleMove({x,y}) : handleCellClick(x,y)}
                        >
                            {isTarget && <Target className={`w-3/4 h-3/4 ${colorMap[target.color].target}`} strokeWidth={1.5} />}
                            {robot && (
                                <Bot
                                    className={`w-full h-full p-0.5 transition-transform duration-200 ${colorMap[robot.color].text} ${selectedRobot === robot.color ? `scale-110 -translate-y-1 border-2 ${colorMap[robot.color].border} rounded-full` : ''}`}
                                    strokeWidth={1.5}
                                />
                            )}
                            {isMoveTarget && <div className="absolute w-1/3 h-1/3 bg-yellow-400/50 rounded-full cursor-pointer animate-pulse"></div>}
                        </div>
                    );
                })}
            </div>

            <div className="w-full lg:w-80 flex flex-col gap-4 text-white">
                 <h1 className="text-4xl font-bold text-cyan-300">Ricochet Robots</h1>
                <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold mb-2">Target</h2>
                    <div className="flex items-center gap-2">
                        <Target className={`w-8 h-8 ${colorMap[target.color].target}`} />
                        <Bot className={`w-8 h-8 ${colorMap[target.color].text}`} />
                         <span className='capitalize text-lg font-medium'>{target.color} Robot</span>
                    </div>
                </div>

                <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold mb-2">Game Info</h2>
                    <p className="text-lg">Moves: <span className="font-bold text-cyan-300">{moveCount}</span></p>
                    {optimalMoves && <p className="text-lg">Optimal: <span className="font-bold text-cyan-300">{optimalMoves.length}</span></p>}
                    {solved && <p className="text-2xl font-bold text-green-400 mt-2 animate-pulse">Puzzle Solved!</p>}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={resetRound} className="p-2 bg-blue-600 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"><RotateCcw size={20}/> Reset</button>
                    <button onClick={setupNewGame} className="p-2 bg-green-600 rounded-lg flex items-center justify-center gap-2 hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"><Dices size={20}/> New Game</button>
                </div>
                 <button onClick={solve} disabled={!!optimalMoves} className="p-2 bg-purple-600 rounded-lg flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-400">
                    <ArrowRight size={20}/> Show Optimal Solution
                 </button>

                 {optimalMoves && (
                    <div className="p-4 bg-gray-800 rounded-lg max-h-48 overflow-y-auto">
                        <h3 className="font-semibold mb-2">Optimal Path:</h3>
                        <ol className="list-decimal list-inside text-sm space-y-1">
                            {optimalMoves.map((move, i) => <li key={i} className="truncate">{move}</li>)}
                        </ol>
                    </div>
                 )}
            </div>
        </main>
    );
}