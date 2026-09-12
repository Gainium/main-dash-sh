import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useBotTemplatesStore,
  type HedgeTemplatePayload,
} from '@/stores/botTemplatesStore';
import { areShortcutKeysEqual, useShortcutStore } from '@/stores/shortcutStore';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { toast } from '@/lib/toast';
import { parseShortcutString } from '@/utils/shortcuts';
import React, { useEffect, useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botType: BotTypesEnum;
  currentFormData: Partial<BotFormData>;
  /**
   * Hedge templates carry both legs + shared settings here. When present it's
   * stored on the template so the hedge edit layout can reseed both legs on
   * load; `currentFormData` then holds the long leg only (for back-compat).
   */
  hedge?: HedgeTemplatePayload;
}

/**
 * Controlled "Save as template" dialog. Captures a name, optional
 * description, and optional hotkey, then persists a new template via the
 * templates store. Hotkey-conflict detection mirrors the original
 * BotFormTemplatesMenu flow.
 *
 * This is the cloud/sh save-template entry point now that the footer no
 * longer renders a dedicated bookmark dropdown — the action lives in the
 * save-row overflow menu and opens this dialog. Loading/editing existing
 * templates still happens via the preset picker and registered hotkeys.
 */
export const BotFormSaveTemplateDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  botType,
  currentFormData,
  hedge,
}) => {
  const saveTemplate = useBotTemplatesStore((s) => s.saveTemplate);
  const updateTemplate = useBotTemplatesStore((s) => s.updateTemplate);

  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateHotkey, setTemplateHotkey] = useState('');
  // Hotkey-conflict confirmation (replaces the native confirm() gates). Holds
  // the message to show and the cleanup to run if the user reassigns.
  const [hotkeyConflict, setHotkeyConflict] = useState<{
    message: string;
    resolve: () => void;
  } | null>(null);

  // Reset the fields each time the dialog opens.
  useEffect(() => {
    if (open) {
      setTemplateName('');
      setTemplateDescription('');
      setTemplateHotkey('');
      setHotkeyConflict(null);
    }
  }, [open]);

  // Persist the template (and assign its hotkey) once any conflicts are
  // resolved, then close the dialog.
  const persistTemplate = () => {
    const created = saveTemplate(
      templateName,
      botType,
      currentFormData as BotFormData,
      {
        description: templateDescription || undefined,
        isFavorite: false,
        ...(hedge ? { hedge } : {}),
      }
    );

    // Assign the shortcut to the freshly-saved template in a second step.
    if (templateHotkey && created) {
      updateTemplate(created.id, { shortcut: templateHotkey });
    }

    // The dialog used to just close, which is indistinguishable from a save
    // that silently failed — say what was saved and where to find it again.
    toast.success(
      `Template "${created.name}" saved — reopen it from "Load template" in the same menu.`,
      { duration: 5000 }
    );

    onOpenChange(false);
  };

  const handleSave = () => {
    if (!templateName.trim()) return;

    // Conflict detection: ensure the hotkey doesn't collide with an existing
    // template or global shortcut before persisting. Any conflicts are
    // surfaced in a single React confirmation instead of native confirm().
    if (templateHotkey) {
      const parsed = parseShortcutString(templateHotkey);
      if (parsed) {
        const templates = useBotTemplatesStore
          .getState()
          .getAllTemplates(botType);
        const templateConflict = templates.find((tt) => {
          if (!tt.shortcut) return false;
          const p2 = parseShortcutString(tt.shortcut);
          return p2 ? areShortcutKeysEqual(p2, parsed) : false;
        });

        const scs = useShortcutStore.getState().shortcuts;
        const shortcutConflicts: Array<{ id: string; label: string }> = [];
        for (const [id, sc] of Object.entries(scs)) {
          if (id.startsWith('bot-template-')) continue; // handled above
          if (!sc.currentKey) continue;
          if (areShortcutKeysEqual(sc.currentKey, parsed)) {
            shortcutConflicts.push({ id, label: sc.label });
          }
        }

        if (templateConflict || shortcutConflicts.length > 0) {
          const parts: string[] = [];
          if (templateConflict) {
            parts.push(`template "${templateConflict.name}"`);
          }
          for (const sc of shortcutConflicts) {
            parts.push(`shortcut "${sc.label}"`);
          }
          setHotkeyConflict({
            message: `Hotkey ${templateHotkey} is already assigned to ${parts.join(
              ' and '
            )}. Reassign it to this template?`,
            resolve: () => {
              if (templateConflict) {
                updateTemplate(templateConflict.id, { shortcut: undefined });
                useShortcutStore
                  .getState()
                  .deleteShortcut(`bot-template-${templateConflict.id}`);
              }
              for (const sc of shortcutConflicts) {
                useShortcutStore.getState().deleteShortcut(sc.id);
              }
              persistTemplate();
            },
          });
          return; // wait for the user's decision
        }
      }
    }

    persistTemplate();
  };

  const handleHotkey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pressedKeys: string[] = [];
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if ((isMac && e.metaKey) || (!isMac && e.ctrlKey))
      pressedKeys.push(isMac ? 'Cmd' : 'Ctrl');
    if (e.altKey) pressedKeys.push('Alt');
    if (e.shiftKey) pressedKeys.push('Shift');
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key))
      pressedKeys.push(e.key.toUpperCase());
    if (pressedKeys.length) setTemplateHotkey(pressedKeys.join('+'));
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Save Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-lg py-4">
          <div className="space-y-xs">
            <Label className="text-sm font-medium">Template Name</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Enter template name"
              autoFocus
            />
          </div>
          <div className="space-y-xs">
            <Label className="text-sm font-medium">
              Description (optional)
            </Label>
            <Input
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Enter template description"
            />
          </div>
          <div className="space-y-xs">
            <Label className="text-sm font-medium">Hotkey (optional)</Label>
            <Input
              value={templateHotkey || 'Click here and press a key'}
              onKeyDown={handleHotkey}
              readOnly
              className="cursor-pointer"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Templates are stored in this browser, so they won&apos;t follow you
            to another device.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!templateName.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <ConfirmationDialog
        open={hotkeyConflict !== null}
        onOpenChange={(o) => {
          if (!o) setHotkeyConflict(null);
        }}
        title="Hotkey already in use"
        description={hotkeyConflict?.message ?? ''}
        confirmText="Reassign"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={() => {
          hotkeyConflict?.resolve();
          setHotkeyConflict(null);
        }}
      />
    </>
  );
};

export default BotFormSaveTemplateDialog;
