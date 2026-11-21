import React from 'react';
import { QuickValueButtons } from './quick-value-buttons';

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
}

/**
 * Equal-width quick buttons under a field. A thin adapter over
 * `QuickValueButtons` (layout `equal`), so every quick-fill row in the app
 * shares one look.
 */
export const QuickInputFormButtons: React.FC<QuickInputFormButtonsProps> = ({
  buttons,
  onButtonClick,
  disabled = false,
  className,
}) => {
  const active = buttons.find((b) => b.isActive);
  return (
    <QuickValueButtons
      layout="equal"
      className={className}
      disabled={disabled}
      value={active ? String(active.value) : ''}
      options={buttons.map((b) => ({
        value: String(b.value),
        label: b.label,
        disabled: b.disabled,
      }))}
      onValueChange={(next) => {
        const button = buttons.find((b) => String(b.value) === next);
        if (button) {
          onButtonClick(button.value);
        }
      }}
    />
  );
};
