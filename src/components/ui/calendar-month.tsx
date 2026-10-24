import { ChevronLeft, ChevronRight } from 'lucide-react';
import React from 'react';

import { Button } from './button';
import { isSameDay } from './date-time-values';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

// The month grid shared by `DatePicker` and `DateInput`: month/year selects,
// previous/next buttons and a 7-column day grid. Internal to `ui/` — callers
// use one of those two components.

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export interface CalendarMonthProps {
  /** Any day of the month on display. */
  month: Date;
  onMonthChange: (month: Date) => void;
  selected: Date | null;
  onSelect: (day: Date) => void;
  isDisabled?: (day: Date) => boolean;
}

export const CalendarMonth: React.FC<CalendarMonthProps> = ({
  month,
  onMonthChange,
  selected,
  onSelect,
  isDisabled,
}) => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = new Date();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstWeekday }, (_, i) => i);
  const years = Array.from({ length: 10 }, (_, i) => year - 5 + i);

  // Arrow keys move between days (±1 / ±7), staying inside the month.
  const handleDayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    const from = Number(
      (document.activeElement as HTMLElement | null)?.dataset['day']
    );
    if (!delta || !from) return;
    event.preventDefault();
    const target = Math.max(1, Math.min(daysInMonth, from + delta));
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-day="${target}"]`)
      ?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select
            value={monthIndex.toString()}
            onValueChange={(m) => onMonthChange(new Date(year, Number(m), 1))}
          >
            <SelectTrigger
              aria-label="Month"
              className="h-8 text-xs min-w-[96px] w-28"
            >
              <SelectValue placeholder={MONTHS[monthIndex]} />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, idx) => (
                <SelectItem key={name} value={idx.toString()}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={year.toString()}
            onValueChange={(y) => onMonthChange(new Date(Number(y), monthIndex, 1))}
          >
            <SelectTrigger
              aria-label="Year"
              className="h-8 text-xs min-w-[84px] w-20"
            >
              <SelectValue placeholder={year.toString()} />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Previous month"
            onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Next month"
            onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-xs font-medium text-muted-foreground text-center h-8 flex items-center justify-center"
          >
            {day}
          </div>
        ))}
      </div>

      <div
        data-calendar-days=""
        className="grid grid-cols-7 gap-1"
        onKeyDown={handleDayKeyDown}
      >
        {emptyDays.map((i) => (
          <div key={`empty-${i}`} className="h-8" />
        ))}
        {days.map((day) => {
          const date = new Date(year, monthIndex, day);
          const isSelected = !!selected && isSameDay(selected, date);
          const isToday = isSameDay(today, date);
          const disabled = isDisabled?.(date) ?? false;

          return (
            <button
              key={day}
              type="button"
              onClick={() => !disabled && onSelect(date)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              data-day={day}
              className={`
                h-8 rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : isToday
                      ? 'bg-muted border border-primary/50'
                      : disabled
                        ? 'text-muted-foreground/30 cursor-not-allowed'
                        : 'hover:bg-muted'
                }
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};
