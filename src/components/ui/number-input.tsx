import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';
import * as React from 'react';
import { Button } from './button';

interface NumberInputProps extends Omit<
  React.ComponentProps<'input'>,
  'onChange'
> {
  value?: number | string | undefined;
  onChange?: (value: number | string) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  showControls?: boolean;
  endAdornment?: React.ReactNode;
  startAdornment?: React.ReactNode;
  startAdornmentOnClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const NumberInput = React.memo(
  React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      value,
      onChange,
      min,
      max,
      step = 1,
      precision,
      showControls = true,
      endAdornment,
      startAdornment,
      startAdornmentOnClick,
      onBlur,
      ...props
    },
    ref
  ) => {
    // Local editing buffer. The input is otherwise fully controlled, so when a
    // parent normalises the value on every keystroke (e.g. dropping an empty
    // string), the field snaps back and becomes impossible to clear/retype.
    // While the user is typing we show their raw draft and still emit onChange;
    // on blur we let the controlled `value` take over again.
    const [draft, setDraft] = React.useState<string | null>(null);
    const displayValue = draft ?? value ?? '';
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setDraft(null);
      onBlur?.(e);
    };

    const handleIncrement = () => {
      const base =
        typeof displayValue === 'string'
          ? parseFloat(displayValue) || 0
          : displayValue || 0;
      const newValue = Math.min(base + step, max ?? Infinity);
      setDraft(null);
      if (precision !== undefined) {
        onChange?.(parseFloat(newValue.toFixed(precision)));
      } else {
        onChange?.(newValue);
      }
    };

    const handleDecrement = () => {
      const base =
        typeof displayValue === 'string'
          ? parseFloat(displayValue) || 0
          : displayValue || 0;
      const newValue = Math.max(base - step, min ?? -Infinity);
      setDraft(null);
      if (precision !== undefined) {
        onChange?.(parseFloat(newValue.toFixed(precision)));
      } else {
        onChange?.(newValue);
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      setDraft(inputValue);
      onChange?.(inputValue);
    };

    const isIncrementDisabled =
      max !== undefined &&
      (typeof value === 'string' ? parseFloat(value) || 0 : value || 0) >= max;
    const isDecrementDisabled =
      min !== undefined &&
      (typeof value === 'string' ? parseFloat(value) || 0 : value || 0) <= min;

    const hasStart = Boolean(startAdornment);

    // Nearly every field built on this input is a price, amount or percentage,
    // so the mobile keypad must offer a decimal separator: `numeric` renders a
    // digits-only keypad, leaving no way to type "0.5" on a phone. The handful
    // of whole-number fields (grid levels, active orders) pass
    // inputMode="numeric" themselves, and `{...props}` below overrides this.
    if (showControls) {
      return (
        <div className="relative flex items-center">
          <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            min={min}
            max={max}
            step={step}
            className={cn(
              'flex h-10 w-full rounded-l-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 text-base font-semibold text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
              hasStart && 'pl-10',
              // Hide number input arrows completely
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-appearance]:none [-moz-appearance:textfield]',
              endAdornment ? 'pr-10' : '',
              className
            )}
            ref={ref}
            {...props}
          />
          {hasStart && (
            <div className="absolute inset-y-0 left-2 flex items-center pl-1">
              <div
                data-adornment="true"
                className={cn(
                  'pointer-events-auto flex items-center select-none',
                  startAdornmentOnClick ? 'cursor-pointer' : ''
                )}
                onClick={(e) => startAdornmentOnClick?.(e)}
                role={startAdornmentOnClick ? 'button' : undefined}
                aria-hidden={startAdornmentOnClick ? undefined : true}
              >
                {startAdornment}
              </div>
            </div>
          )}
          {endAdornment && (
            <div className="absolute inset-y-0 right-7 flex items-center pr-1">
              <div className="pointer-events-auto text-sm text-muted-foreground select-none flex items-center">
                {endAdornment}
              </div>
            </div>
          )}
          <div className="flex flex-col border border-l-0 border-border/50 rounded-r-md bg-card w-7">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-stepper-button
              className="stepper-button h-5 px-0 rounded-none rounded-tr-md border-b border-border/50 bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors flex-1"
              onClick={handleIncrement}
              disabled={isIncrementDisabled || props.disabled}
              title="Increase"
            >
              <ChevronUp className="w-3 h-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-stepper-button
              className="stepper-button h-5 px-0 rounded-none rounded-br-md bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-0 focus-visible:ring-offset-0 transition-colors flex-1"
              onClick={handleDecrement}
              disabled={isDecrementDisabled || props.disabled}
              title="Decrease"
            >
              <ChevronDown className="w-3 h-3" />
            </Button>
          </div>
        </div>
      );
    }

    // Fallback to regular input without controls
    if (endAdornment) {
      return (
        <div className="relative flex items-center">
          <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            min={min}
            max={max}
            step={step}
            className={cn(
              'flex h-10 w-full rounded-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 pr-10 text-base font-semibold text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
              hasStart && 'pl-10',
              // Hide number input arrows completely
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-appearance]:none [-moz-appearance:textfield]',
              className
            )}
            ref={ref}
            {...props}
          />
          {hasStart && (
            <div className="absolute inset-y-0 left-2 flex items-center pl-1">
              <div
                data-adornment="true"
                className={cn(
                  'pointer-events-auto flex items-center select-none',
                  startAdornmentOnClick ? 'cursor-pointer' : ''
                )}
                onClick={(e) => startAdornmentOnClick?.(e)}
                role={startAdornmentOnClick ? 'button' : undefined}
                aria-hidden={startAdornmentOnClick ? undefined : true}
              >
                {startAdornment}
              </div>
            </div>
          )}
          <div className="absolute inset-y-0 right-1 flex items-center">
            <div className="pointer-events-auto text-sm text-muted-foreground select-none flex items-center">
              {endAdornment}
            </div>
          </div>
        </div>
      );
    }

    return (
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        className={cn(
          'flex h-10 w-full rounded-md border border-border/50 bg-foreground/[0.04] hover:bg-foreground/[0.06] transition-colors px-3 py-2 text-base font-semibold text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
          hasStart && 'pl-10',
          // Hide number input arrows completely
          '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-appearance]:none [-moz-appearance:textfield]',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
  )
);

NumberInput.displayName = 'NumberInput';

export { NumberInput };
