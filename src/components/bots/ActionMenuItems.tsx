import { RefreshCw } from 'lucide-react';
import React, { type ComponentType } from 'react';

import { cn } from '@/lib/utils';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';

/** One entry of a row's ⋯ menu. `BotActionItem` satisfies it. */
export interface ActionMenuItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Items of different consecutive groups get a separator between them. */
  group?: string;
  destructive?: boolean;
  pending?: boolean;
  disabled?: boolean;
  /** Shown as the item's title when it is disabled. */
  disabledReason?: string | undefined;
  checked?: boolean;
}

export interface ActionMenuItemsProps {
  items: ActionMenuItem[];
  onSelect: (id: string) => void;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * The ⋯ menu content of the bot tables, for any list of actions: grouped
 * items with icons, destructive items in red, a spinner while pending.
 */
export const ActionMenuItems: React.FC<ActionMenuItemsProps> = ({
  items,
  onSelect,
  align = 'end',
  className,
}) => (
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
        <ActionMenuEntry item={item} onSelect={() => onSelect(item.id)} />
      </React.Fragment>
    ))}
  </DropdownMenuContent>
);

const ActionMenuEntry: React.FC<{
  item: ActionMenuItem;
  onSelect: () => void;
}> = ({ item, onSelect }) => {
  const Icon = item.pending ? RefreshCw : item.icon;
  const starred = item.id === 'star' && item.checked;
  return (
    <DropdownMenuItem
      onClick={item.disabled ? undefined : onSelect}
      disabled={!!item.disabled}
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

export default ActionMenuItems;
