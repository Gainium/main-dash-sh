import * as React from 'react';

import { cn } from '@/lib/utils';

import { DateInput } from './date-input';
import {
  clampDateTimeInput,
  splitDateTimeInput as splitValue,
} from './date-time-values';
import type { PickerInputAttributes } from './picker-field';
import { TimeInput } from './time-input';

// Themed drop-in for `<input type="datetime-local">`: a `DateInput` and a
// `TimeInput` side by side. Emits exactly what the native input did:
// 'YYYY-MM-DDTHH:mm' in local time, or '' while incomplete or cleared.

export interface DateTimeInputProps extends PickerInputAttributes {
  /** 'YYYY-MM-DDTHH:mm' (local) or ''. */
  value: string;
  onChange: (value: string) => void;
  /** Earliest allowed moment, 'YYYY-MM-DDTHH:mm'; later parts are ignored. */
  min?: string;
  /** Latest allowed moment, 'YYYY-MM-DDTHH:mm'; later parts are ignored. */
  max?: string;
  /** Seconds, passed to the time field's minute list. */
  step?: number;
  /** Offer a clear button on the date and accept an emptied field. */
  clearable?: boolean;
  containerClassName?: string;
}

export const DateTimeInput = React.forwardRef<
  HTMLInputElement,
  DateTimeInputProps
>(
  (
    {
      value,
      onChange,
      min,
      max,
      step,
      clearable,
      className,
      containerClassName,
      disabled,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const [parts, setParts] = React.useState(() => splitValue(value));
    React.useEffect(() => {
      setParts(splitValue(value));
    }, [value]);

    const update = (next: { date: string; time: string }) => {
      if (!next.date) {
        setParts(next);
        if (value !== '') onChange('');
        return;
      }
      const time = next.time || '00:00';
      const combined = clampDateTimeInput(`${next.date}T${time}`, min, max);
      setParts(splitValue(combined));
      if (combined !== value) onChange(combined);
    };

    return (
      <div className={cn('flex w-full items-center gap-1.5', containerClassName)}>
        <DateInput
          ref={ref}
          {...props}
          value={parts.date}
          onChange={(date) => update({ ...parts, date })}
          min={min?.slice(0, 10)}
          max={max?.slice(0, 10)}
          clearable={clearable}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel} date` : 'Date'}
          className={className}
          containerClassName="min-w-0 flex-1"
        />
        <TimeInput
          value={parts.time}
          onChange={(time) => update({ ...parts, time })}
          step={step}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel} time` : 'Time'}
          className={className}
          containerClassName="w-[6.5rem] shrink-0"
        />
      </div>
    );
  }
);
DateTimeInput.displayName = 'DateTimeInput';
