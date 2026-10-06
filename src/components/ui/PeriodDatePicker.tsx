/* eslint-disable spacing/no-hardcoded-font-size */
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface PeriodValue {
  from: Date;
  to: Date;
}

export interface PeriodPreset {
  id: string;
  label: string;
  days: number;
}

export interface PeriodDatePickerProps {
  value: PeriodValue | null;
  onApply: (value: PeriodValue) => void;
  onReset?: () => void;
  /** Override preset chips. Defaults to 3d/7d/30d/90d/180d/365d. */
  presets?: PeriodPreset[];
  /** Disallow selecting dates after this. Defaults to today. */
  maxDate?: Date;
  /**
   * Show start/end time-of-day inputs under the calendar. Without it the
   * range always spans whole days (00:00 → 23:59:59.999).
   */
  showTime?: boolean;
  className?: string;
}

const DEFAULT_PRESETS: PeriodPreset[] = [
  { id: '3d', label: '3d', days: 3 },
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: '180d', label: '180d', days: 180 },
  { id: '365d', label: '365d', days: 365 },
];

const MONTHS_FULL = [
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

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isBefore = (a: Date, b: Date) =>
  new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() <
  new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();

const isAfter = (a: Date, b: Date) => isBefore(b, a);

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const formatTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Move `d` to the `HH:mm` of an `<input type="time">`, keeping its day. The
// end of a range keeps :59.999 so "23:59" still covers the whole last minute.
const withTime = (d: Date, hhmm: string, isEnd: boolean) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    hh || 0,
    mm || 0,
    isEnd ? 59 : 0,
    isEnd ? 999 : 0
  );
};

const formatDisplay = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

const buildMonthGrid = (cursor: Date): Date[] => {
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const firstWeekday = firstOfMonth.getDay();
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

export const PeriodDatePicker: React.FC<PeriodDatePickerProps> = ({
  value,
  onApply,
  onReset,
  presets = DEFAULT_PRESETS,
  maxDate = new Date(),
  showTime = false,
  className,
}) => {
  const [cursor, setCursor] = useState<Date>(() => value?.to ?? new Date());
  const [draftFrom, setDraftFrom] = useState<Date | null>(value?.from ?? null);
  const [draftTo, setDraftTo] = useState<Date | null>(value?.to ?? null);

  // Sync draft when external value changes (e.g. preset applied from
  // outside the popover).
  useEffect(() => {
    setDraftFrom(value?.from ?? null);
    setDraftTo(value?.to ?? null);
    if (value?.to) setCursor(value.to);
  }, [value?.from, value?.to]);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);

  const inRange = (d: Date): boolean => {
    if (!draftFrom || !draftTo) return false;
    const t = startOfDay(d).getTime();
    return (
      t >= startOfDay(draftFrom).getTime() && t <= startOfDay(draftTo).getTime()
    );
  };

  const handleDayClick = (d: Date) => {
    if (isAfter(d, maxDate)) return;
    // Range builder: first click sets from, second click sets to. If
    // clicking before from, restart.
    // With time inputs shown, re-picking a day keeps the times already chosen.
    const fromAt = (day: Date) =>
      showTime && draftFrom
        ? withTime(day, formatTime(draftFrom), false)
        : startOfDay(day);
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(fromAt(d));
      setDraftTo(null);
      return;
    }
    if (isBefore(d, draftFrom)) {
      setDraftFrom(fromAt(d));
      setDraftTo(null);
      return;
    }
    const to =
      showTime && value?.to ? withTime(d, formatTime(value.to), true) : endOfDay(d);
    // Same day with an end time at or before the start: fall back to the end
    // of that day rather than emit an empty/inverted range.
    const next = { from: draftFrom, to: to > draftFrom ? to : endOfDay(d) };
    setDraftTo(next.to);
    onApply(next);
  };

  const applyPreset = (preset: PeriodPreset) => {
    // "Nd" means N days inclusive of today, so subtract (N-1) days to
    // get the start. e.g. 3d on the 20th = [18, 19, 20].
    const to = endOfDay(maxDate);
    const from = startOfDay(
      new Date(to.getTime() - (preset.days - 1) * 86_400_000)
    );
    setDraftFrom(from);
    setDraftTo(to);
    setCursor(to);
    onApply({ from, to });
  };

  const handleTimeChange = (which: 'from' | 'to', hhmm: string) => {
    if (!draftFrom || !draftTo || !hhmm) return;
    const next =
      which === 'from'
        ? { from: withTime(draftFrom, hhmm, false), to: draftTo }
        : { from: draftFrom, to: withTime(draftTo, hhmm, true) };
    if (which === 'from') setDraftFrom(next.from);
    else setDraftTo(next.to);
    // Only hand a usable range upstream; an inverted one stays a draft
    // (flagged below) until the user fixes it.
    if (next.from < next.to) onApply(next);
  };
  const timeInverted = !!draftFrom && !!draftTo && draftFrom >= draftTo;

  const handleReset = () => {
    onReset?.();
    // Parent updates `value` via onReset; useEffect above will sync
    // draftFrom/To from the new value. If no onReset handler is wired
    // we fall back to clearing the local draft.
    if (!onReset) {
      setDraftFrom(null);
      setDraftTo(null);
    }
  };

  const goPrevMonth = () => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  };
  const goNextMonth = () => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  };

  const currentYear = cursor.getFullYear();
  const yearRange = useMemo(
    () => Array.from({ length: 11 }, (_, i) => currentYear - 5 + i),
    [currentYear]
  );

  const isPresetActive = (preset: PeriodPreset): boolean => {
    if (!draftFrom || !draftTo) return false;
    // Inclusive day count: days between start and end, +1 because both
    // endpoints are part of the range.
    const days =
      Math.round(
        (startOfDay(draftTo).getTime() - startOfDay(draftFrom).getTime()) /
          86_400_000
      ) + 1;
    return days === preset.days;
  };

  return (
    <div className={cn('w-72 space-y-md p-md', className)}>
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={goPrevMonth}
          aria-label="Previous month"
          className="h-7 w-7"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1">
          <Select
            value={String(cursor.getMonth())}
            onValueChange={(v) =>
              setCursor(new Date(cursor.getFullYear(), Number(v), 1))
            }
          >
            <SelectTrigger
              size="sm"
              aria-label="Month"
              className="w-auto gap-1 border-0 bg-transparent px-2 shadow-none hover:bg-muted"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS_FULL.map((m, i) => (
                <SelectItem key={m} value={String(i)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(cursor.getFullYear())}
            onValueChange={(v) =>
              setCursor(new Date(Number(v), cursor.getMonth(), 1))
            }
          >
            <SelectTrigger
              size="sm"
              aria-label="Year"
              className="w-auto gap-1 border-0 bg-transparent px-2 shadow-none hover:bg-muted"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearRange.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={goNextMonth}
          aria-label="Next month"
          className="h-7 w-7"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-6 gap-1">
        {presets.map((preset) => {
          const active = isPresetActive(preset);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className={cn(
                'inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-foreground hover:bg-muted'
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
          {DAY_LABELS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((d) => {
            const inCurrentMonth = d.getMonth() === cursor.getMonth();
            const disabled = isAfter(d, maxDate);
            const isFrom = !!draftFrom && isSameDay(d, draftFrom);
            const isTo = !!draftTo && isSameDay(d, draftTo);
            const isEndpoint = isFrom || isTo;
            const within = inRange(d) && !isEndpoint;
            return (
              <button
                key={d.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(d)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md text-xs tabular-nums transition-colors',
                  !inCurrentMonth && 'opacity-30',
                  disabled && 'cursor-not-allowed opacity-30',
                  !disabled && !isEndpoint && !within && 'hover:bg-muted',
                  within && 'bg-primary/25 text-foreground',
                  isEndpoint &&
                    'bg-primary text-primary-foreground font-semibold'
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {showTime && (
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-xs">
            <label className="space-y-1 text-[10px] font-semibold uppercase text-muted-foreground">
              <span>Start time</span>
              <Input
                type="time"
                aria-label="Start time"
                disabled={!draftFrom || !draftTo}
                value={draftFrom ? formatTime(draftFrom) : ''}
                onChange={(e) => handleTimeChange('from', e.target.value)}
                className="h-8 text-xs tabular-nums"
              />
            </label>
            <label className="space-y-1 text-[10px] font-semibold uppercase text-muted-foreground">
              <span>End time</span>
              <Input
                type="time"
                aria-label="End time"
                disabled={!draftFrom || !draftTo}
                value={draftTo ? formatTime(draftTo) : ''}
                onChange={(e) => handleTimeChange('to', e.target.value)}
                className="h-8 text-xs tabular-nums"
              />
            </label>
          </div>
          {timeInverted && (
            <p className="text-xs text-destructive">
              End time must be after the start time.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-xs">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleReset}
          disabled={!draftFrom && !draftTo}
          aria-label="Reset selection"
          className="h-9 w-9 shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <div className="flex-1 rounded-md bg-primary px-sm py-2 text-center text-sm font-semibold text-primary-foreground">
          {draftFrom && draftTo ? (
            <>
              {formatDisplay(draftFrom)} – {formatDisplay(draftTo)}
            </>
          ) : draftFrom ? (
            <>{formatDisplay(draftFrom)} – …</>
          ) : (
            <span className="opacity-70">Select a range</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PeriodDatePicker;
