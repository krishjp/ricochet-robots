// /app/ricochet/components/Board.tsx
'use client';
import { Target } from 'lucide-react';
import { Walls, TargetChip, Position } from '../lib/types';
import { BOARD_SIZE } from '../lib/constants';
import { posKey } from '../lib/solver';
import { styles } from '../../styles/ricochet-styles';

interface BoardProps {
    walls: Walls;
    target: TargetChip;
    possibleMoves: Position[];
    onMove: (pos: Position) => void;
    onCellClick: (x: number, y: number) => void;
}

export default function Board({ walls, target, possibleMoves, onMove, onCellClick }: BoardProps) {
    return (
        <div className={styles.boardContainer}>
            {Array.from({ length: BOARD_SIZE * BOARD_SIZE }).map((_, i) => {
                const x = i % BOARD_SIZE;
                const y = Math.floor(i / BOARD_SIZE);
                const wall = walls[posKey({ x, y })];
                const isTarget = target.x === x && target.y === y;
                const isMoveTarget = possibleMoves.some(p => p.x === x && p.y === y);
                let cellClasses = 'border-2 border-transparent border-b-slate-200 border-r-slate-200';
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
                        onClick={() => isMoveTarget ? onMove({x,y}) : onCellClick(x,y)}
                    >
                        {isTarget && <Target className={styles.target(target.color)} strokeWidth={1.5} />}
                        {isMoveTarget && <div className={styles.moveIndicator}></div>}
                    </div>
                );
            })}
        </div>
    );
}