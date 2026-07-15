import { useEffect, useState } from 'react';

/**
 * Returns a coarse "now" timestamp that advances at most once per `intervalMs`.
 *
 * Use it as a dependency for time-windowed memos (e.g. a rolling cutoff window
 * or a "today" boundary) so they recompute periodically instead of freezing on
 * a value captured at mount. Without a ticking dep, react-query's structural
 * sharing can keep the same data reference for hours, so a `useMemo`/`useCallback`
 * that captured `Date.now()` never re-runs — the window stops sliding and a
 * daily chart never rolls over at midnight.
 *
 * The returned value is bucketed to `intervalMs` so it only changes once per
 * interval, keeping downstream recomputation to at most once per period. The
 * interval is cleaned up on unmount.
 *
 * @param intervalMs How often the tick may advance (default 60s).
 */
export function useNowTick(intervalMs = 60_000): number {
  const [tick, setTick] = useState(() =>
    Math.floor(Date.now() / intervalMs) * intervalMs
  );

  useEffect(() => {
    const id = setInterval(() => {
      const bucket = Math.floor(Date.now() / intervalMs) * intervalMs;
      setTick((prev) => (prev === bucket ? prev : bucket));
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs]);

  return tick;
}

export default useNowTick;
