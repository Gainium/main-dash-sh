import type { DrawerBot } from '@/types/bots/drawer';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useBotEvents, type BotEvent } from '../../../../hooks/useBotEvents';
import {
  classifyBotEvent,
  type EventIconKey,
  type EventVariant,
} from '../../../../lib/botEventTaxonomy';
import {
  BOT_EVENT_TYPE_OPTIONS,
  EMPTY_BOT_EVENT_FILTERS,
  botEventsToCsv,
  buildBotEventsQuery,
  countActiveBotEventFilters,
  extractOrderId,
  isBotEventTypeFilter,
  pairOptionsFromBot,
  type BotEventFilters,
} from '../../../../lib/botEventFilters';
import { GraphQLClient, getGraphQLConfig } from '../../../../lib/api';
import { botQueries } from '../../../../lib/api/GraphQLQueries-bot-queries';
import { useShareContext } from '../../../../hooks/useShareContext';
import { useAuthStore } from '../../../../stores/authStore';
import { useUIStore } from '../../../../stores/uiStore';
import { BotEventsFilterBar } from './BotEventsFilterBar';
/* import { useComboBots } from '../../../../hooks/useComboBots';
import { useDcaBots } from '../../../../hooks/useDcaBots';
import { useGridBots } from '../../../../hooks/useGridBots';
import { useHedgeComboBots } from '../../../../hooks/useHedgeComboBots';
import { useHedgeDcaBots } from '../../../../hooks/useHedgeDcaBots'; */
import { cn } from '../../../../lib/utils';
import { copyToClipboard } from '../../../../lib/webhookUtils';
import { toast } from '../../../../lib/toast';
import CoinPair from '../../shared/CoinPair';
import { DrawerSection } from './DrawerSection';
import { BotTypesEnum } from '../../../../types';
import { Alert, AlertDescription } from '../../../ui/alert';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../ui/dialog';
import { ScrollArea } from '../../../ui/scroll-area';
import { Timeline, type TimelineItem } from '../../../ui/timeline';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle,
  Clock,
  Copy,
  Eye,
  Filter,
  Info,
  Layers,
  Plus,
  Power,
  RefreshCw,
  Settings,
  Share2,
  Trash2,
  TrendingUp,
  Webhook,
} from 'lucide-react';

// Maps the taxonomy's semantic icon key to a concrete lucide icon. Keeping the
// mapping here (not in the taxonomy module) keeps that module JSX/dependency
// free and testable in isolation.
const ICON_BY_KEY: Record<
  EventIconKey,
  React.ComponentType<{ className?: string }>
> = {
  buy: ArrowUp,
  sell: ArrowDown,
  filled: CheckCircle,
  placed: Plus,
  cancelled: Ban,
  error: AlertCircle,
  warning: AlertTriangle,
  dealOpen: TrendingUp,
  dealClose: CheckCircle,
  takeProfit: TrendingUp,
  stopLoss: ArrowDown,
  statusStarted: Power,
  statusStopped: Power,
  settings: Settings,
  share: Share2,
  restart: RefreshCw,
  delete: Trash2,
  webhook: Webhook,
  manualBuy: ArrowUp,
  merge: Layers,
  reset: RefreshCw,
  info: Info,
};

const formatEventMetadata = (metadata: BotEvent['metadata']): string => {
  if (!metadata) {
    return '{}';
  }

  if (typeof metadata === 'string') {
    try {
      return JSON.stringify(JSON.parse(metadata), null, 2);
    } catch (_error) {
      return metadata;
    }
  }

  return JSON.stringify(metadata, null, 2);
};

const formatDayWithSuffix = (day: number): string => {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
};

// Truncated, click-to-copy id chip with a trailing copy icon (full id copied).
const CopyableId: React.FC<{ id: string; label?: string }> = ({
  id,
  label = 'ID',
}) => {
  const short = id.length > 12 ? `${id.slice(0, 10)}…` : id;
  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const ok = await copyToClipboard(id);
      if (ok) {
        toast.success(`${label} copied`);
      } else {
        toast.error(`Failed to copy ${label}`);
      }
    },
    [id, label]
  );
  return (
    <Badge
      variant="outline"
      onClick={handleCopy}
      title={`Copy ${label.toLowerCase()}: ${id}`}
      className="flex h-4 cursor-pointer items-center gap-1 px-1 py-0 font-mono text-xs hover:bg-muted"
    >
      {short}
      <Copy className="h-2.5 w-2.5 opacity-60" />
    </Badge>
  );
};

// Event message: clamped to 2 lines, click to expand/collapse the full text.
const ExpandableMessage: React.FC<{ text: string }> = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) {
    return null;
  }
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setExpanded((v) => !v);
      }}
      title={expanded ? 'Click to collapse' : 'Click to read full message'}
      className={cn(
        'cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground/80',
        expanded ? 'whitespace-pre-wrap break-words' : 'line-clamp-2'
      )}
    >
      {text}
    </div>
  );
};

// Text colour per taxonomy variant, matching the timeline's label colours.
const VARIANT_TEXT: Record<EventVariant, string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
  info: 'text-primary',
  profit: 'text-profit',
  loss: 'text-loss',
};

const MetadataDialog: React.FC<{ event: BotEvent }> = ({ event }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="ghost" size="sm" className="h-5 px-2 text-xs">
        <Eye className="mr-1 h-3 w-3" />
        View Details
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Event Metadata: {event.event}</DialogTitle>
      </DialogHeader>
      <ScrollArea className="max-h-96">
        <pre className="overflow-x-auto rounded-lg bg-muted p-md text-xs">
          {formatEventMetadata(event.metadata)}
        </pre>
      </ScrollArea>
    </DialogContent>
  </Dialog>
);

export interface DrawerBotEventsProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

// Event interface removed - not needed without real events

export const DrawerBotEvents: React.FC<DrawerBotEventsProps> = ({
  widgetId,
  botId,
  bot: botProp,
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const actualBotId = botId || paramBotId;

  const [searchParams, setSearchParams] = useSearchParams();
  // `?eventsType=errors` deep-links straight to a filtered view (the bot
  // error banner's "Review the bot events" uses it). Read once for the
  // initial state, then consumed by the effect below.
  const linkedType = searchParams.get('eventsType');
  const [filters, setFilters] = useState<BotEventFilters>(() =>
    isBotEventTypeFilter(linkedType)
      ? { ...EMPTY_BOT_EVENT_FILTERS, type: linkedType }
      : EMPTY_BOT_EVENT_FILTERS
  );
  const updateFilters = useCallback(
    (patch: Partial<BotEventFilters>) =>
      setFilters((prev) => ({ ...prev, ...patch })),
    []
  );
  // Apply a deep link that arrives while already mounted, then drop the param
  // so a later reload or tab switch doesn't re-impose it over the user's own
  // filter choices.
  useEffect(() => {
    if (!linkedType) return;
    if (isBotEventTypeFilter(linkedType)) {
      setFilters({ ...EMPTY_BOT_EVENT_FILTERS, type: linkedType });
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('eventsType');
        return next;
      },
      { replace: true }
    );
  }, [linkedType, setSearchParams]);
  // const [selectedEvent, setSelectedEvent] = useState<BotEvent | null>(null);

  // Determine bot type from prop
  const botType = botProp?.type || 'dca';
  // Grid bots have no deals, so "Deals" is not a type they can filter on.
  const isGrid = botType === 'grid';

  // Get bot data
  /* const { bots: dcaBots, isLoading: dcaLoading } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  });

  const { bots: gridBots, isLoading: gridLoading } = useGridBots({
    paperContext: false,
  });

  const { bots: comboBots, isLoading: comboLoading } = useComboBots({
    paperContext: false,
  });

  const { bots: hedgeDcaBots, isLoading: hedgeDcaLoading } = useHedgeDcaBots({
    terminal: false,
    paperContext: false,
  });

  const { bots: hedgeComboBots, isLoading: hedgeComboLoading } =
    useHedgeComboBots({
      terminal: false,
      paperContext: false,
    }); */

  // Use prop bot if available, otherwise find from fetched data
  const bot = botProp; /* ||
    (botType === 'grid'
      ? gridBots.find((b) => b._id === actualBotId)
      : botType === 'combo'
        ? comboBots.find((b) => b._id === actualBotId)
        : botType === 'hedgeDca'
          ? hedgeDcaBots.find((b) => b._id === actualBotId)
          : botType === 'hedgeCombo'
            ? hedgeComboBots.find((b) => b._id === actualBotId)
            : dcaBots.find((b) => b._id === actualBotId)) */

  /* const botsLoading =
    dcaLoading ||
    gridLoading ||
    comboLoading ||
    hedgeDcaLoading ||
    hedgeComboLoading; */

  // Determine bot type from bot data
  const botTypeEnum = useMemo(() => bot?.type, [bot]);

  // Server-side paging: fetch a handful and let "Load more" grow the page
  // size. Reset whenever the filters change.
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Debounce the search box so each keystroke doesn't hit the backend.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [filters.search]);

  // The query follows the debounced search, never the raw keystrokes.
  const { type, symbol, from, to } = filters;
  const queryFilters = useMemo<BotEventFilters>(
    () => ({ type, symbol, from, to, search: debouncedSearch }),
    [type, symbol, from, to, debouncedSearch]
  );
  const { category, filterModel } = useMemo(
    () => buildBotEventsQuery(queryFilters),
    [queryFilters]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [queryFilters]);

  const pairOptions = useMemo(() => pairOptionsFromBot(bot), [bot]);
  const typeOptions = useMemo(
    () =>
      isGrid
        ? BOT_EVENT_TYPE_OPTIONS.filter((o) => o.value !== 'deals')
        : BOT_EVENT_TYPE_OPTIONS,
    [isGrid]
  );
  const isFiltered =
    !!debouncedSearch || countActiveBotEventFilters(queryFilters) > 0;

  // Get bot events from backend — filtered + paginated server-side.
  const {
    events,
    total: backendTotal,
    hasValidResponse,
    isLoading: eventsLoading,
    isError: eventsError,
    refetch,
  } = useBotEvents(actualBotId || '', botTypeEnum, {
    pageSize: visibleCount,
    ...(category ? { category } : {}),
    ...(filterModel ? { filterModel } : {}),
  });

  const handleLoadMore = useCallback(() => {
    setVisibleCount((current) => current + PAGE_SIZE);
  }, []);

  // CSV export of the whole filtered set (not just the loaded page). Events
  // expire after 30 days, so the set is bounded; the cap guards a very chatty
  // bot from one huge response.
  const EXPORT_CAP = 5000;
  const { shareId } = useShareContext();
  const tokens = useAuthStore((st) => st.tokens);
  const isLiveTrading = useUIStore((st) => st.isLiveTrading);
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (!actualBotId) return;
    setIsExporting(true);
    try {
      const { query, variables } = botQueries.getBotEvents({
        botId: actualBotId,
        page: 0,
        pageSize: EXPORT_CAP,
        ...(category ? { category } : {}),
        ...(filterModel ? { filterModel } : {}),
        combo: botTypeEnum === BotTypesEnum.combo,
        hedge:
          botTypeEnum === BotTypesEnum.hedgeCombo ||
          botTypeEnum === BotTypesEnum.hedgeDca,
      });
      const config = getGraphQLConfig(tokens, isLiveTrading);
      const client = new GraphQLClient(
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000',
        config.token,
        config.paperContext
      );
      const res = await client.request<{
        getBotEvents: { status: string; data?: BotEvent[]; total?: number };
      }>(query, variables);
      const rows = res.getBotEvents?.data ?? [];
      if (res.getBotEvents?.status !== 'OK') {
        throw new Error('export failed');
      }
      const blob = new Blob([botEventsToCsv(rows)], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `bot-events-${actualBotId}-${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      if ((res.getBotEvents?.total ?? 0) > rows.length) {
        toast.info(
          `Exported the newest ${rows.length.toLocaleString()} events. Narrow the time range to export the rest.`
        );
      }
    } catch (_error) {
      toast.error('Could not export events. Try again.');
    } finally {
      setIsExporting(false);
    }
  }, [actualBotId, category, filterModel, botTypeEnum, tokens, isLiveTrading]);

  // Format event timestamp
  const formatEventTime = useCallback((created: string) => {
    const date = new Date(created);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }, []);

  const formatEventDateLabel = useCallback((created: string) => {
    const date = new Date(created);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const month = date.toLocaleString('default', { month: 'short' });
    const dayWithSuffix = formatDayWithSuffix(date.getDate());

    // Only surface the year when the event is more than a year old; for
    // current events the year is just noise.
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (date < oneYearAgo) {
      const year = date.getFullYear().toString().slice(-2);
      return `${month} ${dayWithSuffix}, ${year}`;
    }

    return `${month} ${dayWithSuffix}`;
  }, []);

  const formatEventTimeLabel = useCallback((created: string) => {
    const date = new Date(created);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, []);

  // State for refresh animation
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Handle refresh with animation
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      // Add a small delay to show completion animation
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    } catch (_error) {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Reset refreshing state when loading changes
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (!eventsLoading && isRefreshing) {
      // Add a small delay to show completion
      timer = setTimeout(() => {
        setIsRefreshing(false);
      }, 300);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [eventsLoading, isRefreshing]);

  // Convert events to timeline items. All title/label/variant/icon derivation
  // is delegated to the canonical taxonomy (keyed on the backend event name),
  // replacing the previous free-text keyword sniffing.
  const convertToTimelineItems = useCallback(
    (eventList: BotEvent[]): TimelineItem[] => {
      return eventList.map((event) => {
        const classified = classifyBotEvent(event);
        const EventIcon = ICON_BY_KEY[classified.iconKey] ?? Info;
        const label = classified.label;
        const variant = classified.variant;

        const orderId = extractOrderId(event);
        const badgeContent =
          event.symbol || orderId || event.deal ? (
            <div className="flex items-center gap-1">
              {event.symbol && (
                <CoinPair
                  pair={event.symbol}
                  iconSize="sm"
                  layout="horizontal"
                  showText
                />
              )}
              {orderId ? (
                <CopyableId id={orderId} label="Order ID" />
              ) : (
                event.deal && <CopyableId id={event.deal} label="Deal ID" />
              )}
            </div>
          ) : undefined;

        const dateLabel = formatEventDateLabel(event.created);
        const timeLabel = formatEventTimeLabel(event.created);

        const timelineItem: TimelineItem = {
          id: event._id,
          title: classified.title,
          content: event.description ? (
            <ExpandableMessage text={event.description} />
          ) : undefined,
          timestamp: formatEventTime(event.created),
          icon: <EventIcon className="h-full w-full" />,
          variant,
          badge: badgeContent,
          metadata: event.metadata ? (
            <MetadataDialog event={event} />
          ) : undefined,
        };

        if (dateLabel) {
          timelineItem.date = dateLabel;
        }

        if (timeLabel) {
          timelineItem.time = timeLabel;
        }

        if (label) {
          timelineItem.label = label;
        }

        return timelineItem;
      });
    },
    [formatEventTime, formatEventDateLabel, formatEventTimeLabel]
  ); // Render event timeline
  const formatEventDateTime = useCallback((created: string) => {
    const date = new Date(created);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }, []);

  // Render the event list. The widget is resizable, so the layout follows its
  // container width: a timeline under 500px, a table from 500px, with the
  // order/deal column from 800px.
  const renderEvents = useCallback(
    (eventList: BotEvent[]) => {
      if (eventList.length === 0) {
        const EmptyIcon = isFiltered ? Filter : Clock;
        return (
          <div className="text-center py-8 text-muted-foreground">
            <EmptyIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">
              {isFiltered ? 'No events match these filters' : 'No events yet'}
            </p>
            <p className="text-sm">
              {isFiltered
                ? 'Widen the time range or clear a filter.'
                : 'Events will appear here as they occur.'}
            </p>
          </div>
        );
      }

      const timelineItems = convertToTimelineItems(eventList);
      const canLoadMore = eventList.length < backendTotal;

      return (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="relative min-h-0 flex-1">
            <div className="h-full overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              <Timeline
                items={timelineItems}
                className="py-2 @[500px]:hidden"
              />
              <table className="hidden w-full table-fixed border-collapse text-sm @[500px]:table">
                <colgroup>
                  <col className="w-36" />
                  <col className="w-32" />
                  <col className="w-32" />
                  <col className="hidden w-36 @[800px]:table-column" />
                  <col />
                </colgroup>
                <thead className="sticky top-0 z-[1] bg-background">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Time</th>
                    <th className="px-2 py-2 font-medium">Event</th>
                    <th className="px-2 py-2 font-medium">Pair</th>
                    <th className="hidden px-2 py-2 font-medium @[800px]:table-cell">
                      Order / deal
                    </th>
                    <th className="px-2 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {eventList.map((event) => {
                    const classified = classifyBotEvent(event);
                    const EventIcon = ICON_BY_KEY[classified.iconKey] ?? Info;
                    const orderId = extractOrderId(event);
                    return (
                      <tr
                        key={event._id}
                        className="border-b border-border/50 align-top"
                      >
                        <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-muted-foreground">
                          {formatEventDateTime(event.created)}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <EventIcon
                              className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                VARIANT_TEXT[classified.variant]
                              )}
                            />
                            <span className="truncate">{classified.title}</span>
                          </div>
                          {classified.label && (
                            <div
                              className={cn(
                                'text-xs',
                                VARIANT_TEXT[classified.variant]
                              )}
                            >
                              {classified.label}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {event.symbol ? (
                            <CoinPair
                              pair={event.symbol}
                              iconSize="sm"
                              layout="horizontal"
                              showText
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="hidden px-2 py-2 @[800px]:table-cell">
                          <div className="flex flex-col items-start gap-1">
                            {orderId && (
                              <CopyableId id={orderId} label="Order ID" />
                            )}
                            {event.deal && (
                              <CopyableId id={event.deal} label="Deal ID" />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <ExpandableMessage text={event.description} />
                          {event.metadata && <MetadataDialog event={event} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Fade indicator for scrollable content */}
            <div className="absolute bottom-0 left-0 right-0 h-4 bg-linear-to-t from-background to-transparent pointer-events-none" />
          </div>
          {/* Load more pinned at the bottom of the list, always visible */}
          {canLoadMore && (
            <div className="flex shrink-0 justify-center border-t border-border/40 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadMore}
                disabled={eventsLoading}
                className="text-xs"
              >
                {eventsLoading
                  ? 'Loading…'
                  : `Load more (${eventList.length} of ${backendTotal})`}
              </Button>
            </div>
          )}
        </div>
      );
    },
    [
      convertToTimelineItems,
      backendTotal,
      eventsLoading,
      handleLoadMore,
      isFiltered,
      formatEventDateTime,
    ]
  );

  if (/* botsLoading || */ eventsLoading) {
    return (
      <div className="w-full">
        <div className="text-center text-muted-foreground py-8">
          Loading bot events...
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="w-full">
        <div className="text-center text-muted-foreground py-8">
          Bot not found
        </div>
      </div>
    );
  }

  if (eventsError || !hasValidResponse) {
    return (
      <div className="w-full">
        <Alert className="border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load bot events. Please try refreshing.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // DrawerSection (a headerless WidgetWrapper) is what carries the "Enter
  // fullscreen" control; without it this tab had no route into full-screen at
  // all — not the button, not the triple-tap. `bare` keeps the title off the tab
  // body (the tab bar right above already says "Events") while still naming
  // the widget in the full-screen view.
  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-bot-events"
      title="Events"
      bare
    >
      <div className="@container w-full h-full flex flex-col">
        <BotEventsFilterBar
          filters={filters}
          pairOptions={pairOptions}
          typeOptions={typeOptions}
          onChange={updateFilters}
          onRefresh={handleRefresh}
          isRefreshing={eventsLoading || isRefreshing}
          {...(shareId ? {} : { onExport: handleExport, isExporting })}
        />
        <div className="mb-1 text-xs text-muted-foreground">
          {backendTotal.toLocaleString()} event{backendTotal !== 1 ? 's' : ''}
          {isFiltered ? ' match' : ''}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {renderEvents(events)}
        </div>
      </div>
    </DrawerSection>
  );
};

export default DrawerBotEvents;
