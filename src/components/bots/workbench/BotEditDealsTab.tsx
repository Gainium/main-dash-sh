// The bot edit page's Deals tab: the Trading Terminal's deal list scoped to
// the bot, plus the bot drawer's "Open Deal" button.
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useOpenBotDeal } from '@/components/deals/useOpenBotDeal';
import { Button } from '@/components/ui/button';
import OpenOrdersWidget from '@/components/widgets/shared/OpenOrdersWidget';
import { useSharedBot } from '@/hooks/useSharedBot';
import { BotTypesEnum, type DCABot } from '@/types';

interface BotEditDealsTabProps {
  botId: string;
  widgetId: string;
}

export function BotEditDealsTab({ botId, widgetId }: BotEditDealsTabProps) {
  const { bot } = useSharedBot({
    botId,
    type: BotTypesEnum.dca,
    shareId: null,
    enabled: !!botId,
  });
  const dcaBot = (bot ?? undefined) as DCABot | undefined;

  const { openNewDeal, isPending, dialogs } = useOpenBotDeal({
    botId,
    bot: dcaBot,
    isComboBot: false,
    activeDealsCount: dcaBot?.dealsInBot?.active || 0,
  });

  // The button only applies to the open list, as in the bot drawer.
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const disabled = isPending || !dcaBot;

  const toolbarAction = useMemo(
    () =>
      status === 'open' ? (
        <Button
          variant="default"
          size="sm"
          onClick={openNewDeal}
          disabled={disabled}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          Open Deal
        </Button>
      ) : null,
    [status, openNewDeal, disabled]
  );
  const toolbarActionCompact = useMemo(
    () =>
      status === 'open' ? (
        <Button
          variant="default"
          size="icon"
          onClick={openNewDeal}
          disabled={disabled}
          className="h-9 w-9"
          title="Open new deal"
          aria-label="Open new deal"
        >
          <Plus className="w-4 h-4" />
        </Button>
      ) : null,
    [status, openNewDeal, disabled]
  );

  return (
    <div className="h-full overflow-hidden">
      <OpenOrdersWidget
        widgetId={widgetId}
        botId={botId}
        hideBotName
        enableStatusToggle
        onStatusFilterChange={setStatus}
        toolbarAction={toolbarAction}
        toolbarActionCompact={toolbarActionCompact}
      />
      {dialogs}
    </div>
  );
}
