/**
 * Unique X-axis keys for recharts charts.
 *
 * Recharts (>=3) resolves an **axis** tooltip's row by finding the FIRST entry
 * whose axis `dataKey` equals the hovered tick's value — `findEntryInArray`
 * inside `combineTooltipPayload` — and NOT by the hovered index. So a chart
 * keyed on a label that repeats across rows silently reports the wrong point:
 * the cursor line stays under the mouse while the tooltip text, its value and
 * the active dot all jump to the first row carrying that label.
 *
 * Labels repeat easily. A short month name over a 12-month range is the same
 * string 30 times ("Aug"); "14:30" recurs every day of an intraday candle
 * series; two backtests can share a name; rounded bucket edges can collide.
 * `allowDuplicatedCategory` does not guard this path — the lookup runs whenever
 * the axis has an explicit `dataKey`.
 *
 * The fix is to key the axis on something unique per row and render the real
 * label through `tickFormatter`:
 *
 *     const data = useMemo(() => withAxisIndex(rows), [rows]);
 *     <XAxis {...axisIndexProps(data, (row) => row.date)} />
 *
 * Call `withAxisIndex` inside the memo that builds the data — it copies every
 * row, so calling it in render would hand recharts a new array each pass.
 */

/** The row property both helpers agree on. Underscored so it can never collide
 *  with a spread-in series key (asset symbols, metric names, …). */
export const AXIS_INDEX_KEY = '__axisIndex';

export type AxisIndexed<T> = T & { __axisIndex: number };

/** Stamp each row with its position, for use as the axis `dataKey`. */
export function withAxisIndex<T extends object>(
  rows: readonly T[]
): AxisIndexed<T>[] {
  return rows.map((row, index) => ({ ...row, __axisIndex: index }));
}

/**
 * `dataKey` + `tickFormatter` for an axis keyed on {@link withAxisIndex}.
 * `label` receives the row the tick belongs to and returns what to display;
 * spread the result onto the axis and keep every other prop as it was.
 */
export function axisIndexProps<T>(
  rows: readonly T[],
  label: (row: T, index: number) => string | number | null | undefined
): { dataKey: string; tickFormatter: (value: number) => string } {
  return {
    dataKey: AXIS_INDEX_KEY,
    tickFormatter: (value: number) => {
      const row = rows[value];
      if (row === undefined) return '';
      const text = label(row, value);
      return text == null ? '' : String(text);
    },
  };
}
