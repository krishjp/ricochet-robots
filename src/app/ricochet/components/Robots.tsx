// /app/ricochet/components/Robots.tsx
'use client';
import { useLayoutEffect, useRef } from 'react';
import { Bot } from 'lucide-react';
import { Robots, RobotColor, Walls, Position } from '../lib/types';
import { ANIMATION_DURATION_MS, ROBOT_COLORS } from '../lib/constants';
import { posKey } from '../lib/solver';
import { styles } from '../../styles/ricochet-styles';

interface RobotsProps {
    robots: Robots;
    walls: Walls;
    selectedRobot: RobotColor | null;
    onRobotClick: (x: number, y: number) => void;
}

// Robots sit in a 16x16 grid laid over the board's grid, so the browser places each one in exactly
// the same cell box the board draws; nothing here computes pixel or percentage offsets for placement.
// Moves animate FLIP-style: the robot is laid out in its new cell right away, then slides in from
// its old cell with a transform that ends at none, so there's nothing to snap into place afterwards.
export default function RobotsComponent({ robots, walls, selectedRobot, onRobotClick }: RobotsProps) {
    const slotRefs = useRef<Partial<Record<RobotColor, HTMLDivElement | null>>>({});
    const lastPositions = useRef<Partial<Record<RobotColor, Position>>>({});

    useLayoutEffect(() => {
        for (const color of ROBOT_COLORS) {
            const el = slotRefs.current[color];
            const prev = lastPositions.current[color];
            const { x, y } = robots[color];
            lastPositions.current[color] = { x, y };
            if (!el || !prev || (prev.x === x && prev.y === y)) continue;

            // Every slot is exactly one grid cell, so its size is the cell pitch.
            const { width, height } = el.getBoundingClientRect();
            el.getAnimations().forEach(a => a.cancel());
            el.animate(
                [{ transform: `translate(${(prev.x - x) * width}px, ${(prev.y - y) * height}px)` }, { transform: 'none' }],
                { duration: ANIMATION_DURATION_MS, easing: 'cubic-bezier(0.4, 0.2, 0, 1)' },
            );
        }
    }, [robots]);

    return (
        <div className={styles.robotsOverlay}>
            {ROBOT_COLORS.map(color => {
                const robot = robots[color];
                const isSelected = selectedRobot === color;
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
                        key={color}
                        ref={el => { slotRefs.current[color] = el; }}
                        className={styles.robotSlot}
                        style={{ gridColumn: robot.x + 1, gridRow: robot.y + 1 }}
                    >
                        <div className={styles.robotContainer} style={robotContainerStyle}>
                            <Bot className={styles.robotIcon(color, isSelected)} strokeWidth={1.5} onClick={() => onRobotClick(robot.x, robot.y)} style={{ pointerEvents: 'auto' }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
