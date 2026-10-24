import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';

import { DateInput } from '@/components/ui/date-input';
import { DatePicker } from '@/components/ui/date-picker';
import { DateTimeInput } from '@/components/ui/date-time-input';
import {
  clampDateTimeInput,
  parseDateInput,
  parseTimeInput,
} from '@/components/ui/date-time-values';
import { TimeInput } from '@/components/ui/time-input';

// TimeInput / DateInput / DateTimeInput replace the browser's native
// time/date/datetime-local pickers (which ignore the app theme). They are
// drop-ins: every value they emit must be exactly the string the native input
// emitted, so callers' parsing stays unchanged.

// jsdom has no ResizeObserver; Radix's popper positioning uses one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

const option = (column: 'Hours' | 'Minutes', text: string) =>
  within(screen.getByRole('listbox', { name: column })).getByRole('option', {
    name: text,
  });

type AnyInput = React.ComponentType<
  { value: string; onChange: (v: string) => void } & Record<string, unknown>
>;

function Controlled({
  Component,
  initial,
  onChange,
  ...props
}: {
  Component: AnyInput;
  initial: string;
  onChange: (v: string) => void;
} & Record<string, unknown>) {
  const [value, setValue] = React.useState(initial);
  return (
    <Component
      {...props}
      value={value}
      onChange={(next: string) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

const renderControlled = (
  Component: unknown,
  initial: string,
  props: Record<string, unknown> = {}
) => {
  const onChange = vi.fn();
  const utils = render(
    <Controlled
      Component={Component as AnyInput}
      initial={initial}
      onChange={onChange}
      {...props}
    />
  );
  return { onChange, ...utils };
};

const typeAndBlur = (input: HTMLElement, text: string) => {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};

describe('parsers', () => {
  test('times normalise to HH:MM and reject impossible values', () => {
    expect(parseTimeInput('9:30')).toBe('09:30');
    expect(parseTimeInput('0930')).toBe('09:30');
    expect(parseTimeInput('930')).toBe('09:30');
    expect(parseTimeInput('21:05')).toBe('21:05');
    expect(parseTimeInput('21.05')).toBe('21:05');
    expect(parseTimeInput('9')).toBe('09:00');
    expect(parseTimeInput(' 7:00 ')).toBe('07:00');
    expect(parseTimeInput('24:00')).toBeNull();
    expect(parseTimeInput('12:60')).toBeNull();
    expect(parseTimeInput('9:5')).toBeNull();
    expect(parseTimeInput('noon')).toBeNull();
    expect(parseTimeInput('')).toBeNull();
  });

  test('dates normalise to YYYY-MM-DD and reject roll-over', () => {
    expect(parseDateInput('2026-03-05')).toBe('2026-03-05');
    expect(parseDateInput('2026-3-5')).toBe('2026-03-05');
    expect(parseDateInput('3/5/2026')).toBe('2026-03-05');
    expect(parseDateInput('5.3.2026')).toBe('2026-03-05');
    expect(parseDateInput('Mar 5, 2026')).toBe('2026-03-05');
    expect(parseDateInput('5 March 2026')).toBe('2026-03-05');
    expect(parseDateInput('2026-02-30')).toBeNull();
    expect(parseDateInput('2026-13-01')).toBeNull();
    expect(parseDateInput('tomorrow')).toBeNull();
  });

  test('datetimes clamp into [min, max] as text', () => {
    expect(clampDateTimeInput('2026-01-01T08:00', '2026-01-01T09:30')).toBe(
      '2026-01-01T09:30'
    );
    expect(
      clampDateTimeInput('2026-01-02T08:00', undefined, '2026-01-01T23:00:00')
    ).toBe('2026-01-01T23:00');
    expect(clampDateTimeInput('2026-01-01T12:00', '2026-01-01T09:30')).toBe(
      '2026-01-01T12:00'
    );
  });
});

describe('TimeInput', () => {
  test('typing normalises on blur and on Enter', () => {
    const { onChange } = renderControlled(TimeInput, '', { 'aria-label': 'Start' });
    const input = screen.getByLabelText('Start') as HTMLInputElement;
    expect(input.type).toBe('text');

    typeAndBlur(input, '930');
    expect(onChange).toHaveBeenLastCalledWith('09:30');
    expect(input.value).toBe('09:30');

    fireEvent.change(input, { target: { value: '21:5' } });
    fireEvent.change(input, { target: { value: '2105' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('21:05');
    expect(input.value).toBe('21:05');
  });

  test('invalid text reverts to the current value without emitting', () => {
    const { onChange } = renderControlled(TimeInput, '08:00', { 'aria-label': 'Start' });
    const input = screen.getByLabelText('Start') as HTMLInputElement;
    typeAndBlur(input, '25:99');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('08:00');

    fireEvent.change(input, { target: { value: '10:00' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('08:00');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('clearing: clearable emits "", otherwise an emptied field reverts', () => {
    const optional = renderControlled(TimeInput, '08:00', {
      'aria-label': 'Start',
      clearable: true,
    });
    let input = screen.getByLabelText('Start') as HTMLInputElement;
    typeAndBlur(input, '');
    expect(optional.onChange).toHaveBeenLastCalledWith('');
    expect(input.value).toBe('');
    typeAndBlur(input, '17');
    expect(optional.onChange).toHaveBeenLastCalledWith('17:00');
    fireEvent.click(screen.getByRole('button', { name: 'Clear time' }));
    expect(optional.onChange).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('button', { name: 'Clear time' })).toBeNull();
    cleanup();

    const required = renderControlled(TimeInput, '08:00', { 'aria-label': 'Start' });
    input = screen.getByLabelText('Start') as HTMLInputElement;
    expect(screen.queryByRole('button', { name: 'Clear time' })).toBeNull();
    typeAndBlur(input, '');
    expect(required.onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('08:00');
  });

  test('picking an hour keeps the popover open; picking a minute emits and closes', () => {
    const { onChange } = renderControlled(TimeInput, '08:30', { 'aria-label': 'Start' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose time' }));

    const hours = screen.getByRole('listbox', { name: 'Hours' });
    const minutes = screen.getByRole('listbox', { name: 'Minutes' });
    expect(hours.querySelectorAll('[role="option"]')).toHaveLength(24);
    expect(minutes.querySelectorAll('[role="option"]')).toHaveLength(60);
    expect(
      hours.querySelector('[aria-selected="true"]')?.textContent
    ).toBe('08');
    // Keyboard open moves focus to the selected hour.
    expect(document.activeElement?.textContent).toBe('08');

    fireEvent.click(option('Hours', '14'));
    expect(onChange).toHaveBeenLastCalledWith('14:30');
    expect(screen.getByRole('listbox', { name: 'Minutes' })).toBeTruthy();

    fireEvent.click(option('Minutes', '05'));
    expect(onChange).toHaveBeenLastCalledWith('14:05');
    expect(screen.queryByRole('listbox', { name: 'Hours' })).toBeNull();
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('14:05');
  });

  test('picking from an empty field starts at minute 00', () => {
    const { onChange } = renderControlled(TimeInput, '', { 'aria-label': 'Start' });
    fireEvent.click(screen.getByLabelText('Start'));
    fireEvent.click(option('Hours', '09'));
    expect(onChange).toHaveBeenLastCalledWith('09:00');
    // Opening by clicking the field leaves focus there for typing.
    expect(screen.getByRole('listbox', { name: 'Hours' })).toBeTruthy();
  });

  test('step lists minutes in 5-minute steps and arrow keys move by it', () => {
    const { onChange } = renderControlled(TimeInput, '23:55', {
      'aria-label': 'Start',
      step: 300,
    });
    const input = screen.getByLabelText('Start');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('00:00');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('23:55');

    fireEvent.keyDown(input, { key: 'ArrowDown', altKey: true });
    const minutes = screen.getByRole('listbox', { name: 'Minutes' });
    expect(
      Array.from(minutes.querySelectorAll('[role="option"]')).map((o) => o.textContent)
    ).toEqual(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
  });

  test('keyboard: arrows move through a column, Enter picks', () => {
    const { onChange } = renderControlled(TimeInput, '08:00', { 'aria-label': 'Start' });
    fireEvent.keyDown(screen.getByLabelText('Start'), { key: 'ArrowDown', altKey: true });
    const hours = screen.getByRole('listbox', { name: 'Hours' });
    fireEvent.keyDown(hours, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('09');
    fireEvent.click(document.activeElement as HTMLElement); // Enter on a button
    expect(onChange).toHaveBeenLastCalledWith('09:00');
    fireEvent.keyDown(hours, { key: 'ArrowRight' });
    expect(
      (document.activeElement as HTMLElement).closest('[role="listbox"]')?.getAttribute('aria-label')
    ).toBe('Minutes');
  });

  test('disabled: no popover, no buttons usable', () => {
    renderControlled(TimeInput, '08:00', { 'aria-label': 'Start', disabled: true });
    fireEvent.click(screen.getByLabelText('Start'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(
      (screen.getByRole('button', { name: 'Choose time' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

describe('DateInput', () => {
  test('shows a readable date and emits YYYY-MM-DD', () => {
    const { onChange } = renderControlled(DateInput, '2026-03-05', { 'aria-label': 'From' });
    const input = screen.getByLabelText('From') as HTMLInputElement;
    expect(input.value).toBe('Mar 5, 2026');

    typeAndBlur(input, '3/9/2026');
    expect(onChange).toHaveBeenLastCalledWith('2026-03-09');
    expect(input.value).toBe('Mar 9, 2026');

    typeAndBlur(input, '2026-02-30');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Mar 9, 2026');
  });

  test('picking a day emits and closes', () => {
    const { onChange } = renderControlled(DateInput, '2026-03-05', { 'aria-label': 'From' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));
    // Keyboard open focuses the selected day.
    expect(document.activeElement?.textContent).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: '17' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-03-17');
    expect(screen.queryByRole('button', { name: '17' })).toBeNull();
  });

  test('min/max disable days outside the range and reject typed ones', () => {
    const { onChange } = renderControlled(DateInput, '2026-03-10', {
      'aria-label': 'From',
      min: '2026-03-05',
      max: '2026-03-20',
    });
    const input = screen.getByLabelText('From') as HTMLInputElement;
    typeAndBlur(input, '2026-03-04');
    typeAndBlur(input, '2026-03-21');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('Mar 10, 2026');

    fireEvent.click(input);
    const day = (n: number) =>
      screen.getByRole('button', { name: String(n) }) as HTMLButtonElement;
    expect(day(4).disabled).toBe(true);
    expect(day(5).disabled).toBe(false);
    expect(day(20).disabled).toBe(false);
    expect(day(21).disabled).toBe(true);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('2026-03-11');
  });

  test('clearable emits ""', () => {
    const { onChange } = renderControlled(DateInput, '2026-03-10', {
      'aria-label': 'From',
      clearable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('');
  });
});

describe('DateTimeInput', () => {
  test('emits YYYY-MM-DDTHH:mm from either part', () => {
    const { onChange } = renderControlled(DateTimeInput, '2026-03-05T14:30', {
      'aria-label': 'Start',
    });
    const date = screen.getByLabelText('Start date') as HTMLInputElement;
    const time = screen.getByLabelText('Start time') as HTMLInputElement;
    expect(date.value).toBe('Mar 5, 2026');
    expect(time.value).toBe('14:30');

    typeAndBlur(date, '2026-03-07');
    expect(onChange).toHaveBeenLastCalledWith('2026-03-07T14:30');
    typeAndBlur(time, '915');
    expect(onChange).toHaveBeenLastCalledWith('2026-03-07T09:15');
  });

  test('a date with no time yet gets 00:00; a time alone emits nothing', () => {
    const { onChange } = renderControlled(DateTimeInput, '', { 'aria-label': 'Start' });
    typeAndBlur(screen.getByLabelText('Start time'), '10:00');
    expect(onChange).not.toHaveBeenCalled();
    typeAndBlur(screen.getByLabelText('Start date'), '2026-04-01');
    expect(onChange).toHaveBeenLastCalledWith('2026-04-01T10:00');
    cleanup();

    const fresh = renderControlled(DateTimeInput, '', { 'aria-label': 'Start' });
    typeAndBlur(screen.getByLabelText('Start date'), '2026-04-01');
    expect(fresh.onChange).toHaveBeenLastCalledWith('2026-04-01T00:00');
  });

  test('min/max clamp the combined value and bound the calendar', () => {
    const { onChange } = renderControlled(DateTimeInput, '2026-03-05T12:00', {
      'aria-label': 'Start',
      min: '2026-03-05T09:30',
      max: '2026-03-06T18:00',
    });
    const time = screen.getByLabelText('Start time') as HTMLInputElement;
    typeAndBlur(time, '08:00');
    expect(onChange).toHaveBeenLastCalledWith('2026-03-05T09:30');
    expect(time.value).toBe('09:30');

    typeAndBlur(screen.getByLabelText('Start date'), '2026-03-06');
    typeAndBlur(time, '23:00');
    expect(onChange).toHaveBeenLastCalledWith('2026-03-06T18:00');

    typeAndBlur(screen.getByLabelText('Start date'), '2026-03-07');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  test('clearing the date clears the value', () => {
    const { onChange } = renderControlled(DateTimeInput, '2026-03-05T12:00', {
      'aria-label': 'Start',
      clearable: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

describe('DatePicker (shares the calendar)', () => {
  test('still emits a Date when a day is picked', async () => {
    const onChange = vi.fn();
    render(<DatePicker value={new Date(2026, 2, 5)} onChange={onChange} />);
    const input = screen.getByPlaceholderText('MM/DD/YYYY') as HTMLInputElement;
    expect(input.value).toBe('Mar 5, 2026');
    await act(async () => {
      fireEvent.click(input);
    });
    fireEvent.click(screen.getByRole('button', { name: '17' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const picked = onChange.mock.calls[0][0] as Date;
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate()]).toEqual([
      2026, 2, 17,
    ]);
  });
});
