import { cn } from '@/lib/utils';
import { TrailingModeEnum } from '@/types';
import { formatNumber } from '@/utils/numberFormatter';
import React from 'react';
import { Tooltip } from '../ui/tooltip';

export interface TrailingBadgeProps {
  /** `deal.trailingMode` — the engine's armed-trailing latch. */
  mode?: string | undefined;
  /** `deal.trailingLevel` — the price the trailing exit will fire at. */
  level?: number | undefined;
  /** Quote asset, appended to the price in the tooltip. */
  quoteAsset?: string | undefined;
  className?: string;
}

/**
 * "Trailing" marker for a deal, shown under the status dot in the deals table
 * and on the deal card.
 *
 * Renders only when the bot engine has actually ARMED a trailing exit — both
 * `trailingMode` and a non-zero `trailingLevel`. Those two fields are the only
 * thing `getDealStopLossPrice` will exit on, so anything looser (a deal merely
 * *configured* for trailing, or one whose `bestPrice` has passed the trailing-TP
 * activation price) would tell the user the deal is protected when it is not.
 */
export const TrailingBadge: React.FC<TrailingBadgeProps> = ({
  mode,
  level,
  quoteAsset,
  className,
}) => {
  if (!mode || !level || level <= 0) return null;

  const isSl = mode === TrailingModeEnum.tsl;
  const label = isSl ? 'Trailing SL' : 'Trailing TP';
  const price = `${formatNumber(level)}${quoteAsset ? ` ${quoteAsset}` : ''}`;
  const tooltip = isSl
    ? `Trailing stop loss is active — the deal closes if price falls to ${price}. The level follows the best price reached.`
    : `Trailing take profit is active — the deal closes if price falls to ${price}. The level follows the best price reached.`;

  return (
    <Tooltip tooltip={tooltip}>
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-medium leading-none whitespace-nowrap',
          isSl ? 'text-loss' : 'text-profit',
          className
        )}
        aria-label={tooltip}
      >
        <span
          className="inline-block size-1 rounded-full bg-current"
          aria-hidden
        />
        {label}
      </span>
    </Tooltip>
  );
};
