// /app/ricochet/lib/types.ts
import { Orbitron } from 'next/font/google';

export type RobotColor = "red" | "blue" | "green" | "yellow";
export type Position = { x: number; y: number };
export type Robot = Position & { color: RobotColor };
export type Robots = { [key in RobotColor]: Robot };
export type Walls = { [key: string]: { north?: boolean; east?: boolean; south?: boolean; west?: boolean } };
export type TargetChip = Position & { color: RobotColor };
export type OptimalPathStep = { color: RobotColor, pos: Position };

export type GameState = {
    robots: Robots;
    walls: Walls;
    target: TargetChip;
};

// `path` is null when no solution was found within the solver's limits.
export type SolveResult = { path: OptimalPathStep[] | null; statesExplored: number; timeMs: number };

// Messages exchanged with solver.worker.ts
export type SolverJob = { type: 'generate' } | { type: 'solve'; state: GameState };
export type SolverRequest = SolverJob & { id: number };
export type SolverResponse = { id: number; type: SolverJob['type']; state: GameState; solution: SolveResult };

export const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700', '900'], // We'll use the '900' (black) weight for a bold, factory look
});