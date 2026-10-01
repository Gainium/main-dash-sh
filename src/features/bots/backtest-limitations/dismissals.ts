// "Don't remind me again" for backtest limitations, remembered per item key in
// this browser. Storage can be unavailable (private mode, blocked site data)
// or hold anything; every access is guarded and a failure means "not
// dismissed", so the dialog keeps showing rather than silently disappearing.

const STORAGE_KEY = 'gainium.backtestLimitations.dismissed.v1';

export function readDismissedLimitations(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((k): k is string => typeof k === 'string')
        : []
    );
  } catch {
    return new Set();
  }
}

export function dismissLimitations(keys: readonly string[]): void {
  if (keys.length === 0) return;
  try {
    const next = readDismissedLimitations();
    for (const key of keys) next.add(key);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Not remembered — the dialog shows again next time.
  }
}
