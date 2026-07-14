import { useMemo } from 'react';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { BotTypesEnum, type ComboBot, type DCABot } from '../types';
import { useGraphQL } from './useGraphQL';

/**
 * Fetches a single bot by id using its public share id. Used by the
 * read-only share-link view path so non-authenticated visitors can
 * render the bot detail drawer without depending on the owner's bot
 * list query (which would 401 without a token).
 *
 * Mirrors main-dash/components/dcabot/hooks/useDCAPage.ts:154-180 where
 * the `'demo'` token + shareId path replaces the regular getBot call.
 *
 * Returns the raw bot shape — callers transform it with the matching
 * `transformDcaBotToBot` / `transformComboBotToBot` adapter before
 * passing it to the drawer.
 */
export interface UseSharedBotOptions {
  botId: string;
  type: BotTypesEnum;
  shareId: string | null | undefined;
  /**
   * Override for when the query runs. Defaults to share-link behaviour
   * (`!!shareId && !!botId`). Pass an explicit value to reuse this as an
   * AUTHENTICATED by-id fetch — e.g. the detail drawer's fallback for a bot that
   * is not in the current list (an archived / cold-stored bot filtered out of the
   * default list). With `shareId` null the query uses the user's auth token.
   */
  enabled?: boolean;
}

export interface UseSharedBotResult {
  bot: (DCABot | ComboBot) | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

const pickQuery = (
  type: BotTypesEnum
):
  | typeof botQueries.getDCABot
  | typeof botQueries.getComboBot
  | typeof botQueries.getHedgeDCABot
  | typeof botQueries.getHedgeComboBot
  | typeof botQueries.getBot => {
  switch (type) {
    case BotTypesEnum.combo:
      return botQueries.getComboBot;
    case BotTypesEnum.hedgeDca:
      return botQueries.getHedgeDCABot;
    case BotTypesEnum.hedgeCombo:
      return botQueries.getHedgeComboBot;
    case BotTypesEnum.grid:
      // Grid bots use the generic getBot endpoint
      return botQueries.getBot;
    case BotTypesEnum.dca:
    default:
      return botQueries.getDCABot;
  }
};

const queryKeyFor = (type: BotTypesEnum): string => {
  switch (type) {
    case BotTypesEnum.combo:
      return 'getComboBot';
    case BotTypesEnum.hedgeDca:
      return 'getHedgeDCABot';
    case BotTypesEnum.hedgeCombo:
      return 'getHedgeComboBot';
    case BotTypesEnum.grid:
      return 'getBot';
    case BotTypesEnum.dca:
    default:
      return 'getDCABot';
  }
};

export function useSharedBot({
  botId,
  type,
  shareId,
  enabled: enabledOverride,
}: UseSharedBotOptions): UseSharedBotResult {
  const enabled = useMemo(
    () =>
      enabledOverride ??
      (!!shareId && !!botId && botId.trim().length > 0),
    [enabledOverride, shareId, botId]
  );

  const builder = pickQuery(type);
  const queryKey = queryKeyFor(type);

  const built = useMemo(
    () =>
      enabled
        ? builder({ id: botId, shareId: shareId as string })
        : { query: 'query noop { __typename }', variables: {} },
    [enabled, builder, botId, shareId]
  );

  const result = useGraphQL<DCABot | ComboBot>(queryKey, built, {
    enabled,
    shareId: shareId ?? null,
  });

  return useMemo(
    () => ({
      bot:
        result.data?.status === 'OK'
          ? ((result.data.data ?? null) as (DCABot | ComboBot) | null)
          : null,
      isLoading: result.isLoading,
      isError: result.isError,
      error: result.error,
    }),
    [result]
  );
}

export default useSharedBot;
