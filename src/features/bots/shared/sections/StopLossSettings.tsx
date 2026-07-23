import { Slider } from '@/components/ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import { ResponsiveFormLayout } from '@/components/ui/ResponsiveFormLayout';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { SettingsLoadMore } from '@/components/ui/SettingsLoadMore';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import {
  useBotFormSelector,
  useBotFormState,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useDcaTradingContext } from '@/hooks/bots/dca/useDcaTradingContext';
import useBotVarBinding from '@/hooks/bots/global-variables/useBotVarBinding';
import { useComponentError } from '@/hooks/bots/useComponentError';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import { useIndicatorSelector } from '@/hooks/useIndicatorSelector';
import { logger } from '@/lib/loggerInstance';
import { cn } from '@/lib/utils';
import {
  BaseSlOnEnum,
  IndicatorAction,
  IndicatorEnum,
  IndicatorSection,
  IndicatorsLogicEnum,
  MIN_DCA_TP,
  MIN_DCA_TP_NEW,
  StrategyEnum,
  TerminalDealTypeEnum,
  closeConditionsMap,
  indicatorsLimit,
  type MultiTP,
} from '@/types';
import { math } from '@/lib/utils/math';
import { DynamicArIndicatorPanel } from '@/features/bots/shared/components/DynamicArIndicatorPanel';
import { CloseConditionEnum } from '@/types/bots/dealConditions';
import type {
  BotFormData,
  BotFormErrors,
  ExchangeBotForm,
} from '@/types/bots/form';
import type { GlobalVariable } from '@/types/globalVariables';
import { type IndicatorConfig, type IndicatorGroup } from '@/types/indicators';
import { getIndicatorDefaultParams } from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
  distributePositionSizesEqually,
  redistributePositionSizes,
} from '@/utils/bots/dca/position-size-redistribution';
import {
  MAX_SL_ALLOCATION,
  clampSlTargetsToAllocation,
  evaluateMultiSlAllocation,
  getMultiSlBindingPath,
  hasConfiguredMultiSlTargets,
  sanitizeSlAmountInput,
} from '@/utils/bots/dca/stop-loss';
import {
  formatMinMoveSlTrigger,
  resolveMinMoveSlTrigger,
  resolveMoveSlTriggerMax,
  resolveMoveSlValueMax,
  validateMoveSlConfiguration,
} from '@/utils/bots/dca/stop-loss-behaviours';
import {
  calculatePercentFromValue,
  calculateValueFromPercent,
  sanitizeFixedInput,
} from '@/utils/bots/dca/take-profit';
import {
  buildIndicatorConfig,
  sanitizeIndicatorParams,
} from '@/utils/indicators/indicatorConfigUtils';
import { Info } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { BaseStopLosslOn } from '../../bot-types/combo/form/components/BaseStopLossOn';
import { IndicatorGroupsManager } from '../components/IndicatorGroupsManager';
import MultiTarget from '../components/MultiTarget';

const MAX_MULTI_SL_TARGETS = 10;
// Upper bound for the SL magnitude (% loss). Kept high (not ~100) so
// cross-margin / high-leverage users can set deep stops. Twin of
// TakeProfitSettings' MAX_TP_SL_PERCENT.
const MAX_TP_SL_PERCENT = 250;
const MAX_SL_INDICATOR_GROUPS = 5;
const MAX_SL_INDICATORS_PER_GROUP = 10;

const createSlGroupId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `sl-group-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createSlIndicatorId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `sl-indicator-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

interface StopLossSettingsProps {
  currentExchange: ExchangeBotForm | null;
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  errors: BotFormErrors;
  isComboBot?: boolean;
  riskRewardActive?: boolean;
  closeConditionSl?: CloseConditionEnum;
}

const PercentageSL: React.FC<StopLossSettingsProps> = ({
  formData,
  updateFormData,
  errors: _errors,
  isComboBot = false,
  riskRewardActive = false,
  closeConditionSl,
}) => {
  const { coordinates, setCoordinates } = useTradingTerminalUtils();
  const tradingContext = useDcaTradingContext(formData, { bot: null });
  const { latestPrice } = tradingContext;
  const currentPrice = latestPrice || 0;
  const strategy = useBotFormSelector('strategy');
  const multiSl = useBotFormSelector('multiSl');
  const moveSL = useBotFormSelector('moveSL');
  const moveSLTrigger = useBotFormSelector('moveSLTrigger');
  const moveSLValue = useBotFormSelector('moveSLValue');
  const slPerc = useBotFormSelector('slPerc');
  const baseOrderPrice = useBotFormSelector('baseOrderPrice');
  const terminalDealType = useBotFormSelector('terminalDealType');
  const useMultiSl = useBotFormSelector('useMultiSl');
  const trailingSl = useBotFormSelector('trailingSl');
  const tpPerc = useBotFormSelector('tpPerc');
  const dealCloseCondition = useBotFormSelector('dealCloseCondition');
  const baseSlOn = useBotFormSelector('baseSlOn');
  const comboSlLimit = useBotFormSelector('comboSlLimit');
  const useFixedSLPrices = useBotFormSelector('useFixedSLPrices');
  const fixedSlPrice = useBotFormSelector('fixedSlPrice');
  const isShort = useMemo(() => strategy === StrategyEnum.short, [strategy]);
  const {
    setBotVars,
    botVars = { list: [], paths: [] },
    mode,
  } = useBotFormState();
  const isDealEdit = mode === 'deal-edit' || mode === 'deal-mass-edit';
  // Legacy terminal Import max-SL clamp (index.tsx:5469-5487). Returns the
  // (negative) least-aggressive SL allowed for an imported position; floors at
  // MIN_DCA_TP * 100 * -1 otherwise. The redesign SL section works in
  // magnitudes, so the Import floor is applied via Math.abs below.
  const getMaxSl = useMemo(() => {
    return terminalDealType === TerminalDealTypeEnum.import &&
      baseOrderPrice &&
      latestPrice &&
      !isNaN(+(baseOrderPrice ?? '')) &&
      !isNaN(+(latestPrice ?? ''))
      ? math.round(
          ((+latestPrice - +baseOrderPrice) / +baseOrderPrice) *
            100 *
            (strategy === StrategyEnum.long ? 1 : -1) +
            MIN_DCA_TP * 100 * -1,
          1,
          true
        )
      : MIN_DCA_TP * 100 * -1;
  }, [terminalDealType, baseOrderPrice, latestPrice, strategy]);
  // Minimum SL magnitude. For terminal Import the floor comes from getMaxSl
  // (legacy minSlToUs = getMaxSl). Otherwise MIN_DCA_TP_NEW.
  const minSlToUse =
    terminalDealType === TerminalDealTypeEnum.import
      ? Math.abs(getMaxSl)
      : MIN_DCA_TP_NEW;
  // Upper bound for the SL magnitude. Kept high (not ~100) so cross-margin /
  // high-leverage users can set deep stops, matching the legacy dashboard.
  const maxSlToUse = MAX_TP_SL_PERCENT;

  // Track the last single target percentage for seeding new targets
  const lastSingleTargetPercentageRef = useRef<string | null>(null);

  const multiTargets = useMemo(
    () =>
      useMultiSl
        ? (multiSl ?? [])
        : [
            {
              uuid: 'single-sl-target',
              target: slPerc || '0',
              amount: '100',
              fixed: useFixedSLPrices ? fixedSlPrice : undefined,
            },
          ],
    [multiSl, useMultiSl, slPerc, useFixedSLPrices, fixedSlPrice]
  );
  const hasConfiguredTargets = useMemo(
    () => hasConfiguredMultiSlTargets(multiTargets),
    [multiTargets]
  );

  const boundPercentagePaths = useMemo(() => {
    const binding = botVars?.paths.filter(
      (p) => p.path.startsWith('multiSl.') && p.path.endsWith('.target')
    );
    if (!binding?.length) {
      return new Set<string>();
    }
    return new Set(Object.keys(binding));
  }, [botVars?.paths]);

  const boundAmountPaths = useMemo(() => {
    const binding = botVars?.paths.filter(
      (p) => p.path.startsWith('multiSl.') && p.path.endsWith('.amount')
    );
    if (!binding?.length) {
      return new Set<string>();
    }
    return new Set(Object.keys(binding));
  }, [botVars?.paths]);

  const boundFixedPaths = useMemo(() => {
    const binding = botVars?.paths.filter(
      (p) => p.path.startsWith('multiSl.') && p.path.endsWith('.fixed')
    );
    if (!binding?.length) {
      return new Set<string>();
    }
    return new Set(Object.keys(binding));
  }, [botVars?.paths]);

  const { totalAllocation, hasAllocationOverflow } = useMemo(
    () => evaluateMultiSlAllocation(multiTargets, MAX_SL_ALLOCATION),
    [multiTargets]
  );

  const sanitizedTargets: MultiTP[] = useMemo(
    () =>
      multiTargets
        .map((target) => {
          const amount = Number(target.amount);
          const _target = Number(target.target);

          if (!Number.isFinite(amount) || !Number.isFinite(target)) {
            return null;
          }

          return {
            uuid: target.uuid,
            amount: `${Math.max(0, amount)}`,
            target: `${_target}`,
          };
        })
        .filter((target): target is MultiTP => target !== null),
    [multiTargets]
  );

  const sanitizedAllocationTotal = useMemo(
    () => sanitizedTargets.reduce((sum, target) => sum + +target.amount, 0),
    [sanitizedTargets]
  );

  const weightedAverageStopLoss = useMemo(() => {
    if (sanitizedAllocationTotal <= 0) {
      return undefined;
    }

    return sanitizedTargets.reduce(
      (sum, target) =>
        sum + (+target.target * +target.amount) / sanitizedAllocationTotal,
      0
    );
  }, [sanitizedAllocationTotal, sanitizedTargets]);

  const weightedStopLossPrice = useMemo(() => {
    if (
      weightedAverageStopLoss === undefined ||
      !Number.isFinite(weightedAverageStopLoss) ||
      currentPrice <= 0
    ) {
      return undefined;
    }

    // Use calculateValueFromPercent for consistent convention:
    // negative % = below current price, positive % = above current price
    return calculateValueFromPercent(
      isShort,
      weightedAverageStopLoss.toFixed(3),
      currentPrice
    );
  }, [weightedAverageStopLoss, currentPrice, isShort]);

  const averageStopLossValue = useMemo(() => {
    if (
      weightedAverageStopLoss === undefined ||
      !Number.isFinite(weightedAverageStopLoss)
    ) {
      return undefined;
    }

    return weightedAverageStopLoss;
  }, [weightedAverageStopLoss]);

  const weightedStopLossPriceDisplay = useMemo(() => {
    if (!weightedStopLossPrice) {
      return undefined;
    }

    const numeric = Number(weightedStopLossPrice);
    if (!Number.isFinite(numeric)) {
      return undefined;
    }

    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: numeric >= 1 ? 2 : 4,
      maximumFractionDigits: numeric >= 1 ? 2 : 8,
    });
  }, [weightedStopLossPrice]);

  const hasMultipleSlTargets = multiTargets.length > 1;
  const isTrailingLocked = Boolean(moveSL) || hasMultipleSlTargets;
  const isMoveSlLocked = Boolean(trailingSl) || hasMultipleSlTargets;

  useEffect(() => {
    if (trailingSl && moveSL) {
      updateFormData('moveSL', false);
    }
  }, [trailingSl, moveSL, updateFormData]);

  // Auto-disable trailing SL and move SL when multiple targets are active
  useEffect(() => {
    if (hasMultipleSlTargets) {
      if (trailingSl) {
        updateFormData('trailingSl', false);
      }
      if (moveSL) {
        updateFormData('moveSL', false);
      }
    }
  }, [hasMultipleSlTargets, trailingSl, moveSL, updateFormData]);

  const moveSlTriggerMax = useMemo(
    () =>
      resolveMoveSlTriggerMax(
        tpPerc,
        dealCloseCondition as import('@/types').CloseConditionEnum | undefined
      ),
    [tpPerc, dealCloseCondition]
  );

  const moveSlValueMax = useMemo(
    () => resolveMoveSlValueMax(moveSLTrigger, moveSlTriggerMax),
    [moveSLTrigger, moveSlTriggerMax]
  );

  const minMoveSlTrigger = useMemo(
    () => resolveMinMoveSlTrigger(minSlToUse),
    [minSlToUse]
  );

  const formattedMinMoveSlTrigger = useMemo(
    () => formatMinMoveSlTrigger(minMoveSlTrigger),
    [minMoveSlTrigger]
  );

  const moveSlValidation = useMemo(
    () =>
      validateMoveSlConfiguration({
        moveSlEnabled: Boolean(moveSL),
        trigger: moveSLTrigger,
        value: moveSLValue,
        tpPerc: tpPerc,
        dealCloseCondition:
          dealCloseCondition as import('@/types').CloseConditionEnum | undefined,
        minTrigger: minMoveSlTrigger,
        formattedMinTrigger: formattedMinMoveSlTrigger,
      }),
    [
      moveSL,
      moveSLTrigger,
      moveSLValue,
      tpPerc,
      dealCloseCondition,
      minMoveSlTrigger,
      formattedMinMoveSlTrigger,
    ]
  );

  const slValidation = useMemo(() => {
    // Inline validation for the SL input to provide instant feedback. The
    // authoritative validation is still performed centrally by
    // `hotValidateDcaFormData`.
    const raw = String(slPerc || '').trim();
    if (raw.length === 0) {
      return { isValid: true, message: '' };
    }

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return { isValid: false, message: 'Stop loss % must be a valid number' };
    }

    const abs = Math.abs(parsed);
    if (abs < minSlToUse) {
      return {
        isValid: false,
        message: `Stop loss % must be at least ${minSlToUse}%`,
      };
    }

    if (abs > maxSlToUse) {
      return {
        isValid: false,
        message: `Stop loss % must not exceed ${maxSlToUse}%`,
      };
    }

    // Validate against current price using consistent convention:
    // calculateValueFromPercent: negative % = below price, positive % = above price
    // Skip this check during deal editing — the SL% is relative to the deal's
    // average entry price (not the current market price), so a positive SL is
    // perfectly valid when the deal is in profit (it locks in gains).
    if (currentPrice > 0 && !isDealEdit) {
      const slPrice = calculateValueFromPercent(
        isShort,
        String(parsed),
        currentPrice
      );
      const slPriceNum = parseFloat(slPrice);

      logger.infoCategory('SL-Validation', 'Validating slPerc', {
        percentage: parsed,
        currentPrice,
        slPrice: slPriceNum,
        isShort,
      });

      // For longs: SL must be below current price
      // For shorts: SL must be above current price
      if (!isShort && slPriceNum >= currentPrice) {
        return {
          isValid: false,
          message: 'Stop loss must be below current price',
        };
      }
      if (isShort && slPriceNum <= currentPrice) {
        return {
          isValid: false,
          message: 'Stop loss must be above current price',
        };
      }
    }

    return { isValid: true, message: '' };
  }, [slPerc, minSlToUse, maxSlToUse, currentPrice, isShort, isDealEdit]);

  // Compose the most appropriate single-target error message and register
  // it with the form context so it surfaces in the footer alert summary.
  const slErrorMessage = useMemo(
    () =>
      _errors?.slPerc ??
      (!slValidation.isValid ? slValidation.message : undefined),
    [_errors?.slPerc, slValidation.message, slValidation.isValid]
  );
  // Only register the single-target SL error when not using multi-target SLs.
  // When `useMultiSl` is active, SL validation should surface under the
  // aggregated `multiSl` error to avoid duplicates and broken navigation.
  useComponentError(
    'slPerc',
    Boolean(slErrorMessage) && !useMultiSl,
    String(slErrorMessage || ''),
    {
      navId: 'stop-loss',
    }
  );

  const setMultiTargets = useCallback(
    (nextTargets: MultiTP[]) => {
      updateFormData('multiSl', nextTargets);
    },
    [updateFormData]
  );

  const validateSlTarget = useCallback(
    (
      percentage: string,
      isBound: boolean
    ): { isValid: boolean; message?: string } => {
      if (isBound) {
        return { isValid: true };
      }

      const percentNum = parseFloat(percentage) || 0;

      // Check minimum magnitude first
      if (Math.abs(percentNum) < minSlToUse) {
        return {
          isValid: false,
          message: `Stop loss must be at least ${minSlToUse}% in magnitude`,
        };
      }

      // Calculate the actual SL price from the percentage using consistent convention:
      // calculateValueFromPercent: negative % = below price, positive % = above price
      // Skip during deal editing — see slValidation comment above.
      if (currentPrice > 0 && !isDealEdit) {
        const slPrice = calculateValueFromPercent(
          isShort,
          percentage,
          currentPrice
        );
        const slPriceNum = parseFloat(slPrice);

        logger.infoCategory('SL-Validation', 'Validating SL target', {
          percentage: percentNum,
          currentPrice,
          slPrice: slPriceNum,
          isShort,
        });

        // For longs: SL must be below current price (negative % or small positive %)
        // For shorts: SL must be above current price (positive % or small negative %)
        if (!isShort && slPriceNum >= currentPrice) {
          return {
            isValid: false,
            message: 'Stop loss must be below current price',
          };
        }
        if (isShort && slPriceNum <= currentPrice) {
          return {
            isValid: false,
            message: 'Stop loss must be above current price',
          };
        }
      }

      return { isValid: true };
    },
    [minSlToUse, currentPrice, isShort, isDealEdit]
  );

  // Aggregate per-target validation into a single message for the settings
  // summary so users can see a consolidated error for multi-target configs.
  const firstInvalidMultiTargetMessage = useMemo(() => {
    const found = (multiTargets || [])
      .map((t) => {
        const pctPath = getMultiSlBindingPath(t.uuid, 'target');
        const isBound = boundPercentagePaths.has(pctPath);
        const v = validateSlTarget(t.target, isBound);
        return v.isValid ? null : v.message;
      })
      .find(Boolean) as string | undefined;

    return _errors?.multiSl ?? found;
  }, [multiTargets, boundPercentagePaths, _errors?.multiSl, validateSlTarget]);

  useComponentError(
    'multiSl',
    Boolean(firstInvalidMultiTargetMessage),
    String(firstInvalidMultiTargetMessage || ''),
    { navId: 'stop-loss-advanced' }
  );

  const clearBindingsForTarget = useCallback(
    (targetId: string) => {
      const percentagePath = getMultiSlBindingPath(targetId, 'target');
      const amountPath = getMultiSlBindingPath(targetId, 'amount');

      setBotVars((previous) => {
        if (!previous) {
          return previous;
        }

        const filteredPaths = previous.paths.filter(
          (entry) => entry.path !== percentagePath && entry.path !== amountPath
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

  const applyVariableToMultiTarget = useCallback(
    (
      targetId: string,
      field: Extract<keyof MultiTP, 'target' | 'amount' | 'fixed'>,
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

      const nextTargets: MultiTP[] = multiTargets.map((target) => {
        if (target.uuid !== targetId) {
          return target;
        }

        if (field === 'target') {
          const numeric = Number(rawValue);
          if (!Number.isFinite(numeric)) {
            return {
              ...target,
              target: '',
            };
          }

          // Don't force negative - let validation handle price vs current price check
          const sanitized = Math.round(numeric * 1000) / 1000;

          return {
            ...target,
            target: sanitized.toString(),
          };
        }

        if (field === 'fixed') {
          const sanitized = sanitizeFixedInput(rawValue);
          if (sanitized === null) {
            return target;
          }
          return {
            ...target,
            fixed: sanitized.toString(),
          };
        }

        const sanitizedAmount = sanitizeSlAmountInput(rawValue);
        return {
          ...target,
          amount: sanitizedAmount.toString(),
        };
      });

      if (field === 'amount') {
        const index = nextTargets.findIndex((entry) => entry.uuid === targetId);
        if (index >= 0) {
          const adjusted = clampSlTargetsToAllocation(
            nextTargets,
            index,
            MAX_SL_ALLOCATION,
            boundAmountPaths
          );
          setMultiTargets(adjusted);
          return;
        }
      }

      setMultiTargets(nextTargets);
    },
    [boundAmountPaths, multiTargets, setMultiTargets]
  );

  // Track single target percentage for seeding
  useEffect(() => {
    if (useMultiSl) {
      return;
    }

    const sanitized = (-Math.abs(Number(slPerc) || minSlToUse)).toString();
    lastSingleTargetPercentageRef.current = sanitized;
  }, [slPerc, useMultiSl, minSlToUse]);

  // Always ensure at least one target exists (like TP)
  useEffect(() => {
    if (hasConfiguredTargets) {
      return;
    }

    const singleTargetPercentage = Number(slPerc);
    const fallbackMagnitude = Number.isFinite(singleTargetPercentage)
      ? Math.max(minSlToUse, Math.abs(singleTargetPercentage))
      : Math.max(minSlToUse, 2.5);
    const fallbackPercentage = -Math.round(fallbackMagnitude * 1000) / 1000;

    const defaultTarget: MultiTP = {
      uuid: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      target: fallbackPercentage.toString(),
      amount: '100',
    };

    setMultiTargets([defaultTarget]);
  }, [slPerc, hasConfiguredTargets, minSlToUse, setMultiTargets]);

  const handleTargetPercentageChange = useCallback(
    (index: number, value: string | number) => {
      const targets = [...multiTargets];
      const target = targets[index];
      if (!target) {
        return;
      }

      const path = getMultiSlBindingPath(target.uuid, 'target');
      if (boundPercentagePaths.has(path)) {
        return;
      }

      const rawValue = typeof value === 'string' ? value : String(value);
      if (rawValue.trim().length === 0) {
        targets[index] = {
          ...target,
          target: '',
        };
        setMultiTargets(targets);
        return;
      }

      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        targets[index] = {
          ...target,
          target: '',
        };
        setMultiTargets(targets);
        return;
      }

      // Don't force negative - allow the value as-is and validate against current price
      const sanitized = Math.round(numericValue * 1000) / 1000;

      // For terminal bots, calculate and update fixed price when percentage changes
      let fixedPrice: string | undefined = target.fixed;
      if (formData.terminal && currentPrice > 0) {
        const calculatedFixed = calculateValueFromPercent(
          isShort,
          sanitized.toString(),
          currentPrice
        );
        fixedPrice = calculatedFixed;
      }

      targets[index] = {
        ...target,
        target: sanitized.toString(),
        ...(fixedPrice !== undefined && { fixed: fixedPrice }),
      };

      setMultiTargets(targets);

      // When there's only one target, sync with legacy slPerc and, for terminal
      // bots, also keep the global fixed price and mode in sync so the price
      // shown by the terminal reflects this percentage immediately.
      if (targets.length === 1) {
        updateFormData('slPerc', sanitized.toString());
        if (formData.terminal && fixedPrice !== undefined) {
          updateFormData('useFixedSLPrices', true);
          updateFormData('fixedSlPrice', fixedPrice);
        }
      }
    },
    [
      boundPercentagePaths,
      multiTargets,
      formData.terminal,
      currentPrice,
      isShort,

      setMultiTargets,
      updateFormData,
    ]
  );

  const handleTargetFixedChange = useCallback(
    (index: number, value: string | number) => {
      const targets = [...multiTargets];
      const target = targets[index];
      if (!target) {
        return;
      }

      const path = getMultiSlBindingPath(target.uuid, 'fixed');
      if (boundFixedPaths.has(path)) {
        return;
      }

      const sanitized = sanitizeFixedInput(value);
      if (sanitized === null) {
        return;
      }

      // Calculate percentage from fixed price
      let recalculatedPercentage: string | undefined = target.target;
      if (currentPrice > 0 && Number.parseFloat(sanitized.toString()) > 0) {
        const calculatedPercent = calculatePercentFromValue(
          isShort,
          sanitized.toString(),
          currentPrice
        );
        recalculatedPercentage = calculatedPercent;
      }

      targets[index] = {
        ...target,
        fixed: sanitized.toString(),
        ...(recalculatedPercentage !== undefined && {
          target: recalculatedPercentage,
        }),
      };

      updateFormData('useFixedSLPrices', true);
      setMultiTargets(targets);
      if (targets.length === 1) {
        updateFormData('slPerc', recalculatedPercentage || '');
        updateFormData('fixedSlPrice', sanitized.toString());
      }
    },
    [
      boundFixedPaths,
      multiTargets,
      currentPrice,
      isShort,
      setMultiTargets,
      updateFormData,
    ]
  );

  const handleTargetAmountChange = useCallback(
    (index: number, value: string | number) => {
      const targets = [...multiTargets];
      const target = targets[index];
      if (!target) {
        return;
      }

      const path = getMultiSlBindingPath(target.uuid, 'amount');
      if (boundAmountPaths.has(path)) {
        return;
      }

      const numericValue =
        typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }

      const redistributed = redistributePositionSizes(
        targets,
        index,
        numericValue,
        boundAmountPaths,
        (targetId) => getMultiSlBindingPath(targetId, 'amount')
      );

      setMultiTargets(redistributed);
    },
    [boundAmountPaths, multiTargets, setMultiTargets]
  );

  // Track last processed coordinates to prevent duplicate processing
  const lastProcessedCoordinatesRef = useRef<string | null>(null);

  // Handle chart picker coordinates
  useEffect(() => {
    if (!coordinates || !coordinates.pickerField) {
      return;
    }

    // Check if this is a multiSl fixed field using the pickerField from coordinates
    const multiSlMatch = coordinates.pickerField.match(
      /^multiSl\.([^.]+)\.fixed$/
    );
    if (!multiSlMatch) {
      return;
    }

    // Create a unique key for these coordinates to prevent duplicate processing
    const coordinatesKey = `${coordinates.pickerField}-${coordinates.time}-${coordinates.price}`;
    if (lastProcessedCoordinatesRef.current === coordinatesKey) {
      return; // Already processed these coordinates
    }

    const targetUuid = multiSlMatch[1];
    const pickedPrice = coordinates.price;

    logger.infoCategory('SL-ChartPicker', 'Applying picked price', {
      targetUuid,
      pickedPrice,
      currentPrice,
      pickerField: coordinates.pickerField,
    });

    // Find and update the target
    const targetIndex = multiTargets.findIndex((t) => t.uuid === targetUuid);
    if (targetIndex === -1) {
      logger.warnCategory('SL-ChartPicker', 'Target not found', { targetUuid });
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

  // When the fixed SL price is updated (e.g., via chart drag in the terminal),
  // recalculate the stop loss percentage for the single-target case (debounced).
  const { isBound: isSlPercBound } = useBotVarBinding('slPerc');

  useEffect(() => {
    if (
      !useFixedSLPrices ||
      !fixedSlPrice ||
      currentPrice <= 0 ||
      isSlPercBound
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const fixedPriceValue = Number.parseFloat(fixedSlPrice);
      if (!Number.isFinite(fixedPriceValue)) {
        return;
      }

      // Recalculate percentage from the fixed price using consistent convention:
      // calculatePercentFromValue: negative = below current, positive = above current
      const calculatedPercent = calculatePercentFromValue(
        isShort,
        fixedSlPrice,
        currentPrice
      );

      const prevPercent = Number.parseFloat(slPerc || '0');
      const nextPercent = Number.parseFloat(calculatedPercent || '0');

      if (!Number.isFinite(nextPercent)) {
        return;
      }

      if (Math.abs(nextPercent - prevPercent) > 0.001) {
        // Use the calculated percentage as-is
        // Convention: negative = below current price (loss for long)
        updateFormData('slPerc', String(nextPercent));
      }
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentPrice,
    slPerc,
    useFixedSLPrices,
    isShort,
    isSlPercBound,
    fixedSlPrice,
    updateFormData,
  ]);

  // When the terminal updates multi-target fixed SL prices directly (e.g. on chart drag),
  // ensure each target's percentage is recalculated so the UI reflects the change.
  // Also validate that the resulting percentage has the correct sign.
  useEffect(() => {
    if (!currentPrice || !Array.isArray(multiSl) || multiSl.length === 0) {
      return;
    }

    let changed = false;
    const next = (multiSl || []).map((t) => {
      if (!t || !t.fixed) {
        return t;
      }

      const fixedPrice = Number.parseFloat(t.fixed);
      if (!Number.isFinite(fixedPrice)) {
        return t;
      }

      // Recalculate percentage from fixed price using consistent convention:
      // calculatePercentFromValue: negative = below current, positive = above current
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
      updateFormData('multiSl', next);
    }
  }, [multiSl, currentPrice, isShort, updateFormData]);

  const handleRemoveTarget = useCallback(
    (index: number) => {
      const targets = [...multiTargets];
      const target = targets[index];
      if (!target) {
        return;
      }

      // Don't allow removing the last target
      if (targets.length <= 1) {
        return;
      }

      clearBindingsForTarget(target.uuid);
      const nextTargets = targets.filter(
        (_, targetIndex) => targetIndex !== index
      );

      // If going down to 1 target, disable useMultiSl
      if (nextTargets.length === 1 && useMultiSl) {
        updateFormData('useMultiSl', false);
      }

      setMultiTargets(nextTargets);
    },
    [
      clearBindingsForTarget,
      multiTargets,
      useMultiSl,
      setMultiTargets,
      updateFormData,
    ]
  );

  const handleAddTarget = useCallback(() => {
    const targets = [...multiTargets];
    if (targets.length >= MAX_MULTI_SL_TARGETS) {
      return;
    }

    // Auto-enable useMultiSl when adding a second target
    if (targets.length === 1 && !useMultiSl) {
      updateFormData('useMultiSl', true);
    }

    // Set new target to be more negative than the last one
    let defaultPercentage = -Math.max(minSlToUse, 2.5);
    if (targets.length > 0) {
      const lastTarget = targets[targets.length - 1];
      const lastPercentage = parseFloat(lastTarget?.target || '0');
      // New SL target should be further down (more negative)
      defaultPercentage = Number.isFinite(lastPercentage)
        ? Math.min(-minSlToUse, lastPercentage - 1)
        : defaultPercentage;
    }

    const nextTargets: MultiTP[] = [
      ...targets,
      {
        uuid: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        target: defaultPercentage.toString(),
        amount: '0', // Will be set by distribution
      },
    ];

    // Distribute equally across all targets
    const distributed = distributePositionSizesEqually(
      nextTargets,
      boundAmountPaths,
      (targetId) => getMultiSlBindingPath(targetId, 'amount')
    );

    setMultiTargets(distributed);
  }, [
    multiTargets,
    useMultiSl,
    minSlToUse,
    boundAmountPaths,
    setMultiTargets,
    updateFormData,
  ]);

  const maximumTargetsReached = multiTargets.length >= MAX_MULTI_SL_TARGETS;

  const handleSliderChange = (value: number) => {
    updateFormData('slPerc', (-value).toString());
  };

  // Overall SL validation is handled centrally by `hotValidateDcaFormData`.
  // Per-target validation (validateSlTarget) is still used to provide inline
  // feedback for each multi-target entry, but we avoid registering the same
  // error from the component to prevent duplication.

  const handlePresetClick = (percentage: number) => {
    updateFormData('slPerc', percentage.toString());

    // For terminal bots, also apply the fixed price and enable fixed-price mode
    // so the UI shows the corresponding price immediately.
    if (formData.terminal && currentPrice > 0) {
      const calculatedFixed = calculateValueFromPercent(
        isShort,
        percentage.toString(),
        currentPrice
      );
      if (calculatedFixed) {
        updateFormData('useFixedSLPrices', true);
        updateFormData('fixedSlPrice', calculatedFixed);
      }
    }
  };

  return (
    <div className="space-y-md">
      {!isComboBot && closeConditionSl !== CloseConditionEnum.webhook && (
        <SettingsRow
          name="Stop Loss Targets"
          tooltip="Configure your stop loss targets. Add multiple targets to distribute your exit across different price levels."
          tooltipURL="/help/multiple-stop-loss-targets"
          colSpan="full"
          contentClassName="space-y-sm"
          navId="stop-loss-advanced"
        >
          {hasAllocationOverflow ? (
            <Alert variant="destructive" className="py-2 text-xs">
              <AlertTitle className="text-sm font-semibold">
                Allocation exceeds 100%
              </AlertTitle>
              <AlertDescription>
                Adjust target allocations so the combined value is 100% or less.
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
                const percentagePath = getMultiSlBindingPath(
                  target.uuid,
                  'target'
                );
                const amountPath = getMultiSlBindingPath(target.uuid, 'amount');
                const fixedPath = getMultiSlBindingPath(target.uuid, 'fixed');

                const isTargetPercentageBound =
                  boundPercentagePaths.has(percentagePath);
                const isTargetAmountBound = boundAmountPaths.has(amountPath);
                const isTargetFixedBound = boundFixedPaths.has(fixedPath);
                const validation = validateSlTarget(
                  target.target,
                  isTargetPercentageBound
                );

                const numericPercentage = Number(target.target);
                const percentageMagnitude = Number.isFinite(numericPercentage)
                  ? Math.abs(numericPercentage)
                  : minSlToUse;
                const sanitizedPercentageMagnitude = Number.isFinite(
                  percentageMagnitude
                )
                  ? Math.max(minSlToUse, Math.min(percentageMagnitude, 100))
                  : minSlToUse;

                const sanitizedAmount = sanitizeSlAmountInput(target.amount);
                const formattedAllocation = Number.isInteger(sanitizedAmount)
                  ? sanitizedAmount.toString()
                  : sanitizedAmount.toFixed(2);
                const otherAllocation = Math.max(
                  0,
                  totalAllocation - sanitizedAmount
                );
                const availableForTarget = Math.max(
                  0,
                  MAX_SL_ALLOCATION - otherAllocation
                );
                const maxAmountForTarget = Math.max(
                  sanitizedAmount,
                  availableForTarget
                );

                return (
                  <MultiTarget
                    key={target.uuid}
                    target={target}
                    validation={validation}
                    index={index}
                    handleRemoveTarget={handleRemoveTarget}
                    disableRemove={multiTargets.length <= 1}
                    isTargetPercentageBound={isTargetPercentageBound}
                    sanitizedPercentageMagnitude={sanitizedPercentageMagnitude}
                    handleTargetPercentageChange={handleTargetPercentageChange}
                    handleTargetAmountChange={handleTargetAmountChange}
                    isTargetAmountBound={isTargetAmountBound}
                    sanitizedAmount={sanitizedAmount}
                    maxAmountForTarget={maxAmountForTarget}
                    formattedAllocation={formattedAllocation}
                    percentagePath={percentagePath}
                    amountPath={amountPath}
                    applyVariableToMultiTarget={applyVariableToMultiTarget}
                    minSlToUse={minSlToUse}
                    totalTargets={multiTargets.length}
                    isTerminal={formData.terminal}
                    currentPrice={currentPrice}
                    handleTargetFixedChange={handleTargetFixedChange}
                    isTargetFixedBound={isTargetFixedBound}
                    fixedPath={fixedPath}
                    // Display price unit (quote for longs, base for shorts)
                    priceUnit={(() => {
                      const pairKey = Array.isArray(formData.pair)
                        ? formData.pair[0]
                        : formData.pair;
                      const pairMeta = pairKey
                        ? formData.pairMetadata?.[pairKey]
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
                      return isShort ? (base ?? 'Price') : (quote ?? 'Price');
                    })()}
                    isShort={isShort}
                  />
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                No SL targets configured
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddTarget}
              className="w-full"
              disabled={maximumTargetsReached}
            >
              {multiTargets.length === 0 ? 'Add Target' : 'Add Another Target'}
            </Button>
            {firstInvalidMultiTargetMessage ? (
              <div className="pt-2">
                <SettingsAlert
                  variant="error"
                  title={firstInvalidMultiTargetMessage}
                />
              </div>
            ) : null}
            {!useMultiSl && slErrorMessage ? (
              <div className="pt-2">
                <SettingsAlert variant="error" title={slErrorMessage} />
              </div>
            ) : null}
            {maximumTargetsReached ? (
              <p className="text-xs text-warning text-center">
                Maximum of {MAX_MULTI_SL_TARGETS} targets reached. Remove an
                existing target before adding another.
              </p>
            ) : null}
            <div className="space-y-xs rounded-lg border border-border/50 bg-background/20 p-sm">
              <div className="flex flex-wrap items-center justify-between gap-xs text-sm">
                <div className="flex items-center gap-1">
                  Average stop loss
                  <Tooltip tooltip="Weighted by each target's allocation to estimate the blended exit level if all targets trigger.">
                    <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </Tooltip>
                </div>
                <div className="text-sm font-medium">
                  {averageStopLossValue !== undefined
                    ? `${averageStopLossValue.toFixed(2)}%`
                    : '—'}
                  {weightedStopLossPriceDisplay ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ≈ ${weightedStopLossPriceDisplay}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </MasonryLayout>
        </SettingsRow>
      )}

      {isComboBot && (
        <SettingsRow
          name="Stop Loss"
          tooltip="Set the percentage or price level at which your position will be closed to limit losses."
          colSpan="full"
          navId="stop-loss"
          contentClassName="space-y-sm"
        >
          <Slider
            value={Math.abs(parseFloat(slPerc) || 0)}
            onChange={(value) => handleSliderChange(value)}
            min={minSlToUse}
            max={maxSlToUse}
            step={0.1}
            className="w-full"
          />

          <div className="flex flex-col gap-xs sm:flex-row sm:items-center">
            <div className="flex items-center gap-sm">
              <NumberInput
                value={slPerc}
                onChange={(value) => updateFormData('slPerc', value)}
                min={-maxSlToUse}
                max={-minSlToUse}
                step={0.1}
                precision={3}
                className={cn(
                  'w-24',
                  !slValidation.isValid && 'border-destructive'
                )}
                endAdornment={unitAdornment('%')}
              />
            </div>

            <TerminalButtonStack
              value={String(Math.abs(parseFloat(slPerc) || 0))}
              onValueChange={(value) => handlePresetClick(-Number(value))}
              options={[1, 2, 5, 10].map((percentage) => ({
                value: String(percentage),
                label: `-${percentage}%`,
                disabled: percentage < minSlToUse,
                buttonClassName: 'flex-none min-w-[88px]',
              }))}
              className="sm:ml-auto"
            />
          </div>
          <div className="space-y-xs rounded-lg border border-border/50 bg-background/20 p-sm">
            <div className="flex flex-wrap items-center justify-between gap-xs text-sm">
              <div className="flex items-center gap-1">
                Average stop loss
                <Tooltip tooltip="Weighted by each target's allocation to estimate the blended exit level if all targets trigger.">
                  <InfoIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <div className="text-sm font-medium">
                {averageStopLossValue !== undefined
                  ? `${averageStopLossValue.toFixed(2)}%`
                  : '—'}
                {weightedStopLossPriceDisplay ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ≈ ${weightedStopLossPriceDisplay}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="space-y-sm border-t border-muted pt-3">
            <div className="space-y-1">
              <div className="flex items-center gap-xs">
                <Label className="text-sm">Deal close type</Label>
                <Tooltip tooltip="Limit order rests the stop loss on the ladder; Market order executes it immediately at market when the target triggers.">
                  <InfoIcon />
                </Tooltip>
              </div>
              <TerminalButtonStack
                value={comboSlLimit ? 'limit' : 'market'}
                onValueChange={(value) =>
                  updateFormData('comboSlLimit', value === 'limit')
                }
                options={[
                  { value: 'limit', label: 'Limit order' },
                  { value: 'market', label: 'Market order' },
                ]}
                className="w-full sm:w-auto"
              />
            </div>
          </div>
          {slErrorMessage ? (
            <div className="pt-2">
              <SettingsAlert variant="error" title={slErrorMessage} />
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Min value is -{minSlToUse}%
          </p>
        </SettingsRow>
      )}
      {!isComboBot ? (
        <SettingsLoadMore
          id="stop-loss-advanced"
          title="More Settings"
          autoExpand={
            !isComboBot &&
            (!!trailingSl || !!moveSL || baseSlOn === BaseSlOnEnum.start)
          }
        >
          <SettingsRow
            name="Trailing stop loss"
            tooltip="Create a stop loss that moves with the price, always spaced the same % from the best price."
            tooltipURL="/help/trailing-stop-loss"
            colSpan="full"
            trailing={
              <Switch
                id="trailing-sl"
                checked={trailingSl || false}
                onCheckedChange={(checked) => {
                  if (checked) {
                    updateFormData('moveSL', false);
                  }
                  updateFormData('trailingSl', checked);
                }}
                disabled={isTrailingLocked}
              />
            }
          >
            {isTrailingLocked ? (
              <SettingsAlert
                variant="info"
                title={
                  hasMultipleSlTargets
                    ? 'Trailing stop loss is not available with multiple stop loss targets. Remove extra targets to enable this option.'
                    : 'Disable Move Stop Loss to enable trailing stop loss.'
                }
              />
            ) : null}
          </SettingsRow>

          <SettingsRow
            name="Move SL"
            tooltip="Move the stop loss to a new level once the unrealized profit target is reached."
            tooltipURL="/help/move-stop-loss"
            colSpan="full"
            trailing={
              <Switch
                id="move-sl"
                checked={moveSL || false}
                onCheckedChange={(checked) => {
                  if (checked) {
                    updateFormData('trailingSl', false);
                  }
                  updateFormData('moveSL', checked);
                }}
                disabled={isMoveSlLocked}
              />
            }
            contentClassName={moveSL ? 'space-y-sm' : undefined}
          >
            {isMoveSlLocked ? (
              <SettingsAlert
                variant="info"
                title={
                  hasMultipleSlTargets
                    ? 'Move stop loss is not available with multiple stop loss targets. Remove extra targets to enable this option.'
                    : 'Disable trailing stop loss to configure Move Stop Loss.'
                }
              />
            ) : null}
            {moveSL ? (
              <ResponsiveFormLayout mode="auto" minFieldWidth={200}>
                <div className="space-y-xs">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="move-sl-trigger">Trigger %</Label>
                    <Tooltip tooltip="Unrealized profit percentage that must be reached before the stop loss moves.">
                      <InfoIcon className="h-3 w-3 text-muted-foreground" />
                    </Tooltip>
                  </div>
                  <NumberInput
                    id="move-sl-trigger"
                    value={moveSLTrigger}
                    onChange={(value) => updateFormData('moveSLTrigger', value)}
                    min={minMoveSlTrigger}
                    max={moveSlTriggerMax}
                    step={0.1}
                    precision={3}
                    placeholder="2.0"
                    endAdornment={unitAdornment('%')}
                  />
                  {moveSlValidation.trigger ? (
                    <p className="text-xs text-destructive">
                      {moveSlValidation.trigger}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-xs">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="move-sl-value">Move to %</Label>
                    <Tooltip tooltip="A positive number moves the stop loss into profit once the trigger is reached.">
                      <InfoIcon className="h-3 w-3 text-muted-foreground" />
                    </Tooltip>
                  </div>
                  <NumberInput
                    id="move-sl-value"
                    value={moveSLValue}
                    onChange={(value) => updateFormData('moveSLValue', value)}
                    min={0}
                    max={moveSlValueMax}
                    step={0.1}
                    precision={3}
                    placeholder="0.5"
                    endAdornment={unitAdornment('%')}
                  />
                  {moveSlValidation.value ? (
                    <p className="text-xs text-destructive">
                      {moveSlValidation.value}
                    </p>
                  ) : null}
                </div>
              </ResponsiveFormLayout>
            ) : null}
          </SettingsRow>

          {closeConditionSl !== CloseConditionEnum.webhook &&
          (trailingSl || moveSL) ? (
            <SettingsRow
              name="Base Stop Loss On"
              tooltip="Choose whether the stop loss percentage references the averaged filled orders or the initial entry price."
              colSpan="full"
            >
              <div className="rounded-md border border-dashed border-muted/50 bg-muted/20 p-sm text-xs text-muted-foreground">
                Base stop loss reference is locked while trailing or Move Stop
                Loss is active.
              </div>
            </SettingsRow>
          ) : closeConditionSl !== CloseConditionEnum.webhook ? (
            <SettingsRow
              name="Base Stop Loss On"
              tooltip="Choose whether the stop loss percentage references the averaged filled orders or the initial entry price."
              colSpan="full"
            >
              <TerminalButtonStack
                value={(baseSlOn ?? BaseSlOnEnum.avg) as string}
                onValueChange={(nextValue) =>
                  updateFormData('baseSlOn', nextValue as BaseSlOnEnum)
                }
                options={[
                  { value: BaseSlOnEnum.avg, label: 'Average price' },
                  {
                    value: BaseSlOnEnum.start,
                    label: 'Start order price',
                  },
                ]}
                className="w-full"
                disabled={riskRewardActive}
              />
            </SettingsRow>
          ) : null}
        </SettingsLoadMore>
      ) : null}
    </div>
  );
};

const IndicatorsSL: React.FC<
  Omit<StopLossSettingsProps, 'fomData'> & { stopLossLocked?: boolean }
> = ({
  //formData,
  currentExchange,
  updateFormData,
  errors,
  stopLossLocked = false,
}) => {
  const indicatorGroups = useBotFormSelector('indicatorGroups');
  const indicators = useBotFormSelector('indicators');
  const stopDealSlLogic = useBotFormSelector('stopDealSlLogic');
  const { openSelector, selector } = useIndicatorSelector();

  const {
    favorites: favoriteIndicators,
    toggleFavorite,
    isMutating: favoritesMutating,
    isIndicatorMutating,
  } = useFavoriteIndicators();
  const stopLossIndicatorGroups = useMemo<IndicatorGroup[]>(
    () =>
      indicatorGroups.filter(
        (g) =>
          g.action === IndicatorAction.closeDeal &&
          g.section === IndicatorSection.sl
      ) ?? [],
    [indicatorGroups]
  );

  const handleToggleFavorite = useCallback(
    (type: IndicatorEnum, nextIsFavorite: boolean) => {
      toggleFavorite(type, nextIsFavorite);
    },
    [toggleFavorite]
  );

  const totalIndicatorsAcrossBot = useMemo(() => {
    return indicators.length;
  }, [indicators]);

  const indicatorLimitReached = totalIndicatorsAcrossBot >= indicatorsLimit;

  const interactionDisabledClass = stopLossLocked
    ? 'pointer-events-none select-none opacity-60'
    : '';

  const syncStopLossIndicatorGroups = useCallback(
    (nextGroups: IndicatorGroup[]) => {
      updateFormData('indicatorGroups', [
        ...indicatorGroups.filter(
          (group) =>
            !(
              group.action === IndicatorAction.closeDeal &&
              group.section === IndicatorSection.sl
            )
        ),
        ...nextGroups,
      ]);
    },
    [updateFormData, indicatorGroups]
  );

  const handleAddStopLossGroup = useCallback(() => {
    if (
      indicatorLimitReached ||
      stopLossIndicatorGroups.length >= MAX_SL_INDICATOR_GROUPS
    ) {
      return;
    }

    const newGroup: IndicatorGroup = {
      id: createSlGroupId(),
      logic:
        stopDealSlLogic === IndicatorsLogicEnum.or
          ? IndicatorsLogicEnum.or
          : IndicatorsLogicEnum.and,
      action: IndicatorAction.closeDeal,
      section: IndicatorSection.sl,
    };

    syncStopLossIndicatorGroups([...stopLossIndicatorGroups, newGroup]);
  }, [
    stopDealSlLogic,
    indicatorLimitReached,
    stopLossIndicatorGroups,
    syncStopLossIndicatorGroups,
  ]);

  const handleRemoveStopLossGroup = useCallback(
    (groupId: string) => {
      const nextGroups = stopLossIndicatorGroups.filter(
        (group) => group.id !== groupId
      );
      syncStopLossIndicatorGroups(nextGroups);
    },
    [stopLossIndicatorGroups, syncStopLossIndicatorGroups]
  );

  const handleUpdateStopLossGroup = useCallback(
    (groupId: string, updates: Partial<IndicatorGroup>) => {
      const nextGroups = stopLossIndicatorGroups.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        const nextGroup: IndicatorGroup = {
          ...group,
          ...updates,
        };

        return nextGroup;
      });

      syncStopLossIndicatorGroups(nextGroups);
    },
    [stopLossIndicatorGroups, syncStopLossIndicatorGroups]
  );

  const handleChangeStopLossGroupLogic = useCallback(
    (groupId: string, logic: IndicatorGroup['logic']) => {
      handleUpdateStopLossGroup(groupId, { logic });
    },
    [handleUpdateStopLossGroup]
  );

  const handleAddIndicatorToStopLossGroup = useCallback(
    (groupId: string) => {
      const targetGroup = stopLossIndicatorGroups.find(
        (group) => group.id === groupId
      );
      if (!targetGroup) {
        return;
      }

      // Load a default RSI indicator immediately; type is swappable on the
      // card afterwards (handleSelectIndicatorTypeInStopLossGroup).
      const type = IndicatorEnum.rsi;
      const defaultParams = getIndicatorDefaultParams(
        type,
        IndicatorAction.closeDeal,
        IndicatorSection.sl
      );
      const sanitizedParams = sanitizeIndicatorParams(
        (defaultParams ?? {}) as IndicatorParamsState
      );
      const newIndicator = buildIndicatorConfig(type, sanitizedParams, {
        uuid: createSlIndicatorId(),
        keepConditionBars: '0',
        indicatorAction: IndicatorAction.closeDeal,
        section: IndicatorSection.sl,
      });

      updateFormData('indicators', [
        ...indicators,
        { ...newIndicator, groupId: groupId },
      ]);
    },
    [
      stopLossIndicatorGroups,
      updateFormData,
      indicators,
    ]
  );

  const handleRemoveIndicatorFromStopLossGroup = useCallback(
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

  const handleChangeIndicatorParamsInStopLossGroup = useCallback(
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
    [indicators, updateFormData]
  );

  const handleSelectIndicatorTypeInStopLossGroup = useCallback(
    (groupId: string, indicator: IndicatorConfig) => {
      const targetGroup = stopLossIndicatorGroups.find(
        (group) => group.id === groupId
      );
      if (!targetGroup) {
        return;
      }

      openSelector({
        allowedActions: [IndicatorAction.closeDeal],
        favorites: favoriteIndicators,
        onToggleFavorite: handleToggleFavorite,
        favoritesMutating,
        isFavoriteMutating: isIndicatorMutating,
        title: 'Select stop loss indicator',
        onSelect: (type) => {
          const defaults = getIndicatorDefaultParams(
            type,
            IndicatorAction.closeDeal,
            IndicatorSection.sl
          );
          const sanitizedParams = sanitizeIndicatorParams(
            (defaults ?? {}) as IndicatorParamsState
          );
          const nextIndicator = buildIndicatorConfig(type, sanitizedParams, {
            uuid: indicator.uuid,
            keepConditionBars: indicator.keepConditionBars ?? '0',
            indicatorAction: IndicatorAction.closeDeal,
            section: IndicatorSection.sl,
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
      favoriteIndicators,
      favoritesMutating,
      handleToggleFavorite,
      isIndicatorMutating,
      openSelector,
      stopLossIndicatorGroups,
      indicators,
      updateFormData,
    ]
  );

  const closeIndicatorErrorMessage = errors['indicatorsCloseSL'];

  return (
    <>
      <SettingsRow
        name={'Stop Loss indicator groups'}
        tooltip={'Organize stop loss exit indicators into groups.'}
        tooltipURL="/help/technical-indicators-conditions-deal-close"
        colSpan="full"
        className={interactionDisabledClass}
        contentClassName="space-y-md"
        trailing={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <div>
              Remaining:{' '}
              {Math.max(indicatorsLimit - totalIndicatorsAcrossBot, 0)}
            </div>
          </div>
        }
      >
        <IndicatorGroupsManager
          indicators={indicators}
          indicatorGroups={indicatorGroups}
          globalLogic={stopDealSlLogic || IndicatorsLogicEnum.and}
          errorMessage={closeIndicatorErrorMessage}
          totalIndicatorsAcrossBot={totalIndicatorsAcrossBot}
          indicatorAction={IndicatorAction.closeDeal}
          indicatorSection={IndicatorSection.sl}
          exchange={currentExchange?.provider}
          topTrailingContent={
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <div>
                Remaining:{' '}
                {Math.max(indicatorsLimit - totalIndicatorsAcrossBot, 0)}
              </div>
            </div>
          }
          maxGroups={MAX_SL_INDICATOR_GROUPS}
          maxIndicatorsPerGroup={MAX_SL_INDICATORS_PER_GROUP}
          emptyStateMessage="No indicator groups configured yet. Add a group to start building stop loss confirmations."
          emptyIndicatorsAlertTitle="No indicators in groups"
          emptyIndicatorsAlertDescription="Add at least one indicator to each stop loss group. Groups without indicators will never trigger."
          onAddGroup={handleAddStopLossGroup}
          onRemoveGroup={handleRemoveStopLossGroup}
          onChangeGroupLogic={handleChangeStopLossGroupLogic}
          onAddIndicatorToGroup={handleAddIndicatorToStopLossGroup}
          onRemoveIndicatorFromGroup={handleRemoveIndicatorFromStopLossGroup}
          onSelectIndicatorType={handleSelectIndicatorTypeInStopLossGroup}
          onChangeIndicatorParams={handleChangeIndicatorParamsInStopLossGroup}
          onChangeGlobalLogic={(value) =>
            updateFormData('stopDealSlLogic', value)
          }
        />
      </SettingsRow>
      {selector}
    </>
  );
};

export const StopLossSettings: React.FC<StopLossSettingsProps> = ({
  currentExchange,
  formData,
  updateFormData,
  errors: _errors,
}) => {
  const { mode, errors: formStateErrors, setFormData } = useBotFormState();

  const mergedErrors = useMemo(
    () => ({ ...formStateErrors, ..._errors }),
    [formStateErrors, _errors]
  );
  const dealCloseConditionSL = useBotFormSelector('dealCloseConditionSL');
  const useRiskReward = useBotFormSelector('useRiskReward');
  const useSl = useBotFormSelector('useSl');
  const indicators = useBotFormSelector('indicators');
  const indicatorGroups = useBotFormSelector('indicatorGroups');
  const stopDealSlLogic = useBotFormSelector('stopDealSlLogic');
  const isDealEdit = useMemo(
    () => mode === 'deal-edit' || mode === 'deal-mass-edit',
    [mode]
  );
  const closeConditionSl = useMemo(
    () => (dealCloseConditionSL as CloseConditionEnum) ?? CloseConditionEnum.tp,
    [dealCloseConditionSL]
  );
  const riskRewardActive = useMemo(
    () => Boolean(useRiskReward),
    [useRiskReward]
  );
  const isComboBot = useMemo(() => formData.type === 'combo', [formData.type]);

  const currentSlIndicators = useMemo(
    () =>
      (indicators ?? []).filter(
        (i) =>
          i.indicatorAction === IndicatorAction.closeDeal &&
          i.section === IndicatorSection.sl
      ),
    [indicators]
  );

  const currentSlIndicatorGroups = useMemo(
    () =>
      (indicatorGroups ?? []).filter(
        (g) =>
          g.action === IndicatorAction.closeDeal &&
          g.section === IndicatorSection.sl
      ),
    [indicatorGroups]
  );

  const currentIndicatorLimitReached = useMemo(
    () => (indicators ?? []).length >= indicatorsLimit,
    [indicators]
  );

  const previousRiskRewardRef = useRef(riskRewardActive);

  useEffect(() => {
    if (riskRewardActive && !previousRiskRewardRef.current) {
      setFormData((prev) => {
        const next: BotFormData['dca'] = {
          ...prev.dca,
          useSl: false,
          dealCloseConditionSL: CloseConditionEnum.tp,
          slPerc: '0',
          useMultiSl: false,
          multiSl: [],
          trailingSl: false,
          moveSL: false,
          moveSLTrigger: '2',
          moveSLValue: '0',
        };
        return {
          ...prev,
          dca: next,
        };
      });
    }

    previousRiskRewardRef.current = riskRewardActive;
  }, [riskRewardActive, setFormData]);

  const closeConditionOptions = useMemo(() => {
    const options: CloseConditionEnum[] = [
      CloseConditionEnum.tp,
      CloseConditionEnum.techInd,
      CloseConditionEnum.dynamicAr,
      CloseConditionEnum.webhook,
    ];

    return options.map((option) => ({
      value: option,
      disabled: false,
    }));
  }, []);

  const handleCloseConditionChange = useCallback(
    (value: CloseConditionEnum) => {
      // When switching to technical indicators, seed the UI with a
      // default group and one RSI indicator for stop loss when none exist.
      if (
        value === CloseConditionEnum.techInd &&
        currentSlIndicatorGroups.length === 0 &&
        currentSlIndicators.length === 0 &&
        !currentIndicatorLimitReached
      ) {
        const newGroup: IndicatorGroup = {
          id: createSlGroupId(),
          logic:
            stopDealSlLogic === IndicatorsLogicEnum.or
              ? IndicatorsLogicEnum.or
              : IndicatorsLogicEnum.and,
          action: IndicatorAction.closeDeal,
          section: IndicatorSection.sl,
        };

        const defaultParams = getIndicatorDefaultParams(
          IndicatorEnum.rsi,
          IndicatorAction.closeDeal,
          IndicatorSection.sl
        );
        const sanitized = sanitizeIndicatorParams(
          (defaultParams ?? {}) as IndicatorParamsState
        );
        const newIndicator = buildIndicatorConfig(
          IndicatorEnum.rsi,
          sanitized,
          {
            uuid: createSlIndicatorId(),
            keepConditionBars: '0',
          }
        );

        const nextGroups = [
          ...indicatorGroups.filter(
            (group) =>
              !(
                group.action === IndicatorAction.closeDeal &&
                group.section === IndicatorSection.sl
              )
          ),
          newGroup,
        ];

        updateFormData('indicatorGroups', nextGroups);
        updateFormData('indicators', [
          ...indicators,
          { ...newIndicator, ...sanitized, groupId: newGroup.id },
        ]);
      }

      // When switching to Dynamic ATR/ADR, auto-seed a default ATR for the
      // stop-loss section when none exist — legacy main-dash seeds one on
      // selecting the option so the section is immediately valid (no group;
      // dynamic-AR indicators are ungrouped, matching legacy's
      // notNeedGroupId).
      if (
        value === CloseConditionEnum.dynamicAr &&
        currentSlIndicators.length === 0 &&
        !currentIndicatorLimitReached
      ) {
        const defaultParams = getIndicatorDefaultParams(
          IndicatorEnum.atr,
          IndicatorAction.closeDeal,
          IndicatorSection.sl
        );
        const sanitized = sanitizeIndicatorParams(
          (defaultParams ?? {}) as IndicatorParamsState
        );
        const paramsWithFactor: IndicatorParamsState = {
          ...sanitized,
          dynamicArFactor: sanitized['dynamicArFactor'] ?? '1',
        };
        const newIndicator = buildIndicatorConfig(
          IndicatorEnum.atr,
          paramsWithFactor,
          {
            uuid: createSlIndicatorId(),
            keepConditionBars: '0',
            indicatorAction: IndicatorAction.closeDeal,
            section: IndicatorSection.sl,
          }
        );

        updateFormData('indicators', [
          ...indicators,
          { ...newIndicator, ...paramsWithFactor },
        ]);
      }

      updateFormData('dealCloseConditionSL', value);
    },
    [
      updateFormData,
      currentSlIndicatorGroups,
      currentSlIndicators,
      currentIndicatorLimitReached,
      stopDealSlLogic,
      indicators,
      indicatorGroups,
    ]
  );

  const renderSLContent = (condition: CloseConditionEnum) => {
    if (isDealEdit && condition && condition !== CloseConditionEnum.tp) {
      return (
        <Alert>
          <AlertTitle className="text-sm font-semibold">
            Stop loss type locked
          </AlertTitle>
          <AlertDescription className="text-xs leading-relaxed">
            The stop loss type cannot be changed while editing an active deal.
            To modify the stop loss type, please edit the bot settings outside
            of the deal view.
          </AlertDescription>
        </Alert>
      );
    }
    switch (condition) {
      case CloseConditionEnum.techInd:
        return (
          <IndicatorsSL
            currentExchange={currentExchange}
            formData={formData}
            updateFormData={updateFormData}
            errors={mergedErrors}
            stopLossLocked={riskRewardActive}
          />
        );
      case CloseConditionEnum.dynamicAr:
        return (
          <DynamicArIndicatorPanel
            section={IndicatorSection.sl}
            currentExchange={currentExchange}
          />
        );
      case CloseConditionEnum.webhook:
        return (
          <>
            <Alert>
              <AlertTitle className="text-sm font-semibold">
                Webhook-managed stop loss
              </AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                Stop loss management will rely on webhook signals. Configure
                your payload in the webhook section to control exits.
              </AlertDescription>
            </Alert>
            <PercentageSL
              currentExchange={currentExchange}
              formData={formData}
              updateFormData={updateFormData}
              errors={mergedErrors}
              isComboBot={isComboBot}
              riskRewardActive={riskRewardActive}
              closeConditionSl={condition}
            />
          </>
        );
      case CloseConditionEnum.tp:
      default:
        return (
          <PercentageSL
            currentExchange={currentExchange}
            formData={formData}
            updateFormData={updateFormData}
            errors={mergedErrors}
            isComboBot={isComboBot}
            riskRewardActive={riskRewardActive}
            closeConditionSl={condition}
          />
        );
    }
  };

  if (!useSl && !riskRewardActive) {
    return null;
  }

  // When Risk:Reward is active, hide the Stop Loss section body
  // A notice will be shown in the section header by the BotForm wrapper
  if (riskRewardActive) {
    return null;
  }

  return (
    <>
      {isComboBot ? (
        <>
          {renderSLContent(closeConditionSl)}
          <BaseStopLosslOn />
        </>
      ) : (
        <Tabs
          value={closeConditionSl}
          onValueChange={(value) =>
            handleCloseConditionChange(value as CloseConditionEnum)
          }
        >
          {!isDealEdit && (
            <SettingsRow
              name="Stop loss type"
              tooltip="Select the condition under which the stop loss will trigger."
              colSpan="full"
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
                        <span>
                          {closeConditionsMap[option.value] ?? option.value}
                        </span>
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

                {mergedErrors['dealCloseConditionSL'] && (
                  <p className="text-xs text-destructive">
                    {mergedErrors['dealCloseConditionSL']}
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
              {renderSLContent(option.value)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </>
  );
};
