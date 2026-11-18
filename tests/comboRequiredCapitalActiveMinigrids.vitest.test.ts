/**
 * Runner note: run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/comboRequiredCapitalActiveMinigrids.vitest.test.ts
 *
 * Spec 156. A combo deal's required capital is the base order + every DCA
 * level whether or not "Active minigrids on deal start" is on. An active
 * minigrid executes its DCA level, so that level's row is hidden from the
 * order list, but its capital is still committed by the deal.
 */
import { describe, expect, it } from "vitest";

import {
  BotTypesEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  OrderSizeTypeEnum,
  ScaleDcaTypeEnum,
  StrategyEnum,
  type DCABotSettings,
  type Symbols,
} from "@/types";
import {
  createComboOrders,
  defaultContext,
} from "@/utils/bots/dca/example-orders-core";
import { computeDealSummary } from "@/utils/bots/dca/deal-summary";

const symbol = {
  pair: "XUSDT",
  baseAsset: { name: "X", minAmount: 0.001, maxAmount: 1e9, step: 0.001 },
  quoteAsset: { name: "USDT", minAmount: 0, maxAmount: 1e9, step: 0.01 },
  priceAssetPrecision: 4,
} as unknown as Symbols;

// Long combo, BO 10, 4 DCA levels of 72.5, 2% step.
const settings = {
  strategy: StrategyEnum.long,
  futures: false,
  coinm: false,
  leverage: 1,
  orderSizeType: OrderSizeTypeEnum.quote,
  baseOrderSize: "10",
  orderSize: "72.5",
  ordersCount: "4",
  activeOrdersCount: "4",
  step: "2",
  baseStep: "1",
  stepScale: "1",
  volumeScale: "1",
  gridLevel: "5",
  baseGridLevels: "5",
  useActiveMinigrids: false,
  comboActiveMinigrids: "0",
  tpPerc: "1",
  slPerc: "-10",
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

const build = (s: Record<string, unknown>, all = true) =>
  createComboOrders(
    { all },
    {
      ...defaultContext,
      botType: BotTypesEnum.combo,
      settings: { ...settings, ...s } as unknown as DCABotSettings,
      symbol,
      usdPrice: 1,
      inputLatestPrice: 100,
      userFee: 0.001,
    },
  );

describe("combo required capital with active minigrids (spec 156)", () => {
  // `all: false` is the bot drawer's projection path (useBotDcaProjection).
  for (const [futures, all, smart] of [
    [false, true, false],
    [true, true, false],
    [false, false, false],
    [false, false, true],
  ] as const) {
    it(`§1.1 ${futures ? "futures" : "spot"}${all ? "" : " (drawer)"}${smart ? " smart orders" : ""}: active minigrids 0 vs 4 give the same required capital`, async () => {
      const extra = smart
        ? { useSmartOrders: true, activeOrdersCount: "2" }
        : {};
      const off = computeDealSummary(await build({ futures, ...extra }, all));
      for (const active of ["2", "4"]) {
        const on = computeDealSummary(
          await build(
            {
              futures,
              ...extra,
              useActiveMinigrids: true,
              comboActiveMinigrids: active,
            },
            all,
          ),
        );
        expect(off.totalCapital).toBeGreaterThan(290);
        // Futures active-minigrid levels round their qty separately, so allow
        // that drift (well under 1%); the defect dropped ~97% of the total.
        expect(Math.abs(on.totalCapital / off.totalCapital - 1)).toBeLessThan(
          0.01,
        );
        expect(
          Math.abs(on.totalCapitalBase / off.totalCapitalBase - 1),
        ).toBeLessThan(0.01);
        expect(on.baseOrderCapital).toBeCloseTo(off.baseOrderCapital, 6);
      }
    });
  }
});

describe("combo coverage with active minigrids (spec 156 §1.3)", () => {
  for (const futures of [false, true]) {
    it(`§1.3 ${futures ? "futures" : "spot"}: coverage and avg down power span the whole ladder whether minigrids are active or not`, async () => {
      const off = computeDealSummary(await build({ futures }));
      if (!futures) {
        expect(off.coverage).toBe("8.00");
        expect(off.avgDownPower).toBe("4.89");
      }
      for (const active of ["2", "4"]) {
        const on = computeDealSummary(
          await build({
            futures,
            useActiveMinigrids: true,
            comboActiveMinigrids: active,
          }),
        );
        expect(on.coverage).toBe(off.coverage);
        expect(on.avgDownPower).toBe(off.avgDownPower);
      }
    });
  }
});
