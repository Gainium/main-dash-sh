import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import { dealWorkingMs } from '@/lib/utils/tradingMetrics';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit,
  History,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Search,
  Square,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import React from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { useBotSpecificDeals } from '../../../hooks/useBotSpecificDeals';
import { useBotTransactions } from '../../../hooks/useBotTransactions';
import { useDcaBots } from '../../../hooks/useDcaBots';
import {
  useDealActions,
  useRestoreDeal,
} from '../../../hooks/useDealActions';
import { useGridBots } from '../../../hooks/useGridBots';
import { toast } from '../../../lib/toast';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  DCADealStatusEnum,
} from '../../../types';
import { ConfirmationDialog } from '../../ui/confirmation-dialog';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs';
import { getCompatibilityDefaultSize } from '../DefaultWidgetSizes';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';

export interface EditDealHistoryProps {
  widgetId: string;
  botId?: string;
  botType?: BotTypesEnum;
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

const EditDealHistory: React.FC<EditDealHistoryProps> = ({
  widgetId,
  botId,
  botType,
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const gridPageContext = useOptionalGridPageContext();
  const gridState = gridPageContext?.state;

  const resolvedBotId = React.useMemo(
    () => botId ?? gridState?.botId ?? paramBotId,
    [botId, gridState?.botId, paramBotId]
  );

  const resolvedBotType = React.useMemo(
    () => botType ?? gridState?.botType ?? BotTypesEnum.dca,
    [botType, gridState?.botType]
  );

  const isGridBot = resolvedBotType === BotTypesEnum.grid;

  const { bots: dcaBots = [], error: dcaBotsError } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  });
  const { bots: gridBots = [] } = useGridBots();

  const bot = React.useMemo(() => {
    if (!resolvedBotId) {
      return undefined;
    }

    if (isGridBot) {
      if (gridState?.bot && gridState.bot._id === resolvedBotId) {
        return gridState.bot;
      }
      return gridBots?.find((gridBot) => gridBot._id === resolvedBotId);
    }

    return dcaBots?.find((dcaBot) => dcaBot._id === resolvedBotId);
  }, [resolvedBotId, isGridBot, gridState?.bot, gridBots, dcaBots]);

  const {
    transactions: queryTransactions,
    isLoading: transactionsIsLoading,
    isError: transactionsIsError,
    error: transactionsError,
  } = useBotTransactions(resolvedBotId ?? '');

  const contextTransactions = gridState?.transactions;
  const canUseContextTransactions =
    isGridBot && contextTransactions && gridState?.botId === resolvedBotId;

  const gridTransactions = React.useMemo(
    () =>
      canUseContextTransactions && contextTransactions
        ? contextTransactions.raw
        : queryTransactions,
    [canUseContextTransactions, contextTransactions, queryTransactions]
  );

  const gridTransactionsLoading = canUseContextTransactions
    ? (contextTransactions?.isLoading ?? false)
    : transactionsIsLoading;

  const gridTransactionsError = React.useMemo(() => {
    if (canUseContextTransactions) {
      return contextTransactions?.error
        ? new Error(contextTransactions.error)
        : null;
    }

    if (transactionsIsError) {
      return transactionsError ?? new Error('Failed to load transactions');
    }

    return null;
  }, [
    canUseContextTransactions,
    contextTransactions?.error,
    transactionsIsError,
    transactionsError,
  ]);

  const toNumber = React.useCallback((value?: string | number | null) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }, []);

  const gridDealsData = React.useMemo(() => {
    if (!isGridBot || !resolvedBotId) {
      return [];
    }

    return gridTransactions.map((transaction) => {
      const amountBase =
        toNumber(transaction.amountBaseSell) ||
        toNumber(transaction.amountBaseBuy);
      const entryAmount =
        toNumber(transaction.amountBaseBuy) ||
        toNumber(transaction.amountBaseSell);
      const price =
        toNumber(transaction.priceSell) || toNumber(transaction.priceBuy);
      const entryPrice =
        toNumber(transaction.priceBuy) ||
        toNumber(transaction.priceSell) ||
        price;
      const profitUsd = toNumber(transaction.profitUsdt);

      return {
        _id: transaction._id,
        botId: transaction.botId,
        status: 'closed',
        symbol: { symbol: transaction.symbol },
        currentBalances: { base: amountBase },
        avgPrice: price,
        profit: { totalUsd: profitUsd },
        createTime: transaction.updateTime,
        initialBalances: { base: entryAmount },
        initialPrice: entryPrice,
        levels: { complete: 1, all: 1 },
      };
    });
  }, [isGridBot, resolvedBotId, gridTransactions, toNumber]);

  const dealsBotId = resolvedBotId ?? '';

  // Determine dealType based on botType
  const dealType =
    resolvedBotType === BotTypesEnum.combo
      ? ('combo' as const)
      : ('dca' as const);

  const {
    deals: activeDealsData,
    isLoading: activeLoading,
    isError: activeError,
    error: activeDealsError,
  } = useBotSpecificDeals({
    botId: dealsBotId,
    status: DCADealStatusEnum.open,
    dealType,
  });

  const {
    deals: closedDealsData,
    isLoading: closedLoading,
    isError: closedError,
    error: closedDealsError,
  } = useBotSpecificDeals({
    botId: dealsBotId,
    status: DCADealStatusEnum.closed,
    dealType,
  });

  const deals = React.useMemo(() => {
    if (isGridBot) {
      return gridDealsData;
    }
    return [...activeDealsData, ...closedDealsData];
  }, [isGridBot, gridDealsData, activeDealsData, closedDealsData]);

  // Combined loading and error states
  const isLoading = isGridBot
    ? gridTransactionsLoading
    : activeLoading || closedLoading;

  const dealsError = React.useMemo(() => {
    if (isGridBot) {
      return gridTransactionsError;
    }
    if (activeError) {
      return activeDealsError ?? new Error('Failed to load open deals');
    }
    if (closedError) {
      return closedDealsError ?? new Error('Failed to load closed deals');
    }
    return null;
  }, [
    isGridBot,
    gridTransactionsError,
    activeError,
    activeDealsError,
    closedError,
    closedDealsError,
  ]);

  // Deal actions hook
  const {
    closeDeal,
    isLoading: isActionLoading,
    error: actionError,
  } = useDealActions();

  // Handle errors
  const hasError = Boolean(dcaBotsError) || Boolean(dealsError);
  const errorMessage =
    dcaBotsError?.message || dealsError?.message || 'Failed to load data';

  // Enhanced pagination with performance optimizations
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [sortBy, setSortBy] = React.useState<
    'timestamp' | 'profit' | 'total' | 'symbol'
  >('timestamp');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [selectedTab, setSelectedTab] = React.useState<'active' | 'completed'>(
    'active'
  );
  const [expandedDeal, setExpandedDeal] = React.useState<string | null>(null);

  // Action dialog states
  const [actionDialog, setActionDialog] = React.useState<{
    open: boolean;
    type: 'edit' | 'cancel' | 'close' | 'addFunds' | 'reduceFunds' | null;
    deal: {
      botId: string;
      id: string;
      type: string;
      amount: number;
      price: number;
      total: number;
      profit: number;
      status: string;
      timestamp: number;
      symbol: string;
    } | null;
  }>({
    open: false,
    type: null,
    deal: null,
  });

  // Action handlers
  const handleDealAction = async (
    type: 'edit' | 'cancel' | 'close' | 'addFunds' | 'reduceFunds',
    deal: {
      botId: string;
      id: string;
      type: string;
      amount: number;
      price: number;
      total: number;
      profit: number;
      status: string;
      timestamp: number;
      symbol: string;
    }
  ) => {
    try {
      if (type === 'close') {
        await closeDeal(deal.id, deal.botId, CloseDCATypeEnum.closeByMarket);
        handleCloseActionDialog();
        // TODO: Implement refetch logic
      } else if (type === 'cancel') {
        await closeDeal(deal.id, deal.botId, CloseDCATypeEnum.cancel);
        handleCloseActionDialog();
        // TODO: Implement refetch logic
      } else {
        // For other actions, just open the dialog for now
        setActionDialog({
          open: true,
          type,
          deal,
        });
      }
    } catch (error) {
      console.error(`Failed to ${type} deal:`, error);
      // TODO: Show error message to user
    }
  };

  const handleCloseActionDialog = () => {
    setActionDialog({
      open: false,
      type: null,
      deal: null,
    });
  };

  // Restore — only for canceled deals of DCA and terminal bots (no grid/combo,
  // no other statuses). Re-adopts the deal's position as a bare active terminal
  // deal (no DCA, TP or SL).
  const restoreDealMutation = useRestoreDeal();
  const canRestoreDeals =
    resolvedBotType === BotTypesEnum.dca ||
    resolvedBotType === BotTypesEnum.terminal;
  const [restoreDialogDeal, setRestoreDialogDeal] = React.useState<{
    botId: string;
    id: string;
    symbol: string;
  } | null>(null);
  const handleRestoreConfirm = async () => {
    if (!restoreDialogDeal) return;
    try {
      await restoreDealMutation.mutateAsync({
        dealId: restoreDialogDeal.id,
        botId: restoreDialogDeal.botId,
      });
      toast.success('Deal restored successfully');
    } catch (error) {
      console.error('Failed to restore deal:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to restore deal'
      );
    } finally {
      setRestoreDialogDeal(null);
    }
  };

  // Enhanced deal processing with filtering, sorting, and pagination
  const allBotDeals = React.useMemo(() => {
    if (!deals || deals.length === 0 || !resolvedBotId) return [];
    // Filter deals for this specific bot (no tab filtering)
    return deals.filter((deal) => deal.botId === resolvedBotId);
  }, [deals, resolvedBotId]);

  const processedDeals = React.useMemo(() => {
    if (!allBotDeals || allBotDeals.length === 0) return [];

    // Apply tab filter - match old dashboard logic
    let filteredDeals = allBotDeals.filter((deal) => {
      if (selectedTab === 'active') {
        // Active deals: error, open, start
        return ['error', 'open', 'start'].includes(deal.status);
      } else {
        // Completed deals: canceled, closed
        return ['canceled', 'closed'].includes(deal.status);
      }
    });

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredDeals = filteredDeals.filter(
        (deal) =>
          deal.symbol?.symbol?.toLowerCase().includes(term) ||
          deal.status.toLowerCase().includes(term)
      );
    }

    // Transform and sort deals
    const transformedDeals = filteredDeals.map((deal) => ({
      botId: deal.botId,
      id: deal._id,
      type:
        deal.status === 'closed' || deal.status === 'canceled'
          ? 'completed'
          : 'active',
      amount: deal.currentBalances?.base || 0,
      price: deal.avgPrice || 0,
      total: (deal.currentBalances?.base || 0) * (deal.avgPrice || 0),
      profit: deal.profit?.totalUsd || 0,
      status: deal.status || 'open',
      timestamp: deal.createTime
        ? new Date(deal.createTime).getTime()
        : Date.now(),
      symbol: deal.symbol?.symbol || 'N/A',
      // Whole days the deal ran. Closed/canceled deals stop at their close
      // instead of counting on to now — see `dealWorkingMs` (V1 parity, #567).
      workingTime: Math.floor(dealWorkingMs(deal) / (1000 * 60 * 60 * 24)),
      profitPercentage:
        deal.profit?.totalUsd && deal.initialBalances?.base && deal.initialPrice
          ? (deal.profit.totalUsd /
              ((deal.initialBalances.base || 0) * (deal.initialPrice || 0))) *
            100
          : 0,
      ordersComplete: deal.levels?.complete || 0,
      ordersTotal: deal.levels?.all || 0,
      entryPrice: deal.initialPrice || 0,
      currentPrice: deal.avgPrice || 0,
    }));

    // Apply sorting
    transformedDeals.sort((a, b) => {
      let aValue: string | number, bValue: string | number;

      switch (sortBy) {
        case 'timestamp':
          aValue = a.timestamp;
          bValue = b.timestamp;
          break;
        case 'profit':
          aValue = a.profit;
          bValue = b.profit;
          break;
        case 'total':
          aValue = a.total;
          bValue = b.total;
          break;
        case 'symbol':
          aValue = a.symbol;
          bValue = b.symbol;
          break;
        default:
          aValue = a.timestamp;
          bValue = b.timestamp;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return transformedDeals;
  }, [allBotDeals, selectedTab, searchTerm, sortBy, sortOrder]); // Pagination calculations using processed deals
  const totalPages = Math.ceil(processedDeals.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedDeals = processedDeals.slice(startIndex, endIndex);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [processedDeals.length, selectedTab, searchTerm, sortBy, sortOrder]);

  // Calculate statistics from all bot deals (not filtered by tab)
  const totalDeals = allBotDeals.length;
  const activeDeals = allBotDeals.filter((deal) =>
    ['error', 'open', 'start'].includes(deal.status)
  ).length;
  const completedDeals = allBotDeals.filter((deal) =>
    ['canceled', 'closed'].includes(deal.status)
  ).length;

  const wrapperProps = {
    metadata: {
      id: widgetId,
      type: 'edit-deal-history',
      title: 'Deal History',
      defaultSize: getCompatibilityDefaultSize('deal-history'),
      minSize: { w: 8, h: 6 },
      maxSize: { w: 12, h: 10 },
      hasOptions: true,
      value: {
        primary: totalDeals.toString(),
        secondary: 'Total Deals',
        change: {
          value: `${activeDeals} active`,
          percentage: '',
          isPositive: activeDeals > 0,
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

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return (
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="p-lg">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Loading deal history...</p>
            </div>
          </div>
        ) : hasError ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50 text-red-500" />
              <p className="text-red-600 font-medium">Error Loading Data</p>
              <p className="text-xs mt-1">{errorMessage}</p>
            </div>
          </div>
        ) : !bot ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Bot not found</p>
            </div>
          </div>
        ) : (
          <>
            {/* Deal Summary */}
            <div className="grid grid-cols-3 gap-md pb-4 border-b border-border">
              <div className="text-center">
                <div className="text-2xl font-bold">{totalDeals}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{completedDeals}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{activeDeals}</div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
            </div>

            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-sm pt-4 pb-4 border-b border-border">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by symbol or status..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-9 w-full text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-xs">
                <Select
                  value={sortBy}
                  onValueChange={(value: string) =>
                    setSortBy(
                      value as 'timestamp' | 'profit' | 'total' | 'symbol'
                    )
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="timestamp">Date</SelectItem>
                    <SelectItem value="profit">Profit</SelectItem>
                    <SelectItem value="total">Total</SelectItem>
                    <SelectItem value="symbol">Symbol</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                  }
                  title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tabs for Active/Completed deals */}
            <Tabs
              value={selectedTab}
              onValueChange={(value: string) =>
                setSelectedTab(value as 'active' | 'completed')
              }
              className="pb-4"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="active"
                  className="flex items-center gap-xs"
                >
                  <Play className="w-4 h-4" />
                  Active ({activeDeals})
                </TabsTrigger>
                <TabsTrigger
                  value="completed"
                  className="flex items-center gap-xs"
                >
                  <Square className="w-4 h-4" />
                  Closed ({completedDeals})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Recent Deals */}
            <div className="space-y-sm">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recent Activity
              </h4>

              {processedDeals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No deals yet</p>
                  <p className="text-xs">
                    Deals will appear here once the bot starts trading
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-xs max-h-48 overflow-y-auto">
                    {paginatedDeals.map((deal) => (
                      <React.Fragment key={deal.id}>
                        <div className="flex items-center justify-between p-sm bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors group">
                          <div className="flex items-center gap-sm flex-1 min-w-0">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                deal.status === 'closed' ||
                                deal.status === 'canceled'
                                  ? 'bg-green-500'
                                  : 'bg-yellow-500'
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-xs">
                                {deal.status === 'closed' ||
                                deal.status === 'canceled' ? (
                                  <TrendingUp className="w-3 h-3 text-green-500" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 text-primary" />
                                )}
                                <span className="text-sm font-medium capitalize">
                                  {deal.status === 'open' ||
                                  deal.status === 'error' ||
                                  deal.status === 'start'
                                    ? 'Active'
                                    : deal.status === 'closed' ||
                                        deal.status === 'canceled'
                                      ? 'Closed'
                                      : deal.status}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {deal.symbol} • {deal.amount.toFixed(4)} @ $
                                  {deal.price.toFixed(2)}
                                </span>
                              </div>

                              {/* Additional deal information */}
                              <div className="flex items-center gap-md text-xs text-muted-foreground mt-1">
                                <span>Working: {deal.workingTime}d</span>
                                {deal.profit !== 0 && (
                                  <span
                                    className={
                                      deal.profit > 0
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }
                                  >
                                    {deal.profit > 0 ? '+' : ''}
                                    {deal.profitPercentage.toFixed(2)}%
                                  </span>
                                )}
                                {deal.ordersTotal > 0 && (
                                  <span>
                                    Orders: {deal.ordersComplete}/
                                    {deal.ordersTotal}
                                  </span>
                                )}
                                <span>{formatTime(deal.timestamp)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-xs">
                            {/* Expand/Collapse Button */}
                            <button
                              onClick={() =>
                                setExpandedDeal(
                                  expandedDeal === deal.id ? null : deal.id
                                )
                              }
                              className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                              title={
                                expandedDeal === deal.id
                                  ? 'Collapse details'
                                  : 'Expand details'
                              }
                            >
                              <ChevronDown
                                className={`w-4 h-4 transition-transform duration-200 ${
                                  expandedDeal === deal.id
                                    ? 'rotate-180'
                                    : 'rotate-0'
                                }`}
                              />
                            </button>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1 opacity-100 transition-opacity">
                              {(deal.status === 'open' ||
                                deal.status === 'error' ||
                                deal.status === 'start') && (
                                <>
                                  <button
                                    onClick={() =>
                                      handleDealAction('edit', deal)
                                    }
                                    className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                    title="Edit deal"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDealAction('addFunds', deal)
                                    }
                                    className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                    title="Add funds"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDealAction('reduceFunds', deal)
                                    }
                                    className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                    title="Reduce funds"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDealAction('cancel', deal)
                                    }
                                    className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-red-500 transition-colors"
                                    title="Cancel deal"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {(deal.status === 'open' ||
                                deal.status === 'error' ||
                                deal.status === 'start') && (
                                <button
                                  onClick={() =>
                                    handleDealAction('close', deal)
                                  }
                                  className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-green-600 transition-colors"
                                  title="Close deal"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              )}
                              {canRestoreDeals &&
                                deal.status === 'canceled' && (
                                  <button
                                    onClick={() =>
                                      setRestoreDialogDeal({
                                        botId: deal.botId,
                                        id: deal.id,
                                        symbol: deal.symbol,
                                      })
                                    }
                                    className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                                    title="Restore deal"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                )}
                            </div>

                            {/* Deal Value */}
                            <div className="text-right min-w-0">
                              <div className="text-sm font-medium">
                                ${deal.total.toFixed(2)}
                              </div>
                              {deal.profit !== 0 && (
                                <div
                                  className={`text-xs ${
                                    deal.profit > 0
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {deal.profit > 0 ? '+' : ''}$
                                  {deal.profit.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {expandedDeal === deal.id && (
                          <div className="border-b border-border/50 bg-muted/20 px-4 py-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
                              {/* Basic Info */}
                              <div className="space-y-md">
                                <div>
                                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                    Deal Information
                                  </h4>
                                  <div className="space-y-xs">
                                    <div className="flex justify-between">
                                      <span className="text-sm">Deal ID:</span>
                                      <span className="text-sm font-mono">
                                        #{deal.id.slice(-6)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">Symbol:</span>
                                      <span className="text-sm font-medium">
                                        {deal.symbol}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">Status:</span>
                                      <span className="text-sm capitalize">
                                        {deal.status}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Balances */}
                                <div>
                                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                    Balances
                                  </h4>
                                  <div className="space-y-xs">
                                    <div className="flex justify-between">
                                      <span className="text-sm">Amount:</span>
                                      <span className="text-sm font-medium">
                                        {deal.amount.toFixed(8)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">Price:</span>
                                      <span className="text-sm font-medium">
                                        ${deal.price.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">Total:</span>
                                      <span className="text-sm font-medium">
                                        ${deal.total.toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Orders */}
                                {deal.ordersTotal > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                      Orders
                                    </h4>
                                    <div className="space-y-xs">
                                      <div className="flex justify-between">
                                        <span className="text-sm">
                                          Complete:
                                        </span>
                                        <span className="text-sm font-medium">
                                          {deal.ordersComplete} /{' '}
                                          {deal.ordersTotal}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm">
                                          Progress:
                                        </span>
                                        <span className="text-sm font-medium">
                                          {deal.ordersTotal > 0
                                            ? Math.round(
                                                (deal.ordersComplete /
                                                  deal.ordersTotal) *
                                                  100
                                              )
                                            : 0}
                                          %
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Financial Info */}
                              <div className="space-y-md">
                                {/* Profit */}
                                {deal.profit !== 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                      Profit & Loss
                                    </h4>
                                    <div className="space-y-xs">
                                      <div className="flex justify-between">
                                        <span className="text-sm">
                                          Total USD:
                                        </span>
                                        <span
                                          className={`text-sm font-medium ${deal.profit > 0 ? 'text-green-600' : 'text-red-600'}`}
                                        >
                                          {deal.profit > 0 ? '+' : ''}$
                                          {deal.profit.toFixed(2)}
                                        </span>
                                      </div>
                                      {deal.profitPercentage && (
                                        <div className="flex justify-between">
                                          <span className="text-sm">
                                            Percentage:
                                          </span>
                                          <span
                                            className={`text-sm font-medium ${deal.profit > 0 ? 'text-green-600' : 'text-red-600'}`}
                                          >
                                            {deal.profit > 0 ? '+' : ''}
                                            {deal.profitPercentage.toFixed(2)}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Times */}
                                <div>
                                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                                    Times
                                  </h4>
                                  <div className="space-y-xs">
                                    <div className="flex justify-between">
                                      <span className="text-sm">Created:</span>
                                      <span className="text-sm font-medium">
                                        {new Date(
                                          deal.timestamp
                                        ).toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">Working:</span>
                                      <span className="text-sm font-medium">
                                        {deal.workingTime}d
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div className="flex items-center gap-sm">
                        <div className="text-xs text-muted-foreground">
                          Showing {startIndex + 1}-
                          {Math.min(endIndex, processedDeals.length)} of{' '}
                          {processedDeals.length} deals
                        </div>
                        <Select
                          value={String(pageSize)}
                          onValueChange={(v) => {
                            setPageSize(Number(v));
                            setCurrentPage(1);
                          }}
                        >
                          <SelectTrigger size="sm" className="w-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 per page</SelectItem>
                            <SelectItem value="10">10 per page</SelectItem>
                            <SelectItem value="25">25 per page</SelectItem>
                            <SelectItem value="50">50 per page</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-xs">
                        <button
                          onClick={() =>
                            setCurrentPage((prev) => Math.max(1, prev - 1))
                          }
                          disabled={currentPage === 1}
                          className="p-1 hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() =>
                            setCurrentPage((prev) =>
                              Math.min(totalPages, prev + 1)
                            )
                          }
                          disabled={currentPage === totalPages}
                          className="p-1 hover:bg-muted rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Bot ID: {bot._id.slice(-6)}</span>
                <span>Last updated: {new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action Dialog */}
      {actionDialog.open && actionDialog.deal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-lg max-w-md w-full mx-4">
            <div className="flex items-center gap-sm mb-4">
              {actionDialog.type === 'edit' && (
                <Edit className="w-5 h-5 text-blue-500" />
              )}
              {actionDialog.type === 'cancel' && (
                <X className="w-5 h-5 text-red-500" />
              )}
              {actionDialog.type === 'close' && (
                <TrendingUp className="w-5 h-5 text-green-500" />
              )}
              {actionDialog.type === 'addFunds' && (
                <Plus className="w-5 h-5 text-blue-500" />
              )}
              {actionDialog.type === 'reduceFunds' && (
                <Minus className="w-5 h-5 text-orange-500" />
              )}

              <h3 className="text-lg font-semibold capitalize">
                {actionDialog.type === 'addFunds'
                  ? 'Add Funds'
                  : actionDialog.type === 'reduceFunds'
                    ? 'Reduce Funds'
                    : actionDialog.type}
              </h3>
            </div>

            <div className="space-y-sm mb-6">
              <p className="text-sm text-muted-foreground">
                {actionDialog.type === 'edit' &&
                  'Edit deal settings and parameters'}
                {actionDialog.type === 'cancel' &&
                  'Cancel this deal? This action cannot be undone.'}
                {actionDialog.type === 'close' &&
                  'Close this deal and realize profits/losses?'}
                {actionDialog.type === 'addFunds' &&
                  'Add additional funds to this deal'}
                {actionDialog.type === 'reduceFunds' &&
                  'Reduce funds from this deal'}
              </p>

              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded p-sm">
                  <p className="text-sm text-red-600">
                    Error: {actionError.message}
                  </p>
                </div>
              )}

              <div className="bg-muted/30 rounded p-sm text-xs">
                <div className="font-medium">{actionDialog.deal.symbol}</div>
                <div>Amount: {actionDialog.deal.amount.toFixed(4)}</div>
                <div>Price: ${actionDialog.deal.price.toFixed(2)}</div>
                <div>Total: ${actionDialog.deal.total.toFixed(2)}</div>
              </div>
            </div>

            <div className="flex gap-sm">
              <button
                onClick={handleCloseActionDialog}
                className="flex-1 px-4 py-2 text-sm border border-border rounded hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // TODO: Implement actual action logic
                  if (actionDialog.deal && actionDialog.type) {
                    handleDealAction(actionDialog.type, actionDialog.deal);
                  }
                }}
                disabled={isActionLoading}
                className={`flex-1 px-4 py-2 text-sm text-white rounded transition-colors ${
                  actionDialog.type === 'cancel'
                    ? 'bg-red-600 hover:bg-red-700'
                    : actionDialog.type === 'close'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isActionLoading
                  ? 'Processing...'
                  : actionDialog.type === 'edit'
                    ? 'Edit'
                    : actionDialog.type === 'cancel'
                      ? 'Cancel Deal'
                      : actionDialog.type === 'close'
                        ? 'Close Deal'
                        : actionDialog.type === 'addFunds'
                          ? 'Add Funds'
                          : 'Reduce Funds'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmationDialog
        open={!!restoreDialogDeal}
        onOpenChange={(open) => {
          if (!open) setRestoreDialogDeal(null);
        }}
        title="Restore deal"
        description={
          restoreDialogDeal
            ? `Restore the deal for ${restoreDialogDeal.symbol}? It will be added back as an active deal that holds the current position, with no DCA, take profit or stop loss.`
            : ''
        }
        confirmText="Restore"
        cancelText="Cancel"
        onConfirm={handleRestoreConfirm}
      />
    </WidgetWrapper>
  );
};

export default EditDealHistory;
