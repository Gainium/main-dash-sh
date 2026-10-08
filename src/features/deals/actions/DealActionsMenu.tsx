// The two renderers of a deal's actions: a dropdown menu (rows and cards) and
// an icon strip (the bot-page deal history). Both take their items from the
// registry for a declared surface; neither can add or drop an action itself.
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import React from 'react';
import {
  getDealActionItems,
  type DealActionItem,
  type DealActionSurfaceId,
} from './dealActionRegistry';
import { useDealActionRunner } from './dealActionsContext';
import type { DealRef } from './dealRef';

export interface DealActionsMenuProps {
  deal: DealRef;
  surface: DealActionSurfaceId;
  /** The surface's own trigger button, rendered as the menu trigger. */
  trigger: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
}

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

export function DealActionsMenu({
  deal,
  surface,
  trigger,
  open,
  onOpenChange,
  contentClassName,
}: DealActionsMenuProps) {
  const { run } = useDealActionRunner();
  const items = getDealActionItems(deal, surface);

  return (
    <DropdownMenu
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {/* Menu clicks must not reach the row or card behind the menu: React
          bubbles them through the portal to their handlers. */}
      <DropdownMenuContent
        align="end"
        className={cn('w-56', contentClassName)}
        onClick={stopPropagation}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {index > 0 && items[index - 1]?.group !== item.group && (
              <DropdownMenuSeparator />
            )}
            <DealActionMenuItem item={item} onSelect={() => run(item.id, [deal])} />
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DealActionMenuItem({
  item,
  onSelect,
}: {
  item: DealActionItem;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  const menuItem = (
    <DropdownMenuItem
      onClick={onSelect}
      disabled={item.disabledReason !== null}
      className={cn(item.destructive && 'text-destructive')}
    >
      <Icon className="w-4 h-4 mr-2" />
      {item.label}
    </DropdownMenuItem>
  );
  if (item.disabledReason === null) {
    return menuItem;
  }
  // A disabled item takes no pointer events; the wrapper carries the reason.
  return (
    <Tooltip tooltip={item.disabledReason} side="left" triggerClassName="block">
      {menuItem}
    </Tooltip>
  );
}

export interface DealActionIconsProps {
  deal: DealRef;
  surface: DealActionSurfaceId;
  className?: string;
}

/**
 * Compact icon buttons for list rows. Only the actions the deal can take now
 * are drawn: a strip of greyed icons on every finished deal says nothing a
 * list row needs to say.
 */
export function DealActionIcons({ deal, surface, className }: DealActionIconsProps) {
  const { run } = useDealActionRunner();
  const items = getDealActionItems(deal, surface).filter(
    (item) => item.disabledReason === null
  );
  if (items.length === 0) return null;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              run(item.id, [deal]);
            }}
            className={cn(
              'p-1.5 hover:bg-muted rounded text-muted-foreground transition-colors',
              item.destructive || item.id === 'cancel'
                ? 'hover:text-destructive'
                : 'hover:text-foreground'
            )}
            title={item.label}
            aria-label={item.label}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );
}
