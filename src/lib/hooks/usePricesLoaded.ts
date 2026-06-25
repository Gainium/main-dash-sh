import { useEffect, useState } from 'react';
import getLatestPrices, { getLocalPrices } from '../../helper/price';
import type { GetLatestPricesResult } from '../../types';

/**
 * Returns `true` once live market prices are available — either already cached
 * in memory or after the first successful fetch/IndexedDB callback.
 *
 * Price-dependent values (unrealized P&L, current value, money in positions,
 * net P&L, …) are computed client-side from the latest-prices feed. Until that
 * feed arrives they fall back to a stale/zero value, which reads as a real
 * "0" to the user. Components use this flag to render a loading skeleton in
 * that window instead — legacy parity with main-dash's per-row `loadedPrices`.
 *
 * On a warm in-memory cache this is `true` synchronously on mount, so there's
 * no skeleton flash when navigating between pages within a session.
 */
export function usePricesLoaded(): boolean {
  const [loaded, setLoaded] = useState(() => getLocalPrices().length > 0);

  useEffect(() => {
    if (loaded) {
      return;
    }
    const unsubscribe = getLatestPrices((result: GetLatestPricesResult) => {
      if (result.status === 'OK' && result.data && result.data.length > 0) {
        setLoaded(true);
      }
    }, false);
    return () => unsubscribe();
  }, [loaded]);

  return loaded;
}

export default usePricesLoaded;
