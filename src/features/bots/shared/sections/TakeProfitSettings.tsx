import { DynamicArIndicatorConfig } from '@/components/indicators/DynamicArIndicatorConfig';
import { IndicatorList } from '@/components/indicators/IndicatorList';
import { TerminalButtonStack } from '@/components/ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import { Label } from '@/components/ui/label';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { SettingsLoadMore } from '@/components/ui/SettingsLoadMore';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import SettingsRow, {
    SettingsRowSurface,
} from '@/components/widgets/shared/SettingsRow';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import {
    useBotFormActions,
    useBotFormBotVars,
    useBotFormErrors,
    useBotFormMode,
    useBotFormSelector,
    useBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { useDcaTradingContext } from '@/hooks/bots/dca/useDcaTradingContext';
import useBotVarBinding, {
    type MultipleTPVarBindingPath,
} from '@/hooks/bots/global-variables/useBotVarBinding';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import {
    useIndicatorSelector,
    type OpenIndicatorSelectorOptions,
} from '@/hooks/useIndicatorSelector';
import { useWebhookEligibility } from '@/hooks/useWebhookEligibility';
import { logger } from '@/lib/loggerInstance';
import { math } from '@/lib/utils/math';
import {
    CloseConditionEnum,
    closeConditionsMap,
    CloseDCATypeEnum,
    IndicatorAction,
    IndicatorEnum,
    IndicatorSection,
    indicatorsLimit,
    IndicatorsLogicEnum,
    MIN_DCA_TP,
    MIN_DCA_TP_NEW,
    OrderTypeEnum,
    StrategyEnum,
    TerminalDealTypeEnum,
    type MultiTP,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { GlobalVariable } from '@/types/globalVariables';
import { type IndicatorConfig, type IndicatorGroup } from '@/types/indicators';
import { getIndicatorDefaultParams } from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
    distributePositionSizesEqually,
    redistributePositionSizes,
} from '@/utils/bots/dca/position-size-redistribution';
import {
    calculatePercentFromValue,
    calculateValueFromPercent,
    clampTargetAmountsToTotal,
    clampTargetsToTotal,
    formatNumericString,
    getNextMultiTpId,
    hasConfiguredMultiTpTargets,
    normalizeMultiTpTargets,
    resolveTpReferencePrice,
    sanitizeAmountInput,
    sanitizeFixedInput,
    sanitizePercentageInput,
    validateTpTarget,
} from '@/utils/bots/dca/take-profit';
import {
    calculateExpectedAverageProfit,
    collectMultiTargetWarnings,
    derivePresetClickEffects,
    deriveTimerAvailabilityEffects,
    deriveTimerValueChangeEffects,
    enforceMinTpGuardAvailability,
    enforceMultiTargetLimit,
    enforceTrailingCompatibility,
    resolveVariableBindingEffects,
    type FormUpdateInstruction,
} from '@/utils/bots/dca/take-profit-behaviours';
import {
    buildIndicatorConfig,
    sanitizeIndicatorParams,
} from '@/utils/indicators/indicatorConfigUtils';
import { AlertTriangle, Info } from 'lucide-react';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { BaseStopLosslOn } from '../../bot-types/combo/form/components/BaseStopLossOn';
import { IndicatorGroupsManager } from '../components/IndicatorGroupsManager';
import MultiTarget from '../components/MultiTarget';

const MAX_MULTI_TP_TARGETS = 10;
// Position-allocation ceiling: the % of the position closed across all targets
// must sum to 100. This is the ALLOCATION cap (target.amount), never a cap on
// the take-profit price-distance value.
const MAX_TOTAL_PERCENTAGE = 100;
// Practical ceiling for the take-profit *slider* only. The slider is a
// convenience control; the typed input and the stored value are intentionally
// uncapped so high-leverage users can target very large gains (e.g. 5000% on
// 100x), matching the open input in the legacy dashboard.
const TP_SLIDER_MAX_PERCENT = 250;
// No upper cap on the take-profit price-distance value itself. TP targets are
// independent price levels (not allocations), so they are never bounded above
// nor forced to sum to anything — only the slider is bounded, for UX.
const TP_TARGET_VALUE_MAX = Number.POSITIVE_INFINITY;
const TRAILING_TP_MIN = 0;
const TRAILING_TP_MAX = 10;
type TakeProfitBindableField =
  | 'tpPerc'
  | 'fixedTpPrice'
  | 'trailingTpPerc'
  | 'minTp'
  | 'closeByTimerValue';

const generateId = (prefix: string): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toNonNegativeInteger = (
  value: string | number | null | undefined
): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
};

const sanitizeKeepConditionBars = (
  value: string | number | null | undefined,
  fallback: number
): string => {
  const normalized = toNonNegativeInteger(value);
  if (normalized > 0) {
    return normalized.toString();
  }

  return toNonNegativeInteger(fallback).toString();
};

const sanitizeDynamicArFactor = (
  value: string | number | null | undefined
): string => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '1';
  }

  const clamped = Math.min(Math.max(parsed, 0.1), 10);
  return formatNumericString(clamped, 2);
};

const createCloseGroupId = (): string => generateId('close-group');

const createCloseIndicatorId = (): string => generateId('close-indicator');

const getMultiTargetBindingPath = (
  targetId: string,
  field: Extract<keyof MultiTP, 'target' | 'amount' | 'fixed'>
): MultipleTPVarBindingPath => `multiTp.${targetId}.${field}`;

const createMultiTarget = ({
  target,
  amount,
  fixed,
  existingTargets = [],
}: Omit<MultiTP, 'uuid'> & {
  existingTargets?: MultiTP[];
}): MultiTP => {
  const sanitizedPercentage = sanitizePercentageInput(
    target,
    0,
    TP_TARGET_VALUE_MAX
  );
  const sanitizedAmount = sanitizeAmountInput(amount, 0, MAX_TOTAL_PERCENTAGE);
  const generatedId = getNextMultiTpId(existingTargets);

  const nextTarget: MultiTP = {
    uuid: generatedId,
    target: formatNumericString(sanitizedPercentage),
    amount: formatNumericString(sanitizedAmount),
  };

  nextTarget.fixed = sanitizeFixedInput(fixed ?? 0);

  return nextTarget;
};

const normalizeCloseCondition = (value: unknown): CloseConditionEnum => {
  if (typeof value !== 'string' || !value) {
    return CloseConditionEnum.tp;
  }

  const allowed = new Set(Object.values(CloseConditionEnum));
  if (allowed.has(value as CloseConditionEnum)) {
    return value as CloseConditionEnum;
  }

  return CloseConditionEnum.tp;
};

export const TakeProfitSettings: React.FC = () => {
  const mode = useBotFormMode();
  // `errors` is rewritten only by the debounced validation pass, not by the
  // synchronous keystroke, so this narrow subscription doesn't re-render the
  // section per keystroke (unlike the old broad `useBotFormState()`). The old
  // `{...formStateErrors, ..._errors}` merge was a no-op — the `errors` prop was
  // the same store object this reads — so the raw store errors are equivalent.
  const mergedErrors = useBotFormErrors();
  const { updateFormData, setBotVars } = useBotFormActions();
  const botVars = useBotFormBotVars() ?? { list: [], paths: [] };
  // Top-level form fields (stored on `formData` directly, not inside the dca/
  // combo/grid settings sub-object — `useBotFormSelector` can't reach these).
  // Read narrowly so a numeric keystroke into a settings field never re-renders
  // this section.
  const formType = useBotFormTopLevelSelector('type');
  const formPair = useBotFormTopLevelSelector('pair');
  const formPairMetadata = useBotFormTopLevelSelector('pairMetadata');
  const formExchangeUUID = useBotFormTopLevelSelector('exchangeUUID');
  const formUserFee = useBotFormTopLevelSelector('userFee');
  const formTerminal = useBotFormTopLevelSelector('terminal');
  const { coordinates, setCoordinates } = useTradingTerminalUtils();
  const { currentExchange } = useBotFormQuery();
  const startOrderType = useBotFormSelector('startOrderType');
  const useLimitPrice = useBotFormSelector('useLimitPrice');
  const baseOrderPrice = useBotFormSelector('baseOrderPrice');
  const startBotPriceValue = useBotFormSelector('startBotPriceValue');
  const strategy = useBotFormSelector('strategy');
  const dealCloseCondition = useBotFormSelector('dealCloseCondition');
  const indicators = useBotFormSelector('indicators');
  const indicatorGroups = useBotFormSelector('indicatorGroups');
  const stopDealLogic = useBotFormSelector('stopDealLogic');
  const tpPerc = useBotFormSelector('tpPerc');
  const terminalDealType = useBotFormSelector('terminalDealType');
  const fixedTpPrice = useBotFormSelector('fixedTpPrice');
  const useTp = useBotFormSelector('useTp');
  const useMultiTp = useBotFormSelector('useMultiTp');
  const multiTp = useBotFormSelector('multiTp');
  const useMinTP = useBotFormSelector('useMinTP');
  const minTp = useBotFormSelector('minTp');
  const useRiskReward = useBotFormSelector('useRiskReward');
  const riskUseTpRatio = useBotFormSelector('riskUseTpRatio');
  const useFixedTPPrices = useBotFormSelector('useFixedTPPrices');
  const closeByTimerValue = useBotFormSelector('closeByTimerValue');
  const closeByTimer = useBotFormSelector('closeByTimer');
  const trailingTpPerc = useBotFormSelector('trailingTpPerc');
  const trailingTp = useBotFormSelector('trailingTp');
  const closeByTimerUnits = useBotFormSelector('closeByTimerUnits');
  const closeOrderType = useBotFormSelector('closeOrderType');
  const closeDealType = useBotFormSelector('closeDealType');
  const comboTpLimit = useBotFormSelector('comboTpLimit');
  // Settings consumed by useDcaTradingContext -> resolveDcaRanges. Selected
  // individually so this section stays reactive to exactly these (matching the
  // pre-refactor whole-formData behaviour) instead of subscribing to the entire
  // formData object.
  const rangeUseMulti = useBotFormSelector('useMulti');
  const rangeUseSmartOrders = useBotFormSelector('useSmartOrders');
  const rangeMaxDealsPerPair = useBotFormSelector('maxDealsPerPair');
  const rangeMaxNumberOfOpenDeals = useBotFormSelector('maxNumberOfOpenDeals');
  const rangeDcaCondition = useBotFormSelector('dcaCondition');
  const rangeDcaCustom = useBotFormSelector('dcaCustom');
  const rangeOrdersCount = useBotFormSelector('ordersCount');
  const applyUpdates = useCallback(
    (updates: FormUpdateInstruction[]) => {
      updates.forEach(([field, value]) => {
        updateFormData(field, value as Parameters<typeof updateFormData>[1]);
      });
    },
    [updateFormData]
  );
  const isEditMode = useMemo(() => mode === 'edit', [mode]);
  const isDealEdit = useMemo(
    () => mode === 'deal-edit' || mode === 'deal-mass-edit',
    [mode]
  );
  // Feed `useDcaTradingContext` (and the webhook eligibility check, which only
  // reads `type`) the exact slice they consume — the top-level pair/fee fields
  // plus the settings `resolveDcaRanges` reads — built from narrow selectors.
  // Previously the whole `formData` was passed, minting a new identity every
  // keystroke and re-running these hooks needlessly; now the derived context is
  // stable unless one of these specific fields changes. The same slice is placed
  // under both `dca` and `combo` because `useBotFormSelector` already returns the
  // active bot type's value, and `resolveDcaRanges` reads whichever the type
  // selects.
  const dcaRangeSettings = useMemo(
    () => ({
      useMulti: rangeUseMulti,
      useSmartOrders: rangeUseSmartOrders,
      maxDealsPerPair: rangeMaxDealsPerPair,
      maxNumberOfOpenDeals: rangeMaxNumberOfOpenDeals,
      dcaCondition: rangeDcaCondition,
      dcaCustom: rangeDcaCustom,
      ordersCount: rangeOrdersCount,
    }),
    [
      rangeUseMulti,
      rangeUseSmartOrders,
      rangeMaxDealsPerPair,
      rangeMaxNumberOfOpenDeals,
      rangeDcaCondition,
      rangeDcaCustom,
      rangeOrdersCount,
    ]
  );
  const dcaContextFormData = useMemo(
    () =>
      ({
        type: formType,
        pair: formPair,
        pairMetadata: formPairMetadata,
        exchangeUUID: formExchangeUUID,
        userFee: formUserFee,
        dca: dcaRangeSettings,
        combo: dcaRangeSettings,
      }) as unknown as BotFormData,
    [
      formType,
      formPair,
      formPairMetadata,
      formExchangeUUID,
      formUserFee,
      dcaRangeSettings,
    ]
  );
  const tradingContext = useDcaTradingContext(dcaContextFormData, { bot: null });
  const {
    latestPrice,
    limitPrice: contextLimitPrice,
    fallbackLimitPrice: contextFallbackLimitPrice,
    shouldUseLimitPrice: contextShouldUseLimitPrice,
  } = tradingContext;

  const latestKnownPrice = typeof latestPrice === 'number' ? latestPrice : 0;

  const shouldUseLimitPrice = useMemo(() => {
    if (startOrderType === OrderTypeEnum.limit || useLimitPrice) {
      return true;
    }

    if (typeof contextShouldUseLimitPrice === 'boolean') {
      return contextShouldUseLimitPrice;
    }

    return false;
  }, [startOrderType, useLimitPrice, contextShouldUseLimitPrice]);

  const limitOrderPriceCandidate = useMemo(() => {
    if (typeof baseOrderPrice === 'string') {
      const trimmed = baseOrderPrice.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return contextLimitPrice;
  }, [baseOrderPrice, contextLimitPrice]);

  const fallbackLimitPriceCandidate = useMemo(() => {
    const candidates: Array<number | string | undefined> = [
      contextFallbackLimitPrice,
      contextLimitPrice,
      startBotPriceValue,
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
  }, [contextFallbackLimitPrice, contextLimitPrice, startBotPriceValue]);

  const currentPrice = useMemo(() => {
    const resolved = resolveTpReferencePrice(latestKnownPrice, {
      shouldUseLimitPrice,
      limitOrderPrice:
        limitOrderPriceCandidate === undefined
          ? null
          : limitOrderPriceCandidate,
      fallbackLimitPrice:
        fallbackLimitPriceCandidate === undefined
          ? null
          : fallbackLimitPriceCandidate,
    });

    return resolved;
  }, [
    latestKnownPrice,
    shouldUseLimitPrice,
    limitOrderPriceCandidate,
    fallbackLimitPriceCandidate,
  ]);
  const isShort = strategy === StrategyEnum.short;
  const closeCondition = normalizeCloseCondition(dealCloseCondition);
  const webhookEligibility = useWebhookEligibility({
    formData: dcaContextFormData,
    isEditMode,
    context: 'take-profit',
  });
  const { canInteract } = webhookEligibility;

  const isWebhookSelected = closeCondition === CloseConditionEnum.webhook;
  const canSelectWebhook = canInteract || (isEditMode && isWebhookSelected);

  const closeConditionOptions = useMemo(() => {
    // Keep the order consistent with StopLossSettings: tp, techInd, dynamicAr, webhook.
    // Webhook is always shown; `disabled` controls whether the user can pick it.
    const ordered: CloseConditionEnum[] = [
      CloseConditionEnum.tp,
      CloseConditionEnum.techInd,
      CloseConditionEnum.dynamicAr,
      CloseConditionEnum.webhook,
    ];

    return ordered.map((option) => ({
      value: option,
      disabled: option === CloseConditionEnum.webhook && !canSelectWebhook,
    }));
  }, [canSelectWebhook]);

  const closeIndicators = useMemo<IndicatorConfig[]>(
    () =>
      indicators.filter(
        (i) =>
          i.indicatorAction === IndicatorAction.closeDeal &&
          i.section !== IndicatorSection.sl
      ) ?? [],
    [indicators]
  );

  const closeIndicatorGroups = useMemo<IndicatorGroup[]>(
    () =>
      indicatorGroups.filter(
        (i) =>
          i.action === IndicatorAction.closeDeal &&
          i.section !== IndicatorSection.sl
      ) ?? [],
    [indicatorGroups]
  );

  const indicatorLimitReached = useMemo(
    () => indicators.length >= indicatorsLimit,
    [indicators]
  );

  const syncCloseIndicatorGroups = useCallback(
    (nextGroups: IndicatorGroup[]) => {
      updateFormData('indicatorGroups', [
        ...indicatorGroups.filter(
          (group) =>
            !(
              group.action === IndicatorAction.closeDeal &&
              group.section !== IndicatorSection.sl
            )
        ),
        ...nextGroups,
      ]);
    },
    [indicatorGroups, updateFormData]
  );

  const handleCloseConditionChange = useCallback(
    (value: CloseConditionEnum) => {
      if (value === CloseConditionEnum.webhook && !canSelectWebhook) {
        return;
      }

      // When switching to technical indicators, seed the UI with a
      // default group and one RSI indicator when none exist.
      if (
        value === CloseConditionEnum.techInd &&
        closeIndicatorGroups.length === 0 &&
        closeIndicators.length === 0 &&
        !indicatorLimitReached
      ) {
        const newGroup: IndicatorGroup = {
          id: createCloseGroupId(),
          logic:
            stopDealLogic === IndicatorsLogicEnum.or
              ? IndicatorsLogicEnum.or
              : IndicatorsLogicEnum.and,
          action: IndicatorAction.closeDeal,
        };

        const defaults = getIndicatorDefaultParams(
          IndicatorEnum.rsi,
          IndicatorAction.closeDeal
        );
        const sanitizedParams = sanitizeIndicatorParams(
          (defaults ?? {}) as IndicatorParamsState
        );
        const newIndicator = buildIndicatorConfig(
          IndicatorEnum.rsi,
          sanitizedParams,
          {
            uuid: createCloseIndicatorId(),
          }
        );

        // Add both the new group and a seeded RSI indicator in the group
        syncCloseIndicatorGroups([...closeIndicatorGroups, newGroup]);
        updateFormData('indicators', [
          ...indicators,
          { ...newIndicator, groupId: newGroup.id },
        ]);
      }

      updateFormData('dealCloseCondition', value);
    },
    [
      canSelectWebhook,
      updateFormData,
      closeIndicatorGroups,
      closeIndicators,
      indicatorLimitReached,
      syncCloseIndicatorGroups,
      stopDealLogic,
      indicators,
    ]
  );

  const isComboBot = formType === 'combo';
  const isHedgeBot = formType === 'hedgeCombo' || formType === 'hedgeDca';
  const closeConditionIsTp = closeCondition === CloseConditionEnum.tp;
  const closeDealTypeOptions = useMemo<
    Array<{
      value: CloseDCATypeEnum;
      label: string;
      description: string;
    }>
  >(
    () => [
      {
        value: CloseDCATypeEnum.closeByLimit,
        label: 'Limit',
        description: '',
      },
      {
        value: CloseDCATypeEnum.closeByMarket,
        label: 'Market',
        description: '',
      },
    ],
    []
  );

  const [priceValue, setPriceValue] = useState<string>(fixedTpPrice || '');
  const timerInputRef = useRef<HTMLInputElement>(null);
  const focusTimerRef = useRef<number | null>(null);
  const scheduleFocus = useCallback((fn: () => void) => {
    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
    }

    focusTimerRef.current = window.setTimeout(() => {
      focusTimerRef.current = null;
      fn();
    }, 0);
  }, []);
  useEffect(
    () => () => {
      if (focusTimerRef.current) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    },
    []
  );
  const [_lastUpdate, setLastUpdate] = useState<number>(0);

  const minTpRange = tradingContext.ranges?.tpPerc;
  const minTpPercentFromRanges = minTpRange?.min;

  // Legacy terminal Import min-TP clamp (index.tsx:5489-5515). For an imported
  // position the minimum TP% is derived from the distance between the declared
  // entry price and the latest market price; otherwise it floors at MIN_DCA_TP.
  const getMinTp = useMemo(() => {
    return terminalDealType === TerminalDealTypeEnum.import &&
      baseOrderPrice &&
      latestPrice &&
      !isNaN(+(baseOrderPrice ?? '')) &&
      !isNaN(+(latestPrice ?? '')) &&
      (strategy === StrategyEnum.long
        ? +latestPrice > +baseOrderPrice
        : +latestPrice < +baseOrderPrice)
      ? Math.max(
          math.round(
            ((+latestPrice - +baseOrderPrice) / +baseOrderPrice) * 100 +
              MIN_DCA_TP * 100 * (strategy === StrategyEnum.long ? 1 : -1),
            1,
            false,
            true
          ) * (strategy === StrategyEnum.long ? 1 : -1),
          MIN_DCA_TP * 100
        )
      : MIN_DCA_TP * 100;
  }, [terminalDealType, baseOrderPrice, latestPrice, strategy]);

  const minTpToUse = useMemo(() => {
    if (terminalDealType === TerminalDealTypeEnum.import) {
      return Math.round(getMinTp * 1000) / 1000;
    }
    const fallback =
      (isComboBot || isHedgeBot ? MIN_DCA_TP_NEW : MIN_DCA_TP) * 100;
    const resolved =
      typeof minTpPercentFromRanges === 'number' &&
      Number.isFinite(minTpPercentFromRanges)
        ? minTpPercentFromRanges
        : fallback;

    return Math.round(resolved * 1000) / 1000;
  }, [
    isComboBot,
    isHedgeBot,
    minTpPercentFromRanges,
    terminalDealType,
    getMinTp,
  ]);

  const minTpSourceDescription = useMemo(() => {
    if (!minTpRange) {
      return '';
    }

    if (minTpRange.source === 'override') {
      const [primaryOverride] = minTpRange.appliedOverrides;
      if (primaryOverride?.key) {
        return `override (${primaryOverride.key})`;
      }
      return 'override';
    }

    if (minTpRange.source === 'combo-default') {
      return 'combo bot minimum';
    }

    if (minTpRange.source === 'hedge-default') {
      return 'hedge bot minimum';
    }

    return '';
  }, [minTpRange]);
  const multiTargets = useMemo(
    () =>
      useMultiTp
        ? (multiTp ?? [])
        : [
            {
              uuid: 'single-target',
              target: tpPerc || '0',
              amount: '100',
              fixed: useFixedTPPrices ? fixedTpPrice : undefined,
            },
          ],
    [multiTp, useMultiTp, tpPerc, useFixedTPPrices, fixedTpPrice]
  );

  const lastSingleTargetPercentageRef = useRef<string | null>(null);

  useEffect(() => {
    if (useMultiTp) {
      return;
    }

    const sanitized = formatNumericString(
      sanitizePercentageInput(
        tpPerc || minTpToUse,
        minTpToUse,
        TP_TARGET_VALUE_MAX
      )
    );

    lastSingleTargetPercentageRef.current = sanitized;
  }, [tpPerc, useMultiTp, minTpToUse]);

  useEffect(() => {
    const normalized = normalizeMultiTpTargets(multiTp);
    if (normalized !== multiTp) {
      updateFormData('multiTp', normalized);
    }
  }, [multiTp, updateFormData]);
  const overrideIndicators = useMemo(
    () =>
      closeCondition === CloseConditionEnum.dynamicAr
        ? [IndicatorEnum.adr, IndicatorEnum.atr]
        : [],
    [closeCondition]
  );
  const { openSelector, selector } = useIndicatorSelector(overrideIndicators);
  const {
    favorites: favoriteIndicatorTypes,
    toggleFavorite,
    isMutating: favoritesMutating,
    isIndicatorMutating,
  } = useFavoriteIndicators();

  const totalIndicatorsAcrossBot = useMemo(() => {
    return indicators.length;
  }, [indicators]);

  // Reuse the earlier `indicatorLimitReached` computed above.
  const closeIndicatorErrorMessage = mergedErrors['indicatorsClose'];
  const takeProfitLocked = Boolean(useRiskReward && riskUseTpRatio);
  const minTpGuardAvailable =
    closeCondition === CloseConditionEnum.techInd ||
    closeCondition === CloseConditionEnum.webhook;
  const isTechIndicatorClose = closeCondition === CloseConditionEnum.techInd;
  const isDynamicArClose = closeCondition === CloseConditionEnum.dynamicAr;
  /* const dynamicArLockValue =
    typeof formData.dynamicArLockValue === 'boolean'
      ? formData.dynamicArLockValue
      : true; */
  const timerAllowed = !isComboBot && !isHedgeBot;
  const showTimerControls = timerAllowed;
  const showMultiTargetControls = closeConditionIsTp && timerAllowed;
  const dynamicArAllowedTypes = useMemo(
    () => [IndicatorEnum.atr, IndicatorEnum.adr] as IndicatorEnum[],
    []
  );
  const dynamicArInvalidCount = useMemo(() => {
    if (!isDynamicArClose) {
      return 0;
    }

    return closeIndicators.filter(
      (indicator) =>
        !dynamicArAllowedTypes.includes(indicator.type as IndicatorEnum)
    ).length;
  }, [closeIndicators, dynamicArAllowedTypes, isDynamicArClose]);

  /* useEffect(() => {
    if (!isDynamicArClose) {
      return;
    }

    if (typeof formData.dynamicArLockValue !== 'boolean') {
      updateFormData('dynamicArLockValue', true);
    }
  }, [formData.dynamicArLockValue, isDynamicArClose, updateFormData]); */
  const { isBound: isTpPercBound } = useBotVarBinding('tpPerc');
  const { isBound: isFixedTpPriceBound } = useBotVarBinding('fixedTpPrice');
  const { isBound: isTrailingBound } = useBotVarBinding('trailingTpPerc');
  const { isBound: isMinTpBound } = useBotVarBinding('minTp');
  const { isBound: isTimerValueBound } = useBotVarBinding('closeByTimerValue');
  const focusTimerInput = useCallback(() => {
    if (isTimerValueBound) {
      return;
    }

    const node = timerInputRef.current;
    if (node) {
      node.focus({ preventScroll: true });
      if (typeof node.select === 'function') {
        node.select();
      }
    }
  }, [isTimerValueBound]);
  const shouldRenderMinTpGuard = minTpGuardAvailable;
  const minTpGuardEnabled =
    shouldRenderMinTpGuard && (useMinTP || isMinTpBound);
  const minTpGuardContext = useMemo(
    () =>
      minTpGuardEnabled
        ? {
            enabled: true,
            minTpValue: minTp ?? minTpToUse,
            sourceDescription: minTpSourceDescription || undefined,
          }
        : undefined,
    [minTp, minTpGuardEnabled, minTpSourceDescription, minTpToUse]
  );

  const boundPercentagePaths = useMemo(() => {
    const binding = botVars?.paths.filter(
      (p) => p.path.startsWith('multiTp.') && p.path.endsWith('.target')
    );
    if (!binding?.length) {
      return new Set<string>();
    }
    return new Set(Object.keys(binding));
  }, [botVars?.paths]);

  const boundAmountPaths = useMemo(() => {
    const binding = botVars?.paths.filter(
      (p) => p.path.startsWith('multiTp.') && p.path.endsWith('.amount')
    );
    if (!binding?.length) {
      return new Set<string>();
    }
    return new Set(Object.keys(binding));
  }, [botVars?.paths]);

  const boundFixedPaths = useMemo(() => {
    const binding = botVars?.paths.filter(
      (p) => p.path.startsWith('multiTp.') && p.path.endsWith('.fixed')
    );
    if (!binding?.length) {
      return new Set<string>();
    }
    return new Set(Object.keys(binding));
  }, [botVars?.paths]);

  const multiTargetsTotal = useMemo(() => {
    return multiTargets.reduce((sum, target) => {
      const numericValue = parseFloat(target.target);
      return sum + (Number.isFinite(numericValue) ? numericValue : 0);
    }, 0);
  }, [multiTargets]);

  const multiTargetsAmountTotal = useMemo(() => {
    return multiTargets.reduce((sum, target) => {
      const numericValue = parseFloat(target.amount);
      return sum + (Number.isFinite(numericValue) ? numericValue : 0);
    }, 0);
  }, [multiTargets]);

  const remainingPercentage = useMemo(
    () => Math.max(0, MAX_TOTAL_PERCENTAGE - multiTargetsTotal),
    [multiTargetsTotal]
  );

  // TP price-distance targets are uncapped and independent, so the sum of
  // target values can never "overflow". (Allocation overflow is hasAmountOverflow.)
  const hasAllocationOverflow = useMemo(
    () => multiTargetsTotal > TP_TARGET_VALUE_MAX,
    [multiTargetsTotal]
  );

  const remainingAmount = useMemo(
    () => Math.max(0, MAX_TOTAL_PERCENTAGE - multiTargetsAmountTotal),
    [multiTargetsAmountTotal]
  );

  const hasAmountOverflow = useMemo(
    () => multiTargetsAmountTotal > MAX_TOTAL_PERCENTAGE + 1e-6,
    [multiTargetsAmountTotal]
  );
  const maximumTargetsReached = multiTargets.length >= MAX_MULTI_TP_TARGETS;
  const percentageAllocationExhausted =
    !hasAllocationOverflow && remainingPercentage <= 0.001;
  const amountAllocationExhausted =
    !hasAmountOverflow && remainingAmount <= 0.001;

  const setMultiTargets = useCallback(
    (nextTargets: MultiTP[]) => {
      updateFormData('multiTp', nextTargets);
    },
    [updateFormData]
  );

  useEffect(() => {
    if (!useMultiTp) {
      return;
    }

    if (!hasAllocationOverflow && !hasAmountOverflow) {
      return;
    }

    const percentageClamped = clampTargetsToTotal(multiTp ?? [], minTpToUse);

    const amountClamped = clampTargetAmountsToTotal(
      percentageClamped,
      -1,
      MAX_TOTAL_PERCENTAGE,
      boundAmountPaths,
      (targetId) => getMultiTargetBindingPath(targetId, 'amount')
    );

    const hasChanges =
      amountClamped.length !== (multiTp ?? []).length ||
      amountClamped.some((target, index) => {
        const current = (multiTp ?? [])[index];
        if (!current) {
          return true;
        }

        return (
          target.target !== current.target ||
          target.amount !== current.amount ||
          target.fixed !== current.fixed
        );
      });

    if (!hasChanges) {
      return;
    }

    setMultiTargets(amountClamped);
  }, [
    boundAmountPaths,
    boundPercentagePaths,
    useMultiTp,
    hasAllocationOverflow,
    hasAmountOverflow,
    minTpToUse,
    multiTp,
    setMultiTargets,
  ]);

  const clearBindingsForTarget = useCallback(
    (targetId: string) => {
      const legacyPercentagePath = `multiTp.${targetId}.target`;
      const amountPath = getMultiTargetBindingPath(targetId, 'amount');

      setBotVars((previous) => {
        if (!previous) {
          return previous;
        }

        const filteredPaths = previous.paths.filter(
          (entry) =>
            entry.path !== legacyPercentagePath && entry.path !== amountPath
        );

        if (filteredPaths.length === previous.paths.length) {
          return previous;
        }

        if (filteredPaths.length === 0) {
          return null;
        }

        const nextList = Array.from(
          new Set(filteredPaths.map((entry) => entry.variable))
        );
        return {
          list: nextList,
          paths: filteredPaths,
        };
      });
    },
    [setBotVars]
  );

  useEffect(() => {
    const { limited, overflow } = enforceMultiTargetLimit(
      multiTargets,
      MAX_MULTI_TP_TARGETS
    );

    if (overflow.length === 0) {
      return;
    }

    overflow.forEach((target) => {
      if (target?.uuid) {
        clearBindingsForTarget(target.uuid);
      }
    });

    setMultiTargets(limited);
  }, [clearBindingsForTarget, multiTargets, setMultiTargets]);

  const applyVariableToMultiTarget = useCallback(
    (
      targetId: string,
      field: keyof MultiTP,
      variable: GlobalVariable | null
    ) => {
      if (
        !variable ||
        variable.value === undefined ||
        variable.value === null
      ) {
        return;
      }

      const rawValue = String(variable.value);
      const targetIndex = multiTargets.findIndex(
        (target) => target.uuid === targetId
      );
      if (targetIndex === -1) {
        return;
      }

      const nextTargets: MultiTP[] = multiTargets.map((target) => {
        if (target.uuid !== targetId) {
          return target;
        }

        if (field === 'fixed') {
          const sanitizedFixed = sanitizeFixedInput(rawValue);
          let derivedPercentage = target.target;
          if (currentPrice > 0) {
            const computedPercent = calculatePercentFromValue(
              isShort,
              sanitizedFixed,
              currentPrice
            );
            const sanitizedPercentage = sanitizePercentageInput(
              computedPercent,
              minTpToUse,
              TP_TARGET_VALUE_MAX
            );
            derivedPercentage = formatNumericString(sanitizedPercentage);
          }

          return {
            ...target,
            fixed: sanitizedFixed,
            target: derivedPercentage,
          };
        }

        if (field === 'target') {
          const sanitizedPercentage = sanitizePercentageInput(
            rawValue,
            minTpToUse,
            TP_TARGET_VALUE_MAX
          );

          const { fixed: _removedFixed, ...rest } = target;

          return {
            ...rest,
            target: formatNumericString(sanitizedPercentage),
          };
        }

        if (field === 'amount') {
          const sanitizedAmount = sanitizeAmountInput(
            rawValue,
            0,
            MAX_TOTAL_PERCENTAGE
          );

          return {
            ...target,
            amount: formatNumericString(sanitizedAmount),
          };
        }

        return target;
      });

      if (field === 'target' || field === 'fixed') {
        const clamped = clampTargetsToTotal(nextTargets, minTpToUse);
        setMultiTargets(clamped);
        return;
      }

      if (field === 'amount') {
        const clamped = clampTargetAmountsToTotal(
          nextTargets,
          targetIndex,
          MAX_TOTAL_PERCENTAGE,
          boundAmountPaths,
          (id) => getMultiTargetBindingPath(id, 'amount')
        );
        setMultiTargets(clamped);
        return;
      }

      setMultiTargets(nextTargets);
    },
    [
      boundAmountPaths,
      currentPrice,
      isShort,
      minTpToUse,
      multiTargets,
      setMultiTargets,
    ]
  );

  const expectedAverageProfitValue = useMemo(
    () =>
      calculateExpectedAverageProfit({
        useTp: useTp,
        useMultipleTpTargets: !!useMultiTp,
        tpPerc: tpPerc,
        multiTargets,
      }),
    [tpPerc, useMultiTp, useTp, multiTargets]
  );

  const expectedAverageProfit = useMemo(
    () => (Math.round(expectedAverageProfitValue * 100) / 100).toFixed(2),
    [expectedAverageProfitValue]
  );

  useEffect(() => {
    // Always ensure at least one target exists when TP is enabled and condition is TP
    if (!closeConditionIsTp) {
      return;
    }

    // Only seed targets when useMultiTp is true
    if (!useMultiTp) {
      return;
    }

    if (hasConfiguredMultiTpTargets(multiTargets)) {
      return;
    }

    const seedPercentage =
      lastSingleTargetPercentageRef.current ??
      formatNumericString(
        sanitizePercentageInput(
          tpPerc || minTpToUse,
          minTpToUse,
          TP_TARGET_VALUE_MAX
        )
      );

    const fallback = createMultiTarget({
      target: seedPercentage,
      amount: '100',
      existingTargets: multiTargets,
    });

    setMultiTargets([fallback]);
  }, [
    closeConditionIsTp,
    useMultiTp,
    tpPerc,
    minTpToUse,
    multiTargets,
    setMultiTargets,
  ]);

  const handleTargetPercentageChange = useCallback(
    (index: number, value: string | number) => {
      const target = multiTargets[index];
      if (!target) {
        return;
      }

      const path = getMultiTargetBindingPath(target.uuid, 'target');
      if (boundPercentagePaths.has(path)) {
        return;
      }

      let nextPercentage = sanitizePercentageInput(
        value,
        minTpToUse,
        TP_TARGET_VALUE_MAX
      );

      // Enforce minimum 0.5% gap from previous target
      if (index > 0 && multiTargets[index - 1]) {
        const prevTarget = multiTargets[index - 1];
        const prevPercentage = parseFloat(prevTarget.target);
        if (Number.isFinite(prevPercentage)) {
          const minAllowed = prevPercentage + 0.5;
          nextPercentage = Math.max(nextPercentage, minAllowed);
        }
      }

      const formattedPercentage = formatNumericString(nextPercentage);

      const nextTargets = multiTargets.map((entry, targetIndex) => {
        if (targetIndex !== index) {
          return entry;
        }

        // For terminal bots, recalculate fixed price from percentage
        if (formTerminal && currentPrice > 0) {
          const computedFixed = calculateValueFromPercent(
            isShort,
            formattedPercentage,
            currentPrice
          );
          const sanitizedFixed = sanitizeFixedInput(computedFixed);

          return {
            ...entry,
            target: formattedPercentage,
            fixed: sanitizedFixed,
          };
        }

        // For non-terminal bots, remove fixed field
        const { fixed: _removedFixed, ...rest } = entry;

        return {
          ...rest,
          target: formattedPercentage,
        };
      });

      const clamped = clampTargetsToTotal(nextTargets, minTpToUse);
      setMultiTargets(clamped);

      // When there's only one target, sync with legacy single target value
      if (clamped.length === 1 && clamped[0]) {
        updateFormData('tpPerc', clamped[0].target);
        if (formTerminal) {
          updateFormData('useFixedTPPrices', true);
          updateFormData('fixedTpPrice', clamped[0].fixed || '');
        }
      }
    },
    [
      boundPercentagePaths,
      currentPrice,
      formTerminal,
      isShort,
      minTpToUse,
      multiTargets,
      setMultiTargets,
      updateFormData,
    ]
  );

  const handleTargetAmountChange = useCallback(
    (index: number, value: string | number) => {
      const target = multiTargets[index];
      if (!target) {
        return;
      }

      const path = getMultiTargetBindingPath(target.uuid, 'amount');
      if (boundAmountPaths.has(path)) {
        return;
      }

      const numericValue =
        typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }

      const redistributed = redistributePositionSizes(
        multiTargets,
        index,
        numericValue,
        boundAmountPaths,
        (targetId) => getMultiTargetBindingPath(targetId, 'amount')
      );

      setMultiTargets(redistributed);
    },
    [boundAmountPaths, multiTargets, setMultiTargets]
  );

  const handleTargetFixedChange = useCallback(
    (index: number, value: string | number) => {
      const target = multiTargets[index];
      if (!target) {
        return;
      }

      // For terminal bots only
      if (!formTerminal) {
        return;
      }

      const sanitizedFixed = sanitizeFixedInput(value);

      // Calculate percentage from fixed price
      let derivedPercentage = target.target;
      if (currentPrice > 0 && sanitizedFixed) {
        const computedPercent = calculatePercentFromValue(
          isShort,
          sanitizedFixed,
          currentPrice
        );
        const sanitizedPercentage = sanitizePercentageInput(
          computedPercent,
          minTpToUse,
          TP_TARGET_VALUE_MAX
        );
        derivedPercentage = formatNumericString(sanitizedPercentage);
      }

      const nextTargets = multiTargets.map((entry, targetIndex) => {
        if (targetIndex !== index) {
          return entry;
        }

        return {
          ...entry,
          fixed: sanitizedFixed,
          target: derivedPercentage,
        };
      });

      const clamped = clampTargetsToTotal(nextTargets, minTpToUse);

      updateFormData('useFixedTPPrices', true);
      setMultiTargets(clamped);

      // When there's only one target, sync with legacy single target value
      if (clamped.length === 1 && clamped[0]) {
        updateFormData('tpPerc', clamped[0].target);
        updateFormData('fixedTpPrice', clamped[0].fixed || '');
      }
    },
    [
      currentPrice,
      formTerminal,
      isShort,
      minTpToUse,
      multiTargets,
      setMultiTargets,
      updateFormData,
    ]
  );

  // Track last processed coordinates to prevent duplicate processing
  const lastProcessedCoordinatesRef = useRef<string | null>(null);

  // Handle chart picker coordinates
  useEffect(() => {
    if (!coordinates || !coordinates.pickerField) {
      return;
    }

    // Check if this is a multiTp fixed field using the pickerField from coordinates
    const multiTpMatch = coordinates.pickerField.match(
      /^multiTp\.([^.]+)\.fixed$/
    );
    if (!multiTpMatch) {
      return;
    }

    // Create a unique key for these coordinates to prevent duplicate processing
    const coordinatesKey = `${coordinates.pickerField}-${coordinates.time}-${coordinates.price}`;
    if (lastProcessedCoordinatesRef.current === coordinatesKey) {
      return; // Already processed these coordinates
    }

    const targetUuid = multiTpMatch[1];
    const pickedPrice = coordinates.price;

    logger.infoCategory('TP-ChartPicker', 'Applying picked price', {
      targetUuid,
      pickedPrice,
      currentPrice,
      pickerField: coordinates.pickerField,
    });

    // Find and update the target
    const targetIndex = multiTargets.findIndex((t) => t.uuid === targetUuid);
    if (targetIndex === -1) {
      logger.warnCategory('TP-ChartPicker', 'Target not found', { targetUuid });
      if (setCoordinates) {
        setCoordinates(null);
      }
      lastProcessedCoordinatesRef.current = null;
      return;
    }

    // Mark as processed BEFORE applying changes to prevent re-processing during render
    lastProcessedCoordinatesRef.current = coordinatesKey;

    // Apply the picked price to the fixed field
    handleTargetFixedChange(targetIndex, pickedPrice);

    // Clear coordinates after processing (this will trigger effect again but will be blocked by ref check)
    if (setCoordinates) {
      setCoordinates(null);
    }
  }, [
    coordinates,
    setCoordinates,
    multiTargets,
    handleTargetFixedChange,
    currentPrice,
  ]);

  const handleRemoveTarget = useCallback(
    (index: number) => {
      if (multiTargets.length <= 1) {
        return;
      }

      const target = multiTargets[index];
      if (target) {
        clearBindingsForTarget(target.uuid);
      }

      const nextTargets = multiTargets.filter(
        (_, targetIndex) => targetIndex !== index
      );

      // If we're going down to 1 target, disable useMultiTp
      if (nextTargets.length === 1 && useMultiTp) {
        updateFormData('useMultiTp', false);
      }

      setMultiTargets(nextTargets);
    },
    [
      clearBindingsForTarget,
      useMultiTp,
      multiTargets,
      setMultiTargets,
      updateFormData,
    ]
  );

  const handleAddTarget = useCallback(() => {
    if (multiTargets.length >= MAX_MULTI_TP_TARGETS) {
      return;
    }

    // Auto-enable useMultiTp when adding a second target
    if (multiTargets.length === 1 && !useMultiTp) {
      updateFormData('useMultiTp', true);
    }

    let percentageAllocation: number;
    if (multiTargets.length === 0) {
      percentageAllocation = Math.max(minTpToUse, 1);
    } else {
      // Set new target to 1% higher than the last target
      const lastTarget = multiTargets[multiTargets.length - 1];
      const lastPercentage = parseFloat(lastTarget?.target || '0');
      percentageAllocation = Number.isFinite(lastPercentage)
        ? Math.min(50, lastPercentage + 1)
        : Math.max(minTpToUse, 1);
    }

    const newTarget = createMultiTarget({
      target: percentageAllocation.toString(),
      amount: '0', // Will be set by distribution
      existingTargets: multiTargets,
    });

    // Add new target and distribute equally
    const targetsWithNew = [...multiTargets, newTarget];
    const distributed = distributePositionSizesEqually(
      targetsWithNew,
      boundAmountPaths,
      (targetId) => getMultiTargetBindingPath(targetId, 'amount')
    );

    const percentageClamped = clampTargetsToTotal(distributed, minTpToUse);

    setMultiTargets(percentageClamped);
  }, [
    boundAmountPaths,
    useMultiTp,
    minTpToUse,
    multiTargets,
    setMultiTargets,
    updateFormData,
  ]);

  const multiTargetWarnings = useMemo(
    () =>
      collectMultiTargetWarnings({
        remainingPercentage,
        hasAllocationOverflow,
        remainingAmount,
        hasAmountOverflow,
        errors: mergedErrors,
        maximumTargets: MAX_MULTI_TP_TARGETS,
        maximumTargetsReached,
        percentageExhausted: percentageAllocationExhausted,
        amountExhausted: amountAllocationExhausted,
        ...(minTpGuardContext ? { minTpGuard: minTpGuardContext } : {}),
      }),
    [
      amountAllocationExhausted,
      hasAllocationOverflow,
      hasAmountOverflow,
      minTpGuardContext,
      mergedErrors,
      maximumTargetsReached,
      percentageAllocationExhausted,
      remainingAmount,
      remainingPercentage,
    ]
  );

  useEffect(() => {
    if (!useFixedTPPrices) {
      if (priceValue) {
        setPriceValue('');
      }
      return;
    }

    if (isFixedTpPriceBound) {
      const boundValue = fixedTpPrice ?? '';
      if (boundValue !== priceValue) {
        setPriceValue(boundValue);
      }
      return;
    }

    // If a fixed TP price is provided explicitly (e.g. via terminal drag), prefer it
    if (fixedTpPrice) {
      if (fixedTpPrice !== priceValue) {
        setPriceValue(fixedTpPrice);
      }

      // When there's a single (legacy) TP target (not multi-target) update the
      // percentage immediately (no debounce) so the slider reflects the picked price
      // without delay (but don't override a bound percentage variable).
      if (!useMultiTp) {
        if (!isTpPercBound && currentPrice > 0) {
          const calculatedPercent = calculatePercentFromValue(
            isShort,
            fixedTpPrice,
            currentPrice
          );

          const prevPercent = Number.parseFloat(tpPerc || '0');
          const nextPercent = Number.parseFloat(calculatedPercent || '0');

          if (
            Number.isFinite(nextPercent) &&
            Math.abs(nextPercent - prevPercent) > 0.001
          ) {
            updateFormData('tpPerc', calculatedPercent);
            setLastUpdate(Date.now());
          }
        }
      }

      return;
    }

    if (currentPrice > 0) {
      const calculatedPrice = calculateValueFromPercent(
        isShort,
        tpPerc || '1',
        currentPrice
      );

      if (calculatedPrice !== priceValue) {
        setPriceValue(calculatedPrice);
      }

      if (calculatedPrice !== fixedTpPrice) {
        updateFormData('fixedTpPrice', calculatedPrice);
      }
    }
  }, [
    currentPrice,
    fixedTpPrice,
    tpPerc,
    useFixedTPPrices,
    isFixedTpPriceBound,
    isShort,
    priceValue,
    updateFormData,
    useMultiTp,
    isTpPercBound,
  ]);

  // When the terminal updates multi-target fixed TP prices directly (e.g. on chart drag),
  // ensure each target's percentage is recalculated so the UI reflects the change.
  // Also validate direction to prevent invalid states.
  useEffect(() => {
    if (!currentPrice || !Array.isArray(multiTp) || multiTp.length === 0) {
      return;
    }

    let changed = false;
    const next = (multiTp || []).map((t) => {
      if (!t || !t.fixed) {
        return t;
      }

      // Respect bound percentage fields - don't overwrite bound targets
      const percentagePath = getMultiTargetBindingPath(t.uuid, 'target');
      if (boundPercentagePaths.has(percentagePath)) {
        return t;
      }

      const fixedPrice = Number.parseFloat(t.fixed);
      if (!Number.isFinite(fixedPrice)) {
        return t;
      }

      // Recalculate percentage from fixed price (always). Percentage validation
      // is performed against the percentage field itself.
      const calculated = calculatePercentFromValue(
        isShort,
        t.fixed,
        currentPrice
      );
      if (calculated !== t.target) {
        changed = true;
        return { ...t, target: calculated };
      }

      return t;
    });

    if (changed) {
      updateFormData('multiTp', next);
    }
  }, [multiTp, currentPrice, isShort, boundPercentagePaths, updateFormData]);

  // Update percentage when price changes (with debouncing)
  useEffect(() => {
    if (
      !useFixedTPPrices ||
      !priceValue ||
      currentPrice <= 0 ||
      isTpPercBound
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const fixedPriceValue = Number.parseFloat(priceValue);
      if (!Number.isFinite(fixedPriceValue)) {
        return;
      }

      // Recalculate percentage from the fixed price always. Validate via
      // the percentage field instead of blocking updates here.
      const calculatedPercent = calculatePercentFromValue(
        isShort,
        priceValue,
        currentPrice
      );

      const prevPercent = Number.parseFloat(tpPerc || '0');
      const nextPercent = Number.parseFloat(calculatedPercent || '0');

      if (!Number.isFinite(nextPercent)) {
        return;
      }

      if (Math.abs(nextPercent - prevPercent) > 0.001) {
        updateFormData('tpPerc', calculatedPercent);
        setLastUpdate(Date.now());
      }
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentPrice,
    tpPerc,
    useFixedTPPrices,
    isShort,
    isTpPercBound,
    priceValue,
    updateFormData,
  ]);

  const handleToggleFavorite = useCallback(
    (type: IndicatorEnum, nextIsFavorite: boolean) => {
      toggleFavorite(type, nextIsFavorite);
    },
    [toggleFavorite]
  );

  const launchCloseIndicatorSelector = useCallback(
    (options: {
      title: string;
      description?: string;
      onSelect: (type: IndicatorEnum) => void;
    }) => {
      const selectorOptions: OpenIndicatorSelectorOptions = {
        allowedActions: [IndicatorAction.closeDeal],
        favorites: favoriteIndicatorTypes,
        onToggleFavorite: handleToggleFavorite,
        favoritesMutating,
        isFavoriteMutating: isIndicatorMutating,
        title: options.title,
        onSelect: options.onSelect,
      };

      if (options.description !== undefined) {
        selectorOptions.description = options.description;
      }

      openSelector(selectorOptions);
    },
    [
      favoriteIndicatorTypes,
      favoritesMutating,
      handleToggleFavorite,
      isIndicatorMutating,
      openSelector,
    ]
  );

  const handleAddIndicator = useCallback(() => {
    if (indicatorLimitReached) {
      return;
    }

    if (isDynamicArClose) {
      launchCloseIndicatorSelector({
        title: 'Select ATR/ADR indicator',
        description: 'Dynamic ATR/ADR requires ATR or ADR indicators.',
        onSelect: (type) => {
          if (!dynamicArAllowedTypes.includes(type)) {
            return;
          }
          const defaults = getIndicatorDefaultParams(
            type,
            IndicatorAction.closeDeal
          );
          const sanitizedParams = sanitizeIndicatorParams(
            (defaults ?? {}) as IndicatorParamsState
          );
          const paramsWithFactor: IndicatorParamsState = {
            ...sanitizedParams,
            dynamicArFactor: sanitizedParams['dynamicArFactor'] ?? '1',
          };

          const newIndicator = buildIndicatorConfig(type, paramsWithFactor, {
            uuid: createCloseIndicatorId(),
          });

          updateFormData('indicators', [
            ...indicators,
            { ...newIndicator, ...paramsWithFactor },
          ]);
        },
      });
      return;
    }

    // Load a default RSI indicator straight away; the type can be changed
    // afterwards via the card's change-indicator control.
    const type = IndicatorEnum.rsi;
    const defaults = getIndicatorDefaultParams(type, IndicatorAction.closeDeal);
    const sanitizedParams = sanitizeIndicatorParams(
      (defaults ?? {}) as IndicatorParamsState
    );

    const newIndicator = buildIndicatorConfig(type, sanitizedParams, {
      uuid: createCloseIndicatorId(),
    });

    updateFormData('indicators', [
      ...indicators,
      { ...newIndicator, ...sanitizedParams },
    ]);
  }, [
    dynamicArAllowedTypes,
    indicatorLimitReached,
    isDynamicArClose,
    launchCloseIndicatorSelector,
    updateFormData,
    indicators,
  ]);

  const handleChangeIndicatorParams = useCallback(
    (id: string, params: IndicatorParamsState) => {
      const sanitized = sanitizeIndicatorParams(params);
      // Spread the sanitized params top-level: both the display
      // (DynamicArIndicatorConfig reads the indicator itself as its params
      // state) and the save serializer (normalizeIndicatorParamsRecord drops
      // any legacy `params` sub-object) only see top-level fields — nesting
      // under `params` made edits (e.g. ATR Length) silently snap back.
      updateFormData(
        'indicators',
        indicators.map((indicator) =>
          indicator.uuid === id ? { ...indicator, ...sanitized } : indicator
        )
      );
    },
    [indicators, updateFormData]
  );

  const handleSelectIndicatorType = useCallback(
    (indicator: IndicatorConfig) => {
      const title = isDynamicArClose
        ? 'Select ATR/ADR indicator'
        : 'Select closing indicator';
      const description = isDynamicArClose
        ? 'Dynamic ATR/ADR requires ATR or ADR indicators.'
        : undefined;

      launchCloseIndicatorSelector({
        title,
        ...(description ? { description } : {}),
        onSelect: (type) => {
          if (isDynamicArClose && !dynamicArAllowedTypes.includes(type)) {
            return;
          }
          const defaults = getIndicatorDefaultParams(
            type,
            IndicatorAction.closeDeal
          );
          const sanitizedParams = sanitizeIndicatorParams(
            (defaults ?? {}) as IndicatorParamsState
          );

          const paramsWithExtras: IndicatorParamsState = isDynamicArClose
            ? {
                ...sanitizedParams,
                dynamicArFactor:
                  sanitizedParams['dynamicArFactor'] ??
                  ((indicator ?? {}) as IndicatorParamsState)[
                    'dynamicArFactor'
                  ] ??
                  '1',
              }
            : sanitizedParams;

          const nextIndicator = buildIndicatorConfig(type, paramsWithExtras, {
            uuid: indicator.uuid,
            keepConditionBars: sanitizeKeepConditionBars(
              indicator.keepConditionBars,
              toNonNegativeInteger(indicator.keepConditionBars ?? 0)
            ),
          });

          updateFormData(
            'indicators',
            indicators.map((candidate) =>
              candidate.uuid === indicator.uuid
                ? { ...candidate, ...nextIndicator, params: paramsWithExtras }
                : candidate
            )
          );
        },
      });
    },
    [
      indicators,
      dynamicArAllowedTypes,
      isDynamicArClose,
      launchCloseIndicatorSelector,
      updateFormData,
    ]
  );

  const handleRemoveIndicator = useCallback(
    (id: string) => {
      updateFormData(
        'indicators',
        indicators.filter((indicator) => indicator.uuid !== id)
      );
    },
    [updateFormData, indicators]
  );

  const handleDynamicArFactorChange = useCallback(
    (id: string, value: string | number | null | undefined) => {
      const sanitized = sanitizeDynamicArFactor(value);
      updateFormData(
        'indicators',
        indicators.map((indicator) => {
          if (indicator.uuid !== id) {
            return indicator;
          }

          const nextParams = {
            ...(indicator ?? {}),
            dynamicArFactor: sanitized,
          } as IndicatorParamsState;

          return {
            ...indicator,
            ...nextParams,
          };
        })
      );
    },
    [updateFormData, indicators]
  );

  const handleAddCloseGroup = useCallback(() => {
    if (indicatorLimitReached) {
      return;
    }

    const newGroup: IndicatorGroup = {
      id: createCloseGroupId(),
      logic:
        stopDealLogic === IndicatorsLogicEnum.or
          ? IndicatorsLogicEnum.or
          : IndicatorsLogicEnum.and,
      action: IndicatorAction.closeDeal,
    };

    syncCloseIndicatorGroups([...closeIndicatorGroups, newGroup]);
  }, [
    closeIndicatorGroups,
    stopDealLogic,
    indicatorLimitReached,
    syncCloseIndicatorGroups,
  ]);

  const handleRemoveCloseGroup = useCallback(
    (groupId: string) => {
      const nextGroups = closeIndicatorGroups.filter(
        (group) => group.id !== groupId
      );
      syncCloseIndicatorGroups(nextGroups);
    },
    [closeIndicatorGroups, syncCloseIndicatorGroups]
  );

  const handleUpdateCloseGroup = useCallback(
    (groupId: string, updates: Partial<IndicatorGroup>) => {
      const nextGroups = closeIndicatorGroups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        const nextGroup: IndicatorGroup = {
          ...group,
          ...updates,
        };

        return nextGroup;
      });

      syncCloseIndicatorGroups(nextGroups);
    },
    [closeIndicatorGroups, syncCloseIndicatorGroups]
  );

  const handleChangeCloseGroupLogic = useCallback(
    (groupId: string, logic: IndicatorGroup['logic']) => {
      handleUpdateCloseGroup(groupId, { logic });
    },
    [handleUpdateCloseGroup]
  );

  const handleAddIndicatorToCloseGroup = useCallback(
    (groupId: string) => {
      const targetGroup = closeIndicatorGroups.find(
        (group) => group.id === groupId
      );
      if (!targetGroup) {
        return;
      }

      // Default to RSI immediately; type is swappable on the card afterwards.
      const type = IndicatorEnum.rsi;
      const defaults = getIndicatorDefaultParams(type, IndicatorAction.closeDeal);
      const sanitizedParams = sanitizeIndicatorParams(
        (defaults ?? {}) as IndicatorParamsState
      );

      const newIndicator = buildIndicatorConfig(type, sanitizedParams, {
        uuid: createCloseIndicatorId(),
        indicatorAction: IndicatorAction.closeDeal,
      });

      updateFormData('indicators', [
        ...indicators,
        { ...newIndicator, groupId: groupId },
      ]);
    },
    [closeIndicatorGroups, updateFormData, indicators]
  );

  const handleChangeIndicatorParamsInCloseGroup = useCallback(
    (groupId: string, indicatorId: string, params: IndicatorParamsState) => {
      const sanitized = sanitizeIndicatorParams(params);
      updateFormData(
        'indicators',
        indicators.map((indicator) =>
          indicator.uuid === indicatorId &&
          (indicator.groupId === groupId ||
            (!indicator.groupId && groupId === undefined))
            ? { ...indicator, ...sanitized }
            : indicator
        )
      );
    },
    [updateFormData, indicators]
  );

  const handleSelectIndicatorTypeInCloseGroup = useCallback(
    (groupId: string, indicator: IndicatorConfig) => {
      const targetGroup = closeIndicatorGroups.find(
        (group) => group.id === groupId
      );
      if (!targetGroup) {
        return;
      }

      launchCloseIndicatorSelector({
        title: 'Select closing indicator',
        onSelect: (type) => {
          const defaults = getIndicatorDefaultParams(
            type,
            IndicatorAction.closeDeal
          );
          const sanitizedParams = sanitizeIndicatorParams(
            (defaults ?? {}) as IndicatorParamsState
          );

          const nextIndicator = buildIndicatorConfig(type, sanitizedParams, {
            uuid: indicator.uuid,
          });

          updateFormData(
            'indicators',
            indicators.map((candidate) =>
              candidate.uuid === indicator.uuid
                ? { ...nextIndicator, groupId: candidate.groupId ?? groupId }
                : candidate
            )
          );
        },
      });
    },
    [
      closeIndicatorGroups,
      launchCloseIndicatorSelector,
      updateFormData,
      indicators,
    ]
  );
  const handleRemoveIndicatorFromCloseGroup = useCallback(
    (groupId: string, indicatorId: string) => {
      const indicator = indicators.find((ind) => ind.uuid === indicatorId);
      if (!indicator) {
        return;
      }
      // Only drop the group when removing its LAST indicator — otherwise
      // deleting one indicator would orphan the rest of the group.
      const indicatorsInGroup = indicators.filter(
        (ind) => ind.groupId === groupId
      ).length;

      updateFormData(
        'indicators',
        indicators.filter((ind) => ind.uuid !== indicatorId)
      );
      if (indicatorsInGroup === 1) {
        updateFormData(
          'indicatorGroups',
          indicatorGroups.filter((group) => group.id !== groupId)
        );
      }
    },
    [indicators, indicatorGroups, updateFormData]
  );

  const renderDynamicArExtras = useCallback(
    (indicator: IndicatorConfig) => {
      const isAllowed = dynamicArAllowedTypes.includes(
        indicator.type as IndicatorEnum
      );

      if (!isAllowed) {
        return (
          <SettingsAlert
            variant="error"
            title={`${indicator.type} isn't supported for Dynamic ATR/ADR. Remove it and add an ATR or ADR indicator instead.`}
          />
        );
      }

      return (
        <DynamicArIndicatorConfig
          indicator={indicator}
          action={IndicatorAction.closeDeal}
          exchange={currentExchange?.provider}
          onChangeParams={(next) =>
            handleChangeIndicatorParams(indicator.uuid, next)
          }
          onChangeFactor={(value) =>
            handleDynamicArFactorChange(indicator.uuid, value)
          }
        />
      );
    },
    [
      dynamicArAllowedTypes,
      currentExchange?.provider,
      handleChangeIndicatorParams,
      handleDynamicArFactorChange,
    ]
  );

  const handleTimerValueChange = useCallback(
    (value: string | number, options?: { requestFocus?: boolean }) => {
      const effect = deriveTimerValueChangeEffects(value, options);
      applyUpdates(effect.updates);

      if (effect.shouldScheduleFocus) {
        scheduleFocus(focusTimerInput);
      }
    },
    [applyUpdates, focusTimerInput, scheduleFocus]
  );
  const handleToggleTimer = useCallback(
    (checked: boolean) => {
      updateFormData('closeByTimer', checked);

      if (!checked) {
        return;
      }

      const nextValue = closeByTimerValue ?? '1';

      handleTimerValueChange(nextValue, {
        requestFocus: !isTimerValueBound,
      });
    },
    [
      closeByTimerValue,
      handleTimerValueChange,
      isTimerValueBound,
      updateFormData,
    ]
  );

  const applyVariableToField = useCallback(
    (field: TakeProfitBindableField, variable: GlobalVariable | null) => {
      const effect = variable
        ? resolveVariableBindingEffects(field, variable)
        : null;

      if (!effect) {
        return;
      }

      if (effect.updates?.length) {
        applyUpdates(effect.updates);
      }

      if (effect.priceValue !== undefined) {
        setPriceValue(effect.priceValue);
      }

      if (effect.timerValue !== undefined) {
        handleTimerValueChange(effect.timerValue, {
          requestFocus: Boolean(effect.shouldScheduleFocus),
        });
        return;
      }

      if (!effect.shouldScheduleFocus || !effect.focusTarget) {
        return;
      }

      if (effect.focusTarget === 'timer') {
        scheduleFocus(focusTimerInput);
      }
    },
    [applyUpdates, focusTimerInput, handleTimerValueChange, scheduleFocus]
  );

  // Removed broken self-comparison check that always evaluated to false

  useEffect(() => {
    const effect = deriveTimerAvailabilityEffects({
      timerAllowed,
      closeByTimer: closeByTimer,
    });

    if (effect) {
      applyUpdates(effect.updates);
    }
  }, [applyUpdates, closeByTimer, timerAllowed]);

  useEffect(() => {
    const updates = enforceMinTpGuardAvailability({
      guardAvailable: minTpGuardAvailable,
      useMinTp: useMinTP,
      isMinTpBound,
    });

    if (updates) {
      applyUpdates(updates);
    }
  }, [applyUpdates, useMinTP, isMinTpBound, minTpGuardAvailable]);

  useEffect(() => {
    const compatibility = enforceTrailingCompatibility({
      closeConditionIsTp,
      isHedgeBot,
      useMultipleTpTargets: multiTargets.length > 1,
      useTrailingTp: Boolean(trailingTp),
    });

    // Note: we do NOT sync useMultiTp here — it's auto-managed by handleAddTarget/handleRemoveTarget
    if (Boolean(trailingTp) !== compatibility.useTrailingTp) {
      applyUpdates([['trailingTp', compatibility.useTrailingTp]]);
    }
  }, [applyUpdates, closeConditionIsTp, multiTargets.length, trailingTp, isHedgeBot]);

  useEffect(() => {
    if (!trailingTp) {
      return;
    }

    const sanitized = formatNumericString(
      sanitizePercentageInput(
        trailingTpPerc ?? TRAILING_TP_MIN,
        TRAILING_TP_MIN,
        TRAILING_TP_MAX
      ),
      3
    );

    if (sanitized !== String(trailingTpPerc ?? '')) {
      updateFormData('trailingTpPerc', sanitized);
    }
  }, [trailingTpPerc, trailingTp, updateFormData]);

  useEffect(() => {
    if (!useTp || useMultiTp) {
      return;
    }

    const currentTp = parseFloat(tpPerc || '0');
    if (Number.isFinite(currentTp) && currentTp > 0 && currentTp < minTpToUse) {
      updateFormData('tpPerc', minTpToUse.toString());
    }
  }, [useTp, useMultiTp, tpPerc, minTpToUse, updateFormData]);

  const interactionDisabledClass = takeProfitLocked
    ? 'pointer-events-none select-none opacity-60'
    : '';

  const handleSliderChange = useCallback(
    (value: number | number[]) => {
      if (isTpPercBound) {
        return;
      }

      const numericValue = Array.isArray(value) ? value[0] : value;
      if (!Number.isFinite(numericValue)) {
        return;
      }

      const sanitized = sanitizePercentageInput(
        numericValue,
        minTpToUse,
        TP_SLIDER_MAX_PERCENT
      );

      const nextValue = sanitized.toString();
      updateFormData('tpPerc', nextValue);
    },
    [isTpPercBound, minTpToUse, updateFormData]
  );

  const percentageInputRef = useRef<HTMLInputElement>(null);

  // Per-field validation for TP is handled by the centralized validator (`hotValidateDcaFormData`).
  // Local helpers (e.g. `validateTpTarget`) may still be used for UI sanitization, but
  // registration of errors is done centrally to avoid duplication.

  const tpValidation = React.useMemo(() => {
    // No upper cap on the single take-profit value (matches legacy). The slider
    // is still capped for practical reasons, but a typed value can go arbitrarily
    // high for high-leverage targets.
    return validateTpTarget(
      tpPerc ?? String(minTpToUse),
      minTpToUse,
      Number.POSITIVE_INFINITY,
      Boolean(isTpPercBound)
    );
  }, [tpPerc, minTpToUse, isTpPercBound]);

  const handlePresetClick = useCallback(
    (percentage: number) => {
      const effect = derivePresetClickEffects({
        percentage,
        targetMode: 'percentage',
        formData: {
          tpPerc,
          useFixedTPPrices: false,
          fixedTpPrice: '',
        },
        isTpValueBound: isTpPercBound,
        currentPrice,
        minTpPercent: minTpToUse,
        isShort,
      });

      if (!effect) {
        return;
      }

      applyUpdates(effect.updates);

      if (effect.priceValue !== undefined) {
        setPriceValue(effect.priceValue);
      }
    },
    [
      applyUpdates,
      currentPrice,
      tpPerc,
      isShort,
      isTpPercBound,
      minTpToUse,
      setPriceValue,
    ]
  );

  // Only auto expand when any of the contained options are actually
  // enabled (not merely present). Previously the check included
  // `!isComboBot && !isHedgeBot` which made this always true in the
  // non-combo branch. Compute a dedicated flag for clarity.
  const shouldAutoExpand = Boolean(
    (showTimerControls && closeByTimer) ||
    (closeConditionIsTp &&
      showMultiTargetControls &&
      !!trailingTp &&
      multiTargets.length <= 1)
  );

  if (!useTp) {
    return null;
  }

  return (
    <>
      {isComboBot ? (
        <>
          <MasonryLayout
            gap={16}
            containerBreakpoints={{
              default: 1,
              640: 2,
              1024: 3,
            }}
          >
            {takeProfitLocked && (
              <SettingsRow colSpan="full">
                <Alert className="border-blue-500/40 bg-blue-500/10 text-blue-900 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-50">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm font-semibold">
                    Take profit managed by risk/reward
                  </AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">
                    Risk/reward automation is enforcing the take profit target.
                    Disable the risk/reward ratio to edit these settings.
                  </AlertDescription>
                </Alert>
              </SettingsRow>
            )}

            <SettingsRow
              name="Take profit target"
              tooltip="Configure the take profit amount."
              colSpan="full"
              navId="take-profit"
              className={interactionDisabledClass}
              contentClassName="space-y-md"
            >
              <Slider
                value={parseFloat(tpPerc) || minTpToUse}
                onChange={handleSliderChange}
                min={minTpToUse}
                max={TP_SLIDER_MAX_PERCENT}
                step={0.1}
                className="w-full"
                disabled={isTpPercBound}
              />

              <FieldVariableBinding
                path="tpPerc"
                varType="float"
                tooltip="Bind take profit percentage"
                disabled={takeProfitLocked}
                variant="inline"
                contentClassName="w-full max-w-[180px]"
                onVariableSelected={(variable) =>
                  applyVariableToField('tpPerc', variable)
                }
                onVariableResolved={(variable) =>
                  applyVariableToField('tpPerc', variable)
                }
              >
                <NumberInput
                  ref={percentageInputRef}
                  value={tpPerc}
                  onChange={(value) => updateFormData('tpPerc', value)}
                  min={minTpToUse}
                  step={0.1}
                  precision={3}
                  className={`w-full${
                    (mergedErrors['tpPerc'] ? true : !tpValidation.isValid)
                      ? ' border-destructive focus-visible:ring-destructive'
                      : ''
                  }`}
                  showControls={false}
                  disabled={isTpPercBound}
                  endAdornment={unitAdornment('%')}
                />
              </FieldVariableBinding>

              <div className="flex flex-wrap gap-xs">
                {[1, 2, 5, 10].map((percentage) => {
                  const label = `${percentage}%`;

                  const numericTpPerc = Number.parseFloat(tpPerc || '0');

                  const isActive = numericTpPerc === percentage;

                  const shouldDisable =
                    percentage < minTpToUse || isTpPercBound;

                  return (
                    <Button
                      key={percentage}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePresetClick(percentage)}
                      className="h-7 px-3 text-xs"
                      disabled={shouldDisable}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>

              <div className="space-y-md border-t border-muted pt-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-xs">
                    <Label className="text-sm">Deal close type</Label>
                    <Tooltip tooltip="Limit order rests the take profit on the ladder; Market order executes it immediately at market when the target triggers.">
                      <InfoIcon />
                    </Tooltip>
                  </div>
                  <TerminalButtonStack
                    value={comboTpLimit ? 'limit' : 'market'}
                    onValueChange={(value) =>
                      updateFormData('comboTpLimit', value === 'limit')
                    }
                    options={[
                      { value: 'limit', label: 'Limit order' },
                      { value: 'market', label: 'Market order' },
                    ]}
                    className="w-full sm:w-auto"
                  />
                </div>
              </div>

              {mergedErrors['tpPerc'] ? (
                <p className="text-xs text-destructive">
                  {mergedErrors['tpPerc']}
                </p>
              ) : !tpValidation.isValid ? (
                <p className="text-xs text-destructive">
                  {tpValidation.message}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Min value is {minTpToUse}%
              </p>
            </SettingsRow>

            <BaseStopLosslOn section="tp" />
          </MasonryLayout>

          <SettingsLoadMore id="take-profit-advanced" title="More Settings">
            {null}
          </SettingsLoadMore>
        </>
      ) : (
        <Tabs
          value={closeCondition}
          onValueChange={(value) =>
            handleCloseConditionChange(value as CloseConditionEnum)
          }
        >
          {!isDealEdit && (
            <SettingsRow
              name="Take profit type"
              tooltip="Select the condition under which the deal will close."
              colSpan="full"
              className={interactionDisabledClass}
            >
              <div className="space-y-md">
                <TabsList className="w-full" fullWidth>
                  {closeConditionOptions.map((option) => (
                    <TabsTrigger
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                      className="justify-start"
                    >
                      <div className="flex flex-col items-start">
                        <span>{closeConditionsMap[option.value]}</span>
                        {option.value === CloseConditionEnum.webhook &&
                        option.disabled ? (
                          <span className="text-xs text-muted-foreground">
                            Upgrade required
                          </span>
                        ) : null}
                      </div>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {mergedErrors['dealCloseCondition'] && (
                  <p className="text-xs text-destructive">
                    {mergedErrors['dealCloseCondition']}
                  </p>
                )}
              </div>
            </SettingsRow>
          )}

          {closeConditionOptions.map((option) => (
            <TabsContent
              key={option.value}
              value={option.value}
              className="space-y-md"
            >
              {takeProfitLocked && !isDealEdit && (
                <SettingsRow colSpan="full">
                  <Alert className="border-blue-500/40 bg-blue-500/10 text-blue-900 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-sm font-semibold">
                      Take profit managed by risk/reward
                    </AlertTitle>
                    <AlertDescription className="text-xs leading-relaxed">
                      Risk/reward automation is enforcing the take profit
                      target. Disable the risk/reward ratio to edit these
                      settings.
                    </AlertDescription>
                  </Alert>
                </SettingsRow>
              )}

              {option.value === CloseConditionEnum.webhook && !isDealEdit ? (
                <Alert>
                  <AlertTitle className="text-sm font-semibold">
                    Webhook-managed take profit
                  </AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">
                    Take profit management will rely on webhook signals.
                    Configure your payload in the webhook section to control
                    exits.
                  </AlertDescription>
                </Alert>
              ) : null}

              {closeConditionIsTp && showMultiTargetControls ? (
                <SettingsRow
                  name="Take profit targets"
                  tooltip="Configure your take profit targets. Add multiple targets to distribute your exit across different price levels."
                  tooltipURL="/help/multiple-take-profit-targets"
                  colSpan="full"
                  className={interactionDisabledClass}
                >
                  {hasAllocationOverflow ? (
                    <Alert variant="destructive" className="py-2 text-xs">
                      <AlertTitle className="text-sm font-semibold">
                        Allocation exceeds 100%
                      </AlertTitle>
                      <AlertDescription>
                        Adjust target percentages so the total does not exceed
                        100%.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {hasAmountOverflow ? (
                    <Alert variant="destructive" className="py-2 text-xs">
                      <AlertTitle className="text-sm font-semibold">
                        Position allocation exceeds 100%
                      </AlertTitle>
                      <AlertDescription>
                        Reduce the position percentages so the sum of the
                        distributed position equals 100% or less.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <MasonryLayout
                    gap={16}
                    containerBreakpoints={{
                      default: 1,
                      640: 2,
                      1024: 3,
                    }}
                  >
                    {multiTargets.length > 0 ? (
                      multiTargets.map((target, index) => {
                        const percentagePath = getMultiTargetBindingPath(
                          target.uuid,
                          'target'
                        );
                        const amountPath = getMultiTargetBindingPath(
                          target.uuid,
                          'amount'
                        );
                        const fixedPath = getMultiTargetBindingPath(
                          target.uuid,
                          'fixed'
                        );

                        const isTargetPercentageBound =
                          boundPercentagePaths.has(percentagePath);
                        const isTargetAmountBound =
                          boundAmountPaths.has(amountPath);
                        const isTargetFixedBound =
                          boundFixedPaths.has(fixedPath);
                        // TP targets are uncapped price levels — no per-target
                        // maximum derived from a shared total.
                        const maxForCurrent = TP_TARGET_VALUE_MAX;
                        const previousTarget =
                          index > 0 ? multiTargets[index - 1] : undefined;
                        const previousTargetValue = previousTarget
                          ? parseFloat(previousTarget.target)
                          : undefined;
                        const validation = validateTpTarget(
                          target.target,
                          minTpToUse,
                          maxForCurrent,
                          isTargetPercentageBound,
                          previousTargetValue
                        );
                        const percentageValue = sanitizePercentageInput(
                          target.target,
                          minTpToUse,
                          maxForCurrent
                        );
                        const amountValue = sanitizeAmountInput(
                          target.amount,
                          1,
                          MAX_TOTAL_PERCENTAGE
                        );
                        const formattedAllocation = Number.isInteger(
                          amountValue
                        )
                          ? amountValue.toString()
                          : amountValue.toFixed(2);

                        // Calculate max for this slider: 100% - 1%*(other targets count)
                        // Filter out bound targets as they can't be reduced
                        const unboundTargetsExcludingCurrent =
                          multiTargets.filter((t, i) => {
                            if (i === index) return false;
                            const path = getMultiTargetBindingPath(
                              t.uuid,
                              'amount'
                            );
                            return !boundAmountPaths.has(path);
                          });
                        const maxAmountForThisTarget =
                          MAX_TOTAL_PERCENTAGE -
                          unboundTargetsExcludingCurrent.length * 1;

                        return (
                          <MultiTarget
                            key={target.uuid}
                            target={target}
                            validation={validation}
                            index={index}
                            handleRemoveTarget={handleRemoveTarget}
                            disableRemove={multiTargets.length <= 1}
                            isTargetPercentageBound={isTargetPercentageBound}
                            sanitizedPercentageMagnitude={percentageValue}
                            handleTargetPercentageChange={
                              handleTargetPercentageChange
                            }
                            handleTargetAmountChange={handleTargetAmountChange}
                            isTargetAmountBound={isTargetAmountBound}
                            sanitizedAmount={amountValue}
                            maxAmountForTarget={maxAmountForThisTarget}
                            formattedAllocation={formattedAllocation}
                            percentagePath={percentagePath}
                            amountPath={amountPath}
                            applyVariableToMultiTarget={
                              applyVariableToMultiTarget
                            }
                            minSlToUse={minTpToUse}
                            totalTargets={multiTargets.length}
                            previousTargetValue={previousTargetValue}
                            isTerminal={formTerminal}
                            currentPrice={currentPrice}
                            handleTargetFixedChange={handleTargetFixedChange}
                            isTargetFixedBound={isTargetFixedBound}
                            fixedPath={fixedPath}
                            // Display price unit (quote for longs, base for shorts)
                            priceUnit={(() => {
                              const pairKey = Array.isArray(formPair)
                                ? formPair[0]
                                : formPair;
                              const pairMeta = pairKey
                                ? formPairMetadata?.[pairKey]
                                : undefined;
                              const base =
                                pairMeta?.baseAsset?.name ??
                                (typeof pairKey === 'string'
                                  ? pairKey.split('/')[0]
                                  : undefined);
                              const quote =
                                pairMeta?.quoteAsset?.name ??
                                (typeof pairKey === 'string'
                                  ? pairKey.split('/')[1]
                                  : undefined);
                              return isShort
                                ? (base ?? 'Price')
                                : (quote ?? 'Price');
                            })()}
                            isShort={isShort}
                          />
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No TP targets configured
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddTarget}
                      className="w-full"
                      disabled={maximumTargetsReached}
                    >
                      {multiTargets.length === 0
                        ? 'Add Target'
                        : 'Add Another Target'}
                    </Button>
                    {maximumTargetsReached && (
                      <SettingsAlert
                        variant="warning"
                        title={`Maximum of ${MAX_MULTI_TP_TARGETS} targets reached. Remove an existing target before adding another.`}
                      />
                    )}
                    {multiTargetWarnings.length > 0 && (
                      <div className="space-y-xs">
                        {multiTargetWarnings.map((warning) => (
                          <SettingsAlert
                            key={warning}
                            variant="warning"
                            title={warning}
                          />
                        ))}
                      </div>
                    )}
                    <div className="space-y-xs rounded-lg border border-border/50 bg-background/20 p-sm">
                      <div className="flex flex-wrap items-center justify-between gap-xs text-sm">
                        <div className="flex items-center gap-1">
                          Expected average profit
                          <Tooltip tooltip="Weighted by each target's allocation to estimate the blended profit if all targets trigger.">
                            <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          </Tooltip>
                        </div>
                        <div className="text-sm font-medium">
                          {expectedAverageProfit}%
                          {typeof tradingContext.latestPrice === 'number' &&
                            tradingContext.latestPrice > 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ≈ $
                                {(
                                  (tradingContext.latestPrice *
                                    expectedAverageProfitValue) /
                                  100
                                ).toFixed(2)}
                              </span>
                            )}
                        </div>
                      </div>
                    </div>
                  </MasonryLayout>
                </SettingsRow>
              ) : null}
              {isTechIndicatorClose && !isDealEdit ? (
                <SettingsRow
                  name={'Take Profit indicator groups'}
                  tooltip={'Organize exit indicators into groups.'}
                  tooltipURL="/help/technical-indicators-conditions-deal-close"
                  colSpan="full"
                  className={interactionDisabledClass}
                  contentClassName="space-y-md"
                  trailing={
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Info className="h-4 w-4" />
                      <div>
                        Remaining:{' '}
                        {Math.max(
                          indicatorsLimit - totalIndicatorsAcrossBot,
                          0
                        )}
                      </div>
                    </div>
                  }
                >
                  <IndicatorGroupsManager
                    indicators={indicators}
                    indicatorGroups={indicatorGroups}
                    globalLogic={stopDealLogic || IndicatorsLogicEnum.and}
                    errorMessage={closeIndicatorErrorMessage}
                    totalIndicatorsAcrossBot={totalIndicatorsAcrossBot}
                    indicatorAction={IndicatorAction.closeDeal}
                    exchange={currentExchange?.provider}
                    emptyStateMessage="No indicator groups configured yet. Add a group to start building your close conditions."
                    emptyIndicatorsAlertTitle="No close indicators yet"
                    emptyIndicatorsAlertDescription="Add at least one indicator inside a group to allow the bot to confirm exits automatically."
                    secondColumnContent={
                      <div className="space-y-1">
                        <Label htmlFor="close-deal-type" className="text-sm">
                          When indicators trigger close by
                        </Label>
                        <Select
                          value={closeDealType ?? CloseDCATypeEnum.closeByLimit}
                          onValueChange={(value) =>
                            updateFormData(
                              'closeDealType',
                              value as CloseDCATypeEnum
                            )
                          }
                        >
                          <SelectTrigger
                            id="close-deal-type"
                            className="w-full @[500px]:w-48"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {closeDealTypeOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                <div className="flex flex-col">
                                  <span>{option.label}</span>
                                  <span className="text-xs text-muted-foreground/80">
                                    {option.description}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    }
                    onAddGroup={handleAddCloseGroup}
                    onRemoveGroup={handleRemoveCloseGroup}
                    onChangeGroupLogic={handleChangeCloseGroupLogic}
                    onAddIndicatorToGroup={handleAddIndicatorToCloseGroup}
                    onRemoveIndicatorFromGroup={
                      handleRemoveIndicatorFromCloseGroup
                    }
                    onSelectIndicatorType={
                      handleSelectIndicatorTypeInCloseGroup
                    }
                    onChangeIndicatorParams={
                      handleChangeIndicatorParamsInCloseGroup
                    }
                    onChangeGlobalLogic={(value) =>
                      updateFormData('stopDealLogic', value)
                    }
                  />
                </SettingsRow>
              ) : null}

              {isDynamicArClose && !isDealEdit ? (
                <SettingsRow
                  name="Dynamic ATR/ADR indicators"
                  tooltip="Use ATR or ADR indicators to drive dynamic take profit. Each indicator multiplies its value by the configured factor."
                  colSpan="full"
                  className={interactionDisabledClass}
                  contentClassName="space-y-md"
                  trailing={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddIndicator}
                      disabled={indicatorLimitReached}
                      title={
                        indicatorLimitReached
                          ? `Maximum of ${indicatorsLimit} indicators reached across the bot`
                          : undefined
                      }
                    >
                      Add indicator
                    </Button>
                  }
                >
                  <IndicatorList
                    indicators={closeIndicators}
                    onRemove={handleRemoveIndicator}
                    onSelectType={handleSelectIndicatorType}
                    renderExtras={renderDynamicArExtras}
                    emptyState="No ATR/ADR indicators configured. Add ATR or ADR to enable dynamic take profit."
                  />

                  <div className="space-y-xs">
                    <Label
                      htmlFor="close-deal-type-dynamic"
                      className="text-sm"
                    >
                      When indicators trigger close by
                    </Label>
                    <Select
                      value={closeDealType ?? CloseDCATypeEnum.closeByLimit}
                      onValueChange={(value) =>
                        updateFormData(
                          'closeDealType',
                          value as CloseDCATypeEnum
                        )
                      }
                    >
                      <SelectTrigger
                        id="close-deal-type-dynamic"
                        className="w-full @[500px]:w-48"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {closeDealTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex flex-col">
                              <span>{option.label}</span>
                              <span className="text-xs text-muted-foreground/80">
                                {option.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {closeIndicators.length === 0 ? (
                    <Alert
                      variant="destructive"
                      className="border-destructive/40 bg-destructive/10"
                    >
                      <AlertTitle className="text-sm font-semibold">
                        Add an ATR or ADR indicator
                      </AlertTitle>
                      <AlertDescription className="text-xs leading-relaxed">
                        Dynamic ATR/ADR requires at least one ATR or ADR
                        indicator. Add an indicator to compute take profit
                        distance.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {dynamicArInvalidCount > 0 ? (
                    <Alert
                      variant="destructive"
                      className="border-destructive/40 bg-destructive/10"
                    >
                      <AlertTitle className="text-sm font-semibold">
                        Unsupported indicator detected
                      </AlertTitle>
                      <AlertDescription className="text-xs leading-relaxed">
                        Remove non-ATR/ADR indicators ({dynamicArInvalidCount}{' '}
                        found) or switch the close condition. Dynamic ATR/ADR
                        supports only ATR and ADR types.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </SettingsRow>
              ) : null}

              {/**
               * Only auto expand when any of the contained options are actually
               * enabled (not merely present). Previously the check included
               * `!isComboBot && !isHedgeBot` which made this always true in the
               * non-combo branch. Compute a dedicated flag for clarity.
               */}
              <SettingsLoadMore
                id="take-profit-advanced"
                title="More Settings"
                autoExpand={shouldAutoExpand}
              >
                {shouldRenderMinTpGuard ? (
                  <SettingsRow
                    name="Minimum take profit"
                    tooltip="Prevent premature exits by enforcing a minimum profit threshold."
                    colSpan="full"
                    trailing={
                      <Switch
                        id="use-min-tp"
                        checked={Boolean(useMinTP)}
                        onCheckedChange={(checked) => {
                          updateFormData('useMinTP', checked);
                        }}
                        aria-label="Toggle minimum take profit"
                      />
                    }
                    className={interactionDisabledClass}
                    contentClassName="space-y-xs"
                  >
                    {useMinTP || isMinTpBound ? (
                      <SettingsRowSurface
                        tone="faint"
                        spacing="sm"
                        className="space-y-xs"
                      >
                        <FieldVariableBinding
                          path="minTp"
                          varType="float"
                          tooltip="Bind minimum take profit"
                          disabled={takeProfitLocked}
                          variant="inline"
                          contentClassName="w-full max-w-[160px]"
                          onVariableSelected={(variable) =>
                            applyVariableToField('minTp', variable)
                          }
                          onVariableResolved={(variable) =>
                            applyVariableToField('minTp', variable)
                          }
                        >
                          <NumberInput
                            value={minTp}
                            onChange={(value) =>
                              updateFormData(
                                'minTp',
                                String(value ?? MIN_DCA_TP_NEW)
                              )
                            }
                            min={MIN_DCA_TP_NEW}
                            step={0.1}
                            precision={2}
                            showControls={false}
                            className="w-full"
                            disabled={isMinTpBound}
                            endAdornment={unitAdornment('%')}
                          />
                        </FieldVariableBinding>
                      </SettingsRowSurface>
                    ) : undefined}
                  </SettingsRow>
                ) : null}
                {showTimerControls && (
                  <SettingsRow
                    key="close-by-timer"
                    name="Close by timer"
                    tooltip="Automatically close the deal after a specified duration."
                    colSpan="full"
                    trailing={
                      <Switch
                        id="close-by-timer"
                        checked={closeByTimer || false}
                        onCheckedChange={handleToggleTimer}
                        aria-label="Toggle close by timer"
                      />
                    }
                    className={interactionDisabledClass}
                    contentClassName="space-y-md"
                  >
                    {closeByTimer && (
                      <SettingsRowSurface
                        tone="faint"
                        spacing="sm"
                        className="space-y-md"
                      >
                        <div className="flex flex-col gap-sm @[500px]:flex-row @[500px]:items-start">
                          <FieldVariableBinding
                            path="closeByTimerValue"
                            varType="int"
                            tooltip="Bind timer value"
                            disabled={takeProfitLocked}
                            variant="inline"
                            contentClassName="w-full @[500px]:max-w-[160px]"
                            onVariableSelected={(variable) =>
                              applyVariableToField(
                                'closeByTimerValue',
                                variable
                              )
                            }
                            onVariableResolved={(variable) =>
                              applyVariableToField(
                                'closeByTimerValue',
                                variable
                              )
                            }
                          >
                            <NumberInput
                              ref={timerInputRef}
                              value={closeByTimerValue || '1'}
                              onChange={handleTimerValueChange}
                              className="w-full"
                              placeholder="1"
                              min={1}
                              step={1}
                              showControls={false}
                              disabled={isTimerValueBound}
                            />
                          </FieldVariableBinding>
                          <Select
                            value={closeByTimerUnits || 'minutes'}
                            onValueChange={(value) =>
                              updateFormData(
                                'closeByTimerUnits',
                                value as
                                  | 'seconds'
                                  | 'minutes'
                                  | 'hours'
                                  | 'days'
                              )
                            }
                          >
                            <SelectTrigger className="w-full @[500px]:w-36">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seconds">Seconds</SelectItem>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {mergedErrors['closeByTimerValue'] && (
                          <p className="text-xs text-destructive">
                            {mergedErrors['closeByTimerValue']}
                          </p>
                        )}
                      </SettingsRowSurface>
                    )}
                  </SettingsRow>
                )}

                {closeConditionIsTp &&
                  showMultiTargetControls && (
                    <SettingsRow
                      key="trailing-tp"
                      name="Trailing take profit"
                      tooltip="Follow the price after the initial target is reached."
                      tooltipURL="/help/trailing-take-profit"
                      colSpan="full"
                      className={interactionDisabledClass}
                      contentClassName="space-y-md"
                      trailing={
                        <Switch
                          id="trailing-tp"
                          checked={!!trailingTp || false}
                          onCheckedChange={(checked) => {
                            if (multiTargets.length > 1) {
                              return;
                            }
                            updateFormData('trailingTp', checked);
                            if (checked && !trailingTpPerc) {
                              updateFormData(
                                'trailingTpPerc',
                                TRAILING_TP_MIN.toString()
                              );
                            }
                          }}
                          disabled={multiTargets.length > 1}
                        />
                      }
                    >
                      {multiTargets.length > 1 ? (
                        <SettingsAlert
                          variant="info"
                          title="Trailing take profit is not available with multiple take profit targets. Remove extra targets to enable this option."
                        />
                      ) : trailingTp ? (
                        <div className="space-y-xs">
                          <Slider
                            value={sanitizePercentageInput(
                              trailingTpPerc || TRAILING_TP_MIN,
                              TRAILING_TP_MIN,
                              TRAILING_TP_MAX
                            )}
                            onChange={(value) => {
                              const next = sanitizePercentageInput(
                                value,
                                TRAILING_TP_MIN,
                                TRAILING_TP_MAX
                              );
                              const clamped = Math.min(TRAILING_TP_MAX, next);
                              updateFormData(
                                'trailingTpPerc',
                                clamped.toString()
                              );
                            }}
                            min={TRAILING_TP_MIN}
                            max={TRAILING_TP_MAX}
                            step={0.1}
                            className="w-full"
                            disabled={isTrailingBound}
                          />
                          <FieldVariableBinding
                            path="trailingTpPerc"
                            varType="float"
                            tooltip="Bind trailing deviation"
                            disabled={takeProfitLocked}
                            variant="inline"
                            contentClassName="w-full max-w-[160px]"
                            onVariableSelected={(variable) =>
                              applyVariableToField('trailingTpPerc', variable)
                            }
                            onVariableResolved={(variable) =>
                              applyVariableToField('trailingTpPerc', variable)
                            }
                          >
                            <NumberInput
                              value={trailingTpPerc}
                              onChange={(value) => {
                                const next = sanitizePercentageInput(
                                  value,
                                  TRAILING_TP_MIN,
                                  TRAILING_TP_MAX
                                );
                                const clamped = Math.min(TRAILING_TP_MAX, next);
                                updateFormData(
                                  'trailingTpPerc',
                                  clamped.toString()
                                );
                              }}
                              className="w-full"
                              min={TRAILING_TP_MIN}
                              max={TRAILING_TP_MAX}
                              step={0.1}
                              showControls={false}
                              disabled={isTrailingBound}
                              endAdornment={unitAdornment('%')}
                            />
                          </FieldVariableBinding>
                          <p className="text-xs text-muted-foreground">
                            Once the take profit is hit, trailing keeps
                            following the price by the deviation set here. Valid
                            range is {TRAILING_TP_MIN}%–{TRAILING_TP_MAX}%.
                          </p>
                        </div>
                      ) : null}
                    </SettingsRow>
                  )}

                {!isComboBot && !isHedgeBot && (
                  <SettingsRow
                    key="close-order-type"
                    name="Close order type"
                    tooltip="Select the order type used to close the deal."
                    className={interactionDisabledClass}
                    contentClassName="space-y-xs"
                  >
                    <Select
                      value={closeOrderType || OrderTypeEnum.limit}
                      onValueChange={(value) =>
                        updateFormData('closeOrderType', value as OrderTypeEnum)
                      }
                    >
                      <SelectTrigger className="w-full @[500px]:w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(OrderTypeEnum)
                          .filter((candidate) => typeof candidate === 'string')
                          .map((candidate) => (
                            <SelectItem
                              key={candidate}
                              value={candidate as OrderTypeEnum}
                            >
                              {(candidate as string).charAt(0).toUpperCase() +
                                (candidate as string).slice(1)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </SettingsRow>
                )}
              </SettingsLoadMore>
            </TabsContent>
          ))}
        </Tabs>
      )}
      {selector}
    </>
  );
};

export default TakeProfitSettings;
