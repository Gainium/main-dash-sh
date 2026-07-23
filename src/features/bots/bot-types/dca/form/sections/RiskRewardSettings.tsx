import { IndicatorList } from '@/components/indicators/IndicatorList';
import { InlineIndicatorConfig } from '@/components/indicators/InlineIndicatorConfig';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import { Label } from '@/components/ui/label';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import { QuickInputFormButtons } from '@/components/ui/quick-input-form-buttons';
import { InputButtonsSlider } from '@/features/bots/shared/components/InputButtonsSlider';

import { Tooltip } from '@/components/ui/tooltip';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import { useRiskRewardRuntime } from '@/contexts/bots/dca/RiskRewardRuntimeContext';
import {
  useBotFormActions,
  useBotFormAlerts,
  useBotFormErrors,
  useBotFormSelector,
  useBotFormTopLevelSelector,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { useBotFormDcaTradingContext } from '@/hooks/bots/dca/useDcaTradingContext';
import { useRiskReward as useRiskReward_hook } from '@/hooks/bots/dca/useRiskReward';
import useBotVarBinding from '@/hooks/bots/global-variables/useBotVarBinding';
import { useFavoriteIndicators } from '@/hooks/useFavoriteIndicators';
import { useIndicatorSelector } from '@/hooks/useIndicatorSelector';
import logger from '@/lib/loggerInstance';
import { riskRewardPositionStore } from '@/stores/riskRewardPositionStore';
import {
  BotOrderSideEnum,
  BotTypesEnum,
  IndicatorAction,
  IndicatorEnum,
  RiskSlTypeEnum,
  RRSlTypeEnum,
  StrategyEnum,
} from '@/types';
import type { BotFormErrors } from '@/types/bots/form';
import type { GlobalVariable } from '@/types/globalVariables';
import { type IndicatorConfig } from '@/types/indicators';
import {
  getIndicatorDefaultParams,
  getIndicatorDefinition,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import { formatNumericString } from '@/utils/bots/dca/take-profit';
import {
  buildIndicatorConfig,
  sanitizeIndicatorParams,
} from '@/utils/indicators/indicatorConfigUtils';
import { Crosshair } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';
import { IndicatorActionsToolbar } from '../../../../shared/components/IndicatorActionsToolbar';

type RiskRewardBindableField =
  | 'riskSlAmountPerc'
  | 'riskSlAmountValue'
  | 'riskTpRatio'
  | 'riskMinSl'
  | 'riskMaxSl'
  | 'riskMinPositionSize'
  | 'riskMaxPositionSize'
  | 'rrSlFixedValue';

const MAX_RISK_INDICATORS = 10;

const createRiskIndicatorId = (): string => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `risk-indicator-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const RiskRewardSettings: React.FC = () => {
  const { updateFormData } = useBotFormActions();
  const errors = useBotFormErrors();
  const formTerminal = useBotFormTopLevelSelector('terminal');
  const formPair = useBotFormTopLevelSelector('pair');
  const formPairMetadata = useBotFormTopLevelSelector('pairMetadata');
  const formType = useBotFormTopLevelSelector('type');
  const {
    coordinates,
    activePickerField,
    setActivePickerField,
    setCoordinates,
  } = useTradingTerminalUtils();
  // Use the risk/reward hook for live calculations
  const riskRewardData = useRiskReward_hook();
  const { resetRuntime, updateRuntime } = useRiskRewardRuntime();
  const { botId: contextBotId, bot, currentExchange } = useBotFormQuery();
  const { openSelector, selector } = useIndicatorSelector();
  const isTerminal = useMemo(() => !!formTerminal, [formTerminal]);
  const alerts = useBotFormAlerts();

  const resolvedErrors = React.useMemo<BotFormErrors>(
    () => errors ?? {},
    [errors]
  );
  const hasBlockingErrors = React.useMemo(
    () => Object.values(resolvedErrors).some((value) => Boolean(value)),
    [resolvedErrors]
  );
  const indicators = useBotFormSelector('indicators');
  const rrSlType = useBotFormSelector('rrSlType');
  const strategy = useBotFormSelector('strategy');
  const futures = useBotFormSelector('futures');
  const marginType = useBotFormSelector('marginType');
  const leverage = useBotFormSelector('leverage');
  const coinm = useBotFormSelector('coinm');
  const useRiskReward = useBotFormSelector('useRiskReward');
  const riskSlType = useBotFormSelector('riskSlType');
  const riskSlAmountPerc = useBotFormSelector('riskSlAmountPerc');
  const riskSlAmountValue = useBotFormSelector('riskSlAmountValue');
  const riskUseTpRatio = useBotFormSelector('riskUseTpRatio');
  const riskTpRatio = useBotFormSelector('riskTpRatio');
  const riskMinSl = useBotFormSelector('riskMinSl');
  const riskMaxSl = useBotFormSelector('riskMaxSl');
  const riskMinPositionSize = useBotFormSelector('riskMinPositionSize');
  const riskMaxPositionSize = useBotFormSelector('riskMaxPositionSize');
  const fixedTpPrice = useBotFormSelector('fixedTpPrice');
  const rrSlFixedValue = useBotFormSelector('rrSlFixedValue');
  const fixedSlPrice = useBotFormSelector('fixedSlPrice');
  const riskIndicators = React.useMemo<IndicatorConfig[]>(
    () =>
      indicators.filter(
        (i) => i.indicatorAction === IndicatorAction.riskReward
      ) ?? [],
    [indicators]
  );
  const {
    favorites: favoriteIndicatorTypes,
    toggleFavorite,
    isMutating: favoritesMutating,
    isIndicatorMutating,
  } = useFavoriteIndicators();

  const { latestPrice } = useBotFormDcaTradingContext();

  useEffect(() => {
    if (
      !coordinates ||
      !coordinates.pickerField ||
      !latestPrice ||
      rrSlType !== RRSlTypeEnum.fixed
    ) {
      return;
    }

    // Only process if this is the risk/reward SL fixed field
    if (coordinates.pickerField !== 'rrSlFixedValue') {
      return;
    }

    const { price } = coordinates;
    if (!price || price <= 0) return;

    if (latestPrice <= 0) {
      logger.warn('Latest price is invalid, cannot apply chart pick');
      return;
    }

    const diff =
      strategy === StrategyEnum.long
        ? price - latestPrice
        : latestPrice - price;

    if (diff > 0) {
      logger.warn(
        'Picked price results in invalid stop loss, cannot apply chart pick'
      );
      if (setCoordinates) {
        setCoordinates(null);
      }
      return;
    }

    const magnitude = Math.abs((diff / latestPrice) * 100);
    const signedValue = strategy === StrategyEnum.long ? -magnitude : magnitude;
    updateFormData('rrSlFixedValue', signedValue.toFixed(2));

    // Clear coordinates after processing
    if (setCoordinates) {
      setCoordinates(null);
    }
  }, [
    coordinates,
    strategy,
    rrSlType,
    latestPrice,
    updateFormData,
    setCoordinates,
  ]);

  const { isBound: isRiskSlPercBound } = useBotVarBinding('riskSlAmountPerc');
  const { isBound: isRiskSlValueBound } = useBotVarBinding('riskSlAmountValue');
  const { isBound: isRRSlFixedValueBound } = useBotVarBinding('rrSlFixedValue');
  const { isBound: isRiskTpRatioBound } = useBotVarBinding('riskTpRatio');
  const { isBound: isRiskMinSlBound } = useBotVarBinding('riskMinSl');

  const { isBound: isRiskMaxSlBound } = useBotVarBinding('riskMaxSl');
  const { isBound: isRiskMinPositionBound } = useBotVarBinding(
    'riskMinPositionSize'
  );
  const { isBound: isRiskMaxPositionBound } = useBotVarBinding(
    'riskMaxPositionSize'
  );

  const riskSlPercSliderValue = React.useMemo(() => {
    const parsed = Number.parseFloat(riskSlAmountPerc ?? '');
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.min(Math.max(parsed, 1), 99);
  }, [riskSlAmountPerc]);

  const rrSlFixedValueSliderValue = React.useMemo(() => {
    const parsed = Number.parseFloat(rrSlFixedValue ?? '');
    if (!Number.isFinite(parsed)) {
      return strategy === StrategyEnum.long ? -1 : 1;
    }
    const min = strategy === StrategyEnum.long ? -99 : 0.1;
    const max = strategy === StrategyEnum.long ? -0.1 : 99;
    return Math.min(Math.max(parsed, min), max);
  }, [rrSlFixedValue, strategy]);

  const hasRiskAmountBinding = isRiskSlPercBound || isRiskSlValueBound;
  const hasPositionSizeBinding =
    isRiskMinPositionBound || isRiskMaxPositionBound;

  const applyVariableToField = React.useCallback(
    (field: RiskRewardBindableField, variable: GlobalVariable | null) => {
      if (
        !variable ||
        variable.value === undefined ||
        variable.value === null
      ) {
        return;
      }

      const nextValue = String(variable.value);

      switch (field) {
        case 'riskSlAmountPerc':
          updateFormData('riskSlType', 'perc');
          updateFormData('riskSlAmountPerc', nextValue);
          break;
        case 'riskSlAmountValue':
          updateFormData('riskSlType', 'fixed');
          updateFormData('riskSlAmountValue', nextValue);
          break;
        case 'riskTpRatio':
          updateFormData('riskUseTpRatio', true);
          updateFormData('riskTpRatio', nextValue);
          break;
        case 'riskMinSl':
          updateFormData('riskMinSl', nextValue);
          break;
        case 'riskMaxSl':
          updateFormData('riskMaxSl', nextValue);
          break;
        case 'riskMinPositionSize':
          updateFormData('riskMinPositionSize', nextValue);
          break;
        case 'riskMaxPositionSize':
          updateFormData('riskMaxPositionSize', nextValue);
          break;
        case 'rrSlFixedValue':
          updateFormData('rrSlFixedValue', nextValue);
          break;
        default:
          break;
      }
    },
    [updateFormData]
  );

  const updateRiskIndicators = React.useCallback(
    (next: IndicatorConfig[]) => {
      // Replace the entire risk-reward slice with `next` (supports
      // add/remove/modify) while preserving non-risk indicators in
      // their original position. `buildIndicatorConfig` doesn't carry
      // `indicatorAction`, so stamp it here too — otherwise the filter
      // in `riskIndicators` would exclude freshly added entries.
      const nextById = new Map(
        next.map((i) => [
          i.uuid,
          { ...i, indicatorAction: IndicatorAction.riskReward },
        ])
      );
      const seen = new Set<string>();
      const merged: IndicatorConfig[] = [];
      for (const i of indicators) {
        if (i.indicatorAction === IndicatorAction.riskReward) {
          const replacement = nextById.get(i.uuid);
          if (replacement) {
            merged.push(replacement);
            seen.add(i.uuid);
          }
          continue;
        }
        merged.push(i);
      }
      for (const ni of next) {
        if (!seen.has(ni.uuid)) {
          merged.push({
            ...ni,
            indicatorAction: IndicatorAction.riskReward,
          });
        }
      }
      updateFormData('indicators', merged);
    },
    [updateFormData, indicators]
  );

  const handleToggleFavoriteIndicator = React.useCallback(
    (type: IndicatorEnum, nextIsFavorite: boolean) => {
      toggleFavorite(type, nextIsFavorite);
    },
    [toggleFavorite]
  );

  const launchRiskIndicatorSelector = React.useCallback(
    (onSelect: (type: IndicatorEnum) => void) => {
      openSelector({
        allowedActions: [IndicatorAction.riskReward],
        favorites: favoriteIndicatorTypes,
        onToggleFavorite: handleToggleFavoriteIndicator,
        favoritesMutating,
        isFavoriteMutating: isIndicatorMutating,
        title: 'Select risk indicator',
        onSelect,
      });
    },
    [
      favoriteIndicatorTypes,
      favoritesMutating,
      handleToggleFavoriteIndicator,
      isIndicatorMutating,
      openSelector,
    ]
  );

  const handleAddIndicator = React.useCallback(() => {
    if (riskIndicators.length >= MAX_RISK_INDICATORS) {
      return;
    }

    launchRiskIndicatorSelector((type) => {
      const defaults = getIndicatorDefaultParams(
        type,
        IndicatorAction.riskReward
      );
      const sanitizedParams = sanitizeIndicatorParams(
        (defaults ?? {}) as IndicatorParamsState
      );
      const newIndicator = buildIndicatorConfig(type, sanitizedParams, {
        uuid: createRiskIndicatorId(),
      });

      updateRiskIndicators([
        ...riskIndicators,
        { ...newIndicator, ...sanitizedParams },
      ]);
    });
  }, [launchRiskIndicatorSelector, riskIndicators, updateRiskIndicators]);

  const handleChangeIndicatorParams = React.useCallback(
    (id: string, params: IndicatorParamsState) => {
      const sanitized = sanitizeIndicatorParams(params);
      // Spread top-level (not nested under `params`): the inline config and
      // the save serializer only read top-level fields, so nested edits were
      // ignored and inputs snapped back to their previous values.
      updateRiskIndicators(
        riskIndicators.map((indicator) =>
          indicator.uuid === id ? { ...indicator, ...sanitized } : indicator
        )
      );
    },
    [riskIndicators, updateRiskIndicators]
  );

  const riskIndicatorsAtLimit = riskIndicators.length >= MAX_RISK_INDICATORS;
  const addRiskIndicatorTooltip = riskIndicatorsAtLimit
    ? `You can add up to ${MAX_RISK_INDICATORS} risk indicators.`
    : undefined;

  const handleSelectIndicatorType = React.useCallback(
    (indicator: IndicatorConfig) => {
      launchRiskIndicatorSelector((type) => {
        const defaults = getIndicatorDefaultParams(
          type,
          IndicatorAction.riskReward
        );
        const sanitizedParams = sanitizeIndicatorParams(
          (defaults ?? {}) as IndicatorParamsState
        );
        const nextIndicator = buildIndicatorConfig(type, sanitizedParams, {
          uuid: indicator.uuid,
        });

        updateRiskIndicators(
          riskIndicators.map((candidate) =>
            candidate.uuid === indicator.uuid
              ? { ...candidate, ...nextIndicator, params: sanitizedParams }
              : candidate
          )
        );
      });
    },
    [launchRiskIndicatorSelector, riskIndicators, updateRiskIndicators]
  );

  const handleRemoveIndicator = React.useCallback(
    (id: string) => {
      updateRiskIndicators(
        riskIndicators.filter((indicator) => indicator.uuid !== id)
      );
    },
    [riskIndicators, updateRiskIndicators]
  );

  const handleInputChange = (
    field: Fields,
    value: string | boolean | number
  ) => {
    updateFormData(field, value);
  };

  React.useEffect(() => {
    if (!useRiskReward) {
      resetRuntime();
    } else {
      // When Risk:Reward is enabled, always enable TP ratio
      if (!riskUseTpRatio) {
        updateFormData('riskUseTpRatio', true);
      }
      // Set default TP ratio if not set
      const currentRatio = Number.parseFloat(riskTpRatio ?? '');
      if (!Number.isFinite(currentRatio) || currentRatio <= 0) {
        updateFormData('riskTpRatio', '2');
      }
    }
  }, [
    useRiskReward,
    resetRuntime,
    riskUseTpRatio,
    riskTpRatio,
    updateFormData,
  ]);

  const botIdentifier = bot?._id ?? undefined;
  const resolvedBotId = contextBotId ?? botIdentifier ?? '';

  const leverageMultiplier = React.useMemo(() => {
    if (!futures) {
      return 1;
    }
    if (marginType !== 'isolated') {
      return 1;
    }
    const numericLeverage = Number(leverage ?? 1);
    return Number.isFinite(numericLeverage) && numericLeverage > 0
      ? numericLeverage
      : 1;
  }, [futures, marginType, leverage]);

  const assetLabel = React.useMemo(() => {
    if (futures) {
      return coinm ? 'Base Asset' : 'Quote Asset';
    }

    return strategy === StrategyEnum.long ? 'Quote Asset' : 'Base Asset';
  }, [coinm, futures, strategy]);

  const computeProfitPrice = React.useCallback((): number | null => {
    if (!riskRewardData.hasValidData || riskRewardData.entryPrice === null) {
      return null;
    }

    // With Risk:Reward, TP ratio is always enabled - use the calculated TP price
    if (typeof riskRewardData.takeProfitPrice === 'number') {
      return riskRewardData.takeProfitPrice;
    }

    return null;
  }, [
    riskRewardData.entryPrice,
    riskRewardData.hasValidData,
    riskRewardData.takeProfitPrice,
  ]);

  // --- Terminal chart sync (Risk:Reward -> draggable TP/SL lines) ---
  const lastSyncedRiskLinesRef = React.useRef<string | null>(null);
  const isUpdatingFromChartRef = React.useRef(false);

  React.useEffect(() => {
    if (!isTerminal) return;
    if (!useRiskReward) return;
    if (hasBlockingErrors) return;
    if (!riskRewardData.hasValidData || riskRewardData.riskError) return;
    if (isUpdatingFromChartRef.current) return;

    const entryPrice = riskRewardData.entryPrice;
    const stopPrice = riskRewardData.stopLossPrice;
    const profitPrice = computeProfitPrice();

    if (
      entryPrice === null ||
      !Number.isFinite(entryPrice) ||
      entryPrice <= 0 ||
      stopPrice === null ||
      !Number.isFinite(stopPrice) ||
      stopPrice <= 0 ||
      profitPrice === null ||
      !Number.isFinite(profitPrice) ||
      profitPrice <= 0
    ) {
      return;
    }

    // Enable TP/SL and fixed prices so exampleOrders renders draggable order lines.
    const key = `${entryPrice}:${stopPrice}:${profitPrice}`;
    if (lastSyncedRiskLinesRef.current === key) {
      return;
    }
    lastSyncedRiskLinesRef.current = key;

    updateFormData('useTp', true);
    updateFormData('useSl', true);
    updateFormData('useFixedSLPrices', true);
    updateFormData('fixedSlPrice', String(stopPrice));
    updateFormData('useFixedTPPrices', true);
    updateFormData('fixedTpPrice', String(profitPrice));
  }, [
    isTerminal,
    useRiskReward,
    hasBlockingErrors,
    riskRewardData.hasValidData,
    riskRewardData.riskError,
    riskRewardData.entryPrice,
    riskRewardData.stopLossPrice,
    computeProfitPrice,
    updateFormData,
  ]);

  // When user drags the SL line in terminal, update Risk:Reward inputs/runtime.
  const lastProcessedSlDragRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isTerminal) return;
    if (!useRiskReward) return;
    if (rrSlType !== RRSlTypeEnum.fixed) return;

    const fixedSl = Number.parseFloat(String(fixedSlPrice ?? ''));
    if (!Number.isFinite(fixedSl) || fixedSl <= 0) return;

    const entry = riskRewardData.entryPrice;
    if (entry === null || !Number.isFinite(entry) || entry <= 0) return;

    const key = `${entry}:${fixedSl}`;
    if (lastProcessedSlDragRef.current === key) return;
    lastProcessedSlDragRef.current = key;

    const diff =
      strategy === StrategyEnum.short ? fixedSl - entry : entry - fixedSl;
    if (!(diff > 0)) return;

    const percent = Math.abs((diff / entry) * 100);
    if (Number.isFinite(percent)) {
      const signed = strategy === StrategyEnum.long ? -percent : percent;
      isUpdatingFromChartRef.current = true;
      updateFormData('rrSlFixedValue', signed.toFixed(2));
      updateRuntime({
        stopLossPrice: fixedSl,
        sourceId: 'chart',
        updatedAt: Date.now(),
      });
      // Reset the flag after a microtask to allow the update to propagate
      Promise.resolve().then(() => {
        isUpdatingFromChartRef.current = false;
      });
    }
  }, [
    isTerminal,
    useRiskReward,
    rrSlType,
    fixedSlPrice,
    riskRewardData.entryPrice,
    strategy,
    updateFormData,
    updateRuntime,
  ]);

  // When user drags the TP line in terminal, update reward ratio.
  const lastProcessedTpDragRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isTerminal) return;
    if (!useRiskReward) return;

    const fixedTp = Number.parseFloat(String(fixedTpPrice ?? ''));
    if (!Number.isFinite(fixedTp) || fixedTp <= 0) return;

    const entry = riskRewardData.entryPrice;
    const stop = riskRewardData.stopLossPrice;
    if (entry === null || !Number.isFinite(entry) || entry <= 0) return;
    if (stop === null || !Number.isFinite(stop) || stop <= 0) return;

    const key = `${entry}:${stop}:${fixedTp}`;
    if (lastProcessedTpDragRef.current === key) return;
    lastProcessedTpDragRef.current = key;

    const riskDist = Math.abs(entry - stop);
    const rewardDist = Math.abs(fixedTp - entry);
    if (!(riskDist > 0) || !(rewardDist > 0)) return;

    const ratio = rewardDist / riskDist;
    if (Number.isFinite(ratio) && ratio > 0) {
      isUpdatingFromChartRef.current = true;
      updateFormData('riskUseTpRatio', true);
      updateFormData('riskTpRatio', ratio.toFixed(2));
      // Reset the flag after a microtask to allow the update to propagate
      Promise.resolve().then(() => {
        isUpdatingFromChartRef.current = false;
      });
    }
  }, [
    isTerminal,
    useRiskReward,
    fixedTpPrice,
    riskRewardData.entryPrice,
    riskRewardData.stopLossPrice,
    updateFormData,
  ]);

  // (legacy helper kept) When rrSlFixedValue is changed (e.g. input/picker), keep fixed SL price in sync.
  useEffect(() => {
    if (!isTerminal) return;
    if (!useRiskReward) return;
    if (rrSlType !== RRSlTypeEnum.fixed) return;
    if (isUpdatingFromChartRef.current) return; // Don't update if we're already updating from chart

    const parsed = Number.parseFloat(rrSlFixedValue ?? '');
    if (!Number.isFinite(parsed) || !latestPrice || latestPrice <= 0) return;

    const factor = Math.abs(parsed) / 100;
    const price =
      strategy === StrategyEnum.short
        ? latestPrice * (1 + factor)
        : latestPrice * (1 - factor);
    if (!Number.isFinite(price) || price <= 0) return;

    updateFormData('useSl', true);
    updateFormData('fixedSlPrice', String(price));
    updateFormData('useFixedSLPrices', true);
  }, [
    isTerminal,
    useRiskReward,
    rrSlType,
    rrSlFixedValue,
    latestPrice,
    strategy,
    updateFormData,
  ]);

  React.useEffect(() => {
    const cleanup = () => {
      riskRewardPositionStore.clearPosition(resolvedBotId);
    };

    if (!useRiskReward || hasBlockingErrors) {
      cleanup();
      return cleanup;
    }

    if (!riskRewardData.hasValidData || riskRewardData.riskError) {
      cleanup();
      return cleanup;
    }

    const entryPrice = riskRewardData.entryPrice;
    const stopPrice = riskRewardData.stopLossPrice;
    const profitPrice = computeProfitPrice();

    if (
      !Number.isFinite(entryPrice) ||
      entryPrice === null ||
      entryPrice <= 0 ||
      !Number.isFinite(stopPrice) ||
      stopPrice === null ||
      stopPrice <= 0 ||
      !Number.isFinite(profitPrice) ||
      profitPrice === null ||
      profitPrice <= 0
    ) {
      cleanup();
      return cleanup;
    }

    const positionSize = riskRewardData.positionSize;
    const riskPercentage = Math.abs(riskRewardData.riskPercentage);
    const accountSize = Math.abs(positionSize * leverageMultiplier);

    if (
      !Number.isFinite(positionSize) ||
      positionSize <= 0 ||
      accountSize <= 0
    ) {
      cleanup();
      return cleanup;
    }

    riskRewardPositionStore.setPosition(resolvedBotId, {
      side:
        strategy === StrategyEnum.short
          ? BotOrderSideEnum.sell
          : BotOrderSideEnum.buy,
      entryPrice,
      profitPrice,
      stopPrice,
      risk: Number.isFinite(riskPercentage) ? riskPercentage : 0,
      accountSize,
    });

    return cleanup;
  }, [
    computeProfitPrice,
    strategy,
    useRiskReward,
    hasBlockingErrors,
    leverageMultiplier,
    resolvedBotId,
    riskRewardData.hasValidData,
    riskRewardData.positionSize,
    riskRewardData.riskError,
    riskRewardData.riskPercentage,
    riskRewardData.stopLossPrice,
    riskRewardData.entryPrice,
  ]);

  const handleSliderChange = (field: Fields, value: number) => {
    updateFormData(field, value.toString());
  };

  // Helper function to format numbers for display
  const formatNumber = (value: number | null, decimals = 4): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '--';
    }
    return value.toFixed(decimals);
  };

  // Helper function to format percentage
  const formatPercentage = (value: number | null, decimals = 2): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '--';
    }
    return `${value.toFixed(decimals)}%`;
  };

  const isRRSlTypeIndicator = useMemo(
    () => rrSlType === RRSlTypeEnum.indicator || !rrSlType,
    [rrSlType]
  );

  const isRRSlTypeFixed = useMemo(
    () => rrSlType === RRSlTypeEnum.fixed,
    [rrSlType]
  );

  if (!useRiskReward) {
    return null;
  }

  return (
    <>
      <MasonryLayout
        gap={16}
        containerBreakpoints={{
          default: 1,
          640: 2,
          1024: 3,
        }}
      >
        <SettingsRow
          name="Type of Stop Loss"
          tooltip="Fixed amount or dynamic based on indicator value"
          contentClassName="space-y-sm"
        >
          <QuickInputFormButtons
            buttons={[
              {
                value: RRSlTypeEnum.indicator,
                label: 'Indicator',
                isActive:
                  (rrSlType || RRSlTypeEnum.indicator) ===
                  RRSlTypeEnum.indicator,
              },
              {
                value: RRSlTypeEnum.fixed,
                label: 'Fixed %',
                isActive:
                  (rrSlType || RRSlTypeEnum.indicator) === RRSlTypeEnum.fixed,
              },
            ]}
            onButtonClick={(nextValue) =>
              handleInputChange('rrSlType', nextValue as RRSlTypeEnum)
            }
          />
        </SettingsRow>
        <SettingsRow
          name="Risk type"
          tooltip="Choose whether to risk a percentage of free balance or a fixed amount each deal."
          contentClassName="space-y-sm"
        >
          <QuickInputFormButtons
            buttons={[
              {
                value: RiskSlTypeEnum.perc,
                label: '% from free balance',
                isActive:
                  (riskSlType || RiskSlTypeEnum.perc) === RiskSlTypeEnum.perc,
              },
              {
                value: RiskSlTypeEnum.fixed,
                label: 'Fixed amount',
                isActive:
                  (riskSlType || RiskSlTypeEnum.perc) === RiskSlTypeEnum.fixed,
              },
            ]}
            onButtonClick={(nextValue) =>
              handleInputChange('riskSlType', nextValue as RiskSlTypeEnum)
            }
          />
        </SettingsRow>

        {isRRSlTypeFixed && (
          <SettingsRow
            name="Stop Loss Value"
            colSpan="full"
            contentClassName="space-y-md"
            className="relative"
            navId="rrSlFixedValue"
            alerts={alerts?.rrSlFixedValue ?? []}
          >
            {isRRSlFixedValueBound && (
              <Alert className="space-y-xs border-primary/40 bg-primary/5">
                <AlertTitle>Global variable linked</AlertTitle>
                <AlertDescription className="space-y-xs">
                  <p>
                    Risk adjustments are currently controlled by a global
                    variable. Update the variable from the Global Variables
                    workspace to change these values.
                  </p>
                  <Button variant="link" className="h-auto px-0" asChild>
                    <a
                      href="/global-variables"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Manage global variables
                    </a>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <InputButtonsSlider
              value={
                rrSlFixedValue || (strategy === StrategyEnum.long ? '-1' : '1')
              }
              onChange={(value) => handleInputChange('rrSlFixedValue', value)}
              min={strategy === StrategyEnum.long ? -99 : 0.1}
              max={strategy === StrategyEnum.long ? -0.1 : 99}
              step={0.1}
              precision={2}
              className="w-full"
              showSlider={true}
              sliderMin={strategy === StrategyEnum.long ? -99 : 0.1}
              sliderMax={strategy === StrategyEnum.long ? -0.1 : 99}
              sliderValue={rrSlFixedValueSliderValue}
              onSliderChange={(value) =>
                handleSliderChange('rrSlFixedValue', value)
              }
              presetButtons={[0.5, 1, 2, 5].map((val) => ({
                label: `${strategy === StrategyEnum.long ? '-' : ''}${val}%`,
                value: strategy === StrategyEnum.long ? -val : val,
              }))}
              varBindingPath="rrSlFixedValue"
              varType="float"
              varTooltip="Fixed value"
              onVariableSelected={(variable) =>
                applyVariableToField('rrSlFixedValue', variable)
              }
              onVariableResolved={(variable) =>
                applyVariableToField('rrSlFixedValue', variable)
              }
              isVariableBound={isRRSlFixedValueBound}
              disabled={isRRSlFixedValueBound}
              endAdornment={unitAdornment('%')}
              isInvalid={Boolean(resolvedErrors['rrSlFixedValue'])}
            />

            {/* Terminal-only stop-loss price field (syncs with percentage) */}
            {isTerminal && (
              <div className="mt-2">
                <Label className="text-sm">Stop loss price</Label>
                <NumberInput
                  value={(() => {
                    const parsed = Number.parseFloat(rrSlFixedValue ?? '');
                    if (!Number.isFinite(parsed) || !latestPrice) return '';
                    const factor = Math.abs(parsed) / 100;
                    const price =
                      strategy === StrategyEnum.short
                        ? latestPrice * (1 + factor)
                        : latestPrice * (1 - factor);
                    return price > 0
                      ? price.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')
                      : '';
                  })()}
                  onChange={(value) => {
                    const entered = Number.parseFloat(String(value));
                    if (
                      !Number.isFinite(entered) ||
                      !latestPrice ||
                      latestPrice <= 0
                    ) {
                      return;
                    }
                    const diff =
                      strategy === StrategyEnum.short
                        ? entered - latestPrice
                        : latestPrice - entered;
                    if (diff <= 0) {
                      // invalid stop-loss price (would be wrong side)
                      return;
                    }
                    const percent = Math.abs((diff / latestPrice) * 100);
                    const signed =
                      strategy === StrategyEnum.long ? -percent : percent;
                    handleInputChange(
                      'rrSlFixedValue',
                      formatNumericString(signed, 2)
                    );
                  }}
                  min={0}
                  step={0.00000001}
                  precision={8}
                  placeholder={latestPrice ? latestPrice.toFixed(2) : '0.00'}
                  disabled={isRRSlFixedValueBound}
                  showControls={false}
                  endAdornment={
                    <span className="inline-flex items-center gap-2">
                      {unitAdornment(
                        (() => {
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
                          return strategy === StrategyEnum.short
                            ? (base ?? 'Price')
                            : (quote ?? 'Price');
                        })()
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setActivePickerField?.((prev) =>
                            prev === 'rrSlFixedValue' ? false : 'rrSlFixedValue'
                          )
                        }
                        className={
                          activePickerField === 'rrSlFixedValue'
                            ? 'bg-primary/10 text-primary h-6 w-6'
                            : 'h-6 w-6'
                        }
                        aria-label="Pick price from chart"
                        title="Pick price from chart"
                        disabled={isRRSlFixedValueBound}
                      >
                        <Crosshair className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  }
                />
              </div>
            )}
          </SettingsRow>
        )}
        <SettingsRow
          name="Risk amount"
          tooltip={
            riskSlType === RiskSlTypeEnum.perc
              ? 'Adjust the percentage of your available balance at risk per deal.'
              : 'Specify the absolute amount you are willing to risk on each deal.'
          }
          colSpan="full"
          contentClassName="space-y-md"
          navId="risk-amount"
          alerts={[
            ...(alerts?.riskSlAmountPerc ?? []),
            ...(alerts?.riskSlAmountValue ?? []),
          ]}
        >
          {hasRiskAmountBinding && (
            <Alert className="space-y-xs border-primary/40 bg-primary/5">
              <AlertTitle>Global variable linked</AlertTitle>
              <AlertDescription className="space-y-xs">
                <p>
                  Risk adjustments are currently controlled by a global
                  variable. Update the variable from the Global Variables
                  workspace to change these values.
                </p>
                <Button variant="link" className="h-auto px-0" asChild>
                  <a href="/global-variables" target="_blank" rel="noreferrer">
                    Manage global variables
                  </a>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {riskSlType === RiskSlTypeEnum.perc ? (
            <>
              <InputButtonsSlider
                value={riskSlAmountPerc || '1'}
                onChange={(value) =>
                  handleInputChange('riskSlAmountPerc', value)
                }
                min={1}
                max={99}
                step={0.1}
                precision={2}
                className="w-full"
                showSlider={true}
                sliderValue={riskSlPercSliderValue}
                onSliderChange={(value) =>
                  handleSliderChange('riskSlAmountPerc', value)
                }
                presetButtons={[1, 2, 5, 10].map((val) => ({
                  label: `${val}%`,
                  value: val,
                }))}
                varBindingPath="riskSlAmountPerc"
                varType="float"
                varTooltip="Bind risk % of free balance"
                onVariableSelected={(variable) =>
                  applyVariableToField('riskSlAmountPerc', variable)
                }
                onVariableResolved={(variable) =>
                  applyVariableToField('riskSlAmountPerc', variable)
                }
                isVariableBound={isRiskSlPercBound}
                disabled={isRiskSlPercBound}
                endAdornment={unitAdornment('%')}
                isInvalid={Boolean(resolvedErrors['riskSlAmountPerc'])}
              />
            </>
          ) : (
            <>
              <InputButtonsSlider
                value={riskSlAmountValue || '0'}
                onChange={(value) =>
                  handleInputChange('riskSlAmountValue', value)
                }
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                step={0.01}
                precision={2}
                className="w-full"
                showSlider={false}
                presetButtons={[]}
                varBindingPath="riskSlAmountValue"
                varType="float"
                varTooltip="Bind fixed risk amount"
                onVariableSelected={(variable) =>
                  applyVariableToField('riskSlAmountValue', variable)
                }
                onVariableResolved={(variable) =>
                  applyVariableToField('riskSlAmountValue', variable)
                }
                isVariableBound={isRiskSlValueBound}
                disabled={isRiskSlValueBound}
                endAdornment={
                  <>
                    <Tooltip tooltip="Copy fixed amount">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          handleInputChange(
                            'riskSlAmountValue',
                            riskSlAmountValue || '0'
                          )
                        }
                      >
                        Reapply
                      </Button>
                    </Tooltip>
                    {unitAdornment(assetLabel, { size: 'xs' })}
                  </>
                }
                isInvalid={Boolean(resolvedErrors['riskSlAmountValue'])}
              />
            </>
          )}
        </SettingsRow>

        <SettingsRow
          name="Reward ratio"
          tooltip="Calculate take profit levels relative to the risk amount. A 1:2 ratio means TP is 2x the SL distance."
          headerAlign="center"
          contentClassName="space-y-sm"
          navId="riskTpRatio"
          alerts={alerts?.riskTpRatio ?? []}
        >
          {isRiskTpRatioBound && (
            <Alert className="border-primary/40 bg-primary/5">
              <AlertDescription>
                This reward ratio is synced from a global variable.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-xs items-center">
            <FieldVariableBinding
              path="riskTpRatio"
              varType="float"
              tooltip="Bind reward ratio target"
              variant="inline"
              className="flex-1"
              disabled={isRiskTpRatioBound}
              onVariableSelected={(variable) =>
                applyVariableToField('riskTpRatio', variable)
              }
              onVariableResolved={(variable) =>
                applyVariableToField('riskTpRatio', variable)
              }
            >
              <NumberInput
                value={riskTpRatio || '2'}
                onChange={(value) => handleInputChange('riskTpRatio', value)}
                className="w-full"
                showControls={false}
                step={0.1}
                precision={1}
                min={0.1}
                disabled={isRiskTpRatioBound}
              />
            </FieldVariableBinding>
            {!isRiskTpRatioBound && (
              <QuickInputFormButtons
                buttons={[
                  { value: '2', label: '1:2', isActive: riskTpRatio === '2' },
                  { value: '3', label: '1:3', isActive: riskTpRatio === '3' },
                  { value: '5', label: '1:5', isActive: riskTpRatio === '5' },
                ]}
                onButtonClick={(nextValue) =>
                  handleInputChange('riskTpRatio', nextValue)
                }
              />
            )}
          </div>
        </SettingsRow>

        {isRRSlTypeIndicator && (
          <SettingsRow
            name="Risk indicators"
            tooltip="Attach chart indicators that define when risk thresholds are breached."
            trailing={
              <IndicatorActionsToolbar
                onAddIndicator={handleAddIndicator}
                addIndicatorDisabled={riskIndicatorsAtLimit}
                addIndicatorTooltip={addRiskIndicatorTooltip}
                addIndicatorVariant="outline"
              />
            }
            colSpan="full"
            contentClassName="space-y-md"
          >
            <IndicatorList
              indicators={riskIndicators}
              onRemove={handleRemoveIndicator}
              onSelectType={handleSelectIndicatorType}
              renderExtras={(indicator) => {
                try {
                  const definition = getIndicatorDefinition(
                    indicator.type as IndicatorEnum
                  );
                  const defaults = getIndicatorDefaultParams(
                    definition.type,
                    IndicatorAction.riskReward
                  );
                  const params: IndicatorParamsState = {
                    ...defaults,
                    ...((indicator ?? {}) as IndicatorParamsState),
                  };

                  return (
                    <InlineIndicatorConfig
                      definition={definition}
                      params={params}
                      indicatorUuid={indicator.uuid}
                      exchange={currentExchange?.provider}
                      onChange={(next) =>
                        handleChangeIndicatorParams(indicator.uuid, next)
                      }
                      className="space-y-sm"
                    />
                  );
                } catch (_error) {
                  return (
                    <div className="rounded-md border border-border/60 bg-destructive/10 p-sm text-sm text-destructive">
                      Selected indicator definition is unavailable.
                    </div>
                  );
                }
              }}
              emptyState="No indicators configured. Add at least one indicator to enable Risk:Reward management."
            />
          </SettingsRow>
        )}

        {!isTerminal && (
          <SettingsRow
            name="Stop-loss guardrails"
            tooltip="Apply bounds that the automation must respect when placing stop-loss orders."
            colSpan="full"
            contentClassName="grid gap-md @[500px]:grid-cols-2"
            navId="risk-sl-range"
            alerts={[
              ...(alerts?.riskMinSl ?? []),
              ...(alerts?.riskMaxSl ?? []),
            ]}
          >
            <div className="space-y-xs">
              <FieldVariableBinding
                path="riskMinSl"
                varType="float"
                tooltip="Bind min SL %"
                variant="inline"
                disabled={isRiskMinSlBound}
                onVariableSelected={(variable) =>
                  applyVariableToField('riskMinSl', variable)
                }
                onVariableResolved={(variable) =>
                  applyVariableToField('riskMinSl', variable)
                }
              >
                <NumberInput
                  value={
                    riskMinSl !== undefined && riskMinSl !== null
                      ? riskMinSl
                      : riskSlType === 'perc'
                        ? (parseFloat(riskSlAmountPerc || '0') * -1).toString()
                        : ''
                  }
                  onChange={(value) => handleInputChange('riskMinSl', value)}
                  className="w-full"
                  showControls={false}
                  disabled={isRiskMinSlBound}
                  endAdornment={unitAdornment('%')}
                />
              </FieldVariableBinding>
            </div>
            <div className="space-y-xs">
              <FieldVariableBinding
                path="riskMaxSl"
                varType="float"
                tooltip="Bind max SL %"
                variant="inline"
                disabled={isRiskMaxSlBound}
                onVariableSelected={(variable) =>
                  applyVariableToField('riskMaxSl', variable)
                }
                onVariableResolved={(variable) =>
                  applyVariableToField('riskMaxSl', variable)
                }
              >
                <NumberInput
                  value={
                    riskMaxSl !== undefined && riskMaxSl !== null
                      ? riskMaxSl
                      : '-100'
                  }
                  onChange={(value) => handleInputChange('riskMaxSl', value)}
                  className="w-full"
                  showControls={false}
                  disabled={isRiskMaxSlBound}
                  endAdornment={unitAdornment('%')}
                />
              </FieldVariableBinding>
            </div>
          </SettingsRow>
        )}

        {formType === BotTypesEnum.dca && (
          <SettingsRow
            name="Position size limits"
            tooltip="Restrict the automation to a position size range for each deal."
            colSpan="full"
            contentClassName="space-y-md"
            navId="position-size-limits"
            alerts={[
              ...(alerts?.riskMinPositionSize ?? []),
              ...(alerts?.riskMaxPositionSize ?? []),
            ]}
          >
            {hasPositionSizeBinding && (
              <Alert className="border-primary/40 bg-primary/5">
                <AlertDescription>
                  Position size limits are linked to global variables.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-md @[500px]:grid-cols-2">
              <div className="space-y-xs">
                <FieldVariableBinding
                  path="riskMinPositionSize"
                  varType="float"
                  tooltip="Bind min position size"
                  variant="inline"
                  disabled={isRiskMinPositionBound}
                  onVariableSelected={(variable) =>
                    applyVariableToField('riskMinPositionSize', variable)
                  }
                  onVariableResolved={(variable) =>
                    applyVariableToField('riskMinPositionSize', variable)
                  }
                >
                  <NumberInput
                    value={riskMinPositionSize || '0'}
                    onChange={(value) =>
                      handleInputChange('riskMinPositionSize', value)
                    }
                    className="w-full"
                    showControls={false}
                    disabled={isRiskMinPositionBound}
                    endAdornment={unitAdornment(assetLabel, { size: 'xs' })}
                  />
                </FieldVariableBinding>
              </div>
              <div className="space-y-xs">
                <FieldVariableBinding
                  path="riskMaxPositionSize"
                  varType="float"
                  tooltip="Bind max position size"
                  variant="inline"
                  disabled={isRiskMaxPositionBound}
                  onVariableSelected={(variable) =>
                    applyVariableToField('riskMaxPositionSize', variable)
                  }
                  onVariableResolved={(variable) =>
                    applyVariableToField('riskMaxPositionSize', variable)
                  }
                >
                  <NumberInput
                    value={riskMaxPositionSize || '-1'}
                    onChange={(value) =>
                      handleInputChange('riskMaxPositionSize', value)
                    }
                    className="w-full"
                    showControls={false}
                    disabled={isRiskMaxPositionBound}
                    endAdornment={unitAdornment(assetLabel, { size: 'xs' })}
                  />
                </FieldVariableBinding>
              </div>
            </div>
          </SettingsRow>
        )}

        <SettingsRow
          name="Position info"
          description="Live calculations generated from your risk configuration."
          colSpan="full"
          contentClassName="space-y-sm"
        >
          {typeof riskRewardData.entryPrice === 'number' &&
          riskRewardData.entryPrice > 0 ? (
            <div className="rounded-md bg-muted p-sm text-sm text-muted-foreground">
              Current price: {formatNumber(riskRewardData.entryPrice)}
              <br />
              SL price: {formatNumber(riskRewardData.stopLossPrice)}
              <br />
              SL %: {formatPercentage(riskRewardData.riskPercentage)}
              <br />
              Available balance: {formatNumber(riskRewardData.availableBalance)}
              <br />
              Position size: {formatNumber(riskRewardData.positionSize)}
              <br />
              Risk size: {formatNumber(riskRewardData.riskAmount)}
              <br />
              TP price: {formatNumber(riskRewardData.takeProfitPrice)}
              <br />
              TP %: {formatPercentage(riskRewardData.rewardPercentage)}
              <br />
              Reward size: {formatNumber(riskRewardData.rewardAmount)}
              <br />
              Reward ratio: {formatNumber(riskRewardData.riskRewardRatio, 2)}
            </div>
          ) : (
            <Alert className="border-border bg-muted/60">
              <AlertTitle>Position info unavailable</AlertTitle>
              <AlertDescription>
                Configure {isRRSlTypeFixed ? 'stop loss' : 'indicators'} and
                ensure price data is available to view live risk metrics.
              </AlertDescription>
            </Alert>
          )}
          {riskRewardData.validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Risk validation issues</AlertTitle>
              <AlertDescription className="space-y-1">
                {riskRewardData.validationErrors.map((error, index) => (
                  <p key={index}>{error}</p>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </SettingsRow>
      </MasonryLayout>
      {selector}
    </>
  );
};
