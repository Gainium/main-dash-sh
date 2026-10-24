import { Calendar as CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { CalendarMonth } from './calendar-month';
import {
  formatDateInputDisplay,
  fromDateInputValue,
  isDateInRange as inRange,
  parseDateInput,
  toDateInputValue,
} from './date-time-values';
import { PickerField, type PickerInputAttributes } from './picker-field';

// Themed drop-in for `<input type="date">`. Emits exactly what the native input
// did: 'YYYY-MM-DD' (a calendar day, no time zone), or '' when cleared.

export interface DateInputProps extends PickerInputAttributes {
  /** 'YYYY-MM-DD' or ''. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable day, 'YYYY-MM-DD'. */
  min?: string;
  /** Latest selectable day, 'YYYY-MM-DD'. */
  max?: string;
  /** Offer a clear button and accept an emptied field (emits ''). */
  clearable?: boolean;
  containerClassName?: string;
}

interface DatePickerPanelProps {
  current: string | null;
  min?: string;
  max?: string;
  onSelect: (value: string) => void;
}

const DatePickerPanel: React.FC<DatePickerPanelProps> = ({
  current,
  min,
  max,
  onSelect,
}) => {
  const currentDate = fromDateInputValue(current);
  const [month, setMonth] = React.useState(
    () => currentDate ?? fromDateInputValue(min) ?? new Date()
  );
  // Follow the day being typed into the field.
  React.useEffect(() => {
    const date = fromDateInputValue(current);
    if (date) setMonth(date);
  }, [current]);

  return (
    <CalendarMonth
      month={month}
      onMonthChange={setMonth}
      selected={currentDate}
      onSelect={(date) => onSelect(toDateInputValue(date))}
      isDisabled={(date) => !inRange(toDateInputValue(date), min, max)}
    />
  );
};

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, min, max, placeholder = 'YYYY-MM-DD', ...props }, ref) => {
    const parse = (text: string) => {
      const parsed = parseDateInput(text);
      return parsed && inRange(parsed, min, max) ? parsed : null;
    };

    const stepValue = (current: string | null, direction: 1 | -1) => {
      const date = fromDateInputValue(current);
      if (!date) {
        const today = toDateInputValue(new Date());
        return inRange(today, min, max) ? today : (min?.slice(0, 10) ?? null);
      }
      date.setDate(date.getDate() + direction);
      const next = toDateInputValue(date);
      return inRange(next, min, max) ? next : null;
    };

    return (
      <PickerField
        ref={ref}
        {...props}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode="text"
        parse={parse}
        format={formatDateInputDisplay}
        stepValue={stepValue}
        icon={<CalendarIcon className="h-4 w-4" />}
        pickerLabel="Choose date"
        clearLabel="Clear date"
        popoverClassName="w-80 p-3 md:p-3"
        onPickerOpen={(content, viaKeyboard) => {
          if (!viaKeyboard) return;
          const target =
            content.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
            content.querySelector<HTMLElement>('button[aria-current="date"]') ??
            content.querySelector<HTMLElement>(
              '[data-calendar-days] button:not(:disabled)'
            );
          target?.focus();
        }}
        renderPicker={({ current, pick }) => (
          <DatePickerPanel
            current={current}
            min={min}
            max={max}
            onSelect={(day) => pick(day, { close: true })}
          />
        )}
      />
    );
  }
);
DateInput.displayName = 'DateInput';
