import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * The timeframe the user starred in a chart's interval menu. Bot and deal
 * charts open on it, ahead of any indicator timeframe.
 *
 * TradingView keeps its starred intervals under the `IntervalWidget.quicks`
 * setting; local-storage settings are off in our widget, so without this the
 * star is lost when the chart closes. TradingView lets several intervals be
 * starred and offers no API to unstar one, so when more than one is starred
 * the shortest counts and the next chart is seeded with that one only.
 */
export const TV_FAVORITE_INTERVALS_KEY = 'IntervalWidget.quicks';

/** Length of a TradingView resolution in seconds, or null if unparseable. */
export function resolutionToSeconds(resolution: string): number | null {
  const match = /^(\d*)([SDWM]?)$/i.exec(resolution.trim());
  if (!match) return null;
  const count = match[1] ? Number(match[1]) : 1;
  if (!(count > 0)) return null;
  const unit = (match[2] ?? '').toUpperCase();
  const unitSeconds =
    unit === 'S'
      ? 1
      : unit === 'D'
        ? 86_400
        : unit === 'W'
          ? 604_800
          : unit === 'M'
            ? 2_592_000
            : 60;
  return count * unitSeconds;
}

/** The single favourite out of TradingView's starred list: the shortest. */
export function pickFavoriteInterval(intervals: string[]): string | null {
  let best: { interval: string; seconds: number } | null = null;
  for (const interval of intervals) {
    const seconds = resolutionToSeconds(interval);
    if (seconds === null) continue;
    if (!best || seconds < best.seconds) best = { interval, seconds };
  }
  return best?.interval ?? null;
}

interface ChartFavoriteIntervalState {
  favoriteInterval: string | null;
  /** Takes TradingView's raw `IntervalWidget.quicks` value (JSON array). */
  setFromTradingView: (value: string | null) => void;
}

export const useChartFavoriteIntervalStore =
  create<ChartFavoriteIntervalState>()(
    persist(
      (set) => ({
        favoriteInterval: null,
        setFromTradingView: (value) => {
          let intervals: string[] = [];
          if (value) {
            try {
              const parsed: unknown = JSON.parse(value);
              if (Array.isArray(parsed)) {
                intervals = parsed.filter(
                  (v): v is string => typeof v === 'string'
                );
              }
            } catch {
              intervals = [];
            }
          }
          set({ favoriteInterval: pickFavoriteInterval(intervals) });
        },
      }),
      {
        name: 'gainium:chartFavoriteInterval',
        storage: createJSONStorage(() => localStorage),
      }
    )
  );

/** Current favourite, read outside React (chart init, stores). */
export const getFavoriteChartInterval = (): string | null =>
  useChartFavoriteIntervalStore.getState().favoriteInterval;

/** `settings_adapter` for a TradingView widget that persists the star. */
export function createFavoriteIntervalSettingsAdapter() {
  const favorite = getFavoriteChartInterval();
  return {
    initialSettings: favorite
      ? { [TV_FAVORITE_INTERVALS_KEY]: JSON.stringify([favorite]) }
      : {},
    setValue(key: string, value: string) {
      if (key !== TV_FAVORITE_INTERVALS_KEY) return;
      useChartFavoriteIntervalStore.getState().setFromTradingView(value);
    },
    removeValue(key: string) {
      if (key !== TV_FAVORITE_INTERVALS_KEY) return;
      useChartFavoriteIntervalStore.getState().setFromTradingView(null);
    },
  };
}
