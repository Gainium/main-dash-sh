import { describe, expect, test } from 'vitest';

import { splitBankedOpenDealProfit, transformDcaBotToBot } from '@/types/dcaBot';

/**
 * The Combo bot lists (card + table) must split P&L the same way the bot
 * Overview and the deal cards do.
 *
 * Definition: grid profit an OPEN combo deal has already banked is Realized,
 * not Unrealized. `unPnl` is the open deals' deal-wide P&L (banked part
 * inside); `totalProfitUsd` covers closed deals only. The lists must show
 * Realized = totalProfitUsd + openDealsRealizedUsd and
 * Unrealized = unPnl − openDealsRealizedUsd. Net P&L (their sum) is unchanged.
 * DCA bots have nothing banked in open deals, so their split does not move.
 */

const BANKED = 49.39;

const makeCombo = () =>
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
    // Server value: deal-wide P&L of the open deal, banked grid profit inside.
    liveStats: { value: -4.07, relativeValue: -4.07 },
    dealsStatsForBot: [
      {
        dealId: 'deal',
        profit: { total: BANKED, totalUsd: BANKED },
      },
    ],
  }) as never;

describe('combo bot list — banked grid profit of open deals (§Definition)', () => {
  test('Realized gains the banked profit, Unrealized loses it, Net unchanged', () => {
    const bot = transformDcaBotToBot(makeCombo(), [], [], true);
    const s = splitBankedOpenDealProfit(bot);

    expect(s.realizedUsd).toBeCloseTo(49.39, 2);
    expect(s.unrealizedUsd).toBeCloseTo(-53.46, 2);
    expect(s.realizedUsd + s.unrealizedUsd).toBeCloseTo(
      (bot.totalProfitUsd ?? 0) + (bot.unPnl ?? 0),
      6
    );
    // Percent legs move by the same banked amount on their own bases.
    expect(s.unrealizedPerc).toBeCloseTo(
      (bot.unPnlPerc ?? 0) - (bot.openDealsRealizedPerc ?? 0),
      6
    );
    expect(s.realizedPerc).toBeGreaterThan(bot.profitPerc ?? 0);
  });

  test('a bot with nothing banked in open deals (DCA) is unchanged', () => {
    const s = splitBankedOpenDealProfit({
      totalProfitUsd: 12,
      profitPerc: 3,
      unPnl: -5,
      unPnlPerc: -2,
      maxValue: 400,
    });
    expect(s).toEqual({
      realizedUsd: 12,
      realizedPerc: 3,
      unrealizedUsd: -5,
      unrealizedPerc: -2,
    });
  });
});
