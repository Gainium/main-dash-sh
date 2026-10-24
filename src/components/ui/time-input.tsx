import { Clock } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { formatTimeInput, parseTimeInput } from './date-time-values';
import { PickerField, type PickerInputAttributes } from './picker-field';

// Themed drop-in for `<input type="time">`. Emits exactly what the native input
// did: 'HH:MM' in 24-hour time, or '' when cleared.

export interface TimeInputProps extends PickerInputAttributes {
  /** 'HH:MM' (24-hour) or ''. */
  value: string;
  onChange: (value: string) => void;
  /** Seconds, as on the native input: 300 lists minutes in 5-minute steps. */
  step?: number;
  /** Offer a clear button and accept an emptied field (emits ''). */
  clearable?: boolean;
  containerClassName?: string;
}

const toParts = (hhmm: string | null) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return { hours: h, minutes: m };
};

const minuteStepOf = (step?: number) =>
  step && step >= 60 ? Math.max(1, Math.min(60, Math.round(step / 60))) : 1;

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const scrollSelectedIntoView = (list: HTMLElement) => {
  const option = list.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!option) return;
  list.scrollTop =
    option.offsetTop - list.clientHeight / 2 + option.offsetHeight / 2;
};

interface TimeColumnProps {
  label: string;
  items: number[];
  selected: number | undefined;
  onPick: (item: number) => void;
}

const TimeColumn: React.FC<TimeColumnProps> = ({
  label,
  items,
  selected,
  onPick,
}) => {
  const tabbable = items.includes(selected ?? -1) ? selected : items[0];

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')
    );
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => {
      const target = options[Math.max(0, Math.min(options.length - 1, i))];
      target?.focus();
      target?.scrollIntoView?.({ block: 'nearest' });
    };
    if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(options.length - 1);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const columns = Array.from(
        event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
          '[role="listbox"]'
        ) ?? []
      );
      const next =
        columns[
          columns.indexOf(event.currentTarget) +
            (event.key === 'ArrowRight' ? 1 : -1)
        ];
      next?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
    } else return;
    event.preventDefault();
  };

  return (
    <div
      role="listbox"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="relative h-56 w-14 overflow-y-auto overscroll-contain space-y-0.5 pr-0.5"
    >
      {items.map((item) => {
        const isSelected = item === selected;
        return (
          <button
            key={item}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={item === tabbable ? 0 : -1}
            onClick={() => onPick(item)}
            className={cn(
              'flex h-8 w-full items-center justify-center rounded-md text-sm tabular-nums transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50',
              isSelected
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'text-foreground hover:bg-muted'
            )}
          >
            {String(item).padStart(2, '0')}
          </button>
        );
      })}
    </div>
  );
};

export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ value, onChange, step, placeholder = '--:--', ...props }, ref) => {
    const minuteStep = minuteStepOf(step);
    const minutes = React.useMemo(
      () =>
        Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep),
      [minuteStep]
    );

    const stepValue = (current: string | null, direction: 1 | -1) => {
      const parts = toParts(current);
      if (!parts) return formatTimeInput(0, 0);
      const total =
        (parts.hours * 60 + parts.minutes + direction * minuteStep + 1440) %
        1440;
      return formatTimeInput(Math.floor(total / 60), total % 60);
    };

    return (
      <PickerField
        ref={ref}
        {...props}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        parse={parseTimeInput}
        format={(v) => v}
        stepValue={stepValue}
        icon={<Clock className="h-4 w-4" />}
        pickerLabel="Choose time"
        clearLabel="Clear time"
        popoverClassName="p-1.5 md:p-1.5"
        onPickerOpen={(content, viaKeyboard) => {
          content
            .querySelectorAll<HTMLElement>('[role="listbox"]')
            .forEach(scrollSelectedIntoView);
          if (viaKeyboard) {
            content
              .querySelector<HTMLElement>('[role="listbox"] [tabindex="0"]')
              ?.focus();
          }
        }}
        renderPicker={({ current, pick }) => {
          const parts = toParts(current);
          return (
            <div className="flex gap-1">
              <TimeColumn
                label="Hours"
                items={HOURS}
                selected={parts?.hours}
                onPick={(h) => pick(formatTimeInput(h, parts?.minutes ?? 0))}
              />
              <div className="w-px self-stretch bg-border/60" />
              <TimeColumn
                label="Minutes"
                items={minutes}
                selected={parts?.minutes}
                onPick={(m) =>
                  pick(formatTimeInput(parts?.hours ?? 0, m), { close: true })
                }
              />
            </div>
          );
        }}
      />
    );
  }
);
TimeInput.displayName = 'TimeInput';
