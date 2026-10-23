import { useMemo } from 'react';

import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { dealQueries } from '../lib/api/GraphQLQueries-deal-queries';
import type {
  BotTypesEnum,
  DealCostBreakdown,
  DealSlippage,
  TradingCosts,
} from '../types';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';

/**
 * Fees + slippage for the deal / bot / account views. Each figure comes from
 * its own small query rather than from the shared deal and bot fragments: a
 * backend that predates these fields rejects the whole document, and here
 * that only hides the cost figures. A rejection is not retried.
 */

const NOOP = { query: 'query noop { __typename }', variables: {} };

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export interface DealCosts {
  breakdown: DealCostBreakdown | null;
  slippage: DealSlippage | null;
  /** The deal's own profit, as stored (quote `total`, `totalUsd`). */
  profit: { total?: number | null; totalUsd?: number | null } | null;
}

interface DealCostsPayload {
  deals?: Array<{
    _id?: string;
    slippage?: DealSlippage | null;
    costBreakdown?: DealCostBreakdown | null;
    profit?: { total?: number | null; totalUsd?: number | null } | null;
  }> | null;
}

export function useDealCosts({
  botId,
  dealId,
  kind,
  version,
  enabled = true,
}: {
  botId: string | null | undefined;
  dealId: string | null | undefined;
  kind: 'dca' | 'combo';
  /** Changes whenever the deal's figures can have moved (fills, close). */
  version?: string | number;
  enabled?: boolean;
}): DealCosts | null {
  const { shareId } = useShareContext();
  // The by-id deal query has no share-link access.
  const active = enabled && !!botId && !!dealId && !shareId;
  const built = useMemo(
    () =>
      active
        ? dealQueries.getDealCosts(kind, {
            botId: botId as string,
            dealId: dealId as string,
          })
        : NOOP,
    [active, kind, botId, dealId]
  );
  const result = useGraphQL<DealCostsPayload>(
    `getDealCosts:${kind}:${version ?? ''}`,
    built,
    { enabled: active, retry: false }
  );
  return useMemo(() => {
    if (!active || result.data?.status !== 'OK') return null;
    const deal = result.data.data?.deals?.find((d) => d._id === dealId);
    if (!deal) return null;
    return {
      breakdown: deal.costBreakdown ?? null,
      slippage: deal.slippage ?? null,
      profit: deal.profit ?? null,
    };
  }, [active, result.data, dealId]);
}

interface BotCostsPayload {
  _id?: string;
  tradingCosts?: TradingCosts | null;
}

export function useBotTradingCosts({
  botId,
  type,
  enabled = true,
}: {
  botId: string | null | undefined;
  type: BotTypesEnum;
  enabled?: boolean;
}): TradingCosts | null {
  const { shareId } = useShareContext();
  const built = useMemo(
    () =>
      enabled && botId
        ? botQueries.getBotTradingCosts(type, {
            id: botId,
            ...(shareId ? { shareId } : {}),
          })
        : null,
    [enabled, type, botId, shareId]
  );
  // Null for a bot type without trading costs (grid): no request.
  const active = !!built;
  const result = useGraphQL<BotCostsPayload>(
    `getBotTradingCosts:${type}`,
    built ?? NOOP,
    { enabled: active, shareId: shareId ?? null, retry: false }
  );
  return useMemo(() => {
    if (!active || result.data?.status !== 'OK') return null;
    return result.data.data?.tradingCosts ?? null;
  }, [active, result.data]);
}

export function useAccountTradingCosts({
  from,
  to,
  botType,
  enabled = true,
}: {
  from?: number | undefined;
  to?: number | undefined;
  botType?: BotTypesEnum | undefined;
  enabled?: boolean;
}): TradingCosts[] | null {
  const built = useMemo(
    () =>
      botQueries.tradingCostsSummary({
        ...(isNum(from) ? { from } : {}),
        ...(isNum(to) ? { to } : {}),
        ...(botType ? { botType } : {}),
      }),
    [from, to, botType]
  );
  const result = useGraphQL<TradingCosts[]>(
    'tradingCostsSummary',
    enabled ? built : NOOP,
    { enabled, retry: false }
  );
  return useMemo(() => {
    if (!enabled || result.data?.status !== 'OK') return null;
    return result.data.data ?? null;
  }, [enabled, result.data]);
}
