import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UnifiedNotification } from '@/stores/notificationsStore';
import { Bell, Bot, CheckCheck, FileText, Megaphone } from 'lucide-react';
import React from 'react';
import { canMarkSingleRead } from './markRead';

interface NotificationItemProps {
  notification: UnifiedNotification;
  onMarkRead?: (notification: UnifiedNotification) => void;
}

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

const getNotificationIcon = (type: string) => {
  // Icons use currentColor for stroke and should inherit text color from the wrapper
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

const getNotificationColor = (type: string) => {
  // Use solid background and white icon color for better contrast
  switch (type) {
    case 'bot':
      return 'text-white bg-chart-3';
    case 'announcement':
      return 'text-white bg-warning';
    case 'changelog':
      return 'text-white bg-success';
    default:
      return 'text-white bg-info';
  }
};

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkRead,
}) => {
  const timeAgo = formatTimeAgo(new Date(notification.time));

  return (
    <div
      className={`relative p-1.5 rounded border transition-all duration-200 hover:shadow-sm hover:bg-muted/20 flex gap-xs border-l-0 ${
        !notification.isRead
          ? 'bg-primary/5 border-primary/20 shadow-sm border-l-2 border-l-primary'
          : 'bg-card border-border opacity-75 hover:opacity-90 border-l-2 border-l-transparent'
      }`}
    >
      {/* Icon section */}
      <div className="shrink-0 mt-0.5">
        <div
          className={`w-5 h-5 rounded flex items-center justify-center ${getNotificationColor(notification.type)}`}
        >
          <div className="h-3.5 w-3.5">
            {getNotificationIcon(notification.type)}
          </div>
        </div>
      </div>

      {/* Content section */}
      <div className="flex-1 min-w-0">
        {/* Header with title and quick actions */}
        <div className="flex items-center justify-between gap-xs mb-1">
          <h3 className="font-medium text-xs leading-tight truncate flex-1">
            {notification.title}
          </h3>

          {/* Quick actions */}
          {canMarkSingleRead(notification) && onMarkRead && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMarkRead(notification)}
              className="h-4 w-4 p-0 hover:bg-success/10 hover:text-success transition-colors shrink-0"
              title="Mark as read"
            >
              <CheckCheck className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>

        {/* Message - strip HTML markup */}
        <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
          {notification.htmlDescription
            ? notification.message
                .replace(/<[^>]*>/g, '')
                .replace(/&[^;]+;/g, ' ')
                .trim()
            : notification.message}
        </p>

        {/* Footer with badges and timestamp */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-xs">
            {/* Removed type/category chip per new design — keeping other footer badges intact */}
            {notification.isRead && (
              <span className="text-success text-xs flex items-center gap-0.5">
                <CheckCheck className="h-2 w-2" />
                Read
              </span>
            )}
          </div>

          <div className="flex items-center gap-xs text-muted-foreground">
            {!notification.isRead && (
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary text-xs px-1 py-0 h-3 border-primary/20"
              >
                New
              </Badge>
            )}
            <span className="text-xs font-medium">{timeAgo}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
