import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import React from 'react';
import { BarChart3 } from 'lucide-react';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';
import { getCompatibilityDefaultSize } from '../DefaultWidgetSizes';
import { useDcaBots } from '../../../hooks/useDcaBots';
import { useDcaDeals } from '../../../hooks/useDcaDeals';
/* import { useLiveUpdate } from '../../../contexts/LiveUpdateContext'; */

export interface BotPerformanceProps {
  widgetId: string;
  isEditable?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
}

const BotPerformance: React.FC<BotPerformanceProps> = ({
  widgetId,
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: 'bot-performance',
      title: 'Bot Performance',
      defaultSize: getCompatibilityDefaultSize('bot-performance'),
      minSize: { w: 6, h: 4 },
      maxSize: { w: 12, h: 8 },
      hasOptions: true,
      value: {
        primary: '+15.3%',
        secondary: 'Total Return',
        isProfit: true,
        change: {
          value: '+2.1%',
          percentage: '+2.1',
          isPositive: true,
        },
      },
    },
    isEditable,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && { menuActions }),
  };

  // Get real performance data from all bots (exclude terminal deals)
  const { bots, isLoading } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  });
  const { deals, isLoading: dealsLoading } = useDcaDeals({
    paperContext: false,
  });

  /* // Get live update context to subscribe to all bots
  const { webSocketManager } = useLiveUpdate();

  // Subscribe to all bots for live updates
  React.useEffect(() => {
    if (!webSocketManager || !bots.length) return;

    const botIds = bots.map((bot) => bot._id);
    botIds.forEach((botId) => {
      try {
        webSocketManager.subscribeToBot(botId);
      } catch (error) {
        console.error(
          `[BotPerformance] Failed to subscribe to bot ${botId}:`,
          error
        );
      }
    });

    return () => {
      botIds.forEach((botId) => {
        try {
          webSocketManager.unsubscribeFromBot(botId);
        } catch (error) {
          console.error(
            `[BotPerformance] Failed to unsubscribe from bot ${botId}:`,
            error
          );
        }
      });
    };
  }, [webSocketManager, bots]); */

  // Calculate real performance metrics
  const performanceMetrics = React.useMemo(() => {
    if (!bots || bots.length === 0) {
      return {
        totalProfit: 0,
        winRate: 0,
        profitFactor: 0,
        totalDeals: 0,
        winningDeals: 0,
        losingDeals: 0,
      };
    }

    let totalProfit = 0;
    let totalDeals = 0;
    let winningDeals = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;

    // Calculate total profit from bots
    bots.forEach((bot) => {
      if (bot.profit?.totalUsd) {
        totalProfit += bot.profit.totalUsd;
      }
    });

    // Calculate deal statistics
    if (deals && deals.length > 0) {
      deals.forEach((deal) => {
        if (deal.status === 'closed') {
          totalDeals++;
          const profit = deal.profit?.totalUsd || 0;
          if (profit > 0) {
            winningDeals++;
            totalWinAmount += profit;
          } else if (profit < 0) {
            totalLossAmount += Math.abs(profit);
          }
        }
      });
    }

    const winRate = totalDeals > 0 ? (winningDeals / totalDeals) * 100 : 0;
    const profitFactor =
      totalLossAmount > 0
        ? totalWinAmount / totalLossAmount
        : totalWinAmount > 0
          ? 999
          : 0;

    return {
      totalProfit,
      winRate,
      profitFactor,
      totalDeals,
      winningDeals,
      losingDeals: totalDeals - winningDeals,
    };
  }, [bots, deals]);

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="flex flex-col h-full">
        {/* Performance Overview */}
        <div className="bg-inner-container rounded-lg p-md mb-4 flex-1">
          {isLoading || dealsLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50 animate-pulse" />
                <div className="text-sm">Loading performance data...</div>
              </div>
            </div>
          ) : performanceMetrics.totalDeals === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <div className="text-sm">No performance data yet</div>
                <div className="text-xs opacity-70">
                  Performance metrics will appear once bots complete deals
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-md">
              <div className="text-center">
                <div
                  className={`text-2xl font-bold ${performanceMetrics.totalProfit >= 0 ? 'text-profit' : 'text-loss'}`}
                >
                  {performanceMetrics.totalProfit >= 0 ? '+' : ''}$
                  {performanceMetrics.totalProfit.toFixed(2)}
                </div>
                <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                  Realized PnL
                  <Tooltip
                    tooltip="Profit banked across these bots' closed deals. Deals still running are not counted."
                    side="top"
                  >
                    <InfoIcon />
                  </Tooltip>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-md text-center">
                <div>
                  <div className="text-lg font-semibold text-profit">
                    {performanceMetrics.winningDeals}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Winning Deals
                  </div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-loss">
                    {performanceMetrics.losingDeals}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Losing Deals
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-sm">
          <div className="bg-inner-container rounded-lg p-sm text-center">
            <div
              className={`text-sm font-semibold ${performanceMetrics.winRate >= 50 ? 'text-profit' : 'text-muted-foreground'}`}
            >
              {performanceMetrics.winRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Win Rate</div>
          </div>
          <div className="bg-inner-container rounded-lg p-sm text-center">
            <div
              className={`text-sm font-semibold ${performanceMetrics.profitFactor >= 1 ? 'text-profit' : 'text-loss'}`}
            >
              {performanceMetrics.profitFactor >= 999
                ? '∞'
                : performanceMetrics.profitFactor.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">Profit Factor</div>
          </div>
          <div className="bg-inner-container rounded-lg p-sm text-center">
            <div className="text-sm font-semibold text-muted-foreground">
              {performanceMetrics.totalDeals}
            </div>
            <div className="text-xs text-muted-foreground">Total Deals</div>
          </div>
        </div>
      </div>
    </WidgetWrapper>
  );
};

export default BotPerformance;
