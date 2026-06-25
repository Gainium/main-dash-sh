/**
 * Fetches the user's hedge deals (DCA or Combo) via the purpose-built
 * `hedgeDcaDealList` / `hedgeComboDealList` queries.
 *
 * Why a dedicated hook instead of `useDcaDeals` / `useComboDeals`: hedge legs
 * are excluded from the generic deal lists, and those hooks' shared-store
 * reconcile is authoritative — a "complete" all-bots fetch prunes any deal
 * absent from its response. So feeding a hedge view from them made hedge-leg
 * deals flash in (from a drawer/socket write) then vanish the moment the list
 * fetch reconciled them away. This hook keeps results in react-query's own
 * cache and never writes the shared deal store, so nothing can clobber it
 * (mirrors the old main-dash `dealDataGridTable` hedge path, which holds deals
 * in local state).
 *
 * Pass no `botId` to get every hedge deal across the user's hedge bots; pass a
 * hedge wrapper id to scope to a single bot (both legs). Status is expressed as
 * a dataGrid filter the same way the standalone deal hooks do it.
 */
import { useMemo } from 'react';

import { dealQueries } from '../lib/api/GraphQLQueries-deal-queries';
import {
  comboDealFragment,
  dcaDealFragment,
} from '../lib/api/GraphQLQueries-fragments';
import { statusFilterItem } from '../lib/utils/dealStatusFilter';
import type { ComboDeal } from './useComboDeals';
import type { DCADeals, DCADealStatusEnum } from '../types';
import { type DcaDealsResponse } from './useDcaDeals';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';

// The list builders append `botName` themselves for the generic queries but the
// hedge builders don't, and neither fragment includes it — so request it
// explicitly, otherwise the Deals table's Name column is blank.
const HEDGE_DCA_DEAL_FIELDS = `${dcaDealFragment}
  botName`;
const HEDGE_COMBO_DEAL_FIELDS = `${comboDealFragment}
  botName`;

export interface UseHedgeDealsFilter {
  status?: DCADealStatusEnum;
  /** Hedge wrapper id to scope to one bot; omit for all the user's hedge bots. */
  botId?: string;
  paperContext?: boolean;
  enabled?: boolean;
}

interface HedgeDealsResultBase {
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

function useHedgeDealsInternal(
  isCombo: boolean,
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: DcaDealsResponse['result'] } {
  const { isDemo } = useShareContext();

  const input = useMemo(() => {
    const statusItem = statusFilterItem(filter?.status);
    return {
      ...(filter?.botId ? { botId: filter.botId } : {}),
      dataGridInput: {
        page: 0,
        pageSize: 500,
        sortModel: [{ field: 'createTime', sort: 'desc' as const }],
        filterModel: { items: statusItem ? [statusItem] : [] },
      },
    };
  }, [filter?.status, filter?.botId]);

  const queryResult = useGraphQL<DcaDealsResponse>(
    isCombo ? 'hedgeComboDealList' : 'hedgeDcaDealList',
    isCombo
      ? dealQueries.hedgeComboDealList(input, HEDGE_COMBO_DEAL_FIELDS)
      : dealQueries.hedgeDcaDealList(input, HEDGE_DCA_DEAL_FIELDS),
    {
      enabled: isDemo ? false : filter?.enabled !== false,
      ...(typeof filter?.paperContext === 'boolean'
        ? { paperContext: filter.paperContext }
        : {}),
    }
  );

  const deals = useMemo(() => {
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

export function useHedgeDcaDeals(
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: DCADeals[] } {
  const r = useHedgeDealsInternal(false, filter);
  return { ...r, deals: r.deals as DCADeals[] };
}

export function useHedgeComboDeals(
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: ComboDeal[] } {
  const r = useHedgeDealsInternal(true, filter);
  return { ...r, deals: r.deals as unknown as ComboDeal[] };
}

/**
 * Type-agnostic variant for callers that decide DCA vs Combo at runtime (the
 * shared bot drawer). Returns the raw deal records; the caller maps them with
 * the matching `*DealToOpenTrade` mapper.
 */
export function useHedgeDeals(
  isCombo: boolean,
  filter?: UseHedgeDealsFilter
): HedgeDealsResultBase & { deals: Array<DCADeals | ComboDeal> } {
  const r = useHedgeDealsInternal(isCombo, filter);
  return { ...r, deals: r.deals as Array<DCADeals | ComboDeal> };
}
