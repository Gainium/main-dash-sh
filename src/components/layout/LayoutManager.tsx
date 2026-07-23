/* eslint-disable @typescript-eslint/no-explicit-any */
import { SHORTCUT_IDS } from '@/config/shortcuts';
import { logger } from '@/lib/loggerInstance';
import { showShortcutHint } from '@/lib/shortcutHints';
import {
  Download,
  Layout,
  Lock,
  RotateCcw,
  Save,
  Sparkles,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getLayoutDisplayInfo } from '../../hooks/useLayoutInfo';
import { useMultiDashboardBridge } from '../../hooks/useMultiDashboardBridge';
import { useMultiReportBridge } from '../../hooks/useMultiReportBridge';
import { useTradingBotStore } from '../../stores/botWidgetsStoreFactory';
import { useShortcutStore } from '../../stores/shortcutStore';
import { useTradingTerminalStore } from '../../stores/tradingTerminalStore';
import ShortcutChip from '../common/ShortcutChip';
import { Button } from '../ui/button';
import { InfoIcon, Tooltip } from '../ui/tooltip';
import { ConfirmationDialog, InputDialog } from '../ui/confirmation-dialog';
import {
  DetailDrawer,
  DetailDrawerBody,
  DetailDrawerContent,
  DetailDrawerHeader,
  DetailDrawerTitle,
  DetailDrawerTrigger,
} from '../ui/detail-drawer';

interface LayoutManagerProps {
  registry?: 'dashboard' | 'trading' | 'bot' | 'report';
  store?: any; // Optional store prop for bot registry
  variant?: 'drawer' | 'embedded';
}

const LayoutManager: React.FC<LayoutManagerProps> = ({
  registry = 'dashboard',
  store,
  variant = 'drawer',
}) => {
  useShortcutStore();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [layoutToDelete, setLayoutToDelete] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const isEmbedded = variant === 'embedded';

  // Always call all hooks, then select based on registry
  const tradingStore = useTradingTerminalStore();
  const defaultBotStore = useTradingBotStore();
  const multiDashboardBridge = useMultiDashboardBridge();
  const multiReportBridge = useMultiReportBridge();
  const isTrading = registry === 'trading';
  const isBot = registry === 'bot';
  const isReport = registry === 'report';

  // Select the appropriate store based on registry
  const selectedStore = isReport
    ? multiReportBridge
    : isTrading
      ? tradingStore
      : isBot
        ? store || defaultBotStore
        : multiDashboardBridge; // Use bridge for dashboard to support multi-dashboard

  // Extract layout methods and state from the selected store
  const {
    applyLayoutPreset,
    tidyUpLayout,
    saveLayout,
    loadLayout,
    deleteLayout,
    resetToLastSavedPreset,
    exportLayout,
    importLayout,
    savedLayouts,
    lastSavedPreset,
    isGridLayoutLocked,
    toggleGridLock,
  } = selectedStore;

  // Listen for external open events from navbar
  useEffect(() => {
    if (isEmbedded) return;
    const handleExternalOpen = (event: CustomEvent) => {
      // Only respond if the registry matches or if no registry is specified in event
      if (!event.detail?.registry || event.detail.registry === registry) {
        // Support both toggle and explicit open/close actions
        const action = event.detail?.action;
        if (action === 'toggle') {
          setIsOpen((prev) => !prev);
        } else if (action === 'close') {
          setIsOpen(false);
        } else {
          // Default behavior (existing) - always open
          setIsOpen(true);
        }
      }
    };

    window.addEventListener(
      'openLayoutManager',
      handleExternalOpen as EventListener
    );

    return () => {
      window.removeEventListener(
        'openLayoutManager',
        handleExternalOpen as EventListener
      );
    };
  }, [isEmbedded, registry]);

  const handlePresetSelect = (presetName: string) => {
    logger.info('Applying preset:', presetName);
    if (presetName === 'default') {
      applyLayoutPreset('default');
    } else {
      applyLayoutPreset(presetName);
    }
  };

  const handleTidyUp = () => {
    logger.info('Tidying up layout');
    tidyUpLayout();
  };

  const handleSaveLayout = () => {
    setSaveDialogOpen(true);
  };

  const handleSaveLayoutConfirm = (name: string) => {
    saveLayout(name);
  };

  const handleLoadLayout = (name: string) => {
    loadLayout(name);
  };

  const handleDeleteLayout = (name: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the load layout click
    setLayoutToDelete(name);
    setDeleteDialogOpen(true);
  };

  const handleDeleteLayoutConfirm = () => {
    if (layoutToDelete) {
      deleteLayout(layoutToDelete);
      setLayoutToDelete(null);
    }
  };

  const handleResetToSaved = () => {
    resetToLastSavedPreset();
    // Simple feedback without toast for now
    logger.info(
      lastSavedPreset
        ? `Reset to: ${lastSavedPreset}`
        : 'Reset to default layout'
    );
  };

  const handleExportLayout = () => {
    try {
      const layoutData = exportLayout();
      const blob = new Blob([layoutData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const pagePrefix = isTrading ? 'trading-terminal' : 'dashboard';
      a.download = `${pagePrefix}-layout-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logger.info('Layout exported successfully');
    } catch (error) {
      console.error('Failed to export layout:', error);
    }
  };

  const handleImportLayout = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) {
            const success = importLayout(content);
            if (success) {
              logger.info('Layout imported successfully');
            } else {
              console.error('Failed to import layout - invalid format');
            }
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const presetOptions = [
    {
      name: 'default',
      label: 'Default',
    },
  ];

  const content = (
    <div className="p-0 flex flex-col">
      {/* Layout Controls - Fixed at top */}
      <div className="shrink-0 p-sm border-b border-border">
        <div className="grid grid-cols-3 gap-sm">
          <div className="p-xs rounded-md bg-inner-container">
            <Tooltip
              tooltip="Lock the grid to prevent widgets from being dragged or resized. Unlock it to edit the layout again."
              tooltipURL="/help/custom-dashboards"
              triggerClassName="w-full"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleGridLock}
                className="w-full flex items-center justify-center gap-xs h-8 px-3 py-2 text-xs text-card-foreground hover:bg-muted/50 touch-manipulation"
              >
                {isGridLayoutLocked ? (
                  <>
                    <Lock className="h-4 w-4 text-primary" />
                    <span className="hidden sm:inline">Locked</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4 text-gradient-start dark:text-gradient-end" />
                    <span className="hidden sm:inline">Unlocked</span>
                  </>
                )}
              </Button>
            </Tooltip>
          </div>
          <div className="p-xs rounded-md bg-inner-container">
            <Tooltip
              tooltip="Save the current arrangement as a named layout. You can keep several layouts and switch between them anytime."
              tooltipURL="/help/custom-dashboards"
              triggerClassName="w-full"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveLayout}
                className="w-full flex items-center justify-center gap-xs h-8 px-3 py-2 text-xs text-card-foreground hover:bg-muted/50 touch-manipulation"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
              </Button>
            </Tooltip>
          </div>
          <div className="p-xs rounded-md bg-inner-container">
            <Tooltip
              tooltip="Automatically re-pack the layout: widgets reset to their default sizes, arrange compactly, and expand to fill leftover space."
              tooltipURL="/help/custom-dashboards"
              triggerClassName="w-full"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTidyUp}
                className="w-full flex items-center justify-center gap-xs h-8 px-3 py-2 text-xs text-card-foreground hover:bg-muted/50 touch-manipulation"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Tidy up</span>
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Content Area (scrolls only in drawer mode) */}
      <div
        className={
          isEmbedded ? 'overflow-visible' : 'flex-1 min-h-0 overflow-y-auto'
        }
      >
        {/* Layout Presets Section */}
        <div className="p-sm border-b border-border">
          <h4 className="font-medium text-sm mb-2 text-foreground flex items-center gap-xs">
            Layout Presets
            <Tooltip
              tooltip="Default restores the built-in widget set and arrangement for your screen size, replacing the current widgets. Save your layout first if you want a way back."
              tooltipURL="/help/custom-dashboards"
            >
              <InfoIcon />
            </Tooltip>
          </h4>
          <p className="text-xs text-muted-foreground mb-3">
            Choose a preset layout for your dashboard widgets
          </p>
          <div className="grid grid-cols-1 gap-sm">
            {presetOptions.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handlePresetSelect(preset.name)}
                className="text-left p-sm rounded-md border-2 border-border bg-inner-container hover:bg-muted transition-colors shadow-sm touch-manipulation"
              >
                <div className="font-medium text-sm text-card-foreground">
                  {preset.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Saved Layouts Section */}
        {savedLayouts &&
          Array.isArray(savedLayouts) &&
          savedLayouts.length > 0 && (
            <div className="p-sm border-b border-border">
              <h4 className="font-medium text-sm mb-3 text-foreground flex items-center gap-xs">
                Saved Layouts
                <Tooltip
                  tooltip="Click a layout to load it. Layouts remember the screen size they were created on, shown under each name."
                  tooltipURL="/help/custom-dashboards"
                >
                  <InfoIcon />
                </Tooltip>
              </h4>
              <div className="grid grid-cols-1 gap-sm">
                {savedLayouts.map((layout: any) => (
                  <div
                    key={layout.name}
                    className="relative text-left p-sm rounded-md border-2 border-border bg-inner-container hover:bg-muted transition-colors shadow-sm"
                  >
                    <button
                      onClick={() => handleLoadLayout(layout.name)}
                      className="w-full text-left pr-12 touch-manipulation"
                    >
                      <div className="font-medium text-sm text-card-foreground">
                        {layout.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Custom layout • {layout.widgets.length} widgets
                      </div>
                      {layout.screenSize && (
                        <div className="text-xs text-muted-foreground/70 font-mono mt-1">
                          {getLayoutDisplayInfo(layout)}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={(e) => handleDeleteLayout(layout.name, e)}
                      className="absolute top-3 right-3 p-xs rounded-sm hover:bg-destructive/20 transition-colors touch-manipulation"
                      title={`Delete ${layout.name}`}
                    >
                      <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Import/Export Section */}
        <div className="p-sm border-b border-border">
          <h4 className="font-medium text-sm mb-3 text-foreground flex items-center gap-xs">
            Import/Export
            <Tooltip
              tooltip="Export downloads this dashboard (widgets, settings, and arrangement) as a file. Import restores one — useful for backups or moving a dashboard between accounts."
              tooltipURL="/help/custom-dashboards"
            >
              <InfoIcon />
            </Tooltip>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportLayout}
              className="w-full flex items-center justify-center gap-xs h-12 touch-manipulation"
            >
              <Download className="h-4 w-4" />
              Export Layout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportLayout}
              className="w-full flex items-center justify-center gap-xs h-12 touch-manipulation"
            >
              <Upload className="h-4 w-4" />
              Import Layout
            </Button>
          </div>
        </div>

        {/* Reset Section */}
        <div className="p-sm">
          <Tooltip
            tooltip="Discard current changes and reload the layout you most recently saved. Falls back to the default layout if none was saved."
            tooltipURL="/help/custom-dashboards"
            triggerClassName="w-full"
          >
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetToSaved}
              className="w-full flex items-center justify-center gap-xs h-12 touch-manipulation"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Last Saved
            </Button>
          </Tooltip>
          {/* Bottom padding for scroll space */}
          <div className="h-6"></div>
        </div>
      </div>
    </div>
  );

  if (isEmbedded) {
    return (
      <>
        {content}

        {/* Save Layout Dialog */}
        <InputDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          title="Save Layout"
          description="Enter a name for this layout:"
          placeholder="Layout name"
          confirmText="Save"
          onConfirm={handleSaveLayoutConfirm}
          validator={(value) => {
            if (
              savedLayouts &&
              savedLayouts.some((layout: any) => layout.name === value)
            ) {
              return 'A layout with this name already exists. It will be overwritten.';
            }
            return null;
          }}
        />

        {/* Delete Layout Confirmation Dialog */}
        <ConfirmationDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Layout"
          description={
            layoutToDelete
              ? `Are you sure you want to delete the layout "${layoutToDelete}"? This action cannot be undone.`
              : ''
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="destructive"
          onConfirm={handleDeleteLayoutConfirm}
        />
      </>
    );
  }

  return (
    <>
      <DetailDrawer open={isOpen} onOpenChange={setIsOpen}>
        <DetailDrawerTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-8 w-8"
            data-tour="layout-manager"
            onClick={() => {
              showShortcutHint('toggleDashboardManager');
            }}
            title="Layout"
          >
            <Layout className="h-4 w-4" />
          </Button>
        </DetailDrawerTrigger>
        <DetailDrawerContent
          className="w-full sm:max-w-md lg:max-w-lg"
          width="lg"
          data-tour="layout-manager-content"
        >
          <DetailDrawerHeader>
            <DetailDrawerTitle>
              <span className="flex items-center gap-xs">
                Layout Manager
                <ShortcutChip id={SHORTCUT_IDS.ManagerLayout} muted />
              </span>
            </DetailDrawerTitle>
          </DetailDrawerHeader>
          <DetailDrawerBody className="p-0 flex flex-col">
            {content}
          </DetailDrawerBody>
        </DetailDrawerContent>
      </DetailDrawer>

      {/* Save Layout Dialog */}
      <InputDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        title="Save Layout"
        description="Enter a name for this layout:"
        placeholder="Layout name"
        confirmText="Save"
        onConfirm={handleSaveLayoutConfirm}
        validator={(value) => {
          if (
            savedLayouts &&
            savedLayouts.some((layout: any) => layout.name === value)
          ) {
            return 'A layout with this name already exists. It will be overwritten.';
          }
          return null;
        }}
      />

      {/* Delete Layout Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Layout"
        description={
          layoutToDelete
            ? `Are you sure you want to delete the layout "${layoutToDelete}"? This action cannot be undone.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDeleteLayoutConfirm}
      />
    </>
  );
};

export default LayoutManager;
