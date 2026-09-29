/**
 * dealToTradingView.ts — pure transform from a backtest `PreparedDeal` into
 * the props the shared `TradingViewChart` embed needs to render a completed
 * DCA deal exactly like the manual backtester / legacy main-dash plots it:
 *
 *  - real candles (resolved from the symbol + interval by the chart datafeed),
 *  - one buy/sell ICON per filled order, from `rawDeal.transactions`,
 *  - horizontal line SEGMENTS (start→end time, NOT full-width) for every
 *    order level, the stepped averaged-entry line, and the stepped
 *    take-profit line — all sourced from `rawDeal.ordersHistory`, which the
 *    backtester pre-computes with one entry per distinct level/value
 *    (`avgLine: true` marks the synthetic average line; the take-profit
 *    SELL orders re-placed after each DCA fill give the stepped TP).
 *
 * This mirrors legacy `getOrdersForDrawing` in
 * `main-dash/components/dcabot/hooks/useDCAPage.ts`: map `ordersHistory`
 * to `{ side: avgLine ? 'GREY' : side, startTime, endTime: filledTime, price }`.
 * The chart's `renderOrderDrawings` draws each as a `trend_line` segment and
 * filters out degenerate / off-screen segments, so the lines "step" as each
 * fill shifts the average and take-profit.
 *
 * Framework-free; the component just spreads the result onto the chart.
 */

import {
  ExchangeIntervals,
  type ChartOrderDrawing,
  type PreparedDeal,
  type PreparedTransaction,
  type Symbols,
  type TransactionChart,
} from '@/types';


/** ~20 bars of padding around the deal window, in seconds, per interval. */
const PAD_BARS = 20;

/**
 * Inverse of `RESOLUTION_TO_INTERVAL_MAP` in
 * `@/utils/tradingView/historyApi.ts`: map an {@link ExchangeIntervals} value
 * (`'1h'`, `'15m'`, `'1d'`, …) to the TradingView resolution string the chart
 * expects (`'60'`, `'15'`, `'1D'`, …). Defaults to `'60'` (1h) for anything
 * unrecognized.
 */
const INTERVAL_TO_RESOLUTION: Record<ExchangeIntervals, string> = {
  [ExchangeIntervals.oneM]: '1',
  [ExchangeIntervals.threeM]: '3',
  [ExchangeIntervals.fiveM]: '5',
  [ExchangeIntervals.fifteenM]: '15',
  [ExchangeIntervals.thirtyM]: '30',
  [ExchangeIntervals.oneH]: '60',
  [ExchangeIntervals.twoH]: '120',
  [ExchangeIntervals.fourH]: '240',
  [ExchangeIntervals.eightH]: '480',
  [ExchangeIntervals.oneD]: '1D',
  [ExchangeIntervals.oneW]: '1W',
};

/** Seconds-per-bar for each TradingView resolution (used for timeframe pad). */
const RESOLUTION_SECONDS: Record<string, number> = {
  '1': 60,
  '3': 180,
  '5': 300,
  '15': 900,
  '30': 1800,
  '60': 3600,
  '120': 7200,
  '240': 14400,
  '480': 28800,
  '1D': 86400,
  '1W': 604800,
};

/**
 * TradingView's first request for a chart opened on a `timeframe` loads every
 * bar from the frame's start up to NOW, so framing an old deal costs the
 * distance to today, not the deal's length. At the run's own resolution the
 * range is normally already cached by the backtest, so a large load is still
 * fast up to this many bars.
 */
const RUN_RESOLUTION_MAX_BARS = 50_000;

/**
 * Beyond that, the deal is framed at a coarser resolution, which is usually
 * not cached — so it must stay a few exchange pages, fetched in seconds.
 */
const COARSE_RESOLUTION_MAX_BARS = 5_000;

/** Coarser resolutions, finest first, available on every supported venue. */
const COARSE_RESOLUTIONS = ['5', '15', '30', '60', '240', '1D', '1W'];

/**
 * The resolution to frame a chart starting at `fromSec` with: the run's own,
 * unless loading from there to now would be too large, in which case the
 * finest coarser one that fits. Never finer than the run's.
 */
function framingResolution(
  runResolution: string,
  fromSec: number,
  nowSec: number,
): string {
  const barsToNow = (res: string) =>
    (nowSec - fromSec) / (RESOLUTION_SECONDS[res] ?? 3600);
  if (barsToNow(runResolution) <= RUN_RESOLUTION_MAX_BARS) return runResolution;
  const runSeconds = RESOLUTION_SECONDS[runResolution] ?? 3600;
  const coarser = COARSE_RESOLUTIONS.filter(
    (res) => RESOLUTION_SECONDS[res] > runSeconds,
  );
  return (
    coarser.find((res) => barsToNow(res) <= COARSE_RESOLUTION_MAX_BARS) ??
    coarser[coarser.length - 1] ??
    runResolution
  );
}

/**
 * Map an `ExchangeIntervals` enum value (or raw string) to a TradingView
 * resolution string. Unknown / missing → `'60'`.
 */
export function intervalToResolution(
  interval: ExchangeIntervals | string | undefined,
): string {
  if (!interval) return '60';
  return INTERVAL_TO_RESOLUTION[interval as ExchangeIntervals] ?? '60';
}

/** Coerce a price-ish string|number to a finite positive number, else null. */
function px(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : null;
}

/** "PAIR@EXCHANGE" string the chart's datafeed expects, or undefined. */
function symbolString(sym: Symbols | undefined): string | undefined {
  if (!sym?.pair || !sym?.exchange) return undefined;
  return `${sym.pair}@${sym.exchange}`;
}

/**
 * Build one buy/sell execution ICON per FILLED order. The executions of a
 * backtest deal live in `filledOrders` (each a grid order with a `filledTime`
 * and `side`) — same source the deals table uses — not in `transactions`,
 * which is empty for backtests. We fall back to `transactions` only if a deal
 * carries no filled orders. Zero/invalid prices are skipped. Time stays in
 * ms — the chart normalizes ms→s internally.
 */
function transactionsFromDeal(
  rawDeal: PreparedDeal,
): (TransactionChart & { entity?: undefined })[] {
  const out: (TransactionChart & { entity?: undefined })[] = [];

  for (const o of rawDeal.filledOrders ?? []) {
    const price = px(o.price);
    if (price == null || o.filledTime == null) continue;
    out.push({
      // Pass the raw side through (legacy parity) — the chart lowercases it
      // and treats buy/long as a buy icon, sell/short as a sell icon.
      id: o.id,
      side: String(o.side),
      time: o.filledTime,
      price,
    });
  }
  if (out.length > 0) return out;

  // Fallback: live/manual results that populate `transactions` instead.
  const txns: PreparedTransaction[] = rawDeal.transactions ?? [];
  for (const txn of txns) {
    const isBuy = String(txn.side).toUpperCase() === 'BUY';
    const price = px(isBuy ? txn.priceBuy : txn.priceSell);
    if (price == null) continue;
    out.push({
      id: txn._id,
      side: isBuy ? 'buy' : 'sell',
      time: txn.updateTime,
      price,
    });
  }
  return out;
}

/** A minimal OHLC bar — only the extremes are needed to detect a price cross. */
export interface ClipCandle {
  time: number; // ms
  high: number;
  low: number;
}

/** True when `side` denotes a buy / long order. */
function isBuySide(side: unknown): boolean {
  const s = String(side).toUpperCase();
  return s.includes('BUY') || s.includes('LONG');
}

/** Build the minigrid → genuine `closeTime` map (open minigrids have none). */
function minigridCloseMap(rawDeal: PreparedDeal): Map<string, number> {
  const m = new Map<string, number>();
  for (const mg of rawDeal.mingrids ?? []) {
    if (mg.id && mg.closeTime != null && Number.isFinite(Number(mg.closeTime))) {
      m.set(mg.id, Number(mg.closeTime));
    }
  }
  return m;
}

/**
 * First candle STRICTLY after `afterMs` whose range reaches `price` for the
 * given side (BUY fills when `low <= price`, SELL when `high >= price`), i.e.
 * when a resting order at that level would execute. Null if price never gets
 * there. `bars` must be ascending by time.
 */
function firstCrossTime(
  bars: ClipCandle[],
  afterMs: number,
  buy: boolean,
  price: number,
): number | null {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].time <= afterMs) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < bars.length; i++) {
    const c = bars[i];
    if (buy ? c.low <= price : c.high >= price) return c.time;
  }
  return null;
}

/** Merge overlapping/touching spans within one (side, price) group. */
function mergeSpans(
  side: string,
  price: number,
  spans: Array<[number, number]>,
): ChartOrderDrawing[] {
  spans.sort((a, b) => a[0] - b[0]);
  const out: ChartOrderDrawing[] = [];
  let cur: [number, number] | null = null;
  for (const s of spans) {
    if (cur && s[0] <= cur[1]) {
      if (s[1] > cur[1]) cur[1] = s[1];
    } else {
      if (cur) out.push({ price, side, startTime: cur[0], endTime: cur[1] });
      cur = [s[0], s[1]];
    }
  }
  if (cur) out.push({ price, side, startTime: cur[0], endTime: cur[1] });
  return out;
}

/**
 * Reconstruct each resting order's life from the PRICE PATH (the chart's
 * candles) — the robust source of truth.
 *
 * `ordersHistory[].filledTime` is NOT a reliable "this order executed" signal:
 * the backtester also stamps it on minigrid regrids, grid recomputes and SL
 * moves, none of which take the order off a real exchange. So we ignore it for
 * the line END and instead compute, per placement:
 *
 *   end = the first candle after `startTime` that reaches the order's price
 *         (BUY: low ≤ price, SELL: high ≥ price) — when it would fill — capped
 *         by its minigrid `closeTime` (TP → leftover orders cancelled) or the
 *         deal end. A level the price never reaches rests to the cap.
 *
 * Per-placement segments are unioned per (minigridId, side, price): a grid
 * level that re-arms and fills repeatedly tiles into one continuous line, a
 * one-shot order ends at its fill, and a sell far above a crashed market keeps
 * resting. This fixes both the "a new minigrid deletes earlier lines" and the
 * "a buy line continues after it filled" artifacts.
 */
function linesByPriceCross(
  history: PreparedDeal['ordersHistory'],
  candles: ClipCandle[],
  minigridClose: Map<string, number>,
  fallbackEndMs: number,
): ChartOrderDrawing[] {
  const last = candles[candles.length - 1];
  const bars =
    candles[0] && last && candles[0].time <= last.time
      ? candles
      : [...candles].sort((a, b) => a.time - b.time);

  const groups = new Map<
    string,
    { side: string; price: number; spans: Array<[number, number]> }
  >();

  for (const o of history) {
    const price = px(o.price);
    if (price == null) continue;
    const start = o.startTime ?? fallbackEndMs;
    const buy = isBuySide(o.side);

    const cap =
      o.minigridId != null && minigridClose.has(o.minigridId)
        ? (minigridClose.get(o.minigridId) as number)
        : fallbackEndMs;

    const cross = firstCrossTime(bars, start, buy, price);
    const end = cross != null ? Math.min(cross, cap) : cap;
    if (!(end > start)) continue;

    const key = `${o.minigridId ?? ''}|${buy ? 'B' : 'S'}|${price.toFixed(2)}`;
    const g = groups.get(key);
    if (g) g.spans.push([start, end]);
    else
      groups.set(key, { side: String(o.side), price, spans: [[start, end]] });
  }

  const out: ChartOrderDrawing[] = [];
  for (const { side, price, spans } of groups.values()) {
    out.push(...mergeSpans(side, price, spans));
  }
  return out;
}

/**
 * Fallback used only before the chart's candles are available: collapse each
 * (minigridId, side, price) level and end it at its LAST genuine fill (an id in
 * `filledOrders`), else its minigrid `closeTime`, else the deal end. Less
 * precise than {@link linesByPriceCross} but renders something sensible
 * immediately; it is replaced as soon as candles load.
 */
function linesByFilledHeuristic(
  history: PreparedDeal['ordersHistory'],
  filledOrders: PreparedDeal['filledOrders'],
  minigridClose: Map<string, number>,
  fallbackEndMs: number,
): ChartOrderDrawing[] {
  const realFillIds = new Set<string>();
  for (const o of filledOrders ?? []) {
    if (o.id != null) realFillIds.add(o.id);
  }

  interface Level {
    side: string;
    price: number;
    start: number;
    lastRealFill: number | null;
    minigridIds: Set<string>;
    hasLooseOrder: boolean;
  }
  const levels = new Map<string, Level>();

  for (const o of history) {
    const price = px(o.price);
    if (price == null) continue;
    const start = o.startTime ?? fallbackEndMs;
    const key = `${o.minigridId ?? ''}|${o.side}|${price.toFixed(2)}`;
    let lvl = levels.get(key);
    if (!lvl) {
      lvl = {
        side: String(o.side),
        price,
        start,
        lastRealFill: null,
        minigridIds: new Set(),
        hasLooseOrder: false,
      };
      levels.set(key, lvl);
    }
    if (start < lvl.start) lvl.start = start;
    if (o.id != null && realFillIds.has(o.id) && o.filledTime != null) {
      lvl.lastRealFill = Math.max(lvl.lastRealFill ?? 0, o.filledTime);
    }
    if (o.minigridId != null) lvl.minigridIds.add(o.minigridId);
    else lvl.hasLooseOrder = true;
  }

  const out: ChartOrderDrawing[] = [];
  for (const lvl of levels.values()) {
    let end: number;
    if (lvl.lastRealFill != null) {
      end = lvl.lastRealFill;
    } else {
      const allClosed =
        !lvl.hasLooseOrder &&
        lvl.minigridIds.size > 0 &&
        [...lvl.minigridIds].every((m) => minigridClose.has(m));
      end = allClosed
        ? Math.max(
            ...[...lvl.minigridIds].map((m) => minigridClose.get(m) as number),
          )
        : fallbackEndMs;
    }
    if (end > lvl.start) {
      out.push({
        price: lvl.price,
        side: lvl.side,
        startTime: lvl.start,
        endTime: end,
      });
    }
  }
  return out;
}

/**
 * Plain DCA lines: one segment per `ordersHistory` entry, `[startTime,
 * filledTime ?? dealEnd]`. A DCA deal has no minigrids, and its `filledTime` is
 * meaningful for EVERY entry type — a real fill for a safety buy (so the line
 * ends where it filled), the re-placement time for the single take-profit (so
 * the chained TP entries render as ONE stepping line), and the step time for
 * the averaged-entry line. So the original per-entry mapping is exactly right
 * here; the combo-only `filledTime` ambiguity that needs price-cross
 * reconstruction does not apply.
 */
function linesByPerEntry(
  history: PreparedDeal['ordersHistory'],
  fallbackEndMs: number,
): ChartOrderDrawing[] {
  const out: ChartOrderDrawing[] = [];
  for (const o of history) {
    const price = px(o.price);
    if (price == null) continue;
    const start = o.startTime ?? fallbackEndMs;
    const end = o.filledTime ?? fallbackEndMs;
    if (end > start) {
      out.push({ price, side: String(o.side), startTime: start, endTime: end });
    }
  }
  return out;
}

/**
 * Build the horizontal order-book lines for the deal from `ordersHistory`.
 *
 * The two bot families need different treatment because `filledTime` means
 * different things:
 *   - **DCA** (no minigrids): `filledTime` is reliable for every entry, so we
 *     map one segment per entry ({@link linesByPerEntry}) — safety buys end at
 *     their fill, the single TP steps, the average steps.
 *   - **Combo** (minigrids): the backtester also stamps `filledTime` on grid
 *     regrids, so we reconstruct each line's true exit from the price path
 *     ({@link linesByPriceCross}) — or, before candles load, from a filled-order
 *     heuristic ({@link linesByFilledHeuristic}).
 *
 * The averaged-entry line (`avgLine`) keeps its native per-step grey segments
 * in all cases.
 */
function orderDrawingsFromDeal(
  rawDeal: PreparedDeal,
  fallbackEndMs: number,
  candles?: ClipCandle[],
): ChartOrderDrawing[] {
  const history = rawDeal.ordersHistory ?? [];
  const isCombo = (rawDeal.mingrids?.length ?? 0) > 0;

  // Average-entry line: native grey per-step segments.
  const avgSegments: ChartOrderDrawing[] = [];
  for (const o of history) {
    if (!o.avgLine) continue;
    const price = px(o.price);
    if (price == null) continue;
    avgSegments.push({
      price,
      side: 'GREY',
      startTime: o.startTime ?? fallbackEndMs,
      endTime: o.filledTime ?? fallbackEndMs,
    });
  }

  const concrete = history.filter((o) => !o.avgLine);
  let out: ChartOrderDrawing[];
  if (!isCombo) {
    out = linesByPerEntry(concrete, fallbackEndMs);
  } else if (candles && candles.length > 0) {
    out = linesByPriceCross(
      concrete,
      candles,
      minigridCloseMap(rawDeal),
      fallbackEndMs,
    );
  } else {
    out = linesByFilledHeuristic(
      concrete,
      rawDeal.filledOrders ?? [],
      minigridCloseMap(rawDeal),
      fallbackEndMs,
    );
  }

  return [...out, ...avgSegments];
}

/** Shape returned by {@link dealToTradingView}. */
export interface DealTradingViewProps {
  symbol: string | undefined;
  availableSymbols: Symbols[];
  interval: string;
  initialTimeframe: { from: number; to: number };
  transactions: (TransactionChart & { entity?: undefined })[];
  ordersForDrawing: ChartOrderDrawing[];
}

/**
 * Transform a `PreparedDeal` into the read-only embed props for
 * `TradingViewChart`. `intervalResolution` is the run-level resolution
 * (constant across deals), already mapped via {@link intervalToResolution}.
 * `fallbackEndMs` is the deal's effective end (its close time, or the
 * backtest's last data time for a still-open deal) — used as the end of any
 * order segment that never filled. `candles` (the chart's bars for this
 * symbol/interval) let order lines be clipped at the real price cross; omit
 * them and the lines fall back to the filled-order heuristic. The returned
 * `interval` is the run's resolution unless the deal is too far back to load
 * at it (see {@link framingResolution}).
 */
export function dealToTradingView(
  rawDeal: PreparedDeal,
  intervalResolution: string,
  fallbackEndMs: number,
  candles?: ClipCandle[],
  nowMs: number = Date.now(),
): DealTradingViewProps {
  const sym = rawDeal.symbol;
  const symbol = symbolString(sym);
  const availableSymbols = sym ? [sym] : [];

  const endMs = rawDeal.closedTime ?? fallbackEndMs;
  const startSec = Math.floor((rawDeal.startTime || fallbackEndMs) / 1000);
  const endSec = Math.floor((endMs || fallbackEndMs) / 1000);
  const runPad =
    PAD_BARS * (RESOLUTION_SECONDS[intervalResolution] ?? 3600);
  const interval = framingResolution(
    intervalResolution,
    startSec - runPad,
    Math.floor(nowMs / 1000),
  );
  const pad = PAD_BARS * (RESOLUTION_SECONDS[interval] ?? 3600);
  const initialTimeframe = {
    from: startSec - pad,
    to: endSec + pad,
  };

  return {
    symbol,
    availableSymbols,
    interval,
    initialTimeframe,
    transactions: transactionsFromDeal(rawDeal),
    ordersForDrawing: orderDrawingsFromDeal(
      rawDeal,
      endMs || fallbackEndMs,
      candles,
    ),
  };
}
