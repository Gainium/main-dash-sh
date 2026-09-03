/**
 * Stale-balance marker (spec: main-app 002 / dashboard "last fetched").
 *
 * A balance row carries `updated`, the time the backend last wrote it — from
 * a venue stream event or a REST refresh. Streams drop, and some venues (Kraken
 * spot until connector 2.13.8) never streamed at all, so a row can quietly
 * show a number that is hours old. The marker appears only past a threshold,
 * so it reads as a signal rather than decoration.
 */

/** Rows older than this are marked stale. */
export const BALANCE_STALE_AFTER_MS = 15 * 60 * 1000;

export const parseUpdated = (updated?: string | null): number | null => {
  if (!updated) return null;
  const t = Date.parse(updated);
  return Number.isFinite(t) ? t : null;
};

/** True when the row's last write is older than `thresholdMs`. Unknown ⇒ false. */
export const isBalanceStale = (
  updated: string | null | undefined,
  now: number = Date.now(),
  thresholdMs: number = BALANCE_STALE_AFTER_MS
): boolean => {
  const t = parseUpdated(updated);
  return t !== null && now - t > thresholdMs;
};

/** The oldest of several rows' `updated` (for an asset summed across venues). */
export const oldestUpdated = (
  values: Array<string | null | undefined>
): string | null => {
  let best: { iso: string; t: number } | null = null;
  for (const v of values) {
    const t = parseUpdated(v);
    if (t === null || !v) continue;
    if (!best || t < best.t) best = { iso: v, t };
  }
  return best?.iso ?? null;
};

/** "3 min ago", "2 h ago", "yesterday" — short, for a tooltip. */
export const formatAge = (
  updated: string | null | undefined,
  now: number = Date.now()
): string => {
  const t = parseUpdated(updated);
  if (t === null) return 'unknown';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
