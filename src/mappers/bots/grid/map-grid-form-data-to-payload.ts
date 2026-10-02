import type { BotFormData } from '@/types/bots/form';
import {
  parseGridNumber,
  validateGridFormData,
} from '@/utils/bots/grid/validation';
import type {
  MapFormDataToPayloadOptions,
  CreateGridBotPayload,
  GridUpdatePayload,
  MapGridFormDataToPayloadResult,
} from '@/mappers/bots/dca/map-form-data-to-payload';
import type { GridFieldMappingResult } from '@/mappers/bots/dca/field-mapping';
import {
  ExchangeEnum,
  StrategyEnum,
  type BotVars,
  type ExchangeInUser,
} from '@/types';

const KNOWN_QUOTES = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB', 'BUSD'];

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
};

/* const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.');
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}; */

/* const parseInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
};

const parsePercentDecimal = (
  value: unknown,
  precision = 6
): number | undefined => {
  const numeric = parseNumber(value);
  if (numeric === undefined) {
    return undefined;
  }

  const factor = 10 ** precision;
  return Math.round((numeric / 100) * factor) / factor;
}; */

const sanitizePair = (pairs: BotFormData['pair']): string | undefined => {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return undefined;
  }

  const candidate = String(pairs[0]).trim();
  return candidate.length > 0 ? candidate : undefined;
};

const splitPairSymbols = (
  pair: string | undefined
): { baseAsset?: string; quoteAsset?: string } => {
  const result: { baseAsset?: string; quoteAsset?: string } = {};

  if (!pair) {
    return result;
  }

  const normalized = pair.toUpperCase();
  if (normalized.includes('/')) {
    const [base, quote] = normalized.split('/');
    if (base) {
      result.baseAsset = base;
    }
    if (quote) {
      result.quoteAsset = quote;
    }
    return result;
  }

  const matchedQuote = KNOWN_QUOTES.find((quote) => normalized.endsWith(quote));
  if (!matchedQuote) {
    result.baseAsset = normalized;
    return result;
  }

  const baseAsset = normalized.slice(0, -matchedQuote.length);
  if (baseAsset) {
    result.baseAsset = baseAsset;
  }
  result.quoteAsset = matchedQuote;
  return result;
};

/* const setIfDefined = (
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void => {
  if (value !== undefined) {
    target[key] = value;
  }
};

const resolveGridStepDecimal = (formData: BotFormData): number | undefined => {
  const direct = parsePercentDecimal(formData.grid.gridStep, 6);
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return direct;
  }

  if (formData.grid.gridType !== 'arithmetic') {
    return undefined;
  }

  const topPrice = parseNumber(formData.grid.topPrice);
  const lowPrice = parseNumber(formData.grid.lowPrice);
  const levels =
    typeof formData.grid.levels === 'number'
      ? formData.grid.levels
      : parseInteger(formData.grid.levels);

  if (
    typeof topPrice === 'number' &&
    typeof lowPrice === 'number' &&
    typeof levels === 'number' &&
    levels > 0 &&
    topPrice > lowPrice
  ) {
    const absoluteStep = (topPrice - lowPrice) / levels;
    if (absoluteStep > 0 && topPrice !== 0) {
      const ratio = absoluteStep / topPrice;
      return Math.round(ratio * 1e6) / 1e6;
    }
  }

  return undefined;
}; */

const buildGridUpdatePayload = (formData: BotFormData): GridUpdatePayload => {
  /* const payload: Record<string, unknown> = {};

  const name = sanitizeString(formData.name) ?? 'Grid Bot';
  payload['name'] = name;

  const exchangeUUID = sanitizeString(formData.exchangeUUID);
  setIfDefined(payload, 'exchangeUUID', exchangeUUID);

  const pair = sanitizePair(formData.pair);
  setIfDefined(payload, 'pair', pair);

  const topPrice = parseNumber(formData.grid.topPrice);
  setIfDefined(payload, 'topPrice', topPrice);

  const lowPrice = parseNumber(formData.grid.lowPrice);
  setIfDefined(payload, 'lowPrice', lowPrice);

  const budget = parseNumber(formData.grid.budget);
  setIfDefined(payload, 'budget', budget);

  const levels =
    typeof formData.grid.levels === 'number'
      ? formData.grid.levels
      : parseInteger(formData.grid.levels);
  setIfDefined(
    payload,
    'levels',
    typeof levels === 'number' && Number.isFinite(levels) ? levels : undefined
  );

  const gridStep = resolveGridStepDecimal(formData);
  setIfDefined(payload, 'gridStep', gridStep);

  const sellDisplacement = parsePercentDecimal(
    formData.grid.sellDisplacement,
    6
  );
  setIfDefined(payload, 'sellDisplacement', sellDisplacement);

  payload['gridType'] = formData.grid.gridType ?? 'geometric';

  payload['useOrderInAdvance'] = Boolean(formData.grid.useOrderInAdvance);
  const ordersInAdvance = parseInteger(formData.grid.ordersInAdvance);
  setIfDefined(payload, 'ordersInAdvance', ordersInAdvance);

  payload['tpSl'] = Boolean(formData.grid.tpSl);
  payload['tpSlCondition'] = formData.grid.tpSlCondition ?? 'valueChanged';
  payload['tpSlAction'] = formData.grid.tpSlAction ?? 'stop';
  payload['tpSlLimit'] = Boolean(formData.grid.tpSlLimit);

  const tpPerc = parsePercentDecimal(formData.grid.tpPerc, 6);
  setIfDefined(payload, 'tpPerc', tpPerc);

  const tpTopPrice = parseNumber(formData.grid.tpTopPrice);
  setIfDefined(payload, 'tpTopPrice', tpTopPrice);

  payload['sl'] = Boolean(formData.grid.sl);
  payload['slCondition'] = formData.grid.slCondition ?? 'valueChanged';
  payload['slAction'] = formData.grid.slAction ?? 'stop';
  payload['slLimit'] = Boolean(formData.grid.slLimit);

  const slPerc = parsePercentDecimal(formData.grid.slPerc, 6);
  setIfDefined(payload, 'slPerc', slPerc);

  const slLowPrice = parseNumber(formData.grid.slLowPrice);
  setIfDefined(payload, 'slLowPrice', slLowPrice);

  payload['useStartPrice'] = Boolean(formData.grid.useStartPrice);
  const startPrice = parseNumber(formData.grid.startPrice);
  if (payload['useStartPrice'] && typeof startPrice === 'number') {
    payload['startPrice'] = startPrice;
  }

  const profitCurrency = sanitizeString(formData.grid.profitCurrency);
  setIfDefined(payload, 'profitCurrency', profitCurrency);

  const orderFixedIn = sanitizeString(formData.grid.orderFixedIn);
  setIfDefined(payload, 'orderFixedIn', orderFixedIn);

  const strategy = sanitizeString(formData.grid.strategy);
  setIfDefined(payload, 'strategy', strategy);

  payload['futures'] = Boolean(formData.grid.futures);
  payload['coinm'] = Boolean(formData.grid.coinm);

  const leverage = parseNumber(formData.grid.leverage);
  if (payload['futures'] && typeof leverage === 'number') {
    payload['leverage'] = leverage;
  }

  const marginType = sanitizeString(formData.grid.marginType);
  setIfDefined(payload, 'marginType', marginType);

  const futuresStrategy = sanitizeString(formData.grid.futuresStrategy);
  setIfDefined(payload, 'futuresStrategy', futuresStrategy);

  payload['useTp'] = Boolean(formData.grid.tpSl);
  payload['useSl'] = Boolean(formData.grid.sl);
  payload['useSmartOrders'] = Boolean(formData.grid.useOrderInAdvance);

  const initialPrice = parseNumber(formData.initialPrice);
  setIfDefined(payload, 'initialPrice', initialPrice);

  const initialPriceFrom = sanitizeString(formData.initialPriceFrom);
  setIfDefined(payload, 'initialPriceFrom', initialPriceFrom);

  if (typeof formData.grid.updatedBudget === 'boolean') {
    payload['updatedBudget'] = formData.grid.updatedBudget;
  }

  if (typeof formData.grid.newProfit === 'boolean') {
    payload['newProfit'] = formData.grid.newProfit;
  }

  payload['type'] = 'grid';
  payload['useDca'] = false;

  return payload; */

  // The GridRangeSettings NumberInput stores its value as a string (e.g.
  // gridStep = "0.5") even though the BotFormData type declares these
  // as numbers. The GraphQL schema declares the matching settings
  // fields as Float, so spreading the form values straight through
  // fails the mutation with
  // `Float cannot represent non numeric value: "0.5"`. Coerce every
  // numeric grid field at the boundary instead of trying to keep the
  // form state honest — the inputs are wired in too many places.
  // `parseGridNumber` is the validator's reader too, so a decimal comma is
  // saved as typed instead of falling through to the `?? 0` defaults below.
  const num = (v: unknown): number | undefined => {
    const n = parseGridNumber(v);
    return n !== undefined && Number.isFinite(n) ? n : undefined;
  };
  // Backend stores these as decimals (0.5% → 0.005). The load mapper
  // multiplies them back by 100 in `map-grid-bot-settings-to-form-data`
  // (`formatPercentFromDecimal`), so the form input value has to be
  // divided here or we'd round-trip 0.5 → 50 after reload. `gridStep`,
  // `sellDisplacement`, `tpPerc`, `slPerc` all follow the same
  // convention.
  const pct = (v: unknown, precision = 6): number | undefined => {
    const n = num(v);
    if (n === undefined) return undefined;
    const factor = 10 ** precision;
    return Math.round((n / 100) * factor) / factor;
  };
  // GraphQL `changeBotInput` (see `app/core/src/graphql/schema.ts` ~5225)
  // doesn't accept every field we keep on the form. Spread the form
  // grid, then drop fields the backend rejects:
  //   - `strategy` — schema actually has a typo'd `strategu` field for
  //     spot grid strategy; sending `strategy` errors with
  //     `Field "strategy" is not defined by type "changeBotInput".`
  //     Strategy can't be changed for an existing grid bot anyway,
  //     so the safest move is to omit it from updates.
  //   - `updatedBudget` / `newProfit` — frontend-only UX flags.
  const grid = formData.grid;
  const {
    strategy: _strategy,
    updatedBudget: _updatedBudget,
    newProfit: _newProfit,
    ...gridForUpdate
  } = grid;
  void _strategy;
  void _updatedBudget;
  void _newProfit;
  return {
    ...gridForUpdate,
    topPrice: num(grid.topPrice) ?? 0,
    lowPrice: num(grid.lowPrice) ?? 0,
    budget: num(grid.budget) ?? 0,
    levels: num(grid.levels) ?? 0,
    gridStep: pct(grid.gridStep, 6) ?? 0,
    sellDisplacement: pct(grid.sellDisplacement, 6) ?? 0,
    ordersInAdvance: num(grid.ordersInAdvance) ?? 0,
    leverage: num(grid.leverage) ?? 1,
    tpPerc: pct(grid.tpPerc, 6) ?? 0,
    slPerc: pct(grid.slPerc, 6) ?? 0,
    tpTopPrice: num(grid.tpTopPrice) ?? 0,
    slLowPrice: num(grid.slLowPrice) ?? 0,
    name: formData.name?.trim() || 'Grid Bot',
  };
};

const buildGridCreatePayload = (
  formData: BotFormData,
  updatePayload: GridUpdatePayload,
  exchange?: ExchangeInUser | undefined | null
): CreateGridBotPayload => {
  const pair = sanitizePair(formData.pair) ?? '';
  const exchangeUUID = sanitizeString(formData.exchangeUUID) ?? '';

  const { baseAsset = '', quoteAsset = '' } = splitPairSymbols(pair);
  const { updatedBudget: _updatedBudget, ...rest } = updatePayload;
  // `createBotInput` (schema ~4210) accepts `strategy` and `newProfit`,
  // unlike `changeBotInput`. `buildGridUpdatePayload` strips them so the
  // edit path validates; re-add them here from the form so create still
  // sets the bot's strategy and new-profit mode.
  return {
    ...rest,
    name: (updatePayload['name'] as string | undefined) ?? 'Grid Bot',
    pair: formData.pairMetadata[pair]?.pair || pair,
    exchangeUUID,
    baseAsset,
    quoteAsset,
    prioritize: 'level',
    exchange: exchange?.provider ?? ExchangeEnum.binance,
    strategy: formData.grid.strategy ?? StrategyEnum.long,
    newProfit: formData.grid.newProfit ?? true,
  };
};

export const mapGridFormDataToPayload = (
  formData: BotFormData,
  options: MapFormDataToPayloadOptions = {},
  _vars?: BotVars | undefined | null,
  exchange?: ExchangeInUser | undefined | null
): MapGridFormDataToPayloadResult => {
  const validation = validateGridFormData(formData);
  const validationErrors = Object.values(validation.errors ?? {});

  const baseMapping: GridFieldMappingResult = {
    success: validationErrors.length === 0,
    errors: validationErrors,
    warnings: [],
    debugInfo: {
      category: 'Grid Mapping',
      fieldsProcessed: [],
      fieldsMapped: [],
      fieldsSkipped: [],
    },
  };

  if (validationErrors.length > 0) {
    return {
      success: false,
      errors: validationErrors,
      mappingResult: baseMapping,
    };
  }

  const updatePayload = buildGridUpdatePayload(formData);

  const mappingResult: GridFieldMappingResult = {
    success: true,
    data: updatePayload,
    errors: [],
    warnings: [],
    debugInfo: {
      category: 'Grid Mapping',
      //@ts-expect-error --- Object.keys is valid here
      fieldsProcessed: Object.keys(updatePayload),
      //@ts-expect-error --- Object.keys is valid here
      fieldsMapped: Object.keys(updatePayload),
      fieldsSkipped: [],
    },
  };

  let createPayload: CreateGridBotPayload | undefined;
  if ((options.mode ?? 'edit') === 'create') {
    createPayload = buildGridCreatePayload(formData, updatePayload, exchange);
  }

  const result: MapGridFormDataToPayloadResult = {
    success: true,
    updatePayload,
    mappingResult,
  };

  /* if (warnings.length > 0) {
    result.warnings = warnings;
  } */

  if (createPayload) {
    result.createPayload = createPayload as unknown as CreateGridBotPayload;
  }

  return result;
};
