import MainLayout from '@/components/layout/MainLayout';
import { botUrlFor } from '@/components/notifications/botUrl';
import { NotificationMarket } from '@/components/notifications/NotificationMarket';
import { NotificationRichContent } from '@/components/notifications/NotificationRichContent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Timeline, type TimelineItem } from '@/components/ui/timeline';
import { useNotifications } from '@/hooks/useNotifications';
import type { BotMessageView } from '@/lib/api/GraphQLQueries-bot-queries';
import { toast } from '@/lib/toast';
import type {
  NotificationType,
  UnifiedNotification,
} from '@/stores/notificationsStore';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Bot,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Info,
  Loader2,
  Megaphone,
  Search,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Notification history. The bell panel is the unread inbox — reading a
 * message clears it from there — and this page is where everything stays
 * reachable: read bot messages are kept server-side for 90 days and can be
 * filtered by read state, severity and bot, and searched.
 */

const PAGE_SIZE = 25;

type Feed = Extract<NotificationType, 'bot' | 'announcement' | 'changelog'>;
type Severity = 'any' | 'error' | 'warning' | 'info';

const severityIcon = (type: string) => {
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

const severityVariant = (
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

const feedIcon = (feed: NotificationType) => {
  switch (feed) {
    case 'announcement':
      return <Megaphone className="h-4 w-4" />;
    case 'changelog':
      return <FileText className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

const dayKey = (time: number) =>
  new Date(time).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<Feed>('bot');
  const [view, setView] = useState<BotMessageView>('all');
  const [severity, setSeverity] = useState<Severity>('any');
  const [botFilter, setBotFilter] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [feed, view, severity, botFilter, search]);

  const isBotFeed = feed === 'bot';
  const { notifications, totals, isLoading, error, markAsRead, markAllAsRead } =
    useNotifications({
      type: feed,
      search,
      page,
      pageSize: PAGE_SIZE,
      botView: view,
      ...(severity !== 'any' ? { botSeverity: severity } : {}),
      ...(botFilter ? { botId: botFilter.id } : {}),
    });

  const total = totals[feed] ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unreadOnPage = notifications.filter((n) => !n.isRead);

  const grouped = useMemo(() => {
    const groups: { day: string; items: UnifiedNotification[] }[] = [];
    for (const n of notifications) {
      const day = dayKey(n.time);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(n);
      else groups.push({ day, items: [n] });
    }
    return groups;
  }, [notifications]);

  const handleMarkRead = useCallback(
    async (n: UnifiedNotification) => {
      if (markingIds.has(n.id)) return;
      setMarkingIds((prev) => new Set(prev).add(n.id));
      try {
        await markAsRead(n);
      } catch {
        toast.error('Failed to mark notification as read. Please try again.');
      } finally {
        setMarkingIds((prev) => {
          const next = new Set(prev);
          next.delete(n.id);
          return next;
        });
      }
    },
    [markAsRead, markingIds]
  );

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await markAllAsRead(unreadOnPage);
      toast.success('Marked all as read');
    } catch {
      toast.error('Failed to mark notifications as read');
    } finally {
      setMarkingAll(false);
    }
  }, [markAllAsRead, unreadOnPage]);

  const openNotification = useCallback(
    (n: UnifiedNotification) => {
      if (n.url) {
        window.open(n.url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (n.notificationType !== 'bot') return;
      if (n.terminal) {
        navigate('/terminal');
        return;
      }
      const url = botUrlFor(n);
      if (url) navigate(url);
    },
    [navigate]
  );

  // Same Timeline the bell panel uses, so the page reads as the panel's
  // history rather than a different component.
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const { day, items: dayItems } of grouped) {
      items.push({
        id: `day-${day}`,
        title: day,
        isDaySeparator: true,
        variant: 'default',
      } as TimelineItem & { isDaySeparator: boolean });
      for (const n of dayItems) {
        const isBot = n.notificationType === 'bot';
        const clickable =
          !!n.url || (isBot && (!!botUrlFor(n) || !!n.terminal));
        const time = new Date(n.time).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        });
        const item: TimelineItem = {
          id: n.id,
          title: n.title,
          timestamp: time,
          time,
          icon: isBot ? severityIcon(n.type) : feedIcon(n.notificationType),
          variant: isBot ? severityVariant(n.type) : 'default',
          content: <NotificationRichContent notification={n} clampLines={3} />,
          titleAddon: n.isRead ? (
            <span className="flex items-center gap-0.5 text-xs text-success">
              <CheckCheck className="h-3 w-3" />
              Read
            </span>
          ) : (
            <Badge
              variant="default"
              className="min-w-0 h-5 px-2 py-0 text-xs font-semibold bg-destructive/10 text-destructive border-0 rounded-full"
            >
              New
            </Badge>
          ),
          actions: n.isRead ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 hover:text-success shrink-0"
              title="Mark as read"
              disabled={markingIds.has(n.id)}
              onClick={(e) => {
                e.stopPropagation();
                handleMarkRead(n);
              }}
            >
              {markingIds.has(n.id) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
            </Button>
          ),
          metadata:
            isBot && (n.symbol || n.exchange || n.botId) ? (
              <div className="flex flex-wrap items-center gap-sm text-xs text-muted-foreground">
                <NotificationMarket symbol={n.symbol} exchange={n.exchange} />
                {n.botId &&
                  n.botId !== 'system' &&
                  botFilter?.id !== n.botId && (
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBotFilter({
                          id: n.botId as string,
                          name: n.botName || n.botId || '',
                        });
                      }}
                    >
                      <Filter className="h-3 w-3" />
                      Only this bot
                    </button>
                  )}
              </div>
            ) : null,
          ...(n.isRead ? { className: 'opacity-75 hover:opacity-90' } : {}),
        };
        if (clickable) item.onClick = () => openNotification(n);
        items.push(item);
      }
    }
    return items;
  }, [grouped, markingIds, handleMarkRead, openNotification, botFilter]);

  const pageActions =
    unreadOnPage.length > 0 ? (
      <Button
        variant="outline"
        size="sm"
        onClick={handleMarkAllRead}
        disabled={markingAll}
        className="gap-xs"
      >
        {markingAll ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCheck className="h-4 w-4" />
        )}
        Mark all read
      </Button>
    ) : null;

  const hasBotFilters =
    view !== 'all' || severity !== 'any' || !!botFilter || !!search;

  return (
    <MainLayout
      pageTitle="Notifications"
      activePage="/notifications"
      pageActions={pageActions}
    >
      <div className="min-h-full p-md md:p-lg space-y-md max-w-4xl mx-auto w-full">
        <Tabs value={feed} onValueChange={(v) => setFeed(v as Feed)}>
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
            <TabsTrigger value="bot" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Bots
            </TabsTrigger>
            <TabsTrigger value="announcement" className="gap-1.5">
              <Megaphone className="h-3.5 w-3.5" />
              News
            </TabsTrigger>
            <TabsTrigger value="changelog" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Updates
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col sm:flex-row gap-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                isBotFeed
                  ? 'Search message, bot, pair or exchange…'
                  : 'Search notifications…'
              }
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
          {isBotFeed && (
            <div className="flex gap-sm">
              <Select
                value={view}
                onValueChange={(v) => setView(v as BotMessageView)}
              >
                <SelectTrigger className="w-[150px]" aria-label="Read state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Read &amp; unread</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as Severity)}
              >
                <SelectTrigger className="w-[140px]" aria-label="Severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All severities</SelectItem>
                  <SelectItem value="error">Errors</SelectItem>
                  <SelectItem value="warning">Warnings</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {isBotFeed && (botFilter || total > 0) && (
          <div className="flex flex-wrap items-center gap-sm text-sm text-muted-foreground">
            <span>
              {total} message{total === 1 ? '' : 's'}
            </span>
            {botFilter && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Bot: {botFilter.name}
                <button
                  type="button"
                  className="rounded-sm hover:bg-muted p-0.5"
                  onClick={() => setBotFilter(null)}
                  aria-label="Clear bot filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <span className="text-xs">
              Read messages are kept for 90 days.
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-xl text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-xl text-destructive">
            <div className="font-medium mb-sm">
              Failed to load notifications
            </div>
            <div className="text-sm text-muted-foreground">
              {error.message || 'Unknown error occurred'}
            </div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-xl">
            <Bell className="mx-auto h-10 w-10 text-muted-foreground mb-md" />
            <h3 className="text-lg font-medium mb-xs">No notifications found</h3>
            <p className="text-sm text-muted-foreground">
              {isBotFeed && hasBotFilters
                ? 'Try a different search or filter.'
                : "You're all caught up."}
            </p>
          </div>
        ) : (
          <Timeline items={timelineItems} layout="right" />
        )}

        {!isLoading && !error && pageCount > 1 && (
          <div className="flex items-center justify-center gap-sm pt-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Notifications;
