import ShortcutChip from '@/components/common/ShortcutChip';
import ShortcutsList from '@/components/shortcuts/ShortcutsList';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { SHORTCUT_IDS } from '@/config/shortcuts';
import { useShortcutStore } from '@/stores/shortcutStore';
import { Keyboard } from 'lucide-react';
import React from 'react';

interface ShortcutManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShortcutManager: React.FC<ShortcutManagerProps> = ({
  open,
  onOpenChange,
}) => {
  const disableShortcutHints = useShortcutStore((s) => s.disableShortcutHints);
  const setDisableShortcutHints = useShortcutStore(
    (s) => s.setDisableShortcutHints
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Dialog itself doesn't scroll — the inner list does. This keeps
          the header + toggle + search row as fixed siblings (no sticky
          overlay), so the dialog reads as one continuous glass panel
          with no second translucent slab tinting the search row. */}
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-xs">
            <Keyboard className="h-5 w-5" />
            <span className="flex items-center gap-xs">
              Keyboard Shortcuts
              <ShortcutChip id={SHORTCUT_IDS.ManagerShortcuts} />
            </span>
          </DialogTitle>
          <DialogDescription>
            Manage and customize keyboard shortcuts. Click the cog icon to
            record a new shortcut.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 shrink-0">
          <div className="flex items-center justify-between gap-sm">
            <div className="flex items-center gap-xs text-sm text-muted-foreground">
              Disable shortcut hints
              <Tooltip
                tooltip='Hints are the occasional "Next time, press…" messages shown when you use the mouse for something that has a keyboard shortcut. Turn this on to stop showing them.'
                tooltipURL="/help/keyboard-shortcuts"
              >
                <InfoIcon />
              </Tooltip>
            </div>
            <Switch
              checked={disableShortcutHints}
              onCheckedChange={setDisableShortcutHints}
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex-1 min-h-0 flex flex-col">
          <ShortcutsList showSearch showResetAll />
        </div>
      </DialogContent>
    </Dialog>
  );
};
