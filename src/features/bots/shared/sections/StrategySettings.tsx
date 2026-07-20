import { BalanceInput } from '@/components/ui/balance-input';
import { FieldVariableBinding } from '@/components/ui/field-variable-binding';
import { Label } from '@/components/ui/label';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { SettingsLoadMore } from '@/components/ui/SettingsLoadMore';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import MarginTypeSelector from '@/components/widgets/bots/MarginTypeSelector';
import OrderSizeReferenceSelector from '@/components/widgets/bots/OrderSizeReferenceSelector';
import StrategySelector from '@/components/widgets/bots/StrategySelector';
import LeverageSlider from '@/components/widgets/shared/LeverageSlider';
import SettingsRow, {
  SettingsRowSurface,
} from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormSelector,
  useBotFormState,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import useBotVarBinding from '@/hooks/bots/global-variables/useBotVarBinding';
import {
  BotTypesEnum,
  ENTER_MARKET_TIMEOUT_GUARD,
  OrderSizeTypeEnum,
  OrderTypeEnum,
} from '@/types';
import type {
  BotFormData,
  BotFormErrors,
  ExchangeBotForm,
} from '@/types/bots/form';
import type { DcaBot } from '@/types/dcaBot';
import type { GlobalVariable } from '@/types/globalVariables';
import React, { useCallback, useMemo } from 'react';
import { useStrategySettingsTab } from '../../bot-types/dca/form/hooks/useStrategySettignsTab';
import { formatNumericInput } from '../../bot-types/dca/form/hooks/useTerminalControls';
import { PERCENTAGE_GUARD } from '../utils/order-guard';

export interface StrategySettingsProps {
  currentExchange: ExchangeBotForm | null;
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  errors: BotFormErrors;
  getBalance?: (
    asset: string
  ) => { asset: string; free: number; locked: number; total: number } | null;
  bot?: DcaBot | null;
  onUpdateBalances?: () => unknown;
}

export const StrategySettings: React.FC<StrategySettingsProps> = ({
  formData,
  updateFormData,
  errors,
  bot,
  onUpdateBalances,
  currentExchange,
}) => {
  const { alerts: mergedAlerts, mode } = useBotFormState();
  const {
    baseOrderDisplayValue,
    handleBaseOrderSizeChange,
    baseOrderLocked,
    baseOrderCoinIcon,
    currencyReferenceOptions,
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
  } = useStrategySettingsTab({
    formData,
    updateFormData,
    errors,
    bot,
    onUpdateBalances,
    currentExchange,
  });
  const isSettingsReadonly = useMemo(
    () => mode === 'settings-readonly',
    [mode]
  );

  const isComboBot = useMemo(
    () => formData.type === BotTypesEnum.combo,
    [formData.type]
  );
  const orderSizeType = useBotFormSelector('orderSizeType');
  const strategy = useBotFormSelector('strategy');
  const profitCurrency = useBotFormSelector('profitCurrency');
  const marginType = useBotFormSelector('marginType');
  const limitTimeout = useBotFormSelector('limitTimeout');
  const riskReductionValue = useBotFormSelector('riskReductionValue');
  const reinvestValue = useBotFormSelector('reinvestValue');
  const notUseLimitReposition = useBotFormSelector('notUseLimitReposition');
  const skipBalanceCheck = useBotFormSelector('skipBalanceCheck');
  const futures = useBotFormSelector('futures');
  const baseOrderSize = useBotFormSelector('baseOrderSize');
  const startOrderType = useBotFormSelector('startOrderType');
  const useReinvest = useBotFormSelector('useReinvest');
  const baseStep = useBotFormSelector('baseStep');
  const step = useBotFormSelector('step');
  const baseGridLevels = useBotFormSelector('baseGridLevels');
  const gridLevel = useBotFormSelector('gridLevel');
  const isBaseOrderPercentageMode = [
    OrderSizeTypeEnum.percFree,
    OrderSizeTypeEnum.percTotal,
  ].includes(orderSizeType);

  const baseSpacing = useMemo(() => {
    if (!isComboBot) {
      return { gridStep: null as number | null, display: '—', isLow: false };
    }

    const baseStepValue = Number.parseFloat(String(baseStep ?? step ?? ''));
    const baseLevelsValue = Number.parseFloat(String(baseGridLevels ?? '1'));

    if (
      !Number.isFinite(baseStepValue) ||
      !Number.isFinite(baseLevelsValue) ||
      baseLevelsValue <= 0
    ) {
      return { gridStep: null as number | null, display: '—', isLow: false };
    }

    const computed = Math.round((baseStepValue / baseLevelsValue) * 100) / 100;

    if (!Number.isFinite(computed)) {
      return { gridStep: null as number | null, display: '—', isLow: false };
    }

    return {
      gridStep: computed,
      display: computed.toFixed(2),
      isLow: computed < 1,
    };
  }, [baseGridLevels, baseStep, step, isComboBot]);

  const { isBound: isBaseGridLevelsVarBound } =
    useBotVarBinding('baseGridLevels');
  const applyBaseGridLevelsVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseInt(String(variable.value ?? ''), 10);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = Math.min(Math.max(numericValue, 1), 200);
      updateFormData('baseGridLevels', clamped.toString());
    },
    [updateFormData]
  );

  const { isBound: isBaseStepVarBound } = useBotVarBinding('baseStep');
  const applyBaseStepVariable = useCallback(
    (variable: GlobalVariable | null) => {
      if (!variable) {
        return;
      }
      const numericValue = Number.parseFloat(String(variable.value ?? ''));
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const clamped = Math.min(Math.max(numericValue, 0.1), 500);
      updateFormData('baseStep', formatNumericInput(clamped, 2));
    },
    [updateFormData]
  );

  // Info messages are now displayed inline instead of being injected into alerts state

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
        {shouldShowDirectionControl && (
          <SettingsRow
            name="Direction"
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
            />
          </SettingsRow>
        )}

        {futures && (
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

        {!futures && (
          <SettingsRow
            name="Profit Currency"
            tooltip="Choose quote currency if you expect the pair to move sideways or down and you want to make profit in quote currency. Choose the base currency if you expect the pair to move sideways or up and you want to make profit in base currency."
            tooltipURL="/help/profit-in-base-and-quote"
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
                  <div className="space-y-xs">
                    {marginNotices.map((notice) => (
                      <SettingsAlert
                        key={notice}
                        variant="warning"
                        title={notice}
                      />
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
                <LeverageSlider
                  value={normalizedLeverage}
                  onChange={handleLeverageChange}
                  inputValue={leverageInputValue}
                  onInputChange={handleLeverageInputChange}
                  onInputBlur={handleLeverageInputBlur}
                  min={1}
                  max={maxLeverage}
                  disabled={leverageControlsDisabled}
                />
                <p className="text-xs text-muted-foreground">
                  Max available leverage: {maxLeverage}×
                </p>
              </div>
            </div>
          </SettingsRow>
        )}

        {showBaseOrderSection && (
          <>
            <SettingsRow
              name="Base Order Size"
              tooltip="This is the first order the bot will make. If DCA mode is disabled, this will be the only order the bot will make. Choose the reference currency for your order size - note that a long bot will always use quote to buy base and a short bot will always sell base to obtain quote."
              navId="baseOrderSize"
              alerts={mergedAlerts?.baseOrderSize ?? []}
            >
              <div className="space-y-xs">
                <FieldVariableBinding
                  path="baseOrderSize"
                  varType="float"
                  tooltip="Bind base order size"
                  disabled={baseOrderLocked}
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
                  <BalanceInput
                    readOnly={isSettingsReadonly}
                    value={baseOrderDisplayValue}
                    onChange={handleBaseOrderSizeChange}
                    currency={baseOrderContext.currencyLabel}
                    availableBalance={baseOrderContext.availableBalance}
                    balanceCurrency={baseOrderContext.balanceCurrency}
                    balanceAmount={baseOrderContext.balanceAmount}
                    placeholder="10"
                    disabled={isBaseOrderVarBound || baseOrderLocked}
                    onRefreshBalance={handleRefreshBalances}
                    coinIcon={baseOrderCoinIcon}
                    unitLabel={baseOrderContext.currencyLabel}
                    currencyReference={orderSizeType}
                    onCurrencyReferenceChange={handleCurrencyReferenceChange}
                    currencyReferenceOptions={currencyReferenceOptions}
                    showRefreshButton={
                      canTriggerBalanceRefresh &&
                      !isBaseOrderVarBound &&
                      !baseOrderLocked
                    }
                    errorField="baseOrderSize"
                    navId="baseOrderSize"
                    // Futures order size is funded by margin × leverage, not the
                    // free spot-wallet balance (which reads 0 once the bot's
                    // capital is committed to an open position). Validating
                    // against it produced a false "exceeds available balance"
                    // error on the hedge-combo edit form (forum #4921 / bug #94).
                    disableBalanceValidation={Boolean(futures)}
                    {...(typeof baseOrderGuard?.min === 'number'
                      ? { min: baseOrderGuard.min }
                      : {})}
                    {...(typeof baseOrderGuard?.max === 'number'
                      ? { max: baseOrderGuard.max }
                      : {})}
                    {...(typeof baseOrderGuard?.step === 'number'
                      ? { step: baseOrderGuard.step }
                      : {})}
                    {...(typeof baseOrderGuard?.decimals === 'number'
                      ? { precision: baseOrderGuard.decimals }
                      : {})}
                    showPercentageButtons={true}
                    endAdornment={
                      isBaseOrderPercentageMode
                        ? unitAdornment('%', { tone: 'muted', size: 'xs' })
                        : undefined
                    }
                  />
                </FieldVariableBinding>
                {baseOrderWarning.message && (
                  <SettingsAlert
                    variant={baseOrderWarning.isError ? 'error' : 'info'}
                    title={baseOrderWarning.message}
                  />
                )}
              </div>
            </SettingsRow>

            {!isComboBot && (
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
            {isComboBot && (
              <SettingsRow
                name="Combo grid strategy"
                tooltip="Control how the base order spreads across the underlying minigrid before DCA orders begin."
                colSpan="full"
              >
                <SettingsRowSurface
                  tone="transparent"
                  padding="none"
                  spacing="sm"
                  className="border-0"
                >
                  <div className="space-y-sm">
                    <div className="grid gap-sm sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="combo-base-grid-levels">
                          Base grid levels
                        </Label>
                        <FieldVariableBinding
                          path="baseGridLevels"
                          varType="int"
                          tooltip="Bind base grid levels"
                          variant="inline"
                          onVariableSelected={applyBaseGridLevelsVariable}
                          onVariableResolved={applyBaseGridLevelsVariable}
                        >
                          <NumberInput
                            id="combo-base-grid-levels"
                            value={
                              Number.parseInt(
                                String(baseGridLevels ?? gridLevel ?? '1'),
                                10
                              ) || 1
                            }
                            onChange={(value) =>
                              updateFormData(
                                'baseGridLevels',
                                typeof value === 'number'
                                  ? value.toString()
                                  : String(value ?? '1')
                              )
                            }
                            min={1}
                            max={200}
                            step={1}
                            className="w-full"
                            disabled={isBaseGridLevelsVarBound}
                          />
                        </FieldVariableBinding>
                        {errors['baseGridLevels'] && (
                          <SettingsAlert
                            variant="error"
                            title={errors['baseGridLevels']}
                          />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="combo-base-step">
                          Base grid range (%)
                        </Label>
                        <FieldVariableBinding
                          path="baseStep"
                          varType="float"
                          tooltip="Bind base grid range"
                          variant="inline"
                          onVariableSelected={applyBaseStepVariable}
                          onVariableResolved={applyBaseStepVariable}
                        >
                          <NumberInput
                            id="combo-base-step"
                            value={baseStep ?? step ?? ''}
                            onChange={(value) => {
                              if (typeof value === 'string') {
                                const trimmed = value.trim();
                                if (!trimmed) {
                                  updateFormData('baseStep', trimmed);
                                  return;
                                }
                                const parsed = Number.parseFloat(trimmed);
                                if (!Number.isFinite(parsed)) {
                                  updateFormData('baseStep', trimmed);
                                  return;
                                }
                                const clamped = Math.min(
                                  Math.max(parsed, 0.1),
                                  500
                                );
                                updateFormData(
                                  'baseStep',
                                  formatNumericInput(clamped, 2)
                                );
                                return;
                              }
                              const clamped = Math.min(
                                Math.max(value, 0.1),
                                500
                              );
                              updateFormData(
                                'baseStep',
                                formatNumericInput(clamped, 2)
                              );
                            }}
                            min={0.1}
                            max={500}
                            step={0.1}
                            precision={2}
                            className="w-full"
                            disabled={isBaseStepVarBound}
                            endAdornment={unitAdornment('%')}
                          />
                        </FieldVariableBinding>
                        {errors['baseStep'] && (
                          <SettingsAlert
                            variant="error"
                            title={errors['baseStep']}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  {baseSpacing.isLow ? (
                    <SettingsAlert
                      variant="warning"
                      title={`Base grid spacing is tight · ${baseSpacing.display}%`}
                      description="Base grid spacing below 1% can concentrate exposure near the entry price. Consider increasing either the base grid levels or base step."
                    />
                  ) : (
                    <SettingsAlert
                      variant="info"
                      title={`Base grid spacing · ${baseSpacing.display}%`}
                    />
                  )}
                </SettingsRowSurface>
              </SettingsRow>
            )}
          </>
        )}
      </MasonryLayout>
      <SettingsLoadMore
        id="strategy-advanced"
        autoExpand={
          (isLimitOrder &&
            (!!notUseLimitReposition || isEnterMarketTimeoutEnabled)) ||
          !!skipBalanceCheck ||
          !!isRiskReductionEnabled ||
          !!useReinvest
        }
      >
        {isLimitOrder && (
          <SettingsRow
            name="Disable Repositioning"
            tooltip="By default we reposition limit orders closer to price to ensure they get filled ASAP. If you want to maintain the original price that triggered the entry, you can deactivate repositioning here."
            trailing={
              <Switch
                id="disable-repositioning"
                checked={!!notUseLimitReposition}
                onCheckedChange={(checked) =>
                  updateFormData('notUseLimitReposition', checked)
                }
              />
            }
          />
        )}

        {isLimitOrder && (
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
              />
            }
          >
            {isEnterMarketTimeoutEnabled && (
              <div className="space-y-sm">
                <Label className="text-sm font-medium">Timeout (seconds)</Label>
                <FieldVariableBinding
                  path="limitTimeout"
                  varType="float"
                  tooltip="Bind enter market timeout"
                  disabled={enterMarketTimeoutLocked}
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
                  <SettingsAlert
                    variant="error"
                    title={errors['limitTimeout']}
                  />
                )}
              </div>
            )}
          </SettingsRow>
        )}

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
          {skipBalanceCheckDisabledMessage && (
            <SettingsAlert
              variant="info"
              title={skipBalanceCheckDisabledMessage}
            />
          )}
        </SettingsRow>

        <SettingsRow
          name="Risk Reduction"
          tooltip={
            riskReductionDisabledReason ||
            'Risk Reduction automatically adjusts the size of your next trade by subtracting any losses incurred.'
          }
          tooltipURL="/help/auto-compunding-risk-reduction"
          navId="risk-reduction"
          alerts={
            errors['riskReductionValue']
              ? [
                  {
                    variant: 'error',
                    message: errors['riskReductionValue'],
                    title: errors['riskReductionValue'],
                    navId: 'risk-reduction',
                  },
                ]
              : undefined
          }
          trailing={
            <Switch
              id="risk-reduction-switch"
              checked={isRiskReductionEnabled}
              onCheckedChange={(checked) => {
                if (!supportsRiskReduction) {
                  return;
                }
                updateFormData('useRiskReduction', checked);
                if (checked && (riskReductionValue ?? '') === '') {
                  updateFormData('riskReductionValue', '10');
                }
              }}
              disabled={!supportsRiskReduction || riskReductionLocked}
            />
          }
        >
          {isRiskReductionEnabled && (
            <div className="space-y-sm">
              <Label className="text-sm font-medium">
                Risk Reduction Value (%)
              </Label>
              <Slider
                value={riskReductionSliderValue}
                onChange={(value) =>
                  updateFormData('riskReductionValue', value.toString())
                }
                min={0}
                max={100}
                step={1}
                disabled={isRiskReductionVarBound || riskReductionLocked}
              />
              <FieldVariableBinding
                path="riskReductionValue"
                varType="float"
                tooltip="Bind risk reduction value"
                disabled={riskReductionLocked}
                variant="inline"
                onVariableResolved={setRiskReductionVariable}
                onVariableSelected={(variable) => {
                  if (variable.value !== undefined) {
                    applyGuardedValue(
                      'riskReductionValue',
                      variable.value,
                      PERCENTAGE_GUARD,
                      riskReductionValue,
                      {
                        allowZero: true,
                        ...(variable.name
                          ? { variableName: variable.name }
                          : {}),
                      }
                    );
                  }
                }}
              >
                <NumberInput
                  value={riskReductionDisplayValue}
                  onChange={(value) =>
                    updateFormData(
                      'riskReductionValue',
                      typeof value === 'number' ? value.toString() : value
                    )
                  }
                  min={0}
                  max={100}
                  className="w-28"
                  endAdornment={unitAdornment('%')}
                  showControls={false}
                  disabled={isRiskReductionVarBound || riskReductionLocked}
                />
              </FieldVariableBinding>
              {!isRiskReductionVarBound && !riskReductionLocked && (
                <TerminalButtonStack
                  value={riskReductionDisplayValue ?? ''}
                  onValueChange={(nextValue) =>
                    updateFormData('riskReductionValue', nextValue)
                  }
                  options={[
                    { value: '10', label: '10%' },
                    { value: '20', label: '20%' },
                    { value: '50', label: '50%' },
                    { value: '100', label: '100%' },
                  ]}
                  className="w-full"
                  disabled={isRiskReductionVarBound || riskReductionLocked}
                />
              )}
            </div>
          )}
          {riskReductionDisabledReason && (
            <SettingsAlert
              variant="info"
              title="Feature Unavailable"
              description={riskReductionDisabledReason}
            />
          )}
        </SettingsRow>

        <SettingsRow
          name="Reinvest Profit"
          tooltip={
            reinvestDisabledReason ||
            'Reinvesting profits takes the profits from a successful trade and automatically adds them to the next trade.'
          }
          tooltipURL="/help/auto-compunding-risk-reduction"
          navId="reinvest"
          alerts={
            errors['reinvestValue']
              ? [
                  {
                    variant: 'error',
                    message: errors['reinvestValue'],
                    title: errors['reinvestValue'],
                    navId: 'reinvest',
                  },
                ]
              : undefined
          }
          trailing={
            <Switch
              id="reinvest-profit"
              checked={!!useReinvest}
              onCheckedChange={(checked) => {
                if (!supportsRiskReduction) {
                  return;
                }
                updateFormData('useReinvest', checked);
              }}
              disabled={!supportsRiskReduction || reinvestLocked}
            />
          }
        >
          {useReinvest && (
            <div className="space-y-sm">
              <Label className="text-sm font-medium">Reinvest Value (%)</Label>
              <Slider
                value={reinvestSliderValue}
                onChange={(value) =>
                  updateFormData('reinvestValue', value.toString())
                }
                min={0}
                max={100}
                step={1}
                disabled={isReinvestVarBound || reinvestLocked}
              />
              <FieldVariableBinding
                path="reinvestValue"
                varType="float"
                tooltip="Bind reinvest value"
                disabled={reinvestLocked}
                variant="inline"
                onVariableResolved={setReinvestVariable}
                onVariableSelected={(variable) => {
                  if (variable.value !== undefined) {
                    applyGuardedValue(
                      'reinvestValue',
                      variable.value,
                      PERCENTAGE_GUARD,
                      reinvestValue,
                      {
                        allowZero: true,
                        ...(variable.name
                          ? { variableName: variable.name }
                          : {}),
                      }
                    );
                  }
                }}
              >
                <NumberInput
                  value={reinvestDisplayValue}
                  onChange={(value) =>
                    updateFormData(
                      'reinvestValue',
                      typeof value === 'number' ? value.toString() : value
                    )
                  }
                  min={0}
                  max={100}
                  className="w-28"
                  endAdornment={unitAdornment('%')}
                  showControls={false}
                  disabled={isReinvestVarBound || reinvestLocked}
                />
              </FieldVariableBinding>
              {!isReinvestVarBound && !reinvestLocked && (
                <TerminalButtonStack
                  value={reinvestDisplayValue ?? ''}
                  onValueChange={(nextValue) =>
                    updateFormData('reinvestValue', nextValue)
                  }
                  options={[
                    { value: '10', label: '10%' },
                    { value: '20', label: '20%' },
                    { value: '50', label: '50%' },
                    { value: '100', label: '100%' },
                  ]}
                  className="w-full"
                  disabled={isReinvestVarBound || reinvestLocked}
                />
              )}
            </div>
          )}
          {reinvestDisabledReason && (
            <SettingsAlert
              variant="info"
              title="Feature Unavailable"
              description={reinvestDisabledReason}
            />
          )}
        </SettingsRow>
      </SettingsLoadMore>
    </>
  );
};
