import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOptionalGridPageContext } from '@/contexts/bots/grid/GridPageProvider';
import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  categorizeEvent,
  getEventSeverity,
  useBotEvents,
  type BotEvent,
} from '../../../hooks/useBotEvents';
import { classifyBotEvent } from '../../../lib/botEventTaxonomy';
import { useDcaBots } from '../../../hooks/useDcaBots';
import { useGridBots } from '../../../hooks/useGridBots';
import { BotTypesEnum } from '../../../types';
import { WidgetWrapper, type WidgetMenuActions } from '../WidgetWrapper';
import { getBotWidgetMetadata } from './index';

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
  Search,
} from 'lucide-react';

export interface EditBotEventsProps {
  widgetId: string;
  botId?: string;
  botType?: BotTypesEnum;
  isEditable?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
}

type BaseBot = {
  _id: string;
  settings?: {
    type?: string;
    strategy?: string;
  };
};

const EditBotEvents: React.FC<EditBotEventsProps> = ({
  widgetId,
  botId,
  botType: providedBotType,
  isEditable = false,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  const { id: paramBotId } = useParams<{ id: string }>();
  const actualBotId = botId || paramBotId;

  const [selectedTab, setSelectedTab] = useState<'recent' | 'deals' | 'alerts'>(
    'recent'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Get bot data
  const { bots: dcaBots, isLoading: dcaBotsLoading } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  });
  const { bots: gridBots, isLoading: gridBotsLoading } = useGridBots();

  const combinedBots = useMemo<BaseBot[]>(
    () => [...(dcaBots ?? []), ...(gridBots ?? [])] as BaseBot[],
    [dcaBots, gridBots]
  );

  const gridPageContext = useOptionalGridPageContext();
  const gridState = gridPageContext?.state;

  const actualId = botId ?? gridState?.botId ?? actualBotId;

  const bot = useMemo<BaseBot | undefined>(() => {
    const contextBot = gridState?.bot as BaseBot | undefined;
    if (contextBot && actualId && contextBot._id === actualId) {
      return contextBot;
    }

    if (!actualId) {
      return undefined;
    }

    return combinedBots.find((candidate) => candidate._id === actualId);
  }, [gridState?.bot, combinedBots, actualId]);

  const resolvedBotType = useMemo(() => {
    if (providedBotType) {
      return providedBotType;
    }

    if (gridState?.botType) {
      return gridState.botType;
    }

    if (!bot) return BotTypesEnum.dca;

    const settingsType = bot.settings?.type?.toLowerCase();
    const settingsStrategy = bot.settings?.strategy?.toLowerCase();

    if (settingsType === 'combo' || settingsStrategy === 'combo')
      return BotTypesEnum.combo;
    if (settingsType === 'grid' || settingsStrategy === 'grid')
      return BotTypesEnum.grid;
    if (settingsType === 'hedgecombo' || settingsStrategy === 'hedgecombo')
      return BotTypesEnum.hedgeCombo;
    if (settingsType === 'hedgedca' || settingsStrategy === 'hedgedca')
      return BotTypesEnum.hedgeDca;

    return BotTypesEnum.dca;
  }, [providedBotType, gridState?.botType, bot]);

  const isGridBot = resolvedBotType === BotTypesEnum.grid;

  const contextBotsLoading =
    isGridBot &&
    gridState?.botId === actualId &&
    (gridState?.status === 'loading' || gridState?.status === 'idle');

  const botsLoading = contextBotsLoading || dcaBotsLoading || gridBotsLoading;

  const {
    events: queryEvents,
    hasValidResponse: queryHasValidResponse,
    isLoading: queryEventsLoading,
    isError: queryEventsIsError,
    error: queryEventsError,
  } = useBotEvents(actualId || '', resolvedBotType, {
    pageSize: 50,
  });

  const contextEvents = gridState?.events;

  const events = isGridBot && contextEvents ? contextEvents.items : queryEvents;
  const hasValidResponse =
    isGridBot && contextEvents
      ? contextEvents.items !== undefined && contextEvents.items !== null
      : queryHasValidResponse;
  const eventsLoading =
    isGridBot && contextEvents ? contextEvents.isLoading : queryEventsLoading;
  const eventsError =
    isGridBot && contextEvents
      ? Boolean(contextEvents.error)
      : queryEventsIsError;
  const eventsErrorMessage =
    (isGridBot && contextEvents?.error) || queryEventsError?.message || null;

  // Determine bot type from bot data
  // Filter events based on selected tab and search query
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Filter by tab
    if (selectedTab !== 'recent') {
      filtered = filtered.filter(
        (event: BotEvent) => categorizeEvent(event) === selectedTab
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (event: BotEvent) =>
          event.description.toLowerCase().includes(query) ||
          event.event.toLowerCase().includes(query) ||
          (event.symbol && event.symbol.toLowerCase().includes(query)) ||
          (event.deal && event.deal.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [events, selectedTab, searchQuery]);

  // Get event counts for tabs
  const eventCounts = useMemo(() => {
    const counts = { recent: 0, deals: 0, alerts: 0 };
    events.forEach((event: BotEvent) => {
      counts.recent++;
      const category = categorizeEvent(event);
      if (category in counts) {
        counts[category as keyof typeof counts]++;
      }
    });
    return counts;
  }, [events]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getEventIcon = (event: BotEvent) => {
    const severity = getEventSeverity(event);
    switch (severity) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const wrapperProps = {
    metadata: {
      ...getBotWidgetMetadata('edit-bot-events'),
      id: widgetId,
    },
    isEditable,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && { menuActions }),
  };

  if (botsLoading) {
    return (
      <WidgetWrapper {...wrapperProps}>
        <div className="flex items-center justify-center h-48">
          <div className="text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Loading bot data...</p>
          </div>
        </div>
      </WidgetWrapper>
    );
  }

  if (!bot) {
    return (
      <WidgetWrapper {...wrapperProps}>
        <div className="flex items-center justify-center h-48">
          <div className="text-center text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Bot not found</p>
          </div>
        </div>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="pt-6">
        {/* Search and Filter Controls */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-xs"></div>
          <div className="flex items-center gap-xs">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(e.target.value)
                }
                className="pl-8 w-48 h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={selectedTab}
          onValueChange={(value: string) =>
            setSelectedTab(value as 'recent' | 'deals' | 'alerts')
          }
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="recent" className="flex items-center space-x-1">
              <span>Recent</span>
              <Badge variant="secondary" className="ml-1">
                {eventCounts.recent}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="deals" className="flex items-center space-x-1">
              <span>Deals</span>
              <Badge variant="secondary" className="ml-1">
                {eventCounts.deals}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="alerts" className="flex items-center space-x-1">
              <span>Alerts</span>
              <Badge variant="secondary" className="ml-1">
                {eventCounts.alerts}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-4">
            <ScrollArea className="h-96">
              {eventsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Loading events...</p>
                  </div>
                </div>
              ) : eventsError || !hasValidResponse ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50 text-red-500" />
                    <p className="text-red-600 font-medium">
                      {eventsError
                        ? 'Error loading events'
                        : 'No events available'}
                    </p>
                    {eventsError && eventsErrorMessage && (
                      <p className="text-xs mt-1 text-red-500/80">
                        {eventsErrorMessage}
                      </p>
                    )}
                  </div>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-sm text-muted-foreground">
                    {searchQuery
                      ? 'No events match your search'
                      : 'No events in this category'}
                  </div>
                </div>
              ) : (
                <div className="space-y-xs">
                  {filteredEvents.map((event: BotEvent, index: number) => (
                    <div
                      key={`${event._id}-${index}`}
                      className="flex items-start space-x-sm p-sm rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="shrink-0 mt-0.5">
                        {getEventIcon(event)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-xs">
                            <Badge variant="outline" className="text-xs">
                              {classifyBotEvent(event).title}
                            </Badge>
                            {event.symbol && (
                              <Badge variant="secondary" className="text-xs">
                                {event.symbol}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(event.created)}</span>
                          </div>
                        </div>
                        <p className="text-sm mt-1">{event.description}</p>
                        {event.deal && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Deal: {event.deal}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </WidgetWrapper>
  );
};

export default EditBotEvents;
