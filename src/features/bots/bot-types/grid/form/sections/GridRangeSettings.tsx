import { Button } from '@/components/ui/button';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import { useBotFormSelector } from '@/contexts/bots/form/BotFormProvider';
import { CustomPercentChip } from '@/features/bots/shared/components/CustomPercentChip';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useGridForm } from '@/hooks/bots/grid/useGridForm';
import { cn } from '@/lib/utils';
import type { BotFormAlert } from '@/types/bots/form';
import { Crosshair } from 'lucide-react';
import React, { useCallback, useEffect, useMemo } from 'react';

const buildErrorAlerts = (
  errors: Record<string, string | undefined>,
  field: string
): BotFormAlert[] =>
  errors[field]
    ? [{ variant: 'error', message: errors[field] as string, navId: field }]
    : [];

const formatPercent = (value: number) =>
  Number.isFinite(value) ? value.toFixed(2) : '';

const parseNumber = (value: string | number | undefined): number => {
  if (value === undefined) {
    return NaN;
  }
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const TOP_PRICE_PRESETS = [5, 10, 20, 30];
const LOW_PRICE_PRESETS = [-5, -10, -20, -30];

const computePriceFromPercent = (
  basePrice: number,
  percent: number
): string => {
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return '';
  }
  const ratio = percent / 100;
  const value = basePrice * (1 + ratio);
  return value > 0 ? value.toFixed(6) : '';
};

const computePercentFromPrice = (basePrice: number, price: number): string => {
  if (
    !Number.isFinite(basePrice) ||
    basePrice === 0 ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return '';
  }
  const percent = (price / basePrice - 1) * 100;
  return formatPercent(percent);
};

export const GridRangeSettings: React.FC = () => {
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
  const _startPrice = useBotFormSelector('startPrice');
  const _topPrice = useBotFormSelector('topPrice');
  const _lowPrice = useBotFormSelector('lowPrice');
  const levels = useBotFormSelector('levels');
  const gridStep = useBotFormSelector('gridStep');
  const gridType = useBotFormSelector('gridType');
  const sellDisplacement = useBotFormSelector('sellDisplacement');
  const startPrice = useMemo(
    () =>
      parseNumber(_startPrice || formData.initialPrice || latestPrice || '0'),
    [_startPrice, formData.initialPrice, latestPrice]
  );
  const topPrice = useMemo(() => parseNumber(_topPrice), [_topPrice]);
  const lowPrice = useMemo(() => parseNumber(_lowPrice), [_lowPrice]);

  // Minimum valid price = one tick of the exchange's price precision.
  // 0 is technically invalid on every exchange — the bot needs at
  // least one tick of headroom. Falls back to 1e-8 when precision
  // isn't known yet (e.g. pairPrecisionMap hasn't loaded).
  const priceTick = useMemo(() => {
    const pair = Array.isArray(formData.pair)
      ? formData.pair[0]
      : formData.pair;
    if (!pair) return 1e-8;
    const normalized = pair.replace(/[\s\-/]/g, '').toUpperCase();
    const precision =
      formData.pairPrecisionMap?.[normalized]?.pricePrecision ??
      formData.pairPrecisionMap?.[pair]?.pricePrecision;
    if (typeof precision === 'number' && precision >= 0) {
      return Math.pow(10, -precision);
    }
    return 1e-8;
  }, [formData.pair, formData.pairPrecisionMap]);

  // Geometric grid: levels and gridStep are derived from each other given
  // a fixed price range. The legacy dashboard recalculates the
  // counterpart whenever the user edits one of them
  // (`dash/components/gridbot/index.tsx`); without that coupling, typing
  // a new gridStep in this form changes nothing on the chart because
  // levels stays the same. Arithmetic grids don't use gridStep so the
  // coupling is skipped there.
  const recalcGridStepFromLevels = useCallback(
    (nextLevels: number) => {
      if (gridType !== 'geometric') return;
      if (
        !Number.isFinite(topPrice) ||
        !Number.isFinite(lowPrice) ||
        topPrice <= 0 ||
        lowPrice <= 0 ||
        topPrice <= lowPrice ||
        nextLevels <= 0
      ) {
        return;
      }
      const ratio = topPrice / lowPrice;
      const nextStep = (Math.pow(ratio, 1 / nextLevels) - 1) * 100;
      if (Number.isFinite(nextStep) && nextStep > 0) {
        updateFormData('gridStep', nextStep.toFixed(4));
      }
    },
    [gridType, topPrice, lowPrice, updateFormData]
  );

  const recalcLevelsFromGridStep = useCallback(
    (nextStepStr: string) => {
      if (gridType !== 'geometric') return;
      const stepNum = Number(nextStepStr);
      if (
        !Number.isFinite(stepNum) ||
        stepNum <= 0 ||
        !Number.isFinite(topPrice) ||
        !Number.isFinite(lowPrice) ||
        topPrice <= 0 ||
        lowPrice <= 0 ||
        topPrice <= lowPrice
      ) {
        return;
      }
      const nextLevels = Math.ceil(
        Math.log(topPrice / lowPrice) / Math.log(1 + stepNum / 100)
      );
      if (Number.isFinite(nextLevels) && nextLevels > 0) {
        updateFormData('levels', nextLevels);
      }
    },
    [gridType, topPrice, lowPrice, updateFormData]
  );

  useEffect(() => {
    if (!coordinates || !activePickerField) {
      return;
    }
    if (activePickerField === 'topPrice' || activePickerField === 'lowPrice') {
      updateFormData(activePickerField, coordinates.price?.toString() || '');
    }
    if (setCoordinates) {
      setCoordinates(null);
    }
  }, [coordinates, setCoordinates, updateFormData, activePickerField]);

  const [topPercent, setTopPercent] = React.useState<string>(() =>
    computePercentFromPrice(startPrice, topPrice)
  );
  const [lowPercent, setLowPercent] = React.useState<string>(() =>
    computePercentFromPrice(startPrice, lowPrice)
  );

  React.useEffect(() => {
    setTopPercent(computePercentFromPrice(startPrice, topPrice));
  }, [startPrice, topPrice]);

  React.useEffect(() => {
    setLowPercent(computePercentFromPrice(startPrice, lowPrice));
  }, [startPrice, lowPrice]);

  const applyPercentToTop = (percent: number) => {
    const price = computePriceFromPercent(startPrice, percent);
    if (price) {
      updateFormData('topPrice', price);
      setTopPercent(formatPercent(percent));
    }
  };

  const applyPercentToLow = (percent: number) => {
    const price = computePriceFromPercent(startPrice, percent);
    if (price) {
      updateFormData('lowPrice', price);
      setLowPercent(formatPercent(percent));
    }
  };

  const handleGridTypeChange = (next: 'geometric' | 'arithmetic') => {
    updateFormData('gridType', next);
  };

  const quoteLabel = quoteAsset || 'quote';
  const quoteAdornment = unitAdornment(quoteLabel, {
    size: 'sm',
    className: 'whitespace-nowrap',
  });

  return (
    <MasonryLayout
      gap={16}
      containerBreakpoints={{
        default: 1,
        640: 2,
        1024: 3,
      }}
    >
        <SettingsRow
          name={`Top price (${quoteLabel})`}
          tooltip="Set the upper limit for the grid to operate within."
          navId="topPrice"
          alerts={buildErrorAlerts(errors, 'topPrice')}
        >
          <div className="space-y-xs">
            <NumberInput
              id="grid-top-price"
              value={topPrice ?? ''}
              min={priceTick}
              onChange={(value) => {
                // Clamp below-tick values at the source so the form
                // never carries an invalid (≤ 0) price.
                const numeric =
                  typeof value === 'string' ? parseFloat(value) : value;
                const clamped =
                  Number.isFinite(numeric) && numeric < priceTick
                    ? priceTick
                    : value;
                updateFormData(
                  'topPrice',
                  typeof clamped === 'string' ? clamped : clamped.toString()
                );
              }}
              onBlur={(event) => {
                const priceValue = parseNumber(event.target.value);
                setTopPercent(computePercentFromPrice(startPrice, priceValue));
              }}
              placeholder="Upper boundary"
              showControls={false}
              endAdornment={
                <span className="inline-flex items-center gap-2">
                  {quoteAdornment}
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
                          prev === 'topPrice' ? false : 'topPrice'
                        );
                      }}
                      className={
                        activePickerField === 'topPrice'
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
              value={topPercent ?? ''}
              onValueChange={(next) => {
                const numeric = Number.parseFloat(next);
                if (Number.isFinite(numeric)) {
                  applyPercentToTop(numeric);
                }
              }}
              options={TOP_PRICE_PRESETS.map((percent) => ({
                value: formatPercent(percent),
                label: `+${percent}%`,
                buttonClassName: 'min-w-[64px] px-2',
              }))}
              trailing={
                <CustomPercentChip
                  sign={1}
                  currentPercent={Number.parseFloat(topPercent)}
                  presets={TOP_PRICE_PRESETS}
                  onApply={applyPercentToTop}
                />
              }
            />
            <p className="text-xs text-muted-foreground max-w-[540px]">
              Quick adjustments use your start price ({startPrice || 'n/a'}) as
              a reference.
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          name={`Low price (${quoteLabel})`}
          tooltip="Define how far the grid can extend downward. Wider ranges capture more volatility but require additional capital."
          navId="lowPrice"
          alerts={buildErrorAlerts(errors, 'lowPrice')}
        >
          <div className="space-y-xs">
            <NumberInput
              id="grid-low-price"
              value={lowPrice ?? ''}
              min={priceTick}
              onChange={(value) => {
                // Clamp below-tick values at the source so the form
                // never carries an invalid (≤ 0) price.
                const numeric =
                  typeof value === 'string' ? parseFloat(value) : value;
                const clamped =
                  Number.isFinite(numeric) && numeric < priceTick
                    ? priceTick
                    : value;
                updateFormData(
                  'lowPrice',
                  typeof clamped === 'string' ? clamped : clamped.toString()
                );
              }}
              onBlur={(event) => {
                const priceValue = parseNumber(event.target.value);
                setLowPercent(computePercentFromPrice(startPrice, priceValue));
              }}
              placeholder="Lower boundary"
              showControls={false}
              endAdornment={
                <span className="inline-flex items-center gap-2">
                  {quoteAdornment}
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
                          prev === 'lowPrice' ? false : 'lowPrice'
                        );
                      }}
                      className={
                        activePickerField === 'lowPrice'
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
              value={lowPercent ?? ''}
              onValueChange={(next) => {
                const numeric = Number.parseFloat(next);
                if (Number.isFinite(numeric)) {
                  applyPercentToLow(numeric);
                }
              }}
              options={LOW_PRICE_PRESETS.map((percent) => ({
                value: formatPercent(percent),
                label: `${percent}%`,
                buttonClassName: 'min-w-[64px] px-2',
              }))}
              trailing={
                <CustomPercentChip
                  sign={-1}
                  currentPercent={Number.parseFloat(lowPercent)}
                  presets={LOW_PRICE_PRESETS}
                  onApply={applyPercentToLow}
                />
              }
            />
          </div>
        </SettingsRow>

        <SettingsRow
          name="Grid levels"
          tooltip="Specify how many buy and sell levels compose the grid. More levels increase sensitivity but spread capital thinner per order."
          navId="levels"
          alerts={buildErrorAlerts(errors, 'levels')}
        >
          <div className="space-y-xs">
            <NumberInput
              id="grid-levels"
              inputMode="numeric"
              value={(levels ?? '').toString()}
              onChange={(value) => {
                if (value === '') {
                  updateFormData('levels', 0);
                  return;
                }

                const parsed =
                  typeof value === 'string' ? Number(value) : value;
                const nextLevels = Number.isFinite(parsed) ? parsed : 0;
                updateFormData('levels', nextLevels);
                recalcGridStepFromLevels(nextLevels);
              }}
              placeholder="Number of levels"
              min={1}
              step={1}
              precision={0}
              showControls={false}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          name="Grid step (%)"
          tooltip="Control the spacing between adjacent grid orders."
          tooltipURL="/help/grid-step"
          navId="gridStep"
          alerts={buildErrorAlerts(errors, 'gridStep')}
        >
          <div className="space-y-xs">
            <NumberInput
              id="grid-step"
              value={gridStep ?? ''}
              onChange={(value) => {
                const nextStep =
                  typeof value === 'string' ? value : value.toString();
                updateFormData('gridStep', nextStep);
                recalcLevelsFromGridStep(nextStep);
              }}
              disabled={gridType === 'arithmetic'}
              placeholder="Distance between levels"
              showControls={false}
              endAdornment={unitAdornment('%', { size: 'sm' })}
            />
            <p
              className={cn(
                'text-xs text-muted-foreground max-w-[640px]',
                gridType === 'arithmetic' && 'italic'
              )}
            >
              {gridType === 'arithmetic'
                ? 'Arithmetic grids maintain a fixed absolute price offset, so step is derived automatically.'
                : 'Geometric grids use a percentage offset for consistent proportional spacing.'}
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          name="Grid type"
          tooltip="Choose how price spacing is calculated between grid levels. Geometric grids allocate more buy orders as price decreases, ideal for trending markets. Arithmetic grids keep uniform spacing and are easier to reason about."
          tooltipURL="/help/arithmetic-and-geometric-grid-types"
          navId="gridType"
        >
          <div className="space-y-sm">
            <TerminalButtonStack
              value={gridType ?? ''}
              onValueChange={(next) =>
                handleGridTypeChange(next as 'geometric' | 'arithmetic')
              }
              options={[
                { value: 'geometric', label: 'Geometric' },
                { value: 'arithmetic', label: 'Arithmetic' },
              ]}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          name="Sell displacement (%)"
          tooltip="Offset sell orders relative to their paired buys to widen profit targets."
          tooltipURL="/help/sell-displacement"
          alerts={buildErrorAlerts(errors, 'sellDisplacement')}
        >
          <div className="space-y-xs">
            <NumberInput
              id="grid-sell-displacement"
              value={sellDisplacement ?? ''}
              onChange={(value) =>
                updateFormData(
                  'sellDisplacement',
                  typeof value === 'string' ? value : value.toString()
                )
              }
              placeholder="Offset between corresponding buy/sell orders"
              showControls={false}
              endAdornment={unitAdornment('%', { size: 'sm' })}
            />
            <p className="text-xs text-muted-foreground max-w-[640px]">
              Increase the distance between matched buy and sell orders. Minimum
              should cover exchange fees; larger values widen profit targets.
            </p>
          </div>
        </SettingsRow>
    </MasonryLayout>
  );
};
