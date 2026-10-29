// One bar of McGinley Dynamic for the chart study, the same arithmetic as
// @gainium/indicators' `McGinley` (what the bot engine and the backtester
// run), so the drawn line is the one a bot trades on.
//
// `prev` is the line on the previous bar (NaN before it exists or after a
// gap), `seed` the simple average of the last `length` closes (NaN while the
// window is short or holds a gap). The line starts from the seed, then moves
// by (price − prev) / (length × (price / prev)^4). A close that is not a
// positive number is a gap: NaN, and the line starts over from the next clean
// window's seed.
export function mcginleyNext(
  prev: number,
  price: number,
  seed: number,
  length: number
): number {
  if (!(price > 0)) return NaN;
  if (!Number.isFinite(prev)) return seed > 0 ? seed : NaN;
  return prev + (price - prev) / (length * Math.pow(price / prev, 4));
}
