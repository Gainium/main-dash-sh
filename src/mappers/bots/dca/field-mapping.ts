/**
 * Modular field mapping utilities for DCA bot forms.
 * Provides organized, debuggable field mapping for bot settings.
 */

import { DCA_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import type {
  MultipleSLVarBindingPath,
  MultipleTPVarBindingPath,
} from '@/hooks/bots/global-variables/useBotVarBinding';
import {
  BaseSlOnEnum,
  BotMarginTypeEnum,
  BotStartTypeEnum,
  BotTypesEnum,
  CloseConditionEnum,
  CloseDCATypeEnum,
  ComboTpBase,
  CooldownOptionsEnum,
  CooldownUnits,
  DCAConditionEnum,
  DCATypeEnum,
  DCAVolumeType,
  DcaVolumeRequiredChangeRef,
  DynamicPriceFilterDirectionEnum,
  DynamicPriceFilterPriceTypeEnum,
  IndicatorAction,
  IndicatorSection,
  IndicatorStartConditionEnum,
  IndicatorsLogicEnum,
  MIN_DCA_TP_NEW,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  PairPrioritizationEnum,
  RiskSlTypeEnum,
  RRSlTypeEnum,
  StartConditionEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
  VolumeValueEnum,
  type BotSettings,
  type BotStatus,
  type BotVars,
  type Currency,
  type DCABotSettings,
  type DCACustom,
  type MultiTP,
  IndicatorEnum,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { IndicatorConfig } from '@/types/indicators';
import { INDICATOR_CATALOG } from '@/types/indicators/indicatorCatalog';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
  isCloseIndicatorOfSection,
  isCloseIndicatorUsedByCondition,
} from '@/utils/indicators/indicatorConfigUtils';
import { withFieldDefaults } from '@/utils/indicators/indicatorFieldGating';
import { normalizeMultiTpTargets } from '@/utils/bots/dca/take-profit';
import { enforceMultiTargetLimit } from '@/utils/bots/dca/take-profit-behaviours';

export interface FieldMappingResult {
  success: boolean;
  data?: Partial<DCABotSettings>;
  errors?: string[];
  warnings?: string[];
  debugInfo?: {
    category: string;
    fieldsProcessed: (keyof DCABotSettings)[];
    fieldsMapped: (keyof DCABotSettings)[];
    fieldsSkipped: (keyof DCABotSettings)[];
  };
}

export interface GridFieldMappingResult {
  success: boolean;
  data?: Partial<BotSettings>;
  errors?: string[];
  warnings?: string[];
  debugInfo?: {
    category: string;
    fieldsProcessed: (keyof BotSettings)[];
    fieldsMapped: (keyof BotSettings)[];
    fieldsSkipped: (keyof BotSettings)[];
  };
}

const normalizeIndicatorParamsRecord = (
  params: IndicatorConfig | undefined
): Record<string, unknown> => {
  if (!params) {
    return {};
  }

  // @ts-expect-error Legacy type
  const { params: _params, ...rest } = params;

  const fieldsAsNumber: (keyof IndicatorConfig)[] = [
    'indicatorLength',
    'valueInsteadof',
    'checkLevel',
    'maCrossingLength',
    'stochSmoothK',
    'stochSmoothD',
    'stochRSI',
    'leftBars',
    'rightBars',
    'basePeriods',
    'pumpPeriods',
    'pump',
    'interval',
    'baseCrack',
    'psarStart',
    'psarInc',
    'psarMax',
    'voShort',
    'voLong',
    'uoFast',
    'uoMiddle',
    'uoSlow',
    'bbwpLookback',
    'xOscillator2length',
    'xOscillator2voShort',
    'xOscillator2voLong',
    'percentileLookback',
    'percentilePercentage',
    'mar1length',
    'mar2length',
    'bbwMult',
    'bbwMaLength',
    'macdFast',
    'macdSlow',
    'divMinCount',
    'trendFilterLookback',
    'trendFilterValue',
    'factor',
    'atrLength',
    'ppHighLeft',
    'ppHighRight',
    'ppLowLeft',
    'ppLowRight',
    'ppMult',
    'athLookback',
    'kcRangeLength',
    'unpnlValue',
  ];

  const fieldsAsString: (keyof IndicatorConfig)[] = [
    'indicatorValue',
    'groupId',
    'uuid',
    'maUUID',
    'xoUUID',
    'stochUpper',
    'stochLower',
    'minPercFromLast',
    'orderSize',
    'keepConditionBars',
    'momSource',
    'pcUp',
    'pcDown',
    'pcValue',
    'riskAtrMult',
    'dynamicArFactor',
  ];
  const result = Object.entries(rest).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      if (value === undefined || value === null) {
        return acc;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed.length) {
          return acc;
        }
        acc[key] = fieldsAsNumber.includes(key as keyof IndicatorConfig)
          ? +trimmed
          : fieldsAsString.includes(key as keyof IndicatorConfig)
            ? `${trimmed}`
            : trimmed;
        return acc;
      }
      if (typeof value === 'number') {
        acc[key] = fieldsAsString.includes(key as keyof IndicatorConfig)
          ? `${value}`
          : value;
        return acc;
      }

      acc[key] = value;
      return acc;
    },
    {}
  );

  return result;
};

interface SerializeIndicatorOptions {
  overrides?: Partial<IndicatorConfig>;
  warnings?: string[];
}

const serializeIndicatorConfig = (
  indicator: IndicatorConfig,
  options: SerializeIndicatorOptions = {}
): IndicatorConfig => {
  const overrides = options.overrides ?? {};

  // Save what the form SHOWED, not only what the row happens to hold. A field
  // the user never touched has no entry in the row (the catalog's
  // `defaultValue` draws the control, it does not populate the object), and on
  // a bot loaded from the API it is an explicit `null` — GraphQL answers every
  // field the indicator selection asks for, so a document that never stored
  // `mar2type` yields one. Both RENDER as the default (the value expressions
  // use `??`) yet serialize as nothing, so opening a bot and saving it wrote
  // its holes straight back and no re-save could ever repair it.
  //
  // That is not cosmetic downstream: `indicatorLoader` sizes MAR's warm-up
  // with `Math.max(mar1length, mar2length)` — NaN with the second missing —
  // and `MAR`'s constructor calls `ma2Type.toLowerCase()` on the raw argument,
  // a TypeError rather than a fallback.
  //
  // `withFieldDefaults` is the helper the inline editor, the summary card and
  // `handleIndicatorSelection` already use to answer "what value does this
  // field effectively have"; persisting that same answer is what makes the
  // payload match the screen. It only FILLS gaps (`== null`), so everything
  // the user actually set still wins. It also resolves `keyWhen`, so STOCH's
  // band params land on the key the current `stochRange` actually binds.
  //
  // Looked up straight off the catalog rather than through
  // `getIndicatorDefinition`, which THROWS on an unregistered type: every call
  // site here sits inside a try/catch that turns a throw into "this bot cannot
  // be saved", so a legacy row carrying a type we retired would go from
  // silently incomplete to unsaveable. No definition — leave the row alone.
  const definition = INDICATOR_CATALOG[indicator.type as IndicatorEnum];
  const filled = definition
    ? ((withFieldDefaults(
        definition,
        indicator as IndicatorParamsState
      ) as IndicatorConfig | null) ?? indicator)
    : indicator;

  const paramsRecord = normalizeIndicatorParamsRecord(filled);

  const payload: IndicatorConfig = {
    ...filled,
    ...paramsRecord,
    ...overrides,
  };

  return payload;
};

/**
 * Drop the close indicators the ACTIVE close conditions cannot use.
 *
 * The bot form deliberately keeps every configuration when the user
 * switches close condition, so switching back restores it. Filtering
 * therefore happens here, on the way out: Indicators keeps its grouped
 * entries, Dynamic ATR/ADR keeps its ungrouped ATR/ADR, Percentage and
 * webhook keep none. Without this, a leftover entry reaches the backend,
 * where dynamic ATR/ADR reads the FIRST close indicator of the section as
 * its distance source — a stray RSI would silently become the exit price.
 */
const pruneUnusedCloseIndicators = (
  formData: BotFormData,
  indicators: IndicatorConfig[]
): IndicatorConfig[] => {
  const isComboBot = formData.type === BotTypesEnum.combo;
  const settings = isComboBot ? formData.combo : formData.dca;
  const tpCondition = settings.dealCloseCondition || CloseConditionEnum.tp;
  const slCondition = settings.dealCloseConditionSL || CloseConditionEnum.tp;

  return indicators.filter((indicator) => {
    if (indicator.indicatorAction !== IndicatorAction.closeDeal) {
      return true;
    }
    const condition = isCloseIndicatorOfSection(indicator, IndicatorSection.sl)
      ? slCondition
      : tpCondition;
    return isCloseIndicatorUsedByCondition(indicator, condition);
  });
};

/**
 * Basic bot settings mapping - Core fields that always work
 */
export const mapBasicFields = (formData: BotFormData): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === BotTypesEnum.combo;
  const startCondition = isComboBot
    ? formData.combo.startCondition
    : formData.dca.startCondition;
  const startOrderType = isComboBot
    ? formData.combo.startOrderType
    : formData.dca.startOrderType;
  const baseOrderSize = isComboBot
    ? formData.combo.baseOrderSize
    : formData.dca.baseOrderSize;
  const profitCurrency = isComboBot
    ? formData.combo.profitCurrency
    : formData.dca.profitCurrency;
  const orderFixedIn = isComboBot
    ? formData.combo.orderFixedIn
    : formData.dca.orderFixedIn;
  const skipBalanceCheck = isComboBot
    ? formData.combo.skipBalanceCheck
    : formData.dca.skipBalanceCheck;
  const notUseLimitReposition = isComboBot
    ? formData.combo.notUseLimitReposition
    : formData.dca.notUseLimitReposition;
  const type = isComboBot ? formData.combo.type : formData.dca.type;
  const useLimitPrice = isComboBot
    ? formData.combo.useLimitPrice
    : formData.dca.useLimitPrice;
  const baseOrderPrice = isComboBot
    ? formData.combo.baseOrderPrice
    : formData.dca.baseOrderPrice;
  const limitTimeout = isComboBot
    ? formData.combo.limitTimeout
    : formData.dca.limitTimeout;
  const formUseLimitTimeout = isComboBot
    ? formData.combo.useLimitTimeout
    : formData.dca.useLimitTimeout;
  const hodlDay = isComboBot ? formData.combo.hodlDay : formData.dca.hodlDay;
  const hodlHourly = isComboBot
    ? formData.combo.hodlHourly
    : formData.dca.hodlHourly;
  const hodlAt = isComboBot ? formData.combo.hodlAt : formData.dca.hodlAt;
  const hodlNextBuy = isComboBot
    ? formData.combo.hodlNextBuy
    : formData.dca.hodlNextBuy;
  const terminalDealType = isComboBot
    ? formData.combo.terminalDealType
    : formData.dca.terminalDealType;
  try {
    const validStartConditions = new Set<StartConditionEnum>(
      Object.values(StartConditionEnum)
    );
    const resolvedStartCondition = validStartConditions.has(startCondition)
      ? startCondition
      : StartConditionEnum.asap;

    const resolvedStartOrderType: OrderTypeEnum =
      startOrderType === OrderTypeEnum.limit
        ? OrderTypeEnum.limit
        : OrderTypeEnum.market;

    const nameValue = formData.name ?? '';
    const baseOrderSizeValue = baseOrderSize ?? '';
    const profitCurrencyValue: Currency =
      profitCurrency === 'quote'
        ? 'quote'
        : profitCurrency === 'base'
          ? 'base'
          : 'quote';
    const orderFixedInValue =
      orderFixedIn === 'quote'
        ? 'quote'
        : orderFixedIn === 'base'
          ? 'base'
          : 'quote';
    const skipBalanceCheckValue = Boolean(skipBalanceCheck);
    const disableRepositioningValue = Boolean(notUseLimitReposition);
    const botTypeValue = type ?? DCATypeEnum.regular;

    const rawTimeoutValue =
      typeof limitTimeout === 'string'
        ? limitTimeout.trim()
        : limitTimeout !== undefined && limitTimeout !== null
          ? String(limitTimeout)
          : '';
    let limitTimeoutValue = '0';
    let useLimitTimeoutValue = false;
    let limitTimeoutIsValid = true;
    if (rawTimeoutValue) {
      const parsedTimeout = Number(rawTimeoutValue);
      if (Number.isFinite(parsedTimeout) && parsedTimeout >= 0) {
        const normalizedSeconds = Math.trunc(parsedTimeout);
        const clampedSeconds = Math.min(Math.max(normalizedSeconds, 0), 600);

        if (normalizedSeconds !== clampedSeconds) {
          warnings.push(
            'Enter market timeout was clamped to the supported range (1-600 seconds).'
          );
        }

        limitTimeoutValue = clampedSeconds.toString();
        // Respect the user's toggle. Without this, any non-zero
        // default in `limitTimeout` (the form default is "20") would
        // flip `useLimitTimeout` to `true` even when the user never
        // toggled the Enter Market Timeout switch on — exported JSON
        // (and the live mutation) then claim the feature is enabled.
        useLimitTimeoutValue = Boolean(formUseLimitTimeout) && clampedSeconds > 0;
      } else {
        errors.push(
          'Enter market timeout must resolve to a non-negative number of seconds.'
        );
        fieldsSkipped.push('useLimitTimeout');
        limitTimeoutIsValid = false;
      }
    }

    const basicFields: Partial<
      Pick<
        DCABotSettings,
        | 'name'
        | 'baseOrderSize'
        | 'profitCurrency'
        | 'startCondition'
        | 'startOrderType'
        | 'orderFixedIn'
        | 'skipBalanceCheck'
        | 'notUseLimitReposition'
        | 'type'
        | 'useLimitPrice'
        | 'baseOrderPrice'
        | 'limitTimeout'
        | 'useLimitTimeout'
        | 'hodlDay'
        | 'hodlHourly'
        | 'hodlAt'
        | 'hodlNextBuy'
        | 'terminalDealType'
      >
    > = {
      name: nameValue,
      baseOrderSize: baseOrderSizeValue,
      profitCurrency: profitCurrencyValue,
      startCondition: resolvedStartCondition,
      startOrderType: resolvedStartOrderType,
      orderFixedIn: orderFixedInValue,
      skipBalanceCheck: skipBalanceCheckValue,
      notUseLimitReposition: disableRepositioningValue,
      type: botTypeValue,
      useLimitPrice: Boolean(useLimitPrice),
      terminalDealType: terminalDealType || TerminalDealTypeEnum.smart,
    };

    fieldsProcessed.push('useLimitPrice');
    fieldsMapped.push('useLimitPrice');

    fieldsProcessed.push('baseOrderPrice');

    if (useLimitPrice) {
      const baseOrderPriceRaw = baseOrderPrice;
      const baseOrderPriceInput =
        baseOrderPriceRaw !== undefined && baseOrderPriceRaw !== null
          ? String(baseOrderPriceRaw).trim()
          : '';

      if (baseOrderPriceInput) {
        const parsedBaseOrderPrice = Number.parseFloat(
          baseOrderPriceInput.replace(',', '.')
        );

        if (Number.isFinite(parsedBaseOrderPrice) && parsedBaseOrderPrice > 0) {
          basicFields['baseOrderPrice'] = baseOrderPriceInput;
          fieldsMapped.push('baseOrderPrice');
        } else {
          warnings.push(
            'Base order price must be a positive number when provided.'
          );
          fieldsSkipped.push('baseOrderPrice');
        }
      }
    }

    if (limitTimeoutIsValid) {
      basicFields['limitTimeout'] = limitTimeoutValue;
      basicFields['useLimitTimeout'] = useLimitTimeoutValue;
      fieldsProcessed.push('limitTimeout', 'useLimitTimeout');
    }

    // Validate basic fields
    fieldsProcessed.push(
      'name',
      'baseOrderSize',
      'profitCurrency',
      'startCondition',
      'startOrderType',
      'orderFixedIn',
      'skipBalanceCheck',
      'notUseLimitReposition',
      'useLimitTimeout',
      'type'
    );

    if (!nameValue.trim()) {
      errors.push('Bot name is required');
      fieldsSkipped.push('name');
    } else {
      fieldsMapped.push('name');
    }

    const parsedBaseOrderSize = parseFloat(baseOrderSizeValue);
    if (
      !baseOrderSizeValue ||
      isNaN(parsedBaseOrderSize) ||
      parsedBaseOrderSize <= 0
    ) {
      errors.push('Base order size must be greater than 0');
      fieldsSkipped.push('baseOrderSize');
    } else {
      fieldsMapped.push('baseOrderSize');
    }

    if (profitCurrencyValue) {
      fieldsMapped.push('profitCurrency');
    }

    fieldsMapped.push('startCondition', 'startOrderType', 'orderFixedIn');

    fieldsMapped.push('skipBalanceCheck', 'notUseLimitReposition', 'type');

    if (limitTimeoutIsValid) {
      fieldsMapped.push('limitTimeout', 'useLimitTimeout');
    }

    if (resolvedStartCondition === StartConditionEnum.timer) {
      fieldsProcessed.push('hodlDay', 'hodlHourly', 'hodlAt', 'hodlNextBuy');

      const parsedInterval = parseFloat(hodlDay);
      if (!hodlDay || Number.isNaN(parsedInterval) || parsedInterval <= 0) {
        errors.push('Timer interval must be a positive number');
        fieldsSkipped.push('hodlDay');
      } else {
        basicFields['hodlDay'] = hodlDay;
        basicFields['hodlHourly'] = Boolean(hodlHourly);
        fieldsMapped.push('hodlDay', 'hodlHourly');
      }

      const timePattern = /^\d{2}:\d{2}$/;
      if (hodlAt && timePattern.test(hodlAt)) {
        basicFields['hodlAt'] = hodlAt;
        fieldsMapped.push('hodlAt');
      } else if (hodlAt) {
        errors.push('Timer “open deal at” value must be in HH:MM format');
        fieldsSkipped.push('hodlAt');
      }

      if (hodlNextBuy) {
        const nextBuyDate = new Date(hodlNextBuy);
        if (Number.isNaN(nextBuyDate.getTime())) {
          errors.push('Timer next deal timestamp is invalid');
          fieldsSkipped.push('hodlNextBuy');
        } else {
          basicFields['hodlNextBuy'] = nextBuyDate.getTime();
          fieldsMapped.push('hodlNextBuy');
        }
      }
    }

    return {
      success: errors.length === 0,
      data: errors.length === 0 ? basicFields : {},
      errors,
      warnings,
      debugInfo: {
        category: 'Basic Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Basic fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Basic Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Strategy and pair mapping - FIXED version with conditional pair logic
 */
export const mapStrategyFields = (
  formData: BotFormData
): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === BotTypesEnum.combo;
  const strategy = isComboBot ? formData.combo.strategy : formData.dca.strategy;
  const _useMulti = isComboBot
    ? formData.combo.useMulti
    : formData.dca.useMulti;
  const maxDealsPerPair = isComboBot
    ? formData.combo.maxDealsPerPair
    : formData.dca.maxDealsPerPair;
  const pairPrioritization = isComboBot
    ? formData.combo.pairPrioritization
    : formData.dca.pairPrioritization;
  try {
    fieldsProcessed.push(
      'strategy',
      'useMulti',
      'pair',
      'maxDealsPerPair',
      'pairPrioritization'
    );

    const strategyFields: Partial<
      Pick<
        DCABotSettings,
        | 'strategy'
        | 'useMulti'
        | 'pair'
        | 'maxDealsPerPair'
        | 'pairPrioritization'
      >
    > = {};

    const direction =
      strategy === StrategyEnum.short ? StrategyEnum.short : StrategyEnum.long;
    strategyFields['strategy'] = direction;
    fieldsMapped.push('strategy');

    const sanitizedPairs = Array.isArray(formData.pair)
      ? formData.pair
          .map((pair) => pair?.trim())
          .filter((pair): pair is string => Boolean(pair))
      : [];
    const useMulti = Boolean(_useMulti);

    strategyFields['useMulti'] = useMulti;
    fieldsMapped.push('useMulti');

    if (useMulti) {
      if (sanitizedPairs.length === 0) {
        errors.push(
          'At least one trading pair is required when multi-pair mode is enabled'
        );
        fieldsSkipped.push('pair');
      } else {
        strategyFields['pair'] = sanitizedPairs;
        fieldsMapped.push('pair');
      }

      const rawMaxDealsPerPair = maxDealsPerPair;

      const resolvedMaxDealsPerPair = (() => {
        if (typeof rawMaxDealsPerPair === 'number') {
          if (!Number.isFinite(rawMaxDealsPerPair)) {
            return null;
          }

          return Math.trunc(rawMaxDealsPerPair);
        }

        if (typeof rawMaxDealsPerPair === 'string') {
          const trimmed = rawMaxDealsPerPair.trim();
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
      })();

      if (resolvedMaxDealsPerPair === null) {
        warnings.push(
          'maxDealsPerPair must be provided when multi-pair mode is enabled. Use -1 for unlimited or choose a value between 1 and 200.'
        );
        fieldsSkipped.push('maxDealsPerPair');
      } else if (
        resolvedMaxDealsPerPair === -1 ||
        (resolvedMaxDealsPerPair >= 1 && resolvedMaxDealsPerPair <= 200)
      ) {
        strategyFields['maxDealsPerPair'] = String(resolvedMaxDealsPerPair);
        fieldsMapped.push('maxDealsPerPair');
      } else {
        warnings.push(
          'maxDealsPerPair must be -1 for unlimited or between 1 and 200.'
        );
        fieldsSkipped.push('maxDealsPerPair');
      }

      const validPairPriorities: PairPrioritizationEnum[] = [
        PairPrioritizationEnum.alphabetical,
        PairPrioritizationEnum.random,
      ];
      const resolvedPairPriority: PairPrioritizationEnum =
        validPairPriorities.includes(
          pairPrioritization || PairPrioritizationEnum.random
        )
          ? pairPrioritization || PairPrioritizationEnum.random
          : PairPrioritizationEnum.alphabetical;
      strategyFields['pairPrioritization'] = resolvedPairPriority;
      fieldsMapped.push('pairPrioritization');
    } else {
      if (sanitizedPairs.length === 0) {
        errors.push(
          'A single trading pair is required for the bot configuration'
        );
        fieldsSkipped.push('pair');
      } else {
        strategyFields['pair'] = sanitizedPairs;
        fieldsMapped.push('pair');
      }

      fieldsSkipped.push('maxDealsPerPair', 'pairPrioritization');
    }

    return {
      success: errors.length === 0,
      data: strategyFields,
      errors,
      warnings,
      debugInfo: {
        category: 'Strategy Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Strategy fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Strategy Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * DCA settings mapping - FIXED version
 */
export const mapDcaFields = (formData: BotFormData): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === BotTypesEnum.combo;
  const _useDca = isComboBot ? formData.combo.useDca : formData.dca.useDca;
  const dcaCondition = isComboBot
    ? formData.combo.dcaCondition
    : formData.dca.dcaCondition;
  const ordersCount = isComboBot
    ? formData.combo.ordersCount
    : formData.dca.ordersCount;
  const useSmartOrders = isComboBot
    ? formData.combo.useSmartOrders
    : formData.dca.useSmartOrders;
  const dcaByMarket = isComboBot
    ? formData.combo.dcaByMarket
    : formData.dca.dcaByMarket;
  const _activeOrdersCount = isComboBot
    ? formData.combo.activeOrdersCount
    : formData.dca.activeOrdersCount;
  const gridLevel = isComboBot
    ? formData.combo.gridLevel
    : formData.dca.gridLevel;
  const baseGridLevels = isComboBot
    ? formData.combo.baseGridLevels
    : formData.dca.baseGridLevels;
  const baseStep = isComboBot ? formData.combo.baseStep : formData.dca.baseStep;
  const _useActiveMinigrids = isComboBot
    ? formData.combo.useActiveMinigrids
    : formData.dca.useActiveMinigrids;
  const comboActiveMinigrids = isComboBot
    ? formData.combo.comboActiveMinigrids
    : formData.dca.comboActiveMinigrids;
  const _comboUseSmartGrids = isComboBot
    ? formData.combo.comboUseSmartGrids
    : formData.dca.comboUseSmartGrids;
  const comboSmartGridsCount = isComboBot
    ? formData.combo.comboSmartGridsCount
    : formData.dca.comboSmartGridsCount;
  const step = isComboBot ? formData.combo.step : formData.dca.step;
  const stepScale = isComboBot
    ? formData.combo.stepScale
    : formData.dca.stepScale;
  const volumeScale = isComboBot
    ? formData.combo.volumeScale
    : formData.dca.volumeScale;
  const minimumDeviation = isComboBot
    ? formData.combo.minimumDeviation
    : formData.dca.minimumDeviation;
  const dcaVolumeBaseOn = isComboBot
    ? formData.combo.dcaVolumeBaseOn
    : formData.dca.dcaVolumeBaseOn;
  const dcaVolumeRequiredChangeRef = isComboBot
    ? formData.combo.dcaVolumeRequiredChangeRef
    : formData.dca.dcaVolumeRequiredChangeRef;
  const dcaVolumeRequiredChange = isComboBot
    ? formData.combo.dcaVolumeRequiredChange
    : formData.dca.dcaVolumeRequiredChange;
  const dcaVolumeMaxValue = isComboBot
    ? formData.combo.dcaVolumeMaxValue
    : formData.dca.dcaVolumeMaxValue;
  const orderSize = isComboBot
    ? formData.combo.orderSize
    : formData.dca.orderSize;
  const orderSizeType = isComboBot
    ? formData.combo.orderSizeType
    : formData.dca.orderSizeType;
  const scaleDcaType = isComboBot
    ? formData.combo.scaleDcaType
    : formData.dca.scaleDcaType;
  const dcaCustom = isComboBot
    ? formData.combo.dcaCustom
    : formData.dca.dcaCustom;
  const useMaxDealsPerHigherTimeframe = isComboBot
    ? formData.combo.useMaxDealsPerHigherTimeframe
    : formData.dca.useMaxDealsPerHigherTimeframe;
  const maxDealsPerHigherTimeframe = isComboBot
    ? formData.combo.maxDealsPerHigherTimeframe
    : formData.dca.maxDealsPerHigherTimeframe;
  const riskReductionValue = isComboBot
    ? formData.combo.riskReductionValue
    : formData.dca.riskReductionValue;
  const reinvestValue = isComboBot
    ? formData.combo.reinvestValue
    : formData.dca.reinvestValue;
  const maxNumberOfOpenDeals = isComboBot
    ? formData.combo.maxNumberOfOpenDeals
    : formData.dca.maxNumberOfOpenDeals;
  const useRiskReduction = isComboBot
    ? formData.combo.useRiskReduction
    : formData.dca.useRiskReduction;
  const useReinvest = isComboBot
    ? formData.combo.useReinvest
    : formData.dca.useReinvest;
  const indicators = isComboBot
    ? formData.combo.indicators
    : formData.dca.indicators;

  try {
    fieldsProcessed.push(
      'useDca',
      'dcaCondition',
      'ordersCount',
      'activeOrdersCount',
      'gridLevel',
      'baseGridLevels',
      'baseStep',
      'useActiveMinigrids',
      'comboActiveMinigrids',
      'comboUseSmartGrids',
      'comboSmartGridsCount',
      'useSmartOrders',
      'maxNumberOfOpenDeals',
      'step',
      'stepScale',
      'volumeScale',
      'minimumDeviation',
      'dcaVolumeBaseOn',
      'dcaVolumeRequiredChangeRef',
      'dcaVolumeRequiredChange',
      'dcaVolumeMaxValue',
      'orderSize',
      'orderSizeType',
      'scaleDcaType',
      'dcaCustom',
      'useMaxDealsPerHigherTimeframe',
      'maxDealsPerHigherTimeframe',
      'riskReductionValue',
      'reinvestValue',
      'ordersCount'
    );

    const dcaFields: Partial<
      Pick<
        DCABotSettings,
        | 'dcaCondition'
        | 'useDca'
        | 'ordersCount'
        | 'useSmartOrders'
        | 'dcaByMarket'
        | 'activeOrdersCount'
        | 'gridLevel'
        | 'baseGridLevels'
        | 'baseStep'
        | 'step'
        | 'useActiveMinigrids'
        | 'comboActiveMinigrids'
        | 'comboUseSmartGrids'
        | 'comboSmartGridsCount'
        | 'maxNumberOfOpenDeals'
        | 'orderSize'
        | 'orderSizeType'
        | 'useRiskReduction'
        | 'riskReductionValue'
        | 'useReinvest'
        | 'reinvestValue'
        | 'stepScale'
        | 'volumeScale'
        | 'minimumDeviation'
        | 'dcaVolumeBaseOn'
        | 'dcaVolumeRequiredChangeRef'
        | 'dcaVolumeRequiredChange'
        | 'dcaVolumeMaxValue'
        | 'scaleDcaType'
        | 'indicators'
        | 'dcaCustom'
        | 'useMaxDealsPerHigherTimeframe'
        | 'maxDealsPerHigherTimeframe'
      >
    > = {};
    const useDca = Boolean(_useDca);

    dcaFields['useDca'] = useDca;
    fieldsMapped.push('useDca');

    const validDcaTypes: DCAConditionEnum[] = [
      DCAConditionEnum.custom,
      DCAConditionEnum.indicators,
      DCAConditionEnum.percentage,
    ];
    const resolvedDcaType = validDcaTypes.includes(
      dcaCondition || DCAConditionEnum.percentage
    )
      ? dcaCondition || DCAConditionEnum.percentage
      : DCAConditionEnum.percentage;

    if (useDca) {
      dcaFields['dcaCondition'] = resolvedDcaType;
      fieldsMapped.push('dcaCondition');
      fieldsMapped.push('dcaCondition');
    } else {
      fieldsSkipped.push('dcaCondition', 'dcaCustom');
    }

    const maxOrdersCount = 200;
    if (+ordersCount < 1 || +ordersCount > maxOrdersCount) {
      errors.push(`Orders count must be between 1 and ${maxOrdersCount}`);
      fieldsSkipped.push('ordersCount');
    } else {
      dcaFields['ordersCount'] = ordersCount;
      fieldsMapped.push('ordersCount');
    }

    const smartOrdersCountMin = 1;
    const smartOrdersCountMax = 5;
    dcaFields['useSmartOrders'] = Boolean(useSmartOrders);
    fieldsMapped.push('useSmartOrders');

    dcaFields['dcaByMarket'] = Boolean(dcaByMarket);
    fieldsMapped.push('dcaByMarket');

    if (useSmartOrders) {
      const activeOrdersCount = Number(_activeOrdersCount ?? 0);
      if (
        !Number.isFinite(activeOrdersCount) ||
        activeOrdersCount < smartOrdersCountMin ||
        activeOrdersCount > smartOrdersCountMax
      ) {
        errors.push(
          `Smart orders count must be between ${smartOrdersCountMin} and ${smartOrdersCountMax}`
        );
        fieldsSkipped.push('activeOrdersCount');
      } else {
        dcaFields['activeOrdersCount'] = `${activeOrdersCount}`;
        fieldsMapped.push('activeOrdersCount');
      }
    } else {
      fieldsSkipped.push('activeOrdersCount');
    }

    if (formData.type === 'combo') {
      const gridLevelValue = Number(gridLevel ?? 0);
      if (
        !Number.isFinite(gridLevelValue) ||
        gridLevelValue < 1 ||
        gridLevelValue > 200
      ) {
        errors.push('Grid levels must be between 1 and 200');
        fieldsSkipped.push('gridLevel');
      } else {
        dcaFields['gridLevel'] = String(gridLevel);
        fieldsMapped.push('gridLevel');
      }

      const baseGridLevelsValue = Number(baseGridLevels ?? gridLevel ?? 0);
      if (
        !Number.isFinite(baseGridLevelsValue) ||
        baseGridLevelsValue < 1 ||
        baseGridLevelsValue > 200
      ) {
        errors.push('Base grid levels must be between 1 and 200');
        fieldsSkipped.push('baseGridLevels');
      } else {
        dcaFields['baseGridLevels'] = String(
          baseGridLevels ?? gridLevel ?? '1'
        );
        fieldsMapped.push('baseGridLevels');
      }

      const baseStepSource = (() => {
        const explicit = baseStep;
        if (typeof explicit === 'string' && explicit.trim().length > 0) {
          return explicit.trim();
        }
        if (typeof step === 'string' && step.trim().length > 0) {
          return step.trim();
        }
        return '';
      })();

      const baseStepValue = Number.parseFloat(baseStepSource);
      if (
        !Number.isFinite(baseStepValue) ||
        baseStepValue < 0.1 ||
        baseStepValue > 500
      ) {
        errors.push('Base grid step must be between 0.1% and 500%');
        fieldsSkipped.push('baseStep');
      } else {
        const normalizedBaseStep = Number(baseStepValue.toFixed(2)).toString();
        dcaFields['baseStep'] = normalizedBaseStep;
        fieldsMapped.push('baseStep');
      }

      const useActiveMinigrids = Boolean(_useActiveMinigrids);
      dcaFields['useActiveMinigrids'] = useActiveMinigrids;
      fieldsMapped.push('useActiveMinigrids');

      if (useActiveMinigrids) {
        const minigridsCount = Number(comboActiveMinigrids ?? 0);
        if (!Number.isFinite(minigridsCount) || minigridsCount < 0) {
          errors.push('Active minigrids count must be zero or greater');
          fieldsSkipped.push('comboActiveMinigrids');
        } else if (minigridsCount > Number(ordersCount ?? 0)) {
          errors.push(
            'Active minigrids count must not exceed total DCA orders'
          );
          fieldsSkipped.push('comboActiveMinigrids');
        } else {
          dcaFields['comboActiveMinigrids'] = String(
            comboActiveMinigrids ?? '0'
          );
          fieldsMapped.push('comboActiveMinigrids');
        }
      } else {
        fieldsSkipped.push('comboActiveMinigrids');
      }

      const comboUseSmartGrids = Boolean(_comboUseSmartGrids);
      dcaFields['comboUseSmartGrids'] = comboUseSmartGrids;
      fieldsMapped.push('comboUseSmartGrids');

      if (comboUseSmartGrids) {
        const smartGridCount = Number(comboSmartGridsCount ?? 0);
        if (
          !Number.isFinite(smartGridCount) ||
          smartGridCount < 1 ||
          smartGridCount > 200
        ) {
          errors.push('Grid smart orders count must be between 1 and 200');
          fieldsSkipped.push('comboSmartGridsCount');
        } else {
          dcaFields['comboSmartGridsCount'] = String(
            comboSmartGridsCount ?? '1'
          );
          fieldsMapped.push('comboSmartGridsCount');
        }
      } else {
        fieldsSkipped.push('comboSmartGridsCount');
      }
    } else {
      fieldsSkipped.push(
        'gridLevel',
        'baseGridLevels',
        'baseStep',
        'useActiveMinigrids',
        'comboActiveMinigrids',
        'comboUseSmartGrids',
        'comboSmartGridsCount'
      );
    }

    if (+(maxNumberOfOpenDeals || 1) < 1 || +(maxNumberOfOpenDeals || 1) > 200) {
      errors.push('Max open deals must be between 1 and 200');
      fieldsSkipped.push('maxNumberOfOpenDeals');
    } else {
      dcaFields['maxNumberOfOpenDeals'] = String(maxNumberOfOpenDeals);
      fieldsMapped.push('maxNumberOfOpenDeals');
    }

    const trimmedOrderSize = (orderSize ?? '').trim();
    if (!trimmedOrderSize) {
      warnings.push('Order size is empty; defaulting to 0');
      dcaFields['orderSize'] = '0';
      fieldsMapped.push('orderSize');
    } else {
      const sizeValue = Number(trimmedOrderSize);
      if (!Number.isFinite(sizeValue) || sizeValue < 0) {
        errors.push('Order size must be a non-negative number');
        fieldsSkipped.push('orderSize');
      } else {
        dcaFields['orderSize'] = trimmedOrderSize;
        fieldsMapped.push('orderSize');
      }
    }

    const normalizedOrderSizeType = Object.values(OrderSizeTypeEnum).includes(
      orderSizeType
    )
      ? orderSizeType
      : OrderSizeTypeEnum.quote;
    dcaFields['orderSizeType'] = normalizedOrderSizeType;
    fieldsMapped.push('orderSizeType');

    const parsePercentageField = (
      value: string | undefined,
      fieldName: keyof DCABotSettings,
      label: string
    ): { normalized: string | null; clamped: boolean } => {
      const trimmed = value?.trim?.() ?? '';
      if (!trimmed) {
        return { normalized: '0', clamped: false };
      }

      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        errors.push(`${label} must resolve to a number between 0 and 100`);
        fieldsSkipped.push(fieldName);
        return { normalized: null, clamped: false };
      }

      const clamped = Math.min(100, Math.max(0, parsed));
      return {
        normalized: clamped.toString(),
        clamped: clamped !== parsed,
      };
    };

    const riskReductionEnabled = !!useRiskReduction;
    const {
      normalized: normalizedRiskReductionValue,
      clamped: riskReductionClamped,
    } = parsePercentageField(
      riskReductionValue,
      'riskReductionValue',
      'Risk reduction value'
    );

    dcaFields['useRiskReduction'] = riskReductionEnabled;
    fieldsMapped.push('useRiskReduction');

    if (riskReductionClamped) {
      warnings.push(
        'Risk reduction value was clamped to the supported range (0-100).'
      );
    }

    if (normalizedRiskReductionValue !== null) {
      dcaFields['riskReductionValue'] = normalizedRiskReductionValue;
      fieldsMapped.push('riskReductionValue');
    }

    const reinvestEnabled = Boolean(useReinvest);
    const { normalized: normalizedReinvestValue, clamped: reinvestClamped } =
      parsePercentageField(reinvestValue, 'reinvestValue', 'Reinvest value');

    if (reinvestClamped) {
      warnings.push(
        'Reinvest value was clamped to the supported range (0-100).'
      );
    }

    dcaFields['useReinvest'] = reinvestEnabled;
    fieldsMapped.push('useReinvest');

    if (normalizedReinvestValue !== null) {
      dcaFields['reinvestValue'] = normalizedReinvestValue;
      fieldsMapped.push('reinvestValue');
    }

    if (step) {
      const stepValue = Number(step);
      if (!Number.isFinite(stepValue) || stepValue <= 0 || stepValue > 50) {
        errors.push('Step must be between 0.1% and 50%');
        fieldsSkipped.push('step');
      } else {
        dcaFields['step'] = step;
        fieldsMapped.push('step');
      }
    } else {
      fieldsSkipped.push('step');
    }

    if (stepScale) {
      const stepScaleValue = Number(stepScale);
      if (
        !Number.isFinite(stepScaleValue) ||
        stepScaleValue <= 0 ||
        stepScaleValue > 5
      ) {
        errors.push('Step scale must be between 0.1 and 5');
        fieldsSkipped.push('stepScale');
      } else {
        dcaFields['stepScale'] = stepScale;
        fieldsMapped.push('stepScale');
      }
    } else {
      fieldsSkipped.push('stepScale');
    }

    if (volumeScale) {
      const volumeScaleValue = Number(volumeScale);
      if (
        !Number.isFinite(volumeScaleValue) ||
        volumeScaleValue <= 0 ||
        volumeScaleValue > 10
      ) {
        errors.push('Volume scale must be between 0.1 and 10');
        fieldsSkipped.push('volumeScale');
      } else {
        dcaFields['volumeScale'] = volumeScale;
        fieldsMapped.push('volumeScale');
      }
    } else {
      fieldsSkipped.push('volumeScale');
    }

    const requiresMinimumDeviation =
      scaleDcaType === 'atr' || scaleDcaType === 'adr';
    const minimumDeviationValue = (minimumDeviation ?? '').trim();

    if (requiresMinimumDeviation || minimumDeviationValue) {
      if (!minimumDeviationValue) {
        errors.push(
          'Minimum deviation is required when scaling is based on ATR or ADR'
        );
        fieldsSkipped.push('minimumDeviation');
      } else {
        const parsedMinimumDeviation = Number(minimumDeviationValue);
        if (
          !Number.isFinite(parsedMinimumDeviation) ||
          parsedMinimumDeviation < 0 ||
          parsedMinimumDeviation > 10
        ) {
          errors.push('Minimum deviation must be between 0 and 10');
          fieldsSkipped.push('minimumDeviation');
        } else {
          dcaFields['minimumDeviation'] = minimumDeviationValue;
          fieldsMapped.push('minimumDeviation');
        }
      }
    } else {
      fieldsSkipped.push('minimumDeviation');
    }

    const resolvedVolumeBasedOn = Object.values(DCAVolumeType).includes(
      dcaVolumeBaseOn || DCAVolumeType.scale
    )
      ? dcaVolumeBaseOn || DCAVolumeType.scale
      : DCAVolumeType.scale;
    dcaFields['dcaVolumeBaseOn'] = resolvedVolumeBasedOn;
    fieldsMapped.push('dcaVolumeBaseOn');

    const resolvedVolumeRef = Object.values(
      DcaVolumeRequiredChangeRef
    ).includes(dcaVolumeRequiredChangeRef || DcaVolumeRequiredChangeRef.tp)
      ? dcaVolumeRequiredChangeRef || DcaVolumeRequiredChangeRef.tp
      : DcaVolumeRequiredChangeRef.tp;
    dcaFields['dcaVolumeRequiredChangeRef'] = resolvedVolumeRef;
    fieldsMapped.push('dcaVolumeRequiredChangeRef');

    const volumeChangeValue = (dcaVolumeRequiredChange ?? '').trim();
    if (resolvedVolumeBasedOn === DCAVolumeType.change) {
      if (!volumeChangeValue) {
        errors.push(
          'Volume required change is required when volume is based on required change'
        );
        fieldsSkipped.push('dcaVolumeRequiredChange');
      } else {
        const parsedValue = Number(volumeChangeValue);
        if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
          errors.push('Volume required change must be greater than 0');
          fieldsSkipped.push('dcaVolumeRequiredChange');
        } else {
          dcaFields['dcaVolumeRequiredChange'] = volumeChangeValue;
          fieldsMapped.push('dcaVolumeRequiredChange');
        }
      }
    } else if (volumeChangeValue) {
      dcaFields['dcaVolumeRequiredChange'] = volumeChangeValue;
      fieldsMapped.push('dcaVolumeRequiredChange');
    } else {
      fieldsSkipped.push('dcaVolumeRequiredChange');
    }

    const volumeMaxValue = (dcaVolumeMaxValue ?? '').trim();
    if (volumeMaxValue) {
      const parsedMax = Number(volumeMaxValue);
      if (!Number.isFinite(parsedMax) || (parsedMax < 0 && parsedMax !== -1)) {
        errors.push(
          'Volume max value must be -1 (disabled) or a positive number'
        );
        fieldsSkipped.push('dcaVolumeMaxValue');
      } else {
        dcaFields['dcaVolumeMaxValue'] = volumeMaxValue;
        fieldsMapped.push('dcaVolumeMaxValue');
      }
    } else {
      fieldsSkipped.push('dcaVolumeMaxValue');
    }

    const orderAmountValue = (orderSize ?? '').trim();
    if (orderAmountValue) {
      const parsedAmount = Number(orderAmountValue);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        errors.push('DCA order amount must be a non-negative number');
        fieldsSkipped.push('orderSize');
      } else {
        dcaFields['orderSize'] = orderAmountValue;
        fieldsMapped.push('orderSize');
      }
    } else {
      fieldsSkipped.push('orderSize');
    }

    if (scaleDcaType) {
      dcaFields['scaleDcaType'] = scaleDcaType;
      fieldsMapped.push('scaleDcaType');
    } else {
      fieldsSkipped.push('scaleDcaType');
    }

    if (useDca && resolvedDcaType === DCAConditionEnum.indicators) {
      const dcaIndicators = indicators.filter(
        (i) => i.indicatorAction === IndicatorAction.startDca
      );
      if (Array.isArray(dcaIndicators) && dcaIndicators.length > 0) {
        const indicatorsPayload = dcaIndicators
          .filter(Boolean)
          .map((indicator) =>
            serializeIndicatorConfig(indicator, {
              overrides: { indicatorAction: IndicatorAction.startDca },
              warnings,
            })
          );
        dcaFields['indicators'] = indicators.map(
          (i) => indicatorsPayload.find((ind) => ind.uuid === i.uuid) ?? i
        );
        fieldsMapped.push('indicators');
      } else {
        errors.push(
          'At least one indicator is required when DCA type is set to technical indicators'
        );
        fieldsSkipped.push('indicators');
      }
    } else {
      fieldsSkipped.push('indicators');
    }

    if (useDca && resolvedDcaType === DCAConditionEnum.custom) {
      if (Array.isArray(dcaCustom) && dcaCustom.length > 0) {
        const sanitizedOrders: DCACustom[] = dcaCustom.map((order) => ({
          uuid: order.uuid,
          step: order.step?.trim() ?? '',
          size: order.size?.trim() ?? '',
        }));
        const invalidOrder = sanitizedOrders.find((order) => {
          const stepValue = Number(order.step);
          const sizeValue = Number(order.size);
          return (
            !Number.isFinite(stepValue) ||
            stepValue <= 0 ||
            !Number.isFinite(sizeValue) ||
            sizeValue <= 0
          );
        });
        if (invalidOrder) {
          errors.push(
            'Each custom DCA order must have step and size greater than 0'
          );
          fieldsSkipped.push('dcaCustom');
        } else {
          dcaFields['dcaCustom'] = sanitizedOrders;
          fieldsMapped.push('dcaCustom');
        }
      } else {
        errors.push('Custom DCA ladder requires at least one order');
        fieldsSkipped.push('dcaCustom');
      }
    } else {
      fieldsSkipped.push('dcaCustom');
    }

    if (useMaxDealsPerHigherTimeframe) {
      dcaFields['useMaxDealsPerHigherTimeframe'] = true;
      fieldsMapped.push('useMaxDealsPerHigherTimeframe');

      const higherTimeframeLimit = (maxDealsPerHigherTimeframe ?? '').trim();
      if (higherTimeframeLimit) {
        const parsedLimit = Number(higherTimeframeLimit);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
          errors.push('Max deals per higher timeframe must be greater than 0');
          fieldsSkipped.push('maxDealsPerHigherTimeframe');
        } else {
          dcaFields['maxDealsPerHigherTimeframe'] = higherTimeframeLimit;
          fieldsMapped.push('maxDealsPerHigherTimeframe');
        }
      } else {
        errors.push(
          'Max deals per higher timeframe is required when the toggle is enabled'
        );
        fieldsSkipped.push('maxDealsPerHigherTimeframe');
      }
    } else {
      // Must be emitted explicitly: mapFormDataToBackend spreads
      // DCA_FORM_DEFAULTS (where this flag defaults to true) under the mapped
      // fields, so omitting it here re-enables the limiter on every save.
      dcaFields['useMaxDealsPerHigherTimeframe'] = false;
      fieldsMapped.push('useMaxDealsPerHigherTimeframe');
      fieldsSkipped.push('maxDealsPerHigherTimeframe');
    }

    return {
      success: errors.length === 0,
      data: dcaFields,
      errors,
      warnings,
      debugInfo: {
        category: 'DCA Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`DCA fields mapping failed: ${error}`],
      debugInfo: {
        category: 'DCA Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Take Profit and Stop Loss mapping
 */
export const mapTpSlFields = (
  formData: BotFormData,
  vars?: BotVars | undefined | null
): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === BotTypesEnum.combo;
  const useTp = isComboBot ? formData.combo.useTp : formData.dca.useTp;
  const useSl = isComboBot ? formData.combo.useSl : formData.dca.useSl;
  const multiTp = isComboBot ? formData.combo.multiTp : formData.dca.multiTp;
  const multiSl = isComboBot ? formData.combo.multiSl : formData.dca.multiSl;
  const tpPerc = isComboBot ? formData.combo.tpPerc : formData.dca.tpPerc;
  const slPerc = isComboBot ? formData.combo.slPerc : formData.dca.slPerc;
  const _useFixedTPPrices = isComboBot
    ? formData.combo.useFixedTPPrices
    : formData.dca.useFixedTPPrices;
  const fixedTpPrice = isComboBot
    ? formData.combo.fixedTpPrice
    : formData.dca.fixedTpPrice;
  const _useFixedSLPrices = isComboBot
    ? formData.combo.useFixedSLPrices
    : formData.dca.useFixedSLPrices;
  const fixedSlPrice = isComboBot
    ? formData.combo.fixedSlPrice
    : formData.dca.fixedSlPrice;
  const dealCloseCondition = isComboBot
    ? formData.combo.dealCloseCondition
    : formData.dca.dealCloseCondition;
  const closeByTimer = isComboBot
    ? formData.combo.closeByTimer
    : formData.dca.closeByTimer;
  const closeByTimerValue = isComboBot
    ? formData.combo.closeByTimerValue
    : formData.dca.closeByTimerValue;
  const closeByTimerUnits = isComboBot
    ? formData.combo.closeByTimerUnits
    : formData.dca.closeByTimerUnits;
  const useMinTP = isComboBot ? formData.combo.useMinTP : formData.dca.useMinTP;
  const minTp = isComboBot ? formData.combo.minTp : formData.dca.minTp;
  const useMultiTp = isComboBot
    ? formData.combo.useMultiTp
    : formData.dca.useMultiTp;
  const stopDealLogic = isComboBot
    ? formData.combo.stopDealLogic
    : formData.dca.stopDealLogic;
  const closeDealType = isComboBot
    ? formData.combo.closeDealType
    : formData.dca.closeDealType;
  const closeOrderType = isComboBot
    ? formData.combo.closeOrderType
    : formData.dca.closeOrderType;
  const indicators = isComboBot
    ? formData.combo.indicators
    : formData.dca.indicators;
  const _dynamicArLockValue = isComboBot
    ? formData.combo.dynamicArLockValue
    : formData.dca.dynamicArLockValue;
  const comboTpLimit = isComboBot
    ? formData.combo.comboTpLimit
    : formData.dca.comboTpLimit;
  const comboTpBase = isComboBot
    ? formData.combo.comboTpBase
    : formData.dca.comboTpBase;
  const trailingTp = isComboBot
    ? formData.combo.trailingTp
    : formData.dca.trailingTp;
  const trailingTpPerc = isComboBot
    ? formData.combo.trailingTpPerc
    : formData.dca.trailingTpPerc;
  const useRiskReward = isComboBot
    ? formData.combo.useRiskReward
    : formData.dca.useRiskReward;
  const baseSlOn = isComboBot ? formData.combo.baseSlOn : formData.dca.baseSlOn;
  const comboSlLimit = isComboBot
    ? formData.combo.comboSlLimit
    : formData.dca.comboSlLimit;
  const dealCloseConditionSL = isComboBot
    ? formData.combo.dealCloseConditionSL
    : formData.dca.dealCloseConditionSL;
  const useSmartOrders = isComboBot
    ? formData.combo.useSmartOrders
    : formData.dca.useSmartOrders;
  const _useMultiSl = isComboBot
    ? formData.combo.useMultiSl
    : formData.dca.useMultiSl;
  const trailingSl = isComboBot
    ? formData.combo.trailingSl
    : formData.dca.trailingSl;
  const moveSL = isComboBot ? formData.combo.moveSL : formData.dca.moveSL;
  const moveSLForAll = isComboBot
    ? formData.combo.moveSLForAll
    : formData.dca.moveSLForAll;
  const moveSLTrigger = isComboBot
    ? formData.combo.moveSLTrigger
    : formData.dca.moveSLTrigger;
  const moveSLValue = isComboBot
    ? formData.combo.moveSLValue
    : formData.dca.moveSLValue;
  const _stopDealSlLogic = isComboBot
    ? formData.combo.stopDealSlLogic
    : formData.dca.stopDealSlLogic;
  const getBindingPath = (
    feature: 'multiTp' | 'multiSl',
    targetId: string,
    field: keyof MultiTP
  ): string => {
    return `${feature}.${targetId}.${field}` as
      | MultipleTPVarBindingPath
      | MultipleSLVarBindingPath;
  };

  const allowedCloseConditions = new Set<string>(
    Object.values(CloseConditionEnum)
  );

  const sanitizeMultiTargets = (
    rawTargets: MultiTP[] | undefined,
    {
      allowNegative,
      feature,
      maxTargets = 10,
      maxTotalAmount = 100,
    }: {
      allowNegative: boolean;
      feature: keyof Pick<DCABotSettings, 'multiTp' | 'multiSl'>;
      maxTargets?: number;
      maxTotalAmount?: number;
    }
  ): {
    targets: MultiTP[];
  } => {
    if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
      return { targets: [] };
    }

    if (feature === 'multiTp') {
      const sourceTargets = rawTargets;
      const normalizedBatch = normalizeMultiTpTargets(sourceTargets);
      const { limited, overflow } = enforceMultiTargetLimit(
        normalizedBatch,
        maxTargets
      );

      if (overflow.length > 0) {
        warnings.push(
          `[multiTp] supports a maximum of ${maxTargets} targets. Extra targets were dropped from the payload.`
        );
      }

      const sanitizedTargets: MultiTP[] = [];
      let normalizedIndex = 0;

      sourceTargets.forEach((rawTarget, index) => {
        if (!rawTarget) {
          warnings.push(
            `[multiTp] target at index ${index} is undefined and was skipped`
          );
          return;
        }

        if (normalizedIndex >= limited.length) {
          return;
        }

        const normalized = limited[normalizedIndex];
        normalizedIndex += 1;

        if (!normalized) {
          return;
        }

        const resolvedId = normalized.uuid || `multiTp-${index}`;

        const isPercentageBound = !!vars?.paths.find(
          (p) => p.path === getBindingPath(feature, resolvedId, 'target')
        );
        const isAmountBound = !!vars?.paths.find(
          (p) => p.path === getBindingPath(feature, resolvedId, 'amount')
        );

        const percentageRaw =
          typeof rawTarget.target === 'string'
            ? rawTarget.target.trim()
            : rawTarget.target !== undefined && rawTarget.target !== null
              ? String(rawTarget.target)
              : '';

        if (!percentageRaw && !isPercentageBound) {
          warnings.push(
            `[multiTp] target ${index + 1} is missing a percentage and was skipped`
          );
          return;
        }

        const percentageValue = Number(normalized.target);
        if (!Number.isFinite(percentageValue)) {
          if (!isPercentageBound) {
            warnings.push(
              `[multiTp] target ${index + 1} has an invalid percentage and was skipped`
            );
            return;
          }
        } else if (
          !allowNegative &&
          percentageValue < 0 &&
          !isPercentageBound
        ) {
          errors.push(
            `[multiTp] target ${index + 1} percentage must be positive.`
          );
          return;
        }

        const amountRaw =
          typeof rawTarget.amount === 'string'
            ? rawTarget.amount.trim()
            : rawTarget.amount !== undefined && rawTarget.amount !== null
              ? String(rawTarget.amount)
              : '';

        if (amountRaw) {
          const parsed = Number(amountRaw);
          if (!Number.isFinite(parsed) && !isAmountBound) {
            errors.push(`[multiTp] target ${index + 1} has an invalid amount.`);
            return;
          }
        }

        const amountValue = Number(normalized.amount ?? '0');
        if (!Number.isFinite(amountValue)) {
          if (!isAmountBound) {
            errors.push(`[multiTp] target ${index + 1} has an invalid amount.`);
            return;
          }
        } else if (!isAmountBound) {
          if (amountValue < 0) {
            errors.push(
              `[multiTp] target ${index + 1} amount must be at least 0%.`
            );
            return;
          }

          if (amountValue > 100) {
            errors.push(
              `[multiTp] target ${index + 1} amount cannot exceed 100%.`
            );
            return;
          }
        }

        const sanitizedTarget: MultiTP = {
          ...normalized,
          uuid: normalized.uuid ?? resolvedId,
          target: normalized.target,
          amount: normalized.amount,
        };

        sanitizedTargets.push(sanitizedTarget);
      });

      const totalAmount = sanitizedTargets.reduce((acc, target) => {
        const value = Number(target.amount);
        return Number.isFinite(value) ? acc + value : acc;
      }, 0);

      if (totalAmount > maxTotalAmount + 1e-6) {
        errors.push(
          `[multiTp] combined allocation cannot exceed ${maxTotalAmount}%.`
        );
      }
      return { targets: sanitizedTargets };
    }

    // multiSl branch retains legacy behaviour
    const limitedTargets = rawTargets.slice(0, maxTargets);
    if (rawTargets.length > maxTargets) {
      warnings.push(
        `[multiSl] supports a maximum of ${maxTargets} targets. Extra targets were dropped from the payload.`
      );
    }

    const normalizedTargets: MultiTP[] = [];

    limitedTargets.forEach((target, index) => {
      if (!target) {
        warnings.push(
          `[multiSl] target at index ${index} is undefined and was skipped`
        );
        return;
      }
      const resolvedId = target.uuid || `${feature}-${index}`;

      const percentageRaw =
        typeof target.target === 'string' ? target.target.trim() : '';
      const amountRaw =
        typeof target.amount === 'string' ? target.amount.trim() : '';

      const isPercentageBound = !!vars?.paths.find(
        (p) => p.path === getBindingPath(feature, resolvedId, 'target')
      );
      const isAmountBound = !!vars?.paths.find(
        (p) => p.path === getBindingPath(feature, resolvedId, 'target')
      );

      if (!percentageRaw && !isPercentageBound) {
        warnings.push(
          `[${feature}] target ${index + 1} is missing a percentage and was skipped`
        );
        return;
      }

      const percentageValue = Number(percentageRaw);
      if (!Number.isFinite(percentageValue)) {
        if (!isPercentageBound) {
          warnings.push(
            `[${feature}] target ${index + 1} has an invalid percentage and was skipped`
          );
          return;
        }
      } else {
        if (!allowNegative && percentageValue < 0 && !isPercentageBound) {
          errors.push(
            `[${feature}] target ${index + 1} percentage must be positive.`
          );
          return;
        }

        if (allowNegative && !isPercentageBound) {
          // For stop loss, we accept both positive and negative values
          // because when editing an existing deal, the SL reference is the entry price
          // and a positive percentage could still be below current price.
          // The UI validation checks against current price.

          const absValue = Math.abs(percentageValue);
          if (absValue < MIN_DCA_TP_NEW) {
            errors.push(
              `[${feature}] target ${index + 1} stop loss must be at least ${MIN_DCA_TP_NEW}% in magnitude`
            );
            return;
          }
        }
      }

      let sanitizedAmount = amountRaw || '0';
      const amountValue = Number(sanitizedAmount);
      if (!Number.isFinite(amountValue)) {
        if (!isAmountBound) {
          errors.push(
            `[${feature}] target ${index + 1} has an invalid amount.`
          );
          return;
        }
      } else if (!isAmountBound) {
        const minAmount = feature === 'multiSl' ? 1 : 0;
        if (amountValue < minAmount) {
          errors.push(
            `[${feature}] target ${index + 1} amount must be at least ${minAmount}%.`
          );
          return;
        }

        if (amountValue > 100) {
          errors.push(
            `[${feature}] target ${index + 1} amount cannot exceed 100%.`
          );
          return;
        }

        sanitizedAmount = amountValue.toString();
      }

      const normalizedTarget: MultiTP = {
        uuid: target.uuid ?? resolvedId,
        target: percentageRaw || '0',
        amount: sanitizedAmount,
      };

      normalizedTargets.push(normalizedTarget);
    });

    const totalAmount = normalizedTargets.reduce((acc, target) => {
      const value = Number(target.amount);
      if (!Number.isFinite(value)) {
        return acc;
      }
      return acc + value;
    }, 0);

    if (totalAmount > maxTotalAmount + 1e-6) {
      errors.push(
        `[${feature}] combined allocation cannot exceed ${maxTotalAmount}%.`
      );
    }

    return { targets: normalizedTargets };
  };

  const sanitizeNumericField = (
    fieldName: keyof DCABotSettings,
    rawValue: string | number | undefined,
    {
      defaultValue,
      allowNegative = false,
      skipOnEmpty = false,
      min,
    }: {
      defaultValue?: string;
      allowNegative?: boolean;
      skipOnEmpty?: boolean;
      min?: number;
    } = {}
  ): string | undefined => {
    fieldsProcessed.push(fieldName);

    if (rawValue === undefined || rawValue === null) {
      if (skipOnEmpty) {
        fieldsSkipped.push(fieldName);
        return undefined;
      }
      if (defaultValue !== undefined) {
        fieldsMapped.push(fieldName);
        return defaultValue;
      }
      fieldsSkipped.push(fieldName);
      return undefined;
    }

    const valueString =
      typeof rawValue === 'number' ? String(rawValue) : rawValue.trim();

    if (!valueString) {
      if (skipOnEmpty) {
        fieldsSkipped.push(fieldName);
        return undefined;
      }
      if (defaultValue !== undefined) {
        fieldsMapped.push(fieldName);
        return defaultValue;
      }
      fieldsSkipped.push(fieldName);
      return undefined;
    }

    const parsed = Number(valueString);
    if (!Number.isFinite(parsed)) {
      errors.push(`${fieldName} must be a valid number`);
      fieldsSkipped.push(fieldName);
      return undefined;
    }

    if (!allowNegative && parsed < 0) {
      errors.push(`${fieldName} must be greater than or equal to 0`);
      fieldsSkipped.push(fieldName);
      return undefined;
    }

    if (typeof min === 'number' && parsed < min) {
      errors.push(`${fieldName} must be at least ${min}`);
      fieldsSkipped.push(fieldName);
      return undefined;
    }

    fieldsMapped.push(fieldName);
    return valueString;
  };

  try {
    const tpSlFields: Partial<
      Pick<
        DCABotSettings,
        | 'useTp'
        | 'tpPerc'
        | 'useFixedTPPrices'
        | 'fixedTpPrice'
        | 'useFixedSLPrices'
        | 'fixedSlPrice'
        | 'dealCloseCondition'
        | 'closeByTimer'
        | 'closeByTimerValue'
        | 'closeByTimerUnits'
        | 'useMinTP'
        | 'minTp'
        | 'multiTp'
        | 'useMultiTp'
        | 'stopDealLogic'
        | 'closeDealType'
        | 'closeOrderType'
        | 'indicators'
        | 'dynamicArLockValue'
        | 'comboTpLimit'
        | 'comboTpBase'
        | 'trailingTp'
        | 'trailingTpPerc'
        | 'useSl'
        | 'slPerc'
        | 'baseSlOn'
        | 'comboSlLimit'
        | 'dealCloseConditionSL'
        | 'useSmartOrders'
        | 'useMultiSl'
        | 'multiSl'
        | 'trailingSl'
        | 'moveSL'
        | 'moveSLForAll'
        | 'moveSLTrigger'
        | 'moveSLValue'
        | 'stopDealSlLogic'
      >
    > = {};

    // Take profit enablement and percentage
    fieldsProcessed.push('useTp');
    tpSlFields['useTp'] = Boolean(useTp);
    fieldsMapped.push('useTp');

    const tpPercValue = sanitizeNumericField('tpPerc', tpPerc ?? '0', {
      allowNegative: false,
      defaultValue: '0',
    });
    if (tpPercValue !== undefined) {
      tpSlFields['tpPerc'] = tpPercValue;
    }

    // Fixed TP price toggle
    fieldsProcessed.push('useFixedTPPrices');
    const useFixedTPPrices = Boolean(_useFixedTPPrices);
    tpSlFields['useFixedTPPrices'] = useFixedTPPrices;
    fieldsMapped.push('useFixedTPPrices');

    fieldsProcessed.push('fixedTpPrice');
    const fixedTpPriceValue = sanitizeNumericField(
      'fixedTpPrice',
      fixedTpPrice,
      {
        allowNegative: false,
        skipOnEmpty: !useFixedTPPrices,
        min: 0,
      }
    );

    if (fixedTpPriceValue !== undefined) {
      if (useFixedTPPrices && Number(fixedTpPriceValue) === 0) {
        warnings.push(
          'Fixed TP price must be greater than 0 when price mode is enabled; disabling fixed TP mode.'
        );
        tpSlFields['useFixedTPPrices'] = false;
        fieldsSkipped.push('fixedTpPrice');
      } else {
        tpSlFields['fixedTpPrice'] = fixedTpPriceValue;
        fieldsMapped.push('fixedTpPrice');
      }
    } else if (useFixedTPPrices) {
      warnings.push(
        'useFixedTPPrices enabled but no valid fixedTpPrice provided; disabling fixed TP mode.'
      );
      tpSlFields['useFixedTPPrices'] = false;
      fieldsSkipped.push('fixedTpPrice');
    } else {
      fieldsSkipped.push('fixedTpPrice');
    }

    // The stop-loss half of fixed prices, mirroring the take-profit block
    // above. It had no mapping at all — neither field was even read from the
    // form — so StopLossSettings could switch the SL to a fixed price and the
    // payload still carried the defaults (`useFixedSLPrices: false`,
    // `fixedSlPrice: ''`), silently discarding it.
    fieldsProcessed.push('useFixedSLPrices');
    const useFixedSLPrices = Boolean(_useFixedSLPrices);
    tpSlFields['useFixedSLPrices'] = useFixedSLPrices;
    fieldsMapped.push('useFixedSLPrices');

    fieldsProcessed.push('fixedSlPrice');
    const fixedSlPriceValue = sanitizeNumericField(
      'fixedSlPrice',
      fixedSlPrice,
      {
        allowNegative: false,
        skipOnEmpty: !useFixedSLPrices,
        min: 0,
      }
    );

    if (fixedSlPriceValue !== undefined) {
      if (useFixedSLPrices && Number(fixedSlPriceValue) === 0) {
        warnings.push(
          'Fixed SL price must be greater than 0 when price mode is enabled; disabling fixed SL mode.'
        );
        tpSlFields['useFixedSLPrices'] = false;
        fieldsSkipped.push('fixedSlPrice');
      } else {
        tpSlFields['fixedSlPrice'] = fixedSlPriceValue;
        fieldsMapped.push('fixedSlPrice');
      }
    } else if (useFixedSLPrices) {
      warnings.push(
        'useFixedSLPrices enabled but no valid fixedSlPrice provided; disabling fixed SL mode.'
      );
      tpSlFields['useFixedSLPrices'] = false;
      fieldsSkipped.push('fixedSlPrice');
    } else {
      fieldsSkipped.push('fixedSlPrice');
    }

    // Deal close condition selection
    fieldsProcessed.push('dealCloseCondition');
    let resolvedDealCloseCondition =
      dealCloseCondition || CloseConditionEnum.tp;
    if (!allowedCloseConditions.has(resolvedDealCloseCondition)) {
      warnings.push(
        `Unsupported deal close option "${dealCloseCondition}"; falling back to percentage close`
      );
      fieldsSkipped.push('dealCloseCondition');
      resolvedDealCloseCondition = CloseConditionEnum.tp;
    } else {
      fieldsMapped.push('dealCloseCondition');
    }
    tpSlFields['dealCloseCondition'] = resolvedDealCloseCondition;
    fieldsMapped.push('dealCloseCondition');

    // Close by timer toggle
    fieldsProcessed.push('closeByTimer');
    const useCloseByTimer = Boolean(closeByTimer);
    tpSlFields['closeByTimer'] = useCloseByTimer;
    fieldsMapped.push('closeByTimer');

    // Close by timer value and units
    if (useCloseByTimer) {
      fieldsProcessed.push('closeByTimerValue', 'closeByTimerUnits');

      const timerValue = sanitizeNumericField(
        'closeByTimerValue',
        closeByTimerValue,
        {
          allowNegative: false,
          min: 1,
        }
      );

      if (timerValue !== undefined) {
        tpSlFields['closeByTimerValue'] = +timerValue;
        fieldsMapped.push('closeByTimerValue');
      } else {
        warnings.push(
          'Close by timer enabled but no valid timer value provided'
        );
        fieldsSkipped.push('closeByTimerValue');
      }

      const timerUnits = closeByTimerUnits || CooldownUnits.minutes;
      if (Object.values(CooldownUnits).includes(timerUnits)) {
        tpSlFields['closeByTimerUnits'] = timerUnits;
        fieldsMapped.push('closeByTimerUnits');
      } else {
        warnings.push(
          `Invalid timer units: ${timerUnits}. Defaulting to minutes`
        );
        tpSlFields['closeByTimerUnits'] = CooldownUnits.minutes;
        fieldsMapped.push('closeByTimerUnits');
      }
    } else {
      fieldsSkipped.push('closeByTimerValue', 'closeByTimerUnits');
    }

    // Minimum TP guard
    fieldsProcessed.push('useMinTP');
    const useMinTp = Boolean(useMinTP);
    tpSlFields['useMinTP'] = useMinTp;
    fieldsMapped.push('useMinTP');

    const minTpValue = sanitizeNumericField('minTp', minTp, {
      allowNegative: false,
      skipOnEmpty: !useMinTp,
      min: 0,
    });
    if (minTpValue !== undefined) {
      tpSlFields['minTp'] = minTpValue;
    }

    // Multiple TP targets
    fieldsProcessed.push('useMultiTp');
    const requestedUseMultiple = Boolean(useMultiTp ?? useMultiTp);
    let resolvedUseMultiple = requestedUseMultiple;

    fieldsProcessed.push('multiTp');
    if (requestedUseMultiple) {
      const { targets: sanitizedTargets } = sanitizeMultiTargets(multiTp, {
        allowNegative: false,
        feature: 'multiTp',
      });

      if (sanitizedTargets.length > 0) {
        resolvedUseMultiple = true;
        tpSlFields['multiTp'] = sanitizedTargets;
        fieldsMapped.push('multiTp');
      } else {
        warnings.push(
          'Multiple TP targets enabled but no valid targets were provided'
        );
        fieldsSkipped.push('multiTp');
        resolvedUseMultiple = false;
      }
    } else {
      fieldsSkipped.push('multiTp');
      resolvedUseMultiple = false;
    }

    tpSlFields['useMultiTp'] = resolvedUseMultiple;
    fieldsMapped.push('useMultiTp');

    // Indicator-based deal closing fields
    if (resolvedDealCloseCondition === CloseConditionEnum.techInd) {
      fieldsProcessed.push('stopDealLogic');
      const supportedLogic = new Set<IndicatorsLogicEnum>(
        Object.values(IndicatorsLogicEnum)
      );
      const stopLogic = stopDealLogic || IndicatorsLogicEnum.and;
      if (supportedLogic.has(stopLogic)) {
        tpSlFields['stopDealLogic'] = stopLogic;
        fieldsMapped.push('stopDealLogic');
      } else {
        warnings.push(
          `Unsupported stopDealLogic value "${stopDealLogic}"; defaulting to "and"`
        );
        tpSlFields['stopDealLogic'] = IndicatorsLogicEnum.and;
        fieldsMapped.push('stopDealLogic');
      }

      fieldsProcessed.push('closeDealType');
      const allowedCloseDealTypes = new Set<string>(
        Object.values(CloseDCATypeEnum)
      );
      const dealType = closeDealType ?? CloseDCATypeEnum.closeByLimit;
      if (allowedCloseDealTypes.has(dealType)) {
        tpSlFields['closeDealType'] = dealType;
        fieldsMapped.push('closeDealType');
      } else {
        warnings.push(
          `Unsupported closeDealType "${closeDealType}"; defaulting to limit close`
        );
        tpSlFields['closeDealType'] = CloseDCATypeEnum.closeByLimit;
        fieldsMapped.push('closeDealType');
      }

      const closeIndicators = Array.isArray(indicators)
        ? indicators.filter(
            (i) =>
              i.indicatorAction === IndicatorAction.closeDeal &&
              i.section !== IndicatorSection.sl
          )
        : [];
      if (closeIndicators.length > 0) {
        tpSlFields['indicators'] = indicators.map((indicator) => {
          return closeIndicators.find((i) => i.uuid === indicator.uuid)
            ? serializeIndicatorConfig(indicator as IndicatorConfig, {
                warnings,
                overrides: {
                  indicatorAction: IndicatorAction.closeDeal,
                  section: undefined,
                },
              })
            : indicator;
        });
      }
      if (closeIndicators.length > 0) {
        fieldsMapped.push('indicators');
      }
      if (!closeIndicators.length) {
        fieldsSkipped.push('indicators');
      }

      fieldsSkipped.push('dynamicArLockValue');
    } else if (resolvedDealCloseCondition === CloseConditionEnum.dynamicAr) {
      fieldsSkipped.push('stopDealLogic');

      fieldsProcessed.push('closeDealType');
      const allowedCloseDealTypes = new Set<string>(
        Object.values(CloseDCATypeEnum)
      );
      const dealType = closeDealType ?? CloseDCATypeEnum.closeByLimit;
      if (allowedCloseDealTypes.has(dealType)) {
        tpSlFields['closeDealType'] = dealType;
        fieldsMapped.push('closeDealType');
      } else {
        warnings.push(
          `Unsupported closeDealType "${closeDealType}"; defaulting to limit close`
        );
        tpSlFields['closeDealType'] = CloseDCATypeEnum.closeByLimit;
        fieldsMapped.push('closeDealType');
      }

      fieldsProcessed.push('dynamicArLockValue');
      const dynamicArLockValue =
        typeof _dynamicArLockValue === 'boolean' ? _dynamicArLockValue : true;
      tpSlFields['dynamicArLockValue'] = dynamicArLockValue;
      fieldsMapped.push('dynamicArLockValue');

      // Serialize the ATR/ADR close indicators like the techInd branch does.
      // Without this no mapper section contributes closeDeal indicators when
      // the close condition is dynamicAr (the Start section filters to
      // startDeal only), so the configured ATR/ADR silently vanished on save.
      const closeIndicators = Array.isArray(indicators)
        ? indicators.filter(
            (i) =>
              i.indicatorAction === IndicatorAction.closeDeal &&
              i.section !== IndicatorSection.sl
          )
        : [];
      if (closeIndicators.length > 0) {
        tpSlFields['indicators'] = indicators.map((indicator) => {
          return closeIndicators.find((i) => i.uuid === indicator.uuid)
            ? serializeIndicatorConfig(indicator as IndicatorConfig, {
                warnings,
                overrides: {
                  indicatorAction: IndicatorAction.closeDeal,
                  section: undefined,
                },
              })
            : indicator;
        });
        fieldsMapped.push('indicators');
      } else {
        fieldsSkipped.push('indicators');
      }
    } else {
      fieldsSkipped.push(
        'stopDealLogic',
        'closeDealType',
        'dynamicArLockValue'
      );
    }

    // Close order type is offered for every non-combo, non-hedge bot with no
    // dependence on the close condition (TakeProfitSettings), so it has to be
    // mapped unconditionally. It used to be written only inside the technical-
    // indicator and dynamic-AR branches; on the default take-profit condition
    // it fell into `fieldsSkipped`, and since the payload is built as
    // `{ ...DCA_FORM_DEFAULTS, ...finalData }` a skipped field does not stay
    // absent — it comes back as the factory default. So a user who chose MARKET
    // had it silently rewritten to LIMIT on save.
    fieldsProcessed.push('closeOrderType');
    const allowedOrderTypes = new Set<string>(Object.values(OrderTypeEnum));
    const orderType = closeOrderType ?? OrderTypeEnum.limit;
    if (allowedOrderTypes.has(orderType)) {
      tpSlFields['closeOrderType'] = orderType;
      fieldsMapped.push('closeOrderType');
    } else {
      warnings.push(
        `Unsupported closeOrderType "${closeOrderType}"; defaulting to limit`
      );
      tpSlFields['closeOrderType'] = OrderTypeEnum.limit;
      fieldsMapped.push('closeOrderType');
    }

    fieldsProcessed.push('comboTpLimit');
    if (formData.type === 'combo') {
      tpSlFields['comboTpLimit'] = Boolean(comboTpLimit);
      fieldsMapped.push('comboTpLimit');
    } else {
      fieldsSkipped.push('comboTpLimit');
    }

    fieldsProcessed.push('comboTpBase');
    if (formData.type === 'combo') {
      const allowedComboBases = new Set<ComboTpBase>([
        ComboTpBase.full,
        ComboTpBase.filled,
      ]);
      const rawComboBase = (comboTpBase ?? ComboTpBase.full) as ComboTpBase;
      tpSlFields['comboTpBase'] = allowedComboBases.has(rawComboBase)
        ? rawComboBase
        : ComboTpBase.full;
      fieldsMapped.push('comboTpBase');
    } else {
      fieldsSkipped.push('comboTpBase');
    }

    // Trailing TP
    fieldsProcessed.push('trailingTp');
    const trailingTpEnabled = Boolean(trailingTp ?? trailingTp);
    tpSlFields['trailingTp'] = trailingTpEnabled;
    fieldsMapped.push('trailingTp');

    const trailingTpPercValue = sanitizeNumericField(
      'trailingTpPerc',
      trailingTpPerc,
      {
        allowNegative: false,
        skipOnEmpty: !trailingTpEnabled,
        min: 0,
      }
    );
    if (trailingTpPercValue !== undefined) {
      tpSlFields['trailingTpPerc'] = trailingTpPercValue;
    }

    const riskRewardActive = Boolean(useRiskReward);

    // Stop loss enablement and percentage
    fieldsProcessed.push('useSl');
    const stopLossEnabled = Boolean(useSl) && !riskRewardActive;
    tpSlFields['useSl'] = stopLossEnabled;
    fieldsMapped.push('useSl');

    if (riskRewardActive && useSl) {
      warnings.push(
        'Stop loss settings are locked while Risk:Reward management is enabled.'
      );
    }

    const slPercValue = sanitizeNumericField('slPerc', slPerc ?? '0', {
      allowNegative: true,
      defaultValue: '0',
      skipOnEmpty: !stopLossEnabled,
    });
    if (slPercValue !== undefined) {
      tpSlFields['slPerc'] = slPercValue;
    }

    fieldsProcessed.push('baseSlOn');
    const allowedBaseSlOn = new Set<BaseSlOnEnum>([
      BaseSlOnEnum.avg,
      BaseSlOnEnum.start,
    ]);
    const baseSlOnValue = baseSlOn ?? BaseSlOnEnum.avg;
    if (allowedBaseSlOn.has(baseSlOnValue)) {
      tpSlFields['baseSlOn'] = baseSlOnValue;
      fieldsMapped.push('baseSlOn');
    } else if (baseSlOn) {
      warnings.push(
        `Unsupported baseSlOn value "${baseSlOn}"; defaulting to avg`
      );
      tpSlFields['baseSlOn'] = BaseSlOnEnum.avg;
      fieldsMapped.push('baseSlOn');
    } else {
      tpSlFields['baseSlOn'] = BaseSlOnEnum.avg;
      fieldsMapped.push('baseSlOn');
    }

    fieldsProcessed.push('comboSlLimit');
    if (formData.type === 'combo') {
      tpSlFields['comboSlLimit'] = Boolean(comboSlLimit);
      fieldsMapped.push('comboSlLimit');
    } else {
      fieldsSkipped.push('comboSlLimit');
    }

    // Stop loss close condition
    fieldsProcessed.push('dealCloseConditionSL');
    let resolvedSlCondition = dealCloseConditionSL || CloseConditionEnum.tp;
    if (!allowedCloseConditions.has(resolvedSlCondition)) {
      warnings.push(
        `Unsupported SL close condition "${dealCloseConditionSL}"; defaulting to percentage`
      );
      fieldsSkipped.push('dealCloseConditionSL');
      resolvedSlCondition = CloseConditionEnum.tp;
    } else {
      fieldsMapped.push('dealCloseConditionSL');
    }
    tpSlFields['dealCloseConditionSL'] = resolvedSlCondition;

    // Smart orders toggle
    fieldsProcessed.push('useSmartOrders');
    tpSlFields['useSmartOrders'] = Boolean(useSmartOrders);
    fieldsMapped.push('useSmartOrders');

    // Multiple stop loss targets
    fieldsProcessed.push('useMultiSl');
    const useMultiSl = stopLossEnabled && Boolean(_useMultiSl);
    tpSlFields['useMultiSl'] = useMultiSl;
    fieldsMapped.push('useMultiSl');

    fieldsProcessed.push('multiSl');
    if (useMultiSl) {
      const { targets: sanitizedSlTargets } = sanitizeMultiTargets(multiSl, {
        allowNegative: true,
        feature: 'multiSl',
        maxTargets: 10,
        maxTotalAmount: 100,
      });

      if (sanitizedSlTargets.length > 0) {
        tpSlFields['multiSl'] = sanitizedSlTargets;
        fieldsMapped.push('multiSl');
      } else {
        warnings.push(
          'Multiple SL targets enabled but no valid targets were provided'
        );
        fieldsSkipped.push('multiSl');
      }
    } else {
      fieldsSkipped.push('multiSl');
    }

    // Trailing SL
    fieldsProcessed.push('trailingSl');
    const trailingSlEnabled = stopLossEnabled && Boolean(trailingSl);
    tpSlFields['trailingSl'] = trailingSlEnabled;
    fieldsMapped.push('trailingSl');

    // Move SL to breakeven
    fieldsProcessed.push('moveSL');
    const moveSlEnabled = stopLossEnabled && Boolean(moveSL);
    tpSlFields['moveSL'] = moveSlEnabled;
    fieldsMapped.push('moveSL');

    fieldsProcessed.push('moveSLForAll');
    const moveSlForAllEnabled = moveSlEnabled && Boolean(moveSLForAll);
    tpSlFields['moveSLForAll'] = moveSlForAllEnabled;
    fieldsMapped.push('moveSLForAll');

    const minMoveSlTrigger = Math.max(0.1, MIN_DCA_TP_NEW);
    const moveSlTrigger = sanitizeNumericField('moveSLTrigger', moveSLTrigger, {
      allowNegative: false,
      skipOnEmpty: !moveSlEnabled,
      min: minMoveSlTrigger,
    });
    if (moveSlTrigger !== undefined) {
      tpSlFields['moveSLTrigger'] = moveSlTrigger;
    }

    const moveSlValue = sanitizeNumericField('moveSLValue', moveSLValue, {
      allowNegative: false,
      skipOnEmpty: !moveSlEnabled,
      min: 0,
    });
    if (moveSlValue !== undefined) {
      tpSlFields['moveSLValue'] = moveSlValue;
    }

    if (
      moveSlEnabled &&
      moveSlTrigger !== undefined &&
      moveSlValue !== undefined
    ) {
      const triggerNum = Number(moveSlTrigger);
      const valueNum = Number(moveSlValue);
      if (
        Number.isFinite(triggerNum) &&
        Number.isFinite(valueNum) &&
        valueNum >= triggerNum
      ) {
        errors.push(
          'Move SL “Move to %” must be less than the trigger percentage.'
        );
      }
    }
    const shouldProcessStopLossIndicators =
      resolvedSlCondition === CloseConditionEnum.techInd && stopLossEnabled;
    // dynamicAr SL also stores its ATR/ADR indicators as closeDeal entries in
    // the shared array (section: sl) — they must be serialized too, or they
    // are dropped on save just like the take-profit dynamicAr case.
    const shouldSerializeStopLossIndicators =
      (resolvedSlCondition === CloseConditionEnum.techInd ||
        resolvedSlCondition === CloseConditionEnum.dynamicAr) &&
      stopLossEnabled;

    if (shouldProcessStopLossIndicators) {
      fieldsProcessed.push('stopDealSlLogic');
      const supportedSlLogic = new Set<IndicatorsLogicEnum>(
        Object.values(IndicatorsLogicEnum)
      );
      const stopDealSlLogic = _stopDealSlLogic || IndicatorsLogicEnum.and;
      if (supportedSlLogic.has(stopDealSlLogic)) {
        tpSlFields['stopDealSlLogic'] = stopDealSlLogic;
        fieldsMapped.push('stopDealSlLogic');
      } else if (stopDealSlLogic) {
        warnings.push(
          `Unsupported stopDealSlLogic value "${stopDealSlLogic}"; defaulting to "and"`
        );
        tpSlFields['stopDealSlLogic'] = IndicatorsLogicEnum.and;
        fieldsMapped.push('stopDealSlLogic');
      } else {
        tpSlFields['stopDealSlLogic'] = IndicatorsLogicEnum.and;
        fieldsMapped.push('stopDealSlLogic');
      }
    } else {
      fieldsSkipped.push('stopDealSlLogic');
    }

    if (shouldSerializeStopLossIndicators) {
      const closeIndicatorsSl = Array.isArray(indicators)
        ? indicators.filter(
            (i) =>
              i.indicatorAction === IndicatorAction.closeDeal &&
              i.section === IndicatorSection.sl
          )
        : [];
      if (closeIndicatorsSl.length > 0) {
        // Build on the array the TP branch may already have written so its
        // serialized close indicators are not overwritten with raw entries.
        const baseIndicators = tpSlFields['indicators'] ?? indicators;
        tpSlFields['indicators'] = baseIndicators.map((indicator) => {
          return closeIndicatorsSl.find((i) => i.uuid === indicator.uuid)
            ? serializeIndicatorConfig(indicator as IndicatorConfig, {
                warnings,
                overrides: {
                  indicatorAction: IndicatorAction.closeDeal,
                  section: IndicatorSection.sl,
                },
              })
            : indicator;
        });
      }
      if (closeIndicatorsSl.length > 0) {
        fieldsMapped.push('indicators');
      }
      if (!closeIndicatorsSl.length) {
        fieldsSkipped.push('indicators');
      }
    }

    const result: FieldMappingResult = {
      success: errors.length === 0,
      data: tpSlFields,
      warnings,
      debugInfo: {
        category: 'TP/SL Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };

    if (errors.length > 0) {
      result.errors = errors;
    }

    return result;
  } catch (error) {
    return {
      success: false,
      errors: [`TP/SL fields mapping failed: ${error}`],
      debugInfo: {
        category: 'TP/SL Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Risk:Reward mapping - Position sizing based on risk management
 */
export const mapRiskRewardFields = (
  formData: BotFormData
): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === 'combo';
  const useRiskReward = isComboBot
    ? formData.combo.useRiskReward
    : formData.dca.useRiskReward;
  const riskSlType = isComboBot
    ? formData.combo.riskSlType
    : formData.dca.riskSlType;
  const riskSlAmountPerc = isComboBot
    ? formData.combo.riskSlAmountPerc
    : formData.dca.riskSlAmountPerc;
  const riskSlAmountValue = isComboBot
    ? formData.combo.riskSlAmountValue
    : formData.dca.riskSlAmountValue;
  const riskUseTpRatio = isComboBot
    ? formData.combo.riskUseTpRatio
    : formData.dca.riskUseTpRatio;
  const riskTpRatio = isComboBot
    ? formData.combo.riskTpRatio
    : formData.dca.riskTpRatio;
  const riskMinSl = isComboBot
    ? formData.combo.riskMinSl
    : formData.dca.riskMinSl;
  const riskMaxSl = isComboBot
    ? formData.combo.riskMaxSl
    : formData.dca.riskMaxSl;
  const riskMinPositionSize = isComboBot
    ? formData.combo.riskMinPositionSize
    : formData.dca.riskMinPositionSize;
  const riskMaxPositionSize = isComboBot
    ? formData.combo.riskMaxPositionSize
    : formData.dca.riskMaxPositionSize;
  const rrSlType = isComboBot
    ? formData.combo.rrSlType
    : formData.dca.rrSlType;
  const rrSlFixedValue = isComboBot
    ? formData.combo.rrSlFixedValue
    : formData.dca.rrSlFixedValue;
  const indicators = isComboBot
    ? formData.combo.indicators
    : formData.dca.indicators;
  try {
    fieldsProcessed.push(
      'useRiskReward',
      'riskSlType',
      'riskSlAmountPerc',
      'riskSlAmountValue',
      'riskUseTpRatio',
      'riskTpRatio',
      'riskMinSl',
      'riskMaxSl',
      'riskMinPositionSize',
      'riskMaxPositionSize'
    );

    const riskRewardFields: Partial<
      Pick<
        DCABotSettings,
        | 'useRiskReward'
        | 'riskSlType'
        | 'riskSlAmountPerc'
        | 'riskSlAmountValue'
        | 'indicators'
        | 'riskUseTpRatio'
        | 'riskTpRatio'
        | 'riskMaxSl'
        | 'riskMinSl'
        | 'riskMinPositionSize'
        | 'riskMaxPositionSize'
        | 'rrSlType'
        | 'rrSlFixedValue'
      >
    > = {};

    // Only map Risk:Reward fields if the feature is enabled
    if (!useRiskReward) {
      fieldsSkipped.push(...fieldsProcessed);
      /* warnings.push('Risk:Reward feature is disabled, skipping all fields'); */
      return {
        success: true,
        data: {}, // Return empty object when disabled
        warnings,
        debugInfo: {
          category: 'Risk:Reward Fields',
          fieldsProcessed,
          fieldsMapped,
          fieldsSkipped,
        },
      };
    }

    // Risk:Reward enabled flag
    riskRewardFields['useRiskReward'] = useRiskReward;
    fieldsMapped.push('useRiskReward');

    // How the Risk:Reward stop loss is derived, and its value when fixed.
    // RiskRewardSettings offers both (the selector at line ~814, the value via
    // updateFormData) but neither had a mapping, so picking `fixed` was
    // replaced by the default `indicator` on save — and the value with `2`.
    // The rest of the risk family below was mapped correctly all along.
    fieldsProcessed.push('rrSlType', 'rrSlFixedValue');
    const normalizedRrSlType = Object.values(RRSlTypeEnum).includes(
      rrSlType as RRSlTypeEnum
    )
      ? (rrSlType as RRSlTypeEnum)
      : RRSlTypeEnum.indicator;
    riskRewardFields['rrSlType'] = normalizedRrSlType;
    fieldsMapped.push('rrSlType');

    // `sanitizeNumericField` is local to mapTpSlFields, and the value is a
    // signed string on the settings type, so validate it directly here.
    const rrSlFixedRaw = `${rrSlFixedValue ?? ''}`.trim();
    if (rrSlFixedRaw !== '' && Number.isFinite(Number(rrSlFixedRaw))) {
      riskRewardFields['rrSlFixedValue'] = rrSlFixedRaw;
      fieldsMapped.push('rrSlFixedValue');
    } else {
      if (normalizedRrSlType === RRSlTypeEnum.fixed) {
        warnings.push(
          `Risk:Reward SL type is "fixed" but rrSlFixedValue is not a number ("${rrSlFixedValue}"); leaving it unchanged.`
        );
      }
      fieldsSkipped.push('rrSlFixedValue');
    }

    // Risk type validation
    const normalizedRiskType = (() => {
      const rawType = riskSlType ?? RiskSlTypeEnum.perc;

      return rawType === RiskSlTypeEnum.perc
        ? RiskSlTypeEnum.perc
        : RiskSlTypeEnum.fixed;
    })();

    if (!normalizedRiskType) {
      errors.push(
        'Risk type must be either "perc" (percentage) or "fixed" (fixed amount)'
      );
      fieldsSkipped.push('riskSlType');
    } else {
      riskRewardFields['riskSlType'] = normalizedRiskType;
      fieldsMapped.push('riskSlType');

      // Risk amount based on type
      if (normalizedRiskType === 'perc') {
        const riskPerc = parseFloat(riskSlAmountPerc || '0');
        if (isNaN(riskPerc) || riskPerc < 0 || riskPerc > 100) {
          errors.push('Risk percentage must be between 0 and 100');
          fieldsSkipped.push('riskSlAmountPerc');
        } else {
          riskRewardFields['riskSlAmountPerc'] = riskSlAmountPerc;
          fieldsMapped.push('riskSlAmountPerc');
        }
      } else if (normalizedRiskType === 'fixed') {
        const riskValue = parseFloat(riskSlAmountValue || '0');
        if (isNaN(riskValue) || riskValue <= 0) {
          errors.push('Fixed risk amount must be greater than 0');
          fieldsSkipped.push('riskSlAmountValue');
        } else {
          riskRewardFields['riskSlAmountValue'] = riskSlAmountValue;
          fieldsMapped.push('riskSlAmountValue');
        }
      }
    }

    // Risk indicators mapping
    const riskRewardIndicators = indicators.filter(
      (i) => i.indicatorAction === IndicatorAction.riskReward
    );
    if (
      Array.isArray(riskRewardIndicators) &&
      riskRewardIndicators.length > 0
    ) {
      const indicatorPayload = riskRewardIndicators
        .filter(Boolean)
        .map((indicator) =>
          serializeIndicatorConfig(indicator as IndicatorConfig, {
            warnings,
            overrides: {
              indicatorAction: IndicatorAction.riskReward,
            },
          })
        );
      riskRewardFields['indicators'] = indicators.map(
        (indicator) =>
          indicatorPayload.find((i) => i.uuid === indicator.uuid) ?? indicator
      );

      fieldsMapped.push('indicators');
    } else {
      errors.push(
        'At least one indicator is required when Risk:Reward is enabled'
      );
      fieldsSkipped.push('indicators');
    }

    // Use reward ratio
    riskRewardFields['riskUseTpRatio'] = riskUseTpRatio;
    fieldsMapped.push('riskUseTpRatio');

    // Reward ratio (only if reward is enabled)
    if (riskUseTpRatio) {
      const tpRatio = parseFloat(riskTpRatio || '1');
      if (isNaN(tpRatio) || tpRatio <= 0) {
        errors.push('Reward ratio must be greater than 0');
        fieldsSkipped.push('riskTpRatio');
      } else {
        riskRewardFields['riskTpRatio'] = riskTpRatio;
        fieldsMapped.push('riskTpRatio');
      }
    }

    // Min/Max SL percentages
    const minSl = parseFloat(riskMinSl || '0');
    const maxSl = parseFloat(riskMaxSl || '0');

    if (!Number.isFinite(minSl)) {
      errors.push('Min SL % must be a valid number');
      fieldsSkipped.push('riskMinSl');
    } else {
      riskRewardFields['riskMinSl'] = riskMinSl;
      fieldsMapped.push('riskMinSl');
    }

    if (!Number.isFinite(maxSl)) {
      errors.push('Max SL % must be a valid number');
      fieldsSkipped.push('riskMaxSl');
    } else {
      riskRewardFields['riskMaxSl'] = riskMaxSl;
      fieldsMapped.push('riskMaxSl');
    }

    // Position size limits (for DCA bots)
    if (formData.type === 'dca') {
      const minPosSize = parseFloat(riskMinPositionSize || '0');
      const maxPosSize = parseFloat(riskMaxPositionSize || '0');

      if (!isNaN(minPosSize) && minPosSize >= 0) {
        riskRewardFields['riskMinPositionSize'] = riskMinPositionSize;
        fieldsMapped.push('riskMinPositionSize');
      } else {
        fieldsSkipped.push('riskMinPositionSize');
        warnings.push('Invalid min position size, skipping');
      }

      if (!isNaN(maxPosSize) && (maxPosSize > 0 || maxPosSize === -1)) {
        riskRewardFields['riskMaxPositionSize'] = riskMaxPositionSize;
        fieldsMapped.push('riskMaxPositionSize');
      } else {
        fieldsSkipped.push('riskMaxPositionSize');
        warnings.push('Invalid max position size, skipping');
      }
    } else {
      fieldsSkipped.push('riskMinPositionSize', 'riskMaxPositionSize');
      warnings.push('Position size limits only apply to DCA bots');
    }

    return {
      success: errors.length === 0,
      data: riskRewardFields,
      errors,
      warnings,
      debugInfo: {
        category: 'Risk:Reward Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Risk:Reward fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Risk:Reward Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Futures/Leverage mapping - NEW support
 */
export const mapFuturesFields = (formData: BotFormData): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === 'combo';
  const futures = isComboBot ? formData.combo.futures : formData.dca.futures;
  const leverage = isComboBot ? formData.combo.leverage : formData.dca.leverage;
  const marginType = isComboBot
    ? formData.combo.marginType
    : formData.dca.marginType;
  const coinm = isComboBot ? formData.combo.coinm : formData.dca.coinm;
  try {
    fieldsProcessed.push('futures', 'leverage', 'marginType', 'coinm');

    const futuresFields: Partial<
      Pick<DCABotSettings, 'futures' | 'coinm' | 'marginType' | 'leverage'>
    > = {};

    // Futures mode
    futuresFields['futures'] = futures;
    fieldsMapped.push('futures');

    // Leverage validation
    if (futures) {
      if ((leverage ?? 1) < 1 || (leverage ?? 1) > 125) {
        errors.push('Leverage must be between 1x and 125x');
        fieldsSkipped.push('leverage');
      } else {
        futuresFields['leverage'] = parseFloat((leverage ?? 1).toString()); // Ensure it's a float as expected by schema
        fieldsMapped.push('leverage');
      }

      // Margin type validation
      if (
        ![BotMarginTypeEnum.cross, BotMarginTypeEnum.isolated].includes(
          marginType || BotMarginTypeEnum.isolated
        )
      ) {
        errors.push('Margin type must be isolated or cross');
        fieldsSkipped.push('marginType');
      } else {
        futuresFields['marginType'] = marginType;
        fieldsMapped.push('marginType');
      }
    } else {
      // For spot trading, set defaults
      futuresFields['leverage'] = 1; // Ensure float type
      futuresFields['marginType'] = BotMarginTypeEnum.isolated;
      fieldsMapped.push('leverage', 'marginType');
    }

    // Coin-M futures
    futuresFields['coinm'] = coinm;
    fieldsMapped.push('coinm');

    return {
      success: errors.length === 0,
      data: futuresFields,
      errors,
      warnings,
      debugInfo: {
        category: 'Futures Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Futures fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Futures Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Bot Controller mapping - Enhanced with comprehensive validation
 */
export const mapBotControllerFields = (
  formData: BotFormData
): FieldMappingResult => {
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const isComboBot = formData.type === 'combo';
  const useBotController = isComboBot
    ? formData.combo.useBotController
    : formData.dca.useBotController;
  const botActualStart = isComboBot
    ? formData.combo.botActualStart
    : formData.dca.botActualStart;
  const botStart = isComboBot ? formData.combo.botStart : formData.dca.botStart;
  const startBotLogic = isComboBot
    ? formData.combo.startBotLogic
    : formData.dca.startBotLogic;
  const stopBotLogic = isComboBot
    ? formData.combo.stopBotLogic
    : formData.dca.stopBotLogic;
  const stopType = isComboBot ? formData.combo.stopType : formData.dca.stopType;
  const stopStatus = isComboBot
    ? formData.combo.stopStatus
    : formData.dca.stopStatus;
  const startBotPriceCondition = isComboBot
    ? formData.combo.startBotPriceCondition
    : formData.dca.startBotPriceCondition;
  const startBotPriceValue = isComboBot
    ? formData.combo.startBotPriceValue
    : formData.dca.startBotPriceValue;
  const stopBotPriceCondition = isComboBot
    ? formData.combo.stopBotPriceCondition
    : formData.dca.stopBotPriceCondition;
  const stopBotPriceValue = isComboBot
    ? formData.combo.stopBotPriceValue
    : formData.dca.stopBotPriceValue;
  const useCloseAfterX = isComboBot
    ? formData.combo.useCloseAfterX
    : formData.dca.useCloseAfterX;
  const _closeAfterX = isComboBot
    ? formData.combo.closeAfterX
    : formData.dca.closeAfterX;
  const useCloseAfterXwin = isComboBot
    ? formData.combo.useCloseAfterXwin
    : formData.dca.useCloseAfterXwin;
  const _closeAfterXwin = isComboBot
    ? formData.combo.closeAfterXwin
    : formData.dca.closeAfterXwin;
  const useCloseAfterXloss = isComboBot
    ? formData.combo.useCloseAfterXloss
    : formData.dca.useCloseAfterXloss;
  const _closeAfterXloss = isComboBot
    ? formData.combo.closeAfterXloss
    : formData.dca.closeAfterXloss;
  const useCloseAfterXprofit = isComboBot
    ? formData.combo.useCloseAfterXprofit
    : formData.dca.useCloseAfterXprofit;
  const closeAfterXprofitCond = isComboBot
    ? formData.combo.closeAfterXprofitCond
    : formData.dca.closeAfterXprofitCond;
  const closeAfterXprofitValue = isComboBot
    ? formData.combo.closeAfterXprofitValue
    : formData.dca.closeAfterXprofitValue;
  const useCloseAfterXopen = isComboBot
    ? formData.combo.useCloseAfterXopen
    : formData.dca.useCloseAfterXopen;
  const _closeAfterXopen = isComboBot
    ? formData.combo.closeAfterXopen
    : formData.dca.closeAfterXopen;
  const _maxNumberOfOpenDeals = isComboBot
    ? formData.combo.maxNumberOfOpenDeals
    : formData.dca.maxNumberOfOpenDeals;
  const indicators = isComboBot
    ? formData.combo.indicators
    : formData.dca.indicators;
  try {
    if (!useBotController) {
      return {
        success: true,
        data: {}, // Return empty object - don't send any controller fields when disabled
        debugInfo: {
          category: 'Bot Controller Fields',
          fieldsProcessed: ['useBotController'],
          fieldsMapped: [],
          fieldsSkipped: [
            'useBotController',
            'botActualStart',
            'stopType',
            'stopStatus',
            'startBotPriceCondition',
            'startBotPriceValue',
            'stopBotPriceCondition',
            'stopBotPriceValue',
            'useCloseAfterX',
            'closeAfterX',
            'useCloseAfterXwin',
            'closeAfterXwin',
            'useCloseAfterXloss',
            'closeAfterXloss',
            'useCloseAfterXprofit',
            'closeAfterXprofitCond',
            'closeAfterXprofitValue',
            'useCloseAfterXopen',
            'closeAfterXopen',
          ],
        },
      };
    }

    fieldsProcessed.push(
      'useBotController',
      'botActualStart',
      'botStart',
      'stopStatus',
      'startBotPriceCondition',
      'startBotPriceValue',
      'stopBotPriceCondition',
      'stopBotPriceValue',
      'useCloseAfterX',
      'closeAfterX',
      'useCloseAfterXwin',
      'closeAfterXwin',
      'useCloseAfterXloss',
      'closeAfterXloss',
      'useCloseAfterXprofit',
      'closeAfterXprofitCond',
      'closeAfterXprofitValue',
      'useCloseAfterXopen',
      'closeAfterXopen'
    );

    // Validate botStartType
    const validStartTypes = Object.values(BotStartTypeEnum);
    if (!validStartTypes.includes(botActualStart || BotStartTypeEnum.manual)) {
      errors.push(
        `Invalid botStartType: ${botActualStart}. Must be one of: ${validStartTypes.join(', ')}`
      );
    }

    // Validate botStopType
    if (!validStartTypes.includes(botStart || BotStartTypeEnum.manual)) {
      errors.push(
        `Invalid botStopType: ${botStart}. Must be one of: ${validStartTypes.join(', ')}`
      );
    }

    // Validate stopAction
    const validStopActions = Object.values(CloseDCATypeEnum);
    if (!validStopActions.includes(stopType || CloseDCATypeEnum.leave)) {
      errors.push(
        `Invalid stopAction: ${stopType}. Must be one of: ${validStopActions.join(', ')}`
      );
    }

    // Validate stopStatus
    const validStopStatuses: BotStatus[] = ['closed', 'monitoring'];
    if (!validStopStatuses.includes(stopStatus || 'closed')) {
      errors.push(
        `Invalid stopStatus: ${stopStatus}. Must be one of: ${validStopStatuses.join(', ')}`
      );
    }

    // Validate price conditions and values when botStartType is 'price'
    const validConditions = [
      IndicatorStartConditionEnum.gt,
      IndicatorStartConditionEnum.lt,
    ];
    if (botActualStart === 'price') {
      if (
        !validConditions.includes(
          startBotPriceCondition || IndicatorStartConditionEnum.gt
        )
      ) {
        errors.push(
          `Invalid startBotPriceCondition: ${startBotPriceCondition}. Must be one of: ${validConditions.join(', ')}`
        );
      }

      const startPriceValue = parseFloat(startBotPriceValue || '0');
      if (isNaN(startPriceValue) || startPriceValue <= 0) {
        errors.push(
          `Invalid startBotPriceValue: ${startBotPriceValue}. Must be a positive number`
        );
      }
    }

    // Validate price conditions and values when botStopType is 'price'
    if (botStart === 'price') {
      if (
        !validConditions.includes(
          stopBotPriceCondition || IndicatorStartConditionEnum.gt
        )
      ) {
        errors.push(
          `Invalid stopBotPriceCondition: ${stopBotPriceCondition}. Must be one of: ${validConditions.join(', ')}`
        );
      }

      const stopPriceValue = parseFloat(stopBotPriceValue || '0');
      if (isNaN(stopPriceValue) || stopPriceValue <= 0) {
        errors.push(
          `Invalid stopBotPriceValue: ${stopBotPriceValue}. Must be a positive number`
        );
      }
    }

    // Validate closeAfterX values when enabled
    if (useCloseAfterX) {
      const closeAfterX = parseInt(_closeAfterX || '0');
      if (isNaN(closeAfterX) || closeAfterX <= 0) {
        errors.push(
          `Invalid closeAfterX: ${closeAfterX}. Must be a positive integer`
        );
      }
    }

    if (useCloseAfterXwin) {
      const closeAfterXwin = parseInt(_closeAfterXwin || '0');
      if (isNaN(closeAfterXwin) || closeAfterXwin <= 0) {
        errors.push(
          `Invalid closeAfterXwin: ${closeAfterXwin}. Must be a positive integer`
        );
      }
    }

    if (useCloseAfterXloss) {
      const closeAfterXloss = parseInt(_closeAfterXloss || '0');
      if (isNaN(closeAfterXloss) || closeAfterXloss <= 0) {
        errors.push(
          `Invalid closeAfterXloss: ${closeAfterXloss}. Must be a positive integer`
        );
      }
    }

    if (useCloseAfterXprofit) {
      if (
        !validConditions.includes(
          closeAfterXprofitCond || IndicatorStartConditionEnum.gt
        )
      ) {
        errors.push(
          `Invalid closeAfterXprofitCond: ${closeAfterXprofitCond}. Must be one of: ${validConditions.join(', ')}`
        );
      }

      const profitValue = parseFloat(closeAfterXprofitValue || '0');
      if (isNaN(profitValue)) {
        errors.push(
          `Invalid closeAfterXprofitValue: ${closeAfterXprofitValue}. Must be a valid number`
        );
      }
    }

    if (useCloseAfterXopen) {
      const closeAfterXopen = parseInt(_closeAfterXopen || '0');
      if (isNaN(closeAfterXopen) || closeAfterXopen <= 0) {
        errors.push(
          `Invalid closeAfterXopen: ${closeAfterXopen}. Must be a positive integer`
        );
      } else if (
        _maxNumberOfOpenDeals &&
        +_maxNumberOfOpenDeals > closeAfterXopen
      ) {
        // Legacy verifyInput: closeAfterXopen must be >= max open deals.
        errors.push(
          `Invalid closeAfterXopen: ${closeAfterXopen}. Must be greater than or equal to the max number of open deals (${_maxNumberOfOpenDeals})`
        );
      }
    }

    // If there are validation errors, return them
    if (errors.length > 0) {
      return {
        success: false,
        errors,
        warnings,
        debugInfo: {
          category: 'Bot Controller Fields',
          fieldsProcessed,
          fieldsMapped,
          fieldsSkipped,
        },
      };
    }

    const controllerFields: Partial<
      Pick<
        DCABotSettings,
        | 'useBotController'
        | 'botActualStart'
        | 'botStart'
        | 'startBotLogic'
        | 'stopBotLogic'
        | 'stopType'
        | 'stopStatus'
        | 'startBotPriceCondition'
        | 'startBotPriceValue'
        | 'stopBotPriceCondition'
        | 'stopBotPriceValue'
        | 'indicators'
        | 'useCloseAfterX'
        | 'closeAfterX'
        | 'useCloseAfterXwin'
        | 'closeAfterXwin'
        | 'useCloseAfterXloss'
        | 'closeAfterXloss'
        | 'useCloseAfterXprofit'
        | 'closeAfterXprofitCond'
        | 'closeAfterXprofitValue'
        | 'useCloseAfterXopen'
        | 'closeAfterXopen'
      >
    > = {
      useBotController: true,
      botActualStart: botActualStart, // Backend expects 'botActualStart'
      botStart: botStart, // Backend expects 'botStart' for stop type
      stopType: stopType, // Map stopAction to stopType for GraphQL
      stopStatus: stopStatus,
    };

    fieldsMapped.push(
      'useBotController',
      'botActualStart',
      'botStart',
      'stopType',
      'stopStatus'
    );

    // Conditionally add price-based start fields
    if (botActualStart === 'price') {
      controllerFields['startBotPriceCondition'] = startBotPriceCondition;
      controllerFields['startBotPriceValue'] = startBotPriceValue;
      fieldsMapped.push('startBotPriceCondition', 'startBotPriceValue');
    } else {
      fieldsSkipped.push('startBotPriceCondition', 'startBotPriceValue');
    }

    // Conditionally add price-based stop fields
    if (botStart === 'price') {
      controllerFields['stopBotPriceCondition'] = stopBotPriceCondition;
      controllerFields['stopBotPriceValue'] = stopBotPriceValue;
      fieldsMapped.push('stopBotPriceCondition', 'stopBotPriceValue');
    } else {
      fieldsSkipped.push('stopBotPriceCondition', 'stopBotPriceValue');
    }

    // Map indicator groups for start/stop bot conditions
    if (botActualStart === BotStartTypeEnum.indicators) {
      const startBotIndicators = indicators.filter(
        (i) => i.indicatorAction === IndicatorAction.startBot
      );
      if (startBotIndicators.length > 0) {
        controllerFields['indicators'] = indicators.map((indicator) => {
          return startBotIndicators.find((i) => i.uuid === indicator.uuid)
            ? serializeIndicatorConfig(indicator as IndicatorConfig, {
                warnings,
                overrides: {
                  indicatorAction: IndicatorAction.startBot,
                },
              })
            : indicator;
        });
        fieldsMapped.push('indicators');
      } else {
        fieldsSkipped.push('indicators');
      }
    }

    if (botStart === BotStartTypeEnum.indicators) {
      const stopBotIndicators = indicators.filter(
        (i) => i.indicatorAction === IndicatorAction.stopBot
      );
      if (stopBotIndicators.length > 0) {
        controllerFields['indicators'] = indicators.map((indicator) => {
          return stopBotIndicators.find((i) => i.uuid === indicator.uuid)
            ? serializeIndicatorConfig(indicator as IndicatorConfig, {
                warnings,
                overrides: {
                  indicatorAction: IndicatorAction.stopBot,
                },
              })
            : indicator;
        });
        fieldsMapped.push('indicators');
      } else {
        fieldsSkipped.push('indicators');
      }
    }

    // Always include closeAfterX fields (they're part of the schema)
    controllerFields['useCloseAfterX'] = useCloseAfterX;
    controllerFields['closeAfterX'] = _closeAfterX;
    fieldsMapped.push('useCloseAfterX', 'closeAfterX');

    controllerFields['useCloseAfterXwin'] = useCloseAfterXwin;
    controllerFields['closeAfterXwin'] = _closeAfterXwin;
    fieldsMapped.push('useCloseAfterXwin', 'closeAfterXwin');

    controllerFields['useCloseAfterXloss'] = useCloseAfterXloss;
    controllerFields['closeAfterXloss'] = _closeAfterXloss;
    fieldsMapped.push('useCloseAfterXloss', 'closeAfterXloss');

    controllerFields['useCloseAfterXprofit'] = useCloseAfterXprofit;
    controllerFields['closeAfterXprofitCond'] = closeAfterXprofitCond;
    controllerFields['closeAfterXprofitValue'] = closeAfterXprofitValue;
    fieldsMapped.push(
      'useCloseAfterXprofit',
      'closeAfterXprofitCond',
      'closeAfterXprofitValue'
    );

    controllerFields['useCloseAfterXopen'] = useCloseAfterXopen;
    controllerFields['closeAfterXopen'] = _closeAfterXopen;
    fieldsMapped.push('useCloseAfterXopen', 'closeAfterXopen');

    // AND/OR for the start-bot and stop-bot indicator lists. BotControllerSettings
    // renders both selects whenever the controller is on, but neither field had
    // any mapping — not even a read from the form — so switching either to OR
    // was replaced by the default `and` on save. Mapped unconditionally here,
    // like the closeAfterX group above: the controller being off is already
    // handled by the early return at the top of this mapper.
    const validLogic = new Set<string>(Object.values(IndicatorsLogicEnum));
    fieldsProcessed.push('startBotLogic', 'stopBotLogic');
    controllerFields['startBotLogic'] = validLogic.has(startBotLogic ?? '')
      ? startBotLogic
      : IndicatorsLogicEnum.and;
    controllerFields['stopBotLogic'] = validLogic.has(stopBotLogic ?? '')
      ? stopBotLogic
      : IndicatorsLogicEnum.and;
    fieldsMapped.push('startBotLogic', 'stopBotLogic');

    return {
      success: true,
      data: controllerFields,
      warnings,
      debugInfo: {
        category: 'Bot Controller Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Bot controller fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Bot Controller Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Experimental features mapping - Enhanced with validation
 */
export const mapExperimentalFields = (
  formData: BotFormData
): FieldMappingResult => {
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const warnings: string[] = [];
  const isComboBot = formData.type === 'combo';
  const futures = isComboBot ? formData.combo.futures : formData.dca.futures;
  const strategy = isComboBot ? formData.combo.strategy : formData.dca.strategy;
  const autoRebalancing = isComboBot
    ? formData.combo.autoRebalancing
    : formData.dca.autoRebalancing;
  const remainderFullAmount = isComboBot
    ? formData.combo.remainderFullAmount
    : formData.dca.remainderFullAmount;
  const adaptiveClose = isComboBot
    ? formData.combo.adaptiveClose
    : formData.dca.adaptiveClose;
  const feeOrder = isComboBot ? formData.combo.feeOrder : formData.dca.feeOrder;
  try {
    fieldsProcessed.push(
      'autoRebalancing',
      'remainderFullAmount',
      'adaptiveClose',
      'feeOrder'
    );

    const experimentalFields: Partial<
      Pick<
        DCABotSettings,
        'feeOrder' | 'adaptiveClose' | 'autoRebalancing' | 'remainderFullAmount'
      >
    > = {};

    const botType = formData.type ?? 'dca';
    const isComboBot = botType === 'combo';
    const isFutures = Boolean(futures);
    const exchangeSlug = (formData.exchangeUUID || '').toLowerCase();
    const isKucoin = exchangeSlug.includes('kucoin');
    const isLong = (strategy || '').toLowerCase() !== 'short';

    const addField = (
      field: keyof typeof experimentalFields,
      value: boolean
    ) => {
      experimentalFields[field] = value;
      fieldsMapped.push(field);
    };

    const skipField = (field: keyof DCABotSettings, reason?: string) => {
      fieldsSkipped.push(field);
      if (reason) {
        warnings.push(reason);
      }
    };

    // useExperimental is a UI convenience flag. We track it for debug purposes but do not persist it directly.

    const feeOrderSupported = isComboBot && !isFutures;
    if (feeOrderSupported) {
      const forcedOff = isKucoin && isLong && feeOrder === true;
      if (forcedOff) {
        warnings.push(
          'feeOrder cannot be enabled on KuCoin long bots and was forced off in the payload.'
        );
      }
      addField('feeOrder', forcedOff ? false : feeOrder === true);
    } else {
      // Not merely skipped: mapFormDataToBackend builds the payload as
      // `{ ...DCA_FORM_DEFAULTS, ...mappedFields }` and feeOrder defaults to
      // true there, so leaving the hole open made every save of a DCA bot (or
      // of a combo bot on futures — both configurations hide the toggle) write
      // `feeOrder: true` over whatever the bot actually had. That is not inert:
      // the DCA engine places separate fee orders and adjusts its balance
      // accounting off this flag. Echo what the form is holding — which is what
      // the bot has stored — so an untouchable setting survives the save.
      addField('feeOrder', feeOrder === true);
      if (feeOrder === true) {
        warnings.push(
          'feeOrder is not editable for this bot configuration; the stored value was preserved.'
        );
      }
    }

    const autoRebalancingSupported = isComboBot && !isFutures;
    if (autoRebalancingSupported) {
      addField('autoRebalancing', autoRebalancing === true);
    } else {
      skipField(
        'autoRebalancing',
        autoRebalancing === true
          ? 'autoRebalancing is not supported for this bot configuration and was dropped from the payload.'
          : undefined
      );
    }

    const remainderFullAmountSupported = !isComboBot;
    if (remainderFullAmountSupported) {
      addField('remainderFullAmount', remainderFullAmount === true);
    } else {
      skipField(
        'remainderFullAmount',
        remainderFullAmount === true
          ? 'remainderFullAmount only applies to standard DCA bots and was dropped from the payload.'
          : undefined
      );
    }

    // Adaptive close is available for both combo and standard DCA bots.
    addField('adaptiveClose', adaptiveClose === true);

    if (Object.keys(experimentalFields).length === 0) {
      warnings.push(
        'No experimental fields applicable for this configuration.'
      );
    }

    return {
      success: true,
      data: experimentalFields,
      warnings,
      debugInfo: {
        category: 'Experimental Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Experimental fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Experimental Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Start indicators mapping - Maps startIndicators to backend format
 */
export const mapStartFields = (formData: BotFormData): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === 'combo';
  const indicators = isComboBot
    ? formData.combo.indicators
    : formData.dca.indicators;
  const startDealLogic = isComboBot
    ? formData.combo.startDealLogic
    : formData.dca.startDealLogic;
  const useVolumeFilterAll = isComboBot
    ? formData.combo.useVolumeFilterAll
    : formData.dca.useVolumeFilterAll;
  const useVolumeFilter = isComboBot
    ? formData.combo.useVolumeFilter
    : formData.dca.useVolumeFilter;
  const volumeValue = isComboBot
    ? formData.combo.volumeValue
    : formData.dca.volumeValue;
  const volumeTop = isComboBot
    ? formData.combo.volumeTop
    : formData.dca.volumeTop;
  const useRelativeVolumeFilter = isComboBot
    ? formData.combo.useRelativeVolumeFilter
    : formData.dca.useRelativeVolumeFilter;
  const relativeVolumeValue = isComboBot
    ? formData.combo.relativeVolumeValue
    : formData.dca.relativeVolumeValue;
  const relativeVolumeTop = isComboBot
    ? formData.combo.relativeVolumeTop
    : formData.dca.relativeVolumeTop;
  const useMaxDealsPerHigherTimeframe = isComboBot
    ? formData.combo.useMaxDealsPerHigherTimeframe
    : formData.dca.useMaxDealsPerHigherTimeframe;
  const maxDealsPerHigherTimeframe = isComboBot
    ? formData.combo.maxDealsPerHigherTimeframe
    : formData.dca.maxDealsPerHigherTimeframe;
  try {
    fieldsProcessed.push(
      'stopDealLogic',
      'useVolumeFilterAll',
      'useVolumeFilter',
      'volumeValue',
      'volumeTop',
      'useRelativeVolumeFilter',
      'relativeVolumeValue',
      'relativeVolumeTop',
      'useMaxDealsPerHigherTimeframe',
      'maxDealsPerHigherTimeframe'
    );

    const startFields: Partial<
      Pick<
        DCABotSettings,
        | 'indicators'
        | 'startDealLogic'
        | 'useVolumeFilterAll'
        | 'useVolumeFilter'
        | 'volumeValue'
        | 'volumeTop'
        | 'useRelativeVolumeFilter'
        | 'relativeVolumeValue'
        | 'relativeVolumeTop'
        | 'useMaxDealsPerHigherTimeframe'
        | 'maxDealsPerHigherTimeframe'
      >
    > = {};

    // Map start indicators
    const startIndicators = indicators.filter(
      (i) => i.indicatorAction === IndicatorAction.startDeal
    );
    if (startIndicators && startIndicators.length > 0) {
      const indicators = startIndicators.filter(Boolean).map((indicator) =>
        serializeIndicatorConfig(indicator as IndicatorConfig, {
          warnings,
          overrides: {
            indicatorAction: IndicatorAction.startDeal,
          },
        })
      );
      startFields['indicators'] = indicators.map(
        (indicator) =>
          indicators.find((i) => i.uuid === indicator.uuid) ?? indicator
      );
      fieldsMapped.push('indicators');
    } else {
      fieldsSkipped.push('indicators');
    }

    // Map start indicator logic
    if (startDealLogic) {
      startFields['startDealLogic'] = startDealLogic;
      fieldsMapped.push('startDealLogic');
    } else {
      fieldsSkipped.push('startDealLogic');
    }

    const resolvedVolumePreset = volumeValue ?? VolumeValueEnum.top100;
    const resolvedRelativePreset =
      relativeVolumeValue ?? VolumeValueEnum.top100;

    startFields['useVolumeFilterAll'] = Boolean(useVolumeFilterAll);
    fieldsMapped.push('useVolumeFilterAll');

    if (useVolumeFilter) {
      startFields['useVolumeFilter'] = true;
      fieldsMapped.push('useVolumeFilter');

      startFields['volumeValue'] = resolvedVolumePreset;
      fieldsMapped.push('volumeValue');

      if (resolvedVolumePreset === VolumeValueEnum.custom) {
        const topRaw =
          typeof volumeTop === 'number'
            ? volumeTop
            : Number.parseInt(String(volumeTop ?? ''), 10);

        if (Number.isFinite(topRaw) && topRaw > 0) {
          const normalizedTop = Math.trunc(topRaw);
          startFields['volumeTop'] = String(normalizedTop);
          fieldsMapped.push('volumeTop');
        } else {
          errors.push('Custom top size must be a positive integer');
          fieldsSkipped.push('volumeTop');
        }
      } else {
        fieldsSkipped.push('volumeTop');
      }
    } else {
      startFields['useVolumeFilter'] = false;
      fieldsMapped.push('useVolumeFilter');
      fieldsSkipped.push('volumeValue', 'volumeTop');
    }

    if (useRelativeVolumeFilter) {
      startFields['useRelativeVolumeFilter'] = true;
      fieldsMapped.push('useRelativeVolumeFilter');

      startFields['relativeVolumeValue'] = resolvedRelativePreset;
      fieldsMapped.push('relativeVolumeValue');

      if (resolvedRelativePreset === VolumeValueEnum.custom) {
        const parsedRelative = parseFloat(relativeVolumeTop ?? '');
        if (!Number.isNaN(parsedRelative) && parsedRelative >= 0) {
          startFields['relativeVolumeTop'] = String(parsedRelative);
          fieldsMapped.push('relativeVolumeTop');
        } else {
          errors.push('Relative volume threshold must be a valid number');
          fieldsSkipped.push('relativeVolumeTop');
        }
      } else {
        fieldsSkipped.push('relativeVolumeTop');
      }
    } else {
      startFields['useRelativeVolumeFilter'] = false;
      fieldsMapped.push('useRelativeVolumeFilter');
      fieldsSkipped.push('relativeVolumeValue', 'relativeVolumeTop');
    }

    // Map higher timeframe deal limits
    if (useMaxDealsPerHigherTimeframe) {
      startFields['useMaxDealsPerHigherTimeframe'] = true;
      fieldsMapped.push('useMaxDealsPerHigherTimeframe');

      const maxDeals = parseInt(maxDealsPerHigherTimeframe || '0');
      if (!isNaN(maxDeals) && maxDeals > 0) {
        startFields['maxDealsPerHigherTimeframe'] = String(maxDeals);
        fieldsMapped.push('maxDealsPerHigherTimeframe');
      } else {
        errors.push(
          'Max deals per higher timeframe must be a positive integer when enabled'
        );
        fieldsSkipped.push('maxDealsPerHigherTimeframe');
      }
    } else {
      // Same reason as in mapDcaFields: the DCA_FORM_DEFAULTS spread would
      // otherwise turn the limiter back on whenever the user disables it.
      startFields['useMaxDealsPerHigherTimeframe'] = false;
      fieldsMapped.push('useMaxDealsPerHigherTimeframe');
      fieldsSkipped.push('maxDealsPerHigherTimeframe');
    }

    return {
      success: errors.length === 0,
      data: startFields,
      errors,
      warnings,
      debugInfo: {
        category: 'Start Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Start fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Start Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Indicator groups
 */
export const mapIndicatorGroupsFields = (
  formData: BotFormData
): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === 'combo';
  const indicators = isComboBot
    ? formData.combo.indicators
    : formData.dca.indicators;
  const indicatorGroups = isComboBot
    ? formData.combo.indicatorGroups
    : formData.dca.indicatorGroups;
  try {
    fieldsProcessed.push('indicatorGroups');

    const indicatorGroupFields: Partial<
      Pick<DCABotSettings, 'indicatorGroups'>
    > = {};

    const filterGroupsWithoutIndicators = indicatorGroups.filter(
      (ig) => !indicators.some((i) => i.groupId === ig.id)
    );

    indicatorGroupFields['indicatorGroups'] = indicatorGroups.filter(
      (ig) => !filterGroupsWithoutIndicators.includes(ig)
    );

    return {
      success: errors.length === 0,
      data: indicatorGroupFields,
      errors,
      warnings,
      debugInfo: {
        category: 'Indicator Group Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Indicator Group fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Indicator Group Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Filter settings mapping - Cooldown, price filters, and deal constraints
 */
export const mapFilterFields = (formData: BotFormData): FieldMappingResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fieldsProcessed: (keyof DCABotSettings)[] = [];
  const fieldsMapped: (keyof DCABotSettings)[] = [];
  const fieldsSkipped: (keyof DCABotSettings)[] = [];
  const isComboBot = formData.type === 'combo';
  const useCooldown = isComboBot
    ? formData.combo.useCooldown
    : formData.dca.useCooldown;
  const cooldownAfterDealStart = isComboBot
    ? formData.combo.cooldownAfterDealStart
    : formData.dca.cooldownAfterDealStart;
  const cooldownAfterDealStartInterval = isComboBot
    ? formData.combo.cooldownAfterDealStartInterval
    : formData.dca.cooldownAfterDealStartInterval;
  const cooldownAfterDealStartUnits = isComboBot
    ? formData.combo.cooldownAfterDealStartUnits
    : formData.dca.cooldownAfterDealStartUnits;
  const cooldownAfterDealStartOption = isComboBot
    ? formData.combo.cooldownAfterDealStartOption
    : formData.dca.cooldownAfterDealStartOption;
  const cooldownAfterDealStop = isComboBot
    ? formData.combo.cooldownAfterDealStop
    : formData.dca.cooldownAfterDealStop;
  const cooldownAfterDealStopInterval = isComboBot
    ? formData.combo.cooldownAfterDealStopInterval
    : formData.dca.cooldownAfterDealStopInterval;
  const cooldownAfterDealStopUnits = isComboBot
    ? formData.combo.cooldownAfterDealStopUnits
    : formData.dca.cooldownAfterDealStopUnits;
  const cooldownAfterDealStopOption = isComboBot
    ? formData.combo.cooldownAfterDealStopOption
    : formData.dca.cooldownAfterDealStopOption;
  const useStaticPriceFilter = isComboBot
    ? formData.combo.useStaticPriceFilter
    : formData.dca.useStaticPriceFilter;
  const minOpenDeal = isComboBot
    ? formData.combo.minOpenDeal
    : formData.dca.minOpenDeal;
  const maxOpenDeal = isComboBot
    ? formData.combo.maxOpenDeal
    : formData.dca.maxOpenDeal;
  const useDynamicPriceFilter = isComboBot
    ? formData.combo.useDynamicPriceFilter
    : formData.dca.useDynamicPriceFilter;
  const dynamicPriceFilterDeviation = isComboBot
    ? formData.combo.dynamicPriceFilterDeviation
    : formData.dca.dynamicPriceFilterDeviation;
  const dynamicPriceFilterOverValue = isComboBot
    ? formData.combo.dynamicPriceFilterOverValue
    : formData.dca.dynamicPriceFilterOverValue;
  const dynamicPriceFilterUnderValue = isComboBot
    ? formData.combo.dynamicPriceFilterUnderValue
    : formData.dca.dynamicPriceFilterUnderValue;
  const dynamicPriceFilterPriceType = isComboBot
    ? formData.combo.dynamicPriceFilterPriceType
    : formData.dca.dynamicPriceFilterPriceType;
  const dynamicPriceFilterDirection = isComboBot
    ? formData.combo.dynamicPriceFilterDirection
    : formData.dca.dynamicPriceFilterDirection;
  const useNoOverlapDeals = isComboBot
    ? formData.combo.useNoOverlapDeals
    : formData.dca.useNoOverlapDeals;
  try {
    fieldsProcessed.push(
      'useCooldown',
      'cooldownAfterDealStart',
      'cooldownAfterDealStartInterval',
      'cooldownAfterDealStartUnits',
      'cooldownAfterDealStartOption',
      'cooldownAfterDealStop',
      'cooldownAfterDealStopInterval',
      'cooldownAfterDealStopUnits',
      'cooldownAfterDealStopOption',
      'useStaticPriceFilter',
      'minOpenDeal',
      'maxOpenDeal',
      'useDynamicPriceFilter',
      'dynamicPriceFilterDeviation',
      'dynamicPriceFilterOverValue',
      'dynamicPriceFilterUnderValue',
      'dynamicPriceFilterPriceType',
      'dynamicPriceFilterDirection',
      'useNoOverlapDeals'
    );

    const filterFields: Partial<
      Pick<
        DCABotSettings,
        | 'useCooldown'
        | 'cooldownAfterDealStart'
        | 'cooldownAfterDealStartInterval'
        | 'cooldownAfterDealStartUnits'
        | 'cooldownAfterDealStartUnits'
        | 'cooldownAfterDealStartOption'
        | 'cooldownAfterDealStop'
        | 'cooldownAfterDealStopInterval'
        | 'cooldownAfterDealStopUnits'
        | 'cooldownAfterDealStopOption'
        | 'useStaticPriceFilter'
        | 'minOpenDeal'
        | 'maxOpenDeal'
        | 'useDynamicPriceFilter'
        | 'dynamicPriceFilterDeviation'
        | 'dynamicPriceFilterOverValue'
        | 'dynamicPriceFilterUnderValue'
        | 'dynamicPriceFilterDirection'
        | 'dynamicPriceFilterPriceType'
        | 'useNoOverlapDeals'
      >
    > = {};
    const validCooldownUnits = Object.values(CooldownUnits);
    const validCooldownScopes = Object.values(CooldownOptionsEnum);

    // Cooldown settings
    if (useCooldown) {
      filterFields['useCooldown'] = true;
      fieldsMapped.push('useCooldown');

      if (cooldownAfterDealStart) {
        filterFields['cooldownAfterDealStart'] = true;
        fieldsMapped.push('cooldownAfterDealStart');

        const startInterval = parseInt(
          `${cooldownAfterDealStartInterval || '0'}`,
          10
        );
        if (!isNaN(startInterval) && startInterval >= 0) {
          filterFields['cooldownAfterDealStartInterval'] = startInterval;
          fieldsMapped.push('cooldownAfterDealStartInterval');
        } else {
          warnings.push(
            'Cooldown after deal start interval must be a non-negative integer'
          );
          fieldsSkipped.push('cooldownAfterDealStartInterval');
        }

        if (
          validCooldownUnits.includes(
            cooldownAfterDealStartUnits || CooldownUnits.minutes
          )
        ) {
          filterFields['cooldownAfterDealStartUnits'] =
            cooldownAfterDealStartUnits;
          fieldsMapped.push('cooldownAfterDealStartUnits');
        } else {
          warnings.push(
            `Invalid cooldown start unit "${cooldownAfterDealStartUnits}"; defaulting to seconds`
          );
          filterFields['cooldownAfterDealStartUnits'] = CooldownUnits.seconds;
          fieldsMapped.push('cooldownAfterDealStartUnits');
        }

        if (
          validCooldownScopes.includes(
            cooldownAfterDealStartOption || CooldownOptionsEnum.bot
          )
        ) {
          filterFields['cooldownAfterDealStartOption'] =
            cooldownAfterDealStartOption;
          fieldsMapped.push('cooldownAfterDealStartOption');
        } else {
          warnings.push(
            `Invalid cooldown start scope "${cooldownAfterDealStartOption}"; defaulting to per bot`
          );
          filterFields['cooldownAfterDealStartOption'] =
            CooldownOptionsEnum.bot;
          fieldsMapped.push('cooldownAfterDealStartOption');
        }
      } else {
        fieldsSkipped.push(
          'cooldownAfterDealStart',
          'cooldownAfterDealStartInterval',
          'cooldownAfterDealStartUnits',
          'cooldownAfterDealStartOption'
        );
      }

      if (cooldownAfterDealStop) {
        filterFields['cooldownAfterDealStop'] = true;
        fieldsMapped.push('cooldownAfterDealStop');

        const stopInterval = parseInt(
          `${cooldownAfterDealStopInterval || '0'}`,
          10
        );
        if (!isNaN(stopInterval) && stopInterval >= 0) {
          filterFields['cooldownAfterDealStopInterval'] = stopInterval;
          fieldsMapped.push('cooldownAfterDealStopInterval');
        } else {
          warnings.push(
            'Cooldown after deal close interval must be a non-negative integer'
          );
          fieldsSkipped.push('cooldownAfterDealStopInterval');
        }

        if (
          validCooldownUnits.includes(
            cooldownAfterDealStopUnits || CooldownUnits.minutes
          )
        ) {
          filterFields['cooldownAfterDealStopUnits'] =
            cooldownAfterDealStopUnits;
          fieldsMapped.push('cooldownAfterDealStopUnits');
        } else {
          warnings.push(
            `Invalid cooldown close unit "${cooldownAfterDealStopUnits}"; defaulting to seconds`
          );
          filterFields['cooldownAfterDealStopUnits'] = CooldownUnits.seconds;
          fieldsMapped.push('cooldownAfterDealStopUnits');
        }

        if (
          validCooldownScopes.includes(
            cooldownAfterDealStopOption || CooldownOptionsEnum.bot
          )
        ) {
          filterFields['cooldownAfterDealStopOption'] =
            cooldownAfterDealStopOption;
          fieldsMapped.push('cooldownAfterDealStopOption');
        } else {
          warnings.push(
            `Invalid cooldown close scope "${cooldownAfterDealStopOption}"; defaulting to per bot`
          );
          filterFields['cooldownAfterDealStopOption'] = CooldownOptionsEnum.bot;
          fieldsMapped.push('cooldownAfterDealStopOption');
        }
      } else {
        fieldsSkipped.push(
          'cooldownAfterDealStop',
          'cooldownAfterDealStopInterval',
          'cooldownAfterDealStopUnits',
          'cooldownAfterDealStopOption'
        );
      }
    } else {
      fieldsSkipped.push(
        'useCooldown',
        'cooldownAfterDealStart',
        'cooldownAfterDealStartInterval',
        'cooldownAfterDealStartUnits',
        'cooldownAfterDealStartOption',
        'cooldownAfterDealStop',
        'cooldownAfterDealStopInterval',
        'cooldownAfterDealStopUnits',
        'cooldownAfterDealStopOption'
      );
    }

    // Static price filter
    if (useStaticPriceFilter) {
      filterFields['useStaticPriceFilter'] = true;
      fieldsMapped.push('useStaticPriceFilter');

      const minPrice = minOpenDeal?.trim();
      if (minPrice) {
        const parsedMin = parseFloat(minPrice);
        if (!isNaN(parsedMin) && parsedMin > 0) {
          filterFields['minOpenDeal'] = minPrice;
          fieldsMapped.push('minOpenDeal');
        } else {
          warnings.push('Minimum open deal price must be a positive number');
          fieldsSkipped.push('minOpenDeal');
        }
      }

      const maxPrice = maxOpenDeal?.trim();
      if (maxPrice) {
        const parsedMax = parseFloat(maxPrice);
        if (!isNaN(parsedMax) && parsedMax > 0) {
          filterFields['maxOpenDeal'] = maxPrice;
          fieldsMapped.push('maxOpenDeal');
        } else {
          warnings.push('Maximum open deal price must be a positive number');
          fieldsSkipped.push('maxOpenDeal');
        }
      }
    } else {
      fieldsSkipped.push('useStaticPriceFilter', 'minOpenDeal', 'maxOpenDeal');
    }

    // Dynamic price filter
    if (useDynamicPriceFilter) {
      filterFields['useDynamicPriceFilter'] = true;
      fieldsMapped.push('useDynamicPriceFilter');

      const deviation = parseFloat(dynamicPriceFilterDeviation || '0');
      if (!isNaN(deviation) && deviation >= 0) {
        filterFields['dynamicPriceFilterDeviation'] =
          dynamicPriceFilterDeviation;
        fieldsMapped.push('dynamicPriceFilterDeviation');
      } else {
        warnings.push('Dynamic price filter deviation must be non-negative');
        fieldsSkipped.push('dynamicPriceFilterDeviation');
      }

      const validDirections = Object.values(DynamicPriceFilterDirectionEnum);
      if (
        validDirections.includes(
          dynamicPriceFilterDirection ||
            DynamicPriceFilterDirectionEnum.overAndUnder
        )
      ) {
        filterFields['dynamicPriceFilterDirection'] =
          dynamicPriceFilterDirection;
        fieldsMapped.push('dynamicPriceFilterDirection');

        if (
          dynamicPriceFilterDirection === 'over' ||
          dynamicPriceFilterDirection === 'overAndUnder'
        ) {
          if (dynamicPriceFilterOverValue) {
            const overVal = parseFloat(dynamicPriceFilterOverValue);
            if (!isNaN(overVal)) {
              filterFields['dynamicPriceFilterOverValue'] =
                dynamicPriceFilterOverValue;
              fieldsMapped.push('dynamicPriceFilterOverValue');
            }
          }
        }

        if (
          dynamicPriceFilterDirection === 'under' ||
          dynamicPriceFilterDirection === 'overAndUnder'
        ) {
          if (dynamicPriceFilterUnderValue) {
            const underVal = parseFloat(dynamicPriceFilterUnderValue);
            if (!isNaN(underVal)) {
              filterFields['dynamicPriceFilterUnderValue'] =
                dynamicPriceFilterUnderValue;
              fieldsMapped.push('dynamicPriceFilterUnderValue');
            }
          }
        }
      }

      const validPriceTypes = Object.values(DynamicPriceFilterPriceTypeEnum);
      if (
        validPriceTypes.includes(
          dynamicPriceFilterPriceType || DynamicPriceFilterPriceTypeEnum.avg
        )
      ) {
        filterFields['dynamicPriceFilterPriceType'] =
          dynamicPriceFilterPriceType;
        fieldsMapped.push('dynamicPriceFilterPriceType');
      }
    } else {
      fieldsSkipped.push(
        'useDynamicPriceFilter',
        'dynamicPriceFilterDeviation',
        'dynamicPriceFilterOverValue',
        'dynamicPriceFilterUnderValue',
        'dynamicPriceFilterPriceType',
        'dynamicPriceFilterDirection'
      );
    }

    // No overlap deals
    if (useNoOverlapDeals !== undefined) {
      filterFields['useNoOverlapDeals'] = Boolean(useNoOverlapDeals);
      fieldsMapped.push('useNoOverlapDeals');
    } else {
      fieldsSkipped.push('useNoOverlapDeals');
    }

    return {
      success: errors.length === 0,
      data: filterFields,
      errors,
      warnings,
      debugInfo: {
        category: 'Filter Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [`Filter fields mapping failed: ${error}`],
      debugInfo: {
        category: 'Filter Fields',
        fieldsProcessed,
        fieldsMapped,
        fieldsSkipped,
      },
    };
  }
};

/**
 * Main field mapper - Combines all mapping functions
 */
export const mapFormDataToBackend = (
  formData: BotFormData,
  vars: BotVars | undefined | null
): Omit<FieldMappingResult, 'data'> & { data: DCABotSettings } => {
  const allResults: FieldMappingResult[] = [];
  const finalData: Partial<DCABotSettings> = {};
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Map all field categories
  const mappers = [
    { name: 'Basic', mapper: mapBasicFields },
    { name: 'Strategy', mapper: mapStrategyFields },
    { name: 'DCA', mapper: mapDcaFields },
    { name: 'TP/SL', mapper: mapTpSlFields },
    { name: 'Risk:Reward', mapper: mapRiskRewardFields },
    { name: 'Futures', mapper: mapFuturesFields },
    { name: 'Filters', mapper: mapFilterFields },
    { name: 'Advanced (Bot Controller)', mapper: mapBotControllerFields },
    { name: 'Advanced (Experimental)', mapper: mapExperimentalFields },
    { name: 'Start Indicators', mapper: mapStartFields },
    { name: 'Indicator Groups', mapper: mapIndicatorGroupsFields },
  ];

  /**
   * The raw form entry for each indicator, by uuid, used to tell a mapper's
   * real contribution apart from its passthrough. See the merge below.
   */
  const rawIndicatorJson = new Map(
    (
      (formData.type === BotTypesEnum.combo
        ? formData.combo.indicators
        : formData.dca.indicators) ?? []
    ).map((i) => [i.uuid, JSON.stringify(i)])
  );

  for (const { name, mapper } of mappers) {
    const result = mapper(formData, vars);
    allResults.push(result);

    if (result.success && result.data) {
      const { indicators, ...rest } = result.data;
      Object.assign(finalData, rest);

      /**
       * Merge each mapper's indicator contribution.
       *
       * Every per-role mapper emits the FULL indicator list: the entries for
       * the role it owns, serialized and gap-filled, and every other role's
       * entry passed straight through untouched (the `?? i` / `: indicator`
       * at each of the four emit sites). Merging those with "last writer
       * wins" therefore let one mapper's incidental RAW copy overwrite
       * another's serialized one — so an indicator kept its gap-fill only
       * when its role happened to be owned by the last mapper to run.
       *
       * A bot with indicators in two roles — start-by-indicator plus
       * indicator-based closing, say, which is an ordinary setup — silently
       * saved the earlier role's indicator stripped of every field the user
       * had not touched. A MAR lost mar1type, mar1length, mar2type,
       * mar2length, the percentile trio and the trendFilter quartet. That is
       * not cosmetic: indicatorCatalog.ts records that a MAR saved without
       * mar1length is re-tuned from a 20-period base MA to a 10, which is
       * exactly why the gap-fill exists.
       *
       * So a mapper may only overwrite an entry it actually CHANGED. An entry
       * byte-identical to the raw form entry is that mapper's passthrough and
       * carries no information about the indicator — it must not displace a
       * serialization some other mapper already produced. First writer still
       * wins for a uuid nobody has claimed, which keeps the set of indicators
       * in the payload exactly what it was before.
       */
      const merged = new Map(
        (finalData.indicators ?? []).map((i) => [i.uuid, i])
      );
      for (const indicator of indicators ?? []) {
        const existing = merged.get(indicator.uuid);
        if (existing) {
          const raw = rawIndicatorJson.get(indicator.uuid);
          const isPassthrough =
            raw !== undefined && JSON.stringify(indicator) === raw;
          if (isPassthrough) {
            continue;
          }
        }
        merged.set(indicator.uuid, indicator);
      }
      finalData.indicators = [...merged.values()];
    }

    finalData.indicators = (finalData.indicators ?? []).map((i) => {
      if (i.type === IndicatorEnum.lw) {
        i.lwMaxDuration = `${i.lwMaxDuration || '1000'}`.trim() || undefined;
        i.lwThreshold = `${i.lwThreshold || '2'}`.trim() || undefined;
      }
      return i;
    });

    if (result.errors) {
      allErrors.push(...result.errors.map((err) => `[${name}] ${err}`));
    }

    if (result.warnings) {
      allWarnings.push(...result.warnings.map((warn) => `[${name}] ${warn}`));
    }
  }

  // Filter out undefined, null, and empty string values to prevent GraphQL serialization issues
  /*   const filteredData = Object.fromEntries(
    Object.entries(finalData).filter(
      ([_, value]) => value !== undefined && value !== null && value !== ''
    )
  ); */

  // Single choke point for the save-path close-indicator filter: the form
  // keeps every close condition's configuration, the payload carries only
  // what the active conditions use.
  finalData.indicators = pruneUnusedCloseIndicators(
    formData,
    finalData.indicators ?? []
  );
  // …and re-prune the groups: mapIndicatorGroupsFields filters against the
  // unpruned form state, so a group emptied by the filter above would still
  // be sent.
  finalData.indicatorGroups = (finalData.indicatorGroups ?? []).filter((ig) =>
    (finalData.indicators ?? []).some((i) => i.groupId === ig.id)
  );

  finalData.pair = [formData.pair]
    .flat()
    .map((p) => formData.pairMetadata[p]?.pair || p);

  // The payload's fallback layer — what a field is worth when no mapper wrote
  // it. This used to be DCA_FORM_DEFAULTS alone, which made an ordinary mapper
  // gap into silent data loss: the field did not arrive ABSENT, it arrived as
  // the FACTORY DEFAULT and overwrote whatever the user had. Six fields reached
  // customers that way (useMaxDealsPerHigherTimeframe, feeOrder, closeOrderType,
  // fixedSlPrice, the bot-controller AND/OR logics, rrSlType), each fixed by
  // hand-writing "echo what the form is holding" into the one mapper that had
  // the hole. This generalizes that fix: the fallback is the live form slice,
  // which is both what the user is looking at and — for a field they never
  // touched — what the inbound mapper read off the bot. So an unmapped field is
  // now a no-op write instead of a reset.
  //
  // DCA_FORM_DEFAULTS stays UNDERNEATH the slice on purpose. It guarantees the
  // payload's key set is exactly what it was before this change, even when a
  // partially-built formData reaches the mapper (the hedge Quick form's leg
  // seeds do exactly that). Only the VALUES of unmapped fields move.
  const formSlice =
    formData.type === BotTypesEnum.combo ? formData.combo : formData.dca;

  return {
    success: allErrors.length === 0,
    data: {
      ...DCA_FORM_DEFAULTS,
      ...formSlice,
      pair: [formData.pair]
        .flat()
        .map((p) => formData.pairMetadata[p]?.pair || p),
      name: formData.name,
      ...finalData,
    },
    errors: allErrors,
    warnings: allWarnings,
    debugInfo: {
      category: 'Complete Mapping',
      fieldsProcessed: allResults.flatMap(
        (r) => r.debugInfo?.fieldsProcessed || []
      ),
      fieldsMapped: Object.keys(finalData) as (keyof DCABotSettings)[],
      fieldsSkipped: allResults.flatMap(
        (r) => r.debugInfo?.fieldsSkipped || []
      ),
    },
  };
};
