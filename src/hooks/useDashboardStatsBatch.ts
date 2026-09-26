import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  DEFAULT_READ_TIMEOUT_MS,
  GraphQLClient,
  getGraphQLConfig,
  type ReturnResult,
} from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import { useCacheKey } from './useCacheKey';

/**
 * The dashboard's per-bot-type stats, fetched as ONE GraphQL document per
 * shape family instead of one request per bot type.
 *
 * The Overview used to fire ~25 small stats requests at once (4 bot-status,
 * 4 deal-stats and 5 all-time profit queries shared by the Status widget and
 * the balance card, plus the in-positions and fee-inclusive uPnL queries per
 * type). The server works through concurrent requests in a queue, so the last
 * ones landed late even though each is quick on its own. Root fields of one
 * document are resolved together, so the batch costs about one round trip.
 *
 * Self-hosted compatibility: a document selecting a field the backend does not
 * know fails as a WHOLE. The legacy fields (every backend has them) and the
 * new fields (`inPositions*`, `unrealizedProfitNet`) are therefore kept in
 * separate documents, and each new-field document fails on its own.
 */

type BatchEntry = {
  alias: string;
  field: string;
  inputType: string;
  input: Record<string, unknown>;
  selection: string;
};

const buildDocument = (name: string, entries: readonly BatchEntry[]) => {
  const vars = entries
    .map((e, i) => `$v${i}: ${e.inputType}`)
    .join(', ');
  const fields = entries
    .map(
      (e, i) =>
        `${e.alias}: ${e.field}(input: $v${i}) {\n    status\n    reason\n    ${e.selection}\n  }`
    )
    .join('\n  ');
  const variables: Record<string, unknown> = {};
  entries.forEach((e, i) => {
    variables[`v${i}`] = e.input;
  });
  return { query: `query ${name}(${vars}) {\n  ${fields}\n}`, variables };
};

export type BatchResult = Record<string, ReturnResult<unknown> | undefined>;

async function runBatch(
  name: string,
  entries: readonly BatchEntry[]
): Promise<BatchResult> {
  const { tokens } = useAuthStore.getState();
  const { isLiveTrading, tradingMode } = useUIStore.getState();
  const config = getGraphQLConfig(tokens, isLiveTrading);
  const paperContext = tradingMode === 'demo' ? true : config.paperContext;
  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000',
    config.token,
    paperContext
  );
  const { query, variables } = buildDocument(name, entries);
  return client.request<BatchResult>(query, variables, {
    timeoutMs: DEFAULT_READ_TIMEOUT_MS,
  });
}

/** A GraphQL validation rejection: this backend lacks a selected field. */
export const isSchemaRejection = (error: unknown): boolean =>
  /GRAPHQL_VALIDATION_FAILED|Cannot query field|is not defined by type/i.test(
    error instanceof Error ? error.message : String(error)
  );

/** The cache-key variables of a batch (stable for a constant entry list). */
const batchSignature = (entries: readonly BatchEntry[]) => ({
  fields: entries.map((e) => [e.alias, e.input]),
});

function useBatch(
  name: string,
  entries: readonly BatchEntry[],
  options: { enabled?: boolean; staleTime?: number; retry?: boolean } = {}
) {
  const hasSession = useAuthStore((s) => !!s.tokens?.accessToken);
  const signature = useMemo(() => batchSignature(entries), [entries]);
  const queryKey = useCacheKey(name, signature);
  const query = useQuery({
    queryKey,
    queryFn: () => runBatch(name, entries),
    enabled: hasSession && options.enabled !== false,
    staleTime: options.staleTime ?? 30_000,
    // A schema rejection never succeeds on retry; anything else (a timeout,
    // a network blip) gets one more try before the value shows as missing.
    retry: (count, error) =>
      count < 1 && !(options.retry === false && isSchemaRejection(error)),
  });
  return { ...query, queryKey };
}

// ---------------------------------------------------------------------------
// Legacy stats (every backend): bot status counts, deal stats, all-time profit
// ---------------------------------------------------------------------------

const BOT_STATS_SELECTION = `data {
      result {
        status
        count
      }
    }`;
const DEAL_STATS_SELECTION = `data {
      result {
        normal
        inProfit
        eighty
        max
        unrealizedProfit
      }
    }`;
const PROFIT_SELECTION = `data {
      result {
        quote
      }
    }`;

const LEGACY_ENTRIES: readonly BatchEntry[] = [
  ...(
    [
      ['botDca', BotTypesEnum.dca],
      ['botGrid', BotTypesEnum.grid],
      ['botCombo', BotTypesEnum.combo],
      ['botHedge', BotTypesEnum.hedgeCombo],
    ] as const
  ).map(([alias, type]) => ({
    alias,
    field: 'botDashboardStats',
    inputType: 'botDashboardStatsInput!',
    input: { type },
    selection: BOT_STATS_SELECTION,
  })),
  ...(
    [
      ['dealDca', BotTypesEnum.dca, false],
      ['dealCombo', BotTypesEnum.combo, false],
      ['dealHedge', BotTypesEnum.hedgeCombo, false],
      ['dealTerminal', BotTypesEnum.dca, true],
    ] as const
  ).map(([alias, type, terminal]) => ({
    alias,
    field: 'dealDashboardStats',
    inputType: 'dealDashboardStatsInput!',
    input: { type, terminal },
    selection: DEAL_STATS_SELECTION,
  })),
  ...(
    [
      ['profitDca', { timeframe: 3, botType: BotTypesEnum.dca, terminal: false }],
      ['profitGrid', { timeframe: 3, botType: BotTypesEnum.grid }],
      ['profitCombo', { timeframe: 3, botType: BotTypesEnum.combo }],
      ['profitHedge', { timeframe: 3, botType: BotTypesEnum.hedgeCombo }],
      [
        'profitTerminal',
        { timeframe: 3, botType: BotTypesEnum.dca, terminal: true },
      ],
    ] as const
  ).map(([alias, input]) => ({
    alias,
    field: 'getProfitByUser',
    inputType: 'getProfitByUser',
    input: { ...input },
    selection: PROFIT_SELECTION,
  })),
];

/**
 * For WidgetWrapper's stale-while-revalidate indicator
 * (`cacheQueries={[LEGACY_STATS_CACHE_QUERY]}`).
 */
export const LEGACY_STATS_CACHE_QUERY = {
  queryKey: 'dashboardStatsLegacy',
  variables: batchSignature(LEGACY_ENTRIES) as Record<string, unknown>,
};

export type LegacyStatsAlias =
  | 'botDca'
  | 'botGrid'
  | 'botCombo'
  | 'botHedge'
  | 'dealDca'
  | 'dealCombo'
  | 'dealHedge'
  | 'dealTerminal'
  | 'profitDca'
  | 'profitGrid'
  | 'profitCombo'
  | 'profitHedge'
  | 'profitTerminal';

/**
 * Bot status counts, deal stats and all-time realized profit for every bot
 * type — the Status widget's and the balance card's inputs — in one request,
 * shared (one cache entry) by every consumer.
 */
export function useLegacyDashboardStats() {
  const q = useBatch('dashboardStatsLegacy', LEGACY_ENTRIES);
  return {
    ...q,
    data: q.data as
      | Partial<Record<LegacyStatsAlias, ReturnResult<unknown>>>
      | undefined,
  };
}

// ---------------------------------------------------------------------------
// New fields (backends that have them): In positions, fee-inclusive uPnL
// ---------------------------------------------------------------------------

export type PositionScope =
  | 'dca'
  | 'terminal'
  | 'combo'
  | 'grid'
  | 'hedgeDca'
  | 'hedgeCombo';

export const POSITION_SCOPE_INPUT: Record<
  PositionScope,
  { type: BotTypesEnum; terminal?: boolean }
> = {
  dca: { type: BotTypesEnum.dca, terminal: false },
  terminal: { type: BotTypesEnum.dca, terminal: true },
  combo: { type: BotTypesEnum.combo, terminal: false },
  grid: { type: BotTypesEnum.grid },
  hedgeDca: { type: BotTypesEnum.hedgeDca, terminal: false },
  hedgeCombo: { type: BotTypesEnum.hedgeCombo, terminal: false },
};

/** Name of the server field; one constant so a rename is a one-line change. */
export const IN_POSITIONS_FIELD = 'inPositionsUsd';

const ALL_POSITION_SCOPES: readonly PositionScope[] = [
  'dca',
  'terminal',
  'combo',
  'grid',
  'hedgeDca',
  'hedgeCombo',
];
/**
 * Deal-stats scopes summed for uPnL — the same four the legacy batch has
 * (grid bots have no DCA-style deals; hedge-DCA legs are not in the sum).
 */
const NET_SCOPES: readonly PositionScope[] = [
  'dca',
  'terminal',
  'combo',
  'hedgeCombo',
];

const IN_POSITIONS_ENTRIES: readonly BatchEntry[] = ALL_POSITION_SCOPES.map(
  (scope) => ({
    alias: scope,
    field: 'botDashboardStats',
    inputType: 'botDashboardStatsInput!',
    input: { ...POSITION_SCOPE_INPUT[scope] },
    selection: `data {
      ${IN_POSITIONS_FIELD}
      inPositionsCount
      inPositionsUnpriced
    }`,
  })
);

const NET_ENTRIES: readonly BatchEntry[] = NET_SCOPES.map((scope) => ({
  alias: scope,
  field: 'dealDashboardStats',
  inputType: 'dealDashboardStatsInput!',
  input: { ...POSITION_SCOPE_INPUT[scope] },
  selection: `data {
      result {
        unrealizedProfitNet
      }
    }`,
}));

/**
 * Set once a backend has rejected a new-field document: later mounts in this
 * session (sidebar panels, other pages) skip it instead of failing again.
 */
const unsupported = { inPositions: false, net: false };

/** Test hook. */
export const __resetFieldSupportForTests = () => {
  unsupported.inPositions = false;
  unsupported.net = false;
};

function useNewFieldBatch(
  kind: 'inPositions' | 'net',
  entries: readonly BatchEntry[],
  enabled: boolean
) {
  const known = unsupported[kind];
  const q = useBatch(
    kind === 'inPositions' ? 'dashboardInPositions' : 'dashboardStatsNet',
    entries,
    { enabled: enabled && !known, retry: false }
  );
  const rejected = q.isError && isSchemaRejection(q.error);
  useEffect(() => {
    if (rejected) unsupported[kind] = true;
  }, [rejected, kind]);
  return {
    data: q.data,
    /** The backend lacks the field(s): show NotCalculated / legacy values. */
    unsupported: known || q.isError,
    isLoading: q.isLoading && !known,
  };
}

/** In positions for every bot type, one request (or none when unsupported). */
export function useInPositionsBatch(enabled = true) {
  return useNewFieldBatch('inPositions', IN_POSITIONS_ENTRIES, enabled);
}

/** Fee-inclusive uPnL sum for every deal type, one request. */
export function useNetUnrealizedBatch(enabled = true) {
  return useNewFieldBatch('net', NET_ENTRIES, enabled);
}
