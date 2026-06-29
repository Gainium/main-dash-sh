import { useMutation } from '@tanstack/react-query';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import { GraphQLClient } from '../lib/api';
import { logger } from '../lib/loggerInstance';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  DCADealStatusEnum,
  type AddFundsSettings,
  type DCADealsSettings,
} from '@/types';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { toast } from '@/lib/toast';
import type { AdjustFundsDialogMode } from '@/features/bots/shared/runtime';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useDealStore } from '@/stores/live';
import { recordDealTombstone } from '@/stores/live/staleWriteGuard';
import {
  removeDealFromListCaches,
  invalidateListCaches,
  DEAL_LIST_QUERY_KEYS,
} from '@/lib/queryCacheUtils';

interface CloseDealInput {
  dealId: string;
  botId: string;
  type: CloseDCATypeEnum; // 'leave', 'cancel', 'closeByLimit', 'closeByMarket'
}

interface DealResponse {
  status: 'OK' | 'NOTOK';
  reason?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

interface EditDealResponse {
  status: 'OK' | 'NOTOK';
  reason?: string;
  data?: string;
}

interface AdjustFundsInput {
  dealId: string;
  botId: string;
  settings: AddFundsSettings;
  mode: AdjustFundsDialogMode;
}

interface MoveDealToTerminalInput {
  dealId: string;
  botId: string;
  combo: boolean;
}

interface MoveDealToBotInput {
  /** The terminal deal being moved. */
  dealId: string;
  /** The existing DCA bot to adopt the deal into. */
  targetBotId: string;
  /** The terminal bot currently hosting the deal (cleaned up after the move). */
  sourceBotId: string;
}

/**
 * Optimistically reflect a close/cancel in the deal store so the deal leaves
 * the active list immediately, rather than waiting for a `bot deal update`
 * websocket event that may be delayed or dropped (there is no polling
 * fallback for deals). Mirrors the legacy dashboard, which updates local
 * state on close.
 *
 * `closeByLimit` is intentionally left untouched: the deal stays open with a
 * pending close order until it fills, so it's correctly still active.
 * A later websocket update / refetch reconciles the precise final status.
 */
function optimisticallyMarkDealClosed(
  botId: string,
  dealId: string,
  type: CloseDCATypeEnum
) {
  const newStatus =
    type === CloseDCATypeEnum.cancel
      ? DCADealStatusEnum.canceled
      : type === CloseDCATypeEnum.leave ||
          type === CloseDCATypeEnum.closeByMarket
        ? DCADealStatusEnum.closed
        : null;
  // `closeByLimit` yields a null status (deal stays open until the limit
  // order fills) — bailing here means no tombstone / cache eviction for it.
  if (!newStatus || !botId || !dealId) {
    return;
  }
  const store = useDealStore.getState();
  const existing = store.getDeal(botId, dealId);
  if (existing) {
    store.updateDeal(botId, { ...existing, status: newStatus }, existing.dealType);
  }
  // Tombstone + evict from the persisted RQ list caches so a stale cached
  // active-deal response can't replay this just-closed deal back into the
  // store on the next mount/reload.
  recordDealTombstone(botId, dealId, newStatus, existing?.updateTime ?? 0);
  removeDealFromListCaches(dealId, DEAL_LIST_QUERY_KEYS);
  invalidateListCaches(DEAL_LIST_QUERY_KEYS);
}

// Hook for closing DCA deals
export function useCloseDCADeal() {
  const { tokens } = useAuthStore();

  // Get the paper context from the UI store (live/paper trading mode)
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );

  return useMutation<DealResponse, Error, CloseDealInput>({
    mutationFn: async ({ dealId, type, botId }) => {
      logger.info('[useCloseDCADeal] Closing DCA deal:', { dealId, type });

      const { query, variables } = botQueries.closeDCADeal({
        dealId,
        botId,
        type,
      });

      const response = await client.request<{
        closeDCADeal: DealResponse;
      }>(query, variables);

      if (response.closeDCADeal.status !== 'OK') {
        throw new Error(response.closeDCADeal.reason || 'Failed to close deal');
      }

      return response.closeDCADeal;
    },
    onSuccess: (data, variables) => {
      logger.info('[useCloseDCADeal] DCA deal closed successfully:', {
        dealId: variables.dealId,
        type: variables.type,
        response: data,
      });
      optimisticallyMarkDealClosed(
        variables.botId,
        variables.dealId,
        variables.type
      );
    },
    onError: (error, variables) => {
      logger.error('[useCloseDCADeal] Failed to close DCA deal:', {
        dealId: variables.dealId,
        type: variables.type,
        error: error.message,
      });
    },
  });
}

// Hook for adjusting funds in DCA deals
export function useAdjustFunds() {
  const { tokens } = useAuthStore();

  // Get the paper context from the UI store (live/paper trading mode)
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );

  return useMutation<DealResponse, Error, AdjustFundsInput>({
    // The call sites fire this mutation without awaiting it, so surface
    // failures through the global error net rather than at the call site.
    meta: { errorToast: true },
    mutationFn: async (input) => {
      logger.info('[useAdjustFunds] Adjust DCA Deals funds:', input);

      const { mode, settings, ...rest } = input;

      const { query, variables } =
        mode === 'add'
          ? dealQueries.addDealFunds({ ...rest, ...settings })
          : dealQueries.reduceDealFunds({ ...rest, ...settings });

      const response = await client.request<{
        addDealFunds?: DealResponse;
        reduceDealFunds?: DealResponse;
      }>(query, variables);

      if (mode === 'add') {
        if (response.addDealFunds?.status !== 'OK') {
          throw new Error(
            response.addDealFunds?.reason || 'Failed to add funds'
          );
        } else {
          return response.addDealFunds;
        }
      }
      if (mode === 'reduce') {
        if (response.reduceDealFunds?.status !== 'OK') {
          throw new Error(
            response.reduceDealFunds?.reason || 'Failed to reduce funds'
          );
        } else {
          return response.reduceDealFunds;
        }
      }

      return { status: 'NOTOK', reason: 'Invalid operation' };
    },
    onSuccess: (response, variables) => {
      logger.info('[useAdjustFunds] Adjust-funds request accepted:', {
        dealId: variables.dealId,
        mode: variables.mode,
        response,
      });
      // The OK response only means the request was QUEUED — the order is
      // placed on the exchange later and may still be rejected there (that
      // rejection arrives asynchronously as a `bot sends message` error,
      // surfaced by LiveMessageToaster). So echo the backend's "scheduled"
      // message instead of implying the funds already moved.
      const scheduledMsg =
        typeof response?.data === 'string' && response.data.trim()
          ? response.data
          : variables.mode === 'add'
            ? 'Add funds scheduled'
            : 'Reduce funds scheduled';
      toast.info(scheduledMsg);
    },
    onError: (error, variables) => {
      logger.error('[useCloseDCADeal] Failed to adjust funds in DCA deal:', {
        dealId: variables.dealId,
        mode: variables.mode,
        error: error.message,
      });
    },
  });
}

// Hook for closing Combo deals
export function useCloseComboDeal() {
  const { tokens } = useAuthStore();

  // Get the paper context from the UI store (live/paper trading mode)
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );
  return useMutation<DealResponse, Error, CloseDealInput>({
    mutationFn: async ({ dealId, type, botId }) => {
      logger.info('[useCloseComboDeal] Closing Combo deal:', { dealId, type });

      const { query, variables } = botQueries.closeComboDeal({
        dealId,
        botId,
        type,
      });

      const response = await client.request<{
        closeComboDeal: DealResponse;
      }>(query, variables);

      if (response.closeComboDeal.status !== 'OK') {
        throw new Error(
          response.closeComboDeal.reason || 'Failed to close combo deal'
        );
      }

      return response.closeComboDeal;
    },
    onSuccess: (data, variables) => {
      logger.info('[useCloseComboDeal] Combo deal closed successfully:', {
        dealId: variables.dealId,
        type: variables.type,
        response: data,
      });
      optimisticallyMarkDealClosed(
        variables.botId,
        variables.dealId,
        variables.type
      );
    },
    onError: (error, variables) => {
      logger.error('[useCloseComboDeal] Failed to close combo deal:', {
        dealId: variables.dealId,
        type: variables.type,
        error: error.message,
      });
    },
  });
}

// Hook for closing Multi-Pair DCA deals
export function useCloseMultiPairDeal() {
  const { tokens } = useAuthStore();

  // Get the paper context from the UI store (live/paper trading mode)
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );
  return useMutation<DealResponse, Error, CloseDealInput>({
    mutationFn: async ({ dealId, type }) => {
      logger.info('[useCloseMultiPairDeal] Closing Multi-Pair deal:', {
        dealId,
        type,
      });

      const { query, variables } = botQueries.closeMultiPairDCADeal({
        dealId,
        type,
      });

      const response = await client.request<{
        closeMultiPairDCADeal: DealResponse;
      }>(query, variables);

      if (response.closeMultiPairDCADeal.status !== 'OK') {
        throw new Error(
          response.closeMultiPairDCADeal.reason ||
            'Failed to close multi-pair deal'
        );
      }

      return response.closeMultiPairDCADeal;
    },
    onSuccess: (data, variables) => {
      logger.info(
        '[useCloseMultiPairDeal] Multi-Pair deal closed successfully:',
        {
          dealId: variables.dealId,
          type: variables.type,
          response: data,
        }
      );
      optimisticallyMarkDealClosed(
        variables.botId,
        variables.dealId,
        variables.type
      );
    },
    onError: (error, variables) => {
      logger.error('[useCloseMultiPairDeal] Failed to close multi-pair deal:', {
        dealId: variables.dealId,
        type: variables.type,
        error: error.message,
      });
    },
  });
}

export function useMoveDealToTerminal() {
  const { tokens } = useAuthStore();

  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );

  return useMutation<DealResponse, Error, MoveDealToTerminalInput>({
    mutationFn: async ({ dealId, botId, combo }) => {
      logger.info('[useMoveDealToTerminal] Moving deal to terminal:', {
        dealId,
        botId,
        combo,
      });

      const { query, variables } = dealQueries.moveDealToTerminal({
        dealId,
        botId,
        combo,
      });

      const response = await client.request<{
        moveDealToTerminal: DealResponse;
      }>(query, variables);

      if (response.moveDealToTerminal.status !== 'OK') {
        throw new Error(
          response.moveDealToTerminal.reason ||
            'Failed to move deal to terminal'
        );
      }

      return response.moveDealToTerminal;
    },
    onSuccess: (data, variables) => {
      logger.info('[useMoveDealToTerminal] Deal moved to terminal', {
        dealId: variables.dealId,
        botId: variables.botId,
        response: data,
      });
      // The deal is no longer one of this bot's deals (it now lives under
      // terminal), so drop it from the bot's list immediately. Capture its
      // updateTime first so the tombstone can arbitrate a stale cached replay.
      const existing = useDealStore
        .getState()
        .getDeal(variables.botId, variables.dealId);
      useDealStore.getState().removeDeal(variables.botId, variables.dealId);
      // Unlike a close, moving to terminal does NOT change the deal's status,
      // so a stale active-list replay would still carry the pre-move status.
      // Record the tombstone with a sentinel status that no real deal status
      // can equal — otherwise consultDealTombstone's status-equality accept
      // branch would treat the stale replay as a harmless echo and resurrect
      // the moved deal. A genuinely newer server update still clears the
      // tombstone via the updateTime branch.
      recordDealTombstone(
        variables.botId,
        variables.dealId,
        'moved-to-terminal',
        existing?.updateTime ?? 0
      );
      removeDealFromListCaches(variables.dealId, DEAL_LIST_QUERY_KEYS);
      invalidateListCaches(DEAL_LIST_QUERY_KEYS);
    },
    onError: (error, variables) => {
      logger.error('[useMoveDealToTerminal] Failed to move deal to terminal', {
        dealId: variables.dealId,
        botId: variables.botId,
        error: error.message,
      });
    },
  });
}

/**
 * Best-effort cleanup of the now-empty terminal bot a deal was moved out of.
 *
 * The backend schedules the merge on the target bot's worker and only cancels
 * the source (terminal) deal a moment later, so `deleteBot` may briefly report
 * "Cannot delete bot with active deal" — retry a few times, then give up. An
 * empty terminal bot has no open deals and is invisible in the terminal view,
 * so a leftover is harmless (deleting it only ever soft-deletes the already
 * cancelled original deal; the freshly adopted deal lives under the target
 * bot's id and is never touched).
 */
async function cleanupOrphanTerminalBot(
  client: GraphQLClient,
  botId: string
): Promise<void> {
  const { query, variables } = botQueries.deleteBot({
    id: botId,
    type: BotTypesEnum.dca,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    try {
      const result = await client.request<{ deleteBot: DealResponse }>(
        query,
        variables
      );
      if (result.deleteBot.status === 'OK') {
        logger.info('[useMoveDealToBot] Orphan terminal bot deleted', { botId });
        return;
      }
      logger.info(
        '[useMoveDealToBot] Orphan terminal bot not yet deletable, will retry',
        { botId, reason: result.deleteBot.reason }
      );
    } catch (error) {
      logger.warn('[useMoveDealToBot] deleteBot attempt failed', {
        botId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.warn(
    '[useMoveDealToBot] Gave up deleting orphan terminal bot (harmless; it is empty and hidden)',
    { botId }
  );
}

/**
 * Move a terminal deal into an existing DCA bot — the inverse of
 * {@link useMoveDealToTerminal}.
 *
 * There is no dedicated backend mutation for this. We reuse `mergeDeals`, which
 * adopts the deal's live position into the target bot (recomputed from the
 * deal's filled orders, with TP/SL/DCA reset to the target bot's policy) and
 * cancels the original terminal deal — exactly the safe "land the position in
 * the bot, bare" behaviour. The now-empty terminal bot is then best-effort
 * deleted.
 *
 * Mirrors `useMoveDealToTerminal`'s optimistic store cleanup so the moved deal
 * isn't resurrected by a stale cached websocket replay (its status doesn't
 * change in a way the tombstone's updateTime branch would catch, so we use a
 * sentinel status).
 */
export function useMoveDealToBot() {
  const { tokens } = useAuthStore();

  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );

  return useMutation<DealResponse, Error, MoveDealToBotInput>({
    mutationFn: async ({ dealId, targetBotId, sourceBotId }) => {
      logger.info('[useMoveDealToBot] Moving terminal deal to bot:', {
        dealId,
        targetBotId,
        sourceBotId,
      });

      const { query, variables } = dealQueries.mergeDeals({
        botId: targetBotId,
        dealIds: [dealId],
      });

      const response = await client.request<{
        mergeDeals: DealResponse;
      }>(query, variables);

      if (response.mergeDeals.status !== 'OK') {
        throw new Error(
          response.mergeDeals.reason || 'Failed to move deal to bot'
        );
      }

      // Fire-and-forget: reap the empty terminal bot once the merge settles.
      // Never blocks (or fails) the move itself.
      void cleanupOrphanTerminalBot(client, sourceBotId);

      return response.mergeDeals;
    },
    onSuccess: (data, variables) => {
      logger.info('[useMoveDealToBot] Deal moved to bot', {
        dealId: variables.dealId,
        targetBotId: variables.targetBotId,
        response: data,
      });
      // The deal no longer lives under the terminal bot — drop it from the
      // terminal scope immediately. Capture updateTime first so the tombstone
      // can arbitrate a stale cached replay.
      const existing = useDealStore
        .getState()
        .getDeal(variables.sourceBotId, variables.dealId);
      useDealStore.getState().removeDeal(variables.sourceBotId, variables.dealId);
      recordDealTombstone(
        variables.sourceBotId,
        variables.dealId,
        'moved-to-bot',
        existing?.updateTime ?? 0
      );
      removeDealFromListCaches(variables.dealId, DEAL_LIST_QUERY_KEYS);
      invalidateListCaches(DEAL_LIST_QUERY_KEYS);
    },
    onError: (error, variables) => {
      logger.error('[useMoveDealToBot] Failed to move deal to bot', {
        dealId: variables.dealId,
        targetBotId: variables.targetBotId,
        error: error.message,
      });
    },
  });
}

export type ChangeDealInput = {
  botId: string;
  dealId: string;
  settings: Partial<DCADealsSettings>;
};
export type UseEditDealOptions = ChangeDealInput & {
  type: BotTypesEnum;
  terminal?: boolean;
};
export type ResetDealInput = { botId: string; dealId: string };
export type UseResetDealOptions = ResetDealInput & {
  type: BotTypesEnum;
  terminal?: boolean;
  originalSettings: Partial<DCADealsSettings>;
};
type EditOptions = {
  onSuccess?: () => void;
  onError?: (e: Error) => void;
};
// Hook for reseting deals
export function useResetDeal(options?: EditOptions) {
  const { tokens } = useAuthStore();

  // Get the paper context from the UI store (live/paper trading mode)
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );

  return useMutation<EditDealResponse, Error, UseResetDealOptions>({
    mutationFn: async ({ dealId, type, botId }) => {
      logger.info('[useResetDeal] Resetting deal:', { dealId, type });
      const q =
        type === BotTypesEnum.dca
          ? dealQueries.resetDealSettings
          : dealQueries.resetComboDealSettings;
      const { query, variables } = q({
        dealId,
        botId,
      });

      if (type === BotTypesEnum.dca) {
        const response = await client.request<{
          resetDealSettings: EditDealResponse;
        }>(query, variables);

        if (response.resetDealSettings.status !== 'OK') {
          throw new Error(
            response.resetDealSettings.reason || 'Failed to change deal'
          );
        }

        return response.resetDealSettings;
      }

      const response = await client.request<{
        resetComboDealSettings: EditDealResponse;
      }>(query, variables);

      if (response.resetComboDealSettings.status !== 'OK') {
        throw new Error(
          response.resetComboDealSettings.reason || 'Failed to change deal'
        );
      }

      return response.resetComboDealSettings;
    },
    onSuccess: (_, { dealId, botId, originalSettings, type, terminal }) => {
      const get = useDealStore.getState().getDeal(botId, dealId);
      if (get) {
        useDealStore.getState().updateDeal(
          botId,
          {
            ...get,
            settings: { ...get.settings, ...originalSettings },
          },
          type === BotTypesEnum.combo ? 'combo' : terminal ? 'terminal' : 'dca'
        );
      }
      options?.onSuccess?.();
    },
    onError: (e) => {
      options?.onError?.(e);
    },
  });
}

// Hook for editing deals
export function useEditDeal(options?: EditOptions) {
  const { tokens } = useAuthStore();

  // Get the paper context from the UI store (live/paper trading mode)
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const client = new GraphQLClient(
    import.meta.env['VITE_API_ENDPOINT'],
    tokens?.accessToken,
    !isLiveTrading
  );

  return useMutation<EditDealResponse, Error, UseEditDealOptions>({
    mutationFn: async ({ dealId, type, botId, settings }) => {
      logger.info('[useEditDeal] Editing deal:', { dealId, type });
      const q =
        type === BotTypesEnum.dca
          ? dealQueries.changeDCADealSettings
          : dealQueries.changeComboDealSettings;
      const { query, variables } = q({
        dealId,
        botId,
        settings,
      });

      if (type === BotTypesEnum.dca) {
        const response = await client.request<{
          changeDCADealSettings: EditDealResponse;
        }>(query, variables);

        if (response.changeDCADealSettings.status !== 'OK') {
          throw new Error(
            response.changeDCADealSettings.reason || 'Failed to change deal'
          );
        }

        return response.changeDCADealSettings;
      }

      const response = await client.request<{
        changeComboDealSettings: EditDealResponse;
      }>(query, variables);

      if (response.changeComboDealSettings.status !== 'OK') {
        throw new Error(
          response.changeComboDealSettings.reason || 'Failed to change deal'
        );
      }

      return response.changeComboDealSettings;
    },
    onSuccess: (_, { dealId, botId, settings, type, terminal }) => {
      const get = useDealStore.getState().getDeal(botId, dealId);
      if (get) {
        useDealStore.getState().updateDeal(
          botId,
          {
            ...get,
            settings: { ...get.settings, ...settings },
          },
          type === BotTypesEnum.combo ? 'combo' : terminal ? 'terminal' : 'dca'
        );
      }
      options?.onSuccess?.();
    },
    onError: (e) => {
      options?.onError?.(e);
    },
  });
}

// Generic deal management hook
export function useDealActions() {
  const closeDCA = useCloseDCADeal();
  const closeCombo = useCloseComboDeal();
  const closeMultiPair = useCloseMultiPairDeal();

  const closeDeal = async (
    dealId: string,
    botId: string,
    type: CloseDCATypeEnum,
    dealType: 'dca' | 'combo' | 'multiPair' = 'dca'
  ) => {
    switch (dealType) {
      case 'dca':
        return closeDCA.mutateAsync({ dealId, botId, type });
      case 'combo':
        return closeCombo.mutateAsync({ dealId, botId, type });
      case 'multiPair':
        return closeMultiPair.mutateAsync({ dealId, botId, type });
      default:
        throw new Error(`Unknown deal type: ${dealType}`);
    }
  };

  return {
    closeDeal,
    closeDCADeal: closeDCA.mutateAsync,
    closeComboDeal: closeCombo.mutateAsync,
    closeMultiPairDeal: closeMultiPair.mutateAsync,
    isLoading:
      closeDCA.isPending || closeCombo.isPending || closeMultiPair.isPending,
    error: closeDCA.error || closeCombo.error || closeMultiPair.error,
  };
}
