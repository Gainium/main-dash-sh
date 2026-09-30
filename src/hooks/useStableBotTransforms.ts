import { useRef } from 'react';

import { logger } from '@/lib/loggerInstance';

const SKIP = Symbol('skip');

interface CacheEntry<TRaw, TSlice, TOut> {
  raw: TRaw;
  slice: TSlice;
  deps: unknown;
  /** SKIP when the transform threw and there was no earlier good output. */
  out: TOut | typeof SKIP;
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
 *
 * A transform that throws is isolated to its own bot: the error is logged and
 * that bot keeps its last good output (or is left out if it never had one), so
 * one malformed record can never take down the whole list page.
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
    let result: TOut;
    try {
      result = transform(raw, slice);
    } catch (error) {
      logger.error('[useStableBotTransforms] bot transform failed', {
        botId: id,
        error,
      });
      // Remember the failure against these exact inputs so it is neither
      // re-run nor re-logged until the bot's record or stats change.
      const fallback = cached ? cached.out : SKIP;
      next.set(id, { raw, slice, deps, out: fallback });
      return fallback;
    }
    next.set(id, { raw, slice, deps, out: result });
    return result;
  });

  cacheRef.current = next;
  return out.filter((o): o is TOut => o !== SKIP);
}
