import React, { useMemo } from 'react';

import {
  buildSurfaceItems,
  type BotActionItem,
  type BotActionSurfaceId,
} from '@/features/bots/actions/botActions';
import type { BotActionsController } from '@/hooks/useBotActions';
import { ActionMenuItems } from './ActionMenuItems';

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
    <ActionMenuItems
      items={items}
      onSelect={(id) => run(id as BotActionItem['id'])}
      align={align}
      {...(className ? { className } : {})}
    />
  );
};

export default BotActionsMenuItems;
