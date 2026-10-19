import { useCallback, useMemo, useRef, useState } from 'react';

import { BotStatusConfirmationModal, DeleteConfirmationModal } from '@/components/modals';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  buildBotBulkActions,
  bulkTargets,
  chooseStatusDialog,
  type BotActionId,
  type BotBulkActionItem,
  type BotKind,
  type BotRef,
} from '@/features/bots/actions/botActions';
import { isReadOnly } from '@/lib/demoMode';
import { useBaseFundingAccess } from '@/hooks/useBaseFundingAccess';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
} from '@/types';
import {
  useBotArchive,
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from './useBotMutations';

type StatusToggle = ReturnType<typeof useBotStatusToggle>['mutateAsync'];
type StatusAction = 'start' | 'stop';
type ConfirmAction = 'restart' | 'archive' | 'unarchive';

type PendingBulk =
  | { type: 'status'; action: StatusAction; targets: BotRef[]; selected: number }
  | { type: 'delete'; targets: BotRef[] }
  | {
      type: 'confirm';
      action: ConfirmAction;
      targets: BotRef[];
      selected: number;
    };

const botsLabel = (n: number) => `${n} bot${n === 1 ? '' : 's'}`;

const NONE_ELIGIBLE: Partial<Record<BotActionId, string>> = {
  start: 'No stopped bots selected',
  stop: 'No active bots selected',
  restart: 'No active bots selected',
  archive: 'Only stopped bots can be archived. Stop the bots first.',
  unarchive: 'No archived bots selected',
  delete:
    'Only closed or archived bots can be deleted. Stop bots before deleting.',
};

const SKIPPED_REASON: Record<ConfirmAction, string> = {
  restart: 'not running',
  archive: 'still running',
  unarchive: 'not archived',
};

type BulkAction = StatusAction | ConfirmAction | 'delete';

const VERB: Record<BulkAction, [string, string]> = {
  start: ['start', 'Started'],
  stop: ['stop', 'Stopped'],
  restart: ['restart', 'Restarted'],
  archive: ['archive', 'Archived'],
  unarchive: ['unarchive', 'Unarchived'],
  delete: ['delete', 'Deleted'],
};

/** Progress toast text while a bulk run goes bot by bot. */
const PROGRESS: Record<BulkAction, string> = {
  start: 'Requesting start',
  stop: 'Requesting stop',
  restart: 'Requesting restart',
  archive: 'Archiving',
  unarchive: 'Unarchiving',
  delete: 'Deleting',
};

/**
 * Start, stop and restart are accepted by the API before the bot engine acts
 * on them; their summary says they were requested, not done. Each bot's own
 * badge reads "Starting…"/"Stopping…" until the engine reports the change.
 */
const REQUESTED: Partial<Record<BulkAction, string>> = {
  start: 'Start requested for',
  stop: 'Stop requested for',
  restart: 'Restart requested for',
};

export function bulkSummary(
  action: BulkAction,
  total: number,
  failed: number
): { ok: boolean; message: string } {
  const [verb, past] = VERB[action];
  const done = total - failed;
  const requested = REQUESTED[action];
  if (failed === 0) {
    return {
      ok: true,
      message: requested
        ? `${requested} ${botsLabel(done)}`
        : `${past} ${botsLabel(done)}`,
    };
  }
  if (done === 0) {
    return { ok: false, message: `Failed to ${verb} the selected bots` };
  }
  return {
    ok: false,
    message: requested
      ? `${requested} ${done} of ${botsLabel(total)} — ${failed} failed`
      : `${past} ${done} of ${botsLabel(total)} — ${failed} failed`,
  };
}

/**
 * Bulk bot actions for a bot table: the toolbar entries (from the registry's
 * `bulk` metadata), one confirmation step per action, a per-bot run that
 * keeps going past a failure, and one summary toast. Works on mixed
 * selections (the trading overview lists DCA, combo and grid together).
 *
 *   const bulk = useBulkBotRunner(toRef);   // toRef must be stable
 *   <DataTable bulkActions={bulk.bulkActions} … />
 *   {bulk.dialogs}
 */
export function useBulkBotRunner<T>(toRef: (row: T) => BotRef): {
  bulkActions: BotBulkActionItem<T>[];
  dialogs: React.ReactNode;
} {
  const readOnly = isReadOnly();
  // One status mutation per bot type: `changeStatus` takes the bot's type
  // and each one optimistically updates its own store.
  const toggles: Record<BotKind, StatusToggle> = {
    dca: useBotStatusToggle(BotTypesEnum.dca).mutateAsync,
    combo: useBotStatusToggle(BotTypesEnum.combo).mutateAsync,
    grid: useBotStatusToggle(BotTypesEnum.grid).mutateAsync,
    hedgeDca: useBotStatusToggle(BotTypesEnum.hedgeDca).mutateAsync,
    hedgeCombo: useBotStatusToggle(BotTypesEnum.hedgeCombo).mutateAsync,
  };
  const restart = useBotRestart().mutateAsync;
  const remove = useBotDelete().mutateAsync;
  const archive = useBotArchive().mutateAsync;

  // Spot hedges are skipped only where they start through the hedge start
  // dialog (base funding access); otherwise bulk start sends them as before.
  const baseFundingAccess = useBaseFundingAccess();
  const accessRef = useRef(baseFundingAccess);
  accessRef.current = baseFundingAccess;

  const [pending, setPending] = useState<PendingBulk | null>(null);
  const [loading, setLoading] = useState(false);

  // Mutation functions are stable; reading them through a ref keeps
  // `bulkActions` from being rebuilt on every render (the data table's
  // toolbar re-renders when its actions array changes).
  const latest = useRef({ toggles, restart, remove, archive });
  latest.current = { toggles, restart, remove, archive };

  const onAction = useCallback((id: BotActionId, bots: BotRef[]) => {
    if (id === 'edit') {
      toast.info('Bulk edit coming soon');
      return;
    }
    let targets = bulkTargets(id, bots);
    // A hedge bot with a spot leg starts with a per-leg funding action chosen
    // in its own start dialog; a bulk start would send none. Skip it, by name.
    if (id === 'start' && accessRef.current) {
      const dialogOnly = targets.filter(
        (bot) => chooseStatusDialog(bot, 'confirm') === 'hedgeStart'
      );
      for (const bot of dialogOnly) {
        toast.info(
          `"${bot.name}" was not started: start it individually to choose how each leg is funded`
        );
      }
      if (dialogOnly.length > 0) {
        targets = targets.filter((bot) => !dialogOnly.includes(bot));
        if (targets.length === 0) return;
      }
    }
    const emptyMessage = NONE_ELIGIBLE[id];
    if (targets.length === 0 || (id === 'delete' && targets.length < bots.length)) {
      if (emptyMessage) toast.info(emptyMessage);
      return;
    }
    if (id === 'start' || id === 'stop') {
      setPending({ type: 'status', action: id, targets, selected: bots.length });
    } else if (id === 'delete') {
      setPending({ type: 'delete', targets });
    } else if (id === 'restart' || id === 'archive' || id === 'unarchive') {
      setPending({ type: 'confirm', action: id, targets, selected: bots.length });
    } else {
      logger.warn('[useBulkBotRunner] No bulk flow for action', id);
    }
  }, []);

  const runEach = useCallback(
    async (
      action: BulkAction,
      targets: BotRef[],
      runOne: (bot: BotRef) => Promise<unknown>
    ) => {
      setLoading(true);
      // Bots go one by one; a long selection takes a while, so show where
      // the run is instead of nothing until the end.
      const progressText = (n: number) =>
        `${PROGRESS[action]}: ${n} of ${botsLabel(targets.length)}…`;
      const progress = targets.length > 1 ? toast.progress(progressText(0)) : null;
      let failed = 0;
      try {
        for (const [index, bot] of targets.entries()) {
          try {
            await runOne(bot);
          } catch (error) {
            failed += 1;
            logger.error(
              `[useBulkBotRunner] ${action} failed for ${bot.id}`,
              error
            );
          }
          progress?.update(progressText(index + 1));
        }
      } finally {
        progress?.dismiss();
        setLoading(false);
        setPending(null);
      }
      const summary = bulkSummary(action, targets.length, failed);
      if (summary.ok) toast.success(summary.message);
      else toast.error(summary.message);
    },
    []
  );

  const status = pending?.type === 'status' ? pending : null;
  const allGrid = !!status && status.targets.every((b) => b.kind === 'grid');
  const hasGrid = !!status && status.targets.some((b) => b.kind === 'grid');
  const hasActiveDeals =
    !!status &&
    status.targets.some(
      (b) => (allGrid || b.kind !== 'grid') && b.activeDeals > 0
    );

  const confirmStatus = useCallback(
    (closeType?: string, cancelPartiallyFilled?: boolean) => {
      if (!status) return;
      const isStop = status.action === 'stop';
      const nextStatus = isStop ? 'closed' : 'open';
      void runEach(status.action, status.targets, (bot) => {
        const toggle = latest.current.toggles[bot.kind];
        if (bot.kind === 'grid') {
          // Grid-only selection: the dialog showed the grid close options.
          // Mixed selection: it showed the DCA ones, so grid bots take the
          // grid default (cancel all orders).
          return toggle({
            id: bot.id,
            status: nextStatus,
            name: bot.name,
            notify: false,
            closeGridType: isStop
              ? allGrid
                ? (closeType as CloseGRIDTypeEnum | undefined)
                : CloseGRIDTypeEnum.cancel
              : undefined,
            cancelPartiallyFilled: isStop
              ? allGrid
                ? cancelPartiallyFilled
                : true
              : undefined,
          });
        }
        return toggle({
          id: bot.id,
          status: nextStatus,
          name: bot.name,
          notify: false,
          closeType: isStop
            ? (closeType as CloseDCATypeEnum | undefined)
            : undefined,
        });
      });
    },
    [status, allGrid, runEach]
  );

  const confirmGeneric = useCallback(() => {
    if (pending?.type !== 'confirm') return;
    const { action, targets } = pending;
    void runEach(action, targets, (bot) =>
      action === 'restart'
        ? latest.current.restart({ id: bot.id, type: bot.kind as BotTypesEnum })
        : latest.current.archive({
            id: bot.id,
            archive: action === 'archive',
            type: bot.kind as BotTypesEnum,
          })
    );
  }, [pending, runEach]);

  const confirmDelete = useCallback(async () => {
    if (pending?.type !== 'delete') return;
    await runEach('delete', pending.targets, (bot) =>
      latest.current.remove({ id: bot.id, type: bot.kind as BotTypesEnum })
    );
  }, [pending, runEach]);

  const bulkActions = useMemo(
    () => buildBotBulkActions<T>({ toRef, ctx: { readOnly, viewOnly: false }, onAction }),
    [toRef, readOnly, onAction]
  );

  const closeDialog = (open: boolean) => {
    if (!open && !loading) setPending(null);
  };

  const confirm = pending?.type === 'confirm' ? pending : null;
  const confirmVerb = confirm
    ? confirm.action.charAt(0).toUpperCase() + confirm.action.slice(1)
    : '';
  const skipped = confirm ? confirm.selected - confirm.targets.length : 0;
  const deleteTargets = pending?.type === 'delete' ? pending.targets : [];

  const dialogs = (
    <>
      <BotStatusConfirmationModal
        open={!!status}
        onOpenChange={closeDialog}
        onConfirm={confirmStatus}
        botName={botsLabel(status?.targets.length ?? 0)}
        bulkCount={status?.targets.length ?? 0}
        bulkSelectedCount={status?.selected}
        currentStatus={status?.action === 'start' ? 'closed' : 'open'}
        targetStatus={status?.action === 'start' ? 'open' : 'closed'}
        hasActiveDeals={hasActiveDeals}
        botType={allGrid ? BotTypesEnum.grid : undefined}
        // Bulk targets are heterogeneous — use the generic "close position"
        // wording and always offer the grid options.
        gridFutures
        gridHasOpenPosition
        bulkNote={
          status?.action === 'stop' && hasGrid && !allGrid
            ? 'Grid bots in this selection stop with all their open orders cancelled.'
            : undefined
        }
        isLoading={loading}
      />
      <DeleteConfirmationModal
        open={pending?.type === 'delete'}
        onOpenChange={closeDialog}
        onConfirm={confirmDelete}
        title={`Delete ${botsLabel(deleteTargets.length)}`}
        description={`Are you sure you want to delete ${deleteTargets.length} selected ${deleteTargets.length === 1 ? 'bot' : 'bots'}? This action cannot be undone.`}
        itemName={botsLabel(deleteTargets.length)}
        bulkCount={deleteTargets.length}
        itemType="bot"
        additionalInfo={{
          activeDeals: deleteTargets.reduce((sum, b) => sum + b.activeDeals, 0),
          totalValue: deleteTargets.reduce((sum, b) => sum + b.totalValue, 0),
          currency: deleteTargets[0]?.currency || 'USD',
        }}
        isLoading={loading}
      />
      <ConfirmationDialog
        open={!!confirm}
        onOpenChange={closeDialog}
        title={confirm ? `${confirmVerb} ${botsLabel(confirm.targets.length)}` : ''}
        description={
          confirm
            ? `Are you sure you want to ${confirm.action} ${botsLabel(confirm.targets.length)}?${
                skipped > 0
                  ? ` ${skipped} selected ${skipped === 1 ? 'bot is' : 'bots are'} ${SKIPPED_REASON[confirm.action]} and will be skipped.`
                  : ''
              }`
            : ''
        }
        confirmText={
          confirm
            ? `${confirmVerb} ${confirm.targets.length === 1 ? 'Bot' : 'Bots'}`
            : undefined
        }
        variant="default"
        onConfirm={confirmGeneric}
      />
    </>
  );

  return { bulkActions, dialogs };
}
