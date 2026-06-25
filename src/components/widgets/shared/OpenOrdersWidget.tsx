/* eslint-disable @typescript-eslint/no-explicit-any */
// Usage: shared trades/deals table used by the Trading page Trades tab,
// the Trading dashboard Open Orders widget wrapper, and the Trading Terminal panel.
// Not used in the bot drawer (see DrawerDealsTable for drawer deals UI).
import InlineNoteCell from '@/components/ui/InlineNoteCell';
import {
  AdjustFundsDialog,
  CloseOptionsDialog,
  type AdjustFundsDialogMode,
} from '@/features/bots/shared/runtime';
import { useMergeSmartOrders } from '@/features/bots/widgets/BotForm/hooks/useMergeSmartOrders';
import getLatestPrices from '@/helper/price';
import {
  useAdjustFunds,
  useDealActions,
  useMoveDealToTerminal,
} from '@/hooks/useDealActions';
import { fetchDealOrders } from '@/hooks/useDealOrders';
import { useSetDealNote } from '@/hooks/useSetDealNote';
import { tpSLConfig } from '@/utils/bots/dca/tpSlConfig';
/* import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery } from '@/lib/api'; */
import { createSharedDealBulkActions } from '@/components/deals/actions/createSharedDealBulkActions';
import { DealEditDrawer } from '@/components/deals/DealEditDrawer';
import { TradeDetailDrawer } from '@/components/trades/TradeDetailDrawer';
import { useDcaDeals } from '@/hooks/useDcaDeals';
import { toast } from '@/lib/toast';
import { formatTradingPair } from '@/lib/utils';
import {
  calculateDealCost,
  calculateDealSize,
  calculateDealValue,
  calculatePnlPercentage,
  calculatePnlPercentageNullable,
  isLongStrategy,
  isMetricUnavailable,
  toSortableMetricValue,
} from '@/lib/utils/tradingMetrics';
import { useTableCustomState } from '@/stores/tablePreferencesStore';
import { useTradeJournalStore } from '@/stores/tradeJournalStore';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  DCADealStatusEnum,
  type AddFundsSettings,
  type DCADeals,
  type GetLatestPricesResult,
  type Prices,
} from '@/types';
import type { TransformedTrade } from '@/types/dcaDeal';
import { buildBotViewRoute } from '@/utils/bots/navigation';
import { formatNumber } from '@/utils/numberFormatter';
import { extractPairAssets } from '@/utils/pairs';
import { calculateExecutionsSummary } from '@/utils/tradeJournalMetrics';
import { type ColumnDef } from '@tanstack/react-table';
import {
  ArrowRightLeft,
  BookOpen,
  Copy,
  Edit,
  ExternalLink,
  MinusCircle,
  MoreHorizontal,
  PlusCircle,
  Receipt,
  X,
  XCircle,
} from 'lucide-react';
import EmptyState from '../../ui/empty-state';
import { Skeleton } from '../../ui/skeleton';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveUpdate } from '../../../contexts/LiveUpdateContext';
import { useChartColors } from '../../../hooks/useChartColors';
import logger from '../../../lib/loggerInstance';
import { TradeCard } from '../../trades/TradeCard';
import { Button } from '../../ui/button';
import {
  BotTypeChip,
  ExchangeChip,
  ProfitAndPerc,
  ProfitLossPercChip,
  StatusChip,
  StrategyChip,
} from '../../ui/chip';
import { ConfirmationDialog } from '../../ui/confirmation-dialog';
import { DataTable, type BulkAction } from '../../ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { DualArcProgressGauge } from '../../ui/DualArcProgressGauge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import CoinPair from './CoinPair';
import { DealOrdersDialog } from './DealOrdersDialog';

// Interface for GraphQL DCA Deal data
export interface DCADeal {
  _id: string;
  dcaBot?: { exchange?: string } | Array<{ exchange?: string }>;
  levels: {
    complete: number;
    all: number;
  };
  status: string;
  currentBalances: {
    base: number;
    quote: number;
  };
  initialBalances: {
    base: number;
    quote: number;
  };
  symbol: {
    symbol: string;
    quoteAsset: string;
    baseAsset: string;
  };
  strategy: string;
  botId: string;
  botName?: string;
  settings: {
    futures: boolean;
    coinm: boolean;
    useTp?: boolean;
    tpPerc?: number;
    multiTp?: Array<{
      percentage: number;
      price?: number;
      pricePercent?: number;
    }>;
    useSl?: boolean;
    slPerc?: number;
    multiSl?: Array<{
      percentage: number;
      price?: number;
      pricePercent?: number;
    }>;
  };
  usage: {
    current: {
      base: number;
      quote: number;
    };
  };
  exchangeUUID: string;
  exchange?: string;
  initialPrice?: number;
  createTime?: string;
  updateTime?: string;
  closeTime?: string;
  lastPrice?: number;
  avgPrice?: number;
  closeTrigger?: string;
  profit?: {
    total?: number;
    totalUsd?: number;
    gridProfit?: number;
    gridProfitUsd?: number;
  };
  stats?: {
    drawdownPercent?: number;
    runUpPercent?: number;
    timeInLoss?: number;
    timeInProfit?: number;
    trackTime?: number;
  };
  sizes?: {
    base?: number;
  };
  transactions?: {
    buy?: number;
    sell?: number;
  };
  trailingMode?: string;
}

// Interface for GraphQL response data structure
export interface GetDCADealsData {
  result: DCADeal[];
}

// Interface for transformed trade data
export interface OpenTrade {
  id: string;
  dealId?: string;
  active: boolean;
  type: 'DCA' | 'Combo' | 'Hedge DCA' | 'Hedge Combo' | 'Grid' | 'Terminal';
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  strategy: string;
  status: string;
  exchange: string;
  exchangeUUID?: string | undefined;
  botId?: string | undefined; // Added to support orders fetching
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
  profit?: {
    total: number;
    totalUsd: number;
    pureBase: number;
    pureQuote: number;
  };
  funding?: {
    total: number;
    totalUsd: number;
    lastTime?: number;
  };
  unrealizedProfit?: number;
  avgPrice?: number;
  levels: {
    complete: number;
    all: number;
  };
  created?: number;
  notes: string;
  pair: string;
  dealType: string;
  side: 'BUY' | 'SELL';
  orders: number;
  entryPrice: number;
  initialPrice?: number | undefined;
  pnl: number;
  cost: number;
  value: number;
  size: number;
  usagePercentage: number;
  createdTime: Date;
  workingTime: string;
  drawdown: number;
  runUp: number;
  timeInLoss: string;
  timeInProfit: string;
  takeProfitConfig: string;
  stopLossConfig: string;
  // Gauge properties
  outerGaugePercent?: number;
  centerText?: string;
  showInnerGauge?: boolean;
  // Exit properties (used in journal integration)
  exitPrice?: number;
  exitTime?: number;
  settings?: {
    futures?: boolean;
  };
  // Additional fields for old dashboard parity
  initialBalances?: {
    base: number;
    quote: number;
  };
  currentBalances?: {
    base: number;
    quote: number;
  };
  closeTrigger?: string;
  closePrice?: number;
  gridProfit?: number;
  gridProfitUsd?: number;
  transactionsBuy?: number;
  transactionsSell?: number;
  transactionsTotal?: number;
  updateTime?: string;
  closeTime?: string;
  trailingMode?: string;
}

// Trade actions component
interface TradeTableActionsProps {
  trade: OpenTrade;
  handleAdjustFundsConfirm: (
    id: string,
    botId: string,
    settings: AddFundsSettings,
    mode: AdjustFundsDialogMode
  ) => void;
  onEdit?: (trade: OpenTrade) => void;
}

const LOG_PREFIX = '[OpenOrdersWidget]';

// ---------------------------------------------------------------------------
// Inline editable note cell – mirrors main-dash processRowUpdate behaviour
// ---------------------------------------------------------------------------

const ACTIVE_DEAL_STATUSES = new Set([
  DCADealStatusEnum.error,
  DCADealStatusEnum.open,
  DCADealStatusEnum.start,
]);

const CANCELED_DEAL_STATUSES = new Set(['canceled', 'cancelled']);

const isCanceledDealStatus = (status?: string | null): boolean =>
  CANCELED_DEAL_STATUSES.has(String(status || '').toLowerCase());

const isActiveDealStatus = (status?: string | null): boolean =>
  ACTIVE_DEAL_STATUSES.has(
    String(status || '').toLowerCase() as DCADealStatusEnum
  );

const isInactiveDealStatus = (status?: string | null): boolean => {
  const normalizedStatus = String(status || '').toLowerCase();
  return (
    normalizedStatus === DCADealStatusEnum.closed ||
    isCanceledDealStatus(normalizedStatus)
  );
};

const isClosedDealStatus = (status?: string | null): boolean => {
  return isInactiveDealStatus(status);
};

const mapOpenTradeTypeToBotType = (
  type: string,
  botTypeOverride?: OpenTrade['type']
): BotTypesEnum => {
  const t = botTypeOverride || type;
  switch (t) {
    case 'DCA':
    case 'dca':
      return BotTypesEnum.dca;
    case 'Combo':
    case 'combo':
      return BotTypesEnum.combo;
    case 'Hedge DCA':
    case 'hedgeDca':
      return BotTypesEnum.hedgeDca;
    case 'Hedge Combo':
    case 'hedgeCombo':
      return BotTypesEnum.hedgeCombo;
    case 'Grid':
    case 'grid':
      return BotTypesEnum.grid;
    case 'Terminal':
    case 'terminal':
      return BotTypesEnum.terminal;
    default:
      return BotTypesEnum.dca;
  }
};

const MOVE_TO_TERMINAL_WARNING =
  'After moving deals to terminal, the bot may immediately start new deals if slots are available (especially with ASAP start conditions). To avoid this, adjust max open deals or max deals per pair before confirming.';

const TradeTableActions: React.FC<TradeTableActionsProps> = ({
  trade,
  handleAdjustFundsConfirm: _handleAdjustFundsConfirm,
  onEdit,
}) => {
  const addToJournal = useTradeJournalStore((state) => state.addTrade);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [adjustFundsDialog, setAdjustFundsDialog] =
    useState<AdjustFundsDialogMode | null>(null);
  const moveDealToTerminalMutation = useMoveDealToTerminal();

  const canShowMoveToTerminal =
    trade.type === 'DCA' &&
    typeof trade.botId === 'string' &&
    trade.botId.length > 0;

  const canMoveToTerminal =
    canShowMoveToTerminal &&
    String(trade.status || '').toLowerCase() === DCADealStatusEnum.open;

  const handleAddToJournal = async () => {
    try {
      const entryTime = trade.createdTime?.getTime() || Date.now();

      // Determine if trade is open (no valid exit data)
      const isOpenTrade =
        !trade.exitTime ||
        !trade.exitPrice ||
        trade.exitPrice === 0 ||
        !isFinite(trade.exitPrice);

      // Check if this is a cancelled trade (should not have exit time)
      const isCancelledTrade = isCanceledDealStatus(trade.status);
      const tradeOrders =
        trade.botId && trade.id
          ? await fetchDealOrders(trade.botId, trade.id, BotTypesEnum.dca)
          : [];
      // Filter orders for this specific deal and only FILLED orders
      const dealOrders = tradeOrders.filter(
        (order) =>
          order.dealId === (trade.dealId || trade.id) &&
          order.status === 'FILLED'
      );

      // Transform orders into executions
      const executions = dealOrders.map((order) => ({
        id: order.clientOrderId,
        action: (order.side === 'BUY' ? 'buy' : 'sell') as 'buy' | 'sell',
        timestamp:
          order.updateTime || order.time || order.transactTime || Date.now(),
        quantity: Number(order.executedQty || order.origQty || 0),
        price: Number(order.price || 0),
        fee: 0, // Fee information not available in OrderData, would need Transaction data
        cost:
          Number(order.executedQty || order.origQty || 0) *
          Number(order.price || 0),
      }));

      // Create journal entry from terminal trade
      // Calculate proper ROI from profit data
      const profitUsd = trade.profit?.totalUsd || 0;
      const initialInvestment = trade.cost || 0;
      const calculatedROI =
        initialInvestment > 0 ? (profitUsd / initialInvestment) * 100 : 0;

      // Only include exitTime/exitPrice/exitReason if the trade is closed and not cancelled
      const journalEntry: any = {
        symbol: trade.symbol,
        exchange: trade.exchange,
        direction: (trade.side === 'BUY' ? 'long' : 'short') as
          | 'long'
          | 'short',
        entryPrice: trade.entryPrice || trade.avgPrice || 0,
        entryTime: entryTime,
        amount: trade.size || 0,
        pnl: profitUsd,
        roi: calculatedROI,
        marketType: (trade.settings?.futures ? 'futures' : 'spot') as
          | 'spot'
          | 'futures',
        notes: `Terminal trade from ${trade.type} bot${trade.botName ? ` (${trade.botName})` : ''}${isOpenTrade ? ' (Open - Unrealized PNL)' : ''}${isCancelledTrade ? ' (Cancelled)' : ''}`,
        executions: executions.length > 0 ? executions : undefined,
      };

      // Only include exit data if trade is closed, not cancelled, and has valid exit data
      if (
        !isOpenTrade &&
        !isCancelledTrade &&
        trade.exitPrice &&
        trade.exitTime
      ) {
        journalEntry.exitPrice = trade.exitPrice;
        journalEntry.exitTime = trade.exitTime;
        journalEntry.exitReason = 'manual' as const;
      }

      const journalId = addToJournal(journalEntry);
      logger.info(`${LOG_PREFIX}: Added trade to journal`, {
        tradeId: trade.id,
        journalId,
        symbol: trade.symbol,
        executionsCount: executions.length,
      });
      toast.success(
        `Trade ${trade.symbol} added to journal with ${executions.length} execution(s)`
      );
    } catch (error) {
      logger.error(`${LOG_PREFIX}: Failed to add trade to journal`, {
        error,
        tradeId: trade.id,
      });
      toast.error('Failed to add trade to journal');
    }
  };

  const handleAddFunds = () => {
    setAdjustFundsDialog('add');
  };

  const handleReduceFunds = () => {
    setAdjustFundsDialog('reduce');
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(trade);
    } else {
      logger.info(`${LOG_PREFIX}: Edit trade`, { tradeId: trade.id });
      toast.info(`Edit functionality for ${trade.symbol} (Coming soon)`);
    }
  };

  const handleCancelClick = () => {
    setCancelDialogOpen(true);
  };

  const closeDealMutation = useDealActions();

  const handleCancelConfirm = async () => {
    if (!trade.botId) {
      logger.error(`${LOG_PREFIX}: Cannot close trade - missing botId`, {
        tradeId: trade.id,
      });
      toast.error('Cannot cancel deal - missing bot ID');
      return;
    }

    try {
      if (trade.type === 'Combo' || trade.type === 'Hedge Combo') {
        await closeDealMutation.closeComboDeal({
          dealId: trade.id,
          botId: trade.botId,
          type: CloseDCATypeEnum.cancel,
        });
      } else {
        await closeDealMutation.closeDCADeal({
          dealId: trade.id,
          botId: trade.botId,
          type: CloseDCATypeEnum.cancel,
        });
      }
      toast.success('Deal canceled successfully');
      setCancelDialogOpen(false);
    } catch (error) {
      logger.error(`${LOG_PREFIX}: Failed to cancel deal`, {
        error,
        dealId: trade.id,
        botId: trade.botId,
      });
      toast.error('Failed to cancel deal');
      setCancelDialogOpen(false);
    }
  };

  const handleCloseClick = () => {
    setCloseDialogOpen(true);
  };

  const handleCloseConfirm = async (type: CloseDCATypeEnum) => {
    if (!trade.botId) {
      logger.error(`${LOG_PREFIX}: Cannot close trade - missing botId`, {
        tradeId: trade.id,
      });
      toast.error('Cannot close deal - missing bot ID');
      return;
    }

    try {
      if (trade.type === 'Combo' || trade.type === 'Hedge Combo') {
        await closeDealMutation.closeComboDeal({
          dealId: trade.id,
          botId: trade.botId,
          type,
        });
      } else {
        await closeDealMutation.closeDCADeal({
          dealId: trade.id,
          botId: trade.botId,
          type,
        });
      }
      toast.success('Deal closed successfully');
      setCloseDialogOpen(false);
    } catch (error) {
      logger.error(`${LOG_PREFIX}: Failed to close deal`, {
        error,
        dealId: trade.id,
        botId: trade.botId,
      });
      toast.error('Failed to close deal');
      setCloseDialogOpen(false);
    }
  };

  const handleMoveToTerminalConfirm = useCallback(async () => {
    if (!canShowMoveToTerminal || !trade.botId) {
      toast.error('Only DCA bot deals can be moved to terminal');
      return;
    }

    try {
      const response = await moveDealToTerminalMutation.mutateAsync({
        dealId: trade.id,
        botId: trade.botId,
        combo: false,
      });

      toast.success(
        typeof response.data === 'string'
          ? response.data
          : 'Deal moved to terminal successfully'
      );
    } catch (error) {
      logger.error(`${LOG_PREFIX}: Failed to move deal to terminal`, {
        error,
        dealId: trade.id,
        botId: trade.botId,
      });
      toast.error('Failed to move deal to terminal');
    } finally {
      setMoveDialogOpen(false);
    }
  }, [
    canShowMoveToTerminal,
    moveDealToTerminalMutation,
    trade.botId,
    trade.id,
  ]);

  const handleAdjustFundsConfirm = useCallback(
    (settings: AddFundsSettings) => {
      if (!adjustFundsDialog) {
        return;
      }
      _handleAdjustFundsConfirm(
        trade.id,
        trade.botId || '',
        settings,
        adjustFundsDialog
      );
      setAdjustFundsDialog(null);
    },
    [_handleAdjustFundsConfirm, trade.id, trade.botId, adjustFundsDialog]
  );

  return (
    <>
      <AdjustFundsDialog
        open={!!adjustFundsDialog}
        mode={adjustFundsDialog || 'add'}
        onOpenChange={() => setAdjustFundsDialog(null)}
        onConfirm={handleAdjustFundsConfirm}
        baseAsset={trade.baseAsset}
        quoteAsset={trade.quoteAsset}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 z-50">
          <DropdownMenuItem onClick={handleAddToJournal}>
            <BookOpen className="w-4 h-4 mr-2" />
            Add to Journal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAddFunds}>
            <PlusCircle className="w-4 h-4 mr-2" />
            Add Funds
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleReduceFunds}>
            <MinusCircle className="w-4 h-4 mr-2" />
            Reduce Funds
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleEdit}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </DropdownMenuItem>
          {canShowMoveToTerminal && (
            <DropdownMenuItem
              onClick={() => setMoveDialogOpen(true)}
              disabled={!canMoveToTerminal}
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Move to Terminal (beta)
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleCancelClick}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleCloseClick}
            className="text-destructive"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
        <ConfirmationDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          title="Cancel Trade"
          description={`Are you sure you want to cancel the trade for ${trade.symbol}? This action cannot be undone.`}
          confirmText="Cancel Trade"
          cancelText="Keep Trade"
          variant="destructive"
          onConfirm={handleCancelConfirm}
        />
        <CloseOptionsDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          onConfirm={handleCloseConfirm}
          defaultCloseType={CloseDCATypeEnum.closeByMarket}
          ignoreOptions={[CloseDCATypeEnum.leave]}
          mode="deal"
        />
        <ConfirmationDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          title="Move deal to terminal"
          description={`Are you sure you want to move the deal (${trade.id}) to the terminal? ${MOVE_TO_TERMINAL_WARNING}`}
          confirmText="Confirm"
          cancelText="Cancel"
          onConfirm={handleMoveToTerminalConfirm}
        />
        {/* <ConfirmationDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        title="Close Trade"
        description={`Are you sure you want to close the trade for ${trade.symbol}? This will close all open positions and cannot be undone.`}
        confirmText="Close Trade"
        cancelText="Keep Open"
        variant="destructive"
        onConfirm={handleCloseConfirm}
      /> */}
      </DropdownMenu>
    </>
  );
};

export interface OpenTradesWidgetProps {
  // Widget-specific props
  widgetId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  data?: Record<string, unknown>;
  settings?: Record<string, unknown>;

  // Filtering props
  showClosedTrades?: boolean;
  enableStatusToggle?: boolean;
  defaultStatusFilter?: 'open' | 'closed';
  filteredExchanges?: string[];
  filteredBotTypes?: string[];
  filteredStrategies?: string[];

  // Display props
  title?: string;
  emptyMessage?: string;
  /** Rich empty-state node; takes precedence over `emptyMessage`. */
  emptyContent?: React.ReactNode;
  enableCardView?: boolean;
  privacyMode?: boolean;
  // Terminal specific display tweaks
  hideBotName?: boolean; // If true, do not show the Bot Name column (useful for terminal page)
  botTypeOverride?: OpenTrade['type']; // Force the displayed Type column to this value (e.g., 'Terminal')

  // Callback props
  onTradeClick?: (trade: OpenTrade) => void;
  /** Fired when the open/closed segmented toggle changes (and once on mount
   *  with the initial/persisted value). Lets the parent drive its deal fetch
   *  by status, since the toggle state lives in this widget but the data is
   *  fetched by the page. Only meaningful with `enableStatusToggle`. */
  onStatusFilterChange?: (status: 'open' | 'closed') => void;
  onRefresh?: () => void;
  bulkActions?: BulkAction<OpenTrade>[]; // Allow parent to define bulk actions
  /** Raw DCADeals[] sourced by the parent. The widget uses this as a lookup
   *  pool when opening the deal-detail drawer, so callers whose displayed
   *  trades came from a different fetch (e.g. `useDcaDeals({terminal:false})`
   *  on the Trading Bots /deals tab) don't fall through to the navigate
   *  fallback just because the widget's internal `useDcaDeals({terminal:true})`
   *  doesn't contain those deals. */
  rawDeals?: DCADeals[];
}

const OpenOrdersWidget: React.FC<OpenTradesWidgetProps> = ({
  widgetId = 'open-trades',
  data: _data,
  settings: _settings,
  showClosedTrades: _showClosedTrades = false,
  enableStatusToggle: _enableStatusToggle = false,
  defaultStatusFilter,
  filteredExchanges = [],
  filteredBotTypes = [],
  filteredStrategies = [],
  emptyMessage = 'No trades found',
  emptyContent,
  enableCardView = true,
  privacyMode = false,
  hideBotName = false,
  botTypeOverride,
  onTradeClick,
  onStatusFilterChange,
  bulkActions,
  rawDeals,
}) => {
  const navigate = useNavigate();
  const colors = useChartColors();

  // Stable refs for TradeCardWrapper closure values — updated every render so
  // the memoised component always reads the latest values without needing to
  // recreate its function reference (which would cause full card remounts).
  const onTradeClickRef = useRef(onTradeClick);
  onTradeClickRef.current = onTradeClick;
  const privacyModeRef = useRef(privacyMode);
  privacyModeRef.current = privacyMode;
  const botTypeOverrideRef = useRef(botTypeOverride);
  botTypeOverrideRef.current = botTypeOverride;

  const handleEditRef = useRef<(trade: any) => void>(() => undefined);

  const getBotTypeForChipRef = useRef<(type: string) => BotTypesEnum>(
    () => BotTypesEnum.dca
  );

  const handleAdjustFundsConfirmRef = useRef<
    (id: string, botId: string, settings: any, mode: any) => void
  >(() => undefined);

  const showClosedTrades = useMemo(
    () => _showClosedTrades,
    [_showClosedTrades]
  );
  // Persist the Open/Closed segment toggle alongside the table's other prefs
  // (under the same tableId the DataTable uses below) so it survives reloads.
  const [statusFilter, setStatusFilter] = useTableCustomState<
    'open' | 'closed'
  >(
    `${widgetId}-trades`,
    'statusFilter',
    defaultStatusFilter ?? (showClosedTrades ? 'closed' : 'open')
  );
  const enableStatusToggle = useMemo(
    () => _enableStatusToggle,
    [_enableStatusToggle]
  );
  const effectiveShowClosedTrades = useMemo(
    () => (enableStatusToggle ? statusFilter === 'closed' : showClosedTrades),
    [enableStatusToggle, statusFilter, showClosedTrades]
  );

  // Report the toggle value up so the parent can fetch the matching status.
  // Fires on mount (syncing the persisted value) and on every change. Kept in
  // a ref so changing the callback identity doesn't re-fire it.
  const onStatusFilterChangeRef = useRef(onStatusFilterChange);
  onStatusFilterChangeRef.current = onStatusFilterChange;
  useEffect(() => {
    if (!enableStatusToggle) return;
    onStatusFilterChangeRef.current?.(statusFilter);
  }, [enableStatusToggle, statusFilter]);

  // State for orders dialog
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<{
    dealId: string;
    botId: string;
    symbol: string;
    exchange: string;
  } | null>(null);

  // Get live order data from the live update context
  const { orderSelectors } = useLiveUpdate();
  // Memoize liveOrders so that transformDCADealToOpenTrade (which lists liveOrders
  // as a dependency) is not recreated on every render. Without this, any parent
  // re-render (e.g. from latestPrices updates) would cascade through baseTrades →
  // trades → DataTable → all cards re-render unnecessarily.
  const liveOrdersData = orderSelectors.getAllOrders();
  const liveOrders = useMemo(
    () =>
      Object.values(liveOrdersData)
        .flat()
        .filter((order) => {
          // Filter out orders with missing required fields
          // OrderData has 'time' and 'transactTime' fields, not 'timestamp'
          const hasTimestamp = !!(order?.time || order?.transactTime);
          const hasId = !!(order?.id || order?.clientOrderId);

          // Only show orders with NEW, PARTIALLY_FILLED, or PENDING status
          // FILLED orders should not appear as open trades
          const isOpenStatus =
            order?.status &&
            ['NEW', 'PARTIALLY_FILLED', 'PENDING', 'PENDING_CANCEL'].includes(
              order.status
            );

          if (!hasId || !hasTimestamp) {
            // Silently skip - these warnings flood the console for completed orders
            return false;
          }

          if (!isOpenStatus) {
            // Filter out filled/canceled orders
            return false;
          }

          return true;
        }),

    [liveOrdersData]
  );

  const [latestPrices, setLatestPrices] = useState<Prices>([]);

  useEffect(() => {
    const unsubscribe = getLatestPrices((result: GetLatestPricesResult) => {
      if (result.status === 'OK' && result.data) {
        setLatestPrices(result.data);
      } else {
        logger.error(`${LOG_PREFIX}: Price fetch failed`, {
          reason: result.reason,
        });
      }
    }, false);

    return () => unsubscribe();
  }, []);

  const getMarketPrice = useCallback(
    (symbol: string, exchange?: string) => {
      if (!symbol || !latestPrices.length) return undefined;
      const normalizedExchange = exchange?.toLowerCase();

      const byExchange = latestPrices.find(
        (price) =>
          price.symbol === symbol &&
          (normalizedExchange
            ? [normalizedExchange, 'all'].includes(
                String(price.exchange).toLowerCase()
              )
            : true)
      )?.price;

      if (byExchange) return byExchange;

      return latestPrices.find((price) => price.symbol === symbol)?.price;
    },
    [latestPrices]
  );

  // Unrealized/net P&L are computed from the live-prices feed. Until it
  // arrives the values fall back to a stale/zero number, so gate the
  // price-dependent cells on a skeleton (legacy parity with main-dash's
  // per-row `loadedPrices`).
  const pricesLoading = latestPrices.length === 0;

  // Helper function to determine gauge color based on percentage
  const getGaugeColor = useCallback(
    (percentage: number): string => {
      const roundedPercentage = Math.round(percentage);
      if (roundedPercentage >= 100) return colors.destructive; // Error color for 100%
      if (roundedPercentage > 80) return colors.warning; // Caution color for >80%
      return colors.success; // Default success color
    },
    [colors.destructive, colors.warning, colors.success]
  );

  // Check if external trade data is provided
  const externalTrades = _data?.['trades'] as OpenTrade[] | undefined;
  const useExternalData = Array.isArray(externalTrades);

  // Fetch DCA deals data using GraphQL only if no external data is provided.
  // The fetch must follow the open/closed toggle even when enableStatusToggle
  // is on: the backend defaults to open-only when no status is sent, so
  // requesting `undefined` left the Closed view permanently empty.
  const inputOptions = useMemo(
    () => ({
      terminal: true,
      status: effectiveShowClosedTrades
        ? DCADealStatusEnum.closed
        : DCADealStatusEnum.open,
    }),
    [effectiveShowClosedTrades]
  );
  const {
    deals: dcaDealsResponse,
    isLoading: graphqlLoading,
    error: graphqlError,
  } = useDcaDeals(inputOptions);
  const activeDealsRaw = useMemo(() => {
    // Merge internally-fetched deals with caller-supplied rawDeals (de-duped
    // by _id) so the deal-drawer find covers both sources. Without this the
    // Trading Bots /deals tab loses its drawer because its deals come from
    // `useDcaDeals({terminal:false})` while the widget fetches `terminal:true`.
    const seen = new Set<string>();
    const merged: DCADeals[] = [];
    const push = (d: DCADeals | undefined) => {
      if (!d || !d._id || seen.has(d._id)) return;
      seen.add(d._id);
      merged.push(d);
    };
    dcaDealsResponse.forEach(push);
    rawDeals?.forEach(push);
    return merged.filter((d) => isActiveDealStatus(d.status));
  }, [dcaDealsResponse, rawDeals]);

  // Broader pool for the drawer-open lookup that doesn't gate on active
  // status, so closed deals can also be opened in the drawer when the parent
  // explicitly handed us their raw deals.
  const allKnownDeals = useMemo(() => {
    const seen = new Set<string>();
    const merged: DCADeals[] = [];
    const push = (d: DCADeals | undefined) => {
      if (!d || !d._id || seen.has(d._id)) return;
      seen.add(d._id);
      merged.push(d);
    };
    dcaDealsResponse.forEach(push);
    rawDeals?.forEach(push);
    return merged;
  }, [dcaDealsResponse, rawDeals]);
  const [openDetailDrawerTrade, setOpenDetailDrawerTrade] = useState<
    DCADeals[] | null
  >(null);

  // Read-only "Trade Details" drawer (separate from the editable
  // DealEditDrawer that openDetailDrawerTrade above feeds). Card body click
  // and the row's "View Details" menu open this one; the row's "Edit" menu
  // opens the editable one.
  const [openDetailsTrade, setOpenDetailsTrade] = useState<OpenTrade | null>(
    null
  );
  const openDetailsRef = useRef<(trade: OpenTrade) => void>(() => undefined);
  openDetailsRef.current = setOpenDetailsTrade;

  const handleCloseEditDrawer = useCallback(() => {
    setOpenDetailDrawerTrade(null);
  }, []);
  const showEditDrawer = useMemo(
    () => openDetailDrawerTrade !== null,
    [openDetailDrawerTrade]
  );

  const openEditInBotDrawer = useCallback(
    (trade: TransformedTrade) => {
      if (!trade.botId) {
        toast.error('Bot details are unavailable for this deal');
        return;
      }

      const botTypeForRoute = mapOpenTradeTypeToBotType(
        trade.type,
        botTypeOverride
      );
      const route = buildBotViewRoute(botTypeForRoute, trade.botId);
      const query = new URLSearchParams({
        tab: 'deals',
        editDealId: trade.id,
        chartDealId: trade.id,
      });

      navigate(`${route}?${query.toString()}`);
    },
    [botTypeOverride, navigate]
  );

  const handleEdit = useCallback(
    (trade: TransformedTrade) => {
      const dealId =
        (trade as TransformedTrade & { dealId?: string }).dealId || trade.id;
      // Try active first, then fall back to the broader pool that includes
      // closed/inactive deals from rawDeals — the drawer can render either.
      const find =
        activeDealsRaw.find((d) => d._id === dealId) ||
        allKnownDeals.find((d) => d._id === dealId);
      if (find) {
        setOpenDetailDrawerTrade([find]);
        return;
      }

      openEditInBotDrawer(trade);
    },
    [activeDealsRaw, allKnownDeals, openEditInBotDrawer]
  );
  handleEditRef.current = handleEdit;
  /*   const graphQueryKey = enableStatusToggle ? 'dcaDealList' : 'getDCADeals';
  const graphQuery = enableStatusToggle
    ? GraphQlQuery.dcaDealList({
        terminal: true,
        status: effectiveShowClosedTrades
          ? DCADealStatusEnum.closed
          : DCADealStatusEnum.open,
      })
    : GraphQlQuery.getDCADeals({ terminal: true });

  const {
    data: dcaDealsResponse,
    isLoading: graphqlLoading,
    error: graphqlError,
  } = useGraphQL<GetDCADealsData>(graphQueryKey, graphQuery); */

  const isLoading = useExternalData ? false : graphqlLoading;
  const error = useExternalData ? null : graphqlError;

  // Log GraphQL errors for debugging
  useEffect(() => {
    if (graphqlError) {
      logger.error(
        '[OpenOrdersWidget] GraphQL query error - falling back to live orders only:',
        {
          error: graphqlError,
          message:
            graphqlError instanceof Error
              ? graphqlError.message
              : String(graphqlError),
        }
      );
    }
  }, [graphqlError]);

  // Transform GraphQL data to match OpenTrade interface
  const transformDCADealToOpenTrade = useCallback(
    (deal: DCADeals): OpenTrade => {
      const dcaBot = Array.isArray(deal.dcaBot) ? deal.dcaBot[0] : deal.dcaBot;
      const resolvedExchange = dcaBot?.exchange || deal.exchange || 'Unknown';
      logger.info('Raw DCA Deal Data:', {
        botId: deal.botId,
        exchangeUUID: deal.exchangeUUID,
        exchange: resolvedExchange,
        symbol: deal.symbol?.symbol,
        status: deal.status,
        isActiveByStatus: isActiveDealStatus(deal.status),
      });

      const exchange = resolvedExchange;
      const symbol = deal.symbol.symbol;
      const baseSymbol = symbol.replace(deal.symbol.quoteAsset, '');
      const pair = `${baseSymbol}/${deal.symbol.quoteAsset}`;

      // Use real data from DCA deal
      const initialInvestment = Number(deal.initialBalances.quote || 0);
      const currentBaseAmount = Number(deal.currentBalances.base || 0);
      const currentQuoteAmount = Number(deal.currentBalances.quote || 0);

      const dealOrders = liveOrders.filter(
        (order) =>
          (order as { dealId?: string }).dealId === deal._id &&
          String((order as { status?: string }).status || '').toLowerCase() ===
            'filled'
      );

      const executions = dealOrders.map((order) => {
        const normalizedSide = String(
          (order as { side?: string; type?: string }).side ||
            (order as { side?: string; type?: string }).type ||
            'buy'
        ).toLowerCase();

        const quantity = Number(
          (order as { executedQty?: string; origQty?: string; amount?: number })
            .executedQty ||
            (
              order as {
                executedQty?: string;
                origQty?: string;
                amount?: number;
              }
            ).origQty ||
            (order as { amount?: number }).amount ||
            0
        );
        const price = Number((order as { price?: number | string }).price || 0);

        return {
          id: String((order as { clientOrderId?: string }).clientOrderId || ''),
          action: (normalizedSide === 'sell' ? 'sell' : 'buy') as
            | 'buy'
            | 'sell',
          timestamp:
            (order as { updateTime?: number }).updateTime ||
            (order as { time?: number }).time ||
            Date.now(),
          quantity,
          price,
          fee: 0,
          cost: quantity * price,
        };
      });

      const executionSummary = executions.length
        ? calculateExecutionsSummary(executions)
        : null;

      // Use initialPrice if available, otherwise calculate average entry price
      const deployedCapital = initialInvestment - currentQuoteAmount;
      const fallbackEntryPrice =
        currentBaseAmount > 0 && deployedCapital > 0
          ? deployedCapital / currentBaseAmount
          : 0;
      const entryPrice =
        executionSummary?.averageEntryPrice ??
        (deal.initialPrice ? Number(deal.initialPrice) : fallbackEntryPrice);

      const currentMarketPrice = getMarketPrice(symbol, exchange);
      const hasMarketPrice = Number.isFinite(currentMarketPrice);

      // Strategy-aware calculations matching legacy (terminal/utils.ts)
      const isLong = isLongStrategy(deal.strategy);
      const isFutures = Boolean(deal.settings?.futures);
      const isCoinm = Boolean(deal.settings?.coinm);
      const avgPriceNum = Number(deal.avgPrice || entryPrice || 0);

      const metricsInput = {
        strategy: deal.strategy,
        status: deal.status,
        avgPrice: avgPriceNum,
        usage: {
          current: {
            base: Number(deal.usage?.current?.base || 0),
            quote: Number(deal.usage?.current?.quote || 0),
          },
        },
        currentBalances: deal.currentBalances,
        initialBalances: deal.initialBalances,
        futures: isFutures,
        coinm: isCoinm,
      };

      const cost = calculateDealCost(metricsInput);
      const size = calculateDealSize(metricsInput);
      const value = calculateDealValue(metricsInput);

      // Unrealized PnL: legacy formula
      // LONG:  (currentBase * price + currentQuote - initialQuote)
      // SHORT: (currentQuote - (initialBase - currentBase) * price)
      // Closed/canceled deals have no unrealized P&L (legacy parity with
      // main-dash `isActiveDeal`); only compute it for live deals.
      const unrealizedPnl = !isActiveDealStatus(deal.status)
        ? 0
        : hasMarketPrice
          ? isLong
            ? currentBaseAmount * Number(currentMarketPrice) +
              currentQuoteAmount -
              initialInvestment
            : currentQuoteAmount -
              (Number(deal.initialBalances.base || 0) - currentBaseAmount) *
                Number(currentMarketPrice)
          : undefined;
      const realizedPnl = executionSummary?.realizedPnl ?? 0;
      const usagePercentage = cost > 0 ? (value / cost) * 100 : 0;

      // Use createTime if available, otherwise generate realistic creation time
      let createdTime: Date;
      if (deal.createTime) {
        createdTime = new Date(deal.createTime);
      } else {
        const daysAgo = Math.floor(Math.random() * 30);
        const hoursAgo = Math.floor(Math.random() * 24);
        createdTime = new Date(
          Date.now() - (daysAgo * 24 + hoursAgo) * 60 * 60 * 1000
        );
      }

      // Generate working time based on creation time
      const workingHours = Math.floor(
        (Date.now() - createdTime.getTime()) / (1000 * 60 * 60)
      );
      const workingDays = Math.floor(workingHours / 24);
      const remainingHours = workingHours % 24;
      const workingTime =
        workingDays > 0
          ? `${workingDays}D ${remainingHours}H`
          : `${remainingHours}H`;

      // Convert type to match our interface
      const getBotType = (strategy: string): OpenTrade['type'] => {
        switch (strategy.toLowerCase()) {
          case 'dca':
          case 'long':
          case 'short':
            return 'DCA';
          case 'combo':
            return 'Combo';
          case 'hedge_dca':
            return 'Hedge DCA';
          case 'hedge_combo':
            return 'Hedge Combo';
          case 'grid':
            return 'Grid';
          default:
            return 'DCA';
        }
      };

      const isCombo =
        deal.strategy?.toLowerCase() === 'combo' ||
        deal.strategy?.toLowerCase() === 'hedge_combo';

      return {
        baseAsset: deal.symbol.baseAsset,
        quoteAsset: deal.symbol.quoteAsset,
        active: isActiveDealStatus(deal.status),
        id: deal._id,
        botId: deal.botId, // Add explicit botId
        type: botTypeOverride || getBotType(deal.strategy),
        symbol,
        strategy: deal.strategy,
        status: deal.status,
        exchange,
        exchangeUUID: deal.exchangeUUID,
        botName: deal.botName,
        currentBalance: {
          base: currentBaseAmount,
          quote: currentQuoteAmount,
        },
        usage: {
          current: {
            base: currentBaseAmount,
            quote: currentQuoteAmount,
          },
        },
        profit: {
          total: realizedPnl,
          totalUsd: realizedPnl,
          pureBase: 0,
          pureQuote: 0,
        },
        unrealizedProfit: unrealizedPnl,
        avgPrice: executionSummary?.averageEntryPrice ?? entryPrice,
        levels: deal.levels,
        created: +createdTime,
        notes: deal.note || '',
        pair,
        dealType: deal.settings.futures ? 'FUTURES' : 'SPOT',
        side: deal.strategy === 'LONG' ? 'BUY' : 'SELL',
        orders: deal.levels.complete,
        entryPrice,
        pnl: realizedPnl,
        cost,
        value,
        size,
        usagePercentage,
        createdTime,
        workingTime,
        drawdown: deal.stats?.drawdownPercent
          ? deal.stats.drawdownPercent * 100
          : 0,
        runUp: deal.stats?.runUpPercent ? deal.stats.runUpPercent * 100 : 0,
        timeInLoss:
          deal.stats?.timeInLoss && deal.stats?.trackTime
            ? `${((deal.stats.timeInLoss / deal.stats.trackTime) * 100).toFixed(1)}%`
            : '-',
        timeInProfit:
          deal.stats?.timeInProfit && deal.stats?.trackTime
            ? `${((deal.stats.timeInProfit / deal.stats.trackTime) * 100).toFixed(1)}%`
            : '-',
        takeProfitConfig: deal.settings
          ? tpSLConfig(deal.settings, 'tp', isCombo)
          : '-',
        stopLossConfig: deal.settings
          ? tpSLConfig(deal.settings, 'sl', isCombo)
          : '-',
        // Calculate progress percentage for gauge
        outerGaugePercent:
          deal.levels.all > 0
            ? (deal.levels.complete / deal.levels.all) * 100
            : 0,
        dealId: deal._id,
        // Additional fields for old dashboard parity
        initialBalances: deal.initialBalances,
        currentBalances: deal.currentBalances,
        closeTrigger: deal.closeTrigger,
        closePrice: deal.lastPrice,
        gridProfit: deal.profit?.gridProfit,
        gridProfitUsd: deal.profit?.gridProfitUsd,
        transactionsBuy: deal.transactions?.buy ?? 0,
        transactionsSell: deal.transactions?.sell ?? 0,
        transactionsTotal:
          (deal.transactions?.buy ?? 0) + (deal.transactions?.sell ?? 0),
        updateTime: new Date(deal.updateTime).toLocaleString(),
        // ISO string so the Close Time column re-parses it unambiguously;
        // a locale string gets misparsed by new Date() and swaps day/month.
        closeTime: deal.closeTime
          ? new Date(deal.closeTime).toISOString()
          : undefined,
        trailingMode: deal.trailingMode,
      };
    },
    [botTypeOverride, getMarketPrice, liveOrders]
  );

  // FLICKER DEBUG: track what causes transformDCADealToOpenTrade to be recreated
  // (cascades into baseTrades → trades → DataTable re-render)
  const prevBotTypeOverrideRef = useRef(botTypeOverride);
  const prevGetMarketPriceRef = useRef(getMarketPrice);
  const prevLiveOrdersRef = useRef(liveOrders);
  const prevTransformRef = useRef(transformDCADealToOpenTrade);
  if (prevTransformRef.current !== transformDCADealToOpenTrade) {
    const changed = [];
    if (prevBotTypeOverrideRef.current !== botTypeOverride)
      changed.push('botTypeOverride');
    if (prevGetMarketPriceRef.current !== getMarketPrice)
      changed.push('getMarketPrice');
    if (prevLiveOrdersRef.current !== liveOrders) changed.push('liveOrders');
    logger.debug(
      `[flicker] transformDCADealToOpenTrade recreated. Changed deps: [${changed.join(', ')}]`
    );
    prevBotTypeOverrideRef.current = botTypeOverride;
    prevGetMarketPriceRef.current = getMarketPrice;
    prevLiveOrdersRef.current = liveOrders;
    prevTransformRef.current = transformDCADealToOpenTrade;
  }

  // Transform and filter data
  const baseTrades: OpenTrade[] = useMemo(() => {
    // Use external data if provided
    if (useExternalData && externalTrades) {
      let filteredTrades = externalTrades;

      // Apply filters
      if (filteredExchanges.length > 0) {
        filteredTrades = filteredTrades.filter((trade) =>
          filteredExchanges.includes(trade.exchange)
        );
      }

      if (filteredBotTypes.length > 0) {
        filteredTrades = filteredTrades.filter((trade) =>
          filteredBotTypes.includes(trade.type)
        );
      }

      if (filteredStrategies.length > 0) {
        filteredTrades = filteredTrades.filter((trade) =>
          filteredStrategies.includes(trade.strategy)
        );
      }

      return filteredTrades;
    }

    // Fallback to GraphQL data transformation
    if (isLoading || error || !dcaDealsResponse) {
      // No data available - return empty array
      // Note: Individual orders are not the same as open deals/trades
      return [];
    }

    let transformedTrades = dcaDealsResponse.map(transformDCADealToOpenTrade);

    // Note: We don't add individual live orders here as they are not deals/positions
    // This widget shows open DEALS, not individual orders

    // Apply filters
    if (filteredExchanges.length > 0) {
      transformedTrades = transformedTrades.filter((trade) =>
        filteredExchanges.includes(trade.exchange)
      );
    }

    if (filteredBotTypes.length > 0) {
      transformedTrades = transformedTrades.filter((trade) =>
        filteredBotTypes.includes(trade.type)
      );
    }

    if (filteredStrategies.length > 0) {
      transformedTrades = transformedTrades.filter((trade) =>
        filteredStrategies.includes(trade.strategy)
      );
    }

    // If requested, hide bot name from both table and card views
    if (hideBotName) {
      transformedTrades = transformedTrades.map((t) => ({
        ...t,
        botName: undefined,
      }));
    }

    // Debug: detect any transformed trades that are canceled but still present
    const canceledPresent = transformedTrades.filter((t) =>
      isCanceledDealStatus(t.status)
    );
    if (canceledPresent.length > 0) {
      logger.warn(
        `${LOG_PREFIX}: Found ${canceledPresent.length} canceled deal(s) in transformedTrades`,
        {
          examples: canceledPresent
            .slice(0, 5)
            .map((t) => ({ id: t.id, status: t.status, botId: t.botId })),
        }
      );
    } else {
      logger.debug(
        `${LOG_PREFIX}: No canceled deals in transformedTrades (count=${transformedTrades.length})`
      );
    }

    return transformedTrades;
  }, [
    useExternalData,
    externalTrades,
    dcaDealsResponse,
    isLoading,
    error,
    filteredExchanges,
    filteredBotTypes,
    filteredStrategies,
    hideBotName,
    transformDCADealToOpenTrade,
  ]);

  const trades = useMemo(() => {
    if (!enableStatusToggle) {
      return baseTrades;
    }

    const filtered = baseTrades.filter((trade) => {
      const status = trade.status?.toLowerCase();
      return effectiveShowClosedTrades
        ? isInactiveDealStatus(status)
        : isActiveDealStatus(status);
    });

    // Debug: log any canceled deals that ended up in the Open list
    const canceledInOpen = !effectiveShowClosedTrades
      ? filtered.filter((t) => isCanceledDealStatus(t.status))
      : [];
    if (canceledInOpen.length > 0) {
      logger.error(
        `${LOG_PREFIX}: Canceled deals are present in the Open list! count=${canceledInOpen.length}`,
        {
          examples: canceledInOpen
            .slice(0, 5)
            .map((t) => ({ id: t.id, status: t.status, botId: t.botId })),
        }
      );
    }

    logger.debug(
      `${LOG_PREFIX}: trades memo -> total baseTrades=${baseTrades.length}, filtered=${filtered.length}, effectiveShowClosedTrades=${effectiveShowClosedTrades}`
    );

    return filtered;
  }, [baseTrades, enableStatusToggle, effectiveShowClosedTrades]);

  // FLICKER DEBUG: track what causes baseTrades / trades to change
  const prevBaseTradesRef = useRef(baseTrades);
  const prevTradesRef = useRef(trades);
  useEffect(() => {
    if (prevBaseTradesRef.current !== baseTrades) {
      logger.debug(`[flicker] baseTrades reference changed`, {
        prevLen: prevBaseTradesRef.current.length,
        nextLen: baseTrades.length,
      });
      prevBaseTradesRef.current = baseTrades;
    }
    if (prevTradesRef.current !== trades) {
      logger.debug(`[flicker] trades reference changed`, {
        prevLen: prevTradesRef.current.length,
        nextLen: trades.length,
      });
      prevTradesRef.current = trades;
    }
  });

  // Convert type to match BotTypeChip expectations
  const getBotTypeForChip = useCallback(
    (type: string): BotTypesEnum =>
      mapOpenTradeTypeToBotType(type, botTypeOverride),
    [botTypeOverride]
  );
  getBotTypeForChipRef.current = getBotTypeForChip;

  const { openCount, closedCount } = useMemo(() => {
    let open = 0;
    let closed = 0;

    baseTrades.forEach((trade) => {
      const status = trade.status?.toLowerCase();
      const isClosed = isClosedDealStatus(status);
      if (isClosed) {
        closed += 1;
      } else {
        open += 1;
      }
    });

    return { openCount: open, closedCount: closed };
  }, [baseTrades]);

  // Only the currently-selected status is actually loaded, so only its count is
  // meaningful. Show the number on the selected option and omit it on the other
  // to avoid a misleading "(0)" on the status the widget hasn't fetched.
  const openOptionLabel =
    statusFilter === 'open' ? `Open (${openCount})` : 'Open';
  const closedOptionLabel =
    statusFilter === 'closed' ? `Closed (${closedCount})` : 'Closed';
  const selectedStatusLabel =
    statusFilter === 'open' ? openOptionLabel : closedOptionLabel;

  // Define default bulk actions if none provided
  const addToJournalBulk = useTradeJournalStore((state) => state.addTrade);
  const mergeSmartOrdersMutation = useMergeSmartOrders();

  const [cancelDialogOpen, setCancelDialogOpen] = useState<OpenTrade[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState<OpenTrade[]>([]);
  const [moveBulkDialogOpen, setMoveBulkDialogOpen] = useState<OpenTrade[]>([]);
  const moveDealToTerminalMutation = useMoveDealToTerminal();

  const canMoveTradeToTerminal = useCallback((trade: OpenTrade): boolean => {
    return (
      trade.type === 'DCA' &&
      typeof trade.botId === 'string' &&
      trade.botId.length > 0 &&
      String(trade.status || '').toLowerCase() === DCADealStatusEnum.open
    );
  }, []);

  const defaultBulkActions: BulkAction<OpenTrade>[] = useMemo(
    () =>
      createSharedDealBulkActions<OpenTrade>({
        onMerge: async (selectedTrades) => {
          if (selectedTrades.length < 2) {
            toast.error('Select at least 2 deals to merge');
            return;
          }

          const firstSymbol = selectedTrades[0].symbol;
          const firstExchange = selectedTrades[0].exchange;
          const firstBotId = selectedTrades[0].botId;

          const allSameSymbol = selectedTrades.every(
            (trade) => trade.symbol === firstSymbol
          );

          const allSameExchange = selectedTrades.every(
            (trade) => trade.exchange === firstExchange
          );

          if (!allSameSymbol) {
            toast.error('All selected deals must have the same trading pair');
            return;
          }

          if (!allSameExchange) {
            toast.error('All selected deals must be on the same exchange');
            return;
          }

          if (!firstBotId) {
            toast.error('Cannot merge deals - missing bot ID');
            return;
          }

          logger.info(`${LOG_PREFIX}: Merging deals`, {
            count: selectedTrades.length,
            symbol: firstSymbol,
            exchange: firstExchange,
            dealIds: selectedTrades.map((t) => t.dealId || t.id),
          });

          await mergeSmartOrdersMutation.mutateAsync({
            botId: firstBotId,
            dealIds: selectedTrades.map((t) => t.dealId || t.id),
          });
        },
        onAddToJournal: (selectedTrades) => {
          try {
            const now = Date.now();
            let successCount = 0;

            selectedTrades.forEach((trade) => {
              try {
                const entryTime = trade.createdTime?.getTime() || now;
                const isOpenTrade =
                  !trade.exitTime ||
                  !trade.exitPrice ||
                  trade.exitPrice === 0 ||
                  !isFinite(trade.exitPrice);
                const isCancelledTrade = isCanceledDealStatus(trade.status);
                const profitUsd = trade.profit?.totalUsd || 0;
                const initialInvestment = trade.cost || 0;
                const calculatedROI =
                  initialInvestment > 0
                    ? (profitUsd / initialInvestment) * 100
                    : 0;

                const journalEntry: any = {
                  symbol: trade.symbol,
                  exchange: trade.exchange,
                  direction: (trade.side === 'BUY' ? 'long' : 'short') as
                    | 'long'
                    | 'short',
                  entryPrice: trade.entryPrice || trade.avgPrice || 0,
                  entryTime: entryTime,
                  amount: trade.size || 0,
                  pnl: profitUsd,
                  roi: calculatedROI,
                  marketType: (trade.settings?.futures ? 'futures' : 'spot') as
                    | 'spot'
                    | 'futures',
                  notes: `Terminal trade from ${trade.type} bot${trade.botName ? ` (${trade.botName})` : ''}${isOpenTrade ? ' (Open - Unrealized PNL)' : ''}${isCancelledTrade ? ' (Cancelled)' : ''}`,
                  tags: [trade.type, trade.strategy, 'Terminal'].filter(
                    Boolean
                  ),
                };

                if (
                  !isOpenTrade &&
                  !isCancelledTrade &&
                  trade.exitPrice &&
                  trade.exitTime
                ) {
                  journalEntry.exitPrice = trade.exitPrice;
                  journalEntry.exitTime = trade.exitTime;
                  journalEntry.exitReason = 'manual' as const;
                }

                addToJournalBulk(journalEntry);
                successCount++;
              } catch (error) {
                logger.error(`${LOG_PREFIX}: Failed to add trade to journal`, {
                  error,
                  tradeId: trade.id,
                });
              }
            });

            logger.info(`${LOG_PREFIX}: Bulk add to journal`, {
              total: selectedTrades.length,
              success: successCount,
            });

            if (successCount > 0) {
              toast.success(`Added ${successCount} trade(s) to journal`);
            }
            if (successCount < selectedTrades.length) {
              toast.error(
                `Failed to add ${selectedTrades.length - successCount} trade(s)`
              );
            }
          } catch (error) {
            logger.error(`${LOG_PREFIX}: Bulk add to journal failed`, {
              error,
            });
            toast.error('Failed to add trades to journal');
          }
        },
        onAddFunds: (selectedTrades) => {
          logger.info(`${LOG_PREFIX}: Bulk add funds`, {
            count: selectedTrades.length,
          });
          toast.info(
            `Add funds to ${selectedTrades.length} trade(s) (Coming soon)`
          );
        },
        onReduceFunds: (selectedTrades) => {
          logger.info(`${LOG_PREFIX}: Bulk reduce funds`, {
            count: selectedTrades.length,
          });
          toast.info(
            `Reduce funds from ${selectedTrades.length} trade(s) (Coming soon)`
          );
        },
        onEdit: (selectedTrades) => {
          if (selectedTrades.length === 0) return;
          const trades = selectedTrades.map((t) => t.dealId || t.id);
          const find = allKnownDeals.filter((d) => trades.includes(d._id));
          if (find.length > 0) {
            setOpenDetailDrawerTrade(find);
            logger.info(
              `${LOG_PREFIX}: Bulk edit - opening edit drawer for first trade`,
              {
                tradeId: selectedTrades[0].id,
                totalSelected: selectedTrades.length,
              }
            );
            if (selectedTrades.length > 1) {
              toast.info(
                `Editing first selected deal. Edit deals one at a time.`
              );
            }
          } else {
            logger.info(
              `${LOG_PREFIX}: Bulk edit - deal not found in active deals`,
              {
                tradeId: selectedTrades[0].id,
              }
            );
            handleEdit(selectedTrades[0] as unknown as TransformedTrade);
          }
        },
        onMoveToTerminal: (selectedTrades) => {
          setMoveBulkDialogOpen(selectedTrades.filter(canMoveTradeToTerminal));
        },
        onCancel: (selectedTrades) => {
          setCancelDialogOpen(selectedTrades);
        },
        onClose: (selectedTrades) => {
          setCloseDialogOpen(selectedTrades);
        },
        canMoveToTerminal: canMoveTradeToTerminal,
        getSymbol: (trade) => trade.symbol,
      }),
    [
      addToJournalBulk,
      mergeSmartOrdersMutation,
      canMoveTradeToTerminal,
      handleEdit,
      allKnownDeals,
    ]
  );

  // Use provided bulk actions or default ones
  const effectiveBulkActions = bulkActions || defaultBulkActions;
  const adjustFundsMutation = useAdjustFunds();
  const setDealNoteMutation = useSetDealNote();

  // Local optimistic overrides for notes: dealId -> note
  const [noteOverrides, setNoteOverrides] = useState<Record<string, string>>(
    {}
  );

  const handleSaveNote = useCallback(
    (dealId: string, note: string, prevNote: string) => {
      if (note === prevNote) return;
      // Optimistic update
      setNoteOverrides((prev) => ({ ...prev, [dealId]: note }));
      setDealNoteMutation.mutate(
        { id: dealId, note },
        {
          onError: () => {
            // Revert on failure
            setNoteOverrides((prev) => ({ ...prev, [dealId]: prevNote }));
          },
        }
      );
    },
    [setDealNoteMutation]
  );

  const handleAdjustFundsConfirm = useCallback(
    (
      dealId: string,
      botId: string,
      settings: AddFundsSettings,
      mode: AdjustFundsDialogMode
    ) => {
      if (!botId) {
        return;
      }
      adjustFundsMutation.mutate({
        dealId,
        botId,
        settings,
        mode,
      });
    },
    [adjustFundsMutation]
  );
  handleAdjustFundsConfirmRef.current = handleAdjustFundsConfirm;
  // Define table columns
  const columns: ColumnDef<OpenTrade>[] = useMemo(() => {
    const comboTypes = new Set(['Combo', 'Hedge Combo']);
    const hasComboFilter = filteredBotTypes.some((type) =>
      comboTypes.has(type)
    );
    const showComboOnlyColumns =
      (botTypeOverride && comboTypes.has(botTypeOverride)) || hasComboFilter;
    const isTerminalDealsTable =
      String(botTypeOverride || '').toLowerCase() === 'terminal';

    const baseCols: ColumnDef<OpenTrade>[] = [];

    if (!isTerminalDealsTable) {
      baseCols.push({
        accessorKey: 'type',
        header: 'Type',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const trade = row as Record<string, unknown>;
            return (trade['type'] as string) || '';
          },
        },
        cell: ({ getValue }) => {
          const type = getValue() as string;
          return (
            <BotTypeChip
              botType={getBotTypeForChip(type)}
              size="xs"
              chipStyle="solid"
            />
          );
        },
      });
    }

    baseCols.push({
      accessorKey: 'symbol',
      header: 'Symbol',
      meta: {
        filterType: 'array',
        getFilterValue: (row: unknown) => {
          const trade = row as Record<string, unknown>;
          const symbol = (trade['symbol'] as string) || '';
          const pair = (trade['pair'] as string) || '';

          // Extract base and quote assets from symbol using shared helper
          const { baseAsset, quoteAsset } = extractPairAssets(symbol);

          return [
            symbol,
            pair,
            baseAsset,
            quoteAsset,
            symbol.replace('/', ''),
          ].filter(Boolean);
        },
      },
      cell: ({ row }) => {
        const symbol = row.getValue('symbol') as string;
        const { baseAsset, quoteAsset } = extractPairAssets(symbol);

        return (
          <CoinPair
            baseAsset={baseAsset}
            quoteAsset={quoteAsset}
            pair={formatTradingPair(symbol)}
            iconSize="sm"
            showText={true}
          />
        );
      },
    });

    // Conditionally include Bot Name column
    if (!hideBotName) {
      baseCols.push({
        accessorKey: 'botName',
        header: 'Bot Name',
        meta: { filterType: 'string' },
        cell: ({ getValue, row }) => {
          const botName = getValue() as string;
          const botId = row.original.botId;
          const type = row.original.type;

          if (!botName) {
            return <div className="text-sm text-muted-foreground">—</div>;
          }

          return (
            <div className="flex items-center gap-xs">
              <div
                className="text-sm text-muted-foreground truncate max-w-52"
                title={botName}
              >
                {botName}
              </div>
              {botId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const botTypeForRoute = getBotTypeForChip(type);
                    if (botTypeForRoute) {
                      window.open(
                        buildBotViewRoute(botTypeForRoute, botId),
                        '_blank'
                      );
                    }
                  }}
                  className="p-1 rounded hover:bg-muted/30"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          );
        },
      });
    }

    // Continue with the rest of the columns
    const rest: ColumnDef<OpenTrade>[] = [
      {
        accessorKey: 'strategy',
        header: 'Strategy',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const trade = row as Record<string, unknown>;
            return (trade['strategy'] as string) || '';
          },
        },
        cell: ({ getValue }) => {
          const strategy = getValue() as string;
          return (
            <StrategyChip strategy={strategy} size="xs" chipStyle="solid" />
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: { filterType: 'array' },
        cell: ({ getValue }) => {
          const status = getValue() as string;
          return <StatusChip status={status} size="xs" />;
        },
      },
      {
        accessorKey: 'exchange',
        header: 'Exchange',
        meta: {
          filterType: 'array',
          getFilterValue: (row: unknown) => {
            const trade = row as Record<string, unknown>;
            return [trade['exchange'], trade['exchangeUUID']].filter(
              Boolean
            ) as string[];
          },
        },
        cell: ({ row, getValue }) => {
          const exchange = getValue() as string;
          const exchangeUUID = row.original.exchangeUUID || exchange;
          return (
            <ExchangeChip
              exchangeId={exchangeUUID}
              size="sm"
              layout="stacked"
              chipStyle="soft"
            />
          );
        },
      },
      {
        id: 'realizedProfit',
        accessorFn: (row) => Number(row.profit?.totalUsd || 0),
        header: 'Realized P&L',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        cell: ({ row }) => {
          const profit = Number(row.original.profit?.totalUsd || 0);
          const cost = Number(row.original.cost || 0);
          const percentage = calculatePnlPercentage(profit, cost);
          return (
            <ProfitAndPerc
              value={profit}
              percentage={percentage}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
        footerValue: (value: number) => (
          <span
            className={
              privacyMode
                ? 'text-muted-foreground font-bold'
                : value >= 0
                  ? 'text-success font-bold'
                  : 'text-destructive font-bold'
            }
          >
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
      },
      {
        accessorKey: 'realizedProfitPercentage',
        header: 'Realized P&L, %',
        meta: { filterType: 'number' },
        enableHiding: true,
        cell: ({ row }) => {
          const profit = Number(row.original.profit?.totalUsd || 0);
          const cost = Number(row.original.cost || 0);
          const percentage = calculatePnlPercentage(profit, cost);
          if (privacyMode) {
            return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
          }
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
      },
      {
        id: 'unrealizedProfit',
        accessorFn: (row) => toSortableMetricValue(row.unrealizedProfit),
        header: 'Unrealized P&L',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        footerValue: (value: number) => (
          <span
            className={
              privacyMode
                ? 'text-muted-foreground font-bold'
                : value >= 0
                  ? 'text-success font-bold'
                  : 'text-destructive font-bold'
            }
          >
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
        cell: ({ row }) => {
          // Closed/canceled deals have no unrealized P&L (legacy parity).
          if (!row.original.active) {
            return <span className="text-muted-foreground">-</span>;
          }
          if (pricesLoading) {
            return <Skeleton className="h-4 w-16" />;
          }
          const unrealizedProfit = row.original.unrealizedProfit;
          if (isMetricUnavailable(unrealizedProfit)) {
            return (
              <span className="text-sm text-muted-foreground">
                Price unavailable
              </span>
            );
          }
          const cost = Number(row.original.cost || 0);
          const percentage = calculatePnlPercentage(
            Number(unrealizedProfit),
            cost
          );
          return (
            <ProfitAndPerc
              value={Number(unrealizedProfit)}
              percentage={percentage}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
      },
      {
        id: 'unrealizedProfitPercentage',
        accessorFn: (row) => {
          const percentage = calculatePnlPercentageNullable(
            row.unrealizedProfit,
            row.cost
          );
          return toSortableMetricValue(percentage);
        },
        header: 'Unrealized P&L, %',
        meta: { filterType: 'number' },
        enableHiding: true,
        cell: ({ row }) => {
          // Closed/canceled deals have no unrealized P&L (legacy parity).
          if (!row.original.active) {
            return <span className="text-muted-foreground">-</span>;
          }
          if (pricesLoading) {
            return <Skeleton className="h-4 w-12" />;
          }
          const unrealizedProfit = row.original.unrealizedProfit;
          if (isMetricUnavailable(unrealizedProfit)) {
            return (
              <ProfitLossPercChip
                value={0}
                size="sm"
                textValue="Price unavailable"
              />
            );
          }
          const cost = Number(row.original.cost || 0);
          const percentage = calculatePnlPercentage(
            Number(unrealizedProfit),
            cost
          );
          if (privacyMode) {
            return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
          }
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
      },
      {
        id: 'netPnl',
        accessorFn: (row) => {
          const unrealizedProfit = Number(row.unrealizedProfit || 0);
          const realizedProfit = Number(row.profit?.totalUsd || 0);
          return unrealizedProfit + realizedProfit;
        },
        header: 'Net P&L',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        footerValue: (value: number) => (
          <span
            className={
              privacyMode
                ? 'text-muted-foreground font-bold'
                : value >= 0
                  ? 'text-success font-bold'
                  : 'text-destructive font-bold'
            }
          >
            {privacyMode ? '***' : `$${value.toFixed(2)}`}
          </span>
        ),
        cell: ({ row }) => {
          if (row.original.active && pricesLoading) {
            return <Skeleton className="h-4 w-16" />;
          }
          const unrealizedProfit = Number(row.original.unrealizedProfit || 0);
          const realizedProfit = Number(row.original.profit?.totalUsd || 0);
          const netPnl = unrealizedProfit + realizedProfit;
          const cost = Number(row.original.cost || 0);
          const percentage = calculatePnlPercentage(netPnl, cost);
          return (
            <ProfitAndPerc
              value={netPnl}
              percentage={percentage}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
      },
      {
        accessorFn: (row) => {
          const unrealizedProfit = Number(row.unrealizedProfit || 0);
          const realizedProfit = Number(row.profit?.totalUsd || 0);
          const netPnl = unrealizedProfit + realizedProfit;
          const cost = Number(row.cost || 0);
          return calculatePnlPercentage(netPnl, cost);
        },
        header: 'Net P&L, %',
        meta: { filterType: 'number' },
        enableHiding: true,
        cell: ({ row }) => {
          if (row.original.active && pricesLoading) {
            return <Skeleton className="h-4 w-12" />;
          }
          const unrealizedProfit = Number(row.original.unrealizedProfit || 0);
          const realizedProfit = Number(row.original.profit?.totalUsd || 0);
          const netPnl = unrealizedProfit + realizedProfit;
          const cost = Number(row.original.cost || 0);
          const percentage = calculatePnlPercentage(netPnl, cost);
          if (privacyMode) {
            return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
          }
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
      },
      {
        accessorKey: 'avgPrice',
        header: 'Avg Price',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = Number(row.original.avgPrice || 0);
          const quoteAsset = row.original.quoteAsset || '';
          if (!value) return <span className="text-muted-foreground">-</span>;
          return `${formatNumber(value, true)} ${quoteAsset}`;
        },
      },
      {
        accessorKey: 'initialPrice',
        header: 'Initial Price',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const initialPrice = Number(row.original.initialPrice || 0);
          const entryPrice = Number(row.original.entryPrice || 0);
          const avgPrice = Number(row.original.avgPrice || 0);
          const value = initialPrice || entryPrice || avgPrice;
          const quoteAsset = row.original.quoteAsset || '';
          if (!value) return <span className="text-muted-foreground">-</span>;
          return `${formatNumber(value, true)} ${quoteAsset}`;
        },
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        cell: ({ row }) => {
          const cost = Number(row.original.cost || 0);
          const quoteAsset = row.original.quoteAsset || '';
          if (cost === 0)
            return <span className="text-muted-foreground">-</span>;
          return `${formatNumber(cost, true)} ${quoteAsset}`;
        },
        footerValue: (value: number) => (
          <span className="font-bold">
            {privacyMode ? '***' : `${formatNumber(value, true)}`}
          </span>
        ),
      },
      {
        accessorKey: 'value',
        header: 'Notional Value',
        meta: {
          filterType: 'number',
          enableTotalsRow: true,
          totalsDefaultAggregation: 'sum',
        },
        aggregationFn: 'sum',
        cell: ({ row }) => {
          const value = Number(row.original.value || 0);
          const quoteAsset = row.original.quoteAsset || '';
          if (value === 0)
            return <span className="text-muted-foreground">-</span>;
          return `${formatNumber(value, true)} ${quoteAsset}`;
        },
        footerValue: (value: number) => (
          <span className="font-bold">
            {privacyMode ? '***' : `${formatNumber(value, true)}`}
          </span>
        ),
      },
      {
        accessorKey: 'size',
        header: 'Size',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const size = Number(row.original.size || 0);
          const baseAsset = row.original.baseAsset || '';
          if (size === 0 || isNaN(size))
            return <span className="text-muted-foreground">-</span>;
          return `${formatNumber(size, false)} ${baseAsset}`;
        },
      },
      {
        accessorKey: 'createdTime',
        header: 'Created',
        meta: { filterType: 'date' },
        cell: ({ getValue }) => {
          const value = getValue() as Date;
          if (!value) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex flex-col">
              <span className="text-sm">{value.toLocaleDateString()}</span>
              <span className="text-xs text-muted-foreground">
                {value.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        },
      },
      {
        id: 'orders',
        accessorFn: (row) => row.levels.complete,
        header: 'Orders',
        meta: { filterType: 'number' },
        enableSorting: true,
        cell: ({ row }) => {
          const levels = row.original.levels;
          return (
            <span className="text-sm font-medium">
              {levels.complete} / {levels.all}
            </span>
          );
        },
      },
      {
        id: 'progress',
        header: 'Progress',
        meta: { filterType: 'string' },
        cell: ({ row }) => {
          const trade = row.original;
          const levels = trade.levels;

          return (
            <button
              type="button"
              className="flex justify-center items-center cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                console.log('[OpenOrdersWidget] Progress clicked', {
                  botId: trade.botId,
                  dealId: trade.dealId,
                  id: trade.id,
                  symbol: trade.symbol,
                });

                const dealInfo = {
                  dealId: trade.dealId || trade.id,
                  botId: trade.botId || trade.id, // Use id if botId is missing
                  symbol: trade.symbol,
                  exchange: trade.exchange,
                };
                console.log(
                  '[OpenOrdersWidget] Opening dialog with:',
                  dealInfo
                );
                setSelectedDeal(dealInfo);
                setOrdersDialogOpen(true);
                console.log('[OpenOrdersWidget] State should be updated now');
              }}
              title="Click to view orders"
            >
              <DualArcProgressGauge
                size={40}
                outerPercentage={trade.outerGaugePercent || 0}
                innerPercentage={0}
                outerProgressColor={getGaugeColor(trade.outerGaugePercent || 0)}
                centerText={`${(trade.outerGaugePercent || 0).toFixed(0)}%`}
                label={`${levels.complete}/${levels.all}`}
                showInnerGauge={false}
              />
            </button>
          );
        },
      },
      {
        accessorKey: 'drawdown',
        header: 'Drawdown',
        meta: { filterType: 'number' },
        cell: ({ getValue }) => {
          const value = Number(getValue() || 0);
          if (value === 0)
            return <span className="text-muted-foreground">-</span>;
          return (
            <ProfitLossPercChip
              value={-Math.abs(value)}
              size="sm"
              showSign={false}
            />
          );
        },
      },
      {
        accessorKey: 'runUp',
        header: 'Run Up',
        meta: { filterType: 'number' },
        cell: ({ getValue }) => {
          const value = Number(getValue() || 0);
          if (value === 0)
            return <span className="text-muted-foreground">-</span>;
          return <ProfitLossPercChip value={value} size="sm" showSign={true} />;
        },
      },
      {
        accessorKey: 'timeInLoss',
        header: 'Time In Loss',
        meta: { filterType: 'string' },
        cell: ({ getValue }) => {
          const value = getValue() as string;
          if (!value || value === '-')
            return <span className="text-muted-foreground">-</span>;
          return value;
        },
      },
      {
        accessorKey: 'timeInProfit',
        header: 'Time In Profit',
        meta: { filterType: 'string' },
        cell: ({ getValue }) => {
          const value = getValue() as string;
          if (!value || value === '-')
            return <span className="text-muted-foreground">-</span>;
          return value;
        },
      },
      {
        accessorKey: 'workingTime',
        header: 'Working Time',
        meta: { filterType: 'string' },
        cell: ({ getValue }) => {
          const value = getValue() as string;
          if (!value) return <span className="text-muted-foreground">-</span>;
          return value;
        },
      },
      {
        accessorKey: 'initialBalances',
        header: 'Initial Balances',
        meta: { filterType: 'string' },
        cell: ({ row }) => {
          const balances = row.original.initialBalances;
          if (!balances)
            return <span className="text-muted-foreground">-</span>;
          const baseAsset = row.original.baseAsset || '';
          const quoteAsset = row.original.quoteAsset || '';
          return (
            <div className="flex flex-col text-xs">
              <span>
                Base: {formatNumber(balances.base, false)} {baseAsset}
              </span>
              <span className="text-muted-foreground">
                Quote: {formatNumber(balances.quote, false)} {quoteAsset}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'currentBalances',
        header: 'Current Balances',
        meta: { filterType: 'string' },
        cell: ({ row }) => {
          const balances = row.original.currentBalances;
          if (!balances)
            return <span className="text-muted-foreground">-</span>;
          const baseAsset = row.original.baseAsset || '';
          const quoteAsset = row.original.quoteAsset || '';
          return (
            <div className="flex flex-col text-xs">
              <span>
                Base: {formatNumber(balances.base, false)} {baseAsset}
              </span>
              <span className="text-muted-foreground">
                Quote: {formatNumber(balances.quote, false)} {quoteAsset}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'closeTrigger',
        header: 'Close Trigger',
        meta: { filterType: 'string' },
        cell: ({ row, getValue }) => {
          const value = getValue() as string;
          const status = row.original.status?.toLowerCase();
          // Only show for closed deals
          if (!isClosedDealStatus(status) || !value)
            return <span className="text-muted-foreground">-</span>;
          return <span className="text-sm">{value}</span>;
        },
      },
      {
        accessorKey: 'closePrice',
        header: 'Close Price',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const closePrice = Number(row.original.closePrice || 0);
          const status = row.original.status?.toLowerCase();
          // Only show for closed deals
          if (!isClosedDealStatus(status) || !closePrice)
            return <span className="text-muted-foreground">-</span>;
          return formatNumber(closePrice, true);
        },
      },
      {
        accessorKey: 'gridProfitUsd',
        header: 'Grid Profit',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const type = row.original.type;
          // Only show for Combo and Hedge Combo bots
          if (type !== 'Combo' && type !== 'Hedge Combo') {
            return <span className="text-muted-foreground">-</span>;
          }
          const gridProfitUsd = Number(row.original.gridProfitUsd || 0);
          const gridProfit = Number(row.original.gridProfit || 0);
          if (gridProfitUsd === 0 && gridProfit === 0)
            return <span className="text-muted-foreground">-</span>;
          const cost = Number(row.original.cost || 0);
          const percentage = cost > 0 ? (gridProfitUsd / cost) * 100 : 0;
          return (
            <ProfitAndPerc
              value={gridProfitUsd}
              percentage={percentage}
              privacyMode={privacyMode}
              chipPosition="right"
              size="sm"
            />
          );
        },
      },
      {
        accessorKey: 'gridProfitPercentage',
        header: 'Grid Profit, %',
        meta: { filterType: 'number' },
        enableHiding: true,
        cell: ({ row }) => {
          const type = row.original.type;
          // Only show for Combo and Hedge Combo bots
          if (type !== 'Combo' && type !== 'Hedge Combo') {
            return <span className="text-muted-foreground">-</span>;
          }
          const gridProfitUsd = Number(row.original.gridProfitUsd || 0);
          const gridProfit = Number(row.original.gridProfit || 0);
          if (gridProfitUsd === 0 && gridProfit === 0)
            return <span className="text-muted-foreground">-</span>;
          const cost = Number(row.original.cost || 0);
          const percentage = cost > 0 ? (gridProfitUsd / cost) * 100 : 0;
          if (privacyMode) {
            return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
          }
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
      },
      {
        accessorKey: 'transactionsTotal',
        header: 'Transactions',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const type = row.original.type;
          // Only show for Combo and Hedge Combo bots
          if (type !== 'Combo' && type !== 'Hedge Combo') {
            return <span className="text-muted-foreground">-</span>;
          }
          const buy = row.original.transactionsBuy || 0;
          const sell = row.original.transactionsSell || 0;
          const total = buy + sell;
          if (total === 0)
            return <span className="text-muted-foreground">-</span>;
          return (
            <div className="flex flex-col text-xs">
              <span className="font-medium">{total} total</span>
              <span className="text-success">↓ {buy} buy</span>
              <span className="text-destructive">↑ {sell} sell</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'updateTime',
        header: 'Update Time',
        meta: { filterType: 'date' },
        cell: ({ getValue }) => {
          const value = getValue() as string;
          if (!value) return <span className="text-muted-foreground">-</span>;
          const date = new Date(value);
          return (
            <div className="flex flex-col">
              <span className="text-sm">{date.toLocaleDateString()}</span>
              <span className="text-xs text-muted-foreground">
                {date.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'closeTime',
        header: 'Close Time',
        meta: { filterType: 'date' },
        cell: ({ row }) => {
          const value = row.original.closeTime;
          const status = row.original.status?.toLowerCase();
          // Only show for closed deals
          if (!isClosedDealStatus(status) || !value)
            return <span className="text-muted-foreground">-</span>;
          const date = new Date(value);
          return (
            <div className="flex flex-col">
              <span className="text-sm">{date.toLocaleDateString()}</span>
              <span className="text-xs text-muted-foreground">
                {date.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'takeProfitConfig',
        header: 'Take Profit Config',
        meta: { filterType: 'string' },
        cell: ({ getValue }) => {
          const value = getValue() as string;
          if (!value || value === '-')
            return <span className="text-muted-foreground">-</span>;
          return <span className="text-sm whitespace-pre-line">{value}</span>;
        },
      },
      {
        accessorKey: 'stopLossConfig',
        header: 'Stop Loss Config',
        meta: { filterType: 'string' },
        cell: ({ getValue }) => {
          const value = getValue() as string;
          if (!value || value === '-')
            return <span className="text-muted-foreground">-</span>;
          return <span className="text-sm whitespace-pre-line">{value}</span>;
        },
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        meta: { filterType: 'string' },
        size: 200,
        cell: ({ row }) => {
          const trade = row.original;
          const currentNote = noteOverrides[trade.id] ?? trade.notes ?? '';
          return (
            <InlineNoteCell
              id={trade.id}
              note={currentNote}
              onSave={handleSaveNote}
            />
          );
        },
      },
      {
        accessorKey: 'id',
        header: 'Deal ID',
        meta: { filterType: 'string' },
        cell: ({ getValue }) => {
          const value = getValue() as string;
          if (!value) return <span className="text-muted-foreground">-</span>;

          const handleCopyDealId = (event: React.MouseEvent) => {
            event.stopPropagation();

            if (!navigator.clipboard) {
              toast.error('Clipboard is not available');
              return;
            }

            void navigator.clipboard
              .writeText(value)
              .then(() => {
                toast.success('Deal ID copied');
              })
              .catch((copyError) => {
                logger.error(`${LOG_PREFIX}: Failed to copy deal ID`, {
                  error: copyError,
                  dealId: value,
                });
                toast.error('Failed to copy deal ID');
              });
          };

          return (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs font-mono">{value}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleCopyDealId}
                title="Copy Deal ID"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const trade = row.original;
          return (
            <TradeTableActions
              trade={trade}
              handleAdjustFundsConfirm={handleAdjustFundsConfirm}
              onEdit={(t) => {
                const dealId = t.dealId || t.id;
                const find =
                  activeDealsRaw.find((d) => d._id === dealId) ||
                  allKnownDeals.find((d) => d._id === dealId);
                if (find) {
                  setOpenDetailDrawerTrade([find]);
                  return;
                }

                handleEdit(t as unknown as TransformedTrade);
              }}
            />
          );
        },
        // enableSorting: false,
        // enableHiding: false,
        size: 80,
      },
    ];

    let allColumns = [...baseCols, ...rest];

    const getColumnKey = (column: ColumnDef<OpenTrade>) =>
      'accessorKey' in column ? column.accessorKey : column.id;

    if (!effectiveShowClosedTrades) {
      allColumns = allColumns.filter((column) => {
        const key = getColumnKey(column);
        return (
          key !== 'closeTrigger' && key !== 'closePrice' && key !== 'closeTime'
        );
      });
    }

    if (!showComboOnlyColumns) {
      allColumns = allColumns.filter((column) => {
        const key = getColumnKey(column);
        return key !== 'gridProfitUsd' && key !== 'transactionsTotal';
      });
    }

    return allColumns;
  }, [
    getGaugeColor,
    privacyMode,
    pricesLoading,
    hideBotName,
    getBotTypeForChip,
    setSelectedDeal,
    setOrdersDialogOpen,
    handleAdjustFundsConfirm,
    filteredBotTypes,
    effectiveShowClosedTrades,
    botTypeOverride,
    activeDealsRaw,
    noteOverrides,
    handleSaveNote,
    handleEdit,
    allKnownDeals,
  ]);

  // Wrapper component to adapt props for TradeCard.
  // IMPORTANT: useMemo with an empty dep array ensures the component *type* (function
  // reference) never changes across renders. Without this, every re-render caused by
  // latestPrices state updates would produce a new component type, forcing DataTable to
  // fully unmount and remount every card (visible as flickering). All live values are
  // read through refs so the inner component always uses the latest callbacks/props.
  const TradeCardWrapper = useMemo(
    () =>
      ({ item }: { item: OpenTrade; index: number }) => (
        <TradeCard
          terminal={
            String(botTypeOverrideRef.current || '').toLowerCase() ===
            'terminal'
          }
          trade={item}
          onClick={() => {
            // Card body / row click → read-only Trade Details drawer.
            // Parents that want a different click target can override via
            // `onTradeClick`.
            if (onTradeClickRef.current) {
              onTradeClickRef.current(item);
            } else {
              openDetailsRef.current(item);
            }
          }}
          enableEnhancedView={true}
          showChart={item.active}
          showTradeDrawer={false}
          privacyMode={privacyModeRef.current}
          botType={getBotTypeForChipRef.current(item.type)}
          handleOpenDetailDrawer={(trade) => {
            // "View Details" menu → same target as card click: details drawer.
            if (onTradeClickRef.current) {
              onTradeClickRef.current(trade as OpenTrade);
            } else {
              openDetailsRef.current(trade as OpenTrade);
            }
          }}
          filledOrders={[]}
          handleAdjustFundsConfirm={(id, settings, mode) =>
            handleAdjustFundsConfirmRef.current(
              id,
              item.botId || '',
              settings,
              mode
            )
          }
          // Defer the ref read until call-time. Passing `handleEditRef.current`
          // directly captured its value at memo-time (when it was still the
          // initial `() => undefined`), which is why the row "Edit" menu was
          // a no-op for the lifetime of the wrapper.
          handleEdit={(trade) => handleEditRef.current(trade)}
        />
      ),
    [] // Never recreate — refs keep values current without changing the type reference
  );

  // FLICKER DEBUG: detect if TradeCardWrapper is unexpectedly recreated
  const prevTradeCardWrapperRef = useRef(TradeCardWrapper);
  if (prevTradeCardWrapperRef.current !== TradeCardWrapper) {
    logger.warn(
      `[flicker] TradeCardWrapper reference CHANGED — all cards will remount!`
    );
    prevTradeCardWrapperRef.current = TradeCardWrapper;
  }

  const closeDealMutation = useDealActions();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm p-md" aria-busy="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <div className="flex gap-xs">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-md p-md rounded-lg bg-muted/40"
          >
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-xs">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-xl text-destructive">
        Error loading trades: {error.message}
      </div>
    );
  }

  const handleCancelConfirm = async () => {
    let successCount = 0;
    let errorCount = 0;

    for (const trade of cancelDialogOpen) {
      if (!trade.botId) {
        errorCount += 1;
        logger.error(`${LOG_PREFIX}: Cannot cancel trade - missing botId`, {
          tradeId: trade.id,
        });
        continue;
      }

      try {
        if (trade.type === 'Combo' || trade.type === 'Hedge Combo') {
          await closeDealMutation.closeComboDeal({
            dealId: trade.id,
            botId: trade.botId,
            type: CloseDCATypeEnum.cancel,
          });
        } else {
          await closeDealMutation.closeDCADeal({
            dealId: trade.id,
            botId: trade.botId,
            type: CloseDCATypeEnum.cancel,
          });
        }
        successCount += 1;
      } catch (error) {
        errorCount += 1;
        logger.error(`${LOG_PREFIX}: Failed bulk cancel`, {
          error,
          dealId: trade.id,
          botId: trade.botId,
        });
      }
    }

    setCancelDialogOpen([]);

    if (successCount > 0) {
      toast.success(`Canceled ${successCount} deal(s)`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to cancel ${errorCount} deal(s)`);
    }
  };

  const handleCloseConfirm = async (type: CloseDCATypeEnum) => {
    let successCount = 0;
    let errorCount = 0;

    for (const trade of closeDialogOpen) {
      if (!trade.botId) {
        errorCount += 1;
        logger.error(`${LOG_PREFIX}: Cannot close trade - missing botId`, {
          tradeId: trade.id,
        });
        continue;
      }

      try {
        if (trade.type === 'Combo' || trade.type === 'Hedge Combo') {
          await closeDealMutation.closeComboDeal({
            dealId: trade.id,
            botId: trade.botId,
            type,
          });
        } else {
          await closeDealMutation.closeDCADeal({
            dealId: trade.id,
            botId: trade.botId,
            type,
          });
        }
        successCount += 1;
      } catch (error) {
        errorCount += 1;
        logger.error(`${LOG_PREFIX}: Failed bulk close`, {
          error,
          dealId: trade.id,
          botId: trade.botId,
        });
      }
    }

    setCloseDialogOpen([]);

    if (successCount > 0) {
      toast.success(`Closed ${successCount} deal(s)`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to close ${errorCount} deal(s)`);
    }
  };

  const handleBulkMoveToTerminalConfirm = async () => {
    const movableTrades = moveBulkDialogOpen.filter(canMoveTradeToTerminal);

    if (movableTrades.length === 0) {
      setMoveBulkDialogOpen([]);
      toast.info('Only open DCA bot deals can be moved to terminal');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const trade of movableTrades) {
      try {
        await moveDealToTerminalMutation.mutateAsync({
          dealId: trade.id,
          botId: trade.botId as string,
          combo: false,
        });
        successCount += 1;
      } catch (error) {
        errorCount += 1;
        logger.error(`${LOG_PREFIX}: Failed bulk move to terminal`, {
          error,
          dealId: trade.id,
          botId: trade.botId,
        });
      }
    }

    setMoveBulkDialogOpen([]);

    if (successCount > 0) {
      toast.success(`Moved ${successCount} deal(s) to terminal`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to move ${errorCount} deal(s) to terminal`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <DealEditDrawer
        open={showEditDrawer}
        onClose={handleCloseEditDrawer}
        trade={openDetailDrawerTrade}
      >
        <div />
      </DealEditDrawer>
      {openDetailsTrade && (
        <TradeDetailDrawer
          open={true}
          onClose={() => setOpenDetailsTrade(null)}
          trade={openDetailsTrade}
          privacyMode={privacyMode}
        >
          <div />
        </TradeDetailDrawer>
      )}
      <DataTable
        // Key table preferences (column visibility, sort, order) per status so
        // the Open and Closed lists keep independent layouts — e.g. hiding the
        // Unrealized P&L column or sorting only affects the list it was set on.
        tableId={
          enableStatusToggle
            ? `${widgetId}-trades-${statusFilter}`
            : `${widgetId}-trades`
        }
        columns={columns}
        data={trades}
        onRowClick={(row) => {
          // Match the card-click default: read-only details drawer unless
          // the parent passed an explicit `onTradeClick` override.
          if (onTradeClickRef.current) {
            onTradeClickRef.current(row);
          } else {
            openDetailsRef.current(row);
          }
        }}
        firstToolbarActions={
          enableStatusToggle ? (
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as 'open' | 'closed')
              }
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder={selectedStatusLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{openOptionLabel}</SelectItem>
                <SelectItem value="closed">{closedOptionLabel}</SelectItem>
              </SelectContent>
            </Select>
          ) : undefined
        }
        firstToolbarActionsCompact={
          enableStatusToggle ? (
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as 'open' | 'closed')
              }
            >
              <SelectTrigger className="h-9 w-24">
                <SelectValue
                  placeholder={
                    statusFilter === 'open'
                      ? `${openCount}`
                      : `${closedCount}`
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{openOptionLabel}</SelectItem>
                <SelectItem value="closed">{closedOptionLabel}</SelectItem>
              </SelectContent>
            </Select>
          ) : undefined
        }
        enableGlobalFilter={true}
        enableColumnFilters={true}
        enableSorting={true}
        enableColumnVisibility={true}
        defaultColumnVisibility={{
          unrealizedProfitPercentage: false,
          realizedProfitPercentage: false,
          netPnl: false,
          netPnlPercentage: false,
          gridProfitPercentage: false,
        }}
        enableCardView={enableCardView}
        emptyMessage={emptyMessage}
        emptyContent={
          emptyContent ?? (
            <EmptyState
              size="page"
              icon={<Receipt className="w-6 h-6" />}
              title={emptyMessage}
              description="When your bots open or close trades, they'll show up here."
            />
          )
        }
        className="flex-1"
        cardComponent={TradeCardWrapper}
        defaultView="cards"
        cardViewBreakpoints={{
          default: 1,
          600: 2,
          768: 2,
          1024: 3,
          1280: 4,
        }}
        cardViewGap={16}
        getRowId={(row) => row.id}
        bulkActions={effectiveBulkActions}
        defaultPinnedColumns={{ left: [], right: ['actions'] }}
        enableQuickFilterBar={true}
        quickFilterBarStorageKey={`${widgetId}-trades-filters`}
      />

      {/* Orders Dialog */}
      <DealOrdersDialog
        open={ordersDialogOpen}
        onClose={() => {
          logger.debug(`${LOG_PREFIX}: Closing orders dialog`);
          setOrdersDialogOpen(false);
          setSelectedDeal(null);
        }}
        dealId={selectedDeal?.dealId || ''}
        botId={selectedDeal?.botId || ''}
        symbol={selectedDeal?.symbol || ''}
        exchange={selectedDeal?.exchange || ''}
      />
      <ConfirmationDialog
        open={!!cancelDialogOpen.length}
        onOpenChange={() => setCancelDialogOpen([])}
        title="Cancel Trade"
        description={`Are you sure you want to cancel ${cancelDialogOpen.length} ${cancelDialogOpen.length > 1 ? 'trades' : 'trade'}? This action cannot be undone.`}
        confirmText="Cancel Trade"
        cancelText="Keep Trade"
        variant="destructive"
        onConfirm={handleCancelConfirm}
      />
      <CloseOptionsDialog
        open={!!closeDialogOpen.length}
        onOpenChange={() => setCloseDialogOpen([])}
        onConfirm={handleCloseConfirm}
        defaultCloseType={CloseDCATypeEnum.closeByMarket}
        ignoreOptions={[CloseDCATypeEnum.leave]}
        mode="deal"
      />
      <ConfirmationDialog
        open={!!moveBulkDialogOpen.length}
        onOpenChange={() => setMoveBulkDialogOpen([])}
        title="Move deal to terminal"
        description={`Are you sure you want to move ${moveBulkDialogOpen.length} ${moveBulkDialogOpen.length > 1 ? 'deals' : 'deal'} to the terminal? ${MOVE_TO_TERMINAL_WARNING}`}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={handleBulkMoveToTerminalConfirm}
      />
    </div>
  );
};

export default OpenOrdersWidget;
