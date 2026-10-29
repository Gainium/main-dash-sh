import {
  BBCrossingEnum,
  DCValueEnum,
  DivTypeEnum,
  ECDTriggerEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  MAEnum,
  OBFVGRefEnum,
  OBFVGValueEnum,
  SessionLevelEnum,
  SessionRuleEnum,
  LWValueEnum,
  ppValueEnum,
  ppValueTypeEnum,
  RangeType,
  rsiValueEnum,
  rsiValue2Enum,
  rsiValue2Enum2,
  SRCrossingEnum,
  STConditionEnum,
  StochRangeEnum,
  TradingviewAnalysisConditionEnum,
  TradingviewAnalysisSignalEnum,
  TrendFilterOperatorEnum,
  LWConditionEnum,
  OTELegEnum,
  ADXModeEnum,
  KDJLineEnum,
  KDJCompareToEnum,
  VWAPAnchorEnum,
  VWAPLineEnum,
  CandleSourceEnum,
  CandleColorEnum,
  CandleTriggerEnum,
  OBSideEnum,
  OBLevelEnum,
  SqzSignalEnum,
  SqzMomentumEnum,
  SessionLevelsActiveEnum,
  type SettingsIndicators,
} from '..';
import {
  IndicatorCategories,
  type IndicatorDefinition,
  type IndicatorFieldDefinition,
} from './indicatorTypes';
import {
  DEFAULT_SMOOTHING_LENGTH,
  MAX_SMOOTHING_LENGTH,
  SMOOTHING_TYPES,
  deriveSmoothingGatingParams,
  resolveSmoothing,
  resolveSmoothingCompare,
  resolveSmoothingType,
  supportsSmoothing,
} from '@/utils/indicators/smoothing';
import { DIV_PIVOT_DEFAULTS } from '@/utils/indicators/divergencePivots';
import {
  resolveSessionPreset,
  SESSION_ALL_DAY,
  SESSION_CUSTOM,
  SESSION_PRESETS,
  sessionPresetParams,
  sessionRuleParams,
} from '@/utils/indicators/sessionWindow';

/**
 * Static catalog describing every supported indicator, ported from the legacy dashboard.
 * This file intentionally contains no React/UI code so it can be reused across widgets and tests.
 */

const makeBooleanField = (
  def: Omit<IndicatorFieldDefinition, 'type'>
): IndicatorFieldDefinition => ({
  type: 'boolean',
  ...def,
});

const makeSelectField = (
  def: Omit<IndicatorFieldDefinition, 'type'>
): IndicatorFieldDefinition => ({
  type: 'select',
  ...def,
});

const makeNumberField = (
  def: Omit<IndicatorFieldDefinition, 'type'>
): IndicatorFieldDefinition => ({
  type: 'number',
  ...def,
});

const makeTimeField = (
  def: Omit<IndicatorFieldDefinition, 'type'>
): IndicatorFieldDefinition => ({
  type: 'time',
  ...def,
});

// Time zones offered for a session: UTC plus the main market centres.
const SESSION_TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Chicago', label: 'Chicago' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Frankfurt' },
  { value: 'Europe/Zurich', label: 'Zurich' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'Mumbai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

const sessionTimezoneLabel = (timezone?: string) =>
  SESSION_TIMEZONE_OPTIONS.find((o) => o.value === (timezone || 'UTC'))
    ?.label ??
  timezone ??
  'UTC';

const makeIntervalField = (
  def: Omit<IndicatorFieldDefinition, 'type'>
): IndicatorFieldDefinition => ({
  type: 'interval',
  ...def,
  options: def.options ?? INTERVAL_OPTIONS,
});

const INDICATOR_CONDITION_OPTIONS = [
  { value: IndicatorStartConditionEnum.cd, label: 'Crossing down' },
  { value: IndicatorStartConditionEnum.cu, label: 'Crossing up' },
  { value: IndicatorStartConditionEnum.gt, label: 'Greater than' },
  { value: IndicatorStartConditionEnum.lt, label: 'Lower than' },
];

// Value-type indicators (one number vs a threshold) can also test a range.
const VALUE_CONDITION_OPTIONS = [
  ...INDICATOR_CONDITION_OPTIONS,
  { value: IndicatorStartConditionEnum.bw, label: 'Between' },
];

const SR_CONDITION_OPTIONS = [
  { value: IndicatorStartConditionEnum.cd, label: 'Price crossing down' },
  { value: IndicatorStartConditionEnum.cu, label: 'Price crossing up' },
];

// Legacy renders the condition for the [bb, kc, sr, psar, pp] group with a
// `Price ` prefix (indicators.tsx:1813-1822). The full four-option variant is
// used by kc.
const SESSION_LEVEL_OPTIONS = [
  { value: SessionLevelEnum.price, label: 'Price' },
  { value: SessionLevelEnum.prevOpen, label: 'Previous session open' },
  { value: SessionLevelEnum.prevHigh, label: 'Previous session high' },
  { value: SessionLevelEnum.prevMid, label: 'Previous session midpoint' },
  { value: SessionLevelEnum.prevLow, label: 'Previous session low' },
  { value: SessionLevelEnum.prevClose, label: 'Previous session close' },
  { value: SessionLevelEnum.curOpen, label: 'Current session open' },
  { value: SessionLevelEnum.curMid, label: 'Current session midpoint' },
];

const SESSION_LEVELS_ONLY = [
  { field: 'sessionRule' as const, equals: SessionRuleEnum.levels },
];

const PRICE_CONDITION_OPTIONS = [
  { value: IndicatorStartConditionEnum.cd, label: 'Price crossing down' },
  { value: IndicatorStartConditionEnum.cu, label: 'Price crossing up' },
  { value: IndicatorStartConditionEnum.gt, label: 'Price greater than' },
  { value: IndicatorStartConditionEnum.lt, label: 'Price lower than' },
];

const ST_CONDITION_OPTIONS = [
  { value: STConditionEnum.up, label: 'Up trend' },
  { value: STConditionEnum.down, label: 'Down trend' },
  { value: STConditionEnum.downToUp, label: 'From down to up' },
  { value: STConditionEnum.upToDown, label: 'From up to down' },
];

const PRICE_SOURCE_OPTIONS = [
  { value: 'open', label: 'open' },
  { value: 'high', label: 'high' },
  { value: 'low', label: 'low' },
  { value: 'close', label: 'close' },
  { value: 'hl2', label: 'hl2' },
  { value: 'hlc3', label: 'hlc3' },
  { value: 'ohlc4', label: 'ohlc4' },
];

const MA_TYPE_OPTIONS = [
  { value: MAEnum.sma, label: 'SMA' },
  { value: MAEnum.ema, label: 'EMA' },
  { value: MAEnum.wma, label: 'WMA' },
  { value: MAEnum.dema, label: 'DEMA' },
  { value: MAEnum.tema, label: 'TEMA' },
  { value: MAEnum.hma, label: 'HMA' },
  { value: MAEnum.vwma, label: 'VWMA' },
  { value: MAEnum.rma, label: 'RMA' },
];

const SMOOTHING_OPTIONS = [
  { value: 'none', label: 'None' },
  ...MA_TYPE_OPTIONS.filter((option) =>
    (SMOOTHING_TYPES as readonly string[]).includes(option.value)
  ),
];

const SMOOTHING_COMPARE_OPTIONS = [
  { value: 'value', label: 'Smoothed line vs value' },
  { value: 'line', label: 'Line vs smoothed line' },
];

// Card summary: "Smoothing: EMA 14", and "Compare: Line vs smoothed line" only
// when the condition tests the line against its smoothed copy. Nothing while
// smoothing is off.
const summarizeSmoothing = (params: SettingsIndicators): string | null => {
  const smoothing = resolveSmoothing(params);
  if (!smoothing) {
    return null;
  }
  const label =
    SMOOTHING_OPTIONS.find((option) => option.value === smoothing.type)
      ?.label ?? smoothing.type.toUpperCase();
  return `${label} ${smoothing.length}`;
};

const summarizeSmoothingCompare = (params: SettingsIndicators): string | null =>
  resolveSmoothingCompare(params) === 'line'
    ? (SMOOTHING_COMPARE_OPTIONS.find((option) => option.value === 'line')
        ?.label ?? null)
    : null;

// The averages the Moving Average and MA Ratio lines can be. McGinley Dynamic
// is a line of its own, not a basis for the Bollinger family, whose engines
// would compute it as an EMA.
const MA_LINE_OPTIONS = [
  ...MA_TYPE_OPTIONS,
  { value: MAEnum.mcginley, label: 'McGinley Dynamic' },
];

const MA_REFERENCE_OPTIONS = [
  { value: MAEnum.price, label: 'Current price' },
  ...MA_LINE_OPTIONS,
];

const INTERVAL_OPTIONS = [
  { value: ExchangeIntervals.oneM, label: '1 minute' },
  { value: ExchangeIntervals.threeM, label: '3 minutes' },
  { value: ExchangeIntervals.fiveM, label: '5 minutes' },
  { value: ExchangeIntervals.fifteenM, label: '15 minutes' },
  { value: ExchangeIntervals.thirtyM, label: '30 minutes' },
  { value: ExchangeIntervals.oneH, label: '1 hour' },
  { value: ExchangeIntervals.twoH, label: '2 hours' },
  { value: ExchangeIntervals.fourH, label: '4 hours' },
  { value: ExchangeIntervals.eightH, label: '8 hours' },
  { value: ExchangeIntervals.oneD, label: '1 day' },
  { value: ExchangeIntervals.oneW, label: '1 week' },
];

const KC_MA_OPTIONS = MA_TYPE_OPTIONS.filter((option) =>
  [MAEnum.sma, MAEnum.ema].includes(option.value as MAEnum)
);

// Legacy `rsiValueCondition = [rsiValueEnum.d, rsiValueEnum.k]` (constants.ts:648),
// labels rsiValueConditionMap {d:'D', k:'K'} (constants.ts:650-653).
const STOCH_PRIMARY_OPTIONS = [
  { value: rsiValueEnum.d, label: 'D' },
  { value: rsiValueEnum.k, label: 'K' },
];

// Legacy Second Variable options depend on the primary line (rsiValue):
//   rsiValue === k -> rsiValue2Condition  = [d, custom]   (constants.ts:655)
//   rsiValue === d -> rsiValue2aCondition = [k, custom]   (constants.ts:657)
// The currently-selected primary line is always excluded so K-vs-K / D-vs-D is
// impossible. Labels rsiValue2ConditionMap {d:'D', k:'K', custom:'Add Custom Value'}.
const STOCH_SECONDARY_OPTIONS_WHEN_K = [
  { value: rsiValue2Enum.d, label: 'D' },
  { value: rsiValue2Enum.custom, label: 'Add Custom Value' },
];

const STOCH_SECONDARY_OPTIONS_WHEN_D = [
  { value: rsiValue2Enum2.k, label: 'K' },
  { value: rsiValue2Enum2.custom, label: 'Add Custom Value' },
];

// Stoch/StochRSI lowercase the condition labels (indicators.tsx:1823-1827 renders
// `indicatorConditionsMap[c].toLowerCase()`); lt label is legacy 'Lower than'.
const STOCH_CONDITION_OPTIONS = [
  { value: IndicatorStartConditionEnum.cd, label: 'crossing down' },
  { value: IndicatorStartConditionEnum.cu, label: 'crossing up' },
  { value: IndicatorStartConditionEnum.gt, label: 'greater than' },
  { value: IndicatorStartConditionEnum.lt, label: 'lower than' },
];

// Legacy stochRangeName (constants.ts:634-639), order stochRanges [lower,upper,both,none].
const STOCH_RANGE_OPTIONS = [
  { value: StochRangeEnum.lower, label: 'Lower' },
  { value: StochRangeEnum.upper, label: 'Upper' },
  { value: StochRangeEnum.both, label: 'Lower&Upper' },
  { value: StochRangeEnum.none, label: 'Anywhere' },
];

// The Stochastic band keys as the bot engine reads them: with Zone
// Lower&Upper (or Anywhere) stochLower is the lower band and stochUpper the
// upper band, but a single-band zone reads its one band from the OTHER key —
// Lower reads its lower band from stochUpper, Upper its upper band from
// stochLower. Saved bots rely on this, so the storage stays as it is. Each
// field binds the key its zone reads, the hidden band keeps the other key,
// and changing Zone between a single-band zone and a two-band one swaps the
// two values, so "Lower band" and "Upper band" keep what the user typed.
const isSingleBandZone = (range: unknown) =>
  range === StochRangeEnum.lower || range === StochRangeEnum.upper;

export const stochZoneParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> => {
  const next = { stochRange: value as StochRangeEnum };
  if (
    isSingleBandZone(params.stochRange ?? StochRangeEnum.lower) ===
    isSingleBandZone(value)
  ) {
    return next;
  }
  return {
    ...next,
    stochLower: params.stochUpper,
    stochUpper: params.stochLower,
  };
};

const STOCH_LOWER_BAND_DEFAULT = '20';
const STOCH_UPPER_BAND_DEFAULT = '80';

// KDJ reads the same zone keys as Stochastic, with Anywhere as its default
// zone (Stochastic's is Lower).
const kdjZoneParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> =>
  stochZoneParams(value, {
    ...params,
    stochRange: params.stochRange ?? StochRangeEnum.none,
  });

// The Zone / Lower band / Upper band fields. They do not apply while the
// line is compared with a fixed value (`customWhen`).
const makeStochZoneFields = (
  customWhen: { field: keyof SettingsIndicators; equals: unknown },
  defaultZone: StochRangeEnum,
  setZone: typeof stochZoneParams
): IndicatorFieldDefinition[] => [
  makeSelectField({
    key: 'stochRange',
    label: 'Zone',
    defaultValue: defaultZone,
    options: STOCH_RANGE_OPTIONS,
    tooltip: 'This is the area where the condition must be met',
    hiddenWhen: [customWhen],
    derive: {
      get: (params) => params.stochRange ?? defaultZone,
      set: setZone,
    },
  }),
  makeNumberField({
    key: 'stochLower',
    label: 'Lower band',
    defaultValue: STOCH_LOWER_BAND_DEFAULT,
    allowVariables: true,
    tooltip: 'Define the lower band range where the condition must be met',
    keyWhen: [StochRangeEnum.lower, StochRangeEnum.upper].map((equals) => ({
      field: 'stochRange' as const,
      equals,
      key: 'stochUpper' as const,
      defaultValue: STOCH_LOWER_BAND_DEFAULT,
    })),
    hiddenWhen: [
      { field: 'stochRange', equals: StochRangeEnum.upper },
      { field: 'stochRange', equals: StochRangeEnum.none },
      customWhen,
    ],
  }),
  makeNumberField({
    key: 'stochUpper',
    label: 'Upper band',
    defaultValue: STOCH_UPPER_BAND_DEFAULT,
    allowVariables: true,
    tooltip: 'Define the upper band range where the condition must be met',
    keyWhen: [StochRangeEnum.upper, StochRangeEnum.lower].map((equals) => ({
      field: 'stochRange' as const,
      equals,
      key: 'stochLower' as const,
      defaultValue: STOCH_UPPER_BAND_DEFAULT,
    })),
    hiddenWhen: [
      { field: 'stochRange', equals: StochRangeEnum.lower },
      { field: 'stochRange', equals: StochRangeEnum.none },
      customWhen,
    ],
  }),
];

const stochZoneFields = makeStochZoneFields(
  { field: 'rsiValue2', equals: rsiValue2Enum.custom },
  StochRangeEnum.lower,
  stochZoneParams
);

const kdjZoneFields = makeStochZoneFields(
  { field: 'kdjCompareTo', equals: KDJCompareToEnum.custom },
  StochRangeEnum.none,
  kdjZoneParams
);

const KDJ_LINE_LABELS: Record<KDJLineEnum, string> = {
  [KDJLineEnum.k]: 'K',
  [KDJLineEnum.d]: 'D',
  [KDJLineEnum.j]: 'J',
};

const KDJ_LINE_OPTIONS = Object.values(KDJLineEnum).map((value) => ({
  value,
  label: KDJ_LINE_LABELS[value],
}));

// What the line is compared with: the other two lines or a fixed value —
// never the line itself.
const kdjCompareOptions = (line: KDJLineEnum) => [
  ...KDJ_LINE_OPTIONS.filter((option) => option.value !== line),
  { value: KDJCompareToEnum.custom, label: 'Custom value' },
];

// Picking the line the condition already compares with moves the comparison
// to another line, so the two sides never read the same line.
export const kdjLineParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> => {
  const line = value as KDJLineEnum;
  const compareTo = params.kdjCompareTo ?? KDJCompareToEnum.d;
  return (compareTo as string) === line
    ? {
        kdjLine: line,
        kdjCompareTo:
          line === KDJLineEnum.k ? KDJCompareToEnum.d : KDJCompareToEnum.k,
      }
    : { kdjLine: line };
};

const VWAP_ANCHOR_OPTIONS = [
  { value: VWAPAnchorEnum.day, label: 'Day' },
  { value: VWAPAnchorEnum.week, label: 'Week' },
  { value: VWAPAnchorEnum.month, label: 'Month' },
];

const VWAP_LINE_OPTIONS = [
  { value: VWAPLineEnum.vwap, label: 'VWAP' },
  { value: VWAPLineEnum.upper, label: 'Upper band' },
  { value: VWAPLineEnum.lower, label: 'Lower band' },
];

// ADX in DMI mode reads +DI against −DI.
const DMI_CONDITION_OPTIONS = [
  { value: IndicatorStartConditionEnum.cd, label: '+DI crossing below −DI' },
  { value: IndicatorStartConditionEnum.cu, label: '+DI crossing above −DI' },
  { value: IndicatorStartConditionEnum.gt, label: '+DI above −DI' },
  { value: IndicatorStartConditionEnum.lt, label: '+DI below −DI' },
];

const ADX_MODE_OPTIONS = [
  { value: ADXModeEnum.adx, label: 'ADX' },
  { value: ADXModeEnum.dmi, label: 'DMI (+DI vs −DI)' },
];

const DMI_MODE = { field: 'adxMode' as const, equals: ADXModeEnum.dmi };

// DMI mode has no value to test and reads the DI lines as they are: choosing
// it turns percentile and smoothing off and moves "Between" to a crossing.
export const adxModeParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> =>
  value === ADXModeEnum.dmi
    ? {
        adxMode: ADXModeEnum.dmi,
        percentile: false,
        smoothing: 'none',
        indicatorCondition:
          params.indicatorCondition === IndicatorStartConditionEnum.bw
            ? IndicatorStartConditionEnum.cu
            : params.indicatorCondition,
      }
    : { adxMode: value as ADXModeEnum };

const CANDLE_SOURCE_OPTIONS = [
  { value: CandleSourceEnum.heikinAshi, label: 'Heikin Ashi' },
  { value: CandleSourceEnum.regular, label: 'Regular candles' },
];

const CANDLE_COLOR_OPTIONS = [
  { value: CandleColorEnum.green, label: 'Green' },
  { value: CandleColorEnum.red, label: 'Red' },
];

const CANDLE_TRIGGER_OPTIONS = [
  { value: CandleTriggerEnum.streak, label: 'While in a row' },
  { value: CandleTriggerEnum.start, label: 'Once per run' },
];

const OB_SIDE_OPTIONS = [
  { value: OBSideEnum.bullish, label: 'Bullish block' },
  { value: OBSideEnum.bearish, label: 'Bearish block' },
];

// A close beyond the far edge of a block ends the block on that same candle,
// so "Price greater than" the top of a bearish block and "Price lower than"
// the bottom of a bullish one can never be true: those pairs don't offer it.
const OB_CONDITION_OPTIONS_WHEN = [
  {
    field: 'obSide' as const,
    equals: OBSideEnum.bearish,
    and: [{ field: 'obLevel' as const, equals: OBLevelEnum.top }],
    options: PRICE_CONDITION_OPTIONS.filter(
      (o) => o.value !== IndicatorStartConditionEnum.gt
    ),
  },
  {
    field: 'obSide' as const,
    equals: OBSideEnum.bullish,
    and: [{ field: 'obLevel' as const, equals: OBLevelEnum.bottom }],
    options: PRICE_CONDITION_OPTIONS.filter(
      (o) => o.value !== IndicatorStartConditionEnum.lt
    ),
  },
];

const OB_LEVEL_OPTIONS = [
  { value: OBLevelEnum.top, label: 'Top' },
  { value: OBLevelEnum.middle, label: 'Middle' },
  { value: OBLevelEnum.bottom, label: 'Bottom' },
];

const SQZ_SIGNAL_OPTIONS = [
  { value: SqzSignalEnum.fired, label: 'Squeeze fired' },
  { value: SqzSignalEnum.on, label: 'In a squeeze' },
  { value: SqzSignalEnum.off, label: 'Out of a squeeze' },
  { value: SqzSignalEnum.any, label: 'Any' },
];

const SQZ_MOMENTUM_OPTIONS = [
  { value: SqzMomentumEnum.positive, label: 'Positive' },
  { value: SqzMomentumEnum.negative, label: 'Negative' },
  { value: SqzMomentumEnum.rising, label: 'Rising' },
  { value: SqzMomentumEnum.falling, label: 'Falling' },
  { value: SqzMomentumEnum.crossUp, label: 'Crossing above zero' },
  { value: SqzMomentumEnum.crossDown, label: 'Crossing below zero' },
  { value: SqzMomentumEnum.any, label: 'Any' },
];

// Squeeze with no signal AND no momentum requirement never fires (the bot
// engine treats it as off): picking Any on one side while the other is Any
// moves the other back to its default.
export const sqzSignalParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> =>
  value === SqzSignalEnum.any &&
  (params.sqzMomentum ?? SqzMomentumEnum.positive) === SqzMomentumEnum.any
    ? { sqzSignal: SqzSignalEnum.any, sqzMomentum: SqzMomentumEnum.positive }
    : { sqzSignal: value as SqzSignalEnum };

export const sqzMomentumParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> =>
  value === SqzMomentumEnum.any &&
  (params.sqzSignal ?? SqzSignalEnum.fired) === SqzSignalEnum.any
    ? { sqzMomentum: SqzMomentumEnum.any, sqzSignal: SqzSignalEnum.fired }
    : { sqzMomentum: value as SqzMomentumEnum };

const SESSION_LEVELS_ACTIVE_OPTIONS = [
  { value: SessionLevelsActiveEnum.session, label: 'During the session' },
  { value: SessionLevelsActiveEnum.outside, label: 'Outside the session' },
  { value: SessionLevelsActiveEnum.always, label: 'Any time' },
];

const RANGE_TYPE_OPTIONS = [
  { value: RangeType.atr, label: 'ATR' },
  { value: RangeType.tr, label: 'True Range' },
  { value: RangeType.r, label: 'Range' },
];

const TV_SIGNAL_OPTIONS = [
  { value: TradingviewAnalysisSignalEnum.strongBuy, label: 'Strong Buy' },
  { value: TradingviewAnalysisSignalEnum.buy, label: 'Buy' },
  { value: TradingviewAnalysisSignalEnum.bothBuy, label: 'Both Buy' },
  { value: TradingviewAnalysisSignalEnum.strongSell, label: 'Strong Sell' },
  { value: TradingviewAnalysisSignalEnum.sell, label: 'Sell' },
  { value: TradingviewAnalysisSignalEnum.bothSell, label: 'Both Sell' },
];

const TV_CONDITION_OPTIONS = [
  { value: TradingviewAnalysisConditionEnum.entry, label: 'On entry signal' },
  { value: TradingviewAnalysisConditionEnum.every, label: 'On every signal' },
];

const DIV_TYPE_OPTIONS = [
  { value: DivTypeEnum.abear, label: 'Any Bearish' },
  { value: DivTypeEnum.bear, label: 'Bearish' },
  { value: DivTypeEnum.hbear, label: 'Hidden Bearish' },
  { value: DivTypeEnum.abull, label: 'Any Bullish' },
  { value: DivTypeEnum.bull, label: 'Bullish' },
  { value: DivTypeEnum.hbull, label: 'Hidden Bullish' },
];

// Legacy `defDivergenceOscillators` sorts the members by their enum string
// VALUE (IndicatorEnum.x === uppercase code) via localeCompare, and renders
// each label with `getLabel` (the full indicator name from `labels`). Order:
// AO, CCI, MACD, MFI, MOM, RSI, Stoch, UO, WR.
const DIV_OSCILLATOR_OPTIONS = [
  { value: IndicatorEnum.ao, label: 'Awesome Oscillator' },
  { value: IndicatorEnum.cci, label: 'Commodity Channel Index (CCI)' },
  {
    value: IndicatorEnum.macd,
    label: 'Moving Average Convergence Divergence (MACD)',
  },
  { value: IndicatorEnum.mfi, label: 'Money Flow Index (MFI)' },
  { value: IndicatorEnum.mom, label: 'Momentum' },
  { value: IndicatorEnum.rsi, label: 'Relative Strength Index (RSI)' },
  { value: IndicatorEnum.stoch, label: 'Stochastic Oscillator (Stoch)' },
  { value: IndicatorEnum.uo, label: 'Ultimate Oscillator' },
  { value: IndicatorEnum.wr, label: 'Williams Percent Range (Williams %R)' },
];

const XO_OSCILLATOR_OPTIONS = [
  { value: IndicatorEnum.rsi, label: 'Relative Strength Index (RSI)' },
  { value: IndicatorEnum.mfi, label: 'Money Flow Index (MFI)' },
  { value: IndicatorEnum.cci, label: 'Commodity Channel Index (CCI)' },
  { value: IndicatorEnum.vo, label: 'Volume Oscillator (VO)' },
];

const SR_CROSSING_OPTIONS = [
  { value: SRCrossingEnum.resistance, label: 'Resistance' },
  { value: SRCrossingEnum.support, label: 'Support' },
];

const ECD_TRIGGER_OPTIONS = [
  { value: ECDTriggerEnum.both, label: 'Both' },
  { value: ECDTriggerEnum.bearish, label: 'Bearish' },
  { value: ECDTriggerEnum.bullish, label: 'Bullish' },
];

const KC_VALUE_OPTIONS = [
  { value: BBCrossingEnum.lower, label: 'Lower band' },
  { value: BBCrossingEnum.upper, label: 'Upper band' },
  { value: BBCrossingEnum.middle, label: 'Middle band' },
];

const DC_VALUE_OPTIONS = [
  { value: DCValueEnum.basis, label: 'Basis' },
  { value: DCValueEnum.lower, label: 'Lower' },
  { value: DCValueEnum.upper, label: 'Upper' },
];

// Market Structure trigger type — legacy `ppValueCondition` order (event,
// market, price) with the raw enum-value labels legacy renders verbatim.
const PP_TYPE_OPTIONS = [
  { value: ppValueTypeEnum.event, label: 'Event Based' },
  { value: ppValueTypeEnum.market, label: 'Market Based' },
  { value: ppValueTypeEnum.price, label: 'Price Based' },
];

// Price-pivot values shown when trigger type is Price (legacy `ppCrossPrice`,
// bare `ppCrossName` labels).
const PP_PRICE_VALUE_OPTIONS = [
  { value: ppValueEnum.hh, label: 'Higher High' },
  { value: ppValueEnum.lh, label: 'Lower High' },
  { value: ppValueEnum.hl, label: 'Higher Low' },
  { value: ppValueEnum.ll, label: 'Lower Low' },
  { value: ppValueEnum.anyH, label: 'Any Pivot High' },
  { value: ppValueEnum.anyL, label: 'Any Pivot Low' },
];

// Strong/Weak pivot values — legacy only surfaces these in risk/reward mode
// (legacy `ppSW` order, bare `ppCrossName` labels).
const PP_SW_VALUE_OPTIONS = [
  { value: ppValueEnum.sl, label: 'Strong Low' },
  { value: ppValueEnum.wl, label: 'Weak Low' },
  { value: ppValueEnum.anySWL, label: 'Any Low' },
  { value: ppValueEnum.sh, label: 'Strong High' },
  { value: ppValueEnum.wh, label: 'Weak High' },
  { value: ppValueEnum.anySWH, label: 'Any High' },
];

const PP_MARKET_VALUE_OPTIONS = [
  { value: ppValueEnum.bullMarket, label: 'Bullish Market Structure' },
  { value: ppValueEnum.bearMarket, label: 'Bearish Market Structure' },
];

// Event values shown when trigger type is Event (legacy `ppEvent` order).
const PP_EVENT_VALUE_OPTIONS = [
  { value: ppValueEnum.sBullBoS, label: 'Swing Bullish Break of Structure' },
  { value: ppValueEnum.sBullCHoCH, label: 'Swing Bullish Change of Character' },
  { value: ppValueEnum.SanyBull, label: 'Swing Any Bullish' },
  { value: ppValueEnum.sBearBoS, label: 'Swing Bearish Break of Structure' },
  { value: ppValueEnum.sBearCHoCH, label: 'Swing Bearish Change of Character' },
  { value: ppValueEnum.SanyBear, label: 'Swing Any Bearish' },
  { value: ppValueEnum.iBullBoS, label: 'Internal Bullish Break of Structure' },
  {
    value: ppValueEnum.iBullCHoCH,
    label: 'Internal Bullish Change of Character',
  },
  { value: ppValueEnum.IanyBull, label: 'Internal Any Bullish' },
  { value: ppValueEnum.iBearBoS, label: 'Internal Bearish Break of Structure' },
  {
    value: ppValueEnum.iBearCHoCH,
    label: 'Internal Bearish Change of Character',
  },
  { value: ppValueEnum.IanyBear, label: 'Internal Any Bearish' },
  { value: ppValueEnum.bullAnyBoS, label: 'Any Bullish Break of Structure' },
  { value: ppValueEnum.bullAnyCHoCH, label: 'Any Bullish Change of Character' },
  { value: ppValueEnum.bearAnyBoS, label: 'Any Bearish Break of Structure' },
  { value: ppValueEnum.bearAnyCHoCH, label: 'Any Bearish Change of Character' },
];

// Legacy `obfvgValues` order (constants.ts): bearish, bullish, any.
const OBFVG_VALUE_OPTIONS = [
  { value: OBFVGValueEnum.bearish, label: 'Bearish' },
  { value: OBFVGValueEnum.bullish, label: 'Bullish' },
  { value: OBFVGValueEnum.any, label: 'Any' },
];

const OBFVG_REF_OPTIONS = [
  { value: OBFVGRefEnum.high, label: 'High' },
  { value: OBFVGRefEnum.low, label: 'Low' },
  { value: OBFVGRefEnum.middle, label: 'Middle' },
];

export const INDICATOR_DOCUMENTATION_URLS = {
  [IndicatorEnum.rsi]: '/help/rsi',
  [IndicatorEnum.adx]: '/help/adx',
  [IndicatorEnum.bbw]: '/help/bbw',
  [IndicatorEnum.macd]: '/help/macd',
  [IndicatorEnum.tv]: '/help/tradingview-technical-ratings',
  [IndicatorEnum.ma]: '/help/moving-averages',
  [IndicatorEnum.bb]: '/help/bb',
  [IndicatorEnum.stoch]: '/help/stoch',
  [IndicatorEnum.stochRSI]: '/help/stochrsi',
  [IndicatorEnum.sr]: '/help/support-resistance-indicator',
  [IndicatorEnum.qfl]: '/help/qfl',
  [IndicatorEnum.mfi]: '/help/mfi',
  [IndicatorEnum.psar]: '/help/psar',
  [IndicatorEnum.mar]: '/help/moving-average-ratio',
  [IndicatorEnum.st]: '/help/supertrend',
  [IndicatorEnum.bbpb]: '/help/bollinger-bands-b',
  [IndicatorEnum.xo]: '/help/oscillator-crossover',
  [IndicatorEnum.mom]: '/help/momentum',
  [IndicatorEnum.cci]: '/help/cci',
  [IndicatorEnum.obfvg]: '/help/fair-value-gap',
  [IndicatorEnum.vo]: '/help/volume-oscillator',
  [IndicatorEnum.pc]: '/help/price-change-indicator',
  [IndicatorEnum.wr]: '/help/williams-r',
  [IndicatorEnum.uo]: '/help/ultimate-oscillator',
  [IndicatorEnum.ao]: '/help/awesome-oscillator',
  [IndicatorEnum.kc]: '/help/keltner-channel',
  [IndicatorEnum.kcpb]: '/help/keltner-channel-b',
  [IndicatorEnum.ecd]: '/help/engulfing-candle',
  [IndicatorEnum.ath]: '/help/ath-drawdown',
  [IndicatorEnum.pp]: '/help/market-structure',
  [IndicatorEnum.div]: '/help/divergences-indicator',
  [IndicatorEnum.atr]: '/help/atr',
  [IndicatorEnum.adr]: '/help/adr',
  [IndicatorEnum.unpnl]: '/help/avp',
  [IndicatorEnum.session]: '/help/sessions',
  [IndicatorEnum.lw]: '/help/long-wick-detector',
  [IndicatorEnum.ote]: '/help/discount-premium-ote-levels',
  [IndicatorEnum.vwap]: '/help/vwap',
  [IndicatorEnum.kdj]: '/help/kdj',
  [IndicatorEnum.candle]: '/help/candle-colour',
  [IndicatorEnum.ob]: '/help/order-blocks',
  [IndicatorEnum.sqz]: '/help/squeeze-momentum',
} satisfies Partial<Record<IndicatorEnum, string>>;

export const MARKET_STRUCTURE_VALUE_GROUPS = {
  // Price accepts pivots AND strong/weak: the latter are valid under price in
  // risk/reward mode even though the standard dropdown only lists the pivots.
  price: new Set(
    [...PP_PRICE_VALUE_OPTIONS, ...PP_SW_VALUE_OPTIONS].map(
      (option) => option.value
    )
  ),
  event: new Set(PP_EVENT_VALUE_OPTIONS.map((option) => option.value)),
  market: new Set(PP_MARKET_VALUE_OPTIONS.map((option) => option.value)),
} as const;

export const MARKET_STRUCTURE_TYPE_VALUES = new Set(
  PP_TYPE_OPTIONS.map((option) => option.value)
);

export const DONCHIAN_BAND_VALUES = new Set(
  DC_VALUE_OPTIONS.map((option) => option.value)
);

const ALL_INDICATOR_SUPPORTED_ACTIONS = [
  IndicatorAction.closeDeal,
  IndicatorAction.riskReward,
  IndicatorAction.startBot,
  IndicatorAction.startDca,
  IndicatorAction.startDeal,
  IndicatorAction.stopBot,
];

const INDICATOR_ACTIONS_EXCEPT_RISK_REWARD =
  ALL_INDICATOR_SUPPORTED_ACTIONS.filter(
    (action) => action !== IndicatorAction.riskReward
  );

// Card summary for percentile mode: "Percentile: 80 · 150 bars"; nothing
// while it is off.
const summarizePercentile = (params: SettingsIndicators): string | null =>
  params.percentile
    ? `${params.percentilePercentage ?? 80} · ${params.percentileLookback ?? 150} bars`
    : null;

// The two optional transforms of an indicator's line, drawn together under
// "Modifiers" (`withModifiersSection`): Smoothing first, since the percentile
// ranks the smoothed line when both are on, then Percentile. Each is a switch
// that reveals its own settings.
const percentileFields: IndicatorDefinition['fields'] = [
  makeBooleanField({
    key: 'percentile',
    label: 'Percentile',
    defaultValue: false,
    section: 'modifiers',
    tooltip:
      'Compare the indicator with its own percentile over the lookback instead of a fixed value. With smoothing on, the smoothed line is ranked.',
    tooltipURL: '/help/indicator-percentiles',
    summary: summarizePercentile,
  }),
  makeNumberField({
    key: 'percentileLookback',
    label: 'Lookback',
    defaultValue: 150,
    step: 1,
    allowVariables: true,
    section: 'modifiers',
    hiddenWhen: [{ field: 'percentile', equals: false }],
    // Folded into the Percentile item.
    summary: () => null,
  }),
  makeNumberField({
    key: 'percentilePercentage',
    label: 'Threshold',
    tooltip: 'The percentile rank the indicator is compared with, 0–100.',
    // the bot's value for a condition saved without one
    defaultValue: 80,
    step: 1,
    allowVariables: true,
    section: 'modifiers',
    hiddenWhen: [{ field: 'percentile', equals: false }],
    summary: () => null,
  }),
];

// Optional smoothing of a single-line oscillator (`SMOOTHING_INDICATOR_TYPES`).
// The switch stores nothing of its own: it reads and writes `smoothing`
// ('none' = off), so the saved shape is the one the engine already reads. The
// line-mode rules for the entry's own Condition / Value fields are added by
// `withSmoothingGates` below.
const smoothingFields: IndicatorDefinition['fields'] = [
  makeBooleanField({
    key: 'smoothingEnabled',
    label: 'Smoothing',
    section: 'modifiers',
    tooltip:
      'Moving average applied to the indicator line. With smoothing on, the condition uses the smoothed line.',
    derive: {
      get: (params) => String(resolveSmoothingType(params) !== null),
      set: (value, params) =>
        value === 'true'
          ? {
              smoothing: resolveSmoothingType(params) ?? 'ema',
              smoothingLength:
                params.smoothingLength ?? DEFAULT_SMOOTHING_LENGTH,
            }
          : { smoothing: 'none' },
    },
    summary: summarizeSmoothing,
  }),
  makeSelectField({
    key: 'smoothing',
    label: 'Average',
    defaultValue: 'none',
    options: SMOOTHING_OPTIONS.filter((option) => option.value !== 'none'),
    section: 'modifiers',
    hiddenWhen: [{ field: 'smoothing', equals: 'none' }],
    // Folded into the Smoothing item ("EMA 14").
    summary: () => null,
  }),
  makeNumberField({
    key: 'smoothingLength',
    label: 'Length',
    defaultValue: DEFAULT_SMOOTHING_LENGTH,
    min: 1,
    max: MAX_SMOOTHING_LENGTH,
    step: 1,
    section: 'modifiers',
    hiddenWhen: [{ field: 'smoothing', equals: 'none' }],
    summary: () => null,
  }),
  makeSelectField({
    key: 'smoothingCompare',
    label: 'Compare',
    tooltip:
      'Smoothed line vs value: the condition tests the smoothed line against Value. Line vs smoothed line: the condition tests the indicator against its own moving average, a momentum-turn signal. Percentile mode always compares against a value.',
    defaultValue: 'value',
    options: SMOOTHING_COMPARE_OPTIONS,
    span: 'full',
    section: 'modifiers',
    hiddenWhen: [
      { field: 'smoothing', equals: 'none' },
      { field: 'percentile', equals: true },
    ],
    summary: summarizeSmoothingCompare,
  }),
];

const MODIFIER_FIELD_ORDER: readonly string[] = [
  ...smoothingFields,
  ...percentileFields,
].map((field) => field.key);

// Modifier fields render after the indicator's own settings, whatever order
// the definition spreads them in.
const withModifiersSection = (
  definition: IndicatorDefinition
): IndicatorDefinition => {
  const modifiers = definition.fields
    .filter((field) => field.section === 'modifiers')
    .sort(
      (a, b) =>
        MODIFIER_FIELD_ORDER.indexOf(a.key) -
        MODIFIER_FIELD_ORDER.indexOf(b.key)
    );
  return modifiers.length
    ? {
        ...definition,
        fields: [
          ...definition.fields.filter(
            (field) => field.section !== 'modifiers'
          ),
          ...modifiers,
        ],
      }
    : definition;
};

const SMOOTHING_LINE_CONDITION = {
  field: 'smoothingCompare' as const,
  equals: 'line',
};

// In "Line vs smoothed line" mode there is no value to test: the entry's
// Value / Upper value hide and "Between" leaves the condition list. The gates
// read the EFFECTIVE compare mode (`deriveSmoothingGatingParams`), so a stored
// 'line' stops applying once smoothing is None or percentile is on.
const withSmoothingGates = (
  definition: IndicatorDefinition
): IndicatorDefinition => ({
  ...definition,
  deriveGatingParams: deriveSmoothingGatingParams,
  fields: definition.fields.map((field) => {
    if (field.key === 'indicatorCondition') {
      return {
        ...field,
        optionsWhen: [
          ...(field.optionsWhen ?? []),
          { ...SMOOTHING_LINE_CONDITION, options: INDICATOR_CONDITION_OPTIONS },
        ],
      };
    }
    if (field.key === 'indicatorValue' || field.key === 'indicatorValue2') {
      return {
        ...field,
        hiddenWhen: [...(field.hiddenWhen ?? []), SMOOTHING_LINE_CONDITION],
      };
    }
    return field;
  }),
});

// Trend filter — legacy "Use Trend Filter" block, on MAR (the sole entry in
// the legacy `trendIndicators` list) and the Moving Average. When enabled it
// gates entries on the recent trend of the indicator over its own lookback.
// No other type has a trend to read: the engines keep a condition of any
// other type false while `trendFilter` is on, so saving clears it there
// (`clearStrayTrendFilter`).
const TREND_FILTER_OPERATOR_OPTIONS = [
  { value: TrendFilterOperatorEnum.lower, label: 'Lower or equal to' },
  { value: TrendFilterOperatorEnum.higher, label: 'Higher or equal to' },
  { value: TrendFilterOperatorEnum.between, label: 'Between values' },
];

const trendFilterFields: IndicatorDefinition['fields'] = [
  makeBooleanField({
    key: 'trendFilter',
    label: 'Use Trend Filter',
    defaultValue: false,
    tooltip:
      'Only allow entries when the indicator has moved by the configured amount over the trend filter lookback. Independent of the percentile setting.',
  }),
  makeNumberField({
    key: 'trendFilterLookback',
    label: 'Trend filter lookback',
    defaultValue: 10,
    min: 1,
    max: 1000,
    step: 1,
    allowVariables: true,
    hiddenWhen: [{ field: 'trendFilter', equals: false }],
  }),
  makeSelectField({
    key: 'trendFilterType',
    label: 'Operator',
    defaultValue: TrendFilterOperatorEnum.lower,
    options: TREND_FILTER_OPERATOR_OPTIONS,
    hiddenWhen: [{ field: 'trendFilter', equals: false }],
  }),
  makeNumberField({
    key: 'trendFilterValue',
    label: 'Value, %',
    defaultValue: 2,
    step: 1,
    allowVariables: true,
    hiddenWhen: [{ field: 'trendFilter', equals: false }],
  }),
];

// Fields that do not apply to ADX in DMI mode.
const hiddenInDmi = (
  fields: IndicatorFieldDefinition[]
): IndicatorFieldDefinition[] =>
  fields.map((field) => ({
    ...field,
    hiddenWhen: [...(field.hiddenWhen ?? []), DMI_MODE],
  }));

const keepConditionBarsField: IndicatorFieldDefinition = makeNumberField({
  key: 'keepConditionBars',
  label: 'Keep true',
  defaultValue: 0,
  min: 0,
  step: 1,
  allowVariables: true,
  tooltip:
    'This condition will remain true for a number of extra bars. Default is 0, which means it will be true only on the bar that triggered the condition.',
  // On the card only while it extends the condition.
  summary: (params) =>
    Number(params.keepConditionBars) > 0
      ? `${params.keepConditionBars} bars`
      : null,
});

/**
 * NOTE: The legacy dashboard exposes many composite options (e.g., MA type select with nested defaults).
 * We keep the structure declarative so downstream editors can render controls dynamically.
 */
const BASE_INDICATOR_CATALOG: Record<IndicatorEnum, IndicatorDefinition> = {
  [IndicatorEnum.adx]: {
    type: IndicatorEnum.adx,
    label: 'Average Directional Index (ADX)',
    shortLabel: 'ADX',
    category: IndicatorCategories.Trend,
    description:
      'Measures the strength of a trend without regard to direction, with higher values indicating a stronger trend. In DMI mode it compares +DI with −DI, the direction of the trend.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...hiddenInDmi(percentileFields),
      makeSelectField({
        // No default: a condition that never chose a mode stays the plain
        // ADX and saves exactly what it saved before.
        key: 'adxMode',
        label: 'Mode',
        options: ADX_MODE_OPTIONS,
        tooltip:
          'ADX: the trend strength line against a value. DMI: +DI against −DI, which directional line leads. Both use Length.',
        derive: {
          get: (params) => params.adxMode ?? ADXModeEnum.adx,
          set: adxModeParams,
        },
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 14,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...hiddenInDmi(smoothingFields),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          { ...DMI_MODE, options: DMI_CONDITION_OPTIONS },
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 20,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }, DMI_MODE],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }, DMI_MODE],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.ma]: {
    type: IndicatorEnum.ma,
    label: 'Moving Averages',
    shortLabel: 'MA',
    category: IndicatorCategories.Trend,
    description:
      'Indicates the average price of an asset over a period, smoothing price data to reveal trends.',
    supportedActions: ALL_INDICATOR_SUPPORTED_ACTIONS,
    fields: [
      // Fields read in stored order, `<maType> <indicatorCondition>
      // <maCrossingValue>` (EMA 100 lower than Current price = `lt`), so the
      // form maps one-to-one onto the API/JSON and the plain condition labels
      // apply. The engine compares the MA against the reference.
      makeSelectField({
        key: 'maType',
        label: 'Moving average',
        defaultValue: MAEnum.ema,
        options: MA_LINE_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 20,
        min: 1,
        max: 1000,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'maCrossingValue',
        label: 'Compared to',
        defaultValue: MAEnum.price,
        options: MA_REFERENCE_OPTIONS,
      }),
      makeNumberField({
        key: 'maCrossingLength',
        // Legacy: `${maCrossName[maCrossingValue]} length`.
        labelFrom: { field: 'maCrossingValue', suffix: 'length' },
        label: 'Comparison length',
        defaultValue: 20,
        min: 1,
        max: 1000,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'maCrossingValue', equals: MAEnum.price }],
      }),
      makeIntervalField({
        key: 'maCrossingInterval',
        // Legacy: `${maCrossName[maCrossingValue]} interval`.
        labelFrom: { field: 'maCrossingValue', suffix: 'interval' },
        label: 'Comparison interval',
        defaultValue: ExchangeIntervals.oneH,
        options: INTERVAL_OPTIONS,
        hiddenWhen: [{ field: 'maCrossingValue', equals: MAEnum.price }],
      }),
      keepConditionBarsField,
      ...trendFilterFields,
    ],
  },
  [IndicatorEnum.st]: {
    type: IndicatorEnum.st,
    label: 'SuperTrend',
    shortLabel: 'SuperTrend',
    category: IndicatorCategories.Trend,
    description:
      'Trend-following indicator using ATR to plot support/resistance bands.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'factor',
        label: 'Multiplier',
        defaultValue: 3,
        min: 0.1,
        step: 0.1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'atrLength',
        label: 'ATR Length',
        defaultValue: 10,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'stCondition',
        label: 'Condition',
        defaultValue: STConditionEnum.up,
        options: ST_CONDITION_OPTIONS,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.psar]: {
    type: IndicatorEnum.psar,
    label: 'Parabolic SAR',
    shortLabel: 'Parabolic SAR',
    category: IndicatorCategories.Trend,
    description:
      'Highlights potential reversals by plotting stop-and-reverse levels.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'psarStart',
        label: 'Start',
        defaultValue: 0.02,
        step: 0.001,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'psarInc',
        label: 'Increment',
        defaultValue: 0.02,
        step: 0.001,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'psarMax',
        label: 'Maximum',
        defaultValue: 0.2,
        step: 0.01,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: PRICE_CONDITION_OPTIONS,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.bb]: {
    type: IndicatorEnum.bb,
    label: 'Bollinger Bands (BB)',
    shortLabel: 'BB',
    category: IndicatorCategories.Momentum,
    description: 'Volatility bands plotted above and below a moving average.',
    supportedActions: ALL_INDICATOR_SUPPORTED_ACTIONS,
    fields: [
      makeSelectField({
        key: 'bbwMa',
        label: 'MA type',
        defaultValue: MAEnum.sma,
        options: MA_TYPE_OPTIONS,
      }),
      makeNumberField({
        key: 'bbwMaLength',
        label: 'SMA Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'bbwMult',
        label: 'Standard Deviations',
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        suffix: 'σ',
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cu,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'bbCrossingValue',
        label: 'Value',
        defaultValue: 'lower',
        options: [
          { value: BBCrossingEnum.lower, label: 'Lower' },
          { value: BBCrossingEnum.upper, label: 'Upper' },
          { value: BBCrossingEnum.middle, label: 'Middle' },
        ],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.bbw]: {
    type: IndicatorEnum.bbw,
    label: 'Bollinger Band Width (BBW)',
    shortLabel: 'BBW',
    category: IndicatorCategories.Volatility,
    description:
      'Measures the distance between upper and lower Bollinger Bands to gauge volatility.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeSelectField({
        key: 'bbwMa',
        label: 'MA type',
        defaultValue: 'sma',
        options: MA_TYPE_OPTIONS,
      }),
      makeNumberField({
        key: 'bbwMaLength',
        label: 'SMA Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'bbwMult',
        label: 'Standard Deviations',
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        suffix: 'σ',
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0.05,
        // a ratio of a few hundredths: whole steps jump past every level
        step: 0.01,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 0.01,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.macd]: {
    type: IndicatorEnum.macd,
    label: 'Moving Average Convergence Divergence (MACD)',
    shortLabel: 'MACD',
    category: IndicatorCategories.Momentum,
    description:
      'Compares short and long moving averages with a signal line to highlight momentum shifts.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeNumberField({
        key: 'indicatorLength',
        label: 'Signal length',
        defaultValue: 9,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'macdFast',
        label: 'Fast length',
        defaultValue: 12,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'macdSlow',
        label: 'Slow length',
        defaultValue: 26,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'macdMaSource',
        label: 'Oscillator MA Type',
        defaultValue: MAEnum.ema,
        options: KC_MA_OPTIONS,
      }),
      makeSelectField({
        key: 'macdMaSignal',
        label: 'Signal Line MA type',
        defaultValue: MAEnum.ema,
        options: KC_MA_OPTIONS,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0,
        // Legacy: varType "int", no min/max clamp (indicators.tsx:2713).
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.rsi]: {
    type: IndicatorEnum.rsi,
    label: 'Relative Strength Index (RSI)',
    shortLabel: 'RSI',
    category: IndicatorCategories.Momentum,
    description:
      'Momentum oscillator measuring the speed and change of price movements.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 7,
        min: 1,
        max: 1000,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 70,
        min: 0,
        max: 100,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        min: 0,
        max: 100,
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.cci]: {
    type: IndicatorEnum.cci,
    label: 'Commodity Channel Index (CCI)',
    shortLabel: 'CCI',
    category: IndicatorCategories.Momentum,
    description: 'Shows how far price has diverged from its statistical mean.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 20,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 100,
        min: -1000,
        max: 1000,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        min: -1000,
        max: 1000,
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.mfi]: {
    type: IndicatorEnum.mfi,
    label: 'Money Flow Index (MFI)',
    shortLabel: 'MFI',
    category: IndicatorCategories.Volume,
    description:
      'Volume-weighted momentum oscillator highlighting buying and selling pressure.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 14,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 70,
        min: 0,
        max: 100,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        min: 0,
        max: 100,
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.vo]: {
    type: IndicatorEnum.vo,
    label: 'Volume Oscillator (VO)',
    shortLabel: 'VO',
    category: IndicatorCategories.Volume,
    description:
      'Highlights the difference between short- and long-term volume trends to spot momentum shifts.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeNumberField({
        key: 'voShort',
        label: 'Short length',
        defaultValue: 5,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'voLong',
        label: 'Long length',
        defaultValue: 10,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.stoch]: {
    type: IndicatorEnum.stoch,
    label: 'Stochastic Oscillator (Stoch)',
    shortLabel: 'Stoch',
    category: IndicatorCategories.Momentum,
    description:
      'Compares close price to its range to spot momentum and reversals.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 14,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'rsiValue',
        label: 'First Variable',
        defaultValue: rsiValueEnum.k,
        options: STOCH_PRIMARY_OPTIONS,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: 'cd',
        options: STOCH_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'rsiValue2',
        label: 'Second Variable',
        defaultValue: rsiValue2Enum.d,
        options: STOCH_SECONDARY_OPTIONS_WHEN_K,
        optionsWhen: [
          { field: 'rsiValue', equals: rsiValueEnum.d, options: STOCH_SECONDARY_OPTIONS_WHEN_D },
        ],
      }),
      makeNumberField({
        key: 'valueInsteadof',
        label: 'Enter Value',
        // Belongs to Second Variable (full row) above it; keeps Smooth D |
        // Smooth K paired below.
        span: 'full',
        defaultValue: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'rsiValue2', equals: rsiValue2Enum.k },
          {
            field: 'rsiValue2',
            equals: rsiValue2Enum.d,
          },
        ],
      }),
      makeNumberField({
        key: 'stochSmoothD',
        label: 'Smooth D',
        defaultValue: 3,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'stochSmoothK',
        label: 'Smooth K',
        defaultValue: 1,
        allowVariables: true,
      }),
      ...stochZoneFields,
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.stochRSI]: {
    type: IndicatorEnum.stochRSI,
    label: 'Stochastic RSI (StochRSI)',
    shortLabel: 'StochRSI',
    category: IndicatorCategories.Momentum,
    description: 'Stochastic oscillator applied to RSI values.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 14,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'stochRSI',
        label: 'RSI Length',
        defaultValue: 14,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'rsiValue',
        label: 'First Variable',
        defaultValue: rsiValueEnum.k,
        options: STOCH_PRIMARY_OPTIONS,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: 'cd',
        options: STOCH_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'rsiValue2',
        label: 'Second Variable',
        defaultValue: rsiValue2Enum.d,
        options: STOCH_SECONDARY_OPTIONS_WHEN_K,
        optionsWhen: [
          { field: 'rsiValue', equals: rsiValueEnum.d, options: STOCH_SECONDARY_OPTIONS_WHEN_D },
        ],
      }),
      makeNumberField({
        key: 'valueInsteadof',
        label: 'Enter Value',
        // Belongs to Second Variable (full row) above it; keeps Smooth D |
        // Smooth K paired below.
        span: 'full',
        defaultValue: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'rsiValue2', equals: rsiValue2Enum.k },
          {
            field: 'rsiValue2',
            equals: rsiValue2Enum.d,
          },
        ],
      }),
      makeNumberField({
        key: 'stochSmoothD',
        label: 'Smooth D',
        defaultValue: 3,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'stochSmoothK',
        label: 'Smooth K',
        defaultValue: 3,
        allowVariables: true,
      }),
      ...stochZoneFields,
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.pc]: {
    type: IndicatorEnum.pc,
    label: 'Price Change',
    shortLabel: 'Price Change',
    category: IndicatorCategories.Chart,
    description: 'Measures candle price change as percentage or points.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'pcValue',
        label: '% change',
        defaultValue: 5,
        step: 0.1,
        allowVariables: true,
        tooltip:
          'The minimum price increase or decrease in the previous candle. Use a positive number for an increase and a negative number for a decrease.',
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.atr]: {
    type: IndicatorEnum.atr,
    label: 'Average True Range (ATR)',
    shortLabel: 'ATR',
    category: IndicatorCategories.Volatility,
    description:
      'Measures market volatility as the average of true ranges over time.',
    supportedActions: ALL_INDICATOR_SUPPORTED_ACTIONS,
    fields: [
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 14,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 70,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.adr]: {
    type: IndicatorEnum.adr,
    label: 'Average Daily Range (ADR)',
    shortLabel: 'ADR',
    category: IndicatorCategories.Volatility,
    description:
      'Average high-low range over previous days to gauge volatility.',
    supportedActions: [IndicatorAction.startDeal, IndicatorAction.closeDeal],
    fields: [
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 14,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        // ADR = Average DAILY Range — the interval is by definition 1 day.
        // The select is permanently disabled (see comment below); pinning
        // the default to `oneD` makes the locked value match the indicator
        // name regardless of whatever value was inherited at creation time.
        defaultValue: ExchangeIntervals.oneD,
        // Legacy permanently disables ADR's interval select
        // (indicators.tsx:1402 `disabled={... || i.type === IndicatorEnum.adr}`).
        disabled: true,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.unpnl]: {
    type: IndicatorEnum.unpnl,
    label: 'Average position price (AVP)',
    shortLabel: 'AVP',
    category: IndicatorCategories.Momentum,
    description:
      'Tracks unrealized profit threshold relative to average position price.',
    supportedActions: [IndicatorAction.closeDeal],
    fields: [
      makeSelectField({
        key: 'unpnlCondition',
        label: 'Condition',
        defaultValue: 'gt',
        options: [
          { value: IndicatorStartConditionEnum.gt, label: 'Greater than' },
          { value: IndicatorStartConditionEnum.lt, label: 'Lower than' },
        ],
      }),
      makeNumberField({
        key: 'unpnlValue',
        label: 'Unrealized PnL %',
        defaultValue: 2,
        // Legacy: varType "int", endAdornment "%", no min/max/step
        // (indicators.tsx:214-227).
        step: 1,
        suffix: '%',
        allowVariables: true,
      }),
    ],
  },
  [IndicatorEnum.kc]: {
    type: IndicatorEnum.kc,
    label: 'Keltner Channel (KC)',
    shortLabel: 'KC',
    category: IndicatorCategories.Momentum,
    description: 'ATR-based volatility bands around an EMA.',
    supportedActions: ALL_INDICATOR_SUPPORTED_ACTIONS,
    fields: [
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'kcMa',
        label: 'MA Type',
        defaultValue: MAEnum.ema,
        options: KC_MA_OPTIONS,
      }),
      makeNumberField({
        key: 'bbwMult',
        label: 'ATR Multiplier',
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'bbCrossingValue',
        label: 'Band reference',
        defaultValue: BBCrossingEnum.lower,
        options: KC_VALUE_OPTIONS,
      }),
      makeSelectField({
        key: 'kcRange',
        label: 'Range type',
        defaultValue: RangeType.atr,
        options: RANGE_TYPE_OPTIONS,
      }),
      makeNumberField({
        key: 'kcRangeLength',
        label: 'Range length',
        // the bot's and the backtest's value for a condition saved without one
        defaultValue: 20,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'kcRange', equals: RangeType.tr },
          { field: 'kcRange', equals: RangeType.r },
        ],
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cu,
        options: PRICE_CONDITION_OPTIONS,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.kcpb]: {
    type: IndicatorEnum.kcpb,
    label: 'Keltner Channel %B (KC%B)',
    shortLabel: 'KC%B',
    category: IndicatorCategories.Momentum,
    description: 'Position of price relative to Keltner Channel boundaries.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeSelectField({
        key: 'kcMa',
        label: 'MA Type',
        defaultValue: MAEnum.ema,
        options: KC_MA_OPTIONS,
      }),
      makeSelectField({
        key: 'kcRange',
        label: 'Range type',
        defaultValue: RangeType.atr,
        options: RANGE_TYPE_OPTIONS,
      }),
      makeNumberField({
        key: 'kcRangeLength',
        label: 'Range length',
        defaultValue: 20,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'kcRange', equals: RangeType.tr },
          { field: 'kcRange', equals: RangeType.r },
        ],
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 7,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'bbwMult',
        label: 'ATR Multiplier',
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        // %B is the close's place in the channel: 0 at the lower band, 1 at
        // the upper one. 0 is the lower band (the bot API's default too).
        defaultValue: 0,
        step: 0.01,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 0.01,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.bbpb]: {
    type: IndicatorEnum.bbpb,
    label: 'Bollinger Bands %B',
    shortLabel: 'BB%B',
    category: IndicatorCategories.Momentum,
    description: 'Normalises price location within Bollinger Bands.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeSelectField({
        key: 'bbwMa',
        label: 'MA type',
        defaultValue: 'sma',
        options: MA_TYPE_OPTIONS,
      }),
      makeNumberField({
        key: 'bbwMaLength',
        label: 'SMA Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'bbwMult',
        label: 'Standard Deviations',
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        suffix: 'σ',
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0.05,
        // a ratio of a few hundredths: whole steps jump past every level
        step: 0.01,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 0.01,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.mar]: {
    type: IndicatorEnum.mar,
    label: 'Moving Average Ratio (MAR)',
    shortLabel: 'MAR',
    category: IndicatorCategories.Trend,
    description:
      'Ratio between moving averages or current price for trend strength.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeSelectField({
        key: 'mar2type',
        label: 'Reference',
        defaultValue: MAEnum.price,
        options: MA_REFERENCE_OPTIONS,
      }),
      makeNumberField({
        key: 'mar2length',
        // Legacy: `${(mar2type ?? '').toUpperCase()} Length`. Only ever shown
        // while mar2type is an MA — the `hiddenWhen` below removes it for
        // "Current price", which has no length.
        labelFrom: { field: 'mar2type', suffix: 'Length' },
        label: 'Comparison MA length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'mar2type', equals: MAEnum.price }],
      }),
      makeSelectField({
        key: 'mar1type',
        label: 'Relative to',
        defaultValue: MAEnum.ema,
        options: MA_LINE_OPTIONS,
      }),
      makeNumberField({
        key: 'mar1length',
        // Legacy: `${(mar1type ?? '').toUpperCase()} Length`.
        labelFrom: { field: 'mar1type', suffix: 'Length' },
        label: 'Base MA length',
        // 20, not 10 — the rest of the platform agrees on 20 and only this
        // entry disagreed (an "indicator config parity" pass, b448534, moved
        // it 20 -> 10 in passing): legacy's `indicatorConfigDefaults[mar]`,
        // the public API's `botDefaults`, and the live engine's own fallback
        // `+(_mar1length ?? 20)` in `dcaHelper`. While the value was only
        // DRAWN that mismatch was a lie on screen; now that an untouched
        // field is persisted, saving a MAR that never stored `mar1length`
        // would have re-tuned the bot from a 20-period base MA to a 10.
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        // MAR is a RATIO (MA2 / MA1), so it lives around 1.0 — the study's own
        // band lines sit at 1.01 and 0.99 (utils/tradingView/customIndicators.js),
        // and legacy defaults this to "0.99" (`indicatorConfigDefaults[mar]`).
        // 80 with step 1 is an oscillator's threshold: no ratio ever crosses it,
        // so the condition never fires. The sub-1 step also makes the field bind
        // float variables instead of int (`inferNumericVarType`), which a ratio
        // needs.
        defaultValue: 0.99,
        step: 0.01,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 0.01,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
      ...trendFilterFields,
    ],
  },
  [IndicatorEnum.ao]: {
    type: IndicatorEnum.ao,
    label: 'Awesome Oscillator',
    shortLabel: 'AO',
    category: IndicatorCategories.Momentum,
    description:
      'Difference between two SMAs (34 and 5 period) to gauge momentum.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.wr]: {
    type: IndicatorEnum.wr,
    label: 'Williams %R',
    shortLabel: 'Williams %R',
    category: IndicatorCategories.Momentum,
    description: 'Momentum oscillator comparing close to high-low range.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 14,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: -40,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.uo]: {
    type: IndicatorEnum.uo,
    label: 'Ultimate Oscillator',
    shortLabel: 'UO',
    category: IndicatorCategories.Momentum,
    description:
      'Combines 3 timeframes of price momentum into a single oscillator.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      ...percentileFields,
      makeNumberField({
        key: 'uoFast',
        label: 'Fast length',
        defaultValue: 7,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'uoMiddle',
        label: 'Middle length',
        defaultValue: 14,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'uoSlow',
        label: 'Slow length',
        defaultValue: 28,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Level',
        defaultValue: 70,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Level and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.mom]: {
    type: IndicatorEnum.mom,
    label: 'Momentum',
    shortLabel: 'Momentum',
    category: IndicatorCategories.Momentum,
    description:
      'Simple momentum oscillator (current price minus price n periods ago).',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 10,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'momSource',
        label: 'Price source',
        defaultValue: 'close',
        options: PRICE_SOURCE_OPTIONS,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      ...smoothingFields,
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: VALUE_CONDITION_OPTIONS,
        optionsWhen: [
          {
            field: 'percentile',
            equals: true,
            options: INDICATOR_CONDITION_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Level',
        // Momentum is a price difference (price now minus price n bars ago),
        // in the pair's price units, so the only level that means the same
        // on every pair is the zero line.
        defaultValue: 0,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Level and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
        hiddenWhen: [{ field: 'percentile', equals: true }],
      }),
      ...percentileFields,
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.qfl]: {
    type: IndicatorEnum.qfl,
    label: 'QFL Base Scanner',
    shortLabel: 'QFL',
    category: IndicatorCategories.Chart,
    description: 'Scans for support “bases” derived from QFL methodology.',
    supportedActions: ALL_INDICATOR_SUPPORTED_ACTIONS,
    fields: [
      makeNumberField({
        key: 'basePeriods',
        label: 'Base periods',
        defaultValue: 36,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
        tooltip:
          'Number of periods to look for a low that may form a new base. The more periods used the more significant the bases will be, but the less frequent the entries will happen.',
      }),
      makeNumberField({
        key: 'pumpPeriods',
        label: 'Pump periods',
        defaultValue: 8,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
        tooltip: 'Number of periods pump is above the low to confirm a new base.',
      }),
      makeNumberField({
        key: 'pump',
        label: 'Pump from base (%)',
        defaultValue: 3,
        step: 1,
        allowVariables: true,
        tooltip:
          'Buys are marked when the price has bounced x% above the base (Pump from base) and then fallen y% below the base (Base Crack).',
      }),
      makeNumberField({
        key: 'baseCrack',
        label: 'Base crack (%)',
        defaultValue: 3,
        step: 1,
        allowVariables: true,
        tooltip:
          'Buys are marked when the price has bounced x% above the base (Pump from base) and then fallen y% below the base (Base Crack).',
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.sr]: {
    type: IndicatorEnum.sr,
    label: 'Support & Resistance',
    shortLabel: 'S/R',
    category: IndicatorCategories.Chart,
    description:
      'Detects support and resistance levels for breakout/reversal strategies.',
    supportedActions: ALL_INDICATOR_SUPPORTED_ACTIONS,
    fields: [
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: SR_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'srCrossingValue',
        label: 'Value',
        defaultValue: SRCrossingEnum.resistance,
        options: SR_CROSSING_OPTIONS,
      }),
      makeNumberField({
        key: 'leftBars',
        label: 'Left bars',
        defaultValue: 15,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'rightBars',
        label: 'Right bars',
        defaultValue: 15,
        min: 1,
        max: 200,
        step: 1,
        allowVariables: true,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.ecd]: {
    type: IndicatorEnum.ecd,
    label: 'Engulfing Candle',
    shortLabel: 'Engulfing',
    category: IndicatorCategories.Chart,
    description: 'Bullish/bearish candle pattern detection.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeSelectField({
        key: 'ecdTrigger',
        label: 'Trigger candle',
        defaultValue: ECDTriggerEnum.both,
        options: ECD_TRIGGER_OPTIONS,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.tv]: {
    type: IndicatorEnum.tv,
    label: 'Combined Ratings (TradingView)',
    shortLabel: 'TV Rating',
    category: IndicatorCategories.Technical,
    description: 'Aggregated TradingView recommendation score.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeSelectField({
        key: 'signal',
        label: 'Signal',
        defaultValue: TradingviewAnalysisSignalEnum.strongBuy,
        options: TV_SIGNAL_OPTIONS,
      }),
      // The bot, the backtester and the chart read the trigger from
      // `condition`. Rows saved while this field wrote `indicatorCondition`
      // show the trigger they chose until they are saved again.
      makeSelectField({
        key: 'condition',
        label: 'Trigger',
        defaultValue: TradingviewAnalysisConditionEnum.entry,
        options: TV_CONDITION_OPTIONS,
        keyWhen: [
          {
            field: 'indicatorCondition',
            equals: TradingviewAnalysisConditionEnum.every,
            key: 'condition',
            defaultValue: TradingviewAnalysisConditionEnum.every,
          },
        ],
      }),
      makeNumberField({
        key: 'checkLevel',
        label: 'Check level',
        defaultValue: 15,
        min: 1,
        // the rating sums 28 signals of +1 or -1, so it never passes 28
        max: 28,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.xo]: {
    type: IndicatorEnum.xo,
    label: 'Oscillator Crossover',
    shortLabel: 'Oscillator XO',
    category: IndicatorCategories.Technical,
    description: 'Crossovers between two oscillators (e.g., RSI vs MFI).',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeSelectField({
        key: 'xOscillator1',
        label: 'Primary oscillator',
        defaultValue: IndicatorEnum.rsi,
        options: XO_OSCILLATOR_OPTIONS,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Primary length',
        defaultValue: 7,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'xOscillator1', equals: IndicatorEnum.vo }],
      }),
      makeNumberField({
        key: 'voShort',
        label: 'Volume oscillator short length',
        defaultValue: 5,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'xOscillator1', equals: IndicatorEnum.rsi },
          { field: 'xOscillator1', equals: IndicatorEnum.mfi },
          { field: 'xOscillator1', equals: IndicatorEnum.cci },
        ],
      }),
      makeNumberField({
        key: 'voLong',
        label: 'Volume oscillator long length',
        defaultValue: 10,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'xOscillator1', equals: IndicatorEnum.rsi },
          { field: 'xOscillator1', equals: IndicatorEnum.mfi },
          { field: 'xOscillator1', equals: IndicatorEnum.cci },
        ],
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'xOscillator2',
        label: 'Secondary oscillator',
        defaultValue: IndicatorEnum.mfi,
        options: XO_OSCILLATOR_OPTIONS,
      }),
      makeIntervalField({
        key: 'xOscillator2Interval',
        label: 'Secondary interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeNumberField({
        key: 'xOscillator2length',
        label: 'Secondary length',
        defaultValue: 14,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'xOscillator2', equals: IndicatorEnum.vo }],
      }),
      makeNumberField({
        key: 'xOscillator2voShort',
        label: 'Volume oscillator short length',
        defaultValue: 5,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'xOscillator2', equals: IndicatorEnum.rsi },
          { field: 'xOscillator2', equals: IndicatorEnum.mfi },
          { field: 'xOscillator2', equals: IndicatorEnum.cci },
        ],
      }),
      makeNumberField({
        key: 'xOscillator2voLong',
        label: 'Volume oscillator long length',
        defaultValue: 10,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'xOscillator2', equals: IndicatorEnum.rsi },
          { field: 'xOscillator2', equals: IndicatorEnum.mfi },
          { field: 'xOscillator2', equals: IndicatorEnum.cci },
        ],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.div]: {
    type: IndicatorEnum.div,
    label: 'Divergences',
    shortLabel: 'Divergence',
    category: IndicatorCategories.Technical,
    description: 'Monitors divergence between price and oscillators.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'divMinCount',
        label: 'Min number of divergences',
        defaultValue: 2,
        min: 1,
        // one divergence per oscillator, and there are nine to choose from
        max: DIV_OSCILLATOR_OPTIONS.length,
        step: 1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'divType',
        label: 'Type of divergence',
        defaultValue: DivTypeEnum.abear,
        options: DIV_TYPE_OPTIONS,
      }),
      makeSelectField({
        key: 'divOscillators',
        label: 'Oscillators',
        defaultValue: DIV_OSCILLATOR_OPTIONS.map(
          (option) => option.value as IndicatorEnum
        ),
        options: DIV_OSCILLATOR_OPTIONS,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      // Saved only when they differ from these defaults
      // (`stripDefaultDivergencePivots`), so a Divergence left alone keeps
      // the exact condition it always had.
      makeNumberField({
        key: 'divPivotLeft',
        label: 'Pivot lookback left',
        rowStart: true,
        defaultValue: DIV_PIVOT_DEFAULTS.divPivotLeft,
        min: 1,
        max: 50,
        step: 1,
        suffix: 'bars',
        allowVariables: true,
        tooltip:
          'A pivot high or low must be the highest or lowest point of this many bars to its left.',
      }),
      makeNumberField({
        key: 'divPivotRight',
        label: 'Pivot lookback right',
        defaultValue: DIV_PIVOT_DEFAULTS.divPivotRight,
        min: 1,
        max: 50,
        step: 1,
        suffix: 'bars',
        allowVariables: true,
        tooltip:
          'Bars to the right of a pivot. A pivot is confirmed this many bars after it prints, so a larger value finds steadier pivots and signals later.',
      }),
      makeNumberField({
        key: 'divRangeLower',
        label: 'Min of lookback range',
        defaultValue: DIV_PIVOT_DEFAULTS.divRangeLower,
        min: 1,
        max: 500,
        step: 1,
        suffix: 'bars',
        allowVariables: true,
        tooltip:
          'Fewest bars between the two pivots a divergence compares. Must be below the max.',
      }),
      makeNumberField({
        key: 'divRangeUpper',
        label: 'Max of lookback range',
        defaultValue: DIV_PIVOT_DEFAULTS.divRangeUpper,
        min: 2,
        max: 500,
        step: 1,
        suffix: 'bars',
        allowVariables: true,
        tooltip:
          'Most bars between the two pivots a divergence compares. Must be above the min.',
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.pp]: {
    type: IndicatorEnum.pp,
    label: 'Market Structure',
    shortLabel: 'Structure',
    category: IndicatorCategories.Chart,
    description:
      'Detects break of structure (BOS) and change of character (CHOCH).',
    supportedActions: ALL_INDICATOR_SUPPORTED_ACTIONS,
    fields: [
      makeSelectField({
        key: 'ppType',
        label: 'Trigger type',
        defaultValue: ppValueTypeEnum.price,
        options: PP_TYPE_OPTIONS,
      }),
      makeSelectField({
        key: 'ppValue',
        label: 'Structure signal',
        defaultValue: ppValueEnum.anyL,
        // Options depend on the trigger type, mirroring legacy (price -> pivots,
        // event -> structure events, market -> market structure).
        options: PP_PRICE_VALUE_OPTIONS,
        optionsWhen: [
          {
            field: 'ppType',
            equals: ppValueTypeEnum.price,
            options: PP_PRICE_VALUE_OPTIONS,
          },
          {
            field: 'ppType',
            equals: ppValueTypeEnum.event,
            options: PP_EVENT_VALUE_OPTIONS,
          },
          {
            field: 'ppType',
            equals: ppValueTypeEnum.market,
            options: PP_MARKET_VALUE_OPTIONS,
          },
        ],
      }),
      makeNumberField({
        key: 'ppHighLeft',
        label: 'High left bars',
        defaultValue: 5,
        min: 0,
        max: 200,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'ppType', equals: ppValueTypeEnum.event },
          { field: 'ppType', equals: ppValueTypeEnum.market },
          { field: 'ppValue', equals: ppValueEnum.anyL },
          { field: 'ppValue', equals: ppValueEnum.hl },
          { field: 'ppValue', equals: ppValueEnum.ll },
          { field: 'ppValue', equals: ppValueEnum.sl },
          { field: 'ppValue', equals: ppValueEnum.wl },
          { field: 'ppValue', equals: ppValueEnum.anySWL },
          { field: 'ppValue', equals: ppValueEnum.sh },
          { field: 'ppValue', equals: ppValueEnum.wh },
          { field: 'ppValue', equals: ppValueEnum.anySWH },
        ],
      }),
      makeNumberField({
        key: 'ppHighRight',
        label: 'High right bars',
        defaultValue: 5,
        min: 0,
        max: 200,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'ppType', equals: ppValueTypeEnum.event },
          { field: 'ppType', equals: ppValueTypeEnum.market },
          { field: 'ppValue', equals: ppValueEnum.anyL },
          { field: 'ppValue', equals: ppValueEnum.hl },
          { field: 'ppValue', equals: ppValueEnum.ll },
          { field: 'ppValue', equals: ppValueEnum.sl },
          { field: 'ppValue', equals: ppValueEnum.wl },
          { field: 'ppValue', equals: ppValueEnum.anySWL },
          { field: 'ppValue', equals: ppValueEnum.sh },
          { field: 'ppValue', equals: ppValueEnum.wh },
          { field: 'ppValue', equals: ppValueEnum.anySWH },
        ],
      }),
      makeNumberField({
        key: 'ppLowLeft',
        label: 'Low left bars',
        defaultValue: 5,
        min: 0,
        max: 200,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'ppType', equals: ppValueTypeEnum.event },
          { field: 'ppType', equals: ppValueTypeEnum.market },
          { field: 'ppValue', equals: ppValueEnum.anyH },
          { field: 'ppValue', equals: ppValueEnum.hh },
          { field: 'ppValue', equals: ppValueEnum.lh },
          { field: 'ppValue', equals: ppValueEnum.sh },
          { field: 'ppValue', equals: ppValueEnum.wh },
          { field: 'ppValue', equals: ppValueEnum.anySWH },
          { field: 'ppValue', equals: ppValueEnum.sl },
          { field: 'ppValue', equals: ppValueEnum.wl },
          { field: 'ppValue', equals: ppValueEnum.anySWL },
        ],
      }),
      makeNumberField({
        key: 'ppLowRight',
        label: 'Low right bars',
        defaultValue: 5,
        min: 0,
        max: 200,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'ppType', equals: ppValueTypeEnum.event },
          { field: 'ppType', equals: ppValueTypeEnum.market },
          { field: 'ppValue', equals: ppValueEnum.anyH },
          { field: 'ppValue', equals: ppValueEnum.hh },
          { field: 'ppValue', equals: ppValueEnum.lh },
          { field: 'ppValue', equals: ppValueEnum.sh },
          { field: 'ppValue', equals: ppValueEnum.wh },
          { field: 'ppValue', equals: ppValueEnum.anySWH },
          { field: 'ppValue', equals: ppValueEnum.sl },
          { field: 'ppValue', equals: ppValueEnum.wl },
          { field: 'ppValue', equals: ppValueEnum.anySWL },
        ],
      }),
      makeNumberField({
        key: 'ppMult',
        label: 'Multiplier',
        defaultValue: 1,
        step: 1,
        allowVariables: true,
        hiddenWhen: [
          { field: 'ppType', equals: ppValueTypeEnum.event },
          { field: 'ppType', equals: ppValueTypeEnum.market },
        ],
        tooltip:
          'Scales the acceptable deviation from the detected structure when using price triggers.',
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: 'cd',
        options: INDICATOR_CONDITION_OPTIONS,
        hiddenWhen: [
          { field: 'ppType', equals: ppValueTypeEnum.event },
          { field: 'ppType', equals: ppValueTypeEnum.market },
        ],
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.ath]: {
    type: IndicatorEnum.ath,
    label: 'ATH Drawdown',
    shortLabel: 'ATH DD',
    category: IndicatorCategories.Volatility,
    description: 'Percent drawdown from rolling all-time-high across lookback.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'athLookback',
        label: 'Lookback',
        defaultValue: 100,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: 'cd',
        options: VALUE_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 10,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.dc]: {
    type: IndicatorEnum.dc,
    label: 'Donchian Channel (DC)',
    shortLabel: 'Donchian',
    category: IndicatorCategories.Trend,
    description: 'High/low channel to detect breakouts and range extremes.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 20,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'dcValue',
        label: 'Value',
        defaultValue: DCValueEnum.basis,
        options: DC_VALUE_OPTIONS,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.obfvg]: {
    type: IndicatorEnum.obfvg,
    label: 'Fair Value Gaps (FVG)',
    shortLabel: 'FVG',
    category: IndicatorCategories.Chart,
    description:
      'A fair value gap (FVG) is an imbalance on a financial chart where aggressive buying or selling leaves a price range with little to no trading activity, creating a "void" in the price chart.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      // Legacy render order (indicators.tsx): Interval (1386) -> Condition
      // (1774) -> Section=obfvgValue (1876) -> Value=obfvgRef (1903) -> Keep.
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'obfvgValue',
        label: 'Section',
        defaultValue: OBFVGValueEnum.bullish,
        options: OBFVG_VALUE_OPTIONS,
      }),
      makeSelectField({
        key: 'obfvgRef',
        label: 'Value',
        defaultValue: OBFVGRefEnum.middle,
        options: OBFVG_REF_OPTIONS,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.bbwp]: {
    type: IndicatorEnum.bbwp,
    label: 'BBW Percentile',
    shortLabel: 'BBWP',
    category: IndicatorCategories.Momentum,
    description:
      'Bollinger Band Width Percentile ranks current bandwidth against historical values.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeSelectField({
        key: 'momSource',
        label: 'Price source',
        defaultValue: 'close',
        options: PRICE_SOURCE_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorLength',
        label: 'Length',
        defaultValue: 13,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'bbwpLookback',
        label: 'Lookback',
        defaultValue: 252,
        min: 1,
        max: 1000,
        step: 1,
        allowVariables: true,
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: 'cd',
        options: VALUE_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'indicatorValue2',
        label: 'Upper value',
        tooltip: 'Between: the value must stay above Value and below this.',
        min: 0,
        max: 100,
        step: 1,
        allowVariables: true,
        shownWhen: [
          {
            field: 'indicatorCondition',
            equals: IndicatorStartConditionEnum.bw,
          },
        ],
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.session]: {
    type: IndicatorEnum.session,
    label: 'Session Selector',
    shortLabel: 'Session',
    category: IndicatorCategories.Filter,
    description:
      'Filters signals by day of the week and, optionally, time of day in a chosen time zone. Pick a market session or set your own hours, and whether to trade in or out of it.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeSelectField({
        key: 'sessionPreset',
        label: 'Session',
        span: 'full',
        tooltip:
          'Fills the hours and time zone of a market session on its local clock, so daylight saving moves it with that market. Edit the hours to make it your own.',
        options: [
          { value: SESSION_ALL_DAY, label: 'All day' },
          ...SESSION_PRESETS.map((p) => ({
            value: p.value,
            label: `${p.label} ${p.start}–${p.end}`,
          })),
          { value: SESSION_CUSTOM, label: 'Custom' },
        ],
        derive: { get: resolveSessionPreset, set: sessionPresetParams },
        summary: (params) => {
          const preset = resolveSessionPreset(params);
          if (preset === SESSION_ALL_DAY) return null;
          const match = SESSION_PRESETS.find((p) => p.value === preset);
          return `${match ? `${match.label} ` : ''}${params.sessionStart}–${params.sessionEnd} ${sessionTimezoneLabel(params.sessionTimezone)}`;
        },
      }),
      makeTimeField({
        key: 'sessionStart',
        label: 'Start',
        tooltip:
          'Local time the session opens. Leave Start and End empty for the whole day.',
        summary: () => null,
      }),
      makeTimeField({
        key: 'sessionEnd',
        label: 'End',
        tooltip:
          'Local time the session closes. An End before Start runs overnight and belongs to the day it opens.',
        summary: () => null,
      }),
      makeSelectField({
        key: 'sessionTimezone',
        label: 'Time zone',
        defaultValue: 'UTC',
        options: SESSION_TIMEZONE_OPTIONS,
        tooltip: 'Session days and hours are read on this clock.',
        summary: () => null,
      }),
      makeSelectField({
        key: 'sessionRule',
        label: 'Rule',
        defaultValue: SessionRuleEnum.in,
        options: [
          { value: SessionRuleEnum.in, label: 'In session' },
          { value: SessionRuleEnum.out, label: 'Out of session' },
          { value: SessionRuleEnum.levels, label: 'Price levels' },
        ],
        derive: {
          get: (params) => params.sessionRule ?? SessionRuleEnum.in,
          set: sessionRuleParams,
        },
        tooltip:
          'In or out of session filters by time. Price levels compares two session prices; Active sets whether it is read during the session, outside it or any time.',
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.fifteenM,
        tooltip: 'Candles the session prices are read from.',
        shownWhen: SESSION_LEVELS_ONLY,
      }),
      makeSelectField({
        key: 'sessionLevelA',
        label: 'Compare',
        defaultValue: SessionLevelEnum.price,
        options: SESSION_LEVEL_OPTIONS,
        tooltip:
          'Price is the close of the latest candle. Previous session values come from the last session that has ended. Current session open and midpoint have no value outside a session; the midpoint is halfway between the session high and low so far.',
        shownWhen: SESSION_LEVELS_ONLY,
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cu,
        options: INDICATOR_CONDITION_OPTIONS,
        tooltip:
          'Crossing compares two candles of the same session; a new session moving the levels is not a crossing. Nothing triggers before a whole session has ended.',
        shownWhen: SESSION_LEVELS_ONLY,
      }),
      makeSelectField({
        key: 'sessionLevelB',
        label: 'With',
        defaultValue: SessionLevelEnum.prevHigh,
        options: SESSION_LEVEL_OPTIONS,
        tooltip: 'The value Compare is tested against.',
        shownWhen: SESSION_LEVELS_ONLY,
      }),
      makeSelectField({
        // No default: a condition that never chose stays "during the
        // session" and saves exactly what it saved before.
        key: 'sessionLevelsActive',
        label: 'Active',
        options: SESSION_LEVELS_ACTIVE_OPTIONS,
        tooltip:
          'When the condition is read. Outside the session the previous session values are those of the last session that ended, and current session values have none. A crossing needs two candles in the same place: both in one session, or both outside. Monday range: Session Days Monday, no hours, Outside the session, Price crossing up Previous session high.',
        shownWhen: SESSION_LEVELS_ONLY,
        // On the card only when it is not the default.
        summary: (params) =>
          params.sessionRule === SessionRuleEnum.levels &&
          params.sessionLevelsActive &&
          params.sessionLevelsActive !== SessionLevelsActiveEnum.session
            ? (SESSION_LEVELS_ACTIVE_OPTIONS.find(
                (o) => o.value === params.sessionLevelsActive
              )?.label ?? null)
            : null,
        derive: {
          get: (params) =>
            params.sessionLevelsActive ?? SessionLevelsActiveEnum.session,
          set: (value) => ({
            sessionLevelsActive: value as SessionLevelsActiveEnum,
          }),
        },
      }),
      makeSelectField({
        key: 'sessionDays',
        label: 'Session Days',
        multiple: true,
        defaultValue: [1, 2, 3, 4, 5] as unknown as string[],
        options: [
          { value: 0, label: 'Sun' },
          { value: 1, label: 'Mon' },
          { value: 2, label: 'Tue' },
          { value: 3, label: 'Wed' },
          { value: 4, label: 'Thu' },
          { value: 5, label: 'Fri' },
          { value: 6, label: 'Sat' },
        ],
      }),
    ],
  },
  [IndicatorEnum.lw]: {
    type: IndicatorEnum.lw,
    label: 'Long Wick Detector',
    shortLabel: 'Long Wick',
    category: IndicatorCategories.Chart,
    description:
      'Detects candles with unusually long wicks based on ATR(200). Tracks wick levels until price mitigates them or they expire.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'lwThreshold',
        label: 'Threshold',
        defaultValue: 2,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'lwMaxDuration',
        label: 'Max Duration',
        defaultValue: 1000,
        step: 1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'lwValue',
        label: 'Value',
        defaultValue: LWValueEnum.any,
        options: [
          { value: LWValueEnum.top, label: 'Top wick' },
          { value: LWValueEnum.bottom, label: 'Bottom wick' },
          { value: LWValueEnum.any, label: 'Any wick' },
        ],
      }),
      makeSelectField({
        key: 'lwCondition',
        label: 'Condition',
        defaultValue: LWConditionEnum.during,
        options: [
          { value: LWConditionEnum.during, label: 'During the signal' },
          { value: LWConditionEnum.onStart, label: 'On signal start' },
        ],
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.ote]: {
    type: IndicatorEnum.ote,
    label: 'Discount/Premium OTE Levels',
    shortLabel: 'OTE Levels',
    category: IndicatorCategories.Chart,
    description:
      'Fibonacci retracement levels of the latest valid swing leg: discount and premium zones around the 0.5 equilibrium and the optimal trade entry (OTE) zone around 0.618–0.79.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeNumberField({
        key: 'oteLeftBars',
        label: 'Swing sensitivity',
        defaultValue: 10,
        min: 1,
        max: 500,
        step: 1,
        suffix: 'bars',
        allowVariables: true,
        tooltip:
          'A swing high or low must be the highest or lowest point of at least this many bars to its left. It is confirmed one bar after it prints.',
      }),
      makeNumberField({
        key: 'oteMinLegSize',
        label: 'Minimum leg size',
        defaultValue: 1,
        min: 0.01,
        max: 100,
        step: 0.1,
        suffix: '%',
        allowVariables: true,
        tooltip:
          'A move between a swing low and a swing high counts as a leg only when it is at least this many percent of its low.',
      }),
      makeSelectField({
        key: 'oteLeg',
        label: 'Leg',
        defaultValue: OTELegEnum.bullish,
        options: [
          { value: OTELegEnum.bullish, label: 'Bullish' },
          { value: OTELegEnum.bearish, label: 'Bearish' },
          { value: OTELegEnum.any, label: 'Any' },
        ],
        tooltip:
          'Bullish legs run from a swing low up to a swing high, bearish legs from a swing high down to a swing low. Only the latest leg is read.',
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: PRICE_CONDITION_OPTIONS,
        tooltip:
          'Crossing compares the close with the level on two candles of the same leg; a new leg moving the level is not a crossing.',
      }),
      makeNumberField({
        key: 'oteLevel',
        label: 'Level',
        defaultValue: 0.705,
        min: 0,
        max: 1,
        step: 0.001,
        allowVariables: true,
        tooltip:
          'Retracement of the leg the price is compared with: 0 is the end of the leg, 1 its origin, 0.5 the equilibrium. 0.618–0.79 is the OTE zone; above 0.5 is discount in a bullish leg and premium in a bearish one.',
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.vwap]: {
    type: IndicatorEnum.vwap,
    label: 'Anchored VWAP',
    shortLabel: 'VWAP',
    category: IndicatorCategories.Volume,
    description:
      'Average price weighted by volume since the start of the day, week or month, with standard-deviation bands around it.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'vwapAnchor',
        label: 'Anchor',
        defaultValue: VWAPAnchorEnum.day,
        options: VWAP_ANCHOR_OPTIONS,
        tooltip:
          'Where the VWAP restarts: every day at 00:00 UTC, every Monday at 00:00 UTC, or on the 1st of every month. Pick an interval with several candles per period.',
      }),
      makeSelectField({
        key: 'vwapLine',
        label: 'Line',
        defaultValue: VWAPLineEnum.vwap,
        options: VWAP_LINE_OPTIONS,
        tooltip: 'The line the close is compared with.',
      }),
      makeNumberField({
        key: 'vwapBandMultiplier',
        label: 'Band width',
        defaultValue: 1,
        min: 0.1,
        max: 10,
        step: 0.1,
        suffix: 'σ',
        allowVariables: true,
        tooltip:
          'Distance of the bands from the VWAP, in volume-weighted standard deviations of the price since the anchor.',
        hiddenWhen: [{ field: 'vwapLine', equals: VWAPLineEnum.vwap }],
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cu,
        options: PRICE_CONDITION_OPTIONS,
        tooltip:
          'Compares the close with the line. A crossing counts only within one period: the restart at the anchor is not a crossing.',
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.kdj]: {
    type: IndicatorEnum.kdj,
    label: 'KDJ Indicator',
    shortLabel: 'KDJ',
    category: IndicatorCategories.Momentum,
    description:
      'Stochastic variant with a third line: K and D smoothed from where the close sits in its recent range, and J = 3K − 2D, which leads and can leave 0–100.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'kdjLength',
        label: 'Length',
        defaultValue: 9,
        min: 1,
        max: 500,
        step: 1,
        allowVariables: true,
        tooltip:
          'Candles whose highest high and lowest low frame the close (RSV).',
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeNumberField({
        key: 'kdjKSmooth',
        label: 'Smooth K',
        defaultValue: 3,
        min: 1,
        max: 100,
        step: 1,
        allowVariables: true,
      }),
      makeNumberField({
        key: 'kdjDSmooth',
        label: 'Smooth D',
        defaultValue: 3,
        min: 1,
        max: 100,
        step: 1,
        allowVariables: true,
      }),
      makeSelectField({
        key: 'kdjLine',
        label: 'Line',
        defaultValue: KDJLineEnum.k,
        options: KDJ_LINE_OPTIONS,
        derive: {
          get: (params) => params.kdjLine ?? KDJLineEnum.k,
          set: kdjLineParams,
        },
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cu,
        options: STOCH_CONDITION_OPTIONS,
      }),
      makeSelectField({
        key: 'kdjCompareTo',
        label: 'Compared to',
        defaultValue: KDJCompareToEnum.d,
        options: kdjCompareOptions(KDJLineEnum.k),
        optionsWhen: [KDJLineEnum.d, KDJLineEnum.j].map((line) => ({
          field: 'kdjLine' as const,
          equals: line,
          options: kdjCompareOptions(line),
        })),
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 20,
        step: 1,
        allowVariables: true,
        shownWhen: [{ field: 'kdjCompareTo', equals: KDJCompareToEnum.custom }],
      }),
      ...kdjZoneFields,
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.candle]: {
    type: IndicatorEnum.candle,
    label: 'Candle Colour',
    shortLabel: 'Candle Colour',
    category: IndicatorCategories.Chart,
    description:
      'Green or red closed candles in a row, read from Heikin Ashi or regular candles. A doji breaks the run.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeSelectField({
        key: 'candleSource',
        label: 'Candles',
        defaultValue: CandleSourceEnum.heikinAshi,
        options: CANDLE_SOURCE_OPTIONS,
        tooltip:
          'Heikin Ashi averages each candle with the one before, so runs of one colour are longer and less noisy. Regular reads the exchange candles as they are.',
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'candleColor',
        label: 'Colour',
        defaultValue: CandleColorEnum.green,
        options: CANDLE_COLOR_OPTIONS,
        tooltip:
          'Green: close above open. Red: close below open. A candle that closes at its open is neither and breaks every run.',
      }),
      makeNumberField({
        key: 'candleCount',
        label: 'In a row',
        defaultValue: 1,
        min: 1,
        max: 50,
        step: 1,
        suffix: 'candles',
        allowVariables: true,
        tooltip: 'How many closed candles of that colour in a row.',
      }),
      makeSelectField({
        key: 'candleTrigger',
        label: 'Trigger',
        defaultValue: CandleTriggerEnum.streak,
        options: CANDLE_TRIGGER_OPTIONS,
        tooltip:
          'While in a row: true on every candle while the last N candles are all that colour. Once per run: true only on the N-th candle of the run, once.',
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.ob]: {
    type: IndicatorEnum.ob,
    label: 'Order Blocks',
    shortLabel: 'Order Blocks',
    category: IndicatorCategories.Chart,
    description:
      'Smart-money order blocks: the last opposite candle before a break of structure, kept until price closes through it.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeNumberField({
        key: 'obSwingLength',
        label: 'Swing length',
        defaultValue: 5,
        min: 2,
        max: 50,
        step: 1,
        suffix: 'bars',
        allowVariables: true,
        tooltip:
          'A swing high or low needs this many bars on each side of it, so it is confirmed this many bars after it prints. A close beyond the latest swing forms a block.',
      }),
      makeSelectField({
        key: 'obSide',
        label: 'Block',
        defaultValue: OBSideEnum.bullish,
        options: OB_SIDE_OPTIONS,
        tooltip:
          'Bullish: formed when a close breaks above a swing high; the candle with the lowest low before the break. Bearish: the mirror below a swing low. Only the latest block of each side counts; it ends when a candle closes through it.',
      }),
      makeSelectField({
        key: 'obLevel',
        label: 'Level',
        defaultValue: OBLevelEnum.top,
        options: OB_LEVEL_OPTIONS,
        tooltip: 'The edge of the block the close is compared with, or its middle.',
      }),
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: PRICE_CONDITION_OPTIONS,
        optionsWhen: OB_CONDITION_OPTIONS_WHEN,
        tooltip:
          'Crossing compares two candles of the same block; a new block moving the level is not a crossing. No active block: false. Price crossing down the top of a bullish block is the retest long.',
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.sqz]: {
    type: IndicatorEnum.sqz,
    label: 'Squeeze Momentum',
    shortLabel: 'Squeeze',
    category: IndicatorCategories.Volatility,
    description:
      "LazyBear's Squeeze Momentum: Bollinger Bands inside the Keltner Channels mark a squeeze, and a momentum histogram shows the direction of the breakout.",
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
      makeNumberField({
        key: 'sqzLength',
        label: 'BB length',
        defaultValue: 20,
        min: 2,
        max: 500,
        step: 1,
        allowVariables: true,
        tooltip: 'Candles of the Bollinger Bands.',
      }),
      makeNumberField({
        key: 'sqzBBMult',
        label: 'BB multiplier',
        defaultValue: 2,
        min: 0.1,
        max: 10,
        step: 0.1,
        suffix: 'σ',
        allowVariables: true,
        tooltip:
          "Width of the Bollinger Bands in standard deviations. TradingView's published script draws with 1.5; set 1.5 to match its chart.",
      }),
      makeNumberField({
        key: 'sqzKCLength',
        label: 'KC length',
        defaultValue: 20,
        min: 2,
        max: 500,
        step: 1,
        allowVariables: true,
        tooltip:
          'Candles of the Keltner Channels, also the length of the momentum.',
      }),
      makeNumberField({
        key: 'sqzKCMult',
        label: 'KC multiplier',
        defaultValue: 1.5,
        min: 0.1,
        max: 10,
        step: 0.1,
        suffix: '×',
        allowVariables: true,
        tooltip:
          'Width of the Keltner Channels as a multiple of the average true range.',
      }),
      makeIntervalField({
        key: 'indicatorInterval',
        label: 'Interval',
        defaultValue: ExchangeIntervals.oneH,
      }),
      makeSelectField({
        key: 'sqzSignal',
        label: 'Squeeze',
        defaultValue: SqzSignalEnum.fired,
        options: SQZ_SIGNAL_OPTIONS,
        tooltip:
          'In a squeeze: the Bollinger Bands are inside the Keltner Channels. Fired: the squeeze ended on this candle (the candle before was in one). Out of a squeeze: the bands are outside the channels.',
        derive: {
          get: (params) => params.sqzSignal ?? SqzSignalEnum.fired,
          set: sqzSignalParams,
        },
      }),
      makeSelectField({
        key: 'sqzMomentum',
        label: 'Momentum',
        defaultValue: SqzMomentumEnum.positive,
        options: SQZ_MOMENTUM_OPTIONS,
        tooltip:
          'The momentum histogram: above or below zero, higher or lower than on the candle before, or crossing zero. Both Squeeze and Momentum must hold; they cannot both be Any.',
        derive: {
          get: (params) => params.sqzMomentum ?? SqzMomentumEnum.positive,
          set: sqzMomentumParams,
        },
      }),
      keepConditionBarsField,
    ],
  },
};

export const INDICATOR_CATALOG: Record<IndicatorEnum, IndicatorDefinition> =
  Object.fromEntries(
    Object.entries(BASE_INDICATOR_CATALOG).map(([type, definition]) => [
      type,
      withModifiersSection(
        supportsSmoothing(type) ? withSmoothingGates(definition) : definition
      ),
    ])
  ) as Record<IndicatorEnum, IndicatorDefinition>;

Object.entries(INDICATOR_DOCUMENTATION_URLS).forEach(([type, url]) => {
  if (!url) {
    return;
  }
  const indicatorType = type as IndicatorEnum;
  const definition = INDICATOR_CATALOG[indicatorType];
  if (definition) {
    definition.documentationUrl = url;
  }
});

Object.values(INDICATOR_CATALOG).forEach((definition) => {
  const startDealIndex = definition.supportedActions.indexOf(
    IndicatorAction.startDeal
  );
  const hasStartDca = definition.supportedActions.includes(
    IndicatorAction.startDca
  );

  if (startDealIndex !== -1 && !hasStartDca) {
    definition.supportedActions = [
      ...definition.supportedActions.slice(0, startDealIndex + 1),
      IndicatorAction.startDca,
      ...definition.supportedActions.slice(startDealIndex + 1),
    ];
  }
});

const BOT_CONTROLLER_EXCLUSIONS = new Set<IndicatorEnum>([
  // Legacy dashboard restricts AVP (UNPNL) from Bot Controller usage
  IndicatorEnum.unpnl,
  IndicatorEnum.session,
]);

Object.values(INDICATOR_CATALOG).forEach((definition) => {
  if (BOT_CONTROLLER_EXCLUSIONS.has(definition.type)) {
    return;
  }

  if (
    !definition.supportedActions.includes(IndicatorAction.stopBot) &&
    !definition.supportedActions.includes(IndicatorAction.startBot)
  ) {
    definition.supportedActions = [
      ...definition.supportedActions,
      IndicatorAction.stopBot,
      IndicatorAction.startBot,
    ];
  }
});
