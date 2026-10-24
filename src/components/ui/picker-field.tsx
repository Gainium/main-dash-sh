import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Input } from './input';
import { Popover, PopoverAnchor, PopoverContent } from './popover';

// The typed-text-plus-popover field behind `TimeInput` and `DateInput`. It owns
// the draft text, commits it on blur/Enter (normalised through `parse`, or
// reverted when it doesn't parse), and hosts the picker in a themed popover.
// Internal to `ui/`.

export type PickerInputAttributes = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step'
>;

export interface PickerApi {
  /** The value the picker should highlight: the parsed draft, else `value`. */
  current: string | null;
  /** Emit `next`; `close` also closes the popover and refocuses the field. */
  pick: (next: string, options?: { close?: boolean }) => void;
}

export interface PickerFieldProps extends PickerInputAttributes {
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
  containerClassName?: string;
  /** Text → canonical value, or null when it doesn't parse or isn't allowed. */
  parse: (text: string) => string | null;
  /** Canonical value → the text shown in the field. */
  format: (value: string) => string;
  /** ArrowUp/ArrowDown in the field: the next canonical value, or null. */
  stepValue?: (current: string | null, direction: 1 | -1) => string | null;
  icon: React.ReactNode;
  pickerLabel: string;
  clearLabel: string;
  popoverClassName?: string;
  /**
   * Runs when the popover has mounted. `viaKeyboard` is true when it was opened
   * from the keyboard and focus should move into the picker.
   */
  onPickerOpen?: (content: HTMLElement, viaKeyboard: boolean) => void;
  renderPicker: (api: PickerApi) => React.ReactNode;
}

export const PickerField = React.forwardRef<HTMLInputElement, PickerFieldProps>(
  (
    {
      value,
      onChange,
      clearable = false,
      containerClassName,
      parse,
      format,
      stepValue,
      icon,
      pickerLabel,
      clearLabel,
      popoverClassName,
      onPickerOpen,
      renderPicker,
      className,
      disabled,
      onBlur,
      onClick,
      onKeyDown,
      placeholder,
      ...inputProps
    },
    forwardedRef
  ) => {
    // The text being typed, or null when the field shows `value` as is. The
    // field stays controlled: after a commit it displays whatever `value` the
    // parent kept, even if it clamped or ignored the emitted one.
    const [draft, setDraft] = React.useState<string | null>(null);
    const [open, setOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const openViaKeyboardRef = React.useRef(false);
    const returnFocusRef = React.useRef(false);

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef]
    );

    const current = (draft !== null ? parse(draft) : null) ?? (value || null);

    const emit = (next: string) => {
      setDraft(null);
      if (next !== value) onChange(next);
    };

    const revert = () => setDraft(null);

    const commitDraft = () => {
      if (draft === null) return;
      if (!draft.trim()) {
        if (clearable) emit('');
        else revert();
        return;
      }
      const parsed = parse(draft);
      if (parsed === null) revert();
      else emit(parsed);
    };

    const openPicker = (viaKeyboard: boolean) => {
      if (disabled) return;
      openViaKeyboardRef.current = viaKeyboard;
      if (open && viaKeyboard && contentRef.current) {
        onPickerOpen?.(contentRef.current, true);
        return;
      }
      setOpen(true);
    };

    const api: PickerApi = {
      current,
      pick: (next, options) => {
        emit(next);
        if (options?.close) {
          returnFocusRef.current = true;
          setOpen(false);
        }
      },
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDraft();
        setOpen(false);
      } else if (event.key === 'Escape') {
        revert();
      } else if (event.key === 'ArrowDown' && event.altKey) {
        event.preventDefault();
        openPicker(true);
      } else if (
        (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
        stepValue
      ) {
        event.preventDefault();
        const next = stepValue(current, event.key === 'ArrowUp' ? 1 : -1);
        if (next !== null) emit(next);
      }
      onKeyDown?.(event);
    };

    const showClear = clearable && !disabled && Boolean(value || draft);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div ref={wrapperRef} className={cn('relative w-full', containerClassName)}>
            <Input
              {...inputProps}
              ref={setRefs}
              type="text"
              inputMode={inputProps.inputMode ?? 'numeric'}
              autoComplete="off"
              value={draft ?? (value ? format(value) : '')}
              placeholder={placeholder}
              disabled={disabled}
              aria-haspopup="dialog"
              aria-expanded={open}
              onChange={(event) => setDraft(event.target.value)}
              onClick={(event) => {
                openPicker(false);
                onClick?.(event);
              }}
              onBlur={(event) => {
                commitDraft();
                onBlur?.(event);
              }}
              onKeyDown={handleKeyDown}
              className={cn('tabular-nums', className, showClear ? 'pr-16' : 'pr-9')}
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1.5">
              {showClear && (
                <button
                  type="button"
                  aria-label={clearLabel}
                  onClick={() => {
                    emit('');
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                aria-label={pickerLabel}
                aria-haspopup="dialog"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openPicker(true))}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50"
              >
                {icon}
              </button>
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          // PopoverContent pads `p-3 md:p-4`; the pickers set their own.
          className={cn('w-auto p-2 md:p-2', popoverClassName)}
          onOpenAutoFocus={(event) => {
            // Keep focus in the field so the user can go on typing; a keyboard
            // open moves it into the picker instead.
            event.preventDefault();
            if (contentRef.current) {
              onPickerOpen?.(contentRef.current, openViaKeyboardRef.current);
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocusRef.current) {
              returnFocusRef.current = false;
              inputRef.current?.focus();
            }
          }}
          onEscapeKeyDown={() => {
            returnFocusRef.current = true;
          }}
          onInteractOutside={(event) => {
            // The field and its buttons sit outside the content; using them
            // must not count as dismissing the popover.
            if (wrapperRef.current?.contains(event.target as Node)) {
              event.preventDefault();
            }
          }}
        >
          <div ref={contentRef}>{renderPicker(api)}</div>
        </PopoverContent>
      </Popover>
    );
  }
);
PickerField.displayName = 'PickerField';
