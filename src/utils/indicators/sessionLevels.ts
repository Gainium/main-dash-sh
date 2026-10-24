import { parseSessionTime, type SessionHours } from './sessionWindow';

/**
 * Session "Price levels" for the chart study. A line-for-line copy of
 * `sessionKey` and `SessionLevels` in @gainium/indicators (what the bot engine
 * and backtester run), which the dashboard does not depend on directly — keep
 * the two in step; `core/tests/sessionLevels.vitest.test.ts` checks they agree
 * bar by bar.
 *
 * Groups candles into sessions and reports the open, high, low, close and
 * midpoint of the last completed session, the open of the session in progress
 * and the latest close.
 *
 * - A candle belongs to a session when its OPEN time is inside the session
 *   window (the same window as `isInSession` with rule `in`).
 * - Two in-session candles are the same session when they have the same
 *   `sessionKey`. A session is completed when a candle arrives outside it; it
 *   then becomes the previous session.
 * - The first session fed is only counted once it is known to be whole: if the
 *   very first candle with a time is already inside a session, that session
 *   never becomes the previous session.
 * - A candle without a usable `time` updates `price` only.
 */

export type SessionLevelsCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  /** candle open time, ms */
  time: number;
};

export type SessionLevelsResult = {
  prevOpen: number;
  prevHigh: number;
  prevMid: number;
  prevLow: number;
  prevClose: number;
  curOpen: number;
  price: number;
  inSession: number;
  sessionKey: number;
  prevSessionKey: number;
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
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
      );
    } catch {
      // Unknown zone: fall back to UTC rather than throw inside the study.
      formatters.set(timezone, null);
    }
  }
  return formatters.get(timezone) ?? null;
};

/** Local calendar date, weekday and minutes after midnight. */
type ZonedParts = {
  year: number;
  month: number;
  date: number;
  day: number;
  minutes: number;
};

const zonedParts = (
  timestamp: number,
  timezone?: string | null
): ZonedParts => {
  const formatter =
    timezone && timezone !== 'UTC' ? formatterFor(timezone) : null;
  if (!formatter) {
    const date = new Date(timestamp);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      date: date.getUTCDate(),
      day: date.getUTCDay(),
      minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
    };
  }
  const out: ZonedParts = { year: 0, month: 0, date: 0, day: 0, minutes: 0 };
  let hour = 0;
  let minute = 0;
  for (const part of formatter.formatToParts(timestamp)) {
    if (part.type === 'weekday') out.day = WEEKDAYS[part.value] ?? 0;
    else if (part.type === 'year') out.year = +part.value;
    else if (part.type === 'month') out.month = +part.value;
    else if (part.type === 'day') out.date = +part.value;
    else if (part.type === 'hour') hour = +part.value;
    else if (part.type === 'minute') minute = +part.value;
  }
  out.minutes = hour * 60 + minute;
  return out;
};

/** `yyyymmdd` of a calendar date; `date` may run over the month either way. */
const dateKey = (year: number, month: number, date: number): number => {
  const d = new Date(Date.UTC(year, month - 1, date));
  return (
    d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate()
  );
};

/**
 * The session `timestamp` belongs to (`yyyymmdd` of the local day it opened),
 * or null outside the session window.
 */
export const sessionKey = (
  timestamp: number,
  days: number[],
  hours?: SessionHours | null
): number | null => {
  const start = parseSessionTime(hours?.start);
  const end = parseSessionTime(hours?.end);
  const { year, month, date, day, minutes } = zonedParts(
    timestamp,
    hours?.timezone
  );
  let opened = date;
  if (start === null || end === null || start === end) {
    if (!days.includes(day)) return null;
  } else if (start < end) {
    if (!(minutes >= start && minutes < end && days.includes(day))) return null;
  } else if (minutes >= start) {
    if (!days.includes(day)) return null;
  } else if (minutes < end) {
    if (!days.includes((day + 6) % 7)) return null;
    opened = date - 1;
  } else {
    return null;
  }
  return dateKey(year, month, opened);
};

const SEEN = 0; // 1 once a candle with a time has been fed
const CUR_KEY = 1; // key of the session in progress, NaN outside one
const CUR_FULL = 2; // 1 when the session in progress was seen from its first candle
const CUR_OPEN = 3;
const CUR_HIGH = 4;
const CUR_LOW = 5;
const CUR_CLOSE = 6;
const PREV_KEY = 7; // key of the last completed session, NaN until there is one
const PREV_OPEN = 8;
const PREV_HIGH = 9;
const PREV_LOW = 10;
const PREV_CLOSE = 11;
const STATE_SIZE = 12;

export class SessionLevelsState {
  private readonly days: number[];
  private readonly hours: SessionHours | null;
  private readonly state = new Float64Array(STATE_SIZE).fill(NaN);

  constructor(days: number[], hours?: SessionHours | null) {
    this.days = (days ?? []).map(Number);
    this.hours = hours ?? null;
    this.state[SEEN] = 0;
    this.state[CUR_FULL] = 0;
  }

  /** Close the session in progress; a whole one becomes the previous session. */
  private complete() {
    const s = this.state;
    if (s[CUR_FULL] === 1) {
      s[PREV_KEY] = s[CUR_KEY];
      s[PREV_OPEN] = s[CUR_OPEN];
      s[PREV_HIGH] = s[CUR_HIGH];
      s[PREV_LOW] = s[CUR_LOW];
      s[PREV_CLOSE] = s[CUR_CLOSE];
    }
    s[CUR_KEY] = NaN;
    s[CUR_FULL] = 0;
    s[CUR_OPEN] = NaN;
    s[CUR_HIGH] = NaN;
    s[CUR_LOW] = NaN;
    s[CUR_CLOSE] = NaN;
  }

  private calculate(candle: SessionLevelsCandle): SessionLevelsResult {
    const s = this.state;
    const time = candle.time;
    const timed = typeof time === 'number' && isFinite(time);
    if (timed) {
      const key = sessionKey(time, this.days, this.hours) ?? NaN;
      if (!isNaN(key) && key === s[CUR_KEY]) {
        s[CUR_HIGH] = Math.max(s[CUR_HIGH], candle.high);
        s[CUR_LOW] = Math.min(s[CUR_LOW], candle.low);
        s[CUR_CLOSE] = candle.close;
      } else {
        if (!isNaN(s[CUR_KEY])) {
          this.complete();
        }
        if (!isNaN(key)) {
          s[CUR_KEY] = key;
          s[CUR_FULL] = s[SEEN];
          s[CUR_OPEN] = candle.open;
          s[CUR_HIGH] = candle.high;
          s[CUR_LOW] = candle.low;
          s[CUR_CLOSE] = candle.close;
        }
      }
      s[SEEN] = 1;
    }
    const inSession = timed && !isNaN(s[CUR_KEY]);
    const prevHigh = s[PREV_HIGH];
    const prevLow = s[PREV_LOW];
    return {
      prevOpen: s[PREV_OPEN],
      prevHigh,
      prevMid: (prevHigh + prevLow) / 2,
      prevLow,
      prevClose: s[PREV_CLOSE],
      curOpen: inSession ? s[CUR_OPEN] : NaN,
      price: candle.close,
      inSession: inSession ? 1 : 0,
      sessionKey: inSession ? s[CUR_KEY] : NaN,
      prevSessionKey: s[PREV_KEY],
    };
  }

  /** Feed a closed candle. */
  next(candle: SessionLevelsCandle): SessionLevelsResult {
    return this.calculate(candle);
  }

  /** The result `candle` would give, without feeding it (a forming candle). */
  preview(candle: SessionLevelsCandle): SessionLevelsResult {
    const saved = this.state.slice();
    const result = this.calculate(candle);
    this.state.set(saved);
    return result;
  }
}

/** The value of `level` in a result; NaN when it has none. */
export const sessionLevelValue = (
  result: SessionLevelsResult | null | undefined,
  level: string
): number => {
  if (!result) {
    return NaN;
  }
  switch (level) {
    case 'prevOpen':
      return result.prevOpen;
    case 'prevHigh':
      return result.prevHigh;
    case 'prevMid':
      return result.prevMid;
    case 'prevLow':
      return result.prevLow;
    case 'prevClose':
      return result.prevClose;
    case 'curOpen':
      return result.curOpen;
    case 'price':
      return result.price;
    default:
      return NaN;
  }
};
