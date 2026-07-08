import { Crosshair, Info } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import BotFormAlertSummary from '@/components/ui/BotFormAlertSummary';
import { Button } from '@/components/ui/button';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useGridForm } from '@/hooks/bots/grid/useGridForm';
import { useBotFormSelector } from '@/contexts/bots/form/BotFormProvider';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import type { BotFormAlert } from '@/types/bots/form';

const CONDITION_OPTIONS = [
  { value: 'valueChanged', label: 'Percentage change' },
  { value: 'priceReached', label: 'Target price' },
] as const;

// Only two values exist in the backend `TpSlAction` enum: `stop` and
// `stopAndSell`. On futures, `stopAndSell` closes the position, so it's
// shown with a "close position" label there — it is NOT a separate enum
// value (a `stopAndClosePosition` value would fail on save).
const buildActionOptions = (futures: boolean) =>
  [
    { value: 'stop', label: 'Stop and cancel orders' },
    {
      value: 'stopAndSell',
      label: futures
        ? 'Stop, cancel orders and close position'
        : 'Stop, cancel orders and sell base',
    },
  ] as const;

const parse = (value: string | undefined): number => {
  if (!value) return NaN;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const priceFromPercent = (basePrice: number, percent: number): string => {
  if (!Number.isFinite(basePrice) || basePrice <= 0) return '';
  return (basePrice * (1 + percent / 100)).toFixed(6);
};

export const GridStopLossSettings: React.FC = () => {
  const {
    formState: { formData, updateFormData, errors },
    quoteAsset,
    latestPrice,
  } = useGridForm();
  const {
    coordinates,
    setCoordinates,
    activePickerField,
    setActivePickerField,
  } = useTradingTerminalUtils();
  const sl = useBotFormSelector('sl');
  const _startPrice = useBotFormSelector('startPrice');
  const _slCondition = useBotFormSelector('slCondition');
  const slLimit = useBotFormSelector('slLimit');
  const slPerc = useBotFormSelector('slPerc');
  const slLowPrice = useBotFormSelector('slLowPrice');
  const slAction = useBotFormSelector('slAction');
  const futures = useBotFormSelector('futures');
  const actionOptions = useMemo(
    () => buildActionOptions(futures ?? false),
    [futures]
  );
  const isEnabled = useMemo(() => sl ?? false, [sl]);
  const startPrice = useMemo(
    () =>
      parse(_startPrice || formData.initialPrice || `${latestPrice}` || '0'),
    [_startPrice, formData.initialPrice, latestPrice]
  );
  const slCondition = useMemo(
    () => (_slCondition as 'valueChanged' | 'priceReached') || 'valueChanged',
    [_slCondition]
  );

  useEffect(() => {
    if (!coordinates) {
      return;
    }
    if (slCondition === 'priceReached' && activePickerField === 'slLowPrice') {
      updateFormData('slLowPrice', coordinates.price?.toString() || '');
      if (setCoordinates) {
        setCoordinates(null);
      }
    }
  }, [
    coordinates,
    setCoordinates,
    slCondition,
    updateFormData,
    activePickerField,
  ]);

  const applyPercentPreset = (percent: number) => {
    updateFormData('slPerc', percent.toString());
  };

  const applyPricePercent = (percent: number) => {
    const price = priceFromPercent(startPrice, percent);
    if (price) {
      updateFormData('slLowPrice', price);
    }
  };

  const percentagePresets = React.useMemo(
    () =>
      [-5, -10, -15, -20, -25].map((percent) => ({
        value: percent.toString(),
        label: `${percent}%`,
        buttonClassName: 'min-w-[64px] px-2',
      })),
    []
  );

  const pricePresetOptions = React.useMemo(
    () =>
      [-5, -10].map((percent) => ({
        percent,
        value: percent.toString(),
        label: `${percent}%`,
        buttonClassName: 'min-w-[64px] px-2',
        targetPrice: priceFromPercent(startPrice, percent),
      })),
    [startPrice]
  );

  const activePricePreset = React.useMemo(() => {
    const match = pricePresetOptions.find(
      (option) => option.targetPrice && +option.targetPrice === slLowPrice
    );
    return match?.value ?? '';
  }, [slLowPrice, pricePresetOptions]);

  const slAlerts: BotFormAlert[] = errors['sl']
    ? [{ variant: 'error', message: errors['sl'], navId: 'sl' }]
    : [];

  if (!isEnabled) {
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
          name="Bot close type"
          tooltip="Select the order type used when executing the stop loss."
        >
          <Select
            value={slLimit ? 'limit' : 'market'}
            onValueChange={(value) =>
              updateFormData('slLimit', value === 'limit')
            }
          >
            <SelectTrigger id="grid-sl-close-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="limit">Limit</SelectItem>
              <SelectItem value="market">Market</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          name="Stop loss condition"
          tooltip="Choose whether to trigger by percentage drawdown or a price target."
        >
          <Select
            value={slCondition}
            onValueChange={(value: 'valueChanged' | 'priceReached') =>
              updateFormData('slCondition', value)
            }
          >
            <SelectTrigger id="grid-sl-condition">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        {slCondition === 'valueChanged' ? (
          <SettingsRow
            name="Stop loss (%)"
            tooltip="Close the bot once unrealised losses reach the configured percentage."
          >
            <div className="space-y-xs">
              <NumberInput
                id="grid-sl-percentage"
                value={`${slPerc ?? ''}`}
                onChange={(value) =>
                  updateFormData(
                    'slPerc',
                    typeof value === 'string' ? value : value.toString()
                  )
                }
                placeholder="Loss threshold in percentage"
                showControls={false}
                endAdornment={unitAdornment('%', { size: 'sm' })}
              />
              <TerminalButtonStack
                value={`${slPerc ?? ''}`}
                onValueChange={(next) => {
                  const numeric = Number.parseFloat(next);
                  if (!Number.isNaN(numeric)) {
                    applyPercentPreset(numeric);
                  }
                }}
                options={percentagePresets}
              />
            </div>
          </SettingsRow>
        ) : (
          <SettingsRow
            name={`Stop loss price (${quoteAsset || 'quote'})`}
            tooltip="Trigger the stop loss when the market reaches this price."
          >
            <div className="space-y-xs">
              <NumberInput
                id="grid-sl-price"
                value={slLowPrice ?? ''}
                onChange={(value) =>
                  updateFormData(
                    'slLowPrice',
                    typeof value === 'string' ? value : value.toString()
                  )
                }
                placeholder="Limit price"
                showControls={false}
                endAdornment={
                  <span className="inline-flex items-center gap-2">
                    {unitAdornment(quoteAsset ?? 'quote', {
                      size: 'sm',
                      className: 'whitespace-nowrap',
                    })}
                    {setActivePickerField && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (setCoordinates) {
                            setCoordinates(null);
                          }
                          setActivePickerField((prev) =>
                            prev === 'slLowPrice' ? false : 'slLowPrice'
                          );
                        }}
                        className={
                          activePickerField === 'slLowPrice'
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
              />
              <TerminalButtonStack
                value={activePricePreset}
                onValueChange={(next) => {
                  const numeric = Number.parseFloat(next);
                  if (!Number.isNaN(numeric)) {
                    applyPricePercent(numeric);
                  }
                }}
                options={pricePresetOptions.map(
                  ({ value, label, buttonClassName }) => ({
                    value,
                    label,
                    buttonClassName,
                  })
                )}
              />
            </div>
          </SettingsRow>
        )}

        <SettingsRow
          name="Stop loss action"
          tooltip="Define how the bot handles assets when the stop loss fires."
        >
          <Select
            value={
              (slAction as (typeof actionOptions)[number]['value']) || 'stop'
            }
            onValueChange={(value: (typeof actionOptions)[number]['value']) =>
              updateFormData('slAction', value)
            }
          >
            <SelectTrigger id="grid-sl-action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          name="Trailing stop loss"
          tooltip="Automatically reduce risk when the market moves in your favour."
          tooltipURL="/help/trailing-stop-loss"
        >
          <div className="flex items-center justify-between gap-sm rounded-lg border border-dashed border-border bg-inner-container px-3 py-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-xs">
              <Info className="h-4 w-4" aria-hidden="true" />
              <span>
                Trailing stop loss is not yet supported for grid bots.
              </span>
            </div>
            <div className="flex items-center gap-xs">
              <Switch
                disabled
                checked={false}
                aria-label="Trailing stop loss unavailable"
              />
              <Badge variant="outline" className="text-xs uppercase">
                Pending
              </Badge>
            </div>
          </div>
        </SettingsRow>

      </MasonryLayout>
      {slAlerts.length > 0 ? (
        <div className="mt-2 flex justify-end">
          <BotFormAlertSummary alerts={slAlerts} />
        </div>
      ) : null}
    </>
  );
};
