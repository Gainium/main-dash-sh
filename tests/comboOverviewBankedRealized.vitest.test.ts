import { describe, expect, test } from 'vitest';

import { transformDcaBotToBot } from '@/types/dcaBot';
import { calculateDealOpenPnl } from '@/lib/utils/tradingMetrics';

/**
 * A combo bot's Overview must split P&L the same way its deal cards do.
 *
 * The bot's `unPnl` is the sum of its open deals' DEAL-WIDE P&L, so the grid
 * profit those deals already banked (`profit.totalUsd`) is inside it. The
 * deal card moves that banked part to Realized (`calculateDealOpenPnl`); the
 * Overview must do the same, which needs the transform to expose the banked
 * amount of the open deals. Realized + Unrealized (= Net) stays unchanged.
 */

const BANKED = 50;

const makeCombo = (liveStats?: { value: number; relativeValue: number }) =>
  ({
    _id: 'bot',
    uuid: 'bot',
    exchange: 'binance',
    exchangeUUID: 'ex',
    status: 'open',
    created: Date.now(),
    symbol: [
      {
        key: 'BTCUSDT',
        value: { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
      },
    ],
    settings: {
      name: 'combo',
      pair: ['BTCUSDT'],
      strategy: 'LONG',
      futures: false,
      coinm: false,
      profitCurrency: 'quote',
    },
    usage: {
      current: { base: 0, quote: 100 },
      max: { base: 0, quote: 200 },
    },
    // Closed deals only — nothing closed yet.
    profit: { total: 0, totalUsd: 0 },
    workingShift: [],
    initialBalances: { base: [], quote: [] },
    currentBalances: { base: [], quote: [] },
    deals: { all: 1, active: 1 },
    dealsInBot: { all: 1, active: 1 },
    liveStats,
    dealsStatsForBot: [
      {
        dealId: 'deal',
        avgPrice: 100,
        usage: {
          current: { base: 0, quote: 100 },
          max: { base: 0, quote: 200 },
        },
        profit: { total: BANKED, totalUsd: BANKED, pureBase: 0, pureQuote: BANKED },
        // 200 started, 150 cash + 1 BTC held. Deal-wide at price 48 = -2.
        initialBalances: { base: 0, quote: 200 },
        currentBalances: { base: 1, quote: 150 },
        symbol: 'BTCUSDT',
        comboTpBase: 'filled',
      },
    ],
  }) as never;

type Out = {
  unPnl: number;
  unPnlPerc: number;
  openDealsRealizedUsd?: number;
  openDealsRealizedPerc?: number;
};

describe('combo bot Overview — banked grid profit of open deals', () => {
  test('priced path: exposes the open deals banked profit next to unPnl', () => {
    const out = transformDcaBotToBot(
      makeCombo(),
      [],
      [{ symbol: 'BTCUSDT', exchange: 'binance', price: 48 }] as never,
      true
    ) as unknown as Out;

    expect(out.unPnl).toBeCloseTo(-2, 2);
    expect(out.openDealsRealizedUsd).toBe(BANKED);
    // Same split the deal card makes.
    expect(out.unPnl - (out.openDealsRealizedUsd ?? 0)).toBeCloseTo(
      calculateDealOpenPnl({
        active: true,
        unrealizedProfit: -2,
        realizedProfit: BANKED,
      }),
      2
    );
    // Percent of the banked part on the same basis as unPnlPerc.
    expect(out.openDealsRealizedPerc).toBeCloseTo(
      (out.unPnlPerc * BANKED) / out.unPnl,
      0
    );
  });

  test('no-price path (server liveStats) splits the same way', () => {
    const out = transformDcaBotToBot(
      // -2 on the deal's filled usage ($100) — the server's combo basis.
      makeCombo({ value: -2, relativeValue: -2 }),
      [],
      [],
      true
    ) as unknown as Out;

    expect(out.unPnl).toBe(-2);
    expect(out.openDealsRealizedUsd).toBe(BANKED);
    // banked ÷ the same $100 basis, not a ratio through unPnl.
    expect(out.openDealsRealizedPerc).toBeCloseTo((BANKED / 100) * 100, 5);
  });
});
