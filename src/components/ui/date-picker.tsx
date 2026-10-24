import React, { useMemo, useRef, useState, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { Label } from './label';
import { Input } from './input';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { CalendarMonth } from './calendar-month';
import { Calendar as CalendarIcon } from 'lucide-react';

interface DatePickerProps {
  value?: number | Date | string | undefined;
  onChange?: (value: Date) => void;
  title?: string;
  className?: string;
  disabled?: boolean;
  disableFuture?: boolean;
}

const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const parseInputDate = (input: string): Date | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isoMatch = /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const slashMatch = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/.exec(trimmed);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  title,
  disabled = false,
  disableFuture = false,
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLInputElement | null>(null);
  const closeReasonRef = useRef<'commit' | null>(null);

  const selectedDate = useMemo(() => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }, [value]);

  const [inputValue, setInputValue] = useState(() =>
    selectedDate ? formatDisplayDate(selectedDate) : ''
  );

  const [displayMonth, setDisplayMonth] = useState(() => {
    if (!selectedDate) return new Date();
    return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  });

  // Internal selected date to show immediate feedback while typing
  const [internalSelectedDate, setInternalSelectedDate] = useState<Date | null>(
    selectedDate
  );

  const today = useMemo(() => new Date(), []);
  const dateOnly = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const isAfterToday = (d: Date) => dateOnly(d) > dateOnly(today);

  const applyParsedDate = (
    parsed: Date,
    {
      commit = true,
      closePopover = true,
      formatInput = true,
    }: { commit?: boolean; closePopover?: boolean; formatInput?: boolean } = {}
  ) => {
    if (disableFuture && isAfterToday(parsed)) return false;

    setDisplayMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setInternalSelectedDate(parsed);

    if (formatInput) {
      setInputValue(formatDisplayDate(parsed));
    }

    if (commit && onChange) {
      onChange(parsed);
    }

    if (closePopover) {
      closeReasonRef.current = commit ? 'commit' : null;
      setOpen(false);
      triggerRef.current?.blur();
    }

    return true;
  };

  const revertInputToSelected = () => {
    if (selectedDate) {
      setInputValue(formatDisplayDate(selectedDate));
    } else {
      setInputValue('');
    }
  };

  const handleSelectDate = (day: number) => {
    const selected = new Date(
      displayMonth.getFullYear(),
      displayMonth.getMonth(),
      day
    );
    const ok = applyParsedDate(selected, { commit: true, closePopover: true });
    if (!ok) {
      toast.error('Selected date cannot be in the future');
      // Keep the popover open for the user to select a valid date
    }
  };

  const handleTriggerInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setInputValue(input);

    // Preview the date as user types, but don't auto-close the popover
    const parsed = parseInputDate(input);
    if (parsed) {
      // If disableFuture is enabled, deny preview of future dates
      if (disableFuture && isAfterToday(parsed)) {
        // don't preview
        return;
      }
      // Preview the parsed date but do not commit to parent until user confirms (e.g., Enter)
      applyParsedDate(parsed, {
        commit: false,
        closePopover: false,
        formatInput: false,
      });
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const parsed = parseInputDate(inputValue);
      if (parsed) {
        const ok = applyParsedDate(parsed, {
          commit: true,
          closePopover: true,
        });
        if (!ok) {
          toast.error('Date cannot be in the future');
          revertInputToSelected();
        }
      } else {
        revertInputToSelected();
        setOpen(false);
      }
    }
    if (e.key === 'Escape') {
      setOpen(false);
      revertInputToSelected();
    }
  };

  const handleTriggerBlur = () => {
    // If empty, nothing to do
    if (!inputValue) return;
    const parsed = parseInputDate(inputValue);
    if (!parsed) {
      revertInputToSelected();
      return;
    }
    // Ensure parsed date is allowed
    const ok = applyParsedDate(parsed, { commit: true, closePopover: true });
    if (!ok) {
      toast.error('Date cannot be in the future');
      revertInputToSelected();
    }
  };

  const displayedSelectedDate = internalSelectedDate ?? selectedDate;

  // Sync input when the external value changes
  useEffect(() => {
    if (selectedDate) {
      setInputValue(formatDisplayDate(selectedDate));
      setDisplayMonth(
        new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
      );
    } else {
      setInputValue('');
      setDisplayMonth(new Date());
    }
    setInternalSelectedDate(selectedDate);
  }, [selectedDate]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && open) {
      if (closeReasonRef.current === 'commit') {
        closeReasonRef.current = null;
      } else {
        revertInputToSelected();
      }
    }
    setOpen(nextOpen);
  };

  return (
    <div className="space-y-2">
      {title && <Label className="text-xs">{title}</Label>}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <div className="relative w-full">
            <Input
              ref={triggerRef}
              type="text"
              placeholder="MM/DD/YYYY"
              value={inputValue}
              onBlur={handleTriggerBlur}
              onChange={handleTriggerInputChange}
              // onChange set above
              onKeyDown={handleTriggerKeyDown}
              endAdornment={
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              }
              endAdornmentOnClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              disabled={disabled}
              className="w-full text-left font-normal h-9"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-3 space-y-3">
            <CalendarMonth
              month={displayMonth}
              onMonthChange={setDisplayMonth}
              selected={displayedSelectedDate}
              onSelect={(date) => handleSelectDate(date.getDate())}
              isDisabled={(date) => disableFuture && isAfterToday(date)}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
