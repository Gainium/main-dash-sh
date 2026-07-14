import { useMemo, useRef } from 'react';
import { BotTypesEnum, type ComboBot, type DCABot } from '../types';
import { useSharedBot } from './useSharedBot';

/**
 * Single source of truth for resolving the bot shown in a bot detail drawer.
 *
 * EVERY bot list page (Trading / Grid / Combo / Hedge…) uses this instead of
 * hand-rolling its own `selectedBotData` memo. It handles, in one place:
 *
 *  1. **List lookup** — the fast path: the selected bot is already in the page's
 *     (already-transformed) list.
 *  2. **By-id fallback** — the bot isn't in the current list (an ARCHIVED bot
 *     filtered out of the default list, or a share-link visitor whose list is
 *     empty): fetch it by id via `useSharedBot` and transform it with the
 *     caller-supplied `transformRaw`. So archived bots stay viewable.
 *  3. **Sticky through refetch** — the list momentarily EMPTIES during background
 *     (websocket-driven) refetches; without this the resolved bot would blink to
 *     `undefined` and unmount/remount the drawer (resetting its tab state and
 *     flashing the list). We hold the last resolved bot for the current selection
 *     so the drawer stays mounted across transient refetches.
 *  4. **notFound signal** — true only when the bot is genuinely gone (not in the
 *     list AND the by-id fetch resolved with nothing), so the page can redirect.
 *
 * The per-type `transformRaw` is the only bot-type-specific input; everything
 * else is shared. Pass a STABLE reference isn't required — it's read through a
 * ref so its identity never triggers churn.
 */
export interface UseDrawerBotOptions<TBot> {
  /** Currently-selected bot id from the route (null when the drawer is closed). */
  selectedBotId: string | null | undefined;
  /** The page's already-transformed list bots (drawer shape). */
  listBots: TBot[];
  type: BotTypesEnum;
  /** Share-link id, when viewing a shared bot (null/undefined for owners). */
  shareId?: string | null;
  /** True while the page's list query is loading — gates the by-id fallback so
   *  we don't declare "not found" before the list has even loaded. */
  listLoading?: boolean;
  /** Transform a raw by-id-fetched bot into the drawer bot shape. */
  transformRaw: (raw: DCABot | ComboBot) => TBot | undefined;
  /** Read a bot's id from a list bot. Defaults to `b.id`. */
  getId?: (b: TBot) => string;
}

export interface UseDrawerBotResult<TBot> {
  bot: TBot | undefined;
  /** The by-id fallback fetch is in flight. */
  isLoading: boolean;
  /** Genuinely not found (not in list AND by-id fetch returned nothing). */
  notFound: boolean;
  /** The raw by-id-fetched bot (only populated on the fallback/share path).
   *  Used for the owner check that gates read-only drawer actions. */
  rawBot: DCABot | ComboBot | null;
}

export function useDrawerBot<TBot>({
  selectedBotId,
  listBots,
  type,
  shareId,
  listLoading = false,
  transformRaw,
  getId,
}: UseDrawerBotOptions<TBot>): UseDrawerBotResult<TBot> {
  const idOf = getId ?? ((b: TBot) => (b as { id?: string }).id ?? '');

  const inList = useMemo(
    () => !!selectedBotId && listBots.some((b) => idOf(b) === selectedBotId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedBotId, listBots]
  );

  // Fetch by id when a bot is selected but not in the loaded list (archived) or
  // when viewing a share link (the visitor's list is empty). `useSharedBot` uses
  // the auth token when `shareId` is null, so this doubles as an authenticated
  // by-id fetch.
  const needFallback = !!selectedBotId && !inList && !listLoading;
  const fetched = useSharedBot({
    botId: selectedBotId ?? '',
    type,
    shareId: shareId ?? null,
    enabled: needFallback,
  });

  // transformRaw read through a ref so a fresh callback identity each render
  // doesn't retrigger the memo (callers needn't wrap it in useCallback).
  const transformRef = useRef(transformRaw);
  transformRef.current = transformRaw;

  const lastResolvedRef = useRef<{ id: string; bot: TBot } | null>(null);

  const bot = useMemo(() => {
    const resolve = (): TBot | undefined => {
      const fromList = listBots.find((b) => idOf(b) === selectedBotId);
      if (fromList) return fromList;
      if (fetched.bot && selectedBotId) {
        try {
          return transformRef.current(fetched.bot) ?? undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    };
    const resolved = resolve();
    if (resolved && selectedBotId) {
      lastResolvedRef.current = { id: selectedBotId, bot: resolved };
      return resolved;
    }
    // Transient miss (list mid-refetch): keep the last resolved bot for THIS
    // selection so the drawer doesn't unmount. A different/closed selection
    // returns undefined.
    if (selectedBotId && lastResolvedRef.current?.id === selectedBotId) {
      return lastResolvedRef.current.bot;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBotId, listBots, fetched.bot]);

  const notFound =
    !!selectedBotId &&
    !inList &&
    !listLoading &&
    !fetched.isLoading &&
    !fetched.bot &&
    !bot;

  return { bot, isLoading: fetched.isLoading, notFound, rawBot: fetched.bot };
}

export default useDrawerBot;
