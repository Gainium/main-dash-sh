import { test, expect } from '@playwright/test';

import {
  BotOrderSideEnum,
  DCAOrderTypeEnum,
  StrategyEnum,
  type DCAGrid,
} from '@/types';
import {
  buildDealLiquidationContext,
  computeDealLiquidation,
  computeLadderLiquidation,
  estimateLiquidationPrice,
} from '@/utils/bots/dca/liquidation';

/**
 * The estimated liquidation price is the first number in the dashboard a user
 * will compare against their exchange, and the first they will act on — the
 * community thread that asked for it (#5102) wants it to answer "does my
 * ladder liquidate before it finishes deploying?". Both halves of that are
 * locked here: the price itself, and the cascade detection that decides which
 * price is the operative one.
 */

const MMR = 0.005;

const order = (
  price: number,
  qty: number,
  overrides: Partial<DCAGrid> = {}
): DCAGrid =>
  ({
    id: `o-${price}`,
    price,
    qty,
    side: BotOrderSideEnum.buy,
    type: DCAOrderTypeEnum.dca,
    pair: 'BTC/USDT',
    strategy: StrategyEnum.long,
    ...overrides,
  }) as DCAGrid;

test('long liquidation sits 1/L below entry, widened by the maintenance margin', () => {
  // 10x long from 100: bankruptcy at 90, liquidation slightly above it because
  // maintenance margin must still be covered.
  const liq = estimateLiquidationPrice(100, { side: 'long', leverage: 10 });
  expect(liq).toBeCloseTo((100 * (1 - 1 / 10)) / (1 - MMR), 8);
  expect(liq).toBeGreaterThan(90);
});

test('short liquidation sits 1/L above entry, tightened by the maintenance margin', () => {
  const liq = estimateLiquidationPrice(100, { side: 'short', leverage: 10 });
  expect(liq).toBeCloseTo((100 * (1 + 1 / 10)) / (1 + MMR), 8);
  expect(liq).toBeLessThan(110);
});

test('leverage <= 1 has no liquidation', () => {
  expect(estimateLiquidationPrice(100, { side: 'long', leverage: 1 })).toBeNull();
  expect(estimateLiquidationPrice(100, { side: 'long', leverage: 0 })).toBeNull();
  expect(computeLadderLiquidation([order(100, 1)], { side: 'long', leverage: 1 })).toBeNull();
});

test('ladder liquidation falls step by step as safety orders drag the average down', () => {
  const orders = [
    order(100, 1, { type: DCAOrderTypeEnum.bo, avgPrice: 100 }),
    order(90, 1, { avgPrice: 95 }),
    order(80, 1, { avgPrice: 90 }),
  ];
  const result = computeLadderLiquidation(orders, { side: 'long', leverage: 5 });

  expect(result?.steps.map((s) => s.avgPrice)).toEqual([100, 95, 90]);
  const prices = (result?.steps ?? []).map((s) => s.liquidationPrice ?? 0);
  expect(prices[0]).toBeGreaterThan(prices[1]);
  expect(prices[1]).toBeGreaterThan(prices[2]);
  expect(prices[0]).toBeCloseTo((100 * (1 - 1 / 5)) / (1 - MMR), 8);
});

test('exit orders are not part of the entry ladder', () => {
  const orders = [
    order(100, 1, { type: DCAOrderTypeEnum.bo, avgPrice: 100 }),
    order(110, 1, { type: DCAOrderTypeEnum.tp, side: BotOrderSideEnum.sell, avgPrice: 100 }),
    order(90, 1, { avgPrice: 95 }),
  ];
  const result = computeLadderLiquidation(orders, { side: 'long', leverage: 5 });
  expect(result?.steps).toHaveLength(2);
  expect(result?.steps.map((s) => s.orderPrice)).toEqual([100, 90]);
});

test('a ladder whose next order sits below liquidation is flagged as a cascade', () => {
  // 20x long: liquidation after the base order is ~95.5, so the safety order
  // resting at 90 can never fill — the deal liquidates on the way down.
  const orders = [
    order(100, 1, { type: DCAOrderTypeEnum.bo, avgPrice: 100 }),
    order(90, 1, { avgPrice: 95 }),
  ];
  const result = computeLadderLiquidation(orders, { side: 'long', leverage: 20 });

  expect(result?.cascadeSteps).toHaveLength(1);
  expect(result?.cascadeSteps[0].index).toBe(0);
  expect(result?.risk).toBe('danger');
  // The operative number is where it ACTUALLY liquidates, not the hypothetical
  // "after every order fills" figure the rest of the ladder implies.
  expect(result?.effective).toBe(result?.cascadeSteps[0]);
  expect(result?.effective?.liquidationPrice).toBeGreaterThan(90);
});

test('with no cascade the operative liquidation is the fully-deployed one', () => {
  const orders = [
    order(100, 1, { type: DCAOrderTypeEnum.bo, avgPrice: 100 }),
    order(95, 1, { avgPrice: 97.5 }),
  ];
  const result = computeLadderLiquidation(orders, { side: 'long', leverage: 3 });
  expect(result?.cascadeSteps).toHaveLength(0);
  expect(result?.effective).toBe(result?.final);
});

test('a short ladder cascades upward', () => {
  const orders = [
    order(100, 1, { type: DCAOrderTypeEnum.bo, side: BotOrderSideEnum.sell, avgPrice: 100 }),
    order(110, 1, { side: BotOrderSideEnum.sell, avgPrice: 105 }),
  ];
  const result = computeLadderLiquidation(orders, { side: 'short', leverage: 20 });
  expect(result?.steps[0].liquidationPrice).toBeLessThan(110);
  expect(result?.cascadeSteps).toHaveLength(1);
});

test('a live deal projects from the position it already holds', () => {
  // 2 BTC held at 100 average; one safety order for 2 BTC resting at 90.
  const result = computeDealLiquidation([order(90, 2)], {
    side: 'long',
    leverage: 5,
    avgPrice: 100,
    positionQty: 2,
  });

  expect(result?.steps).toHaveLength(2);
  expect(result?.steps[0].avgPrice).toBe(100);
  // Filling 2 @ 90 on top of 2 @ 100 averages to 95.
  expect(result?.steps[1].avgPrice).toBeCloseTo(95, 8);
  expect(result?.steps[1].liquidationPrice ?? 0).toBeLessThan(
    result?.steps[0].liquidationPrice ?? 0
  );
});

test('a live deal ignores exits and anything on the wrong side of the average', () => {
  // A long's take-profit is a SELL, and any buy above the average entry would
  // raise it rather than average down — neither belongs in the entry ladder.
  // Deal chart orders carry the backend's raw `typeOrder`, so classification
  // must not depend on the display-name enum.
  const result = computeDealLiquidation(
    [
      order(110, 2, { side: BotOrderSideEnum.sell, type: 'dealTP' as DCAOrderTypeEnum }),
      order(105, 2, { type: 'dealRegular' as DCAOrderTypeEnum }),
      order(90, 2, { type: 'dealRegular' as DCAOrderTypeEnum }),
    ],
    { side: 'long', leverage: 5, avgPrice: 100, positionQty: 2 }
  );
  expect(result?.steps.map((s) => s.orderPrice)).toEqual([100, 90]);
});

test('a live deal projects across resting orders that carry backend type names', () => {
  // Regression: the deal chart's orders are built by
  // `dealPendingOrdersToChartLines`, which puts the RAW `typeOrder`
  // ('dealRegular') on `type` and the display name on `label`. Filtering on the
  // display enum silently dropped every safety order and collapsed the
  // projection to the current position.
  const result = computeDealLiquidation(
    [
      order(95, 1, { type: 'dealRegular' as DCAOrderTypeEnum }),
      order(90, 1, { type: 'dealRegular' as DCAOrderTypeEnum }),
    ],
    { side: 'long', leverage: 5, avgPrice: 100, positionQty: 1 }
  );
  expect(result?.steps).toHaveLength(3);
  expect(result?.steps.map((s) => s.orderPrice)).toEqual([100, 95, 90]);
  expect(result?.final?.avgPrice).toBeCloseTo(95, 8);
});

test('a live deal with no resting orders still reports its current liquidation', () => {
  const result = computeDealLiquidation([], {
    side: 'long',
    leverage: 10,
    avgPrice: 100,
    positionQty: 1,
  });
  expect(result?.steps).toHaveLength(1);
  expect(result?.effective).toBe(result?.initial);
  expect(result?.effective?.liquidationPrice).toBeCloseTo(
    (100 * (1 - 1 / 10)) / (1 - MMR),
    8
  );
});

test('deal context prefers per-deal overrides and refuses spot / unlevered / empty deals', () => {
  const botSettings = { futures: true, leverage: 10, strategy: StrategyEnum.long };
  const deal = {
    avgPrice: 100,
    strategy: StrategyEnum.short,
    currentBalances: { base: -3 },
    settings: { leverage: 20 },
  };

  expect(buildDealLiquidationContext(botSettings, deal)).toEqual({
    side: 'short',
    leverage: 20,
    avgPrice: 100,
    // A short's base balance is negative; size is what matters, not sign.
    positionQty: 3,
  });

  expect(buildDealLiquidationContext({ futures: false, leverage: 10 }, deal)).toBeNull();
  expect(buildDealLiquidationContext({ futures: true, leverage: 1 }, { ...deal, settings: {} })).toBeNull();
  expect(
    buildDealLiquidationContext(botSettings, { ...deal, currentBalances: { base: 0 } })
  ).toBeNull();
  expect(buildDealLiquidationContext(botSettings, null)).toBeNull();
});
