/**
 * Removing pairs from a multi-pair bot lowers Max open deals to the number of
 * pairs left when that is smaller — the legacy dashboard behaviour
 * (main-dash `useSettingsComponent.ts`, the `field === 'pair'` branch). Adding
 * pairs never raises it, and an unlimited (<= 0) or non-numeric value is kept.
 *
 * Returns the new Max open deals, or `null` to leave it unchanged.
 */
export const maxOpenDealsAfterPairChange = (
  previousPairs: number,
  nextPairs: number,
  maxOpenDeals: string | number | undefined | null
): string | null => {
  if (nextPairs >= previousPairs || nextPairs <= 0) {
    return null;
  }
  const max = +(maxOpenDeals ?? '1');
  if (!Number.isFinite(max) || max <= 0 || nextPairs >= max) {
    return null;
  }
  return `${nextPairs}`;
};
