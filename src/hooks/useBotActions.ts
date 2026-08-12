import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';
import {
  buildBotCloneRoute,
  buildBotEditRoute,
} from '@/utils/bots/navigation';
import {
  getActionPastTense,
  getTargetStatus,
  isBotActive,
} from '@/utils/botStatusUtils';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  type Bot,
  type BotStatus,
  type ComboBot,
  type DCABot,
} from '@/types';
import {
  useBotDelete,
  useBotRestart,
  useBotStatusToggle,
} from './useBotMutations';

/**
 * Shared bot-action orchestration.
 *
 * The lifecycle *mutations* already live in `useBotMutations`. What used to be
 * copy-pasted (and had drifted) across every bot surface — BotCard, the detail
 * drawer, the grid/hedge cards, and the four list pages — is the *orchestration*
 * around them: which modal opens, what "Clone" means, how a stop's close-type is
 * threaded, the success/toast wiring. This hook owns that once so a surface never
 * re-decides it.
 *
 * A surface calls `useBotActions(...)` and gets:
 *   - `menuProps` — spread straight into `<BotActionsMenuItems bot={…} {...menuProps} />`
 *   - `modalProps` — spread straight into `<BotActionsModals {...modalProps} />`
 *   - raw handlers (`edit`, `clone`, `restart`, `openStatusModal`, `openDeleteModal`)
 *     for surfaces that also render their own button row (e.g. the drawer footer).
 *
 * Canonical decisions encoded here:
 *   - **Clone always opens the pre-filled create page** (`buildBotCloneRoute`) for
 *     every bot type, so the pair/exchange stay editable. The old combo/grid
 *     "immediate copy" behaviour (which locked the pair) is gone.
 *   - **Status toggle always routes through the confirmation modal**, then the
 *     shared `useBotStatusToggle` mutation (grid threads `closeGridType` +
 *     `cancelPartiallyFilled`; everything else threads `closeType`). Hedge shares
 *     the same mutation now that it does optimistic updates on the hedge stores.
 *   - **Archive is intentionally not handled here** — `BotActionsMenuItems` owns
 *     it internally (the archive/unarchive status matching lives there); passing
 *     `onArchive` would just duplicate it.
 */
export interface UseBotActionsParams {
  /**
   * The id the mutations target. For a hedge bot viewed in the drawer this is
   * the wrapper id (`parentBotId ?? bot._id`); the caller resolves that.
   */
  botId: string;
  botType: BotTypesEnum;
  botName: string;
  status: BotStatus;

  /** Number of currently-open deals — gates the stop close-type dialog and
   *  feeds the delete confirmation. */
  activeDeals?: number;
  /** Quote-currency value shown in the delete confirmation. */
  totalValue?: number;
  /** Quote asset shown in the delete confirmation. */
  currency?: string;
  /** "Last activity" line in the delete confirmation (usually `bot.created`). */
  lastActivity?: string;

  /** Grid stop-dialog context — only meaningful when `botType === grid`. */
  gridFutures?: boolean;
  gridHasOpenPosition?: boolean;
  gridIsShort?: boolean;

  /**
   * Show the post-action success modal. List cards use it (clone/delete
   * feedback); surfaces that manage their own close flow can pass `false`.
   * @default true
   */
  showSuccessModal?: boolean;

  /** Copy-to-clipboard payload for "Share Configuration". When omitted the
   *  Share item falls back to `onShareConfig`. */
  botData?: DCABot | ComboBot | Bot | unknown;

  /** Custom delete-confirmation copy (hedge overrides the wording). */
  deleteTitle?: string;
  deleteDescription?: string;

  // --- Escape hatches: override a single action's default behaviour. ---
  /** Replace the default edit navigation. */
  onEdit?: () => void;
  /** Replace the default clone navigation. */
  onClone?: () => void;
  /** "Duplicate to live/paper" — genuinely surface-specific, always injected. */
  onCopyToLive?: () => void;
  /** Replace the default clipboard "Share Configuration". */
  onShareConfig?: () => void;
  /**
   * Page-level status override (e.g. a list page that batches its own toast /
   * optimistic handling). Still driven through the confirmation modal; receives
   * the resolved target status and the chosen close-type.
   */
  onToggleStatus?: (
    targetStatus: BotStatus,
    closeType?: string
  ) => Promise<void> | void;
  /** External pending flag for the status toggle when `onToggleStatus` is set. */
  statusTogglePending?: boolean;
}

export interface BotActionsMenuHandlers {
  pending: {
    statusToggle: boolean;
    restart: boolean;
    clone: boolean;
    delete: boolean;
  };
  onToggleStatus: () => void;
  onRestart: () => void;
  onEdit: () => void;
  onClone: () => void;
  onShareConfig: () => void;
  onCopyToLive: () => void;
  onDelete: () => void;
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
  menuProps: BotActionsMenuHandlers;
  modalProps: BotActionsModalProps;
  /** Raw handlers for surfaces that render their own action buttons. */
  edit: () => void;
  clone: () => void;
  restart: () => void;
  openStatusModal: () => void;
  openDeleteModal: () => void;
  pending: BotActionsMenuHandlers['pending'];
}

export function useBotActions(
  params: UseBotActionsParams
): BotActionsController {
  const {
    botId,
    botType,
    botName,
    status,
    activeDeals = 0,
    totalValue = 0,
    currency = '',
    lastActivity = 'Unknown',
    gridFutures,
    gridHasOpenPosition,
    gridIsShort,
    showSuccessModal = true,
    botData,
    deleteTitle = 'Delete Bot',
    deleteDescription = 'Are you sure you want to delete this bot? This action cannot be undone.',
    onEdit,
    onClone,
    onCopyToLive,
    onShareConfig,
    onToggleStatus,
    statusTogglePending,
  } = params;

  const navigate = useNavigate();
  const isGrid = botType === BotTypesEnum.grid;

  const statusToggleMutation = useBotStatusToggle(botType);
  const restartMutation = useBotRestart();
  const deleteMutation = useBotDelete();

  // React Query's `useMutation` returns `{ ...result, mutate, mutateAsync }` —
  // a fresh object literal on EVERY render. So a `useCallback` that lists the
  // mutation OBJECT in its deps never actually memoises: it hands back a new
  // function each render, and that instability fans out to every memoised
  // consumer. On the bot detail drawer, `bot` is replaced on each socket
  // stats/deal tick (~26x/s); `restart` being new each tick recomputed
  // `footerActionButtons`, which re-rendered the memoised ResponsiveButtonRow
  // at the same rate (RenderLoopTripwire "26 renders in 820ms" on
  // /combo/view + /grid/view — bug #381; #355 patched a call site instead of
  // this hook, which is why it came back on a different surface).
  //
  // `mutate` is bound once in the MutationObserver's constructor and handed
  // through unchanged, so it IS referentially stable — depend on it, not on
  // its wrapper. Everything else these callbacks read off the mutation object
  // (`isPending`) is consumed at render time, not inside the callback.
  const restartMutate = restartMutation.mutate;
  const statusToggleMutate = statusToggleMutation.mutate;
  const deleteMutateAsync = deleteMutation.mutateAsync;

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [successType, setSuccessType] = useState<'clone' | 'delete'>('delete');

  // --- Edit ---
  const edit = useCallback(() => {
    if (onEdit) {
      onEdit();
      return;
    }
    navigate(buildBotEditRoute(botType, botId));
  }, [onEdit, navigate, botType, botId]);

  // --- Clone (canonical: open the pre-filled create page) ---
  const clone = useCallback(() => {
    if (onClone) {
      onClone();
      return;
    }
    navigate(buildBotCloneRoute(botType, botId));
  }, [onClone, navigate, botType, botId]);

  // --- Restart ---
  const restart = useCallback(() => {
    restartMutate(
      { id: botId, type: botType },
      {
        onSuccess: () => toast.success(`Bot "${botName}" restarted successfully`),
        onError: () => toast.error(`Failed to restart bot "${botName}"`),
      }
    );
  }, [restartMutate, botId, botType, botName]);

  // --- Status toggle (modal → mutation) ---
  const openStatusModal = useCallback(() => setStatusModalOpen(true), []);

  const confirmStatusChange = useCallback(
    (closeType?: string, cancelPartiallyFilled?: boolean) => {
      const targetStatus = getTargetStatus(status);
      const wasActive = isBotActive(status);

      // Page-level override (e.g. a list page that batches its own handling).
      if (onToggleStatus) {
        Promise.resolve(onToggleStatus(targetStatus, closeType))
          .then(() => {
            setStatusModalOpen(false);
            toast.success(
              `Bot "${botName}" ${getActionPastTense(status)} successfully`
            );
          })
          .catch((error) => {
            logger.error('[useBotActions] Status toggle override failed', error);
            toast.error(
              `Failed to ${wasActive ? 'stop' : 'start'} bot "${botName}"`
            );
          });
        return;
      }

      statusToggleMutate(
        {
          id: botId,
          status: targetStatus,
          // Grid threads the close decision through `closeGridType` (+ the
          // partially-filled flag); DCA/combo/hedge use `closeType`.
          ...(isGrid
            ? {
                closeGridType: closeType as CloseGRIDTypeEnum | undefined,
                cancelPartiallyFilled,
              }
            : { closeType: closeType as CloseDCATypeEnum | undefined }),
        },
        {
          onSuccess: () => {
            setStatusModalOpen(false);
            toast.success(
              `Bot "${botName}" ${getActionPastTense(status)} successfully`
            );
          },
          onError: () => {
            toast.error(
              `Failed to ${wasActive ? 'stop' : 'start'} bot "${botName}"`
            );
          },
        }
      );
    },
    [status, onToggleStatus, statusToggleMutate, botId, isGrid, botName]
  );

  // --- Delete (modal → mutation → optional success modal) ---
  const openDeleteModal = useCallback(() => setDeleteModalOpen(true), []);

  const confirmDelete = useCallback(async () => {
    try {
      await deleteMutateAsync({ id: botId, type: botType });
      setDeleteModalOpen(false);
      if (showSuccessModal) {
        setSuccessType('delete');
        setSuccessModalOpen(true);
      }
    } catch (error) {
      // The mutation already surfaced a toast; keep the modal open so the
      // user can retry or cancel.
      logger.error('[useBotActions] Delete failed', error);
    }
  }, [deleteMutateAsync, botId, botType, showSuccessModal]);

  // --- Share Configuration (clipboard) ---
  const shareConfig = useCallback(async () => {
    if (onShareConfig) {
      onShareConfig();
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(botData ?? {}, null, 2));
      toast.success('Configuration copied to clipboard');
    } catch (error) {
      logger.error('[useBotActions] Share config copy failed', error);
      toast.error('Failed to copy configuration');
    }
  }, [onShareConfig, botData]);

  // --- Duplicate to live/paper (surface-specific; no default) ---
  const copyToLive = useCallback(() => {
    if (onCopyToLive) {
      onCopyToLive();
      return;
    }
    // No sensible generic default — a surface that shows this action injects it.
    toast.info('Duplicate to live/paper is not available here.');
  }, [onCopyToLive]);

  const statusPending = onToggleStatus
    ? !!statusTogglePending
    : statusToggleMutation.isPending;

  const pending: BotActionsMenuHandlers['pending'] = {
    statusToggle: statusPending,
    restart: restartMutation.isPending,
    // Clone navigates — it is never "pending".
    clone: false,
    delete: deleteMutation.isPending,
  };

  return {
    menuProps: {
      pending,
      onToggleStatus: openStatusModal,
      onRestart: restart,
      onEdit: edit,
      onClone: clone,
      onShareConfig: shareConfig,
      onCopyToLive: copyToLive,
      onDelete: openDeleteModal,
    },
    modalProps: {
      botName,
      status,
      botType,
      statusModalOpen,
      onStatusModalOpenChange: setStatusModalOpen,
      onConfirmStatusChange: confirmStatusChange,
      hasActiveDeals: activeDeals > 0,
      statusPending,
      gridFutures,
      gridHasOpenPosition,
      gridIsShort,
      deleteModalOpen,
      onDeleteModalOpenChange: setDeleteModalOpen,
      onConfirmDelete: confirmDelete,
      deletePending: deleteMutation.isPending,
      deleteTitle,
      deleteDescription,
      deleteActiveDeals: activeDeals,
      deleteTotalValue: totalValue,
      deleteCurrency: currency,
      deleteLastActivity: lastActivity,
      successModalOpen,
      onSuccessModalOpenChange: setSuccessModalOpen,
      successType,
    },
    edit,
    clone,
    restart,
    openStatusModal,
    openDeleteModal,
    pending,
  };
}
