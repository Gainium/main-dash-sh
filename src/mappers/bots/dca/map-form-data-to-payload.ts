import type { BotFormMode } from '@/features/bots';
import {
  BotTypesEnum,
  DCATypeEnum,
  ExchangeEnum,
  IndicatorAction,
  StartConditionEnum,
  type Bot,
  type BotVars,
  type DCABot,
  type DCABotSettings,
  type ExchangeInUser,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import {
  mapFormDataToBackend,
  type FieldMappingResult,
  type GridFieldMappingResult,
} from './field-mapping';

export interface MapFormDataToPayloadOptions {
  mode?: BotFormMode;
  debug?: boolean;
}

export interface MapFormDataToPayloadResult {
  success: boolean;
  createPayload?: CreateDCABotPayload;
  updatePayload?: UpdateDCABotPayload;
  errors?: string[];
  warnings?: string[];
  mappingResult?: FieldMappingResult;
}

export interface MapGridFormDataToPayloadResult {
  success: boolean;
  createPayload?: CreateGridBotPayload;
  updatePayload?: GridUpdatePayload;
  errors?: string[];
  warnings?: string[];
  mappingResult?: GridFieldMappingResult;
}

export type UpdateDCABotPayload = Partial<
  Omit<DCABotSettings, 'ordersCount' | 'activeOrdersCount'> & {
    ordersCount: number | undefined;
    activeOrdersCount: number | undefined;
  }
>;

export type CreateGridBotPayload = Bot['settings'] & {
  baseAsset: string;
  quoteAsset: string;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  vars?: BotVars | null;
};

export type GridUpdatePayload = {
  initialPrice?: number;
  buyType?: string;
  buyCount?: string;
  buyAmount?: number;
  vars?: BotVars | null;
} & Omit<Bot['settings'], 'pair'>;

export type CreateDCABotPayload = Omit<
  DCABot['settings'],
  'ordersCount' | 'activeOrdersCount'
> & {
  pair?: string[];
  baseAsset?: string[];
  quoteAsset: string[];
  ordersCount: number;
  activeOrdersCount: number;
  exchange: ExchangeEnum;
  exchangeUUID: string;
  uuid?: string;
  vars?: BotVars | null;
};

const normalizePairs = (formData: BotFormData): string[] => {
  const fallbackPair = formData.pair?.[0] || 'BTCUSDT';
  const isComboBot = formData.type === BotTypesEnum.combo;
  const useMulti = isComboBot ? formData.combo.useMulti : formData.dca.useMulti;
  if (useMulti) {
    if (Array.isArray(formData.pair) && formData.pair.length > 0) {
      return formData.pair;
    }

    return [fallbackPair];
  }

  if (Array.isArray(formData.pair) && formData.pair.length > 0) {
    return [formData.pair[0]];
  }

  if (typeof fallbackPair === 'string' && fallbackPair.trim()) {
    return [fallbackPair];
  }

  return [];
};

interface PairAssetTuple {
  pair: string;
  baseAsset?: string;
  quoteAsset?: string;
}

const resolvePairAssetTuple = (
  pair: string,
  pairMetadata: BotFormData['pairMetadata']
): PairAssetTuple => {
  // pairMetadata is typed non-optional but can be undefined at runtime when
  // a partially-built formData seed reaches the mapper (e.g. the hedge Quick
  // form's leg seeds). Fall back to an empty map so we degrade to the
  // pair-string split below instead of throwing.
  const metaMap = pairMetadata ?? {};
  const directMeta = metaMap[pair];

  const fallbackMeta =
    directMeta ??
    Object.values(metaMap).find((meta) => {
      if (!meta || typeof meta !== 'object') {
        return false;
      }

      const metaPair =
        typeof meta.pair === 'string' && meta.pair.trim().length > 0
          ? meta.pair.trim()
          : undefined;
      if (metaPair && metaPair === pair) {
        return true;
      }

      const base = meta.baseAsset?.name;
      const quote = meta.quoteAsset?.name;
      if (typeof base === 'string' && typeof quote === 'string') {
        return `${base}/${quote}` === pair;
      }

      return false;
    });

  if (fallbackMeta) {
    const baseAsset =
      typeof fallbackMeta.baseAsset?.name === 'string'
        ? fallbackMeta.baseAsset.name
        : undefined;
    const quoteAsset =
      typeof fallbackMeta.quoteAsset?.name === 'string'
        ? fallbackMeta.quoteAsset.name
        : undefined;

    return {
      pair:
        typeof fallbackMeta.pair === 'string' && fallbackMeta.pair.trim().length
          ? fallbackMeta.pair
          : pair,
      baseAsset,
      quoteAsset,
    };
  }

  const normalized = pair.trim();
  const pairSegments = normalized.split(/[/:_-]/).filter(Boolean);
  if (pairSegments.length === 2) {
    const [baseAsset, quoteAsset] = pairSegments;
    return {
      pair: normalized,
      baseAsset,
      quoteAsset,
    };
  }

  return { pair: normalized || pair };
};

const buildCreatePayload = (
  formData: BotFormData,
  exchange?: ExchangeInUser | undefined | null
): CreateDCABotPayload | null => {
  if (!exchange) {
    return null;
  }
  const pairs = normalizePairs(formData);
  const isComboBot = formData.type === BotTypesEnum.combo;
  //TODO: remove when backend will be updated
  // avgPrice is a deal-edit-only breakeven override; createDCABotInput has no
  // such field, so strip it (like useExperimental) before building the payload.
  const {
    useExperimental: _useExperimental,
    avgPrice: _avgPrice,
    ...rest
  } = isComboBot ? formData.combo : formData.dca;

  const pairAssetTuples = pairs.map((pair) =>
    resolvePairAssetTuple(pair, formData.pairMetadata)
  );

  const ordersCount = isComboBot
    ? formData.combo.ordersCount
    : formData.dca.ordersCount;
  const activeOrdersCount = isComboBot
    ? formData.combo.activeOrdersCount
    : formData.dca.activeOrdersCount;
  const maxNumberOfOpenDeals = isComboBot
    ? formData.combo.maxNumberOfOpenDeals
    : formData.dca.maxNumberOfOpenDeals;
  const maxDealsPerPair = isComboBot
    ? formData.combo.maxDealsPerPair
    : formData.dca.maxDealsPerPair;
  const payload: CreateDCABotPayload = {
    ...rest,
    name: formData.name?.trim() || `Bot ${new Date().toISOString()}`,
    pair: pairAssetTuples.map((tuple) => tuple.pair),
    exchange: exchange.provider,
    exchangeUUID: exchange.uuid,
    quoteAsset: [
      ...new Set(
        pairAssetTuples
          .map((tuple) => tuple.quoteAsset)
          .filter(
            (quoteAsset): quoteAsset is string =>
              typeof quoteAsset === 'string' && quoteAsset.trim().length > 0
          )
      ),
    ],
    baseAsset: [
      ...new Set(
        pairAssetTuples
          .map((tuple) => tuple.baseAsset)
          .filter(
            (baseAsset): baseAsset is string =>
              typeof baseAsset === 'string' && baseAsset.trim().length > 0
          )
      ),
    ],
    ordersCount: +ordersCount || 0,
    activeOrdersCount: +activeOrdersCount || 0,
  };

  const resolveIntegerValue = (value: unknown): number | null => {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        return Math.trunc(value);
      }
      return null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isNaN(parsed)) {
        return null;
      }

      return parsed;
    }

    return null;
  };

  const resolvedMaxDeals = resolveIntegerValue(maxNumberOfOpenDeals);
  if (resolvedMaxDeals !== null) {
    payload.maxNumberOfOpenDeals = String(resolvedMaxDeals);
  }

  const resolvedMaxDealsPerPair = resolveIntegerValue(maxDealsPerPair);
  if (resolvedMaxDealsPerPair !== null) {
    payload.maxDealsPerPair = String(resolvedMaxDealsPerPair);
  }

  return payload;
};

const mergeCreatePayload = (
  basePayload: CreateDCABotPayload | null,
  mappedSettings: DCABotSettings | undefined
): CreateDCABotPayload | null => {
  if (!basePayload) {
    return null;
  }
  if (!mappedSettings) {
    return basePayload;
  }

  const normalizedSettings: DCABotSettings = { ...mappedSettings };

  if ('pair' in normalizedSettings) {
    const mappedPair = normalizedSettings['pair'];

    if (Array.isArray(mappedPair)) {
      const sanitizedPairs = mappedPair.filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0
      );
      if (sanitizedPairs.length > 0) {
        normalizedSettings['pair'] = sanitizedPairs;
      }
    }
  }

  const merged: CreateDCABotPayload = {
    ...basePayload,
    ...normalizedSettings,
    ordersCount: basePayload.ordersCount,
    activeOrdersCount: basePayload.activeOrdersCount,
  } as CreateDCABotPayload;

  const apiSafeMerged = sanitizeSettingsForApi(
    merged as unknown as DCABotSettings
  ) as unknown as CreateDCABotPayload;

  //TODO: remove when backend will be updated
  // avgPrice (deal-edit-only breakeven override) is re-introduced here via the
  // DCA_FORM_DEFAULTS spread in mapFormDataToBackend; createDCABotInput has no
  // such field, so strip it alongside useExperimental.
  const {
    useExperimental: _useExperimental,
    avgPrice: _avgPrice,
    ...rest
  } = apiSafeMerged as CreateDCABotPayload & {
    useExperimental?: boolean;
    avgPrice?: number;
  };

  return rest;
};

const aggregateWarnings = (
  ...warningArrays: Array<string[] | undefined>
): string[] | undefined => {
  const collected = warningArrays
    .filter((arr): arr is string[] => Array.isArray(arr) && arr.length > 0)
    .flat();

  return collected.length > 0 ? collected : undefined;
};

const sanitizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map((item) => sanitizeValue(item))
      .filter((item): item is unknown => item !== undefined);

    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      const sanitized = sanitizeValue(nestedValue);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  return value;
};

type MultiTargetApiShape = {
  uuid?: string;
  target?: string;
  amount?: string;
  fixed?: string;
};

const sanitizeMultiTargetForApi = (
  target: unknown
): MultiTargetApiShape | undefined => {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return undefined;
  }

  const rawTarget = target as Record<string, unknown>;
  const uuidRaw = rawTarget['uuid'] ?? rawTarget['id'];
  const targetRaw = rawTarget['target'] ?? rawTarget['percentage'];
  const amountRaw = rawTarget['amount'];
  const fixedRaw = rawTarget['fixed'];

  const uuid =
    typeof uuidRaw === 'string' && uuidRaw.trim().length > 0
      ? uuidRaw.trim()
      : undefined;
  const tpTarget =
    typeof targetRaw === 'string' && targetRaw.trim().length > 0
      ? targetRaw.trim()
      : undefined;
  const amount =
    typeof amountRaw === 'string' && amountRaw.trim().length > 0
      ? amountRaw.trim()
      : undefined;
  const fixed =
    typeof fixedRaw === 'string' && fixedRaw.trim().length > 0
      ? fixedRaw.trim()
      : undefined;

  if (!uuid || !tpTarget || !amount) {
    return undefined;
  }

  const sanitized: MultiTargetApiShape = {
    uuid,
    target: tpTarget,
    amount,
  };

  if (fixed) {
    sanitized.fixed = fixed;
  }

  return sanitized;
};

const sanitizeMultiTargetsForApi = (
  value: unknown
): MultiTargetApiShape[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sanitized = value
    .map((entry) => sanitizeMultiTargetForApi(entry))
    .filter(
      (entry): entry is MultiTargetApiShape =>
        !!entry &&
        typeof entry.uuid === 'string' &&
        typeof entry.target === 'string' &&
        typeof entry.amount === 'string'
    );

  return sanitized.length > 0 ? sanitized : undefined;
};

const sanitizeSettingsForApi = (settings: DCABotSettings): DCABotSettings => {
  const sanitizedSettings = { ...settings } as Record<string, unknown>;

  if (!sanitizedSettings['useMultiTp']) {
    delete sanitizedSettings['multiTp'];
  }

  if (!sanitizedSettings['useMultiSl']) {
    delete sanitizedSettings['multiSl'];
  }

  if ('multiTp' in sanitizedSettings) {
    const multiTp = sanitizeMultiTargetsForApi(sanitizedSettings['multiTp']);
    if (multiTp) {
      sanitizedSettings['multiTp'] = multiTp;
    } else {
      delete sanitizedSettings['multiTp'];
    }
  }

  if ('multiSl' in sanitizedSettings) {
    const multiSl = sanitizeMultiTargetsForApi(sanitizedSettings['multiSl']);
    if (multiSl) {
      sanitizedSettings['multiSl'] = multiSl;
    } else {
      delete sanitizedSettings['multiSl'];
    }
  }

  return sanitizedSettings as unknown as DCABotSettings;
};

export const sanitizeUpdateSettings = (
  settings: DCABotSettings
): DCABotSettings => {
  const sanitized = sanitizeValue(settings);
  return (
    sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
      ? sanitized
      : {}
  ) as DCABotSettings;
};

export const mapFormDataToPayload = (
  formData: BotFormData,
  options: MapFormDataToPayloadOptions = {},
  vars?: BotVars | undefined | null,
  exchange?: ExchangeInUser | undefined | null
): MapFormDataToPayloadResult => {
  const { debug, mode = 'edit' } = options;

  const mappingResult = mapFormDataToBackend(formData, vars);
  const errors = [...(mappingResult.errors ?? [])];

  const createPairs = normalizePairs(formData);
  if (mode === 'create' && createPairs.length === 0) {
    errors.push('At least one trading pair is required to create a bot');
  }

  if (mode === 'create' && !formData.exchangeUUID) {
    errors.push('An exchange selection is required to create a bot');
  }
  const isComboBot = formData.type === BotTypesEnum.combo;
  const startCondition = isComboBot
    ? formData.combo.startCondition
    : formData.dca.startCondition;
  const indicators = isComboBot
    ? formData.combo.indicators
    : formData.dca.indicators;

  if (
    startCondition === StartConditionEnum.ti &&
    indicators.filter((i) => i.indicatorAction === IndicatorAction.startDeal)
      .length === 0
  ) {
    errors.push(
      'At least one start indicator is required when start condition is set to technical indicators'
    );
  }

  if (errors.length > 0) {
    if (debug) {
      console.warn('[mapFormDataToPayload] Validation failed', { errors });
    }

    const failureResult: MapFormDataToPayloadResult = {
      success: false,
      errors,
      mappingResult,
    };

    const warnings = aggregateWarnings(mappingResult.warnings);
    if (warnings) {
      failureResult.warnings = warnings;
    }

    return failureResult;
  }

  //TODO: remove when backend will be updated
  // avgPrice is a deal-edit-only breakeven override seeded into the form
  // defaults; it rides the DCA_FORM_DEFAULTS spread into mappingResult.data but
  // change{DCA,Combo}BotInput has no such field, so strip it (like the create
  // path does) before building the update payload. useExperimental is stripped
  // alongside for the same reason.
  const {
    avgPrice: _avgPrice,
    useExperimental: _useExperimental,
    ...updatePayload
  } = (mappingResult.data ?? {}) as DCABotSettings & {
    avgPrice?: number;
    useExperimental?: boolean;
  };

  const sanitizedUpdatePayload = sanitizeSettingsForApi(
    sanitizeUpdateSettings(updatePayload)
  );

  const createPayload =
    mode === 'create'
      ? mergeCreatePayload(
          buildCreatePayload(formData, exchange),
          sanitizedUpdatePayload
        )
      : undefined;
  if (
    mode === 'create' &&
    createPayload &&
    (!Array.isArray(createPayload.quoteAsset) ||
      createPayload.quoteAsset.length === 0)
  ) {
    errors.push('Unable to resolve quote asset for the selected trading pair.');
  }

  if (
    mode === 'create' &&
    createPayload &&
    (!Array.isArray(createPayload.baseAsset) ||
      createPayload.baseAsset.length === 0)
  ) {
    errors.push('Unable to resolve base asset for the selected trading pair.');
  }

  if (errors.length > 0) {
    if (debug) {
      console.warn('[mapFormDataToPayload] Validation failed', { errors });
    }

    return {
      success: false,
      errors,
      mappingResult,
    };
  }

  if (formData.terminal && mode === 'create' && createPayload) {
    createPayload.type = DCATypeEnum.terminal;
  }

  if (debug) {
    console.log('[mapFormDataToPayload] Mapping successful', {
      mode,
      updatePayload: sanitizedUpdatePayload,
      createPayload,
      warnings: mappingResult.warnings,
    });
  }

  const successResult: MapFormDataToPayloadResult = {
    success: true,
    updatePayload: {
      ...sanitizedUpdatePayload,
      ordersCount: sanitizedUpdatePayload.ordersCount
        ? +sanitizedUpdatePayload.ordersCount
        : undefined,
      activeOrdersCount: sanitizedUpdatePayload.activeOrdersCount
        ? +sanitizedUpdatePayload.activeOrdersCount
        : undefined,
    },
    mappingResult,
  };

  if (createPayload) {
    if (isComboBot) {
      delete createPayload.importFrom;
    }
    successResult.createPayload = createPayload;
  }

  /* const warnings = aggregateWarnings(mappingResult.warnings);
  if (warnings) {
    successResult.warnings = warnings;
  } */

  return successResult;
};
