/**
 * Get relative time string from timestamp
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''} ago`;
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else if (weeks > 0) {
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Alternative implementation that matches the original getLastTime function behavior
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
export function getLastTime(timestamp: number): string {
  return getRelativeTime(timestamp);
}

/**
 * Compact relative time, e.g. "12m", "2h", "1d", "3w".
 * Designed for tight UI captions like "Generated 12m ago" on preset
 * cards where the longer "12 minutes" form would wrap.
 *
 * @param timestamp Unix timestamp in milliseconds
 */
export function getCompactRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

/** Threshold (ms) above which a generatedAt timestamp is considered stale. */
export const STALE_GENERATED_AT_MS = 24 * 60 * 60 * 1000;

/**
 * True when the timestamp is older than 24h. Used by curated-preset
 * surfaces to color the "Generated X ago" caption with `text-warning`.
 */
export function isGeneratedAtStale(timestamp: number): boolean {
  return Date.now() - timestamp > STALE_GENERATED_AT_MS;
}

/**
 * The user's stored timezone comes from a free-text Settings input, so it can
 * hold an invalid IANA id — e.g. the localized spelling "Europa/Roma" instead
 * of "Europe/Rome". Feeding such a value to `Intl.DateTimeFormat` throws a
 * RangeError, and the daily-profit backend returns NOTOK for it, which blanked
 * the Overview Profit / Hero Balance widgets ($0.00 + "No profit history yet")
 * despite real profit. Validate and fall back to the browser's own resolved
 * zone (then UTC) so a corrupt stored value degrades gracefully instead of
 * zeroing the dashboard.
 */
export function getValidTimezone(tz?: string | null): string {
  if (tz) {
    try {
      // Throws RangeError for an unknown/invalid IANA identifier.
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    } catch {
      // fall through to a valid fallback
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Milliseconds to ADD to a UTC-encoded wall clock to get the real UTC instant
 * of that wall clock in `timeZone` — i.e. the negated zone offset
 * (Asia/Karachi, UTC+5 → `-18000000`). DST-correct, because it is evaluated at
 * the instant `date`.
 *
 * The obvious implementation — `new Date(date.toLocaleString('en-US', {timeZone}))`
 * — is a landmine: it formats to a locale string and parses it back with the
 * engine's own date parser, and those two disagree on ICU 72+ / Chrome 110-114,
 * which emit a NARROW NO-BREAK SPACE (U+202F) before AM/PM that the same
 * engine's `Date.parse` rejects. Both round-trips then yield an Invalid Date,
 * the offset is NaN, and every downstream `toISOString()` throws
 * "RangeError: Invalid time value" — which is exactly how the Overview Profit
 * widget crashed for a Chrome 110 Android user (bug #587). `formatToParts` +
 * arithmetic never round-trips through a string, so no parser is involved.
 *
 * Returns NaN for an invalid date or an unformattable zone; callers must treat
 * a non-finite result as "no offset available" rather than feeding it into a
 * Date they later serialize.
 */
export function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const time = date.getTime();
  if (!Number.isFinite(time)) return NaN;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date);

    const at = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((p) => p.type === type)?.value);

    // `hour12: false` renders midnight as "24" on some engines (ICU h23 vs h24).
    const hour = at('hour') % 24;
    const wallClockAsUTC = Date.UTC(
      at('year'),
      at('month') - 1,
      at('day'),
      hour,
      at('minute'),
      at('second')
    );
    if (!Number.isFinite(wallClockAsUTC)) return NaN;

    // The formatter has no millisecond field, so compare on the same second
    // boundary it rendered — otherwise a sub-second remainder leaks into the
    // offset and zones stop coming back as exact whole minutes.
    return Math.floor(time / 1000) * 1000 - wallClockAsUTC;
  } catch {
    return NaN;
  }
}

/**
 * The instant of `date`'s calendar-day midnight in `timeZone`, as an ISO
 * string — the key shape `getProfitByUser` returns for daily rows (Europe/Kyiv
 * midnight Jan 15 → `"2024-01-14T22:00:00.000Z"`).
 *
 * NEVER throws. Every fallible step degrades instead:
 *   - unreadable calendar day, or no offset from the engine → plain UTC
 *     midnight for that day (label off by the zone offset, widget still renders)
 *   - `date` itself invalid → `''`
 * This matters because the return value is fed to `Date.prototype.toISOString`,
 * which throws `RangeError: Invalid time value` on an Invalid Date — and an
 * uncaught throw here unmounted the whole Overview page for the user, since the
 * Profit widget computes it inside a `useMemo` during render (bug #587).
 */
export function getTimezoneAwareMidnightISO(
  date: Date,
  timeZone: string
): string {
  if (!Number.isFinite(date.getTime())) return '';

  let midnightUTC: Date;
  try {
    // e.g. "2024-01-15"
    const dateInTZ = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    const [year, month, day] = dateInTZ.split('-').map(Number);
    midnightUTC = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  } catch {
    return '';
  }
  if (!Number.isFinite(midnightUTC.getTime())) return '';

  // Resolve the offset AT that midnight, not at `date`, so a day that straddles
  // a DST transition still keys off its own offset.
  const offset = getTimezoneOffsetMs(midnightUTC, timeZone);
  const result = new Date(midnightUTC.getTime() + offset);

  return Number.isFinite(result.getTime())
    ? result.toISOString()
    : midnightUTC.toISOString();
}

/**
 * Parse one `getProfitByUser` result row's `date` into a Date.
 *
 * The backend encodes the bucket key differently per requested timeframe:
 *   0 (daily)   → ISO date string   e.g. "2026-07-28T00:00:00.000Z"
 *   1 (weekly)  → "<year>-<week>"   e.g. "2026-13"
 *   2 (monthly) → "<year>-<month>"  e.g. "2026-4"
 *   3 (total)   → epoch ms          e.g. 1697940000000
 *
 * Rows come back UNSORTED, and `new Date("2026-13")` is an Invalid Date, so a
 * consumer that wants them in chronological order has to decode the key first.
 *
 * Weekly buckets are numbered by Mongo's `$isoWeek` or `$week` (the user's
 * `weekStart` setting picks which), so the exact weekday a week starts on can
 * differ by a couple of days between users; the week is therefore approximated
 * as Jan 1 + (week - 1) weeks. That is precise enough to order buckets and
 * place them on a chart axis, but do not treat it as the true week boundary.
 *
 * Returns an Invalid Date for a malformed key — test with
 * `Number.isNaN(d.getTime())` before calling `toISOString()`, which throws.
 */
export function parseProfitBucketDate(
  date: string | number,
  timeframe: number
): Date {
  if (timeframe === 1 || timeframe === 2) {
    const [year, n] = String(date).split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(n)) {
      return new Date(NaN);
    }
    return timeframe === 1
      ? new Date(year, 0, 1 + (n - 1) * 7)
      : new Date(year, n - 1, 1);
  }
  return new Date(date);
}
