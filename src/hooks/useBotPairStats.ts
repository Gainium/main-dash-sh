import { useMemo } from 'react';

import type { BotPairStatsDTO } from '@/components/widgets/bots/stats/pairStatsViewModel';

import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import type { BotTypesEnum } from '../types';
import { useGraphQL } from './useGraphQL';

export interface UseBotPairStatsOptions {
  botId: string | null | undefined;
  type: BotTypesEnum;
  shareId?: string | null | undefined;
  /** Window on the closed deals, ms. Both undefined = all time. */
  from?: number | undefined;
  to?: number | undefined;
  enabled?: boolean;
}

export interface UseBotPairStatsResult {
  rows: BotPairStatsDTO[] | undefined;
  isLoading: boolean;
  /**
   * The request failed or the backend refused it — including a backend that
   * predates `getBotPairStats`. The caller falls back to stored symbolStats.
   */
  unavailable: boolean;
}

/**
 * Per-pair stats for the drawer's Statistics tab, folded by main-app from the
 * bot's deals. Not socket-driven: it is refetched when the range changes and
 * on the query's normal staleness, which is enough for a history table.
 */
export function useBotPairStats({
  botId,
  type,
  shareId,
  from,
  to,
  enabled = true,
}: UseBotPairStatsOptions): UseBotPairStatsResult {
  const active = enabled && !!botId;
  const built = useMemo(
    () =>
      active
        ? botQueries.getBotPairStats({
            id: botId as string,
            type,
            ...(shareId ? { shareId } : {}),
            ...(typeof from === 'number' ? { from } : {}),
            ...(typeof to === 'number' ? { to } : {}),
          })
        : { query: 'query noop { __typename }', variables: {} },
    [active, botId, type, shareId, from, to]
  );

  const result = useGraphQL<BotPairStatsDTO[]>('getBotPairStats', built, {
    enabled: active,
    shareId: shareId ?? null,
    // An old backend answers with a schema error; asking again won't help.
    retry: false,
  });

  return useMemo(() => {
    const ok = result.data?.status === 'OK';
    return {
      rows: ok ? ((result.data?.data ?? []) as BotPairStatsDTO[]) : undefined,
      isLoading: active && result.isLoading,
      unavailable: active && !result.isLoading && !ok,
    };
  }, [active, result.data, result.isLoading]);
}
