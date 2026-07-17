import { useGraphQL } from '@/hooks/useGraphQL';
import { useShareContext } from '@/hooks/useShareContext';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import logger from '@/lib/loggerInstance';
import { useEffect, useRef } from 'react';

/**
 * Result of resolving which trading mode (paper vs live) a specific bot
 * actually lives in.
 *
 * - `resolving` — probes are still in flight; render a loading state.
 * - `ok` — the bot exists in the currently-active mode (or the guard was
 *   disabled, e.g. demo / shared bots); render normally.
 * - `notFound` — the bot exists in NEITHER paper nor live for this user;
 *   render a clear not-found message instead of a broken form.
 */
export type BotModeGuardStatus = 'resolving' | 'ok' | 'notFound';

export interface BotModeGuardResult {
  status: BotModeGuardStatus;
  /** True once we've confirmed the bot is missing in both paper and live. */
  notFound: boolean;
  /** True while the paper/live probes are still resolving. */
  isResolving: boolean;
}

/**
 * Bot detail / edit pages resolve `getBot`'s paper-context from the GLOBAL
 * live/paper toggle (see `useGraphQL`). That toggle is re-derived from the
 * user profile on every hard reload (`usePaperContext`), so opening or
 * refreshing a PAPER bot while the profile default is Live queries the bot
 * in live, gets `status: OK` + `data: null`, and silently renders
 * "Unknown exchange" (community thread 4872).
 *
 * This hook makes the OPEN bot authoritative over the global toggle:
 *   1. It probes `getBot` in the currently-active mode.
 *   2. If the bot is missing there but present in the OTHER mode, it flips
 *      the global toggle to that mode (store-only via `setTradingMode`, so
 *      the user's saved profile default is untouched) — every downstream
 *      query then re-runs in the bot's real mode and the page loads.
 *   3. If the bot is missing in BOTH modes, it reports `notFound` so the
 *      page can surface a clear error instead of "Unknown exchange".
 *
 * Skipped for shared bots (the `demo`/shareId path has its own resolution)
 * and in demo mode.
 */
export function useBotModeGuard(
  botId: string | undefined,
  botType: BotTypesEnum,
  options?: { enabled?: boolean }
): BotModeGuardResult {
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const setTradingMode = useUIStore((s) => s.setTradingMode);

  // Shared-bot views authorize by shareId, not the paper/live toggle — the
  // probe below would query the wrong record, so leave them alone.
  const { shareId } = useShareContext();

  const enabled =
    (options?.enabled ?? true) &&
    !!botId &&
    tradingMode !== 'demo' &&
    !shareId;

  const probe = getExistenceProbe(botType, botId ?? '');

  // Probe in the CURRENT mode. Same paper-context the page itself uses, so
  // in the happy path this dedupes conceptually with the page's own load.
  const current = useGraphQL<{ _id: string }>(
    `botModeGuard_${botType}_${botId}`,
    probe,
    {
      enabled,
      paperContext: !isLiveTrading,
      staleTime: 30_000,
    }
  );

  // The bot is "missing" in a mode when the query resolved to a payload that
  // isn't a populated OK — the backend answers a wrong-mode lookup with
  // `status: NOTOK` ("Bot not found"), and occasionally `OK` + null.
  //
  // Only a payload this probe actually resolved FOR THE CURRENT KEY counts as
  // evidence. `!!data` is not enough: the global
  // `placeholderData: (prev) => prev` in `lib/queryClient` back-fills `data`
  // with the PREVIOUS key's payload whenever this key has none of its own —
  // on a thrown/timed-out request, and while a key change refetches (the key
  // mixes in live/paper via `useCacheKey`, so flipping the toggle swaps it).
  // Reading `!!data` therefore let a stale or unrelated `NOTOK` vote as "not
  // in this mode", flipping the user's trading mode for a bot that was never
  // in the other mode and reporting a healthy bot as notFound. `isSuccess`
  // excludes errors; `isPlaceholderData` excludes borrowed payloads. Absence
  // of evidence must not read as evidence of absence.
  const currentResolved = current.isSuccess && !current.isPlaceholderData;
  const foundInCurrent =
    currentResolved &&
    current.data?.status === 'OK' &&
    current.data.data != null;
  const missingInCurrent = currentResolved && !foundInCurrent;

  // Only reach for the OTHER mode once we know it's missing in the current
  // one — avoids a second request on every normal bot page load.
  const other = useGraphQL<{ _id: string }>(
    `botModeGuard_other_${botType}_${botId}`,
    probe,
    {
      enabled: enabled && missingInCurrent,
      paperContext: isLiveTrading,
      staleTime: 30_000,
    }
  );

  // Same rule for the other-mode probe (see `currentResolved`).
  const otherResolved = other.isSuccess && !other.isPlaceholderData;
  const foundInOther =
    otherResolved && other.data?.status === 'OK' && other.data.data != null;
  const missingInOther = otherResolved && !foundInOther;

  // Align the global toggle to the mode the bot actually lives in. This is a
  // store-only update (not `usePaperContext.setPaperContext`), so it doesn't
  // mutate the user's persisted profile default — it just makes the current
  // session's queries target the right collection.
  //
  // Realign at most ONCE per bot. `setTradingMode(!isLiveTrading)` is defined
  // relative to the toggle it just flipped, and `isLiveTrading` is a dependency
  // of this effect, so a second pass inverts the value straight back. The probes
  // cannot break the tie: flipping the toggle changes BOTH probe cache keys
  // (`useCacheKey` mixes in live/paper), and the global
  // `placeholderData: (prev) => prev` in `lib/queryClient` keeps serving the
  // pre-flip answers while the new keys refetch — so `missingInCurrent &&
  // foundInOther` stays true across the flip and the toggle oscillates forever.
  // Every pass re-filters each paper/live list (bots appear/vanish) until React
  // trips its update-depth limit and the page dies to the ErrorBoundary (#185).
  const realignedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!botId) return;
    if (!(missingInCurrent && foundInOther)) return;
    if (realignedForRef.current === botId) return;

    realignedForRef.current = botId;
    logger.info('[useBotModeGuard] realigning trading mode to bot mode', {
      botId,
      botType,
      wasLive: isLiveTrading,
      nowLive: !isLiveTrading,
    });
    setTradingMode(!isLiveTrading);
  }, [
    missingInCurrent,
    foundInOther,
    isLiveTrading,
    setTradingMode,
    botId,
    botType,
  ]);

  if (!enabled) {
    return { status: 'ok', notFound: false, isResolving: false };
  }

  const notFound = missingInCurrent && missingInOther;
  const isResolving =
    current.isLoading || (missingInCurrent && !foundInOther && other.isLoading);

  const status: BotModeGuardStatus = notFound
    ? 'notFound'
    : isResolving
      ? 'resolving'
      : 'ok';

  return { status, notFound, isResolving };
}

/**
 * Minimal `getBot`-family query that selects only `_id` — enough to tell
 * whether the bot exists in a given mode without pulling the full document.
 * The operation's root field must match the bot type so `useGraphQL` can
 * extract the result key.
 */
function getExistenceProbe(
  botType: BotTypesEnum,
  id: string
): { query: string; variables: { input: { id: string } } } {
  const field =
    botType === BotTypesEnum.grid
      ? 'getBot'
      : botType === BotTypesEnum.dca
        ? 'getDCABot'
        : botType === BotTypesEnum.combo
          ? 'getComboBot'
          : botType === BotTypesEnum.hedgeCombo
            ? 'getHedgeComboBot'
            : 'getHedgeDCABot';

  const query = `query ${field}Exists($input: getBotInput!) {
                    ${field}(input: $input) {
                        status
                        reason
                        data { _id }
                    }
                }`;

  return { query, variables: { input: { id } } };
}
