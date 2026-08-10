import { cn } from '@/lib/utils';
import React, { useMemo } from 'react';
import { Button } from './button';

export interface QuickInputButton {
  value: number | string;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
}

interface QuickInputFormButtonsProps {
  buttons: QuickInputButton[];
  onButtonClick: (value: number | string) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  activeVariant?: 'default' | 'secondary';
  inactiveVariant?: 'secondary' | 'outline';
}

/**
 * QuickInputFormButtons - A responsive component for displaying quick input buttons
 * under form fields. Automatically arranges buttons in 1, 2, or 3 rows based on
 * the number of buttons and available width.
 *
 * @example
 * <QuickInputFormButtons
 *   buttons={[
 *     { value: 1, label: '1%', isActive: false },
 *     { value: 2, label: '2%', isActive: true },
 *     { value: 3, label: '3%', isActive: false },
 *   ]}
 *   onButtonClick={(value) => handlePercentSelect(value)}
 * />
 */
export const QuickInputFormButtons: React.FC<QuickInputFormButtonsProps> = ({
  buttons,
  onButtonClick,
  disabled = false,
  className,
  buttonClassName,
  activeVariant = 'default',
  inactiveVariant = 'outline',
}) => {
  // Determine grid layout based on number of buttons
  const gridColsClass = useMemo(() => {
    const count = buttons.length;

    // For 1-3 buttons: single row
    if (count <= 3) {
      return `grid-cols-${count}`;
    }

    // For 4 buttons: 2x2 grid on mobile, 4 columns on desktop
    if (count === 4) {
      return 'grid-cols-2 sm:grid-cols-4';
    }

    // For 5 buttons: always 5 columns (fits well on most screens)
    if (count === 5) {
      return 'grid-cols-3 sm:grid-cols-5';
    }

    // For 6 buttons: 3x2 on mobile, 6 on desktop
    if (count === 6) {
      return 'grid-cols-3 sm:grid-cols-6';
    }

    // For 7-8 buttons: 4 columns on mobile, wrap to multiple rows
    if (count <= 8) {
      return 'grid-cols-4 sm:grid-cols-4';
    }

    // For 9+ buttons: 3 columns on mobile, 5 on desktop
    return 'grid-cols-3 sm:grid-cols-5';
  }, [buttons.length]);

  if (buttons.length === 0) {
    return null;
  }

  return (
    <div
      className={cn('grid gap-xs', gridColsClass, className)}
      role="group"
      aria-label="Quick input options"
    >
      {buttons.map((button, index) => {
        const isDisabled = disabled || button.disabled;
        const isActive = button.isActive ?? false;

        return (
          <Button
            key={`quick-btn-${button.value}-${index}`}
            type="button"
            variant={isActive ? activeVariant : inactiveVariant}
            size="sm"
            className={cn('h-8 text-xs px-1', buttonClassName)}
            onClick={() => !isDisabled && onButtonClick(button.value)}
            disabled={isDisabled}
            aria-pressed={isActive}
          >
            {button.label}
          </Button>
        );
      })}
    </div>
  );
};
