import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';
import { isReadOnly } from '@/lib/demoMode';
import { stageDuplicateToOtherMode } from '@/hooks/useBotConfigPreload';
import { usePaperContext } from '@/hooks/usePaperContext';
import { useUIStore } from '@/stores/uiStore';
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import {
  isHedgeKind,
  type BotActionContext,
  type BotActionId,
  type BotFormActionContext,
  type BotRef,
} from '@/features/bots/actions/botActions';
import {
  buildBotBacktestRoute,
  buildBotCloneRoute,
  buildBotEditRoute,
  buildBotListRoute,
  buildBotViewRoute,
} from '@/utils/bots/navigation';
import { getTargetStatus } from '@/utils/botStatusUtils';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  type BotStatus,
  type BuyTypeEnum,
} from '@/types';
import {
  useBotArchive,
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from './useBotMutations';

/**
 * The single runner for bot actions.
 *
 * WHICH actions a bot offers (and when they are disabled) is decided by the
 * registry in `features/bots/actions/botActions.ts`; this hook EXECUTES them:
 * navigation, the lifecycle mutations, the confirmation modals' state and the
 * toasts. Every surface — cards, rows, the drawer, the bot form footer and
 * the hedge edit page — runs actions through here, so a status change, a
 * clone or an archive behaves the same wherever it was clicked.
 *
 *   const actions = useBotActions(toBotRef(bot, 'grid'));
 *   <BotActionsMenuItems actions={actions} surface="card" />
 *   <BotActionsModals {...actions.modalProps} />
 *
 * Surface-only actions (the form's import/export, reset, share-access and
 * funds dialogs) are supplied through `handlers`; a handler also overrides a
 * runner action (the drawer's caller-supplied edit/clone).
 */
export interface UseBotActionsOptions {
  /** Share-link visitor / someone else's bot: locks mutating actions. */
  viewOnly?: boolean;
  /**
   * Show the post-delete success modal. Surfaces that close themselves
   * after a delete can pass `false`.
   * @default true
   */
  showSuccessModal?: boolean;
  /** Set by the bot form surfaces; enables the form-only actions. */
  form?: BotFormActionContext;
  /** Share id carried into the backtest route (share-link visitors). */
  shareId?: string;
  handlers?: Partial<Record<BotActionId, () => void>>;
}

/** A start/stop request, with the options the stop/start dialogs collect. */
export interface BotStatusChangePayload {
  nextStatus: BotStatus;
  closeType?: CloseDCATypeEnum;
  closeGridType?: CloseGRIDTypeEnum;
  cancelPartiallyFilled?: boolean;
  buyType?: BuyTypeEnum;
  buyCount?: string;
  buyAmount?: number;
  /**
   * No success toast (the bot form, whose footer reflects the new status
   * itself). Failures still toast — from the mutation.
   */
  silent?: boolean;
}

export interface BotActionsModalProps {
  botName: string;
  status: BotStatus;
  botType: BotTypesEnum;

  statusModalOpen: boolean;
  onStatusModalOpenChange: (open: boolean) => void;
  onConfirmStatusChange: (
    closeType?: string,
    cancelPartiallyFilled?: boolean
  ) => void;
  hasActiveDeals: boolean;
  statusPending: boolean;
  gridFutures?: boolean;
  gridHasOpenPosition?: boolean;
  gridIsShort?: boolean;

  deleteModalOpen: boolean;
  onDeleteModalOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void | Promise<void>;
  deletePending: boolean;
  deleteTitle: string;
  deleteDescription: string;
  deleteActiveDeals: number;
  deleteTotalValue: number;
  deleteCurrency: string;
  deleteLastActivity: string;

  successModalOpen: boolean;
  onSuccessModalOpenChange: (open: boolean) => void;
  successType: 'clone' | 'delete';
  successNewItemId?: string;
}

export interface BotActionsController {
  /** The bot the actions target (paper flag resolved to the current mode). */
  bot: BotRef;
  /** Gating context the registry resolves items against. */
  ctx: BotActionContext;
  /** Run an action by id. Stable across renders. */
  run: (id: BotActionId) => void;
  /** Start/stop without a dialog (the caller already collected options). */
  changeStatus: (payload: BotStatusChangePayload) => void;
  statusPending: boolean;
  modalProps: BotActionsModalProps;
}

const HEDGE_DELETE_TITLE = 'Delete hedge bot';
const HEDGE_DELETE_DESCRIPTION =
  'Are you sure you want to delete this hedge bot? Both legs will be removed. This action cannot be undone.';
const DELETE_TITLE = 'Delete Bot';
const DELETE_DESCRIPTION =
  'Are you sure you want to delete this bot? This action cannot be undone.';

export function useBotActions(
  inputBot: BotRef,
  options: UseBotActionsOptions = {}
): BotActionsController {
  const {
    viewOnly = false,
    showSuccessModal = true,
    form,
    shareId,
    handlers,
  } = options;

  const navigate = useNavigate();
  const { setLiveTrading } = usePaperContext();
  const isPaperTrading = !useUIStore((s) => s.isLiveTrading);
  const toggleStarred = useStarredBotsStore((s) => s.toggleStarred);
  const starred = useStarredBotsStore((s) => s.starredBotIds.has(inputBot.id));

  const botType = inputBot.kind as BotTypesEnum;
  const statusToggleMutation = useBotStatusToggle(botType);
  const restartMutation = useBotRestart();
  const deleteMutation = useBotDelete();
  const archiveMutation = useBotArchive();

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Bots listed on a page always belong to the current trading mode, which
  // is what "Duplicate to live/paper" switches away from.
  const bot = useMemo<BotRef>(
    () =>
      inputBot.paper === isPaperTrading
        ? inputBot
        : { ...inputBot, paper: isPaperTrading },
    [inputBot, isPaperTrading]
  );

  const statusPending = statusToggleMutation.isPending;
  const restartPending = restartMutation.isPending;
  const deletePending = deleteMutation.isPending;
  const archivePending = archiveMutation.isPending;

  const readOnly = isReadOnly();
  const ctx = useMemo<BotActionContext>(
    () => ({
      readOnly,
      viewOnly,
      starred,
      pending: {
        start: statusPending,
        stop: statusPending,
        restart: restartPending,
        delete: deletePending,
        archive: archivePending,
        unarchive: archivePending,
      },
      ...(form ? { form } : {}),
    }),
    [
      readOnly,
      viewOnly,
      starred,
      statusPending,
      restartPending,
      deletePending,
      archivePending,
      form,
    ]
  );

  // `useMutation` returns a fresh object every render, but its `mutate` /
  // `mutateAsync` are bound once and stable. The callbacks below read
  // everything through this ref, so `run` / `changeStatus` keep one identity
  // for the component's lifetime — memoised consumers (ResponsiveButtonRow
  // on the drawer and form footers) are not re-rendered by live ticks.
  const latest = useRef({
    bot,
    handlers,
    shareId,
    navigate,
    setLiveTrading,
    toggleStarred,
    statusToggleMutate: statusToggleMutation.mutate,
    restartMutate: restartMutation.mutate,
    archiveMutate: archiveMutation.mutate,
  });
  latest.current = {
    bot,
    handlers,
    shareId,
    navigate,
    setLiveTrading,
    toggleStarred,
    statusToggleMutate: statusToggleMutation.mutate,
    restartMutate: restartMutation.mutate,
    archiveMutate: archiveMutation.mutate,
  };

  const changeStatus = useCallback((payload: BotStatusChangePayload) => {
    const { bot: target, statusToggleMutate } = latest.current;
    const starting = payload.nextStatus === 'open';
    const isGrid = target.kind === 'grid';
    statusToggleMutate(
      {
        id: target.id,
        status: payload.nextStatus,
        // Grid threads the close decision through `closeGridType` (+ the
        // partially-filled flag); DCA/combo/hedge use `closeType`.
        ...(isGrid
          ? {
              closeGridType: payload.closeGridType,
              cancelPartiallyFilled: payload.cancelPartiallyFilled,
            }
          : payload.closeType
            ? { closeType: payload.closeType }
            : {}),
        ...(payload.buyType ? { buyType: payload.buyType } : {}),
        ...(payload.buyCount ? { buyCount: payload.buyCount } : {}),
        ...(payload.buyAmount !== undefined
          ? { buyAmount: payload.buyAmount }
          : {}),
      },
      // Failures are toasted once, by the mutation itself (with the
      // backend's reason); a second toast here doubled every error.
      {
        onSuccess: () => {
          setStatusModalOpen(false);
          if (payload.silent) return;
          toast.success(
            `Bot "${target.name}" ${starting ? 'started' : 'stopped'} successfully`
          );
        },
      }
    );
  }, []);

  const confirmStatusChange = useCallback(
    (closeType?: string, cancelPartiallyFilled?: boolean) => {
      const target = latest.current.bot;
      const nextStatus = getTargetStatus(target.status);
      changeStatus(
        target.kind === 'grid'
          ? {
              nextStatus,
              closeGridType: closeType as CloseGRIDTypeEnum | undefined,
              cancelPartiallyFilled,
            }
          : {
              nextStatus,
              closeType: closeType as CloseDCATypeEnum | undefined,
            }
      );
    },
    [changeStatus]
  );

  const confirmDelete = useCallback(async () => {
    const target = latest.current.bot;
    try {
      await deleteMutation.mutateAsync({
        id: target.id,
        type: target.kind as BotTypesEnum,
      });
      setDeleteModalOpen(false);
      if (showSuccessModal) setSuccessModalOpen(true);
    } catch (error) {
      // The mutation already surfaced a toast; keep the modal open so the
      // user can retry or cancel.
      logger.error('[useBotActions] Delete failed', error);
    }
    // `mutateAsync` is stable; the mutation object is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteMutation.mutateAsync, showSuccessModal]);

  const run = useCallback((id: BotActionId) => {
    const {
      bot: target,
      handlers: surfaceHandlers,
      shareId: targetShareId,
      navigate: go,
      setLiveTrading: switchMode,
      toggleStarred: toggleStar,
      restartMutate,
      archiveMutate,
    } = latest.current;
    const handler = surfaceHandlers?.[id];
    if (handler) {
      handler();
      return;
    }
    const type = target.kind as BotTypesEnum;

    switch (id) {
      case 'openNewTab':
        window.open(buildBotViewRoute(type, target.id), '_blank');
        return;
      case 'star':
        toggleStar(target.id);
        return;
      case 'start':
      case 'stop':
        setStatusModalOpen(true);
        return;
      case 'restart':
        restartMutate(
          { id: target.id, type },
          // The mutation toasts a failure itself.
          {
            onSuccess: () =>
              toast.success(`Bot "${target.name}" restarted successfully`),
          }
        );
        return;
      case 'edit':
        go(buildBotEditRoute(type, target.id));
        return;
      // Clone always opens the pre-filled create page, so the pair and
      // exchange stay editable before anything is saved.
      case 'clone':
        go(buildBotCloneRoute(type, target.id));
        return;
      case 'backtest':
        go(buildBotBacktestRoute(type, target.id, targetShareId));
        return;
      case 'shareConfig':
        void navigator.clipboard
          .writeText(JSON.stringify(target.raw ?? {}, null, 2))
          .then(() => toast.success('Configuration copied to clipboard'))
          .catch((error: unknown) => {
            logger.error('[useBotActions] Share config copy failed', error);
            toast.error('Failed to copy configuration');
          });
        return;
      // Stage the source bot's settings, switch to the other trading mode
      // and open that mode's create page for this bot type.
      case 'duplicateToOtherMode': {
        const toLive = target.paper;
        try {
          // The registry offers this for DCA / combo / grid bots only.
          stageDuplicateToOtherMode(
            type as BotTypesEnum.dca | BotTypesEnum.combo | BotTypesEnum.grid,
            (target.raw ?? {}) as { settings?: unknown; exchange?: string },
            toLive
          );
        } catch (error) {
          logger.error('[useBotActions] Failed to stage duplicate', error);
          toast.error('Failed to stage configuration');
          return;
        }
        switchMode(toLive);
        go(`${buildBotListRoute(type)}/new`);
        return;
      }
      // Archiving is reversible (un-archive rehydrates cold-stored history),
      // so there is no confirmation step.
      case 'archive':
      case 'unarchive':
        archiveMutate({ id: target.id, archive: id === 'archive', type });
        return;
      case 'delete':
        setDeleteModalOpen(true);
        return;
      case 'importExport':
      case 'resetDefaults':
      case 'shareAccess':
      case 'addFunds':
      case 'reduceFunds':
        logger.warn(`[useBotActions] "${id}" needs a surface handler`);
        return;
      default: {
        const unhandled: never = id;
        logger.warn('[useBotActions] Unhandled bot action', unhandled);
      }
    }
  }, []);

  const hedge = isHedgeKind(bot.kind);
  const modalProps: BotActionsModalProps = {
    botName: bot.name,
    status: bot.status as BotStatus,
    botType,
    statusModalOpen,
    onStatusModalOpenChange: setStatusModalOpen,
    onConfirmStatusChange: confirmStatusChange,
    hasActiveDeals: bot.activeDeals > 0,
    statusPending,
    ...(bot.grid
      ? {
          gridFutures: bot.grid.futures,
          gridHasOpenPosition: bot.grid.hasOpenPosition,
          gridIsShort: bot.grid.isShort,
        }
      : {}),
    deleteModalOpen,
    onDeleteModalOpenChange: setDeleteModalOpen,
    onConfirmDelete: confirmDelete,
    deletePending,
    deleteTitle: hedge ? HEDGE_DELETE_TITLE : DELETE_TITLE,
    deleteDescription: hedge ? HEDGE_DELETE_DESCRIPTION : DELETE_DESCRIPTION,
    deleteActiveDeals: bot.activeDeals,
    deleteTotalValue: bot.totalValue,
    deleteCurrency: bot.currency,
    deleteLastActivity: bot.lastActivity,
    successModalOpen,
    onSuccessModalOpenChange: setSuccessModalOpen,
    successType: 'delete',
  };

  return { bot, ctx, run, changeStatus, statusPending, modalProps };
}
