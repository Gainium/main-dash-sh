import type { DrawerBot } from '@/types/bots/drawer';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Edit,
  ExternalLink,
  FileText,
  History,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { InputDialog } from '@/components/ui/confirmation-dialog';
import { useNavigate } from 'react-router-dom';
import {
  formatOrderForDisplay,
  useBotOrders,
} from '../../../../hooks/useBotOrders';
/* import { useComboBots } from '../../../../hooks/useComboBots';
import { useDcaBots } from '../../../../hooks/useDcaBots';
import { useGridBots } from '../../../../hooks/useGridBots';
import { useHedgeComboBots } from '../../../../hooks/useHedgeComboBots';
import { useHedgeDcaBots } from '../../../../hooks/useHedgeDcaBots'; */
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { getOrderTypeLabel, mapOrderName } from '@/utils/mapOrderName';
import { useCancelOrder } from '../../../../hooks/useOrderActions';
import logger from '../../../../lib/loggerInstance';
import { cn, formatCurrency } from '../../../../lib/utils';
import { formatPriceWithPrecision } from '@/utils/formatters';
import {
  BotOrderSideEnum,
  BotTypesEnum,
  DCAOrderTypeEnum,
  StrategyEnum,
  type TransactionChart,
} from '../../../../types';
import { ProgressBar } from '../../../ui/ProgressBar';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../ui/dropdown-menu';
import { Input } from '../../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../ui/tabs';
import CoinPair from '../../shared/CoinPair';
import { DrawerSection } from './DrawerSection';

export interface DrawerOrdersTableProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

// Real order data extracted from deals
interface Order {
  id: string;
  dealId: string;
  type: 'buy' | 'sell';
  status: 'pending' | 'filled' | 'cancelled' | 'partial';
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  amount: number;
  price: number;
  filled: number;
  remaining: number;
  total: number;
  createTime: string;
  updateTime?: string;
  side: 'buy' | 'sell'; // Changed from 'base' | 'safety' to match actual buy/sell
  // Enhanced fields from old dashboard
  exchange?: string;
  botName?: string;
  strategy?: string;
  executedQuantity?: number;
  executedPrice?: number;
  orderType?: string;
}

// mapOrderName and order type utilities now imported from @/utils/mapOrderName

export const DrawerOrdersTable: React.FC<DrawerOrdersTableProps> = ({
  widgetId,
  botId,
  bot: botProp,
}) => {
  const isGrid = useMemo(
    () => botProp?.type === BotTypesEnum.grid,
    [botProp?.type]
  );
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState<'pending' | 'completed'>(
    'pending'
  );
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  // Order currently being annotated via the React note dialog (replaces the
  // native prompt()).
  const [noteOrderId, setNoteOrderId] = useState<string | null>(null);
  const { cancelPendingOrder, isLoading: isCanceling } = useCancelOrder();

  // Filter states - separate for each tab
  const [pendingFilters, setPendingFilters] = useState({
    searchTerm: '',
    statusFilter: 'all',
    symbolFilter: 'all',
  });

  const [completedFilters, setCompletedFilters] = useState({
    searchTerm: '',
    statusFilter: 'all',
    symbolFilter: 'all',
  });

  // Determine bot type from prop
  const botType = useMemo(() => botProp?.type || 'dca', [botProp?.type]);

  // Get real data from backend (exclude terminal deals)
  /* const { bots: dcaBots } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  });

  const { bots: gridBots } = useGridBots({ paperContext: false });

  const { bots: comboBots } = useComboBots({ paperContext: false });

  const { bots: hedgeDcaBots } = useHedgeDcaBots({
    terminal: false,
    paperContext: false,
  });

  const { bots: hedgeComboBots } = useHedgeComboBots({
    terminal: false,
    paperContext: false,
  }); */

  // Use prop bot if available, otherwise find from fetched data
  const bot = useMemo(() => botProp, [botProp]); /* ||
    (botType === 'grid'
      ? gridBots.find((b) => b._id === botId)
      : botType === 'combo'
        ? comboBots.find((b) => b._id === botId)
        : botType === 'hedgeDca'
          ? hedgeDcaBots.find((b) => b._id === botId)
          : botType === 'hedgeCombo'
            ? hedgeComboBots.find((b) => b._id === botId)
            : dcaBots.find((b) => b._id === botId)) */

  // Get separate data for pending and completed orders (like old dashboard)
  // Map drawer bot type to BotTypesEnum for orders API
  const ordersBotType = useMemo(
    () =>
      botType === 'grid'
        ? BotTypesEnum.grid
        : botType === 'combo'
          ? BotTypesEnum.combo
          : botType === 'hedgeDca'
            ? BotTypesEnum.hedgeDca
            : botType === 'hedgeCombo'
              ? BotTypesEnum.hedgeCombo
              : BotTypesEnum.dca,
    [botType]
  );

  // Hedge support: derive leg IDs and underlying types for orders
  /* const isHedgeDca = botType === 'hedgeDca';
  const isHedgeCombo = botType === 'hedgeCombo'; */
  /* const longLegId = ((): string => {
    // Prefer DrawerBot extra when available
    const extra = (bot as DrawerBot | undefined)?.extra;
    if (extra) {
      if (isHedgeDca && extra.hedgeDca?.longBotId)
        return extra.hedgeDca.longBotId;
      if (isHedgeCombo && extra.hedgeCombo?.longBotId)
        return extra.hedgeCombo.longBotId;
    }
    // Fallback: derive from raw HedgeBot children
    const children = (
      bot as unknown as {
        bots?: Array<{ _id?: string; settings?: { strategy?: string } }>;
      }
    )?.bots;
    if (Array.isArray(children) && children.length) {
      const found = children.find(
        (b) => String(b.settings?.strategy ?? '').toLowerCase() === 'long'
      );
      if (found?._id) return found._id;
    }
    return '';
  })();
  const shortLegId = ((): string => {
    const extra = (bot as DrawerBot | undefined)?.extra;
    if (extra) {
      if (isHedgeDca && extra.hedgeDca?.shortBotId)
        return extra.hedgeDca.shortBotId;
      if (isHedgeCombo && extra.hedgeCombo?.shortBotId)
        return extra.hedgeCombo.shortBotId;
    }
    const children = (
      bot as unknown as {
        bots?: Array<{ _id?: string; settings?: { strategy?: string } }>;
      }
    )?.bots;
    if (Array.isArray(children) && children.length) {
      const found = children.find(
        (b) => String(b.settings?.strategy ?? '').toLowerCase() === 'short'
      );
      if (found?._id) return found._id;
    }
    return '';
  })(); */
  /*  const underlyingType = isHedgeDca
    ? BotTypesEnum.dca
    : isHedgeCombo
      ? BotTypesEnum.combo
      : ordersBotType; */

  /* if (import.meta.env.DEV && (isHedgeDca || isHedgeCombo)) {
    console.debug('[DrawerOrdersTable] Hedge leg derivation', {
      type: isHedgeDca ? 'hedgeDca' : 'hedgeCombo',
      parentBotId: botId,
      longLegId,
      shortLegId,
      underlyingType,
    });
  } */

  const {
    orders: pendingBotOrders,
    isLoading: pendingOrdersLoading,
    hasValidResponse: hasPendingResponse,
  } = useBotOrders(botId || '', ordersBotType, { status: 'NEW' });

  const {
    orders: completedBotOrders,
    isLoading: completedOrdersLoading,
    hasValidResponse: hasCompletedResponse,
  } = useBotOrders(botId || '', ordersBotType, { status: 'FILLED' });

  // Hedge leg orders (always call hooks to maintain order; will be ignored if not hedge)
  /* const {
    orders: pendingLongOrders,
    isLoading: pendingLongLoading,
    hasValidResponse: hasPendingLong,
  } = useBotOrders(longLegId, underlyingType, { status: 'NEW' });
  const {
    orders: pendingShortOrders,
    isLoading: pendingShortLoading,
    hasValidResponse: hasPendingShort,
  } = useBotOrders(shortLegId, underlyingType, { status: 'NEW' });
  const {
    orders: completedLongOrders,
    isLoading: completedLongLoading,
    hasValidResponse: hasCompletedLong,
  } = useBotOrders(longLegId, underlyingType, { status: 'FILLED' });
  const {
    orders: completedShortOrders,
    isLoading: completedShortLoading,
    hasValidResponse: hasCompletedShort,
  } = useBotOrders(shortLegId, underlyingType, { status: 'FILLED' }); */

  // Transform backend orders to component format - memoized to prevent infinite re-renders
  const transformOrders = useMemo(() => {
    return (
      backendOrders: typeof pendingBotOrders,
      source: string
    ): Order[] => {
      logger.info(
        `[${source}] Raw orders from backend:`,
        backendOrders.map((o) => ({ id: o.clientOrderId, status: o.status }))
      );

      return backendOrders.map((order) => {
        const formatted = formatOrderForDisplay(order);

        // Calculate executed price (weighted average if partial fills, no artificial slippage)
        const executedQty = parseFloat(order.executedQty);
        const origQty = parseFloat(order.origQty);
        const executedPrice =
          executedQty > 0
            ? formatted.price * (executedQty / origQty) // Remove artificial 0.1% slippage
            : formatted.price;

        // Determine the proper order type label (with DCA/add funds/reduce funds annotations)
        const isRealOrder = source === 'COMPLETED' || source === 'FILLED';
        const orderTypeLabel = getOrderTypeLabel(
          order.typeOrder || 'regular',
          order.sl || false,
          order.clientOrderId,
          order.reduceFundsId,
          isRealOrder
        );

        return {
          id: formatted.id,
          dealId: formatted.dealId,
          type: formatted.side, // Now correctly maps to 'buy' | 'sell'
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
          side: formatted.side, // 'buy' | 'sell'
          // Enhanced fields from old dashboard - using real backend data
          exchange: formatted.exchange || bot?.exchange || 'Unknown',
          botName: bot?.settings?.name || 'DCA Bot',
          strategy: bot?.settings?.strategy || 'DCA',
          executedQuantity: formatted.executedQuantity,
          executedPrice: executedPrice,
          orderType: orderTypeLabel, // Use the full label with DCA/add funds/reduce funds annotations
        };
      });
    };
  }, [bot?.exchange, bot?.settings?.name, bot?.settings?.strategy]); // Combined orders for potential future use (currently unused)
  // const allOrders: Order[] = useMemo(() => {
  //   const pending = hasPendingResponse ? transformOrders(pendingBotOrders) : [];
  //   const completed = hasCompletedResponse ? transformOrders(completedBotOrders) : [];
  //   return [...pending, ...completed];
  // }, [pendingBotOrders, completedBotOrders, hasPendingResponse, hasCompletedResponse]);

  // Update loading state to include orders loading
  const isLoading = /* isHedgeDca || isHedgeCombo
      ? pendingLongLoading ||
        pendingShortLoading ||
        completedLongLoading ||
        completedShortLoading
      :  */ useMemo(
    () => pendingOrdersLoading || completedOrdersLoading,
    [pendingOrdersLoading, completedOrdersLoading]
  );

  // Separate pending and completed orders based on backend calls (like old dashboard)
  const pendingOrders = useMemo(() => {
    /* if (isHedgeDca || isHedgeCombo) {
      const raw = [
        ...(hasPendingLong ? pendingLongOrders : []),
        ...(hasPendingShort ? pendingShortOrders : []),
      ];
      return raw.length ? transformOrders(raw, 'PENDING') : [];
    } */
    return hasPendingResponse
      ? transformOrders(pendingBotOrders, 'PENDING')
      : [];
  }, [
    /*  isHedgeDca,
    isHedgeCombo,
    hasPendingLong,
    hasPendingShort,
    pendingLongOrders,
    pendingShortOrders, */
    pendingBotOrders,
    hasPendingResponse,
    transformOrders,
  ]);

  const completedOrders = useMemo(() => {
    /* if (isHedgeDca || isHedgeCombo) {
      const raw = [
        ...(hasCompletedLong ? completedLongOrders : []),
        ...(hasCompletedShort ? completedShortOrders : []),
      ];
      const transformed = raw.length ? transformOrders(raw, 'COMPLETED') : [];
      if (import.meta.env.DEV) {
        console.debug('[DrawerOrdersTable] Completed orders', {
          source: isHedgeDca || isHedgeCombo ? 'legs' : 'parent',
          count: transformed.length,
        });
      }
      return transformed;
    } */
    const transformed = hasCompletedResponse
      ? transformOrders(completedBotOrders, 'COMPLETED')
      : [];
    if (import.meta.env.DEV) {
      console.debug('[DrawerOrdersTable] Completed orders (parent)', {
        count: transformed.length,
      });
    }
    return transformed;
  }, [
    /* isHedgeDca,
    isHedgeCombo,
    hasCompletedLong,
    hasCompletedShort,
    completedLongOrders,
    completedShortOrders, */
    completedBotOrders,
    hasCompletedResponse,
    transformOrders,
  ]);

  // Filtered orders based on search and filters - separate for each tab
  const filteredPendingOrders = useMemo(() => {
    return pendingOrders.filter((order: Order) => {
      const matchesSearch =
        !pendingFilters.searchTerm ||
        order.id
          .toLowerCase()
          .includes(pendingFilters.searchTerm.toLowerCase()) ||
        order.symbol
          .toLowerCase()
          .includes(pendingFilters.searchTerm.toLowerCase()) ||
        (order.botName &&
          order.botName
            .toLowerCase()
            .includes(pendingFilters.searchTerm.toLowerCase()));

      const matchesStatus =
        pendingFilters.statusFilter === 'all' ||
        order.status === pendingFilters.statusFilter;
      const matchesSymbol =
        pendingFilters.symbolFilter === 'all' ||
        order.symbol === pendingFilters.symbolFilter;

      return matchesSearch && matchesStatus && matchesSymbol;
    });
  }, [pendingOrders, pendingFilters]);

  const filteredCompletedOrders = useMemo(() => {
    return completedOrders.filter((order: Order) => {
      const matchesSearch =
        !completedFilters.searchTerm ||
        order.id
          .toLowerCase()
          .includes(completedFilters.searchTerm.toLowerCase()) ||
        order.symbol
          .toLowerCase()
          .includes(completedFilters.searchTerm.toLowerCase()) ||
        (order.botName &&
          order.botName
            .toLowerCase()
            .includes(completedFilters.searchTerm.toLowerCase()));

      const matchesStatus =
        completedFilters.statusFilter === 'all' ||
        order.status === completedFilters.statusFilter;
      const matchesSymbol =
        completedFilters.symbolFilter === 'all' ||
        order.symbol === completedFilters.symbolFilter;

      return matchesSearch && matchesStatus && matchesSymbol;
    });
  }, [completedOrders, completedFilters]);

  // Get current filter state based on selected tab
  const getCurrentFilters = () => {
    return selectedTab === 'pending' ? pendingFilters : completedFilters;
  };

  const setCurrentFilters = (newFilters: typeof pendingFilters) => {
    if (selectedTab === 'pending') {
      setPendingFilters(newFilters);
    } else {
      setCompletedFilters(newFilters);
    }
  };

  // Handle tab change with filter reset
  const handleTabChange = (value: string) => {
    const tab = value as 'pending' | 'completed';
    setSelectedTab(tab);
    // Reset status filter to 'all' when switching tabs to show all relevant orders
    if (tab === 'pending') {
      setPendingFilters((prev) => ({ ...prev, statusFilter: 'all' }));
    } else {
      setCompletedFilters((prev) => ({ ...prev, statusFilter: 'all' }));
    }
  };

  // Get unique symbols for filter dropdown - based on current tab
  const uniqueSymbols = useMemo(() => {
    const ordersForTab =
      selectedTab === 'pending' ? pendingOrders : completedOrders;
    return Array.from(new Set(ordersForTab.map((order) => order.symbol)));
  }, [pendingOrders, completedOrders, selectedTab]);

  // Handle order cancellation with proper error handling
  const handleCancelOrder = async (order: Order) => {
    try {
      // For now, use cancelPendingOrder for all orders
      // TODO: Determine correct cancellation method based on order properties
      await cancelPendingOrder({
        dealId: order.dealId,
        botId: botId ?? '', // Add the required botId parameter
        orderId: order.id,
      });
      // Success feedback will be handled by the mutation's onSuccess callback
    } catch (error) {
      // Error feedback will be handled by the mutation's onError callback
      // Log error for debugging without using console directly
      if (import.meta.env.DEV) {
        // Only log in development mode
        console.error('Failed to cancel order:', error);
      }
    }
  };

  // Handle expanding/collapsing order details
  const handleToggleExpand = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Utility functions for enhanced actions
  const handleCopyOrderId = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      // TODO: Add toast notification here for better UX
    } catch (error) {
      console.error('Failed to copy order ID:', error);
      // Fallback: try to select text for manual copy
      try {
        const textArea = document.createElement('textarea');
        textArea.value = orderId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (fallbackError) {
        console.error('Fallback copy method also failed:', fallbackError);
      }
    }
  };

  const handleExportOrder = (order: Order) => {
    const orderData = {
      id: order.id,
      symbol: order.symbol,
      type: order.type,
      status: order.status,
      amount: order.amount,
      price: order.price,
      filled: order.filled,
      remaining: order.remaining,
      total: order.total,
      createTime: order.createTime,
      updateTime: order.updateTime,
      exchange: order.exchange,
      botName: order.botName,
      strategy: order.strategy,
      orderType: order.orderType,
    };

    const dataStr = JSON.stringify(orderData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `order-${order.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Advanced action handlers
  const handleRefreshOrder = async (orderId: string) => {
    try {
      // TODO: Implement order refresh functionality
      // This would typically call an API to get the latest order status
      logger.info('Refreshing order:', orderId);
      // For now, just show a placeholder
      // In production, this would refresh the order data from the backend
    } catch (error) {
      console.error('Failed to refresh order:', error);
    }
  };

  const handleAddNote = (orderId: string) => {
    // Opens the React note dialog for this order (replaces native prompt()).
    setNoteOrderId(orderId);
  };

  const handleAddNoteConfirm = (note: string) => {
    try {
      if (noteOrderId && note) {
        logger.info('Adding note to order', { orderId: noteOrderId, note });
        // In production, this would save the note to the backend
      }
    } catch (error) {
      console.error('Failed to add note:', error);
    } finally {
      setNoteOrderId(null);
    }
  };

  const handleEditOrder = async (order: Order) => {
    try {
      // TODO: Implement edit order functionality
      // This would typically open an edit modal with order parameters
      logger.info('Editing order:', order.id);
      // In production, this would open an order editing interface
    } catch (error) {
      console.error('Failed to edit order:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'filled':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'partial':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-3 h-3" />;
      case 'filled':
        return <CheckCircle className="w-3 h-3" />;
      case 'cancelled':
        return <XCircle className="w-3 h-3" />;
      case 'partial':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return <MoreHorizontal className="w-3 h-3" />;
    }
  };

  // Local presentational helpers for consistent drawer UI
  const SectionTitle: React.FC<{
    children: React.ReactNode;
    className?: string;
  }> = ({ children, className }) => (
    <h5
      className={cn(
        'text-xs font-semibold text-muted-foreground uppercase tracking-wide',
        className
      )}
    >
      {children}
    </h5>
  );

  const MetricCard: React.FC<{
    label: string;
    value: React.ReactNode;
    tone?: 'default' | 'success' | 'danger' | 'warning' | 'muted';
  }> = ({ label, value, tone = 'default' }) => (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div
        className={cn(
          'text-sm font-semibold mt-1',
          tone === 'success'
            ? 'text-success'
            : tone === 'danger'
              ? 'text-destructive'
              : tone === 'warning'
                ? 'text-yellow-700 dark:text-yellow-400'
                : 'text-foreground'
        )}
      >
        {value}
      </div>
    </div>
  );

  const KeyValueRow: React.FC<{ label: string; value: React.ReactNode }> = ({
    label,
    value,
  }) => (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );

  const OrderRow: React.FC<{ order: Order }> = ({ order }) => {
    const isBuy = order.type === 'buy';
    const fillPercentage =
      order.amount > 0 ? (order.filled / order.amount) * 100 : 0;
    const isExpanded = expandedOrderId === order.id;

    const handleRowClick = (e: React.MouseEvent) => {
      // Don't toggle if clicking on buttons or dropdowns
      if (
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('[role="menuitem"]')
      ) {
        return;
      }
      handleToggleExpand(order.id);
    };

    return (
      <div className="border-b border-border/50">
        {/* Main Row - Clickable */}
        <div
          className="flex flex-col gap-md p-md hover:bg-muted/30 transition-colors cursor-pointer sm:flex-row sm:items-start sm:justify-between"
          onClick={handleRowClick}
        >
          <div className="flex items-start gap-sm flex-1 min-w-0">
            {/* Type & Status */}
            <div className="flex flex-col gap-1 min-w-[70px]">
              <div className="flex items-center gap-xs">
                {/* BUY/SELL Chip with proper styling */}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs font-medium flex items-center gap-1',
                    isBuy
                      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                  )}
                >
                  {isBuy ? (
                    <TrendingDown className="w-3 h-3" />
                  ) : (
                    <TrendingUp className="w-3 h-3" />
                  )}
                  {order.type.toUpperCase()}
                </Badge>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs flex items-center gap-1 w-fit',
                  getStatusColor(order.status)
                )}
              >
                {getStatusIcon(order.status)}
                {order.status}
              </Badge>
            </div>

            {/* Enhanced Order Info */}
            <div className="flex flex-col min-w-0">
              <div className="font-medium text-sm flex items-center gap-1 min-w-0">
                <CoinPair
                  baseAsset={order.baseAsset}
                  quoteAsset={order.quoteAsset}
                  iconSize="sm"
                  showText={false}
                  className="shrink-0"
                />
                <span className="truncate">{order.symbol}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {order.exchange}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {order.botName}
              </div>
              <div className="text-xs text-muted-foreground">
                {order.strategy} • {order.orderType}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-sm w-full sm:w-auto sm:items-end">
            <div className="grid grid-cols-2 gap-md w-full sm:grid-cols-3 sm:gap-lg">
              <div className="flex flex-col text-left sm:text-right">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Amount &amp; Price
                </span>
                <span className="text-sm font-semibold">
                  {order.amount.toFixed(4)}
                </span>
                <span className="text-xs text-muted-foreground">
                  @ {formatPriceWithPrecision(order.price)}
                </span>
                {order.executedPrice && order.executedPrice !== order.price && (
                  <span className="text-xs text-muted-foreground">
                    Exec: {formatPriceWithPrecision(order.executedPrice)}
                  </span>
                )}
              </div>
              <div className="flex flex-col text-left sm:text-right">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Fill Status
                </span>
                <span className="text-sm font-semibold">
                  {fillPercentage.toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {order.filled.toFixed(4)} / {order.amount.toFixed(4)}
                </span>
              </div>
              <div className="flex flex-col text-left sm:text-right">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Total Value
                </span>
                <span className="text-sm font-semibold">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-xs sm:justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              {order.status === 'pending' && botType !== 'grid' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs w-full sm:w-auto"
                  disabled={isCanceling}
                  onClick={() => handleCancelOrder(order)}
                >
                  {isCanceling ? 'Canceling...' : 'Cancel'}
                </Button>
              )}

              {order.status === 'filled' && botType !== 'grid' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs w-full sm:w-auto"
                  onClick={() =>
                    navigate(`/trades?symbol=${order.symbol}&bot=${botId}`)
                  }
                  title="View related deals"
                >
                  View Deal
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="p-0"
                onClick={() => handleToggleExpand(order.id)}
                title={isExpanded ? 'Collapse details' : 'Expand details'}
              >
                <ChevronDown
                  className={cn(
                    'w-4 h-4 transition-transform duration-200',
                    isExpanded ? 'rotate-180' : 'rotate-0'
                  )}
                />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-0"
                    title="More actions"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleCopyOrderId(order.id)}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Order ID
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExportOrder(order)}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Order
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Order Details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate(`/orders/${order.id}/history`)}
                  >
                    <History className="w-4 h-4 mr-2" />
                    Order History
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleRefreshOrder(order.id)}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Status
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddNote(order.id)}>
                    <FileText className="w-4 h-4 mr-2" />
                    Add Note
                  </DropdownMenuItem>
                  {order.status === 'pending' && (
                    <DropdownMenuItem onClick={() => handleEditOrder(order)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Order
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Expandable Details Section - reorganized with shared patterns */}
        {isExpanded && (
          <div className="px-4 pb-6 border-t border-border/50 bg-muted/10">
            <div className="pt-6 space-y-lg">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-sm min-w-0">
                  <CoinPair
                    baseAsset={order.baseAsset}
                    quoteAsset={order.quoteAsset}
                    iconSize="md"
                    showText={false}
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-xs min-w-0">
                      <h4 className="font-semibold text-sm truncate">
                        {order.symbol}
                      </h4>
                      <span className="text-xs text-muted-foreground truncate">
                        {order.exchange}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {order.botName} • {order.strategy}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">
                    {formatCurrency(order.total)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fillPercentage.toFixed(1)}% filled
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-xs">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Fill Progress</span>
                  <span>
                    {order.filled.toFixed(6)} / {order.amount.toFixed(6)}{' '}
                    {order.baseAsset || order.symbol.split('/')[0]}
                  </span>
                </div>
                <ProgressBar
                  value={Math.min(fillPercentage, 100)}
                  max={100}
                  className="h-2"
                  variant={
                    fillPercentage === 100
                      ? 'success'
                      : fillPercentage > 0
                        ? 'warning'
                        : 'danger'
                  }
                />
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
                <MetricCard
                  label="Order Price"
                  value={formatPriceWithPrecision(order.price)}
                />

                {order.executedPrice && order.executedPrice !== order.price && (
                  <MetricCard
                    label="Executed Price"
                    value={formatPriceWithPrecision(order.executedPrice)}
                  />
                )}

                <MetricCard
                  label="Amount"
                  value={
                    <div className="space-y-0.5">
                      <div>{order.amount.toFixed(6)}</div>
                      <div className="text-xs text-muted-foreground">
                        Remaining {Math.max(order.remaining, 0).toFixed(6)}
                      </div>
                    </div>
                  }
                />

                <MetricCard
                  label="Fill Status"
                  tone={
                    fillPercentage === 100
                      ? 'success'
                      : fillPercentage > 0
                        ? 'warning'
                        : 'muted'
                  }
                  value={
                    <div className="space-y-0.5 sm:text-right text-left">
                      <div>{fillPercentage.toFixed(1)}%</div>
                      <div className="text-xs text-muted-foreground">
                        {order.filled.toFixed(6)} / {order.amount.toFixed(6)}
                      </div>
                    </div>
                  }
                />

                <MetricCard
                  label="Total Value"
                  value={formatCurrency(order.total)}
                />
              </div>

              {/* Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                <div className="space-y-sm">
                  <SectionTitle>Order Details</SectionTitle>
                  <div className="space-y-xs">
                    <KeyValueRow
                      label="Order ID"
                      value={
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {order.id.slice(-8)}...
                        </code>
                      }
                    />
                    <KeyValueRow
                      label="Exchange"
                      value={order.exchange || '—'}
                    />
                    <KeyValueRow
                      label="Order Type"
                      value={order.orderType || '—'}
                    />
                  </div>
                </div>

                <div className="space-y-sm">
                  <SectionTitle>Timing</SectionTitle>
                  <div className="space-y-xs">
                    <KeyValueRow
                      label="Created"
                      value={
                        <span>
                          {new Date(order.createTime).toLocaleDateString()}{' '}
                          {new Date(order.createTime).toLocaleTimeString()}
                        </span>
                      }
                    />
                    {order.updateTime && (
                      <KeyValueRow
                        label="Last Updated"
                        value={
                          <span>
                            {new Date(order.updateTime).toLocaleDateString()}{' '}
                            {new Date(order.updateTime).toLocaleTimeString()}
                          </span>
                        }
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-xs pt-2 border-t border-border/50 sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyOrderId(order.id)}
                  className="flex items-center gap-xs"
                >
                  <Copy className="w-4 h-4" />
                  Copy ID
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportOrder(order)}
                  className="flex items-center gap-xs"
                >
                  <Download className="w-4 h-4" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="flex items-center gap-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Details
                </Button>
                {order.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditOrder(order)}
                    className="flex items-center gap-xs"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Order
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!isGrid) {
      return;
    }
    return () => {
      exampleOrdersStore.setOrders([]);
      exampleOrdersStore.setTransactions([]);
    };
  }, [isGrid]);

  useEffect(() => {
    if (!isGrid) {
      return;
    }
    const mappedOrders = [...pendingBotOrders].map((o) => ({
      qty: +o.origQty,
      price: +o.price,
      side: o.side === 'BUY' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
      id: o.clientOrderId,
      type: o.typeOrder as DCAOrderTypeEnum,
      pair: o.symbol,
      strategy: StrategyEnum.long,
      label: mapOrderName(o.typeOrder, !!o.sl),
    }));
    exampleOrdersStore.setOrders(mappedOrders);
  }, [pendingBotOrders, isGrid]);

  useEffect(() => {
    if (!isGrid) {
      return;
    }
    const mappedTransactions: TransactionChart[] = [...completedBotOrders].map(
      (o) => ({
        price: +o.price,
        side: o.side === 'BUY' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell,
        id: o.clientOrderId,
        time: o.updateTime || o.time,
      })
    );
    exampleOrdersStore.setTransactions(mappedTransactions);
  }, [completedBotOrders, isGrid]);

  if (isLoading) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-orders-table"
        title="Orders"
        icon={ShoppingCart}
        minSize={{ w: 6, h: 6 }}
        maxSize={{ w: 12, h: 12 }}
        hasOptions={false}
      >
        <div className="p-sm md:p-md">
          <div className="text-center text-muted-foreground py-8">
            Loading orders...
          </div>
        </div>
      </DrawerSection>
    );
  }

  if (!bot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-orders-table"
        title="Orders"
        icon={ShoppingCart}
        minSize={{ w: 6, h: 6 }}
        maxSize={{ w: 12, h: 12 }}
        hasOptions={false}
      >
        <div className="p-sm md:p-md">
          <div className="text-center text-muted-foreground">Bot not found</div>
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-orders-table"
      title="Orders"
      icon={ShoppingCart}
      minSize={{ w: 6, h: 6 }}
      maxSize={{ w: 12, h: 12 }}
      hasOptions={false}
      headerActions={
        <div className="flex flex-wrap items-center gap-sm text-sm">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span className="text-xs text-muted-foreground">
              {filteredPendingOrders.length} Pending
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs text-muted-foreground">
              {filteredCompletedOrders.length} Completed
            </span>
          </div>
        </div>
      }
    >
      <div className="p-sm md:p-md">
        {/* Compact Search and Filters */}
        <div className="flex flex-col gap-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-xs mb-4">
          {/* Search Input */}
          <div className="relative w-full sm:flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={getCurrentFilters().searchTerm}
              onChange={(e) =>
                setCurrentFilters({
                  ...getCurrentFilters(),
                  searchTerm: e.target.value,
                })
              }
              className="pl-10 pr-10 h-8 text-xs"
            />
            {getCurrentFilters().searchTerm && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCurrentFilters({ ...getCurrentFilters(), searchTerm: '' })
                }
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          {/* Status Filter - Dynamic based on current tab */}
          <Select
            value={getCurrentFilters().statusFilter}
            onValueChange={(value) =>
              setCurrentFilters({ ...getCurrentFilters(), statusFilter: value })
            }
          >
            <SelectTrigger className="h-8 text-xs w-full sm:w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {selectedTab === 'pending' ? (
                <>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="partial">Partially Filled</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="filled">Filled</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          {/* Symbol Filter */}
          <Select
            value={getCurrentFilters().symbolFilter}
            onValueChange={(value) =>
              setCurrentFilters({ ...getCurrentFilters(), symbolFilter: value })
            }
          >
            <SelectTrigger className="h-8 text-xs w-full sm:w-32">
              <SelectValue placeholder="Symbol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Symbols</SelectItem>
              {uniqueSymbols.map((symbol) => (
                <SelectItem key={symbol} value={symbol}>
                  {symbol}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear Filters Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentFilters({
                searchTerm: '',
                statusFilter: 'all',
                symbolFilter: 'all',
              });
            }}
            className="h-8 px-3 text-xs w-full sm:w-auto"
          >
            Clear
          </Button>
        </div>

        <Tabs value={selectedTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="pending"
              className="flex items-center gap-xs text-xs"
            >
              <Clock className="w-4 h-4" />
              Pending ({filteredPendingOrders.length})
            </TabsTrigger>
            <TabsTrigger
              value="completed"
              className="flex items-center gap-xs text-xs"
            >
              <CheckCircle className="w-4 h-4" />
              Completed ({filteredCompletedOrders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {filteredPendingOrders.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-4 py-3 border-b">
                  <div className="hidden sm:grid sm:grid-cols-[1.6fr_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] sm:gap-md text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>Order Details</span>
                    <span className="text-right">Amount &amp; Price</span>
                    <span className="text-right">Fill Status</span>
                    <span className="text-right">Totals &amp; Actions</span>
                  </div>
                  <div className="sm:hidden text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Order Overview
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {filteredPendingOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>
                  {hasPendingResponse
                    ? 'No pending orders match your filters'
                    : 'Order data not available'}
                </p>
                <p className="text-sm">
                  {hasPendingResponse
                    ? 'Try adjusting your search or filter criteria'
                    : 'Unable to load pending orders from backend'}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            {filteredCompletedOrders.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-4 py-3 border-b">
                  <div className="hidden sm:grid sm:grid-cols-[1.6fr_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] sm:gap-md text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>Order Details</span>
                    <span className="text-right">Amount &amp; Price</span>
                    <span className="text-right">Fill Status</span>
                    <span className="text-right">Totals &amp; Actions</span>
                  </div>
                  <div className="sm:hidden text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Order Overview
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {filteredCompletedOrders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>
                  {hasCompletedResponse
                    ? 'No completed orders match your filters'
                    : 'Order data not available'}
                </p>
                <p className="text-sm">
                  {hasCompletedResponse
                    ? 'Try adjusting your search or filter criteria'
                    : 'Unable to load completed orders from backend'}
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <InputDialog
        open={noteOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setNoteOrderId(null);
        }}
        title="Add a note"
        description="Add a note to this order."
        placeholder="Note"
        confirmText="Add note"
        onConfirm={handleAddNoteConfirm}
      />
    </DrawerSection>
  );
};

export default DrawerOrdersTable;
