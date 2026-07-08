import { Crosshair } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';

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

export const GridTakeProfitSettings: React.FC = () => {
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
  const tpSl = useBotFormSelector('tpSl');
  const tpSlLimit = useBotFormSelector('tpSlLimit');
  const tpPerc = useBotFormSelector('tpPerc');
  const tpTopPrice = useBotFormSelector('tpTopPrice');
  const tpSlCondition = useBotFormSelector('tpSlCondition');
  const _startPrice = useBotFormSelector('startPrice');
  const tpSlAction = useBotFormSelector('tpSlAction');
  const futures = useBotFormSelector('futures');
  const actionOptions = useMemo(
    () => buildActionOptions(futures ?? false),
    [futures]
  );
  const isEnabled = useMemo(() => tpSl ?? false, [tpSl]);
  const startPrice = useMemo(
    () =>
      parse(_startPrice || formData.initialPrice || `${latestPrice}` || '0'),
    [_startPrice, formData.initialPrice, latestPrice]
  );
  const tpCondition = useMemo(
    () => (tpSlCondition as 'valueChanged' | 'priceReached') || 'valueChanged',
    [tpSlCondition]
  );

  const applyPercentPreset = (percent: number) => {
    updateFormData('tpPerc', percent.toString());
  };

  const applyPricePercent = (percent: number) => {
    const price = priceFromPercent(startPrice, percent);
    if (price) {
      updateFormData('tpTopPrice', price);
    }
  };

  useEffect(() => {
    if (!coordinates) {
      return;
    }
    if (
      tpSlCondition === 'priceReached' &&
      activePickerField === 'tpTopPrice'
    ) {
      updateFormData('tpTopPrice', coordinates.price?.toString() || '');
      if (setCoordinates) {
        setCoordinates(null);
      }
    }
  }, [
    coordinates,
    setCoordinates,
    tpSlCondition,
    updateFormData,
    activePickerField,
  ]);

  const percentagePresets = React.useMemo(
    () =>
      [5, 10, 15, 20, 25].map((percent) => ({
        value: percent.toString(),
        label: `${percent}%`,
        buttonClassName: 'min-w-[64px] px-2',
      })),
    []
  );

  const pricePresetOptions = React.useMemo(
    () =>
      [5, 10].map((percent) => ({
        percent,
        value: percent.toString(),
        label: `+${percent}%`,
        buttonClassName: 'min-w-[64px] px-2',
        targetPrice: priceFromPercent(startPrice, percent),
      })),
    [startPrice]
  );

  const activePricePreset = React.useMemo(() => {
    const match = pricePresetOptions.find(
      (option) => option.targetPrice && +option.targetPrice === tpTopPrice
    );
    return match?.value ?? '';
  }, [tpTopPrice, pricePresetOptions]);

  const tpSlAlerts: BotFormAlert[] = errors['tpSl']
    ? [{ variant: 'error', message: errors['tpSl'], navId: 'tpSl' }]
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
          tooltip="Select the order type used when closing the bot."
        >
          <Select
            value={tpSlLimit ? 'limit' : 'market'}
            onValueChange={(value) =>
              updateFormData('tpSlLimit', value === 'limit')
            }
          >
            <SelectTrigger id="grid-tp-close-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="limit">Limit</SelectItem>
              <SelectItem value="market">Market</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          name="Take profit condition"
          tooltip="Decide whether to trigger on percentage gain or a target price."
        >
          <Select
            value={tpCondition}
            onValueChange={(value: 'valueChanged' | 'priceReached') =>
              updateFormData('tpSlCondition', value)
            }
          >
            <SelectTrigger id="grid-tp-condition">
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

        {tpCondition === 'valueChanged' ? (
          <SettingsRow
            name="Take profit (%)"
            tooltip="Trigger when unrealised returns reach the selected percentage."
          >
            <div className="space-y-xs">
              <NumberInput
                id="grid-tp-percentage"
                value={tpPerc ?? ''}
                onChange={(value) =>
                  updateFormData(
                    'tpPerc',
                    typeof value === 'string' ? value : value.toString()
                  )
                }
                placeholder="Profit target in percentage"
                showControls={false}
                endAdornment={unitAdornment('%', { size: 'sm' })}
              />
              <TerminalButtonStack
                value={`${tpPerc ?? ''}`}
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
            name={`Take profit price (${quoteAsset || 'quote'})`}
            tooltip="Close the bot once the market reaches the specified price."
          >
            <div className="space-y-xs">
              <NumberInput
                id="grid-tp-price"
                value={tpTopPrice ?? ''}
                onChange={(value) =>
                  updateFormData(
                    'tpTopPrice',
                    typeof value === 'string' ? value : value.toString()
                  )
                }
                placeholder="Target price"
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
                            prev === 'tpTopPrice' ? false : 'tpTopPrice'
                          );
                        }}
                        className={
                          activePickerField === 'tpTopPrice'
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
          name="Take profit action"
          tooltip="Choose what should happen once the condition is met."
        >
          <Select
            value={
              (tpSlAction as (typeof actionOptions)[number]['value']) || 'stop'
            }
            onValueChange={(value: (typeof actionOptions)[number]['value']) =>
              updateFormData('tpSlAction', value)
            }
          >
            <SelectTrigger id="grid-tp-action">
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

      </MasonryLayout>
      {tpSlAlerts.length > 0 ? (
        <div className="mt-2 flex justify-end">
          <BotFormAlertSummary alerts={tpSlAlerts} />
        </div>
      ) : null}
    </>
  );
};
