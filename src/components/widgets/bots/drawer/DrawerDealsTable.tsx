/* eslint-disable @typescript-eslint/no-explicit-any */
// Usage: bot details drawer deals table (active/closed tabs) rendered via DrawerWidgetRenderer.
// Not used by the Trading page or the Trading Terminal; those use OpenOrdersWidget.
import { dealStartBlockedSummary } from '@/lib/utils/dealStartBlocked';
import { Tooltip as HelpTooltip } from '@/components/ui/tooltip';
import type { DrawerBot } from '@/types/bots/drawer';
import type { ColumnDef } from '@tanstack/react-table';
import {
    ArrowRightLeft,
    BookOpen,
    Check,
    Edit,
    Eye,
    Handshake,
    MinusCircle,
    MoreHorizontal,
    PauseCircle,
    Plus,
    PlusCircle,
    RotateCcw,
    Search,
    SlidersHorizontal,
    Square,
    X,
    XCircle,
} from 'lucide-react';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBotSpecificDeals } from '../../../../hooks/useBotSpecificDeals';
/* import { useComboBots } from '../../../../hooks/useComboBots'; */
import {
/* useComboDeals, */ type ComboDeal,
} from '../../../../hooks/useComboDeals';
/* import { useHedgeDeals } from '../../../../hooks/useHedgeDeals'; */
import {
    AdjustFundsDialog,
    ChangeDcaLevelsDialog,
    CloseOptionsDialog,
    type AdjustFundsDialogMode,
} from '@/features/bots/shared/runtime';
import { formatNumber } from '@/utils/numberFormatter';
import { logger } from '../../../../lib/loggerInstance';
import { toast } from '../../../../lib/toast';
import { useTradeJournalStore } from '../../../../stores/tradeJournalStore';
import {
    BotTypesEnum,
    CloseDCATypeEnum,
    DCADealStatusEnum,
    type AddFundsSettings,
    type DCABot,
    type DCADeals,
} from '../../../../types';
import { TradeCard } from '../../../trades/TradeCard';
/* import { TradeDetailDrawer } from '../../../trades/TradeDetailDrawer'; */
import { createSharedDealBulkActions } from '@/components/deals/actions/createSharedDealBulkActions';
import {
    canAdjustDealFunds,
    type BulkAdjustFundsTarget,
} from '@/components/deals/actions/bulkAdjustFundsTargets';
import { useBulkAdjustFunds } from '@/components/deals/actions/useBulkAdjustFunds';
import { useMergeSmartOrders } from '@/features/bots/widgets/BotForm/hooks/useMergeSmartOrders';
import getLatestPrices, { getLocalPrices } from '@/helper/price';
import {
    useAdjustFunds,
    useDealActions,
    useEditDeal,
    useMoveDealToTerminal,
    useRestoreDeal,
} from '@/hooks/useDealActions';
import { useOpenDeal } from '@/hooks/useOpenDeal';
import { useUserFees } from '@/hooks/useUserFeesService';
import {
    calculatePnlPercentage,
    calculatePnlPercentageNullable,
    isMetricUnavailable,
    toSortableMetricValue,
} from '@/lib/utils/tradingMetrics';
import { useAuthStore } from '@/stores/authStore';
import type { ViewOrder } from '@/types/bots';
import { transformDealToTrade, type TransformedTrade } from '@/types/dcaDeal';
import { TrailingBadge } from '@/components/trades/TrailingBadge';
import { Button } from '../../../ui/button';
import {
    ProfitAndPerc,
    ProfitLossPercChip,
    StatusChip,
    StrategyChip,
} from '../../../ui/chip';
import { ConfirmationDialog } from '../../../ui/confirmation-dialog';
import { DataTable, type BulkAction } from '../../../ui/data-table/data-table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../../ui/dropdown-menu';
import { DualArcProgressGauge } from '../../../ui/DualArcProgressGauge';
import { Input } from '../../../ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../ui/select';
import { Skeleton } from '../../../ui/skeleton';
import CoinPair from '../../../widgets/shared/CoinPair';
import { DealOrdersDialog } from '../../../widgets/shared/DealOrdersDialog';
import { DealsLoadingIndicator } from './DealsLoadingIndicator';
interface TradeCardWrapperProps {
  item: TransformedTrade;
  index: number;
  onTradeSelect?: (trade: any) => void;
  privacyMode?: boolean;
  handleOpenDetailDrawer: (trade: TransformedTrade) => void;
  filledOrders: ViewOrder[];
  handleAdjustFundsConfirm: (
    id: string,
    settings: AddFundsSettings,
    mode: AdjustFundsDialogMode
  ) => void;
  botType: BotTypesEnum;
  handleEdit: (trade: TransformedTrade) => void;
}

const TradeCardWrapper = React.memo<TradeCardWrapperProps>(
  ({
    item,
    onTradeSelect,
    privacyMode = false,
    handleOpenDetailDrawer,
    filledOrders,
    handleAdjustFundsConfirm,
    botType,
    handleEdit,
  }) => {
    const handleClick = onTradeSelect ? () => onTradeSelect(item) : undefined;

    if (!item) return null;

    return (
      <TradeCard
        trade={item}
        enableEnhancedView={true}
        showChart={item.active}
        privacyMode={privacyMode}
        handleOpenDetailDrawer={handleOpenDetailDrawer}
        filledOrders={filledOrders}
        handleAdjustFundsConfirm={handleAdjustFundsConfirm}
        botType={botType}
        handleEdit={handleEdit}
        // The card's default surface (surface-muted ≈ the effective glass
        // panel color) all but vanishes inside the drawer — it's meant to
        // contrast against the darker page canvas, not a translucent surface-2
        // sheet. Lift it onto the solid "floating" surface (surface-2) + a
        // shadow so it reads as a raised card. Elevation/surface, not a border.
        // `!` overrides the inline background the card's `position` prop sets.
        className="bg-popover! shadow-md"
        {...(handleClick && { onClick: handleClick })}
      />
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only rerender if item data changed (not reference)
    if (!prevProps.item || !nextProps.item) {
      return prevProps.item === nextProps.item;
    }
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.pnl === nextProps.item.pnl &&
      prevProps.item.usagePercentage === nextProps.item.usagePercentage &&
      prevProps.privacyMode === nextProps.privacyMode &&
      prevProps.onTradeSelect === nextProps.onTradeSelect
    );
  }
);

TradeCardWrapper.displayName = 'TradeCardWrapper';

export interface DrawerDealsTableProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
  privacyMode?: boolean;
  onTradeSelect?: (trade: any) => void;
  symbol?: string | null;
  setSymbol?: React.Dispatch<React.SetStateAction<string | null>>;
  completedOrders?: ViewOrder[];
  pendingOrders?: ViewOrder[];
  onTradeChartSelect?: (trade: any) => void;
  onEditDeal?: (deal: DCADeals[]) => void;
  /** Externally selected deal ID (e.g. auto-selected by parent) */
  externalSelectedDealId?: string | null;
  /**
   * Deep-link target: open this deal once when it appears in the loaded set.
   * The parent owns this as a one-shot (it goes null after `onAutoOpenHandled`)
   * so a remount of this list after Back/Close can't re-open the deal.
   */
  autoOpenDealId?: string | null;
  /** Called once the `autoOpenDealId` deal has been opened. */
  onAutoOpenHandled?: () => void;
}

const LOG_PREFIX = 'DrawerDealsTable';

const MOVE_TO_TERMINAL_WARNING =
  'After moving deals to terminal, the bot may immediately start new deals if slots are available (especially with ASAP start conditions). To avoid this, adjust max open deals or max deals per pair before confirming.';

const DealActionsMenu: React.FC<{
  trade: TransformedTrade;
  handleOpenDetailDrawer: (trade: TransformedTrade) => void;
  filledOrders: ViewOrder[];
  handleAdjustFundsConfirm: (
    id: string,
    settings: AddFundsSettings,
    mode: AdjustFundsDialogMode
  ) => void;
  botType: BotTypesEnum;
  handleEdit: (trade: TransformedTrade) => void;
  handleMoveToTerminal: (trade: TransformedTrade) => Promise<void>;
}> = ({
  trade,
  handleOpenDetailDrawer,
  handleAdjustFundsConfirm: _handleAdjustFundsConfirm,
  filledOrders,
  botType,
  handleEdit: _handleEdit,
  handleMoveToTerminal,
}) => {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [changeDcaDialogOpen, setChangeDcaDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [adjustFundsDialog, setAdjustFundsDialog] =
    useState<AdjustFundsDialogMode | null>(null);

  const addToJournal = useTradeJournalStore((state) => state.addTrade);

  // Fetch orders for this deal to include as executions
  /* const { orders: tradeOrders } = useBotOrders(
    trade.botId || '',
    BotTypesEnum.dca
  ); */

  const closeDealMutation = useDealActions();

  const handleAddToJournal = async () => {
    try {
      // Filter orders for this specific deal and only FILLED orders
      const dealOrders = filledOrders.filter(
        (order) => order.dealId === trade.id
      );

      // Transform orders into executions
      const executions = dealOrders.map((order) => ({
        id: order.clientOrderId,
        action: (order.side === 'buy' ? 'buy' : 'sell') as 'buy' | 'sell',
        timestamp: order.time,
        quantity: Number(order.executedQty || order.origQty || 0),
        price: Number(order.price || 0),
        fee: 0,
        cost:
          Number(order.executedQty || order.origQty || 0) *
          Number(order.price || 0),
      }));

      const entryTime = trade.created
        ? new Date(trade.created).getTime()
        : Date.now();

      const isOpenTrade = ['open', 'active', 'start'].includes(
        trade.status.toLowerCase()
      );
      const isCancelledTrade = ['canceled', 'cancelled'].includes(
        trade.status.toLowerCase()
      );

      const profitUsd = trade.profit?.totalUsd || 0;
      const initialInvestment = trade.cost || 0;
      const calculatedROI =
        initialInvestment > 0 ? (profitUsd / initialInvestment) * 100 : 0;

      const symbolString =
        typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;

      const journalEntry: any = {
        symbol: symbolString,
        exchange: trade.exchange,
        direction: (trade.side?.toUpperCase() === 'LONG' ||
        trade.side?.toUpperCase() === 'BUY'
          ? 'long'
          : 'short') as 'long' | 'short',
        entryPrice: trade.entryPrice || trade.avgPrice || 0,
        entryTime: entryTime,
        amount: trade.size || trade.currentBalance.base || 0,
        pnl: profitUsd,
        roi: calculatedROI,
        marketType: (trade.dealType === 'FUTURES' ? 'futures' : 'spot') as
          | 'spot'
          | 'futures',
        notes: `Deal from ${trade.type} bot${trade.botName ? ` (${trade.botName})` : ''}${isOpenTrade ? ' (Open - Unrealized PNL)' : ''}${isCancelledTrade ? ' (Cancelled)' : ''}`,
        executions: executions.length > 0 ? executions : undefined,
      };

      // Note: exitPrice/exitTime not available on TransformedTrade type for deals
      // Only add exit data if explicitly available

      const journalId = addToJournal(journalEntry);
      logger.info(`${LOG_PREFIX}: Added deal to journal`, {
        dealId: trade.id,
        journalId,
        symbol: symbolString,
        executionsCount: executions.length,
      });
      toast.success(
        `Deal ${symbolString} added to journal with ${executions.length} execution(s)`
      );
    } catch (error) {
      logger.error(`${LOG_PREFIX}: Failed to add deal to journal`, {
        error,
        dealId: trade.id,
      });
      toast.error('Failed to add deal to journal');
    }
  };

  const handleAddFunds = () => {
    setAdjustFundsDialog('add');
  };

  const handleReduceFunds = () => {
    setAdjustFundsDialog('reduce');
  };

  const handleEdit = useCallback(() => {
    _handleEdit(trade);
  }, [_handleEdit, trade]);

  const handleCancelConfirm = () => {
    if (!trade.botId) {
      logger.error(`${LOG_PREFIX}: Cannot cancel deal - missing botId`, {
        dealId: trade.id,
      });
      toast.error('Cannot cancel deal - missing bot ID');
      return;
    }

    const q =
      botType === BotTypesEnum.combo
        ? closeDealMutation.closeComboDeal
        : closeDealMutation.closeDCADeal;

    q(
      { dealId: trade.id, botId: trade.botId, type: CloseDCATypeEnum.cancel },
      {
        onSuccess: () => {
          logger.info(`${LOG_PREFIX}: Deal canceled successfully`, {
            dealId: trade.id,
            botId: trade.botId,
          });
          toast.success('Deal canceled successfully');
          setCancelDialogOpen(false);
        },
        onError: (error) => {
          logger.error(`${LOG_PREFIX}: Failed to cancel deal`, {
            dealId: trade.id,
            botId: trade.botId,
            error,
          });
          toast.error('Failed to cancel deal');
          setCancelDialogOpen(false);
        },
      }
    );
  };

  const handleCloseConfirm = (type: CloseDCATypeEnum) => {
    if (!trade.botId) {
      logger.error(`${LOG_PREFIX}: Cannot close deal - missing botId`, {
        dealId: trade.id,
      });
      toast.error('Cannot close deal - missing bot ID');
      return;
    }

    const q =
      botType === BotTypesEnum.combo
        ? closeDealMutation.closeComboDeal
        : closeDealMutation.closeDCADeal;

    q(
      { dealId: trade.id, botId: trade.botId, type },
      {
        onSuccess: () => {
          logger.info(`${LOG_PREFIX}: Deal canceled successfully`, {
            dealId: trade.id,
            botId: trade.botId,
          });
          toast.success('Deal canceled successfully');
          setCancelDialogOpen(false);
        },
        onError: (error) => {
          logger.error(`${LOG_PREFIX}: Failed to cancel deal`, {
            dealId: trade.id,
            botId: trade.botId,
            error,
          });
          toast.error('Failed to cancel deal');
          setCancelDialogOpen(false);
        },
      }
    );
  };

  const symbolString = useMemo(
    () =>
      typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol,
    [trade.symbol]
  );

  const handleAdjustFundsConfirm = useCallback(
    (settings: AddFundsSettings) => {
      if (!adjustFundsDialog) {
        return;
      }
      _handleAdjustFundsConfirm(trade.id, settings, adjustFundsDialog);
      setAdjustFundsDialog(null);
    },
    [_handleAdjustFundsConfirm, trade.id, adjustFundsDialog]
  );

  const baseSymbol = useMemo(
    () => (typeof trade.symbol === 'string' ? '' : trade.symbol.baseAsset),
    [trade.symbol]
  );

  const quoteSymbol = useMemo(
    () => (typeof trade.symbol === 'string' ? '' : trade.symbol.quoteAsset),
    [trade.symbol]
  );

  // Move to Terminal is available to DCA and Combo bot deals (parity with
  // legacy main-dash, which passes `combo: true` for combo deals).
  const canShowMoveToTerminal = useMemo(
    () =>
      (trade.type === 'DCA' || trade.type === 'Combo') &&
      typeof trade.botId === 'string' &&
      trade.botId.length > 0,
    [trade.botId, trade.type]
  );

  const isDealOpen = useMemo(
    () => String(trade.status || '').toLowerCase() === DCADealStatusEnum.open,
    [trade.status]
  );

  const canMoveToTerminal = useMemo(
    () => canShowMoveToTerminal && isDealOpen,
    [canShowMoveToTerminal, isDealOpen]
  );

  const handleMoveToTerminalConfirm = useCallback(async () => {
    try {
      await handleMoveToTerminal(trade);
    } finally {
      setMoveDialogOpen(false);
    }
  }, [handleMoveToTerminal, trade]);

  // Restore — only for canceled DCA and Terminal deals (no other bot types,
  // no other statuses). Re-adopts the deal's position as a bare active
  // terminal deal (no DCA, TP or SL).
  const restoreDealMutation = useRestoreDeal();
  const canShowRestore = useMemo(
    () =>
      (trade.type === 'DCA' || trade.type === 'Terminal') &&
      typeof trade.botId === 'string' &&
      trade.botId.length > 0 &&
      ['canceled', 'cancelled'].includes(
        String(trade.status || '').toLowerCase()
      ),
    [trade.botId, trade.type, trade.status]
  );
  const handleRestoreConfirm = useCallback(async () => {
    if (!trade.botId) {
      toast.error('Cannot restore deal - missing bot ID');
      return;
    }
    try {
      const response = await restoreDealMutation.mutateAsync({
        dealId: trade.id,
        botId: trade.botId,
      });
      toast.success(
        typeof response.data === 'string'
          ? response.data
          : 'Deal restored successfully'
      );
    } catch (error) {
      logger.error('[DrawerDealsTable] Failed to restore deal', {
        error,
        dealId: trade.id,
        botId: trade.botId,
      });
      toast.error(
        error instanceof Error ? error.message : 'Failed to restore deal'
      );
    } finally {
      setRestoreDialogOpen(false);
    }
  }, [restoreDealMutation, trade.botId, trade.id]);

  // Change DCA levels — DCA and Combo bot deals only (not grid), disabled for
  // risk-based deals whose levels are managed by the risk engine.
  const canShowChangeDca = trade.type === 'DCA' || trade.type === 'Combo';
  const canChangeDca = canShowChangeDca && isDealOpen && !trade.riskBased;
  const changeDcaCurrentLevel = (trade.levels?.complete || 1) - 1;
  const changeDcaMaxLevel = (trade.levels?.all || 1) - 1;
  const changeDcaBotType =
    trade.type === 'Combo' ? BotTypesEnum.combo : BotTypesEnum.dca;

  const editDealMutation = useEditDeal({
    onSuccess: () => {
      toast.success('DCA levels updated');
      setChangeDcaDialogOpen(false);
    },
    onError: (e) => {
      toast.error(
        e instanceof Error ? e.message : 'Failed to change DCA levels'
      );
    },
  });

  const handleChangeDcaConfirm = useCallback(
    (newMax: number) => {
      if (!trade.botId) {
        toast.error('Cannot change DCA levels - missing bot ID');
        return;
      }
      editDealMutation.mutate({
        dealId: trade.id,
        botId: trade.botId,
        type: changeDcaBotType,
        terminal: false,
        settings:
          newMax === 0
            ? { useDca: false }
            : { useDca: true, ordersCount: `${newMax}` },
      });
    },
    [editDealMutation, trade.botId, trade.id, changeDcaBotType]
  );

  return (
    <>
      <AdjustFundsDialog
        open={!!adjustFundsDialog}
        mode={adjustFundsDialog || 'add'}
        onOpenChange={() => setAdjustFundsDialog(null)}
        onConfirm={handleAdjustFundsConfirm}
        baseAsset={baseSymbol}
        quoteAsset={quoteSymbol}
        symbol={symbolString}
        exchange={trade.exchange}
        percentBasis={trade.percentBasis}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => handleOpenDetailDrawer(trade)}>
            <Eye className="w-4 h-4 mr-2" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleAddToJournal}>
            <BookOpen className="w-4 h-4 mr-2" />
            Add to Journal
          </DropdownMenuItem>
          {botType !== BotTypesEnum.combo && (
            <>
              <DropdownMenuItem
                onClick={handleAddFunds}
                disabled={!isDealOpen}
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Add Funds
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleReduceFunds}
                disabled={!isDealOpen}
              >
                <MinusCircle className="w-4 h-4 mr-2" />
                Reduce Funds
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onClick={handleEdit} disabled={!isDealOpen}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </DropdownMenuItem>
          {canShowChangeDca && (
            <DropdownMenuItem
              onClick={() => setChangeDcaDialogOpen(true)}
              disabled={!canChangeDca}
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Change DCA levels
            </DropdownMenuItem>
          )}
          {canShowMoveToTerminal && (
            <DropdownMenuItem
              onClick={() => setMoveDialogOpen(true)}
              disabled={!canMoveToTerminal}
            >
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Move to Terminal
            </DropdownMenuItem>
          )}
          {canShowRestore && (
            <DropdownMenuItem onClick={() => setRestoreDialogOpen(true)}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Restore
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setCancelDialogOpen(true)}
            disabled={!isDealOpen}
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setCloseDialogOpen(true)}
            className="text-destructive"
            disabled={!isDealOpen}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmationDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancel Deal"
        description={`Are you sure you want to cancel the deal for ${symbolString}? This action cannot be undone.`}
        confirmText="Cancel Deal"
        cancelText="Keep Deal"
        variant="destructive"
        onConfirm={handleCancelConfirm}
      />
      <ConfirmationDialog
        open={restoreDialogOpen}
        onOpenChange={setRestoreDialogOpen}
        title="Restore deal"
        description={`Restore the deal for ${symbolString}? It will be added back as an active deal that holds the current position, with no DCA, take profit or stop loss.`}
        confirmText="Restore"
        cancelText="Cancel"
        onConfirm={handleRestoreConfirm}
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
      <ChangeDcaLevelsDialog
        open={changeDcaDialogOpen}
        onOpenChange={setChangeDcaDialogOpen}
        currentLevel={changeDcaCurrentLevel}
        maxLevel={changeDcaMaxLevel}
        onConfirm={handleChangeDcaConfirm}
        isProcessing={editDealMutation.isPending}
      />
    </>
  );
};

export const DrawerDealsTable: React.FC<DrawerDealsTableProps> = ({
  widgetId,
  botId,
  bot,
  privacyMode = false,
  onTradeSelect: _onTradeSelect,
  symbol,
  setSymbol,
  completedOrders = [],
  pendingOrders = [],
  onTradeChartSelect,
  onEditDeal,
  externalSelectedDealId,
  autoOpenDealId,
  onAutoOpenHandled,
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedChartDealId, setSelectedChartDealId] = useState<string | null>(
    externalSelectedDealId ?? null
  );

  // Sync with externally selected deal (e.g. auto-selected by parent before this tab mounted)
  useEffect(() => {
    if (externalSelectedDealId && externalSelectedDealId !== selectedChartDealId) {
      setSelectedChartDealId(externalSelectedDealId);
    }
  }, [externalSelectedDealId]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTradeSelect = useCallback(
    (trade: TransformedTrade, onlyChart = false) => {
      setSelectedChartDealId(trade.id);
      // `onlyChart` plots the deal's entry/exit on the drawer chart instead of
      // opening the deal details view. It's optional, so fall back to the
      // details view when no chart consumer is wired up — otherwise the click
      // would be a silent no-op.
      if (onlyChart && onTradeChartSelect) {
        onTradeChartSelect(trade);
      } else {
        _onTradeSelect?.(trade);
      }
      const ts =
        typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;
      if (ts !== symbol && setSymbol) {
        setSymbol(ts);
      }
    },
    [_onTradeSelect, setSymbol, symbol, onTradeChartSelect]
  );
  const [selectedTab, setSelectedTab] = React.useState<'active' | 'closed'>(
    'active'
  );

  // State for orders dialog
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [selectedDealForOrders, setSelectedDealForOrders] =
    useState<TransformedTrade | null>(null);

  // State for detail drawer
  /*  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedDealForDrawer, setSelectedDealForDrawer] =
    useState<TransformedTrade | null>(null); */

  // Detect if this bot is a Combo bot
  /* const { bots: comboBots } = useComboBots({ paperContext: false }); */
  const isComboBot = React.useMemo(
    () => bot?.type === BotTypesEnum.combo,
    [bot?.type]
  );

  // Detect Hedge bot types

  const isHedgeCombo = useMemo(() => bot?.type === 'hedgeCombo', [bot?.type]);
  const isComboLike = useMemo(
    () => isComboBot || isHedgeCombo,
    [isComboBot, isHedgeCombo]
  );

  // Hook for opening new deals
  const { openDeal, isPending: isOpenDealPending } = useOpenDeal(
    isComboBot ? BotTypesEnum.combo : BotTypesEnum.dca
  );

  // State for pair selection dialog (for multi-coin bots)
  const [pairSelectDialogOpen, setPairSelectDialogOpen] = useState(false);
  const [selectedPairForDeal, setSelectedPairForDeal] = useState<string | null>(
    null
  );
  const [pairSearchQuery, setPairSearchQuery] = useState('');

  // State for max active deals validation dialog
  const [maxActiveDialog, setMaxActiveDialog] = useState<
    'bot' | 'symbol' | null
  >(null);

  // Determine if bot is multi-coin and get available pairs
  const isMultiCoin = useMemo(() => {
    const dcaBot = bot as DCABot | undefined;
    return dcaBot?.settings?.useMulti === true;
  }, [bot]);

  const availablePairs = useMemo(() => {
    const dcaBot = bot as DCABot | undefined;
    // Get pairs from bot settings or symbol array
    const settingsPairs = dcaBot?.settings?.pair;
    if (
      settingsPairs &&
      Array.isArray(settingsPairs) &&
      settingsPairs.length > 0
    ) {
      return settingsPairs;
    }
    // Fallback to symbol array
    const symbolPairs = dcaBot?.symbol?.map((s) => s.value?.symbol || s.key);
    return symbolPairs || [];
  }, [bot]);

  // Filter pairs based on search query
  const filteredPairs = useMemo(() => {
    if (!pairSearchQuery.trim()) {
      return availablePairs;
    }
    const query = pairSearchQuery.toLowerCase();
    return availablePairs.filter((pair) => pair.toLowerCase().includes(query));
  }, [availablePairs, pairSearchQuery]);

  // Initialize selected pair when dialog opens and reset search
  useEffect(() => {
    if (pairSelectDialogOpen) {
      setPairSearchQuery('');
      if (availablePairs.length > 0 && !selectedPairForDeal) {
        setSelectedPairForDeal(availablePairs[0]);
      }
    }
  }, [pairSelectDialogOpen, availablePairs, selectedPairForDeal]);

  // Helper function to check if a deal is active
  /* const isActiveDeal = useCallback((deal: DCADeals): boolean => {
    return [
      DCADealStatusEnum.error,
      DCADealStatusEnum.open,
      DCADealStatusEnum.start,
    ].includes(deal.status);
  }, []); */

  // Get active deals count for the bot
  const activeDealsCount = useMemo(() => {
    const dcaBot = bot as DCABot | undefined;
    return dcaBot?.dealsInBot?.active || 0;
  }, [bot]);

  const closedDealsCount = useMemo(() => {
    const dcaBot = bot as DCABot | undefined;
    return (dcaBot?.dealsInBot?.all || 0) - (dcaBot?.dealsInBot?.active || 0);
  }, [bot]);

  // Handler for opening a new deal - shows dialog for multi-coin bots
  const handleOpenNewDeal = useCallback(() => {
    if (!botId) {
      logger.error(`${LOG_PREFIX}: Cannot open deal - missing botId`);
      toast.error('Cannot open deal - missing bot ID');
      return;
    }

    const dcaBot = bot as DCABot | undefined;
    const maxNumberOfOpenDeals = dcaBot?.settings?.maxNumberOfOpenDeals;

    // Check max deals per bot validation (for single-pair bots)
    if (
      !isMultiCoin &&
      maxNumberOfOpenDeals &&
      maxNumberOfOpenDeals !== '' &&
      maxNumberOfOpenDeals !== '0' &&
      activeDealsCount >= parseFloat(maxNumberOfOpenDeals)
    ) {
      logger.info(`${LOG_PREFIX}: Max active deals reached for bot`, {
        botId,
        activeDealsCount,
        maxNumberOfOpenDeals,
      });
      setMaxActiveDialog('bot');
      return;
    }

    // For multi-coin bots, show the pair selection dialog
    if (isMultiCoin && availablePairs.length > 1) {
      // Also check max deals per bot for multi-coin
      if (
        maxNumberOfOpenDeals &&
        maxNumberOfOpenDeals !== '' &&
        maxNumberOfOpenDeals !== '0' &&
        activeDealsCount >= parseFloat(maxNumberOfOpenDeals)
      ) {
        logger.info(
          `${LOG_PREFIX}: Max active deals reached for multi-coin bot`,
          {
            botId,
            activeDealsCount,
            maxNumberOfOpenDeals,
          }
        );
        setMaxActiveDialog('bot');
        return;
      }

      logger.info(
        `${LOG_PREFIX}: Multi-coin bot - opening pair selection dialog`,
        {
          botId,
          availablePairs,
        }
      );
      setPairSelectDialogOpen(true);
      return;
    }

    // For single-pair bots, open deal directly
    logger.info(`${LOG_PREFIX}: Opening new deal`, {
      botId,
      isComboBot,
    });

    openDeal({ botId });
  }, [
    botId,
    bot,
    isComboBot,
    isMultiCoin,
    availablePairs,
    activeDealsCount,
    openDeal,
  ]);

  const useDealsOpenInput = useMemo(
    () => ({
      botId: botId || '',
      status: DCADealStatusEnum.open,
      dealType: isComboBot ? ('combo' as const) : ('dca' as const),
    }),
    [botId, isComboBot]
  );

  const useDealsClosedInput = useMemo(
    () => ({
      botId: botId || '',
      status: DCADealStatusEnum.closed,
      dealType: isComboBot ? ('combo' as const) : ('dca' as const),
    }),
    [botId, isComboBot]
  );

  const useDealsInput = useMemo(() => {
    return selectedTab === 'active' ? useDealsOpenInput : useDealsClosedInput;
  }, [selectedTab, useDealsOpenInput, useDealsClosedInput]);

  // DCA deals: active and closed via bot-specific queries
  const {
    deals: deals,
    isLoading: dealsLoading,
    isFetching: dealsFetching,
    isError: dealsError,
    data: _dealsData,
    total: dealsServerTotal,
    fetchAllDeals,
  } = useBotSpecificDeals(useDealsInput);

  // Handler for confirming deal opening with selected pair (defined after activeDealsData)
  const handleConfirmOpenDeal = useCallback(() => {
    if (!botId) {
      toast.error('Cannot open deal - missing bot ID');
      return;
    }

    /* const dcaBot = bot as DCABot | undefined;
    const maxDealsPerPair = dcaBot?.settings?.maxDealsPerPair;

    // Check max deals per symbol validation for multi-coin bots
    if (
      isMultiCoin &&
      selectedPairForDeal &&
      maxDealsPerPair &&
      maxDealsPerPair !== '' &&
      String(maxDealsPerPair) !== '0'
    ) {
      // Count active deals for this specific symbol
      const activeDealsForSymbol = (activeDealsData || []).filter(
        (deal) =>
          deal.symbol?.symbol === selectedPairForDeal && isActiveDeal(deal)
      ).length;

      if (activeDealsForSymbol >= Number(maxDealsPerPair)) {
        logger.info(`${LOG_PREFIX}: Max active deals reached for symbol`, {
          botId,
          selectedPair: selectedPairForDeal,
          activeDealsForSymbol,
          maxDealsPerPair,
        });
        setPairSelectDialogOpen(false);
        setMaxActiveDialog('symbol');
        return;
      }
    } */

    logger.info(`${LOG_PREFIX}: Opening deal for selected pair`, {
      botId,
      selectedPair: selectedPairForDeal,
      isComboBot,
    });

    openDeal({ botId, symbol: selectedPairForDeal || undefined });
    setPairSelectDialogOpen(false);
    setSelectedPairForDeal(null);
  }, [
    botId,
    /*  bot, */
    selectedPairForDeal,
    isComboBot,
    /* isMultiCoin, */
    /*  activeDealsData, */
    /* isActiveDeal, */
    openDeal,
  ]);

  // Combo deals: fetch all combo deals and filter locally for resilience
  /* const {
    deals: comboDeals,
    isLoading: comboLoading,
    isError: comboError,
  } = useComboDeals(); */

  /*  const comboDealsForBot = useMemo(() => {
    if (!isComboBot) return comboDeals;
    const targetBotId = botId;
    const targetBotName = bot?.settings?.name || bot?.name;

    logger.debug(
      '[DrawerDealsTable:DEAL_FILTERING] Filtering combo deals for bot',
      {
        totalComboDeals: comboDeals.length,
        targetBotId,
        targetBotName,
        allDealIds: comboDeals.map((d) => d._id),
        allDealStatuses: comboDeals.map((d) => d.status),
        allDealBotIds: comboDeals.map((d) => (d as ComboDeal).botId),
      }
    );

    return comboDeals.filter((deal) => {
      const dealBotId = (deal as ComboDeal).botId;
      if (targetBotId && dealBotId) {
        return dealBotId === targetBotId;
      }

      const dcaBotData = (deal as ComboDeal).dcaBot;
      const dealBotName =
        (deal as { botName?: string }).botName ||
        (Array.isArray(dcaBotData)
          ? dcaBotData[0]?.settings?.name
          : dcaBotData?.settings?.name);

      if (targetBotName && dealBotName) {
        return dealBotName === targetBotName;
      }

      return false;
    });
  }, [comboDeals, isComboBot, botId, bot?.name, bot?.settings?.name]); */

  // Hedge deals: aggregate from long/short legs
  /*  const hedgeDealsResult = useHedgeDeals(bot); */

  // Combine all deals for compatibility
  const botDeals = React.useMemo(() => {
    /* if (isHedgeDca || isHedgeCombo) {
      const result = hedgeDealsResult.deals as (DCADeals | ComboDeal)[];
      if (import.meta.env.DEV) {
        console.debug('[DrawerDealsTable] Hedge deals aggregation', {
          type: isHedgeDca ? 'hedgeDca' : 'hedgeCombo',
          total: result.length,
        });
      }
      return result;
    } */
    /* if (isComboBot) {
      const result = comboDealsForBot as (DCADeals | ComboDeal)[];
      if (import.meta.env.DEV) {
        console.debug('[DrawerDealsTable] Combo deals', {
          total: result.length,
        });
      }
      return result;
    } */
    const result = [...deals] as (DCADeals | ComboDeal)[];
    if (import.meta.env.DEV) {
      logger.debug('[DrawerDealsTable] DCA deals', { total: result.length });
    }
    return result;
  }, [
    /* isHedgeDca,
    isHedgeCombo, */
    /*  hedgeDealsResult.deals, */
    /* isComboBot, */
    /*  comboDealsForBot, */
    /*  activeDealsData,
    closedDealsData, */
    deals,
  ]);

  // Combined loading and error states
  const isLoading = /*  isHedgeDca || isHedgeCombo
      ? hedgeDealsResult.isLoading
      : */ /* isComboBot ? comboLoading : */ /* activeLoading || closedLoading */ dealsLoading;
  const isError = /* isHedgeDca || isHedgeCombo
      ? hedgeDealsResult.isError
      : */ /* isComboBot ? comboError : */ /* activeError || closedError */ dealsError;
  const [allFees, setAllFees] = useState<
    Array<{ exchange: string; symbol: string; fee: number }>
  >([]);
  const [currentPrices, setCurrentPrices] = useState(() => getLocalPrices());
  const memoizedAllFees = useMemo(() => allFees, [allFees]);
  const memoizedPrices = useMemo(() => currentPrices, [currentPrices]);
  const [stableDependencies, setStableDependencies] = useState(() => ({
    prices: memoizedPrices,
    fees: memoizedAllFees,
    lastUpdated: Date.now(),
  }));

  // Live prices feed the unrealized/net P&L computation in
  // transformDealToTrade. Until they arrive that transform falls back to a
  // stale/zero value, so gate the price-dependent cells on a skeleton — in
  // lockstep with the exact prices the transform reads (legacy parity with
  // main-dash's per-row `loadedPrices`).
  const pricesLoading = stableDependencies.prices.length === 0;

  const tokens = useAuthStore((state) => state.tokens);

  const { fetchMultipleFees } = useUserFees();

  // Fees must be fetched for EVERY symbol shown in this table, not just the
  // bot's configured settings.pair. A pair can be removed from settings (or
  // auto-dropped by the engine) while a deal on it stays open; those deal
  // symbols still need a fee, otherwise transformDealToTrade forces unrealized
  // P&L to undefined and the row renders "Price unavailable" even though the
  // price is present. Mirror the union-of-deal-symbols pattern the Overview /
  // positions view uses (useDcaDeals). Encoded as a stable string key so the
  // fetch effect only re-runs when the actual target set changes.
  const feeTargetsKey = useMemo(() => {
    const targets = new Set<string>();
    const botExchange = bot?.exchangeUUID;
    if (botExchange && bot?.settings?.pair) {
      for (const symbol of [bot.settings.pair].flat()) {
        if (symbol) targets.add(`${botExchange}\u001f${symbol}`);
      }
    }
    for (const deal of botDeals) {
      const dealExchange =
        (deal as DCADeals | ComboDeal).exchangeUUID || botExchange;
      const dealSymbol = deal.symbol?.symbol;
      if (dealExchange && dealSymbol) {
        targets.add(`${dealExchange}\u001f${dealSymbol}`);
      }
    }
    // Separator is U+001F (unit separator), not NUL: an exchange UUID and a
    // symbol can never contain it, and unlike a literal NUL it keeps this file
    // plain text. A NUL here made `grep` classify the whole file as binary and
    // silently report no matches for every symbol in it, which is how two
    // separate investigations concluded the `?editDealId=` deep link below was
    // dead code.
    return Array.from(targets).sort().join('\n');
  }, [bot?.exchangeUUID, bot?.settings?.pair, botDeals]);

  useEffect(() => {
    if (!feeTargetsKey) {
      return;
    }

    // Rebuild the exchange -> symbols map from the stable key.
    const exchangeSymbolMap = new Map<string, Set<string>>();
    for (const entry of feeTargetsKey.split('\n')) {
      const sep = entry.indexOf('\u001f');
      if (sep < 0) continue;
      const exchange = entry.slice(0, sep);
      const symbol = entry.slice(sep + 1);
      if (!exchangeSymbolMap.has(exchange)) {
        exchangeSymbolMap.set(exchange, new Set());
      }
      exchangeSymbolMap.get(exchange)?.add(symbol);
    }

    // Use the service to fetch fees with automatic caching
    fetchMultipleFees({
      exchangeSymbolMap,
      options: {
        debug: import.meta.env.DEV,
      },
    })
      .catch((error) => {
        logger.error(
          '[DrawerDealsTable] Error fetching fees via service:',
          error
        );
      })
      .then((res) => {
        setAllFees(
          (res || []).map((r) => ({
            exchange: r.exchangeUUID,
            symbol: r.symbol,
            fee: r.maker,
          }))
        );
      });
  }, [feeTargetsKey, tokens?.accessToken, fetchMultipleFees]);
  const lastPriceUpdateRef = useRef(0);
  const PRICE_UPDATE_THROTTLE_MS = 10000; // Increased to 10 seconds for better stability

  useEffect(() => {
    // Subscribe to price updates
    const unsubscribe = getLatestPrices((result) => {
      if (result.status === 'OK' && result.data) {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastPriceUpdateRef.current;

        // Throttle price updates to reduce re-renders
        if (timeSinceLastUpdate > PRICE_UPDATE_THROTTLE_MS) {
          setCurrentPrices(result.data);
          lastPriceUpdateRef.current = now;
        }
      }
    }, false); // false = don't load binance US

    return unsubscribe;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only update if there are actual changes
      if (
        stableDependencies.prices !== memoizedPrices ||
        stableDependencies.fees !== memoizedAllFees
      ) {
        setStableDependencies({
          prices: memoizedPrices,
          fees: memoizedAllFees,

          lastUpdated: Date.now(),
        });
      }
    }, 1500); // Increased debounce time to 1.5 seconds for better stability

    return () => clearTimeout(timer);
  }, [
    memoizedPrices,
    memoizedAllFees,

    stableDependencies.prices,
    stableDependencies.fees,
  ]);
  // Transform deals to match TradeCard format
  const transformDealToTradeWrapper = useCallback(
    (deal: DCADeals | ComboDeal): TransformedTrade =>
      transformDealToTrade(
        deal,
        stableDependencies.fees,
        stableDependencies.prices,
        bot
      ),
    [stableDependencies.fees, stableDependencies.prices, bot]
  );

  const comboActiveStatuses = useMemo(
    () => new Set(['active', 'open', 'start', 'error', 'range', 'monitoring']),
    []
  );
  const comboClosedStatuses = useMemo(
    () =>
      new Set([
        'closed',
        'completed',
        'canceled',
        'cancelled',
        'stopped',
        'finished',
        'done',
      ]),
    []
  );

  // Separate active and closed deals - using correct DCA deal statuses from enum
  const activeDealsRaw = useMemo(
    () =>
      botDeals.filter((deal: DCADeals | ComboDeal) => {
        const status = String(deal.status).toLowerCase();
        // DCA active statuses
        const dcaActive =
          status === DCADealStatusEnum.open ||
          status === DCADealStatusEnum.start ||
          status === DCADealStatusEnum.error;
        // Combo active statuses
        const comboActive = comboActiveStatuses.has(status);
        return isComboLike ? comboActive : dcaActive;
      }),
    [botDeals, isComboLike, comboActiveStatuses]
  );
  const activeDeals = useMemo(() => {
    return activeDealsRaw.map(transformDealToTradeWrapper);
  }, [activeDealsRaw, transformDealToTradeWrapper]);

  const handleEdit = useCallback(
    (trade: TransformedTrade) => {
      const find = activeDealsRaw.find((d) => d._id === trade.id);
      if (find && onEditDeal) {
        onEditDeal([find]);
      }
    },
    [activeDealsRaw, onEditDeal]
  );
  const closedDeals = useMemo(() => {
    const getCreateTime = (d: DCADeals | ComboDeal): number => {
      // DCADeals may use number timestamps; ComboDeal uses string
      if (typeof (d as ComboDeal).createTime === 'string') {
        return new Date((d as ComboDeal).createTime).getTime();
      }
      return (d as unknown as { createTime: number }).createTime;
    };

    const filtered = botDeals
      .filter((deal: DCADeals | ComboDeal) => {
        const status = String(deal.status).toLowerCase();
        const dcaClosed =
          status === DCADealStatusEnum.closed ||
          status === DCADealStatusEnum.canceled;
        const comboClosed = comboClosedStatuses.has(status);
        return isComboLike
          ? comboClosed || !comboActiveStatuses.has(status)
          : dcaClosed;
      })
      .sort((a: DCADeals | ComboDeal, b: DCADeals | ComboDeal) => {
        // Sort by creation time, newest first
        return getCreateTime(b) - getCreateTime(a);
      });

    logger.debug('[DrawerDealsTable:DEAL_FILTERING] Filtering closed deals', {
      totalDeals: botDeals.length,
      filteredClosed: filtered.length,
      isComboLike,
      closedDealIds: filtered.map((d) => d._id),
      closedDealStatuses: filtered.map((d) => d.status),
    });

    return filtered.map(transformDealToTradeWrapper);
  }, [
    botDeals,
    isComboLike,
    transformDealToTradeWrapper,
    comboClosedStatuses,
    comboActiveStatuses,
  ]);

  // Server-complete export: fetch EVERY page of the current tab's deals.
  // The table's own data is capped by useBotSpecificDeals' display
  // auto-loader (maxPages), so exporting the loaded rows silently truncates
  // large bots (forum: beta thread post #129 — 9 of 311 exported). Status
  // filter + sort mirror the activeDealsRaw / closedDeals memos above.
  const getExportData = useCallback(async (): Promise<
    TransformedTrade[] | null
  > => {
    try {
      toast.info('Preparing export — fetching all deals…');
      const raw = await fetchAllDeals();
      const wanted = raw.filter((deal: DCADeals | ComboDeal) => {
        const status = String(deal.status).toLowerCase();
        if (selectedTab === 'active') {
          return isComboLike
            ? comboActiveStatuses.has(status)
            : status === DCADealStatusEnum.open ||
                status === DCADealStatusEnum.start ||
                status === DCADealStatusEnum.error;
        }
        const dcaClosed =
          status === DCADealStatusEnum.closed ||
          status === DCADealStatusEnum.canceled;
        return isComboLike
          ? comboClosedStatuses.has(status) || !comboActiveStatuses.has(status)
          : dcaClosed;
      });
      const getCreateTime = (d: DCADeals | ComboDeal): number =>
        typeof (d as ComboDeal).createTime === 'string'
          ? new Date((d as ComboDeal).createTime).getTime()
          : (d as unknown as { createTime: number }).createTime;
      wanted.sort((a, b) => getCreateTime(b) - getCreateTime(a));
      return wanted.map(transformDealToTradeWrapper);
    } catch (error) {
      logger.error(`${LOG_PREFIX}: Failed to fetch all deals for export`, {
        botId,
        error,
      });
      toast.error(
        'Could not fetch all deals — the export will only include the loaded ones'
      );
      return null; // DataTable falls back to the loaded rows
    }
  }, [
    fetchAllDeals,
    selectedTab,
    isComboLike,
    comboActiveStatuses,
    comboClosedStatuses,
    transformDealToTradeWrapper,
    botId,
  ]);

  useEffect(() => {
    const editDealId = searchParams.get('editDealId');
    const chartDealId = searchParams.get('chartDealId');

    if (!editDealId && !chartDealId) {
      return;
    }

    if (selectedTab !== 'active') {
      setSelectedTab('active');
    }

    let handled = false;

    if (chartDealId) {
      const chartTarget = activeDeals.find((deal) => deal.id === chartDealId);
      if (chartTarget) {
        onTradeSelect(chartTarget, true);
        handled = true;
      }
    }

    if (editDealId && onEditDeal) {
      const editTarget = activeDealsRaw.find((deal) => deal._id === editDealId);
      if (editTarget) {
        onEditDeal([editTarget]);
        handled = true;
      }
    }

    if (handled) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('editDealId');
      nextParams.delete('chartDealId');
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    searchParams,
    setSearchParams,
    selectedTab,
    activeDeals,
    activeDealsRaw,
    onTradeSelect,
    onEditDeal,
  ]);

  // Deep-link restore: open the parent-supplied `autoOpenDealId` once it's in
  // the loaded set, then notify the parent so it stops supplying it. Because
  // the parent makes this a one-shot, a remount of this list after Back/Close
  // sees `autoOpenDealId === null` and can't re-open the deal.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || !autoOpenDealId) {
      return;
    }
    const isClosed = closedDeals.some((d) => d.id === autoOpenDealId);
    const target =
      activeDeals.find((d) => d.id === autoOpenDealId) ??
      closedDeals.find((d) => d.id === autoOpenDealId);
    if (!target) {
      // Deals may still be loading — retry when activeDeals/closedDeals update.
      return;
    }
    autoOpenedRef.current = true;
    if (isClosed && selectedTab !== 'closed') {
      setSelectedTab('closed');
    }
    onTradeSelect(target);
    onAutoOpenHandled?.();
  }, [
    autoOpenDealId,
    activeDeals,
    closedDeals,
    selectedTab,
    onTradeSelect,
    onAutoOpenHandled,
  ]);

  // Bulk Add/Reduce Funds — same shared flow the Trading page, the Trading
  // Terminal and the dashboard Open Orders widget use.
  const {
    open: openBulkAdjustFunds,
    dialog: bulkAdjustFundsDialog,
  } = useBulkAdjustFunds();
  const toAdjustFundsTarget = useCallback(
    (deal: TransformedTrade): BulkAdjustFundsTarget => ({
      dealId: deal.id,
      botId: deal.botId ?? botId,
      status: deal.status,
      // The row menu hides Add/Reduce Funds on combo bots; the drawer's deals
      // carry no bot type of their own, so it comes from the bot.
      type: isComboBot ? 'Combo' : deal.type,
      baseAsset:
        typeof deal.symbol === 'string' ? undefined : deal.symbol.baseAsset,
      quoteAsset:
        typeof deal.symbol === 'string' ? undefined : deal.symbol.quoteAsset,
      symbol:
        typeof deal.symbol === 'string' ? deal.symbol : deal.symbol.symbol,
      exchange: deal.exchange,
      percentBasis: deal.percentBasis,
    }),
    [botId, isComboBot]
  );

  const adjustFundsMutation = useAdjustFunds();
  const handleAdjustFundsConfirm = useCallback(
    (
      dealId: string,
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
    [botId, adjustFundsMutation]
  );
  const handleRowClick = useCallback(
    (trade: TransformedTrade, onlyChart = false) => {
      onTradeSelect(trade, onlyChart);
    },
    [onTradeSelect]
  );
  // Keep current values in refs so cardComponentWrapper can read the latest values
  // without recreating the component type (which causes all cards to remount).
  const onTradeSelectRef = useRef(onTradeSelect);
  onTradeSelectRef.current = onTradeSelect;
  const privacyModeCardRef = useRef(privacyMode);
  privacyModeCardRef.current = privacyMode;
  const handleRowClickRef = useRef(handleRowClick);
  handleRowClickRef.current = handleRowClick;
  const completedOrdersRef = useRef(completedOrders);
  completedOrdersRef.current = completedOrders;
  const handleAdjustFundsConfirmRef = useRef(handleAdjustFundsConfirm);
  handleAdjustFundsConfirmRef.current = handleAdjustFundsConfirm;
  const isComboBotRef = useRef(isComboBot);
  isComboBotRef.current = isComboBot;
  const handleEditCardRef = useRef(handleEdit);
  handleEditCardRef.current = handleEdit;

  // Stable card component wrapper — useMemo([]) so reference never changes and cards never remount
  const cardComponentWrapper = useMemo(
    () => (props: { item: TransformedTrade; index: number }) => (
      <TradeCardWrapper
        {...props}
        onTradeSelect={(t) => onTradeSelectRef.current(t, true)}
        privacyMode={privacyModeCardRef.current}
        handleOpenDetailDrawer={handleRowClickRef.current}
        filledOrders={completedOrdersRef.current}
        handleAdjustFundsConfirm={handleAdjustFundsConfirmRef.current}
        botType={isComboBotRef.current ? BotTypesEnum.combo : BotTypesEnum.dca}
        handleEdit={handleEditCardRef.current}
      />
    ),
    [] // Never recreate — refs keep values current without changing component identity
  );

  // Handler for opening orders dialog
  const handleOpenOrdersDialog = useCallback((trade: TransformedTrade) => {
    setSelectedDealForOrders(trade);
    setOrdersDialogOpen(true);
  }, []);

  // Handler for opening detail drawer
  /* const handleOpenDetailDrawer = useCallback((trade: TransformedTrade) => {
    setSelectedDealForDrawer(trade);
    setDetailDrawerOpen(true);
  }, []); */

  // Handler for row click - only update chart symbol

  // Mutation for closing/canceling deals - must be defined before DealActionsMenu
  const bulkCloseDealMutation = useDealActions();
  const moveDealToTerminalMutation = useMoveDealToTerminal();
  const [moveBulkDialogOpen, setMoveBulkDialogOpen] = useState<
    TransformedTrade[]
  >([]);
  const [closeBulkDialogOpen, setCloseBulkDialogOpen] = useState<
    TransformedTrade[]
  >([]);
  const [cancelBulkDialogOpen, setCancelBulkDialogOpen] = useState<
    TransformedTrade[]
  >([]);
  const [mergeBulkDialogOpen, setMergeBulkDialogOpen] = useState<
    TransformedTrade[]
  >([]);
  const [journalBulkDialogOpen, setJournalBulkDialogOpen] = useState<
    TransformedTrade[]
  >([]);

  const canMoveTradeToTerminal = useCallback((trade: TransformedTrade) => {
    return (
      (trade.type === 'DCA' || trade.type === 'Combo') &&
      typeof trade.botId === 'string' &&
      trade.botId.length > 0 &&
      String(trade.status || '').toLowerCase() === DCADealStatusEnum.open
    );
  }, []);

  const handleMoveToTerminal = useCallback(
    async (trade: TransformedTrade) => {
      if (!canMoveTradeToTerminal(trade) || !trade.botId) {
        toast.error('Only open DCA or Combo bot deals can be moved to terminal');
        return;
      }

      try {
        const response = await moveDealToTerminalMutation.mutateAsync({
          dealId: trade.id,
          botId: trade.botId,
          combo: trade.type === 'Combo',
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
      }
    },
    [canMoveTradeToTerminal, moveDealToTerminalMutation]
  );

  const handleBulkMoveToTerminalConfirm = useCallback(async () => {
    const movableDeals = moveBulkDialogOpen.filter(canMoveTradeToTerminal);

    if (movableDeals.length === 0) {
      setMoveBulkDialogOpen([]);
      toast.info('Only open DCA or Combo bot deals can be moved to terminal');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const deal of movableDeals) {
      try {
        await moveDealToTerminalMutation.mutateAsync({
          dealId: deal.id,
          botId: deal.botId as string,
          combo: deal.type === 'Combo',
        });
        successCount += 1;
      } catch (error) {
        errorCount += 1;
        logger.error(`${LOG_PREFIX}: Failed bulk move to terminal`, {
          error,
          dealId: deal.id,
          botId: deal.botId,
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
  }, [canMoveTradeToTerminal, moveBulkDialogOpen, moveDealToTerminalMutation]);

  const handleBulkCloseConfirm = useCallback(
    (closeType: CloseDCATypeEnum) => {
      const selectedDeals = closeBulkDialogOpen;
      setCloseBulkDialogOpen([]);

      logger.info(`${LOG_PREFIX}: Bulk close deals`, {
        count: selectedDeals.length,
        closeType,
        dealIds: selectedDeals.map((d) => d.id),
      });

      let successCount = 0;
      let errorCount = 0;

      const closeFn = isComboLike
        ? bulkCloseDealMutation.closeComboDeal
        : bulkCloseDealMutation.closeDCADeal;

      selectedDeals.forEach((deal) => {
        if (!deal.botId) {
          logger.error(`${LOG_PREFIX}: Cannot close deal - missing botId`, {
            dealId: deal.id,
          });
          errorCount++;
          return;
        }

        try {
          closeFn(
            {
              dealId: deal.id,
              botId: deal.botId,
              type: closeType,
            },
            {
              onSuccess: () => {
                successCount++;
                logger.info(`${LOG_PREFIX}: Deal closed successfully`, {
                  dealId: deal.id,
                  botId: deal.botId,
                });
              },
              onError: (error) => {
                errorCount++;
                logger.error(`${LOG_PREFIX}: Failed to close deal`, {
                  dealId: deal.id,
                  botId: deal.botId,
                  error,
                });
              },
            }
          );
        } catch (error) {
          errorCount++;
          logger.error(`${LOG_PREFIX}: Exception closing deal`, {
            dealId: deal.id,
            error,
          });
        }
      });

      setTimeout(() => {
        if (successCount > 0) {
          toast.success(`Closed ${successCount} deal(s)`);
        }
        if (errorCount > 0) {
          toast.error(`Failed to close ${errorCount} deal(s)`);
        }
      }, 500);
    },
    [bulkCloseDealMutation, closeBulkDialogOpen, isComboLike]
  );

  // Get journal actions
  const addToJournalBulk = useTradeJournalStore((state) => state.addTrade);
  const mergeSmartOrdersMutation = useMergeSmartOrders();

  const handleBulkCancelConfirm = useCallback(() => {
    const selectedDeals = cancelBulkDialogOpen;
    setCancelBulkDialogOpen([]);

    logger.info(`${LOG_PREFIX}: Bulk cancel deals`, {
      count: selectedDeals.length,
      dealIds: selectedDeals.map((d) => d.id),
    });

    let successCount = 0;
    let errorCount = 0;

    const closeFn = isComboLike
      ? bulkCloseDealMutation.closeComboDeal
      : bulkCloseDealMutation.closeDCADeal;

    selectedDeals.forEach((deal) => {
      if (!deal.botId) {
        logger.error(`${LOG_PREFIX}: Cannot cancel deal - missing botId`, {
          dealId: deal.id,
        });
        errorCount++;
        return;
      }

      try {
        closeFn(
          {
            dealId: deal.id,
            botId: deal.botId,
            type: CloseDCATypeEnum.cancel,
          },
          {
            onSuccess: () => {
              successCount++;
              logger.info(`${LOG_PREFIX}: Deal canceled successfully`, {
                dealId: deal.id,
                botId: deal.botId,
              });
            },
            onError: (error) => {
              errorCount++;
              logger.error(`${LOG_PREFIX}: Failed to cancel deal`, {
                dealId: deal.id,
                botId: deal.botId,
                error,
              });
            },
          }
        );
      } catch (error) {
        errorCount++;
        logger.error(`${LOG_PREFIX}: Exception canceling deal`, {
          dealId: deal.id,
          error,
        });
      }
    });

    setTimeout(() => {
      if (successCount > 0) {
        toast.success(`Canceled ${successCount} deal(s)`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to cancel ${errorCount} deal(s)`);
      }
    }, 500);
  }, [bulkCloseDealMutation, cancelBulkDialogOpen, isComboLike]);

  const handleBulkMergeConfirm = useCallback(async () => {
    const selectedDeals = mergeBulkDialogOpen;
    setMergeBulkDialogOpen([]);

    if (selectedDeals.length < 2) {
      return;
    }

    const firstBotId = selectedDeals[0].botId;
    const firstSymbol =
      typeof selectedDeals[0].symbol === 'string'
        ? selectedDeals[0].symbol
        : selectedDeals[0].symbol.symbol;
    const firstExchange = selectedDeals[0].exchange;

    if (!firstBotId) {
      toast.error('Cannot merge deals - missing bot ID');
      return;
    }

    logger.info(`${LOG_PREFIX}: Merging deals`, {
      count: selectedDeals.length,
      symbol: firstSymbol,
      exchange: firstExchange,
      dealIds: selectedDeals.map((d) => d.id),
    });

    try {
      await mergeSmartOrdersMutation.mutateAsync({
        botId: firstBotId,
        dealIds: selectedDeals.map((d) => d.id),
      });
    } catch (error) {
      logger.error(`${LOG_PREFIX}: Failed to merge deals`, { error });
    }
  }, [mergeBulkDialogOpen, mergeSmartOrdersMutation]);

  const handleBulkJournalConfirm = useCallback(async () => {
    const selectedDeals = journalBulkDialogOpen;
    setJournalBulkDialogOpen([]);

    logger.info(`${LOG_PREFIX}: Bulk add to journal`, {
      count: selectedDeals.length,
    });

    let successCount = 0;

    for (const deal of selectedDeals) {
      try {
        const dealOrders = completedOrders.filter(
          (order) => order.dealId === deal.id
        );

        const executions = dealOrders.map((order) => ({
          id: order.clientOrderId,
          action: (order.side === 'buy' ? 'buy' : 'sell') as 'buy' | 'sell',
          timestamp: order.updateTime || order.time || Date.now(),
          quantity: Number(order.executedQty || order.origQty || 0),
          price: Number(order.price || 0),
          fee: 0,
          cost:
            Number(order.executedQty || order.origQty || 0) *
            Number(order.price || 0),
        }));

        const entryTime = deal.created
          ? new Date(deal.created).getTime()
          : Date.now();

        const isOpenTrade = ['open', 'active', 'start'].includes(
          deal.status.toLowerCase()
        );
        const isCancelledTrade = ['canceled', 'cancelled'].includes(
          deal.status.toLowerCase()
        );

        const profitUsd = deal.profit?.totalUsd || 0;
        const initialInvestment = deal.cost || 0;
        const calculatedROI =
          initialInvestment > 0 ? (profitUsd / initialInvestment) * 100 : 0;

        const symbolString =
          typeof deal.symbol === 'string' ? deal.symbol : deal.symbol.symbol;

        const journalEntry: any = {
          symbol: symbolString,
          exchange: deal.exchange,
          direction: (deal.side?.toUpperCase() === 'LONG' ||
          deal.side?.toUpperCase() === 'BUY'
            ? 'long'
            : 'short') as 'long' | 'short',
          entryPrice: deal.entryPrice || deal.avgPrice || 0,
          entryTime: entryTime,
          amount: deal.size || deal.currentBalance.base || 0,
          pnl: profitUsd,
          roi: calculatedROI,
          marketType: (deal.dealType === 'FUTURES' ? 'futures' : 'spot') as
            | 'spot'
            | 'futures',
          notes: `Deal from ${deal.type} bot${deal.botName ? ` (${deal.botName})` : ''}${isOpenTrade ? ' (Open - Unrealized PNL)' : ''}${isCancelledTrade ? ' (Cancelled)' : ''}`,
          executions: executions.length > 0 ? executions : undefined,
        };

        addToJournalBulk(journalEntry);
        successCount++;
      } catch (error) {
        logger.error(`${LOG_PREFIX}: Failed to add deal to journal`, {
          error,
          dealId: deal.id,
        });
      }
    }

    if (successCount > 0) {
      toast.success(`Added ${successCount} deal(s) to journal`);
    }
    if (successCount < selectedDeals.length) {
      toast.error(
        `Failed to add ${selectedDeals.length - successCount} deal(s)`
      );
    }
  }, [addToJournalBulk, completedOrders, journalBulkDialogOpen]);

  // Individual deal actions menu component

  // Bulk actions implementation
  const bulkActions = useMemo<BulkAction<TransformedTrade>[]>(
    () =>
      createSharedDealBulkActions<TransformedTrade>({
        onMerge: (selectedDeals) => {
          if (selectedDeals.length < 2) {
            toast.error('Select at least 2 deals to merge');
            return;
          }

          const firstSymbol =
            typeof selectedDeals[0].symbol === 'string'
              ? selectedDeals[0].symbol
              : selectedDeals[0].symbol.symbol;
          const firstExchange = selectedDeals[0].exchange;

          const allSameSymbol = selectedDeals.every((deal) => {
            const dealSymbol =
              typeof deal.symbol === 'string'
                ? deal.symbol
                : deal.symbol.symbol;
            return dealSymbol === firstSymbol;
          });

          const allSameExchange = selectedDeals.every(
            (deal) => deal.exchange === firstExchange
          );

          if (!allSameSymbol) {
            toast.error('All selected deals must have the same trading pair');
            return;
          }

          if (!allSameExchange) {
            toast.error('All selected deals must be on the same exchange');
            return;
          }

          setMergeBulkDialogOpen(selectedDeals);
        },
        onAddToJournal: (selectedDeals) => {
          setJournalBulkDialogOpen(selectedDeals);
        },
        onAddFunds: (selectedDeals) => {
          openBulkAdjustFunds('add', selectedDeals.map(toAdjustFundsTarget));
        },
        onReduceFunds: (selectedDeals) => {
          openBulkAdjustFunds('reduce', selectedDeals.map(toAdjustFundsTarget));
        },
        onEdit: (selectedDeals) => {
          if (selectedDeals.length === 0) return;
          const ids = selectedDeals.map((d) => d.id);
          const find = activeDealsRaw.filter((d) => ids.includes(d._id));
          if (find.length > 0 && onEditDeal) {
            onEditDeal(find);
            logger.info(
              `${LOG_PREFIX}: Bulk edit - opening edit drawer for first deal`,
              {
                dealId: selectedDeals[0].id,
                totalSelected: selectedDeals.length,
              }
            );
          } else {
            logger.info(
              `${LOG_PREFIX}: Bulk edit - deal not found or no edit handler`,
              {
                dealId: selectedDeals[0].id,
              }
            );
            toast.error('Could not find deal to edit');
          }
        },
        onMoveToTerminal: (selectedDeals) => {
          setMoveBulkDialogOpen(selectedDeals.filter(canMoveTradeToTerminal));
        },
        onCancel: (selectedDeals) => {
          setCancelBulkDialogOpen(selectedDeals);
        },
        onClose: (selectedDeals) => {
          setCloseBulkDialogOpen(selectedDeals);
        },
        canMoveToTerminal: canMoveTradeToTerminal,
        canAdjustFunds: (deal) => canAdjustDealFunds(toAdjustFundsTarget(deal)),
        getSymbol: (deal) =>
          typeof deal.symbol === 'string' ? deal.symbol : deal.symbol.symbol,
      }),
    [
      activeDealsRaw,
      onEditDeal,
      canMoveTradeToTerminal,
      openBulkAdjustFunds,
      toAdjustFundsTarget,
    ]
  );

  // Define columns for the DataTable
  const columns = useMemo<
    ColumnDef<ReturnType<typeof transformDealToTradeWrapper>>[]
  >(() => {
    const baseColumns: ColumnDef<
      ReturnType<typeof transformDealToTradeWrapper>
    >[] = [
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const trade = row.original;
          let chip = (
            <StatusChip status={trade.status} size="sm" dotOnly={true} />
          );
          // A deal whose opening order the venue refused reads as an ordinary
          // pending deal here - same chip, no orders, all-zero numbers. The dot
          // alone cannot say that, so hang the reason off it: this table is
          // where a user scans for the deal that "did nothing".
          if (trade.startBlocked?.reason) {
            chip = (
              <HelpTooltip tooltip={dealStartBlockedSummary(trade.startBlocked)}>
                <span
                  className="relative inline-flex items-center gap-0.5"
                  data-testid="deal-start-blocked-dot"
                >
                  {chip}
                  <PauseCircle className="size-3 text-amber-500" />
                </span>
              </HelpTooltip>
            );
          }
          // Trailing is invisible otherwise: the dot only says open/closed, and
          // an armed trailing exit replaces the deal's TP/SL entirely, so
          // without this the user cannot tell a deal is riding its best price.
          if (!trade.trailingMode || !trade.trailingLevel) {
            return chip;
          }
          return (
            <div className="flex flex-col items-start gap-0.5">
              {chip}
              <TrailingBadge
                mode={trade.trailingMode}
                level={trade.trailingLevel}
                quoteAsset={
                  typeof trade.symbol === 'string'
                    ? undefined
                    : trade.symbol.quoteAsset
                }
              />
            </div>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
      },
      {
        id: 'symbol',
        accessorFn: (row) => {
          const symbolObj = row.symbol;
          if (typeof symbolObj === 'string') {
            return symbolObj;
          }
          return symbolObj.symbol;
        },
        header: 'Pair',
        cell: ({ row }) => {
          const trade = row.original;
          const symbolObj = trade.symbol;

          // Get base and quote assets from the symbol object
          let baseAsset: string;
          let quoteAsset: string;
          let symbolString: string;

          if (typeof symbolObj === 'string') {
            // Fallback: parse from string
            symbolString = symbolObj;
            const parts = symbolString.split('/');
            baseAsset =
              parts[0] || symbolString.replace(/USDT|USDC|BUSD|USD/, '');
            quoteAsset = parts[1] || 'USDT';
          } else {
            // Use properties from symbol object
            symbolString = symbolObj.symbol;
            baseAsset =
              symbolObj.baseAsset || symbolString.split('/')[0] || 'BTC';
            quoteAsset =
              symbolObj.quoteAsset || symbolString.split('/')[1] || 'USDT';
          }

          return (
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              pair={symbolString}
              iconSize="sm"
              showText={true}
              className="font-medium"
            />
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
      },
      {
        id: 'strategy',
        accessorKey: 'strategy',
        header: 'Strategy',
        cell: ({ row }) => {
          const strategy = row.original.strategy;
          if (!strategy)
            return <span className="text-muted-foreground">-</span>;
          return (
            <StrategyChip strategy={strategy} size="xs" chipStyle="solid" />
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
      },
      {
        id: 'avgPrice',
        accessorKey: 'avgPrice',
        header: 'Avg Price',
        cell: ({ row }) => {
          const trade = row.original;
          const value = Number(trade.avgPrice || 0);
          const symbolObj = trade.symbol;
          const quoteAsset =
            typeof symbolObj === 'string' ? '' : symbolObj.quoteAsset || '';
          if (!value) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="text-sm font-medium">
              {formatNumber(value, true)} {quoteAsset}
            </div>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
        sortingFn: 'basic',
      },
      {
        id: 'initialPrice',
        accessorFn: (row) =>
          Number(row.initialPrice || row.entryPrice || row.avgPrice || 0),
        header: 'Entry Price',
        cell: ({ row }) => {
          const trade = row.original;
          const value = Number(
            trade.initialPrice || trade.entryPrice || trade.avgPrice || 0
          );
          const symbolObj = trade.symbol;
          const quoteAsset =
            typeof symbolObj === 'string' ? '' : symbolObj.quoteAsset || '';
          if (!value) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="text-sm font-medium">
              {formatNumber(value, true)} {quoteAsset}
            </div>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
        sortingFn: 'basic',
      },
      {
        id: 'cost',
        accessorKey: 'cost',
        header: 'Cost',
        cell: ({ row }) => {
          const trade = row.original;
          const cost = trade.cost || 0;
          const symbolObj = trade.symbol;
          const quoteAsset =
            typeof symbolObj === 'string'
              ? 'USDT'
              : symbolObj.quoteAsset || 'USDT';

          return (
            <div className="text-sm font-medium">
              {privacyMode
                ? '***'
                : `${formatNumber(cost, false)} ${quoteAsset}`}
            </div>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
        sortingFn: 'basic',
      },
      {
        id: 'created',
        accessorFn: (row) => {
          const createdDate = row.created
            ? new Date(row.created).getTime()
            : row.createdTime
              ? row.createdTime instanceof Date
                ? row.createdTime.getTime()
                : new Date(row.createdTime).getTime()
              : 0;
          return createdDate;
        },
        header: 'Created',
        cell: ({ row }) => {
          const trade = row.original;
          const createdDate = trade.created
            ? new Date(trade.created)
            : trade.createdTime
              ? trade.createdTime
              : null;

          return (
            <div className="text-sm">
              {createdDate ? (
                <div className="flex flex-col">
                  <span className="font-medium">
                    {createdDate.toLocaleDateString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {createdDate.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">N/A</span>
              )}
            </div>
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
      },
      {
        id: 'orders',
        accessorFn: (row) => row.levels.complete,
        header: 'Orders',
        cell: ({ row }) => {
          const trade = row.original;
          const levels = trade.levels;
          return (
            <span className="text-sm font-medium">
              {levels.complete} / {levels.all}
            </span>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
      },
      {
        id: 'usage',
        // `usage.currentUsd`/`maxUsd` are quote-side only (see
        // transformDealToTrade), so this ring read 0% for SHORT spot and COIN-M
        // deals, whose usage is tracked on the BASE side. Reuse the row's
        // strategy-aware `outerGaugePercent` — the same value the card view and
        // the OpenOrdersWidget usage column already render.
        accessorFn: (row) => row.outerGaugePercent ?? row.usagePercentage ?? 0,
        header: 'Usage',
        cell: ({ row }) => {
          const trade = row.original;
          const usagePercent = Math.round(
            trade.outerGaugePercent ?? trade.usagePercentage ?? 0
          );
          return (
            <div
              className="flex justify-center cursor-pointer hover:opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenOrdersDialog(trade);
              }}
            >
              <DualArcProgressGauge
                size={40}
                outerPercentage={usagePercent}
                innerPercentage={0}
                centerText={`${usagePercent}%`}
                label={`${trade.levels.complete}/${trade.levels.all}`}
                showInnerGauge={false}
              />
            </div>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
        meta: { filterType: 'number' },
        sortingFn: 'basic',
      },
      {
        id: 'size',
        accessorKey: 'size',
        header: 'Size',
        cell: ({ row }) => {
          const trade = row.original;
          const size = trade.size || 0;
          const symbolObj = trade.symbol;
          const baseAsset =
            typeof symbolObj === 'string'
              ? 'BTC'
              : symbolObj.baseAsset || 'BTC';

          if (size === 0 || isNaN(+(size || '0'))) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <div className="text-sm font-medium">
              {formatNumber(size, false)} {baseAsset}
            </div>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
        sortingFn: 'basic',
      },
      {
        id: 'value',
        accessorKey: 'value',
        header: 'Notional Value',
        cell: ({ row }) => {
          const trade = row.original;
          const value = trade.value || 0;
          const symbolObj = trade.symbol;
          const quoteAsset =
            typeof symbolObj === 'string'
              ? 'USDT'
              : symbolObj.quoteAsset || 'USDT';

          if (value === 0 || isNaN(+(value || '0'))) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <div className="text-sm font-medium">
              {formatNumber(value, false)} {quoteAsset}
            </div>
          );
        },
        enableSorting: true,
        enableColumnFilter: true,
        sortingFn: 'basic',
      },
      {
        id: 'drawdown',
        accessorKey: 'drawdown',
        header: 'Drawdown',
        cell: ({ row }) => {
          const trade = row.original;
          const drawdown = trade.drawdown || 0;
          if (drawdown === 0) {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <ProfitLossPercChip
              value={-Math.abs(drawdown)}
              size="sm"
              showSign={false}
            />
          );
        },
        enableSorting: true,
        sortingFn: 'basic',
      },
      {
        id: 'runUp',
        accessorKey: 'runUp',
        header: 'Run Up',
        cell: ({ row }) => {
          const trade = row.original;
          const runUp = trade.runUp || 0;
          if (runUp === 0) {
            return <span className="text-muted-foreground">-</span>;
          }
          return <ProfitLossPercChip value={runUp} size="sm" showSign={true} />;
        },
        enableSorting: true,
        sortingFn: 'basic',
      },
      {
        id: 'timeInLoss',
        accessorKey: 'timeInLoss',
        header: 'Time In Loss',
        cell: ({ row }) => {
          const trade = row.original;
          const value = trade.timeInLoss || '';
          if (!value || value === '-') {
            return <span className="text-muted-foreground">-</span>;
          }
          return <div className="text-sm">{value}</div>;
        },
        enableSorting: true,
        sortingFn: 'basic',
      },
      {
        id: 'timeInProfit',
        accessorKey: 'timeInProfit',
        header: 'Time In Profit',
        cell: ({ row }) => {
          const trade = row.original;
          const value = trade.timeInProfit || '';
          if (!value || value === '-') {
            return <span className="text-muted-foreground">-</span>;
          }
          return <div className="text-sm">{value}</div>;
        },
        enableSorting: true,
        sortingFn: 'basic',
      },
      {
        id: 'workingTime',
        accessorKey: 'workingTime',
        header: 'Working Time',
        cell: ({ row }) => {
          const trade = row.original;
          const value = trade.workingTime || '';
          if (!value) {
            return <span className="text-muted-foreground">-</span>;
          }
          return <div className="text-sm">{value}</div>;
        },
        enableSorting: true,
        sortingFn: 'basic',
      },
      {
        id: 'initialBalances',
        accessorKey: 'initialBalances',
        header: 'Initial Balances',
        cell: ({ row }) => {
          const balances = row.original.currentBalance;
          const baseAsset =
            typeof row.original.symbol === 'string'
              ? ''
              : row.original.symbol?.baseAsset || '';
          const quoteAsset =
            typeof row.original.symbol === 'string'
              ? ''
              : row.original.symbol?.quoteAsset || '';
          if (!balances)
            return <span className="text-muted-foreground">-</span>;
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
        enableSorting: false,
      },
      {
        id: 'currentBalances',
        accessorKey: 'currentBalance',
        header: 'Current Balances',
        cell: ({ row }) => {
          const balances = row.original.currentBalance;
          const baseAsset =
            typeof row.original.symbol === 'string'
              ? ''
              : row.original.symbol?.baseAsset || '';
          const quoteAsset =
            typeof row.original.symbol === 'string'
              ? ''
              : row.original.symbol?.quoteAsset || '';
          if (!balances)
            return <span className="text-muted-foreground">-</span>;
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
        enableSorting: false,
      },
      {
        id: 'closeTrigger',
        accessorKey: 'closeTrigger',
        header: 'Close Trigger',
        cell: ({ row }) => {
          const value = (row.original as any).closeTrigger;
          const status = row.original.status?.toLowerCase();
          // Only show for closed deals
          if ((status !== 'closed' && status !== 'canceled') || !value)
            return <span className="text-muted-foreground">-</span>;
          return <span className="text-sm">{value}</span>;
        },
        enableSorting: false,
      },
      {
        id: 'closePrice',
        accessorKey: 'exitPrice',
        header: 'Close Price',
        cell: ({ row }) => {
          const closePrice = row.original.exitPrice || 0;
          const status = row.original.status?.toLowerCase();
          if ((status !== 'closed' && status !== 'canceled') || !closePrice)
            return <span className="text-muted-foreground">-</span>;
          return formatNumber(closePrice, true);
        },
        enableSorting: true,
      },
      {
        id: 'gridProfit',
        accessorKey: 'gridProfitUsd',
        header: 'Grid Profit',
        cell: ({ row }) => {
          const type = row.original.type;
          // Only show for Combo and Hedge Combo bots
          if (type !== 'Combo' && type !== 'Hedge Combo') {
            return <span className="text-muted-foreground">-</span>;
          }
          const gridProfitUsd = (row.original as any).gridProfitUsd || 0;
          if (gridProfitUsd === 0)
            return <span className="text-muted-foreground">-</span>;
          const cost = row.original.cost || 0;
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
        enableSorting: true,
      },
      {
        id: 'gridProfitPercentage',
        accessorFn: (row) => {
          const type = row.type;
          if (type !== 'Combo' && type !== 'Hedge Combo') return 0;
          const gridProfitUsd = (row as any).gridProfitUsd || 0;
          const cost = row.cost || 0;
          return cost > 0 ? (gridProfitUsd / cost) * 100 : 0;
        },
        header: 'Grid Profit, %',
        cell: ({ row }) => {
          const type = row.original.type;
          if (type !== 'Combo' && type !== 'Hedge Combo') {
            return <span className="text-muted-foreground">-</span>;
          }
          const gridProfitUsd = (row.original as any).gridProfitUsd || 0;
          if (gridProfitUsd === 0)
            return <span className="text-muted-foreground">-</span>;
          const cost = row.original.cost || 0;
          const percentage = cost > 0 ? (gridProfitUsd / cost) * 100 : 0;
          if (privacyMode) {
            return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
          }
          return <ProfitLossPercChip value={percentage} size="sm" />;
        },
        enableSorting: true,
      },
      {
        id: 'transactions',
        accessorKey: 'transactionsTotal',
        header: 'Transactions',
        cell: ({ row }) => {
          const type = row.original.type;
          // Only show for Combo and Hedge Combo bots
          if (type !== 'Combo' && type !== 'Hedge Combo') {
            return <span className="text-muted-foreground">-</span>;
          }
          const buy = (row.original as any).transactionsBuy || 0;
          const sell = (row.original as any).transactionsSell || 0;
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
        enableSorting: true,
      },
      {
        id: 'updateTime',
        accessorKey: 'updateTime',
        header: 'Update Time',
        cell: ({ row }) => {
          const value = (row.original as any).updateTime;
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
        enableSorting: true,
      },
      {
        id: 'closeTime',
        accessorKey: 'closeTime',
        header: 'Close Time',
        cell: ({ row }) => {
          const value = (row.original as any).closeTime;
          const status = row.original.status?.toLowerCase();
          if ((status !== 'closed' && status !== 'canceled') || !value)
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
        enableSorting: true,
      },
      {
        id: 'takeProfitConfig',
        accessorKey: 'takeProfitConfig',
        header: 'Take Profit Config',
        cell: ({ row }) => {
          const value = row.original.takeProfitConfig;
          if (!value || value === '-')
            return <span className="text-muted-foreground">-</span>;
          return <span className="text-sm whitespace-pre-line">{value}</span>;
        },
        enableSorting: false,
      },
      {
        id: 'stopLossConfig',
        accessorKey: 'stopLossConfig',
        header: 'Stop Loss Config',
        cell: ({ row }) => {
          const value = row.original.stopLossConfig;
          if (!value || value === '-')
            return <span className="text-muted-foreground">-</span>;
          return <span className="text-sm whitespace-pre-line">{value}</span>;
        },
        enableSorting: false,
      },
      {
        id: 'dealId',
        accessorKey: 'id',
        header: 'Deal ID',
        cell: ({ row }) => {
          const value = row.original.id;
          if (!value) return <span className="text-muted-foreground">-</span>;
          return <span className="text-xs font-mono">{value}</span>;
        },
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const trade = row.original;
          return (
            <div
              className="flex items-center justify-end"
              onClick={(e) => e.stopPropagation()}
            >
              <DealActionsMenu
                trade={trade}
                handleOpenDetailDrawer={handleRowClick}
                filledOrders={completedOrders}
                handleAdjustFundsConfirm={handleAdjustFundsConfirm}
                botType={isComboBot ? BotTypesEnum.combo : BotTypesEnum.dca}
                handleEdit={handleEdit}
                handleMoveToTerminal={handleMoveToTerminal}
              />
            </div>
          );
        },
        enableSorting: false,
      },
    ];

    const unrealizedPnlColumn: ColumnDef<
      ReturnType<typeof transformDealToTradeWrapper>
    > = {
      id: 'unrealizedPnl',
      accessorFn: (row) => toSortableMetricValue(row.unrealizedProfit),
      header: 'Unrealized P&L',
      cell: ({ row }) => {
        const trade = row.original;
        // Closed/canceled deals have no unrealized P&L (legacy parity).
        if (!trade.active) {
          return <span className="text-muted-foreground">-</span>;
        }
        if (pricesLoading) {
          return <Skeleton className="h-4 w-16" />;
        }
        const unrealizedPnl = trade.unrealizedProfit;
        if (isMetricUnavailable(unrealizedPnl)) {
          return (
            <span className="text-sm text-muted-foreground">
              Price unavailable
            </span>
          );
        }
        const cost = trade.cost || 0;
        const percentage = cost > 0 ? (Number(unrealizedPnl) / cost) * 100 : 0;
        return (
          <ProfitAndPerc
            value={Number(unrealizedPnl)}
            percentage={percentage}
            privacyMode={privacyMode}
            chipPosition="right"
            size="sm"
          />
        );
      },
      enableSorting: true,
      enableColumnFilter: true,
      sortingFn: 'basic',
    };

    const unrealizedPnlPercentageColumn: ColumnDef<
      ReturnType<typeof transformDealToTrade>
    > = {
      id: 'unrealizedPnlPercentage',
      accessorFn: (row) => {
        const percentage = calculatePnlPercentageNullable(
          row.unrealizedProfit,
          row.cost
        );
        return toSortableMetricValue(percentage);
      },
      header: 'Unrealized P&L, %',
      cell: ({ row }) => {
        const trade = row.original;
        // Closed/canceled deals have no unrealized P&L (legacy parity).
        if (!trade.active) {
          return <span className="text-muted-foreground">-</span>;
        }
        if (pricesLoading) {
          return <Skeleton className="h-4 w-12" />;
        }
        const unrealizedPnl = trade.unrealizedProfit;
        if (isMetricUnavailable(unrealizedPnl)) {
          return (
            <ProfitLossPercChip
              value={0}
              size="sm"
              textValue="Price unavailable"
            />
          );
        }
        const cost = trade.cost || 0;
        const percentage = cost > 0 ? (Number(unrealizedPnl) / cost) * 100 : 0;
        if (privacyMode) {
          return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
        }
        return <ProfitLossPercChip value={percentage} size="sm" />;
      },
      enableSorting: true,
      enableColumnFilter: true,
      enableHiding: true,
      sortingFn: 'basic',
    };

    const realizedPnlColumn: ColumnDef<
      ReturnType<typeof transformDealToTradeWrapper>
    > = {
      id: 'realizedPnl',
      accessorKey: 'profit.totalUsd',
      header: 'Realized P&L',
      cell: ({ row }) => {
        const trade = row.original;
        const realizedPnl = trade.profit?.totalUsd || trade.pnl || 0;
        const cost = trade.cost || 0;
        const percentage = cost > 0 ? (realizedPnl / cost) * 100 : 0;
        return (
          <ProfitAndPerc
            value={realizedPnl}
            percentage={percentage}
            privacyMode={privacyMode}
            chipPosition="right"
            size="sm"
          />
        );
      },
      enableSorting: true,
      enableColumnFilter: true,
      sortingFn: 'basic',
    };

    const realizedPnlPercentageColumn: ColumnDef<
      ReturnType<typeof transformDealToTradeWrapper>
    > = {
      id: 'realizedPnlPercentage',
      // Same dead accessor as the shared OpenOrdersWidget column: nothing
      // produces `realizedProfitPercentage` (`transformDealToTrade` emits
      // `profit`/`pnl`/`cost`), so TanStack read `undefined` for every row and
      // both the sort and the number filter were no-ops. Derive it with the
      // existing `calculatePnlPercentage` helper — same formula the cell uses.
      accessorFn: (row) =>
        calculatePnlPercentage(
          Number(row.profit?.totalUsd || row.pnl || 0),
          Number(row.cost || 0)
        ),
      header: 'Realized P&L, %',
      cell: ({ row }) => {
        const trade = row.original;
        const realizedPnl = trade.profit?.totalUsd || trade.pnl || 0;
        const cost = trade.cost || 0;
        const percentage = cost > 0 ? (realizedPnl / cost) * 100 : 0;
        if (privacyMode) {
          return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
        }
        return <ProfitLossPercChip value={percentage} size="sm" />;
      },
      enableSorting: true,
      enableColumnFilter: true,
      enableHiding: true,
      sortingFn: 'basic',
    };

    const netPnlColumn: ColumnDef<
      ReturnType<typeof transformDealToTradeWrapper>
    > = {
      id: 'netPnl',
      accessorFn: (row) => {
        const unrealizedPnl = row.unrealizedProfit || 0;
        const realizedPnl = row.profit?.totalUsd || row.pnl || 0;
        return unrealizedPnl + realizedPnl;
      },
      header: 'Net P&L',
      cell: ({ row }) => {
        const trade = row.original;
        if (trade.active && pricesLoading) {
          return <Skeleton className="h-4 w-16" />;
        }
        const unrealizedPnl = trade.unrealizedProfit || 0;
        const realizedPnl = trade.profit?.totalUsd || trade.pnl || 0;
        const netPnl = unrealizedPnl + realizedPnl;
        const cost = trade.cost || 0;
        const percentage = cost > 0 ? (netPnl / cost) * 100 : 0;
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
      enableSorting: true,
      enableColumnFilter: true,
      sortingFn: 'basic',
    };

    const netPnlPercentageColumn: ColumnDef<
      ReturnType<typeof transformDealToTradeWrapper>
    > = {
      id: 'netPnlPercentage',
      accessorFn: (row) => {
        const unrealizedPnl = row.unrealizedProfit || 0;
        const realizedPnl = row.profit?.totalUsd || row.pnl || 0;
        const netPnl = unrealizedPnl + realizedPnl;
        const cost = row.cost || 0;
        return cost > 0 ? (netPnl / cost) * 100 : 0;
      },
      header: 'Net P&L, %',
      cell: ({ row }) => {
        const trade = row.original;
        if (trade.active && pricesLoading) {
          return <Skeleton className="h-4 w-12" />;
        }
        const unrealizedPnl = trade.unrealizedProfit || 0;
        const realizedPnl = trade.profit?.totalUsd || trade.pnl || 0;
        const netPnl = unrealizedPnl + realizedPnl;
        const cost = trade.cost || 0;
        const percentage = cost > 0 ? (netPnl / cost) * 100 : 0;
        if (privacyMode) {
          return <ProfitLossPercChip value={0} size="sm" textValue="***" />;
        }
        return <ProfitLossPercChip value={percentage} size="sm" />;
      },
      enableSorting: true,
      enableColumnFilter: true,
      enableHiding: true,
      sortingFn: 'basic',
    };

    if (selectedTab === 'closed') {
      baseColumns.splice(4, 0, realizedPnlColumn);
      baseColumns.splice(5, 0, realizedPnlPercentageColumn);
    } else {
      baseColumns.splice(4, 0, unrealizedPnlColumn);
      baseColumns.splice(5, 0, unrealizedPnlPercentageColumn);
      baseColumns.splice(6, 0, netPnlColumn);
      baseColumns.splice(7, 0, netPnlPercentageColumn);
    }

    let filteredColumns = baseColumns;

    if (selectedTab === 'active') {
      filteredColumns = filteredColumns.filter(
        (column) =>
          column.id !== 'closeTrigger' &&
          column.id !== 'closePrice' &&
          column.id !== 'closeTime'
      );
    }

    if (!isComboBot) {
      filteredColumns = filteredColumns.filter(
        (column) => column.id !== 'gridProfit' && column.id !== 'transactions'
      );
    }

    return filteredColumns;
  }, [
    privacyMode,
    pricesLoading,
    handleOpenOrdersDialog,
    handleRowClick,
    completedOrders,
    handleAdjustFundsConfirm,
    isComboBot,
    selectedTab,
    handleEdit,
    handleMoveToTerminal,
  ]);

  const dealsData = useMemo(
    () => (selectedTab === 'active' ? activeDeals : closedDeals),
    [selectedTab, activeDeals, closedDeals]
  );

  const ordersForDealDialog = useMemo(
    () =>
      selectedDealForOrders
        ? [...pendingOrders, ...completedOrders].filter(
            (o) => o.dealId === selectedDealForOrders.id
          )
        : [],
    [completedOrders, pendingOrders, selectedDealForOrders]
  );
  const showTable = useMemo(
    () => (selectedTab === 'active' ? activeDeals : closedDeals).length > 0,
    [selectedTab, activeDeals, closedDeals]
  );
  const emptyMessage = useMemo(
    () => (selectedTab === 'active' ? 'No active deals' : 'No closed deals'),
    [selectedTab]
  );
  const defaultColumnVisibility = useMemo(
    () => ({
      unrealizedPnlPercentage: false,
      realizedPnlPercentage: false,
      gridProfitPercentage: false,
      netPnl: false,
      netPnlPercentage: false,
      dealId: false,
    }),
    []
  );
  const cardViewBreakpoints = useMemo(
    () => ({ default: 1, 600: 2, 768: 2, 1024: 2, 1280: 3 }),
    []
  );
  const firstToolbarAction = useMemo(
    () => (
      <div className="flex items-center gap-sm">
        <Select
          value={selectedTab}
          onValueChange={(value) =>
            setSelectedTab(value as 'active' | 'closed')
          }
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder={`Open (${activeDealsCount})`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Open ({activeDealsCount})</SelectItem>
            <SelectItem value="closed">Closed ({closedDealsCount})</SelectItem>
          </SelectContent>
        </Select>
        {selectedTab === 'active' ? (
          <Button
            variant="default"
            size="sm"
            onClick={handleOpenNewDeal}
            disabled={isOpenDealPending || !botId}
            className="gap-1"
          >
            <Plus className="w-4 h-4" />
            Open Deal
          </Button>
        ) : null}
      </div>
    ),
    [
      activeDealsCount,
      botId,
      closedDealsCount,
      handleOpenNewDeal,
      isOpenDealPending,
      selectedTab,
    ]
  );
  // Compact form: shown when the toolbar gets tight. Same Select (the deals
  // status filter is too important to drop) but with a w-32 trigger that
  // shows only the count, and the Open Deal button collapses to an icon-only
  // primary button.
  const firstToolbarActionCompact = useMemo(
    () => (
      <div className="flex items-center gap-1">
        <Select
          value={selectedTab}
          onValueChange={(value) =>
            setSelectedTab(value as 'active' | 'closed')
          }
        >
          <SelectTrigger className="h-9 w-24">
            <SelectValue
              placeholder={
                selectedTab === 'active'
                  ? `${activeDealsCount}`
                  : `${closedDealsCount}`
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Open ({activeDealsCount})</SelectItem>
            <SelectItem value="closed">Closed ({closedDealsCount})</SelectItem>
          </SelectContent>
        </Select>
        {selectedTab === 'active' ? (
          <Button
            variant="default"
            size="icon"
            onClick={handleOpenNewDeal}
            disabled={isOpenDealPending || !botId}
            className="h-9 w-9"
            title="Open new deal"
            aria-label="Open new deal"
          >
            <Plus className="w-4 h-4" />
          </Button>
        ) : null}
      </div>
    ),
    [
      activeDealsCount,
      botId,
      closedDealsCount,
      handleOpenNewDeal,
      isOpenDealPending,
      selectedTab,
    ]
  );
  // Clicking a row (or a card) plots the deal's entry/exit on the drawer
  // chart. Opening the full deal details stays on the row's "View Details"
  // menu entry, which calls `handleRowClick` with `onlyChart` unset.
  const onRowClick = useCallback(
    (t: TransformedTrade) => handleRowClick(t, true),
    [handleRowClick]
  );
  const getRowIsSelected = useCallback(
    (row: TransformedTrade) => row.id === selectedChartDealId,
    [selectedChartDealId]
  );
  const getRowId = useCallback((row: TransformedTrade) => row.id, []);
  const cardViewGap = useMemo(() => 16, []);
  const defaultView = useMemo(
    () => (showTable ? 'cards' : 'table'),
    [showTable]
  );
  // Error state — checked before loading so a failed fetch shows the error
  // rather than an indefinite spinner.
  if (isError) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center text-red-500 py-8">
          <p className="font-medium">Failed to load deals data</p>
          <p className="text-sm text-muted-foreground mt-1">
            Please check your connection and try again
          </p>
        </div>
      </div>
    );
  }

  // Loading state. Show the spinner on the initial load AND whenever a fetch is
  // still in flight for the current tab that has no rows yet — otherwise a bot
  // whose deals are still streaming in (e.g. multi-page auto-load) briefly
  // renders the empty "No deals" state instead of a loading indicator. Applies
  // to both the Open and Closed tabs, all bot types.
  if (isLoading || (dealsFetching && dealsData.length === 0)) {
    return <DealsLoadingIndicator />;
  }

  return (
    <>
      <div className="w-full h-full flex flex-col">
        {showTable ? (
          <DataTable
            tableId={`${widgetId}-${selectedTab}-deals`}
            columns={columns}
            data={dealsData}
            enableGlobalFilter
            enableColumnFilters
            enableSorting
            enableColumnVisibility
            defaultColumnVisibility={defaultColumnVisibility}
            defaultPinnedColumns={{ left: [], right: ['actions'] }}
            enableCardView
            cardComponent={cardComponentWrapper}
            defaultView={defaultView}
            cardViewBreakpoints={cardViewBreakpoints}
            cardViewGap={cardViewGap}
            emptyMessage={emptyMessage}
            onRowClick={onRowClick}
            getRowIsSelected={getRowIsSelected}
            bulkActions={bulkActions}
            getRowId={getRowId}
            firstToolbarActions={firstToolbarAction}
            firstToolbarActionsCompact={firstToolbarActionCompact}
            getExportData={getExportData}
            serverTotalRows={dealsServerTotal}
            exportFilename={`${selectedTab === 'active' ? 'open' : 'closed'}-deals`}
          />
        ) : (
          <div className="flex flex-col">
            {/* Keep the Open/Closed status filter reachable even when the
                current tab has no deals — otherwise closed deals are
                stranded behind an empty "Open" tab (e.g. a combo bot with
                0 open but 42 closed deals). */}
            <div className="flex items-center py-2">
              <Select
                value={selectedTab}
                onValueChange={(value) =>
                  setSelectedTab(value as 'active' | 'closed')
                }
              >
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder={`Open (${activeDealsCount})`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    Open ({activeDealsCount})
                  </SelectItem>
                  <SelectItem value="closed">
                    Closed ({closedDealsCount})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-center py-8 text-muted-foreground">
              {selectedTab === 'active' ? (
                <Handshake className="w-8 h-8 mx-auto mb-2 opacity-50" />
              ) : (
                <Square className="w-8 h-8 mx-auto mb-2 opacity-50" />
              )}
              <p>
                {selectedTab === 'active'
                  ? 'No active deals'
                  : 'No closed deals'}
              </p>
              <p className="text-sm">
                {selectedTab === 'active'
                  ? 'Deals will appear here when the bot starts trading'
                  : 'Completed deals will appear here'}
              </p>
              {selectedTab === 'active' ? (
                <div className="flex items-center justify-center gap-4 ">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleOpenNewDeal}
                    disabled={isOpenDealPending || !botId}
                    className="mt-4 gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Open New Deal
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Orders Dialog */}
      {selectedDealForOrders && (
        <DealOrdersDialog
          open={ordersDialogOpen}
          onClose={() => {
            setOrdersDialogOpen(false);
            setSelectedDealForOrders(null);
          }}
          dealId={selectedDealForOrders.id}
          botId={selectedDealForOrders.botId || botId || ''}
          symbol={
            typeof selectedDealForOrders.symbol === 'string'
              ? selectedDealForOrders.symbol
              : selectedDealForOrders.symbol.symbol
          }
          exchange={selectedDealForOrders.exchange}
          orders={ordersForDealDialog}
        />
      )}

      <ConfirmationDialog
        open={!!moveBulkDialogOpen.length}
        onOpenChange={() => setMoveBulkDialogOpen([])}
        title="Move deal to terminal"
        description={`Are you sure you want to move ${moveBulkDialogOpen.length} ${moveBulkDialogOpen.length > 1 ? 'deals' : 'deal'} to the terminal? ${MOVE_TO_TERMINAL_WARNING}`}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={handleBulkMoveToTerminalConfirm}
      />

      <CloseOptionsDialog
        open={!!closeBulkDialogOpen.length}
        onOpenChange={(open) => {
          if (!open) {
            setCloseBulkDialogOpen([]);
          }
        }}
        onConfirm={handleBulkCloseConfirm}
        defaultCloseType={CloseDCATypeEnum.closeByMarket}
        ignoreOptions={[CloseDCATypeEnum.leave]}
        mode="deal"
      />

      <ConfirmationDialog
        open={!!cancelBulkDialogOpen.length}
        onOpenChange={(open) => {
          if (!open) {
            setCancelBulkDialogOpen([]);
          }
        }}
        title={
          cancelBulkDialogOpen.length === 1 ? 'Cancel deal' : 'Cancel deals'
        }
        description={`Remove ${cancelBulkDialogOpen.length} ${cancelBulkDialogOpen.length === 1 ? 'deal' : 'deals'} from Gainium and cancel any pending exchange orders. Open positions on the exchange will be left untouched and must be managed manually.`}
        confirmText={
          cancelBulkDialogOpen.length === 1
            ? 'Cancel deal'
            : `Cancel ${cancelBulkDialogOpen.length} deals`
        }
        cancelText="Keep deals"
        variant="destructive"
        onConfirm={handleBulkCancelConfirm}
      />

      <ConfirmationDialog
        open={!!mergeBulkDialogOpen.length}
        onOpenChange={(open) => {
          if (!open) {
            setMergeBulkDialogOpen([]);
          }
        }}
        title={`Merge ${mergeBulkDialogOpen.length} deals`}
        description={`Combine ${mergeBulkDialogOpen.length} deals on ${mergeBulkDialogOpen[0]?.exchange ?? ''} ${typeof mergeBulkDialogOpen[0]?.symbol === 'string' ? mergeBulkDialogOpen[0]?.symbol : mergeBulkDialogOpen[0]?.symbol.symbol ?? ''} into a single deal. Their executed orders and balances will be consolidated.`}
        confirmText="Merge deals"
        cancelText="Cancel"
        onConfirm={handleBulkMergeConfirm}
      />

      <ConfirmationDialog
        open={!!journalBulkDialogOpen.length}
        onOpenChange={(open) => {
          if (!open) {
            setJournalBulkDialogOpen([]);
          }
        }}
        title={
          journalBulkDialogOpen.length === 1
            ? 'Add deal to journal'
            : 'Add deals to journal'
        }
        description={`Create ${journalBulkDialogOpen.length} new ${journalBulkDialogOpen.length === 1 ? 'entry' : 'entries'} in your trade journal from the selected ${journalBulkDialogOpen.length === 1 ? 'deal' : 'deals'}. The original ${journalBulkDialogOpen.length === 1 ? 'deal is' : 'deals are'} not modified.`}
        confirmText={
          journalBulkDialogOpen.length === 1
            ? 'Add to journal'
            : `Add ${journalBulkDialogOpen.length} to journal`
        }
        cancelText="Cancel"
        onConfirm={handleBulkJournalConfirm}
      />

      {bulkAdjustFundsDialog}

      {/* Detail Drawer */}
      {/* {selectedDealForDrawer && (
        <TradeDetailDrawer
          trade={{
            id: selectedDealForDrawer.id,
            type: selectedDealForDrawer.type,
            symbol: selectedDealForDrawer.symbol,
            strategy: selectedDealForDrawer.strategy,
            status: selectedDealForDrawer.status,
            exchange: selectedDealForDrawer.exchange,
            exchangeUUID: selectedDealForDrawer.exchangeUUID,
            botName: selectedDealForDrawer.botName,
            botId: selectedDealForDrawer.botId,
            currentBalance: selectedDealForDrawer.currentBalance,
            usage: selectedDealForDrawer.usage,
            profit: selectedDealForDrawer.profit,
            unrealizedProfit: selectedDealForDrawer.unrealizedProfit,
            avgPrice: selectedDealForDrawer.avgPrice,
            levels: selectedDealForDrawer.levels,
            created: selectedDealForDrawer.created,
          }}
          open={detailDrawerOpen}
          onClose={() => {
            setDetailDrawerOpen(false);
            setSelectedDealForDrawer(null);
          }}
          privacyMode={privacyMode}
        >
          <div />
        </TradeDetailDrawer>
      )} */}

      {/* Pair Selection Dialog for Multi-Coin Bots */}
      <Dialog
        open={pairSelectDialogOpen}
        onOpenChange={setPairSelectDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Trading Pair</DialogTitle>
            <DialogDescription>
              Choose which trading pair to open a new deal for.
              {availablePairs.length > 10 && (
                <span className="text-xs ml-1">
                  ({availablePairs.length} pairs available)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {/* Search Input */}
            <div className="mb-3">
              <Input
                placeholder="Search pairs..."
                value={pairSearchQuery}
                onChange={(e) => setPairSearchQuery(e.target.value)}
                startAdornment={
                  <Search className="w-4 h-4 text-muted-foreground" />
                }
                className="w-full"
              />
            </div>
            {/* Pair List */}
            <div className="max-h-64 overflow-y-auto border rounded-md">
              {filteredPairs.length > 0 ? (
                filteredPairs.map((pair) => (
                  <div
                    key={pair}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent transition-colors ${
                      selectedPairForDeal === pair ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedPairForDeal(pair)}
                  >
                    <span className="font-medium text-sm">{pair}</span>
                    {selectedPairForDeal === pair && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                  No pairs found matching "{pairSearchQuery}"
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPairSelectDialogOpen(false);
                setSelectedPairForDeal(null);
                setPairSearchQuery('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOpenDeal}
              disabled={!selectedPairForDeal || isOpenDealPending}
            >
              {isOpenDealPending ? 'Opening...' : 'Open Deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Max Active Deals Reached Dialog */}
      <Dialog
        open={!!maxActiveDialog}
        onOpenChange={() => setMaxActiveDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Information</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Maximum active deals reached for this {maxActiveDialog}. You can
              update settings to open more deals.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaxActiveDialog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DrawerDealsTable;
