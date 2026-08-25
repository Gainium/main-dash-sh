/**
 * Per-row actions cell for the hedge bot tables.
 *
 * Mirrors the action menu the regular trading-bots table renders via
 * BotActionsMenuItems. All the lifecycle wiring now comes from the shared
 * `useBotActions` hook:
 *  - Start/Stop goes through `useBotStatusToggle` with the hedge wrapper id +
 *    `hedgeDca`/`hedgeCombo` type (the hook optimistically updates the hedge
 *    stores, so the wrapper badge flips immediately).
 *  - Clone navigates to `/hedge/{bot|combo}/new?load=<id>` via the canonical
 *    clone route — the new-page form seeds both legs from the source bot.
 *  - Delete/Restart delegate to the shared mutation hooks; Archive is owned by
 *    BotActionsMenuItems.
 *
 * The wrapping div stops propagation so clicking a menu item doesn't also open
 * the row's drawer (the `<DataTable onRowClick>` would otherwise fire).
 */
import { MoreVertical } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { BotActionsMenuItems } from '@/components/bots/BotActionsMenuItems';
import { BotActionsModals } from '@/components/bots/BotActionsModals';
import { useBotActions } from '@/hooks/useBotActions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import {
  BotTypesEnum,
  StrategyEnum,
  type ComboBot,
  type DCABot,
  type HedgeBot,
} from '@/types';

const findLeg = (
  bots: (DCABot | ComboBot)[] | undefined,
  strategy: StrategyEnum
): DCABot | ComboBot | undefined =>
  bots?.find((b) => b.settings?.strategy === strategy);

export interface HedgeBotActionsCellProps {
  bot: HedgeBot;
  botType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
}

export const HedgeBotActionsCell: React.FC<HedgeBotActionsCellProps> = ({
  bot,
  botType,
}) => {
  const navigate = useNavigate();

  const basePath =
    botType === BotTypesEnum.hedgeCombo ? '/hedge/combo' : '/hedge/bot';

  const longLeg = findLeg(bot.bots, StrategyEnum.long);
  const shortLeg = findLeg(bot.bots, StrategyEnum.short);
  const name =
    longLeg?.settings?.name || shortLeg?.settings?.name || 'Hedge bot';
  const totalActiveDeals =
    (longLeg?.dealsInBot?.active ?? 0) + (shortLeg?.dealsInBot?.active ?? 0);

  const botActions = useBotActions({
    botId: bot._id,
    botType,
    botName: name,
    status: bot.status,
    activeDeals: totalActiveDeals,
    currency: bot.symbol?.[0]?.value?.quoteAsset ?? '',
    lastActivity: bot?.created || 'Unknown',
    botData: bot,
    deleteTitle: 'Delete hedge bot',
    deleteDescription:
      'Are you sure you want to delete this hedge bot? Both legs will be removed. This action cannot be undone.',
    // Hedge bots don't support paper↔live copy yet — toast and clone on the
    // current trading context (the canonical clone route handles hedge).
    onCopyToLive: () => {
      toast.info(
        "Live↔paper copy isn't available for hedge bots yet. Cloned on the current trading context instead."
      );
      navigate(`${basePath}/new?load=${bot._id}`);
    },
  });

  return (
    <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open hedge bot actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <BotActionsMenuItems
          align="end"
          className="w-56"
          bot={{
            id: bot._id,
            name,
            type: botType,
            status: bot.status,
          }}
          {...botActions.menuProps}
        />
      </DropdownMenu>

      {/* Shared status / delete / success modals, driven by useBotActions. */}
      <BotActionsModals {...botActions.modalProps} />
    </div>
  );
};

export default HedgeBotActionsCell;
