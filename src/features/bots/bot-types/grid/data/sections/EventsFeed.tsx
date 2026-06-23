import { AlertCircle, AlertTriangle, Bell, CheckCircle2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getEventSeverity, type BotEvent } from '@/hooks/useBotEvents';
import { classifyBotEvent } from '@/lib/botEventTaxonomy';
import type { GridEventsState } from '@/types/bots/grid';

interface EventsFeedProps {
  events: GridEventsState;
  formatDateTime: (value: number | string | Date) => string;
}

const SEVERITY_STYLES: Record<
  ReturnType<typeof getEventSeverity>,
  {
    badge: ComponentProps<typeof Badge>['variant'];
    icon: ReactNode;
    tone: string;
    descriptionTone: string;
  }
> = {
  error: {
    badge: 'destructive',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    tone: 'text-destructive',
    descriptionTone: 'text-destructive/90',
  },
  warning: {
    badge: 'secondary',
    icon: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
    tone: 'text-warning',
    descriptionTone: 'text-warning/90',
  },
  info: {
    badge: 'outline',
    icon: <Bell className="h-3.5 w-3.5 text-info" />,
    tone: 'text-muted-foreground',
    descriptionTone: 'text-muted-foreground',
  },
  success: {
    badge: 'default',
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
    tone: 'text-success',
    descriptionTone: 'text-success/90',
  },
};

const renderEvent = (
  event: BotEvent,
  formatDateTime: EventsFeedProps['formatDateTime']
) => {
  const severity = getEventSeverity(event);
  const styles = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info;

  return (
    <div
      key={event._id}
      className="flex flex-col gap-xs rounded-lg border border-border/50 bg-background/50 px-4 py-3"
    >
      <div className="flex items-center justify-between gap-xs">
        <div
          className={`flex items-center gap-xs text-xs font-semibold uppercase tracking-wide ${styles.tone}`}
        >
          {styles.icon}
          <span>{classifyBotEvent(event).title}</span>
        </div>
        <Badge variant={styles.badge} className="capitalize">
          {severity}
        </Badge>
      </div>
      <p className={`text-sm leading-relaxed ${styles.descriptionTone}`}>
        {event.description}
      </p>
      <div className="text-xs text-muted-foreground">
        {formatDateTime(event.created)}
      </div>
    </div>
  );
};

export const EventsFeed: React.FC<EventsFeedProps> = ({
  events,
  formatDateTime,
}) => {
  const hasEvents = events.items.length > 0;

  return (
    <Card className="space-y-md border-border/60 bg-card/70 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bot Events
        </h3>
        {events.total > 0 && (
          <Badge variant="outline" className="text-xs">
            {events.total} total
          </Badge>
        )}
      </div>

      {events.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {events.error}
        </div>
      )}

      <div className="rounded-lg border border-border/60 bg-background/50">
        {hasEvents ? (
          <ScrollArea className="max-h-[360px]">
            <div className="space-y-sm p-sm">
              {events.items.map((event) => renderEvent(event, formatDateTime))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center gap-xs px-6 py-10 text-center text-sm text-muted-foreground">
            No events yet.
          </div>
        )}
      </div>
    </Card>
  );
};

export default EventsFeed;
