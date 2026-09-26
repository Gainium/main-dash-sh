import { useMemo } from 'react';
import { StatusEnum } from '@/types';
import {
  IN_POSITIONS_FIELD,
  useInPositionsBatch,
  useLegacyDashboardStats,
  useNetUnrealizedBatch,
  type LegacyStatsAlias,
  type PositionScope,
} from './useDashboardStatsBatch';

/**
 * Server-side totals for the "In positions" and "Unrealized P&L" headline
 * numbers, per bot type. Everything here is summed on the server, in USD:
 * the dashboard used to add up `usage.current.quote` over a (truncated) bot
 * list — mixing USDT, BTC and USD amounts as if they were all dollars — and
 * the sidebar re-priced every open deal in the browser.
 *
 * Three requests in total, each shared by every consumer (balance card,
 * Status widget, sidebar panels): the legacy stats batch, the In-positions
 * batch and the fee-inclusive uPnL batch (see useDashboardStatsBatch).
 */
export type PositionTotalsScope = PositionScope;

export { IN_POSITIONS_FIELD };

/** Which alias of the legacy batch carries a scope's deal stats. */
const LEGACY_DEAL_ALIAS: Partial<Record<PositionTotalsScope, LegacyStatsAlias>> =
  {
    dca: 'dealDca',
    terminal: 'dealTerminal',
    combo: 'dealCombo',
    hedgeCombo: 'dealHedge',
  };

type InPositionsData = Record<string, number | null | undefined> & {
  inPositionsCount?: number | null;
  inPositionsUnpriced?: number | null;
};
type DealStatsData = {
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

const okData = <T,>(res: unknown): T | undefined => {
  const r = res as { status?: string; data?: T } | undefined;
  return r?.status === StatusEnum.ok ? r.data : undefined;
};

/**
 * Sum the given scopes: `positions` for "In positions", `pnl` for the
 * unrealized P&L.
 */
export function usePositionTotals(scopes: {
  positions: readonly PositionTotalsScope[];
  pnl: readonly PositionTotalsScope[];
}): PositionTotals {
  const wantPositions = scopes.positions.length > 0;
  const wantPnl = scopes.pnl.length > 0;
  const inPos = useInPositionsBatch(wantPositions);
  const net = useNetUnrealizedBatch(wantPnl);
  const legacy = useLegacyDashboardStats();

  const positionsKey = scopes.positions.join(',');
  const pnlKey = scopes.pnl.join(',');

  return useMemo(() => {
    // In positions — all or nothing: a partial sum is never shown.
    let inPositionsUsd: number | null | undefined = 0;
    let inPositionsUnpriced = 0;
    let inPositionsCount = 0;
    if (!wantPositions) {
      inPositionsUsd = 0;
    } else if (inPos.unsupported) {
      inPositionsUsd = null;
    } else if (!inPos.data) {
      inPositionsUsd = undefined;
    } else {
      for (const scope of positionsKey.split(',') as PositionTotalsScope[]) {
        const d = okData<InPositionsData>(inPos.data[scope]);
        const value = d?.[IN_POSITIONS_FIELD];
        if (typeof value !== 'number') {
          inPositionsUsd = null;
          break;
        }
        inPositionsUsd += value;
        inPositionsUnpriced += d?.inPositionsUnpriced ?? 0;
        inPositionsCount += d?.inPositionsCount ?? 0;
      }
    }

    // Unrealized P&L: the fee-inclusive server sum when every scope has it,
    // else the legacy server sum.
    let unrealizedUsd: number | undefined = 0;
    let netSum = 0;
    let allNet = wantPnl && !net.unsupported && !!net.data;
    let openDeals = 0;
    for (const scope of (pnlKey ? pnlKey.split(',') : []) as PositionTotalsScope[]) {
      const alias = LEGACY_DEAL_ALIAS[scope];
      const legacyRow = alias
        ? okData<DealStatsData>(legacy.data?.[alias])?.result?.[0]
        : undefined;
      openDeals += legacyRow?.normal ?? 0;
      if (!legacy.data) unrealizedUsd = undefined;
      else if (unrealizedUsd !== undefined)
        unrealizedUsd += legacyRow?.unrealizedProfit ?? 0;
      const netValue = net.data
        ? okData<DealStatsData>(net.data[scope])?.result?.[0]
            ?.unrealizedProfitNet
        : undefined;
      if (typeof netValue === 'number') netSum += netValue;
      else allNet = false;
    }

    return {
      inPositionsUsd,
      inPositionsUnpriced,
      inPositionsCount,
      unrealizedUsd: allNet ? netSum : unrealizedUsd,
      unrealizedIsNet: allNet,
      openDeals,
    };
  }, [
    wantPositions,
    wantPnl,
    positionsKey,
    pnlKey,
    inPos.unsupported,
    inPos.data,
    net.unsupported,
    net.data,
    legacy.data,
  ]);
}
