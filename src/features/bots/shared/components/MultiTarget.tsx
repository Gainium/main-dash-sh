import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import type { VarBindingPath } from '@/hooks/bots/global-variables/useBotVarBinding';
import type { MultiTP } from '@/types';
import type { GlobalVariable } from '@/types/globalVariables';
import { MAX_SL_ALLOCATION } from '@/utils/bots/dca/stop-loss';
import { Crosshair, Trash2 } from 'lucide-react';
import { InputButtonsSlider } from './InputButtonsSlider';

type MultiTargetProps = {
  target: MultiTP;
  validation: { isValid: boolean; message?: string };
  index: number;
  handleRemoveTarget: (index: number) => void;
  disableRemove: boolean;
  isTargetPercentageBound: boolean;
  sanitizedPercentageMagnitude: number;
  handleTargetPercentageChange: (index: number, value: number | string) => void;
  handleTargetAmountChange: (index: number, value: number | string) => void;
  isTargetAmountBound: boolean;
  sanitizedAmount: number;
  maxAmountForTarget: number;
  formattedAllocation: string;
  percentagePath: VarBindingPath;
  amountPath: VarBindingPath;
  applyVariableToMultiTarget: (
    targetUuid: string,
    field: 'target' | 'amount' | 'fixed',
    variable: GlobalVariable
  ) => void;
  minSlToUse: number;
  totalTargets: number;
  previousTargetValue?: number;
  /**
   * Enables the absolute-price row: a price input for the target plus the
   * chart bullseye picker. This is a CAPABILITY, not a bot type — it is on
   * wherever the form has a single meaningful reference price and a chart to
   * pick from (the Trading Terminal, and editing one specific deal). Callers
   * derive it once (see `supportsPriceTargets` in TakeProfit/StopLossSettings)
   * rather than each passing their own mode boolean.
   */
  showPriceTargets?: boolean;
  currentPrice?: number;
  handleTargetFixedChange?: (index: number, value: number | string) => void;
  isTargetFixedBound?: boolean;
  fixedPath?: VarBindingPath;
  // New props to control price unit label and long/short behavior
  priceUnit?: string;
  isShort?: boolean;
};

const MultiTarget = ({
  target,
  validation,
  index,
  handleRemoveTarget,
  disableRemove,
  isTargetPercentageBound,
  sanitizedPercentageMagnitude,
  handleTargetPercentageChange,
  handleTargetAmountChange,
  isTargetAmountBound,
  sanitizedAmount,
  maxAmountForTarget,
  percentagePath,
  amountPath,
  applyVariableToMultiTarget,
  minSlToUse,
  totalTargets,
  previousTargetValue,
  showPriceTargets = false,
  currentPrice = 0,
  handleTargetFixedChange,
  isTargetFixedBound = false,
  fixedPath,
  priceUnit,
  //isShort = false,
}: MultiTargetProps) => {
  const { activePickerField, setActivePickerField, setCoordinates } =
    useTradingTerminalUtils();
  // Determine if this is a stop loss (negative values) or take profit (positive values)
  const isStopLoss = minSlToUse < 0 || parseFloat(target.target) < 0;

  // When there's only one target, position should be 100% and disabled
  const isSingleTarget = totalTargets === 1;
  const effectiveAmount = isSingleTarget ? 100 : sanitizedAmount;
  const isPositionDisabled = isSingleTarget || isTargetAmountBound;

  // Calculate base value for preset buttons (previous target value or 0)
  const baseValue =
    previousTargetValue !== undefined && Number.isFinite(previousTargetValue)
      ? previousTargetValue
      : 0;

  // Define preset buttons based on type (absolute values from baseValue)
  const presets = isStopLoss
    ? [
        { label: '-1%', value: -1 },
        { label: '-5%', value: -5 },
        { label: '-10%', value: -10 },
      ]
    : [
        { label: '1%', value: 1 },
        { label: '5%', value: 5 },
        { label: '10%', value: 10 },
      ];

  return (
    <Card key={target.uuid} position={1} className="space-y-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex items-center gap-xs text-sm font-medium">
          <span>Target {index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => handleRemoveTarget(index)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={disableRemove}
            aria-label={`Remove target ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Row 1: Target Percentage - Input, Preset Buttons, and Slider */}
      <InputButtonsSlider
        value={target.target}
        onChange={(value) => handleTargetPercentageChange(index, value)}
        min={isStopLoss ? -250 : minSlToUse}
        max={isStopLoss ? -minSlToUse : 250}
        step={0.1}
        precision={3}
        placeholder={isStopLoss ? '-1.0' : '1.0'}
        disabled={false}
        endAdornment={unitAdornment('%')}
        isInvalid={!validation.isValid}
        showSlider={!isTargetPercentageBound}
        sliderMin={isStopLoss ? minSlToUse : minSlToUse}
        sliderMax={250}
        sliderStep={0.1}
        sliderValue={
          isStopLoss
            ? sanitizedPercentageMagnitude
            : sanitizedPercentageMagnitude
        }
        onSliderChange={(value) =>
          handleTargetPercentageChange(index, isStopLoss ? -value : value)
        }
        presetButtons={presets}
        baseValue={baseValue}
        varBindingPath={percentagePath}
        varType="float"
        varTooltip="Bind target %"
        onVariableSelected={(variable) => {
          applyVariableToMultiTarget(target.uuid, 'target', variable);
        }}
        onVariableResolved={(variable) => {
          if (variable) {
            applyVariableToMultiTarget(target.uuid, 'target', variable);
          }
        }}
        isVariableBound={isTargetPercentageBound}
      />

      {/* Row 1.5: Fixed Price Input (Terminal bots only) */}
      {showPriceTargets &&
        typeof handleTargetFixedChange === 'function' &&
        fixedPath && (
          <InputButtonsSlider
            value={target.fixed || ''}
            onChange={(value) => handleTargetFixedChange(index, value)}
            min={0}
            max={currentPrice * 10}
            step={0.01}
            precision={8}
            placeholder={currentPrice > 0 ? currentPrice.toFixed(2) : '0.00'}
            disabled={false}
            endAdornment={
              <span className="inline-flex items-center gap-2">
                {unitAdornment(priceUnit ?? 'Price')}
                {showPriceTargets &&
                  fixedPath &&
                  setActivePickerField &&
                  typeof handleTargetFixedChange === 'function' && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={isTargetFixedBound}
                      onClick={() => {
                        if (setCoordinates) {
                          setCoordinates(null);
                        }
                        setActivePickerField((prev) =>
                          prev === fixedPath ? false : fixedPath
                        );
                      }}
                      className={
                        activePickerField === fixedPath
                          ? 'bg-primary/10 text-primary h-6 w-6'
                          : 'h-6 w-6'
                      }
                      aria-label="Pick price from chart"
                      title="Pick price from chart"
                    >
                      <Crosshair className="h-4 w-4" />
                    </Button>
                  )}
              </span>
            }
            showSlider={false}
            varBindingPath={fixedPath}
            varType="float"
            varTooltip="Bind fixed price"
            onVariableSelected={(variable) => {
              applyVariableToMultiTarget(target.uuid, 'fixed', variable);
            }}
            onVariableResolved={(variable) => {
              if (variable) {
                applyVariableToMultiTarget(target.uuid, 'fixed', variable);
              }
            }}
            isVariableBound={isTargetFixedBound}
          />
        )}

      {/* Row 2: Position Allocation - Input and Slider */}
      <InputButtonsSlider
        value={isSingleTarget ? '100' : target.amount}
        onChange={(value) => handleTargetAmountChange(index, value)}
        min={0}
        max={MAX_SL_ALLOCATION}
        step={1}
        precision={0}
        placeholder="25"
        disabled={isPositionDisabled}
        endAdornment={unitAdornment('% of position', {
          className: 'whitespace-nowrap',
        })}
        showSlider={!isPositionDisabled}
        sliderValue={effectiveAmount}
        sliderMin={1}
        sliderMax={maxAmountForTarget}
        sliderStep={1}
        varBindingPath={amountPath}
        varType="float"
        varTooltip="Bind allocation %"
        onVariableSelected={(variable) => {
          applyVariableToMultiTarget(target.uuid, 'amount', variable);
        }}
        onVariableResolved={(variable) => {
          if (variable) {
            applyVariableToMultiTarget(target.uuid, 'amount', variable);
          }
        }}
        isVariableBound={isTargetAmountBound}
      />
    </Card>
  );
};

export default MultiTarget;
