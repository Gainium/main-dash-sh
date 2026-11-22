import { useMemo } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
import type { ReturnResult } from '../lib/api/types';
import { logger } from '../lib/loggerInstance';
import { useGraphQL } from './useGraphQL';
import { useShareContext } from './useShareContext';
import {
  BotTypesEnum,
  type GridFilterModel,
  type GridSortModel,
} from '../types';

export interface BotEvent {
  botId: string;
  botType: BotTypesEnum;
  userId: string;
  event: string;
  description: string;
  type?: 'error' | 'warning' | 'info' | 'success';
  created: string; // ISO date string
  metadata?: Record<string, unknown> | null;
  deal?: string;
  symbol?: string;
  _id: string;
}

export interface BotEventCounts {
  recent: number;
  deals: number;
  alerts: number;
}

export interface BotEventsData {
  status: string;
  reason?: string;
  data: BotEvent[];
  total: number;
  counts?: BotEventCounts | null;
}

export type BotEventCategory = 'recent' | 'deals' | 'alerts';

export interface UseBotEventsOptions {
  page?: number;
  pageSize?: number;
  eventType?: string; // Filter by event type
  category?: BotEventCategory; // Server-side bucket (recent/deals/alerts)
  sortModel?: GridSortModel;
  filterModel?: GridFilterModel;
  /** Union of event types (e.g. orders + errors), AND-ed with filterModel. */
  types?: string[];
}

const EMPTY_COUNTS: BotEventCounts = { recent: 0, deals: 0, alerts: 0 };

export interface UseBotEventsResult {
  data: ReturnResult<BotEventsData> | null;
  events: BotEvent[];
  total: number;
  counts: BotEventCounts;
  hasValidResponse: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useBotEvents(
  botId: string,
  botType: BotTypesEnum = BotTypesEnum.dca,
  options: UseBotEventsOptions = {}
): UseBotEventsResult {
  const {
    page = 0,
    pageSize = 20,
    eventType,
    category,
    sortModel,
    filterModel,
    types,
  } = options;

  const derivedFilterModel: GridFilterModel | undefined = eventType
    ? {
        items: [
          {
            field: 'event',
            operator: 'contains',
            value: eventType,
            id: `filter-${Date.now()}`,
          },
        ],
      }
    : filterModel;

  const { shareId } = useShareContext();

  const input = {
    botId,
    page,
    pageSize,
    ...(sortModel ? { sortModel } : {}),
    ...(derivedFilterModel ? { filterModel: derivedFilterModel } : {}),
    ...(category ? { category } : {}),
    ...(types?.length ? { types } : {}),
    combo: botType === BotTypesEnum.combo,
    hedge:
      botType === BotTypesEnum.hedgeCombo || botType === BotTypesEnum.hedgeDca,
    ...(shareId ? { shareId } : {}),
  };

  const { query, variables } = botQueries.getBotEvents(input);

  const queryResult = useGraphQL<BotEventsData>(
    'getBotEvents',
    {
      query,
      variables,
    },
    {
      enabled: Boolean(botId),
      shareId,
      // Keep the prior page/category visible while a new fetch resolves so
      // switching tabs or loading more doesn't flash an empty timeline.
      placeholderData: keepPreviousData,
    }
  );

  const processedData = useMemo(() => {
    const { data, isLoading, isError } = queryResult;

    if (!botId) {
      return { events: [], total: 0, counts: EMPTY_COUNTS, hasValidResponse: false };
    }

    if (isLoading || isError || !data) {
      return { events: [], total: 0, counts: EMPTY_COUNTS, hasValidResponse: false };
    }

    const hasValidResponse = data.status === 'OK';

    if (!hasValidResponse) {
      logger.warn('[useBotEvents] Invalid response or no events data:', {
        botId,
        botType,
        status: data.status,
        reason: data.reason,
      });
      return { events: [], total: 0, counts: EMPTY_COUNTS, hasValidResponse: false };
    }

    const events = Array.isArray(data.data) ? data.data : [];
    const total = data.total || 0;
    const counts: BotEventCounts = data.counts
      ? {
          recent: data.counts.recent ?? 0,
          deals: data.counts.deals ?? 0,
          alerts: data.counts.alerts ?? 0,
        }
      : EMPTY_COUNTS;

    logger.info('[useBotEvents] Successfully fetched bot events:', {
      botId,
      botType,
      eventsCount: events.length,
      total,
      counts,
    });

    return { events, total, counts, hasValidResponse: true };
  }, [queryResult, botId, botType]);

  return {
    data: queryResult.data || null,
    events: processedData.events,
    total: processedData.total,
    counts: processedData.counts,
    hasValidResponse: processedData.hasValidResponse,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

// Helper functions for event classification
export const EVENT_CATEGORIES = {
  recent: ['order', 'settings', 'webhook', 'change', 'start', 'stop'],
  deals: [
    'deal_opened',
    'deal_closed',
    'safety_order',
    'take_profit',
    'deal',
    'profit',
  ],
  alerts: ['error', 'warning', 'api_error', 'insufficient_balance', 'failed'],
};

export const EVENT_SEVERITY = {
  error: { color: 'destructive', priority: 1 },
  warning: { color: 'warning', priority: 2 },
  info: { color: 'muted', priority: 3 },
  success: { color: 'success', priority: 4 },
};

export function categorizeEvent(
  event: BotEvent
): 'recent' | 'deals' | 'alerts' {
  const eventLower = (event.event || '').toLowerCase();
  const descriptionLower = (event.description || '').toLowerCase();

  // Check for alerts first (highest priority)
  if (
    event.type === 'error' ||
    event.type === 'warning' ||
    EVENT_CATEGORIES.alerts.some(
      (keyword) =>
        eventLower.includes(keyword) || descriptionLower.includes(keyword)
    )
  ) {
    return 'alerts';
  }

  // Check for deal events
  if (
    EVENT_CATEGORIES.deals.some(
      (keyword) =>
        eventLower.includes(keyword) || descriptionLower.includes(keyword)
    )
  ) {
    return 'deals';
  }

  // Default to recent
  return 'recent';
}

export function getEventSeverity(event: BotEvent): keyof typeof EVENT_SEVERITY {
  if (event.type && event.type in EVENT_SEVERITY) {
    return event.type as keyof typeof EVENT_SEVERITY;
  }

  // Fallback based on event content
  const eventLower = (event.event ?? '').toString().toLowerCase();
  const descriptionLower = (event.description ?? '').toString().toLowerCase();

  if (eventLower.includes('error') || descriptionLower.includes('error')) {
    return 'error';
  }
  if (eventLower.includes('warning') || descriptionLower.includes('warning')) {
    return 'warning';
  }
  if (eventLower.includes('success') || descriptionLower.includes('success')) {
    return 'success';
  }

  return 'info';
}
