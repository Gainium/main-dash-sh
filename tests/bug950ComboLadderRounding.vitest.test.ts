/**
 * Runner note: run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug950ComboLadderRounding.vitest.test.ts
 *
 * A combo bot's safety-order preview must not accumulate tick rounding across
 * levels. Each level used to be stepped off the ROUNDED previous level, so on
 * a 0.001 tick near 0.25 a 30 × 1% ladder ended 24.10-35.43% from the start
 * instead of 30%. The backtester's combo ladder places the same levels.
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

const TICK = 0.001;
const symbol = {
  pair: '0G-USD',
  baseAsset: { name: '0G', minAmount: 0, maxAmount: 1e9, step: 0.01 },
  quoteAsset: { name: 'USD', minAmount: 0, maxAmount: 1e9, step: 0.01 },
  priceAssetPrecision: 3,
} as unknown as Symbols;

const base = {
  strategy: StrategyEnum.long,
  futures: false,
  coinm: false,
  leverage: 1,
  orderSizeType: OrderSizeTypeEnum.quote,
  baseOrderSize: '10',
  orderSize: '10',
  ordersCount: '30',
  activeOrdersCount: '30',
  step: '1',
  baseStep: '1',
  stepScale: '1',
  volumeScale: '1',
  gridLevel: '2',
  baseGridLevels: '2',
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

const safetyOrders = async (s: Record<string, unknown>, start: number) =>
  (
    await createComboOrders(
      { all: true },
      {
        ...defaultContext,
        botType: BotTypesEnum.combo,
        settings: { ...base, ...s } as unknown as DCABotSettings,
        symbol,
        usdPrice: 1,
        inputLatestPrice: start,
        userFee: 0.001,
      },
    )
  )
    .filter((o) => o.type === DCAOrderTypeEnum.dca)
    .sort((a, b) => a.levelNumber! - b.levelNumber!);

const target = (start: number, step: number, scale: number, i: number) => {
  let cumulative = 0;
  for (let k = 0; k < i; k++) cumulative += scale ** k;
  return start * (1 - step * cumulative);
};

describe('combo safety-order ladder rounding (bug 950)', () => {
  it('keeps every level of 30 × 1% within one tick of its configured price', async () => {
    const drift: string[] = [];
    for (const start of [0.249, 0.25, 0.2503, 0.2512, 0.252, 0.2535, 0.254]) {
      const orders = await safetyOrders({}, start);
      expect(orders.length, `levels built at ${start}`).toBe(30);
      orders.forEach((o, idx) => {
        const want = target(start, 0.01, 1, idx + 1);
        if (Math.abs(o.price - want) > TICK + 1e-12) {
          drift.push(`${start} SO${idx + 1}: ${o.price} vs ${want.toFixed(5)}`);
        }
      });
    }
    expect(drift).toEqual([]);
  });

  it('keeps a scaled ladder (1% × 1.05) and a short ladder within one tick', async () => {
    const scaled = await safetyOrders(
      { ordersCount: '20', stepScale: '1.05' },
      0.254,
    );
    scaled.forEach((o, idx) =>
      expect(
        Math.abs(o.price - target(0.254, 0.01, 1.05, idx + 1)),
      ).toBeLessThanOrEqual(TICK + 1e-12),
    );
    const short = await safetyOrders({ strategy: StrategyEnum.short }, 0.254);
    expect(short.length).toBe(30);
    short.forEach((o, idx) =>
      expect(
        Math.abs(o.price - 0.254 * (1 + 0.01 * (idx + 1))),
      ).toBeLessThanOrEqual(TICK + 1e-12),
    );
  });

  it('still separates levels when the step is under one tick', async () => {
    for (const strategy of [StrategyEnum.long, StrategyEnum.short]) {
      const orders = await safetyOrders(
        { step: '0.1', ordersCount: '10', strategy },
        0.25,
      );
      const dir = strategy === StrategyEnum.long ? -1 : 1;
      let prev = 0.25;
      for (const o of orders) {
        expect(dir * (o.price - prev)).toBeGreaterThan(TICK / 2);
        prev = o.price;
      }
    }
  });
});
