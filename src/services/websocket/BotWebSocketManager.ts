import type { BotSymbolsStats, BotTypesEnum } from '@/types';
import { io, Socket } from 'socket.io-client';
import { logger } from '../../lib/loggerInstance';
import { recordSocketBreadcrumb } from '../../lib/crashBreadcrumbs';

// Test environment variables at module load time
logger.info(
  '🔧 [BotWebSocketManager] Module loaded, WebSocket URL:',
  import.meta.env?.['VITE_WS_URL'] || 'wss://ws.gainium.io'
);

// Event types matching the old dashboard implementation
export type WebSocketEventType =
  | 'bot stats update'
  | 'data update'
  | 'bot transaction update'
  | 'bot deal update'
  | 'bot minigrid update'
  | 'bot process'
  | 'balance'
  | 'bot sends message'
  | 'bot sends settings'
  | 'chat msg out'
  | 'chat error'
  | 'chat message update'
  | 'credit-update'
  | 'connect'
  | 'disconnect';

export interface WebSocketSubscriber {
  id: string;
  callback: (event: WebSocketEvent) => void;
  filter?: (event: WebSocketEvent) => boolean;
}

export interface WebSocketEvent {
  type: WebSocketEventType;
  botId?: string;
  data: Record<string, unknown>;
  timestamp: number;
  paperContext?: boolean;
  parentBotId?: string;
  botType?: BotTypesEnum;
}

export interface BotSettingsUpdate {
  botId: string;
  data: Record<string, unknown>;
  botType: BotTypesEnum;
  paperContext: boolean;
  parentBotId?: string;
}

export interface OrderUpdate {
  botId: string;
  data: Record<string, unknown>;
  paperContext: boolean;
}

export interface TransactionUpdate {
  botId: string;
  data: Record<string, unknown>;
}

export interface DealUpdate {
  botId: string;
  data: Record<string, unknown>;
  paperContext: boolean;
  parentBotId?: string;
  botType?: BotTypesEnum;
}

export interface BalanceUpdate {
  data: Record<string, unknown>[];
}

export interface BotStatsUpdate {
  botId: string;
  data: Record<string, unknown>;
  /**
   * Per-pair stats. main-app emits `bot stats update` as
   * `{ botId, data: { stats, symbolStats } }` (dcaHelper), so the pairs ride
   * along with every tick; the Statistics tab's Pairs table is their consumer.
   */
  symbolStats?: BotSymbolsStats[];
}

export interface MinigridUpdate {
  botId: string;
  data: Record<string, unknown>;
}

export interface ProcessUpdate {
  botId: string;
  data: { step: number; total: number };
}

export interface ChatMessage {
  _id: string;
  message: string;
  time: number;
  isToolStatus?: boolean;
  toolId?: string;
  toolName?: string;
  toolDescription?: string;
  toolStatus?: string;
  toolResult?: string;
  toolArgs?: string;
  permissionId?: string;
  permissionMessage?: string;
  toolParameters?: Record<string, unknown>;
}

export interface ChatMessagesUpdate {
  data: ChatMessage[];
}

export interface ChatErrorUpdate {
  data: { reason: string };
}

export interface ChatMessageUpdateData {
  data: {
    messageId: string;
    updates: Partial<ChatMessage>;
  };
}

export interface ChatMessageInPayload {
  userId: string;
  userToken: string;
  message: string;
  currentUrl: string;
  spoilers: unknown[];
  model: string;
  /** 'agent' = full tool access + quota; 'help' = no tools, knowledge-base only, no quota */
  mode?: 'agent' | 'help';
}

/**
 * Centralized WebSocket manager for all bot-related live updates
 * Replaces the old Redux-based socket management with a more flexible event-driven system
 */
export class BotWebSocketManager {
  private socket: Socket | null = null;
  private subscribers = new Map<
    WebSocketEventType,
    Map<string, WebSocketSubscriber>
  >();
  private botSubscriptions = new Map<string, Set<string>>();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private userId?: string;
  private userToken?: string;
  private paperContext: boolean = false;
  private pendingAuthentication = false;

  constructor() {
    logger.info('🔧 [BotWebSocketManager] Initializing...');
    this.initializeSocket();
  }

  private initializeSocket() {
    if (typeof window === 'undefined') return;

    try {
      const wsUrl = import.meta.env?.['VITE_WS_URL'] || 'wss://ws.gainium.io';

      if (!wsUrl) {
        logger.error('🔧 [BotWebSocketManager] WebSocket URL not configured');
        return;
      }

      this.socket = io(wsUrl, {
        transports: ['websocket'],
      });

      this.setupEventListeners();
      logger.info('🔧 [BotWebSocketManager] Initialized successfully');
    } catch (error) {
      logger.error('🔧 [BotWebSocketManager] Initialization failed:', error);
    }
  }

  /**
   * Get current connection status
   */
  public getIsConnected(): boolean {
    return this.isConnected;
  }

  private setupEventListeners() {
    if (!this.socket) {
      logger.error(
        '[BotWebSocketManager] setupEventListeners called but socket is null'
      );
      return;
    }

    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Authenticate with server if credentials are available
      this.authenticateIfReady();
      this.setupBotEventListeners();

      this.emitToSubscribers({
        type: 'connect',
        data: { socketId: this.socket?.id },
        timestamp: Date.now(),
      });
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.emitToSubscribers({
        type: 'disconnect',
        data: {},
        timestamp: Date.now(),
      });
      this.handleReconnect();
    });

    this.socket.on('connect_error', (error) => {
      logger.error('[BotWebSocketManager] Connection error:', error);
      this.isConnected = false;
      this.handleReconnect();
    });
  }

  private setupBotEventListeners() {
    if (!this.socket) return;

    // Remove existing listeners first to prevent duplicates
    this.socket.off('bot sends settings');
    this.socket.off('bot stats update');
    this.socket.off('data update');
    this.socket.off('bot transaction update');
    this.socket.off('bot deal update');
    this.socket.off('bot minigrid update');
    this.socket.off('bot process');
    this.socket.off('balance');
    this.socket.off('bot sends message');
    this.socket.off('chat msg out');
    this.socket.off('chat error');
    this.socket.off('chat message update');
    this.socket.off('credit-update');
    this.socket.offAny();

    this.socket.on('bot sends settings', (data: BotSettingsUpdate) => {
      this.emitToSubscribers({
        type: 'bot sends settings',
        botId: data.botId,
        data: data.data,
        timestamp: Date.now(),
        paperContext: data.paperContext,
        botType: data.botType,
        ...(data.parentBotId && { parentBotId: data.parentBotId }),
      });
    });

    this.socket.on('bot stats update', (data: BotStatsUpdate) => {
      this.emitToSubscribers({
        type: 'bot stats update',
        botId: data.botId,
        data: data.data,
        timestamp: Date.now(),
      });
    });

    this.socket.on('data update', (data: OrderUpdate) => {
      this.emitToSubscribers({
        type: 'data update',
        botId: data.botId,
        data: data.data,
        timestamp: Date.now(),
        paperContext: data.paperContext,
      });
    });

    this.socket.on('bot transaction update', (data: TransactionUpdate) => {
      this.emitToSubscribers({
        type: 'bot transaction update',
        botId: data.botId,
        data: data.data,
        timestamp: Date.now(),
      });
    });

    this.socket.on('bot deal update', (data: DealUpdate) => {
      this.emitToSubscribers({
        type: 'bot deal update',
        botId: data.botId,
        data: data.data,
        timestamp: Date.now(),
        paperContext: data.paperContext,
        ...(data.parentBotId && { parentBotId: data.parentBotId }),
        botType: data.botType,
      });
    });

    this.socket.on('bot minigrid update', (data: MinigridUpdate) => {
      this.emitToSubscribers({
        type: 'bot minigrid update',
        botId: data.botId,
        data: data.data,
        timestamp: Date.now(),
      });
    });

    this.socket.on('bot process', (data: ProcessUpdate) => {
      this.emitToSubscribers({
        type: 'bot process',
        botId: data.botId,
        data: data.data,
        timestamp: Date.now(),
      });
    });

    this.socket.on('balance', (data: BalanceUpdate) => {
      this.emitToSubscribers({
        type: 'balance',
        data: { balances: data.data },
        timestamp: Date.now(),
      });
    });

    this.socket.on('bot sends message', (data: Record<string, unknown>) => {
      this.emitToSubscribers({
        type: 'bot sends message',
        botId: data['botId'] as string,
        data: data['data'] as Record<string, unknown>,
        timestamp: Date.now(),
        paperContext: data['paperContext'] as boolean,
        botType: data['botType'] as BotTypesEnum,
      });
    });

    // Chat events
    this.socket.on('chat msg out', (messages: ChatMessage[]) => {
      logger.info('[BotWebSocketManager] chat msg out event fired', {
        messageCount: messages.length,
      });
      this.emitToSubscribers({
        type: 'chat msg out',
        data: { messages },
        timestamp: Date.now(),
      });
    });

    this.socket.on('chat error', (msg: { reason: string }) => {
      this.emitToSubscribers({
        type: 'chat error',
        data: msg,
        timestamp: Date.now(),
      });
    });

    this.socket.on(
      'chat message update',
      (data: { messageId: string; updates: Partial<ChatMessage> }) => {
        logger.info('[BotWebSocketManager] chat message update event fired', {
          messageId: data.messageId,
        });
        this.emitToSubscribers({
          type: 'chat message update',
          data: data as Record<string, unknown>,
          timestamp: Date.now(),
        });
      }
    );

    this.socket.on(
      'credit-update',
      (data: { cost: number; balance: number }) => {
        logger.info('[BotWebSocketManager] credit-update event fired', data);
        this.emitToSubscribers({
          type: 'credit-update',
          data: data as Record<string, unknown>,
          timestamp: Date.now(),
        });
      }
    );
  }

  private emitToSubscribers(event: WebSocketEvent) {
    // Crash breadcrumb: record the inbound event NAME only (never the
    // payload) so a later crash report can show the last socket traffic.
    recordSocketBreadcrumb(event.type);

    // Filter out events that don't match the current paper context
    // Only apply filtering when event explicitly provides paperContext.
    if (
      typeof event.paperContext === 'boolean' &&
      event.paperContext !== this.paperContext
    ) {
      logger.debug(
        `[BotWebSocketManager] Filtering event ${event.type} - paperContext mismatch (event: ${event.paperContext}, current: ${this.paperContext})`
      );
      return;
    }

    const eventSubscribers = this.subscribers.get(event.type);
    if (!eventSubscribers) return;

    eventSubscribers.forEach((subscriber) => {
      try {
        if (!subscriber.filter || subscriber.filter(event)) {
          subscriber.callback(event);
        }
      } catch (error) {
        logger.error(
          `[BotWebSocketManager] Error in subscriber ${subscriber.id}:`,
          error
        );
      }
    });
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[BotWebSocketManager] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      if (this.socket && !this.isConnected) {
        logger.info(
          `[BotWebSocketManager] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`
        );
        this.socket.connect();
      }
    }, delay);
  }

  connect(userId?: string, userToken?: string) {
    if (!this.socket) {
      logger.error(
        '🔌 [BotWebSocketManager] Cannot connect - socket not initialized'
      );
      return;
    }

    // Store auth credentials for reconnects and user connect event
    if (userId && userToken) {
      this.setUserCredentials(userId, userToken);
    }

    if (this.isConnected) {
      logger.info('🔌 [BotWebSocketManager] Already connected');
      // If already connected but now have credentials, authenticate
      this.authenticateIfReady();
      return;
    }

    this.socket.connect();
  }

  /**
   * Update user credentials and re-authenticate if connected
   * This handles the case where credentials become available after connection
   */
  setUserCredentials(userId: string, userToken: string) {
    const credentialsChanged =
      this.userId !== userId || this.userToken !== userToken;

    this.userId = userId;
    this.userToken = userToken;

    if (this.socket) {
      this.socket.auth = { userId, userToken };
      this.socket.io.opts.query = { userId, userToken };
    }

    // If already connected and credentials changed, re-authenticate
    if (this.isConnected && credentialsChanged) {
      logger.info(
        '[BotWebSocketManager] Credentials updated, re-authenticating'
      );
      this.authenticateWithServer();
    }
  }

  /**
   * Authenticate with server if credentials are available
   */
  private authenticateIfReady() {
    if (this.userId && this.userToken && !this.pendingAuthentication) {
      this.authenticateWithServer();
    } else if (!this.userId || !this.userToken) {
      // Expected during the initial connect → credentials-arrive race.
      // setUserCredentials() will re-authenticate once credentials land.
      logger.debug(
        '[BotWebSocketManager] Deferring authentication until credentials arrive'
      );
    }
  }

  /**
   * Send authentication message to server
   */
  private authenticateWithServer() {
    if (!this.socket || !this.isConnected) {
      logger.error('[BotWebSocketManager] Cannot authenticate - not connected');
      return;
    }

    if (!this.userId || !this.userToken) {
      logger.error(
        '[BotWebSocketManager] Cannot authenticate - missing credentials'
      );
      return;
    }

    this.pendingAuthentication = true;

    logger.info('[BotWebSocketManager] Authenticating with server', {
      userId: this.userId.substring(0, 8) + '...',
    });

    this.socket.emit('user connect', {
      userId: this.userId,
      userToken: this.userToken,
    });

    // Reset pending flag after a short delay
    setTimeout(() => {
      this.pendingAuthentication = false;
    }, 1000);
  }

  /**
   * Set paper context mode - filters events to match user's trading mode
   * @param paperContext - true for paper trading, false for live trading
   */
  setPaperContext(paperContext: boolean) {
    logger.info('[BotWebSocketManager] Setting paper context:', paperContext);
    this.paperContext = paperContext;
  }

  emitMessageToServer(channel: string, payload: Record<string, unknown>) {
    if (!this.socket) {
      logger.error(
        `[BotWebSocketManager] Cannot emit message - socket not initialized (channel: ${channel})`
      );
      return;
    }

    if (!this.isConnected) {
      logger.warn(
        `[BotWebSocketManager] Cannot emit message - socket not connected (channel: ${channel})`
      );
      return;
    }

    this.socket.emit(channel, payload);
  }

  /**
   * Get current paper context mode
   */
  getPaperContext(): boolean {
    return this.paperContext;
  }

  sendChatMessage(payload: ChatMessageInPayload): boolean {
    if (!this.socket) {
      logger.error(
        '[BotWebSocketManager] Cannot send chat message - socket not initialized'
      );
      return false;
    }

    if (!this.isConnected) {
      logger.warn(
        '[BotWebSocketManager] Cannot send chat message - socket not connected'
      );
      return false;
    }

    this.socket.emit('chat msg in', payload);
    return true;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.isConnected = false;
    this.subscribers.clear();
  }

  subscribe(eventType: WebSocketEventType, subscriber: WebSocketSubscriber) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Map());
    }

    const eventSubscribers = this.subscribers.get(eventType);
    eventSubscribers?.set(subscriber.id, subscriber);
  }

  unsubscribe(eventType: WebSocketEventType, subscriberId: string) {
    const eventSubscribers = this.subscribers.get(eventType);
    if (eventSubscribers) {
      eventSubscribers.forEach((sub) => {
        if (sub.id === subscriberId) {
          eventSubscribers.delete(sub.id);
        }
      });

      if (eventSubscribers.size === 0) {
        this.subscribers.delete(eventType);
      }
    }

    logger.debug(
      `[BotWebSocketManager] Unsubscribed from ${eventType}: ${subscriberId}`
    );
  }

  // Convenience methods for common subscriptions
  subscribeToStatsUpdates(subscriber: WebSocketSubscriber) {
    this.subscribe('bot stats update', subscriber);
  }

  subscribeToOrderUpdates(botId: string, subscriber: WebSocketSubscriber) {
    const filteredSubscriber = {
      ...subscriber,
      filter: (event: WebSocketEvent) => event.botId === botId,
    };

    this.subscribe('data update', filteredSubscriber);
  }

  subscribeToBalanceUpdates(subscriber: WebSocketSubscriber) {
    this.subscribe('balance', subscriber);
  }

  // High-level convenience methods
  subscribeToBot(botId: string) {
    // Subscribe to all bot-related events for this bot
    const subscriberId = `bot_${botId}_${Date.now()}`;

    this.subscribeToStatsUpdates({
      id: `${subscriberId}_stats`,
      callback: () => {
        // Handle stats updates - this will be processed by the stores
      },
      filter: (event) => !event.botId || event.botId === botId,
    });

    this.subscribeToOrderUpdates(botId, {
      id: `${subscriberId}_orders`,
      callback: () => {
        // Handle order updates - this will be processed by the stores
      },
    });

    // Store the subscriber ID for unsubscribing
    if (!this.botSubscriptions.has(botId)) {
      this.botSubscriptions.set(botId, new Set());
    }
    this.botSubscriptions.get(botId)?.add(subscriberId);
  }

  unsubscribeFromBot(botId: string) {
    const subscriberIds = this.botSubscriptions.get(botId);
    if (!subscriberIds) return;

    subscriberIds.forEach((subscriberId) => {
      // Unsubscribe from all event types for this subscriber
      this.subscribers.forEach((eventSubscribers, _eventType) => {
        eventSubscribers.forEach((sub) => {
          if (sub.id.startsWith(subscriberId)) {
            eventSubscribers.delete(sub.id);
          }
        });
      });
    });

    this.botSubscriptions.delete(botId);
  }
}

// Singleton instance
export const botWebSocketManager = new BotWebSocketManager();
