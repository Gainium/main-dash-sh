import { useMemo } from 'react';

import { useAccountTradingCosts } from '@/hooks/useTradingCosts';
import type { TradingCosts } from '@/types';
import { getTzDateKey, getTzDayBounds } from '@/utils/timeUtils';
import {
  costShareOfGross,
  formatCost,
  hasCostFigures,
  isFiniteNumber,
} from '@/utils/tradingCosts';

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

/**
 * One tooltip line per quote asset, e.g.
 * "USDT — Fees -$1.87 · Slippage -$0.11 · 6.8% of gross". Amounts are in that
 * quote asset and never summed across assets; an estimated part says so.
 */
export const tradingCostsTooltipLines = (rows: TradingCosts[]): string[] =>
  rows.filter(hasCostFigures).map((r) => {
    const parts: string[] = [];
    if (isFiniteNumber(r.feesQuote)) {
      parts.push(
        `Fees ${formatCost(r.feesQuote, r.quoteAsset)}${
          r.feesEstimated ? ' (estimate)' : ''
        }`
      );
    }
    if (isFiniteNumber(r.slippageQuote)) {
      parts.push(
        `Slippage ${formatCost(r.slippageQuote, r.quoteAsset)}${
          r.slippageReconstructed ? ' (estimate)' : ''
        }`
      );
    }
    const share = costShareOfGross(r);
    if (share !== undefined) parts.push(`${share.toFixed(1)}% of gross`);
    const body = parts.join(' · ');
    return r.quoteAsset ? `${r.quoteAsset} — ${body}` : body;
  });

/**
 * Account-wide fees and slippage for the Profit widget's current period, as
 * the text of an info tooltip. Undefined when there is nothing to show (no
 * data, an older backend, or `enabled` off).
 */
export const useAccountTradingCostsTooltip = ({
  timeFilter,
  timeZone,
  enabled = true,
}: {
  timeFilter: string;
  timeZone: string;
  enabled?: boolean;
}): string | undefined => {
  // Stable for the whole period (the start, not "now"), so the query key
  // only changes when the period does.
  const from = periodStart(timeFilter, timeZone);
  const rows = useAccountTradingCosts({ from, enabled });
  return useMemo(() => {
    if (!enabled || !rows?.length) return undefined;
    const lines = tradingCostsTooltipLines(rows);
    return lines.length ? lines.join('\n') : undefined;
  }, [rows, enabled]);
};
