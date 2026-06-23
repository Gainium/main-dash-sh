import ShortcutRecorder from '@/components/common/ShortcutRecorder';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { logger } from '@/lib/loggerInstance';
import { formatShortcut, type ShortcutKey } from '@/stores/shortcutStore';
import { useUIStore, type CustomNavItem } from '@/stores/uiStore';
import * as Icons from 'lucide-react';
import React, { useEffect, useState } from 'react';

// Common navigation and UI icons to display prominently
const COMMON_ICONS = [
  // Navigation & Layout
  'Home',
  'LayoutDashboard',
  'LayoutGrid',
  'LayoutList',
  'Menu',
  'Navigation',
  'Sidebar',
  'PanelLeft',
  'PanelRight',
  'Columns',
  // Charts & Data
  'BarChart2',
  'BarChart3',
  'LineChart',
  'PieChart',
  'TrendingUp',
  'TrendingDown',
  'Activity',
  'AreaChart',
  'CandlestickChart',
  // Finance
  'Wallet',
  'DollarSign',
  'CreditCard',
  'Coins',
  'Banknote',
  'Receipt',
  'HandCoins',
  // Development & Tools
  'Terminal',
  'Code',
  'CodeSquare',
  'Braces',
  'Binary',
  'GitBranch',
  'GitCommit',
  'Database',
  'Server',
  'Cpu',
  // Files & Documents
  'FileText',
  'File',
  'FileCode',
  'FileSpreadsheet',
  'Folder',
  'FolderOpen',
  'BookOpen',
  'Book',
  'Notebook',
  'FileEdit',
  // Communication
  'MessageSquare',
  'MessageCircle',
  'Mail',
  'Send',
  'Phone',
  'Video',
  'Mic',
  'AtSign',
  // UI Controls
  'Settings',
  'Sliders',
  'SlidersHorizontal',
  'Filter',
  'Search',
  'Menu',
  'MoreHorizontal',
  'MoreVertical',
  'ChevronRight',
  'ChevronDown',
  // Actions
  'Plus',
  'Minus',
  'X',
  'Check',
  'Edit',
  'Trash2',
  'Save',
  'Download',
  'Upload',
  'Copy',
  'ExternalLink',
  'Link',
  'Unlink',
  'RefreshCw',
  // User & Account
  'User',
  'Users',
  'UserCircle',
  'UserPlus',
  'UserCheck',
  'Shield',
  'Lock',
  'Unlock',
  'Key',
  // Status & Notifications
  'Bell',
  'BellRing',
  'AlertCircle',
  'AlertTriangle',
  'Info',
  'HelpCircle',
  'CheckCircle',
  'XCircle',
  // Media & Entertainment
  'Play',
  'Pause',
  'SkipForward',
  'SkipBack',
  'Image',
  'Camera',
  'Film',
  'Music',
  'Headphones',
  // Objects & Symbols
  'Star',
  'Heart',
  'Bookmark',
  'Flag',
  'Tag',
  'Target',
  'Award',
  'Trophy',
  'Crown',
  'Gift',
  'Package',
  'ShoppingCart',
  'ShoppingBag',
  // Tech & Devices
  'Smartphone',
  'Tablet',
  'Monitor',
  'Laptop',
  'HardDrive',
  'Wifi',
  'Globe',
  'Cloud',
  'CloudUpload',
  'CloudDownload',
  // Time & Calendar
  'Clock',
  'Calendar',
  'CalendarDays',
  'Timer',
  'Hourglass',
  'History',
  // Transportation & Location
  'MapPin',
  'Map',
  'Navigation2',
  'Compass',
  'Car',
  'Plane',
  'Truck',
  'Ship',
  // Nature & Science
  'Zap',
  'Flame',
  'Droplet',
  'Sun',
  'Moon',
  'Cloud',
  'Leaf',
  'Sprout',
  // Misc
  'Rocket',
  'Lightbulb',
  'Puzzle',
  'Gauge',
  'Layers',
  'Box',
  'Archive',
  'Briefcase',
  'Building',
  'Store',
] as const;

// Custom nav items navigate via React Router, so the URL must be an in-app
// path starting with "/". Paste-friendly: if the user pastes a full
// app.gainium.io URL, strip the origin down to the path.
const APP_ORIGINS = ['https://app.gainium.io', 'http://app.gainium.io'];

const sanitizeNavUrl = (raw: string): string => {
  const url = raw.trim();
  for (const origin of APP_ORIGINS) {
    if (url.toLowerCase().startsWith(origin)) {
      const path = url.slice(origin.length);
      // A bare origin (no path) maps to the app root.
      return path === '' ? '/' : path;
    }
  }
  return url;
};

interface CustomNavItemDialogProps {
  open: boolean;
  onClose: () => void;
  editingItem?: CustomNavItem | null;
  /** When provided, a section picker is shown so a new item can be placed in a
   *  specific sidebar section (V1 layout). Absent → legacy flat behavior. */
  sections?: { id: string; title: string }[];
  /** Pre-selected section for a new item. */
  defaultSectionId?: string;
  /** Called after a new item is created so the caller can place it. */
  onAddedToSection?: (itemId: string, sectionId: string) => void;
}

const CustomNavItemDialog: React.FC<CustomNavItemDialogProps> = ({
  open,
  onClose,
  editingItem,
  sections,
  defaultSectionId,
  onAddedToSection,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Home');
  const [shortcutKey, setShortcutKey] = useState<ShortcutKey | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  const [sectionId, setSectionId] = useState('');

  // Generate a temporary ID for the ShortcutRecorder
  const tempShortcutId = React.useMemo(
    () => `nav-custom-temp-${Date.now()}`,
    []
  );

  const addCustomNavItem = useUIStore((s) => s.addCustomNavItem);
  const updateCustomNavItem = useUIStore((s) => s.updateCustomNavItem);

  // Initialize form when dialog opens or editingItem changes
  useEffect(() => {
    if (open) {
      setName(editingItem?.name || '');
      setUrl(editingItem?.url || '');
      setSelectedIcon(editingItem?.icon || 'Home');
      setSectionId(defaultSectionId || sections?.[0]?.id || '');
      // Parse existing shortcut string if available
      if (editingItem?.shortcut) {
        // For existing shortcuts, we just store the string format
        // ShortcutRecorder won't show it since we're using previewKey mode
        setShortcutKey(null);
      } else {
        setShortcutKey(null);
      }
    }
    // `sections` is intentionally omitted: it's a fresh array each render, and
    // depending on it would reset the user's section pick mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem, defaultSectionId]);

  const sanitizedUrl = sanitizeNavUrl(url);
  const urlError =
    url.trim() && !sanitizedUrl.startsWith('/')
      ? 'Enter an in-app path starting with "/" (e.g. /strategy)'
      : null;
  const canSave = Boolean(name.trim()) && sanitizedUrl.startsWith('/');

  const handleSave = () => {
    const finalUrl = sanitizeNavUrl(url);
    if (!name.trim() || !finalUrl.startsWith('/')) {
      logger.error(
        '[CustomNavItemDialog] Name and a "/"-prefixed URL are required',
        { name, url }
      );
      return;
    }

    const itemData = {
      name: name.trim(),
      url: finalUrl,
      icon: selectedIcon,
      shortcut: shortcutKey ? formatShortcut(shortcutKey) : undefined,
    };

    if (editingItem) {
      updateCustomNavItem(editingItem.id, itemData);
    } else {
      const newId = addCustomNavItem(itemData);
      if (onAddedToSection && sectionId) {
        onAddedToSection(newId, sectionId);
      }
    }

    handleClose();
  };

  const handleClose = () => {
    setName('');
    setUrl('');
    setSelectedIcon('Home');
    setShortcutKey(null);
    setIconSearch('');
    onClose();
  };

  const handleShortcutRecorded = (key: ShortcutKey) => {
    setShortcutKey(key);
  };

  const handleShortcutReset = () => {
    setShortcutKey(null);
  };

  // Filter icons based on search
  const filteredCommonIcons = COMMON_ICONS.filter((iconName) =>
    iconName.toLowerCase().includes(iconSearch.toLowerCase())
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SelectedIconComponent = (Icons as any)[selectedIcon] || Icons.Home;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? 'Edit Custom Nav Item' : 'Add Custom Nav Item'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="nav-name">Name</Label>
            <Input
              id="nav-name"
              placeholder="e.g., Trading Strategy"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="nav-url">URL</Label>
            <Input
              id="nav-url"
              placeholder="e.g. /strategy"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => setUrl((prev) => sanitizeNavUrl(prev))}
              aria-invalid={Boolean(urlError)}
            />
            {urlError ? (
              <p className="text-xs text-destructive">{urlError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Must be an in-app path starting with &quot;/&quot;. Pasted
                app.gainium.io links are converted automatically.
              </p>
            )}
          </div>

          {/* Section picker (V1 layout only, new items only) */}
          {!editingItem && sections && sections.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="nav-section">Section</Label>
              <select
                id="nav-section"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Icon Picker */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-inner-container">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-muted">
                <SelectedIconComponent className="w-5 h-5 text-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{selectedIcon}</div>
                <div className="text-xs text-muted-foreground">
                  Selected icon
                </div>
              </div>
            </div>
            <Input
              placeholder="Search icons..."
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              className="mt-2"
            />
            <ScrollArea className="h-48 rounded-md border border-border p-2">
              <div className="grid grid-cols-8 gap-2">
                {filteredCommonIcons.map((iconName) => {
                  const IconComponent = Icons[iconName] || Icons.Home;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setSelectedIcon(iconName)}
                      className={`flex items-center justify-center w-10 h-10 rounded-md transition-colors ${
                        selectedIcon === iconName
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                      title={iconName}
                    >
                      <IconComponent className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Shortcut (optional) */}
          <div className="space-y-2">
            <Label htmlFor="nav-shortcut">Keyboard Shortcut (optional)</Label>
            <ShortcutRecorder
              id={tempShortcutId}
              label="Custom Nav Item Shortcut"
              autoRegister={false}
              onRecorded={handleShortcutRecorded}
              previewKey={shortcutKey}
              showReset={true}
              onReset={handleShortcutReset}
            />
            <p className="text-xs text-muted-foreground">
              Click the settings icon to record a keyboard shortcut
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {editingItem ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomNavItemDialog;
