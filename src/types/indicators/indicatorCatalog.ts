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
} from '..';
import {
  IndicatorCategories,
  type IndicatorDefinition,
  type IndicatorFieldDefinition,
} from './indicatorTypes';

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

// MA indicator swaps condition labels (the stored value is the inverse of the
// displayed label). This matches the legacy dashboard behaviour where the
// condition is expressed from the MA's perspective relative to price.
const MA_INDICATOR_CONDITION_OPTIONS = [
  { value: IndicatorStartConditionEnum.cd, label: 'Crossing up' },
  { value: IndicatorStartConditionEnum.cu, label: 'Crossing down' },
  { value: IndicatorStartConditionEnum.gt, label: 'Lower than' },
  { value: IndicatorStartConditionEnum.lt, label: 'Greater than' },
];

const SR_CONDITION_OPTIONS = [
  { value: IndicatorStartConditionEnum.cd, label: 'Price crossing down' },
  { value: IndicatorStartConditionEnum.cu, label: 'Price crossing up' },
];

// Legacy renders the condition for the [bb, kc, sr, psar, pp] group with a
// `Price ` prefix (indicators.tsx:1813-1822). The full four-option variant is
// used by kc.
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

const MA_REFERENCE_OPTIONS = [
  { value: MAEnum.price, label: 'Current price' },
  ...MA_TYPE_OPTIONS,
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
  [IndicatorEnum.mg]: '/help/mcginley-dynamic',
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

const percentileFields: IndicatorDefinition['fields'] = [
  makeBooleanField({
    key: 'percentile',
    label: 'Use percentile',
    defaultValue: false,
    tooltip: 'Enable percentile mode.',
    tooltipURL: '/help/indicator-percentiles',
  }),
  makeNumberField({
    key: 'percentileLookback',
    label: 'Lookback',
    defaultValue: 150,
    step: 1,
    allowVariables: true,
    hiddenWhen: [{ field: 'percentile', equals: false }],
  }),
  makeNumberField({
    key: 'percentilePercentage',
    label: 'Percentile',
    defaultValue: 90,
    step: 1,
    allowVariables: true,
    hiddenWhen: [{ field: 'percentile', equals: false }],
  }),
];

// Trend filter — legacy "Use Trend Filter" block, only exposed on MAR
// (the sole entry in the legacy `trendIndicators` list). When enabled it
// gates entries on the recent trend of the indicator over its own lookback.
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

const keepConditionBarsField: IndicatorFieldDefinition = makeNumberField({
  key: 'keepConditionBars',
  label: 'Keep true',
  defaultValue: 0,
  min: 0,
  step: 1,
  allowVariables: true,
  tooltip:
    'This condition will remain true for a number of extra bars. Default is 0, which means it will be true only on the bar that triggered the condition.',
});

/**
 * NOTE: The legacy dashboard exposes many composite options (e.g., MA type select with nested defaults).
 * We keep the structure declarative so downstream editors can render controls dynamically.
 */
export const INDICATOR_CATALOG: Record<IndicatorEnum, IndicatorDefinition> = {
  [IndicatorEnum.adx]: {
    type: IndicatorEnum.adx,
    label: 'Average Directional Index (ADX)',
    shortLabel: 'ADX',
    category: IndicatorCategories.Trend,
    description:
      'Measures the strength of a trend without regard to direction, with higher values indicating a stronger trend.',
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 20,
        step: 1,
        allowVariables: true,
        hiddenWhen: [{ field: 'percentile', equals: true }],
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
      makeSelectField({
        key: 'maCrossingValue',
        label: 'Reference',
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
      makeSelectField({
        key: 'maType',
        label: 'Relative to',
        defaultValue: MAEnum.ema,
        options: MA_TYPE_OPTIONS,
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
        options: MA_INDICATOR_CONDITION_OPTIONS,
      }),
      keepConditionBarsField,
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
        step: 1,
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
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0.05,
        step: 1,
        allowVariables: true,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
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
        step: 1,
        allowVariables: true,
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
      makeSelectField({
        key: 'stochRange',
        label: 'Zone',
        defaultValue: StochRangeEnum.lower,
        options: STOCH_RANGE_OPTIONS,
        tooltip: 'This is the area where the condition must be met',
        hiddenWhen: [{ field: 'rsiValue2', equals: rsiValue2Enum.custom }],
      }),
      // Legacy "Lower band" (indicators.tsx:2452-2498): shows when stochRange is
      // lower or both. Storage key swaps with stochRange — stochRange===lower
      // writes stochUpper (default '80'); otherwise (both) writes stochLower
      // (default '20').
      makeNumberField({
        key: 'stochLower',
        label: 'Lower band',
        defaultValue: '20',
        allowVariables: true,
        tooltip:
          'Define the lower band range where the condition must be met',
        keyWhen: [
          {
            field: 'stochRange',
            equals: StochRangeEnum.lower,
            key: 'stochUpper',
            defaultValue: '80',
          },
        ],
        hiddenWhen: [
          { field: 'stochRange', equals: StochRangeEnum.upper },
          { field: 'stochRange', equals: StochRangeEnum.none },
          { field: 'rsiValue2', equals: rsiValue2Enum.custom },
        ],
      }),
      // Legacy "Upper band" (indicators.tsx:2502-2547): shows when stochRange is
      // upper or both. Storage key swaps with stochRange — stochRange===upper
      // writes stochLower (default '80'); otherwise (both) writes stochUpper
      // (default '20').
      makeNumberField({
        key: 'stochUpper',
        label: 'Upper band',
        defaultValue: '20',
        allowVariables: true,
        tooltip:
          'Define the upper band range where the condition must be met',
        keyWhen: [
          {
            field: 'stochRange',
            equals: StochRangeEnum.upper,
            key: 'stochLower',
            defaultValue: '80',
          },
        ],
        hiddenWhen: [
          { field: 'stochRange', equals: StochRangeEnum.lower },
          { field: 'stochRange', equals: StochRangeEnum.none },
          { field: 'rsiValue2', equals: rsiValue2Enum.custom },
        ],
      }),
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
      makeSelectField({
        key: 'stochRange',
        label: 'Zone',
        defaultValue: StochRangeEnum.lower,
        options: STOCH_RANGE_OPTIONS,
        tooltip: 'This is the area where the condition must be met',
        hiddenWhen: [{ field: 'rsiValue2', equals: rsiValue2Enum.custom }],
      }),
      // Legacy "Lower band" key-swap (see stoch entry above): stochRange===lower
      // writes stochUpper (default '80'); otherwise (both) writes stochLower ('20').
      makeNumberField({
        key: 'stochLower',
        label: 'Lower band',
        defaultValue: '20',
        allowVariables: true,
        tooltip:
          'Define the lower band range where the condition must be met',
        keyWhen: [
          {
            field: 'stochRange',
            equals: StochRangeEnum.lower,
            key: 'stochUpper',
            defaultValue: '80',
          },
        ],
        hiddenWhen: [
          { field: 'stochRange', equals: StochRangeEnum.upper },
          { field: 'stochRange', equals: StochRangeEnum.none },
          { field: 'rsiValue2', equals: rsiValue2Enum.custom },
        ],
      }),
      // Legacy "Upper band" key-swap: stochRange===upper writes stochLower
      // (default '80'); otherwise (both) writes stochUpper (default '20').
      makeNumberField({
        key: 'stochUpper',
        label: 'Upper band',
        defaultValue: '20',
        allowVariables: true,
        tooltip:
          'Define the upper band range where the condition must be met',
        keyWhen: [
          {
            field: 'stochRange',
            equals: StochRangeEnum.upper,
            key: 'stochLower',
            defaultValue: '80',
          },
        ],
        hiddenWhen: [
          { field: 'stochRange', equals: StochRangeEnum.lower },
          { field: 'stochRange', equals: StochRangeEnum.none },
          { field: 'rsiValue2', equals: rsiValue2Enum.custom },
        ],
      }),
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
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 70,
        step: 1,
        allowVariables: true,
      }),
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.mg]: {
    type: IndicatorEnum.mg,
    label: 'McGinley Dynamic',
    shortLabel: 'MG',
    category: IndicatorCategories.Trend,
    description:
      'A self-adjusting moving average that speeds up in fast markets and slows down in flat ones, tracking price more closely than a fixed-period moving average.',
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
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0,
        step: 1,
        allowVariables: true,
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
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0,
        step: 1,
        allowVariables: true,
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
        defaultValue: 10,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 80,
        step: 1,
        allowVariables: true,
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
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 0.05,
        step: 1,
        allowVariables: true,
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
        options: MA_TYPE_OPTIONS,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
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
        step: 1,
        allowVariables: true,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: -40,
        step: 1,
        allowVariables: true,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Level',
        defaultValue: 70,
        step: 1,
        allowVariables: true,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Condition',
        defaultValue: IndicatorStartConditionEnum.cd,
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Level',
        defaultValue: 70,
        step: 1,
        allowVariables: true,
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
      makeSelectField({
        key: 'indicatorCondition',
        label: 'Trigger',
        defaultValue: TradingviewAnalysisConditionEnum.entry,
        options: TV_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'checkLevel',
        label: 'Check level',
        defaultValue: 15,
        min: 1,
        max: 100,
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
    description: 'Crossovers between paired oscillators (e.g., RSI vs MA).',
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
        max: 10,
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
        options: INDICATOR_CONDITION_OPTIONS,
      }),
      makeNumberField({
        key: 'indicatorValue',
        label: 'Value',
        defaultValue: 10,
        step: 1,
        allowVariables: true,
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
        options: INDICATOR_CONDITION_OPTIONS,
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
      keepConditionBarsField,
    ],
  },
  [IndicatorEnum.session]: {
    type: IndicatorEnum.session,
    label: 'Session Selector',
    shortLabel: 'Session',
    category: IndicatorCategories.Filter,
    description:
      'Filters signals based on the day of the week (UTC). Select which days are active and whether to trade in or out of the selected sessions.',
    supportedActions: INDICATOR_ACTIONS_EXCEPT_RISK_REWARD,
    fields: [
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
      makeSelectField({
        key: 'sessionRule',
        label: 'Rule',
        defaultValue: SessionRuleEnum.in,
        options: [
          { value: SessionRuleEnum.in, label: 'In session' },
          { value: SessionRuleEnum.out, label: 'Out of session' },
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
};

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
