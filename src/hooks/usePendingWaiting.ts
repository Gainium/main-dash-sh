import { usePricesLive } from './useLatestPrices';

/** See `PendingLiveValue` (components/ui/pending-live-value). */
export type PendingLiveVariant = 'auto' | 'waiting' | 'saved';

/** Whether a not-live figure is still waiting for the feed (dim it) or saved. */
export const usePendingWaiting = (
  pending: boolean | undefined,
  variant: PendingLiveVariant = 'auto'
): boolean => {
  const pricesLive = usePricesLive(!!pending && variant === 'auto');
  if (!pending) return false;
  return variant === 'waiting' || (variant === 'auto' && !pricesLive);
};
