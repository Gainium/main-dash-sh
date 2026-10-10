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
          <RowActionsTriggerButton
            onClick={stopPropagation}
            aria-label="Open bot actions"
          />
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

/** The ⋯ trigger of a table row's actions menu. */
export const RowActionsTriggerButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => (
  <Button ref={ref} variant="ghost" size="sm" className="p-0" {...props}>
    <MoreHorizontal className="w-4 h-4" />
  </Button>
));
RowActionsTriggerButton.displayName = 'RowActionsTriggerButton';

export default BotTableActions;
