import React from 'react';
import { Card } from '../ui/card';
import { Button } from '@/components/ui/button';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';

// A level's price is already on the pair's tick (the engine rounds it), so it
// is shown as stored: rounding to two decimals made neighbouring levels of a
// tight ladder (1.0743, 1.0742, 1.0696, …) read as the same price.
const formatLevelPrice = (price: number) =>
  price.toLocaleString('en-US', { maximumFractionDigits: 8 });

export interface SkippedDcaLevel {
  level: number;
  price: number;
  qty: number;
}

interface SkippedDcaLevelsProps {
  levels: SkippedDcaLevel[];
  onExecute: (level: SkippedDcaLevel) => void;
  disabled?: boolean;
}

/**
 * The deal's skipped ladder levels (`deal.missedLevels`): levels the price
 * moved past before they could be placed. The bot does not buy them at market
 * by itself; each one can be executed here, one at a time.
 */
export const SkippedDcaLevels: React.FC<SkippedDcaLevelsProps> = ({
  levels,
  onExecute,
  disabled = false,
}) => {
  if (!levels.length) {
    return null;
  }
  return (
    <Card className="p-md">
      <div className="flex items-center gap-xs mb-sm">
        <span className="text-sm font-medium">Skipped DCA levels</span>
        <Tooltip
          tooltip="The price moved past these levels before they could be placed (for example, the exchange refused them for balance or margin). The bot will not buy them at market by itself. Execute one to fill it at the current market price."
          side="top"
        >
          <InfoIcon />
        </Tooltip>
      </div>
      <div className="divide-y divide-border/60 text-sm">
        {levels.map((l) => (
          <div
            key={l.level}
            className="flex items-center justify-between gap-sm py-xs"
          >
            <span className="text-muted-foreground">Level {l.level}</span>
            <span className="tabular-nums">{formatLevelPrice(l.price)}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onExecute(l)}
            >
              Execute
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
};
