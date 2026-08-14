import type { BotFormData } from '@/types/bots/form';
import { normalizeMultiTpTargets } from '@/utils/bots/dca/take-profit';
import {
  BaseSlOnEnum,
  BotMarginTypeEnum,
  BotStartTypeEnum,
  BotTypesEnum,
  CloseConditionEnum,
  CloseDCATypeEnum,
  ComboTpBase,
  DCAConditionEnum,
  CooldownOptionsEnum,
  CooldownUnits,
  DCATypeEnum,
  DcaVolumeRequiredChangeRef,
  DCAVolumeType,
  DynamicPriceFilterDirectionEnum,
  DynamicPriceFilterPriceTypeEnum,
  FuturesStrategyEnum,
  IndicatorEnum,
  IndicatorsLogicEnum,
  IndicatorStartConditionEnum,
  InitialPriceFromEnum,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  PairPrioritizationEnum,
  RiskSlTypeEnum,
  RRSlTypeEnum,
  ScaleDcaTypeEnum,
  StartConditionEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
  VolumeValueEnum,
  type BotSettings,
  type BotStatus,
  type Currency,
  type DCABot,
  type DCABotSettings,
  type DCACustom,
  type GridType,
  type MultiTP,
  type Prioritze,
  type TpSlAction,
  type TpSlCondition,
} from '@/types';
import type { IndicatorConfig, IndicatorGroup } from '@/types/indicators';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';

export interface MapBotSettingsToFormDataOptions {
  bot?: DCABot | null;
  debug?: boolean;
}

export interface MapBotSettingsToFormDataResult {
  formData: BotFormData;
}

const logDebug = (debug: boolean | undefined, ...args: unknown[]) => {
  if (debug) {
    console.log(...args);
  }
};

export const mapBotSettingsToFormData = (
  type: BotTypesEnum,
  settingsInput: unknown,
  options: MapBotSettingsToFormDataOptions = {}
): MapBotSettingsToFormDataResult => {
  const { bot, debug } = options;

  const settings = settingsInput ?? bot?.settings;
  const botSettingsRecord = bot?.settings
    ? (bot.settings as unknown as Record<string, unknown>)
    : undefined;

  if (!settings) {
    logDebug(
      debug,
      '[mapBotSettingsToFormData] No settings provided, returning defaults'
    );
    throw new Error('Bot settings unavailable');
  }

  const settingsWrapper = settings as {
    settings?: Record<string, unknown>;
    exchangeUUID?: unknown;
  };
  const resolved = (settingsWrapper.settings ?? settingsWrapper) as Record<
    string,
    unknown
  >;
  const exchangeUuidFromWrapperRaw =
    typeof settingsWrapper.exchangeUUID === 'string'
      ? settingsWrapper.exchangeUUID
      : '';
  const exchangeUuidFromWrapper = exchangeUuidFromWrapperRaw.trim();

  logDebug(
    debug,
    '[mapBotSettingsToFormData] Resolved settings keys:',
    Object.keys(resolved ?? {})
  );

  const getValue = <T = unknown>(
    key: keyof (DCABotSettings & {
      exchangeUUID: string;
      favoriteIndicators: IndicatorEnum[];
    }),
    fallback: T
  ): T => {
    const value =
      resolved && typeof resolved === 'object' && key in resolved
        ? (resolved[key] as T)
        : fallback;
    logDebug(debug, `[mapBotSettingsToFormData] Field "${key}"`, {
      value,
      fallback,
    });
    return value;
  };

  const getValueGrid = <T = unknown>(
    key: keyof (BotSettings & {
      exchangeUUID: string;
      initialPrice?: string;
      initialPriceFrom?: InitialPriceFromEnum;
    }),
    fallback: T
  ): T => {
    const value =
      resolved && typeof resolved === 'object' && key in resolved
        ? (resolved[key] as T)
        : fallback;
    logDebug(debug, `[mapBotSettingsToFormData] Field "${key}"`, {
      value,
      fallback,
    });
    return value;
  };

  const getString = (
    key: keyof (DCABotSettings & { exchangeUUID: string }),
    fallback = ''
  ): string => {
    const value = getValue<unknown>(key, fallback);
    return typeof value === 'string' ? value : fallback;
  };

  const getStringGrid = (
    key: keyof (BotSettings & { exchangeUUID: string; initialPrice?: string }),
    fallback = ''
  ): string => {
    const value = getValueGrid<unknown>(key, fallback);
    return typeof value === 'string' ? value : fallback;
  };

  const getNumber = (key: keyof DCABotSettings, fallback = 0): number => {
    const value = getValue<unknown>(key, fallback);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
  };

  const getNumberGrid = (key: keyof BotSettings, fallback = 0): number => {
    const value = getValueGrid<unknown>(key, fallback);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
  };

  const getBoolean = (key: keyof DCABotSettings, fallback = false): boolean => {
    const value = getValue<unknown>(key, fallback);
    return typeof value === 'boolean' ? value : fallback;
  };

  const getBooleanGrid = (
    key: keyof BotSettings,
    fallback = false
  ): boolean => {
    const value = getValueGrid<unknown>(key, fallback);
    return typeof value === 'boolean' ? value : fallback;
  };

  const parseVolumePreset = (
    value: unknown,
    fallback: VolumeValueEnum = VolumeValueEnum.top100
  ): VolumeValueEnum => {
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (
        normalized === VolumeValueEnum.top25 ||
        normalized === VolumeValueEnum.top100 ||
        normalized === VolumeValueEnum.top200 ||
        normalized === VolumeValueEnum.custom
      ) {
        return normalized as VolumeValueEnum;
      }
    }
    return fallback;
  };

  const parseCooldownUnits = (
    value: unknown,
    fallback: CooldownUnits = CooldownUnits.seconds
  ): CooldownUnits => {
    return Object.values(CooldownUnits).includes(value as CooldownUnits)
      ? (value as CooldownUnits)
      : fallback;
  };

  const parseCooldownScope = (
    value: unknown,
    fallback: CooldownOptionsEnum = CooldownOptionsEnum.bot
  ): CooldownOptionsEnum => {
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (normalized === 'symbol') {
        return CooldownOptionsEnum.symbol;
      }
      if (normalized === 'bot') {
        return CooldownOptionsEnum.bot;
      }
    }
    return fallback;
  };

  const extractCooldownInterval = (value: unknown): string | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.max(0, Math.trunc(value)));
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      const parsed = parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        return String(Math.max(0, parsed));
      }
    }
    return undefined;
  };

  const determineCooldownToggle = (
    interval: string,
    ...candidates: unknown[]
  ): boolean => {
    for (const candidate of candidates) {
      if (typeof candidate === 'boolean') {
        return candidate;
      }
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate > 0;
      }
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (!trimmed) {
          continue;
        }
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed)) {
          return parsed > 0;
        }
      }
    }

    const parsedInterval = Number(interval);
    return Number.isFinite(parsedInterval) && parsedInterval > 0;
  };

  const getStringOrNumberAsString = (
    key: keyof DCABotSettings,
    fallback = ''
  ): string => {
    const value = getValue<unknown>(key, fallback);
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return fallback;
  };

  const sanitizePairs = (pairs: unknown[]): string[] =>
    pairs
      .map((pair) =>
        typeof pair === 'string'
          ? pair.trim()
          : typeof pair === 'number'
            ? String(pair)
            : String(pair ?? '').trim()
      )
      .filter((pair) => pair.length > 0);

  const pairsFromSettings = (() => {
    const pairsField = getValue<unknown>('pair', []);
    if (Array.isArray(pairsField) && pairsField.length > 0) {
      const sanitized = sanitizePairs(pairsField);
      if (sanitized.length > 0) {
        return sanitized;
      }
    }

    const pairField = getValue<unknown>('pair', []);
    if (Array.isArray(pairField) && pairField.length > 0) {
      const sanitized = sanitizePairs(pairField);
      if (sanitized.length > 0) {
        return sanitized;
      }
    }

    if (typeof pairField === 'string' && pairField.trim().length > 0) {
      return [pairField.trim()];
    }

    const botPair = botSettingsRecord?.['pair'];
    if (typeof botPair === 'string' && botPair.trim().length > 0) {
      return [botPair.trim()];
    }

    return [];
  })();

  const useMulti = (() => {
    const explicit = getValue<unknown>('useMulti', undefined);
    if (typeof explicit === 'boolean') {
      return explicit;
    }

    if (pairsFromSettings.length > 1) {
      return true;
    }

    return false;
  })();

  const exchangeUuidCandidates = [
    getString('exchangeUUID'),
    exchangeUuidFromWrapper,
    typeof bot?.exchangeUUID === 'string' ? bot.exchangeUUID.trim() : '',
  ];

  const resolvedExchangeUuid = exchangeUuidCandidates.find(
    (value) => value && value.trim().length > 0
  );

  const exchangeValue = resolvedExchangeUuid ? resolvedExchangeUuid.trim() : '';

  const legacyCooldownUnit = parseCooldownUnits(
    getValue('cooldownAfterDealStartUnits', 'seconds'),
    CooldownUnits.seconds
  );
  const cooldownStartInterval =
    extractCooldownInterval(
      getValue('cooldownAfterDealStartInterval', undefined)
    ) ??
    extractCooldownInterval(getValue('cooldownAfterDealStart', undefined)) ??
    '1';
  const cooldownStopInterval =
    extractCooldownInterval(
      getValue('cooldownAfterDealStopInterval', undefined)
    ) ??
    extractCooldownInterval(
      getValue('cooldownAfterDealStopInterval', undefined)
    ) ??
    extractCooldownInterval(getValue('cooldownAfterDealStop', undefined)) ??
    '1';

  const cooldownStartUnits = parseCooldownUnits(
    getValue('cooldownAfterDealStartUnits', legacyCooldownUnit),
    legacyCooldownUnit
  );
  const cooldownStopUnits = parseCooldownUnits(
    getValue(
      'cooldownAfterDealStopUnits',
      getValue('cooldownAfterDealStopUnits', legacyCooldownUnit)
    ),
    legacyCooldownUnit
  );

  const cooldownStartOption = parseCooldownScope(
    getValue('cooldownAfterDealStartOption', undefined),
    CooldownOptionsEnum.bot
  );
  const cooldownStopOption = parseCooldownScope(
    getValue(
      'cooldownAfterDealStopOption',
      getValue('cooldownAfterDealStopOption', undefined)
    ),
    CooldownOptionsEnum.bot
  );

  const cooldownAfterDealStart = determineCooldownToggle(
    cooldownStartInterval,
    getValue('cooldownAfterDealStart', undefined),
    getValue('cooldownAfterDealStart', undefined)
  );
  const cooldownAfterDealStop = determineCooldownToggle(
    cooldownStopInterval,
    getValue('cooldownAfterDealStop', undefined),
    getValue('cooldownAfterDealStop', undefined)
  );

  const normalizeStartCondition = (value: string): StartConditionEnum => {
    const validValues = Object.values(StartConditionEnum) as string[];
    if (validValues.includes(value)) {
      return value as StartConditionEnum;
    }

    switch (value.toLowerCase()) {
      case 'timer':
        return StartConditionEnum.timer;
      case 'manual':
        return StartConditionEnum.manual;
      case 'tradingviewsignals':
      case 'webhook':
        return StartConditionEnum.tradingviewSignals;
      case 'technicalindicators':
      case 'indicators':
        return StartConditionEnum.ti;
      default:
        return StartConditionEnum.asap;
    }
  };

  const normalizeHodlAt = (raw: unknown): string => {
    if (typeof raw !== 'string') {
      return '00:00';
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return '00:00';
    }
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const ampm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
    if (ampm) {
      let hour = parseInt(ampm[1], 10);
      const minute = ampm[2];
      const period = ampm[3].toUpperCase();
      if (period === 'PM' && hour < 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
      return `${String(hour).padStart(2, '0')}:${minute}`;
    }
    const hms = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hms) {
      return `${String(parseInt(hms[1], 10)).padStart(2, '0')}:${hms[2]}`;
    }
    return '00:00';
  };

  const normalizeNextBuy = (raw: unknown): number => {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        return Number.NaN;
      }
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
      const parsed = new Date(trimmed).getTime();
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return Number.NaN;
  };

  const parseOptionalNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  };

  const resolveEnterMarketTimeoutSeconds = () => {
    const rawLimitTimeout = parseOptionalNumber(resolved?.['limitTimeout']);
    const rawLegacyTimeoutMinutes = parseOptionalNumber(
      resolved?.['enterMarketTimeout']
    );
    const rawUseLimitTimeout = resolved?.['useLimitTimeout'];

    let normalizedSeconds = rawLimitTimeout;

    if (normalizedSeconds === null && rawLegacyTimeoutMinutes !== null) {
      normalizedSeconds = rawLegacyTimeoutMinutes * 60;
    }

    if (normalizedSeconds !== null) {
      normalizedSeconds = Math.max(0, Math.trunc(normalizedSeconds));
    }

    const isEnabled =
      typeof rawUseLimitTimeout === 'boolean'
        ? rawUseLimitTimeout
        : Boolean(normalizedSeconds && normalizedSeconds > 0);

    if (!isEnabled || normalizedSeconds === null || normalizedSeconds <= 0) {
      return { seconds: '0', enabled: false } as const;
    }

    const boundedSeconds = Math.min(normalizedSeconds, 600);

    return {
      seconds: String(boundedSeconds),
      enabled: true,
    } as const;
  };

  const { seconds: enterMarketTimeoutSeconds } =
    resolveEnterMarketTimeoutSeconds();

  const normalizeOrderSizeSelection = (
    value: unknown
  ): DCABotSettings['orderSizeType'] | undefined => {
    if (typeof value !== 'string') {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return undefined;
      }
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    const mapping: Record<string, DCABotSettings['orderSizeType']> = {
      base: OrderSizeTypeEnum.base,
      quote: OrderSizeTypeEnum.quote,
      percfree: OrderSizeTypeEnum.percFree,
      perctotal: OrderSizeTypeEnum.percTotal,
      usd: OrderSizeTypeEnum.usd,
    };

    return mapping[normalized];
  };

  const rawCurrencyReference = normalizeOrderSizeSelection(
    resolved?.['currencyReference']
  );
  const rawOrderSizeType = normalizeOrderSizeSelection(
    resolved?.['orderSizeType']
  );
  const resolvedCurrencyReference =
    rawCurrencyReference ?? rawOrderSizeType ?? OrderSizeTypeEnum.quote;
  const resolvedOrderSizeType = rawOrderSizeType ?? resolvedCurrencyReference;

  const clampPercentageString = (value: string, fallback: string): string => {
    const trimmed = value?.trim?.() ?? '';
    if (!trimmed) {
      return fallback;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    const clamped = Math.min(100, Math.max(0, parsed));
    return String(clamped);
  };

  const rawRiskReductionToggle = resolved?.['useRiskReduction'];
  const rawRiskReduction = resolved?.['riskReduction'];
  const riskReductionEnabled =
    typeof rawRiskReductionToggle === 'boolean'
      ? rawRiskReductionToggle
      : (() => {
          if (typeof rawRiskReduction === 'string') {
            const normalized = rawRiskReduction.trim().toLowerCase();
            return normalized === '1' || normalized === 'true';
          }
          if (typeof rawRiskReduction === 'number') {
            return rawRiskReduction > 0;
          }
          return false;
        })();

  const riskReductionValueRaw = getStringOrNumberAsString(
    'riskReductionValue',
    '10'
  );
  const riskReductionValue = clampPercentageString(
    riskReductionValueRaw,
    riskReductionEnabled ? '10' : '0'
  );

  const rawUseReinvest = resolved?.['useReinvest'];
  const rawReinvestProfit = resolved?.['reinvestProfit'];
  const reinvestEnabled =
    typeof rawUseReinvest === 'boolean'
      ? rawUseReinvest
      : typeof rawReinvestProfit === 'boolean'
        ? rawReinvestProfit
        : false;

  const reinvestValue = clampPercentageString(
    getStringOrNumberAsString('reinvestValue', '50'),
    reinvestEnabled ? '50' : '0'
  );

  const riskRewardActive = getBoolean('useRiskReward', false);
  const feeOrder = getBoolean('feeOrder', false);
  const autoRebalancing = getBoolean('autoRebalancing', false);
  const remainderFullAmount = getBoolean('remainderFullAmount', false);
  const adaptiveClose = getBoolean('adaptiveClose', false);

  const rawMultiTpTargets =
    (getValue('multiTp', []) as MultiTP[] | undefined | null) ?? [];
  const normalizedMultiTpTargets = normalizeMultiTpTargets(rawMultiTpTargets);

  const resolvedUseMultipleTpTargets = (() => {
    const legacyMultiTargetsFlag =
      typeof resolved['useMultiTp'] === 'boolean'
        ? (resolved['useMultiTp'] as boolean)
        : undefined;

    if (typeof legacyMultiTargetsFlag === 'boolean') {
      return legacyMultiTargetsFlag;
    }

    return normalizedMultiTpTargets.length > 0;
  })();

  const rawMultiSlTargets =
    (getValue('multiSl', []) as MultiTP[] | null | undefined) ?? [];
  const normalizedMultiSlTargets = riskRewardActive
    ? ([] as MultiTP[])
    : rawMultiSlTargets.filter((target): target is MultiTP => Boolean(target));

  const normalizeIndicatorsLogic = (
    value: unknown,
    fallback: IndicatorsLogicEnum = IndicatorsLogicEnum.and
  ): IndicatorsLogicEnum => {
    if (value === IndicatorsLogicEnum.or) {
      return IndicatorsLogicEnum.or;
    }
    if (value === IndicatorsLogicEnum.and) {
      return IndicatorsLogicEnum.and;
    }
    return fallback;
  };

  const rawIndicatorGroups =
    (getValue('indicatorGroups', []) as IndicatorGroup[] | null | undefined) ??
    [];
  const normalizedIndicatorGroups = rawIndicatorGroups.map((group) => ({
    ...group,
    logic: normalizeIndicatorsLogic(group?.logic),
  }));

  const resolveLogicFromGroups = (
    action: string,
    section?: 'sl'
  ): IndicatorsLogicEnum => {
    const matched = normalizedIndicatorGroups.find((group) => {
      if (group.action !== action) {
        return false;
      }

      if (section === 'sl') {
        return group.section === 'sl';
      }

      return group.section !== 'sl';
    });

    return normalizeIndicatorsLogic(matched?.logic);
  };

  const startDealLogic = normalizeIndicatorsLogic(
    getValue('startDealLogic', undefined),
    resolveLogicFromGroups('startDeal')
  );
  const stopDealLogic = normalizeIndicatorsLogic(
    getValue('stopDealLogic', undefined),
    resolveLogicFromGroups('closeDeal')
  );
  const stopDealSlLogic = normalizeIndicatorsLogic(
    getValue('stopDealSlLogic', undefined),
    resolveLogicFromGroups('closeDeal', 'sl')
  );
  const startBotLogic = normalizeIndicatorsLogic(
    getValue('startBotLogic', undefined),
    resolveLogicFromGroups('startBot')
  );
  const stopBotLogic = normalizeIndicatorsLogic(
    getValue('stopBotLogic', undefined),
    resolveLogicFromGroups('stopBot')
  );

  const dca: BotFormData['dca'] = {
    ...DCA_FORM_DEFAULTS,
    strategy: (() => {
      return getValue<StrategyEnum>('strategy', StrategyEnum.long);
    })(),
    baseOrderSize: getString('baseOrderSize', '0'),
    startOrderType:
      getValue<OrderTypeEnum>('startOrderType', OrderTypeEnum.market) ??
      OrderTypeEnum.market,
    baseOrderPrice: getString('baseOrderPrice', ''),
    useLimitPrice: getBoolean('useLimitPrice', false),
    notUseLimitReposition: getBoolean('notUseLimitReposition', false),
    limitTimeout: enterMarketTimeoutSeconds,
    useRiskReduction: riskReductionEnabled,
    riskReductionValue,
    useReinvest: reinvestEnabled,
    reinvestValue,
    skipBalanceCheck: getBoolean('skipBalanceCheck', false),
    useDca: getBoolean('useDca', true),
    dcaCondition:
      getValue<DCAConditionEnum>('dcaCondition', DCAConditionEnum.percentage) ??
      DCAConditionEnum.percentage,
    scaleDcaType:
      getValue<ScaleDcaTypeEnum>('scaleDcaType', ScaleDcaTypeEnum.percentage) ??
      ScaleDcaTypeEnum.percentage,
    dcaCustom: (getValue('dcaCustom', []) as DCACustom[]) ?? [],
    ordersCount: getValue<string>('ordersCount', '5'),
    activeOrdersCount: getValue<string>('activeOrdersCount', '1'),
    orderSizeType: resolvedOrderSizeType,
    gridLevel: getStringOrNumberAsString('gridLevel', '5'),
    baseGridLevels: getStringOrNumberAsString(
      'baseGridLevels',
      getStringOrNumberAsString('gridLevel', '5')
    ),
    baseStep: getString('baseStep') || getString('step') || '5',
    useActiveMinigrids: getBoolean('useActiveMinigrids', false),
    comboActiveMinigrids: getStringOrNumberAsString(
      'comboActiveMinigrids',
      '0'
    ),
    comboUseSmartGrids: getBoolean('comboUseSmartGrids', false),
    comboSmartGridsCount: getStringOrNumberAsString(
      'comboSmartGridsCount',
      '1'
    ),
    step: getString('step') || '1',
    stepScale: getString('stepScale') || '1',
    volumeScale: getString('volumeScale') || '1',
    minimumDeviation: getString('minimumDeviation', '0'),
    dcaVolumeBaseOn: getValue<DCAVolumeType>(
      'dcaVolumeBaseOn',
      DCAVolumeType.change
    ),
    dcaVolumeRequiredChangeRef: getValue<DcaVolumeRequiredChangeRef>(
      'dcaVolumeRequiredChangeRef',
      DcaVolumeRequiredChangeRef.tp
    ),
    dcaVolumeRequiredChange: getString('dcaVolumeRequiredChange', '1'),
    dcaVolumeMaxValue: getString('dcaVolumeMaxValue', '-1'),
    orderSize: getString('orderSize', '500'),
    profitCurrency: (() => {
      const currentValue = getString('profitCurrency', 'quote');
      if (currentValue === 'base' || currentValue === 'quote') {
        return currentValue;
      }
      return 'quote';
    })(),
    useTp: getBoolean('useTp'),
    tpPerc: getString('tpPerc') || '0',
    useFixedTPPrices: getBoolean('useFixedTPPrices', false),
    fixedTpPrice: getString('fixedTpPrice', ''),
    comboTpLimit: getBoolean('comboTpLimit', true),
    comboTpBase: (() => {
      const rawValue = getString('comboTpBase', ComboTpBase.full);
      return rawValue === ComboTpBase.filled
        ? ComboTpBase.filled
        : ComboTpBase.full;
    })(),
    dealCloseCondition: getValue<CloseConditionEnum>(
      'dealCloseCondition',
      CloseConditionEnum.tp
    ),
    closeByTimer: getBoolean('closeByTimer', false),
    closeByTimerValue: getNumber(
      'closeByTimerValue',
      DCA_FORM_DEFAULTS.closeByTimerValue
    ),
    closeByTimerUnits: parseCooldownUnits(
      getValue('closeByTimerUnits', undefined),
      DCA_FORM_DEFAULTS.closeByTimerUnits
    ),
    closeDealType: getValue<CloseDCATypeEnum.closeByLimit>(
      'closeDealType',
      CloseDCATypeEnum.closeByLimit
    ),
    closeOrderType: getValue<OrderTypeEnum>(
      'closeOrderType',
      OrderTypeEnum.limit
    ),
    dynamicArLockValue: getBoolean('dynamicArLockValue', true),
    stopDealLogic,
    stopDealSlLogic,
    trailingTp: getBoolean('trailingTp', false),
    indicatorGroups: normalizedIndicatorGroups,
    indicators: getValue<IndicatorConfig[]>('indicators', []),
    useSl: riskRewardActive ? false : getBoolean('useSl'),
    dealCloseConditionSL: (() => {
      if (riskRewardActive) {
        return CloseConditionEnum.tp;
      }
      return getValue<CloseConditionEnum>(
        'dealCloseConditionSL',
        CloseConditionEnum.tp
      );
    })(),
    slPerc: riskRewardActive ? '0' : getString('slPerc', '0'),
    baseSlOn: (() => {
      const rawValue = getString('baseSlOn', BaseSlOnEnum.avg);
      return rawValue === BaseSlOnEnum.start
        ? BaseSlOnEnum.start
        : BaseSlOnEnum.avg;
    })(),
    comboSlLimit: getBoolean('comboSlLimit', false),
    useSmartOrders: getBoolean('useSmartOrders'),
    dcaByMarket: getBoolean('dcaByMarket', false),
    maxNumberOfOpenDeals: getString('maxNumberOfOpenDeals', '1'),
    type: getValue<DCATypeEnum>('type', DCATypeEnum.regular),
    startDealLogic,
    useMulti,
    maxDealsPerPair: getString('maxDealsPerPair', '1'),
    pairPrioritization: (() => {
      const rawPriority = getString('pairPrioritization', 'alphabetical');
      const allowedPriorities = Object.values(PairPrioritizationEnum);
      return allowedPriorities.includes(rawPriority as PairPrioritizationEnum)
        ? (rawPriority as PairPrioritizationEnum)
        : PairPrioritizationEnum.random;
    })(),
    useRiskReward: riskRewardActive,
    riskSlType: getValue<RiskSlTypeEnum>('riskSlType', RiskSlTypeEnum.perc),
    riskSlAmountPerc: getString('riskSlAmountPerc', '2'),
    riskSlAmountValue: getString('riskSlAmountValue', '0'),
    riskUseTpRatio: getBoolean('riskUseTpRatio', false),
    riskTpRatio: getString('riskTpRatio', '2'),
    riskMinSl: getString('riskMinSl', '0'),
    riskMaxSl: getString('riskMaxSl', '-100'),
    riskMinPositionSize: getString('riskMinPositionSize', '0'),
    riskMaxPositionSize: getString('riskMaxPositionSize', '-1'),
    // The reverse half of the 2.43.19 fix. That release taught the forward
    // mapper to write these two, but nothing here ever read them back, so the
    // value saved correctly and then showed as the default on the next load —
    // the same "it didn't stick" symptom, one direction over.
    rrSlType: getValue<RRSlTypeEnum>('rrSlType', RRSlTypeEnum.indicator),
    rrSlFixedValue: getString('rrSlFixedValue', '2'),
    // No control writes this, which is exactly why it must be read: without it
    // a stored `true` is reset on every save of an unrelated field.
    ignoreStartDeals: getBoolean('ignoreStartDeals', false),
    multiTp: normalizedMultiTpTargets,
    multiSl: normalizedMultiSlTargets,
    useMultiTp: resolvedUseMultipleTpTargets,
    useMultiSl: riskRewardActive ? false : getBoolean('useMultiSl', false),
    trailingSl: riskRewardActive ? false : getBoolean('trailingSl', false),
    trailingTpPerc: getString('trailingTpPerc', '1'),
    minTp: getString('minTp', '0.5'),
    useMinTP: getBoolean('useMinTP', false),
    moveSL: riskRewardActive ? false : getBoolean('moveSL', false),
    moveSLForAll: riskRewardActive ? false : getBoolean('moveSLForAll', false),
    moveSLTrigger: riskRewardActive ? '2' : getString('moveSLTrigger', '2'),
    moveSLValue: riskRewardActive ? '0' : getString('moveSLValue', '0'),
    futures: getBoolean('futures', false),
    leverage: getNumber('leverage', 1),
    marginType: getValue<BotMarginTypeEnum>(
      'marginType',
      BotMarginTypeEnum.cross
    ),
    coinm: getBoolean('coinm', false),
    useVolumeFilterAll: getBoolean('useVolumeFilterAll', false),
    useVolumeFilter: getBoolean('useVolumeFilter', false),
    volumeValue: parseVolumePreset(
      getValue('volumeValue', VolumeValueEnum.top100)
    ),
    volumeTop: (() => {
      if (Object.prototype.hasOwnProperty.call(resolved, 'volumeTop')) {
        return getString('volumeTop', '10');
      }
      return '10';
    })(),
    useRelativeVolumeFilter: getBoolean('useRelativeVolumeFilter', false),
    relativeVolumeValue: parseVolumePreset(
      getValue(
        'relativeVolumeValue',
        getValue('volumeValue', VolumeValueEnum.top100)
      )
    ),
    relativeVolumeTop: (() => {
      const explicit = getStringOrNumberAsString('relativeVolumeTop', '');
      if (explicit) {
        return explicit;
      }
      return '10';
    })(),
    useDynamicPriceFilter: getBoolean('useDynamicPriceFilter', false),
    dynamicPriceFilterDeviation: getString('dynamicPriceFilterDeviation', '1'),
    dynamicPriceFilterOverValue: getString('dynamicPriceFilterOverValue', ''),
    dynamicPriceFilterUnderValue: getString('dynamicPriceFilterUnderValue', ''),
    dynamicPriceFilterPriceType: getValue<DynamicPriceFilterPriceTypeEnum>(
      'dynamicPriceFilterPriceType',
      DynamicPriceFilterPriceTypeEnum.entry
    ),
    useCooldown: getBoolean('useCooldown', false),
    cooldownAfterDealStart,
    cooldownAfterDealStartInterval: +cooldownStartInterval,
    cooldownAfterDealStartUnits: cooldownStartUnits,
    cooldownAfterDealStartOption: cooldownStartOption,
    cooldownAfterDealStop,
    cooldownAfterDealStopInterval: +cooldownStopInterval,
    cooldownAfterDealStopUnits: cooldownStopUnits,
    cooldownAfterDealStopOption: cooldownStopOption,
    startCondition: normalizeStartCondition(
      getString('startCondition', StartConditionEnum.asap)
    ),
    hodlDay: getString('hodlDay', '7'),
    hodlHourly: getBoolean('hodlHourly', false),
    hodlAt: normalizeHodlAt(getValue('hodlAt', '')),
    hodlNextBuy: normalizeNextBuy(getValue('hodlNextBuy', '')),
    useStaticPriceFilter: getBoolean('useStaticPriceFilter', false),
    minOpenDeal: getString('minOpenDeal', ''),
    maxOpenDeal: getString('maxOpenDeal', ''),
    dynamicPriceFilterDirection: getValue<DynamicPriceFilterDirectionEnum>(
      'dynamicPriceFilterDirection',
      DynamicPriceFilterDirectionEnum.under
    ),
    useNoOverlapDeals: getBoolean('useNoOverlapDeals', false),
    feeOrder,
    autoRebalancing,
    remainderFullAmount,
    adaptiveClose,
    useBotController: getBoolean('useBotController', false),
    botActualStart: getValue<BotStartTypeEnum>(
      'botActualStart',
      BotStartTypeEnum.manual
    ),
    botStart: getValue<BotStartTypeEnum>('botStart', BotStartTypeEnum.manual),
    stopType: getValue<CloseDCATypeEnum>('stopType', CloseDCATypeEnum.leave),
    stopStatus: getValue<BotStatus>('stopStatus', 'closed'),
    // mapBasicFields writes this into every payload; without the matching read
    // a terminal deal saved as `simple` reopened as `smart`, which changes
    // which TP/SL controls the form offers.
    terminalDealType: getValue<TerminalDealTypeEnum>(
      'terminalDealType',
      TerminalDealTypeEnum.smart
    ),
    startBotPriceCondition: getValue<IndicatorStartConditionEnum>(
      'startBotPriceCondition',
      IndicatorStartConditionEnum.gt
    ),
    startBotPriceValue: getString('startBotPriceValue', ''),
    stopBotPriceCondition: getValue<IndicatorStartConditionEnum>(
      'stopBotPriceCondition',
      IndicatorStartConditionEnum.gt
    ),
    stopBotPriceValue: getString('stopBotPriceValue', ''),
    useCloseAfterXopen: getBoolean('useCloseAfterXopen', false),
    closeAfterXopen: getString('closeAfterXopen', '20'),
    useCloseAfterX: getBoolean('useCloseAfterX', false),
    closeAfterX: getString('closeAfterX', '20'),
    useCloseAfterXwin: getBoolean('useCloseAfterXwin', false),
    closeAfterXwin: getString('closeAfterXwin', '20'),
    useCloseAfterXloss: getBoolean('useCloseAfterXloss', false),
    closeAfterXloss: getString('closeAfterXloss', '20'),
    useCloseAfterXprofit: getBoolean('useCloseAfterXprofit', false),
    closeAfterXprofitCond: getValue<IndicatorStartConditionEnum>(
      'closeAfterXprofitCond',
      IndicatorStartConditionEnum.gt
    ),
    closeAfterXprofitValue: getString('closeAfterXprofitValue', '20'),
    useMaxDealsPerHigherTimeframe: getBoolean(
      'useMaxDealsPerHigherTimeframe',
      false
    ),
    maxDealsPerHigherTimeframe: getString('maxDealsPerHigherTimeframe', '1'),
    startBotLogic,
    stopBotLogic,
    orderFixedIn: getValue<Currency>('orderFixedIn', 'quote'),
    //TODO: remove when backend will be updated
    useExperimental:
      getBoolean('feeOrder', false) ||
      getBoolean('adaptiveClose', false) ||
      getBoolean('autoRebalancing', false) ||
      getBoolean('remainderFullAmount', false),
  };

  const formData: BotFormData = {
    userFee: null,
    pairMetadata: {},
    pairPrecisionMap: {},
    type,
    pair: pairsFromSettings,
    name: (() => {
      const settingsName = getString('name');
      const botName = botSettingsRecord?.['name'];
      const resolvedName =
        settingsName || (typeof botName === 'string' ? botName : '') || '';
      logDebug(debug, '[mapBotSettingsToFormData] Name resolution', {
        settingsName,
        botName,
        resolvedName,
      });
      return resolvedName;
    })(),
    favoriteIndicators:
      getValue<IndicatorEnum[]>('favoriteIndicators', []) ?? [],
    exchangeUUID: exchangeValue,
    dca,
    combo: { ...COMBO_FORM_DEFAULTS, ...dca },
    grid: {
      ...GRID_FORM_DEFAULTS,
      sellDisplacement: getNumberGrid('sellDisplacement', 0),
      gridType: getValueGrid<GridType>('gridType', 'geometric') ?? 'geometric',
      budget: getNumberGrid('budget', 0),
      gridStep: getNumberGrid('gridStep', 1),
      levels: getNumberGrid('levels', 10),
      lowPrice: getNumberGrid('lowPrice', 0),
      topPrice: getNumberGrid('topPrice', 0),
      useOrderInAdvance: getBooleanGrid('useOrderInAdvance', false),
      ordersInAdvance: getNumberGrid('ordersInAdvance', 0),
      prioritize: getValueGrid<Prioritze>('prioritize', 'gridStep'),
      tpSl: getBooleanGrid('tpSl', false),
      tpSlCondition: getValueGrid<TpSlCondition>(
        'tpSlCondition',
        'valueChanged'
      ),
      tpSlAction: getValueGrid<TpSlAction>('tpSlAction', 'stop'),
      tpSlLimit: getBooleanGrid('tpSlLimit', false),
      sl: getBooleanGrid('sl', false),
      slCondition: getValueGrid<TpSlCondition>('slCondition', 'valueChanged'),
      slAction: getValueGrid<TpSlAction>('slAction', 'stop'),
      slLimit: getBooleanGrid('slLimit', false),
      tpTopPrice: getNumberGrid('tpTopPrice', 0),
      slLowPrice: getNumberGrid('slLowPrice', 0),
      useStartPrice: getBooleanGrid('useStartPrice', false),
      startPrice: getStringGrid('startPrice', ''),
      futuresStrategy: getValueGrid<FuturesStrategyEnum>(
        'futuresStrategy',
        FuturesStrategyEnum.neutral
      ),
      profitCurrency: getValueGrid<Currency>('profitCurrency', 'quote'),
      orderFixedIn: getValueGrid<Currency>('orderFixedIn', 'quote'),
      updatedBudget: getBooleanGrid('updatedBudget', false),
      newProfit: getBooleanGrid('newProfit', false),
    },
    initialPrice: getStringGrid('initialPrice', ''),
    initialPriceFrom: getValueGrid<InitialPriceFromEnum>(
      'initialPriceFrom',
      InitialPriceFromEnum.start
    ),
    terminal:
      getValue<DCATypeEnum>('type', DCATypeEnum.regular) ===
      DCATypeEnum.terminal,
    /* hedge:{} */
  };

  return {
    formData,
  };
};
