import { describe, expect, it } from "vitest";

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from "@/contexts/bots/form/formDefaults";
import { mapFormDataToBackend } from "@/mappers/bots/dca/field-mapping";
import {
  ADXModeEnum,
  BotTypesEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  KDJCompareToEnum,
  KDJLineEnum,
  StartConditionEnum,
  StochRangeEnum,
  StrategyEnum,
  TrendFilterOperatorEnum,
  type SettingsIndicators,
} from "@/types";
import type { BotFormData } from "@/types/bots/form";
import {
  adxModeParams,
  INDICATOR_CATALOG,
  kdjLineParams,
} from "@/types/indicators/indicatorCatalog";
import { getIndicatorCatalogDefaultParams } from "@/types/indicators/indicatorLogic";
import { shouldHideField, withFieldDefaults } from "@/utils/indicators/indicatorFieldGating";
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

const save = (indicators: SettingsIndicators[]) => {
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
  const result = mapFormDataToBackend(formData, null);
  expect(result.success, JSON.stringify(result.errors)).toBe(true);
  return result.data.indicators ?? [];
};

const marWithTrendFilter = row(IndicatorEnum.mar, {
  trendFilter: true,
  trendFilterLookback: 10,
  trendFilterType: TrendFilterOperatorEnum.higher,
  trendFilterValue: 2,
});

// What the bot form does when a condition's type is changed: the row keeps
// its fields and the new type's defaults fill the gaps.
const switchType = (from: SettingsIndicators, type: IndicatorEnum) =>
  withFieldDefaults(INDICATOR_CATALOG[type], {
    ...from,
    type,
  }) as SettingsIndicators;

describe("trend filter only on MA and MAR", () => {
  it("MAR switched to KDJ does not save the MAR trend filter", () => {
    const kdj = switchType(marWithTrendFilter, IndicatorEnum.kdj);
    expect(kdj.trendFilter).toBe(true);
    const [saved] = save([kdj]);
    expect(saved.type).toBe(IndicatorEnum.kdj);
    expect(saved.trendFilter).toBe(false);
  });

  it("clears it on VWAP and ADX (DMI) too, and keeps it on MA and MAR", () => {
    const saved = save([
      switchType(marWithTrendFilter, IndicatorEnum.vwap),
      { ...switchType(marWithTrendFilter, IndicatorEnum.adx), uuid: "adx", adxMode: ADXModeEnum.dmi },
      { ...marWithTrendFilter, uuid: "mar" },
      { ...switchType(marWithTrendFilter, IndicatorEnum.ma), uuid: "ma" },
    ]);
    const byUuid = Object.fromEntries(saved.map((i) => [i.uuid, i]));
    expect(byUuid[`u-${IndicatorEnum.mar}`]?.trendFilter).toBe(false);
    expect(byUuid.adx.trendFilter).toBe(false);
    expect(byUuid.mar.trendFilter).toBe(true);
    expect(byUuid.ma.trendFilter).toBe(true);
    expect(byUuid.ma.trendFilterType).toBe(TrendFilterOperatorEnum.higher);
  });

  it("leaves rows without the flag as they were", () => {
    const [saved] = save([row(IndicatorEnum.rsi)]);
    expect(saved.trendFilter).toBeUndefined();
  });

  it("shows MA's trend filter settings only when it is on", () => {
    const ma = INDICATOR_CATALOG[IndicatorEnum.ma];
    const lookback = one(ma.fields.find((f) => f.key === "trendFilterLookback"));
    expect(ma.fields.some((f) => f.key === "trendFilter")).toBe(true);
    expect(shouldHideField(lookback, row(IndicatorEnum.ma))).toBe(true);
    expect(
      shouldHideField(lookback, row(IndicatorEnum.ma, { trendFilter: true })),
    ).toBe(false);
  });
});

describe("ADX DMI mode", () => {
  const adx = INDICATOR_CATALOG[IndicatorEnum.adx];
  const field = (key: string) => one(adx.fields.find((f) => f.key === key));

  it("stores no mode unless one is picked", () => {
    expect(row(IndicatorEnum.adx).adxMode).toBeUndefined();
    const [saved] = save([row(IndicatorEnum.adx)]);
    expect(saved.adxMode).toBeUndefined();
  });

  it("hides the value, percentile and smoothing in DMI mode", () => {
    const dmi = row(IndicatorEnum.adx, { adxMode: ADXModeEnum.dmi });
    for (const key of ["indicatorValue", "percentile", "smoothingEnabled"]) {
      expect(shouldHideField(field(key), dmi), key).toBe(true);
      expect(shouldHideField(field(key), row(IndicatorEnum.adx)), key).toBe(false);
    }
    expect(field("indicatorCondition").optionsWhen?.[0]?.options[1]?.label).toBe(
      "+DI crossing above −DI",
    );
  });

  it("switching to DMI turns percentile and smoothing off and drops Between", () => {
    expect(
      adxModeParams(ADXModeEnum.dmi, row(IndicatorEnum.adx, {
        percentile: true,
        indicatorCondition: IndicatorStartConditionEnum.bw,
      })),
    ).toEqual({
      adxMode: ADXModeEnum.dmi,
      percentile: false,
      smoothing: "none",
      indicatorCondition: IndicatorStartConditionEnum.cu,
    });
    expect(adxModeParams(ADXModeEnum.adx, row(IndicatorEnum.adx))).toEqual({
      adxMode: ADXModeEnum.adx,
    });
  });
});

describe("KDJ", () => {
  it("never compares a line with itself", () => {
    expect(kdjLineParams(KDJLineEnum.d, row(IndicatorEnum.kdj))).toEqual({
      kdjLine: KDJLineEnum.d,
      kdjCompareTo: KDJCompareToEnum.k,
    });
    expect(kdjLineParams(KDJLineEnum.j, row(IndicatorEnum.kdj))).toEqual({
      kdjLine: KDJLineEnum.j,
    });
  });

  it("defaults to K crossing up D anywhere, as the bot does", () => {
    const kdj = row(IndicatorEnum.kdj);
    expect(kdj).toMatchObject({
      kdjLength: 9,
      kdjKSmooth: 3,
      kdjDSmooth: 3,
      kdjLine: KDJLineEnum.k,
      kdjCompareTo: KDJCompareToEnum.d,
      indicatorCondition: IndicatorStartConditionEnum.cu,
      stochRange: StochRangeEnum.none,
      stochLower: "20",
      stochUpper: "80",
    });
  });
});

describe("chart studies", () => {
  const chart = (i: SettingsIndicators) =>
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
    });

  it("draws VWAP on the candles with its anchor and band width", () => {
    const [c] = chart(
      row(IndicatorEnum.vwap, {
        vwapBandMultiplier: 2,
        indicatorInterval: ExchangeIntervals.oneH,
      }),
    );
    const d = buildTradingViewStudyDescriptor(one(c));
    expect(d).toMatchObject({
      name: "VWAP (Custom)",
      inputs: { anchor: "day", multiplier: 2 },
      forceOverlay: true,
    });
    expect(one(c).upperLimit).toBeUndefined();
  });

  it("draws KDJ with the zone bands", () => {
    const [c] = chart(
      row(IndicatorEnum.kdj, { stochRange: StochRangeEnum.both }),
    );
    expect(buildTradingViewStudyDescriptor(one(c))).toMatchObject({
      name: "KDJ (Custom)",
      inputs: { in_0: 9, in_1: 3, in_2: 3 },
    });
    expect([one(c).lowerLimit, one(c).upperLimit]).toEqual([20, 80]);
    const [custom] = chart(
      row(IndicatorEnum.kdj, {
        kdjCompareTo: KDJCompareToEnum.custom,
        indicatorValue: "30",
      }),
    );
    expect([one(custom).lowerLimit, one(custom).upperLimit]).toEqual([undefined, 30]);
  });

  it("draws the DMI study for ADX in DMI mode and the ADX study otherwise", () => {
    const [dmi] = chart(row(IndicatorEnum.adx, { adxMode: ADXModeEnum.dmi }));
    expect(buildTradingViewStudyDescriptor(one(dmi))).toEqual({
      name: "Directional Movement Index (Custom)",
      inputs: { in_0: 14 },
      options: expect.anything(),
    });
    const [adx] = chart(row(IndicatorEnum.adx));
    expect(buildTradingViewStudyDescriptor(one(adx))?.name).toBe(
      "Average Directional Index (Custom)",
    );
  });
});

describe("card summary", () => {
  it("names the DMI condition as the form does", async () => {
    const { buildIndicatorSummary } = await import(
      "@/utils/indicators/indicatorFormatting"
    );
    expect(
      buildIndicatorSummary(
        INDICATOR_CATALOG[IndicatorEnum.adx],
        row(IndicatorEnum.adx, {
          adxMode: ADXModeEnum.dmi,
          indicatorCondition: IndicatorStartConditionEnum.cu,
        }),
      ),
    ).toContain("Condition: +DI crossing above −DI");
  });
});
