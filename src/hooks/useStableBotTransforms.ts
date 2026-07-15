import { useRef } from 'react';

interface CacheEntry<TRaw, TSlice, TOut> {
  raw: TRaw;
  slice: TSlice;
  deps: unknown;
  out: TOut;
}

/**
 * Memoizes a per-bot transform so bots whose raw record, live-stats slice, and
 * shared dependencies are all referentially unchanged keep the SAME output
 * object across renders.
 *
 * The bot list pages subscribe to the whole `botStats` store object, which gets
 * a fresh reference on every single bot's socket tick. Mapping the raw list
 * through `transformDcaBotToBot` on each of those ticks produced brand-new
 * `item` objects for EVERY bot — defeating the `React.memo` on the card
 * components, so a stats update for one bot re-rendered the entire grid.
 *
 * By reusing the previous output for bots whose inputs didn't change, a tick
 * for bot A yields a fresh object only for A; every other card keeps its stable
 * reference and its memo short-circuits. Behavior is unchanged — the same
 * transform runs whenever any of a bot's inputs actually change.
 */
export function useStableBotTransforms<TRaw, TSlice, TOut>(
  raws: TRaw[],
  getId: (raw: TRaw) => string,
  getSlice: (id: string) => TSlice,
  deps: unknown,
  transform: (raw: TRaw, slice: TSlice) => TOut
): TOut[] {
  const cacheRef = useRef<Map<string, CacheEntry<TRaw, TSlice, TOut>>>(
    new Map()
  );
  const prev = cacheRef.current;
  const next = new Map<string, CacheEntry<TRaw, TSlice, TOut>>();

  const out = raws.map((raw) => {
    const id = getId(raw);
    const slice = getSlice(id);
    const cached = prev.get(id);
    if (
      cached &&
      cached.raw === raw &&
      cached.slice === slice &&
      cached.deps === deps
    ) {
      next.set(id, cached);
      return cached.out;
    }
    const result = transform(raw, slice);
    next.set(id, { raw, slice, deps, out: result });
    return result;
  });

  cacheRef.current = next;
  return out;
}
