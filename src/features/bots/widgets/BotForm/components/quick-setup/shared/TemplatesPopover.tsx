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
  const deleteTemplate = useBotTemplatesStore((s) => s.deleteTemplate);
  const templates = useMemo(
    () => allTemplates.filter((t) => t.botType === botType),
    [allTemplates, botType]
  );

  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
          <div className="max-h-72 overflow-y-auto py-1">
            {templates.map((t) => (
              <div
                key={t.id}
                className="group flex w-full items-center gap-sm rounded-sm pr-1 text-left text-sm hover:bg-muted"
              >
                <button
                  type="button"
                  onClick={() => handleClick(t.id)}
                  className="flex min-w-0 flex-1 items-center gap-sm px-sm py-2"
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
                  {t.isFavorite && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Delete template ${t.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete({ id: t.id, name: t.name });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Delete template?"
        description={`"${pendingDelete?.name ?? ''}" will be removed from your saved templates.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteTemplate(pendingDelete.id);
          useShortcutStore
            .getState()
            .deleteShortcut(`bot-template-${pendingDelete.id}`);
          setPendingDelete(null);
        }}
      />
    </>
  );
};
