import { useMemo } from 'react';

import type { SmartOrderMergeDeal } from '@/features/bots/bot-types/dca/form/dialogs/SmartOrderMergeDialog';
import { useDcaDeals } from '@/hooks/useDcaDeals';
import { isActiveDealStatus } from '@/lib/utils/dealUnrealizedPnl';
import { calculateDealOpenPnl } from '@/lib/utils/tradingMetrics';
import { DCADealStatusEnum } from '@/types';

interface UseBotSmartOrdersOptions {
  botId: string | null | undefined;
  botName?: string | null;
}

interface UseBotSmartOrdersResult {
  deals: SmartOrderMergeDeal[];
  eligibleDeals: SmartOrderMergeDeal[];
  eligibleCount: number;
  totalCount: number;
  hasEligibleSelection: boolean;
  extraMessage?: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  hasValidResponse: boolean;
}

const MERGEABLE_STATUSES = new Set<string>([
  DCADealStatusEnum.open,
  DCADealStatusEnum.start,
]);

export function useBotSmartOrders({
  botId,
  botName,
}: UseBotSmartOrdersOptions): UseBotSmartOrdersResult {
  // Only enable fetching DCA deals when a botId is present. This prevents a global
  // fetch on pages that create a new bot (where botId is undefined), avoiding
  // excessive calls to the unrealized PnL calculator and related logs.
  const { deals, isLoading, isError, error, refetch, hasValidResponse } =
    useDcaDeals(botId ? { botId } : undefined, { enabled: !!botId });

  const botDeals = useMemo(() => {
    if (!botId || !Array.isArray(deals)) {
      return [] as SmartOrderMergeDeal[];
    }

    return deals
      .filter((deal) => deal.botId === botId)
      .map<SmartOrderMergeDeal>((deal) => {
        const next: SmartOrderMergeDeal = {
          id: deal._id,
          pair: deal.symbol?.symbol ?? 'Unknown pair',
          strategy: deal.strategy,
          status: deal.status,
          createdAt: new Date(deal.createTime).toLocaleString(),
          avgPrice: deal.avgPrice,
          label:
            deal.botName ?? deal.symbol?.symbol ?? botName ?? 'Smart order',
        };

        if (deal.symbol?.baseAsset) {
          next.baseAsset = deal.symbol.baseAsset;
        }

        if (deal.symbol?.quoteAsset) {
          next.quoteAsset = deal.symbol.quoteAsset;
        }

        if (typeof deal.stats.unrealizedProfit === 'number') {
          // Open position only: what the deal already banked is realized.
          next.profitUsd = calculateDealOpenPnl({
            active: isActiveDealStatus(deal.status),
            unrealizedProfit: deal.stats.unrealizedProfit,
            realizedProfit: deal.profit?.totalUsd,
          });
        } else if (typeof deal.profit?.totalUsd === 'number') {
          next.profitUsd = deal.profit.totalUsd;
        }

        /* if (typeof deal.unrealizedPct === 'number') {
          next.profitPct = deal.unrealizedPct;
        } */

        if (
          deal.currentBalances &&
          typeof deal.currentBalances.base === 'number'
        ) {
          next.currentBase = deal.currentBalances.base;
        }

        if (
          deal.currentBalances &&
          typeof deal.currentBalances.quote === 'number'
        ) {
          next.currentQuote = deal.currentBalances.quote;
        }

        if (
          deal.initialBalances &&
          typeof deal.initialBalances.base === 'number'
        ) {
          next.initialBase = deal.initialBalances.base;
        }

        if (
          deal.initialBalances &&
          typeof deal.initialBalances.quote === 'number'
        ) {
          next.initialQuote = deal.initialBalances.quote;
        }

        if (deal.levels && typeof deal.levels.complete === 'number') {
          next.levelsComplete = deal.levels.complete;
        }

        if (deal.levels && typeof deal.levels.all === 'number') {
          next.levelsAll = deal.levels.all;
        }

        return next;
      });
  }, [botId, botName, deals]);

  const eligibleDeals = useMemo(() => {
    return botDeals.filter((deal) =>
      deal.status ? MERGEABLE_STATUSES.has(deal.status.toLowerCase()) : false
    );
  }, [botDeals]);

  const totalCount = botDeals.length;
  const eligibleCount = eligibleDeals.length;
  const hasEligibleSelection = eligibleCount >= 2;

  const extraMessage = useMemo(() => {
    if (!botId) {
      return 'Save the bot before merging smart orders.';
    }

    if (isLoading) {
      return undefined;
    }

    if (!totalCount) {
      return 'This bot has no smart orders yet.';
    }

    if (eligibleCount === 0) {
      return 'Only open smart orders can be merged. Close other orders or wait for them to open.';
    }

    if (eligibleCount === 1) {
      return 'Select at least two open smart orders to enable merging.';
    }

    return undefined;
  }, [botId, eligibleCount, isLoading, totalCount]);

  const result: UseBotSmartOrdersResult = {
    deals: botDeals,
    eligibleDeals,
    eligibleCount,
    totalCount,
    hasEligibleSelection,
    isLoading,
    isError,
    error,
    refetch,
    hasValidResponse,
  };

  if (extraMessage) {
    result.extraMessage = extraMessage;
  }

  return result;
}
