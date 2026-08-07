import ShortcutChip from '@/components/common/ShortcutChip';
import { SHORTCUT_IDS } from '@/config/shortcuts';
import { showShortcutHint } from '@/lib/shortcutHints';
import { type ShortcutKey, useShortcutStore } from '@/stores/shortcutStore';
import { LayoutDashboard } from 'lucide-react';
import React from 'react';
import DashboardManager from '../components/dashboard/DashboardManager';
import { DropdownMenuItem } from '../components/ui/dropdown-menu';
import {
  ShortcutPriority,
  useKeyboardShortcuts,
} from './useKeyboardShortcutManager';
import { useMultiDashboardBridge } from './useMultiDashboardBridge';
import { useMultiReportBridge } from './useMultiReportBridge';

interface UsePageActionsProps {
  registry: 'dashboard' | 'report';
  showNavigationSection?: boolean; // Whether to show navigation widgets section in widget manager
}

/**
 * Hook to provide comprehensive page actions including:
 * - Store selection and actions
 * - Layout management utilities
 * - Grid lock toggle functionality
 * Used across dashboard, trading terminal, and bot pages for consistency
 */
export const usePageActions = ({
  registry,
  showNavigationSection = false,
}: UsePageActionsProps) => {
  // Get appropriate store based on registry
  const multiDashboardBridge = useMultiDashboardBridge();
  const multiReportBridge = useMultiReportBridge();

  const selectedStore =
    registry === 'dashboard' ? multiDashboardBridge : multiReportBridge;

  // Extract store actions and state
  const {
    isGridLayoutLocked,
    toggleGridLock,
    tidyUpLayout,
    resetLayout,
    saveLayout,
    loadLayout,
    deleteLayout,
    exportLayout,
    importLayout,
    applyLayoutPreset,
    savedLayouts,
    resetToLastSavedPreset,
  } = selectedStore;

  const handleOpenDashboardManager = React.useCallback(
    (fromKeyboard = false) => {
      if (!fromKeyboard) {
        showShortcutHint('toggleDashboardManager');
      }
      // Dispatch appropriate event based on registry
      const eventName =
        registry === 'report' ? 'openReportManager' : 'openDashboardManager';
      const actionName =
        registry === 'report'
          ? 'toggleReportManager'
          : 'toggleDashboardManager';
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { action: actionName, registry },
        })
      );
    },
    [registry]
  );

  // Wrapper functions for UI interactions (always show hints)
  const handleOpenDashboardManagerClick = React.useCallback(
    () => handleOpenDashboardManager(false),
    [handleOpenDashboardManager]
  );

  // Functions for keyboard shortcuts (never show hints)
  const handleOpenDashboardManagerKeyboard = React.useCallback(
    () => handleOpenDashboardManager(true),
    [handleOpenDashboardManager]
  );

  // Shortcut key from store for dashboard manager (display handled by ShortcutChip)
  const dashboardKey = useShortcutStore(
    (s) => s.shortcuts[SHORTCUT_IDS.ManagerDashboard]?.currentKey
  );

  // No-op

  // Page actions component (for desktop)
  const pageActions = React.useMemo(
    () => (
      <div
        className="flex items-center gap-xs"
        data-tour="page-actions"
      >
        <DashboardManager
          registry={registry}
          showNavigationSection={showNavigationSection}
        />
      </div>
    ),
    [registry, showNavigationSection]
  );

  // Mobile actions component
  const mobileActions = React.useMemo(
    () => (
      <>
        <DropdownMenuItem
          onSelect={handleOpenDashboardManagerClick}
          data-tour="mobile-dashboard-manager"
        >
          <div className="flex items-center gap-xs w-full">
            <LayoutDashboard className="h-4 w-4" />
            <span className="flex-1">
              {registry === 'report' ? 'Report Manager' : 'Dashboard Manager'}
            </span>
            <ShortcutChip
              id={SHORTCUT_IDS.ManagerDashboard}
              variant="text"
              className="text-xs opacity-60"
            />
          </div>
        </DropdownMenuItem>
      </>
    ),
    [handleOpenDashboardManagerClick, registry]
  );

  // Layout management utilities
  const layoutActions = React.useMemo(
    () => ({
      toggleGridLock,
      tidyUpLayout,
      resetLayout,
      saveLayout,
      loadLayout,
      deleteLayout,
      exportLayout,
      importLayout,
      applyLayoutPreset,
      resetToLastSavedPreset,
    }),
    [
      toggleGridLock,
      tidyUpLayout,
      resetLayout,
      saveLayout,
      loadLayout,
      deleteLayout,
      exportLayout,
      importLayout,
      applyLayoutPreset,
      resetToLastSavedPreset,
    ]
  );

  // Layout state
  const layoutState = React.useMemo(
    () => ({
      isGridLayoutLocked,
      savedLayouts: savedLayouts || [],
    }),
    [isGridLayoutLocked, savedLayouts]
  );

  // Register page-specific keyboard shortcuts using user-customized keys from store
  const pageShortcuts = React.useMemo(() => {
    // Fallback default for dashboard manager if store hasn't registered yet
    const defaultDashboardKey: ShortcutKey = {
      key: 'd',
      modifiers: { cmd: true },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shortcuts = [] as Array<any>;

    if (registry === 'dashboard') {
      shortcuts.push({
        key: (dashboardKey || defaultDashboardKey).key.toLowerCase(),
        modifiers: {
          cmd: !!(dashboardKey || defaultDashboardKey).modifiers.cmd,
          ctrl: !!(dashboardKey || defaultDashboardKey).modifiers.ctrl,
          shift: !!(dashboardKey || defaultDashboardKey).modifiers.shift,
          alt: !!(dashboardKey || defaultDashboardKey).modifiers.alt,
        },
        callback: handleOpenDashboardManagerKeyboard,
        priority: ShortcutPriority.PAGE,
        enabled: true,
        allowInInputs: false,
      });
    }

    return shortcuts;
  }, [dashboardKey, handleOpenDashboardManagerKeyboard, registry]);

  useKeyboardShortcuts(pageShortcuts, `page-actions-${registry}`);

  return {
    // Main page actions component
    pageActions,

    // Mobile actions component
    mobileActions,

    // Store reference
    store: selectedStore,

    // Layout management actions
    layoutActions,

    // Layout state
    layoutState,

    // Registry info
    registry,
  };
};
