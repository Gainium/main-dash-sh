import { useDealHeldOrders } from '@/hooks/bots/dca/useDealHeldOrders';
import { useDealOrders } from '@/hooks/useDealOrders';
import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import { useUserFees } from '@/hooks/useUserFeesService';
import { buildDealExitLines } from '@/utils/bots/dca/deal-exit-lines';
import {
  dealCompletedOrdersToTransactions,
  dealPendingOrdersToChartLines,
  dealHeldOrdersToChartLines,
} from '@/utils/bots/dca/deal-chart-orders';
import { splitDealOrders } from '@/utils/orders/viewOrder';
import {
  useComboBotsStore,
  useDcaBotsStore,
  useDealStore,
  useGridBotsStore,
} from '@/stores/live';
import {
  BotTypesEnum,
  type AvgPrice,
  type ComboDeals,
  type DCADeals,
  type BotVars,
  type DCABotSettings,
  type DCAGrid,
} from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import type { CompoundBreakdownEntry } from '@/lib/utils/compoundBreakdown';
import { extractPairAssets } from '@/utils/pairs';
import React, { useEffect, useMemo, useRef } from 'react';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { useDealFees } from '@/hooks/useLiveDealPnl';
import { useLatestPrices } from '@/hooks/useLatestPrices';
import { TVChartPicker } from '../widgets/shared/TradingViewChart/TVChartPicker';
import type { TradingViewChartRef } from '../widgets/shared/TradingViewChart/TradingViewChart';
import {
  ChartPricePickerContext,
  useChartPricePickerHost,
} from '@/features/bots/shared/runtime/dialogs/chartPricePicker';
import { DealActionBar } from '@/features/deals/actions/DealActionBar';
import { DealActionsContext } from '@/features/deals/actions/dealActionsContext';
import { dealKindOfTrade, type DealRef } from '@/features/deals/actions/dealRef';
import { useDealActionHost } from '@/features/deals/actions/useDealActionHost';
import { percentBasisFromDeal, transformDealToTrade } from '@/types/dcaDeal';
import { isLongStrategy } from '@/lib/utils/tradingMetrics';
import { formatTradingPair } from '../../lib/utils';
import UnfoldingChartPanel from '../bots/panels/contents/chart/UnfoldingChartPanel';
import { buildDealLiquidationContext } from '@/utils/bots/dca/liquidation';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerDescription,
  DetailDrawerHeader,
  DetailDrawerTitle,
  DetailDrawerTrigger,
} from '../ui/detail-drawer';
import CoinPair from '../widgets/shared/CoinPair';
import { TradeDetailContent } from './TradeDetailContent';

const mapTradeTypeToBotType = (
  tradeType: TradeDetailDrawerProps['trade']['type']
): BotTypesEnum => {
  switch (tradeType) {
    case 'Combo':
    case 'Hedge Combo':
      return BotTypesEnum.combo;
    case 'Grid':
      return BotTypesEnum.grid;
    case 'DCA':
    case 'Hedge DCA':
    case 'Terminal':
    default:
      return BotTypesEnum.dca;
  }
};

interface TradeDetailDrawerProps {
  trade: {
    id: string;
    type: 'DCA' | 'Combo' | 'Hedge DCA' | 'Hedge Combo' | 'Grid' | 'Terminal';
    symbol:
      | string
      | {
          symbol: string;
          baseAsset: string;
          quoteAsset: string;
        };
    strategy: string;
    status: string;
    exchange: string;
    exchangeUUID?: string | undefined;
    botName?: string | undefined;
    currentBalance: {
      base: number;
      quote: number;
    };
    usage: {
      current: {
        base: number;
        quote: number;
      };
      currentUsd?: number;
      max?: {
        base: number;
        quote: number;
      };
      maxUsd?: number;
    };
    profit?:
      | {
          total: number;
          totalUsd: number;
          pureBase: number;
          pureQuote: number;
        }
      | undefined;
    funding?:
      | {
          total: number;
          totalUsd: number;
          lastTime?: number;
        }
      | undefined;
    unrealizedProfit?: number | undefined;
    unrealizedPending?: boolean | undefined;
    avgPrice?: number | undefined;
    levels: {
      complete: number;
      all: number;
    };
    created?: number | undefined;
    compoundBreakdown?: CompoundBreakdownEntry[] | undefined;
    // Bot-related properties for chart
    botId?: string | undefined;
    pair?: string;
  };
  children: React.ReactNode;
  open?: boolean;
  onClose?: () => void;
  privacyMode?: boolean;
}

export const TradeDetailDrawer: React.FC<TradeDetailDrawerProps> = ({
  trade,
  children,
  open,
  onClose,
  privacyMode = false,
}) => {
  // Extract symbol string
  const symbolString =
    typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;

  const { baseAsset, quoteAsset } = extractPairAssets(symbolString);

  // Hosts that mount this drawer outside the bot drawer (e.g. the Trading
  // Bots /deals tab) don't have orders preloaded, so fetch them here by
  // (botId, dealId). useDealOrders no-ops cleanly when botId is missing.
  const tradeBotType = useMemo(
    () => mapTradeTypeToBotType(trade.type),
    [trade.type]
  );
  const { orders: dealOrders, isLoading: isLoadingOrders } = useDealOrders(
    trade.botId ?? '',
    trade.id,
    tradeBotType
  );

  // Pull the parent bot from the live bot stores so the chart panel can
  // extract the snapshot chart that came down with the bot list. Without
  // this, UnfoldingChartPanel only has `botId` and falls back to
  // useLiveBotMetrics, which only reads (never writes) the local stats
  // store outside the bot drawer context — so the chart would say
  // "No chart data is available for the selected timeframe".
  const dcaBot = useDcaBotsStore((s) =>
    trade.botId && tradeBotType === BotTypesEnum.dca
      ? s.bots[trade.botId]
      : undefined
  );
  const comboBot = useComboBotsStore((s) =>
    trade.botId && tradeBotType === BotTypesEnum.combo
      ? s.bots[trade.botId]
      : undefined
  );
  const gridBot = useGridBotsStore((s) =>
    trade.botId && tradeBotType === BotTypesEnum.grid
      ? s.bots[trade.botId]
      : undefined
  );
  const chartBot = useMemo(
    () => (dcaBot ?? comboBot ?? gridBot ?? null) as DrawerBot | null,
    [dcaBot, comboBot, gridBot]
  );

  const { getCachedFee } = useUserFees();
  // Raw deal (not the lossy `trade`) — carries initialPrice, gridBreakpoints,
  // per-deal settings overrides, dynamicAr — needed to project smart orders.
  // Terminal deals are stored under the 'terminal' bucket, not their botId
  // (see useDcaDeals), so look there too — otherwise a terminal deal never
  // gets its stop-loss / trailing exit lines.
  const rawDeal = useDealStore((s) =>
    trade.botId
      ? (s.deals[trade.botId]?.[trade.id] ??
        (trade.type === 'Terminal'
          ? s.deals['terminal']?.[trade.id]
          : undefined) ??
        null)
      : null
  );

  // What the drawer shows. `trade` is the row its caller built when the list
  // or card rendered: a partial snapshot, and the only source for deals the
  // live store does not hold (grid, closed). For any deal it does hold, every
  // figure comes from the live deal through the same transformer the deal
  // lists use, so the cards, the chart and the actions read one source.
  // `trade` keeps the identity and the labels (type, name, symbol).
  const prices = useLatestPrices();
  const feeInputs = useMemo(
    () => (rawDeal ? [rawDeal as DCADeals] : []),
    [rawDeal]
  );
  const fees = useDealFees(feeInputs);
  const displayTrade = useMemo<TradeDetailDrawerProps['trade']>(() => {
    if (!rawDeal) return trade;
    const deal = rawDeal as DCADeals | ComboDeals;
    const bot = {
      type:
        trade.type === 'Hedge DCA'
          ? BotTypesEnum.hedgeDca
          : trade.type === 'Hedge Combo'
            ? BotTypesEnum.hedgeCombo
            : tradeBotType,
      name: trade.botName ?? '',
    } as unknown as DrawerBot;
    // Live P&L needs a price and a fee for the pair; until both are there,
    // the server's stored value beats a confident zero (as the deal lists do).
    const priced =
      prices.length > 0 && fees.length > 0
        ? transformDealToTrade(deal, fees, prices, bot)
        : undefined;
    const live =
      priced && priced.unrealizedProfit !== undefined
        ? priced
        : transformDealToTrade(deal, [], [], bot);
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
  }, [rawDeal, trade, tradeBotType, prices, fees]);

  const { pendingOrders, completedOrders } = useMemo(
    () => splitDealOrders(dealOrders, trade.exchange, rawDeal),
    [dealOrders, trade.exchange, rawDeal]
  );

  const isCombo =
    tradeBotType === BotTypesEnum.combo ||
    trade.type === 'Combo' ||
    trade.type === 'Hedge Combo';

  const { smartOrders, smartChartOrders, strategy } = useDealSmartOrders({
    bot: chartBot
      ? {
          settings: (chartBot as { settings?: DCABotSettings }).settings,
          exchangeUUID: trade.exchangeUUID ?? rawDeal?.exchangeUUID,
          vars: (chartBot as { vars?: BotVars | null }).vars,
        }
      : null,
    deal: rawDeal,
    pendingOrders,
    completedOrders,
    isCombo,
    enabled: tradeBotType !== BotTypesEnum.grid,
  });

  // The engine keeps trailing TP/SL and move SL entirely in the worker — none
  // of them rest as exchange orders — so they have to be recomputed to appear.
  const takerFee =
    getCachedFee(
      trade.exchangeUUID ?? rawDeal?.exchangeUUID ?? '',
      rawDeal?.symbol?.symbol ?? ''
    )?.taker ?? 0;
  const dealExitLines = useMemo(
    () =>
      buildDealExitLines(
        rawDeal,
        (chartBot as { settings?: DCABotSettings } | null)?.settings,
        takerFee,
        pendingOrders.map((o) => +o.price),
        { isCombo }
      ),
    [rawDeal, chartBot, takerFee, pendingOrders, isCombo]
  );

  // Position + leverage behind the estimated liquidation line on the chart.
  // Null for spot deals, leverage <= 1, and deals with no position yet.
  const liquidationContext = useMemo(
    () =>
      buildDealLiquidationContext(
        (chartBot as { settings?: DCABotSettings } | null)?.settings,
        rawDeal
      ),
    [chartBot, rawDeal]
  );

  // Feed the price chart: real pending orders + projected grey smart levels +
  // the engine-managed exits. Grey lines render automatically (BotChart maps
  // grey:true → color).
  const heldOrders = useDealHeldOrders({
    botId: trade.botId ?? '',
    dealId: trade.id,
    isCombo,
    liveHeld: rawDeal?.heldOrders,
    enabled: rawDeal?.status === 'open',
  });

  const chartOrders = useMemo<DCAGrid[]>(
    () => [
      ...dealPendingOrdersToChartLines(pendingOrders, strategy),
      ...dealHeldOrdersToChartLines(
        rawDeal?.status === 'open' ? heldOrders : null,
        pendingOrders,
        strategy,
        rawDeal?.symbol?.symbol ?? ''
      ),
      ...smartChartOrders,
      ...dealExitLines,
    ],
    [
      pendingOrders,
      smartChartOrders,
      strategy,
      dealExitLines,
      heldOrders,
      rawDeal?.status,
      rawDeal?.symbol?.symbol,
    ]
  );

  const chartTransactions = useMemo(
    () => dealCompletedOrdersToTransactions(completedOrders),
    [completedOrders]
  );

  // The deal's breakeven line, as the bot drawer draws it. The order section
  // publishes the deal's orders and fills to the chart, but not this.
  const avgPrice = Number(rawDeal?.avgPrice ?? trade.avgPrice ?? 0);
  const chartAvgPrices = useMemo<AvgPrice[]>(
    () =>
      tradeBotType !== BotTypesEnum.grid && avgPrice > 0
        ? [{ price: avgPrice, label: 'Breakeven', symbol: symbolString }]
        : [],
    [tradeBotType, avgPrice, symbolString]
  );
  useEffect(() => {
    exampleOrdersStore.setAvgPrices(chartAvgPrices);
    return () => exampleOrdersStore.setAvgPrices([]);
  }, [chartAvgPrices]);

  // Deal actions run here, beside the chart: their forms open inline in the
  // details column, and a limit price can be picked on the chart.
  const rawSettings = (
    rawDeal as { settings?: { futures?: boolean; useRiskReward?: boolean } } | null
  )?.settings;
  const dealRef = useMemo<DealRef>(() => {
    const basis = rawDeal
      ? percentBasisFromDeal(rawDeal as Parameters<typeof percentBasisFromDeal>[0])
      : null;
    return {
      id: trade.id,
      dealId: trade.id,
      botId: trade.botId || undefined,
      kind: dealKindOfTrade({ type: trade.type, terminal: false, hedge: false }),
      status: String(rawDeal?.status ?? trade.status).toLowerCase(),
      symbol: symbolString,
      baseAsset: baseAsset || undefined,
      quoteAsset: quoteAsset || undefined,
      exchange: trade.exchange || undefined,
      exchangeUUID: trade.exchangeUUID ?? rawDeal?.exchangeUUID ?? undefined,
      strategy: trade.strategy || undefined,
      long: isLongStrategy(trade.strategy),
      futures: !!rawSettings?.futures,
      riskBased: !!rawSettings?.useRiskReward,
      levels: trade.levels,
      percentBasis: basis ?? undefined,
      trade: undefined,
    };
  }, [trade, rawDeal, rawSettings, symbolString, baseAsset, quoteAsset]);
  const {
    runner: dealActions,
    dialogs: dealActionPanels,
    pendingId: openActionId,
  } = useDealActionHost({ presentation: 'inline' });
  const pricePicker = useChartPricePickerHost();
  const chartWidgetRef = useRef<TradingViewChartRef | null>(null);

  return (
    <DetailDrawer
      {...(open !== undefined && { open })}
      {...(onClose && {
        onOpenChange: (isOpen: boolean) => !isOpen && onClose(),
      })}
    >
      <DetailDrawerTrigger asChild>{children}</DetailDrawerTrigger>

      <DetailDrawerContent
        width="2xl"
        leftPanel={
          <div className="h-full bg-background border-r border-border">
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-hidden">
                {trade.botId ? (
                  <div className="relative h-full w-full">
                  <UnfoldingChartPanel
                    botId={trade.botId}
                    bot={chartBot}
                    // Narrow the chart to this deal's pair instead of the
                    // bot's full symbol set. Without this, multi-pair bots
                    // fall through to bot.symbol — an array of
                    // {key,value} objects — which gets stringified into
                    // "[object Object],[object Object],…" in the chart.
                    overrideSymbol={symbolString}
                    // Lets the price chart resolve a symbol even when the
                    // parent bot isn't in the live store (terminal deals).
                    overrideExchange={trade.exchange}
                    liquidationContext={liquidationContext}
                    enabled={true}
                    className="h-full"
                    chartRef={chartWidgetRef}
                    extraOrderLines={pricePicker.lines}
                  />
                  <TVChartPicker
                    chartRef={chartWidgetRef}
                    isActive={pricePicker.isActive}
                    onPick={pricePicker.onPick}
                  />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Chart data not available
                  </div>
                )}
              </div>
            </div>
          </div>
        }
        resizable={true}
        initialLeftPanelWidth={640}
        minLeftPanelWidth={400}
        maxLeftPanelWidth={1000}
        minRightPanelWidth={400}
      >
        <DetailDrawerHeader>
          <div className="flex items-center gap-sm">
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              pair={formatTradingPair(symbolString)}
              iconSize="lg"
            />
            <div>
              <DetailDrawerTitle>{symbolString}</DetailDrawerTitle>
              <DetailDrawerDescription>
                Trade Details - {trade.type} Strategy
              </DetailDrawerDescription>
            </div>
          </div>
        </DetailDrawerHeader>

        <DetailDrawerBody>
          <DealActionsContext.Provider value={dealActions}>
            <ChartPricePickerContext.Provider value={pricePicker.value}>
              <DealActionBar
                deal={dealRef}
                activeId={openActionId}
                className="mb-sm"
              />
              {/* Empty until an action is picked. */}
              <div className={openActionId ? 'mb-md' : undefined}>
                {dealActionPanels}
              </div>
            </ChartPricePickerContext.Provider>
          </DealActionsContext.Provider>
          <TradeDetailContent
            trade={displayTrade}
            privacyMode={privacyMode}
            showChips={true}
            pendingOrders={pendingOrders}
            completedOrders={completedOrders}
            isLoadingOrders={isLoadingOrders}
            chartOrders={chartOrders}
            chartTransactions={chartTransactions}
            smartOrders={smartOrders}
            strategy={strategy}
            {...(rawDeal?.pendingAddFunds && {
              pendingAddFunds: rawDeal.pendingAddFunds,
            })}
            {...(rawDeal?.pendingReduceFunds && {
              pendingReduceFunds: rawDeal.pendingReduceFunds,
            })}
          />
        </DetailDrawerBody>
      </DetailDrawerContent>
    </DetailDrawer>
  );
};
