import { GraphQLClient, getGraphQLConfig } from '@/lib/api';
import { largeAccountQueries } from '@/lib/api/GraphQLQueries-large-account';
import {
  LARGE_ACCOUNT_FORCE_KEY,
  readLocalForceOn,
  resolveLargeAccount,
  writeLocalForceOn,
  type LargeAccountServerData,
  type LargeAccountState,
} from '@/lib/largeAccount/largeAccount';
import logger from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

interface LargeAccountResponse {
  status?: string;
  reason?: string | null;
  data?: LargeAccountServerData | null;
}

// --- local force-on flag, observable across hook instances -----------------
const listeners = new Set<() => void>();
function subscribeLocal(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === LARGE_ACCOUNT_FORCE_KEY) cb();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined')
      window.removeEventListener('storage', onStorage);
  };
}
function notifyLocal() {
  listeners.forEach((l) => l());
}

export const LARGE_ACCOUNT_QUERY_KEY = 'largeAccount';

export interface UseLargeAccountResult extends LargeAccountState {
  /** Turn the mode on for this account. Users cannot turn it off. */
  turnOn: () => Promise<void>;
  isTurningOn: boolean;
}

/**
 * Large-account mode for the selected trading context.
 *
 * Reads the backend's `largeAccount` root query in its OWN request. Any
 * failure — an older backend without the field (schema rejection), a network
 * error, a NOTOK answer — resolves to mode OFF (`source: 'unsupported'`) and
 * never throws. `localStorage['gainium:large-account-force'] = 'on'` forces
 * the mode on (testing, and the fallback for "Turn on" on an older backend).
 */
export function useLargeAccount(): UseLargeAccountResult {
  const tokens = useAuthStore((s) => s.tokens);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const queryClient = useQueryClient();
  const localForceOn = useSyncExternalStore(
    subscribeLocal,
    () => readLocalForceOn(),
    () => false
  );

  const paperContext = !isLiveTrading;
  const enabled = !!tokens?.accessToken && tradingMode !== 'demo';

  const query = useQuery<LargeAccountResponse | null>({
    queryKey: [LARGE_ACCOUNT_QUERY_KEY, paperContext],
    enabled,
    // A schema rejection never heals by retrying; a flaky network is covered
    // by the next focus/mount refetch.
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const config = getGraphQLConfig(tokens, isLiveTrading);
      const client = new GraphQLClient(endpoint, config.token, paperContext);
      const gql = largeAccountQueries.largeAccount();
      try {
        const res = await client.request<{ largeAccount?: LargeAccountResponse }>(
          gql.query,
          gql.variables
        );
        return res?.largeAccount ?? null;
      } catch (e) {
        // Old backend (field unknown) or transport failure: mode off.
        logger.debug('[useLargeAccount] unavailable, treating as off', {
          message: e instanceof Error ? e.message : String(e),
        });
        return null;
      }
    },
  });

  const data =
    query.data && query.data.status === 'OK' && query.data.data
      ? query.data.data
      : null;
  const state = useMemo(
    () =>
      resolveLargeAccount({
        data,
        failed: query.isFetched && !data,
        loading: enabled && query.isLoading,
        localForceOn,
      }),
    [data, query.isFetched, query.isLoading, enabled, localForceOn]
  );

  const [isTurningOn, setTurningOn] = useState(false);
  const turnOn = useCallback(async () => {
    setTurningOn(true);
    try {
      let stored = false;
      if (data) {
        try {
          const endpoint =
            import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
          const config = getGraphQLConfig(tokens, isLiveTrading);
          const client = new GraphQLClient(endpoint, config.token, paperContext);
          const gql = largeAccountQueries.setLargeAccountMode('on');
          const res = await client.request<{
            setLargeAccountMode?: { status?: string };
          }>(gql.query, gql.variables);
          stored = res?.setLargeAccountMode?.status === 'OK';
        } catch (e) {
          logger.warn('[useLargeAccount] setLargeAccountMode failed', e);
        }
      }
      if (!stored) {
        // Backend cannot store it (older version, or refused): keep the
        // choice locally so the user still gets the mode they asked for.
        writeLocalForceOn();
        notifyLocal();
      }
      await queryClient.invalidateQueries({ queryKey: [LARGE_ACCOUNT_QUERY_KEY] });
    } finally {
      setTurningOn(false);
    }
  }, [data, tokens, isLiveTrading, paperContext, queryClient]);

  return { ...state, turnOn, isTurningOn };
}
