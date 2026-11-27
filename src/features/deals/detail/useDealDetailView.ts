// The deal details view both drawers show: the standalone deal drawer and the
// bot drawer's deal view. One place builds what it displays (from the live
// deal), its action bar with inline forms, and the chart price picker; each
// drawer only wires its own chart to it (see DealDetailActions.tsx).
import type { DealDetailTrade } from '@/components/trades/TradeDetailContent';
import { useChartPricePickerHost } from '@/features/bots/shared/runtime/dialogs/chartPricePicker';
import type { DealActionSurfaceId } from '@/features/deals/actions/dealActionRegistry';
import { dealKindOfTrade, type DealRef } from '@/features/deals/actions/dealRef';
import { useDealActionHost } from '@/features/deals/actions/useDealActionHost';
import { useLatestPrices } from '@/hooks/useLatestPrices';
import { useDealFees } from '@/hooks/useLiveDealPnl';
import { isLongStrategy } from '@/lib/utils/tradingMetrics';
import { BotTypesEnum, type ComboDeals, type DCADeals } from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import { percentBasisFromDeal, transformDealToTrade } from '@/types/dcaDeal';
import { extractPairAssets } from '@/utils/pairs';
import { useEffect, useMemo, type ReactNode } from 'react';

/** The engine a deal's row type runs on. */
export const botTypeOfDealType = (
  type: DealDetailTrade['type']
): BotTypesEnum => {
  switch (type) {
    case 'Combo':
      return BotTypesEnum.combo;
    case 'Hedge Combo':
      return BotTypesEnum.hedgeCombo;
    case 'Hedge DCA':
      return BotTypesEnum.hedgeDca;
    case 'Grid':
      return BotTypesEnum.grid;
    default:
      return BotTypesEnum.dca;
  }
};

/** A live deal record, as the deal store holds it. */
type LiveDeal = DCADeals | ComboDeals;

export interface DealDetailView {
  /** What the details show: the live deal when the store holds it. */
  displayTrade: DealDetailTrade;
  dealRef: DealRef;
  surface: DealActionSurfaceId;
  runner: ReturnType<typeof useDealActionHost>['runner'];
  panels: ReactNode;
  openActionId: ReturnType<typeof useDealActionHost>['pendingId'];
  picker: ReturnType<typeof useChartPricePickerHost>;
}

export function useDealDetailView({
  trade,
  rawDeal,
  onEdit,
}: {
  /** The row the caller built: identity, labels, and the fallback figures. */
  trade: DealDetailTrade;
  /** The deal from the live store, or null when the store does not hold it. */
  rawDeal: LiveDeal | null | undefined;
  /** The caller's deal editor; without one, Edit is not offered. */
  onEdit?: (() => void) | undefined;
}): DealDetailView {
  // `trade` is a snapshot taken when the caller's list or card rendered, and
  // the only source for deals the live store does not hold (grid, closed).
  // For any deal it does hold, every figure comes from the live deal through
  // the transformer the deal lists use; `trade` keeps identity and labels.
  const prices = useLatestPrices();
  const feeInputs = useMemo(
    () => (rawDeal ? [rawDeal as DCADeals] : []),
    [rawDeal]
  );
  const fees = useDealFees(feeInputs);
  const displayTrade = useMemo<DealDetailTrade>(() => {
    if (!rawDeal) return trade;
    const bot = {
      type: botTypeOfDealType(trade.type),
      name: trade.botName ?? '',
    } as unknown as DrawerBot;
    // Live P&L needs a price and a fee for the pair; until both are there,
    // the server's stored value beats a confident zero (as the deal lists do).
    const priced =
      prices.length > 0 && fees.length > 0
        ? transformDealToTrade(rawDeal, fees, prices, bot)
        : undefined;
    const live =
      priced && priced.unrealizedProfit !== undefined
        ? priced
        : transformDealToTrade(rawDeal, [], [], bot);
    return {
      ...trade,
      status: live.status,
      strategy: live.strategy || trade.strategy,
      exchangeUUID: live.exchangeUUID || trade.exchangeUUID,
      currentBalance: live.currentBalance,
      usage: live.usage,
      profit: live.profit,
      ...(live.profitAsset ? { profitAsset: live.profitAsset } : {}),
      funding: live.funding,
      unrealizedProfit: live.unrealizedProfit,
      unrealizedPending: live.unrealizedPending,
      avgPrice: live.avgPrice,
      levels: live.levels,
      created: live.created,
      compoundBreakdown: live.compoundBreakdown,
    };
  }, [rawDeal, trade, prices, fees]);

  const dealRef = useMemo<DealRef>(() => {
    const symbol =
      typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;
    const assets =
      typeof trade.symbol === 'string'
        ? extractPairAssets(trade.symbol)
        : trade.symbol;
    const settings = (
      rawDeal as
        | { settings?: { futures?: boolean; useRiskReward?: boolean } }
        | null
        | undefined
    )?.settings;
    const basis = rawDeal
      ? percentBasisFromDeal(
          rawDeal as Parameters<typeof percentBasisFromDeal>[0]
        )
      : null;
    return {
      id: trade.id,
      dealId: trade.id,
      botId: trade.botId || undefined,
      kind: dealKindOfTrade({ type: trade.type, terminal: false, hedge: false }),
      status: String(rawDeal?.status ?? trade.status).toLowerCase(),
      symbol,
      baseAsset: assets.baseAsset || undefined,
      quoteAsset: assets.quoteAsset || undefined,
      exchange: trade.exchange || undefined,
      exchangeUUID: trade.exchangeUUID || rawDeal?.exchangeUUID || undefined,
      strategy: trade.strategy || undefined,
      long: isLongStrategy(trade.strategy),
      futures: !!settings?.futures,
      riskBased: !!settings?.useRiskReward,
      levels: displayTrade.levels,
      percentBasis: basis ?? undefined,
      trade: undefined,
    };
  }, [trade, rawDeal, displayTrade.levels]);

  const {
    runner,
    dialogs: panels,
    pendingId: openActionId,
    closePending,
  } = useDealActionHost({
    presentation: 'inline',
    ...(onEdit ? { onEdit: () => onEdit() } : {}),
  });
  const picker = useChartPricePickerHost();

  // A view reused for another deal (the bot drawer's) must not keep the
  // previous deal's form open.
  useEffect(() => {
    closePending();
  }, [trade.id, closePending]);

  return {
    displayTrade,
    dealRef,
    surface: onEdit ? 'dealDrawerWithEdit' : 'dealDrawer',
    runner,
    panels,
    openActionId,
    picker,
  };
}
