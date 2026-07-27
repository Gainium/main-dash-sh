/* eslint-disable @typescript-eslint/no-explicit-any */
import { IS_CLOUD } from '@/config/mode';
import { GraphQLClient, GraphQlQuery } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import {
  type NotificationType,
  type UnifiedNotification,
  useNotificationsStore,
} from '@/stores/notificationsStore';
import { useUIStore } from '@/stores/uiStore';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import logger from '../lib/loggerInstance';
import { useGraphQL } from './useGraphQL';

interface UseNotificationsOptions {
  type: NotificationType | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

interface MessageSocket {
  _id: string;
  userId?: string;
  botId?: string;
  botType?: string;
  botName?: string;
  message: string;
  time: number;
  type: string;
  paperContext?: boolean;
  terminal?: boolean;
  symbol?: string;
  exchange?: string;
}

interface PlatformNotification {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  image?: string;
  url?: string;
  isRead: boolean;
}

interface ChangeLog {
  id: number;
  title: string;
  shortDescription: string;
  fullDescription: string;
  type: string;
  typeOther?: string;
  date: string;
}

const ITEMS_PER_PAGE = 10;

// One-shot cleanup of the deprecated client-side bot-read tracking.
// Previous versions stored read bot ids in localStorage; bot read state
// is now handled server-side via deleteBotMessage, so this key is dead.
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('readBotNotifications');
  } catch {
    // ignore — localStorage may be unavailable in private mode
  }
}

export function useNotifications(
  options: UseNotificationsOptions = { type: 'all' }
) {
  const {
    type,
    search = '',
    page = 1,
    pageSize = ITEMS_PER_PAGE,
    unreadOnly = false,
  } = options;
  const { setUnreadCounts } = useNotificationsStore();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  // Create authenticated GraphQL client
  const authenticatedClient = useMemo(() => {
    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const paperContext = !isLiveTrading;
    return new GraphQLClient(endpoint, tokens?.accessToken, paperContext);
  }, [tokens?.accessToken, isLiveTrading]);

  // Bot messages query
  const botQuery = useMemo(() => {
    if (type !== 'bot' && type !== 'all') return null;

    // Try different parameter combinations based on what works in legacy dashboard
    // Legacy dashboard sometimes calls with no params, sometimes with full params
    let params: any = undefined;

    // Try without parameters first for all basic loads (like legacy dashboard)
    // Only use parameters when we have search terms or are not on first page
    if (page === 1 && !search && !unreadOnly) {
      // Use no parameters for basic load (like NotificationsNew.tsx line 170)
      params = undefined;
    } else {
      // Use parameters for specific queries (like notifications.tsx line 137)
      params = {
        unreadOnly: false, // Always false to match legacy behavior
        page,
        pageSize,
      };
      // Only include search if it's not empty
      if (search && search.trim()) {
        params.search = search.trim();
      }
    }

    // Debug logging for notifications (can be removed once stable)
    if (import.meta.env.DEV && params?.page > 1) {
      logger.info('[useNotifications] Loading page:', params.page);
    }

    return GraphQlQuery.getMessageBot(params);
  }, [type, unreadOnly, page, pageSize, search]);

  const {
    data: botData,
    isLoading: botLoading,
    error: botError,
  } = useGraphQL<any>(
    'getMessageBot',
    botQuery || { query: '', variables: {} },
    {
      enabled: !!botQuery, // Remove token dependency - let GraphQL client handle auth
      queryKey: ['getMessageBot', botQuery?.variables],
      retry: (failureCount, error) => {
        // Don't retry on authentication errors (401, 403) or client errors (400)
        if (
          error.message.includes('401') ||
          error.message.includes('403') ||
          error.message.includes('400')
        ) {
          console.warn(
            '[useNotifications] Authentication or client error, not retrying:',
            error.message
          );
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      // Bot messages are realtime push data — never let a stale React Query
      // cache hide a newly-arrived error. Always refetch on mount.
      staleTime: 0,
      refetchOnMount: 'always',
      gcTime: 10 * 60 * 1000, // 10 minutes
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    }
  );

  // Platform notifications query (cloud only).
  const announcementQuery = useMemo(() => {
    if (!IS_CLOUD) return null;
    if (type !== 'announcement' && type !== 'all') return null;
    const params: any = {
      unreadOnly,
      page,
      pageSize,
    };
    // Only include search if it's not empty
    if (search && search.trim()) {
      params.search = search.trim();
    }
    return GraphQlQuery.getPlatformNotifications(params);
  }, [type, unreadOnly, page, pageSize, search]);

  const {
    data: announcementData,
    isLoading: announcementLoading,
    error: announcementError,
  } = useGraphQL<any>(
    'getPlatformNotifications',
    announcementQuery || { query: '', variables: {} },
    {
      enabled: !!announcementQuery,
      queryKey: ['getPlatformNotifications', announcementQuery?.variables],
      retry: (failureCount, error) => {
        if (
          error.message.includes('401') ||
          error.message.includes('403') ||
          error.message.includes('400')
        ) {
          console.warn(
            '[useNotifications] Platform notifications auth/client error:',
            error.message
          );
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    }
  );

  // Changelog query (cloud only).
  const changelogQuery = useMemo(() => {
    if (!IS_CLOUD) return null;
    if (type !== 'changelog' && type !== 'all') return null;
    const params: any = {
      page: page - 1, // Changelog uses 0-based pagination
      pageSize,
      all: true,
    };
    // Only include search if it's not empty
    if (search && search.trim()) {
      params.search = search.trim();
    }
    return GraphQlQuery.getChangeLogs(params);
  }, [type, page, pageSize, search]);

  const {
    data: changelogData,
    isLoading: changelogLoading,
    error: changelogError,
  } = useGraphQL<any>(
    'getChangeLogs',
    changelogQuery || { query: '', variables: {} },
    {
      enabled: !!changelogQuery,
      queryKey: ['getChangeLogs', changelogQuery?.variables],
      retry: (failureCount, error) => {
        if (
          error.message.includes('401') ||
          error.message.includes('403') ||
          error.message.includes('400')
        ) {
          console.warn(
            '[useNotifications] Changelog auth/client error:',
            error.message
          );
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    }
  );

  // Unread changelog count query (cloud only).
  const unreadChangelogQuery = useMemo(() => {
    if (!IS_CLOUD) return null;
    return GraphQlQuery.getUnreadChangeLogs();
  }, []);

  const {
    data: unreadChangelogData,
    isLoading: unreadChangelogLoading,
    error: unreadChangelogError,
  } = useGraphQL<any>(
    'getUnreadChangeLogs',
    unreadChangelogQuery || { query: '', variables: {} },
    {
      enabled: !!unreadChangelogQuery,
      queryKey: [
        'getUnreadChangeLogs',
        (unreadChangelogQuery as any)?.variables,
      ],
      retry: (failureCount, error) => {
        if (
          error.message.includes('401') ||
          error.message.includes('403') ||
          error.message.includes('400')
        ) {
          console.warn(
            '[useNotifications] Unread changelog auth/client error:',
            error.message
          );
          return false;
        }
        return failureCount < 2;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    }
  );

  // Transform data to unified format
  const notifications = useMemo(() => {
    const unified: UnifiedNotification[] = [];

    // Add bot messages with enhanced error handling
    try {
      if (botData?.status === 'OK' && Array.isArray(botData.data?.result)) {
        // Bot messages have no backend isRead field — legacy treats
        // "mark as read" as a delete via deleteBotMessage(), so any row
        // present in the feed is by definition unread.
        const botNotifications = botData.data.result
          .filter((msg: any) => msg && msg._id) // Filter out invalid messages
          .map((msg: MessageSocket) => ({
            id: msg._id,
            type: msg.type || 'info',
            title: msg.terminal
              ? `Deal ${msg.symbol}@${(msg.exchange ?? '').toUpperCase()}`
              : msg.botId && msg.botId !== 'system'
                ? `Bot ${msg.botName || msg.botId}`
                : 'System',
            message: msg.message || 'No message content',
            time: msg.time || Date.now(),
            botId: msg.botId,
            botName: msg.botName,
            botType: msg.botType,
            symbol: msg.symbol,
            exchange: msg.exchange,
            terminal: msg.terminal,
            notificationType: 'bot' as const,
            isRead: false,
          }));
        unified.push(...botNotifications);
      } else if (botData && botData.status !== 'OK') {
        console.warn(
          '[useNotifications] Bot data status not OK:',
          botData.status,
          botData.reason
        );
      }
    } catch (error) {
      console.error(
        '[useNotifications] Error processing bot notifications:',
        error
      );
    }

    // Add platform notifications with enhanced error handling
    try {
      if (
        announcementData?.status === 'OK' &&
        Array.isArray(announcementData.data?.data)
      ) {
        const announcements = announcementData.data.data
          .filter((announcement: any) => announcement && announcement.id) // Filter out invalid announcements
          .map((announcement: PlatformNotification) => ({
            id: announcement.id,
            type: announcement.type || 'announcement',
            title: announcement.title || 'No title',
            message: announcement.description || 'No description',
            time: announcement.date
              ? new Date(announcement.date).getTime()
              : Date.now(),
            notificationType: 'announcement' as const,
            url: announcement.url,
            imgSRC: announcement.image,
            isRead: announcement.isRead || false,
          }));
        unified.push(...announcements);
      } else if (announcementData && announcementData.status !== 'OK') {
        console.warn(
          '[useNotifications] Announcement data status not OK:',
          announcementData.status,
          announcementData.reason
        );
      }
    } catch (error) {
      console.error(
        '[useNotifications] Error processing platform notifications:',
        error
      );
    }

    // Add changelogs with enhanced error handling
    try {
      if (
        changelogData?.status === 'OK' &&
        Array.isArray(changelogData.data?.result)
      ) {
        const unreadChangelogCount = unreadChangelogData?.data?.result ?? 0;

        const changelogs = changelogData.data.result
          .filter((changelog: any) => changelog && changelog.id)
          .map((changelog: ChangeLog, index: number) => {
            const isRead = index >= unreadChangelogCount;

            return {
              id: changelog.id?.toString() || `changelog-${index}`,
              type: changelog.type || 'update',
              title: changelog.title || 'No title',
              message:
                changelog.shortDescription ||
                changelog.fullDescription ||
                'No description',
              time: changelog.date
                ? new Date(changelog.date).getTime()
                : Date.now(),
              notificationType: 'changelog' as const,
              fullDescription: changelog.fullDescription,
              htmlDescription: true,
              isRead: isRead,
            };
          });
        unified.push(...changelogs);
      } else if (changelogData && changelogData.status !== 'OK') {
        console.warn(
          '[useNotifications] Changelog data status not OK:',
          changelogData.status,
          changelogData.reason
        );
      }
    } catch (error) {
      console.error(
        '[useNotifications] Error processing changelog notifications:',
        error
      );
    }

    const sortedUnified = unified.sort((a, b) => b.time - a.time);

    // If caller requested a specific notification type, filter the results so that
    // we don't return notifications from other categories. React Query may return
    // cached data from other queries when a query is disabled (enabled=false),
    // which resulted in the UI showing all notifications even when a filter was
    // selected. This ensures the hook returns only the requested type.
    if (type === 'all') return sortedUnified;
    return sortedUnified.filter((n) => n.notificationType === type);
  }, [botData, announcementData, changelogData, unreadChangelogData, type]);

  // Calculate totals and update unread counts
  const totals = useMemo(() => {
    const botTotal = botData?.total ?? 0;
    const announcementTotal = announcementData?.data?.total ?? 0;
    const announcementUnread = announcementData?.data?.totalUnread ?? 0;
    const changelogTotal = changelogData?.total ?? 0;
    const changelogUnread = unreadChangelogData?.data?.result ?? 0;

    return {
      bot: botTotal,
      announcement: announcementTotal,
      changelog: changelogTotal,
      total: botTotal + announcementTotal + changelogTotal,
      unreadAnnouncement: announcementUnread,
      unreadChangelog: changelogUnread,
    };
  }, [botData, announcementData, changelogData, unreadChangelogData]);

  // Update unread counts in store whenever notifications change
  useEffect(() => {
    // Calculate unread bot notifications from actual notifications data
    const unreadBotCount = notifications.filter(
      (n) => n.notificationType === 'bot' && !n.isRead
    ).length;

    // Update unread counts in store
    setUnreadCounts({
      bot: unreadBotCount, // Use actual unread count from notifications
      announcement: totals.unreadAnnouncement,
      changelog: totals.unreadChangelog, // Use actual unread count from separate query
      total:
        unreadBotCount + totals.unreadAnnouncement + totals.unreadChangelog,
    });
  }, [notifications, totals, setUnreadCounts]);

  // Loading and error states
  const isLoading = useMemo(() => {
    if (type === 'bot') return botLoading;
    if (type === 'announcement') return announcementLoading;
    if (type === 'changelog') return changelogLoading || unreadChangelogLoading;
    return (
      botLoading ||
      announcementLoading ||
      changelogLoading ||
      unreadChangelogLoading
    );
  }, [
    type,
    botLoading,
    announcementLoading,
    changelogLoading,
    unreadChangelogLoading,
  ]);

  const error = useMemo(() => {
    // Return the first error found with more specific error message
    const firstError =
      botError || announcementError || changelogError || unreadChangelogError;
    if (firstError) {
      // Create a more descriptive error message
      const errorSource = botError
        ? 'Bot notifications'
        : announcementError
          ? 'Platform announcements'
          : changelogError
            ? 'Changelog'
            : 'Unread changelog';

      return new Error(`Failed to load ${errorSource}: ${firstError.message}`);
    }

    return null;
  }, [announcementError, botError, changelogError, unreadChangelogError]);

  // CORRECT: Individual notification mark-as-read using existing working mutation
  const markNotificationAsReadMutation = useMutation({
    mutationFn: async (notification: UnifiedNotification) => {
      logger.info(
        '🔥 [MARK AS READ] Using readPlatformNotificationByUser for:',
        notification.id
      );
      const query = GraphQlQuery.readPlatformNotificationByUser({
        notificationId: Number(notification.id),
        isRead: true,
      });
      const result = await authenticatedClient.request(
        query.query,
        query.variables
      );
      logger.info('🔥 [MARK AS READ] Backend response:', result);
      return result;
    },
    onSuccess: (data, notification) => {
      logger.info(
        '✅ [MARK AS READ] Successfully marked notification as read:',
        notification.id
      );
      // No `['user']` invalidation here: read state lives on the
      // notification queries below, not on the user profile, and `['user']`
      // is the exchange/backtest/market-data cache key — invalidating it
      // just refetches megabytes of unrelated data.
      queryClient.invalidateQueries({ queryKey: ['getMessageBot'] });
      queryClient.invalidateQueries({ queryKey: ['getPlatformNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['getChangeLogs'] });
      queryClient.invalidateQueries({ queryKey: ['getUnreadChangeLogs'] });
    },
    onError: (error, notification) => {
      console.error(
        '❌ [MARK AS READ] Failed to mark notification as read:',
        notification.id,
        error
      );
      // Enhanced error handling
      if (error.message?.includes('400')) {
        toast.error('Invalid notification ID. Please refresh and try again.');
      } else if (error.message?.includes('401')) {
        toast.error('Authentication required. Please log in again.');
      } else {
        toast.error('Failed to mark notification as read. Please try again.');
      }
    },
  });

  // Bot mark-as-read = backend deletion (parity with legacy main-dash:
  // there is no isRead on bot messages, so legacy clears them with
  // deleteBotMessage). With an id it deletes one row; with no id it
  // clears the user's entire bot inbox.
  const deleteBotMessageMutation = useMutation({
    mutationFn: async (id?: string) => {
      const query = GraphQlQuery.deleteBotMessage(id ? { id } : {});
      const result = await authenticatedClient.request(
        query.query,
        query.variables
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['getMessageBot'] });
    },
    onError: (error) => {
      console.error('❌ [BOT MARK AS READ] Failed:', error);
      if (error.message?.includes('401')) {
        toast.error('Authentication required. Please log in again.');
      } else {
        toast.error('Failed to mark bot notification as read.');
      }
    },
  });

  // CRITICAL FIX: Changelog mark-as-read mutation - Use correct readChangeLog API
  const markChangelogAsReadMutation = useMutation({
    mutationFn: async () => {
      logger.info(
        '🔥 [CHANGELOG MARK AS READ] Using readChangeLog API for changelog notifications'
      );
      const query = GraphQlQuery.readChangeLog(); // Use correct changelog API
      const result = await authenticatedClient.request(query.query);
      logger.info('🔥 [CHANGELOG MARK AS READ] Backend response:', result);
      return result;
    },
    onSuccess: (data: any) => {
      logger.info(
        '✅ [CHANGELOG MARK AS READ] Response status:',
        data?.readChangeLog?.status
      );

      // CRITICAL: Check if the backend actually succeeded
      if (data?.readChangeLog?.status === 'OK') {
        logger.info(
          '✅ [CHANGELOG MARK AS READ] Backend succeeded - invalidating queries...'
        );

        // See markNotificationAsRead: no `['user']` invalidation.
        queryClient.invalidateQueries({ queryKey: ['getUnreadChangeLogs'] });
        queryClient.invalidateQueries({ queryKey: ['getChangeLogs'] });
      } else {
        console.error(
          '❌ [CHANGELOG MARK AS READ] Backend failed:',
          data?.readChangeLog?.reason
        );
        // Don't invalidate queries if backend failed
        toast.error(
          `Failed to mark as read: ${data?.readChangeLog?.reason || 'Unknown error'}`
        );
      }
    },
    onError: (error) => {
      console.error(
        '❌ [CHANGELOG MARK AS READ] Failed to mark changelogs as read:',
        error
      );
      // Enhanced error handling
      if (error.message?.includes('400')) {
        toast.error('Invalid request. Please refresh and try again.');
      } else if (error.message?.includes('401')) {
        toast.error('Authentication required. Please log in again.');
      } else {
        toast.error('Failed to mark changelogs as read. Please try again.');
      }
    },
  });

  // CRITICAL FIX: Use correct API based on notification type
  const markAsRead = useCallback(
    async (notification: UnifiedNotification) => {
      logger.info('🔍 [MARK AS READ] Processing:', {
        id: notification.id,
        type: notification.notificationType,
        title: notification.title,
      });

      try {
        if (notification.notificationType === 'changelog') {
          const result = await markChangelogAsReadMutation.mutateAsync();
          if ((result as any)?.readChangeLog?.status !== 'OK') {
            throw new Error(
              `Backend failed: ${(result as any)?.readChangeLog?.reason || 'Unknown error'}`
            );
          }
        } else if (notification.notificationType === 'bot') {
          // Bot ids are Mongo ObjectId strings; legacy uses deleteBotMessage.
          const result = await deleteBotMessageMutation.mutateAsync(
            notification.id
          );
          if ((result as any)?.deleteBotMessage?.status !== 'OK') {
            throw new Error(
              `Backend failed: ${(result as any)?.deleteBotMessage?.reason || 'Unknown error'}`
            );
          }
        } else {
          const result =
            await markNotificationAsReadMutation.mutateAsync(notification);
          if (
            (result as any)?.readPlatformNotificationByUser?.status !== 'OK'
          ) {
            throw new Error(
              `Backend failed: ${(result as any)?.readPlatformNotificationByUser?.reason || 'Unknown error'}`
            );
          }
        }
      } catch (error) {
        console.error('❌ [MARK AS READ] Error:', error);
        throw error;
      }
    },
    [
      markNotificationAsReadMutation,
      markChangelogAsReadMutation,
      deleteBotMessageMutation,
    ]
  );

  // Mark all announcements as read mutation - FIXED: Use existing backend pattern
  const markAllAnnouncementsAsReadMutation = useMutation({
    mutationFn: async () => {
      logger.info(
        '🔥 [BULK MARK AS READ] Using readPlatformNotificationByUser({}) for bulk operation'
      );
      const query = GraphQlQuery.readPlatformNotificationByUser({}); // Empty object = mark all
      const result = await authenticatedClient.request(
        query.query,
        query.variables
      );
      logger.info('🔥 [BULK MARK AS READ] Backend response:', result);
      return result;
    },
    onSuccess: () => {
      logger.info(
        '✅ [BULK MARK AS READ] Successfully marked all announcements as read'
      );
      // See markNotificationAsRead: no `['user']` invalidation.
      queryClient.invalidateQueries({ queryKey: ['getPlatformNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['getMessageBot'] });
      queryClient.invalidateQueries({ queryKey: ['getChangeLogs'] });
      queryClient.invalidateQueries({ queryKey: ['getUnreadChangeLogs'] });
      toast.success('All announcements marked as read');
    },
    onError: (error) => {
      console.error(
        '❌ [BULK MARK AS READ] Failed to mark all announcements as read:',
        error
      );
      // Enhanced error handling
      if (error.message?.includes('400')) {
        toast.error('Invalid request. Please refresh and try again.');
      } else if (error.message?.includes('401')) {
        toast.error('Authentication required. Please log in again.');
      } else {
        toast.error(
          'Failed to mark all announcements as read. Please try again.'
        );
      }
    },
  });

  // Mark all notifications of a type as read
  const markAllAsRead = useCallback(
    async (notifications: UnifiedNotification[]) => {
      // Group by type
      const announcementNotifications = notifications.filter(
        (n) => n.notificationType === 'announcement' && !n.isRead
      );
      const botNotifications = notifications.filter(
        (n) => n.notificationType === 'bot' && !n.isRead
      );
      const changelogNotifications = notifications.filter(
        (n) => n.notificationType === 'changelog' && !n.isRead
      );

      // Mark announcements as read using bulk mutation
      if (announcementNotifications.length > 0) {
        await markAllAnnouncementsAsReadMutation.mutateAsync();
      }

      // Mark bot notifications as read = delete them on the backend
      // (parity with legacy main-dash, which has no per-message isRead).
      // deleteBotMessage({}) clears the whole bot inbox in one call.
      if (botNotifications.length > 0) {
        await deleteBotMessageMutation.mutateAsync(undefined);
      }

      // Mark changelog notifications as read
      if (changelogNotifications.length > 0) {
        await markChangelogAsReadMutation.mutateAsync();
      }
    },
    [
      markAllAnnouncementsAsReadMutation,
      markChangelogAsReadMutation,
      deleteBotMessageMutation,
    ]
  );

  return {
    notifications,
    totals,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    // Individual mark as read functions
    markChangelogAsRead: markChangelogAsReadMutation.mutateAsync,
    // Loading state for individual mark-as-read
    isMarkingNotificationAsRead: markNotificationAsReadMutation.isPending,
    // Loading states for bulk operations
    isMarkingAllAnnouncementsAsRead:
      markAllAnnouncementsAsReadMutation.isPending,
    isMarkingChangelogAsRead: markChangelogAsReadMutation.isPending,
    isMarkingAnnouncementAsRead: markAllAnnouncementsAsReadMutation.isPending,
  };
}

// Convenience hooks for specific notification types
export function useBotNotifications(
  options?: Omit<UseNotificationsOptions, 'type'>
) {
  return useNotifications({ ...options, type: 'bot' });
}

export function useAnnouncementNotifications(
  options?: Omit<UseNotificationsOptions, 'type'>
) {
  return useNotifications({ ...options, type: 'announcement' });
}

export function useChangelogNotifications(
  options?: Omit<UseNotificationsOptions, 'type'>
) {
  return useNotifications({ ...options, type: 'changelog' });
}
