import { useMemo, useState } from 'react';
import { BookMarked, Check, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBotTemplatesStore } from '@/stores/botTemplatesStore';
import { useShortcutStore } from '@/stores/shortcutStore';
import { BotTypesEnum } from '@/types';

/** A template the user asked to delete, awaiting confirmation. */
export interface PendingTemplateDelete {
  id: string;
  name: string;
}

interface BotTemplatesListProps {
  /** Which bot type's templates to show. */
  botType: BotTypesEnum;
  /** Apply the chosen template id. */
  onApply: (templateId: string) => void;
  /** Ask the consumer to confirm a delete (see TemplateDeleteConfirmation). */
  onRequestDelete: (pending: PendingTemplateDelete) => void;
}

/**
 * The rows of the saved-templates list: name, description, favourite mark,
 * and a per-row delete affordance.
 *
 * Rendered inside a Popover (Quick Setup's picker) or inside a Dialog (the
 * bot form's save-row "Load template" entry), so it deliberately owns NO
 * surface chrome and NO delete confirmation of its own — a confirmation
 * mounted in here would be torn down with the Popover the moment it stole
 * focus. The consumer holds the pending-delete state and renders
 * `TemplateDeleteConfirmation` OUTSIDE the surface.
 */
export const BotTemplatesList: React.FC<BotTemplatesListProps> = ({
  botType,
  onApply,
  onRequestDelete,
}) => {
  const allTemplates = useBotTemplatesStore((s) => s.templates);
  const templates = useMemo(
    () => allTemplates.filter((t) => t.botType === botType),
    [allTemplates, botType]
  );

  return (
    <div className="max-h-72 overflow-y-auto py-1">
      {templates.map((t) => (
        <div
          key={t.id}
          className="group flex w-full items-center gap-sm rounded-sm pr-1 text-left text-sm hover:bg-muted"
        >
          <button
            type="button"
            onClick={() => onApply(t.id)}
            // `text-left` is load-bearing: a <button> centres its text by UA
            // default, which the 288px popover hid and the wider Load-template
            // dialog does not.
            className="flex min-w-0 flex-1 items-center gap-sm px-sm py-2 text-left"
          >
            <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{t.name}</div>
              {t.description && (
                <div className="truncate text-xs text-muted-foreground">
                  {t.description}
                </div>
              )}
            </div>
            {t.isFavorite && <Check className="h-3.5 w-3.5 text-primary" />}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Delete template ${t.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete({ id: t.id, name: t.name });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
};

/**
 * Delete confirmation for a saved template. Owns the actual removal so every
 * surface that lists templates deletes them the same way — the template and
 * its registered hotkey go together.
 */
export const TemplateDeleteConfirmation: React.FC<{
  pending: PendingTemplateDelete | null;
  onClose: () => void;
}> = ({ pending, onClose }) => {
  const deleteTemplate = useBotTemplatesStore((s) => s.deleteTemplate);

  return (
    <ConfirmationDialog
      open={pending !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Delete template?"
      description={`"${pending?.name ?? ''}" will be removed from your saved templates.`}
      confirmText="Delete"
      cancelText="Cancel"
      variant="destructive"
      onConfirm={() => {
        if (!pending) return;
        deleteTemplate(pending.id);
        useShortcutStore.getState().deleteShortcut(`bot-template-${pending.id}`);
        onClose();
      }}
    />
  );
};

interface TemplatesPopoverProps {
  /** Which bot type's templates to show. */
  botType: BotTypesEnum;
  /** Apply the chosen template id. The popover closes itself first. */
  onApply: (templateId: string) => void;
}

/**
 * The "Use a saved template" popover from the Quick Setup picker.
 * Self-contained: pulls templates filtered by `botType` and handles
 * its own delete-confirmation flow. The consumer only handles
 * application of the chosen template.
 */
export const TemplatesPopover: React.FC<TemplatesPopoverProps> = ({
  botType,
  onApply,
}) => {
  const allTemplates = useBotTemplatesStore((s) => s.templates);
  const templates = useMemo(
    () => allTemplates.filter((t) => t.botType === botType),
    [allTemplates, botType]
  );

  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] =
    useState<PendingTemplateDelete | null>(null);

  const handleClick = (templateId: string) => {
    setOpen(false);
    onApply(templateId);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="w-full justify-start text-muted-foreground"
            disabled={templates.length === 0}
          >
            <BookMarked className="h-4 w-4" />
            {templates.length > 0
              ? `Use a saved template (${templates.length})`
              : 'No saved templates'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1">
          <BotTemplatesList
            botType={botType}
            onApply={handleClick}
            onRequestDelete={setPendingDelete}
          />
        </PopoverContent>
      </Popover>

      <TemplateDeleteConfirmation
        pending={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
};
