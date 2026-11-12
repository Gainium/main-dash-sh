import { describe, expect, test } from 'vitest';

import { splitBankedOpenDealProfit, transformDcaBotToBot } from '@/types/dcaBot';

/**
 * Definition: the Unrealized % a combo bot shows is the Unrealized $ over the
 * same basis `unPnlPerc` uses (the open deals' combo usage, USD). The banked
 * grid profit's share of it must therefore be banked ÷ that basis × 100 — not
 * a ratio through `unPnl`, which is undefined when the deals are at breakeven
 * (unPnl = 0) and amplifies `unPnlPerc`'s 2-decimal rounding next to it.
 */

const makeCombo = (
  banked: number,
  liveValue: number,
  liveRelative: number,
  basis = 100
) =>
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
      current: { base: 0, quote: basis },
      max: { base: 0, quote: 400 },
    },
    profit: { total: 0, totalUsd: 0 },
    workingShift: [],
    initialBalances: { base: [], quote: [] },
    currentBalances: { base: [], quote: [] },
    deals: { all: 1, active: 1 },
    dealsInBot: { all: 1, active: 1 },
    liveStats: { value: liveValue, relativeValue: liveRelative },
    dealsStatsForBot: [
      {
        dealId: 'deal',
        symbol: 'BTCUSDT',
        comboTpBase: 'full',
        usage: {
          current: { base: 0, quote: basis },
          max: { base: 0, quote: basis },
        },
        profit: { total: banked, totalUsd: banked },
      },
    ],
  }) as never;

describe('combo Unrealized % basis (liveStats path)', () => {
  test('deal-wide P&L exactly 0 with +50 banked on a $100 basis → Unrealized −50%', () => {
    const bot = transformDcaBotToBot(makeCombo(50, 0, 0), [], [], true);
    const s = splitBankedOpenDealProfit(bot);
    expect(s.unrealizedUsd).toBeCloseTo(-50, 6);
    expect(s.unrealizedPerc).toBeCloseTo(-50, 6);
  });

  test('near-zero deal-wide P&L does not amplify unPnlPerc rounding', () => {
    // value 0.004 on $100 = 0.004% → server rounds relativeValue to 0 (2 dp)…
    // use 0.006 → 0.01% to keep it non-zero but rounded up ~67%.
    const bot = transformDcaBotToBot(makeCombo(50, 0.006, 0.01), [], [], true);
    const s = splitBankedOpenDealProfit(bot);
    // Unrealized $ ≈ −49.99 → on $100 that is ≈ −49.99 %.
    expect(s.unrealizedPerc).toBeCloseTo(0.01 - 50, 6);
  });

  test('unchanged when the ratio was already exact', () => {
    const bot = transformDcaBotToBot(makeCombo(20, 10, 10), [], [], true);
    expect(bot.openDealsRealizedPerc).toBeCloseTo(20, 6);
    expect(splitBankedOpenDealProfit(bot).unrealizedPerc).toBeCloseTo(-10, 6);
  });
});
