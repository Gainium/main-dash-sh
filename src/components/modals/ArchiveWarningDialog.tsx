import { Archive, AlertTriangle } from 'lucide-react';
import React, { useState } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface ArchiveWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  botName: string;
  isLoading?: boolean;
}

/**
 * Confirmation shown before archiving a bot once the cold-store rollout is
 * live. Archiving becomes READ-ONLY / one-way: the bot's order + transaction
 * history is moved to cold storage and the bot can no longer be started —
 * the user must clone it to reuse the configuration.
 *
 * Gated by the caller on `VITE_COLD_STORE_ENABLED` (see `isColdStoreArchiveUx`
 * in `utils/coldStore`), so it ships dark and only appears in lock-step with
 * the backend flag flip. When the flag is off, callers archive directly with
 * no dialog (today's reversible behaviour).
 */
export const ArchiveWarningDialog: React.FC<ArchiveWarningDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  botName,
  isLoading = false,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const busy = isLoading || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Archive {botName ? `"${botName}"` : 'bot'}?
          </DialogTitle>
          <DialogDescription>
            Archived bots become read-only.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            The bot's full trade history is preserved and stays viewable, but an
            archived bot <strong>can no longer be started</strong>. To use this
            configuration again, <strong>clone the bot</strong>. This can't be
            undone.
          </AlertDescription>
        </Alert>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {busy ? 'Archiving…' : 'Archive bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveWarningDialog;
