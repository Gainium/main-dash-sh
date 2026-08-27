import { useMemo } from 'react';

import { botQueries } from '../../../lib/api/GraphQLQueries-bot-queries';
import { useGraphQL } from '../../useGraphQL';

/**
 * Deal-derived half of the DCA Analysis widget, computed server-side.
 *
 * The widget used to fold this out of the deals themselves, via two
 * `useBotSpecificDeals` subscriptions (open + closed). That path fetched 100
 * full deal documents per page — the `dcaDealFragment` is ~600 selected
 * fields — and its display loader stopped at 5 pages, so any bot past 500
 * deals was silently analysed on a subset, and re-fetched all of it every 30s.
 * All of that existed to read one integer per deal.
 *
 * main-app now returns the histogram directly. `dcas` is the number of DCA
 * (safety) orders a deal actually filled, `deals` how many of the bot's deals
 * filled exactly that many. Buckets are RAW — clamping them to the bot's
 * current configured DCA count is the caller's job, because that count comes
 * from the example-orders projection engine and not from the deals.
 */
export interface DcaUsageBucket {
  dcas: number;
  deals: number;
  /**
   * DCA orders the ladder THIS deal ran under (`levels.all - 1`). Only used
   * when the projection engine has no count for the bot's current settings —
   * the caller prefers that count, exactly as the old per-deal fold did.
   */
  configured: number;
}

export interface DcaUsageData {
  /** Closed + canceled deals. */
  finished: DcaUsageBucket[];
  /** Open / start / error deals. */
  active: DcaUsageBucket[];
  /**
   * Highest `levels.all - 1` across the bot's deals. Only a fallback for the
   * configured-DCA count when the projection engine hasn't produced one.
   */
  maxConfiguredDcas: number;
}

export interface UseBotDcaUsageResult {
  usage: DcaUsageData | undefined;
  isLoading: boolean;
  isError: boolean;
}

const EMPTY: DcaUsageBucket[] = [];

export function useBotDcaUsage({
  botId,
  isComboBot,
  shareId,
  enabled = true,
}: {
  botId: string | null | undefined;
  isComboBot: boolean;
  shareId?: string | null | undefined;
  enabled?: boolean;
}): UseBotDcaUsageResult {
  const needFetch = enabled && !!botId;
  const queryKey = isComboBot ? 'getComboBotDcaUsage' : 'getBotDcaUsage';
  const builder = isComboBot
    ? botQueries.getComboBotDcaUsage
    : botQueries.getBotDcaUsage;

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

  const result = useGraphQL<DcaUsageData>(queryKey, built, {
    enabled: needFetch,
    shareId: shareId ?? null,
  });

  return useMemo(() => {
    const payload =
      result.data?.status === 'OK'
        ? ((result.data.data ?? undefined) as DcaUsageData | undefined)
        : undefined;

    return {
      usage: payload
        ? {
            finished: payload.finished ?? EMPTY,
            active: payload.active ?? EMPTY,
            maxConfiguredDcas: payload.maxConfiguredDcas ?? 0,
          }
        : undefined,
      isLoading: needFetch && result.isLoading,
      isError: needFetch && result.isError,
    };
  }, [result, needFetch]);
}
