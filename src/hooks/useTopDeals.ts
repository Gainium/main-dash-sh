import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_READ_TIMEOUT_MS,
  GraphQLClient,
  getGraphQLConfig,
} from '@/lib/api';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import {
  comboDealFragment,
  dcaDealFragment,
} from '@/lib/api/GraphQLQueries-fragments';
import { toServerSortModel } from '@/lib/api/serverSort';
import type { ReturnResult } from '@/lib/api/types';
import { useAuthStore } from '@/stores/authStore';
import type { ComboDeals, DCADeals } from '@/types';

export type TopDealsMetric =
  | 'cost'
  | 'value'
  | 'unrealizedPnl'
  | 'pnlPercent'
  | 'profit'
  | 'age';

/**
 * The stored field each ranking maps to. `*Net` / `valueUsd` are the
 * fee-inclusive per-deal values the server's stats worker writes; older
 * backends do not have them (the query then falls back, see below).
 */
export const TOP_DEALS_SORT_FIELD: Record<TopDealsMetric, string> = {
  cost: 'stats.usage',
  value: 'stats.valueUsd',
  unrealizedPnl: 'stats.unrealizedProfitNet',
  pnlPercent: 'stats.unrealizedPercentNet',
  profit: 'profit.totalUsd',
  age: 'createTime',
};

const NEEDS_NET_FIELDS: ReadonlySet<TopDealsMetric> = new Set([
  'value',
  'unrealizedPnl',
  'pnlPercent',
]);

/** The fields selected only to prove the backend has them. */
const NET_STATS_SELECTION = `stats {
  unrealizedProfitNet
  unrealizedPercentNet
  valueUsd
}`;

/** Rows loaded for a client-side ranking when the server cannot rank. */
export const TOP_DEALS_FALLBACK_ROWS = 500;

export interface TopDealsData {
  dca: DCADeals[];
  combo: ComboDeals[];
  /** Open DCA + combo deals on the server. */
  totalOpen: number;
  /** True when the server ranked them; false = ranked among the loaded rows. */
  serverRanked: boolean;
  /** Rows loaded for the ranking (dca + combo). */
  loaded: number;
}

type NetStats = {
  unrealizedProfitNet?: number | null;
  unrealizedPercentNet?: number | null;
  valueUsd?: number | null;
};

type ListResponse<T> = ReturnResult<{ result: T[] }> & { total?: number };

const isUnknownFieldError = (error: unknown) =>
  /Cannot query field|unknown field|valueUsd|unrealizedProfitNet|unrealizedPercentNet/i.test(
    error instanceof Error ? error.message : String(error)
  );

async function fetchTopDeals(
  metric: TopDealsMetric,
  paperContext: boolean,
  limit: number
): Promise<TopDealsData> {
  const { tokens } = useAuthStore.getState();
  const config = getGraphQLConfig(tokens, !paperContext);
  const client = new GraphQLClient(
    import.meta.env.VITE_API_ENDPOINT || 'http://localhost:4000',
    config.token,
    paperContext
  );

  const run = async (opts: {
    sortModel?: ReturnType<typeof toServerSortModel>;
    pageSize: number;
    withNet: boolean;
  }) => {
    const dataGridInput = {
      page: 0,
      pageSize: opts.pageSize,
      ...(opts.sortModel?.length ? { sortModel: opts.sortModel } : {}),
    };
    const dcaQ = dealQueries.dcaDealList(
      { terminal: false, dataGridInput },
      opts.withNet ? `${dcaDealFragment}\n${NET_STATS_SELECTION}` : undefined
    );
    const comboQ = dealQueries.comboDealList(
      { dataGridInput },
      opts.withNet ? `${comboDealFragment}\n${NET_STATS_SELECTION}` : undefined
    );
    const [dcaRes, comboRes] = await Promise.all([
      client.request<{ dcaDealList: ListResponse<DCADeals> }>(
        dcaQ.query,
        dcaQ.variables,
        { timeoutMs: DEFAULT_READ_TIMEOUT_MS }
      ),
      client.request<{ comboDealList: ListResponse<ComboDeals> }>(
        comboQ.query,
        comboQ.variables,
        { timeoutMs: DEFAULT_READ_TIMEOUT_MS }
      ),
    ]);
    const dca =
      dcaRes.dcaDealList?.status === 'OK'
        ? (dcaRes.dcaDealList.data?.result ?? [])
        : [];
    const combo =
      comboRes.comboDealList?.status === 'OK'
        ? (comboRes.comboDealList.data?.result ?? [])
        : [];
    const totalOpen =
      (typeof dcaRes.dcaDealList?.total === 'number'
        ? dcaRes.dcaDealList.total
        : dca.length) +
      (typeof comboRes.comboDealList?.total === 'number'
        ? comboRes.comboDealList.total
        : combo.length);
    const withContext = <T extends { paperContext?: boolean }>(rows: T[]) =>
      rows.map((r) => ({ ...r, paperContext }));
    return {
      dca: withContext(dca),
      combo: withContext(combo),
      totalOpen,
    };
  };

  const field = TOP_DEALS_SORT_FIELD[metric];
  const sortModel = toServerSortModel(field, 'desc');
  if (NEEDS_NET_FIELDS.has(metric)) {
    let serverValuesMissing = false;
    try {
      const r = await run({ sortModel, pageSize: limit, withNet: true });
      // The fields exist but are not written yet (deals the stats worker
      // has not revisited since the backend gained them): null sorts last,
      // so a top page with no values means the server could not rank.
      const statKey = field.replace('stats.', '') as keyof NetStats;
      const rows = [...r.dca, ...r.combo] as Array<{ stats?: NetStats }>;
      serverValuesMissing =
        rows.length > 0 &&
        rows.every((row) => typeof row.stats?.[statKey] !== 'number');
      if (!serverValuesMissing) {
        return {
          ...r,
          serverRanked: true,
          loaded: r.dca.length + r.combo.length,
        };
      }
    } catch (error) {
      if (!isUnknownFieldError(error)) throw error;
    }
    {
      // Backend without (or not yet writing) the fee-inclusive stored
      // fields: rank the largest open deals client-side and say so.
      const r = await run({
        sortModel: toServerSortModel('stats.usage', 'desc'),
        pageSize: TOP_DEALS_FALLBACK_ROWS,
        withNet: false,
      });
      return {
        ...r,
        serverRanked: false,
        loaded: r.dca.length + r.combo.length,
      };
    }
  }
  const r = await run({ sortModel, pageSize: limit, withNet: false });
  return { ...r, serverRanked: true, loaded: r.dca.length + r.combo.length };
}

/**
 * The top `limit` open DCA + combo deals by `metric`, ranked by the server
 * (one small page per deal type) instead of downloading every open deal and
 * ranking thousands in the browser.
 */
export function useTopDeals(
  metric: TopDealsMetric,
  paperContext: boolean,
  limit: number
) {
  const hasSession = useAuthStore((s) => !!s.tokens?.accessToken);
  return useQuery({
    queryKey: ['topDeals', metric, paperContext, limit],
    queryFn: () => fetchTopDeals(metric, paperContext, limit),
    enabled: hasSession,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
