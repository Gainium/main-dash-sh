import { Button } from '@/components/ui/button';
import type { UnifiedNotification } from '@/stores/notificationsStore';
import { Bell, Bot, CheckCheck, FileText, Megaphone } from 'lucide-react';
import React from 'react';
import { canMarkSingleRead } from './markRead';
import { NotificationRichContent } from './NotificationRichContent';

export interface MessageBoxProps {
  notification: UnifiedNotification;
  onMarkRead?: (n: UnifiedNotification) => void;
  onClick?: (n: UnifiedNotification) => void;
  /** Number of lines to clamp before showing Read more */
  clampLines?: number;
  /** If true, disable truncation entirely */
  disableClamp?: boolean;
}

const iconFor = (type: string) => {
  switch (type) {
    case 'bot':
      return <Bot className="h-3.5 w-3.5" />;
    case 'announcement':
      return <Megaphone className="h-3.5 w-3.5" />;
    case 'changelog':
      return <FileText className="h-3.5 w-3.5" />;
    default:
      return <Bell className="h-3.5 w-3.5" />;
  }
};

const getNotificationBg = (type: string) => {
  switch (type) {
    case 'bot':
      return 'bg-chart-3 text-white';
    case 'announcement':
      return 'bg-warning text-white';
    case 'changelog':
      return 'bg-success text-white';
    default:
      return 'bg-primary text-white';
  }
};

const formatTimeAgo = (date: Date): string => {
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
};

export const MessageBox: React.FC<MessageBoxProps> = ({
  notification,
  onMarkRead,
  onClick,
  clampLines = 2,
  disableClamp = false,
}) => {
  const timeAgo = formatTimeAgo(new Date(notification.time));

  const containerClasses = `relative transition-all duration-200 hover:bg-muted/30 flex gap-sm cursor-pointer group w-full p-md border-b border-border/50 ${
    !notification.isRead
      ? 'bg-orange-500/5 border-l-4 border-l-orange-500'
      : 'bg-background border-l-4 border-l-transparent hover:border-l-border/50'
  }`;

  return (
    <div className={containerClasses} onClick={() => onClick?.(notification)}>
      {/* Icon */}
      <div className="shrink-0 mt-1">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center ${getNotificationBg(notification.type)}`}
        >
          {iconFor(notification.type)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-xs mb-1">
          <h3 className="font-medium text-sm leading-tight flex-1">
            {notification.title}
          </h3>
          <div className="flex items-center gap-xs shrink-0">
            <span className="text-xs text-muted-foreground font-medium">
              {timeAgo}
            </span>
            {canMarkSingleRead(notification) && onMarkRead && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead(notification);
                }}
                className="h-6 w-6 p-0 hover:bg-success/10 hover:text-success transition-colors"
                title="Mark as read"
              >
                <CheckCheck className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        <NotificationRichContent
          notification={notification}
          clampLines={clampLines}
          disableClamp={disableClamp}
        />
      </div>
    </div>
  );
};

export default MessageBox;
