import {
  GraphQLClient,
  GraphQlQuery,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  buildCurrencies,
  getCurrencyInfo,
  type Currency,
  type FiatRate,
} from '@/utils/currencyUtils';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

// The backend refreshes fiat rates twice a day; an hour keeps a long-open tab
// reasonably current without a request per widget mount.
const TTL_MS = 60 * 60 * 1000;

// Module-level cache shared by every widget that shows a currency selector,
// so the portfolio page makes one request, not one per card.
let rates: FiatRate[] = [];
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => rates;

const loadFiatRates = (accessToken: string, paperContext: boolean) => {
  if (inFlight || Date.now() - fetchedAt < TTL_MS) return;
  inFlight = (async () => {
    try {
      const { query } = GraphQlQuery.getFiatRates();
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint, accessToken, paperContext);
      const resp = await client.request<{
        getFiatRates: ReturnResult<FiatRate[]>;
      }>(query, undefined, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });
      if (
        resp?.getFiatRates?.status === 'OK' &&
        Array.isArray(resp.getFiatRates.data)
      ) {
        rates = resp.getFiatRates.data;
        listeners.forEach((l) => l());
      }
    } catch (error) {
      // An older backend has no `getFiatRates`; the selectors then offer USD
      // only, which is correct rather than converted at a made-up rate.
      logger.warn('[useFiatCurrencies] Fiat rates unavailable', error);
    } finally {
      // Stamp failures too, so a backend without the query isn't retried on
      // every mount.
      fetchedAt = Date.now();
      inFlight = null;
    }
  })();
};

/**
 * The currencies a display-currency selector may offer — USD plus each fiat
 * with a live rate — and a lookup that falls back to USD.
 */
export function useFiatCurrencies(): {
  currencies: Currency[];
  rates: FiatRate[];
  getCurrencyInfo: (code: string) => Currency;
} {
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (accessToken) loadFiatRates(accessToken, !isLiveTrading);
  }, [accessToken, isLiveTrading]);

  const currencies = useMemo(() => buildCurrencies(snapshot), [snapshot]);
  const lookup = useCallback(
    (code: string) => getCurrencyInfo(code, currencies),
    [currencies]
  );
  return { currencies, rates: snapshot, getCurrencyInfo: lookup };
}
