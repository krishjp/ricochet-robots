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

export const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '700', '900'], // We'll use the '900' (black) weight for a bold, factory look
});