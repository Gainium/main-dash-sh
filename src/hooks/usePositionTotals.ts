import { useMemo } from 'react';
import { GraphQlQuery } from '@/lib/api';
import { BotTypesEnum, StatusEnum } from '@/types';
import { useGraphQL } from './useGraphQL';

/**
 * Server-side totals for the "In positions" and "Unrealized P&L" headline
 * numbers, per bot type. Everything here is summed on the server, in USD:
 * the dashboard used to add up `usage.current.quote` over a (truncated) bot
 * list — mixing USDT, BTC and USD amounts as if they were all dollars — and
 * the sidebar re-priced every open deal in the browser.
 */
export type PositionTotalsScope =
  | 'dca'
  | 'terminal'
  | 'combo'
  | 'grid'
  | 'hedgeDca'
  | 'hedgeCombo';

/** Name of the server field; one constant so a rename is a one-line change. */
export const IN_POSITIONS_FIELD = 'inPositionsUsd';

const SCOPE_INPUT: Record<
  PositionTotalsScope,
  { type: BotTypesEnum; terminal?: boolean }
> = {
  dca: { type: BotTypesEnum.dca, terminal: false },
  terminal: { type: BotTypesEnum.dca, terminal: true },
  combo: { type: BotTypesEnum.combo, terminal: false },
  grid: { type: BotTypesEnum.grid },
  hedgeDca: { type: BotTypesEnum.hedgeDca, terminal: false },
  hedgeCombo: { type: BotTypesEnum.hedgeCombo, terminal: false },
};

/** Cache keys shared with BotStatus / HeroBalance for the legacy uPnL rows. */
const DEAL_STATS_KEY: Partial<Record<PositionTotalsScope, string>> = {
  dca: 'dcaDealDashboardStats',
  terminal: 'terminalDealDashboardStats',
  combo: 'comboDealDashboardStats',
  hedgeCombo: 'hedgeDealDashboardStats',
  hedgeDca: 'hedgeDcaDealDashboardStats',
};

const inPositionsQuery = (scope: PositionTotalsScope) => {
  const input = SCOPE_INPUT[scope];
  return {
    // Its OWN document: an older backend rejects the new fields, and a
    // validation error fails the whole query it is in.
    query: `query botDashboardStatsInPositions($input: botDashboardStatsInput!) {
  botDashboardStats(input: $input) {
    status
    reason
    data {
      ${IN_POSITIONS_FIELD}
      inPositionsCount
      inPositionsUnpriced
    }
  }
}`,
    variables: { input },
  };
};

const netUnrealizedQuery = (scope: PositionTotalsScope) => ({
  query: `query dealDashboardStatsNet($input: dealDashboardStatsInput!) {
  dealDashboardStats(input: $input) {
    status
    reason
    data {
      result {
        unrealizedProfitNet
      }
    }
  }
}`,
  variables: { input: SCOPE_INPUT[scope] },
});

type InPositionsResponse = Record<string, number | null | undefined> & {
  inPositionsCount?: number | null;
  inPositionsUnpriced?: number | null;
};
type DealStatsResponse = {
  result?: Array<{
    unrealizedProfit?: number | null;
    unrealizedProfitNet?: number | null;
    normal?: number | null;
  }>;
};

export interface PositionTotals {
  /**
   * Σ current exposure in USD. `null` = the backend does not provide it
   * (show NotCalculated); `undefined` = still loading.
   */
  inPositionsUsd: number | null | undefined;
  /** Positions the server could not price (excluded from the sum). */
  inPositionsUnpriced: number;
  inPositionsCount: number;
  /** Σ unrealized P&L (fee-inclusive when the backend provides it). */
  unrealizedUsd: number | undefined;
  /** True when `unrealizedUsd` is the fee-inclusive server value. */
  unrealizedIsNet: boolean;
  openDeals: number;
}

const QUERY_OPTS = { staleTime: 30_000, retry: 1 } as const;

/**
 * Does this backend have the new fields? Probed ONCE per session with the DCA
 * query (cached forever): an older backend answers every new-field document
 * with a validation error, and without the probe each scope's query — on the
 * balance card and every sidebar panel — would fail (and retry) separately.
 */
function useFieldSupport() {
  const probeOpts = { staleTime: Infinity, gcTime: Infinity, retry: false };
  const inPos = useGraphQL<InPositionsResponse>(
    'inPositions:dca',
    inPositionsQuery('dca'),
    probeOpts
  );
  const net = useGraphQL<DealStatsResponse>(
    'dcaDealDashboardStats:net',
    netUnrealizedQuery('dca'),
    probeOpts
  );
  return {
    inPositions: inPos.isError ? false : inPos.data ? true : undefined,
    net: net.isError ? false : net.data ? true : undefined,
  };
}

function useScopeTotals(
  scope: PositionTotalsScope,
  wantPositions: boolean,
  wantPnl: boolean,
  support: { inPositions?: boolean; net?: boolean }
) {
  const inPos = useGraphQL<InPositionsResponse>(
    `inPositions:${scope}`,
    inPositionsQuery(scope),
    {
      ...QUERY_OPTS,
      retry: false,
      enabled: wantPositions && (scope === 'dca' || support.inPositions === true),
    }
  );
  const enabled = wantPnl;
  const hasDealStats = scope !== 'grid' && wantPnl;
  const dealStatsKey = DEAL_STATS_KEY[scope] ?? `${scope}DealDashboardStats`;
  const legacy = useGraphQL<DealStatsResponse>(
    dealStatsKey,
    GraphQlQuery.dealDashboardStats(SCOPE_INPUT[scope]),
    { ...QUERY_OPTS, enabled: enabled && hasDealStats }
  );
  const net = useGraphQL<DealStatsResponse>(
    `${dealStatsKey}:net`,
    netUnrealizedQuery(scope),
    {
      ...QUERY_OPTS,
      retry: false,
      enabled:
        enabled && hasDealStats && (scope === 'dca' || support.net === true),
    }
  );
  return { inPos, legacy, net, hasDealStats, wantPositions, support };
}

/**
 * Sum the given scopes: `positions` for "In positions", `pnl` for the
 * unrealized P&L. Hooks are called for EVERY scope (stable order) and disabled
 * for the ones not requested, so the call order never changes.
 */
export function usePositionTotals(scopes: {
  positions: readonly PositionTotalsScope[];
  pnl: readonly PositionTotalsScope[];
}): PositionTotals {
  const p = (s: PositionTotalsScope) => scopes.positions.includes(s);
  const u = (s: PositionTotalsScope) => scopes.pnl.includes(s);
  const support = useFieldSupport();
  const dca = useScopeTotals('dca', p('dca'), u('dca'), support);
  const terminal = useScopeTotals(
    'terminal',
    p('terminal'),
    u('terminal'),
    support
  );
  const combo = useScopeTotals('combo', p('combo'), u('combo'), support);
  const grid = useScopeTotals('grid', p('grid'), u('grid'), support);
  const hedgeDca = useScopeTotals(
    'hedgeDca',
    p('hedgeDca'),
    u('hedgeDca'),
    support
  );
  const hedgeCombo = useScopeTotals(
    'hedgeCombo',
    p('hedgeCombo'),
    u('hedgeCombo'),
    support
  );

  const all = { dca, terminal, combo, grid, hedgeDca, hedgeCombo };
  const scopesKey = Array.from(
    new Set([...scopes.positions, ...scopes.pnl])
  ).join(',');

  return useMemo(() => {
    let inPositionsUsd: number | null | undefined = 0;
    let inPositionsUnpriced = 0;
    let inPositionsCount = 0;
    let unrealizedUsd: number | undefined = 0;
    let allNet = true;
    let openDeals = 0;

    for (const scope of scopesKey.split(',') as PositionTotalsScope[]) {
      const t = all[scope];
      if (!t) continue;

      // In positions
      if (t.wantPositions && t.support.inPositions === false) {
        inPositionsUsd = null;
      } else if (t.wantPositions && inPositionsUsd !== null) {
        const res = t.inPos.data;
        const value =
          res?.status === StatusEnum.ok
            ? (res.data as InPositionsResponse | undefined)?.[
                IN_POSITIONS_FIELD
              ]
            : undefined;
        if (t.inPos.isError || (res && typeof value !== 'number')) {
          // Unknown field (older backend) or not computed: not calculated.
          inPositionsUsd = null;
        } else if (!res) {
          if (inPositionsUsd !== undefined) inPositionsUsd = undefined;
        } else if (inPositionsUsd !== undefined) {
          inPositionsUsd += value as number;
          const d = res.data as InPositionsResponse;
          inPositionsUnpriced += d.inPositionsUnpriced ?? 0;
          inPositionsCount += d.inPositionsCount ?? 0;
        }
      }

      if (!t.hasDealStats) continue;
      // Unrealized P&L: fee-inclusive server sum when available.
      const netRow =
        t.net.data?.status === StatusEnum.ok
          ? t.net.data.data?.result?.[0]
          : undefined;
      const legacyRow =
        t.legacy.data?.status === StatusEnum.ok
          ? t.legacy.data.data?.result?.[0]
          : undefined;
      openDeals += legacyRow?.normal ?? 0;
      const netValue = netRow?.unrealizedProfitNet;
      if (typeof netValue === 'number') {
        if (unrealizedUsd !== undefined) unrealizedUsd += netValue;
      } else {
        allNet = false;
        if (legacyRow) {
          if (unrealizedUsd !== undefined)
            unrealizedUsd += legacyRow.unrealizedProfit ?? 0;
        } else if (t.legacy.isLoading) {
          unrealizedUsd = undefined;
        }
      }
    }

    return {
      inPositionsUsd,
      inPositionsUnpriced,
      inPositionsCount,
      unrealizedUsd,
      unrealizedIsNet: allNet,
      openDeals,
    };
    // `all` is rebuilt every render; its members' data are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    scopesKey,
    dca.inPos.data,
    dca.inPos.isError,
    dca.legacy.data,
    dca.net.data,
    terminal.inPos.data,
    terminal.inPos.isError,
    terminal.legacy.data,
    terminal.net.data,
    combo.inPos.data,
    combo.inPos.isError,
    combo.legacy.data,
    combo.net.data,
    grid.inPos.data,
    grid.inPos.isError,
    hedgeDca.inPos.data,
    hedgeDca.inPos.isError,
    hedgeDca.legacy.data,
    hedgeDca.net.data,
    hedgeCombo.inPos.data,
    hedgeCombo.inPos.isError,
    hedgeCombo.legacy.data,
    hedgeCombo.net.data,
    support.inPositions,
    support.net,
  ]);
}
