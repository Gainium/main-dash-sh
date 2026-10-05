/**
 * A backtest whose deals never closed: its net P&L, daily and annualized
 * returns count closed deals only, so they read 0% — a non-result, not a
 * result. Null when at least one deal closed (or the counts are not there).
 */
export function noDealClosed(row: {
  numerical?: { all?: number | null; closed?: number | null } | null;
  financial?: { unrealizedPnL?: number | null } | null;
}): { open: number; unrealized: number } | null {
  const n = row.numerical;
  if (!n || n.closed !== 0 || typeof n.all !== 'number' || n.all <= 0)
    return null;
  return { open: n.all, unrealized: row.financial?.unrealizedPnL ?? 0 };
}

export const NO_DEAL_CLOSED = 'No deal closed';

