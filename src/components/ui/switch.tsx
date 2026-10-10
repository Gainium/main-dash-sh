import { cn } from '@/lib/utils';
import * as React from 'react';

interface SwitchProps extends Omit<
  React.ComponentProps<'input'>,
  'onChange' | 'type' | 'size'
> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  size?: 'sm' | 'md' | 'lg';
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  (
    {
      className,
      checked = false,
      onCheckedChange,
      disabled = false,
      size = 'md',
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: {
        container: 'h-4 w-8',
        thumb: 'h-3 w-3',
        thumbOffset: 'top-0.5 left-0.5',
        translate: 'translate-x-4',
      },
      md: {
        container: 'h-5 w-9',
        thumb: 'h-4 w-4',
        thumbOffset: 'top-0.5 left-0.5',
        translate: 'translate-x-4',
      },
      lg: {
        container: 'h-6 w-11',
        thumb: 'h-5 w-5',
        thumbOffset: 'top-0.5 left-0.5',
        translate: 'translate-x-5',
      },
    };

    const { container, thumb, thumbOffset, translate } = sizeClasses[size];

    return (
      <label
        className={cn(
          'relative inline-flex items-center',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          className
        )}
      >
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          disabled={disabled}
          ref={ref}
          className={cn(
            'opacity-0 absolute inset-0 w-full h-full z-10',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          )}
          {...props}
        />
        <div
          className={cn(
            'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            container,
            disabled && checked
              ? 'color-gradient opacity-60'
              : disabled
                ? 'bg-muted border-border/50 cursor-not-allowed'
                : checked
                  ? 'color-gradient'
                  : 'bg-foreground/15 hover:bg-foreground/20 dark:bg-border dark:hover:bg-border/70'
          )}
        >
          <span
            className={cn(
              'pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ease-in-out',
              thumb,
              thumbOffset,
              checked ? translate : 'translate-x-0'
            )}
          />
        </div>
      </label>
    );
  }
);

Switch.displayName = 'Switch';

export { Switch };
export type { SwitchProps };
