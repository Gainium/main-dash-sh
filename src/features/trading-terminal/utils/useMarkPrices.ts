import { useEffect, useMemo, useRef, useState } from 'react';

import getLatestPrices, { getLocalPrices } from '@/helper/price';
import type { Prices } from '@/types';

const PRICE_UPDATE_THROTTLE_MS = 10_000;

/**
 * Live ticker prices, keyed `${exchange}|${pair}`, for the Trading Terminal's
 * raw exchange positions. Mirrors the subscription + throttle gate the bot
 * list pages use (`useHedgeUnPnlMap`), so the terminal doesn't open a second
 * kind of price feed.
 *
 * Returns a lookup rather than the array so callers can't accidentally do an
 * O(n) scan per row per render.
 */
export function useMarkPrices(enabled = true) {
  const [prices, setPrices] = useState<Prices>(() => getLocalPrices());
  const lastUpdateRef = useRef(0);
  const lastAcceptedLengthRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = getLatestPrices((result) => {
      if (result.status !== 'OK' || !result.data) return;
      const now = Date.now();
      // Accept immediately while our snapshot is empty or materially smaller
      // than the incoming one, so the first real tickers payload lands without
      // waiting out the throttle; steady-state updates are throttled.
      const bypassThrottle =
        result.data.length > 0 &&
        (lastAcceptedLengthRef.current === 0 ||
          result.data.length > lastAcceptedLengthRef.current * 1.1);
      if (bypassThrottle || now - lastUpdateRef.current > PRICE_UPDATE_THROTTLE_MS) {
        setPrices(result.data);
        lastUpdateRef.current = now;
        lastAcceptedLengthRef.current = result.data.length;
      }
    }, false);
    return () => {
      unsubscribe();
    };
  }, [enabled]);

  return useMemo(() => {
    const byKey = new Map<string, number>();
    for (const p of prices) {
      if (p.price > 0) byKey.set(`${p.exchange}|${p.symbol}`, p.price);
    }
    return (position: { exchange: string; symbol: string }) =>
      byKey.get(`${position.exchange}|${position.symbol}`);
  }, [prices]);
}
