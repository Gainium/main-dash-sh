// The deal drawer's action bar: the actions that place orders as buttons, the
// rest in a "More" menu. Items, gating and reasons all come from the registry
// (surface `dealDrawer`), like every other deal action surface.
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MoreHorizontal } from 'lucide-react';
import React from 'react';
import {
  getDealActionItems,
  type DealActionId,
  type DealActionItem,
} from './dealActionRegistry';
import { useDealActionRunner } from './dealActionsContext';
import type { DealRef } from './dealRef';

/** Shown as buttons, in this order; everything else goes under "More". */
const PRIMARY: readonly DealActionId[] = [
  'addFunds',
  'reduceFunds',
  'executeNextDca',
  'close',
];

/** Shorter labels for the bar, where four buttons share one row. */
const SHORT_LABEL: Partial<Record<DealActionId, string>> = {
  reduceFunds: 'Reduce',
  executeNextDca: 'Next DCA',
  close: 'Close',
};

export interface DealActionBarProps {
  deal: DealRef;
  /** The action whose panel is open, drawn as selected. */
  activeId?: DealActionId | undefined;
  className?: string;
}

export function DealActionBar({ deal, activeId, className }: DealActionBarProps) {
  const { run } = useDealActionRunner();
  const items = getDealActionItems(deal, 'dealDrawer');
  // A deal that can take no action (a closed one) gets no bar at all.
  if (!items.some((item) => item.disabledReason === null)) return null;

  const primary = PRIMARY.flatMap((id) => items.filter((item) => item.id === id));
  const more = items.filter((item) => !PRIMARY.includes(item.id));

  const toggle = (item: DealActionItem) => {
    // A second click on the open action is a no-op: its panel has its own close.
    if (item.id !== activeId) run(item.id, [deal]);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-xs', className)}>
      {primary.map((item) => {
        const Icon = item.icon;
        const button = (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant="outline"
            disabled={item.disabledReason !== null}
            aria-pressed={item.id === activeId}
            onClick={() => toggle(item)}
            className={cn(
              'gap-1.5',
              item.id === activeId && 'border-primary bg-primary/10 text-primary',
              item.destructive &&
                item.id !== activeId &&
                'text-destructive hover:text-destructive'
            )}
          >
            <Icon className="h-4 w-4" />
            {SHORT_LABEL[item.id] ?? item.label}
          </Button>
        );
        return item.disabledReason === null ? (
          button
        ) : (
          <Tooltip key={item.id} tooltip={item.disabledReason}>
            {button}
          </Tooltip>
        );
      })}
      {more.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="More deal actions"
              className={cn(
                more.some((item) => item.id === activeId) &&
                  'border-primary bg-primary/10 text-primary'
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {more.map((item, index) => {
              const Icon = item.icon;
              const entry = (
                <DropdownMenuItem
                  onClick={() => toggle(item)}
                  disabled={item.disabledReason !== null}
                  className={cn(item.destructive && 'text-destructive')}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {item.label}
                </DropdownMenuItem>
              );
              return (
                <React.Fragment key={item.id}>
                  {index > 0 && more[index - 1]?.group !== item.group && (
                    <DropdownMenuSeparator />
                  )}
                  {item.disabledReason === null ? (
                    entry
                  ) : (
                    <Tooltip
                      tooltip={item.disabledReason}
                      side="left"
                      triggerClassName="block"
                    >
                      {entry}
                    </Tooltip>
                  )}
                </React.Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
