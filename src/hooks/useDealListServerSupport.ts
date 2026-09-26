import { GraphQLClient, getGraphQLConfig } from '@/lib/api';
import type { FilterBackend } from '@/lib/botList/serverFilters';
import { isSchemaRejection } from '@/lib/largeAccount/largeAccount';
import type { ServerFilterItem } from '@/lib/botList/serverBotQuery';
import { statusFilterItem } from '@/lib/utils/dealStatusFilter';
import logger from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { DCADealStatusEnum } from '@/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

const endpoint = () =>
  import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';

function useClient() {
  const tokens = useAuthStore((s) => s.tokens);
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const paperContext = !isLiveTrading;
  const enabled = !!tokens?.accessToken && tradingMode !== 'demo';
  const make = () => {
    const config = getGraphQLConfig(tokens, isLiveTrading);
    return new GraphQLClient(endpoint(), config.token, paperContext);
  };
  return { make, enabled, paperContext };
}

const PROBE_QUERY = `query dealListFilterProbe {
  dcaDealList(input: { dataGridInput: { page: 0, pageSize: 1 } }) {
    total
    totals { count }
  }
}`;

/**
 * Whether this backend applies the newer deal-list filters (bot name, cost,
 * pair) and returns filtered-set totals. Probed ONCE per session with its own
 * document, in parallel with everything else (it never gates a page fetch):
 * a schema rejection of `totals` means an older backend, which must never be
 * sent those fields (it would pass them to the database and return nothing).
 * A transport failure also reads as 'old' (the safe answer) but is retried
 * on the next mount instead of being cached.
 */
export function useDealFilterBackend(active = true): FilterBackend {
  const { make, enabled, paperContext } = useClient();
  const q = useQuery<FilterBackend>({
    queryKey: ['dealListFilterProbe', paperContext],
    enabled: enabled && active,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      try {
        await make().request(PROBE_QUERY, {});
        return 'new';
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (isSchemaRejection(message)) {
          logger.debug('[dealListFilterProbe] older backend (no totals)');
          return 'old';
        }
        // Transport failure: answer 'old' for now (safe) without caching it
        // for the session — the next mount probes again.
        throw e;
      }
    },
  });
  if (q.isError) return 'old';
  return q.data ?? 'unknown';
}

export interface DealListTotals {
  count: number;
  cost: number | null;
  costUsd: number | null;
  costUsdDeals: number | null;
  realizedProfitUsd: number | null;
  unrealizedProfitNet: number | null;
  unrealizedProfitNetDeals: number | null;
}

const TOTALS_QUERY = `query dealListTotals($input: getDcaDealListInput) {
  dcaDealList(input: $input) {
    total
    totals {
      count cost costUsd costUsdDeals realizedProfitUsd
      unrealizedProfitNet unrealizedProfitNetDeals
    }
  }
}`;

/**
 * Totals over the whole FILTERED deal set (newer backends only), fetched in
 * their own one-row request alongside the page.
 */
export function useDealListTotals(opts: {
  enabled: boolean;
  status: 'open' | 'closed';
  terminal: boolean;
  botId?: string;
  items: ServerFilterItem[];
}): DealListTotals | null {
  const { make, enabled, paperContext } = useClient();
  const statusItem = statusFilterItem(
    opts.status === 'closed' ? DCADealStatusEnum.closed : DCADealStatusEnum.open
  );
  const input = {
    terminal: opts.terminal,
    ...(opts.botId ? { botId: opts.botId } : {}),
    dataGridInput: {
      page: 0,
      pageSize: 1,
      filterModel: { items: [...(statusItem ? [statusItem] : []), ...opts.items] },
    },
  };
  const q = useQuery<DealListTotals | null>({
    queryKey: ['dealListTotals', paperContext, JSON.stringify(input)],
    enabled: enabled && opts.enabled,
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const res = await make().request<{
          dcaDealList?: { totals?: DealListTotals | null };
        }>(TOTALS_QUERY, { input });
        return res?.dcaDealList?.totals ?? null;
      } catch {
        return null;
      }
    },
  });
  return q.data ?? null;
}
