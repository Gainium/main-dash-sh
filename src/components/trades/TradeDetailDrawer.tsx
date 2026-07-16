import { formatOrderForDisplay } from '@/hooks/useBotOrders';
import { useDealOrders } from '@/hooks/useDealOrders';
import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import {
  useComboBotsStore,
  useDcaBotsStore,
  useDealStore,
  useGridBotsStore,
} from '@/stores/live';
import {
  BotOrderSideEnum,
  BotTypesEnum,
  DCAOrderTypeEnum,
  type DCABotSettings,
  type DCAGrid,
  type OrderData,
} from '@/types';
import type { ViewOrder } from '@/types/bots';
import type { DrawerBot } from '@/types/bots/drawer';
import type { CompoundBreakdownEntry } from '@/lib/utils/compoundBreakdown';
import { getOrderTypeLabel } from '@/utils/mapOrderName';
import { extractPairAssets } from '@/utils/pairs';
import React, { useMemo } from 'react';
import { formatTradingPair } from '../../lib/utils';
import UnfoldingChartPanel from '../bots/panels/contents/chart/UnfoldingChartPanel';
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

// Mirror of the transform in BotDetailsDrawer.transformOrders so this drawer,
// when mounted standalone (e.g. from the Trading Bots /deals tab), renders
// orders in the same shape `TradeDetailContent` expects.
const orderDataToViewOrder = (
  order: OrderData,
  fallbackExchange?: string
): ViewOrder => {
  const formatted = formatOrderForDisplay(order);
  const executedQty = parseFloat(order.executedQty || '0');
  const origQty = parseFloat(order.origQty || '0');
  const executedPrice =
    executedQty > 0
      ? formatted.price * (executedQty / origQty)
      : formatted.price;
  const orderTypeLabel = getOrderTypeLabel(
    order.typeOrder || 'regular',
    order.sl || false,
    order.clientOrderId,
    order.reduceFundsId,
    true
  );

  return {
    id: formatted.id,
    dealId: formatted.dealId,
    type: formatted.side,
    status: formatted.status,
    symbol: formatted.symbol,
    baseAsset: formatted.baseAsset,
    quoteAsset: formatted.quoteAsset,
    amount: formatted.quantity,
    price: formatted.price,
    filled: formatted.executedQuantity,
    remaining: formatted.quantity - formatted.executedQuantity,
    total: formatted.price * formatted.quantity,
    createTime: new Date(formatted.time).toISOString(),
    ...(formatted.updateTime && {
      updateTime: new Date(formatted.updateTime).toISOString(),
    }),
    side: formatted.side,
    exchange: formatted.exchange || fallbackExchange || 'Unknown',
    executedQuantity: formatted.executedQuantity,
    executedPrice,
    orderType: orderTypeLabel,
    origQty: order.origQty,
    typeOrder: order.typeOrder,
    sl: order.sl,
    clientOrderId: order.clientOrderId,
    reduceFundsId: order.reduceFundsId,
    time: order.updateTime,
    executedQty: order.executedQty,
  };
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

  const { pendingOrders, completedOrders } = useMemo(() => {
    const pending: ViewOrder[] = [];
    const completed: ViewOrder[] = [];
    for (const order of dealOrders ?? []) {
      const view = orderDataToViewOrder(order, trade.exchange);
      const status = String(order.status || '').toUpperCase();
      if (
        status === 'FILLED' ||
        status === 'CANCELED' ||
        status === 'CANCELLED'
      ) {
        completed.push(view);
      } else {
        pending.push(view);
      }
    }
    return { pendingOrders: pending, completedOrders: completed };
  }, [dealOrders, trade.exchange]);

  // Raw deal (not the lossy `trade`) — carries initialPrice, gridBreakpoints,
  // per-deal settings overrides, dynamicAr — needed to project smart orders.
  const rawDeal = useDealStore((s) =>
    trade.botId ? (s.deals[trade.botId]?.[trade.id] ?? null) : null
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
        }
      : null,
    deal: rawDeal,
    pendingOrders,
    completedOrders,
    isCombo,
    enabled: tradeBotType !== BotTypesEnum.grid,
  });

  // Feed the price chart: real pending orders + projected grey smart levels.
  // Grey lines render automatically (BotChart maps grey:true → color).
  const chartOrders = useMemo<DCAGrid[]>(() => {
    const realLines: DCAGrid[] = pendingOrders.map((o) => ({
      qty: +o.origQty,
      price: +o.price,
      side: o.side === 'buy' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
      id: o.id,
      type: o.typeOrder as DCAOrderTypeEnum,
      pair: o.symbol,
      strategy,
      label: getOrderTypeLabel(
        o.typeOrder ?? 'regular',
        !!o.sl,
        o.clientOrderId,
        o.reduceFundsId,
        false
      ),
    }));
    return [...realLines, ...smartChartOrders];
  }, [pendingOrders, smartChartOrders, strategy]);

  const chartTransactions = useMemo(
    () =>
      completedOrders.map((o) => ({
        price: +o.price,
        side: o.side === 'buy' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
        id: o.id,
        time: o.time,
      })),
    [completedOrders]
  );

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
                    enabled={true}
                    className="h-full"
                  />
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
          <TradeDetailContent
            trade={trade}
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
