import { expect, test } from "vitest";

import {
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  StochRangeEnum,
  StrategyEnum,
  TradingviewAnalysisConditionEnum,
  type SettingsIndicators,
} from "@/types";
import {
  INDICATOR_CATALOG,
  stochZoneParams,
} from "@/types/indicators/indicatorCatalog";
import type { IndicatorParamsState } from "@/types/indicators/indicatorParams";
import type { IndicatorConfig } from "@/types/indicators/indicators";
import {
  convertIndicatorConfigsToChart,
  type ChartIndicatorsContext,
} from "@/utils/indicators/chartIndicatorUtils";
import {
  resolveFieldKey,
  withFieldDefaults,
} from "@/utils/indicators/indicatorFieldGating";
import { buildTradingViewStudyDescriptor } from "@/components/widgets/shared/TradingViewChart/indicatorStudyConfig";

/**
 * Catalog defaults the bot can act on, and chart studies fed the settings the
 * bot reads.
 */

const field = (type: IndicatorEnum, key: string) =>
  INDICATOR_CATALOG[type].fields.find((f) => f.key === key);

const must = <T>(value: T | null | undefined): T => {
  if (value == null) throw new Error("missing");
  return value;
};

const context: ChartIndicatorsContext = {
  scaleAr: false,
  tpAr: false,
  slAr: false,
  chartInterval: "60",
  strategy: StrategyEnum.long,
  indicatorGroupsToUse: [],
  useCloseIndicators: false,
  useStartDealIndicators: true,
  useStartDCAIndicators: false,
  useStopBotIndicators: false,
  useStartBotIndicators: false,
  useRiskRewardIndicators: false,
};

const chart = (indicator: Partial<IndicatorConfig>, chartInterval = "60") =>
  convertIndicatorConfigsToChart(
    [
      {
        uuid: "i",
        indicatorAction: IndicatorAction.startDeal,
        indicatorInterval: ExchangeIntervals.oneH,
        ...indicator,
      } as IndicatorConfig,
    ],
    { ...context, chartInterval },
  );

test("Momentum (a price difference) defaults to the zero line", () => {
  expect(field(IndicatorEnum.mom, "indicatorValue")?.defaultValue).toBe(0);
});

test("Keltner Channel %B defaults inside its 0…1 range", () => {
  const value = field(IndicatorEnum.kcpb, "indicatorValue");
  expect(value?.defaultValue).toBe(0);
  expect(value?.step).toBe(0.01);
  expect(field(IndicatorEnum.kcpb, "indicatorValue2")?.step).toBe(0.01);
});

for (const type of [IndicatorEnum.stoch, IndicatorEnum.stochRSI]) {
  const definition = INDICATOR_CATALOG[type];
  const lower = must(field(type, "stochLower"));
  const upper = must(field(type, "stochUpper"));
  const keyOf = (f: typeof lower, stochRange: StochRangeEnum) =>
    resolveFieldKey(f, { stochRange } as IndicatorParamsState);

  test(`${type}: each band binds the key the bot reads for its zone`, () => {
    // the bot reads Lower's band from stochUpper, Upper's from stochLower
    expect(keyOf(lower, StochRangeEnum.lower)).toEqual({
      key: "stochUpper",
      defaultValue: "20",
    });
    expect(keyOf(upper, StochRangeEnum.upper)).toEqual({
      key: "stochLower",
      defaultValue: "80",
    });
    expect(keyOf(lower, StochRangeEnum.both)).toEqual({
      key: "stochLower",
      defaultValue: "20",
    });
    expect(keyOf(upper, StochRangeEnum.both)).toEqual({
      key: "stochUpper",
      defaultValue: "80",
    });
    // the hidden band never shares the visible band's key
    for (const range of Object.values(StochRangeEnum)) {
      expect(keyOf(lower, range).key).not.toBe(keyOf(upper, range).key);
    }
  });

  test(`${type}: a new condition saves bands of 20 and 80`, () => {
    const filled = must(
      withFieldDefaults(definition, { type } as IndicatorParamsState),
    );
    // Zone Lower: the condition is met below 20
    expect(filled.stochRange).toBe(StochRangeEnum.lower);
    expect(filled.stochUpper).toBe("20");
    expect(filled.stochLower).toBe("80");
    const both = must(
      withFieldDefaults(definition, {
        type,
        stochRange: StochRangeEnum.both,
      } as IndicatorParamsState),
    );
    expect([both.stochLower, both.stochUpper]).toEqual(["20", "80"]);
  });

  test(`${type}: changing Zone keeps each band's value`, () => {
    const zone = must(field(type, "stochRange"));
    expect(zone.derive?.set).toBe(stochZoneParams);
    const both = {
      stochRange: StochRangeEnum.both,
      stochLower: "25",
      stochUpper: "75",
    } as SettingsIndicators;
    const toLower = { ...both, ...stochZoneParams(StochRangeEnum.lower, both) };
    // "Lower band" now reads stochUpper and still shows 25
    expect(toLower.stochUpper).toBe("25");
    expect(toLower.stochLower).toBe("75");
    const toUpper = {
      ...toLower,
      ...stochZoneParams(StochRangeEnum.upper, toLower),
    };
    // single-band to single-band: no swap, "Upper band" (stochLower) is 75
    expect(toUpper.stochLower).toBe("75");
    const back = {
      ...toUpper,
      ...stochZoneParams(StochRangeEnum.both, toUpper),
    };
    expect([back.stochLower, back.stochUpper]).toEqual(["25", "75"]);
  });

  test(`${type}: an unset band draws the default zone`, () => {
    const [lowerZone] = chart({ type, stochRange: StochRangeEnum.lower });
    expect([lowerZone.lowerLimit, lowerZone.upperLimit]).toEqual([0, 20]);
    const [upperZone] = chart({ type, stochRange: StochRangeEnum.upper });
    expect([upperZone.lowerLimit, upperZone.upperLimit]).toEqual([80, 100]);
    const [bothZone] = chart({ type, stochRange: StochRangeEnum.both });
    expect([bothZone.lowerLimit, bothZone.upperLimit]).toEqual([20, 80]);
  });
}

test("Combined Ratings saves its trigger where the bot reads it", () => {
  const definition = INDICATOR_CATALOG[IndicatorEnum.tv];
  const trigger = definition.fields.find((f) => f.label === "Trigger");
  expect(trigger?.key).toBe("condition");
  expect(
    withFieldDefaults(definition, {
      type: IndicatorEnum.tv,
    } as IndicatorParamsState)?.condition,
  ).toBe(TradingviewAnalysisConditionEnum.entry);
  // a row saved while the trigger went to indicatorCondition keeps its choice
  expect(
    withFieldDefaults(definition, {
      type: IndicatorEnum.tv,
      indicatorCondition: TradingviewAnalysisConditionEnum.every,
    } as unknown as IndicatorParamsState)?.condition,
  ).toBe(TradingviewAnalysisConditionEnum.every);
});

test("the Combined Ratings study reads the bot’s level and trigger", () => {
  const inputs = (indicator: Partial<IndicatorConfig>) =>
    buildTradingViewStudyDescriptor(
      chart({ type: IndicatorEnum.tv, ...indicator })[0],
    )?.inputs;
  expect(
    inputs({
      checkLevel: 8,
      condition: TradingviewAnalysisConditionEnum.entry,
    }),
  ).toMatchObject({ checkLevel: 8, useEntryExit: true });
  expect(
    inputs({ condition: TradingviewAnalysisConditionEnum.every }),
  ).toMatchObject({ checkLevel: 15, useEntryExit: false });
});

test("Oscillator Crossover draws both oscillators across intervals", () => {
  const xo = {
    type: IndicatorEnum.xo,
    xOscillator1: IndicatorEnum.rsi,
    xOscillator2: IndicatorEnum.mfi,
    xOscillator2Interval: ExchangeIntervals.fourH,
  };
  const inputs = (chartInterval: string, over: Partial<IndicatorConfig> = {}) =>
    buildTradingViewStudyDescriptor(chart({ ...xo, ...over }, chartInterval)[0])
      ?.inputs;
  // primary-interval chart: both, the second on its own 4h bars
  expect(inputs("60")).toMatchObject({
    xOscillator1: IndicatorEnum.rsi,
    xOscillator2: IndicatorEnum.mfi,
    xOscillator2Resolution: "240",
  });
  // second-interval chart: the second oscillator, on the chart's bars
  expect(inputs("240")).toMatchObject({
    xOscillator1: "None",
    xOscillator2: IndicatorEnum.mfi,
    xOscillator2Resolution: "",
  });
  // one interval: both on the chart's bars
  expect(
    inputs("60", { xOscillator2Interval: ExchangeIntervals.oneH }),
  ).toMatchObject({
    xOscillator1: IndicatorEnum.rsi,
    xOscillator2: IndicatorEnum.mfi,
    xOscillator2Resolution: "",
  });
});

test('the second bound of Between is "Upper value" on every indicator', () => {
  for (const definition of Object.values(INDICATOR_CATALOG)) {
    const upper = definition.fields.find((f) => f.key === 'indicatorValue2');
    if (upper) expect(upper.label, definition.type).toBe('Upper value');
  }
});

test('limits stop at what the indicator can reach', () => {
  // Combined Ratings sums 28 signals of ±1
  expect(field(IndicatorEnum.tv, 'checkLevel')?.max).toBe(28);
  // one divergence per oscillator, nine oscillators to pick from
  const div = field(IndicatorEnum.div, 'divMinCount');
  const oscillators = field(IndicatorEnum.div, 'divOscillators');
  expect(div?.max).toBe(oscillators?.options?.length);
  expect(div?.max).toBe(9);
});

test('defaults match what the bot and the backtest use when unset', () => {
  // percentile: the engine's fallback is 80
  const percentile = INDICATOR_CATALOG[IndicatorEnum.rsi].fields.find(
    (f) => f.key === 'percentilePercentage'
  );
  expect(percentile?.defaultValue).toBe(80);
  // Keltner Channel range length: engine and backtester fall back to 20
  expect(field(IndicatorEnum.kc, 'kcRangeLength')?.defaultValue).toBe(20);
  expect(field(IndicatorEnum.kcpb, 'kcRangeLength')?.defaultValue).toBe(20);
});

test('the chart draws an unset percentile at the bot’s 80', () => {
  const inputs = buildTradingViewStudyDescriptor(
    chart({ type: IndicatorEnum.rsi, percentile: true, indicatorLength: 14 })[0]
  )?.inputs;
  expect(inputs).toMatchObject({ usePercentile: true, percentilePercentage: 80 });
});

test('%B and bandwidth values step in hundredths', () => {
  for (const type of [IndicatorEnum.bbpb, IndicatorEnum.bbw]) {
    expect(field(type, 'indicatorValue')?.step, type).toBe(0.01);
    expect(field(type, 'indicatorValue2')?.step, type).toBe(0.01);
  }
});
