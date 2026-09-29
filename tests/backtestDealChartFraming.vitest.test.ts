import { describe, expect, test } from 'vitest';

import { dealToTradingView } from '@/components/widgets/bots/backtest/redesign/dealToTradingView';
import type { PreparedDeal } from '@/types';

/**
 * The backtest deal chart opens framed on the deal (TradingView `timeframe`
 * option). TradingView loads every bar from the frame's start up to NOW in
 * its first request, so the cost is the distance from the deal to today, not
 * the deal's length. Framing an old deal at a fine resolution asked for
 * hundreds of thousands of 1m bars and the chart never became ready.
 */

const NOW_MS = Date.UTC(2026, 8, 25, 14, 0);
const DAY_MS = 86_400_000;

const deal = (startMs: number, closedMs: number): PreparedDeal =>
  ({
    symbol: { pair: 'AVAXUSDT', exchange: 'paperBinance' },
    ordersHistory: [],
    filledOrders: [],
    mingrids: [],
    transactions: [],
    startTime: startMs,
    closedTime: closedMs,
  }) as unknown as PreparedDeal;

const SECONDS: Record<string, number> = {
  '1': 60,
  '5': 300,
  '15': 900,
  '30': 1800,
  '60': 3600,
  '240': 14400,
  '1D': 86400,
  '1W': 604800,
};

/** Bars TradingView's first request covers: frame start → now. */
const barsToNow = (p: ReturnType<typeof dealToTradingView>) =>
  (NOW_MS / 1000 - p.initialTimeframe.from) / SECONDS[p.interval];

describe('backtest deal chart framing', () => {
  test('an old deal on a 1m run is framed at a resolution whose load from now stays a few pages', () => {
    const start = Date.UTC(2021, 1, 14, 17, 35);
    const p = dealToTradingView(deal(start, start + 2 * DAY_MS), '1', NOW_MS, undefined, NOW_MS);
    expect(barsToNow(p)).toBeLessThanOrEqual(5000);
    // Still framed on the deal.
    expect(p.initialTimeframe.from).toBeLessThan(start / 1000);
    expect(p.initialTimeframe.to).toBeGreaterThan((start + 2 * DAY_MS) / 1000);
  });

  test('a months-old 1m deal is coarsened, not left at 1m', () => {
    const start = NOW_MS - 240 * DAY_MS;
    const p = dealToTradingView(deal(start, start + DAY_MS), '1', NOW_MS, undefined, NOW_MS);
    expect(p.interval).not.toBe('1');
    expect(barsToNow(p)).toBeLessThanOrEqual(5000);
  });

  test('a recent deal keeps the run resolution', () => {
    const start = NOW_MS - 20 * DAY_MS;
    const p = dealToTradingView(deal(start, start + DAY_MS), '1', NOW_MS, undefined, NOW_MS);
    expect(p.interval).toBe('1');
  });

  test('a coarse run is never made finer', () => {
    const start = NOW_MS - 3 * 365 * DAY_MS;
    const p = dealToTradingView(deal(start, start + 30 * DAY_MS), '1D', NOW_MS, undefined, NOW_MS);
    expect(p.interval).toBe('1D');
  });
});
