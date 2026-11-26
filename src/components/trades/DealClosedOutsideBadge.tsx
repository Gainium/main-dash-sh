import { cn } from '@/lib/utils';
import {
  dealClosedOutside,
  PROFIT_UNKNOWN_TOOLTIP,
} from '@/lib/utils/dealClosedOutside';
import React from 'react';
import { Tooltip } from '../ui/tooltip';

/**
 * "Closed on exchange" / "Liquidated" / "Profit unknown" marker for a deal
 * whose position was closed outside the bot. Sits under the status dot, like
 * `TrailingBadge`. Renders nothing for every other deal.
 */
export const DealClosedOutsideBadge: React.FC<{
  deal: Parameters<typeof dealClosedOutside>[0];
  className?: string;
}> = ({ deal, className }) => {
  const info = dealClosedOutside(deal);
  if (!info) return null;
  return (
    <Tooltip tooltip={info.tooltip}>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-medium leading-none whitespace-nowrap',
          info.profitUnknown ? 'text-warning' : 'text-muted-foreground',
          className
        )}
        aria-label={info.tooltip}
        data-testid="deal-closed-outside-badge"
      >
        <span
          className="inline-block size-1 rounded-full bg-current"
          aria-hidden
        />
        {info.label}
      </span>
    </Tooltip>
  );
};

/**
 * Stand-in for a closed deal's profit figure when that figure is not the
 * deal's result (`profitUnknown`). Callers render it instead of the amount.
 */
export const DealProfitUnknown: React.FC<{ className?: string }> = ({
  className,
}) => (
  <Tooltip tooltip={PROFIT_UNKNOWN_TOOLTIP}>
    <span
      className={cn('text-muted-foreground', className)}
      aria-label={PROFIT_UNKNOWN_TOOLTIP}
      data-testid="deal-profit-unknown"
    >
      Unknown
    </span>
  </Tooltip>
);
