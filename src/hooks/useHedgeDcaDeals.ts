/**
 * Fetches the user's hedge-DCA deals via the purpose-built `hedgeDcaDealList`
 * query.
 *
 * Why a dedicated hook instead of `useDcaDeals`: hedge legs are excluded from
 * the generic `dcaDealList`, and `useDcaDeals`' shared-store reconcile is
 * authoritative — a "complete" all-bots fetch prunes any deal absent from its
 * response. So feeding the hedge tab from `useDcaDeals` made hedge-leg deals
 * flash in (from a drawer/socket write) then vanish the moment the list fetch
 * reconciled them away. This hook keeps results in react-query's own cache and
 * never writes the shared deal store, so nothing can clobber it (mirrors the
 * old main-dash `dealDataGridTable` hedge path, which holds deals in local
 * state).
 *
 * Pass no `botId` to get every hedge-DCA deal across the user's hedge bots
 * (both long and short legs); status is expressed as a dataGrid filter the
 * same way `useDcaDeals` does it.
 */
import { useMemo } from 'react';

import { dealQueries } from '../lib/api/GraphQLQueries-deal-queries';
import { dcaDealFragment } from '../lib/api/GraphQLQueries-fragments';
import { statusFilterItem } from '../lib/utils/dealStatusFilter';
import type { DCADeals, DCADealStatusEnum } from '../types';
import { type DcaDealsResponse } from './useDcaDeals';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';

// `dcaDealList` appends `botName` after the shared fragment but the
// `hedgeDcaDealList` builder does not, and the fragment itself omits it — so we
// request it explicitly here, otherwise the Deals table's Name column is blank.
const HEDGE_DCA_DEAL_FIELDS = `${dcaDealFragment}
  botName`;

export interface UseHedgeDcaDealsFilter {
  status?: DCADealStatusEnum;
  paperContext?: boolean;
  enabled?: boolean;
}

export interface UseHedgeDcaDealsResult {
  deals: DCADeals[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useHedgeDcaDeals(
  filter?: UseHedgeDcaDealsFilter
): UseHedgeDcaDealsResult {
  const { isDemo } = useShareContext();

  const input = useMemo(() => {
    const statusItem = statusFilterItem(filter?.status);
    return {
      dataGridInput: {
        page: 0,
        pageSize: 500,
        sortModel: [{ field: 'createTime', sort: 'desc' as const }],
        filterModel: { items: statusItem ? [statusItem] : [] },
      },
    };
  }, [filter?.status]);

  const queryResult = useGraphQL<DcaDealsResponse>(
    'hedgeDcaDealList',
    dealQueries.hedgeDcaDealList(input, HEDGE_DCA_DEAL_FIELDS),
    {
      enabled: isDemo ? false : filter?.enabled !== false,
      ...(typeof filter?.paperContext === 'boolean'
        ? { paperContext: filter.paperContext }
        : {}),
    }
  );

  const deals = useMemo<DCADeals[]>(() => {
    const result = queryResult.data?.data?.result;
    return Array.isArray(result) ? result : [];
  }, [queryResult.data]);

  return {
    deals,
    total: queryResult.data?.data?.totalResults ?? deals.length,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}
