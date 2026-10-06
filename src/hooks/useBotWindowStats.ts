import { useMemo } from 'react';

import type { BotWindowStatsData } from '@/components/widgets/bots/stats/botWindowStatsViewModel';

import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import type { BotTypesEnum } from '../types';
import { useGraphQL } from './useGraphQL';

export interface UseBotWindowStatsOptions {
  botId: string | null | undefined;
  type: BotTypesEnum;
  shareId?: string | null | undefined;
  enabled?: boolean;
}

/**
 * Lifetime / since-last-change stats for the drawer's Statistics tab, folded
 * by main-app from the bot's deals. `data` is undefined while loading and when
 * the backend predates `getBotWindowStats` — the tab then shows the engine's
 * stored stats alone, as before.
 */
export function useBotWindowStats({
  botId,
  type,
  shareId,
  enabled = true,
}: UseBotWindowStatsOptions): { data: BotWindowStatsData | undefined } {
  const active = enabled && !!botId;
  const built = useMemo(
    () =>
      active
        ? botQueries.getBotWindowStats({
            id: botId as string,
            type,
            ...(shareId ? { shareId } : {}),
          })
        : { query: 'query noop { __typename }', variables: {} },
    [active, botId, type, shareId]
  );

  const result = useGraphQL<BotWindowStatsData>('getBotWindowStats', built, {
    enabled: active,
    shareId: shareId ?? null,
    // An old backend answers with a schema error; asking again won't help.
    retry: false,
  });

  return useMemo(
    () => ({
      data:
        active && result.data?.status === 'OK'
          ? (result.data.data as BotWindowStatsData)
          : undefined,
    }),
    [active, result.data]
  );
}
