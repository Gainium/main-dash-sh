import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RefreshCcw } from 'lucide-react';

export interface AskToResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  changedFields?: string[];
  message?: string;
  restartLabel?: string;
  cancelLabel?: string;
  isProcessing?: boolean;
}

const DEFAULT_MESSAGE =
  'Key grid settings changed. Restart is required to apply the new configuration safely.';

const DEFAULT_RESTART_LABEL = 'Restart bot now';
const DEFAULT_CANCEL_LABEL = 'Cancel';

const formatChangedFields = (fields: string[] | undefined) => {
  if (!fields || fields.length === 0) {
    return [];
  }

  return [...new Set(fields)].filter(Boolean);
};

/**
 * Shared ask-to-reset dialog shown when structural grid settings change and a restart is required.
 */
export const AskToResetDialog: React.FC<AskToResetDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  changedFields,
  message = DEFAULT_MESSAGE,
  restartLabel = DEFAULT_RESTART_LABEL,
  cancelLabel = DEFAULT_CANCEL_LABEL,
  isProcessing = false,
}) => {
  const fieldList = formatChangedFields(changedFields);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }

    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <RefreshCcw className="h-4 w-4 sm:h-5 sm:w-5" />
            Restart required
          </DialogTitle>
          <DialogDescription className="sr-only text-sm text-muted-foreground">
            Review the impacted settings and confirm to restart the bot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          <SettingsAlert
            variant="warning"
            title={message}
            description={`${message} Restarting will pause the bot momentarily while orders and budget are realigned with the new grid settings.`}
          />

          {fieldList.length > 0 ? (
            <div className="space-y-xs rounded-lg border border-border/60 bg-muted/20 p-md">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Changed parameters
              </p>
              <Separator className="bg-border/60" />
              <ul className="list-disc space-y-1 pl-5 text-xs sm:text-sm text-muted-foreground">
                {fieldList.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {restartLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AskToResetDialog;
