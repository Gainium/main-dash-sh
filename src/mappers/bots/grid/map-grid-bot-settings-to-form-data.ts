import {
  mapBotSettingsToFormData,
  type MapBotSettingsToFormDataOptions,
  type MapBotSettingsToFormDataResult,
} from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import {
  BotMarginTypeEnum,
  BotTypesEnum,
  ExchangeEnum,
  InitialPriceFromEnum,
  StrategyEnum,
  type Currency,
  type TpSlAction,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

export interface GridBotSettings {
  pair?: string | string[];
  exchange?: string;
  exchangeUUID?: string;
  [key: string]: unknown;
}

export interface MapGridBotSettingsOptions {
  bot?: {
    exchange?: string;
    exchangeUUID?: string;
    settings?: GridBotSettings;
  } | null;
  debug?: boolean;
}

const KNOWN_QUOTES = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB', 'BUSD'];

const stripTrailingZeros = (value: string): string =>
  value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');

const formatNumber = (
  value: unknown,
  options: { precision?: number; allowZero?: boolean } = {}
): string | undefined => {
  const { precision, allowZero = true } = options;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!allowZero && value === 0) {
      return undefined;
    }

    if (typeof precision === 'number') {
      return stripTrailingZeros(value.toFixed(precision));
    }

    return stripTrailingZeros(value.toString());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!allowZero && Number.parseFloat(trimmed) === 0) {
      return undefined;
    }
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
};

const formatPercentFromDecimal = (
  value: unknown,
  precision = 2
): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return stripTrailingZeros((value * 100).toFixed(precision));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    // Backend returns these percent fields as decimal strings (e.g. "0.01"
    // for 1%). Coerce and multiply by 100 like the numeric branch above,
    // otherwise the form shows the raw decimal instead of the percent.
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return stripTrailingZeros((parsed * 100).toFixed(precision));
  }

  return undefined;
};

const toInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const resolvePrimaryPair = (
  formPairs: BotFormData['pair'],
  ...candidates: Array<string | string[] | undefined>
): string | undefined => {
  if (Array.isArray(formPairs) && formPairs.length > 0) {
    const pair = String(formPairs[0]).trim();
    if (pair) {
      return pair;
    }
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (Array.isArray(candidate) && candidate.length > 0) {
      const value = String(candidate[0]).trim();
      if (value) {
        return value;
      }
    } else if (typeof candidate === 'string') {
      const value = candidate.trim();
      if (value) {
        return value;
      }
    }
  }

  return undefined;
};

const normalizePairString = (pair: string | undefined): string | undefined => {
  if (!pair) {
    return undefined;
  }

  const sanitized = pair.trim();
  if (!sanitized) {
    return undefined;
  }

  if (sanitized.includes('/')) {
    return sanitized.toUpperCase();
  }

  const upper = sanitized.toUpperCase();
  const matchedQuote = KNOWN_QUOTES.find((quote) => upper.endsWith(quote));
  if (!matchedQuote) {
    return upper;
  }

  const baseAsset = upper.slice(0, -matchedQuote.length);
  if (!baseAsset) {
    return upper;
  }

  return `${baseAsset}${matchedQuote}`;
};

const ensureArrayPair = (value: unknown): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value];
  }

  return undefined;
};

export const mapGridBotSettingsToFormData = (
  settings: unknown,
  options: MapGridBotSettingsOptions = {}
): MapBotSettingsToFormDataResult => {
  const baseOptions: MapBotSettingsToFormDataOptions = {};

  if (options.debug !== undefined) {
    baseOptions.debug = options.debug;
  }

  const baseResult = mapBotSettingsToFormData(
    BotTypesEnum.grid,
    settings,
    baseOptions
  );
  const formData = {
    ...baseResult.formData,
    type: 'grid' as const,
    useDca: false,
  };

  const directSettings =
    settings && typeof settings === 'object'
      ? (settings as Record<string, unknown>)
      : undefined;
  const botSettings: Record<string, unknown> = {
    ...(directSettings ?? {}),
    ...((options.bot?.settings as Record<string, unknown> | undefined) ?? {}),
  };

  if (botSettings['name'] && typeof botSettings['name'] === 'string') {
    formData.name = botSettings['name'];
  }

  if (!formData.pair?.length) {
    const pair = ensureArrayPair(botSettings['pair']);
    if (pair?.length) {
      formData.pair = pair;
    }
  }

  const resolvedPair = resolvePrimaryPair(
    formData.pair,
    botSettings['pair'] as string | string[] | undefined
  );
  const normalizedPair = normalizePairString(resolvedPair);
  if (normalizedPair) {
    formData.pair = [normalizedPair];
  }

  if (!formData.exchangeUUID) {
    const exchangeCandidate =
      (botSettings['exchangeUUID'] as string | undefined) ??
      (botSettings['exchange'] as string | undefined) ??
      options.bot?.exchange;

    if (typeof exchangeCandidate === 'string' && exchangeCandidate.trim()) {
      formData.exchangeUUID = exchangeCandidate as ExchangeEnum;
    }
  }

  if (
    typeof options.bot?.exchangeUUID === 'string' &&
    options.bot.exchangeUUID.trim().length > 0
  ) {
    formData.exchangeUUID = options.bot.exchangeUUID as ExchangeEnum;
  }

  const numericTopPrice = formatNumber(botSettings['topPrice'], {
    precision: 6,
    allowZero: false,
  });
  if (numericTopPrice !== undefined) {
    formData.grid.topPrice = +numericTopPrice;
  }

  const numericLowPrice = formatNumber(botSettings['lowPrice'], {
    precision: 6,
    allowZero: false,
  });
  if (numericLowPrice !== undefined) {
    formData.grid.lowPrice = +numericLowPrice;
  }

  const numericBudget = formatNumber(botSettings['budget'], {
    precision: 6,
    allowZero: true,
  });
  if (numericBudget !== undefined) {
    formData.grid.budget = +numericBudget;
  }

  const resolvedLevels = toInteger(botSettings['levels']);
  if (typeof resolvedLevels === 'number') {
    formData.grid.levels = resolvedLevels;
  }

  const gridStepPercent = formatPercentFromDecimal(botSettings['gridStep'], 4);
  if (gridStepPercent !== undefined) {
    formData.grid.gridStep = +gridStepPercent;
  }

  const sellDisplacementPercent = formatPercentFromDecimal(
    botSettings['sellDisplacement'],
    3
  );
  if (sellDisplacementPercent !== undefined) {
    formData.grid.sellDisplacement = +sellDisplacementPercent;
  }

  if (typeof botSettings['gridType'] === 'string') {
    formData.grid.gridType = botSettings['gridType'] as
      | 'geometric'
      | 'arithmetic';
  }

  const useOrderInAdvance = botSettings['useOrderInAdvance'];
  if (typeof useOrderInAdvance === 'boolean') {
    formData.grid.useOrderInAdvance = useOrderInAdvance;
  }

  const ordersInAdvance = toInteger(botSettings['ordersInAdvance']);
  if (typeof ordersInAdvance === 'number') {
    formData.grid.ordersInAdvance = ordersInAdvance;
  }

  if (typeof botSettings['tpSl'] === 'boolean') {
    formData.grid.tpSl = botSettings['tpSl'] as boolean;
  } else if (typeof botSettings['useTp'] === 'boolean') {
    formData.grid.tpSl = botSettings['useTp'] as boolean;
  }

  const tpPercPercent = formatPercentFromDecimal(botSettings['tpPerc'], 3);
  if (tpPercPercent !== undefined) {
    formData.grid.tpPerc = +tpPercPercent;
  }

  if (typeof botSettings['tpSlCondition'] === 'string') {
    formData.grid.tpSlCondition = botSettings['tpSlCondition'] as
      | 'valueChanged'
      | 'priceReached';
  }

  if (typeof botSettings['tpSlAction'] === 'string') {
    formData.grid.tpSlAction = botSettings['tpSlAction'] as TpSlAction;
  }

  if (typeof botSettings['tpSlLimit'] === 'boolean') {
    formData.grid.tpSlLimit = botSettings['tpSlLimit'] as boolean;
  }

  const tpTopPrice = formatNumber(botSettings['tpTopPrice'], {
    precision: 6,
    allowZero: false,
  });
  if (tpTopPrice !== undefined) {
    formData.grid.tpTopPrice = +tpTopPrice;
  }

  if (typeof botSettings['sl'] === 'boolean') {
    formData.grid.sl = botSettings['sl'] as boolean;
  } else if (typeof botSettings['useSl'] === 'boolean') {
    formData.grid.sl = botSettings['useSl'] as boolean;
  }

  if (typeof botSettings['slCondition'] === 'string') {
    formData.grid.slCondition = botSettings['slCondition'] as
      | 'valueChanged'
      | 'priceReached';
  }

  if (typeof botSettings['slAction'] === 'string') {
    formData.grid.slAction = botSettings['slAction'] as TpSlAction;
  }

  if (typeof botSettings['slLimit'] === 'boolean') {
    formData.grid.slLimit = botSettings['slLimit'] as boolean;
  }

  const slPercPercent = formatPercentFromDecimal(botSettings['slPerc'], 3);
  if (slPercPercent !== undefined) {
    formData.grid.slPerc = +slPercPercent;
  }

  const slLowPrice = formatNumber(botSettings['slLowPrice'], {
    precision: 6,
    allowZero: false,
  });
  if (slLowPrice !== undefined) {
    formData.grid.slLowPrice = +slLowPrice;
  }

  if (typeof botSettings['useStartPrice'] === 'boolean') {
    formData.grid.useStartPrice = botSettings['useStartPrice'] as boolean;
  }

  const startPrice = formatNumber(botSettings['startPrice'], {
    precision: 6,
    allowZero: false,
  });
  if (startPrice !== undefined) {
    formData.grid.startPrice = startPrice;
  }

  if (typeof botSettings['profitCurrency'] === 'string') {
    formData.grid.profitCurrency = botSettings['profitCurrency'] as Currency;
  }

  if (typeof botSettings['orderFixedIn'] === 'string') {
    const orderRef = botSettings['orderFixedIn'].toString().toLowerCase() as
      | 'base'
      | 'quote';
    if (orderRef === 'base' || orderRef === 'quote') {
      formData.grid.orderFixedIn = orderRef;
    }
  }

  // This block used to test `strategy` and then assign `futuresStrategy` — two
  // separate defects in one copy-paste. `grid.strategy` was read nowhere in the
  // whole settings -> form path, so a short grid bot always came back Long;
  // cloning one silently produced a bot pointing the opposite way. And the
  // assignment itself was both redundant (the shared grid block in
  // map-bot-settings-to-form-data.ts already reads `futuresStrategy` properly)
  // and harmful, since a payload carrying `strategy` but no `futuresStrategy`
  // wrote `undefined` over that correct value.
  if (typeof botSettings['strategy'] === 'string') {
    formData.grid.strategy = botSettings['strategy'] as StrategyEnum;
  }

  if (typeof botSettings['futures'] === 'boolean') {
    formData.grid.futures = botSettings['futures'] as boolean;
  }

  if (typeof botSettings['coinm'] === 'boolean') {
    formData.grid.coinm = botSettings['coinm'] as boolean;
  }

  const leverageValue =
    typeof botSettings['leverage'] === 'number'
      ? botSettings['leverage']
      : typeof botSettings['leverage'] === 'string'
        ? Number.parseFloat(botSettings['leverage'])
        : undefined;
  if (typeof leverageValue === 'number' && Number.isFinite(leverageValue)) {
    formData.grid.leverage = leverageValue;
  }

  if (typeof botSettings['marginType'] === 'string') {
    formData.grid.marginType = botSettings['marginType'] as BotMarginTypeEnum;
  }

  const initialPrice = formatNumber(
    botSettings['initialPrice'] ??
      (options.bot as { initialPrice?: number })?.initialPrice,
    { precision: 6, allowZero: false }
  );
  if (initialPrice !== undefined) {
    formData.initialPrice = initialPrice;
  }

  if (typeof botSettings['initialPriceFrom'] === 'string') {
    formData.initialPriceFrom = botSettings[
      'initialPriceFrom'
    ] as InitialPriceFromEnum;
  }

  if (typeof botSettings['updatedBudget'] === 'boolean') {
    formData.grid.updatedBudget = botSettings['updatedBudget'] as boolean;
  }

  if (typeof botSettings['newProfit'] === 'boolean') {
    formData.grid.newProfit = botSettings['newProfit'] as boolean;
  }

  return {
    formData: {
      ...formData,
      type: BotTypesEnum.grid,
    },
  };
};
