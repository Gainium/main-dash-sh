import React from 'react';
import { cn } from '@/lib/utils';
import {
  type PendingLiveVariant,
  usePendingWaiting,
} from '@/hooks/usePendingWaiting';
import { Tooltip } from './tooltip';

// Not "stale": that word already means an old cached query
// (widgets/shared/StaleIndicator) or an old balance row
// (widgets/dashboard/StaleBalanceMarker), both of which offer a refresh.
// This marks a price or P&L figure that is not live — shown from the server's
// saved value or the previous session's price snapshot. Nothing to act on.

/**
 * Wraps a price or P&L figure that is not live: dimmed, with a tooltip saying
 * why. The tooltip reads "waiting" until the live price feed has arrived this
 * session, then "saved" (a pair the feed does not carry). Renders the
 * children untouched when not `pending`.
 */
export const PendingLiveValue: React.FC<{
  pending: boolean | undefined;
  children: React.ReactNode;
  variant?: PendingLiveVariant;
  className?: string;
}> = ({ pending, children, variant, className }) => {
  const waiting = usePendingWaiting(pending, variant);
  if (!pending) return <>{children}</>;
  return (
    <Tooltip
      tooltip={
        waiting
          ? 'Last saved value. Waiting for the live price.'
          : 'Saved value, updated every few minutes. No live price for this pair.'
      }
      triggerClassName={cn('inline-flex opacity-50', className)}
    >
      {children}
    </Tooltip>
  );
};
