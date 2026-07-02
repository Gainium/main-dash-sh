import { usePaperContext } from '@/hooks/usePaperContext';
import { isReadOnly } from '@/lib/demoMode';
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import {
  canToggleBotStatus,
  getActionPresent,
  getActionText,
  getArchiveBlockedReason,
  getDeleteBlockedReason,
  isBotActive,
  isBotArchivable,
  isBotDeletable,
  isBotRestartable,
} from '@/utils/botStatusUtils';
import {
  Archive,
  Copy,
  Edit,
  /* History, */
  Pause,
  Play,
  RefreshCw,
  Share,
  Star,
  Trash2,
} from 'lucide-react';
import React from 'react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';

export type BotStatusType = 'active' | 'paused' | 'stopped' | 'error' | string;
export type BotTypeId = 'dca' | 'grid' | 'combo' | 'signal' | string;

export interface BotMenuContext {
  id: string;
  name: string;
  type: BotTypeId;
  status: BotStatusType;
}

export interface BotActionsMenuItemsProps {
  bot: BotMenuContext;
  // Loading flags for spinners/disabled
  pending?: {
    statusToggle?: boolean;
    restart?: boolean;
    clone?: boolean;
    delete?: boolean;
    archive?: boolean;
  };
  // Action handlers (parent can open modals or call mutations)
  onToggleStatus?: () => void;
  onRestart?: () => void;
  onEdit?: () => void;
  onClone?: () => void;
  onViewClosedTrades?: () => void;
  onShareConfig?: () => void;
  onCopyToLive?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  // Control where this content attaches; default aligns to end
  align?: 'start' | 'center' | 'end';
  className?: string;
  /**
   * Read-only mode — true for share-link visitors and for users
   * viewing a bot they don't own. Disables every mutating action;
   * non-mutating actions like view-backtests stay enabled.
   */
  viewOnly?: boolean;
}

export const BotActionsMenuItems: React.FC<BotActionsMenuItemsProps> = ({
  bot,
  pending,
  onToggleStatus,
  onRestart,
  onEdit,
  onClone,
  /* onViewClosedTrades, */
  onShareConfig,
  onCopyToLive,
  onArchive,
  onDelete,
  align = 'end',
  className,
  viewOnly = false,
}) => {
  // Use centralized bot status utilities
  const isActive = isBotActive(bot.status);
  const canToggle = canToggleBotStatus(bot.status);
  const canRestart = isBotRestartable(bot.status);
  const canDelete = isBotDeletable(bot.status);
  const deleteBlockedReason = getDeleteBlockedReason(bot.status);
  const canArchive = isBotArchivable(bot.status);
  const archiveBlockedReason = getArchiveBlockedReason(bot.status);
  // Either the global demo-mode flag OR the per-view viewOnly flag
  // (share visitor / non-owner) is enough to lock mutating actions.
  const readOnly = isReadOnly() || viewOnly;
  const { isPaperTrading } = usePaperContext();
  const { toggleStarred, isStarred } = useStarredBotsStore();

  return (
    <DropdownMenuContent
      align={align}
      side="bottom"
      className={className}
      sideOffset={8}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Primary Actions */}
      <DropdownMenuItem
        onClick={() => toggleStarred(bot.id)}
        title={isStarred(bot.id) ? 'Unstar bot' : 'Star bot'}
      >
        <Star
          className={`w-4 h-4 mr-2 ${isStarred(bot.id) ? 'text-yellow-400 fill-yellow-400' : ''}`}
        />
        {isStarred(bot.id) ? 'Unstar' : 'Star'}
      </DropdownMenuItem>

      {canToggle && (
        <DropdownMenuItem
          onClick={readOnly ? undefined : onToggleStatus}
          disabled={!!pending?.statusToggle || readOnly}
          title={readOnly ? 'Not available in demo mode' : undefined}
        >
          {pending?.statusToggle ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              {getActionPresent(bot.status)}…
            </>
          ) : isActive ? (
            <>
              <Pause className="w-4 h-4 mr-2" />
              {getActionText(bot.status)}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              {getActionText(bot.status)}
            </>
          )}
        </DropdownMenuItem>
      )}

      {canRestart && onRestart && (
        <DropdownMenuItem
          onClick={readOnly ? undefined : onRestart}
          disabled={!!pending?.restart || readOnly}
          title={readOnly ? 'Not available in demo mode' : undefined}
        >
          {pending?.restart ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Restarting…
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Restart
            </>
          )}
        </DropdownMenuItem>
      )}

      <DropdownMenuItem
        onClick={readOnly ? undefined : onEdit}
        disabled={readOnly}
        title={readOnly ? 'Not available in demo mode' : undefined}
      >
        <Edit className="w-4 h-4 mr-2" />
        Edit
      </DropdownMenuItem>

      <DropdownMenuItem
        onClick={readOnly ? undefined : onClone}
        disabled={!!pending?.clone || readOnly}
        title={readOnly ? 'Not available in demo mode' : undefined}
      >
        {pending?.clone ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Cloning…
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 mr-2" />
            Clone
          </>
        )}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* Advanced Actions */}
      <DropdownMenuItem
        onClick={readOnly ? undefined : onShareConfig}
        disabled={readOnly}
        title={readOnly ? 'Not available in demo mode' : undefined}
      >
        <Share className="w-4 h-4 mr-2" />
        Share Configuration
      </DropdownMenuItem>

      <DropdownMenuItem
        onClick={readOnly ? undefined : onCopyToLive}
        disabled={readOnly}
        title={readOnly ? 'Not available in demo mode' : undefined}
      >
        <RefreshCw className="w-4 h-4 mr-2" />
        Duplicate to {isPaperTrading ? 'live' : 'paper'}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      {/* Archive Action */}
      <DropdownMenuItem
        onClick={readOnly || !canArchive ? undefined : onArchive}
        disabled={!!pending?.archive || readOnly || !canArchive}
        title={
          readOnly
            ? 'Not available in demo mode'
            : archiveBlockedReason /* undefined when archivable */
        }
      >
        {pending?.archive ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            {bot.status === 'archived' ? 'Unarchiving…' : 'Archiving…'}
          </>
        ) : (
          <>
            <Archive className="w-4 h-4 mr-2" />
            {bot.status === 'archived' ? 'Unarchive' : 'Archive'}
          </>
        )}
      </DropdownMenuItem>

      {/* Danger Zone */}
      {canDelete && (
        <DropdownMenuItem
          onClick={readOnly ? undefined : onDelete}
          disabled={!!pending?.delete || readOnly}
          className="text-destructive focus:text-destructive"
          title={readOnly ? 'Not available in demo mode' : deleteBlockedReason}
        >
          {pending?.delete ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Deleting…
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </>
          )}
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
};
export default BotActionsMenuItems;
