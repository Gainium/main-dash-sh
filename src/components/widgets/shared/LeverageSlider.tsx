import { AlertTriangle } from 'lucide-react';
import React from 'react';

import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { NumberInput } from '../../ui/number-input';
import { Slider } from '../../ui/slider';

interface LeverageSliderProps {
  value: number;
  onChange: (value: number) => void;
  /** Optional editable input value (draft string while typing). */
  inputValue?: number | string;
  onInputChange?: (value: number | string) => void;
  onInputBlur?: React.FocusEventHandler<HTMLInputElement>;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}

const LeverageSlider: React.FC<LeverageSliderProps> = ({
  value,
  onChange,
  inputValue,
  onInputChange,
  onInputBlur,
  min = 1,
  max = 125,
  step = 1,
  className = '',
  disabled = false,
}) => {
  // A tight set of common presets, filtered to the exchange's max and
  // always including the max itself (slider/number-input cover the rest).
  const presetValues = Array.from(
    new Set([...[1, 5, 25, 50, 100].filter((preset) => preset <= max), max])
  ).sort((a, b) => a - b);

  const handlePresetClick = (presetValue: number) => {
    if (disabled) {
      return;
    }

    onChange(presetValue);
  };

  const handleSliderChange = (nextValue: number) => {
    if (disabled) {
      return;
    }

    onChange(nextValue);
  };

  const formatLeverage = (val: number) => `${val}x`;

  return (
    <div className={cn('space-y-sm', className)}>
      {/* Number input + slider share one full-width row */}
      <div className="flex items-center gap-sm">
        {onInputChange && (
          <div className="w-28 shrink-0">
            <NumberInput
              value={inputValue}
              onChange={onInputChange}
              onBlur={onInputBlur}
              min={min}
              max={max}
              step={step}
              endAdornment={
                <span className="text-sm text-muted-foreground">×</span>
              }
              aria-label="Leverage"
              disabled={disabled}
            />
          </div>
        )}
        <div className="flex-1">
          <Slider
            value={value}
            onChange={handleSliderChange}
            min={min}
            max={max}
            step={step}
            className="w-full"
            disabled={disabled}
          />
        </div>
        <div className="w-10 shrink-0 text-right text-lg font-bold tabular-nums text-primary">
          {formatLeverage(value)}
        </div>
      </div>

      {/* Quick-select presets — single full-width row */}
      <div className="grid grid-cols-6 gap-xs">
        {presetValues.map((preset) => (
          <Button
            key={preset}
            variant={value === preset ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetClick(preset)}
            className={cn(
              'h-8 text-xs',
              value === preset
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'hover:border-primary/30 hover:bg-primary/10'
            )}
            disabled={disabled}
          >
            {formatLeverage(preset)}
          </Button>
        ))}
      </div>

      {/* Risk Warning */}
      {value > 10 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-sm">
          <div className="flex items-start gap-xs">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 text-warning"
              aria-hidden="true"
            />
            <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold uppercase tracking-wide text-warning">
                High leverage warning
              </p>
              <p>
                {formatLeverage(value)} leverage significantly increases risk. A
                1% price movement will result in a {value}% change to your
                position.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeverageSlider;
