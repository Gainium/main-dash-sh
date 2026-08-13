import { History } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export interface DraftRestoredNoticeProps {
  /** Epoch ms the restored draft was written, or null to render nothing. */
  savedAt: number | null;
  /** Keep the restored values, hide the notice. */
  onKeep: () => void;
  /** Throw the draft away and reset the form to defaults. */
  onDiscard: () => void;
}

const relativeAge = (savedAt: number, now: number): string => {
  const minutes = Math.floor(Math.max(0, now - savedAt) / 60000);
  if (minutes < 1) return 'moments ago';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
};

/**
 * Shown when the bot builder reopens with work that was never saved — after a
 * reload, a mis-click onto another page, or a closed tab.
 *
 * The notice exists because a silent restore is its own bug report: a form
 * that mysteriously arrives pre-filled reads as the platform inventing
 * settings. Saying what happened, and offering one click to start clean, is
 * what makes the restore trustworthy.
 */
export const DraftRestoredNotice: React.FC<DraftRestoredNoticeProps> = ({
  savedAt,
  onKeep,
  onDiscard,
}) => {
  if (savedAt === null) return null;

  return (
    // The notice lives in the builder's right-hand panel, which is narrow on a
    // laptop and narrower still on mobile — so the copy and the two buttons
    // must be a vertical stack that wraps, not inline siblings. As bare
    // `<span>`s they ran together with no breathing room and the buttons
    // overflowed the panel instead of wrapping onto their own line.
    <Alert className="mb-4">
      <History className="h-5 w-5 text-muted-foreground" />
      <AlertTitle className="text-balance">
        Restored your unsaved bot
      </AlertTitle>
      <AlertDescription className="space-y-sm">
        <p>
          We brought back the settings you were editing{' '}
          {relativeAge(savedAt, Date.now())}. They were never saved, so nothing
          is running yet.
        </p>
        {/* `flex-1 basis-32` seats the two side by side whenever the panel can
            fit both, and drops them to full-width rows when it can't — rather
            than letting them overflow or land at two ragged widths. */}
        <div className="flex flex-wrap gap-xs">
          <Button
            size="sm"
            variant="secondary"
            onClick={onKeep}
            className="flex-1 basis-32"
          >
            Keep editing
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDiscard}
            className="flex-1 basis-32"
          >
            Start fresh
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default DraftRestoredNotice;
