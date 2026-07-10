import CoinIcon from '@/components/widgets/shared/CoinIcon';
import { resolveOrderSizeIconSymbol } from '@/utils/bots/dca/order-size-icon';
import {
  useBotFormFieldLock,
  useBotFormSelector,
  useBotFormState,
  type Fields,
} from '@/features/bots';
import {
  aggregatePrecisionConstraints,
  computeStepDecimals,
  createOrderGuard,
  formatNumberWithTrim,
  PERCENTAGE_GUARD,
  type PrecisionGuard,
} from '@/features/bots/shared/utils/order-guard';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { useHedgeBotFormOptional } from '@/contexts/bots/form/HedgeBotFormProvider';
import {
  resolveBaseOrderContext,
  useDcaTradingContext,
} from '@/hooks/bots/dca/useDcaTradingContext';
import useBotVarBinding from '@/hooks/bots/global-variables/useBotVarBinding';
import { useGraphQL } from '@/hooks/useGraphQL';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { useUIStore } from '@/stores/uiStore';
import {
  BotMarginTypeEnum,
  ENTER_MARKET_TIMEOUT_GUARD,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  StrategyEnum,
  type LeverageBracket,
} from '@/types';
import type { GlobalVariable } from '@/types/globalVariables';
import { math } from '@/utils/math';
import {
  computeMaxAmount,
  computeMaxTotal,
} from '@/utils/bots/dca/order-size-maxes';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type StrategySettingsProps } from '../sections';
import { useBalanceRefreshControl } from './useBalanceRefreshControl';

interface ClampResult {
  value: number;
  formatted: string;
  minAdjusted: boolean;
  maxAdjusted: boolean;
}

const clampWithGuard = (value: number, guard: PrecisionGuard): ClampResult => {
  let nextValue = value;
  let minAdjusted = false;
  let maxAdjusted = false;

  if (typeof guard.min === 'number' && guard.min > 0 && nextValue < guard.min) {
    nextValue = guard.min;
    minAdjusted = true;
  }

  if (typeof guard.max === 'number' && nextValue > guard.max) {
    nextValue = guard.max;
    maxAdjusted = true;
  }

  if (typeof guard.step === 'number' && guard.step > 0) {
    const decimals = guard.decimals ?? computeStepDecimals(guard.step) ?? 8;
    nextValue = Number(
      (Math.round(nextValue / guard.step) * guard.step).toFixed(decimals)
    );
  }

  const decimals =
    guard.decimals ?? computeStepDecimals(guard.step) ?? undefined;
  const formatted = formatNumberWithTrim(nextValue, decimals);

  return {
    value: nextValue,
    formatted,
    minAdjusted,
    maxAdjusted,
  };
};

const formatWithUnit = (value: string, unit?: string): string => {
  if (!unit) {
    return value;
  }
  if (unit === '%') {
    return `${value}${unit}`;
  }
  return `${value} ${unit}`;
};

const getAdjustmentMessage = (
  guard: PrecisionGuard,
  result: ClampResult
): string | undefined => {
  const formattedValue = formatWithUnit(result.formatted, guard.unit);

  if (result.minAdjusted) {
    return guard.label
      ? `Variable value was below the ${guard.label}. Adjusted to ${formattedValue}.`
      : `Variable value was below the allowed minimum. Adjusted to ${formattedValue}.`;
  }

  if (result.maxAdjusted) {
    return guard.label
      ? `Variable value exceeded the ${guard.label}. Adjusted to ${formattedValue}.`
      : `Variable value exceeded the allowed maximum. Adjusted to ${formattedValue}.`;
  }

  return undefined;
};

export const useStrategySettingsTab = ({
  formData,
  updateFormData,
  bot,
  onUpdateBalances,
}: StrategySettingsProps) => {
  const { exchanges } = useBotFormQuery();
  const { setErrors: setFormErrors, mode } = useBotFormState();
  const isFieldLocked = useBotFormFieldLock();
  // The hedge edit page mounts each leg's strategy settings inside an
  // outer HedgeBotFormProvider; when present, the leg's direction is
  // implied by which tab the user picked (Long / Short) so we hide the
  // Direction picker entirely.
  const isHedgeContext = useHedgeBotFormOptional() !== undefined;

  const resolvedExchangeUuid = useMemo(() => {
    const formExchange =
      typeof formData.exchangeUUID === 'string'
        ? formData.exchangeUUID.trim()
        : '';

    if (formExchange && Array.isArray(exchanges) && exchanges.length > 0) {
      const directMatch = exchanges.find(
        (exchange) => exchange.uuid === formExchange
      );
      if (directMatch) {
        return directMatch.uuid;
      }

      const normalized = formExchange.toLowerCase();
      const flexibleMatch = exchanges.find((exchange) => {
        const provider = exchange.provider?.toLowerCase?.();
        const name = exchange.name?.toLowerCase?.();
        return provider === normalized || name === normalized;
      });

      if (flexibleMatch) {
        return flexibleMatch.uuid;
      }
    }

    if (bot?.exchangeUUID) {
      return bot.exchangeUUID;
    }

    return null;
  }, [bot?.exchangeUUID, exchanges, formData.exchangeUUID]);

  const updateFieldError = useCallback(
    (field: Fields, message?: string) => {
      setFormErrors((previous) => {
        if (!message) {
          if (!(field in previous)) {
            return previous;
          }
          const { [field]: _removed, ...rest } = previous;
          return rest;
        }

        if (previous[field] === message) {
          return previous;
        }

        return {
          ...previous,
          [field]: message,
        };
      });
    },
    [setFormErrors]
  );

  const applyGuardedValue = useCallback(
    (
      field: Fields,
      rawValue: string | number | null | undefined,
      guard: PrecisionGuard | null,
      currentValue: string | number | undefined,
      options?: { variableName?: string; allowZero?: boolean }
    ): number | null => {
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        if (options?.variableName) {
          updateFieldError(
            field,
            `Variable "${options.variableName}" has no value.`
          );
        }
        return null;
      }

      const numeric =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numeric)) {
        if (options?.variableName) {
          updateFieldError(
            field,
            `Variable "${options.variableName}" must resolve to a number.`
          );
        } else {
          updateFieldError(field, 'Value must resolve to a number.');
        }
        return null;
      }

      if (numeric === 0 && options?.allowZero === false) {
        if (options?.variableName) {
          updateFieldError(
            field,
            `Variable "${options.variableName}" resolved to 0, which is not allowed.`
          );
        } else {
          updateFieldError(field, 'Value must be greater than 0.');
        }
        return null;
      }

      if (!guard) {
        const nextValue = numeric.toString();
        if (currentValue !== nextValue) {
          updateFormData(field, nextValue as never);
        }
        updateFieldError(field);
        return numeric;
      }

      const clamped = clampWithGuard(numeric, guard);
      const formatted = clamped.formatted;
      if (currentValue !== formatted) {
        updateFormData(field, formatted as never);
      }

      const adjustment = getAdjustmentMessage(guard, clamped);
      if (adjustment) {
        updateFieldError(field, adjustment);
      } else {
        updateFieldError(field);
      }

      return clamped.value;
    },
    [updateFormData, updateFieldError]
  );

  const tradingContext = useDcaTradingContext(
    formData,
    bot !== undefined ? { bot: bot ?? null } : undefined
  );
  const { canTriggerBalanceRefresh, handleRefreshBalances } =
    useBalanceRefreshControl({
      formData,
      ...(typeof onUpdateBalances === 'function' ? { onUpdateBalances } : {}),
    });
  const { isBound: isBaseOrderVarBound } = useBotVarBinding('baseOrderSize');
  const [baseOrderVariable, setBaseOrderVariable] =
    useState<GlobalVariable | null>(null);
  const { isBound: isRiskReductionVarBound } =
    useBotVarBinding('riskReductionValue');
  const [riskReductionVariable, setRiskReductionVariable] =
    useState<GlobalVariable | null>(null);
  const {
    isBound: isEnterMarketTimeoutVarBound,
    unbindVariable: unbindEnterMarketTimeoutVariable,
  } = useBotVarBinding('limitTimeout');
  const [enterMarketTimeoutVariable, setEnterMarketTimeoutVariable] =
    useState<GlobalVariable | null>(null);
  const { isBound: isReinvestVarBound } = useBotVarBinding('reinvestValue');
  const [reinvestVariable, setReinvestVariable] =
    useState<GlobalVariable | null>(null);

  const {
    baseAsset: resolvedBaseAsset,
    quoteAsset: resolvedQuoteAsset,
    aggregatedBalances,
    latestPrice,
    selectedPairs,
    usdPrice,
    quoteMinAmount,
    provider,
    fee,
  } = tradingContext;

  const isLiveTrading = useUIStore((state) => state.isLiveTrading);
  const isPaperTrading = !isLiveTrading;
  const futures = useBotFormSelector('futures');
  const terminalDealType = useBotFormSelector('terminalDealType');
  const leverage = useBotFormSelector('leverage');
  const orderSizeType = useBotFormSelector('orderSizeType');
  const startOrderType = useBotFormSelector('startOrderType');
  const notUseLimitReposition = useBotFormSelector('notUseLimitReposition');
  const limitTimeout = useBotFormSelector('limitTimeout');
  const marginType = useBotFormSelector('marginType');
  const baseOrderSize = useBotFormSelector('baseOrderSize');
  const riskReductionValue = useBotFormSelector('riskReductionValue');
  const useLimitTimeout = useBotFormSelector('useLimitTimeout');
  const reinvestValue = useBotFormSelector('reinvestValue');
  const useRiskReduction = useBotFormSelector('useRiskReduction');
  const strategy = useBotFormSelector('strategy');
  const profitCurrency = useBotFormSelector('profitCurrency');
  const useRiskReward = useBotFormSelector('useRiskReward');
  const useReinvest = useBotFormSelector('useReinvest');
  const useMulti = useBotFormSelector('useMulti');
  const coinm = useBotFormSelector('coinm');
  const futuresEnabled = Boolean(futures);
  const isComboBot = formData.type === 'combo';

  const shouldFetchLeverage = useMemo(
    () => futuresEnabled && !isPaperTrading && Boolean(resolvedExchangeUuid),
    [futuresEnabled, isPaperTrading, resolvedExchangeUuid]
  );

  const leverageQueryInput = useMemo(
    () => botQueries.getLeverageBracket({ uuid: resolvedExchangeUuid ?? '' }),
    [resolvedExchangeUuid]
  );

  const leverageQuery = useGraphQL<LeverageBracket[]>(
    'getLeverageBracket',
    leverageQueryInput,
    {
      enabled: shouldFetchLeverage && Boolean(resolvedExchangeUuid),
      staleTime: 5 * 60 * 1000,
    }
  );

  const leverageFetchState = useMemo(() => {
    if (!shouldFetchLeverage) {
      return { brackets: [] as LeverageBracket[], isLoading: false };
    }

    const response = leverageQuery.data;
    const brackets =
      response?.status === 'OK' && Array.isArray(response.data)
        ? response.data
        : ([] as LeverageBracket[]);

    const errorMessage =
      response?.status === 'NOTOK'
        ? (response.reason ?? 'Failed to fetch leverage brackets.')
        : (leverageQuery.error?.message ?? null);

    return {
      brackets,
      isLoading: leverageQuery.isLoading || leverageQuery.isFetching,
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  }, [
    leverageQuery.data,
    leverageQuery.error,
    leverageQuery.isFetching,
    leverageQuery.isLoading,
    shouldFetchLeverage,
  ]);

  const leverageCapsBySymbol = useMemo(() => {
    if (!leverageFetchState.brackets.length) {
      return null;
    }

    const symbolMap = new Map<string, number>();

    leverageFetchState.brackets.forEach((bracket) => {
      if (!bracket?.symbol) {
        return;
      }

      const symbolKey = bracket.symbol.toUpperCase();
      if (!Number.isFinite(bracket.leverage) || bracket.leverage <= 0) {
        return;
      }

      const existing = symbolMap.get(symbolKey);
      if (typeof existing === 'number') {
        symbolMap.set(symbolKey, Math.min(existing, bracket.leverage));
      } else {
        symbolMap.set(symbolKey, bracket.leverage);
      }
    });

    return symbolMap;
  }, [leverageFetchState.brackets]);

  const crossSupportedByPairs = useMemo(() => {
    if (!selectedPairs || selectedPairs.length === 0) {
      return true;
    }

    return selectedPairs.every((pair) => pair.crossAvailable !== false);
  }, [selectedPairs]);

  const availableMarginTypes = useMemo(() => {
    const types: Array<BotMarginTypeEnum> = [BotMarginTypeEnum.isolated];

    if (crossSupportedByPairs && !isPaperTrading) {
      types.push(BotMarginTypeEnum.cross);
    }

    return types;
  }, [crossSupportedByPairs, isPaperTrading]);

  const rawMaxLeverage = useMemo(() => {
    if (!futuresEnabled) {
      return 1;
    }

    if (!selectedPairs || selectedPairs.length === 0) {
      return 125;
    }

    const leverageCaps = selectedPairs
      .map((pair) => {
        const symbol = pair?.pair?.toUpperCase?.();

        if (symbol && leverageCapsBySymbol?.has(symbol)) {
          const bracketCap = leverageCapsBySymbol.get(symbol);
          if (
            typeof bracketCap === 'number' &&
            Number.isFinite(bracketCap) &&
            bracketCap > 0
          ) {
            return bracketCap;
          }
        }

        const candidate = (pair as { maxLeverage?: number }).maxLeverage;
        return typeof candidate === 'number' &&
          Number.isFinite(candidate) &&
          candidate > 0
          ? candidate
          : null;
      })
      .filter((value): value is number => value !== null);

    if (leverageCaps.length > 0) {
      return Math.min(...leverageCaps);
    }

    return 125;
  }, [futuresEnabled, leverageCapsBySymbol, selectedPairs]);

  const maxLeverage = useMemo(
    () => Math.max(1, rawMaxLeverage),
    [rawMaxLeverage]
  );

  const normalizedLeverage = useMemo(() => {
    const parsed = Number(leverage);
    if (!Number.isFinite(parsed)) {
      return 1;
    }

    const rounded = Math.round(parsed);
    return Math.min(Math.max(rounded, 1), maxLeverage);
  }, [leverage, maxLeverage]);

  const isPercentageReference = useMemo(
    () => orderSizeType === 'percTotal' || orderSizeType === 'percFree',
    [orderSizeType]
  );

  const isCostReference = useMemo(
    () =>
      futuresEnabled &&
      !isPercentageReference &&
      formData.orderSizeReference === 'cost',
    [futuresEnabled, isPercentageReference, formData.orderSizeReference]
  );

  const convertNotionalToDisplay = useCallback(
    (value: number): number => {
      if (!Number.isFinite(value)) {
        return 0;
      }

      if (!isCostReference) {
        return value;
      }

      const leverage = normalizedLeverage > 0 ? normalizedLeverage : 1;
      return value / leverage;
    },
    [isCostReference, normalizedLeverage]
  );

  const convertDisplayToNotional = useCallback(
    (value: number): number => {
      if (!Number.isFinite(value)) {
        return value;
      }

      if (!isCostReference) {
        return value;
      }

      const leverage = normalizedLeverage > 0 ? normalizedLeverage : 1;
      return value * leverage;
    },
    [isCostReference, normalizedLeverage]
  );

  const showMarginControls = futuresEnabled;

  const handleBaseOrderTypeChange = useCallback(
    (value: OrderTypeEnum) => {
      if (startOrderType === value) {
        return;
      }

      updateFormData('startOrderType', value);

      if (value === OrderTypeEnum.market) {
        if (notUseLimitReposition) {
          updateFormData('notUseLimitReposition', false);
        }

        if (limitTimeout !== '0') {
          if (isEnterMarketTimeoutVarBound) {
            unbindEnterMarketTimeoutVariable();
          }
          updateFormData('limitTimeout', '0');
        }
      } else if (limitTimeout === '0' || limitTimeout === '') {
        updateFormData('limitTimeout', '20');
      }
    },
    [
      startOrderType,
      notUseLimitReposition,
      limitTimeout,
      isEnterMarketTimeoutVarBound,
      unbindEnterMarketTimeoutVariable,
      updateFormData,
    ]
  );

  const isEditMode = mode === 'edit';
  const activeDealsCount = bot?.dealsInBot?.active ?? 0;
  const isExistingBot = isEditMode && Boolean(bot);

  const marginControlsLocked = useMemo(
    () =>
      showMarginControls &&
      (isFieldLocked('marginType') ||
        isFieldLocked('leverage') ||
        activeDealsCount > 0),
    [activeDealsCount, isFieldLocked, showMarginControls]
  );

  const [leverageInputValue, setLeverageInputValue] = useState<string>(() =>
    String(normalizedLeverage)
  );

  const leverageExceedsMax = useMemo(() => {
    const parsed = Number(leverageInputValue);
    return Number.isFinite(parsed) && parsed > maxLeverage;
  }, [leverageInputValue, maxLeverage]);

  const marginNotices = useMemo(() => {
    if (!showMarginControls) {
      return [] as string[];
    }

    const notices: string[] = [];

    if (isPaperTrading) {
      notices.push('Cross margin is not available while paper trading.');
    }

    if (!crossSupportedByPairs) {
      notices.push('Cross margin type is not available for selected symbols.');
    }

    if (shouldFetchLeverage && leverageFetchState.isLoading) {
      notices.push('Fetching leverage limits from your exchange…');
    }

    if (shouldFetchLeverage && leverageFetchState.error) {
      notices.push(leverageFetchState.error);
    }

    if (leverageExceedsMax) {
      notices.push(
        `Leverage cannot be higher than ${maxLeverage}x for the selected symbols.`
      );
    }

    if (marginControlsLocked) {
      notices.push(
        activeDealsCount > 0
          ? 'Margin settings are locked while the bot has active deals.'
          : 'Margin settings are currently locked by your configuration.'
      );
    }

    return notices;
  }, [
    showMarginControls,
    isPaperTrading,
    crossSupportedByPairs,
    shouldFetchLeverage,
    leverageFetchState.error,
    leverageFetchState.isLoading,
    leverageExceedsMax,
    maxLeverage,
    marginControlsLocked,
    activeDealsCount,
  ]);

  const leverageControlsDisabled = useMemo(
    () =>
      marginControlsLocked ||
      (shouldFetchLeverage && leverageFetchState.isLoading),
    [marginControlsLocked, shouldFetchLeverage, leverageFetchState.isLoading]
  );

  useEffect(() => {
    setLeverageInputValue(String(normalizedLeverage));
  }, [normalizedLeverage]);

  useEffect(() => {
    if (!futuresEnabled) {
      if (marginType !== BotMarginTypeEnum.isolated) {
        updateFormData('marginType', BotMarginTypeEnum.isolated);
      }
      if (leverage !== 1) {
        updateFormData('leverage', 1);
      }
      return;
    }

    if (
      !availableMarginTypes.includes(marginType ?? BotMarginTypeEnum.isolated)
    ) {
      updateFormData('marginType', BotMarginTypeEnum.isolated);
    }
  }, [
    futuresEnabled,
    availableMarginTypes,
    marginType,
    leverage,
    updateFormData,
  ]);

  useEffect(() => {
    if (!futuresEnabled) {
      return;
    }

    if (leverage !== normalizedLeverage) {
      updateFormData('leverage', normalizedLeverage);
    }
  }, [futuresEnabled, leverage, normalizedLeverage, updateFormData]);

  useEffect(() => {
    const validReferences: Array<
      'base' | 'quote' | 'percTotal' | 'percFree' | 'usd'
    > = ['base', 'quote', 'percTotal', 'percFree', 'usd'];

    if (!validReferences.includes(orderSizeType)) {
      return;
    }

    if (orderSizeType !== orderSizeType) {
      updateFormData('orderSizeType', orderSizeType);
    }
  }, [orderSizeType, updateFormData]);

  const handleMarginTypeChange = useCallback(
    (next: BotMarginTypeEnum) => {
      if (marginControlsLocked) {
        return;
      }

      updateFormData('marginType', next);
    },
    [marginControlsLocked, updateFormData]
  );

  const handleLeverageChange = useCallback(
    (value: number) => {
      if (leverageControlsDisabled) {
        return;
      }

      if (!Number.isFinite(value)) {
        return;
      }

      const clamped = Math.min(Math.max(Math.round(value), 1), maxLeverage);
      setLeverageInputValue(String(clamped));
      updateFormData('leverage', clamped);
    },
    [leverageControlsDisabled, maxLeverage, updateFormData]
  );

  const handleLeverageInputChange = useCallback(
    (value: number | string) => {
      if (leverageControlsDisabled) {
        return;
      }

      if (typeof value === 'number') {
        const clamped = Math.min(Math.max(Math.round(value), 1), maxLeverage);
        setLeverageInputValue(String(clamped));
        updateFormData('leverage', clamped);
        return;
      }

      setLeverageInputValue(value);
    },
    [leverageControlsDisabled, maxLeverage, updateFormData]
  );

  const handleLeverageInputBlur = useCallback(() => {
    if (leverageControlsDisabled) {
      return;
    }

    const parsed = Number(leverageInputValue);
    if (!Number.isFinite(parsed)) {
      setLeverageInputValue(String(normalizedLeverage));
      return;
    }

    const clamped = Math.min(Math.max(Math.round(parsed), 1), maxLeverage);
    setLeverageInputValue(String(clamped));
    updateFormData('leverage', clamped);
  }, [
    leverageControlsDisabled,
    leverageInputValue,
    normalizedLeverage,
    maxLeverage,
    updateFormData,
  ]);

  const baseOrderDisplayValue = useMemo(() => {
    if (isBaseOrderVarBound && baseOrderVariable?.value !== undefined) {
      const parsed = Number(baseOrderVariable.value);
      if (Number.isFinite(parsed)) {
        return convertNotionalToDisplay(parsed);
      }
    }
    const parsed = Number(baseOrderSize);
    if (Number.isFinite(parsed)) {
      return convertNotionalToDisplay(parsed);
    }
    return 0;
  }, [
    isBaseOrderVarBound,
    baseOrderVariable?.value,
    baseOrderSize,
    convertNotionalToDisplay,
  ]);

  const riskReductionDisplayValue = useMemo(() => {
    if (isRiskReductionVarBound && riskReductionVariable?.value !== undefined) {
      return riskReductionVariable.value;
    }
    return riskReductionValue ?? '10';
  }, [
    isRiskReductionVarBound,
    riskReductionVariable?.value,
    riskReductionValue,
  ]);

  const riskReductionSliderValue = useMemo(() => {
    const parsed = Number(riskReductionDisplayValue);
    return Number.isFinite(parsed) ? parsed : 10;
  }, [riskReductionDisplayValue]);

  const enterMarketTimeoutDisplayValue = useMemo(() => {
    if (
      isEnterMarketTimeoutVarBound &&
      enterMarketTimeoutVariable?.value !== undefined
    ) {
      return enterMarketTimeoutVariable.value;
    }
    return limitTimeout ?? '20';
  }, [
    isEnterMarketTimeoutVarBound,
    enterMarketTimeoutVariable?.value,
    limitTimeout,
  ]);

  const isEnterMarketTimeoutEnabled = useMemo(
    () => !!useLimitTimeout,
    [useLimitTimeout]
  );

  const reinvestDisplayValue = useMemo(() => {
    if (isReinvestVarBound && reinvestVariable?.value !== undefined) {
      return reinvestVariable.value;
    }
    return reinvestValue ?? '50';
  }, [isReinvestVarBound, reinvestVariable?.value, reinvestValue]);

  const reinvestSliderValue = useMemo(() => {
    const parsed = Number(reinvestDisplayValue);
    return Number.isFinite(parsed) ? parsed : 50;
  }, [reinvestDisplayValue]);

  const isRiskReductionEnabled = useMemo(
    () => !!useRiskReduction,
    [useRiskReduction]
  );

  const isLimitOrder = useMemo(
    () => startOrderType === OrderTypeEnum.limit,
    [startOrderType]
  );

  const supportsRiskReduction = useMemo(() => {
    const reference = orderSizeType;
    const hasEligibleReference = reference === 'base' || reference === 'quote';

    if (!hasEligibleReference) {
      return false;
    }

    if (futures) {
      return true;
    }

    const isLongQuote =
      strategy === StrategyEnum.long && profitCurrency === 'quote';
    const isShortBase =
      strategy === StrategyEnum.short && profitCurrency === 'base';

    return isLongQuote || isShortBase;
  }, [orderSizeType, strategy, futures, profitCurrency]);

  const showBaseOrderSection = /* !isComboBot && */ !useRiskReward;

  useEffect(() => {
    if (!supportsRiskReduction) {
      if (riskReductionValue !== '0') {
        updateFormData('riskReductionValue', '0');
      }
      if (useReinvest) {
        updateFormData('useReinvest', false);
      }
    }
  }, [supportsRiskReduction, riskReductionValue, useReinvest, updateFormData]);

  const riskReductionDisabledReason = useMemo(() => {
    if (supportsRiskReduction) {
      return null;
    }

    const reference = orderSizeType;
    if (reference !== 'base' && reference !== 'quote') {
      return 'Risk reduction is only available when using base or quote currency as order size reference.';
    }

    if (futures) {
      return null;
    }

    const isLongQuote =
      strategy === StrategyEnum.long && profitCurrency === 'quote';
    const isShortBase =
      strategy === StrategyEnum.short && profitCurrency === 'base';

    if (!isLongQuote && !isShortBase) {
      return 'Risk reduction is only available for long bots with quote profit currency or short bots with base profit currency.';
    }

    return null;
  }, [supportsRiskReduction, orderSizeType, futures, strategy, profitCurrency]);

  const reinvestDisabledReason = useMemo(() => {
    if (supportsRiskReduction) {
      return null;
    }

    const reference = orderSizeType;
    if (reference !== 'base' && reference !== 'quote') {
      return 'Reinvest is only available when using base or quote currency as order size reference.';
    }

    if (futures) {
      return null;
    }

    const isLongQuote =
      strategy === StrategyEnum.long && profitCurrency === 'quote';
    const isShortBase =
      strategy === StrategyEnum.short && profitCurrency === 'base';

    if (!isLongQuote && !isShortBase) {
      return 'Reinvest profit is only available for long bots with quote profit currency or short bots with base profit currency.';
    }

    return null;
  }, [supportsRiskReduction, orderSizeType, futures, strategy, profitCurrency]);

  const displayBaseAsset = useMemo(
    () => resolvedBaseAsset ?? 'BTC',
    [resolvedBaseAsset]
  );
  const displayQuoteAsset = useMemo(
    () => resolvedQuoteAsset ?? 'USDT',
    [resolvedQuoteAsset]
  );

  const precisionConstraints = useMemo(
    () =>
      aggregatePrecisionConstraints(
        [formData.pair ?? []].flat(),
        formData.pairPrecisionMap
      ),
    [formData.pair, formData.pairPrecisionMap]
  );

  const baseOrderGuard = useMemo(
    () =>
      createOrderGuard(orderSizeType, precisionConstraints, {
        base: displayBaseAsset,
        quote: displayQuoteAsset,
      }),
    [orderSizeType, precisionConstraints, displayBaseAsset, displayQuoteAsset]
  );

  useEffect(() => {
    updateFormData('dcaOrderGuard', baseOrderGuard);
  }, [baseOrderGuard, updateFormData]);

  // ===========================================================================
  // Dual Amount / Total order-size fields (legacy `TerminalBotSettings` parity)
  // ===========================================================================
  // Legacy keeps a single canonical `baseOrderSize` (string) + `orderSizeType`
  // (`base`/`quote`) and derives the two visible fields from price. The active
  // field shows the raw `baseOrderSize`; the inactive field shows the
  // price-derived value. See spec §1-4 and PARITY CHECKLIST.

  const baseOrderLocked = isFieldLocked?.('baseOrderSize') ?? false;
  const directionLocked = isFieldLocked?.('strategy') ?? false;
  const profitCurrencyLocked = isFieldLocked?.('profitCurrency') ?? false;
  const riskReductionLocked =
    (isFieldLocked?.('riskReductionValue') ?? false) || activeDealsCount > 0;
  const reinvestLocked =
    (isFieldLocked?.('reinvestValue') ?? false) || activeDealsCount > 0;
  const enterMarketTimeoutLocked = isFieldLocked?.('limitTimeout') ?? false;
  const skipBalanceCheckLocked = isFieldLocked?.('skipBalanceCheck') ?? false;
  const skipBalanceCheckDisabled = skipBalanceCheckLocked;
  const skipBalanceCheckDisabledMessage = '';

  const directionDisabled =
    directionLocked ||
    activeDealsCount > 0 ||
    (isExistingBot && (useMulti || isComboBot));

  const profitCurrencyDisabled =
    profitCurrencyLocked ||
    activeDealsCount > 0 ||
    (isExistingBot && isComboBot);
  const shouldShowDirectionControl = !isHedgeContext;

  const handleBaseOrderSizeChange = useCallback(
    (value: number) => {
      if (baseOrderLocked) {
        return;
      }

      if (!Number.isFinite(value)) {
        return;
      }

      const notionalValue = convertDisplayToNotional(value);
      updateFormData('baseOrderSize', notionalValue.toString());
    },
    [baseOrderLocked, convertDisplayToNotional, updateFormData]
  );

  // --- Dual Amount/Total derivations (legacy `amount`/`total`, lines 298-355) -
  const effectivePrice = latestPrice ?? 0;
  const minAmount = useMemo(
    () => (coinm ? (quoteMinAmount ?? 1) : 1),
    [coinm, quoteMinAmount]
  );

  // Both base and quote precisions are needed simultaneously (legacy
  // `precision.base` / `precision.quote`). Derive each from its own guard.
  const precisionBase = useMemo(() => {
    const guard = createOrderGuard(OrderSizeTypeEnum.base, precisionConstraints, {
      base: displayBaseAsset,
      quote: displayQuoteAsset,
    });
    return typeof guard?.decimals === 'number' ? guard.decimals : 8;
  }, [precisionConstraints, displayBaseAsset, displayQuoteAsset]);
  const precisionQuote = useMemo(() => {
    const guard = createOrderGuard(
      OrderSizeTypeEnum.quote,
      precisionConstraints,
      {
        base: displayBaseAsset,
        quote: displayQuoteAsset,
      }
    );
    return typeof guard?.decimals === 'number' ? guard.decimals : 2;
  }, [precisionConstraints, displayBaseAsset, displayQuoteAsset]);

  const baseOrderFee = fee ?? 0;
  const providerIsBybit = useMemo(
    () => (provider ?? '').toLowerCase().includes('bybit'),
    [provider]
  );

  // legacy `amount` (298-320): baseOrderSize -> base units (down-rounded).
  const amountInBase = useMemo(
    () =>
      math.round(
        (+(baseOrderSize ?? 0) * minAmount) / (effectivePrice || 1),
        precisionBase,
        true
      ),
    [baseOrderSize, minAmount, effectivePrice, precisionBase]
  );

  // legacy `total` (333-355): baseOrderSize -> quote units.
  const totalInQuote = useMemo(
    () =>
      math.round(
        (+(baseOrderSize ?? 0) * effectivePrice) / (coinm ? minAmount || 1 : 1),
        coinm ? 0 : precisionQuote,
        coinm ? undefined : true
      ),
    [baseOrderSize, effectivePrice, coinm, minAmount, precisionQuote]
  );

  // The display flip (legacy 1055-1060 / 1195-1200): the active field shows the
  // raw canonical value in its own unit; the inactive field shows the derived.
  const amountFieldValue =
    orderSizeType === OrderSizeTypeEnum.base
      ? +(baseOrderSize ?? 0)
      : amountInBase;
  const totalFieldValue =
    orderSizeType === OrderSizeTypeEnum.quote
      ? +(baseOrderSize ?? 0)
      : totalInQuote;

  // Amount USD adornment: USD of the value SHOWN in the Amount field, not the
  // derived base figure (legacy computes from `orderSizeType===base ?
  // baseOrderSize : amount`). base -> quote -> USD.
  const amountUsdEquivalent = useMemo(
    () => amountFieldValue * effectivePrice * (usdPrice ?? 0),
    [amountFieldValue, effectivePrice, usdPrice]
  );

  // legacy `maxTotal` / `maxAmount` (lines 366-484) — returned as strings.
  const maxAmount = useMemo(
    () =>
      computeMaxAmount({
        baseFree: aggregatedBalances.base.free,
        quoteFree: aggregatedBalances.quote.free,
        price: effectivePrice,
        fee: baseOrderFee,
        ...(strategy ? { strategy } : {}),
        ...(terminalDealType ? { terminalDealType } : {}),
        futures: !!futures,
        coinm: !!coinm,
        ...(marginType ? { marginType } : {}),
        leverage: normalizedLeverage,
        minAmount,
        precisionBase,
        precisionQuote,
      }),
    [
      aggregatedBalances.base.free,
      aggregatedBalances.quote.free,
      effectivePrice,
      baseOrderFee,
      strategy,
      terminalDealType,
      futures,
      coinm,
      marginType,
      normalizedLeverage,
      minAmount,
      precisionBase,
      precisionQuote,
    ]
  );
  const maxTotal = useMemo(
    () =>
      computeMaxTotal({
        baseFree: aggregatedBalances.base.free,
        quoteFree: aggregatedBalances.quote.free,
        price: effectivePrice,
        fee: baseOrderFee,
        ...(strategy ? { strategy } : {}),
        ...(terminalDealType ? { terminalDealType } : {}),
        futures: !!futures,
        coinm: !!coinm,
        ...(marginType ? { marginType } : {}),
        leverage: normalizedLeverage,
        minAmount,
        precisionBase,
        precisionQuote,
      }),
    [
      aggregatedBalances.base.free,
      aggregatedBalances.quote.free,
      effectivePrice,
      baseOrderFee,
      strategy,
      terminalDealType,
      futures,
      coinm,
      marginType,
      normalizedLeverage,
      minAmount,
      precisionBase,
      precisionQuote,
    ]
  );

  const [activePerc, setActivePerc] = useState<string>('');

  // legacy `updatePercent` (518-525): derive the active highlight from the
  // raw value vs. the relevant max.
  const updatePercent = useCallback(
    (val: string) => {
      if (isNaN(+val)) {
        return;
      }
      const useBalance =
        orderSizeType === OrderSizeTypeEnum.base ? maxAmount : maxTotal;
      setActivePerc(`${math.round((+val / (+useBalance || 1)) * 100, 3)}`);
    },
    [orderSizeType, maxAmount, maxTotal]
  );

  // legacy `setPercent` (486-516): max(active side) * (1-fee) * num/100 -> base
  // order size. Keep the intentional double `(1-fee)` quirk for parity.
  const setPercent = useCallback(
    (num: number) => () => {
      if (baseOrderLocked) {
        return;
      }
      // The % buttons sit under the Amount field, so the result is always a
      // BASE amount. `maxAmount` already converts the quote balance via price
      // (long) or is the base balance (short/coinm), so a straight percentage
      // of it gives the right base order size. (Legacy used the active side's
      // max then converted on the orderSizeType flip; our updateFormData does
      // not convert, so computing in base directly avoids storing a quote
      // amount as base — the reported bug.) Keep legacy's double `(1-fee)`.
      const useBalance = +maxAmount * (1 - baseOrderFee);
      const use = math.convertFromExponential(
        math.round(useBalance * (num / 100), precisionBase, true),
        precisionBase
      );
      updateFormData('baseOrderSize', String(use));
      if (orderSizeType !== OrderSizeTypeEnum.base) {
        updateFormData('orderSizeType', OrderSizeTypeEnum.base);
      }
      setActivePerc(`${num}`);
    },
    [
      baseOrderLocked,
      orderSizeType,
      maxAmount,
      baseOrderFee,
      precisionBase,
      updateFormData,
    ]
  );

  // legacy focus handlers (527, 1080, 1220): focus implies the unit. Legacy
  // froze the field's displayed value while focused so flipping orderSizeType
  // didn't reinterpret the stored number; our fields are controlled, so we
  // instead CONVERT baseOrderSize into the focused field's unit on focus. That
  // keeps the displayed amount equal to the price-equivalent of the current
  // size (otherwise focusing Amount would show the raw quote total as base).
  const handleAmountFocus = useCallback(() => {
    setActivePerc('');
    if (orderSizeType !== OrderSizeTypeEnum.base) {
      updateFormData('baseOrderSize', String(amountInBase));
      updateFormData('orderSizeType', OrderSizeTypeEnum.base);
    }
  }, [orderSizeType, amountInBase, updateFormData]);

  const handleTotalFocus = useCallback(() => {
    setActivePerc('');
    if (orderSizeType !== OrderSizeTypeEnum.quote) {
      updateFormData('baseOrderSize', String(totalInQuote));
      updateFormData('orderSizeType', OrderSizeTypeEnum.quote);
    }
  }, [orderSizeType, totalInQuote, updateFormData]);

  // Base-order currency dropdown (bot form). Unlike the terminal's dual
  // amount/total fields (handleAmountFocus/handleTotalFocus above), the bot
  // form exposes a single base-order field with a denomination dropdown.
  // Switching the denomination must RE-EXPRESS the stored notional
  // `baseOrderSize` in the new unit — otherwise a $10 quote order becomes a
  // raw "10 base" order (≈10×price in notional), which is the reported symptom
  // in forum #4896 / bug #41 ("$10 shows as 100 tokens; edits don't help").
  // Reuses the exact amountInBase/totalInQuote derivations the focus handlers
  // rely on. Percent modes are a different semantic (a % of balance, not an
  // absolute), so those transitions keep the prior flag-only behavior.
  const handleCurrencyReferenceChange = useCallback(
    (value: OrderSizeTypeEnum) => {
      if (orderSizeType === value) {
        return;
      }

      const percentTypes = [
        OrderSizeTypeEnum.percFree,
        OrderSizeTypeEnum.percTotal,
      ];
      const fromPercent = percentTypes.includes(orderSizeType);
      const toPercent = percentTypes.includes(value);

      // Only convert between absolute denominations (base ↔ quote/usd), and
      // only when a price is available to convert with.
      if (!fromPercent && !toPercent && effectivePrice > 0) {
        const toBase = value === OrderSizeTypeEnum.base;
        const fromBase = orderSizeType === OrderSizeTypeEnum.base;

        if (toBase && !fromBase) {
          // quote/usd notional -> base amount
          updateFormData('baseOrderSize', String(amountInBase));
        } else if (!toBase && fromBase) {
          // base amount -> quote/usd notional
          updateFormData('baseOrderSize', String(totalInQuote));
        }
        // quote <-> usd keeps the same figure (quote is a USD-pegged stable on
        // the pairs this toggle applies to); no price conversion needed.
      }

      updateFormData('orderSizeType', value);
    },
    [orderSizeType, effectivePrice, amountInBase, totalInQuote, updateFormData]
  );

  // legacy blur handlers (1062, 1202): write baseOrderSize in the focused
  // field's unit (orderSizeType already flipped on focus). Reuse
  // `convertDisplayToNotional` for the futures cost scaling legacy did via
  // `assetMultiplier`.
  const handleAmountChange = useCallback(
    (value: number | string) => {
      if (baseOrderLocked) {
        return;
      }
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return;
      }
      updateFormData('baseOrderSize', String(convertDisplayToNotional(n)));
      updatePercent(String(n));
    },
    [baseOrderLocked, convertDisplayToNotional, updateFormData, updatePercent]
  );

  const handleTotalChange = useCallback(
    (value: number | string) => {
      if (baseOrderLocked) {
        return;
      }
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return;
      }
      updateFormData('baseOrderSize', String(convertDisplayToNotional(n)));
      updatePercent(String(n));
    },
    [baseOrderLocked, convertDisplayToNotional, updateFormData, updatePercent]
  );

  // legacy on-mount activePerc seed (322-331).
  useEffect(() => {
    updatePercent(
      `${
        orderSizeType === OrderSizeTypeEnum.base
          ? +(baseOrderSize ?? 0)
          : amountInBase
      }`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isBaseOrderVarBound) {
      return;
    }

    const numericValue = Number(baseOrderVariable?.value);
    const resolvedValue =
      isCostReference && Number.isFinite(numericValue)
        ? convertDisplayToNotional(numericValue)
        : baseOrderVariable?.value;

    applyGuardedValue(
      'baseOrderSize',
      resolvedValue,
      baseOrderGuard,
      baseOrderSize,
      {
        allowZero: false,
        ...(baseOrderVariable?.name
          ? { variableName: baseOrderVariable.name }
          : {}),
      }
    );
  }, [
    isBaseOrderVarBound,
    baseOrderVariable?.value,
    baseOrderVariable?.name,
    baseOrderGuard,
    baseOrderSize,
    isCostReference,
    convertDisplayToNotional,
    applyGuardedValue,
    updateFieldError,
  ]);

  useEffect(() => {
    if (!isRiskReductionVarBound) {
      updateFieldError('riskReductionValue');
      return;
    }

    applyGuardedValue(
      'riskReductionValue',
      riskReductionVariable?.value,
      PERCENTAGE_GUARD,
      riskReductionValue,
      {
        allowZero: true,
        ...(riskReductionVariable?.name
          ? { variableName: riskReductionVariable.name }
          : {}),
      }
    );
  }, [
    isRiskReductionVarBound,
    riskReductionVariable?.value,
    riskReductionVariable?.name,
    riskReductionValue,
    applyGuardedValue,
    updateFieldError,
  ]);

  useEffect(() => {
    if (!isEnterMarketTimeoutVarBound) {
      updateFieldError('limitTimeout');
      return;
    }

    applyGuardedValue(
      'limitTimeout',
      enterMarketTimeoutVariable?.value,
      ENTER_MARKET_TIMEOUT_GUARD,
      limitTimeout,
      {
        allowZero: false,
        ...(enterMarketTimeoutVariable?.name
          ? { variableName: enterMarketTimeoutVariable.name }
          : {}),
      }
    );
  }, [
    isEnterMarketTimeoutVarBound,
    enterMarketTimeoutVariable?.value,
    enterMarketTimeoutVariable?.name,
    limitTimeout,
    applyGuardedValue,
    updateFieldError,
  ]);

  useEffect(() => {
    if (!isReinvestVarBound) {
      updateFieldError('reinvestValue');
      return;
    }

    applyGuardedValue(
      'reinvestValue',
      reinvestVariable?.value,
      PERCENTAGE_GUARD,
      reinvestValue,
      {
        allowZero: true,
        ...(reinvestVariable?.name
          ? { variableName: reinvestVariable.name }
          : {}),
      }
    );
  }, [
    isReinvestVarBound,
    reinvestVariable?.value,
    reinvestVariable?.name,
    reinvestValue,
    applyGuardedValue,
    updateFieldError,
  ]);

  const baseOrderContext = useMemo(
    () =>
      resolveBaseOrderContext({
        currencyReference: orderSizeType,
        strategy: strategy,
        aggregatedBalances,
        futures: !!futures,
        coinm: !!coinm,
        ...(terminalDealType ? { terminalDealType } : {}),
        ...(resolvedBaseAsset ? { baseAsset: resolvedBaseAsset } : {}),
        ...(resolvedQuoteAsset ? { quoteAsset: resolvedQuoteAsset } : {}),
        ...(typeof latestPrice === 'number' ? { latestPrice } : {}),
      }),
    [
      orderSizeType,
      strategy,
      aggregatedBalances,
      futures,
      coinm,
      terminalDealType,
      resolvedBaseAsset,
      resolvedQuoteAsset,
      latestPrice,
    ]
  );

  const baseOrderWarning = useMemo(() => {
    const result: { message: string | null; isError: boolean } = {
      message: null,
      isError: false,
    };

    const guardMin =
      typeof baseOrderGuard?.min === 'number' ? baseOrderGuard.min : null;
    const guardUnit =
      baseOrderGuard?.unit ?? baseOrderContext.currencyLabel ?? '';
    const guardDecimals =
      typeof baseOrderGuard?.decimals === 'number'
        ? baseOrderGuard.decimals
        : undefined;
    const formatDisplay = (value: number | null) => {
      if (value === null) {
        return '';
      }
      return formatNumberWithTrim(value, guardDecimals);
    };

    if (isPercentageReference && baseOrderDisplayValue > 100) {
      result.message =
        'Total required amount for this deal exceeds 100% of your selected balance. Reduce the allocation or adjust your strategy.';
      result.isError = true;
      return result;
    }

    // Show informational minimum order message only (not an error)
    if (guardMin !== null) {
      const displayMinimum = convertNotionalToDisplay(guardMin);
      const formattedMinimum = formatDisplay(displayMinimum);
      const unitSuffix = guardUnit ? ` ${guardUnit}` : '';

      if (formattedMinimum) {
        result.message = `Minimum order: ${formattedMinimum}${unitSuffix}.`;
      }
    }

    return result;
  }, [
    baseOrderGuard?.decimals,
    baseOrderGuard?.min,
    baseOrderGuard?.unit,
    baseOrderContext.currencyLabel,
    baseOrderDisplayValue,
    convertNotionalToDisplay,
    isPercentageReference,
  ]);

  const currencyReferenceOptions = useMemo(() => {
    const options: Array<{
      value: 'base' | 'quote' | 'percTotal' | 'percFree' | 'usd';
      label: string;
    }> = [];

    const baseLabel = displayBaseAsset;
    const quoteLabel = displayQuoteAsset;

    // Always include base and quote options
    options.push({ value: 'base', label: baseLabel });
    options.push({ value: 'quote', label: quoteLabel });

    // Add percentage options with dynamic asset labels
    // For long bots: % quote (buying with quote)
    // For short bots: % base (selling base)
    const percentageAsset =
      strategy === StrategyEnum.long ? quoteLabel : baseLabel;
    options.push({ value: 'percFree', label: `% Free ${percentageAsset}` });
    options.push({ value: 'percTotal', label: `% Total ${percentageAsset}` });

    // Add USD option
    options.push({ value: 'usd', label: 'USD' });

    return options;
  }, [displayBaseAsset, displayQuoteAsset, strategy]);

  const baseOrderCoinIcon = useMemo(() => {
    // Icon follows the selected currency reference so it updates when the user
    // toggles base/quote/USD — matching the DCA order amount input. (It used to
    // key off strategy only, so it never reacted to the reference.)
    const assetToShow = resolveOrderSizeIconSymbol(
      orderSizeType,
      displayBaseAsset,
      displayQuoteAsset
    );
    return <CoinIcon symbol={assetToShow} size="md" />;
  }, [orderSizeType, displayBaseAsset, displayQuoteAsset]);

  return {
    baseOrderDisplayValue,
    handleBaseOrderSizeChange,
    baseOrderLocked,
    baseOrderCoinIcon,
    currencyReferenceOptions,
    // Dual Amount/Total order-size fields (legacy parity)
    orderSizeType,
    amountFieldValue,
    totalFieldValue,
    amountUsdEquivalent,
    maxAmount,
    maxTotal,
    coinm,
    providerIsBybit,
    activePerc,
    setPercent,
    handleAmountFocus,
    handleAmountChange,
    handleTotalFocus,
    handleTotalChange,
    showBaseOrderSection,
    directionDisabled,
    profitCurrencyDisabled,
    riskReductionDisabledReason,
    riskReductionDisplayValue,
    riskReductionSliderValue,
    isRiskReductionEnabled,
    reinvestDisplayValue,
    reinvestSliderValue,
    enterMarketTimeoutDisplayValue,
    isEnterMarketTimeoutEnabled,
    leverageInputValue,
    handleLeverageChange,
    handleLeverageInputChange,
    handleLeverageInputBlur,
    leverageControlsDisabled,
    marginNotices,
    handleMarginTypeChange,
    handleCurrencyReferenceChange,
    handleBaseOrderTypeChange,
    baseOrderWarning,
    canTriggerBalanceRefresh,
    handleRefreshBalances,
    setBaseOrderVariable,
    setRiskReductionVariable,
    setEnterMarketTimeoutVariable,
    setReinvestVariable,
    isLimitOrder,
    riskReductionLocked,
    reinvestLocked,
    enterMarketTimeoutLocked,
    skipBalanceCheckDisabled,
    skipBalanceCheckDisabledMessage,
    shouldShowDirectionControl,
    displayBaseAsset,
    displayQuoteAsset,
    showMarginControls,
    availableMarginTypes,
    marginControlsLocked,
    maxLeverage,
    normalizedLeverage,
    isCostReference,
    convertDisplayToNotional,
    applyGuardedValue,
    baseOrderGuard,
    baseOrderContext,
    isBaseOrderVarBound,
    isEnterMarketTimeoutVarBound,
    unbindEnterMarketTimeoutVariable,
    supportsRiskReduction,
    reinvestDisabledReason,
    isReinvestVarBound,
    isRiskReductionVarBound,
  };
};
