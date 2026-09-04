import { useDealOrders } from '@/hooks/useDealOrders';
import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import { useUserFees } from '@/hooks/useUserFeesService';
import { buildDealExitLines } from '@/utils/bots/dca/deal-exit-lines';
import {
  dealCompletedOrdersToTransactions,
  dealPendingOrdersToChartLines,
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
  type DCABotSettings,
  type DCAGrid,
} from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import type { CompoundBreakdownEntry } from '@/lib/utils/compoundBreakdown';
import { extractPairAssets } from '@/utils/pairs';
import React, { useMemo } from 'react';
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
  const { pendingOrders, completedOrders } = useMemo(
    () => splitDealOrders(dealOrders, trade.exchange),
    [dealOrders, trade.exchange]
  );

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
        pendingOrders.map((o) => +o.price)
      ),
    [rawDeal, chartBot, takerFee, pendingOrders]
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
  const chartOrders = useMemo<DCAGrid[]>(
    () => [
      ...dealPendingOrdersToChartLines(pendingOrders, strategy),
      ...smartChartOrders,
      ...dealExitLines,
    ],
    [pendingOrders, smartChartOrders, strategy, dealExitLines]
  );

  const chartTransactions = useMemo(
    () => dealCompletedOrdersToTransactions(completedOrders),
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
                    liquidationContext={liquidationContext}
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
