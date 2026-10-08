import React, { useMemo } from 'react';

import {
  buildSurfaceItems,
  type BotActionContext,
  type BotActionId,
  type BotKind,
  type BotRef,
} from '@/features/bots/actions/botActions';
import { toBotRef } from '@/features/bots/actions/botRef';
import { BotNameBadges } from '@/lib/extensions/botListExtensions';
import { isReadOnly } from '@/lib/demoMode';
import { cn } from '@/lib/utils';
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import { buildBotViewRoute } from '@/utils/bots/navigation';
import type { BotTypesEnum } from '@/types';

export interface BotNameCellProps {
  name: string;
  id: string;
  kind: BotKind;
  /** Render the host's name badges (extension slot). @default true */
  showBadges?: boolean;
}

/**
 * The bot-name cell of the bot tables: the name, host badges, and the
 * registry's `nameCell` actions (open in new tab, star) as icon buttons.
 */
export const BotNameCell: React.FC<BotNameCellProps> = ({
  name,
  id,
  kind,
  showBadges = true,
}) => {
  const toggleStarred = useStarredBotsStore((s) => s.toggleStarred);
  const starred = useStarredBotsStore((s) => s.starredBotIds.has(id));
  const readOnly = isReadOnly();

  const bot = useMemo<BotRef>(
    () => toBotRef({ _id: id, name }, kind),
    [id, name, kind]
  );
  const items = useMemo(() => {
    const ctx: BotActionContext = {
      readOnly,
      viewOnly: false,
      starred,
      pending: {},
    };
    return buildSurfaceItems('nameCell', bot, ctx);
  }, [bot, readOnly, starred]);

  const run = (actionId: BotActionId) => {
    if (actionId === 'openNewTab') {
      window.open(buildBotViewRoute(kind, id), '_blank');
    } else if (actionId === 'star') {
      toggleStarred(id);
    }
  };

  return (
    <div className="flex items-center gap-xs">
      <div className="truncate">{name}</div>
      {showBadges && (
        <BotNameBadges botId={id} botType={kind as BotTypesEnum} />
      )}
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!item.disabled) run(item.id);
            }}
            disabled={item.disabled}
            className="p-1 rounded hover:bg-muted/30"
            title={item.disabledReason ?? item.label}
          >
            <Icon
              className={cn(
                'w-4 h-4',
                item.id === 'star' && item.checked
                  ? 'text-yellow-400 fill-yellow-400'
                  : 'text-muted-foreground'
              )}
            />
          </button>
        );
      })}
    </div>
  );
};

export default BotNameCell;
