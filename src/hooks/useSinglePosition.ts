// React bindings for single position per pair. The reads live in
// `@/lib/singlePosition/singlePositionApi` (see its header for why the new
// fields travel in their own documents rather than the shared fragments).
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { GraphQLClient, getGraphQLConfig } from '@/lib/api';
import {
  fetchBotOpenDeals,
  fetchPositionEntriesIndex,
  fetchSinglePositionSettings,
  type BotSinglePositionSettings,
  type OpenDealForPreview,
  type PositionEntriesInfo,
  type SinglePositionBackend,
} from '@/lib/singlePosition/singlePositionApi';
import {
  findPositionDeal,
  formatPositionEntries,
  positionUsageRing,
  type BotPositionEntries,
} from '@/lib/singlePosition/singlePosition';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

const endpoint = () =>
  import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';

/** A client for the current live/paper context, built at call time. */
export function useSinglePositionClient() {
  const tokens = useAuthStore((s) => s.tokens);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const paperContext = !isLiveTrading;
  const enabled = !!tokens?.accessToken && tradingMode !== 'demo';
  const make = useCallback(() => {
    const config = getGraphQLConfig(tokens, isLiveTrading);
    return new GraphQLClient(endpoint(), config.token, paperContext);
  }, [tokens, isLiveTrading, paperContext]);
  return { make, enabled, paperContext };
}

export const SINGLE_POSITION_QUERY_KEY = 'singlePositionSettings';
export const POSITION_ENTRIES_QUERY_KEY = 'positionEntriesIndex';

export interface UseSinglePositionSettingsResult {
  /** 'unknown' while the first answer is pending or the request failed. */
  backend: SinglePositionBackend;
  byBot: Record<string, BotSinglePositionSettings>;
  isLoading: boolean;
  /** A (re)fetch is in flight — `byBot` may be a cached answer. */
  isFetching: boolean;
}

/**
 * The single-position settings of `botIds`. With no ids it is the capability
 * probe alone (create mode). An older backend answers 'old' and is asked once
 * per session; a transport failure stays 'unknown' and is retried on the next
 * mount, never cached as 'old'.
 */
export function useSinglePositionSettings(
  botIds: readonly string[],
  active = true,
  /** Always refetch on mount (the edit form: a cached value would be saved back). */
  fresh = false
): UseSinglePositionSettingsResult {
  const { make, enabled, paperContext } = useSinglePositionClient();
  const ids = useMemo(
    () => [...new Set(botIds.filter(Boolean))].sort(),
    [botIds]
  );
  const q = useQuery({
    queryKey: [SINGLE_POSITION_QUERY_KEY, paperContext, ids.join(',')],
    enabled: enabled && active,
    retry: false,
    staleTime: ids.length === 0 ? Infinity : fresh ? 0 : 30_000,
    // Refetched on mount only: a refetch on window focus would land after
    // the user started editing.
    ...(fresh
      ? { refetchOnMount: 'always' as const, refetchOnWindowFocus: false }
      : {}),
    queryFn: () => fetchSinglePositionSettings(make(), ids),
  });
  return {
    backend: q.data?.backend ?? 'unknown',
    byBot: q.data?.byBot ?? EMPTY_BY_BOT,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
  };
}

const EMPTY_BY_BOT: Record<string, BotSinglePositionSettings> = {};
const EMPTY_INDEX: Record<string, PositionEntriesInfo> = {};

/** Whether this backend knows single position (probe only, cached for the session). */
export function useSinglePositionBackend(active = true): SinglePositionBackend {
  return useSinglePositionSettings(NO_IDS, active).backend;
}
const NO_IDS: readonly string[] = [];

/**
 * Entries of the open positions of single-position bots, by deal id. Empty on
 * an older backend. One shared query for every deal display on the page.
 */
export function usePositionEntriesIndex(
  active = true
): Record<string, PositionEntriesInfo> {
  const { make, enabled, paperContext } = useSinglePositionClient();
  const backend = useSinglePositionBackend(active);
  const q = useQuery({
    queryKey: [POSITION_ENTRIES_QUERY_KEY, paperContext],
    enabled: enabled && active && backend === 'new',
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => (await fetchPositionEntriesIndex(make())) ?? {},
  });
  return q.data ?? EMPTY_INDEX;
}

/** "Entries 3/5" (or "Entries 3") for a single-position deal; null otherwise. */
export function usePositionEntriesLabel(
  dealId: string | undefined | null,
  active = true
): string | null {
  const index = usePositionEntriesIndex(active && !!dealId);
  const info = dealId ? index[dealId] : undefined;
  if (!info) return null;
  return formatPositionEntries(info.entries, info.maxPositionEntries);
}

/** The Usage ring of a single-position deal; undefined for any other deal. */
export function useDealPositionRing(
  dealId: string | undefined | null,
  active = true
): ReturnType<typeof positionUsageRing> | undefined {
  const index = usePositionEntriesIndex(active && !!dealId);
  const info = dealId ? index[dealId] : undefined;
  return useMemo(
    () =>
      info
        ? positionUsageRing({
            entries: info.entries,
            positions: 1,
            maxPositionEntries: info.maxPositionEntries,
          })
        : undefined,
    [info]
  );
}

/**
 * Entries summed over the open positions of a single-position bot; undefined
 * when the bot holds none (or is not single-position).
 */
export function useBotPositionEntries(
  botId: string | undefined | null,
  active = true
): BotPositionEntries | undefined {
  const index = usePositionEntriesIndex(active && !!botId);
  return useMemo(() => {
    if (!botId) return undefined;
    let entries = 0;
    let positions = 0;
    let maxPositionEntries = '';
    for (const info of Object.values(index)) {
      if (info.botId !== botId) continue;
      entries += info.entries;
      positions += 1;
      maxPositionEntries = info.maxPositionEntries;
    }
    return positions > 0 ? { entries, positions, maxPositionEntries } : undefined;
  }, [index, botId]);
}

/** Refresh every single-position read after a change that moves them. */
export function useInvalidateSinglePosition() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: [SINGLE_POSITION_QUERY_KEY],
    });
    void queryClient.invalidateQueries({
      queryKey: [POSITION_ENTRIES_QUERY_KEY],
    });
  }, [queryClient]);
}

/**
 * For a deal on `symbol` that may move into one of `botIds`: the bots'
 * single-position settings, and the open position each single-position bot
 * holds on that pair (§5.2.1). Bots without either are simply absent.
 */
export function useSinglePositionTargets(
  botIds: readonly string[],
  symbol: string | undefined,
  active = true
): {
  settingsByBot: Record<string, BotSinglePositionSettings>;
  positionByBot: Record<string, OpenDealForPreview>;
  isLoading: boolean;
} {
  const { make, enabled, paperContext } = useSinglePositionClient();
  const settings = useSinglePositionSettings(botIds, active && !!symbol);
  const singlePositionIds = useMemo(
    () =>
      [...new Set(botIds)]
        .filter((id) => settings.byBot[id]?.singlePosition)
        .sort(),
    [botIds, settings.byBot]
  );
  const q = useQuery({
    queryKey: [
      'singlePositionTargets',
      paperContext,
      symbol,
      singlePositionIds.join(','),
    ],
    enabled:
      enabled && active && !!symbol && singlePositionIds.length > 0,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const positions: Record<string, OpenDealForPreview> = {};
      for (const id of singlePositionIds) {
        const deal = findPositionDeal(
          await fetchBotOpenDeals(make(), id),
          symbol ?? ''
        );
        if (deal) positions[id] = deal;
      }
      return positions;
    },
  });
  return {
    settingsByBot: settings.byBot,
    positionByBot: q.data ?? EMPTY_POSITIONS,
    isLoading: settings.isLoading || (q.isLoading && q.fetchStatus !== 'idle'),
  };
}
const EMPTY_POSITIONS: Record<string, OpenDealForPreview> = {};
