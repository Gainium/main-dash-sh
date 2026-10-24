import {
  ExchangeIntervals,
  IndicatorStartConditionEnum,
  SessionLevelEnum,
  SessionRuleEnum,
  type SettingsIndicators,
} from '@/types';

/**
 * Session window math for the chart. Mirrors `isInSession` in
 * @gainium/indicators (what the bot engine and backtester run), which the
 * dashboard does not import directly: keep the two in step.
 */

export type SessionHours = {
  start?: string | null;
  end?: string | null;
  timezone?: string | null;
};

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatters = new Map<string, Intl.DateTimeFormat | null>();

const formatterFor = (timezone: string): Intl.DateTimeFormat | null => {
  if (!formatters.has(timezone)) {
    try {
      formatters.set(
        timezone,
        new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
      );
    } catch {
      formatters.set(timezone, null);
    }
  }
  return formatters.get(timezone) ?? null;
};

/** Minutes after midnight for `HH:MM`, or null when it isn't one. */
export const parseSessionTime = (value?: string | null): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const zonedDayAndMinutes = (
  timestamp: number,
  timezone?: string | null
): { day: number; minutes: number } => {
  const formatter =
    timezone && timezone !== 'UTC' ? formatterFor(timezone) : null;
  if (!formatter) {
    const date = new Date(timestamp);
    return {
      day: date.getUTCDay(),
      minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
    };
  }
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of formatter.formatToParts(timestamp)) {
    if (part.type === 'weekday') day = WEEKDAYS[part.value] ?? 0;
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
  }
  return { day, minutes: hour * 60 + minute };
};

export const isInSession = (
  timestamp: number,
  days: number[],
  rule: string,
  hours?: SessionHours | null
): boolean => {
  const start = parseSessionTime(hours?.start);
  const end = parseSessionTime(hours?.end);
  const { day, minutes } = zonedDayAndMinutes(timestamp, hours?.timezone);
  let inside: boolean;
  if (start === null || end === null || start === end) {
    inside = days.includes(day);
  } else if (start < end) {
    inside = minutes >= start && minutes < end && days.includes(day);
  } else if (minutes >= start) {
    inside = days.includes(day);
  } else if (minutes < end) {
    inside = days.includes((day + 6) % 7);
  } else {
    inside = false;
  }
  return rule === 'out' ? !inside : inside;
};

const MINUTE = 60_000;

/**
 * Whether the session is active at any moment of [from, to). The status only
 * changes at the local session open, close or midnight, so this walks those
 * boundaries instead of sampling: a daily bar costs a handful of checks.
 */
export const isSessionActiveDuring = (
  from: number,
  to: number,
  days: number[],
  rule: string,
  hours?: SessionHours | null
): boolean => {
  const boundaries = [
    0,
    parseSessionTime(hours?.start),
    parseSessionTime(hours?.end),
  ]
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  let t = from;
  // Bounded: at most three boundaries per local day.
  for (let guard = 0; guard < 400 && t < Math.max(to, from + 1); guard++) {
    if (isInSession(t, days, rule, hours)) return true;
    const { minutes } = zonedDayAndMinutes(t, hours?.timezone);
    const next = boundaries.find((m) => m > minutes) ?? 24 * 60;
    t += (next - minutes) * MINUTE - (t % MINUTE);
  }
  return false;
};

export type SessionPreset = {
  value: string;
  label: string;
  start: string;
  end: string;
  timezone: string;
};

// Trading sessions on their local clocks, so daylight saving moves them with
// the market they are named after.
export const SESSION_PRESETS: SessionPreset[] = [
  {
    value: 'sydney',
    label: 'Sydney',
    start: '07:00',
    end: '16:00',
    timezone: 'Australia/Sydney',
  },
  {
    value: 'tokyo',
    label: 'Tokyo',
    start: '09:00',
    end: '18:00',
    timezone: 'Asia/Tokyo',
  },
  {
    value: 'london',
    label: 'London',
    start: '08:00',
    end: '17:00',
    timezone: 'Europe/London',
  },
  {
    value: 'newYork',
    label: 'New York',
    start: '08:00',
    end: '17:00',
    timezone: 'America/New_York',
  },
  {
    value: 'usStocks',
    label: 'US stock market',
    start: '09:30',
    end: '16:00',
    timezone: 'America/New_York',
  },
];

export const SESSION_ALL_DAY = 'allDay';
export const SESSION_CUSTOM = 'custom';

/** Which preset the stored hours match: a preset, all day, or custom. */
export const resolveSessionPreset = (params: SettingsIndicators): string => {
  const start = params.sessionStart ?? '';
  const end = params.sessionEnd ?? '';
  if (parseSessionTime(start) === null || parseSessionTime(end) === null) {
    return SESSION_ALL_DAY;
  }
  const timezone = params.sessionTimezone || 'UTC';
  return (
    SESSION_PRESETS.find(
      (p) => p.start === start && p.end === end && p.timezone === timezone
    )?.value ?? SESSION_CUSTOM
  );
};

/** The hour fields a preset choice writes. */
export const sessionPresetParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> => {
  const preset = SESSION_PRESETS.find((p) => p.value === value);
  if (preset) {
    return {
      sessionStart: preset.start,
      sessionEnd: preset.end,
      sessionTimezone: preset.timezone,
    };
  }
  if (value === SESSION_ALL_DAY) {
    return { sessionStart: '', sessionEnd: '' };
  }
  // Custom from all day starts from a plain working day to edit.
  if (resolveSessionPreset(params) === SESSION_ALL_DAY) {
    return {
      sessionStart: '09:00',
      sessionEnd: '17:00',
      sessionTimezone: params.sessionTimezone || 'UTC',
    };
  }
  return {};
};

const SESSION_LEVEL_CONDITIONS: string[] = [
  IndicatorStartConditionEnum.cu,
  IndicatorStartConditionEnum.cd,
  IndicatorStartConditionEnum.gt,
  IndicatorStartConditionEnum.lt,
];

/**
 * What picking a Session rule writes. Price levels are read from candles, so
 * switching to it stores their interval (15m) and the comparison defaults:
 * the backtester and the bot read the stored settings, not the form's
 * displayed defaults.
 */
export const sessionRuleParams = (
  value: string,
  params: SettingsIndicators
): Partial<SettingsIndicators> => {
  const rule = value as SessionRuleEnum;
  if (
    rule !== SessionRuleEnum.levels ||
    params.sessionRule === SessionRuleEnum.levels
  ) {
    return { sessionRule: rule };
  }
  return {
    sessionRule: rule,
    indicatorInterval: ExchangeIntervals.fifteenM,
    sessionLevelA: params.sessionLevelA || SessionLevelEnum.price,
    sessionLevelB: params.sessionLevelB || SessionLevelEnum.prevHigh,
    indicatorCondition: SESSION_LEVEL_CONDITIONS.includes(
      params.indicatorCondition
    )
      ? params.indicatorCondition
      : IndicatorStartConditionEnum.cu,
  };
};
