import { test, expect } from '@playwright/test';

import {
  getTimezoneAwareMidnightISO,
  getTimezoneOffsetMs,
} from '@/utils/timeUtils';

/**
 * Regression lock for bug #587 — `RangeError: Invalid time value` thrown from
 * `Date.toISOString` inside the Overview Profit widget, crashing the whole page
 * for a Chrome 110 Android user (7 reports in 24h, one user, Asia/Karachi).
 *
 * The old implementation derived the zone offset by formatting a Date to a
 * locale string and parsing it straight back:
 *
 *   new Date(date.toLocaleString('en-US', { timeZone })).getTime()
 *
 * That is a round-trip through the engine's OWN date parser, and on ICU 72+ /
 * Chrome 110-114 the formatter emits a NARROW NO-BREAK SPACE (U+202F) before
 * AM/PM which that same engine's parser rejects. Both sides become NaN, the
 * offset is NaN, and the resulting Invalid Date throws on `toISOString()`.
 *
 * We cannot run a Chrome-110-era V8 here, so `brokenLocaleRoundTrip` injects
 * the *condition* that engine creates — a `toLocaleString` output that does not
 * parse back — and asserts the old formula dies on it while the new helper,
 * which never round-trips through a string, does not.
 */

const KARACHI = 'Asia/Karachi'; // UTC+5, no DST — the reporter's zone
const ROME = 'Europe/Rome'; // UTC+1 / +2, DST — catches offset-at-the-wrong-instant

/** The pre-fix offset helper, verbatim, so the test can prove it crashes. */
const legacyOffset = (date: Date, timeZone: string): number => {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
  return utcDate.getTime() - tzDate.getTime();
};

/** Run `fn` on an engine whose `toLocaleString` output no longer parses back. */
const brokenLocaleRoundTrip = <T>(fn: () => T): T => {
  const original = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = function () {
    return 'Invalid Date';
  };
  try {
    return fn();
  } finally {
    Date.prototype.toLocaleString = original;
  }
};

test.describe('bug #587 — Profit widget timezone midnight', () => {
  test('BEFORE: the locale round-trip throws when the engine cannot reparse', () => {
    const midnightUTC = new Date(Date.UTC(2026, 7, 30));

    brokenLocaleRoundTrip(() => {
      const offset = legacyOffset(midnightUTC, KARACHI);
      expect(Number.isNaN(offset)).toBe(true);
      // This is the exact production stack: getTimezoneAwareMidnight ->
      // Date.toISOString -> RangeError.
      expect(() =>
        new Date(midnightUTC.getTime() + offset).toISOString()
      ).toThrow(/Invalid time value/);
    });
  });

  test('AFTER: the helper survives that engine and stays correct', () => {
    const day = new Date('2026-08-30T09:15:42.123Z');

    const healthy = getTimezoneAwareMidnightISO(day, KARACHI);
    // Midnight Aug 30 in Karachi (UTC+5) is 19:00 UTC on Aug 29.
    expect(healthy).toBe('2026-08-29T19:00:00.000Z');

    // Same answer with the locale round-trip broken — it is never used.
    expect(brokenLocaleRoundTrip(() => getTimezoneAwareMidnightISO(day, KARACHI))).toBe(
      healthy
    );
  });

  test('offsets are correct across zone shapes and DST', () => {
    // Absolute expectations, NOT a comparison against `legacyOffset` — the old
    // formula is independently wrong (see the next test), so it is not an
    // oracle. Values are the negated IANA offset, in ms. Covers whole-hour,
    // half-hour, three-quarter-hour, west-of-UTC and southern-hemisphere DST.
    const H = 3_600_000;
    const cases: Array<[string, string, number]> = [
      // northern winter
      ['2026-01-15T00:00:00Z', KARACHI, -5 * H],
      ['2026-01-15T00:00:00Z', 'Asia/Kolkata', -5.5 * H],
      ['2026-01-15T00:00:00Z', 'Asia/Kathmandu', -5.75 * H],
      ['2026-01-15T00:00:00Z', 'America/New_York', 5 * H], // EST
      ['2026-01-15T00:00:00Z', 'Pacific/Chatham', -13.75 * H], // southern DST
      ['2026-01-15T00:00:00Z', 'UTC', 0],
      ['2026-01-15T00:00:00Z', ROME, -1 * H], // CET
      // northern summer
      ['2026-07-15T00:00:00Z', KARACHI, -5 * H], // Karachi has no DST
      ['2026-07-15T00:00:00Z', 'America/New_York', 4 * H], // EDT
      ['2026-07-15T00:00:00Z', 'Pacific/Chatham', -12.75 * H],
      ['2026-07-15T00:00:00Z', ROME, -2 * H], // CEST
      // the EU transition instants themselves (01:00 UTC)
      ['2026-03-29T02:00:00Z', ROME, -2 * H],
      ['2026-10-25T02:00:00Z', ROME, -1 * H],
      ['2026-03-29T02:00:00Z', KARACHI, -5 * H],
      ['2026-10-25T02:00:00Z', KARACHI, -5 * H],
    ];

    for (const [iso, timeZone, expected] of cases) {
      expect(
        getTimezoneOffsetMs(new Date(iso), timeZone),
        `${timeZone} @ ${iso}`
      ).toBe(expected);
    }
  });

  test('the legacy formula also mis-reads the offset at the VIEWER’s own DST edge', () => {
    // Second defect the round-trip carried, independent of the crash: it parses
    // the locale strings back in the MACHINE's local zone, so when that zone is
    // inside its own spring-forward gap the parse is normalised an hour forward
    // and the offset comes out wrong for EVERY user timezone — including ones
    // with no DST at all, like Karachi. Only assert it where the host actually
    // has a transition, so the test stays deterministic off-Europe.
    const gap = new Date('2026-03-29T02:00:00Z');
    const hostShiftsHere =
      legacyOffset(gap, 'UTC') !== 0 ||
      legacyOffset(gap, KARACHI) !== getTimezoneOffsetMs(gap, KARACHI);

    if (hostShiftsHere) {
      expect(legacyOffset(gap, KARACHI)).not.toBe(-5 * 3_600_000);
    }
    // The new helper is right regardless of where the viewer's clock is.
    expect(getTimezoneOffsetMs(gap, KARACHI)).toBe(-5 * 3_600_000);
  });

  test('DST-aware: Rome midnight keys differ by an hour across the transition', () => {
    // Rome is UTC+1 in winter, UTC+2 in summer. The offset must be resolved at
    // each day's own midnight, not at a single reference instant.
    expect(
      getTimezoneAwareMidnightISO(new Date('2026-01-15T12:00:00Z'), ROME)
    ).toBe('2026-01-14T23:00:00.000Z');
    expect(
      getTimezoneAwareMidnightISO(new Date('2026-07-15T12:00:00Z'), ROME)
    ).toBe('2026-07-14T22:00:00.000Z');
  });

  test('degrades instead of throwing on unusable input', () => {
    // An Invalid Date used to throw from Intl.format() before it ever reached
    // toISOString(); now it yields an empty key the chart simply renders blank.
    expect(getTimezoneAwareMidnightISO(new Date('nope'), KARACHI)).toBe('');
    expect(getTimezoneAwareMidnightISO(new Date(), 'Not/AZone')).toBe('');
    expect(Number.isNaN(getTimezoneOffsetMs(new Date('nope'), KARACHI))).toBe(
      true
    );
    expect(
      Number.isNaN(getTimezoneOffsetMs(new Date(), 'Not/AZone'))
    ).toBe(true);

    // The offset failing on its own must not take the key down with it: fall
    // back to plain UTC midnight rather than an Invalid Date.
    const originalDTF = Intl.DateTimeFormat;
    class HalfBrokenDTF extends originalDTF {
      formatToParts(): Intl.DateTimeFormatPart[] {
        throw new Error('formatToParts unavailable');
      }
    }
    (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat =
      HalfBrokenDTF as unknown as typeof Intl.DateTimeFormat;
    try {
      expect(
        getTimezoneAwareMidnightISO(new Date('2026-08-30T09:15:42Z'), KARACHI)
      ).toBe('2026-08-30T00:00:00.000Z');
    } finally {
      (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat =
        originalDTF;
    }
  });
});
