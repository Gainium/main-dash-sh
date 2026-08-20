import React from 'react';
import { Clock, PauseCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { formatDealRetryAt } from '@/lib/utils/dealStartBlocked';
import type { DealStartBlock } from '@/types';

/**
 * Explains a deal that exists but has never opened.
 *
 * A deal row is created BEFORE its opening order reaches the exchange, so when
 * the venue refuses that order the deal sits there with no orders and - before
 * this existed - no explanation. The engine does raise a bot-level warning, but
 * it lands in the notification bell without naming the deal or the symbol and
 * is coalesced across hours, so a user looking at the stuck deal has nothing
 * connecting the two. An account-wide Binance Quantitative Rules restriction
 * stalled several of one account's deals this way, and the exchange's own order
 * history could not explain it either - the orders were never sent, so nothing
 * about them was ever recorded there.
 *
 * Deliberately information, not an alarm. Most of these clear themselves: a
 * Quantitative Rules cooldown lifts on a schedule and the engine re-sends the
 * order on its own. The bot is not in error and the deal has not failed, and
 * this must not suggest otherwise.
 */
export const DealStartBlockedNotice: React.FC<{
  startBlocked?: DealStartBlock;
  /** `compact` fits inside a card; `full` is for a detail pane. */
  variant?: 'compact' | 'full';
  className?: string;
}> = ({ startBlocked, variant = 'compact', className }) => {
  if (!startBlocked?.reason) {
    return null;
  }

  const { reason, retryAfter, attempts, scope, level } = startBlocked;
  const retriesAt =
    retryAfter && retryAfter > Date.now()
      ? formatDealRetryAt(retryAfter)
      : null;

  // Scope and level are the venue's own words for how wide the restriction is.
  // "account" is the difference between one symbol being unavailable and none
  // of the user's bots being able to open anything - which is exactly the
  // question they are asking.
  const detail = [
    scope === 'account' ? 'affects the whole exchange account' : null,
    level ? `level ${level}` : null,
    attempts && attempts > 1 ? `${attempts} attempts` : null,
  ].filter(Boolean);

  return (
    <Alert
      className={cn(
        'border-amber-500/40 bg-amber-500/5 text-foreground',
        variant === 'compact' && 'p-2 md:p-2.5',
        className
      )}
      data-testid="deal-start-blocked"
    >
      <PauseCircle className="size-4 text-amber-500" />
      <AlertTitle className="text-sm text-amber-600 dark:text-amber-400">
        Waiting to open - the exchange refused the first order
      </AlertTitle>
      <AlertDescription
        className={cn(
          'text-muted-foreground',
          variant === 'compact' && 'text-xs'
        )}
      >
        <p>{reason}</p>
        {retriesAt && (
          <p className="mt-1 flex items-center gap-1">
            <Clock className="size-3" />
            Retrying automatically after {retriesAt}
          </p>
        )}
        {detail.length > 0 && (
          <p className="mt-1 opacity-80">{detail.join(' · ')}</p>
        )}
        {/* The one thing that is NOT wrong here, said plainly - the deal looks
            broken and it is not. */}
        <p className="mt-1 opacity-80">
          The deal stays open and starts on its own once the exchange accepts
          the order.
        </p>
      </AlertDescription>
    </Alert>
  );
};

export default DealStartBlockedNotice;
