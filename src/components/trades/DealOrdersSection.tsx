import { cn } from '@/lib/utils';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { type ColumnDef } from '@tanstack/react-table';
import {
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import logger from '../../lib/loggerInstance';
import { formatCurrency } from '../../lib/utils';
import { formatPriceWithPrecision } from '@/utils/formatters';
import { toast } from '@/lib/toast';
import {
  StrategyEnum,
  type AddFundsSettings,
  type DCAGrid,
  type TransactionChart,
} from '../../types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ConfirmationDialog } from '../ui/confirmation-dialog';
import { ProgressBar } from '../ui/ProgressBar';
import { DataTable } from '../ui/data-table/data-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useCancelOrder } from '@/hooks/useOrderActions';
import { useOrderStore } from '@/stores/live/orderStore';
import type { ViewOrder } from '@/types/bots';
import type { SmartViewOrder } from '@/hooks/bots/dca/useDealSmartOrders';

type PendingFundsEntry = AddFundsSettings & { id: string };

type OrderRowModel = ViewOrder & { __smart?: boolean };

interface DealOrdersSectionProps {
  dealId: string;
  botId: string;
  botType: 'DCA' | 'Combo' | 'Hedge DCA' | 'Hedge Combo' | 'Grid' | 'Terminal';
  exchange?: string;
  pendingOrders: ViewOrder[];
  completedOrders: ViewOrder[];
  isLoadingOrders: boolean;
  chartOrders?: DCAGrid[];
  chartTransactions?: TransactionChart[];
  /** Projected, not-yet-placed "smart order" ladder levels (parity w/ legacy). */
  smartOrders?: SmartViewOrder[];
  /** Sort direction for the ladder (long = high→low). */
  strategy?: StrategyEnum;
  /**
   * Deal's pending manual "add funds" requests. A pending order whose limit
   * price matches one of these is canceled via `cancelPendingAddFundsDealOrder`
   * (it tears down the pending request + the placed order), mirroring legacy.
   */
  pendingAddFunds?: PendingFundsEntry[];
  /** Deal's pending manual "reduce funds" requests (see `pendingAddFunds`). */
  pendingReduceFunds?: PendingFundsEntry[];
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'filled':
      return 'bg-success/10 text-success border-success/20';
    case 'cancelled':
      return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'partial':
      return 'bg-info/10 text-info border-info/20';
    case 'new':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
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
      return <Clock className="w-3 h-3" />;
    default:
      return <Clock className="w-3 h-3" />;
  }
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge
    variant="outline"
    className={cn('text-xs border px-2 py-0.5', getStatusColor(status))}
  >
    <span className="flex items-center gap-1">
      {getStatusIcon(status)}
      {status}
    </span>
  </Badge>
);

const copyOrderId = async (orderId: string) => {
  try {
    await navigator.clipboard.writeText(orderId);
  } catch (error) {
    console.error('Failed to copy order ID:', error);
  }
};

/**
 * Card-view row context. The card renderer is handed to `DataTable` by
 * component type (`cardComponent`), so it can't close over the section's cancel
 * handlers the way the inline table cells can — it reads them from here instead.
 */
interface OrderCardContextValue {
  isCancellable: (order: OrderRowModel) => boolean;
  requestCancel: (order: OrderRowModel) => void;
  isCanceling: boolean;
}
const OrderCardContext = createContext<OrderCardContextValue | null>(null);

/**
 * The original (pre-table) order card. Now the non-default "Card" view of the
 * orders DataTable; the table view is the default. Kept visually identical to
 * the previous list so nothing regresses for users who prefer cards.
 */
const OrderCard: React.FC<{ item: OrderRowModel; index: number }> = ({
  item: order,
  index,
}) => {
  const ctx = useContext(OrderCardContext);
  const [isExpanded, setIsExpanded] = useState(false);

  const isBuy = order.type === 'buy';
  const isSmart = !!order.__smart;
  const fillPercentage =
    order.amount > 0 ? (order.filled / order.amount) * 100 : 0;
  const statusKey = isSmart ? 'new' : order.status;
  const statusLabel = isSmart ? 'new' : order.status;
  const cancellable = !isSmart && !!ctx?.isCancellable(order);

  const handleRowClick = (e: React.MouseEvent) => {
    if (isSmart) {
      return;
    }
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    setIsExpanded((v) => !v);
  };

  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden transition-colors',
        // Card view sits flush against the toolbar otherwise — give the first
        // card the same breathing room above it as the gap between cards.
        index === 0 && 'mt-md',
        isSmart ? 'bg-muted/25' : 'bg-muted/40'
      )}
    >
      {/* Order Summary Row */}
      <div
        className={cn(
          'p-md transition-colors',
          isSmart ? 'cursor-default' : 'cursor-pointer hover:bg-muted'
        )}
        onClick={handleRowClick}
      >
        <div className="flex items-center justify-between gap-md">
          {/* Left: Order Type & Status */}
          <div className="flex items-center gap-sm min-w-0 flex-1">
            <div
              className={cn(
                'p-xs rounded-lg',
                isSmart
                  ? 'bg-muted text-muted-foreground'
                  : isBuy
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              )}
            >
              {isSmart ? (
                <Sparkles className="w-5 h-5" />
              ) : isBuy ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <span
                className={cn(
                  'text-sm font-semibold mb-1',
                  isSmart ? 'text-muted-foreground' : 'text-foreground'
                )}
              >
                {order.orderType || 'LIMIT'}
              </span>
              <div className="flex items-center gap-xs flex-wrap">
                <StatusBadge status={statusKey === 'new' ? statusLabel : statusKey} />
              </div>
            </div>
          </div>

          {/* Center: Price & Amount */}
          <div className="hidden md:flex flex-col items-end">
            <span className="text-sm font-medium">
              {formatPriceWithPrecision(order.price)}
            </span>
            <span className="text-xs text-muted-foreground">
              {order.amount.toFixed(6)}
            </span>
          </div>

          {/* Right: Total & Expand */}
          <div className="flex items-center gap-sm">
            <div className="flex flex-col items-end">
              <span className="text-sm font-semibold">
                {formatCurrency(order.total)}
              </span>
              {order.status === 'partial' && !isSmart && (
                <span className="text-xs text-muted-foreground">
                  {fillPercentage.toFixed(0)}% filled
                </span>
              )}
            </div>
            {!isSmart && (
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-muted-foreground transition-transform',
                  isExpanded && 'rotate-180'
                )}
              />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-md pb-md pt-sm bg-background/60">
          <div className="space-y-md">
            {/* Progress Bar for Partial Fills */}
            {order.status === 'partial' && (
              <div className="space-y-xs">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Fill Progress</span>
                  <span className="font-medium">
                    {order.filled.toFixed(6)} / {order.amount.toFixed(6)}
                  </span>
                </div>
                <ProgressBar
                  value={fillPercentage}
                  variant={fillPercentage === 100 ? 'success' : 'default'}
                  size="sm"
                />
              </div>
            )}

            {/* Order Details Grid */}
            <div className="grid grid-cols-2 gap-md">
              <div className="space-y-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    Order Price
                  </span>
                  <span className="text-sm font-medium">
                    {formatPriceWithPrecision(order.price)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <span className="text-sm font-medium">
                    {order.amount.toFixed(6)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Filled</span>
                  <span className="text-sm font-medium">
                    {order.filled.toFixed(6)}
                  </span>
                </div>
              </div>

              <div className="space-y-sm">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    Total Value
                  </span>
                  <span className="text-sm font-medium">
                    {formatCurrency(order.total)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    Remaining
                  </span>
                  <span className="text-sm font-medium">
                    {order.remaining.toFixed(6)}
                  </span>
                </div>
                {order.executedPrice &&
                  order.executedQuantity &&
                  order.executedQuantity > 0 && (
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">
                        Avg. Executed Price
                      </span>
                      <span className="text-sm font-medium">
                        {formatPriceWithPrecision(order.executedPrice)}
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {/* Order ID */}
            <div className="flex items-center justify-between pt-sm">
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-xs text-muted-foreground mb-1">
                  Order ID
                </span>
                <span className="text-xs font-mono text-foreground truncate">
                  {order.id}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyOrderId(order.id)}
                className="shrink-0"
              >
                <Copy className="w-3 h-3 mr-1" />
                Copy
              </Button>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-md text-xs">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {new Date(order.createTime).toLocaleString()}
                </span>
              </div>
              {order.updateTime && (
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="font-medium">
                    {new Date(order.updateTime).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Cancel action — only for cancellable open orders */}
            {cancellable && (
              <div className="flex justify-end pt-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ctx?.isCanceling}
                  onClick={() => ctx?.requestCancel(order)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  {ctx?.isCanceling ? 'Canceling…' : 'Cancel order'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const DealOrdersSection: React.FC<DealOrdersSectionProps> = ({
  dealId,
  botId,
  botType,
  exchange,
  pendingOrders: _pendingOrders,
  completedOrders: _completedOrders,
  isLoadingOrders: isLoading,
  chartOrders = [],
  chartTransactions = [],
  smartOrders = [],
  strategy = StrategyEnum.long,
  pendingAddFunds = [],
  pendingReduceFunds = [],
}) => {
  const [cancelTarget, setCancelTarget] = useState<OrderRowModel | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const {
    cancelTerminalOrder,
    cancelPendingOrder,
    isLoading: isCanceling,
  } = useCancelOrder();

  // Debug logging
  if (import.meta.env.DEV) {
    logger.info('[DealOrdersSection] Initialized with:', {
      dealId,
      botId,
      botType,
      exchange,
    });
  }

  // Scope orders to this deal.
  const pendingOrders = useMemo(
    () => _pendingOrders.filter((o) => o.dealId === dealId),
    [_pendingOrders, dealId]
  );

  const completedOrders = useMemo(
    () => _completedOrders.filter((o) => o.dealId === dealId),
    [_completedOrders, dealId]
  );

  useEffect(() => {
    return () => {
      exampleOrdersStore.setOrders([]);
      exampleOrdersStore.setTransactions([]);
    };
  }, []);

  useEffect(() => {
    exampleOrdersStore.setOrders(chartOrders);
  }, [chartOrders]);

  useEffect(() => {
    exampleOrdersStore.setTransactions(chartTransactions);
  }, [chartTransactions]);

  // Sort each list as a price ladder (long: high→low, short: low→high) so the
  // deal reads top-to-bottom, matching the chart.
  const sortLadder = useCallback(
    (orders: OrderRowModel[]): OrderRowModel[] => {
      const isLong = strategy === StrategyEnum.long;
      return [...orders].sort((a, b) =>
        isLong ? b.price - a.price : a.price - b.price
      );
    },
    [strategy]
  );

  // Pending tab carries real open orders + projected smart-order ladder levels.
  const pendingData = useMemo(
    () => sortLadder([...pendingOrders, ...smartOrders]),
    [pendingOrders, smartOrders, sortLadder]
  );
  const completedData = useMemo(
    () => sortLadder(completedOrders),
    [completedOrders, sortLadder]
  );

  const pendingCount = pendingData.length;
  const completedCount = completedData.length;
  const totalOrders = pendingCount + completedCount;

  // Land on the tab that actually has orders when the deal changes (closed
  // deals have only completed orders; open deals usually have pending ones).
  useEffect(() => {
    setActiveTab(
      pendingData.length > 0 || completedData.length === 0
        ? 'pending'
        : 'completed'
    );
    // Re-pick only on deal change — not every time the arrays re-derive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  // Legacy parity (main-dash `setCancelOrderOrPendingAddFunds`): a placed order
  // that lines up by limit price with a pending manual add/reduce-funds request
  // must be canceled through the pending-add-funds mutation (which tears down
  // both the request and the placed order); everything else is a plain terminal
  // order cancel.
  const findPendingFundsForOrder = useCallback(
    (order: OrderRowModel): PendingFundsEntry | null => {
      const matchesPrice = (p: PendingFundsEntry) =>
        p.useLimitPrice && p.limitPrice ? +p.limitPrice === +order.price : false;
      return (
        pendingAddFunds.find(matchesPrice) ??
        pendingReduceFunds.find(matchesPrice) ??
        null
      );
    },
    [pendingAddFunds, pendingReduceFunds]
  );

  // Mirrors legacy `shouldHaveCancel`: only real (non-projected) open DCA /
  // add-funds / reduce-funds orders are cancellable. Grid orders use a
  // different cancellation path and are excluded.
  const isOrderCancellable = useCallback(
    (order: OrderRowModel): boolean => {
      if (order.__smart) return false;
      if (botType === 'Grid') return false;
      if (order.status !== 'pending' && order.status !== 'partial') return false;
      return order.typeOrder === 'dealRegular' || !!order.reduceFundsId;
    },
    [botType]
  );

  const handleConfirmCancel = async () => {
    const order = cancelTarget;
    setCancelTarget(null);
    if (!order) return;

    const pending = findPendingFundsForOrder(order);
    try {
      if (pending) {
        await cancelPendingOrder({ dealId, botId, orderId: pending.id });
      } else {
        await cancelTerminalOrder({
          dealId,
          botId,
          orderId: order.clientOrderId,
        });
      }
      // The order store only ever merges fetched orders — it never drops one
      // the backend stops returning. Remove it locally so a canceled order
      // disappears immediately instead of lingering (the V2 "still shows" bug).
      useOrderStore.getState().removeOrder(botId, order.clientOrderId, 'new');
      toast.success('Order canceled');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to cancel order'
      );
    }
  };

  // Table columns. Cells close over the cancel handlers directly; the card
  // renderer reads them from OrderCardContext instead (see OrderCard).
  const columns = useMemo<ColumnDef<OrderRowModel>[]>(
    () => [
      {
        id: 'order',
        header: 'ORDER',
        enableSorting: false,
        cell: ({ row }) => {
          const order = row.original;
          const isBuy = order.type === 'buy';
          const isSmart = !!order.__smart;
          return (
            <div className="flex items-center gap-sm min-w-0">
              <div
                className={cn(
                  'p-xs rounded-lg shrink-0',
                  isSmart
                    ? 'bg-muted text-muted-foreground'
                    : isBuy
                    ? 'bg-success/10 text-success'
                    : 'bg-destructive/10 text-destructive'
                )}
              >
                {isSmart ? (
                  <Sparkles className="w-4 h-4" />
                ) : isBuy ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
              </div>
              <span className="text-sm font-medium truncate">
                {order.orderType || 'LIMIT'}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'STATUS',
        enableSorting: true,
        cell: ({ row }) => {
          const order = row.original;
          return <StatusBadge status={order.__smart ? 'new' : order.status} />;
        },
      },
      {
        accessorKey: 'price',
        header: 'PRICE',
        enableSorting: true,
        sortingFn: 'basic',
        cell: ({ getValue }) => (
          <span className="text-sm tabular-nums">
            {formatPriceWithPrecision(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'AMOUNT',
        enableSorting: true,
        sortingFn: 'basic',
        cell: ({ getValue }) => (
          <span className="text-sm tabular-nums">
            {(getValue() as number).toFixed(6)}
          </span>
        ),
      },
      {
        id: 'filled',
        header: 'FILLED',
        enableSorting: false,
        cell: ({ row }) => {
          const order = row.original;
          const pct =
            order.amount > 0 ? (order.filled / order.amount) * 100 : 0;
          return (
            <span className="text-sm tabular-nums text-muted-foreground">
              {pct.toFixed(0)}%
            </span>
          );
        },
      },
      {
        accessorKey: 'total',
        header: 'TOTAL',
        enableSorting: true,
        sortingFn: 'basic',
        cell: ({ getValue }) => (
          <span className="text-sm font-medium tabular-nums">
            {formatCurrency(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: 'createTime',
        header: 'TIME',
        enableSorting: true,
        sortingFn: 'basic',
        cell: ({ getValue }) => {
          const raw = getValue() as string | number | undefined;
          if (!raw) return null;
          const date = new Date(raw);
          return (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {date.toLocaleString()}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const order = row.original;
          if (!isOrderCancellable(order)) return null;
          return (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isCanceling}
              title="Cancel order"
              onClick={() => setCancelTarget(order)}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          );
        },
      },
    ],
    [isOrderCancellable, isCanceling]
  );

  const cardContext = useMemo<OrderCardContextValue>(
    () => ({
      isCancellable: isOrderCancellable,
      requestCancel: setCancelTarget,
      isCanceling,
    }),
    [isOrderCancellable, isCanceling]
  );

  if (isLoading) {
    return (
      <Card className="p-lg">
        <div className="flex items-center gap-xs mb-4">
          <ShoppingCart className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Orders</h3>
        </div>
        <div className="text-center text-muted-foreground py-8">
          Loading orders...
        </div>
      </Card>
    );
  }

  if (totalOrders === 0) {
    return (
      <Card className="p-lg">
        <div className="flex items-center gap-xs mb-4">
          <ShoppingCart className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Orders</h3>
        </div>
        <div className="text-center text-muted-foreground py-8">
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No orders found for this deal</p>
        </div>
      </Card>
    );
  }

  const dataTableCommonProps = {
    columns,
    enableCardView: true as const,
    defaultView: 'table' as const,
    cardComponent: OrderCard,
    cardViewBreakpoints: { default: 1 },
    enableUrlSync: false as const,
    enableGlobalFilter: true as const,
    enableColumnFilters: false as const,
    enableColumnReordering: false as const,
    enableColumnVisibility: false as const,
    enableSorting: true as const,
    showPagination: true as const,
    initialPageSize: 10,
  };

  return (
    <Card className="p-lg">
      <div className="flex items-center gap-xs mb-md">
        <ShoppingCart className="w-5 h-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Orders</h3>
      </div>

      <OrderCardContext.Provider value={cardContext}>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'pending' | 'completed')}
        >
          <TabsList className="grid w-full grid-cols-2 mb-md">
            <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <DataTable
              tableId="deal-orders-pending"
              data={pendingData}
              emptyMessage="No pending orders for this deal."
              {...dataTableCommonProps}
            />
          </TabsContent>

          <TabsContent value="completed">
            <DataTable
              tableId="deal-orders-completed"
              data={completedData}
              emptyMessage="No completed orders for this deal."
              {...dataTableCommonProps}
            />
          </TabsContent>
        </Tabs>
      </OrderCardContext.Provider>

      <ConfirmationDialog
        open={!!cancelTarget}
        onOpenChange={(isOpen) => !isOpen && setCancelTarget(null)}
        title="Cancel order"
        description={
          cancelTarget
            ? `Cancel this ${
                cancelTarget.type === 'buy' ? 'buy' : 'sell'
              } order for ${cancelTarget.amount.toFixed(
                6
              )} @ ${formatPriceWithPrecision(
                cancelTarget.price
              )}? This action cannot be undone.`
            : ''
        }
        confirmText="Cancel order"
        cancelText="Keep order"
        variant="destructive"
        onConfirm={handleConfirmCancel}
      />
    </Card>
  );
};
