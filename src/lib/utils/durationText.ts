const UNIT_DAYS: Record<string, number> = {
  mo: 30,
  d: 1,
  h: 1 / 24,
  min: 1 / 1440,
  m: 1 / 1440,
  s: 1 / 86400,
};

/**
 * A duration as the tables print it — " 3d 4h 12min", "1mo 3d", "12h 5m",
 * "40s" — in fractional days, so a number filter can compare it. `null` when
 * the text holds no duration ("–", "N/A", empty).
 */
export const durationTextToDays = (text?: string | null): number | null => {
  if (!text) return null;
  let days = 0;
  let found = false;
  const parts = text.matchAll(/(\d+(?:\.\d+)?)\s*(mo|min|d|h|m|s)\b/gi);
  for (const [, n, unit] of parts) {
    days += Number(n) * (UNIT_DAYS[unit.toLowerCase()] ?? 0);
    found = true;
  }
  return found ? days : null;
};
