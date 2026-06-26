import {
  FieldVariableBinding,
  NumberInput,
  TerminalButtonStack,
} from '@/components/ui';
import { Button } from '@/components/ui/button';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { SettingsLoadMore } from '@/components/ui/SettingsLoadMore';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import MarginTypeSelector from '@/components/widgets/bots/MarginTypeSelector';
import OrderSizeReferenceSelector from '@/components/widgets/bots/OrderSizeReferenceSelector';
import StrategySelector from '@/components/widgets/bots/StrategySelector';
import { CoinFilter } from '@/components/widgets/shared/CoinSelect';
import LeverageSlider from '@/components/widgets/shared/LeverageSlider';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import {
  useBotFormSelector,
  useBotFormState,
  type BotFormMode,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { useBasicSettingsTab } from '@/features/bots/bot-types/dca/form/hooks/useBasicSettingsTab';
import { useStrategySettingsTab } from '@/features/bots/bot-types/dca/form/hooks/useStrategySettignsTab';
import TerminalAmountTotalFields from './TerminalAmountTotalFields';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { formatBalance } from '@/utils/numberFormatter';
import { useDcaTradingContext } from '@/hooks/bots/dca/useDcaTradingContext';
import {
  ENTER_MARKET_TIMEOUT_GUARD,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  RRSlTypeEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
} from '@/types';
import type {
  BotFormData,
  BotFormErrors,
  ExchangeBotForm,
} from '@/types/bots/form';
import { Crosshair } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Label } from '@/components/ui/label';
import ExchangeSelector from '@/features/bots/bot-types/dca/form/components/exchangeSelector';

// Local helper component to handle limit price input without causing render storms
const LimitPriceInput: React.FC<{
  baseOrderPrice?: string;
  latestPrice?: number;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  error?: string;
  strategy: StrategyEnum;
  baseAssetSymbol?: string;
  quoteAssetSymbol?: string;
  label?: string;
}> = ({
  baseOrderPrice,
  latestPrice,
  updateFormData,
  error,
  strategy,
  baseAssetSymbol,
  quoteAssetSymbol,
  label,
}) => {
  const { activePickerField, setActivePickerField, setCoordinates } =
    useTradingTerminalUtils();
  const pickerFieldName = 'baseOrderPrice';
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localValue, setLocalValue] = useState<string>(
    baseOrderPrice && baseOrderPrice.trim().length
      ? baseOrderPrice
      : typeof latestPrice === 'number'
        ? String(latestPrice)
        : ''
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    // when external baseOrderPrice changes (e.g., reset or load), sync if not focused
    if (inputRef.current && document.activeElement === inputRef.current) return;
    setLocalValue(
      baseOrderPrice && baseOrderPrice.trim().length
        ? baseOrderPrice
        : typeof latestPrice === 'number'
          ? String(latestPrice)
          : ''
    );
    setValidationError(null);
  }, [baseOrderPrice, latestPrice]);

  const validateLimitPrice = useCallback(
    (value: string): string | null => {
      const limitPriceValue = Number.parseFloat(value);
      if (Number.isNaN(limitPriceValue) || limitPriceValue <= 0) {
        return null; // Let other validation handle this
      }

      if (typeof latestPrice !== 'number' || latestPrice <= 0) {
        return null; // Can't validate without current price
      }

      const isLong = strategy === StrategyEnum.long;
      if (isLong && limitPriceValue > latestPrice) {
        return `For long positions, limit price must be at or below current price ($${latestPrice.toFixed(2)})`;
      }
      if (!isLong && limitPriceValue < latestPrice) {
        return `For short positions, limit price must be at or above current price ($${latestPrice.toFixed(2)})`;
      }

      return null;
    },
    [strategy, latestPrice]
  );

  // Handle chart picker coordinates
  const { coordinates } = useTradingTerminalUtils();
  useEffect(() => {
    if (!coordinates || coordinates.pickerField !== pickerFieldName) {
      return;
    }

    const pickedPrice = coordinates.price;
    const validationErr = validateLimitPrice(String(pickedPrice));

    if (!validationErr) {
      updateFormData('baseOrderPrice', String(pickedPrice));
      setValidationError(null);
    } else {
      setValidationError(validationErr);
    }

    if (setCoordinates) {
      setCoordinates(null);
    }
  }, [coordinates, setCoordinates, updateFormData, validateLimitPrice]);

  const commit = () => {
    if (localValue === (baseOrderPrice ?? '')) return;

    const validationErr = validateLimitPrice(localValue);
    if (validationErr) {
      setValidationError(validationErr);
      return;
    }

    setValidationError(null);
    updateFormData('baseOrderPrice', localValue);
  };

  const handleChange = (value: number | string | undefined) => {
    const nextValue = typeof value === 'number' ? String(value) : (value ?? '');
    setLocalValue(nextValue);
    // Clear validation error on change so user can type
    setValidationError(null);
  };

  const displayError = validationError || error;

  // Determine currency symbol based on direction
  const currencySymbol =
    strategy === StrategyEnum.long
      ? quoteAssetSymbol || ''
      : baseAssetSymbol || '';

  return (
    <div className="space-y-sm">
      <Label className="text-sm font-medium">{label ?? 'Limit Price'}</Label>
      <NumberInput
        value={localValue}
        onChange={handleChange}
        onBlur={() => commit()}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        ref={inputRef}
        min={0}
        placeholder="Enter limit price"
        className="w-full"
        showControls={false}
        endAdornment={
          <div className="flex items-center gap-1">
            {currencySymbol ? (
              <span className="text-xs text-muted-foreground">
                {currencySymbol}
              </span>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                if (setCoordinates) {
                  setCoordinates(null);
                }
                setActivePickerField((prev: string | false) =>
                  prev === pickerFieldName ? false : pickerFieldName
                );
              }}
              className={
                activePickerField === pickerFieldName
                  ? 'bg-primary/10 text-primary h-6 w-6'
                  : 'h-6 w-6'
              }
              aria-label="Pick price from chart"
              title="Pick price from chart"
            >
              <Crosshair className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />
      {displayError && (
        <p className="text-xs text-destructive">{displayError}</p>
      )}
      {!displayError && latestPrice && (
        <p className="text-xs text-muted-foreground">
          Current price: ${latestPrice.toFixed(2)}
        </p>
      )}
    </div>
  );
};

interface TerminalBasicSettingsProps {
  currentExchange: ExchangeBotForm | null;
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  errors: BotFormErrors;
  exchangesData?: ExchangeBotForm[] | undefined;
  exchangesLoading?: boolean;
  onUpdateBalances?: () => void;
  mode: BotFormMode;
  isFieldLocked?: (field: Fields) => boolean;
}

export const TerminalBasicSettings: React.FC<TerminalBasicSettingsProps> = (
  props
) => {
  const {
    formData,
    currentExchange,
    updateFormData,
    exchangesLoading,
    exchangesData,
    errors,
  } = props;
  const {
    exchangeProvider,
    formattedMissingPairs,
    missingPairsExchangeLabel,
    quickSelectOptions,
    handleCoinToggle,
    handlePairsPaste,
    handleRemovePair,
    selectedPairSymbols,
  } = useBasicSettingsTab(props);
  useDcaTradingContext(props.formData);
  const orderSizeType = useBotFormSelector('orderSizeType');
  const strategy = useBotFormSelector('strategy');
  const terminalDealType = useBotFormSelector('terminalDealType');
  const isImport = terminalDealType === TerminalDealTypeEnum.import;
  const isSimple = terminalDealType === TerminalDealTypeEnum.simple;
  const useRiskReward = useBotFormSelector('useRiskReward');
  const rrSlType = useBotFormSelector('rrSlType');
  const profitCurrency = useBotFormSelector('profitCurrency');
  const marginType = useBotFormSelector('marginType');
  const limitTimeout = useBotFormSelector('limitTimeout');
  const skipBalanceCheck = useBotFormSelector('skipBalanceCheck');
  const startOrderType = useBotFormSelector('startOrderType');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const baseOrderSize = useBotFormSelector('baseOrderSize');
  const useLimitPrice = useBotFormSelector('useLimitPrice');
  const baseOrderPrice = useBotFormSelector('baseOrderPrice');
  const tradingContext = useDcaTradingContext(formData, { bot: null });
  const latestPrice = tradingContext.latestPrice;
  const { alerts } = useBotFormState();
  const {
    baseOrderLocked,
    showBaseOrderSection,
    directionDisabled,
    profitCurrencyDisabled,
    enterMarketTimeoutDisplayValue,
    isEnterMarketTimeoutEnabled,
    leverageInputValue,
    handleLeverageChange,
    handleLeverageInputChange,
    handleLeverageInputBlur,
    leverageControlsDisabled,
    marginNotices,
    handleMarginTypeChange,
    handleBaseOrderTypeChange,
    baseOrderWarning,
    setBaseOrderVariable,
    setEnterMarketTimeoutVariable,
    enterMarketTimeoutLocked,
    skipBalanceCheckDisabled,
    skipBalanceCheckDisabledMessage,
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
    isBaseOrderVarBound,
    isEnterMarketTimeoutVarBound,
    unbindEnterMarketTimeoutVariable,
    amountFieldValue,
    totalFieldValue,
    amountUsdEquivalent,
    maxAmount,
    maxTotal,
    providerIsBybit,
    activePerc,
    setPercent,
    handleAmountFocus,
    handleAmountChange,
    handleTotalFocus,
    handleTotalChange,
  } = useStrategySettingsTab(props);

  // Legacy parity (Import deal type): the import flow declares a position
  // already held at a known entry price, so it always uses a limit order
  // with an explicit price. Force Limit + Use Limit Price and seed the
  // entry price to the latest price the first time so the field is usable.
  useEffect(() => {
    if (!isImport) return;
    if (startOrderType !== OrderTypeEnum.limit) {
      updateFormData('startOrderType', OrderTypeEnum.limit);
    }
    if (!useLimitPrice) {
      updateFormData('useLimitPrice', true);
    }
    const existing =
      typeof baseOrderPrice === 'string' ? baseOrderPrice.trim() : '';
    const hasValidExisting =
      existing !== '' && !isNaN(+existing) && +existing > 0;
    if (
      !hasValidExisting &&
      typeof latestPrice === 'number' &&
      Number.isFinite(latestPrice) &&
      latestPrice > 0
    ) {
      updateFormData('baseOrderPrice', String(latestPrice));
    }
  }, [
    isImport,
    startOrderType,
    useLimitPrice,
    baseOrderPrice,
    latestPrice,
    updateFormData,
  ]);

  // Import labels the entry-price field by what the user did to acquire the
  // position: a long holding was "Purchased", a short was "Sold".
  const importPriceLabel =
    strategy === StrategyEnum.short ? 'Sold Price' : 'Purchased Price';

  // Legacy terminal parity: show the available balance of the asset that funds
  // each direction under the Long/Short buttons. Long spends the quote asset
  // (base for COIN-M); Short spends the base asset (quote for USDT-M futures,
  // base for COIN-M).
  const directionBalanceLabels = useMemo(() => {
    const baseFree = tradingContext.aggregatedBalances.base.free;
    const quoteFree = tradingContext.aggregatedBalances.quote.free;
    const longUsesBase = coinm;
    const shortUsesBase = futures ? coinm : true;
    return {
      longBalanceLabel: longUsesBase
        ? `${formatBalance(baseFree, displayBaseAsset)} ${displayBaseAsset}`
        : `${formatBalance(quoteFree, displayQuoteAsset)} ${displayQuoteAsset}`,
      shortBalanceLabel: shortUsesBase
        ? `${formatBalance(baseFree, displayBaseAsset)} ${displayBaseAsset}`
        : `${formatBalance(quoteFree, displayQuoteAsset)} ${displayQuoteAsset}`,
    };
  }, [
    tradingContext.aggregatedBalances.base.free,
    tradingContext.aggregatedBalances.quote.free,
    coinm,
    futures,
    displayBaseAsset,
    displayQuoteAsset,
  ]);

  return (
    <>
      <MasonryLayout
        gap={8}
        containerBreakpoints={{
          default: 1,
          640: 2,
          1024: 3,
        }}
      >
        <div className="space-y-xs">
          <ExchangeSelector
            isExchangeLocked={false}
            currentExchange={currentExchange}
            formData={formData}
            updateFormData={updateFormData}
            exchangesLoading={exchangesLoading}
            exchangesData={exchangesData}
            tooltip="Select the exchange account to use for this bot"
            mode={'create'}
          />
          {/* Simple is a one-off market order with no position tracking, so on
              a futures account it opens an UNMANAGED position. We let the user
              do it (some want a quick manual entry) but warn first, rather than
              disabling the futures option outright as the terminal used to. */}
          {isSimple && futures && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-sm text-xs text-warning">
              A Simple order places a one-off market order and doesn&apos;t open
              a tracked position. On a futures account this opens an{' '}
              <span className="font-medium">unmanaged position</span> with no
              automatic take-profit, stop-loss, or DCA — you&apos;ll need to
              monitor and close it yourself. Use{' '}
              <span className="font-medium">Smart</span> if you want Gainium to
              track and manage the position.
            </div>
          )}
        </div>
        <SettingsRow
          name="Trading Pairs"
          tooltip="Configure the trading pairs used by this bot"
          alerts={useBotFormState().alerts?.pair ?? []}
          navId="pair"
        >
          <div className="space-y-xs">
            <CoinFilter
              selectedCoins={selectedPairSymbols}
              onCoinToggle={handleCoinToggle}
              onRemoveCoin={handleRemovePair}
              mode="pairs"
              {...(exchangeProvider ? { exchangeProvider } : {})}
              onPairsPaste={handlePairsPaste}
              {...(quickSelectOptions.length
                ? {
                    helperTokens: quickSelectOptions.map(
                      ({ token, label, description }) => ({
                        token,
                        label,
                        description,
                      })
                    ),
                  }
                : {})}
              shouldShowAddButton={false}
              showAllOption={false}
            />
            {/* Pair errors are surfaced via SettingsRow alerts (validator-driven) */}

            {formattedMissingPairs.length > 0 && (
              <p className="text-xs text-destructive">
                Some saved pairs are no longer available on{' '}
                {missingPairsExchangeLabel}: {formattedMissingPairs.join(', ')}.
              </p>
            )}
          </div>
        </SettingsRow>
        {!useRiskReward && (
          <SettingsRow
            name="Side"
            tooltip="Choose the direction of your trades. Long means buying low and selling high, while short means selling high and buying low."
          >
            <StrategySelector
              strategy={strategy}
              onStrategyChange={(nextDirection) => {
                if (directionDisabled) {
                  return;
                }
                updateFormData('strategy', nextDirection);
              }}
              disabled={directionDisabled}
              longLabel="Buy"
              shortLabel="Sell"
              invert={isImport}
              {...directionBalanceLabels}
            />
          </SettingsRow>
        )}
        {useRiskReward && (
          <SettingsRow name="Strategy">
            <TerminalButtonStack
              value={strategy}
              onValueChange={(v) =>
                updateFormData('strategy', v as StrategyEnum)
              }
              options={[
                { value: StrategyEnum.long, label: 'LONG' },
                { value: StrategyEnum.short, label: 'SHORT' },
              ]}
              className="w-full"
            />
          </SettingsRow>
        )}
        {futures &&
          ![OrderSizeTypeEnum.percFree, OrderSizeTypeEnum.percTotal].includes(
            orderSizeType
          ) && (
            <SettingsRow
              name="Order Size Reference"
              tooltip="You can switch between the position value after leverage and the capital required to open the position."
            >
              <OrderSizeReferenceSelector
                orderSizeReference={formData.orderSizeReference}
                onOrderSizeReferenceChange={(nextReference) =>
                  updateFormData('orderSizeReference', nextReference)
                }
              />
            </SettingsRow>
          )}

        {!futures && !isSimple && (
          <SettingsRow
            name="Profit Currency"
            tooltip="Choose quote currency if you expect the pair to move sideways or down and you want to make profit in quote currency. Choose the base currency if you expect the pair to move sideways or up and you want to make profit in base currency."
          >
            <TerminalButtonStack
              value={profitCurrency}
              onValueChange={(value) =>
                updateFormData('profitCurrency', value as 'base' | 'quote')
              }
              options={[
                { value: 'base', label: displayBaseAsset },
                { value: 'quote', label: displayQuoteAsset },
              ]}
              className="w-full"
              disabled={profitCurrencyDisabled}
            />
          </SettingsRow>
        )}
        {showMarginControls && (
          <SettingsRow
            name="Margin & Leverage"
            tooltip="Select margin type and leverage for your futures position."
            colSpan="full"
          >
            <div className="space-y-md rounded-lg bg-muted p-md">
              <div className="space-y-xs">
                <div className="flex items-center gap-xs">
                  <Label>Margin Type</Label>
                  <Tooltip tooltip="Select how leverage is applied to your futures position.">
                    <InfoIcon />
                  </Tooltip>
                </div>
                <MarginTypeSelector
                  marginType={marginType}
                  onMarginTypeChange={handleMarginTypeChange}
                  availableTypes={availableMarginTypes}
                  disabled={
                    availableMarginTypes.length <= 1 || marginControlsLocked
                  }
                />
                {marginNotices.length > 0 && (
                  <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-sm text-xs text-warning">
                    {marginNotices.map((notice) => (
                      <p key={notice}>{notice}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-xs">
                <div className="flex items-center gap-xs">
                  <Label>Leverage</Label>
                  <Tooltip tooltip="Set the leverage multiplier for your futures position. Higher leverage increases both potential profit and risk.">
                    <InfoIcon />
                  </Tooltip>
                </div>
                <div className="grid gap-sm sm:grid-cols-[minmax(0,180px)_1fr] sm:items-center">
                  <NumberInput
                    value={leverageInputValue}
                    onChange={handleLeverageInputChange}
                    onBlur={handleLeverageInputBlur}
                    min={1}
                    max={maxLeverage}
                    step={1}
                    endAdornment={unitAdornment('×')}
                    aria-label="Leverage"
                    disabled={leverageControlsDisabled}
                  />
                  <LeverageSlider
                    value={normalizedLeverage}
                    onChange={handleLeverageChange}
                    min={1}
                    max={maxLeverage}
                    disabled={leverageControlsDisabled}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Max available leverage: {maxLeverage}×
                </p>
              </div>
            </div>
          </SettingsRow>
        )}
        {showBaseOrderSection && (
          <>
            {/* Legacy parity: no "Base Order Size" header — the Amount and Total
                fields carry their own labels. */}
            <SettingsRow alerts={alerts?.baseOrderSize ?? []}>
              <div className="space-y-xs">
                <FieldVariableBinding
                  path="baseOrderSize"
                  varType="float"
                  tooltip="Bind base order size"
                  disabled={baseOrderLocked}
                  hideBindingButton={true}
                  variant="inline"
                  onVariableResolved={setBaseOrderVariable}
                  onVariableSelected={(variable) => {
                    if (variable.value !== undefined) {
                      const numericValue = Number(variable.value);
                      const normalizedValue =
                        isCostReference && Number.isFinite(numericValue)
                          ? convertDisplayToNotional(numericValue)
                          : variable.value;

                      applyGuardedValue(
                        'baseOrderSize',
                        normalizedValue,
                        baseOrderGuard,
                        baseOrderSize,
                        {
                          allowZero: false,
                          ...(variable.name
                            ? { variableName: variable.name }
                            : {}),
                        }
                      );
                    }
                  }}
                >
                  {/* Legacy parity: the terminal shows two linked fields —
                      Amount (base) and Total (quote) — kept in sync via price,
                      with focus implying the unit (no currency-reference
                      dropdown). Replaces the single Base Order Size field. */}
                  <TerminalAmountTotalFields
                    amountValue={amountFieldValue}
                    totalValue={totalFieldValue}
                    orderSizeType={orderSizeType}
                    onAmountFocus={handleAmountFocus}
                    onAmountChange={handleAmountChange}
                    onTotalFocus={handleTotalFocus}
                    onTotalChange={handleTotalChange}
                    maxAmount={maxAmount}
                    maxTotal={maxTotal}
                    baseAsset={displayBaseAsset}
                    quoteAsset={displayQuoteAsset}
                    coinm={!!coinm}
                    providerIsBybit={providerIsBybit}
                    usdEquivalent={amountUsdEquivalent}
                    percentButtons={[10, 25, 50, 75, 100]}
                    activePerc={activePerc}
                    setPercent={setPercent}
                    guard={baseOrderGuard}
                    disabled={isBaseOrderVarBound || baseOrderLocked}
                  />
                </FieldVariableBinding>
                {baseOrderWarning.message ? (
                  <p
                    className={`text-xs ${baseOrderWarning.isError ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                  >
                    {baseOrderWarning.message}
                  </p>
                ) : null}
              </div>
            </SettingsRow>

            {/* Import always uses a limit order at the declared entry price,
                so the Market/Limit selector is hidden (legacy parity). */}
            {!isImport && (
              <SettingsRow
                name="Base Order Type"
                tooltip="Market orders will execute immediately, although you will not get the best price and will incur higher fees. Limit orders incurs less fees, but they may not execute immediately. We reposition limit orders every few seconds until they are filled."
              >
                <TerminalButtonStack
                  value={startOrderType}
                  onValueChange={(next) =>
                    handleBaseOrderTypeChange(next as OrderTypeEnum)
                  }
                  options={[
                    { value: OrderTypeEnum.market, label: 'Market' },
                    { value: OrderTypeEnum.limit, label: 'Limit' },
                  ]}
                />
              </SettingsRow>
            )}
          </>
        )}
        {isImport ? (
          // Import declares an already-held position at a known entry price,
          // so the price field is always shown (relabeled), with no
          // Market/Limit or Use-Limit-Price chrome (legacy parity).
          <SettingsRow>
            <LimitPriceInput
              baseOrderPrice={baseOrderPrice}
              latestPrice={latestPrice}
              updateFormData={updateFormData}
              error={errors['baseOrderPrice']}
              strategy={strategy}
              baseAssetSymbol={displayBaseAsset}
              quoteAssetSymbol={displayQuoteAsset}
              label={importPriceLabel}
            />
          </SettingsRow>
        ) : (
          startOrderType === OrderTypeEnum.limit &&
          !(
            useRiskReward &&
            (!rrSlType || rrSlType === RRSlTypeEnum.indicator)
          ) && (
            <SettingsRow
              name="Use Limit Price"
              tooltip="Set a specific limit price for the order. If disabled, the order will use the current market price when placing a limit order."
              trailing={
                <Switch
                  id="use-limit-price-switch"
                  checked={!!useLimitPrice}
                  onCheckedChange={(checked) => {
                    updateFormData('useLimitPrice', checked);
                    if (!checked) {
                      updateFormData('baseOrderPrice', '');
                      return;
                    }

                    // When enabling: if there is no meaningful baseOrderPrice, set it to the cached latest price
                    const existing =
                      typeof baseOrderPrice === 'string'
                        ? baseOrderPrice.trim()
                        : '';
                    const hasValidExisting =
                      existing !== '' && !isNaN(+existing) && +existing > 0;

                    if (!hasValidExisting) {
                      const priceCandidate =
                        typeof latestPrice === 'number' &&
                        Number.isFinite(latestPrice)
                          ? latestPrice
                          : undefined;
                      if (priceCandidate !== undefined) {
                        updateFormData(
                          'baseOrderPrice',
                          String(priceCandidate)
                        );
                      }
                    }
                  }}
                  disabled={isEnterMarketTimeoutEnabled}
                />
              }
            >
              {useLimitPrice && (
                <LimitPriceInput
                  baseOrderPrice={baseOrderPrice}
                  latestPrice={latestPrice}
                  updateFormData={updateFormData}
                  error={errors['baseOrderPrice']}
                  strategy={strategy}
                  baseAssetSymbol={displayBaseAsset}
                  quoteAssetSymbol={displayQuoteAsset}
                />
              )}
            </SettingsRow>
          )
        )}
        <SettingsLoadMore
          id="strategy-advanced"
          autoExpand={
            !!skipBalanceCheck ||
            isEnterMarketTimeoutEnabled ||
            (startOrderType === OrderTypeEnum.limit &&
              (useLimitPrice || isEnterMarketTimeoutEnabled))
          }
        >
          {startOrderType === OrderTypeEnum.limit && (
            <SettingsRow
              name="Enter Market Timeout"
              tooltip="Activate a timer for limit orders. If the limit order has not been filled within that time, a market order will be executed instead."
              trailing={
                <Switch
                  id="enter-market-timeout-switch"
                  checked={isEnterMarketTimeoutEnabled}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      if (isEnterMarketTimeoutVarBound) {
                        unbindEnterMarketTimeoutVariable();
                      }
                      updateFormData('useLimitTimeout', false);
                      return;
                    }

                    const nextValue =
                      enterMarketTimeoutDisplayValue !== '0' &&
                      enterMarketTimeoutDisplayValue !== ''
                        ? enterMarketTimeoutDisplayValue
                        : '20';
                    updateFormData('useLimitTimeout', true);
                    updateFormData('limitTimeout', nextValue);
                  }}
                  disabled={!!useLimitPrice}
                />
              }
            >
              {isEnterMarketTimeoutEnabled && (
                <div className="space-y-sm">
                  <Label className="text-sm font-medium">
                    Timeout (seconds)
                  </Label>
                  <FieldVariableBinding
                    path="limitTimeout"
                    varType="float"
                    tooltip="Bind enter market timeout"
                    disabled={enterMarketTimeoutLocked}
                    hideBindingButton={true}
                    variant="inline"
                    onVariableResolved={setEnterMarketTimeoutVariable}
                    onVariableSelected={(variable) => {
                      if (variable.value !== undefined) {
                        applyGuardedValue(
                          'limitTimeout',
                          variable.value,
                          ENTER_MARKET_TIMEOUT_GUARD,
                          limitTimeout,
                          {
                            allowZero: false,
                            ...(variable.name
                              ? { variableName: variable.name }
                              : {}),
                          }
                        );
                      }
                    }}
                  >
                    <NumberInput
                      value={enterMarketTimeoutDisplayValue}
                      onChange={(value) => {
                        const nextValue =
                          typeof value === 'number'
                            ? value.toString()
                            : (value ?? '');
                        updateFormData('limitTimeout', nextValue);
                      }}
                      min={1}
                      max={600}
                      className="w-28"
                      showControls={false}
                      disabled={
                        isEnterMarketTimeoutVarBound || enterMarketTimeoutLocked
                      }
                    />
                  </FieldVariableBinding>
                  {errors['limitTimeout'] && (
                    <p className="text-xs text-destructive">
                      {errors['limitTimeout']}
                    </p>
                  )}
                </div>
              )}
            </SettingsRow>
          )}

          {!isImport && (
            <SettingsRow
              name="Skip Balance Check"
              tooltip="Skip balance validation before placing orders. Use with caution as this may lead to insufficient balance errors."
              trailing={
                <Switch
                  id="skip-balance-check"
                  checked={!!skipBalanceCheck}
                  onCheckedChange={(checked) => {
                    if (skipBalanceCheckDisabled) {
                      return;
                    }
                    updateFormData('skipBalanceCheck', checked);
                  }}
                  disabled={skipBalanceCheckDisabled}
                />
              }
            >
              {skipBalanceCheckDisabledMessage ? (
                <p className="text-xs text-muted-foreground">
                  {skipBalanceCheckDisabledMessage}
                </p>
              ) : null}
            </SettingsRow>
          )}
        </SettingsLoadMore>
      </MasonryLayout>
    </>
  );
};
