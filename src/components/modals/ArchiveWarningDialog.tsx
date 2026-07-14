import { Archive } from 'lucide-react';
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
 * live. Archiving moves the bot's order + transaction history to cold storage
 * (freeing hot storage) and stops the bot — but it is REVERSIBLE: un-archiving
 * restores the history and the bot can be used again.
 *
 * Gated by the caller on `VITE_COLD_STORE_ENABLED` (see `isColdStoreArchiveUx`
 * in `utils/coldStore`), so it ships dark and only appears in lock-step with
 * the backend flag flip. When the flag is off, callers archive directly with
 * no dialog (today's behaviour).
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
            Archiving moves this bot's history to cold storage.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Archive className="w-4 h-4" />
          <AlertDescription>
            The bot's order &amp; transaction history is moved to cold storage to
            free up space, and the bot stops. Its full history stays viewable,
            and you can <strong>un-archive it any time</strong> to restore the
            history and use the bot again.
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
