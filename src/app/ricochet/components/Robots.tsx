// /app/ricochet/components/Robots.tsx
'use client';
import { Bot } from 'lucide-react';
import { Robots, RobotColor, Walls } from '../lib/types';
import { ANIMATION_DURATION_MS } from '../lib/constants';
import { posKey } from '../lib/solver';
import { styles } from '../../styles/ricochet-styles';

interface RobotsProps {
    robots: Robots;
    walls: Walls;
    selectedRobot: RobotColor | null;
    onRobotClick: (x: number, y: number) => void;
}

export default function RobotsComponent({ robots, walls, selectedRobot, onRobotClick }: RobotsProps) {
    return (
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
                    <div key={robot.color} className="absolute w-[6.25%] h-[6.25%]" style={{ transform: `translate(${robot.x * 100}%, ${robot.y * 100}%)`, transition: `transform ${ANIMATION_DURATION_MS}ms cubic-bezier(0.4, 0.2, 0, 1)` }}>
                        <div className={styles.robotContainer} style={robotContainerStyle}>
                            <Bot className={styles.robotIcon(robot.color, isSelected)} strokeWidth={1.5} onClick={() => onRobotClick(robot.x, robot.y)} style={{ pointerEvents: 'auto' }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}