import { test, expect } from '@playwright/test';

import {
  calculateDealCost,
  calculateDealSize,
  calculateDealValue,
  type DealMetricsInput,
} from '@/lib/utils/tradingMetrics';
import { BotMarginTypeEnum, DCADealStatusEnum, StrategyEnum } from '@/types';

/**
 * Regression tests for the leverage handling in the deal cost/value/size
 * helpers. Bug #40 ("V2 calculation error for DCA orders"): on a leveraged
 * futures deal the Notional Value column equalled the Cost column because the
 * call sites (OpenOrdersWidget, dcaDeal mapDeal, Trading page) built the
 * metrics input without `leverage`/`marginType`, so `getLeverage()` fell back
 * to 1x and the notional multiplier collapsed onto cost.
 *
 * Notional (value) must be Cost × leverage for a leveraged futures deal; Cost
 * itself is leverage-invariant (the leverage cancels), which is exactly why
 * only the Notional column was visibly wrong. Applies to every futures bot
 * type — plain DCA, Combo, and Hedge Combo all funnel through these helpers.
 */
test.describe('tradingMetrics leverage handling', () => {
  const baseFuturesLong: DealMetricsInput = {
    strategy: StrategyEnum.long,
    status: DCADealStatusEnum.open,
    avgPrice: 50,
    usage: { current: { base: 0, quote: 100 } },
    futures: true,
    coinm: false,
    marginType: BotMarginTypeEnum.cross,
    leverage: 10,
  };

  test('Notional Value = Cost × leverage on a 10x USD-M futures deal', () => {
    const cost = calculateDealCost(baseFuturesLong);
    const value = calculateDealValue(baseFuturesLong);

    // quote usage 100, 10x → margin cost 100, notional 1000.
    expect(cost).toBeCloseTo(100, 6);
    expect(value).toBeCloseTo(1000, 6);
    expect(value).toBeCloseTo(cost * 10, 6);
  });

  test('regression: omitting leverage collapses Notional onto Cost (the bug)', () => {
    const { leverage: _l, marginType: _m, ...noLeverage } = baseFuturesLong;
    const cost = calculateDealCost(noLeverage);
    const value = calculateDealValue(noLeverage);

    // With no leverage supplied getLeverage() falls back to 1x — the reported
    // symptom: Notional == Cost.
    expect(value).toBeCloseTo(cost, 6);
    expect(value).toBeCloseTo(100, 6);
  });

  test('marginType "inherit" forces 1x so Notional == Cost', () => {
    const inherited: DealMetricsInput = {
      ...baseFuturesLong,
      marginType: BotMarginTypeEnum.inherit,
    };
    const cost = calculateDealCost(inherited);
    const value = calculateDealValue(inherited);

    expect(value).toBeCloseTo(cost, 6);
  });

  test('spot deals are unaffected (no leverage, Notional == Cost)', () => {
    const spotLong: DealMetricsInput = {
      strategy: StrategyEnum.long,
      status: DCADealStatusEnum.open,
      avgPrice: 50,
      usage: { current: { base: 0, quote: 100 } },
      futures: false,
      coinm: false,
      leverage: 10, // ignored for spot
    };
    const cost = calculateDealCost(spotLong);
    const value = calculateDealValue(spotLong);

    expect(cost).toBeCloseTo(100, 6);
    expect(value).toBeCloseTo(100, 6);
  });

  test('COIN-M futures notional also scales with leverage', () => {
    const coinmShort: DealMetricsInput = {
      strategy: StrategyEnum.short,
      status: DCADealStatusEnum.open,
      avgPrice: 50,
      usage: { current: { base: 2, quote: 0 } },
      futures: true,
      coinm: true,
      marginType: BotMarginTypeEnum.isolated,
      leverage: 5,
    };
    const cost = calculateDealCost(coinmShort);
    const value = calculateDealValue(coinmShort);

    // base 2 × avgPrice 50 = 100 notional per 1x → cost 100, notional 500 at 5x.
    expect(cost).toBeCloseTo(100, 6);
    expect(value).toBeCloseTo(500, 6);
    expect(value).toBeCloseTo(cost * 5, 6);
  });
});
