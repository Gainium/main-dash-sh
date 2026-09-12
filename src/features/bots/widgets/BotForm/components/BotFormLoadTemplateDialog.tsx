import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BotTemplatesList,
  TemplateDeleteConfirmation,
  type PendingTemplateDelete,
} from './quick-setup/shared';
import { BotTypesEnum } from '@/types';
import React, { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botType: BotTypesEnum;
  /** Apply the chosen template id. The dialog closes itself first. */
  onApply: (templateId: string) => void;
}

/**
 * Controlled "Load template" dialog for the bot form's save-row overflow
 * menu — the counterpart to BotFormSaveTemplateDialog.
 *
 * Saved templates were previously reachable only from the Quick Setup
 * picker's TemplatesPopover and from a hotkey the user had to assign at save
 * time, so anyone who saved one from Manual mode had no way to get it back.
 * This lists the same templates (the shared BotTemplatesList) without
 * touching the Quick Setup picker.
 */
export const BotFormLoadTemplateDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  botType,
  onApply,
}) => {
  const [pendingDelete, setPendingDelete] =
    useState<PendingTemplateDelete | null>(null);

  // Never leave a stale confirmation armed behind a closed dialog.
  useEffect(() => {
    if (!open) setPendingDelete(null);
  }, [open]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Load template</DialogTitle>
          </DialogHeader>
          <BotTemplatesList
            botType={botType}
            onApply={(templateId) => {
              onOpenChange(false);
              onApply(templateId);
            }}
            onRequestDelete={setPendingDelete}
          />
          <p className="text-xs text-muted-foreground">
            Templates are stored in this browser, so they won&apos;t follow you
            to another device.
          </p>
        </DialogContent>
      </Dialog>

      <TemplateDeleteConfirmation
        pending={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
};

export default BotFormLoadTemplateDialog;
