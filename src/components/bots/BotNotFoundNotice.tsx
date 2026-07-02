import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface BotNotFoundNoticeProps {
  /** Where the "Back to list" button navigates (e.g. `/grid`). */
  backTo: string;
  /** Human label for the list, e.g. "grid bots". */
  backLabel?: string;
  botId?: string;
}

/**
 * Shown when a bot id can't be found in EITHER paper or live mode for the
 * current user (see `useBotModeGuard`). Replaces the old silent
 * "Unknown exchange" state, which gave no indication the bot simply doesn't
 * exist in the account. Community thread 4872.
 */
const BotNotFoundNotice = ({
  backTo,
  backLabel = 'bots',
  botId,
}: BotNotFoundNoticeProps) => {
  const navigate = useNavigate();

  return (
    <div className="p-lg">
      <div className="mx-auto max-w-3xl space-y-md rounded-xl border border-amber-200 bg-amber-50 px-md py-md text-amber-900">
        <div className="space-y-xs">
          <h2 className="text-lg font-semibold">Bot not found</h2>
          <p className="text-sm">
            This bot doesn't exist in your paper or live account. It may have
            been deleted, or the link points to a different account.
          </p>
          {botId ? (
            <p className="text-xs text-amber-800">
              <span className="font-medium">Bot ID</span>:{' '}
              <span className="font-mono">{botId}</span>
            </p>
          ) : null}
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(backTo)}
          className="!border-amber-300 !bg-white/60 !text-amber-900 hover:!bg-amber-100"
        >
          Back to {backLabel}
        </Button>
      </div>
    </div>
  );
};

export default BotNotFoundNotice;
