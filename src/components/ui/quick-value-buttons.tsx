import { cn } from '@/lib/utils';
import React from 'react';
import { Button } from './button';

export interface QuickValueOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  /** Native tooltip, e.g. why a preset is disabled. */
  title?: string;
}

export type QuickValueButtonsLayout = 'wrap' | 'row' | 'equal';

export interface QuickValueButtonsProps {
  options: QuickValueOption[];
  /** The option whose preset the field currently holds ('' = none). */
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /**
   * - `wrap` (default): compact buttons that wrap onto more lines.
   * - `row`: one line that scrolls sideways (beside an input).
   * - `equal`: equal-width buttons filling the row.
   */
  layout?: QuickValueButtonsLayout;
  /** Rendered after the buttons in the same row (e.g. a typeable % chip). */
  trailing?: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}

/** Columns for the `equal` layout, by button count (mobile, then sm+). */
const equalCols = (count: number): string => {
  if (count <= 3) return ['grid-cols-1', 'grid-cols-2', 'grid-cols-3'][Math.max(0, count - 1)];
  if (count === 4) return 'grid-cols-2 sm:grid-cols-4';
  if (count === 5) return 'grid-cols-3 sm:grid-cols-5';
  if (count === 6) return 'grid-cols-3 sm:grid-cols-6';
  if (count <= 8) return 'grid-cols-4';
  return 'grid-cols-3 sm:grid-cols-5';
};

/**
 * The one row of quick-fill buttons under or beside a field (25% / 50% / 75%,
 * +5% / +10%, 1:2 / 1:3 …). Neutral outline; the preset the field holds is
 * filled with the primary colour. Every quick-fill row in the app uses this —
 * segmented choices (Long/Short, Market/Limit) use `TerminalButtonStack`.
 */
export const QuickValueButtons: React.FC<QuickValueButtonsProps> = ({
  options,
  value = '',
  onValueChange,
  disabled = false,
  layout = 'wrap',
  trailing,
  className,
  'aria-label': ariaLabel = 'Quick values',
}) => {
  if (options.length === 0 && !trailing) {
    return null;
  }
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        layout === 'equal'
          ? cn('grid gap-xs', equalCols(options.length))
          : layout === 'row'
            ? 'flex flex-nowrap gap-xs overflow-x-auto whitespace-nowrap'
            : 'flex flex-wrap items-center gap-xs',
        className
      )}
    >
      {options.map((option) => {
        const isActive = value !== '' && option.value === value;
        const isDisabled = disabled || !!option.disabled;
        return (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            aria-pressed={isActive}
            title={option.title}
            disabled={isDisabled}
            className={cn(
              'h-8 px-3 text-xs',
              layout === 'equal' ? 'w-full px-1' : 'min-w-[52px] flex-none'
            )}
            onClick={() => {
              if (!isDisabled) {
                onValueChange(option.value);
              }
            }}
          >
            {option.label}
          </Button>
        );
      })}
      {trailing}
    </div>
  );
};

export default QuickValueButtons;
