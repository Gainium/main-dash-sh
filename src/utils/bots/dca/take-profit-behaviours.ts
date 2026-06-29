import type {
  BotFormUpdateValue,
  Fields,
} from '@/contexts/bots/form/BotFormProvider';
import {
  CloseConditionEnum,
  MIN_DCA_TP_NEW,
  OrderTypeEnum,
  type MultiTP,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { GlobalVariable } from '@/types/globalVariables';
import {
  calculatePercentFromValue,
  calculateValueFromPercent,
  formatNumericString,
  sanitizeAmountInput,
  sanitizePercentageInput,
} from './take-profit';

export type TakeProfitBindableField =
  | 'tpPerc'
  | 'fixedTpPrice'
  | 'trailingTpPerc'
  | 'minTp'
  | 'closeByTimerValue';

export type FormUpdateInstruction = [Fields, BotFormUpdateValue];

const TRAILING_TP_MIN = 0;
const TRAILING_TP_MAX = 10;

export interface VariableBindingEffect {
  updates: FormUpdateInstruction[];
  priceValue?: string;
  timerValue?: string;
  focusTarget?: 'price' | 'percentage' | 'timer';
  shouldScheduleFocus?: boolean;
}

interface MultiTargetWarningContext {
  remainingPercentage: number;
  hasAllocationOverflow: boolean;
  remainingAmount: number;
  hasAmountOverflow: boolean;
  errors?: Record<string, string | undefined | null>;
  minTpGuard?: {
    enabled: boolean;
    minTpValue?: string | number | null;
    sourceDescription?: string | null | undefined;
  };
  maximumTargets?: number;
  maximumTargetsReached?: boolean;
  percentageExhausted?: boolean;
  amountExhausted?: boolean;
}

export const collectMultiTargetWarnings = ({
  /* remainingPercentage, */
  hasAllocationOverflow,
  /* remainingAmount,
  hasAmountOverflow, */
  errors = {},
  minTpGuard,
  maximumTargets,
  maximumTargetsReached,
  /* percentageExhausted,
  amountExhausted, */
}: MultiTargetWarningContext): string[] => {
  const warnings = new Set<string>();
  const exchangeMinimumWarning =
    'This target is below the exchange minimum. Increase position % or order size.';

  if (hasAllocationOverflow) {
    warnings.add(
      'Target percentages exceed 100%. Reduce one or more allocations.'
    );
  }
  // Removed "still unassigned" and "all allocated" messages - UI handles this automatically

  // Position size warnings removed - now handled automatically by the UI

  if (maximumTargetsReached && (maximumTargets ?? 0) > 0) {
    warnings.add(
      `Maximum of ${maximumTargets} targets reached. Remove an existing target before adding another.`
    );
  }

  Object.entries(errors).forEach(([key, message]) => {
    if (!message) {
      return;
    }

    const lowered = message.toLowerCase();
    const isExchangeMinimumMessage =
      lowered.includes('exchange minimum') ||
      lowered.includes('minimum requirements') ||
      lowered.includes('below the exchange minimum') ||
      lowered.includes('cannot place tp order');

    if (isExchangeMinimumMessage) {
      warnings.add(exchangeMinimumWarning);
      return;
    }

    if (
      key.startsWith('multiTp') ||
      key.includes('multiTarget') ||
      lowered.includes('increase position')
    ) {
      warnings.add(message);
    }
  });

  if (minTpGuard?.enabled) {
    const sanitizedMinimum = sanitizePercentageInput(
      minTpGuard.minTpValue ?? MIN_DCA_TP_NEW,
      MIN_DCA_TP_NEW,
      100
    );
    const formattedMinimum = formatNumericString(sanitizedMinimum, 2);
    const suffix = minTpGuard.sourceDescription
      ? ` (${minTpGuard.sourceDescription})`
      : '';

    warnings.add(
      `Minimum take profit guard is active. Indicator/webhook closes wait until profit reaches ${formattedMinimum}%${suffix}.`
    );
  }

  return Array.from(warnings);
};

export interface EnforceMultiTargetLimitResult {
  limited: MultiTP[];
  overflow: MultiTP[];
}

export const enforceMultiTargetLimit = (
  targets: MultiTP[] | null | undefined,
  maximum: number
): EnforceMultiTargetLimitResult => {
  if (!Array.isArray(targets)) {
    return {
      limited: [],
      overflow: [],
    };
  }

  if (maximum <= 0 || targets.length <= maximum) {
    return {
      limited: targets,
      overflow: [],
    };
  }

  return {
    limited: targets.slice(0, maximum),
    overflow: targets.slice(maximum),
  };
};

interface ExpectedAverageProfitInput {
  useTp?: boolean | null;
  useMultipleTpTargets?: boolean | null;
  tpPerc?: string | number | null;
  multiTargets?: MultiTP[] | null | undefined;
}

export const calculateExpectedAverageProfit = ({
  useTp,
  useMultipleTpTargets,
  tpPerc,
  multiTargets,
}: ExpectedAverageProfitInput): number => {
  if (!useTp) {
    return 0;
  }

  // No upper cap on the TP target value — expected profit must reflect large
  // high-leverage targets (e.g. 5000%), not clamp them to 100%. The position
  // allocation (amount) still legitimately caps at 100%.
  const normalizedSingleTarget = sanitizePercentageInput(
    tpPerc ?? 0,
    0,
    Number.POSITIVE_INFINITY
  );

  const targets = multiTargets ?? [];
  if (!useMultipleTpTargets || targets.length === 0) {
    return normalizedSingleTarget;
  }

  const sanitizedTargets = targets.map((target) => ({
    percentage: sanitizePercentageInput(
      target.target ?? '0',
      0,
      Number.POSITIVE_INFINITY
    ),
    amount: sanitizeAmountInput(target.amount ?? 0, 0, 100),
  }));

  if (sanitizedTargets.length === 0) {
    return normalizedSingleTarget;
  }

  const totalAmount = sanitizedTargets.reduce(
    (sum, { amount }) => sum + amount,
    0
  );

  if (totalAmount > Number.EPSILON) {
    const weighted = sanitizedTargets.reduce((sum, { percentage, amount }) => {
      if (amount <= 0) {
        return sum;
      }

      const weight = amount / totalAmount;
      return sum + percentage * weight;
    }, 0);

    return Math.max(0, weighted);
  }

  const totalPercentage = sanitizedTargets.reduce(
    (sum, { percentage }) => sum + percentage,
    0
  );

  return sanitizedTargets.length > 0
    ? Math.max(0, totalPercentage / sanitizedTargets.length)
    : normalizedSingleTarget;
};

interface MinTpGuardAvailabilityParams {
  guardAvailable: boolean;
  useMinTp: boolean | undefined | null;
  isMinTpBound: boolean;
}

export const enforceMinTpGuardAvailability = ({
  guardAvailable,
  useMinTp,
  isMinTpBound,
}: MinTpGuardAvailabilityParams): FormUpdateInstruction[] | null => {
  if (guardAvailable) {
    return null;
  }

  if (!useMinTp) {
    return null;
  }

  if (isMinTpBound) {
    return null;
  }

  return [['useMinTP', false]];
};

export const shouldUseLimitPriceState = (
  formData: Pick<BotFormData['dca'], 'startOrderType' | 'useLimitPrice'>,
  contextShouldUseLimitPrice?: boolean | null
): boolean => {
  if (
    formData.startOrderType === OrderTypeEnum.limit ||
    formData.useLimitPrice
  ) {
    return true;
  }

  if (typeof contextShouldUseLimitPrice === 'boolean') {
    return contextShouldUseLimitPrice;
  }

  return false;
};

export const selectLimitOrderPriceCandidate = (
  formData: Pick<BotFormData['dca'], 'startOrderType'>,
  contextLimitPrice?: number | string | null
): string | number | undefined => {
  if (typeof formData.startOrderType === 'string') {
    const trimmed = formData.startOrderType.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return contextLimitPrice === undefined
    ? undefined
    : (contextLimitPrice ?? undefined);
};

export const selectFallbackLimitPriceCandidate = (
  formData: Pick<BotFormData['dca'], 'baseOrderPrice'>,
  contextFallbackLimitPrice?: number | string | null,
  contextLimitPrice?: number | string | null
): string | number | undefined => {
  const candidates: Array<number | string | null | undefined> = [
    contextFallbackLimitPrice,
    contextLimitPrice,
    formData.baseOrderPrice,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }

    if (typeof candidate === 'string' && candidate.trim().length === 0) {
      continue;
    }

    return candidate;
  }

  return undefined;
};

export const sanitizeCloseByTimerValue = (
  value: string | number | null | undefined
): string => {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return '1';
  }

  const numericValue = Number.parseInt(raw, 10);
  if (Number.isFinite(numericValue)) {
    const clamped = Math.max(1, Math.floor(numericValue));
    return clamped.toString();
  }

  return raw;
};

interface TimerValueChangeOptions {
  requestFocus?: boolean;
}

interface TimerValueChangeEffect {
  updates: FormUpdateInstruction[];
  timerValue: string;
  shouldScheduleFocus: boolean;
}

export const deriveTimerValueChangeEffects = (
  value: string | number | null | undefined,
  options: TimerValueChangeOptions = {}
): TimerValueChangeEffect => {
  const timerValue = sanitizeCloseByTimerValue(value);

  return {
    updates: [['closeByTimerValue', timerValue]],
    timerValue,
    shouldScheduleFocus: Boolean(options.requestFocus),
  };
};

interface TimerAvailabilityParams {
  timerAllowed: boolean;
  closeByTimer: boolean | undefined | null;
}

interface TimerAvailabilityEffect {
  updates: FormUpdateInstruction[];
}

export const deriveTimerAvailabilityEffects = ({
  timerAllowed,
  closeByTimer,
}: TimerAvailabilityParams): TimerAvailabilityEffect | null => {
  if (timerAllowed || !closeByTimer) {
    return null;
  }

  return {
    updates: [['closeByTimer', false]],
  };
};

export const resolveVariableBindingEffects = (
  field: TakeProfitBindableField,
  variable: GlobalVariable | null
): VariableBindingEffect | null => {
  if (!variable || variable.value === undefined || variable.value === null) {
    return null;
  }

  const nextValue = String(variable.value);

  switch (field) {
    case 'tpPerc':
      return {
        updates: [['tpPerc', nextValue]],
      };
    case 'fixedTpPrice':
      return {
        updates: [
          ['useFixedTPPrices', true],
          ['fixedTpPrice', nextValue],
        ],
        priceValue: nextValue,
      };
    case 'trailingTpPerc':
      return {
        updates: [
          ['trailingTp', true],
          [
            'trailingTpPerc',
            formatNumericString(
              sanitizePercentageInput(
                nextValue,
                TRAILING_TP_MIN,
                TRAILING_TP_MAX
              ),
              3
            ),
          ],
        ],
      };
    case 'minTp':
      return {
        updates: [
          ['useMinTP', true],
          [
            'minTp',
            formatNumericString(
              sanitizePercentageInput(nextValue, MIN_DCA_TP_NEW, 100),
              2
            ),
          ],
        ],
      };
    case 'closeByTimerValue':
      return {
        updates: [['closeByTimer', true]],
        timerValue: nextValue,
        focusTarget: 'timer',
        shouldScheduleFocus: true,
      };
    default:
      return null;
  }
};

interface TrailingCompatibilityInput {
  closeConditionIsTp: boolean;
  isHedgeBot: boolean;
  useMultipleTpTargets: boolean;
  useTrailingTp: boolean;
}

export const enforceTrailingCompatibility = ({
  closeConditionIsTp,
  isHedgeBot,
  useMultipleTpTargets,
  useTrailingTp,
}: TrailingCompatibilityInput): {
  useMultipleTpTargets: boolean;
  useTrailingTp: boolean;
} => {
  if (!closeConditionIsTp || isHedgeBot) {
    return {
      useMultipleTpTargets: false,
      useTrailingTp: false,
    };
  }

  if (useMultipleTpTargets && useTrailingTp) {
    return {
      useMultipleTpTargets,
      useTrailingTp: false,
    };
  }

  return {
    useMultipleTpTargets,
    useTrailingTp,
  };
};

interface WebhookExposureInput {
  isTerminalBot: boolean;
  featureEnabled: boolean;
  hasWebhookSubscription: boolean;
  isWebhookSelected: boolean;
}

export const determineWebhookExposure = ({
  isTerminalBot,
  featureEnabled,
  hasWebhookSubscription,
  isWebhookSelected,
}: WebhookExposureInput): boolean => {
  if (!isTerminalBot) {
    return true;
  }

  if (!featureEnabled) {
    return true;
  }

  if (hasWebhookSubscription) {
    return true;
  }

  return isWebhookSelected;
};

interface CloseConditionOptionContext {
  isEditMode: boolean;
  closeCondition: CloseConditionEnum;
  canSelectWebhook: boolean;
  isTerminalBot: boolean;
  featureEnabled: boolean;
  hasWebhookSubscription: boolean;
  shouldExposeWebhookOption: boolean;
}

export interface CloseConditionOption {
  value: CloseConditionEnum;
  disabled: boolean;
}

export const buildCloseConditionOptions = ({
  isEditMode,
  closeCondition,
  canSelectWebhook,
  isTerminalBot,
  featureEnabled,
  hasWebhookSubscription,
  shouldExposeWebhookOption,
}: CloseConditionOptionContext): CloseConditionOption[] => {
  const isWebhookSelected = closeCondition === CloseConditionEnum.webhook;

  const options = Object.values(CloseConditionEnum) as CloseConditionEnum[];

  const filtered = options.filter((option) => {
    if (option === CloseConditionEnum.manual) {
      return false;
    }

    if (option === CloseConditionEnum.webhook) {
      if (isTerminalBot && !shouldExposeWebhookOption) {
        return false;
      }

      return true;
    }

    return true;
  });

  const mapOption = (option: CloseConditionEnum) => ({
    value: option,
    disabled:
      option === CloseConditionEnum.webhook &&
      (!canSelectWebhook ||
        (isTerminalBot &&
          !determineWebhookExposure({
            isTerminalBot,
            featureEnabled,
            hasWebhookSubscription,
            isWebhookSelected,
          }))),
  });

  const mappedOptions = filtered.map(mapOption);

  if (!isEditMode) {
    return mappedOptions;
  }

  return mappedOptions;
};

interface ModeSwitchParams {
  targetMode: 'percentage' | 'price';
  formData: Pick<
    BotFormData['dca'],
    'useFixedTPPrices' | 'fixedTpPrice' | 'tpPerc'
  >;
  isFixedTpPriceBound: boolean;
  currentPrice: number;
  minTpPercent: number;
  isShort: boolean;
}

export interface ModeSwitchEffect {
  updates: FormUpdateInstruction[];
  nextPriceValue?: string;
  focusTarget: 'price' | 'percentage';
}

export const deriveModeSwitchEffects = ({
  targetMode,
  formData,
  isFixedTpPriceBound,
  currentPrice,
  minTpPercent,
  isShort,
}: ModeSwitchParams): ModeSwitchEffect => {
  const updates: FormUpdateInstruction[] = [];

  if (targetMode === 'price') {
    const result: ModeSwitchEffect = {
      updates,
      focusTarget: 'price',
    };

    if (!formData.useFixedTPPrices) {
      updates.push(['useFixedTPPrices', true]);
    }

    if (!isFixedTpPriceBound && !formData.fixedTpPrice) {
      if (currentPrice > 0) {
        const computedPrice = calculateValueFromPercent(
          isShort,
          formData.tpPerc || minTpPercent.toString(),
          currentPrice
        );
        updates.push(['fixedTpPrice', computedPrice]);
        return {
          ...result,
          nextPriceValue: computedPrice,
        };
      }

      return {
        ...result,
        nextPriceValue: '',
      };
    }

    if (!isFixedTpPriceBound && formData.fixedTpPrice) {
      return {
        ...result,
        nextPriceValue: formData.fixedTpPrice,
      };
    }

    return result;
  }

  if (formData.useFixedTPPrices) {
    updates.push(['useFixedTPPrices', false]);
  }

  return {
    updates,
    focusTarget: 'percentage',
  };
};

interface PriceValueChangeParams {
  value: string | number;
  formData: Pick<BotFormData['dca'], 'tpPerc' | 'useFixedTPPrices'>;
  isFixedTpPriceBound: boolean;
  isTpPercBound: boolean;
  isShort: boolean;
  currentPrice: number;
}

export interface PriceValueChangeEffect {
  updates: FormUpdateInstruction[];
  priceValue: string;
  shouldUpdateTimestamp: boolean;
}

export const derivePriceValueChangeEffects = ({
  value,
  formData,
  isFixedTpPriceBound,
  isTpPercBound,
  isShort,
  currentPrice,
}: PriceValueChangeParams): PriceValueChangeEffect | null => {
  if (isFixedTpPriceBound) {
    return null;
  }

  const priceValue =
    typeof value === 'number' && Number.isFinite(value)
      ? value.toString()
      : String(value ?? '');

  const updates: FormUpdateInstruction[] = [['fixedTpPrice', priceValue]];
  let shouldUpdateTimestamp = false;

  if (!formData.useFixedTPPrices) {
    updates.push(['useFixedTPPrices', true]);
  }

  if (!isTpPercBound && currentPrice > 0) {
    const calculatedPercent = calculatePercentFromValue(
      isShort,
      priceValue,
      currentPrice
    );

    const prevPercent = Number.parseFloat(formData.tpPerc || '0');
    const nextPercent = Number.parseFloat(calculatedPercent || '0');

    if (
      Number.isFinite(nextPercent) &&
      Math.abs(nextPercent - prevPercent) > 0.001
    ) {
      updates.push(['tpPerc', calculatedPercent]);
      shouldUpdateTimestamp = true;
    }
  }

  return {
    updates,
    priceValue,
    shouldUpdateTimestamp,
  };
};

interface PresetClickParams {
  percentage: number;
  targetMode: 'percentage' | 'price';
  formData: Pick<
    BotFormData['dca'],
    'tpPerc' | 'useFixedTPPrices' | 'fixedTpPrice'
  >;
  isTpValueBound: boolean;
  currentPrice: number;
  minTpPercent: number;
  isShort: boolean;
}

export interface PresetClickEffect {
  updates: FormUpdateInstruction[];
  priceValue?: string;
}

export const derivePresetClickEffects = ({
  percentage,
  targetMode,
  formData,
  isTpValueBound,
  currentPrice,
  minTpPercent,
  isShort,
}: PresetClickParams): PresetClickEffect | null => {
  if (isTpValueBound) {
    return null;
  }

  const sanitized = sanitizePercentageInput(percentage, minTpPercent, 50);
  const nextValue = sanitized.toString();

  if (targetMode === 'price') {
    if (currentPrice <= 0) {
      return null;
    }

    const computedPrice = calculateValueFromPercent(
      isShort,
      nextValue,
      currentPrice
    );

    const updates: FormUpdateInstruction[] = [];

    if (!formData.useFixedTPPrices) {
      updates.push(['useFixedTPPrices', true]);
    }

    updates.push(['fixedTpPrice', computedPrice]);
    updates.push(['tpPerc', nextValue]);

    return {
      updates,
      priceValue: computedPrice,
    };
  }

  const updates: FormUpdateInstruction[] = [['tpPerc', nextValue]];

  if (formData.useFixedTPPrices && currentPrice > 0) {
    const computedPrice = calculateValueFromPercent(
      isShort,
      nextValue,
      currentPrice
    );

    updates.push(['fixedTpPrice', computedPrice]);
    updates.push(['useFixedTPPrices', false]);

    return {
      updates,
      priceValue: computedPrice,
    };
  }

  if (formData.useFixedTPPrices) {
    updates.push(['useFixedTPPrices', false]);
  }

  return {
    updates,
  };
};
