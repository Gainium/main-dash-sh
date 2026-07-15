import React, { useMemo } from 'react';
import { useLiveUpdate } from '../../../contexts/LiveUpdateContext';
import { useMessageStore } from '@/stores/live';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

interface MessageWidgetProps {
  widgetId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  data?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  title?: string;
  maxHeight?: number;
}

const MessageWidget: React.FC<MessageWidgetProps> = ({
  title = 'Messages',
  maxHeight = 400,
}) => {
  const { messageActions } = useLiveUpdate();

  // Subscribe to the raw messages slice so store writes re-render this widget;
  // the memoized LiveUpdateContext no longer re-renders on writes, so the
  // render-time getActiveMessages/getUnreadCount getters would stay frozen.
  const messages = useMessageStore((s) => s.messages);
  const activeMessages = useMemo(
    () => messages.filter((msg) => !msg.dismissed),
    [messages]
  );
  const unreadCount = activeMessages.length;

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'info':
      default:
        return <Info className="h-4 w-4 text-info" />;
    }
  };

  const getMessageColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'border-destructive/20 bg-destructive/5';
      case 'warning':
        return 'border-warning/20 bg-warning/5';
      case 'success':
        return 'border-success/20 bg-success/5';
      case 'info':
      default:
        return 'border-info/20 bg-info/5';
    }
  };

  const handleDismissMessage = (messageId: string) => {
    messageActions.dismissMessage(messageId);
  };

  const sortedMessages = useMemo(() => {
    return [...activeMessages].sort((a, b) => b.timestamp - a.timestamp);
  }, [activeMessages]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>{title}</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unreadCount} new
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ height: maxHeight }}>
          <div className="space-y-xs p-md">
            {sortedMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No messages</p>
              </div>
            ) : (
              sortedMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'relative p-sm rounded-lg border transition-colors',
                    getMessageColor(message.type)
                  )}
                >
                  <div className="flex items-start gap-sm">
                    <div className="shrink-0 mt-0.5">
                      {getMessageIcon(message.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {message.title && (
                        <h4 className="text-sm font-medium text-foreground mb-1">
                          {message.title}
                        </h4>
                      )}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {message.message}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(message.timestamp)}
                        </span>
                        {message.botId && (
                          <Badge variant="outline" className="text-xs">
                            Bot {message.botId}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDismissMessage(message.id)}
                      className="shrink-0 p-1 rounded-full hover:bg-muted transition-colors"
                      aria-label="Dismiss message"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default MessageWidget;
