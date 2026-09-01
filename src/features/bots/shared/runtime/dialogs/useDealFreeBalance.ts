import { useCallback, useEffect, useRef, useState } from 'react';

import { GraphQLClient } from '@/lib/api';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export interface DealFreeBalance {
  /** Free balance per upper-cased asset. Only populated once `known`. */
  free: Record<string, number>;
  loading: boolean;
  /**
   * True once a fetch has completed. Callers must not render a balance before
   * this: an un-fetched asset and an asset the user holds none of are both 0,
   * and showing the second when it is really the first is a lie the user acts
   * on.
   */
  known: boolean;
  refresh: () => Promise<void>;
}

const EMPTY: Record<string, number> = {};

/**
 * Free exchange balances for one account, fetched on demand.
 *
 * Deliberately kept in local state instead of the shared `balanceStore`: that
 * store's `updateBalances` replaces its contents wholesale, so a single-account
 * fetch from here would evict every other account's balances from under the bot
 * form. The dialog is the only consumer, so there is nothing to gain by
 * publishing and a live regression to lose.
 */
export const useDealFreeBalance = (
  exchangeUUID: string | undefined,
  enabled: boolean
): DealFreeBalance => {
  const tokens = useAuthStore((s) => s.tokens);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const [free, setFree] = useState<Record<string, number>>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [known, setKnown] = useState(false);

  // Guards a late response from an earlier account overwriting a newer one.
  const requestRef = useRef(0);

  const fetchBalances = useCallback(async () => {
    if (!tokens?.accessToken || !exchangeUUID) return;
    const seq = ++requestRef.current;
    setLoading(true);
    try {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        !isLiveTrading
      );
      const { query, variables } = otherQueries.getBalances({
        uuid: exchangeUUID,
        shouldSumBalance: false,
      });
      const res = await client.request<{
        getBalances: {
          status: string;
          data?: Array<{ asset: string; free: string }>;
        };
      }>(query, variables);

      if (seq !== requestRef.current) return;

      if (res.getBalances?.status === 'OK' && res.getBalances.data) {
        const next: Record<string, number> = {};
        for (const b of res.getBalances.data) {
          const asset = (b.asset ?? '').toUpperCase();
          if (!asset) continue;
          next[asset] = (next[asset] ?? 0) + (parseFloat(b.free ?? '0') || 0);
        }
        setFree(next);
        setKnown(true);
      }
    } catch {
      // Leave `known` false — the field falls back to showing no ceiling
      // rather than a zero it cannot stand behind.
    } finally {
      if (seq === requestRef.current) setLoading(false);
    }
  }, [tokens?.accessToken, exchangeUUID, isLiveTrading]);

  useEffect(() => {
    if (!enabled) return;
    void fetchBalances();
  }, [enabled, fetchBalances]);

  // A different account invalidates what we hold.
  useEffect(() => {
    setFree(EMPTY);
    setKnown(false);
  }, [exchangeUUID]);

  return { free, loading, known, refresh: fetchBalances };
};
