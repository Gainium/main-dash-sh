import React, { useCallback, useMemo } from 'react';

import { BalanceInput } from '@/components/ui/balance-input';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import { Label } from '@/components/ui/label';
// NumberInput intentionally removed - BalanceInput now handles percent UI
import CoinIcon from '@/components/widgets/shared/CoinIcon';
import {
  useBotFormSelector,
  type BotFormMode,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { formatNumberWithTrim } from '@/features/bots/shared/utils/order-guard';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { resolveOrderSizeIconSymbol } from '@/utils/bots/dca/order-size-icon';
import {
  resolveBaseOrderContext,
  type DcaTradingContext,
} from '@/hooks/bots/dca/useDcaTradingContext';
import {
  useBotVarBinding,
  type VarBindingPath,
} from '@/hooks/bots/global-variables/useBotVarBinding';
import { BotTypesEnum, StrategyEnum } from '@/types';
import type { BotFormData, BotFormErrors } from '@/types/bots/form';
import type { GlobalVariable } from '@/types/globalVariables';

interface DcaOrderSizingControlProps {
  formData: BotFormData;
  mode: BotFormMode;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  errors: BotFormErrors;
  tradingContext: DcaTradingContext;
  idPrefix: string;
  label?: string;
  allowNegative?: boolean;
  variablePath?: VarBindingPath;
  value?: string | number;
  onValueChange?: (value: string) => void;
  onRefreshBalance?: () => void;
  showRefreshButton?: boolean;
}

const DEFAULT_VARIABLE_PATH = 'orderSize';

// Build option label function removed - labels align with base order now

const parseNumericString = (value: string | number | null | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return 0;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const clampPercentage = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
};

export const DcaOrderSizingControl: React.FC<DcaOrderSizingControlProps> = ({
  formData,
  updateFormData,
  //errors,
  tradingContext,
  idPrefix,
  label = 'DCA order amount',
  allowNegative = false,
  variablePath = DEFAULT_VARIABLE_PATH,
  value,
  onValueChange,
  onRefreshBalance,
  showRefreshButton = false,
  mode,
}) => {
  const orderField = (
    variablePath === DEFAULT_VARIABLE_PATH
      ? 'orderSize'
      : (variablePath as keyof BotFormData['dca'])
  ) as keyof BotFormData['dca'];
  const { isBound: isVarBound } = useBotVarBinding(variablePath);

  // Generate unique error field and navId based on variablePath
  // For nested paths like "dcaCustom.uuid.size" or "indicators.uuid.orderSize",
  // use the full path as the error field to avoid collisions
  const errorField = useMemo(() => {
    if (variablePath === DEFAULT_VARIABLE_PATH) {
      return 'orderSize';
    }
    // For nested paths, use the full path to ensure uniqueness
    return String(variablePath);
  }, [variablePath]);

  const navId = useMemo(() => {
    if (variablePath === DEFAULT_VARIABLE_PATH) {
      return 'orderSize';
    }
    // For nested paths, use the full path to ensure navigation uniqueness
    return String(variablePath);
  }, [variablePath]);

  const baseLabel = useMemo(
    () => tradingContext.baseAsset ?? 'Base',
    [tradingContext.baseAsset]
  );
  const quoteLabel = useMemo(
    () => tradingContext.quoteAsset ?? 'Quote',
    [tradingContext.quoteAsset]
  );
  const strategy = useBotFormSelector('strategy');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const orderSizeType = useBotFormSelector('orderSizeType');
  const baseOrderSize = useBotFormSelector('baseOrderSize');
  const { currencyLabel, availableBalance, balanceCurrency, balanceAmount } =
    useMemo(() => {
      const params: Parameters<typeof resolveBaseOrderContext>[0] = {
        currencyReference: orderSizeType,
        strategy: strategy,
        aggregatedBalances: tradingContext.aggregatedBalances,
        futures: Boolean(futures),
        coinm: Boolean(coinm),
      };

      if (tradingContext.baseAsset) {
        params.baseAsset = tradingContext.baseAsset;
      }
      if (tradingContext.quoteAsset) {
        params.quoteAsset = tradingContext.quoteAsset;
      }
      if (typeof tradingContext.latestPrice === 'number') {
        params.latestPrice = tradingContext.latestPrice;
      }

      return resolveBaseOrderContext(params);
    }, [
      strategy,
      orderSizeType,
      tradingContext.aggregatedBalances,
      tradingContext.baseAsset,
      tradingContext.quoteAsset,
      tradingContext.latestPrice,
      futures,
      coinm,
    ]);
  const isComboBot = useMemo(
    () => formData.type === BotTypesEnum.combo,
    [formData.type]
  );
  const orderSizeValue = parseNumericString(
    value ??
      (isComboBot
        ? (formData['combo'][orderField] as string | number | undefined)
        : (formData['dca'][orderField] as string | number | undefined))
  );

  const updateOrderSize = useCallback(
    (next: number) => {
      const sanitized = Number.isFinite(next) ? next : 0;
      const payload = sanitized.toString();
      if (onValueChange) {
        onValueChange(payload);
        return;
      }
      updateFormData(orderField, payload);
    },
    [onValueChange, orderField, updateFormData]
  );

  const handleOrderSizeChange = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) {
        updateOrderSize(0);
        return;
      }
      if (!allowNegative && value < 0) {
        updateOrderSize(0);
        return;
      }
      updateOrderSize(value);
    },
    [allowNegative, updateOrderSize]
  );

  const handlePercentChange = useCallback(
    (value: string | number) => {
      const numericValue = clampPercentage(parseNumericString(value));
      updateOrderSize(numericValue);
    },
    [updateOrderSize]
  );

  const applyVariableValue = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }

      const valueToUse =
        typeof variable.value === 'number' || typeof variable.value === 'string'
          ? variable.value
          : null;

      if (valueToUse === null) {
        return;
      }

      const numericValue = parseNumericString(valueToUse);

      if (numericValue === orderSizeValue) {
        return;
      }

      updateOrderSize(numericValue);
    },
    [orderSizeValue, updateOrderSize]
  );

  // How many decimals the amount field accepts. `dcaOrderGuard` already
  // carries them per order-size reference (`createOrderGuard`: quote ->
  // the pair's price precision, base -> the exchange's base step, usd ->
  // 2), and the Strategy tab's Base Order Size input reads its `precision`
  // from that very guard. Hardcoding 2 here rounded every BTC/ETH-quoted
  // amount to 0 as it was typed — on Bybit ETH/BTC the exchange minimum
  // is 0.000065 BTC, so no valid order size survived the field, and the
  // 25/50/75% buttons filled in "0" too.
  // The constants stay as a FLOOR so a coarse pair can never make the field
  // less precise than the guard alone would allow.
  // When the guard carries NO decimals there is nothing to floor, so leave
  // `precision` undefined and let `BalanceInput`'s own 8-dp default apply —
  // the same thing the Strategy tab's Base Order Size does (it spreads
  // `precision` only when `baseOrderGuard.decimals` is a number). Falling
  // back to the constants there re-created the original bug wherever the
  // guard is decimals-less: the read-only bot drawer stubs `pairMetadata`
  // empty and makes no network requests, so `createOrderGuard` yields
  // `{label, unit}` only, and a saved 0.00011 BTC amount rendered as "0"
  // while Base Order Size on the same panel showed 0.00011.
  const guardPrecision = formData.dcaOrderGuard?.decimals;
  const precision = useMemo(() => {
    if (typeof guardPrecision !== 'number' || !Number.isFinite(guardPrecision)) {
      return undefined;
    }
    const floor = orderSizeType === 'base' ? 6 : 2;
    return Math.min(8, Math.max(floor, guardPrecision));
  }, [guardPrecision, orderSizeType]);
  const isDealEdit = useMemo(
    () => mode === 'deal-edit' || mode === 'deal-mass-edit',
    [mode]
  );
  const isSettingsReadonly = useMemo(
    () => mode === 'settings-readonly',
    [mode]
  );
  const options = useMemo(() => {
    if (isDealEdit || isSettingsReadonly) {
      return [];
    }
    const percentageAsset =
      strategy === StrategyEnum.long ? quoteLabel : baseLabel;
    return [
      { value: 'base' as const, label: baseLabel },
      { value: 'quote' as const, label: quoteLabel },
      { value: 'percFree' as const, label: `% Free ${percentageAsset}` },
      { value: 'percTotal' as const, label: `% Total ${percentageAsset}` },
      { value: 'usd' as const, label: 'USD' },
    ];
  }, [baseLabel, quoteLabel, strategy, isDealEdit, isSettingsReadonly]);

  const isPercentageMode =
    orderSizeType === 'percFree' || orderSizeType === 'percTotal';

  const shouldShowRefresh =
    showRefreshButton && !isVarBound && typeof onRefreshBalance === 'function';
  const refreshProps = shouldShowRefresh ? { onRefreshBalance } : {};

  const handleOrderSizeTypeChange = useCallback(
    (nextType: BotFormData['dca']['orderSizeType']) => {
      updateFormData('orderSizeType', nextType);

      if (nextType === 'percFree' || nextType === 'percTotal') {
        handlePercentChange(orderSizeValue);
      }
    },
    [handlePercentChange, orderSizeValue, updateFormData]
  );

  const coinIconSymbol = useMemo(
    () =>
      resolveOrderSizeIconSymbol(
        orderSizeType,
        tradingContext.baseAsset,
        tradingContext.quoteAsset
      ),
    [orderSizeType, tradingContext.baseAsset, tradingContext.quoteAsset]
  );

  const coinIconElement = useMemo(
    () => <CoinIcon symbol={coinIconSymbol} size="w-6 h-6" />,
    [coinIconSymbol]
  );

  const {
    baseAsset: resolvedBaseAsset,
    quoteAsset: resolvedQuoteAsset,
    aggregatedBalances,
    latestPrice,
  } = tradingContext;

  const orderContext = useMemo(
    () =>
      resolveBaseOrderContext({
        currencyReference: orderSizeType,
        strategy: strategy,
        aggregatedBalances,
        futures: !!futures,
        coinm: !!coinm,
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
      resolvedBaseAsset,
      resolvedQuoteAsset,
      latestPrice,
    ]
  );

  const isPercentageReference = useMemo(
    () => orderSizeType === 'percTotal' || orderSizeType === 'percFree',
    [orderSizeType]
  );

  const orderWarning = useMemo(() => {
    const result: { message: string | null; isError: boolean } = {
      message: null,
      isError: false,
    };

    const notionalValue = Number(baseOrderSize);
    const orderGuard = formData.dcaOrderGuard;
    const guardMin =
      typeof orderGuard?.min === 'number' ? orderGuard.min : null;
    const guardUnit = orderGuard?.unit ?? orderContext.currencyLabel ?? '';
    const guardDecimals =
      typeof orderGuard?.decimals === 'number'
        ? orderGuard.decimals
        : undefined;
    const formatDisplay = (value: number | null) => {
      if (value === null) {
        return '';
      }
      return formatNumberWithTrim(value, guardDecimals);
    };

    if (isPercentageReference && +(value ?? 0) > 100) {
      result.message =
        'Total required amount for this deal exceeds 100% of your selected balance. Reduce the allocation or adjust your strategy.';
      result.isError = true;
      return result;
    }

    if (guardMin !== null) {
      const EPSILON = 1e-8;
      const belowMinimum =
        Number.isFinite(notionalValue) && notionalValue + EPSILON < guardMin;
      const displayMinimum = guardMin;
      const formattedMinimum = formatDisplay(displayMinimum);
      const unitSuffix = guardUnit ? ` ${guardUnit}` : '';

      if (belowMinimum) {
        result.message = `Minimum DCA order is ${formattedMinimum}${unitSuffix}.`;
        result.isError = true;
        // Validation will surface errors/alerts via the shared validation logic —
        // avoid setting local field errors here to keep behavior consistent.
        return result;
      }

      if (formattedMinimum) {
        result.message = `Minimum DCA order: ${formattedMinimum}${unitSuffix}.`;
      }
    }

    return result;
  }, [
    orderContext.currencyLabel,
    baseOrderSize,
    isPercentageReference,
    value,
    formData.dcaOrderGuard,
  ]);
  return (
    <div className="space-y-sm">
      <div className="space-y-xs">
        <Label htmlFor={`${idPrefix}-order-size`}>{label}</Label>
        <FieldVariableBinding
          path={variablePath}
          varType="number"
          tooltip="Bind order size"
          variant="inline"
          onVariableSelected={applyVariableValue}
          onVariableResolved={applyVariableValue}
        >
          <BalanceInput
            readOnly={isSettingsReadonly}
            value={orderSizeValue}
            onChange={
              isPercentageMode ? handlePercentChange : handleOrderSizeChange
            }
            // For percentage mode, clamp between 0 and 100 and force 2 dp precision
            min={isPercentageMode ? 0 : undefined}
            max={isPercentageMode ? 100 : undefined}
            step={isPercentageMode ? 0.1 : undefined}
            precision={isPercentageMode ? 2 : precision}
            // If percentage mode, keep the available balance at 100 for display/clamping
            availableBalance={isPercentageMode ? 100 : availableBalance}
            currency={isPercentageMode ? '%' : currencyLabel}
            balanceCurrency={balanceCurrency}
            balanceAmount={balanceAmount}
            // Read-only when editing a COMBO deal, matching legacy main-dash
            // (`disabled || !useDca || (isDealEdit && combo)` on the order-size
            // input in DcaModeSettings.tsx). A combo deal's order size is what
            // funds its already-placed minigrid; a plain DCA deal's is not, and
            // legacy leaves that one editable — so this is deliberately gated
            // on combo rather than on deal-edit alone.
            disabled={isVarBound || (isDealEdit && isComboBot)}
            showRefreshButton={shouldShowRefresh}
            coinIcon={coinIconElement}
            unitLabel={isPercentageMode ? '%' : coinIconSymbol}
            showPercentageButtons={!isPercentageMode}
            currencyReference={orderSizeType}
            onCurrencyReferenceChange={handleOrderSizeTypeChange}
            currencyReferenceOptions={options}
            currencyReferenceDisabled={true}
            currencyReferenceTooltip="Adjust order size reference in the Base Order Size section"
            // Futures order size is funded by margin × leverage, not the free
            // spot-wallet balance — which reads 0 once the bot's capital is
            // committed to an open position. Validating against it produced a
            // false "exceeds available balance" error on the hedge-combo edit
            // form (forum #4921 / bug #94). Skip the wallet-based cap for
            // futures; the balance still displays.
            disableBalanceValidation={Boolean(futures)}
            errorField={errorField}
            navId={navId}
            endAdornment={
              isPercentageMode
                ? unitAdornment('%', { tone: 'muted', size: 'xs' })
                : undefined
            }
            {...refreshProps}
          />
        </FieldVariableBinding>
        {orderWarning.message && !orderWarning.isError ? (
          <p className="text-xs text-muted-foreground">
            {orderWarning.message}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default DcaOrderSizingControl;
