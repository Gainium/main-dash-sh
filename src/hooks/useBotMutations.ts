import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import {
  botFragment,
  comboBotFragment,
  dcaBotFragment,
} from '@/lib/api/GraphQLQueries-fragments';
import type { ChangeStatusInput } from '@/lib/api/GraphQLQueries-other-queries';
import { toast } from '@/lib/toast';
import type {
  CreateDCABotPayload,
  CreateGridBotPayload,
  UpdateDCABotPayload,
} from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  useComboBotsStore,
  useDcaBotsStore,
  useGridBotsStore,
} from '@/stores/live';
import { useHedgeDcaBotsStore } from '@/stores/live/hedgeDcaBotsStore';
import { useHedgeComboBotsStore } from '@/stores/live/hedgeComboBotsStore';
import { recordBotTombstone } from '@/stores/live/staleWriteGuard';
import {
  removeBotFromListCaches,
  patchBotInListCaches,
  invalidateListCaches,
  BOT_LIST_QUERY_KEYS_BY_TYPE,
} from '@/lib/queryCacheUtils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GraphQLClient, GraphQlQuery, type ReturnResult } from '../lib/api';
import { GraphQLHttpError } from '../lib/api/GraphQLClient';
import { logger } from '../lib/loggerInstance';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import {
  BotTypesEnum,
  BuyTypeEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  type Bot,
  type BotSettings,
  type BotStatus,
  type BotVars,
  type ComboBot,
  type ComboBotSettings,
  type DCABot,
  type DCABotSettings,
} from '../types';

export interface BotStatusUpdate {
  id: string;
  status: BotStatus;
  closeType?: CloseDCATypeEnum;
  buyType?: BuyTypeEnum;
  buyCount?: string;
  buyAmount?: number;
  cancelPartiallyFilled?: boolean;
  closeGridType?: CloseGRIDTypeEnum;
}

export interface BotArchiveParams {
  id: string;
  archive: boolean;
  type: BotTypesEnum;
}

export interface BotShareParams {
  id: string;
  share: boolean;
  type: BotTypesEnum;
}

export interface BotCloneParams {
  id: string;
  name?: string;
  botData?: DCABot | ComboBot | Bot | undefined; // Optional bot data to avoid query cache dependency
  type: BotTypesEnum;
}

export interface BotRestartParams {
  id: string;
  type: BotTypesEnum;
}

export interface BotUpdateParams {
  id: string;
  settings: UpdateDCABotPayload;
  vars?: BotVars | null;
}

interface DcaBotsQueryData {
  data: {
    result: DCABot[];
  };
}

interface MutationContext {
  previousBots?: DcaBotsQueryData;
  previousBot?: DCABot;
  previousStatus?: string;
  botsListCacheKey?: unknown[];
  botCacheKey?: unknown[];
}

const serializeMutationError = (error: unknown) => {
  if (error instanceof GraphQLHttpError) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: error };
};

// The five persisted bot stores are keyed by the same string values the
// BotTypesEnum members carry; `terminal` has no list-cache concept, so it
// resolves to an empty key set (the helpers no-op on an empty array).
const botListKeysFor = (type: BotTypesEnum): string[] =>
  type === BotTypesEnum.terminal
    ? []
    : BOT_LIST_QUERY_KEYS_BY_TYPE[
        type as keyof typeof BOT_LIST_QUERY_KEYS_BY_TYPE
      ];

// Pull a bot's `updated` (ISO string) from the matching live store and
// convert to epoch ms for the bot tombstone (0 when unknown / unparseable).
const botUpdatedMsFor = (type: BotTypesEnum, id: string): number => {
  const store =
    type === BotTypesEnum.dca
      ? useDcaBotsStore.getState()
      : type === BotTypesEnum.combo
        ? useComboBotsStore.getState()
        : type === BotTypesEnum.hedgeDca
          ? useHedgeDcaBotsStore.getState()
          : type === BotTypesEnum.hedgeCombo
            ? useHedgeComboBotsStore.getState()
            : useGridBotsStore.getState();
  const updated = store.bots[id]?.updated;
  if (!updated) return 0;
  const ms = new Date(updated).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

// Client-side timeout for bot lifecycle commands (start/stop/restart/delete).
// These are relayed to the per-type bot worker over a queue RPC that the
// backend caps at ~5 minutes; if the worker is down, restarting, or backed
// up, the request would otherwise leave the UI spinning for that whole
// window. 60s is well below the server cap so a stuck worker surfaces
// quickly, yet generous enough that a healthy-but-loaded worker still
// completes. On timeout the request rejects → the mutation's onError shows a
// toast and React Query flips isPending back, resetting the button.
const BOT_COMMAND_TIMEOUT_MS = 60_000;

/**
 * Hook for toggling bot status (start/pause/stop)
 * Implements optimistic updates with rollback on error
 */
export function useBotStatusToggle(type: BotTypesEnum) {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({
      id,
      status,
      closeType,
      buyType,
      buyAmount,
      buyCount,
      cancelPartiallyFilled,
      closeGridType,
    }: BotStatusUpdate) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      /* // Map frontend status to backend status
      const mapToBackendStatus = (frontendStatus: string): string => {
        switch (frontendStatus) {
          case 'active':
            return 'open'; // Backend uses 'open' for active bots
          case 'stopped':
          case 'paused': // Handle both 'stopped' and 'paused' - both map to 'closed'
            return 'closed'; // Backend uses 'closed' for stopped/paused bots
          default:
            return 'closed';
        }
      }; */

      // Use proper GraphQL client
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );
      // Grid bots decide the fate of orders/position via `closeGridType`, not
      // `closeType`. Injecting a default DCA `leave` here would ride along and
      // cause the backend to keep positions open, so only default for
      // DCA/combo stops.
      const resolvedCloseType =
        status === 'open'
          ? undefined
          : type === BotTypesEnum.grid
            ? closeType
            : (closeType ?? CloseDCATypeEnum.leave);
      const input: ChangeStatusInput = {
        id: `${id}`, // Use template literal like old dashboard
        status: status === 'open' ? 'open' : 'closed', // Toggle between open/closed
        ...(resolvedCloseType ? { closeType: resolvedCloseType } : {}),
        type, // Add type parameter - backend might require it even for DCA bots
        buyType: buyType || BuyTypeEnum.all,
        buyAmount,
        buyCount,
        cancelPartiallyFilled,
        closeGridType,
      };

      const { query: mutation, variables } = GraphQlQuery.changeStatus(input);

      // The 'status' parameter is the TARGET status from the UI
      // We need to determine what backend status to send based on the target
      // If target is 'stopped' or 'paused', send 'closed' to backend
      // If target is 'active', send 'open' to backend

      // Get bot data to check for active deals from the dcaBotList query
      try {
        const result = await client.request<{
          changeStatus: ReturnResult<{ _id: string; status: string }>;
        }>(mutation, variables, { timeoutMs: BOT_COMMAND_TIMEOUT_MS });
        if (result.changeStatus.status !== 'OK') {
          throw new Error(
            result.changeStatus.reason || 'Failed to change bot status'
          );
        }
        return result.changeStatus.data;
      } catch (error) {
        logger.error('[BotMutations] changeStatus error:', error);
        throw error;
      }
    },
    onMutate: async ({ id, status }) => {
      const key =
        type === BotTypesEnum.dca
          ? 'dcaBotList'
          : type === BotTypesEnum.combo
            ? 'comboBotList'
            : 'botList';
      // Cancel any outgoing refetches for bot data
      await queryClient.cancelQueries({ queryKey: [key] });
      logger.info(
        `[BotMutations] Starting status update for bot ${id} to ${status}`
      );

      // Optimistic update: immediately update bot status in Zustand store
      const targetStatus = status === 'open' ? 'open' : 'closed';
      let previousStatus: string | undefined;

      if (type === BotTypesEnum.dca) {
        const store = useDcaBotsStore.getState();
        const bot = store.bots[id];
        if (bot) {
          previousStatus = bot.status;
          store.updateBot({ ...bot, status: targetStatus as BotStatus });
        }
      } else if (type === BotTypesEnum.combo) {
        const store = useComboBotsStore.getState();
        const bot = store.bots[id];
        if (bot) {
          previousStatus = bot.status;
          store.updateBot({ ...bot, status: targetStatus as BotStatus });
        }
      } else {
        const store = useGridBotsStore.getState();
        const bot = store.bots[id];
        if (bot) {
          previousStatus = bot.status;
          store.updateBot({ ...bot, status: targetStatus as BotStatus });
        }
      }

      // Mirror the optimistic status into the persisted list cache so a
      // stale cached response can't replay the pre-toggle status on remount.
      patchBotInListCaches(
        id,
        { status: targetStatus },
        botListKeysFor(type)
      );

      return { previousStatus } as MutationContext;
    },
    onError: (err, { id }, context: MutationContext | undefined) => {
      logger.error('[BotMutations] Status update failed:', err);
      toast.error(`Failed to update bot status: ${err.message}`);

      // Rollback optimistic update
      if (context?.previousStatus) {
        const rollbackStatus = context.previousStatus as BotStatus;
        if (type === BotTypesEnum.dca) {
          const store = useDcaBotsStore.getState();
          const bot = store.bots[id];
          if (bot) store.updateBot({ ...bot, status: rollbackStatus });
        } else if (type === BotTypesEnum.combo) {
          const store = useComboBotsStore.getState();
          const bot = store.bots[id];
          if (bot) store.updateBot({ ...bot, status: rollbackStatus });
        } else {
          const store = useGridBotsStore.getState();
          const bot = store.bots[id];
          if (bot) store.updateBot({ ...bot, status: rollbackStatus });
        }
        // Re-patch the list cache back to the rolled-back status.
        patchBotInListCaches(
          id,
          { status: context.previousStatus },
          botListKeysFor(type)
        );
      }
    },
    onSuccess: () => {
      // Invalidate queries to ensure data consistency with backend
      const key =
        type === BotTypesEnum.dca
          ? 'dcaBotList'
          : type === BotTypesEnum.combo
            ? 'comboBotList'
            : 'botList';
      queryClient.invalidateQueries({ queryKey: [key] });
      // Also re-sync every list variant under this bot type (covers the
      // terminal list for dca, etc.); harmless overlap with the above.
      invalidateListCaches(botListKeysFor(type));
      logger.debug(
        '[BotMutations] Status update successful - invalidated queries'
      );
    },
  });
}

/**
 * Hook for restarting bots.
 */
export function useBotRestart() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({ id, type }: BotRestartParams) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const { query, variables } = botQueries.restartBot({ id: `${id}`, type });
      const result = await client.request<{
        restartBot: ReturnResult<{ _id?: string; status?: string }>;
      }>(query, variables, { timeoutMs: BOT_COMMAND_TIMEOUT_MS });

      if (result.restartBot.status !== 'OK') {
        throw new Error(result.restartBot.reason || 'Failed to restart bot');
      }

      return result.restartBot.data;
    },
    onMutate: async ({ id, type }) => {
      const key =
        type === BotTypesEnum.dca
          ? 'dcaBotList'
          : type === BotTypesEnum.combo
            ? 'comboBotList'
            : 'botList';

      await queryClient.cancelQueries({ queryKey: [key] });
      logger.info(`[BotMutations] Restarting bot ${id}`, { type });
      return {} as MutationContext;
    },
    onError: (err) => {
      logger.error('[BotMutations] Restart failed:', err);
      toast.error(`Failed to restart bot: ${err.message}`);
    },
    onSuccess: () => {
      logger.debug(
        '[BotMutations] Restart successful - WebSocket will update stores'
      );
    },
  });
}

/**
 * Hedge parent Start/Stop via cascading leg toggles
 * Falls back to toggling child legs (DCA or Combo) when no parent-level API exists.
 */
export interface HedgeStatusUpdateLeg {
  id: string;
  type: 'dca' | 'combo';
  strategy?: 'LONG' | 'Short' | string;
}

export interface HedgeStatusUpdateParams {
  parentId: string;
  hedgeType: 'hedgeDca' | 'hedgeCombo';
  targetStatus: 'active' | 'stopped';
  legs: HedgeStatusUpdateLeg[];
  closeType?: 'leave' | 'cancel' | 'closeByMarket' | 'closeByLimit';
}

export function useHedgeStatusToggle() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({
      targetStatus,
      legs,
      closeType,
    }: HedgeStatusUpdateParams) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const mutation = `mutation changeStatus($input: changeStatusInput!) {
        changeStatus(input: $input) {
          status
          reason
          data { _id status }
        }
      }`;

      const mapToBackendStatus = (frontendStatus: 'active' | 'stopped') =>
        frontendStatus === 'active' ? 'open' : 'closed';

      const backendStatus = mapToBackendStatus(targetStatus);
      const resolvedCloseType =
        targetStatus === 'active' ? undefined : (closeType ?? 'leave');

      // Execution order: start => arbitrary; stop => short first if known
      const legsOrdered = [...legs].sort((a, b) => {
        const aS = String(a.strategy || '').toLowerCase();
        const bS = String(b.strategy || '').toLowerCase();
        // Put SHORT first when stopping, otherwise keep order
        if (backendStatus === 'closed') {
          if (aS === 'short' && bS !== 'short') return -1;
          if (aS !== 'short' && bS === 'short') return 1;
        }
        return 0;
      });

      for (const leg of legsOrdered) {
        const variables = {
          input: {
            id: `${leg.id}`,
            status: backendStatus,
            ...(resolvedCloseType ? { closeType: resolvedCloseType } : {}),
            type: leg.type,
          },
        };

        const result = await client.request<{
          changeStatus: ReturnResult<{ _id: string; status: string }>;
        }>(mutation, variables);

        if (result.changeStatus.status !== 'OK') {
          throw new Error(
            result.changeStatus.reason || 'Failed to change leg status'
          );
        }
      }

      return true;
    },
    onSuccess: () => {
      // No need to invalidate - WebSocket provides live updates
      logger.debug(
        '[BotMutations] Hedge status update successful - WebSocket will update stores'
      );
    },
  });
}

/**
 * Hook for cloning a bot
 * Creates a new bot based on existing bot configuration
 */
export function useBotClone() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({ id, name, botData, type }: BotCloneParams) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }
      const key =
        type === BotTypesEnum.dca
          ? 'dcaBotList'
          : type === BotTypesEnum.combo
            ? 'comboBotList'
            : 'botList';

      // Use provided bot data or try to get from query cache
      let botDataToClone = botData;
      if (!botDataToClone) {
        const dcaBotsData = queryClient.getQueryData([key]) as DcaBotsQueryData;
        botDataToClone = dcaBotsData?.data?.result?.find(
          (bot: DCABot) => bot._id === id
        ) as DCABot;
      }

      if (!botDataToClone) {
        throw new Error('Bot data not found for cloning');
      }

      logger.info(
        `[BotMutations] Cloning bot ${id} as ${
          name || `${botDataToClone.settings.name} (Clone)`
        }`
      );

      // Use proper GraphQL client
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );
      let result;
      if (type === BotTypesEnum.dca) {
        const settings = botDataToClone.settings as DCABotSettings;
        const { query, variables } = botQueries.createDCABot({
          // Copy all settings from original bot first
          ...settings,

          // Override specific fields for cloning
          name: name || `${settings.name} (Clone)`,
          strategy: settings.strategy,
          profitCurrency: settings.profitCurrency || 'quote',
          baseOrderSize: settings.baseOrderSize || '10',
          startOrderType: settings.startOrderType || 'MARKET',
          startCondition: settings.startCondition || 'ASAP',
          orderFixedIn: settings.orderFixedIn || 'quote',
          orderSize: settings.orderSize || '10',
          volumeScale: settings.volumeScale || '1.0',
          stepScale: settings.stepScale || '1.0',
          useTp: settings.useTp ?? true,
          useSl: settings.useSl ?? true,
          useSmartOrders: settings.useSmartOrders ?? true,
          useDca: settings.useDca ?? true,
          ordersCount: +settings.ordersCount,
          activeOrdersCount: +settings.activeOrdersCount,

          // Additional required fields
          exchange: botDataToClone.exchange,
          exchangeUUID: botDataToClone.exchangeUUID,
          vars: botDataToClone.vars || { list: [], paths: [] },
          quoteAsset: (botDataToClone as DCABot).symbol.map(
            (s) => s.value.quoteAsset
          ),
          baseAsset: (botDataToClone as DCABot).symbol.map(
            (s) => s.value.baseAsset
          ),
        });
        try {
          result = await client.request<{
            createDCABot: ReturnResult<DCABot>;
          }>(query, variables);
        } catch (requestError) {
          logger.error(
            '[BotMutations] Clone mutation request failed:',
            requestError
          );
          throw requestError;
        }

        if (result.createDCABot.status !== 'OK') {
          logger.error(
            '[BotMutations] Clone mutation failed:',
            result.createDCABot
          );
          throw new Error(result.createDCABot.reason || 'Failed to clone bot');
        }

        const { query: q, variables: v } = botQueries.getDCABot({
          id: result.createDCABot.data._id,
        });
        const getBot = await client.request<{
          getDCABot: ReturnResult<DCABot>;
        }>(q, v);
        const data = getBot?.getDCABot?.data;
        if (!data) {
          logger.error('[BotMutations] Failed to fetch newly cloned bot data');
          throw new Error('Failed to fetch newly cloned bot data');
        }
        useDcaBotsStore.getState().addBot(data);
        return data;
      }
      if (type === BotTypesEnum.combo) {
        const settings = botDataToClone.settings as ComboBotSettings;
        const { query, variables } = botQueries.createComboBot({
          // Copy all settings from original bot first
          ...settings,

          // Override specific fields for cloning
          name: name || `${settings.name} (Clone)`,
          strategy: settings.strategy,
          profitCurrency: settings.profitCurrency || 'quote',
          baseOrderSize: settings.baseOrderSize || '10',
          startOrderType: settings.startOrderType || 'MARKET',
          startCondition: settings.startCondition || 'ASAP',
          orderFixedIn: settings.orderFixedIn || 'quote',
          orderSize: settings.orderSize || '10',
          volumeScale: settings.volumeScale || '1.0',
          stepScale: settings.stepScale || '1.0',
          useTp: settings.useTp ?? true,
          useSl: settings.useSl ?? true,
          useSmartOrders: settings.useSmartOrders ?? true,
          useDca: settings.useDca ?? true,
          ordersCount: +settings.ordersCount,
          activeOrdersCount: +settings.activeOrdersCount,

          // Additional required fields
          exchange: botDataToClone.exchange,
          exchangeUUID: botDataToClone.exchangeUUID,
          vars: botDataToClone.vars || { list: [], paths: [] },
          quoteAsset: (botDataToClone as ComboBot).symbol.map(
            (s) => s.value.quoteAsset
          ),
          baseAsset: (botDataToClone as ComboBot).symbol.map(
            (s) => s.value.baseAsset
          ),
        });
        try {
          result = await client.request<{
            createComboBot: ReturnResult<ComboBot>;
          }>(query, variables);
        } catch (requestError) {
          logger.error(
            '[BotMutations] Clone mutation request failed:',
            requestError
          );
          throw requestError;
        }

        if (result.createComboBot.status !== 'OK') {
          logger.error(
            '[BotMutations] Clone mutation failed:',
            result.createComboBot
          );
          throw new Error(
            result.createComboBot.reason || 'Failed to clone bot'
          );
        }
        const { query: q, variables: v } = botQueries.getComboBot({
          id: result.createComboBot.data._id,
        });
        const getBot = await client.request<{
          getComboBot: ReturnResult<ComboBot>;
        }>(q, v);
        const data = getBot?.getComboBot?.data;
        if (!data) {
          logger.error('[BotMutations] Failed to fetch newly cloned bot data');
          throw new Error('Failed to fetch newly cloned bot data');
        }
        useComboBotsStore.getState().addBot(data);
        return data;
      }
      if (type === BotTypesEnum.grid) {
        const settings = botDataToClone.settings as BotSettings;
        delete settings.updatedBudget;
        const { query, variables } = botQueries.createBot({
          // Copy all settings from original bot first
          ...settings,

          // Override specific fields for cloning
          name: name || `${settings.name} (Clone)`,

          // Additional required fields
          exchange: botDataToClone.exchange,
          exchangeUUID: botDataToClone.exchangeUUID,
          baseAsset: (botDataToClone as Bot).symbol.baseAsset,
          quoteAsset: (botDataToClone as Bot).symbol.quoteAsset,
        });
        try {
          result = await client.request<{
            createBot: ReturnResult<{ botId: string }>;
          }>(query, variables);
        } catch (requestError) {
          logger.error(
            '[BotMutations] Clone mutation request failed:',
            requestError
          );
          throw requestError;
        }

        if (result.createBot.status !== 'OK') {
          logger.error(
            '[BotMutations] Clone mutation failed:',
            result.createBot
          );
          throw new Error(result.createBot.reason || 'Failed to clone bot');
        }
        const { query: q, variables: v } = botQueries.getBot({
          id: result.createBot.data.botId,
        });
        const getBot = await client.request<{
          getBot: ReturnResult<Bot>;
        }>(q, v);
        const data = getBot?.getBot?.data;
        if (!data) {
          logger.error('[BotMutations] Failed to fetch newly cloned bot data');
          throw new Error('Failed to fetch newly cloned bot data');
        }
        useGridBotsStore.getState().addBot(data);
        return data;
      }
      throw new Error(`Unsupported bot type for cloning: ${type}`);
    },
    onSuccess: (data, { id }) => {
      logger.info(
        `[BotMutations] Successfully cloned bot ${id} -> ${data._id}`
      );

      // Show success toast
      toast.success(
        `Bot "${data.settings.name}" has been successfully cloned.`
      );

      // No need to invalidate - WebSocket will push the new bot to stores
    },
    onError: (err, { id }) => {
      logger.error(`[BotMutations] Failed to clone bot ${id}:`, err);
      toast.error(`Failed to clone bot: ${err.message}`);
    },
  });
}

/**
 * Hook for updating bot settings
 * Implements optimistic updates for immediate UI response
 */
export function useBotUpdate(type: BotTypesEnum) {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({ id, settings, vars }: BotUpdateParams) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }
      logger.info(
        `[BotMutations] Updating bot ${id} with ${
          Object.keys(settings).length
        } field${Object.keys(settings).length === 1 ? '' : 's'}`
      );

      // Use proper GraphQL client
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;

      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const mutation =
        type === BotTypesEnum.grid
          ? `mutation changeBot($input: changeBotInput!) {
                    changeBot(input: $input) {
                        status
                        reason
                        data {${botFragment}}
                    }
                }`
          : type === BotTypesEnum.combo
            ? `mutation changeComboBot($input: changeComboBotInput!) {
                    changeComboBot(input: $input) {
                        status
                        reason
                        data {${comboBotFragment}}
                    }
                }`
            : `mutation changeDCABot($input: changeDCABotInput!) {
                    changeDCABot(input: $input) {
                        status
                        reason
                        data {${dcaBotFragment}}
                    }
                }`;

      const variables: {
        input: {
          id: string;
          vars?: BotVars | null | undefined;
        } & UpdateDCABotPayload;
      } = {
        input: {
          id,
          vars,
          ...settings,
        },
      };
      if (type === BotTypesEnum.grid) {
        const result = await client.request<{
          changeBot: ReturnResult<Bot>;
        }>(mutation, variables);

        if (result.changeBot.status !== 'OK') {
          throw new Error(result.changeBot.reason || 'Failed to update bot');
        }

        return result.changeBot.data;
      }
      if (type === BotTypesEnum.dca) {
        const result = await client.request<{
          changeDCABot: ReturnResult<DCABot>;
        }>(mutation, variables);

        if (result.changeDCABot.status !== 'OK') {
          throw new Error(result.changeDCABot.reason || 'Failed to update bot');
        }

        return result.changeDCABot.data;
      }
      if (type === BotTypesEnum.combo) {
        const result = await client.request<{
          changeComboBot: ReturnResult<ComboBot>;
        }>(mutation, variables);

        if (result.changeComboBot.status !== 'OK') {
          throw new Error(
            result.changeComboBot.reason || 'Failed to update bot'
          );
        }

        return result.changeComboBot.data;
      }
      throw new Error(`Unsupported bot type for update: ${type}`);
    },
    onMutate: async ({ id, settings }) => {
      const key =
        type === BotTypesEnum.dca
          ? 'dcaBotList'
          : type === BotTypesEnum.combo
            ? 'comboBotList'
            : 'botList';
      const settingsKey =
        type === BotTypesEnum.dca
          ? `getDCABotSettings_${id}`
          : type === BotTypesEnum.combo
            ? `getComboBotSettings_${id}`
            : `getBotSettings_${id}`;
      const botKey =
        type === BotTypesEnum.dca
          ? `getDCABot_${id}`
          : type === BotTypesEnum.combo
            ? `getComboBot_${id}`
            : `getBot_${id}`;
      // Cancel any outgoing refetches
      // Use pattern matching to find the correct cache keys instead of hardcoded keys
      await queryClient.cancelQueries({
        predicate: (query) => {
          const queryKey = query.queryKey as unknown[];
          return (
            Array.isArray(queryKey) &&
            queryKey.length > 0 &&
            queryKey[0] === key
          );
        },
      });
      await queryClient.cancelQueries({
        predicate: (query) => {
          const queryKey = query.queryKey as unknown[];
          return (
            Array.isArray(queryKey) &&
            queryKey.length > 0 &&
            (queryKey[0] === settingsKey || queryKey[0] === botKey)
          );
        },
      });

      // Snapshot the previous values using pattern matching
      // Find the dcaBotList cache entry
      const botsListCache = queryClient.getQueriesData({
        predicate: (query) => {
          const queryKey = query.queryKey as unknown[];
          return (
            Array.isArray(queryKey) &&
            queryKey.length > 0 &&
            queryKey[0] === key
          );
        },
      });

      // Find the individual bot cache entries
      const botCaches = queryClient.getQueriesData({
        predicate: (query) => {
          const queryKey = query.queryKey as unknown[];
          return (
            Array.isArray(queryKey) &&
            queryKey.length > 0 &&
            (queryKey[0] === settingsKey || queryKey[0] === botKey)
          );
        },
      });

      const previousBots =
        botsListCache.length > 0 ? botsListCache[0][1] : undefined;
      const previousBot = botCaches.length > 0 ? botCaches[0][1] : undefined;

      // Update all dcaBotList cache entries
      queryClient.setQueriesData(
        {
          predicate: (query) => {
            const queryKey = query.queryKey as unknown[];
            return (
              Array.isArray(queryKey) &&
              queryKey.length > 0 &&
              queryKey[0] === key
            );
          },
        },
        (old: DcaBotsQueryData | undefined) => {
          if (!old?.data?.result) {
            return old;
          }

          const newData = {
            ...old,
            data: {
              ...old.data,
              result: old.data.result.map((bot: DCABot) =>
                bot._id === id
                  ? {
                      ...bot,
                      settings: {
                        ...bot.settings,
                        ...settings,
                      },
                    }
                  : bot
              ),
            },
          };
          return newData;
        }
      );

      // Update individual bot cache entries
      queryClient.setQueriesData(
        {
          predicate: (query) => {
            const queryKey = query.queryKey as unknown[];
            return (
              Array.isArray(queryKey) &&
              queryKey.length > 0 &&
              (queryKey[0] === settingsKey || queryKey[0] === botKey)
            );
          },
        },
        (old: unknown) => {
          if (!old) {
            return old;
          }

          // Handle different data structures with proper type checking
          let newData;
          const oldData = old as Record<string, unknown>;

          if (oldData['settings'] && typeof oldData['settings'] === 'object') {
            // This is botSettings data structure
            newData = {
              ...oldData,
              settings: {
                ...(oldData['settings'] as Record<string, unknown>),
                ...settings,
              },
            };
          } else if (oldData['data'] && typeof oldData['data'] === 'object') {
            const dataObj = oldData['data'] as Record<string, unknown>;
            if (
              dataObj['settings'] &&
              typeof dataObj['settings'] === 'object'
            ) {
              // This is a wrapped data structure
              newData = {
                ...oldData,
                data: {
                  ...dataObj,
                  settings: {
                    ...(dataObj['settings'] as Record<string, unknown>),
                    ...settings,
                  },
                },
              };
            } else {
              // Data object without settings
              newData = {
                ...oldData,
                data: {
                  ...dataObj,
                  ...settings,
                },
              };
            }
          } else {
            // Direct bot data structure
            newData = {
              ...oldData,
              ...settings,
            };
          }
          return newData;
        }
      );

      logger.info(`[BotMutations] Optimistically updated bot ${id} settings`);

      return {
        previousBots,
        previousBot,
        botsListCacheKey:
          botsListCache.length > 0 ? botsListCache[0][0] : undefined,
        botCacheKey: botCaches.length > 0 ? botCaches[0][0] : undefined,
      } as MutationContext;
    },
    onError: (err, { id }, context: MutationContext | undefined) => {
      logger.error(`[BotMutations] Update failed for bot ${id}:`, err);
      toast.error(`Failed to update bot: ${err.message}`);

      // Rollback optimistic updates using the stored cache keys
      if (context?.previousBots && context?.botsListCacheKey) {
        queryClient.setQueryData(
          context.botsListCacheKey,
          context.previousBots
        );
      }

      if (context?.previousBot && context?.botCacheKey) {
        queryClient.setQueryData(context.botCacheKey, context.previousBot);
      }
    },
    onSuccess: (data, { id }) => {
      logger.info(`[BotMutations] Successfully updated bot ${id}`);
      toast.success('Bot settings updated successfully');

      // No need to invalidate - WebSocket will push the updated bot to stores
    },
  });
}

/**
 * Hook for deleting a bot
 * Implements optimistic removal with rollback on error
 */
export function useBotDelete() {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({ id, type }: { id: string; type: BotTypesEnum }) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      logger.info(`[BotMutations] Deleting bot ${id}`);

      // Use proper GraphQL client
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const mutation = `mutation deleteBot($input: deleteBotInput!) {
        deleteBot(input: $input) {
          status
          reason
        }
      }`;

      const variables = {
        input: {
          id,
          type, // Required by schema
        },
      };

      const result = await client.request<{
        deleteBot: ReturnResult<{ id: string }>;
      }>(mutation, variables, { timeoutMs: BOT_COMMAND_TIMEOUT_MS });

      if (result.deleteBot.status !== 'OK') {
        throw new Error(result.deleteBot.reason || 'Failed to delete bot');
      }
      // Capture the bot's `updated` ms before the store drops it, so the
      // tombstone can reject an older cached list replay (and accept a
      // genuinely newer server update).
      const botUpdatedMs = botUpdatedMsFor(type, id);
      if (type === BotTypesEnum.dca) {
        useDcaBotsStore.getState().removeBot(id);
      } else if (type === BotTypesEnum.combo) {
        useComboBotsStore.getState().removeBot(id);
      } else if (type === BotTypesEnum.grid) {
        useGridBotsStore.getState().removeBot(id);
      } else if (type === BotTypesEnum.hedgeDca) {
        useHedgeDcaBotsStore.getState().removeBot(id);
      } else if (type === BotTypesEnum.hedgeCombo) {
        useHedgeComboBotsStore.getState().removeBot(id);
      }
      recordBotTombstone(id, botUpdatedMs);
      removeBotFromListCaches(id, botListKeysFor(type));
      invalidateListCaches(botListKeysFor(type));

      return { id };
    },
    onMutate: async ({ id, type }: { id: string; type: BotTypesEnum }) => {
      const key =
        type === BotTypesEnum.dca
          ? 'dcaBotList'
          : type === BotTypesEnum.combo
            ? 'comboBotList'
            : 'botList';
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: [key] });
      await queryClient.cancelQueries({ queryKey: ['bot', id] });

      // Snapshot the previous value
      const previousBots = queryClient.getQueryData([key]);

      // Optimistically remove the bot from the list
      queryClient.setQueryData([key], (old: DcaBotsQueryData | undefined) => {
        if (!old?.data?.result) return old;

        return {
          ...old,
          data: {
            ...old.data,
            result: old.data.result.filter((bot: DCABot) => bot._id !== id),
          },
        };
      });

      // Remove individual bot data
      queryClient.removeQueries({ queryKey: ['bot', id] });

      logger.info(`[BotMutations] Optimistically removed bot ${id}`);

      return { previousBots } as Pick<MutationContext, 'previousBots'>;
    },
    onError: (
      err,
      { type },
      context: Pick<MutationContext, 'previousBots'> | undefined
    ) => {
      const key =
        type === BotTypesEnum.dca
          ? 'dcaBotList'
          : type === BotTypesEnum.combo
            ? 'comboBotList'
            : 'botList';
      logger.error('[BotMutations] Delete failed, rolling back:', err);
      toast.error(`Failed to delete bot: ${err.message}`);

      // Rollback optimistic updates
      if (context?.previousBots) {
        queryClient.setQueryData([key], context.previousBots);
      }
      // The delete failed before any tombstone/removal ran (those only
      // fire after the GraphQL OK), so just re-sync the list caches.
      invalidateListCaches(botListKeysFor(type));
    },
    onSuccess: (data) => {
      logger.info(`[BotMutations] Successfully deleted bot ${data.id}`);

      // Show success toast
      toast.success('Bot has been successfully deleted.');

      // No need to invalidate - WebSocket will remove the bot from stores
    },
  });
}

export function useBotArchive() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({
      id,
      archive,
      type = BotTypesEnum.dca,
    }: BotArchiveParams) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const mutation = `mutation setArchive($input: setArchiveInput!) {
        setArchive(input: $input) {
          status
          reason
          data {
            _id
            status
          }
        }
      }`;

      const variables = {
        input: {
          botIds: [id],
          archive,
          type,
        },
      };

      const result = await client.request<{
        setArchive: ReturnResult<
          { _id: string; status: string } | { _id: string; status: string }[]
        >;
      }>(mutation, variables);

      if (result.setArchive.status !== 'OK') {
        throw new Error(
          result.setArchive.reason || 'Failed to update archive status'
        );
      }

      // Archiving removes the bot from the active lists (delete-equivalent),
      // so tombstone + evict from the list caches to block a stale replay.
      // Unarchiving brings it back, so it must NOT record a tombstone.
      if (archive) {
        const botUpdatedMs = botUpdatedMsFor(type, id);
        recordBotTombstone(id, botUpdatedMs);
        removeBotFromListCaches(id, botListKeysFor(type));
        invalidateListCaches(botListKeysFor(type));
      } else {
        invalidateListCaches(botListKeysFor(type));
      }

      return result.setArchive.data;
    },
    onSuccess: (_data, { archive }) => {
      toast.success(
        archive ? 'Bot archived successfully.' : 'Bot unarchived successfully.'
      );

      // No need to invalidate - WebSocket will update the bot in stores
    },
    onError: (error, { archive }) => {
      logger.error('[BotMutations] Archive toggle failed:', error);
      toast.error(
        `Failed to ${archive ? 'archive' : 'unarchive'} bot: ${error.message}`
      );
    },
  });
}

export function useBotShareToggle() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useMutation({
    mutationFn: async ({ id, share, type }: BotShareParams) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const mutation = `mutation changeBotShare($input: changeBotShareInput!) {
        changeBotShare(input: $input) {
          status
          reason
          data {
            share
            shareId
          }
        }
      }`;

      const variables = {
        input: {
          botId: id,
          type,
          share,
        },
      };

      const result = await client.request<{
        changeBotShare: ReturnResult<{
          share: boolean;
          shareId?: string | null;
        }>;
      }>(mutation, variables);

      if (result.changeBotShare.status !== 'OK') {
        throw new Error(
          result.changeBotShare.reason || 'Failed to update share settings'
        );
      }

      return result.changeBotShare.data;
    },
    onSuccess: (_data, { share }) => {
      toast.success(share ? 'Share link enabled.' : 'Share link disabled.');

      // No need to invalidate - WebSocket will update the bot in stores
    },
    onError: (error, { share }) => {
      logger.error('[BotMutations] Share toggle failed:', error);
      toast.error(
        `Failed to ${share ? 'enable' : 'disable'} share link: ${error.message}`
      );
    },
  });
}

/**
 * Hook for creating a new bot
 * Creates a bot with the provided configuration
 */
export function useBotCreate(type: BotTypesEnum) {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      botConfig: CreateDCABotPayload | CreateGridBotPayload
    ) => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      logger.info(`[BotMutations] Creating new ${type} bot`);

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;

      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const mutation =
        type === BotTypesEnum.grid
          ? `mutation createBot($input: createBotInput!) {
                        createBot(input: $input) {
                            status
                            reason
                            data {
                                botId
                            }
                        }
                    }`
          : type === BotTypesEnum.combo
            ? `mutation createComboBot($input: createComboBotInput!) {
            createComboBot(input: $input) {
                status
                reason
                data {
                    ${comboBotFragment}
                }
            }
        }`
            : `mutation createDCABot($input: createDCABotInput!) {
        createDCABot(input: $input) {
          status
          reason
          data {
            ${dcaBotFragment}
          }
        }
      }`;

      const variables = { input: botConfig };

      if (type === BotTypesEnum.dca) {
        const result = await client.request<{
          createDCABot: ReturnResult<DCABot>;
        }>(mutation, variables);

        if (result.createDCABot.status !== 'OK') {
          throw new Error(result.createDCABot.reason || 'Failed to create bot');
        }

        return result.createDCABot.data;
      }
      if (type === BotTypesEnum.grid) {
        const result = await client.request<{
          createBot: ReturnResult<Bot>;
        }>(mutation, variables);

        if (result.createBot.status !== 'OK') {
          throw new Error(result.createBot.reason || 'Failed to create bot');
        }

        return result.createBot.data;
      }
      if (type === BotTypesEnum.combo) {
        const result = await client.request<{
          createComboBot: ReturnResult<ComboBot>;
        }>(mutation, variables);

        if (result.createComboBot.status !== 'OK') {
          throw new Error(
            result.createComboBot.reason || 'Failed to create bot'
          );
        }

        return result.createComboBot.data;
      }
      throw new Error(`Unsupported bot type for creation: ${type}`);
    },
    onSuccess: (data) => {
      logger.info(`[BotMutations] Successfully created bot ${data._id}`);

      // Invalidate the bot lists so the edit page's `useBotFormDataQuery`
      // can resolve the new bot. WebSocket pushes the new bot too when
      // the live-update stream is running, but invalidating here makes
      // the form resilient when the stream isn't available.
      queryClient.invalidateQueries({ queryKey: ['dcaBotList'] });
      queryClient.invalidateQueries({ queryKey: ['gridBotList'] });
      queryClient.invalidateQueries({ queryKey: ['comboBotList'] });
    },
    onError: (err) => {
      logger.error('[BotMutations] Create failed', serializeMutationError(err));
    },
  });
}
