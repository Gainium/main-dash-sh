import { logger } from '@/lib/loggerInstance';
import { IndicatorEnum, MAEnum, type ChartIndicatorConfig } from '@/types';
import {} from '@/types/indicators/indicatorTypes';
import { OBFVGValueEnum } from '@gainium/backtester/dist/types';

type TradingViewInput = Record<string, string | number | boolean>;

type TradingViewOverrides = Record<string, string | number | boolean>;

export interface TradingViewStudyDescriptor {
  name: string;
  inputs: TradingViewInput;
  overrides?: TradingViewOverrides;
  forceOverlay?: boolean;
  options?: {
    priceScaleId?: string;
    scaleMargins?: {
      top?: number;
      bottom?: number;
    };
  };
}

const STUDY_NAME_MAP: Omit<
  Record<IndicatorEnum | string, string>,
  IndicatorEnum.ma
> = {
  [IndicatorEnum.rsi]: 'Relative Strength Index (Custom)',
  [IndicatorEnum.cci]: 'Commodity Channel Index (Custom)',
  [IndicatorEnum.ao]: 'Awesome Oscillator (Custom)',
  [IndicatorEnum.wr]: 'Williams %R (Custom)',
  [IndicatorEnum.mom]: 'Momentum (Custom)',
  [IndicatorEnum.adx]: 'Average Directional Index (Custom)',
  [IndicatorEnum.bbw]: 'Bollinger Bands Width (Custom)',
  [IndicatorEnum.macd]: 'MACD (Custom)',
  [IndicatorEnum.tv]: 'Combined Ratings',
  [IndicatorEnum.bb]: 'Bollinger Bands (Custom)',
  [IndicatorEnum.stoch]: 'Stochastic (Custom)',
  [IndicatorEnum.stochRSI]: 'Stochastic RSI (Custom)',
  [IndicatorEnum.sr]: 'Support Resistance',
  [IndicatorEnum.qfl]: 'Quickfingers Luc base scanner',
  [IndicatorEnum.mfi]: 'Money Flow Index (Custom)',
  [IndicatorEnum.psar]: 'Parabolic SAR (Custom)',
  [IndicatorEnum.vo]: 'Volume Oscillator (Custom)',
  [IndicatorEnum.uo]: 'Ultimate Oscillator (Custom)',
  [IndicatorEnum.bbwp]: 'Bollinger Bands Width Percentile',
  [IndicatorEnum.ecd]: 'Engulfing candle detector',
  [IndicatorEnum.xo]: 'Oscillator crossover',
  [IndicatorEnum.mar]: 'Moving Average Ratio (MAR)',
  [IndicatorEnum.bbpb]: 'Bollinger Bands %B (Custom)',
  [IndicatorEnum.div]: 'Divergences',
  [IndicatorEnum.st]: 'SuperTrend (Custom)',
  [IndicatorEnum.pc]: 'Price Change',
  [IndicatorEnum.atr]: 'Average True Range (Custom)',
  [IndicatorEnum.pp]: 'Market Structure',
  [IndicatorEnum.adr]: 'Average Daily Range',
  [IndicatorEnum.ath]: 'ATH Drawdown',
  [IndicatorEnum.kc]: 'Keltner Channel (Custom)',
  [IndicatorEnum.kcpb]: 'Keltner Channel %B',
  [IndicatorEnum.unpnl]: '',
  [IndicatorEnum.dc]: 'Donchian Channels (Custom)',
  [IndicatorEnum.obfvg]: 'Fair Value Gaps',
  [IndicatorEnum.session]: 'Session Selector',
  [IndicatorEnum.lw]: 'Long Wick Detector',
  [IndicatorEnum.mg]: 'McGinley Dynamic',
};

// AR-price variants: drawn as a price level on the candle pane when
// indicator.arPrice === true (mirrors legacy `arPriceStudies`).
const AR_PRICE_STUDY_NAME_MAP: Record<string, string> = {
  [IndicatorEnum.atr]: 'Average True Range Price (Custom)',
  [IndicatorEnum.adr]: 'Average Daily Range Price',
};

const MA_STUDY_NAME_MAP: Omit<Record<MAEnum, string>, MAEnum.price> = {
  [MAEnum.ema]: 'Moving Average Exponential (Custom)',
  [MAEnum.sma]: 'Simple Moving Average',
  [MAEnum.wma]: 'Moving Average Weighted (Custom)',
  [MAEnum.dema]: 'Double EMA (Custom)',
  [MAEnum.tema]: 'Triple EMA (Custom)',
  [MAEnum.vwma]: 'VWMA (Custom)',
  [MAEnum.hma]: 'Hull Moving Average (Custom)',
  [MAEnum.rma]: 'RMA',
};

const OVERLAY_TYPES = new Set<string>([
  IndicatorEnum.ma,
  IndicatorEnum.bb,
  IndicatorEnum.bbpb,
  IndicatorEnum.kc,
  IndicatorEnum.kcpb,
  IndicatorEnum.psar,
  IndicatorEnum.st,
  IndicatorEnum.pp,
  IndicatorEnum.qfl,
  IndicatorEnum.sr,
  IndicatorEnum.obfvg,
  IndicatorEnum.dc,
]);

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

/* const LEGACY_STUDY_ALIASES = [
  'Relative Strength Index',
  'macd',
  'Stochastic',
  'Stochastic RSI',
  'Bollinger Bands',
  'Bollinger Bands %B',
  'Bollinger Bands Width',
  'Moving Average',
  'Moving Average Exponential',
  'Parabolic SAR',
  'Average True Range',
  'Average Daily Range',
  'Momentum',
  'On Balance Volume',
  'Volume Oscillator',
  'Ultimate Oscillator',
  'Commodity Channel Index',
  'Average Directional Index',
  'Money Flow Index',
  'SuperTrend',
  'Market Structure',
  'Quickfingers Luc base scanner',
  'Support Resistance',
  'Divergences',
  'Moving Average Ratio (mar)',
  'Price Change',
  'Engulfing candle detector',
  'Oscillator crossover',
  'Combined Ratings',
  'Keltner Channel',
  'Keltner Channel %B',
  'Fair Value Gaps',
  'Donchian Channels',
  'Awesome Oscillator',
  'Williams %R',
  'ATH Drawdown',
]; */

export const SUPPORTED_STUDY_NAMES = new Set<string>([
  ...Object.values(STUDY_NAME_MAP).filter((name): name is string =>
    Boolean(name)
  ),
  ...Object.values(MA_STUDY_NAME_MAP),
  // AR-price variants must be listed too, otherwise clearCustomIndicators()
  // won't recognise/remove them on refresh and changing the Multiplier
  // stacks a duplicate study instead of replacing it.
  ...Object.values(AR_PRICE_STUDY_NAME_MAP),
  /* ...LEGACY_STUDY_ALIASES, */
]);

const toBoolean = (value: unknown, fallback = false): boolean => {
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
};

const toUpperCase = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string' && value.length > 0) {
    return value.toUpperCase();
  }
  return fallback;
};

/**
 * A moving-average selector as the TradingView studies spell it: MA types
 * upper-case, the pseudo-type `price` verbatim.
 */
const toMaStudyType = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  return value.toLowerCase() === MAEnum.price
    ? MAEnum.price
    : value.toUpperCase();
};

const buildPercentileInputs = (
  indicator: ChartIndicatorConfig
): TradingViewInput => {
  if (!indicator.percentile) {
    return {
      usePercentile: false,
      percentileLookback: toNumber(indicator.percentileLookback, 150),
      percentilePercentage: toNumber(indicator.percentilePercentage, 50),
    };
  }

  return {
    usePercentile: true,
    percentileLookback: toNumber(indicator.percentileLookback, 150),
    percentilePercentage: toNumber(indicator.percentilePercentage, 50),
  };
};

const mergeInputs = (
  base: TradingViewInput,
  extra: TradingViewInput | null
): TradingViewInput => {
  if (!extra) {
    return base;
  }
  return {
    ...base,
    ...extra,
  };
};

const buildInputs = (
  indicator: ChartIndicatorConfig,
  type: IndicatorEnum | string
): TradingViewInput | null => {
  const percentileInputs = buildPercentileInputs(indicator);
  switch (type) {
    case IndicatorEnum.dc:
      return { in_0: toNumber(indicator.length, 20) };
    case IndicatorEnum.pc: {
      const upValue = toNumber(indicator.pcUp ?? indicator.pcValue, 5);
      const downValue = toNumber(indicator.pcDown ?? indicator.pcValue, 5);
      const condition = String(indicator.pcCondition ?? 'up');
      return {
        up: upValue,
        down: downValue,
        showUp: condition === 'up',
        showDown: condition === 'down',
      };
    }
    case IndicatorEnum.rsi:
      return mergeInputs(
        {
          length: toNumber(indicator.length, 14),
          smoothingLine: 'WMA',
          smoothingLength: toNumber(indicator.length, 14),
        },
        percentileInputs
      );
    case IndicatorEnum.ath:
      return { lookback: toNumber(indicator.athLookback, 100) };
    case IndicatorEnum.atr:
    case IndicatorEnum.adr: {
      const atrInputs: TradingViewInput = {
        in_0: toNumber(indicator.length ?? indicator.atrLength, 14),
      };
      // AR-price variant plots a price level on the candle pane and
      // takes a `factor` input (legacy getCommonConfig: factor: arFactor ?? 1).
      if (indicator.arPrice) {
        atrInputs['factor'] = toNumber(indicator.arFactor, 1);
      }
      return atrInputs;
    }
    case IndicatorEnum.mg:
      return { in_0: toNumber(indicator.length, 14) };
    case IndicatorEnum.st:
      return {
        in_0: toNumber(indicator.atrLength, 10),
        in_1: toNumber(indicator.factor, 3),
        showUp: toBoolean(indicator.showUp, true),
        showDown: toBoolean(indicator.showDown, true),
      };
    case IndicatorEnum.div: {
      const oscillatorSet = new Set(
        (indicator.divOscillators ?? []).map((entry) =>
          String(entry).toUpperCase()
        )
      );
      const contains = (code: string) => oscillatorSet.has(code);
      const divType = String(indicator.divType ?? '').toLowerCase();
      return {
        minDiv: toNumber(indicator.divMinCount, 2),
        plotBull: ['bull', 'abull'].includes(divType),
        plotBullHidden: ['hbull', 'abull'].includes(divType),
        plotBear: ['bear', 'abear'].includes(divType),
        plotBearHidden: ['hbear', 'abear'].includes(divType),
        mfi: contains('mfi'),
        macd: contains('macd'),
        rsi: contains('RSI'),
        cci: contains('cci'),
        ao: contains('ao'),
        wr: contains('wr'),
        uo: contains('uo'),
        mom: contains('mom'),
        stoch: contains('stoch'),
      };
    }
    case IndicatorEnum.mar:
      return mergeInputs(
        {
          type1: toUpperCase(indicator.mar1type, 'EMA'),
          type1length: toNumber(indicator.mar1length, 20),
          // "price" is the ONE value that must not be upper-cased. The study's
          // `type2` input lists `["SMA",…,"RMA","price"]` and its script tests
          // `"price" === type2` to decide between reading close and building a
          // second MA; fed "PRICE" it matches neither, so the ratio resolves to
          // n/a and the MAR line never draws. Legacy guards exactly this one
          // value (`mar2type !== MAEnum.price ? …toUpperCase() : MAEnum.price`).
          type2: toMaStudyType(indicator.mar2type, MAEnum.price),
          type2length: toNumber(indicator.mar2length, 20),
          trendFilter: toBoolean(indicator.trendFilter, false),
          trendLookback: toNumber(indicator.trendFilterLookback, 10),
          trendDiff: toNumber(indicator.trendFilterValue, 2),
          trendType: (() => {
            const raw = String(indicator.trendFilterType ?? '').toLowerCase();
            if (raw === 'lower') return 'lower';
            if (raw === 'higher') return 'higher';
            return 'between';
          })(),
        },
        percentileInputs
      );
    case IndicatorEnum.bbwp:
      return {
        length: toNumber(indicator.length, 20),
        smoothingLine: 'WMA',
        smoothingLength: toNumber(indicator.length, 20),
      };
    case IndicatorEnum.cci:
      return mergeInputs(
        {
          in_0: toNumber(indicator.length, 20),
          priceSource: String(indicator.momSource ?? 'close'),
          in_1: toNumber(indicator.bbwpLookback, 252),
        },
        percentileInputs
      );
    case IndicatorEnum.wr:
      return mergeInputs(
        { length: toNumber(indicator.length, 14) },
        percentileInputs
      );
    case IndicatorEnum.uo:
      return mergeInputs(
        {
          in_0: toNumber(indicator.uoFast, 7),
          in_1: toNumber(indicator.uoMiddle, 14),
          in_2: toNumber(indicator.uoSlow, 28),
        },
        percentileInputs
      );
    case IndicatorEnum.ao:
      return percentileInputs;
    case IndicatorEnum.mom:
      return mergeInputs(
        {
          in_0: toNumber(indicator.length, 10),
          in_1: String(indicator.momSource ?? 'close'),
        },
        percentileInputs
      );
    case IndicatorEnum.vo:
      return mergeInputs(
        {
          in_0: toNumber(indicator.voShort, 5),
          in_1: toNumber(indicator.voLong, 10),
        },
        percentileInputs
      );
    case IndicatorEnum.mfi:
      return mergeInputs(
        {
          in_o: toNumber(indicator.length, 14),
        },
        percentileInputs
      );
    case IndicatorEnum.adx:
      return mergeInputs(
        {
          in_0: toNumber(indicator.length, 14),
          in_1: toNumber(indicator.length, 14),
        },
        percentileInputs
      );
    case IndicatorEnum.bb:
    case IndicatorEnum.bbpb:
    case IndicatorEnum.bbw:
      return mergeInputs(
        {
          in_0: toNumber(indicator.length, 20),
          in_1: toNumber(indicator.bbwMult, 2),
          maType: toUpperCase(indicator.bbwMa, 'SMA'),
          maLength: toNumber(indicator.bbwMaLength, 20),
          showUpper: toBoolean(indicator.showUpper, true),
          showMiddle: toBoolean(indicator.showMiddle, true),
          showLower: toBoolean(indicator.showLower, true),
        },
        percentileInputs
      );
    case IndicatorEnum.kc:
    case IndicatorEnum.kcpb:
      return mergeInputs(
        {
          maType: toUpperCase(indicator.kcMa, 'EMA'),
          length: toNumber(indicator.length, 20),
          mult: toNumber(indicator.bbwMult, 2),
          range: toUpperCase(indicator.kcRange, 'atr'),
          rangeLength: toNumber(indicator.kcRangeLength, 10),
          showUpper: toBoolean(indicator.showUpper, true),
          showBasis: toBoolean(indicator.showMiddle, true),
          showLower: toBoolean(indicator.showLower, true),
        },
        percentileInputs
      );
    case IndicatorEnum.psar:
      return {
        in_0: toNumber(indicator.psarStart, 0.02),
        in_1: toNumber(indicator.psarInc, 0.02),
        in_2: toNumber(indicator.psarMax, 0.2),
      };
    case IndicatorEnum.stoch:
      return {
        in_0: toNumber(indicator.length, 14),
        in_1: toNumber(indicator.stochSmoothD, 1),
        in_2: toNumber(indicator.stochSmoothK, 3),
      };
    case IndicatorEnum.stochRSI:
      return {
        in_0: toNumber(indicator.stochRSI, 14),
        in_1: toNumber(indicator.length, 14),
        in_2: toNumber(indicator.stochSmoothK, 3),
        in_3: toNumber(indicator.stochSmoothD, 1),
      };
    case IndicatorEnum.macd:
      return mergeInputs(
        {
          in_0: toNumber(indicator.macdFast, 12),
          in_1: toNumber(indicator.macdSlow, 26),
          in_2: toNumber(indicator.length, 9),
          maSource: toUpperCase(indicator.macdMaSource, 'EMA'),
          maSignal: toUpperCase(indicator.macdMaSignal, 'EMA'),
        },
        percentileInputs
      );
    case IndicatorEnum.ma: {
      const maType = toUpperCase(indicator.maType, 'EMA');
      const length = toNumber(indicator.length, 20);
      return maType === 'EMA' ? { length } : { in_0: length };
    }
    case IndicatorEnum.obfvg:
      return {
        showBearishFVG:
          indicator.obfvgValue === OBFVGValueEnum.bearish ||
          indicator.obfvgValue === OBFVGValueEnum.any,
        showBullishFVG:
          indicator.obfvgValue === OBFVGValueEnum.bullish ||
          indicator.obfvgValue === OBFVGValueEnum.any,
      };
    case IndicatorEnum.pp:
      return {
        highLeftBars: toNumber(indicator.ppHighLeft, 5),
        highRightBars: toNumber(indicator.ppHighRight, 5),
        lowLeftBars: toNumber(indicator.ppLowLeft, 5),
        lowRightBars: toNumber(indicator.ppLowRight, 5),
        mult: toNumber(indicator.ppMult, 1),
        hh: toBoolean(indicator.showHH, false),
        hl: toBoolean(indicator.showHL, false),
        lh: toBoolean(indicator.showLH, false),
        ll: toBoolean(indicator.showLL, false),
        shh: toBoolean(indicator.showSBullBoS, false),
        slh: toBoolean(indicator.showSBullCHoCH, false),
        sll: toBoolean(indicator.showSBearBoS, false),
        shl: toBoolean(indicator.showSBearCHoCH, false),
        ihh: toBoolean(indicator.showIBullBoS, false),
        ilh: toBoolean(indicator.showIBullCHoCH, false),
        ill: toBoolean(indicator.showIBearBoS, false),
        ihl: toBoolean(indicator.showIBearCHoCH, false),
        sl: toBoolean(indicator.showSl, false),
        wl: toBoolean(indicator.showWl, false),
        sh: toBoolean(indicator.showSh, false),
        wh: toBoolean(indicator.showWh, false),
        bullMs: toBoolean(indicator.showBullMarket, false),
        bearMs: toBoolean(indicator.showBearMarket, false),
      };
    case IndicatorEnum.sr:
      return {
        leftBars: toNumber(indicator.leftBars, 15),
        rightBars: toNumber(indicator.rightBars, 15),
        showSupport: toBoolean(indicator.showSupport, true),
        showResistance: toBoolean(indicator.showResistance, true),
      };
    case IndicatorEnum.qfl:
      return {
        basePeriods: toNumber(indicator.basePeriods, 36),
        pumpPeriods: toNumber(indicator.pumpPeriods, 8),
        pump: toNumber(indicator.pump, 3),
        baseCrack: toNumber(indicator.baseCrack, 3),
      };
    case IndicatorEnum.tv:
      return {
        checkLevel: toNumber(indicator.length, 14),
        showStrongBuy: ['bothbuy', 'strongbuy'].includes(
          String(indicator.signal ?? '').toLowerCase()
        ),
        showStrongSell: ['bothsell', 'strongsell'].includes(
          String(indicator.signal ?? '').toLowerCase()
        ),
        showBuy: ['bothbuy', 'buy'].includes(
          String(indicator.signal ?? '').toLowerCase()
        ),
        showSell: ['bothsell', 'sell'].includes(
          String(indicator.signal ?? '').toLowerCase()
        ),
        useEntryExit:
          String(indicator.condition ?? '').toLowerCase() === 'entry',
      };
    case IndicatorEnum.ecd: {
      const trigger = String(indicator.ecdTrigger ?? '').toLowerCase();
      return {
        showBearish: ['both', 'bearish'].includes(trigger),
        showBullish: ['both', 'bullish'].includes(trigger),
      };
    }
    case IndicatorEnum.xo:
      return {
        xOscillator1: String(indicator.xOscillator1 ?? 'RSI'),
        xOscillator1length: toNumber(indicator.length, 7),
        xOscillator1voLong: toNumber(indicator.voLong, 10),
        xOscillator1voShort: toNumber(indicator.voShort, 5),
        xOscillator2: String(indicator.xOscillator2 ?? 'mfi'),
        xOscillator2length: toNumber(indicator.xOscillator2length, 14),
        xOscillator2voLong: toNumber(indicator.xOscillator2voLong, 10),
        xOscillator2voShort: toNumber(indicator.xOscillator2voShort, 5),
      };
    case IndicatorEnum.lw: {
      const lwVal = indicator.lwValue ?? 'any';
      return {
        threshold: toNumber(indicator.lwThreshold, 2),
        maxDuration: toNumber(indicator.lwMaxDuration, 1000),
        showTop: lwVal === 'top' || lwVal === 'any',
        showBottom: lwVal === 'bottom' || lwVal === 'any',
        id: '',
      };
    }
    case IndicatorEnum.session: {
      const days = indicator.sessionDays ?? [1, 2, 3, 4, 5];
      return {
        sun: days.includes(0),
        mon: days.includes(1),
        tue: days.includes(2),
        wed: days.includes(3),
        thu: days.includes(4),
        fri: days.includes(5),
        sat: days.includes(6),
        inSession: (indicator.sessionRule ?? 'in') === 'in',
      };
    }
    default:
      return null;
  }
};

const buildOverrides = (
  indicator: ChartIndicatorConfig,
  type: IndicatorEnum | string
): TradingViewOverrides | undefined => {
  if (
    type === IndicatorEnum.st ||
    type === IndicatorEnum.dc ||
    type === IndicatorEnum.tv
  ) {
    return undefined;
  }
  if (indicator.type === IndicatorEnum.ma) {
    return {
      'plot.linewidth': 2,
      'Smoothing Line.visible': false,
    };
  }

  const overrides: TradingViewOverrides = {
    'hlines background.visible': false,
    'hlines top background.visible': false,
    'hlines bottom background.visible': false,
    'upperlimit.visible': false,
    'lowerlimit.visible': false,
    'plot.linewidth': 2,
    'percentile top fill.visible': false,
    'percentile bottom fill.visible': false,
    'percentile.visible': false,
  };

  if (indicator.percentile) {
    const condition = String(indicator.percentileCondition ?? '').toLowerCase();
    if (['gt', 'lt'].includes(condition)) {
      overrides['percentile top fill.visible'] = condition === 'gt';
      overrides['percentile bottom fill.visible'] = condition === 'lt';
    } else if (['cu', 'cd'].includes(condition)) {
      overrides['percentile.visible'] = true;
    }
    // NOTE: hiding the two fill-anchor plots does NOT keep them out of the
    // pane's autoscale — TradingView scales on the values a study returns, not
    // on plot visibility. The anchors are kept inside the study's own range in
    // `customIndicators.js` (`percentileBand`) instead.
  }

  // Define oscillators that will use separate price scale
  const oscillatorTypes = new Set<string>([
    IndicatorEnum.rsi,
    IndicatorEnum.cci,
    IndicatorEnum.mfi,
    IndicatorEnum.wr,
    IndicatorEnum.stoch,
    IndicatorEnum.stochRSI,
    IndicatorEnum.ao,
    IndicatorEnum.mom,
    IndicatorEnum.vo,
    IndicatorEnum.uo,
    IndicatorEnum.adx,
    IndicatorEnum.macd,
    IndicatorEnum.bbw,
    IndicatorEnum.mar,
    IndicatorEnum.ath,
  ]);

  // Don't set explicit limit overrides for oscillators - let them auto-scale
  // Only set limits for non-oscillator indicators or when explicitly needed
  const shouldSetLimits = oscillatorTypes.has(type);

  if (shouldSetLimits && indicator.lowerLimit !== undefined) {
    overrides['lowerLimit.value'] = indicator.lowerLimit;
    overrides['lowerLimit.visible'] = true;
  }

  if (shouldSetLimits && indicator.upperLimit !== undefined) {
    overrides['upperLimit.value'] = indicator.upperLimit;
    overrides['upperLimit.visible'] = true;
  }

  if (
    shouldSetLimits &&
    indicator.upperLimit !== undefined &&
    indicator.lowerLimit !== undefined
  ) {
    overrides['upperLimit.visible'] = false;
    overrides['lowerLimit.visible'] = false;
  }

  const boundedRangeIndicators = new Set<string>([
    IndicatorEnum.stoch,
    IndicatorEnum.stochRSI,
  ]);

  if (
    indicator.upperLimit !== undefined &&
    indicator.lowerLimit !== undefined &&
    boundedRangeIndicators.has(type)
  ) {
    overrides['hlines top background.visible'] = true;
    overrides['hlines bottom background.visible'] = true;
  } else if (
    indicator.upperLimit !== undefined &&
    indicator.lowerLimit !== undefined
  ) {
    overrides['hlines background.visible'] = true;
  }

  if (
    [
      IndicatorEnum.mar,
      IndicatorEnum.adx,
      IndicatorEnum.psar,
      IndicatorEnum.bb,
      IndicatorEnum.kc,
      IndicatorEnum.bbw,
      IndicatorEnum.macd,
      IndicatorEnum.uo,
      IndicatorEnum.mom,
      IndicatorEnum.mfi,
      IndicatorEnum.qfl,
      IndicatorEnum.sr,
      IndicatorEnum.ecd,
      IndicatorEnum.xo,
      IndicatorEnum.bbpb,
      IndicatorEnum.div,
      IndicatorEnum.pp,
      IndicatorEnum.obfvg,
    ].includes(indicator.type)
  ) {
    delete overrides['hlines top background.visible'];
    delete overrides['hlines bottom background.visible'];
    delete overrides['hlines top background'];
    delete overrides['hlines bottom background'];
    delete overrides['plot.linewidth'];
    delete overrides['plot'];
  }
  if (
    [
      IndicatorEnum.rsi,
      IndicatorEnum.cci,
      IndicatorEnum.ao,
      IndicatorEnum.wr,
      IndicatorEnum.vo,
      IndicatorEnum.div,
      IndicatorEnum.atr,
      IndicatorEnum.adr,
      IndicatorEnum.ath,
    ].includes(indicator.type)
  ) {
    delete overrides['hlines top background.visible'];
    delete overrides['hlines bottom background.visible'];
    delete overrides['hlines top background'];
    delete overrides['hlines bottom background'];
  }
  if (indicator.type === IndicatorEnum.ath) {
    overrides['mean.visible'] = false;
    overrides['mean.transparency'] = 100;
    overrides['mean.linewidth'] = 0;
  }
  if (
    [IndicatorEnum.stoch, IndicatorEnum.stochRSI, IndicatorEnum.div].includes(
      indicator.type
    )
  ) {
    delete overrides['plot.linewidth'];
    delete overrides['plot'];
    delete overrides['percentile top fill.visible'];
    delete overrides['percentile bottom fill.visible'];
    delete overrides['percentile top fill'];
    delete overrides['percentile bottom fill'];
    delete overrides['percentile'];
    delete overrides['percentile.visible'];
  }
  const arPriceIndicators = [IndicatorEnum.atr, IndicatorEnum.adr];
  if (
    [
      IndicatorEnum.psar,
      IndicatorEnum.bb,
      IndicatorEnum.kc,
      IndicatorEnum.qfl,
      IndicatorEnum.sr,
      IndicatorEnum.ecd,
      IndicatorEnum.xo,
      IndicatorEnum.div,
      IndicatorEnum.pc,
      IndicatorEnum.pp,
      IndicatorEnum.obfvg,
    ].includes(indicator.type) ||
    (arPriceIndicators.includes(indicator.type) && indicator.arPrice)
  ) {
    delete overrides['percentile top fill.visible'];
    delete overrides['percentile bottom fill.visible'];
    delete overrides['percentile top fill'];
    delete overrides['percentile bottom fill'];
    delete overrides['hlines background.visible'];
    delete overrides['hlines background'];
    delete overrides['percentile'];
    delete overrides['percentile.visible'];
    delete overrides['upperlimit'];
    delete overrides['lowerlimit'];
    delete overrides['upperlimit.visible'];
    delete overrides['lowerlimit.visible'];
    delete overrides['upperLimit'];
    delete overrides['lowerLimit'];
    delete overrides['upperLimit.visible'];
    delete overrides['lowerLimit.visible'];
    delete overrides['upperlimit.value'];
    delete overrides['lowerlimit.value'];
    delete overrides['upperLimit.value'];
    delete overrides['lowerLimit.value'];
  }
  if (arPriceIndicators.includes(indicator.type) && indicator.arPrice) {
    // Legacy does NOT plot the AR indicator line — the study only exists to
    // emit its value (via the callback) for positioning the order lines. The
    // custom AR-price studies expose their line as `plot_0`, so hide that.
    return { 'plot_0.visible': false };
  }

  return overrides;
};

export function buildTradingViewStudyDescriptor(
  indicator: ChartIndicatorConfig
): TradingViewStudyDescriptor | null {
  const type = indicator.type ?? '';
  if (!type) {
    return null;
  }

  // AR-price variant: a plain atr/adr study renders in its own pane, but
  // when arPrice is set it switches to the price-level study overlaid on
  // the candles (mirrors legacy arPriceStudies selection).
  const isArPrice =
    (type === IndicatorEnum.atr || type === IndicatorEnum.adr) &&
    !!indicator.arPrice;

  let studyName: string | undefined;
  if (type === IndicatorEnum.ma) {
    const maType = indicator.maType ?? MAEnum.ema;
    if (maType === MAEnum.price) {
      return null;
    }
    studyName = MA_STUDY_NAME_MAP[maType] ?? STUDY_NAME_MAP[IndicatorEnum.ma];
  } else if (isArPrice) {
    studyName = AR_PRICE_STUDY_NAME_MAP[type];
  } else {
    studyName = STUDY_NAME_MAP[type];
  }

  if (!studyName) {
    logger.warn('Unsupported indicator for TradingView bridge', {
      type,
      indicator,
    });
    return null;
  }

  const inputs = buildInputs(indicator, type);
  if (!inputs) {
    logger.warn('Unable to build TradingView inputs for indicator', {
      type,
      indicator,
    });
    return null;
  }

  const descriptor: TradingViewStudyDescriptor = {
    name: studyName,
    inputs,
  };

  const overrides = buildOverrides(indicator, type);
  if (overrides && Object.keys(overrides).length > 0) {
    descriptor.overrides = overrides;
  }

  if (OVERLAY_TYPES.has(type) || isArPrice) {
    descriptor.forceOverlay = true;
    logger.info('[chart-indicators] Setting forceOverlay for indicator', {
      type,
      studyName,
    });
  }

  // Set proper scale options for oscillators
  const oscillatorTypes = new Set<string>([
    IndicatorEnum.rsi,
    IndicatorEnum.cci,
    IndicatorEnum.mfi,
    IndicatorEnum.wr,
    IndicatorEnum.stoch,
    IndicatorEnum.stochRSI,
    IndicatorEnum.ao,
    IndicatorEnum.mom,
    IndicatorEnum.vo,
    IndicatorEnum.uo,
    IndicatorEnum.adx,
    IndicatorEnum.macd,
    IndicatorEnum.bbw,
    IndicatorEnum.mar,
  ]);

  if (oscillatorTypes.has(type)) {
    descriptor.options = {
      priceScaleId: 'oscillator',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
    };
    logger.info('[chart-indicators] Setting oscillator scale options', {
      type,
      studyName,
      options: descriptor.options,
    });
  }

  logger.info('[chart-indicators] Built study descriptor', {
    type,
    studyName,
    hasInputs: !!descriptor.inputs,
    hasOverrides: !!descriptor.overrides,
    hasOptions: !!descriptor.options,
    forceOverlay: descriptor.forceOverlay,
    descriptor,
  });

  return descriptor;
}
