import { useMemo } from 'react';

import { useAccountTradingCosts } from '@/hooks/useTradingCosts';
import type { TradingCosts } from '@/types';
import { getTzDateKey, getTzDayBounds } from '@/utils/timeUtils';
import {
  FEES_ESTIMATED_TOOLTIP,
  SLIPPAGE_RECONSTRUCTED_TOOLTIP,
  costShareOfGross,
  formatCost,
  hasCostFigures,
  isFiniteNumber,
} from '@/utils/tradingCosts';

import type { StatItem } from '../shared/WidgetStats';

/**
 * Start of the Profit widget's current period ("Today" / "This Week" /
 * "This Month") in the account's time zone; undefined for "Total".
 */
export const periodStart = (
  timeFilter: string,
  timeZone: string,
  now: Date = new Date()
): number | undefined => {
  if (timeFilter === 'Total') return undefined;
  const key = getTzDateKey(now, timeZone);
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  let day = d;
  if (timeFilter === 'Monthly') day = 1;
  if (timeFilter === 'Weekly') {
    // Weeks start on Monday.
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    day = d - ((dow + 6) % 7);
  }
  return getTzDayBounds(y, m, day, timeZone)?.start;
};

const joinPerAsset = (
  rows: TradingCosts[],
  pick: (row: TradingCosts) => string | undefined
): string =>
  rows
    .map(pick)
    .filter((v): v is string => !!v)
    .join(' · ');

/**
 * Account-wide fees and slippage for the Profit widget's current period, as
 * extra `WidgetStats` tiles — one figure per quote asset (never summed across
 * assets). Empty on a backend without the summary.
 */
export const useAccountTradingCostStats = ({
  timeFilter,
  timeZone,
  privacyMode,
  enabled = true,
}: {
  timeFilter: string;
  timeZone: string;
  privacyMode: boolean;
  enabled?: boolean;
}): StatItem[] => {
  // Stable for the whole period (the start, not "now"), so the query key
  // only changes when the period does.
  const from = periodStart(timeFilter, timeZone);
  const rows = useAccountTradingCosts({ from, enabled });

  const stats = useMemo<StatItem[]>(() => {
    const withCosts = enabled ? (rows ?? []).filter(hasCostFigures) : [];
    if (!withCosts.length) return [];
    const hide = (text: string) => (privacyMode ? '***' : text);
    const fees = joinPerAsset(withCosts, (r) =>
      isFiniteNumber(r.feesQuote)
        ? formatCost(r.feesQuote, r.quoteAsset)
        : undefined
    );
    const slippage = joinPerAsset(withCosts, (r) =>
      isFiniteNumber(r.slippageQuote)
        ? formatCost(r.slippageQuote, r.quoteAsset)
        : undefined
    );
    const share = joinPerAsset(withCosts, (r) => {
      const pct = costShareOfGross(r);
      if (pct === undefined) return undefined;
      return withCosts.length > 1
        ? `${pct.toFixed(1)}% ${r.quoteAsset ?? ''}`.trim()
        : `${pct.toFixed(1)}%`;
    });
    const out: StatItem[] = [];
    if (fees) {
      out.push({
        label: 'Fees',
        value: 0,
        textValue: hide(fees),
        tone: privacyMode ? 'neutral' : 'destructive',
        ...(withCosts.some((r) => r.feesEstimated) && {
          estimateTooltip: FEES_ESTIMATED_TOOLTIP,
        }),
      });
    }
    if (slippage) {
      out.push({
        label: 'Slippage',
        value: 0,
        textValue: hide(slippage),
        tone: privacyMode
          ? 'neutral'
          : withCosts.some((r) => (r.slippageQuote ?? 0) > 0)
            ? 'destructive'
            : 'success',
        ...(withCosts.some((r) => r.slippageReconstructed) && {
          estimateTooltip: SLIPPAGE_RECONSTRUCTED_TOOLTIP,
        }),
      });
    }
    if (share) {
      out.push({
        label: 'Costs / Gross',
        value: 0,
        textValue: hide(share),
        tone: 'neutral',
      });
    }
    return out;
  }, [rows, privacyMode, enabled]);

  return stats;
};
