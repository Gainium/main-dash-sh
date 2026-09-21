/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  NotificationContainer,
  type NotificationContainerRef,
} from '@/components/ui/notifications';
import { logger } from '@/lib/loggerInstance';
import {
  botWebSocketManager,
  type WebSocketEvent,
  type ChatMessage as WSChatMessage,
} from '@/services/websocket/BotWebSocketManager';
import { useAuthStore } from '@/stores/authStore';
import {
  useChatStore,
  type ChatMessage,
  type MaxGainAiMessage,
} from '@/stores/chatStore';
import { useNotificationsSettingsStore } from '@/stores/notificationsSettingsStore';
import { useUIStore } from '@/stores/uiStore';
import { extractPairAssets } from '@/utils/pairs';
import React, { useEffect, useRef } from 'react';
import { isHelpModeAllowedToolStatus } from '../chat/helpModeGuards';

const CHAT_SOCKET_PREFIX = '[Socket.ChatModeGuard]';

const Socket: React.FC = () => {
  const processedEventsRef = useRef<Set<string>>(new Set());
  const notificationRef = useRef<NotificationContainerRef>(null);
  const { isAuthenticated } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const { addMessage, upsertMessage, updateMessage, setError, chatMode } =
    useChatStore();

  // Get notification settings to check if in-app notifications are enabled
  const getNotificationSetting = useNotificationsSettingsStore(
    (state) => state.getNotificationSetting
  );

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Subscribe to bot deal update events for notifications
    botWebSocketManager.subscribe('bot deal update', {
      id: 'socket-deal-notifications',
      callback: (event: WebSocketEvent) => {
        const msg = {
          botId: event.botId || '',
          data: event.data as any,
          parentBotId: event.parentBotId,
        };
        // paperContext: true means paper trading, isLiveTrading: true means live trading
        // Only process events that match the current trading mode
        if (
          msg.data.paperContext !== undefined &&
          msg.data.paperContext === isLiveTrading
        ) {
          // Skip events that don't match our trading mode
          return;
        }

        const dealId = msg.data._id || msg.data.id;
        const status = msg.data.status;

        // Create unique event key for deduplication
        const eventKey = `deal-${dealId}-${status}`;

        // Skip if we've already processed this event
        if (processedEventsRef.current.has(eventKey)) {
          return;
        }

        // Mark as processed
        processedEventsRef.current.add(eventKey);

        // Clean up old entries (keep only last 100)
        if (processedEventsRef.current.size > 100) {
          const entries = Array.from(processedEventsRef.current);
          processedEventsRef.current = new Set(entries.slice(-100));
        }

        // Check if the deal is started (only open or started, NOT closed)
        if (status === 'open' || status === 'started') {
          // Backend emits a `bot deal update` with status still 'open' as soon as
          // the close flow starts (saveDeal in closeDealById sets `closeTrigger`
          // before the close order fills). Treat closeTrigger / closeTime as a
          // definitive "this is not a new deal" signal.
          if (msg.data.closeTrigger || msg.data.closeTime) {
            logger.info(
              '[OrderSocket] Skipping deal started notification - deal is closing',
              {
                dealId,
                closeTrigger: msg.data.closeTrigger,
                closeTime: msg.data.closeTime,
              }
            );
            return;
          }

          // Only show notification for newly created deals, not updates to existing deals.
          // `updateTime` is only bumped on specific events (base fill, SO fill, close),
          // so for a deal with no DCA averaging it can stay close to `createTime` for
          // days. Use wall-clock age vs createTime instead.
          const createTime = msg.data.createTime || 0;
          const ageMs = createTime ? Date.now() - createTime : 0;
          const fundsCount = msg.data.funds?.length || 0;

          // If the deal was created more than 5 seconds ago, it's an update, not a new deal
          if (ageMs > 5000 || fundsCount > 1) {
            logger.info(
              '[OrderSocket] Skipping deal started notification - existing deal update',
              {
                dealId,
                createTime,
                ageMs,
                fundsCount,
              }
            );
            return;
          }

          logger.info('[OrderSocket] Deal started', msg);

          // Check if in-app notifications are enabled for deal started
          if (!getNotificationSetting('dealStarted', 'inApp')) {
            logger.info(
              '[OrderSocket] Skipping deal started notification - disabled in settings'
            );
            return;
          }

          // Extract symbol data
          const symbolData = msg.data.symbol || {};
          const pair =
            typeof symbolData === 'string'
              ? symbolData
              : symbolData.symbol || msg.data.pair || '';
          const baseAsset =
            typeof symbolData === 'object'
              ? symbolData.baseAsset
              : msg.data.baseAsset || '';
          const quoteAsset =
            typeof symbolData === 'object'
              ? symbolData.quoteAsset
              : msg.data.quoteAsset || '';

          // Show notification
          notificationRef.current?.showDealOpened({
            botName: msg.data.botName || 'Unknown Bot',
            pair,
            baseAsset,
            quoteAsset,
            exchangeUUID: msg.data.exchangeUUID || msg.data.exchange || '',
            isPaperTrading: msg.data.paperContext === true,
            timestamp: new Date(),
          });
        }
        // Check if the deal is closed
        else if (status === 'closed') {
          logger.info('[OrderSocket] Deal closed', msg);

          // Check if in-app notifications are enabled for deal closed
          if (!getNotificationSetting('dealClosedWithPnL', 'inApp')) {
            logger.info(
              '[OrderSocket] Skipping deal closed notification - disabled in settings'
            );
            return;
          }

          // Extract symbol data
          const symbolData = msg.data.symbol || {};
          const pair =
            typeof symbolData === 'string'
              ? symbolData
              : symbolData.symbol || msg.data.pair || '';
          const baseAsset =
            typeof symbolData === 'object'
              ? symbolData.baseAsset
              : msg.data.baseAsset || '';
          const quoteAsset =
            typeof symbolData === 'object'
              ? symbolData.quoteAsset
              : msg.data.quoteAsset || '';

          // Extract profit data
          const profitData = msg.data.profit || {};
          const profit =
            typeof profitData === 'object' ? profitData.totalUsd : profitData;

          // Show notification
          notificationRef.current?.showDealClosed({
            botName: msg.data.botName || 'Unknown Bot',
            pair,
            baseAsset,
            quoteAsset,
            exchangeUUID: msg.data.exchangeUUID || msg.data.exchange || '',
            isPaperTrading: msg.data.paperContext === true,
            profit,
            profitPercentage: msg.data.profitPercentage || msg.data.profitPerc,
            timestamp: new Date(),
          });
        }
      },
    });

    // Subscribe to data update events for order notifications
    botWebSocketManager.subscribe('data update', {
      id: 'socket-order-notifications',
      callback: (event: WebSocketEvent) => {
        const msg = {
          botId: event.botId || '',
          data: event.data as any,
          paperContext: event.paperContext || false,
        };
        // paperContext: true means paper trading, isLiveTrading: true means live trading
        // Only process events that match the current trading mode
        if (msg.paperContext === isLiveTrading) {
          // Skip events that don't match our trading mode
          return;
        }

        const orderId = msg.data._id || msg.data.orderId;
        const status = msg.data.status;

        // Check if the order is filled
        if (status === 'FILLED') {
          // Skip if this is a deal start, deal closed, or deal TP/SL event
          // These are deal-level events that trigger their own notifications
          const typeOrder = msg.data.typeOrder;
          if (
            typeOrder === 'dealStart' ||
            typeOrder === 'dealClosed' ||
            typeOrder === 'dealTP' ||
            typeOrder === 'dealSL'
          ) {
            logger.info(
              '[OrderSocket] Skipping order filled notification - deal-level event',
              {
                orderId,
                typeOrder,
              }
            );
            return;
          }

          // Create unique event key for deduplication
          const eventKey = `order-${orderId}-FILLED`;

          // Skip if we've already processed this event
          if (processedEventsRef.current.has(eventKey)) {
            logger.info('[OrderSocket] Skipping duplicate order filled event', {
              orderId,
              eventKey,
            });
            return;
          }

          // Mark as processed
          processedEventsRef.current.add(eventKey);

          // Clean up old entries (keep only last 100)
          if (processedEventsRef.current.size > 100) {
            const entries = Array.from(processedEventsRef.current);
            processedEventsRef.current = new Set(entries.slice(-100));
          }

          logger.info('[OrderSocket] Order filled', {
            msg,
          });

          // Determine notification type based on order side
          const orderSide = msg.data.side || 'BUY';
          const notificationType =
            orderSide === 'BUY' ? 'buyOrderFilled' : 'sellOrderFilled';

          // Check if in-app notifications are enabled for this order type
          if (!getNotificationSetting(notificationType, 'inApp')) {
            logger.info(
              '[OrderSocket] Skipping order filled notification - disabled in settings',
              {
                side: orderSide,
                notificationType,
              }
            );
            return;
          }

          // Extract symbol data (can be string like "TRXUSDT" or object)
          const symbolValue = msg.data.symbol || '';
          const pair =
            typeof symbolValue === 'string' ? symbolValue : msg.data.pair || '';

          // Try to extract base and quote from symbol string
          let baseAsset = '';
          let quoteAsset = '';
          if (typeof symbolValue === 'string') {
            const extracted = extractPairAssets(symbolValue);
            baseAsset = extracted.baseAsset;
            quoteAsset = extracted.quoteAsset;
          }

          // Show notification immediately
          const price = msg.data.price ? parseFloat(msg.data.price) : 0;
          const executedQty = msg.data.executedQty
            ? parseFloat(msg.data.executedQty)
            : 0;
          const total = price * executedQty;

          logger.info('[OrderSocket] Showing order filled notification', {
            pair,
            baseAsset: msg.data.baseAsset || baseAsset,
            quoteAsset: msg.data.quoteAsset || quoteAsset,
            price,
            executedQty,
            total,
            notificationRefExists: !!notificationRef.current,
          });

          notificationRef.current?.showOrderFilled({
            pair,
            baseAsset: msg.data.baseAsset || baseAsset,
            quoteAsset: msg.data.quoteAsset || quoteAsset,
            exchangeUUID: msg.data.exchangeUUID || msg.data.exchange || '',
            isPaperTrading: msg.paperContext === true,
            side: msg.data.side || 'BUY',
            price,
            executedQty,
            total,
            amount: msg.data.amount,
            timestamp: new Date(),
          });
        }
      },
    });

    // Subscribe to chat events
    botWebSocketManager.subscribe('chat msg out', {
      id: 'socket-chat-messages',
      callback: (event: WebSocketEvent) => {
        const messages =
          ((event.data as any).messages as WSChatMessage[]) || [];
        logger.info('[Socket] Received chat messages', {
          messageCount: messages.length,
        });
        messages.forEach((msg) => {
          if (
            chatMode === 'help' &&
            msg.isToolStatus &&
            !isHelpModeAllowedToolStatus(
              msg.toolName,
              msg.toolDescription,
              msg.message
            )
          ) {
            logger.warn(
              `${CHAT_SOCKET_PREFIX} Ignoring tool status in help mode`,
              {
                toolName: msg.toolName,
                toolStatus: msg.toolStatus,
                messageId: msg._id,
              }
            );
            return;
          }

          // Tool-status messages share an `_id` across their lifecycle
          // (running → completed/error), so they upsert in place. Regular
          // chat messages always have unique ids and use plain addMessage.
          const insert = msg.isToolStatus ? upsertMessage : addMessage;
          insert({
            message: msg.message,
            time: msg.time,
            id: msg._id,
            type: 'in',
            ...(msg.isToolStatus !== undefined && {
              isToolStatus: msg.isToolStatus,
            }),
            ...(msg.toolId !== undefined && { toolId: msg.toolId }),
            ...(msg.toolName !== undefined && { toolName: msg.toolName }),
            ...(msg.toolDescription !== undefined && {
              toolDescription: msg.toolDescription,
            }),
            ...(msg.toolStatus !== undefined && {
              toolStatus: msg.toolStatus as any,
            }),
            ...(msg.toolResult !== undefined && { toolResult: msg.toolResult }),
            ...(msg.toolArgs !== undefined && {
              toolArgs:
                typeof msg.toolArgs === 'string'
                  ? msg.toolArgs
                  : JSON.stringify(msg.toolArgs),
            }),
            ...(msg.permissionId !== undefined && {
              permissionId: msg.permissionId,
            }),
            ...(msg.permissionMessage !== undefined && {
              permissionMessage: msg.permissionMessage,
            }),
            ...(msg.permissionExpiresAt !== undefined && {
              permissionExpiresAt: msg.permissionExpiresAt,
            }),
            ...(msg.toolParameters !== undefined && {
              toolParameters: msg.toolParameters,
            }),
          });
        });
      },
    });

    botWebSocketManager.subscribe('chat error', {
      id: 'socket-chat-error',
      callback: (event: WebSocketEvent) => {
        const msg = event.data as { reason: string };
        logger.error('[Socket] Chat error', { reason: msg.reason });
        setError(msg.reason);
      },
    });

    // Subscribe to chat message updates
    botWebSocketManager.subscribe('chat message update', {
      id: 'socket-chat-update',
      callback: (event: WebSocketEvent) => {
        const data = event.data as {
          messageId: string;
          updates: Partial<MaxGainAiMessage>;
        };
        logger.info('[Socket] Received chat message update', {
          messageId: data.messageId,
        });
        const updates: Partial<ChatMessage> = {};

        if (data.updates.message !== undefined)
          updates.message = data.updates.message;
        if (data.updates.toolStatus !== undefined)
          updates.toolStatus = data.updates.toolStatus;
        if (data.updates.toolResult !== undefined)
          updates.toolResult = data.updates.toolResult;

        // Handle permission field removal - check if these fields are present in the updates object
        if ('permissionId' in data.updates) {
          updates.permissionId = data.updates.permissionId; // Will be undefined, removing the field
        }
        if ('permissionMessage' in data.updates) {
          updates.permissionMessage = data.updates.permissionMessage; // Will be undefined, removing the field
        }
        if ('toolParameters' in data.updates) {
          updates.toolParameters = data.updates.toolParameters; // Will be undefined, removing the field
        }

        logger.debug('[Socket] Applying chat message updates', {
          messageId: data.messageId,
          updates,
        });
        updateMessage(data.messageId, updates);
      },
    });

    // Subscribe to credit updates from AI charging
    botWebSocketManager.subscribe('credit-update', {
      id: 'socket-credit-update',
      callback: (event: WebSocketEvent) => {
        const data = event.data as { cost: number; balance: number };
        logger.info('[Socket] Credit update', data);
        useChatStore.getState().setAiCreditsBalance(data.balance);
      },
    });

    // Cleanup function - unsubscribe from events
    return () => {
      botWebSocketManager.unsubscribe(
        'bot deal update',
        'socket-deal-notifications'
      );
      botWebSocketManager.unsubscribe(
        'data update',
        'socket-order-notifications'
      );
      botWebSocketManager.unsubscribe('chat msg out', 'socket-chat-messages');
      botWebSocketManager.unsubscribe('chat error', 'socket-chat-error');
      botWebSocketManager.unsubscribe(
        'chat message update',
        'socket-chat-update'
      );
      botWebSocketManager.unsubscribe('credit-update', 'socket-credit-update');
    };
  }, [
    isAuthenticated,
    addMessage,
    upsertMessage,
    updateMessage,
    setError,
    chatMode,
    isLiveTrading,
    getNotificationSetting,
  ]);

  // Dev mode: Listen for custom window events to trigger notifications
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const handleOrderFilled = (event: Event) => {
      const customEvent = event as CustomEvent;
      logger.info('[Socket] Dev trigger: Order filled', customEvent.detail);
      notificationRef.current?.showOrderFilled(customEvent.detail);
    };

    const handleDealOpened = (event: Event) => {
      const customEvent = event as CustomEvent;
      logger.info('[Socket] Dev trigger: Deal opened', customEvent.detail);
      notificationRef.current?.showDealOpened(customEvent.detail);
    };

    const handleDealClosed = (event: Event) => {
      const customEvent = event as CustomEvent;
      logger.info('[Socket] Dev trigger: Deal closed', customEvent.detail);
      notificationRef.current?.showDealClosed(customEvent.detail);
    };

    window.addEventListener('dev:trigger-order-filled', handleOrderFilled);
    window.addEventListener('dev:trigger-deal-opened', handleDealOpened);
    window.addEventListener('dev:trigger-deal-closed', handleDealClosed);

    return () => {
      window.removeEventListener('dev:trigger-order-filled', handleOrderFilled);
      window.removeEventListener('dev:trigger-deal-opened', handleDealOpened);
      window.removeEventListener('dev:trigger-deal-closed', handleDealClosed);
    };
  }, []);

  return <NotificationContainer ref={notificationRef} />;
};

export default Socket;
