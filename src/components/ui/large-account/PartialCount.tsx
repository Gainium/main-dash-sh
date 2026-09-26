import { Layers } from 'lucide-react';
import React from 'react';
import {
  formatCount,
  partialCountTooltip,
} from '../../../lib/largeAccount/largeAccount';
import { cn } from '../../../lib/utils';
import { Tooltip } from '../tooltip';

export interface PartialCountProps {
  /** How many items the value / list is built from. */
  shown: number;
  /** How many exist on the server. */
  total: number;
  /** What is being counted, for the tooltip ("bots", "open deals"). */
  noun?: string;
  /** Tooltip override. Defaults to a sentence built from shown/total/noun. */
  tooltip?: string;
  className?: string;
}

/**
 * A subset marker: "500 of 1,497". Rendered next to a list or a number built
 * from a partial set, so a subset never reads as the whole. Renders nothing
 * when the set is complete.
 */
export const PartialCount: React.FC<PartialCountProps> = ({
  shown,
  total,
  noun = 'items',
  tooltip,
  className,
}) => {
  if (!Number.isFinite(total) || !Number.isFinite(shown) || shown >= total) {
    return null;
  }
  return (
    <Tooltip
      tooltip={tooltip ?? partialCountTooltip(shown, total, noun)}
      side="top"
      delay={150}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium leading-none text-info whitespace-nowrap cursor-help tabular-nums',
          className
        )}
        data-testid="partial-count"
      >
        <Layers className="h-3 w-3" aria-hidden="true" />
        {formatCount(shown)} of {formatCount(total)}
      </span>
    </Tooltip>
  );
};

export default PartialCount;
