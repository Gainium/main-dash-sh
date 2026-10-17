/**
 * Runner note: run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/comboDealFundsExcludeMinigrids.vitest.test.ts
 *
 * Spec 122. A combo deal's funds figure is the base order + DCA ladder (what
 * the engine counts in the deal's usage). Minigrid orders add nothing: the
 * closing side is reduce-only / sells back the level, and an active minigrid
 * executes a DCA level that is already in the ladder's cumulative total.
 */
import { describe, expect, it } from 'vitest';

import {
  BotTypesEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  DCAOrderTypeEnum,
  OrderSizeTypeEnum,
  ScaleDcaTypeEnum,
  StrategyEnum,
  type DCABotSettings,
  type Symbols,
} from '@/types';
import {
  createComboOrders,
  defaultContext,
} from '@/utils/bots/dca/example-orders-core';
import { computeDealSummary } from '@/utils/bots/dca/deal-summary';

const symbol = {
  pair: 'XUSDT',
  baseAsset: { name: 'X', minAmount: 0.001, maxAmount: 1e9, step: 0.001 },
  quoteAsset: { name: 'USDT', minAmount: 0, maxAmount: 1e9, step: 0.01 },
  priceAssetPrecision: 4,
} as unknown as Symbols;

// Bybit linear short 5x, BO 45 (10 grid levels, 1%), DCA 30 (10 grid levels),
// 10 DCAs at 2%, volume scale 1.24, 3 active minigrids.
const settings = {
  strategy: StrategyEnum.short,
  futures: true,
  coinm: false,
  leverage: 5,
  orderSizeType: OrderSizeTypeEnum.quote,
  baseOrderSize: '45',
  orderSize: '30',
  ordersCount: '10',
  activeOrdersCount: '10',
  step: '2',
  baseStep: '1',
  stepScale: '1',
  volumeScale: '1.24',
  gridLevel: '10',
  baseGridLevels: '10',
  useActiveMinigrids: true,
  comboActiveMinigrids: '3',
  tpPerc: '1',
  slPerc: '-10',
  useTp: true,
  useSl: false,
  useDca: true,
  dcaCondition: DCAConditionEnum.percentage,
  scaleDcaType: ScaleDcaTypeEnum.percentage,
  dealCloseCondition: CloseConditionEnum.tp,
  dealCloseConditionSL: CloseConditionEnum.tp,
  indicators: [],
  indicatorGroups: [],
};

const build = (s: Record<string, unknown>) =>
  createComboOrders(
    { all: true },
    {
      ...defaultContext,
      botType: BotTypesEnum.combo,
      settings: { ...settings, ...s } as unknown as DCABotSettings,
      symbol,
      usdPrice: 1,
      inputLatestPrice: 100,
      userFee: 0.001,
    }
  );

// What the engine counts: base order + every DCA level (hidden ones included —
// those are the levels an active minigrid executes).
const ladder = (orders: Awaited<ReturnType<typeof build>>) =>
  orders
    .filter(
      (o) =>
        o.type === DCAOrderTypeEnum.bo || o.type === DCAOrderTypeEnum.dca
    )
    .reduce((acc, o) => acc + o.qty * o.price, 0);

describe('combo deal funds exclude minigrid orders (spec 122)', () => {
  it('§1.1/§1.2 short futures: closing BUY minigrids are not counted', async () => {
    const orders = await build({});
    expect(
      orders.some((o) => o.type === DCAOrderTypeEnum.grid && o.side === 'BUY')
    ).toBe(true);
    const summary = computeDealSummary(orders);
    expect(summary.totalCapital).toBeCloseTo(ladder(orders), 6);
    // Reporter's figure: ~994 nominal (rounding to the 0.001 qty step here).
    expect(summary.totalCapital).toBeGreaterThan(990);
    expect(summary.totalCapital).toBeLessThan(1000);
  });

  it('§1.2 long futures and spot: active minigrids are not counted twice', async () => {
    for (const futures of [true, false]) {
      const orders = await build({
        strategy: StrategyEnum.long,
        futures,
        leverage: futures ? 5 : 1,
      });
      expect(computeDealSummary(orders).totalCapital).toBeCloseTo(
        ladder(orders),
        6
      );
    }
  });

  it('§1.3 coverage and avg down power are unchanged', async () => {
    const summary = computeDealSummary(await build({}));
    expect(summary.coverage).toBe('20.00');
    expect(summary.avgDownPower).toBe('13.35');
  });
});
