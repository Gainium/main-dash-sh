import { motion } from 'framer-motion';
import React from 'react';
import { StaggerContainer, StaggerItem } from './MotionWrapper';
import { type StatBox } from './StatsBoxes';

export type MenuStatBox = Omit<StatBox, 'isLoading' | 'icon' | 'value'> & {
  icon?: React.ReactNode; // optional for backward compatibility
  // ReactNode (not just string | number) so callers can pass a loading
  // skeleton for price-dependent values (uPnL, Total PnL) while prices load.
  value: React.ReactNode;
};

export type MenuPanelStatsBoxesProps = {
  boxes: MenuStatBox[];
  className?: string;
  /** Number of columns to show (1-4). Defaults to boxes.length */
  cols?: number;
  /** Optional label/title rendered above the grid inside a rounded container */
  title?: string;
};

const MenuStatCard: React.FC<MenuStatBox> = ({
  title,
  value,
  //subtitle,
  //colorClass = 'from-blue-500 to-blue-600',
}) => {
  return (
    <div className="p-0.5 rounded-sm border border-border bg-card min-w-0 w-full overflow-hidden">
      {title && (
        <div className="text-xs text-muted-foreground truncate mb-0.5">
          {title}
        </div>
      )}
      <div className="text-sm font-semibold text-foreground truncate">
        {value}
      </div>
    </div>
  );
};

export const MenuPanelStatsBoxes: React.FC<MenuPanelStatsBoxesProps> = ({
  boxes,
  className = '',
  title,
  cols: colsProp,
}) => {
  const cols = Math.min(Math.max(colsProp ?? boxes.length, 1), 4);
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  }[cols];

  return (
    <div
      className={`rounded-container-box w-full overflow-hidden rounded-sm box-border ${className}`.trim()}
    >
      {title && (
        <h4 className="text-muted-foreground text-sm font-medium mb-1">
          {title}
        </h4>
      )}
      <div className="rounded-sm p-0.5 bg-inner-container overflow-hidden w-full box-border">
        <StaggerContainer
          className={`grid ${gridCols} gap-0.5 w-full min-w-0 box-border`}
        >
          {boxes.map((box, idx) => (
            <StaggerItem key={idx} className="min-w-0">
              <motion.div
                className="w-full"
                whileHover={{ scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <div className="w-full min-w-0">
                  <MenuStatCard {...box} />
                </div>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </div>
  );
};

export default MenuPanelStatsBoxes;
