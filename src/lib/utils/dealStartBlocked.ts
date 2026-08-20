import type { DealStartBlock } from '@/types';

/** Absolute, not "in 2 hours" - the user usually reads this hours later. */
export const formatDealRetryAt = (ms: number) =>
  new Date(ms).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });

/**
 * One-line version of the "waiting to open" explanation, for places with no
 * room for a panel (a table cell's tooltip). Same facts in the same order as
 * `DealStartBlockedNotice`: what happened, when it retries, how wide it is.
 */
export const dealStartBlockedSummary = (block: DealStartBlock): string => {
  if (!block?.reason) {
    return '';
  }
  const parts = [
    `Waiting to open - the exchange refused the first order: ${block.reason}`,
  ];
  if (block.retryAfter && block.retryAfter > Date.now()) {
    parts.push(
      `Retrying automatically after ${formatDealRetryAt(block.retryAfter)}.`
    );
  }
  if (block.scope === 'account') {
    parts.push('This affects the whole exchange account.');
  }
  return parts.join(' ');
};
