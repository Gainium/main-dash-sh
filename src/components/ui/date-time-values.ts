// Pure value helpers behind TimeInput, DateInput and DateTimeInput. Every
// value is the exact string the matching native input emitted: 'HH:MM',
// 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm' (local time), or ''.

const pad = (n: number) => String(n).padStart(2, '0');

export const formatTimeInput = (hours: number, minutes: number) =>
  `${pad(hours)}:${pad(minutes)}`;

/**
 * Typed text → 'HH:MM', or null. Accepts '9', '9:30', '9.30', '930', '0930',
 * '21:05'.
 */
export const parseTimeInput = (input: string): string | null => {
  const text = input.trim();
  let hours: number;
  let minutes: number;
  const separated = /^(\d{1,2})\s*[:.h]\s*(\d{2})$/i.exec(text);
  if (separated) {
    hours = Number(separated[1]);
    minutes = Number(separated[2]);
  } else if (/^\d{1,4}$/.test(text)) {
    if (text.length <= 2) {
      hours = Number(text);
      minutes = 0;
    } else {
      hours = Number(text.slice(0, -2));
      minutes = Number(text.slice(-2));
    }
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59) return null;
  return formatTimeInput(hours, minutes);
};

const MONTHS_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

export const toDateInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 'YYYY-MM-DD' → a local Date at midnight, or null. */
export const fromDateInputValue = (value: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const build = (year: number, month: number, day: number) => {
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(year, month - 1, day);
  // Reject roll-over (Feb 30 → Mar 2).
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return toDateInputValue(date);
};

/** The field's display text: 'Oct 24, 2026'. */
export const formatDateInputDisplay = (value: string) => {
  const date = fromDateInputValue(value);
  return date
    ? date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : value;
};

/**
 * Typed text → 'YYYY-MM-DD', or null. Accepts '2026-10-24', '10/24/2026'
 * (month first), '24.10.2026' (day first), 'Oct 24, 2026' and '24 Oct 2026'.
 */
export const parseDateInput = (input: string): string | null => {
  const text = input.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) return build(Number(m[3]), Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (m && MONTHS_SHORT.includes(m[1])) {
    return build(Number(m[3]), MONTHS_SHORT.indexOf(m[1]) + 1, Number(m[2]));
  }
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(text);
  if (m && MONTHS_SHORT.includes(m[2])) {
    return build(Number(m[3]), MONTHS_SHORT.indexOf(m[2]) + 1, Number(m[1]));
  }
  return null;
};

export const isDateInRange = (value: string, min?: string, max?: string) =>
  (!min || value >= min.slice(0, 10)) && (!max || value <= max.slice(0, 10));

export const splitDateTimeInput = (value: string) => ({
  date: /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '',
  time: /^\d{2}:\d{2}/.test(value.slice(11)) ? value.slice(11, 16) : '',
});

/** Clamp a 'YYYY-MM-DDTHH:mm' string into [min, max]; both compare as text. */
export const clampDateTimeInput = (value: string, min?: string, max?: string) => {
  const lo = min?.slice(0, 16);
  const hi = max?.slice(0, 16);
  if (lo && value < lo) return lo;
  if (hi && value > hi) return hi;
  return value;
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
