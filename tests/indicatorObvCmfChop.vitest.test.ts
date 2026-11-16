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
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  MAEnum,
  StartConditionEnum,
  StrategyEnum,
  TrendFilterOperatorEnum,
  type SettingsIndicators,
} from "@/types";
import type { BotFormData } from "@/types/bots/form";
import {
  INDICATOR_CATALOG,
  INDICATOR_DOCUMENTATION_URLS,
} from "@/types/indicators/indicatorCatalog";
import { getIndicatorCatalogDefaultParams } from "@/types/indicators/indicatorLogic";
import { buildTradingViewStudyDescriptor } from "@/components/widgets/shared/TradingViewChart/indicatorStudyConfig";
import { convertIndicatorConfigsToChart } from "@/utils/indicators/chartIndicatorUtils";
import { buildIndicatorSummary } from "@/utils/indicators/indicatorFormatting";

// The dashboard side of On-Balance Volume, Chaikin Money Flow, the Choppiness
// Index and the KAMA / ALMA / LSMA averages: what the form offers and stores
// must be what the bot engine and the public API accept.

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

const field = (type: IndicatorEnum, key: string) =>
  one(INDICATOR_CATALOG[type].fields.find((f) => f.key === key));

const values = (type: IndicatorEnum, key: string) =>
  (field(type, key).options ?? []).map((o) => o.value);

const LINE_CONDITIONS = ["cd", "cu", "gt", "lt"];

describe("catalog", () => {
  it("OBV: average sma 20, crossing up, no value, no percentile", () => {
    const obv = row(IndicatorEnum.obv);
    expect(obv).toMatchObject({
      obvMaType: MAEnum.sma,
      obvMaLength: 20,
      indicatorCondition: IndicatorStartConditionEnum.cu,
      indicatorInterval: ExchangeIntervals.oneH,
    });
    const keys = INDICATOR_CATALOG[IndicatorEnum.obv].fields.map((f) => f.key);
    expect(keys).not.toContain("indicatorValue");
    expect(keys).not.toContain("indicatorValue2");
    expect(keys).not.toContain("percentile");
    expect(keys).not.toContain("smoothingEnabled");
    expect(keys).not.toContain("trendFilter");
    expect(values(IndicatorEnum.obv, "indicatorCondition")).toEqual(LINE_CONDITIONS);
    expect(field(IndicatorEnum.obv, "obvMaLength")).toMatchObject({ min: 1, max: 1000 });
    expect(values(IndicatorEnum.obv, "obvMaType")).toEqual([
      "sma",
      "ema",
      "wma",
      "dema",
      "tema",
      "hma",
      "rma",
      "kama",
      "alma",
      "lsma",
    ]);
  });

  it("CMF: length 20, crossing up 0, bounded −1…+1", () => {
    expect(row(IndicatorEnum.cmf)).toMatchObject({
      cmfLength: 20,
      indicatorCondition: IndicatorStartConditionEnum.cu,
      indicatorValue: 0,
    });
    expect(field(IndicatorEnum.cmf, "cmfLength")).toMatchObject({ min: 1, max: 1000 });
    expect(field(IndicatorEnum.cmf, "indicatorValue")).toMatchObject({
      min: -1,
      max: 1,
      step: 0.01,
    });
    expect(values(IndicatorEnum.cmf, "indicatorCondition")).toEqual(LINE_CONDITIONS);
  });

  it("CHOP: length 14, crossing down 61.8, bounded 0…100", () => {
    expect(row(IndicatorEnum.chop)).toMatchObject({
      chopLength: 14,
      indicatorCondition: IndicatorStartConditionEnum.cd,
      indicatorValue: 61.8,
    });
    expect(field(IndicatorEnum.chop, "chopLength")).toMatchObject({ min: 2, max: 1000 });
    expect(field(IndicatorEnum.chop, "indicatorValue")).toMatchObject({ min: 0, max: 100 });
    expect(values(IndicatorEnum.chop, "indicatorCondition")).toEqual(LINE_CONDITIONS);
  });

  it("CMF and CHOP have no percentile, smoothing or upper value", () => {
    for (const type of [IndicatorEnum.cmf, IndicatorEnum.chop]) {
      const keys = INDICATOR_CATALOG[type].fields.map((f) => f.key);
      for (const key of ["percentile", "smoothingEnabled", "indicatorValue2", "trendFilter"]) {
        expect(keys, `${type} ${key}`).not.toContain(key);
      }
    }
  });

  it("links each one to its help page", () => {
    expect(INDICATOR_DOCUMENTATION_URLS[IndicatorEnum.obv]).toBe("/help/on-balance-volume");
    expect(INDICATOR_DOCUMENTATION_URLS[IndicatorEnum.cmf]).toBe("/help/chaikin-money-flow");
    expect(INDICATOR_DOCUMENTATION_URLS[IndicatorEnum.chop]).toBe("/help/choppiness-index");
  });

  it("offers KAMA, ALMA and LSMA exactly where McGinley is offered", () => {
    const adaptive = [MAEnum.kama, MAEnum.alma, MAEnum.lsma];
    const withMcginley = [
      [IndicatorEnum.ma, "maType"],
      [IndicatorEnum.ma, "maCrossingValue"],
      [IndicatorEnum.mar, "mar1type"],
      [IndicatorEnum.mar, "mar2type"],
    ] as const;
    for (const [type, key] of withMcginley) {
      expect(values(type, key), `${type} ${key}`).toContain(MAEnum.mcginley);
      for (const ma of adaptive) {
        expect(values(type, key), `${type} ${key}`).toContain(ma);
      }
    }
    // every other average select in the catalog: neither
    for (const definition of Object.values(INDICATOR_CATALOG)) {
      for (const f of definition.fields) {
        const opts = (f.options ?? []).map((o) => o.value);
        const isWithMcginley = withMcginley.some(
          ([t, k]) => t === definition.type && k === f.key,
        );
        if (isWithMcginley || f.key === "obvMaType") continue;
        for (const ma of [...adaptive, MAEnum.mcginley]) {
          expect(opts, `${definition.type} ${f.key}`).not.toContain(ma);
        }
      }
    }
  });

  it("offers OBV and CMF as divergence oscillators, not by default", () => {
    expect(values(IndicatorEnum.div, "divOscillators")).toEqual(
      expect.arrayContaining([IndicatorEnum.obv, IndicatorEnum.cmf]),
    );
    const defaults = row(IndicatorEnum.div).divOscillators ?? [];
    expect(defaults).not.toContain(IndicatorEnum.obv);
    expect(defaults).not.toContain(IndicatorEnum.cmf);
    expect(defaults).toHaveLength(9);
  });
});

describe("save", () => {
  // What the bot form does when a condition's type is changed: the new
  // type's defaults over the old row.
  const switched = (from: SettingsIndicators, type: IndicatorEnum) =>
    ({
      ...from,
      ...getIndicatorCatalogDefaultParams(type, IndicatorAction.startDeal),
      uuid: from.uuid,
      groupId: from.groupId,
    }) as SettingsIndicators;

  const rsi = row(IndicatorEnum.rsi, {
    indicatorValue: "30",
    indicatorValue2: "40",
    percentile: true,
    trendFilter: true,
    trendFilterType: TrendFilterOperatorEnum.higher,
  });

  it("RSI with value 30 and percentile switched to OBV saves value 0, percentile off", () => {
    const [saved] = save([switched(rsi, IndicatorEnum.obv)]);
    expect(saved).toMatchObject({
      type: IndicatorEnum.obv,
      indicatorValue: "0",
      percentile: false,
      trendFilter: false,
      indicatorCondition: IndicatorStartConditionEnum.cu,
      obvMaType: MAEnum.sma,
      obvMaLength: 20,
    });
    expect(saved.indicatorValue2).toBeUndefined();
  });

  it("a new OBV saves value 0 and its average lower-case", () => {
    const [saved] = save([row(IndicatorEnum.obv, { obvMaType: "KAMA" as MAEnum, obvMaLength: "50" as unknown as number })]);
    expect(saved).toMatchObject({
      indicatorValue: "0",
      obvMaType: MAEnum.kama,
      obvMaLength: 50,
    });
  });

  it("CMF and CHOP always store their value, never percentile", () => {
    const saved = save([
      { ...switched(rsi, IndicatorEnum.cmf), uuid: "cmf" },
      { ...switched(rsi, IndicatorEnum.chop), uuid: "chop" },
    ]);
    const byUuid = Object.fromEntries(saved.map((i) => [i.uuid, i]));
    expect(byUuid.cmf).toMatchObject({
      indicatorValue: "0",
      indicatorCondition: IndicatorStartConditionEnum.cu,
      cmfLength: 20,
      percentile: false,
      trendFilter: false,
    });
    expect(byUuid.chop).toMatchObject({
      indicatorValue: "61.8",
      indicatorCondition: IndicatorStartConditionEnum.cd,
      chopLength: 14,
      percentile: false,
      trendFilter: false,
    });
    expect(byUuid.cmf.indicatorValue2).toBeUndefined();
  });
});

describe("chart and card", () => {
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

  it("draws OBV with its average and no threshold band", () => {
    const [c] = chart(row(IndicatorEnum.obv, { obvMaType: MAEnum.ema, obvMaLength: 30 }));
    expect(one(c).upperLimit).toBeUndefined();
    expect(one(c).lowerLimit).toBeUndefined();
    const d = buildTradingViewStudyDescriptor(one(c));
    expect(d).toMatchObject({
      name: "On-Balance Volume (Custom)",
      inputs: { maType: "EMA", maLength: 30 },
    });
    expect(d?.forceOverlay).toBeUndefined();
    expect(d?.overrides).toBeUndefined();
  });

  it("draws CMF and CHOP in their own pane with the condition's level", () => {
    const [cmf] = chart(row(IndicatorEnum.cmf, { indicatorValue: "0.1", cmfLength: 10 }));
    expect(buildTradingViewStudyDescriptor(one(cmf))).toMatchObject({
      name: "Chaikin Money Flow (Custom)",
      inputs: { in_0: 10 },
      overrides: { "upperLimit.value": 0.1 },
    });
    const [chop] = chart(row(IndicatorEnum.chop));
    const d = buildTradingViewStudyDescriptor(one(chop));
    expect(d).toMatchObject({
      name: "Choppiness Index (Custom)",
      inputs: { in_0: 14 },
      overrides: { "upperLimit.value": 61.8 },
    });
    expect(d?.forceOverlay).toBeUndefined();
  });

  it("draws the KAMA, ALMA and LSMA studies on the candles", () => {
    for (const [maType, name] of [
      [MAEnum.kama, "KAMA (Custom)"],
      [MAEnum.alma, "ALMA (Custom)"],
      [MAEnum.lsma, "LSMA (Custom)"],
    ] as const) {
      const [c] = chart(row(IndicatorEnum.ma, { maType, indicatorLength: 30 }));
      expect(buildTradingViewStudyDescriptor(one(c))).toMatchObject({
        name,
        inputs: { in_0: 30 },
        forceOverlay: true,
      });
    }
  });

  it("draws OBV and CMF divergences when picked", () => {
    const [c] = chart(
      row(IndicatorEnum.div, {
        divOscillators: [IndicatorEnum.obv, IndicatorEnum.cmf, IndicatorEnum.mfi],
      }),
    );
    expect(buildTradingViewStudyDescriptor(one(c))?.inputs).toMatchObject({
      obv: true,
      cmf: true,
      mfi: true,
      rsi: false,
    });
  });

  it("reads OBV's condition in words on the card", () => {
    const summary = buildIndicatorSummary(
      INDICATOR_CATALOG[IndicatorEnum.obv],
      row(IndicatorEnum.obv, { obvMaType: MAEnum.kama, obvMaLength: 30 }),
    );
    expect(summary).toContain("Condition: OBV crosses above its KAMA 30");
    expect(summary.join(" ")).not.toMatch(/undefined|Value/);
  });
});
