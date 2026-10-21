import React, { useState, useMemo } from 'react';
import { formatUsdAsReporting } from '@/utils/reportingCurrency';
import { Play, Square } from 'lucide-react';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';
import { getCompatibilityDefaultSize } from '../DefaultWidgetSizes';
import { useDcaBots } from '../../../hooks/useDcaBots';
import { useDcaDeals } from '../../../hooks/useDcaDeals';
/* import { useLiveUpdate } from '../../../contexts/LiveUpdateContext'; */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { DCADealStatusEnum } from '@/types';

export interface DealHistoryProps {
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

const DealHistory: React.FC<DealHistoryProps> = ({
  widgetId,
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  const [selectedTab, setSelectedTab] = useState<'active' | 'closed'>('active');
  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: 'deal-history',
      title: 'Deal History',
      defaultSize: getCompatibilityDefaultSize('deal-history'),
      minSize: { w: 8, h: 6 },
      maxSize: { w: 12, h: 10 },
      hasOptions: true,
      hasFilters: true,
      filtersActive: false,
      filterContent: (
        <div className="flex flex-wrap gap-xs p-xs">
          {/* TODO: wire filters to deal-query state — currently mock */}
          <Select defaultValue="all-bots">
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-bots">All Bots</SelectItem>
              <SelectItem value="dca-1">DCA Bot #1</SelectItem>
              <SelectItem value="grid-2">Grid Bot #2</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all-status">
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-status">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="30d">
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="24h">Last 24 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ),
      value: {
        primary: '47',
        secondary: 'Total Deals',
        change: {
          value: '+5',
          percentage: '+11.9',
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

  // Get real deal data from all bots (exclude terminal deals)
  const { bots } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  });
  const { deals } = useDcaDeals({ paperContext: false });

  /* // Get live update context to subscribe to all bots
  const { webSocketManager } = useLiveUpdate();

  // Subscribe to all bots for live deal updates
  React.useEffect(() => {
    if (!webSocketManager || !bots.length) return;

    const botIds = bots.map((bot) => bot._id);
    botIds.forEach((botId) => {
      try {
        webSocketManager.subscribeToBot(botId);
      } catch (error) {
        console.error(
          `[DealHistory] Failed to subscribe to bot ${botId}:`,
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
            `[DealHistory] Failed to unsubscribe from bot ${botId}:`,
            error
          );
        }
      });
    };
  }, [webSocketManager, bots]); */

  const realDeals = useMemo(() => {
    if (!deals || deals.length === 0) return [];

    // Transform deals to display format
    return deals.slice(0, 10).map((deal, index) => {
      const profit = deal.profit?.totalUsd || 0;
      const isProfit = profit > 0;

      // Find the bot for this deal to get bot name
      const dealBot = bots.find((bot) => bot._id === deal.botId);

      return {
        id: deal._id || `deal-${index}`,
        bot: dealBot?.settings?.name || 'Unknown Bot',
        pair: Array.isArray(dealBot?.settings?.pair)
          ? dealBot.settings.pair[0]
          : dealBot?.settings?.pair || 'Unknown',
        type: dealBot?.settings?.type?.toUpperCase() || 'DCA',
        status:
          deal.status === DCADealStatusEnum.closed ||
          deal.status === DCADealStatusEnum.canceled
            ? 'Completed'
            : 'Active',
        profit: isProfit
          ? `+${formatUsdAsReporting(profit)}`
          : formatUsdAsReporting(-Math.abs(profit)),
        profitPercent: isProfit
          ? `+${(profit * 100).toFixed(1)}%`
          : `-${(Math.abs(profit) * 100).toFixed(1)}%`,
        duration: '0m', // Duration not available in DcaDeal interface
        isProfit,
        isCompleted:
          deal.status === DCADealStatusEnum.closed ||
          deal.status === DCADealStatusEnum.canceled,
      };
    });
  }, [deals, bots]);

  // Separate active and closed deals
  const activeDeals = useMemo(() => {
    return realDeals.filter((deal) => !deal.isCompleted);
  }, [realDeals]);

  const closedDeals = useMemo(() => {
    return realDeals.filter((deal) => deal.isCompleted);
  }, [realDeals]);

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="flex flex-col h-full">
        <Tabs
          value={selectedTab}
          onValueChange={(value) =>
            setSelectedTab(value as 'active' | 'closed')
          }
        >
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="active" className="flex items-center gap-xs">
              <Play className="w-4 h-4" />
              Active ({activeDeals.length})
            </TabsTrigger>
            <TabsTrigger value="closed" className="flex items-center gap-xs">
              <Square className="w-4 h-4" />
              Closed ({closedDeals.length})
            </TabsTrigger>
          </TabsList>

          {/* Header */}
          <div className="grid grid-cols-6 gap-xs px-2 py-2 text-xs font-medium text-muted-foreground border-b">
            <div>Bot</div>
            <div>Pair</div>
            <div>Type</div>
            <div>Status</div>
            <div>Profit</div>
            <div>Duration</div>
          </div>

          <TabsContent value="active" className="flex-1 overflow-auto mt-0">
            {activeDeals.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active deals</p>
                  <p className="text-xs">Active deals will appear here</p>
                </div>
              </div>
            ) : (
              activeDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="grid grid-cols-6 gap-xs px-2 py-2 text-xs border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="font-medium text-foreground truncate">
                    {deal.bot}
                  </div>
                  <div className="text-muted-foreground">{deal.pair}</div>
                  <div className="text-muted-foreground">{deal.type}</div>
                  <div>
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        deal.status === 'Completed'
                          ? 'bg-profit/10 text-profit'
                          : deal.status === 'Active'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {deal.status}
                    </span>
                  </div>
                  <div>
                    <div
                      className={`font-medium ${deal.isProfit ? 'text-profit' : 'text-loss'}`}
                    >
                      {deal.profit}
                    </div>
                    <div
                      className={`text-xs ${deal.isProfit ? 'text-profit' : 'text-loss'}`}
                    >
                      {deal.profitPercent}
                    </div>
                  </div>
                  <div className="text-muted-foreground">{deal.duration}</div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="closed" className="flex-1 overflow-auto mt-0">
            {closedDeals.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Square className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No closed deals</p>
                  <p className="text-xs">Completed deals will appear here</p>
                </div>
              </div>
            ) : (
              closedDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="grid grid-cols-6 gap-xs px-2 py-2 text-xs border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="font-medium text-foreground truncate">
                    {deal.bot}
                  </div>
                  <div className="text-muted-foreground">{deal.pair}</div>
                  <div className="text-muted-foreground">{deal.type}</div>
                  <div>
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        deal.status === 'Completed'
                          ? 'bg-profit/10 text-profit'
                          : deal.status === 'Active'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {deal.status}
                    </span>
                  </div>
                  <div>
                    <div
                      className={`font-medium ${deal.isProfit ? 'text-profit' : 'text-loss'}`}
                    >
                      {deal.profit}
                    </div>
                    <div
                      className={`text-xs ${deal.isProfit ? 'text-profit' : 'text-loss'}`}
                    >
                      {deal.profitPercent}
                    </div>
                  </div>
                  <div className="text-muted-foreground">{deal.duration}</div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </WidgetWrapper>
  );
};

export default DealHistory;
