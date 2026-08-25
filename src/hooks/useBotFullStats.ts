import { useMemo } from 'react';

import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { useBotStatsStore } from '../stores/live/botStatsStore';
import { BotTypesEnum, type BotStats, type BotSymbolsStats } from '../types';
import { useGraphQL } from './useGraphQL';

/**
 * Resolves the FULL `stats` / `symbolStats` block for one bot — the input to
 * the drawer's Statistics tab.
 *
 * Why a dedicated fetch: the drawer's bot usually comes from the page's LIST
 * query, and the list fragment strips `stats` to a chart-only slice for
 * payload reasons (see `statsOnlySelection` in GraphQLQueries-bot-queries).
 * So `bot.stats.numerical` is normally undefined on that path and the tab has
 * nothing to render. On the by-id / share-link path the bot DOES carry the
 * full block — pass it as `existing` and no request is made.
 *
 * Live updates: main-app emits `bot stats update` over the socket with this
 * exact shape whenever a bot recomputes its stats, and LiveUpdateContext
 * parks it in `botStatsStore` (`CalculatedBotStats` is a type alias of
 * `BotStats`). That is an UPDATE channel, not a hydration one — a bot that
 * hasn't closed a deal since page load never ticks — so it is used as an
 * overlay on top of the fetched snapshot, never as the only source.
 */
export interface UseBotFullStatsOptions {
  botId: string | null | undefined;
  type: BotTypesEnum;
  /** Share-link id when viewing a shared bot; null/undefined for owners. */
  shareId?: string | null | undefined;
  /** Gate the request — pass `false` while the Statistics tab is closed. */
  enabled?: boolean;
  /** Stats already present on the bot (by-id / share path); skips the fetch. */
  existing?: BotStats | undefined;
  /** symbolStats already present on the bot; skips the fetch. */
  existingSymbolStats?: BotSymbolsStats[] | undefined;
}

export interface UseBotFullStatsResult {
  stats: BotStats | undefined;
  symbolStats: BotSymbolsStats[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

const hasFullStats = (stats: BotStats | undefined): boolean =>
  !!stats?.numerical?.general;

const pickQuery = (type: BotTypesEnum) => {
  switch (type) {
    case BotTypesEnum.combo:
      return botQueries.getComboBotStats;
    case BotTypesEnum.hedgeDca:
      return botQueries.getHedgeDCABotStats;
    case BotTypesEnum.hedgeCombo:
      return botQueries.getHedgeComboBotStats;
    case BotTypesEnum.dca:
    default:
      return botQueries.getDCABotStats;
  }
};

const queryKeyFor = (type: BotTypesEnum): string => {
  switch (type) {
    case BotTypesEnum.combo:
      return 'getComboBotStats';
    case BotTypesEnum.hedgeDca:
      return 'getHedgeDCABotStats';
    case BotTypesEnum.hedgeCombo:
      return 'getHedgeComboBotStats';
    case BotTypesEnum.dca:
    default:
      return 'getDCABotStats';
  }
};

interface StatsPayload {
  _id?: string;
  stats?: BotStats;
  symbolStats?: BotSymbolsStats[];
}

export function useBotFullStats({
  botId,
  type,
  shareId,
  enabled = true,
  existing,
  existingSymbolStats,
}: UseBotFullStatsOptions): UseBotFullStatsResult {
  // Socket-pushed stats for this bot, when the bot has ticked since page load.
  const liveStats = useBotStatsStore((s) =>
    botId ? s.botStats[botId] : undefined
  );

  const needFetch =
    enabled && !!botId && !hasFullStats(existing) && !hasFullStats(liveStats);

  const builder = pickQuery(type);
  const queryKey = queryKeyFor(type);

  const built = useMemo(
    () =>
      needFetch
        ? builder({
            id: botId as string,
            ...(shareId ? { shareId } : {}),
          })
        : { query: 'query noop { __typename }', variables: {} },
    [needFetch, builder, botId, shareId]
  );

  const result = useGraphQL<StatsPayload>(queryKey, built, {
    enabled: needFetch,
    shareId: shareId ?? null,
  });

  return useMemo(() => {
    const fetched =
      result.data?.status === 'OK'
        ? ((result.data.data ?? undefined) as StatsPayload | undefined)
        : undefined;

    // Freshest first: socket > fetched snapshot > whatever the bot carried.
    const stats = hasFullStats(liveStats)
      ? liveStats
      : hasFullStats(fetched?.stats)
        ? fetched?.stats
        : hasFullStats(existing)
          ? existing
          : undefined;

    const symbolStats =
      fetched?.symbolStats && fetched.symbolStats.length > 0
        ? fetched.symbolStats
        : existingSymbolStats;

    return {
      stats,
      symbolStats,
      isLoading: needFetch && result.isLoading,
      isError: needFetch && result.isError,
    };
  }, [result, liveStats, existing, existingSymbolStats, needFetch]);
}
