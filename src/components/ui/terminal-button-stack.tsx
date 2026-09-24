import { cn } from '@/lib/utils';
import React from 'react';
import { Button } from './button';

export interface TerminalButtonOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  buttonClassName?: string;
}

interface TerminalButtonStackProps {
  value: string;
  options: TerminalButtonOption[];
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  /** Rendered after the option buttons, inside the same wrapping row. */
  trailing?: React.ReactNode;
}

export const TerminalButtonStack: React.FC<TerminalButtonStackProps> = ({
  value,
  options,
  onValueChange,
  className,
  disabled = false,
  trailing,
}) => {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = Boolean(disabled || option.disabled);
        const baseButtonClasses = option.buttonClassName
          ? 'h-9 text-sm'
          : 'flex-1 min-w-[120px] h-9 text-sm';

        return (
          <Button
            key={option.value}
            type="button"
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className={cn(
              baseButtonClasses,
              isActive
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground border-primary'
                : 'border-primary text-primary hover:bg-primary/10',
              option.buttonClassName,
              isDisabled && 'pointer-events-none opacity-60'
            )}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled || option.value === value) {
                return;
              }
              onValueChange(option.value);
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

export default TerminalButtonStack;
