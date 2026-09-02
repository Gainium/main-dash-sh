import React, { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Card } from './card';

export interface TimelineItem {
  id: string;
  title: string;
  description?: React.ReactNode;
  content?: React.ReactNode;
  timestamp: string;
  date?: string;
  time?: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  badge?: React.ReactNode;
  metadata?: React.ReactNode;
  actions?: React.ReactNode;
  titleAddon?: React.ReactNode;
  isDaySeparator?: boolean;
  /** Extra classes for the item's card — e.g. dimming an already-read row. */
  className?: string;
  variant?:
    | 'default'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'profit'
    | 'loss';
  label?: string;
  onClick?: () => void;
}

export interface TimelineProps {
  items: TimelineItem[];
  className?: string;
  layout?: 'default' | 'right';
}

const variantStyles: Record<
  NonNullable<TimelineItem['variant']>,
  {
    connector: string;
    iconBg: string;
    iconColor: string;
    labelBg: string;
  }
> = {
  default: {
    connector: 'bg-border/60',
    iconBg: 'bg-card',
    iconColor: 'text-muted-foreground',
    labelBg: 'bg-muted text-muted-foreground',
  },
  success: {
    connector: 'bg-success/30',
    iconBg: 'bg-card',
    iconColor: 'text-success',
    labelBg: 'text-success',
  },
  warning: {
    connector: 'bg-warning/30',
    iconBg: 'bg-card',
    iconColor: 'text-warning',
    labelBg: 'text-warning',
  },
  error: {
    connector: 'bg-destructive/30',
    iconBg: 'bg-card',
    iconColor: 'text-destructive',
    labelBg: 'text-destructive',
  },
  info: {
    connector: 'bg-primary/30',
    iconBg: 'bg-card',
    iconColor: 'text-primary',
    labelBg: 'text-primary',
  },
  profit: {
    connector: 'bg-profit/30',
    iconBg: 'bg-card',
    iconColor: 'text-profit',
    labelBg: 'text-profit',
  },
  loss: {
    connector: 'bg-loss/30',
    iconBg: 'bg-card',
    iconColor: 'text-loss',
    labelBg: 'text-loss',
  },
};

export const Timeline: React.FC<TimelineProps> = ({
  items,
  className,
  layout = 'default',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [lineOffset, setLineOffset] = useState<number | null>(null);
  const isRightLayout = layout === 'right';

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const computeOffset = () => {
      if (!containerRef.current) {
        return;
      }

      const iconElements = Array.from(
        containerRef.current.querySelectorAll('[data-timeline-icon="true"]')
      ) as HTMLElement[];

      // Prefer an icon that corresponds to a normal timeline item (larger size),
      // not the day separator icon which can be smaller. We look for the
      // h-9/w-9 tailwind classes which indicate the normal icon size.
      let iconElement: HTMLElement | null = null;
      for (const el of iconElements) {
        const cls = el.className || '';
        if (cls.includes('h-9') || cls.includes('w-9')) {
          iconElement = el;
          break;
        }
      }

      // Fallback to the first icon if nothing matches our preferred size.
      if (!iconElement && iconElements.length > 0) {
        iconElement = iconElements[0];
      }

      if (!iconElement) {
        setLineOffset(null);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const iconRect = iconElement.getBoundingClientRect();
      setLineOffset(iconRect.left - containerRect.left + iconRect.width / 2);
    };

    computeOffset();

    const resizeObserver = new ResizeObserver(() => {
      computeOffset();
    });

    resizeObserver.observe(container);
    window.addEventListener('resize', computeOffset);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', computeOffset);
    };
  }, [items.length, layout]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {lineOffset !== null && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-muted-foreground/30"
          style={{ left: lineOffset }}
        />
      )}

      {items.map((item) => {
        const variant = item.variant ?? 'default';
        const styles = variantStyles[variant];

        // Handle day separator
        if (item.isDaySeparator) {
          return (
            <div
              key={item.id}
              className={cn(
                'relative gap-x-3 gap-y-1 py-1 first:pt-0 last:pb-0',
                isRightLayout
                  ? 'grid grid-cols-[3.5rem_minmax(0,1fr)] items-center'
                  : 'grid grid-cols-[minmax(0,1fr)_max-content_minmax(0,3fr)] items-center sm:grid-cols-[minmax(0,1.25fr)_max-content_minmax(0,3.75fr)]'
              )}
            >
              {!isRightLayout && (
                <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground" />
              )}

              <div
                className={cn(
                  'relative flex items-center justify-center',
                  isRightLayout ? '' : ''
                )}
              >
                <div
                  className={cn(
                    'relative z-10 flex h-3 w-3 items-center justify-center rounded-full bg-card ring-2 ring-border',
                    'text-muted-foreground'
                  )}
                  data-timeline-icon="true"
                />
              </div>

              <div
                className={cn(
                  'text-xs font-medium text-muted-foreground/70 text-left'
                )}
              >
                {item.title}
              </div>
            </div>
          );
        }

        const renderDateContent = (align: 'center' | 'start') => (
          <>
            {(item.date || item.time) && (
              <div
                className={cn(
                  'flex items-center gap-2 text-xs text-muted-foreground/80',
                  align === 'center' ? 'justify-center' : 'justify-start'
                )}
              >
                {item.date && (
                  <span className="font-medium text-foreground/70">
                    {item.date}
                  </span>
                )}
                {item.time && <span className="opacity-80">{item.time}</span>}
              </div>
            )}
            {!item.date && !item.time && item.timestamp && (
              <div className="text-xs font-medium text-muted-foreground">
                {item.timestamp}
              </div>
            )}
            {item.label && (
              <div
                className={cn(
                  'inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide',
                  styles.labelBg,
                  align === 'center' ? 'mx-auto' : 'justify-start'
                )}
              >
                {item.label}
              </div>
            )}
          </>
        );

        return (
          <div
            key={item.id}
            className={cn(
              'relative gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0',
              isRightLayout
                ? 'grid grid-cols-[3.5rem_minmax(0,1fr)] items-center'
                : 'grid grid-cols-[minmax(0,1fr)_max-content_minmax(0,3fr)] items-center sm:grid-cols-[minmax(0,1.25fr)_max-content_minmax(0,3.75fr)]'
            )}
          >
            {!isRightLayout && (
              <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                {renderDateContent('center')}
              </div>
            )}

            <div
              className={cn(
                'relative flex items-center justify-center',
                isRightLayout ? '' : ''
              )}
            >
              <div
                className={cn(
                  'relative z-10 flex h-9 w-9 items-center justify-center rounded-full',
                  styles.iconBg,
                  item.iconClassName
                )}
                data-timeline-icon="true"
              >
                {item.icon ? (
                  <div className={cn('h-5 w-5', styles.iconColor)}>
                    {item.icon}
                  </div>
                ) : (
                  <div
                    className={cn(
                      'h-3 w-3 rounded-full bg-current',
                      styles.iconColor
                    )}
                  />
                )}
              </div>
            </div>

            <Card
              compact
              className={cn(
                'min-w-0 space-y-1 border border-border/40 bg-card/90 px-4 py-2 text-sm [box-shadow:none] hover:bg-card relative min-h-0',
                isRightLayout && 'space-y-2',
                item.onClick &&
                  'cursor-pointer transition-colors hover:border-primary/40',
                item.className
              )}
              onClick={item.onClick}
              role={item.onClick ? 'button' : undefined}
              tabIndex={item.onClick ? 0 : undefined}
              onKeyDown={(event) => {
                if (!item.onClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  item.onClick();
                }
              }}
            >
              {/* Mark as read button - top right */}
              {/* Inline actions moved to the same row as the title so they align correctly */}
              <div className="flex items-center justify-between gap-2 pr-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-semibold">
                      {item.title}
                    </h4>
                    {item.titleAddon && (
                      <div className="shrink-0">{item.titleAddon}</div>
                    )}
                    {item.badge && <div className="shrink-0">{item.badge}</div>}
                  </div>
                </div>
                {item.actions && <div className="shrink-0">{item.actions}</div>}
              </div>

              {/* For right layout we keep the date/time only in the bottom-right time area of the card */}
              <div className="flex items-start justify-between gap-2 pr-4">
                <div className="min-w-0 flex-1">
                  {item.description && !item.content && (
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  )}
                  {item.content && <div>{item.content}</div>}
                </div>
              </div>
              {item.metadata && (
                <div className="flex flex-wrap items-center gap-2">
                  {item.metadata}
                </div>
              )}

              {/* Time in bottom right — only for the right layout, which has
                  no left rail. In the default layout the time already shows on
                  the rail next to the date, so rendering it here too would
                  duplicate it. */}
              {isRightLayout && item.time && (
                <div className="text-xs text-muted-foreground/70 text-right">
                  {item.time}
                </div>
              )}
            </Card>
          </div>
        );
      })}
    </div>
  );
};

export default Timeline;
