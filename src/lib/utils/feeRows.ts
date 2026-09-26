/**
 * Fee rows (`{exchange, symbol, fee}`) in a canonical order, and an equality
 * check, so a caller that re-fetches fees can keep its previous state when
 * nothing changed.
 *
 * The bot list pages refetch fees whenever their bot list's identity changes
 * and used to store the result unconditionally. A new array every time meant
 * a re-render every time, so any upstream identity churn (a list that was
 * re-sliced on each render) became an endless fetch → setState → render
 * loop that re-rendered every visible card.
 */
export interface FeeRow {
  exchange: string;
  symbol: string;
  fee: number;
}

export const toSortedFeeRows = (
  rows: ReadonlyArray<{ exchangeUUID: string; symbol: string; maker: number }>
): FeeRow[] =>
  rows
    .map((r) => ({ exchange: r.exchangeUUID, symbol: r.symbol, fee: r.maker }))
    .sort((a, b) =>
      a.exchange === b.exchange
        ? a.symbol.localeCompare(b.symbol)
        : a.exchange.localeCompare(b.exchange)
    );

export const sameFeeRows = (
  a: readonly FeeRow[],
  b: readonly FeeRow[]
): boolean =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.exchange === b[i].exchange &&
      r.symbol === b[i].symbol &&
      r.fee === b[i].fee
  );
