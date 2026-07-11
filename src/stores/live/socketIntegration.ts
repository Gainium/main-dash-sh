/**
 * Central WebSocket Integration Layer
 *
 * Connects BotWebSocketManager events to Zustand stores
 * Replaces the old Redux-based socket.tsx component with store-based subscriptions
 *
 * Key improvements over old implementation:
 * - NO URL-based filtering (stores hold all data globally)
 * - Timestamp-based conflict resolution
 * - Automatic subscription management
 * - Type-safe event routing
 */

import {
  botWebSocketManager,
  type WebSocketEvent,
} from '../../services/websocket/BotWebSocketManager';

// Import all stores
import { useDcaBotsStore } from './dcaBotsStore';
import { useGridBotsStore } from './gridBotsStore';
import { useComboBotsStore } from './comboBotsStore';
import { useHedgeDcaBotsStore } from './hedgeDcaBotsStore';
import { useHedgeComboBotsStore } from './hedgeComboBotsStore';
import { useDealStore } from './dealStore';
import { useOrderStore } from './orderStore';
import { useTransactionsStore } from './transactionsStore';
import { useMinigridsStore, type ComboMinigrid } from './minigridsStore';
import logger from '@/lib/loggerInstance';
import type { Transaction } from '@/types';

/**
 * Initialize all WebSocket subscriptions for stores
 * Call this once when the app mounts (e.g., in _app.tsx or a root layout)
 */
export function initializeSocketIntegration() {
  // Subscribe to 'bot sends settings' - route by botType to appropriate store
  botWebSocketManager.subscribe('bot sends settings', {
    id: 'bot-settings-router',
    callback: (event: WebSocketEvent) => {
      const { botType, botId, data, parentBotId } = event;
      if (!botType || !botId || !data) {
        return;
      }

      // Hedge leg update: the worker emits 'bot sends settings' for each
      // leg with `parentBotId` set to the hedge wrapper id and `botType`
      // = 'dca' / 'combo' (the leg's own type). The wrapper isn't itself
      // a dca/combo bot, so we patch the matching `bots[]` entry on the
      // hedge bot instead of writing to dca/comboBotsStore. Without this
      // each leg's status / workingShift updates land in the wrong store
      // and the hedge edit page never sees them.
      if (parentBotId && (botType === 'dca' || botType === 'combo')) {
        const hedgeStore =
          botType === 'combo'
            ? useHedgeComboBotsStore.getState()
            : useHedgeDcaBotsStore.getState();
        const parent = hedgeStore.bots[parentBotId];
        if (parent) {
          const nextBots = parent.bots.map((leg) =>
            leg._id === botId
              ? ({ ...leg, ...data } as (typeof parent.bots)[number])
              : leg
          );
          hedgeStore.updateBot({ ...parent, bots: nextBots });
        }
        return;
      }

      // Route to appropriate store based on botType
      switch (botType) {
        case 'dca':
          useDcaBotsStore.getState().updateBotFromWebSocket({
            botId,
            data,
            paperContext: event.paperContext,
          });
          break;

        case 'grid':
          useGridBotsStore.getState().updateBotFromWebSocket({
            botId,
            data,
            paperContext: event.paperContext,
          });
          break;

        case 'combo':
          useComboBotsStore.getState().updateBotFromWebSocket({
            botId,
            data,
            paperContext: event.paperContext,
          });
          break;

        case 'hedgeDca':
          useHedgeDcaBotsStore.getState().updateBotFromWebSocket({
            botId,
            data,
            paperContext: event.paperContext,
          });
          break;

        case 'hedgeCombo':
          useHedgeComboBotsStore.getState().updateBotFromWebSocket({
            botId,
            data,
            paperContext: event.paperContext,
          });
          break;

        default:
          logger.warn('[SocketIntegration] Unknown botType:', botType);
      }
    },
  });

  // Subscribe to 'bot deal update' - DCA and Combo deals
  botWebSocketManager.subscribe('bot deal update', {
    id: 'deal-updates',
    callback: (event: WebSocketEvent) => {
      if (!event.botId) return;

      // Determine deal type from botType
      const dealType =
        event.botType === 'combo'
          ? 'combo'
          : event?.data?.['type'] === 'terminal'
            ? 'terminal'
            : 'dca';

      useDealStore.getState().updateDealFromWebSocket(
        {
          botId: dealType === 'terminal' ? 'terminal' : event.botId,
          data: event.data,
          paperContext: !!event.paperContext,
        },
        dealType
      );
    },
  });

  // Subscribe to 'data update' - Orders
  botWebSocketManager.subscribe('data update', {
    id: 'order-updates',
    callback: (event: WebSocketEvent) => {
      if (!event.botId) return;

      if (event.data['status'] !== 'FILLED' && event.data['status'] !== 'NEW') {
        useOrderStore
          .getState()
          .removeOrder(
            event.botId,
            event.data['clientOrderId'] as string,
            'new'
          );
        useOrderStore
          .getState()
          .removeOrder(
            event.botId,
            event.data['clientOrderId'] as string,
            'filled'
          );
        return;
      }

      useOrderStore.getState().updateOrderFromWebSocket(
        {
          botId: event.botId,
          data: event.data,
          paperContext: !!event.paperContext,
        },
        event.data['status'] === 'FILLED' ? 'filled' : 'new'
      );

      // A filled order must not linger in the 'new' bucket. The order store
      // keeps separate 'new'/'filled' buckets and getOrders() merges both, so
      // a stale 'new' copy keeps satisfying the chart's status:'NEW' filter and
      // its (mini)grid order line stays drawn after the order executed
      // (combo minigrid "sell line still on chart"). Mirror legacy main-dash,
      // which re-filters its order list to NEW/PARTIALLY_FILLED on every socket
      // update, by dropping the now-filled order from the 'new' bucket.
      if (event.data['status'] === 'FILLED') {
        useOrderStore
          .getState()
          .removeOrder(
            event.botId,
            event.data['clientOrderId'] as string,
            'new'
          );
      }
    },
  });

  // Subscribe to 'bot transaction update' - Transactions
  botWebSocketManager.subscribe('bot transaction update', {
    id: 'transaction-updates',
    callback: (event: WebSocketEvent) => {
      if (!event.botId) return;

      useTransactionsStore.getState().updateTransactionFromWebSocket({
        botId: event.botId,
        data: event.data as unknown as Transaction,
      });
    },
  });

  // Subscribe to 'bot minigrid update' - Combo minigrids
  botWebSocketManager.subscribe('bot minigrid update', {
    id: 'minigrid-updates',
    callback: (event: WebSocketEvent) => {
      if (!event.botId) return;

      useMinigridsStore.getState().updateMinigridFromWebSocket({
        botId: event.botId,
        data: event.data as unknown as ComboMinigrid,
      });
    },
  });

  logger.info('[SocketIntegration] ✅ All store subscriptions initialized');
}

/**
 * Clean up all WebSocket subscriptions
 * Call this when the app unmounts or user logs out
 */
export function cleanupSocketIntegration() {
  botWebSocketManager.unsubscribe('bot sends settings', 'bot-settings-router');
  botWebSocketManager.unsubscribe('bot deal update', 'deal-updates');
  botWebSocketManager.unsubscribe('data update', 'order-updates');
  botWebSocketManager.unsubscribe(
    'bot transaction update',
    'transaction-updates'
  );
  botWebSocketManager.unsubscribe('bot minigrid update', 'minigrid-updates');

  logger.info('[SocketIntegration] 🧹 All store subscriptions cleaned up');
}
