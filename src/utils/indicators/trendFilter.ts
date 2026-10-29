import { IndicatorEnum } from '@/types';

/**
 * The indicator types with a trend filter: MAR and the Moving Average. The
 * filter reads the indicator's own trend, which no other type has — the bot
 * engine and the backtester keep a condition of any other type false while
 * `trendFilter` is on.
 */
export const TREND_FILTER_TYPES: ReadonlySet<string> = new Set<string>([
  IndicatorEnum.ma,
  IndicatorEnum.mar,
]);

/**
 * The row with `trendFilter` off when its type has no trend filter. A
 * condition whose type was switched (MAR with the filter on, changed to KDJ)
 * keeps the old row's fields, and a leftover `trendFilter: true` would leave
 * it never firing. Rows without the flag, and MA / MAR rows, are returned
 * as they are.
 */
export const clearStrayTrendFilter = <
  T extends { type: IndicatorEnum | string; trendFilter?: boolean | null },
>(
  row: T
): T =>
  row.trendFilter && !TREND_FILTER_TYPES.has(row.type)
    ? { ...row, trendFilter: false }
    : row;
