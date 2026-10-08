// Runs the deal actions of one surface and renders their dialogs — once per
// surface, not once per row or card. A surface that also builds bulk actions
// from the runner uses the hook directly and provides the runner itself; the
// others wrap their content in <DealActionsProvider>.
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { MoveDealToBotDialog } from '@/components/deals/MoveDealToBotDialog';
import { useBulkAdjustFunds } from '@/components/deals/actions/useBulkAdjustFunds';
import {
  AdjustFundsDialog,
  ChangeDcaLevelsDialog,
  CloseOptionsDialog,
  ExecuteNextDcaDialog,
  type AdjustFundsDialogMode,
} from '@/features/bots/shared/runtime';
import { useMergeSmartOrders } from '@/features/bots/widgets/BotForm/hooks/useMergeSmartOrders';
import {
  isDealNotOpenError,
  toastDealCloseError,
  useAdjustFunds,
  useDealActions,
  useEditDeal,
  useExecuteNextDca,
  useMoveDealToTerminal,
  useRestartDeal,
  useRestoreDeal,
} from '@/hooks/useDealActions';
import { fetchDealOrders } from '@/hooks/useDealOrders';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useTradeJournalStore } from '@/stores/tradeJournalStore';
import { CloseDCATypeEnum, type AddFundsSettings } from '@/types';
import type { ViewOrder } from '@/types/bots';
import { isDealInJournal } from '@/utils/journalDealDedupe';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { DealActionId } from './dealActionRegistry';
import type { DealActionRunner } from './dealActionsContext';
import {
  buildDealJournalEntry,
  dealJournalEntryTime,
  journalExecutions,
  type JournalOrderLike,
} from './dealJournal';
import {
  dealEngineBotType,
  dealKindLabel,
  runsOnComboEngine,
  type DealRef,
} from './dealRef';

const LOG_PREFIX = '[DealActions]';

const MOVE_TO_TERMINAL_WARNING =
  'After moving deals to terminal, the bot may immediately start new deals if slots are available (especially with ASAP start conditions). To avoid this, adjust max open deals or max deals per pair before confirming.';

export interface DealActionHostOptions {
  /** Opens this surface's details view for a deal. */
  onView?: (deal: DealRef) => void;
  /** Opens this surface's deal editor for the given deals. */
  onEdit?: (deals: DealRef[]) => void;
  /**
   * Filled orders the surface has already loaded. Journal entries take their
   * executions from these instead of fetching each deal's orders.
   */
  filledOrders?: readonly ViewOrder[];
}

interface Pending {
  id: DealActionId;
  deals: DealRef[];
  /** Selected deals the bulk action left out (reported in the summary). */
  skipped: number;
}

interface Outcome {
  ok: number;
  failed: number;
  ended: number;
  firstReason: string;
  last: unknown;
}

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

/** Why a bulk action left a selected deal out, for its summary toast. */
const SKIPPED_REASON: Partial<Record<DealActionId, string>> = {
  close: 'not open',
  cancel: 'already ended',
  restart: 'not open or errored',
  restore: 'not canceled',
};

const responseMessage = (response: unknown, fallback: string): string => {
  const data = (response as { data?: unknown } | undefined)?.data;
  return typeof data === 'string' && data.trim() ? data : fallback;
};

/** Confirmation copy for the actions that only ask before running. */
function confirmCopy(id: DealActionId, deals: DealRef[]) {
  const n = deals.length;
  const many = n > 1;
  const first = deals[0];
  switch (id) {
    case 'cancel':
      return {
        title: many ? 'Cancel deals' : 'Cancel deal',
        description: `Remove ${many ? `${n} deals` : `the deal for ${first?.symbol}`} from Gainium and cancel any pending exchange orders. Open positions on the exchange will be left untouched and must be managed manually.`,
        confirmText: many ? `Cancel ${n} deals` : 'Cancel deal',
        cancelText: many ? 'Keep deals' : 'Keep deal',
        variant: 'destructive' as const,
      };
    case 'restart':
      return {
        title: many ? `Restart ${n} deals` : 'Restart deal',
        description: many
          ? `Restart ${n} deals? Each deal's open safety orders and take profit are cancelled and placed again from its current state. The bots' other deals are not touched.`
          : `Restart the deal for ${first?.symbol}? Its open safety orders and take profit are cancelled and placed again from the deal's current state. The bot's other deals are not touched.`,
        confirmText: 'Restart',
        cancelText: 'Cancel',
        variant: 'default' as const,
      };
    case 'restore':
      return {
        title: many ? `Restore ${n} deals` : 'Restore deal',
        description: many
          ? `Restore ${n} canceled deals? Each is added back as an active deal that holds its current position, with no DCA, take profit or stop loss.`
          : `Restore the deal for ${first?.symbol}? It will be added back as an active deal that holds the current position, with no DCA, take profit or stop loss.`,
        confirmText: 'Restore',
        cancelText: 'Cancel',
        variant: 'default' as const,
      };
    case 'moveToTerminal':
      return {
        title: 'Move deal to terminal',
        description: `Are you sure you want to move ${many ? `${n} deals` : `the deal (${first?.id})`} to the terminal? ${MOVE_TO_TERMINAL_WARNING}`,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        variant: 'default' as const,
      };
    case 'merge':
      return {
        title: `Merge ${n} deals`,
        description: `Combine ${n} deals on ${first?.exchange ?? ''} ${first?.symbol ?? ''} into a single deal. Their executed orders and balances will be consolidated.`,
        confirmText: 'Merge deals',
        cancelText: 'Cancel',
        variant: 'default' as const,
      };
    case 'journal':
      return {
        title: many ? 'Add deals to journal' : 'Add deal to journal',
        description: `Create ${n} new ${plural(n, 'entry', 'entries')} in your trade journal from the selected ${plural(n, 'deal', 'deals')}. The original ${plural(n, 'deal is', 'deals are')} not modified.`,
        confirmText: many ? `Add ${n} to journal` : 'Add to journal',
        cancelText: 'Cancel',
        variant: 'default' as const,
      };
    default:
      return null;
  }
}

export function useDealActionHost({
  onView,
  onEdit,
  filledOrders,
}: DealActionHostOptions): {
  runner: DealActionRunner;
  dialogs: React.ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const closePending = useCallback(() => setPending(null), []);

  // Handlers change identity with their surface's renders; the runner must not,
  // or every row menu re-renders with it.
  const onViewRef = useRef(onView);
  onViewRef.current = onView;
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const filledOrdersRef = useRef(filledOrders);
  filledOrdersRef.current = filledOrders;

  const addJournalEntry = useTradeJournalStore((state) => state.addTrade);
  const closeMutations = useDealActions();
  const adjustFunds = useAdjustFunds();
  const { open: openBulkAdjustFunds, dialog: bulkAdjustFundsDialog } =
    useBulkAdjustFunds();
  const executeNextDca = useExecuteNextDca();
  const restartDeal = useRestartDeal();
  const restartDealSilent = useRestartDeal({ silent: true });
  const restoreDeal = useRestoreDeal();
  const moveDealToTerminal = useMoveDealToTerminal();
  const mergeDeals = useMergeSmartOrders();
  const editDeal = useEditDeal({
    onSuccess: () => {
      toast.success('DCA levels updated');
      setPending(null);
    },
    onError: (e) => {
      toast.error(
        e instanceof Error ? e.message : 'Failed to change DCA levels'
      );
    },
  });

  const addToJournal = useCallback(
    async (deals: DealRef[]) => {
      let added = 0;
      let skipped = 0;
      let failed = 0;
      for (const deal of deals) {
        const trade = deal.trade;
        if (!trade) {
          failed += 1;
          continue;
        }
        try {
          // Re-read after every add so a deal selected twice is added once.
          if (
            isDealInJournal(useTradeJournalStore.getState().trades, {
              dealId: deal.dealId,
              symbol: deal.symbol,
              ...(deal.exchange ? { exchange: deal.exchange } : {}),
              entryTime: dealJournalEntryTime(trade),
            })
          ) {
            skipped += 1;
            continue;
          }
          let orders: readonly JournalOrderLike[] =
            filledOrdersRef.current ?? [];
          // A single deal without loaded orders fetches its own.
          if (!filledOrdersRef.current && deals.length === 1 && deal.botId) {
            const fetched = await fetchDealOrders(
              deal.botId,
              deal.id,
              dealEngineBotType(deal.kind)
            );
            orders = fetched.filter((order) => order.status === 'FILLED');
          }
          addJournalEntry(
            buildDealJournalEntry(
              trade,
              journalExecutions(deal.dealId, orders)
            )
          );
          added += 1;
        } catch (error) {
          failed += 1;
          logger.error(`${LOG_PREFIX} Failed to add deal to journal`, {
            error,
            dealId: deal.id,
          });
        }
      }
      if (added > 0) {
        toast.success(
          deals.length === 1
            ? `Deal ${deals[0]?.symbol} added to journal`
            : `Added ${added} deal(s) to journal`
        );
      }
      if (skipped > 0) {
        toast.info(
          deals.length === 1
            ? `Deal ${deals[0]?.symbol} is already in your journal`
            : `${skipped} deal(s) already in your journal, skipped`
        );
      }
      if (failed > 0) {
        toast.error(
          deals.length === 1
            ? 'Failed to add deal to journal'
            : `Failed to add ${failed} deal(s)`
        );
      }
    },
    [addJournalEntry]
  );

  const run = useCallback<DealActionRunner['run']>(
    (id, deals, options) => {
      const skipped = options?.skipped ?? 0;
      const first = deals[0];
      if (!first) return;
      switch (id) {
        case 'view':
          onViewRef.current?.(first);
          return;
        case 'edit':
          onEditRef.current?.(deals);
          return;
        case 'journal':
          if (deals.length === 1) {
            void addToJournal(deals);
            return;
          }
          break;
        case 'addFunds':
        case 'reduceFunds':
          if (deals.length > 1) {
            openBulkAdjustFunds(
              id === 'addFunds' ? 'add' : 'reduce',
              deals.map((deal) => ({
                dealId: deal.id,
                botId: deal.botId,
                status: deal.status,
                type: dealKindLabel(deal.kind),
                baseAsset: deal.baseAsset,
                quoteAsset: deal.quoteAsset,
                symbol: deal.symbol,
                exchange: deal.exchange,
                percentBasis: deal.percentBasis,
              }))
            );
            return;
          }
          break;
        default:
          break;
      }
      setPending({ id, deals, skipped });
    },
    [addToJournal, openBulkAdjustFunds]
  );

  const runner = useMemo<DealActionRunner>(() => ({ run }), [run]);

  /** Runs `act` on each deal in turn — these place real exchange orders. */
  const eachDeal = useCallback(
    async (
      deals: DealRef[],
      act: (deal: DealRef & { botId: string }) => Promise<unknown>,
      label: string
    ): Promise<Outcome> => {
      const outcome: Outcome = {
        ok: 0,
        failed: 0,
        ended: 0,
        firstReason: '',
        last: undefined,
      };
      for (const deal of deals) {
        const botId = deal.botId;
        if (!botId) {
          outcome.failed += 1;
          continue;
        }
        try {
          outcome.last = await act({ ...deal, botId });
          outcome.ok += 1;
        } catch (error) {
          if (isDealNotOpenError(error)) {
            outcome.ended += 1;
          } else {
            outcome.failed += 1;
            if (!outcome.firstReason && error instanceof Error) {
              outcome.firstReason = error.message;
            }
          }
          logger.error(`${LOG_PREFIX} ${label} failed`, {
            error,
            dealId: deal.id,
            botId,
          });
        }
      }
      return outcome;
    },
    []
  );

  /** The one summary every bulk action reports. */
  const reportBulk = useCallback(
    (
      outcome: Outcome,
      done: string,
      verb: string,
      skipped: number,
      skippedReason: string | undefined
    ) => {
      const skippedNote =
        skipped > 0
          ? `skipped ${skipped}${skippedReason ? ` ${skippedReason}` : ''}`
          : '';
      if (outcome.ok > 0) {
        toast.success(
          `${done} ${outcome.ok} deal(s)${skippedNote ? `, ${skippedNote}` : ''}`
        );
      } else if (skippedNote) {
        toast.info(
          `${skippedNote.charAt(0).toUpperCase()}${skippedNote.slice(1)} deal(s)`
        );
      }
      if (outcome.failed > 0) {
        toast.error(
          `Failed to ${verb} ${outcome.failed} deal(s)${
            outcome.firstReason ? `: ${outcome.firstReason}` : ''
          }`
        );
      }
      if (outcome.ended > 0) {
        toast.info(
          `${outcome.ended} deal(s) had already ended. The list has been refreshed.`
        );
      }
    },
    []
  );

  const endDeals = useCallback(
    async (deals: DealRef[], type: CloseDCATypeEnum, skipped = 0) => {
      const cancel = type === CloseDCATypeEnum.cancel;
      const closeOne = (deal: DealRef & { botId: string }) => {
        const close = runsOnComboEngine(deal.kind)
          ? closeMutations.closeComboDeal
          : closeMutations.closeDCADeal;
        return close({ dealId: deal.id, botId: deal.botId, type });
      };
      if (deals.length === 1 && skipped === 0) {
        const deal = deals[0] as DealRef;
        if (!deal.botId) {
          toast.error(`Cannot ${cancel ? 'cancel' : 'close'} deal - missing bot ID`);
          return;
        }
        try {
          await closeOne({ ...deal, botId: deal.botId });
          toast.success(
            cancel ? 'Deal canceled successfully' : 'Deal closed successfully'
          );
        } catch (error) {
          logger.error(`${LOG_PREFIX} ${cancel ? 'Cancel' : 'Close'} failed`, {
            error,
            dealId: deal.id,
          });
          toastDealCloseError(
            error,
            cancel ? 'Failed to cancel deal' : 'Failed to close deal'
          );
        }
        return;
      }
      const outcome = await eachDeal(deals, closeOne, cancel ? 'Cancel' : 'Close');
      reportBulk(
        outcome,
        cancel ? 'Canceled' : 'Closed',
        cancel ? 'cancel' : 'close',
        skipped,
        SKIPPED_REASON[cancel ? 'cancel' : 'close']
      );
    },
    [closeMutations.closeComboDeal, closeMutations.closeDCADeal, eachDeal, reportBulk]
  );

  const confirm = useCallback(async () => {
    if (!pending) return;
    const { id, deals, skipped } = pending;
    setPending(null);
    // A single deal left from a larger selection still gets the bulk summary,
    // so the skipped ones are reported.
    const single = deals.length === 1 && skipped === 0;
    const first = deals[0] as DealRef;
    switch (id) {
      case 'cancel':
        await endDeals(deals, CloseDCATypeEnum.cancel, skipped);
        return;
      case 'journal':
        await addToJournal(deals);
        return;
      case 'restart': {
        if (single) {
          if (first.botId) {
            restartDeal.mutate({
              dealId: first.id,
              botId: first.botId,
              combo: runsOnComboEngine(first.kind),
            });
          }
          return;
        }
        const outcome = await eachDeal(
          deals,
          (deal) =>
            restartDealSilent.mutateAsync({
              dealId: deal.id,
              botId: deal.botId,
              combo: runsOnComboEngine(deal.kind),
            }),
          'Restart'
        );
        reportBulk(
          outcome,
          'Restart scheduled for',
          'restart',
          skipped,
          SKIPPED_REASON.restart
        );
        return;
      }
      case 'restore': {
        const outcome = await eachDeal(
          deals,
          (deal) =>
            restoreDeal.mutateAsync({ dealId: deal.id, botId: deal.botId }),
          'Restore'
        );
        if (single) {
          if (outcome.ok) {
            toast.success(
              responseMessage(outcome.last, 'Deal restored successfully')
            );
          } else {
            toast.error(outcome.firstReason || 'Failed to restore deal');
          }
          return;
        }
        reportBulk(
          outcome,
          'Restored',
          'restore',
          skipped,
          SKIPPED_REASON.restore
        );
        return;
      }
      case 'moveToTerminal': {
        const outcome = await eachDeal(
          deals,
          (deal) =>
            moveDealToTerminal.mutateAsync({
              dealId: deal.id,
              botId: deal.botId,
              combo: deal.kind === 'combo',
            }),
          'Move to terminal'
        );
        if (single) {
          if (outcome.ok) {
            toast.success(
              responseMessage(
                outcome.last,
                'Deal moved to terminal successfully'
              )
            );
          } else {
            toast.error('Failed to move deal to terminal');
          }
          return;
        }
        reportBulk(outcome, 'Moved to terminal', 'move to terminal', skipped, undefined);
        return;
      }
      case 'merge': {
        if (!first.botId) {
          toast.error('Cannot merge deals - missing bot ID');
          return;
        }
        try {
          // The merged deal lands in the first selected deal's bot.
          await mergeDeals.mutateAsync({
            botId: first.botId,
            dealIds: deals.map((deal) => deal.dealId),
            // A single-position target bot adopts the deals into its open
            // position on this pair instead (spec 139 §5.2.1).
            ...(first.kind === 'dca' ? { symbol: first.symbol } : {}),
          });
        } catch (error) {
          // The mutation reports its own failure.
          logger.error(`${LOG_PREFIX} Merge failed`, { error });
        }
        return;
      }
      default:
        return;
    }
  }, [
    pending,
    endDeals,
    addToJournal,
    eachDeal,
    reportBulk,
    restartDeal,
    restartDealSilent,
    restoreDeal,
    moveDealToTerminal,
    mergeDeals,
  ]);

  const pendingId = pending?.id;
  const pendingDeal = pending?.deals[0];
  const copy = pending ? confirmCopy(pending.id, pending.deals) : null;

  const handleAdjustFundsConfirm = useCallback(
    (settings: AddFundsSettings) => {
      if (!pendingDeal?.botId) return;
      const mode: AdjustFundsDialogMode =
        pendingId === 'reduceFunds' ? 'reduce' : 'add';
      adjustFunds.mutate({
        dealId: pendingDeal.id,
        botId: pendingDeal.botId,
        settings,
        mode,
      });
      setPending(null);
    },
    // Stable `mutate`, not the react-query result object (new every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adjustFunds.mutate, pendingDeal, pendingId]
  );

  const handleExecuteNextDcaConfirm = useCallback(
    (expectedLevel: number) => {
      if (!pendingDeal?.botId) {
        toast.error('Cannot execute the next DCA - missing bot ID');
        return;
      }
      executeNextDca.mutate({
        dealId: pendingDeal.id,
        botId: pendingDeal.botId,
        expectedLevel,
      });
      setPending(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [executeNextDca.mutate, pendingDeal]
  );

  const handleChangeDcaConfirm = useCallback(
    (newMax: number) => {
      if (!pendingDeal?.botId) {
        toast.error('Cannot change DCA levels - missing bot ID');
        return;
      }
      editDeal.mutate({
        dealId: pendingDeal.id,
        botId: pendingDeal.botId,
        type: dealEngineBotType(pendingDeal.kind),
        terminal: false,
        settings:
          newMax === 0
            ? { useDca: false }
            : { useDca: true, ordersCount: newMax },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editDeal.mutate, pendingDeal]
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closePending();
    },
    [closePending]
  );

  const dialogs = (
    <>
      {copy && (
        <ConfirmationDialog
          open
          onOpenChange={onOpenChange}
          title={copy.title}
          description={copy.description}
          confirmText={copy.confirmText}
          cancelText={copy.cancelText}
          variant={copy.variant}
          onConfirm={() => void confirm()}
        />
      )}
      {pendingId === 'close' && (
        <CloseOptionsDialog
          open
          onOpenChange={onOpenChange}
          onConfirm={(type) => {
            const deals = pending?.deals ?? [];
            const skipped = pending?.skipped ?? 0;
            setPending(null);
            void endDeals(deals, type as CloseDCATypeEnum, skipped);
          }}
          defaultCloseType={CloseDCATypeEnum.closeByMarket}
          ignoreOptions={[CloseDCATypeEnum.leave]}
          mode="deal"
          count={pending?.deals.length ?? 1}
        />
      )}
      {(pendingId === 'addFunds' || pendingId === 'reduceFunds') &&
        pendingDeal && (
          <AdjustFundsDialog
            open
            mode={pendingId === 'reduceFunds' ? 'reduce' : 'add'}
            onOpenChange={onOpenChange}
            onConfirm={handleAdjustFundsConfirm}
            baseAsset={pendingDeal.baseAsset}
            quoteAsset={pendingDeal.quoteAsset}
            symbol={pendingDeal.symbol}
            exchange={pendingDeal.exchange}
            percentBasis={pendingDeal.percentBasis}
            exchangeUUID={pendingDeal.exchangeUUID}
            futures={pendingDeal.futures}
            long={pendingDeal.long}
          />
        )}
      {pendingId === 'executeNextDca' && pendingDeal && (
        <ExecuteNextDcaDialog
          open
          onOpenChange={onOpenChange}
          trade={
            pendingDeal.trade ?? {
              id: pendingDeal.id,
              botId: pendingDeal.botId,
              symbol: pendingDeal.symbol,
              strategy: pendingDeal.strategy,
              levels: pendingDeal.levels,
              percentBasis: pendingDeal.percentBasis,
            }
          }
          onConfirm={handleExecuteNextDcaConfirm}
          isProcessing={executeNextDca.isPending}
        />
      )}
      {pendingId === 'changeDcaLevels' && pendingDeal && (
        <ChangeDcaLevelsDialog
          open
          onOpenChange={onOpenChange}
          currentLevel={(pendingDeal.levels?.complete || 1) - 1}
          maxLevel={(pendingDeal.levels?.all || 1) - 1}
          onConfirm={handleChangeDcaConfirm}
          isProcessing={editDeal.isPending}
        />
      )}
      <MoveDealToBotDialog
        open={pendingId === 'moveToBot'}
        onOpenChange={onOpenChange}
        deal={
          pendingId === 'moveToBot' && pendingDeal?.botId
            ? {
                dealId: pendingDeal.id,
                sourceBotId: pendingDeal.botId,
                symbol: pendingDeal.symbol,
                exchange: pendingDeal.exchange ?? '',
                exchangeUUID: pendingDeal.exchangeUUID,
                strategy: pendingDeal.strategy ?? '',
              }
            : null
        }
      />
      {bulkAdjustFundsDialog}
    </>
  );

  return { runner, dialogs };
}
