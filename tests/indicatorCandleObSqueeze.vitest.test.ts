import { describe, expect, it } from "vitest";

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from "@/contexts/bots/form/formDefaults";
import { mapFormDataToBackend } from "@/mappers/bots/dca/field-mapping";
import {
  BotTypesEnum,
  CandleColorEnum,
  CandleSourceEnum,
  CandleTriggerEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  OBLevelEnum,
  OBSideEnum,
  SessionLevelsActiveEnum,
  SessionRuleEnum,
  SqzMomentumEnum,
  SqzSignalEnum,
  StartConditionEnum,
  StrategyEnum,
  type SettingsIndicators,
} from "@/types";
import type { BotFormData } from "@/types/bots/form";
import {
  INDICATOR_CATALOG,
  INDICATOR_DOCUMENTATION_URLS,
  sqzMomentumParams,
  sqzSignalParams,
} from "@/types/indicators/indicatorCatalog";
import { getIndicatorCatalogDefaultParams } from "@/types/indicators/indicatorLogic";
import {
  resetInvalidConditionalSelects,
  resolveFieldOptions,
  shouldHideField,
} from "@/utils/indicators/indicatorFieldGating";
import { buildTradingViewStudyDescriptor } from "@/components/widgets/shared/TradingViewChart/indicatorStudyConfig";
import { convertIndicatorConfigsToChart } from "@/utils/indicators/chartIndicatorUtils";

const one = <T,>(value: T | undefined): T => {
  if (value === undefined) throw new Error("missing");
  return value;
};

const row = (
  type: IndicatorEnum,
  extra: Partial<SettingsIndicators> = {},
): SettingsIndicators =>
  ({
    ...getIndicatorCatalogDefaultParams(type, IndicatorAction.startDeal),
    uuid: `u-${type}`,
    groupId: "g1",
    ...extra,
  }) as SettingsIndicators;

const mapRows = (indicators: SettingsIndicators[]) => {
  const formData = {
    ...SHARED_FORM_DEFAULTS,
    type: BotTypesEnum.dca,
    exchangeUUID: "exchange-uuid",
    dca: {
      ...DCA_FORM_DEFAULTS,
      startCondition: StartConditionEnum.ti,
      indicators,
      indicatorGroups: [{ id: "g1", logic: "and", action: "startDeal" }],
    },
    combo: COMBO_FORM_DEFAULTS,
    grid: GRID_FORM_DEFAULTS,
  } as unknown as BotFormData;
  return mapFormDataToBackend(formData, null);
};

const save = (indicators: SettingsIndicators[]) => {
  const result = mapRows(indicators);
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.data.indicators ?? [];
};

const field = (type: IndicatorEnum, key: string) =>
  one(INDICATOR_CATALOG[type].fields.find((f) => f.key === key));

const chart = (i: SettingsIndicators) =>
  one(
    convertIndicatorConfigsToChart([i], {
      scaleAr: false,
      tpAr: false,
      slAr: false,
      chartInterval: "60",
      strategy: StrategyEnum.long,
      indicatorGroupsToUse: ["g1"],
      useCloseIndicators: true,
      useStartDealIndicators: true,
      useStartDCAIndicators: true,
      useStopBotIndicators: true,
      useStartBotIndicators: true,
      useRiskRewardIndicators: true,
    })[0],
  );

describe("catalog defaults are the contract's", () => {
  it("Candle Colour", () => {
    expect(INDICATOR_CATALOG[IndicatorEnum.candle].label).toBe("Candle Colour");
    expect(row(IndicatorEnum.candle)).toMatchObject({
      candleSource: CandleSourceEnum.heikinAshi,
      candleColor: CandleColorEnum.green,
      candleCount: 1,
      candleTrigger: CandleTriggerEnum.streak,
    });
    expect(field(IndicatorEnum.candle, "candleCount")).toMatchObject({
      min: 1,
      max: 50,
      step: 1,
    });
  });

  it("Order Blocks", () => {
    expect(INDICATOR_CATALOG[IndicatorEnum.ob].label).toBe("Order Blocks");
    expect(row(IndicatorEnum.ob)).toMatchObject({
      obSwingLength: 5,
      obSide: OBSideEnum.bullish,
      obLevel: OBLevelEnum.top,
      indicatorCondition: IndicatorStartConditionEnum.cd,
    });
    expect(field(IndicatorEnum.ob, "obSwingLength")).toMatchObject({
      min: 2,
      max: 50,
    });
    // the FVG type keeps its key and says it is FVG only
    expect(INDICATOR_CATALOG[IndicatorEnum.obfvg].label).toBe(
      "Fair Value Gaps (FVG)",
    );
  });

  it("Squeeze Momentum", () => {
    expect(INDICATOR_CATALOG[IndicatorEnum.sqz].label).toBe("Squeeze Momentum");
    expect(row(IndicatorEnum.sqz)).toMatchObject({
      sqzLength: 20,
      // 1.5 = the chart TradingView shows (and the package default)
      sqzBBMult: 1.5,
      sqzKCLength: 20,
      sqzKCMult: 1.5,
      sqzSignal: SqzSignalEnum.fired,
      sqzMomentum: SqzMomentumEnum.positive,
    });
    for (const key of ["sqzBBMult", "sqzKCMult"]) {
      expect(field(IndicatorEnum.sqz, key)).toMatchObject({
        min: 0.1,
        max: 10,
        step: 0.1,
      });
    }
  });

  it("links each to its help page", () => {
    expect(INDICATOR_DOCUMENTATION_URLS[IndicatorEnum.candle]).toBe(
      "/help/candle-colour",
    );
    expect(INDICATOR_DOCUMENTATION_URLS[IndicatorEnum.ob]).toBe(
      "/help/order-blocks",
    );
    expect(INDICATOR_DOCUMENTATION_URLS[IndicatorEnum.sqz]).toBe(
      "/help/squeeze-momentum",
    );
  });
});

describe("Order Blocks conditions that can never fire are not offered", () => {
  const ob = INDICATOR_CATALOG[IndicatorEnum.ob];
  const offered = (side: OBSideEnum, level: OBLevelEnum) =>
    (
      resolveFieldOptions(
        ob,
        field(IndicatorEnum.ob, "indicatorCondition"),
        row(IndicatorEnum.ob, { obSide: side, obLevel: level }),
      ) ?? []
    ).map((o) => o.value);
  const C = IndicatorStartConditionEnum;

  it("drops greater-than on a bearish top and lower-than on a bullish bottom only", () => {
    expect(offered(OBSideEnum.bearish, OBLevelEnum.top)).toEqual([C.cd, C.cu, C.lt]);
    expect(offered(OBSideEnum.bullish, OBLevelEnum.bottom)).toEqual([C.cd, C.cu, C.gt]);
    for (const [side, level] of [
      [OBSideEnum.bullish, OBLevelEnum.top],
      [OBSideEnum.bullish, OBLevelEnum.middle],
      [OBSideEnum.bearish, OBLevelEnum.middle],
      [OBSideEnum.bearish, OBLevelEnum.bottom],
    ] as const) {
      expect(offered(side, level), `${side} ${level}`).toEqual([C.cd, C.cu, C.gt, C.lt]);
    }
  });

  it("moves such a condition back to the default when the side or level makes it one", () => {
    const prev = row(IndicatorEnum.ob, {
      obSide: OBSideEnum.bearish,
      obLevel: OBLevelEnum.middle,
      indicatorCondition: C.gt,
    });
    const next = resetInvalidConditionalSelects(
      ob,
      prev,
      { ...prev, obLevel: OBLevelEnum.top },
      "obLevel",
    );
    expect(next.indicatorCondition).toBe(C.cd);
    const flipped = resetInvalidConditionalSelects(
      ob,
      { ...prev, obLevel: OBLevelEnum.bottom, indicatorCondition: C.lt },
      { ...prev, obLevel: OBLevelEnum.bottom, indicatorCondition: C.lt, obSide: OBSideEnum.bullish },
      "obSide",
    );
    expect(flipped.indicatorCondition).toBe(C.cd);
  });
});

describe("saving", () => {
  it("stores the numbers as numbers, decimals kept", () => {
    const [candle, ob, sqz] = save([
      row(IndicatorEnum.candle, { candleCount: "3" as unknown as number }),
      {
        ...row(IndicatorEnum.ob, { obSwingLength: "7" as unknown as number }),
        uuid: "ob",
      },
      {
        ...row(IndicatorEnum.sqz, {
          sqzBBMult: "1.5" as unknown as number,
          sqzKCMult: "1.25" as unknown as number,
          sqzLength: "18" as unknown as number,
        }),
        uuid: "sqz",
      },
    ]);
    expect(candle).toMatchObject({ candleCount: 3, indicatorLength: 14 });
    expect(ob).toMatchObject({ obSwingLength: 7 });
    expect(sqz).toMatchObject({ sqzBBMult: 1.5, sqzKCMult: 1.25, sqzLength: 18 });
  });

  it("a new Squeeze Momentum row saves sqzBBMult 1.5 explicitly", () => {
    expect(field(IndicatorEnum.sqz, "sqzBBMult")).toMatchObject({ defaultValue: 1.5 });
    const [sqz] = save([row(IndicatorEnum.sqz)]);
    expect(sqz.sqzBBMult).toBe(1.5);
    // a stored 2 is kept
    const [two] = save([row(IndicatorEnum.sqz, { sqzBBMult: 2 })]);
    expect(two.sqzBBMult).toBe(2);
  });

  it("keeps a decimal standard deviation on BB, BBW, BB%B and the SuperTrend factor", () => {
    for (const type of [IndicatorEnum.bb, IndicatorEnum.bbw, IndicatorEnum.bbpb]) {
      expect(field(type, "bbwMult")).toMatchObject({ step: 0.1, min: 0.1, max: 10 });
      const [saved] = save([row(type, { bbwMult: "2.5" as unknown as number })]);
      expect(saved.bbwMult, type).toBe(2.5);
    }
    expect(field(IndicatorEnum.st, "factor").step).toBe(0.1);
    const [st] = save([row(IndicatorEnum.st, { factor: "2.5" as unknown as number })]);
    expect(st.factor).toBe(2.5);
  });

  it("Squeeze never ends up with both requirements Any", () => {
    const anyMomentum = row(IndicatorEnum.sqz, { sqzMomentum: SqzMomentumEnum.any });
    expect(sqzSignalParams(SqzSignalEnum.any, anyMomentum)).toEqual({
      sqzSignal: SqzSignalEnum.any,
      sqzMomentum: SqzMomentumEnum.positive,
    });
    const anySignal = row(IndicatorEnum.sqz, { sqzSignal: SqzSignalEnum.any });
    expect(sqzMomentumParams(SqzMomentumEnum.any, anySignal)).toEqual({
      sqzMomentum: SqzMomentumEnum.any,
      sqzSignal: SqzSignalEnum.fired,
    });
    expect(sqzMomentumParams(SqzMomentumEnum.rising, anySignal)).toEqual({
      sqzMomentum: SqzMomentumEnum.rising,
    });
  });
});

describe("Divergence pivots", () => {
  const keys = ["divPivotLeft", "divPivotRight", "divRangeLower", "divRangeUpper"];

  it("shows the defaults and saves none of them while they are left alone", () => {
    expect(row(IndicatorEnum.div)).toMatchObject({
      divPivotLeft: 3,
      divPivotRight: 1,
      divRangeLower: 1,
      divRangeUpper: 60,
    });
    const [plain] = save([row(IndicatorEnum.div)]);
    for (const key of keys) {
      expect(key in plain, key).toBe(false);
    }
    // typed back to a default, or cleared
    const [typed] = save([
      row(IndicatorEnum.div, {
        divPivotLeft: "3" as unknown as number,
        divRangeUpper: "" as unknown as number,
      }),
    ]);
    for (const key of keys) {
      expect(key in typed, key).toBe(false);
    }
  });

  it("saves custom values as numbers", () => {
    const [saved] = save([
      row(IndicatorEnum.div, {
        divPivotLeft: "5" as unknown as number,
        divPivotRight: "2" as unknown as number,
        divRangeLower: "2" as unknown as number,
        divRangeUpper: "40" as unknown as number,
      }),
    ]);
    expect(saved).toMatchObject({
      divPivotLeft: 5,
      divPivotRight: 2,
      divRangeLower: 2,
      divRangeUpper: 40,
    });
  });

  it("refuses a lookback range whose min is not below its max", () => {
    const result = mapRows([
      row(IndicatorEnum.div, {
        divRangeLower: "60" as unknown as number,
      }),
    ]);
    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toContain("lookback range");
  });

  it("draws the chart study with the same pivots", () => {
    const study = (extra: Partial<SettingsIndicators>) =>
      one(buildTradingViewStudyDescriptor(chart(row(IndicatorEnum.div, extra))))
        .inputs;
    expect(study({})).toMatchObject({
      pivotLeft: 3,
      pivotRight: 1,
      rangeLower: 1,
      rangeUpper: 60,
    });
    expect(
      study({
        divPivotLeft: "5" as unknown as number,
        divPivotRight: 2,
        divRangeLower: 2,
        divRangeUpper: 40,
      }),
    ).toMatchObject({ pivotLeft: 5, pivotRight: 2, rangeLower: 2, rangeUpper: 40 });
  });
});

describe("Session Price levels: Active", () => {
  const active = field(IndicatorEnum.session, "sessionLevelsActive");
  const levels = (extra: Partial<SettingsIndicators> = {}) =>
    row(IndicatorEnum.session, { sessionRule: SessionRuleEnum.levels, ...extra });

  it("is shown only for Price levels", () => {
    expect(shouldHideField(active, levels())).toBe(false);
    expect(shouldHideField(active, row(IndicatorEnum.session))).toBe(true);
    expect(active.derive?.get(levels())).toBe(SessionLevelsActiveEnum.session);
  });

  it("stores nothing until a choice is made", () => {
    expect("sessionLevelsActive" in levels()).toBe(false);
    const [plain] = save([levels()]);
    expect(plain.sessionLevelsActive).toBeUndefined();
    const [outside] = save([
      levels({ sessionLevelsActive: SessionLevelsActiveEnum.outside }),
    ]);
    expect(outside.sessionLevelsActive).toBe(SessionLevelsActiveEnum.outside);
  });

  it("names a non-default choice on the card", () => {
    expect(active.summary?.(levels())).toBeNull();
    expect(
      active.summary?.(levels({ sessionLevelsActive: SessionLevelsActiveEnum.outside })),
    ).toBe("Outside the session");
  });

  it("shades outside the session on the chart when read only there", () => {
    const shaded = (extra: Partial<SettingsIndicators>) =>
      one(buildTradingViewStudyDescriptor(chart(
          levels({
            sessionDays: [1],
            indicatorInterval: ExchangeIntervals.oneH,
            ...extra,
          }),
        )))
        .inputs?.inSession;
    expect(shaded({})).toBe(true);
    expect(shaded({ sessionLevelsActive: SessionLevelsActiveEnum.outside })).toBe(false);
    expect(shaded({ sessionLevelsActive: SessionLevelsActiveEnum.always })).toBe(true);
  });
});

describe("chart studies", () => {
  it("Candle Colour in its own pane", () => {
    const d = one(
      buildTradingViewStudyDescriptor(
        chart(
          row(IndicatorEnum.candle, {
            candleSource: CandleSourceEnum.regular,
            candleColor: CandleColorEnum.red,
            candleCount: "3" as unknown as number,
          }),
        ),
      ),
    );
    expect(d).toMatchObject({
      name: "Candle Colour (Custom)",
      inputs: { source: "regular", color: "red", count: 3 },
    });
    expect(d.forceOverlay).toBeUndefined();
    expect(chart(row(IndicatorEnum.candle)).upperLimit).toBeUndefined();
  });

  it("Order Blocks on the candles", () => {
    expect(
      buildTradingViewStudyDescriptor(chart(row(IndicatorEnum.ob, { obSwingLength: 8 }))),
    ).toMatchObject({
      name: "Order Blocks (Custom)",
      inputs: { swingLength: 8 },
      forceOverlay: true,
    });
  });

  it("Squeeze Momentum with decimal multipliers", () => {
    const d = one(
      buildTradingViewStudyDescriptor(
        chart(row(IndicatorEnum.sqz, { sqzBBMult: 1.5, sqzKCMult: "1.25" as unknown as number })),
      ),
    );
    expect(d).toMatchObject({
      name: "Squeeze Momentum (Custom)",
      inputs: { length: 20, bbMult: 1.5, kcLength: 20, kcMult: 1.25 },
    });
    expect(d.forceOverlay).toBeUndefined();
  });
});
