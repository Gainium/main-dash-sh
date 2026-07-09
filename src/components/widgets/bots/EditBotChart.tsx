import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import { useIndicatorStore } from '@/contexts/bots/form/formStoreContexts';
import { riskRewardPositionStore } from '@/stores/riskRewardPositionStore';
import type { ChartIndicatorsConfig, PositionChart } from '@/types';
import type { DcaBot } from '@/types/dcaBot';
import type { GridBot } from '@/types/gridBot';
import {
  ActivityIcon,
  ClockIcon,
  DollarSignIcon,
  LayersIcon,
  PercentIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams } from 'react-router-dom';
import { useBotOrders } from '../../../hooks/useBotOrders';
import { useDcaBots } from '../../../hooks/useDcaBots';
import { useGridBots } from '../../../hooks/useGridBots';
import { useWidgetSettings } from '../../../hooks/useWidgetSettings';
import { BotTypesEnum } from '../../../types';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';
import TradingViewChart from '../shared/TradingViewChart/TradingViewChart';
import type {
  TradingViewDropdownItem,
  TradingViewToolbarDropdownConfig,
} from '../shared/TradingViewChart/types';

// Define EditBotChart-specific settings
export interface EditBotChartWidgetSettings {
  symbol: string;
  interval: string;
  buyPrice: number;
  showOrders: boolean;
  showTransactions: boolean;
  showPastOrders: boolean;
  showSignals: boolean;
}

export interface EditBotChartProps {
  widgetId?: string;
  botId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  symbol?: string;
  interval?: string;
  botType?: BotTypesEnum;
}

interface BotData {
  profit?: {
    total?: number;
    totalUsd?: number;
  };
  usage?: {
    current?: {
      quote?: number;
    };
  };
  stats?: {
    numerical?: {
      general?: {
        winRate?: number;
      };
      profit?: {
        total?: { usd: number };
        profitableDeals?: number;
        profitFactor?: number;
        sharpeRatio?: number;
        maxDrawdownPercent?: number;
      };
      loss?: {
        losingDeals?: number;
        maxDrawdownPercent?: number;
      };
      deals?: {
        profit?: number;
        loss?: number;
      };
    };
    duration?: {
      general?: {
        avgDealDuration?: number;
        workingTime?: number;
        dealsPerDay?: number;
      };
    };
  };
  dealsInBot?: {
    all: number;
    active: number;
  };
}

export const StatisticsPanel: React.FC<{ bot: BotData }> = ({ bot }) => {
  // Calculate statistics
  const stats = useMemo(() => {
    if (!bot) return null;

    const profit = bot.profit?.total || 0;
    const profitUsd = bot.profit?.totalUsd || 0;
    const profitPerc = (profit / (bot.usage?.current?.quote || 1)) * 100 || 0;

    const totalDeals = bot.dealsInBot?.all || 0;
    const openDeals = bot.dealsInBot?.active || 0;
    const profitDeals = bot.stats?.numerical?.profit?.profitableDeals || 0;
    const lossDeals = bot.stats?.numerical?.loss?.losingDeals || 0;
    const winRate = bot.stats?.numerical?.general?.winRate || 0;

    return {
      netProfit: profit,
      netProfitUsd: profitUsd,
      netProfitPerc: profitPerc,
      totalDeals,
      openDeals,
      profitDeals,
      lossDeals,
      winRate: winRate * 100, // Convert to percentage
      avgDealDuration: bot.stats?.duration?.general?.avgDealDuration || 0,
      maxDrawdown:
        bot.stats?.numerical?.profit?.maxDrawdownPercent ||
        bot.stats?.numerical?.loss?.maxDrawdownPercent ||
        0,
      profitFactor: bot.stats?.numerical?.profit?.profitFactor || 0,
      sharpeRatio: bot.stats?.numerical?.profit?.sharpeRatio || 0,
    };
  }, [bot]);
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-md p-md border-b bg-muted/10">
      {/* Net Profit */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <DollarSignIcon className="h-3 w-3" />
          <span>Net Profit</span>
        </div>
        <div
          className={`text-lg font-bold ${stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}
        >
          ${stats.netProfitUsd.toFixed(2)}
        </div>
        <div
          className={`text-xs ${stats.netProfitPerc >= 0 ? 'text-green-600' : 'text-red-600'}`}
        >
          {stats.netProfitPerc.toFixed(2)}%
        </div>
      </div>

      {/* Win Rate */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <PercentIcon className="h-3 w-3" />
          <span>Win Rate</span>
        </div>
        <div className="text-lg font-bold">{stats.winRate.toFixed(1)}%</div>
        <div className="text-xs text-muted-foreground">
          {stats.profitDeals}W / {stats.lossDeals}L
        </div>
      </div>

      {/* Total Deals */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <LayersIcon className="h-3 w-3" />
          <span>Deals</span>
        </div>
        <div className="text-lg font-bold">{stats.totalDeals}</div>
        <div className="text-xs text-muted-foreground">
          {stats.openDeals} open
        </div>
      </div>

      {/* Max Drawdown */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <TrendingDownIcon className="h-3 w-3" />
          <span>Max DD</span>
        </div>
        <div className="text-lg font-bold text-red-600">
          {stats.maxDrawdown.toFixed(2)}%
        </div>
        <div className="text-xs text-muted-foreground">drawdown</div>
      </div>

      {/* Profit Factor */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <TrendingUpIcon className="h-3 w-3" />
          <span>Profit Factor</span>
        </div>
        <div className="text-lg font-bold">{stats.profitFactor.toFixed(2)}</div>
      </div>

      {/* Sharpe Ratio */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <ActivityIcon className="h-3 w-3" />
          <span>Sharpe Ratio</span>
        </div>
        <div className="text-lg font-bold">{stats.sharpeRatio.toFixed(2)}</div>
      </div>

      {/* Avg Deal Duration */}
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <ClockIcon className="h-3 w-3" />
          <span>Avg Duration</span>
        </div>
        <div className="text-lg font-bold">
          {Math.floor(stats.avgDealDuration / 3600)}h
        </div>
      </div>
    </div>
  );
};

// Chart controls component
const ChartControls: React.FC = () => {
  return (
    <div className="flex items-center justify-between p-xs border-b">
      {/* Left side - Controls */}
      <div className="flex items-center space-x-xs">
        {/* Chart controls moved to gear menu */}
      </div>
    </div>
  );
};

export interface EditBotChartProps {
  widgetId?: string;
  botId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  symbol?: string;
  interval?: string;
  indicators?: ChartIndicatorsConfig;
  botType?: BotTypesEnum;
}

const EditBotChart: React.FC<EditBotChartProps> = ({
  widgetId = 'edit-bot-chart',
  botId,
  isEditable = false,
  onCollapse,
  onTabMove,
  menuActions,
  symbol: propSymbol,
  interval: propInterval,
  indicators,
  botType,
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const actualBotId = botId || paramBotId;

  const gridPageContext = useOptionalGridPageContext();

  const effectiveBotType = useMemo(
    () => botType ?? gridPageContext?.state.botType ?? BotTypesEnum.dca,
    [botType, gridPageContext?.state.botType]
  );

  const isGridBot = effectiveBotType === BotTypesEnum.grid;

  // Get bot data to determine the trading pair (exclude terminal deals)
  const {
    bots: dcaBots,
    isLoading: isDcaBotsLoading,
    error: dcaBotsError,
  } = useDcaBots({ terminal: false, paperContext: false, all: true });

  const {
    bots: gridBots,
    isLoading: isGridBotsLoading,
    error: gridBotsError,
  } = useGridBots();

  const activeBot = useMemo(() => {
    if (!actualBotId) {
      return undefined;
    }

    if (isGridBot) {
      if (gridPageContext?.state.bot?._id === actualBotId) {
        return gridPageContext.state.bot;
      }
      return gridBots.find((candidate) => candidate._id === actualBotId);
    }

    return dcaBots.find((candidate) => candidate._id === actualBotId);
  }, [actualBotId, isGridBot, gridPageContext?.state.bot, gridBots, dcaBots]);

  const botsLoading = useMemo(() => {
    if (isGridBot) {
      if (gridPageContext) {
        return (
          gridPageContext.state.status === 'loading' ||
          gridPageContext.state.status === 'idle'
        );
      }
      return isGridBotsLoading;
    }

    return isDcaBotsLoading;
  }, [isGridBot, gridPageContext, isGridBotsLoading, isDcaBotsLoading]);

  const contextError = useMemo(() => {
    if (!gridPageContext?.state.error) {
      return null;
    }
    return new Error(gridPageContext.state.error);
  }, [gridPageContext?.state.error]);

  const botsError = useMemo(() => {
    if (isGridBot) {
      return contextError ?? gridBotsError ?? null;
    }
    return dcaBotsError ?? null;
  }, [isGridBot, contextError, gridBotsError, dcaBotsError]);

  // Get orders for the bot
  const ordersResult = useBotOrders(actualBotId || '', effectiveBotType);

  const botOrders = useMemo(() => {
    if (isGridBot && gridPageContext?.state.orders.raw) {
      return gridPageContext.state.orders.raw;
    }
    return ordersResult.orders;
  }, [isGridBot, gridPageContext?.state.orders.raw, ordersResult.orders]);

  const { usePersistedState } =
    useWidgetSettings<EditBotChartWidgetSettings>(widgetId);

  // Get symbol from bot data or fallback to props/default
  const symbol = useMemo(() => {
    if (propSymbol) {
      return propSymbol;
    }

    if (isGridBot) {
      const contextSymbol = gridPageContext?.state.bot?.symbol?.symbol;
      if (contextSymbol) {
        return contextSymbol;
      }
      const gridBot = activeBot as GridBot | undefined;
      if (gridBot?.symbol?.symbol) {
        return gridBot.symbol.symbol;
      }
      if (gridBot?.settings?.pair) {
        return gridBot.settings.pair;
      }
    } else {
      const dcaBot = activeBot as DcaBot | undefined;
      const symbolEntry = dcaBot?.symbol?.find((entry) => entry.value?.symbol);
      if (symbolEntry?.value?.symbol) {
        return symbolEntry.value.symbol;
      }
      const pairFallback = Array.isArray(dcaBot?.settings?.pair)
        ? dcaBot?.settings?.pair?.[0]
        : undefined;
      if (pairFallback) {
        return pairFallback;
      }
    }

    return 'BTCUSDT';
  }, [propSymbol, isGridBot, gridPageContext?.state.bot, activeBot]);
  const [interval] = usePersistedState('interval', propInterval || '1h');
  const [showOrders, setShowOrders] = usePersistedState('showOrders', true);
  const [showTransactions, setShowTransactions] = usePersistedState(
    'showTransactions',
    true
  );
  const [showPastOrders, setShowPastOrders] = usePersistedState(
    'showPastOrders',
    true
  );
  const [showSignals, setShowSignals] = usePersistedState('showSignals', true);

  const showOrdersRef = useRef(showOrders);
  const showTransactionsRef = useRef(showTransactions);
  const showPastOrdersRef = useRef(showPastOrders);
  const showSignalsRef = useRef(showSignals);

  useEffect(() => {
    showOrdersRef.current = showOrders;
  }, [showOrders]);

  useEffect(() => {
    showTransactionsRef.current = showTransactions;
  }, [showTransactions]);

  useEffect(() => {
    showPastOrdersRef.current = showPastOrders;
  }, [showPastOrders]);

  useEffect(() => {
    showSignalsRef.current = showSignals;
  }, [showSignals]);

  const toggleShowOrders = useCallback(() => {
    setShowOrders(!showOrdersRef.current);
  }, [setShowOrders]);
  const toggleShowTransactions = useCallback(() => {
    setShowTransactions(!showTransactionsRef.current);
  }, [setShowTransactions]);
  const toggleShowPastOrders = useCallback(() => {
    setShowPastOrders(!showPastOrdersRef.current);
  }, [setShowPastOrders]);
  const toggleShowSignals = useCallback(() => {
    setShowSignals(!showSignalsRef.current);
  }, [setShowSignals]);

  const toolbarDropdownItems = useMemo<TradingViewDropdownItem[]>(
    () => [
      {
        title: 'Toggle order lines',
        onSelect: toggleShowOrders,
      },
      {
        title: 'Toggle buy/sell icons',
        onSelect: toggleShowTransactions,
      },
      {
        title: 'Toggle past orders',
        onSelect: toggleShowPastOrders,
      },
      {
        title: 'Toggle entry/exit signals',
        onSelect: toggleShowSignals,
      },
    ],
    [
      toggleShowOrders,
      toggleShowPastOrders,
      toggleShowSignals,
      toggleShowTransactions,
    ]
  );

  const toolbarDropdownConfig =
    useMemo<TradingViewToolbarDropdownConfig | null>(() => {
      if (!toolbarDropdownItems.length) {
        return null;
      }

      return {
        title: 'Chart',
        tooltip: 'Chart display options',
        useTradingViewStyle: true,
        items: toolbarDropdownItems,
      };
    }, [toolbarDropdownItems]);

  // Subscribe to DCA indicator store for real-time chart updates
  const [storeIndicators, setStoreIndicators] = useState<ChartIndicatorsConfig>(
    []
  );
  const [riskPosition, setRiskPosition] = useState<PositionChart | null>(null);

  // Shared global for regular bots; the leg's isolated instance under an
  // isolateStores BotFormProvider (hedge leg).
  const indicatorStore = useIndicatorStore();

  useEffect(() => {
    const unsubscribe = indicatorStore.subscribe((chartIndicators) => {
      setStoreIndicators(chartIndicators);
    });
    return unsubscribe;
  }, [indicatorStore]);

  useEffect(() => {
    const resolvedBotId = actualBotId?.trim() ?? '';
    const unsubscribe = riskRewardPositionStore.subscribe(
      resolvedBotId,
      (position) => {
        setRiskPosition(position);
      }
    );

    return () => {
      unsubscribe();
      setRiskPosition(null);
    };
  }, [actualBotId]);

  // Use store indicators if available, otherwise fallback to prop indicators
  const finalIndicators =
    storeIndicators.length > 0 ? storeIndicators : indicators;

  // Transform bot orders to ChartOrderLine format for TradingView
  const chartOrders = useMemo(() => {
    if (!botOrders || !showOrders) return [];

    return botOrders
      .filter((order) => order.status === 'NEW') // Only show pending orders
      .map((order) => ({
        price: parseFloat(order.price),
        side: order.side.toLowerCase(),
        qty: parseFloat(order.origQty),
        label: `${order.side} ${order.origQty} @ ${order.price}`,
      }));
  }, [botOrders, showOrders]);

  const hasWidgetOptions = Boolean(
    menuActions?.optionsMenuItems?.length || menuActions?.onOptions
  );

  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: 'edit-bot-chart',
      title: `Chart - ${symbol}`,
      defaultSize: { w: 8, h: 6 },
      minSize: { w: 6, h: 4 },
      maxSize: { w: 12, h: 10 },
      hasOptions: hasWidgetOptions,
      value: {
        primary: symbol,
        secondary: `${interval} • ${activeBot?.exchange || 'Exchange'}`,
      },
    },
    isEditable,
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions ? { menuActions } : {}),
  };

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="h-full">
        {botsLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : botsError ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="text-sm text-red-600 font-medium">
                Error Loading Chart
              </div>
              <div className="text-xs mt-1">{botsError.message}</div>
            </div>
          </div>
        ) : !activeBot ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="text-sm">Bot not found</div>
              <div className="text-xs mt-1">
                Cannot display chart without bot data
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Chart Controls */}
            <ChartControls />

            {/* TradingView Chart */}
            <div className="flex-1">
              <TradingViewChart
                symbol={symbol}
                interval={interval}
                orders={chartOrders}
                position={riskPosition}
                showOrders={showOrders}
                showTransactions={showTransactions}
                showPastOrders={showPastOrders}
                showSignals={showSignals}
                toolbarDropdown={toolbarDropdownConfig}
                widgetId={widgetId}
                {...(finalIndicators &&
                  finalIndicators.length > 0 && {
                    indicators: finalIndicators,
                  })}
              />
            </div>
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
};

export default EditBotChart;
