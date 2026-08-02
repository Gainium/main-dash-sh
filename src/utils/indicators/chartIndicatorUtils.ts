import type { IndicatorConfig } from '@/types/indicators/indicators';
import {
  BBCrossingEnum,
  ECDTriggerEnum,
  IndicatorAction,
  IndicatorEnum,
  IndicatorSection,
  IndicatorStartConditionEnum,
  MAEnum,
  OBFVGRefEnum,
  OBFVGValueEnum,
  PCConditionEnum,
  ppValueEnum,
  RangeType,
  rsiValue2Enum,
  SRCrossingEnum,
  STConditionEnum,
  StochRangeEnum,
  StrategyEnum,
  TrendFilterOperatorEnum,
  tvIntervalMap,
  type ChartIndicatorConfig,
  type ChartIndicatorsConfig,
} from '@/types';

// Type definitions for chart indicators based on old dashboard format
/* export interface ChartIndicatorConfig {
  length: number;
  upperLimit?: number;
  lowerLimit?: number;
  type: string;
  uuid: string;
  signal?: string;
  condition?: string;
  maType?: string;
  valueInsteadof?: number;
  stochSmoothK?: number;
  stochSmoothD?: number;
  stochRSI?: number;
  leftBars?: number;
  rightBars?: number;
  basePeriods?: number;
  pumpPeriods?: number;
  pump?: number;
  baseCrack?: number;
  psarStart?: number;
  psarInc?: number;
  psarMax?: number;
  stochRange?: string;
  voShort?: number;
  voLong?: number;
  uoFast?: number;
  uoMiddle?: number;
  uoSlow?: number;
  momSource?: string;
  bbwpLookback?: number;
  ecdTrigger?: string;
  xOscillator1?: string;
  xOscillator2?: string;
  xOscillator2length?: number;
  xOscillator2Interval?: string;
  xOscillator1voLong?: number;
  xOscillator1voShort?: number;
  xOscillator2voLong?: number;
  xOscillator2voShort?: number;
  percentile?: boolean;
  percentileLookback?: number;
  percentilePercentage?: number;
  percentileCondition?: string;
  mar1length?: number;
  mar1type?: string;
  mar2length?: number;
  mar2type?: string;
  bbwMult?: number;
  bbwMa?: string;
  bbwMaLength?: number;
  kcMa?: string;
  kcRange?: string;
  kcRangeLength?: number;
  macdFast?: number;
  macdSlow?: number;
  macdMaSource?: string;
  macdMaSignal?: string;
  divOscillators?: string[];
  divType?: string;
  divMinCount?: number;
  trendFilter?: boolean;
  trendFilterLookback?: number;
  trendFilterValue?: number;
  trendFilterType?: string;
  factor?: number;
  atrLength?: number;
  athLookback?: number;
  pcUp?: string;
  pcDown?: string;
  pcCondition?: string;
  pcValue?: string;
  ppHighLeft?: number;
  ppHighRight?: number;
  ppLowLeft?: number;
  ppLowRight?: number;
  ppMult?: number;
  showHH?: boolean;
  showLH?: boolean;
  showHL?: boolean;
  showLL?: boolean;
  showSBullBoS?: boolean;
  showSBullCHoCH?: boolean;
  showSBearBoS?: boolean;
  showSBearCHoCH?: boolean;
  showIBullBoS?: boolean;
  showIBullCHoCH?: boolean;
  showIBearBoS?: boolean;
  showIBearCHoCH?: boolean;
  showBullMarket?: boolean;
  showBearMarket?: boolean;
  showSl?: boolean;
  showWl?: boolean;
  showSh?: boolean;
  showWh?: boolean;
  showUpper?: boolean;
  showMiddle?: boolean;
  showLower?: boolean;
  showUp?: boolean;
  showDown?: boolean;
  showSupport?: boolean;
  showResistance?: boolean;
  showBearishFVG?: boolean;
  showBullishFVG?: boolean;
  [key: string]: unknown;
}

export type ChartIndicators = ChartIndicatorConfig[]; */

/* const NUMBER_FALLBACKS: Partial<Record<IndicatorEnum, number>> = {
  [IndicatorEnum.rsi]: 14,
  [IndicatorEnum.macd]: 12,
  [IndicatorEnum.stoch]: 14,
  [IndicatorEnum.stochRSI]: 14,
  [IndicatorEnum.bb]: 20,
  [IndicatorEnum.ma]: 20,
  [IndicatorEnum.psar]: 14,
  [IndicatorEnum.atr]: 14,
  [IndicatorEnum.cci]: 20,
  [IndicatorEnum.uo]: 7,
  [IndicatorEnum.mom]: 10,
  [IndicatorEnum.obfvg]: 5,
  [IndicatorEnum.vo]: 10,
}; */

/* const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}; */

/* const resolveDefaultLength = (type: IndicatorEnum): number =>
  NUMBER_FALLBACKS[type] ?? 14;

const normalizePercentileValue = (value: unknown): number | undefined => {
  const numeric = toNumber(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
};

const coerceBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}; */

/**
 * Converts DCA form indicators to chart-compatible format
 * Based on the old dashboard's chartIndicators computation pattern
 */
export function convertIndicatorConfigsToChart(
  indicators: IndicatorConfig[],
  context: ChartIndicatorsContext
): ChartIndicatorsConfig {
  if (!Array.isArray(indicators) || indicators.length === 0) {
    return [];
  }

  const {
    useCloseIndicators,
    chartInterval,
    indicatorGroupsToUse,
    useStartDealIndicators,
    useStartDCAIndicators,
    useStopBotIndicators,
    useStartBotIndicators,
    useRiskRewardIndicators,
  } = context;

  return indicators
    .filter(
      (i) =>
        !i.groupId || (i.groupId && indicatorGroupsToUse.includes(i.groupId))
    )
    .filter((i) => {
      const filter: string[] = [];
      if (useCloseIndicators) {
        filter.push(IndicatorAction.closeDeal);
      }
      if (useStartDealIndicators) {
        filter.push(IndicatorAction.startDeal);
      }
      if (useStartDCAIndicators) {
        filter.push(IndicatorAction.startDca);
      }
      if (useStopBotIndicators) {
        filter.push(IndicatorAction.stopBot);
      }
      if (useStartBotIndicators) {
        filter.push(IndicatorAction.startBot);
      }
      if (useRiskRewardIndicators) {
        filter.push(IndicatorAction.riskReward);
      }
      return filter.includes(i.indicatorAction);
    })
    .filter(
      (i) =>
        tvIntervalMap[i.indicatorInterval] === chartInterval ||
        // The comparison MA only exists when the reference is another MA — with
        // "Current price" the stored `maCrossingInterval` is inert (it keeps
        // whatever default it was seeded with), so it must not drag the
        // indicator onto that timeframe's chart. Same gate as the crossing
        // indicator emitted below.
        (i.type === IndicatorEnum.ma &&
          i.maCrossingValue &&
          i.maCrossingValue !== MAEnum.price &&
          i.maCrossingInterval &&
          tvIntervalMap[i.maCrossingInterval] === chartInterval) ||
        (i.type === IndicatorEnum.xo &&
          i.xOscillator2Interval &&
          tvIntervalMap[i.xOscillator2Interval] === chartInterval)
    )
    .flatMap((indicator) => {
      const primary = buildChartIndicator(indicator, context);
      if (!primary) return [];

      const results: ChartIndicatorConfig[] = [primary];

      // When an MA condition compares against another MA (not price),
      // emit a second chart indicator for the comparison MA
      if (
        indicator.type === IndicatorEnum.ma &&
        indicator.maCrossingValue &&
        indicator.maCrossingValue !== MAEnum.price
      ) {
        const crossingIndicator: ChartIndicatorConfig = {
          ...primary,
          uuid: `${primary.uuid}_crossing`,
          length: indicator.maCrossingLength ?? 50,
          maType: indicator.maCrossingValue,
          // The comparison MA has no threshold lines of its own
          upperLimit: undefined,
          lowerLimit: undefined,
        };
        results.push(crossingIndicator);
      }

      return results;
    });
}

export const convertDcaIndicatorsToChart = convertIndicatorConfigsToChart;

export type ChartIndicatorsContext = {
  scaleAr: boolean;
  tpAr: boolean;
  slAr: boolean;
  chartInterval: string;
  strategy: StrategyEnum;
  indicatorGroupsToUse: string[];
  useCloseIndicators: boolean;
  useStartDealIndicators: boolean;
  useStartDCAIndicators: boolean;
  useStopBotIndicators: boolean;
  useStartBotIndicators: boolean;
  useRiskRewardIndicators: boolean;
};

function buildChartIndicator(
  i: IndicatorConfig,
  context: ChartIndicatorsContext
): ChartIndicatorConfig | null {
  const { scaleAr, tpAr, slAr, chartInterval, strategy } = context;
  const showXo =
    i.type === IndicatorEnum.xo &&
    tvIntervalMap[i.xOscillator2Interval ?? i.indicatorInterval] ===
      chartInterval;
  const chartIndicator: ChartIndicatorConfig = {
    length:
      (i.type !== IndicatorEnum.tv ? i.indicatorLength : i.checkLevel) ?? 1,
    upperLimit:
      i.indicatorAction === IndicatorAction.riskReward ||
      (i.indicatorAction === IndicatorAction.startDca && scaleAr) ||
      (i.indicatorAction === IndicatorAction.closeDeal &&
        i.section !== IndicatorSection.sl &&
        tpAr) ||
      (i.indicatorAction === IndicatorAction.closeDeal &&
        i.section === IndicatorSection.sl &&
        slAr)
        ? undefined
        : i.percentile
          ? undefined
          : [IndicatorEnum.stoch, IndicatorEnum.stochRSI].includes(i.type)
            ? i.rsiValue2 !== rsiValue2Enum.custom
              ? i.stochRange === StochRangeEnum.lower
                ? +(i.stochUpper ?? '80')
                : i.stochRange === StochRangeEnum.none
                  ? undefined
                  : i.stochRange === StochRangeEnum.upper
                    ? 100
                    : +(i.stochUpper ?? '20')
              : i.valueInsteadof
            : i.indicatorCondition === IndicatorStartConditionEnum.gt
              ? i.type === IndicatorEnum.ath
                ? 0
                : 100
              : i.indicatorValue
                ? i.type === IndicatorEnum.ath
                  ? Math.abs(parseFloat(i.indicatorValue)) * -1
                  : parseFloat(i.indicatorValue)
                : undefined,
    lowerLimit:
      i.indicatorAction === IndicatorAction.riskReward ||
      (i.indicatorAction === IndicatorAction.startDca && scaleAr) ||
      (i.indicatorAction === IndicatorAction.closeDeal &&
        i.section !== IndicatorSection.sl &&
        tpAr) ||
      (i.indicatorAction === IndicatorAction.closeDeal &&
        i.section === IndicatorSection.sl &&
        slAr)
        ? undefined
        : i.percentile
          ? undefined
          : [IndicatorEnum.stoch, IndicatorEnum.stochRSI].includes(i.type)
            ? i.rsiValue2 !== rsiValue2Enum.custom
              ? i.stochRange === StochRangeEnum.upper
                ? +(i.stochLower ?? '20')
                : i.stochRange === StochRangeEnum.none
                  ? undefined
                  : i.stochRange === StochRangeEnum.lower
                    ? 0
                    : +(i.stochLower ?? '20')
              : undefined
            : i.indicatorCondition === IndicatorStartConditionEnum.gt
              ? i.indicatorValue
                ? i.type === IndicatorEnum.ath
                  ? Math.abs(parseFloat(i.indicatorValue)) * -1
                  : parseFloat(i.indicatorValue)
                : undefined
              : i.indicatorCondition === IndicatorStartConditionEnum.lt
                ? i.type === IndicatorEnum.ath
                  ? -100
                  : 0
                : undefined,
    type: i.type,
    maType: i.maType,
    uuid: i.uuid,
    signal: i.signal,
    condition: i.condition,
    stochSmoothK: +(i.stochSmoothK ?? '3'),
    stochSmoothD: +(i.stochSmoothD ?? '1'),
    stochRSI: +(i.stochRSI ?? '14'),
    leftBars: +(i.leftBars ?? '15'),
    rightBars: +(i.rightBars ?? '15'),
    basePeriods: +(i.basePeriods ?? '36'),
    pumpPeriods: +(i.pumpPeriods ?? '8'),
    pump: +(i.pump ?? '3'),
    baseCrack: +(i.baseCrack ?? '3'),
    psarStart: +(i.psarStart ?? '0.02'),
    psarInc: +(i.psarInc ?? '0.02'),
    psarMax: +(i.psarMax ?? '0.2'),
    stochRange: i.stochRange,
    voShort: i.voShort ?? 5,
    voLong: i.voLong ?? 10,
    uoFast: i.uoFast ?? 7,
    uoMiddle: i.uoMiddle ?? 14,
    uoSlow: i.uoSlow ?? 28,
    momSource: i.momSource ?? 'close',
    bbwpLookback: i.bbwpLookback ?? 252,
    ecdTrigger: i.ecdTrigger ?? ECDTriggerEnum.both,
    xOscillator1:
      showXo && chartInterval !== tvIntervalMap[i.indicatorInterval]
        ? 'None'
        : (i.xOscillator1 ?? IndicatorEnum.rsi),
    xOscillator2: showXo ? (i.xOscillator2 ?? IndicatorEnum.mfi) : 'None',
    xOscillator2length: showXo ? (i.xOscillator2length ?? 14) : undefined,
    xOscillator2Interval: showXo
      ? (i.xOscillator2Interval ?? i.indicatorInterval)
      : undefined,
    xOscillator2voLong: showXo ? (i.xOscillator2voLong ?? 10) : undefined,
    xOscillator2voShort: showXo ? (i.xOscillator2voShort ?? 5) : undefined,
    percentile: i.percentile,
    percentileLookback: i.percentileLookback,
    percentilePercentage: i.percentilePercentage,
    percentileCondition: i.indicatorCondition,
    mar1type: i.mar1type,
    mar1length: i.mar1length,
    mar2type: i.mar2type,
    mar2length: i.mar2length,
    bbwMa: i.bbwMa ?? MAEnum.sma,
    bbwMaLength: i.bbwMaLength ?? 20,
    bbwMult: i.bbwMult ?? 2,
    macdFast: i.macdFast ?? 12,
    macdSlow: i.macdSlow ?? 26,
    macdMaSource: i.macdMaSource ?? MAEnum.ema,
    macdMaSignal: i.macdMaSignal ?? MAEnum.ema,
    divOscillators: i.divOscillators,
    divType: i.divType,
    divMinCount: i.divMinCount,
    trendFilter: !!i.trendFilter,
    trendFilterLookback: i.trendFilterLookback ?? 10,
    trendFilterValue: i.trendFilterValue ?? 2,
    trendFilterType: i.trendFilterType ?? TrendFilterOperatorEnum.lower,
    factor: i.factor ?? 3,
    atrLength: i.atrLength ?? 10,
    pcUp: `${Math.abs(+(i.pcValue ?? '5'))}`,
    pcDown: `${Math.abs(+(i.pcValue ?? '5'))}`,
    pcCondition:
      +(i.pcValue ?? '5') > 0 ? PCConditionEnum.up : PCConditionEnum.down,
    ppHighLeft: +(i.ppHighLeft ?? 5),
    ppHighRight: +(i.ppHighRight ?? 5),
    ppLowLeft: +(i.ppLowLeft ?? 5),
    ppLowRight: +(i.ppLowRight ?? 5),
    ppMult: +(i.ppMult ?? 1),
    showHH: i.ppValue === ppValueEnum.anyH || i.ppValue === ppValueEnum.hh,
    showLH: i.ppValue === ppValueEnum.anyH || i.ppValue === ppValueEnum.lh,
    showHL: i.ppValue === ppValueEnum.anyL || i.ppValue === ppValueEnum.hl,
    showLL: i.ppValue === ppValueEnum.anyL || i.ppValue === ppValueEnum.ll,
    showBearMarket: i.ppValue === ppValueEnum.bearMarket,
    showBullMarket: i.ppValue === ppValueEnum.bullMarket,
    showIBearBoS:
      i.ppValue === ppValueEnum.iBearBoS ||
      i.ppValue === ppValueEnum.IanyBear ||
      i.ppValue === ppValueEnum.bearAnyBoS,
    showIBearCHoCH:
      i.ppValue === ppValueEnum.iBearCHoCH ||
      i.ppValue === ppValueEnum.IanyBear ||
      i.ppValue === ppValueEnum.bearAnyCHoCH,
    showIBullBoS:
      i.ppValue === ppValueEnum.iBullBoS ||
      i.ppValue === ppValueEnum.IanyBull ||
      i.ppValue === ppValueEnum.bullAnyBoS,
    showIBullCHoCH:
      i.ppValue === ppValueEnum.iBullCHoCH ||
      i.ppValue === ppValueEnum.IanyBull ||
      i.ppValue === ppValueEnum.bullAnyCHoCH,
    showSBearBoS:
      i.ppValue === ppValueEnum.sBearBoS ||
      i.ppValue === ppValueEnum.SanyBear ||
      i.ppValue === ppValueEnum.bearAnyBoS,
    showSBearCHoCH:
      i.ppValue === ppValueEnum.sBearCHoCH ||
      i.ppValue === ppValueEnum.SanyBear ||
      i.ppValue === ppValueEnum.bearAnyCHoCH,
    showSBullBoS:
      i.ppValue === ppValueEnum.sBullBoS ||
      i.ppValue === ppValueEnum.SanyBull ||
      i.ppValue === ppValueEnum.bullAnyBoS,
    showSBullCHoCH:
      i.ppValue === ppValueEnum.sBullCHoCH ||
      i.ppValue === ppValueEnum.SanyBull ||
      i.ppValue === ppValueEnum.bullAnyCHoCH,
    showSl: i.ppValue === ppValueEnum.sl || i.ppValue === ppValueEnum.anySWL,
    showWl: i.ppValue === ppValueEnum.wl || i.ppValue === ppValueEnum.anySWL,
    showSh: i.ppValue === ppValueEnum.sh || i.ppValue === ppValueEnum.anySWH,
    showWh: i.ppValue === ppValueEnum.wh || i.ppValue === ppValueEnum.anySWH,
    showResistance:
      (i.indicatorAction === IndicatorAction.riskReward &&
        i.srCrossingValue === SRCrossingEnum.resistance) ||
      i.indicatorAction !== IndicatorAction.riskReward,
    showSupport:
      (i.indicatorAction === IndicatorAction.riskReward &&
        i.srCrossingValue === SRCrossingEnum.support) ||
      i.indicatorAction !== IndicatorAction.riskReward,
    showUpper:
      (i.indicatorAction === IndicatorAction.riskReward &&
        i.bbCrossingValue === BBCrossingEnum.upper) ||
      i.indicatorAction !== IndicatorAction.riskReward,
    showMiddle:
      (i.indicatorAction === IndicatorAction.riskReward &&
        i.bbCrossingValue === BBCrossingEnum.middle) ||
      i.indicatorAction !== IndicatorAction.riskReward,
    showLower:
      (i.indicatorAction === IndicatorAction.riskReward &&
        i.bbCrossingValue === BBCrossingEnum.lower) ||
      i.indicatorAction !== IndicatorAction.riskReward,
    showUp:
      (i.indicatorAction === IndicatorAction.riskReward &&
        i.stCondition === STConditionEnum.up) ||
      i.indicatorAction !== IndicatorAction.riskReward,
    showDown:
      (i.indicatorAction === IndicatorAction.riskReward &&
        i.stCondition === STConditionEnum.down) ||
      i.indicatorAction !== IndicatorAction.riskReward,
    useCallback:
      i.indicatorAction === IndicatorAction.riskReward ||
      (i.indicatorAction === IndicatorAction.startDca && scaleAr) ||
      (i.indicatorAction === IndicatorAction.closeDeal &&
        i.section !== IndicatorSection.sl &&
        tpAr) ||
      (i.indicatorAction === IndicatorAction.closeDeal &&
        i.section === IndicatorSection.sl &&
        slAr),
    arPrice:
      ((i.indicatorAction === IndicatorAction.startDca && scaleAr) ||
        (i.indicatorAction === IndicatorAction.closeDeal &&
          i.section !== IndicatorSection.sl &&
          tpAr) ||
        (i.indicatorAction === IndicatorAction.closeDeal &&
          i.section === IndicatorSection.sl &&
          slAr)) &&
      [IndicatorEnum.atr, IndicatorEnum.adr].includes(i.type),
    arFactor:
      ((i.indicatorAction === IndicatorAction.startDca && scaleAr) ||
        (i.indicatorAction === IndicatorAction.closeDeal &&
          i.section !== IndicatorSection.sl &&
          tpAr) ||
        (i.indicatorAction === IndicatorAction.closeDeal &&
          i.section === IndicatorSection.sl &&
          slAr)) &&
      [IndicatorEnum.atr, IndicatorEnum.adr].includes(i.type)
        ? +(i.dynamicArFactor || '1') *
          (strategy === StrategyEnum.long ? -1 : 1) *
          (i.indicatorAction === IndicatorAction.closeDeal &&
          i.section !== IndicatorSection.sl
            ? -1
            : 1)
        : undefined,
    athLookback: i.athLookback ?? 100,
    kcMa: i.kcMa ?? MAEnum.ema,
    kcRange: i.kcRange ?? RangeType.atr,
    kcRangeLength: i.kcRangeLength ?? 20,
    obfvgValue: i.obfvgValue ?? OBFVGValueEnum.bullish,
    obfvgRef: i.obfvgRef ?? OBFVGRefEnum.middle,
    sessionDays: i.sessionDays,
    sessionRule: i.sessionRule,
    lwMaxDuration: +(i.lwMaxDuration ?? 2),
    lwThreshold: +(i.lwThreshold ?? 1000),
  };

  return chartIndicator;
}

/**
 * Maps DCA indicator condition to chart signal format
 */

/**
 * Filters indicators based on current chart interval
 * Replicates old dashboard logic for interval-based filtering
 */
export function filterIndicatorsByInterval(
  indicators: ChartIndicatorsConfig,
  chartInterval: string
): ChartIndicatorsConfig {
  if (!chartInterval) return indicators;

  // For now, return all indicators - in the old dashboard this filtered by indicatorInterval
  // This would need to be expanded based on the indicator configuration structure
  return indicators;
}
