import {
  DONCHIAN_BAND_VALUES,
  INDICATOR_CATALOG,
  MARKET_STRUCTURE_TYPE_VALUES,
  MARKET_STRUCTURE_VALUE_GROUPS,
} from './indicatorCatalog';
import {
  IndicatorCategories,
  type IndicatorCategory,
  type IndicatorDefinition,
  type IndicatorFieldDefinition,
  type IndicatorFieldOption,
} from './indicatorTypes';
import type {
  IndicatorParamPrimitive,
  IndicatorParamsState,
} from './indicatorParams';
import {
  DCValueEnum,
  ExchangeEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorSection,
  IndicatorStartConditionEnum,
  ppValueEnum,
  ppValueTypeEnum,
  type SettingsIndicators,
} from '..';

const collectFields = (
  definition: IndicatorDefinition
): IndicatorFieldDefinition[] => [
  ...definition.fields,
  ...(definition.advancedFields ?? []),
];

const getFallbackDefault = (field: IndicatorFieldDefinition) => {
  if (field.defaultValue !== undefined) {
    return field.defaultValue;
  }
  if (field.type === 'boolean') {
    return false;
  }
  if (field.type === 'select' && field.options?.length) {
    return field.options[0]?.value;
  }
  return undefined;
};

export const getIndicatorDefinition = (
  type: IndicatorEnum
): IndicatorDefinition => {
  const definition = INDICATOR_CATALOG[type];
  if (!definition) {
    throw new Error(`Indicator definition for ${type} is not registered.`);
  }
  return definition;
};

export const listIndicatorsByCategory = (
  category?: IndicatorCategory
): IndicatorDefinition[] =>
  Object.values(INDICATOR_CATALOG).filter((indicator) =>
    category ? indicator.category === category : true
  );

export const listIndicatorsForAction = (
  action: IndicatorAction
): IndicatorDefinition[] =>
  Object.values(INDICATOR_CATALOG).filter((indicator) =>
    indicator.supportedActions.includes(action)
  );

export const listPendingIndicators = (): IndicatorDefinition[] =>
  Object.values(INDICATOR_CATALOG).filter((indicator) => indicator.pendingPort);

export const groupIndicatorsByCategory = (): Record<
  IndicatorCategory,
  IndicatorDefinition[]
> => {
  const categories = Object.values(IndicatorCategories) as IndicatorCategory[];
  return categories.reduce<Record<IndicatorCategory, IndicatorDefinition[]>>(
    (acc, category) => {
      acc[category] = listIndicatorsByCategory(category);
      return acc;
    },
    {} as Record<IndicatorCategory, IndicatorDefinition[]>
  );
};

export const indicatorSupportsAction = (
  type: IndicatorEnum,
  action: IndicatorAction
): boolean => getIndicatorDefinition(type).supportedActions.includes(action);

export const getIndicatorDocumentationUrl = (
  type: IndicatorEnum
): string | undefined => getIndicatorDefinition(type).documentationUrl;

export const getIndicatorDefaultParams = (
  type: IndicatorEnum,
  action: IndicatorAction,
  section?: IndicatorSection | undefined
): IndicatorParamsState => {
  const definition = getIndicatorDefinition(type);
  return collectFields(definition).reduce<IndicatorParamsState>(
    (acc, field) => {
      const value = getFallbackDefault(field);
      if (value !== undefined) {
        (acc as Record<string, NonNullable<IndicatorParamPrimitive>>)[
          field.key
        ] = value as NonNullable<IndicatorParamPrimitive>;
      }
      return acc;
    },
    {
      type,
      indicatorAction: action,
      section,
      indicatorLength: 14,
      indicatorValue: '70',
      indicatorCondition: IndicatorStartConditionEnum.cu,
      indicatorInterval: ExchangeIntervals.oneH,
      groupId: '',
      uuid: '',
    } as IndicatorParamsState
  );
};

export const validateIndicatorParams = (
  type: IndicatorEnum,
  params: Record<string, unknown>
): string[] => {
  const definition = getIndicatorDefinition(type);
  const missing: string[] = [];

  collectFields(definition).forEach((field) => {
    if (!field.required) {
      return;
    }
    const value = params[field.key];
    if (value === undefined || value === null || value === '') {
      missing.push(field.key);
    }
  });
  const errors = [...missing];

  const getParam = <Value = unknown>(
    key: keyof SettingsIndicators
  ): Value | undefined => params[key] as Value | undefined;

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.trim().length) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    return Number.NaN;
  };

  switch (type) {
    case IndicatorEnum.pp: {
      const ppType = getParam<ppValueTypeEnum>('ppType');
      const ppValue = getParam<ppValueEnum>('ppValue');

      if (!ppType || !MARKET_STRUCTURE_TYPE_VALUES.has(ppType)) {
        errors.push('ppType');
        break;
      }

      const valueSet =
        ppType === 'Price Based'
          ? MARKET_STRUCTURE_VALUE_GROUPS.price
          : ppType === 'Event Based'
            ? MARKET_STRUCTURE_VALUE_GROUPS.event
            : MARKET_STRUCTURE_VALUE_GROUPS.market;

      if (!ppValue || !valueSet.has(ppValue)) {
        errors.push('ppValue');
      }

      if (ppType === 'Price Based') {
        const ensureNonNegativeInteger = (
          fieldKey: keyof SettingsIndicators
        ) => {
          const numeric = toNumber(getParam(fieldKey));
          if (!Number.isFinite(numeric) || numeric < 0) {
            errors.push(fieldKey);
          }
        };

        (
          [
            'ppHighLeft',
            'ppHighRight',
            'ppLowLeft',
            'ppLowRight',
          ] as (keyof SettingsIndicators)[]
        ).forEach(ensureNonNegativeInteger);

        const multiplier = toNumber(getParam('ppMult'));
        if (!Number.isFinite(multiplier) || multiplier < 0) {
          errors.push('ppMult');
        }
      }
      break;
    }
    case IndicatorEnum.ath: {
      const threshold = toNumber(getParam('indicatorValue'));
      if (!Number.isFinite(threshold) || threshold < 0) {
        errors.push('value');
      }

      const lookback = toNumber(getParam('athLookback'));
      if (!Number.isFinite(lookback) || lookback < 1) {
        errors.push('athLookback');
      }
      break;
    }
    case IndicatorEnum.dc: {
      const dcValue = getParam<DCValueEnum>('dcValue');
      if (!dcValue || !DONCHIAN_BAND_VALUES.has(dcValue)) {
        errors.push('dcValue');
      }
      break;
    }
    default:
      break;
  }

  return Array.from(new Set(errors));
};

// --- Exchange-based interval filtering (ported from legacy main-dash) ---
//
// Legacy `filterIndicatorIntervalsByExchange` (main-dash
// components/dcabot/components/utils.tsx:203) restricts the indicator
// interval select to the candle intervals each exchange actually
// supports. The per-exchange supported sets mirror legacy
// constants.ts (binanceSupported, bitgetSupported, …). When no exchange
// is selected the full interval list is returned unchanged.

const binanceSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.threeM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.eightH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

const bitgetSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

const bybitSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.threeM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

const kucoinSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.threeM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.eightH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

const kucoinFuturesSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.eightH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

const okxSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.threeM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

const coinbaseSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.oneD,
];

const mexcSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

// Kraken spot serves eight widths natively; the backend builds 3m/2h/8h by
// aggregating a finer native one. Mirrors `NATIVE_MINUTES` ∪ `AGGREGATED_FROM`
// in exchange-connector `core/src/exchange/exchanges/kraken/candles.ts` and
// main-app `krakenSpotSupported` (`core/src/indicators/index.ts`), which is
// what the indicator service will actually subscribe.
const krakenSpotSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.threeM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.twoH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.eightH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

// Kraken futures has no aggregation step, so it keeps the native widths only.
// Mirrors main-app `krakenUsdmSupported`.
const krakenUsdmSupported: ExchangeIntervals[] = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];

// Ported from legacy main-dash helper/utils.ts `removePaperFormExchangeName`
// (the `demo` branch). Maps a paper-trading exchange id back to its live
// counterpart so the supported-interval lookup matches.
const removePaperFormExchangeName = (exchange: ExchangeEnum): ExchangeEnum => {
  switch (exchange) {
    case ExchangeEnum.paperBinance:
      return ExchangeEnum.binance;
    case ExchangeEnum.paperBybit:
      return ExchangeEnum.bybit;
    case ExchangeEnum.paperKucoin:
      return ExchangeEnum.kucoin;
    case ExchangeEnum.paperKucoinLinear:
      return ExchangeEnum.kucoinLinear;
    case ExchangeEnum.paperKucoinInverse:
      return ExchangeEnum.kucoinInverse;
    case ExchangeEnum.paperBinanceCoinm:
      return ExchangeEnum.binanceCoinm;
    case ExchangeEnum.paperBinanceUsdm:
      return ExchangeEnum.binanceUsdm;
    case ExchangeEnum.paperBybitCoinm:
      return ExchangeEnum.bybitCoinm;
    case ExchangeEnum.paperBybitUsdm:
      return ExchangeEnum.bybitUsdm;
    case ExchangeEnum.paperOkx:
      return ExchangeEnum.okx;
    case ExchangeEnum.paperOkxInverse:
      return ExchangeEnum.okxInverse;
    case ExchangeEnum.paperOkxLinear:
      return ExchangeEnum.okxLinear;
    case ExchangeEnum.paperCoinbase:
      return ExchangeEnum.coinbase;
    case ExchangeEnum.paperBitget:
      return ExchangeEnum.bitget;
    case ExchangeEnum.paperBitgetCoinm:
      return ExchangeEnum.bitgetCoinm;
    case ExchangeEnum.paperBitgetUsdm:
      return ExchangeEnum.bitgetUsdm;
    case ExchangeEnum.paperMexc:
      return ExchangeEnum.mexc;
    case ExchangeEnum.paperHyperliquid:
      return ExchangeEnum.hyperliquid;
    case ExchangeEnum.paperHyperliquidLinear:
      return ExchangeEnum.hyperliquidLinear;
    case ExchangeEnum.paperKraken:
      return ExchangeEnum.kraken;
    case ExchangeEnum.paperKrakenUsdm:
      return ExchangeEnum.krakenUsdm;
    default:
      return exchange;
  }
};

/**
 * Restrict a list of candle intervals to those the given exchange supports.
 * Ports legacy `filterIndicatorIntervalsByExchange`. Exchanges with no
 * special-cased list (e.g. hyperliquid) fall through and keep the full set.
 */
export const filterIntervalsByExchange = (
  intervals: ExchangeIntervals[],
  rawExchange: ExchangeEnum
): ExchangeIntervals[] => {
  const exchange = removePaperFormExchangeName(rawExchange);

  if (
    [
      ExchangeEnum.binance,
      ExchangeEnum.binanceCoinm,
      ExchangeEnum.binanceUsdm,
    ].includes(exchange)
  ) {
    return intervals.filter((i) => binanceSupported.includes(i));
  }
  if (
    [
      ExchangeEnum.bitget,
      ExchangeEnum.bitgetCoinm,
      ExchangeEnum.bitgetUsdm,
    ].includes(exchange)
  ) {
    return intervals.filter((i) => bitgetSupported.includes(i));
  }
  if (
    [
      ExchangeEnum.bybit,
      ExchangeEnum.bybitCoinm,
      ExchangeEnum.bybitUsdm,
    ].includes(exchange)
  ) {
    return intervals.filter((i) => bybitSupported.includes(i));
  }
  if (
    [ExchangeEnum.kucoinInverse, ExchangeEnum.kucoinLinear].includes(exchange)
  ) {
    return intervals.filter((i) => kucoinFuturesSupported.includes(i));
  }
  if ([ExchangeEnum.kucoin].includes(exchange)) {
    return intervals.filter((i) => kucoinSupported.includes(i));
  }
  if (
    [
      ExchangeEnum.okx,
      ExchangeEnum.okxLinear,
      ExchangeEnum.okxInverse,
    ].includes(exchange)
  ) {
    return intervals.filter((i) => okxSupported.includes(i));
  }
  if ([ExchangeEnum.coinbase].includes(exchange)) {
    return intervals.filter((i) => coinbaseSupported.includes(i));
  }
  if ([ExchangeEnum.mexc].includes(exchange)) {
    return intervals.filter((i) => mexcSupported.includes(i));
  }
  if ([ExchangeEnum.kraken].includes(exchange)) {
    return intervals.filter((i) => krakenSpotSupported.includes(i));
  }
  if ([ExchangeEnum.krakenUsdm].includes(exchange)) {
    return intervals.filter((i) => krakenUsdmSupported.includes(i));
  }
  return intervals;
};

/**
 * Filter a select field's interval options to those supported by the
 * selected exchange. No-op (returns the original list) when no exchange is
 * provided, matching legacy where the exchange filter only applies when an
 * exchange is set. Option order is preserved.
 */
export const filterIntervalOptionsByExchange = (
  options: IndicatorFieldOption[] | undefined,
  exchange: ExchangeEnum | undefined | null
): IndicatorFieldOption[] | undefined => {
  if (!options || !exchange) {
    return options;
  }
  const allowed = new Set<string>(
    filterIntervalsByExchange(
      options.map((o) => o.value as ExchangeIntervals),
      exchange
    )
  );
  return options.filter((o) => allowed.has(o.value as string));
};

export const resolveIndicatorActionScope = (
  action: IndicatorAction
): IndicatorDefinition[] => {
  switch (action) {
    case IndicatorAction.startDeal:
      return listIndicatorsForAction(IndicatorAction.startDeal);
    case IndicatorAction.startDca: {
      const startDcaIndicators = listIndicatorsForAction(
        IndicatorAction.startDca
      );
      if (startDcaIndicators.length > 0) {
        return startDcaIndicators;
      }
      return listIndicatorsForAction(IndicatorAction.startDeal);
    }
    case IndicatorAction.closeDeal:
      return listIndicatorsForAction(IndicatorAction.closeDeal);
    case IndicatorAction.riskReward:
      return listIndicatorsForAction(IndicatorAction.riskReward);
    case IndicatorAction.stopBot:
      return listIndicatorsForAction(IndicatorAction.stopBot);
    case IndicatorAction.startBot:
      return listIndicatorsForAction(IndicatorAction.startBot);
    default:
      return [];
  }
};
