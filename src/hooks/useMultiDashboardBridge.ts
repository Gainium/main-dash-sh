import { useMemo } from 'react';
import { useDashboardStore } from '../stores/dashboardStore';
import { useMultiDashboardStore } from '../stores/multiDashboardStore';

/**
 * Bridge hook that adapts the multi-dashboard store to work with the existing dashboard widget system.
 * This allows us to gradually migrate from single to multi-dashboard without breaking existing functionality.
 */
export const useMultiDashboardBridge = () => {
  const multiDashboardStore = useMultiDashboardStore();
  const fallbackDashboardStore = useDashboardStore();

  // Get current dashboard from multi-dashboard store
  const currentDashboard = multiDashboardStore.getCurrentDashboard();

  // If we don't have any dashboards in the multi-dashboard store, use the fallback single dashboard store.
  // Only once rehydration has finished: the multi-dashboard store persists to
  // IndexedDB (async), so before that `dashboards` is always `[]` and falling
  // back here made `useWidgetPage` call the LEGACY store's
  // initializeDefaultWidgets() on every page load — which applies its default
  // layout and calls cleanupOrphanedSettings() with the legacy default widget
  // ids, deleting the persisted settings of the real widgets (whose ids never
  // match). That silently reset per-widget state such as the Advanced Bot
  // Stats bot selection on every refresh.
  const shouldUseFallback =
    multiDashboardStore._hasHydrated &&
    multiDashboardStore.dashboards.length === 0 &&
    !currentDashboard;

  // Create a bridge interface that matches the dashboard store interface
  const bridgeStore = useMemo(() => {
    if (shouldUseFallback) {
      // Return the fallback single dashboard store
      return fallbackDashboardStore;
    }

    // Return a proxy that uses the current dashboard from multi-dashboard store
    return {
      // Dashboard state - proxy to current dashboard
      isGridLayoutLocked: currentDashboard?.isGridLayoutLocked || false,
      isStickyHeader: fallbackDashboardStore.isStickyHeader, // This is a UI setting, keep from single store
      widgets: currentDashboard?.widgets || [],
      currentLayout: currentDashboard?.currentLayout || [],
      savedLayouts: currentDashboard?.savedLayouts || [],
      lastSavedPreset: currentDashboard?.lastSavedPreset || null,
      isUsingDefaultLayout: currentDashboard?.isUsingDefaultLayout || false,

      // Actions - proxy to multi-dashboard store
      toggleGridLock: multiDashboardStore.toggleGridLock,
      toggleStickyHeader: fallbackDashboardStore.toggleStickyHeader, // Keep from single store
      updateLayout: multiDashboardStore.updateLayout,
      addWidget: multiDashboardStore.addWidget,
      removeWidget: multiDashboardStore.removeWidget,
      updateWidget: multiDashboardStore.updateWidget,
      reorderWidgets: multiDashboardStore.reorderWidgets,
      initializeDefaultWidgets: multiDashboardStore.initializeDefaultWidgets,
      applyLayoutPreset: multiDashboardStore.applyLayoutPreset,
      resetLayout: multiDashboardStore.resetLayout,
      tidyUpLayout: multiDashboardStore.tidyUpLayout,
      saveLayout: multiDashboardStore.saveLayout,
      loadLayout: multiDashboardStore.loadLayout,
      deleteLayout: multiDashboardStore.deleteLayout,
      resetToLastSavedPreset: multiDashboardStore.resetToLastSavedPreset,
      exportLayout: multiDashboardStore.exportLayout,
      importLayout: multiDashboardStore.importLayout,
      adjustLayoutForCurrentScreen:
        multiDashboardStore.adjustLayoutForCurrentScreen,
      markLayoutAsCustomized: multiDashboardStore.markLayoutAsCustomized,
    };
  }, [
    shouldUseFallback,
    fallbackDashboardStore,
    currentDashboard,
    multiDashboardStore,
  ]);

  return bridgeStore;
};
