import { RefreshCw } from 'lucide-react';
import React, { useMemo } from 'react';

import {
  buildSurfaceItems,
  type BotActionItem,
  type BotActionSurfaceId,
} from '@/features/bots/actions/botActions';
import type { BotActionsController } from '@/hooks/useBotActions';
import { cn } from '@/lib/utils';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';

export interface BotActionsMenuItemsProps {
  /** The runner for this bot (`useBotActions`). */
  actions: Pick<BotActionsController, 'bot' | 'ctx' | 'run'>;
  /** Which surface contract to render (see `BOT_ACTION_SURFACES`). */
  surface: BotActionSurfaceId;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * Renders a bot's action menu from the registry. It decides nothing itself:
 * which items appear, their order, labels and disabled reasons all come
 * from `buildSurfaceItems`, and clicks go to the `useBotActions` runner.
 */
export const BotActionsMenuItems: React.FC<BotActionsMenuItemsProps> = ({
  actions,
  surface,
  align = 'end',
  className,
}) => {
  const { bot, ctx, run } = actions;
  const items = useMemo(
    () => buildSurfaceItems(surface, bot, ctx),
    [surface, bot, ctx]
  );

  return (
    <DropdownMenuContent
      align={align}
      side="bottom"
      className={className}
      sideOffset={8}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {index > 0 && items[index - 1]?.group !== item.group && (
            <DropdownMenuSeparator />
          )}
          <BotActionMenuItem item={item} onSelect={() => run(item.id)} />
        </React.Fragment>
      ))}
    </DropdownMenuContent>
  );
};

const BotActionMenuItem: React.FC<{
  item: BotActionItem;
  onSelect: () => void;
}> = ({ item, onSelect }) => {
  const Icon = item.pending ? RefreshCw : item.icon;
  const starred = item.id === 'star' && item.checked;
  return (
    <DropdownMenuItem
      onClick={item.disabled ? undefined : onSelect}
      disabled={item.disabled}
      title={item.disabledReason}
      className={cn(
        item.destructive && 'text-destructive focus:text-destructive'
      )}
    >
      <Icon
        className={cn(
          'w-4 h-4 mr-2',
          item.pending && 'animate-spin',
          starred && 'text-yellow-400 fill-yellow-400'
        )}
      />
      {item.label}
    </DropdownMenuItem>
  );
};

export default BotActionsMenuItems;
