import { SHORTCUT_IDS } from '@/config/shortcuts';
import { useNotifications } from '@/hooks/useNotifications';
import { showShortcutHint } from '@/lib/shortcutHints';
import { toast } from '@/lib/toast';
import {
  type NotificationType,
  type UnifiedNotification,
  useNotificationsStore,
} from '@/stores/notificationsStore';
import { useVisualSettingsStore } from '@/stores/visualSettingsStore';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Bot,
  CheckCheck,
  FileText,
  Info,
  Loader2,
  Megaphone,
  Search,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logger from '../../lib/loggerInstance';
import ShortcutChip from '../common/ShortcutChip';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerDescription,
  DetailDrawerHeader,
  DetailDrawerTitle,
  DetailDrawerTrigger,
} from '../ui/detail-drawer';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Timeline, type TimelineItem } from '../ui/timeline';
import { NotificationRichContent } from './NotificationRichContent';

const timelineVariantForType = (
  type: NotificationType | string
): NonNullable<TimelineItem['variant']> => {
  switch (type) {
    case 'bot':
      return 'info';
    case 'announcement':
      return 'warning';
    case 'changelog':
      return 'success';
    default:
      return 'default';
  }
};

// note: category chip removed, no per-type badge class map needed

const getNotificationIconNode = (type: NotificationType | string) => {
  switch (type) {
    case 'bot':
      return <Bot className="h-5 w-5" />;
    case 'announcement':
      return <Megaphone className="h-5 w-5" />;
    case 'changelog':
      return <FileText className="h-5 w-5" />;
    default:
      return <Bell className="h-5 w-5" />;
  }
};

// Bot messages carry a severity (error/warning/info). In the rollup we key the
// icon + timeline accent off that severity, so an auto-archive `info` notice
// reads calmly and an error stands out — instead of every bot message sharing
// one neutral icon.
const getBotSeverityIconNode = (type: string) => {
  switch (type) {
    case 'error':
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-warning" />;
    case 'info':
      return <Info className="h-5 w-5 text-info" />;
    default:
      return <Bot className="h-5 w-5" />;
  }
};

const timelineVariantForSeverity = (
  type: string
): NonNullable<TimelineItem['variant']> => {
  switch (type) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default:
      return 'default';
  }
};

const NotificationPanel: React.FC = () => {
  const navigate = useNavigate();
  const {
    isNotificationsPanelOpen,
    closeNotificationsPanel,
    toggleNotificationsPanel,
    selectedFilter,
    setSelectedFilter,
    searchQuery,
    setSearchQuery,
    unreadCounts,
  } = useNotificationsStore();

  const [page] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [isMarkingTypeRead, setIsMarkingTypeRead] = useState(false);
  const [markingReadIds, setMarkingReadIds] = useState<Set<string>>(new Set());
  const [_expandedNotifications, _setExpandedNotifications] = useState<
    Set<string>
  >(new Set());
  const moveButtonsToMenu = useVisualSettingsStore((s) => s.moveButtonsToMenu);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch notifications based on current filters
  const {
    notifications,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    markChangelogAsRead,
    isMarkingChangelogAsRead,
    isMarkingAnnouncementAsRead,
  } = useNotifications({
    type: selectedFilter,
    search: debouncedSearch,
    page,
    pageSize: 20,
  });

  const getBotUrl = useCallback((notification: (typeof notifications)[0]) => {
    if (!notification.botId || notification.botId === 'system') return null;

    const botType = notification.botType;
    const demo = false; // Adjust this based on your app's demo context

    let urlPath = 'bot/view'; // default

    switch (botType) {
      case 'hedgeCombo':
        urlPath = 'hedge/combo/view';
        break;
      case 'hedgeDca':
        urlPath = 'hedge/bot/view';
        break;
      case 'grid':
        urlPath = 'grid/view';
        break;
      case 'combo':
        urlPath = 'combo/view';
        break;
      default:
        urlPath = 'bot/view';
        break;
    }

    return `${demo ? '/demo/' : '/'}${urlPath}/${notification.botId}`;
  }, []);

  // Removed unused functions to fix TypeScript errors

  // Removed per-message icon/color helpers (centralized inside MessageBox)

  const handleNotificationClick = useCallback(
    (notification: (typeof notifications)[0]) => {
      if (notification.url) {
        window.open(notification.url, '_blank', 'noopener,noreferrer');
      } else if (notification.notificationType === 'bot') {
        if (notification.terminal) {
          // Navigate to terminal for terminal notifications
          navigate('/terminal');
        } else {
          // Generate proper bot URL based on botType
          const botUrl = getBotUrl(notification);
          if (botUrl) {
            navigate(botUrl);
          }
        }
      }
    },
    [getBotUrl, navigate]
  );

  const handleMarkTypeAsRead = useCallback(
    async (type: NotificationType) => {
      setIsMarkingTypeRead(true);
      try {
        if (type === 'changelog') {
          markChangelogAsRead();
          toast.success(`Marked all ${type} notifications as read`);
        } else {
          // For bot and announcement notifications, mark all of this type as read
          const typeNotifications = notifications.filter(
            (n) => n.notificationType === type && !n.isRead
          );
          if (typeNotifications.length > 0) {
            await markAllAsRead(typeNotifications);
            toast.success(
              `Marked ${typeNotifications.length} ${type} notification${typeNotifications.length === 1 ? '' : 's'} as read`
            );
          }
        }
      } catch (error) {
        console.error('Failed to mark type as read:', error);
        toast.error(`Failed to mark ${type} notifications as read`);
      } finally {
        setIsMarkingTypeRead(false);
      }
    },
    [notifications, markAllAsRead, markChangelogAsRead]
  );

  const handleMarkAllRead = useCallback(async () => {
    setIsMarkingAllRead(true);
    try {
      const unreadNotifications = notifications.filter((n) => !n.isRead);
      if (unreadNotifications.length === 0) {
        toast.info('No unread notifications to mark as read');
        return;
      }

      // Separate by type and handle accordingly
      const announcementNotifications = unreadNotifications.filter(
        (n) => n.notificationType === 'announcement'
      );
      const botNotifications = unreadNotifications.filter(
        (n) => n.notificationType === 'bot'
      );
      const changelogNotifications = unreadNotifications.filter(
        (n) => n.notificationType === 'changelog'
      );

      // Handle announcements and bots via markAllAsRead
      if (announcementNotifications.length > 0 || botNotifications.length > 0) {
        await markAllAsRead([
          ...announcementNotifications,
          ...botNotifications,
        ]);
      }

      // Handle changelog separately
      if (changelogNotifications.length > 0) {
        markChangelogAsRead();
      }

      toast.success(
        `Marked ${unreadNotifications.length} notification${unreadNotifications.length === 1 ? '' : 's'} as read`
      );
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark all notifications as read');
    } finally {
      setIsMarkingAllRead(false);
    }
  }, [notifications, markAllAsRead, markChangelogAsRead]);

  const handleSingleMarkAsRead = useCallback(
    async (notification: (typeof notifications)[0]) => {
      logger.info('🟦 [PANEL DEBUG] handleSingleMarkAsRead called for:', {
        id: notification.id,
        type: notification.notificationType,
        title: notification.title,
        isRead: notification.isRead,
        currentlyMarking: markingReadIds.has(notification.id),
      });

      // Prevent multiple concurrent mark-as-read operations
      if (markingReadIds.has(notification.id)) {
        logger.info(
          '⚠️ [PANEL DEBUG] Already marking this notification, skipping'
        );
        return;
      }

      logger.info('🟦 [PANEL DEBUG] Setting loading state');
      setMarkingReadIds((prev) => new Set(prev.add(notification.id)));

      try {
        logger.info('🟦 [PANEL DEBUG] Calling markAsRead...');
        await markAsRead(notification);
        logger.info('✅ [PANEL DEBUG] markAsRead completed successfully');
        // Don't show success toast for individual marks to avoid spam
        // The UI already updates optimistically
      } catch (error) {
        console.error(
          '❌ [PANEL DEBUG] Failed to mark notification as read:',
          error
        );
        toast.error('Failed to mark notification as read. Please try again.');
      } finally {
        logger.info('🟦 [PANEL DEBUG] Clearing loading state');
        // Use a small delay to prevent UI flicker
        setTimeout(() => {
          setMarkingReadIds((prev) => {
            const newSet = new Set(prev);
            newSet.delete(notification.id);
            logger.info(
              '🟦 [PANEL DEBUG] Loading state cleared for notification:',
              notification.id
            );
            return newSet;
          });
        }, 100);
      }
    },
    [markAsRead, markingReadIds]
  );

  const getUnreadCountForType = useCallback(
    (type: NotificationType | 'all') => {
      if (type === 'all') {
        return notifications.filter((n) => !n.isRead).length;
      }
      return notifications.filter(
        (n) => n.notificationType === type && !n.isRead
      ).length;
    },
    [notifications]
  );

  const canMarkCurrentFilterRead =
    getUnreadCountForType(selectedFilter as NotificationType | 'all') > 0;

  const toUnifiedNotification = useCallback(
    (notification: (typeof notifications)[number]): UnifiedNotification => {
      const unified: UnifiedNotification = {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.notificationType,
        notificationType: notification.notificationType,
        time: notification.time,
      };

      if (notification.htmlDescription !== undefined) {
        unified.htmlDescription = notification.htmlDescription;
      }
      if (notification.isRead !== undefined) {
        unified.isRead = notification.isRead;
      }
      if (notification.url) {
        unified.url = notification.url;
      }
      if (notification.symbol) {
        unified.symbol = notification.symbol;
      }
      if (notification.exchange) {
        unified.exchange = notification.exchange;
      }
      if (notification.botId) {
        unified.botId = notification.botId;
      }
      if (notification.botType) {
        unified.botType = notification.botType;
      }
      if (notification.terminal !== undefined) {
        unified.terminal = notification.terminal;
      }
      if (notification.imgSRC) {
        unified.imgSRC = notification.imgSRC;
      }
      if (notification.blurred !== undefined) {
        unified.blurred = notification.blurred;
      }

      return unified;
    },
    []
  );

  // Group notifications by day for day separators
  const groupedByDay = useMemo(() => {
    const groups: Record<string, typeof notifications> = {};
    notifications.forEach((notification) => {
      const createdAt = new Date(notification.time);
      const dayKey = createdAt.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(notification);
    });
    return Object.entries(groups).map(([day, notifs]) => ({
      day,
      notifications: notifs,
    }));
  }, [notifications]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    groupedByDay.forEach((dayGroup, _dayIndex) => {
      // Add day separator as a timeline item
      items.push({
        id: `day-separator-${dayGroup.day}`,
        title: dayGroup.day,
        isDaySeparator: true,
        variant: 'default',
      } as TimelineItem & { isDaySeparator: boolean });

      // Add notifications for this day
      dayGroup.notifications.forEach((notification) => {
        const unified = toUnifiedNotification(notification);
        const createdAt = new Date(notification.time);
        const formattedTime = createdAt.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        });
        const notificationType = notification.notificationType;
        const hasClickAction = Boolean(
          notification.url ||
          (notification.notificationType === 'bot' &&
            (notification.botId || notification.terminal))
        );

        const actions = (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 hover:text-success shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              if (markingReadIds.has(notification.id)) {
                return;
              }
              handleSingleMarkAsRead(notification);
            }}
            disabled={markingReadIds.has(notification.id)}
            title="Mark as read"
          >
            {markingReadIds.has(notification.id) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
          </Button>
        );

        const onClick = hasClickAction
          ? () => handleNotificationClick(notification)
          : undefined;

        const newBadge = !notification.isRead ? (
          <Badge
            variant="default"
            className="min-w-0 h-5 px-2 py-0 text-xs font-semibold bg-destructive/10 text-destructive border-0 rounded-full"
          >
            New
          </Badge>
        ) : null;

        // removed category chip (type badge) next to the title by design

        const timelineItem: TimelineItem = {
          id: notification.id,
          title: notification.title,
          timestamp: formattedTime,
          time: formattedTime,
          icon:
            notificationType === 'bot'
              ? getBotSeverityIconNode(notification.type)
              : getNotificationIconNode(notificationType),
          variant:
            notificationType === 'bot'
              ? timelineVariantForSeverity(notification.type)
              : timelineVariantForType(notificationType),
          content: (
            <NotificationRichContent notification={unified} clampLines={3} />
          ),
          metadata:
            notification.symbol || notification.exchange ? (
              <div className="flex flex-wrap items-center gap-xs text-xs text-muted-foreground">
                {notification.symbol && (
                  <Badge
                    variant="secondary"
                    className="px-1.5 py-0 h-4 text-xs uppercase"
                  >
                    {notification.symbol}
                  </Badge>
                )}
                {notification.exchange && (
                  <span className="uppercase tracking-wide text-xs">
                    {notification.exchange}
                  </span>
                )}
              </div>
            ) : null,
          actions,
          titleAddon: newBadge,
        };

        if (onClick) {
          timelineItem.onClick = onClick;
        }

        items.push(timelineItem);
      });
    });

    return items;
  }, [
    groupedByDay,
    markingReadIds,
    handleNotificationClick,
    handleSingleMarkAsRead,
    toUnifiedNotification,
  ]);

  return (
    <DetailDrawer
      open={isNotificationsPanelOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeNotificationsPanel();
        }
      }}
    >
      <DetailDrawerTrigger asChild>
        <div
          className={`relative hidden md:block ${moveButtonsToMenu ? 'md:hidden' : ''}`}
        >
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-8 w-8"
            onClick={() => {
              showShortcutHint('toggleNotifications');
              toggleNotificationsPanel();
            }}
            aria-label={`Notifications${unreadCounts.total > 0 ? ` (${unreadCounts.total} unread)` : ''}`}
          >
            <Bell className="h-4 w-4" />
          </Button>
          {unreadCounts.total > 0 && (
            <Badge
              className={`absolute -top-1 -right-1 min-w-5 h-5 px-1 text-xs flex items-center justify-center text-white border-0 rounded-full ${
                unreadCounts.bot > 0
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-success hover:bg-success/90'
              }`}
            >
              {unreadCounts.total}
            </Badge>
          )}
        </div>
      </DetailDrawerTrigger>
      <DetailDrawerContent className="w-full sm:max-w-lg h-screen flex flex-col">
        <DetailDrawerHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-sm">
              <DetailDrawerTitle className="flex items-center gap-xs">
                Notifications
                {unreadCounts.total > 0 && (
                  <Badge
                    variant="default"
                    className="min-w-5 h-5 px-1 text-xs flex items-center justify-center border-0 bg-destructive rounded-full"
                  >
                    {unreadCounts.total}
                  </Badge>
                )}
                <ShortcutChip id={SHORTCUT_IDS.ActionNotifications} />
              </DetailDrawerTitle>
            </div>
          </div>
          <DetailDrawerDescription>
            View and manage your notifications from bots, announcements, and
            updates
          </DetailDrawerDescription>
        </DetailDrawerHeader>
        <DetailDrawerBody className="p-0 flex flex-col flex-1 min-h-0">
          {/* Search */}
          <div className="shrink-0 p-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filter Tabs - Standard Bot Drawer Style */}
          <div className="shrink-0">
            <div className="flex items-center justify-between px-4 py-2">
              <Tabs
                value={selectedFilter}
                onValueChange={(value) =>
                  setSelectedFilter(value as NotificationType | 'all')
                }
                className="flex-1"
              >
                <TabsList className="grid w-full grid-cols-4 h-9">
                  <TabsTrigger
                    value="all"
                    className="flex items-center gap-1.5 text-xs"
                  >
                    All
                    {unreadCounts.total > 0 && (
                      <Badge className="min-w-4 h-4 px-1 text-xs bg-success text-white border-0 rounded-full flex items-center justify-center">
                        {unreadCounts.total}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="bot"
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Bot className="h-3 w-3" />
                    <span className="hidden sm:inline">Bots</span>
                    {unreadCounts.bot > 0 && (
                      <Badge className="min-w-4 h-4 px-1 text-xs bg-destructive text-white border-0 rounded-full flex items-center justify-center">
                        {unreadCounts.bot}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="announcement"
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Megaphone className="h-3 w-3" />
                    <span className="hidden sm:inline">News</span>
                    {unreadCounts.announcement > 0 && (
                      <Badge className="min-w-4 h-4 px-1 text-xs bg-success text-white border-0 rounded-full flex items-center justify-center">
                        {unreadCounts.announcement}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="changelog"
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="hidden sm:inline">Updates</span>
                    {unreadCounts.changelog > 0 && (
                      <Badge className="min-w-4 h-4 px-1 text-xs bg-success text-white border-0 rounded-full flex items-center justify-center">
                        {unreadCounts.changelog}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Mark as read button for current tab - icon only, no text */}
              {canMarkCurrentFilterRead && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedFilter === 'all') {
                      handleMarkAllRead();
                    } else {
                      handleMarkTypeAsRead(selectedFilter as NotificationType);
                    }
                  }}
                  disabled={
                    isMarkingAllRead ||
                    isMarkingTypeRead ||
                    (selectedFilter === 'changelog' &&
                      isMarkingChangelogAsRead) ||
                    (selectedFilter === 'announcement' &&
                      isMarkingAnnouncementAsRead)
                  }
                  className="ml-2 h-8 w-8 p-0"
                  title={
                    selectedFilter === 'all'
                      ? 'Mark all notifications as read'
                      : `Mark all ${selectedFilter} notifications as read`
                  }
                >
                  {isMarkingAllRead ||
                  isMarkingTypeRead ||
                  (selectedFilter === 'changelog' &&
                    isMarkingChangelogAsRead) ||
                  (selectedFilter === 'announcement' &&
                    isMarkingAnnouncementAsRead) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCheck className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              <div className="py-2">
                {isLoading && (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading notifications...
                  </div>
                )}

                {error && (
                  <div className="text-center py-8 text-destructive">
                    <div className="font-medium mb-2">
                      Failed to load notifications
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {error.message || 'Unknown error occurred'}
                    </div>
                    {import.meta.env.DEV && (
                      <div className="text-xs mt-2 text-left bg-muted p-xs rounded">
                        <strong>Debug info:</strong>
                        <br />
                        Check browser console for detailed error logs
                      </div>
                    )}
                  </div>
                )}

                {!isLoading && !error && timelineItems.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No notifications found
                  </div>
                )}

                {!isLoading && !error && timelineItems.length > 0 && (
                  <Timeline
                    items={timelineItems}
                    layout="right"
                    className="px-4"
                  />
                )}
              </div>
            </ScrollArea>
          </div>
        </DetailDrawerBody>
      </DetailDrawerContent>
    </DetailDrawer>
  );
};

export default NotificationPanel;
