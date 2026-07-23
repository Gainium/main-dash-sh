import { DialogSearchInput } from '@/components/common/DialogSearchInput';
import { ItemRowList } from '@/components/common/ItemRowList';
import ShortcutRecorder from '@/components/common/ShortcutRecorder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useShortcutStore, type ShortcutConfig } from '@/stores/shortcutStore';
import { RotateCcw, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export interface ShortcutsListProps {
  showSearch?: boolean;
  showResetAll?: boolean;
}

interface ShortcutItemProps {
  shortcut: ShortcutConfig;
  onReset: (id: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const ShortcutItem: React.FC<ShortcutItemProps> = ({
  shortcut,
  onReset,
  onToggle: _onToggle,
  onDelete,
}) => {
  const recordingId = useShortcutStore((s) => s.isRecording);
  const isRecording = recordingId === shortcut.id;
  return (
    <ItemRowList
      as="div"
      disabled={!shortcut.enabled}
      className={isRecording ? 'ring-2 ring-primary' : ''}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-xs">
          <span
            className={`font-medium text-sm ${
              shortcut.enabled ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {shortcut.label}
          </span>
          {/* <ShortcutChip
            id={shortcut.id}
            className="ml-1"
            muted={!shortcut.enabled}
          /> */}
        </div>
        {shortcut.path ? (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {shortcut.path}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-xs ml-4">
        <ShortcutRecorder
          id={shortcut.id}
          label={shortcut.label}
          onReset={() => onReset(shortcut.id)}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(shortcut.id)}
          title="Delete shortcut"
          disabled={isRecording}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </ItemRowList>
  );
};

export const ShortcutsList: React.FC<ShortcutsListProps> = ({
  showSearch = true,
  showResetAll = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const {
    getAllShortcuts,
    resetShortcut,
    resetAllShortcuts,
    toggleShortcut,
    deleteShortcut,
    isRecording,
    registerShortcut,
  } = useShortcutStore();

  const shortcuts = getAllShortcuts();
  const navigate = useNavigate();
  const [newLabel, setNewLabel] = useState('');
  const [newPath, setNewPath] = useState('');
  const [pendingKey, setPendingKey] = useState<
    ShortcutConfig['currentKey'] | null
  >(null);
  const [newError, setNewError] = useState<string | null>(null);
  // Generate a stable id for the 'add new' row; refresh on each cancel/add
  const [newId, setNewId] = useState(() => `nav-custom-${Date.now()}`);

  // Filter shortcuts based on search query
  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return shortcuts;

    const query = searchQuery.toLowerCase();
    return shortcuts.filter((shortcut) => {
      const matchesLabel = shortcut.label.toLowerCase().includes(query);
      const matchesCategory = shortcut.category.toLowerCase().includes(query);
      const path = shortcut.path || '';
      const matchesPath = path.toLowerCase().includes(query);
      return matchesLabel || matchesPath || matchesCategory;
    });
  }, [shortcuts, searchQuery]);

  // Group shortcuts by category (always include 'custom')
  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, ShortcutConfig[]> = {};
    filteredShortcuts.forEach((shortcut) => {
      if (!groups[shortcut.category]) {
        groups[shortcut.category] = [];
      }
      groups[shortcut.category].push(shortcut);
    });
    // Ensure there is always a 'custom' group so the header and add box can render
    if (!groups['custom']) groups['custom'] = [];
    return groups;
  }, [filteredShortcuts]);

  // Clear search on unmount
  useEffect(() => {
    return () => setSearchQuery('');
  }, []);

  function isValidPath(p: string) {
    if (!p) return false;
    const trimmed = p.trim();
    if (!trimmed.startsWith('/')) return false;
    if (/^\/\//.test(trimmed)) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false; // protocol
    return true;
  }

  const handleAddShortcut = () => {
    setNewError(null);
    const label = newLabel.trim();
    const path = newPath.trim();
    if (!label) {
      setNewError('Please provide a name for the shortcut.');
      return;
    }

    if (!isValidPath(path)) {
      setNewError("Path must be an internal route and start with '/'.");
      return;
    }

    // need a recorded key from the recorder (pendingKey)
    if (!pendingKey) {
      setNewError('Please record a keyboard shortcut first.');
      return;
    }

    // Check for existing identical label or path
    const duplicates = shortcuts.filter(
      (s) =>
        (s.label.toLowerCase() === label.toLowerCase() &&
          s.category === 'custom') ||
        (s.path && s.path === path)
    );
    if (duplicates.length > 0) {
      setNewError('A custom shortcut with this path already exists.');
      return;
    }

    const id = newId || `nav-custom-${Date.now()}`;
    const defaultKey = pendingKey;
    registerShortcut({
      id,
      label,
      description: 'Custom shortcut',
      defaultKey,
      currentKey: defaultKey,
      enabled: true,
      category: 'custom',
      action: () => navigate(path),
      deleted: false,
      path: path,
    } as ShortcutConfig);

    // Clear fields and regenerate id
    setNewLabel('');
    setNewPath('');
    setPendingKey(null);
    setNewId(`nav-custom-${Date.now()}`);
  };

  const categoryLabels = {
    managers: 'Managers',
    navigation: 'Navigation',
    actions: 'Actions',
    dashboards: 'Dashboards',
    templates: 'Templates',
    panels: 'Panels',
    custom: 'Custom shortcuts',
  } as const;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {(showSearch || showResetAll) && (
        // Non-scrolling sibling above the list. Earlier versions made
        // this `sticky` over a `glass-surface` dialog, which forced a
        // separately-tinted slab that always read as a visible "box"
        // (the child surface can't match the parent's blended glass).
        // The fix is structural: the host gives this row a fixed slot
        // at the top and scrolls the list below it. No bg needed.
        // `pr-10` leaves the dialog's close-X room on the right.
        <div className="shrink-0 pb-3 pr-10">
          <div className="flex items-center gap-sm">
            {showSearch && (
              <div className="relative flex-1">
                <DialogSearchInput
                  placeholder="Search shortcuts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}
            {showResetAll && (
              <Tooltip
                tooltip="Restores every shortcut to its default key and re-enables built-in shortcuts you removed. Dashboard shortcuts have no default, so they stay unassigned."
                tooltipURL="/help/keyboard-shortcuts"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAllShortcuts}
                  className="h-9 gap-xs"
                  title="Reset all shortcuts to defaults"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span className="hidden sm:inline">Reset all</span>
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-5 -mr-2 pr-2">
        {/* Render categories in a stable order and always include custom */}
        {[
          'managers',
          'navigation',
          'actions',
          'dashboards',
          'templates',
          'panels',
          'custom',
        ].map((category) => {
          const categoryShortcuts = groupedShortcuts[category] || [];
          return (
            <div key={category}>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-xs">
                {categoryLabels[category as keyof typeof categoryLabels] ||
                  category}
                {category === 'dashboards' && (
                  <Tooltip
                    tooltip="Each of your dashboards can get its own shortcut. None is assigned by default — click the cog icon next to a dashboard and press a key combination to jump to it from anywhere."
                    tooltipURL="/help/keyboard-shortcuts"
                  >
                    <InfoIcon />
                  </Tooltip>
                )}
                {category === 'custom' && (
                  <Tooltip
                    tooltip="Create your own shortcut to any page: give it a name, enter the page's path (the part of the address after the domain, starting with '/'), and record a key combination."
                    tooltipURL="/help/keyboard-shortcuts"
                  >
                    <InfoIcon />
                  </Tooltip>
                )}
              </h3>
              <div className="space-y-xs">
                {categoryShortcuts.map((shortcut) => (
                  <ShortcutItem
                    key={shortcut.id}
                    shortcut={shortcut}
                    onReset={resetShortcut}
                    onToggle={toggleShortcut}
                    onDelete={deleteShortcut}
                  />
                ))}
                {/* If category is custom, render the 'Add new' form at the end */}
                {category === 'custom' && (
                  <>
                    <div className="p-sm rounded-lg border border-dashed flex items-center gap-sm bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <Input
                          placeholder="Name"
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      <div className="flex items-center gap-xs">
                        <Input
                          placeholder="Path"
                          value={newPath}
                          onChange={(e) => setNewPath(e.target.value)}
                          className="h-9 w-[280px]"
                        />
                        <ShortcutRecorder
                          id={newId}
                          label={newLabel || 'Custom'}
                          path={newPath}
                          autoRegister={false}
                          onRecorded={(k) => setPendingKey(k)}
                          previewKey={pendingKey}
                          showReset={false}
                        />
                        <Button
                          size="sm"
                          className="h-9"
                          onClick={handleAddShortcut}
                          disabled={!newLabel || !newPath || !pendingKey}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                    {newError && (
                      <div className="text-sm text-destructive mt-2">
                        {newError}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {filteredShortcuts.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            {searchQuery
              ? 'No shortcuts found matching your search.'
              : 'No shortcuts configured.'}
          </div>
        )}
      </div>

      {isRecording && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-xs text-sm text-muted-foreground">
            <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
            Press any key combination to record the shortcut. Click outside or
            press Escape to cancel.
          </div>
        </div>
      )}
    </div>
  );
};

export default ShortcutsList;
