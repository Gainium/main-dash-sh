/**
 * A backtest fee as a number, or `null` when there is none. A cleared field
 * (`''`) or a fee lookup that never resolved is "unknown", not 0 — running it
 * as 0 silently backtests a fee-free strategy.
 */
export const toBacktestFee = (
  fee: string | number | null | undefined
): number | null => {
  if (fee === undefined || fee === null || fee === '') return null;
  const n = Number(fee);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
