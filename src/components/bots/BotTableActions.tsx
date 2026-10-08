import { MoreHorizontal } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';

import type { BotKind } from '@/features/bots/actions/botActions';
import { toBotRef } from '@/features/bots/actions/botRef';
import { useBotActions } from '@/hooks/useBotActions';
import { Button } from '../ui/button';
import { DropdownMenu, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { BotActionsMenuItems } from './BotActionsMenuItems';
import { BotActionsModals } from './BotActionsModals';

export interface BotTableActionsProps {
  /**
   * The row's bot — raw or list-transformed DCA / combo / grid bot, or a
   * hedge wrapper. Normalised with `toBotRef`.
   */
  source: unknown;
  kind: BotKind;
  surface?: 'tableRow' | 'hedgeRow';
}

/**
 * The ⋯ actions cell of every bot table (DCA, combo, grid and hedge lists).
 * Clicks inside never reach the row's own click handler (which opens the
 * drawer).
 */
export const BotTableActions: React.FC<BotTableActionsProps> = ({
  source,
  kind,
  surface = 'tableRow',
}) => {
  const bot = useMemo(() => toBotRef(source, kind), [source, kind]);
  const actions = useBotActions(bot);
  const stopPropagation = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    []
  );

  return (
    <div onClick={stopPropagation} className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-0"
            onClick={stopPropagation}
            aria-label="Open bot actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <BotActionsMenuItems
          align="end"
          className="w-56"
          actions={actions}
          surface={surface}
        />
      </DropdownMenu>

      <BotActionsModals {...actions.modalProps} />
    </div>
  );
};

export default BotTableActions;
