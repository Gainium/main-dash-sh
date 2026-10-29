/**
 * Candle colour for the chart study. A line-for-line copy of `Candle` in
 * @gainium/indicators (what the bot engine and backtester run), which the
 * dashboard does not depend on directly — keep the two in step;
 * `core/tests/candleColour.vitest.test.ts` checks they agree bar by bar.
 *
 * Colour of the regular candle (open / close) or of its Heikin Ashi
 * transform (TradingView's built-in formula): green (1) close > open, red
 * (−1) close < open, 0 on a doji, which breaks every run. `streak` is the
 * signed length of the current run, capped at ±1000. Heikin Ashi reports
 * nothing for the first 29 candles, so no value depends on where the history
 * starts; regular reports from the first.
 */

export type CandleColourSource = 'regular' | 'heikinAshi';

export type CandleColourValue = {
  color: number;
  streak: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

/** Largest |streak| reported. */
export const CANDLE_STREAK_CAP = 1000;

/** Heikin Ashi candles fed before the first value. */
export const CANDLE_HA_SETTLE = 30;

/** Anything but 'regular' is Heikin Ashi (the default). */
export const resolveCandleColourSource = (
  source?: string | null
): CandleColourSource => (source === 'regular' ? 'regular' : 'heikinAshi');

export class CandleColourState {
  readonly source: CandleColourSource;
  private bars = 0;
  private haOpen = NaN;
  private haClose = NaN;
  private streak = 0;

  constructor(source?: string | null) {
    this.source = resolveCandleColourSource(source);
  }

  next(
    o: number,
    h: number,
    l: number,
    c: number
  ): CandleColourValue | null {
    this.bars += 1;
    let open = o;
    let high = h;
    let low = l;
    let close = c;
    if (this.source === 'heikinAshi') {
      const prevOpen = this.haOpen;
      const prevClose = this.haClose;
      close = (o + h + l + c) / 4;
      open = isNaN(prevOpen) ? (o + c) / 2 : (prevOpen + prevClose) / 2;
      high = Math.max(h, open, close);
      low = Math.min(l, open, close);
      this.haOpen = open;
      this.haClose = close;
      if (this.bars < CANDLE_HA_SETTLE) {
        return null;
      }
    }
    const color = close > open ? 1 : close < open ? -1 : 0;
    const prev = this.streak;
    let streak: number;
    if (color === 0) {
      streak = 0;
    } else if (Math.sign(prev) === color) {
      streak = Math.min(Math.abs(prev) + 1, CANDLE_STREAK_CAP) * color;
    } else {
      streak = color;
    }
    this.streak = streak;
    return { color, streak, open, high, low, close };
  }

  /** A copy to preview an open candle without touching this state. */
  clone(): CandleColourState {
    return Object.assign(
      Object.create(Object.getPrototypeOf(this)) as CandleColourState,
      this
    );
  }
}
