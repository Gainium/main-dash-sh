import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Layout } from 'react-grid-layout';
import {
  getWidgetMetadata,
  type WidgetType,
} from '../components/widgets/dashboard';
import type { WidgetMenuActions } from '../components/widgets/WidgetWrapper';
import type { ReportWidgetConfig } from '../reports/types/reportWidget';
import {
  useDashboardStore,
  type WidgetConfig as DashboardWidgetConfig,
} from '../stores/dashboardStore';
import { useWidgetSettingsStore } from '../stores/widgetSettingsStore';
import { useMultiDashboardBridge } from './useMultiDashboardBridge';
import { useMultiReportBridge } from './useMultiReportBridge';

type GridWidgetConfig = DashboardWidgetConfig | ReportWidgetConfig;

interface UseGridLayoutProps {
  registry: 'dashboard' | 'report';
}

/**
 * Comprehensive hook that provides all grid layout functionality including:
 * - Store management and selection
 * - Layout state and manipulation
 * - Widget management (add, remove, update, duplicate)
 * - Tab management (move, reorder)
 * - Collapse/expand functionality
 * - Layout compaction and optimization
 * - Resize handling
 * - Menu actions
 * - Widget rendering utilities
 */
export const useGridLayout = ({ registry }: UseGridLayoutProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Always call all hooks unconditionally
  const dashboardStore = useDashboardStore();
  const multiDashboardBridge = useMultiDashboardBridge();
  const multiReportBridge = useMultiReportBridge();
  const isDashboard = registry === 'dashboard';
  const isReport = registry === 'report';

  // Select the appropriate store based on registry
  const selectedStore = isDashboard
    ? multiDashboardBridge
    : isReport
      ? multiReportBridge
      : dashboardStore;

  // Extract store values
  const widgets = useMemo(() => selectedStore.widgets, [selectedStore.widgets]);

  // Always-latest widgets, read at call time by stable handlers that must not
  // list `widgets` as a dep (otherwise they'd churn on every add/remove and
  // bust the per-widget menuActions cache below).
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const isGridLayoutLocked = selectedStore.isGridLayoutLocked;

  const updateLayout = useMemo(
    () => selectedStore.updateLayout,
    [selectedStore.updateLayout]
  );

  const currentLayout = useMemo(
    () => selectedStore.currentLayout,
    [selectedStore.currentLayout]
  );

  const updateWidget = useMemo(
    () => selectedStore.updateWidget,
    [selectedStore.updateWidget]
  );

  const removeWidget = useMemo(
    () => selectedStore.removeWidget,
    [selectedStore.removeWidget]
  );

  const addWidget = useMemo(
    () => selectedStore.addWidget,
    [selectedStore.addWidget]
  );

  const markLayoutAsCustomized = useMemo(
    () => selectedStore.markLayoutAsCustomized,
    [selectedStore.markLayoutAsCustomized]
  );

  // Additional store actions for dashboard and reports
  const toggleGridLock = selectedStore.toggleGridLock;
  const tidyUpLayout = selectedStore.tidyUpLayout;
  const resetLayout = selectedStore.resetLayout;
  const saveLayout = selectedStore.saveLayout;
  const loadLayout = selectedStore.loadLayout;
  const deleteLayout = selectedStore.deleteLayout;
  const exportLayout = selectedStore.exportLayout;
  const importLayout = selectedStore.importLayout;
  const applyLayoutPreset = selectedStore.applyLayoutPreset;
  const adjustLayoutForCurrentScreen =
    selectedStore.adjustLayoutForCurrentScreen;
  const reorderWidgets = selectedStore.reorderWidgets;
  const savedLayouts = selectedStore.savedLayouts || [];
  const resetToLastSavedPreset = selectedStore.resetToLastSavedPreset;

  // Get widget settings store for original heights
  const {
    setWidgetOriginalHeight,
    getWidgetOriginalHeight,
    getWidgetCollapsed,
    setWidgetCollapsed,
  } = useWidgetSettingsStore();

  // Apply collapsed states and compact layout
  const applyCollapsedStatesAndCompact = useCallback(
    (layout: Layout[]) => {
      const adjustedLayout = layout.map((item) => {
        const isCollapsed = getWidgetCollapsed(item.i);
        if (isCollapsed && item.h !== 0.75) {
          // Widget should be collapsed but isn't in the layout
          return { ...item, h: 0.75 };
        }
        return item;
      });

      return adjustedLayout;
    },
    [getWidgetCollapsed]
  );

  // Initialize current layout from widgets on mount if currentLayout is empty
  useEffect(() => {
    if (widgets.length > 0 && currentLayout.length === 0) {
      const initialLayout = widgets.map(
        (widget: GridWidgetConfig) => widget.layoutData
      );
      const adjustedLayout = applyCollapsedStatesAndCompact(initialLayout);
      updateLayout(adjustedLayout);

      // Update widget layout data to match the adjusted layout
      adjustedLayout.forEach((item: Layout) => {
        updateWidget(item.i, {
          layoutData: { ...item },
        });
      });
    }
  }, [
    widgets,
    currentLayout,
    updateLayout,
    applyCollapsedStatesAndCompact,
    updateWidget,
  ]);

  // Memoize widget IDs to detect when widgets are added/removed without reacting to layout changes
  const widgetIds = useMemo(
    () =>
      widgets
        .map((w: GridWidgetConfig) => w.id)
        .sort()
        .join(','),
    [widgets]
  );

  // Update layout when widgets are added or removed
  useEffect(() => {
    if (widgets.length > 0) {
      const currentWidgetIds = new Set(
        widgets.map((w: GridWidgetConfig) => w.id)
      );
      const layoutIds = new Set(currentLayout.map((l: Layout) => l.i));

      // Check if there are new widgets not in current layout
      const hasNewWidgets = widgets.some(
        (widget: GridWidgetConfig) => !layoutIds.has(widget.id)
      );
      const hasRemovedWidgets = currentLayout.some(
        (layout: Layout) => !currentWidgetIds.has(layout.i)
      );

      if (hasNewWidgets || hasRemovedWidgets) {
        const newLayout = widgets.map(
          (widget: GridWidgetConfig) => widget.layoutData
        );
        const adjustedLayout = applyCollapsedStatesAndCompact(newLayout);
        updateLayout(adjustedLayout);

        // Update widget layout data to match the adjusted layout
        adjustedLayout.forEach((item: Layout) => {
          updateWidget(item.i, {
            layoutData: { ...item },
          });
        });
      }
    }
  }, [
    widgetIds,
    updateLayout,
    applyCollapsedStatesAndCompact,
    updateWidget,
    currentLayout,
    widgets,
  ]);

  // Handle layout changes
  const handleLayoutChange = useCallback(
    (layout: Layout[]) => {
      updateLayout(layout);

      // Update each widget's layoutData to match the new layout
      layout.forEach((layoutItem) => {
        const widget = widgets.find(
          (w: GridWidgetConfig) => w.id === layoutItem.i
        );
        if (widget) {
          // Check if any layout property has changed
          const hasChanged =
            widget.layoutData.x !== layoutItem.x ||
            widget.layoutData.y !== layoutItem.y ||
            widget.layoutData.w !== layoutItem.w ||
            widget.layoutData.h !== layoutItem.h;

          if (hasChanged) {
            updateWidget(widget.id, {
              layoutData: { ...layoutItem },
            });
          }
        }
      });
    },
    [updateLayout, widgets, updateWidget]
  );

  // Manual compaction algorithm
  const compactLayout = useCallback((layout: Layout[]) => {
    const sortedLayout = [...layout].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const compacted: Layout[] = [];

    for (const item of sortedLayout) {
      const newItem = { ...item };

      // Find the highest Y position this item can be placed at
      let targetY = 0;

      for (let y = 0; y < newItem.y + newItem.h; y++) {
        let canPlace = true;

        // Check if placing at this Y would collide with existing items
        for (const placedItem of compacted) {
          if (
            newItem.x < placedItem.x + placedItem.w &&
            newItem.x + newItem.w > placedItem.x &&
            y < placedItem.y + placedItem.h &&
            y + newItem.h > placedItem.y
          ) {
            canPlace = false;
            break;
          }
        }

        if (canPlace) {
          targetY = y;
          break;
        } else {
          targetY = y + 1;
        }
      }

      newItem.y = targetY;
      compacted.push(newItem);
    }

    return compacted;
  }, []);

  // Apply collapsed states when component mounts or widgets change
  useEffect(() => {
    if (widgets.length > 0 && currentLayout.length > 0) {
      let hasCollapsedWidgets = false;
      const adjustedLayout = currentLayout.map((item: Layout) => {
        const isCollapsed = getWidgetCollapsed(item.i);
        if (isCollapsed && item.h !== 0.75) {
          hasCollapsedWidgets = true;
          return { ...item, h: 0.75 };
        }
        return item;
      });

      if (hasCollapsedWidgets) {
        const compactedLayout = compactLayout(adjustedLayout);
        updateLayout(compactedLayout);

        // Update widget layout data to match the compacted layout
        compactedLayout.forEach((item: Layout) => {
          updateWidget(item.i, {
            layoutData: { ...item },
          });
        });
      }
    }
  }, [
    widgets,
    currentLayout,
    getWidgetCollapsed,
    compactLayout,
    updateLayout,
    updateWidget,
  ]);

  // Handle widget collapse
  const handleWidgetCollapse = useCallback(
    (widgetId: string, collapsed: boolean) => {
      const layout = [...currentLayout];
      const layoutItem = layout.find((item) => item.i === widgetId);

      if (layoutItem) {
        // Store original height if not already stored
        const existingOriginalHeight = getWidgetOriginalHeight(widgetId);
        if (existingOriginalHeight === undefined) {
          setWidgetOriginalHeight(widgetId, layoutItem.h);
        }

        // Update collapsed state in widget settings FIRST
        setWidgetCollapsed(widgetId, collapsed);

        // Set height to 0.75 when collapsed (60px with rowHeight 80), restore original when expanded
        const originalHeight =
          getWidgetOriginalHeight(widgetId) || layoutItem.h;
        layoutItem.h = collapsed ? 0.75 : originalHeight;

        // Update the layout - react-grid-layout will handle compaction automatically
        // because compactType="vertical" is set
        updateLayout(layout);

        // Update the specific widget's layoutData
        const widget = widgets.find((w: GridWidgetConfig) => w.id === widgetId);
        if (widget) {
          updateWidget(widgetId, {
            layoutData: {
              ...widget.layoutData,
              h: layoutItem.h,
            },
          });
        }
      }
    },
    [
      currentLayout,
      updateLayout,
      updateWidget,
      getWidgetOriginalHeight,
      setWidgetOriginalHeight,
      setWidgetCollapsed,
      widgets,
    ]
  );

  // Widget menu actions handlers
  const handleDeleteWidget = useCallback(
    (widgetId: string) => {
      removeWidget(widgetId);
    },
    [removeWidget]
  );

  const handleDuplicateWidget = useCallback(
    (widgetId: string) => {
      const widget = widgetsRef.current.find(
        (w: GridWidgetConfig) => w.id === widgetId
      );
      if (widget) {
        const newId = `${widget.type}-${Date.now()}`;

        // Get the proper height for the duplicated widget
        // If the original widget is collapsed (h = 1), use its original height
        let duplicateHeight = widget.layoutData.h;
        if (widget.layoutData.h === 1) {
          // Widget is collapsed, get original height from store or default
          const originalHeight = getWidgetOriginalHeight(widgetId);
          if (originalHeight) {
            duplicateHeight = originalHeight;
          } else {
            // Fallback to widget metadata default height
            try {
              const metadata = getWidgetMetadata(widget.type as WidgetType);
              duplicateHeight = metadata.defaultSize.h;
            } catch {
              // Final fallback if metadata lookup fails
              duplicateHeight = 4;
            }
          }
        }

        const newWidget: GridWidgetConfig = {
          ...widget,
          id: newId,
          title: `${widget.title} (Copy)`,
          layoutData: {
            ...widget.layoutData,
            i: newId,
            x: (widget.layoutData.x + widget.layoutData.w) % 12,
            y: widget.layoutData.y + 1,
            h: duplicateHeight, // Use the proper height
          },
        };
        (
          addWidget as (
            widget: GridWidgetConfig | Record<string, unknown>
          ) => void
        )(newWidget);
      }
    },
    [addWidget, getWidgetOriginalHeight]
  );

  // Create menu actions for a specific widget. Returns a STABLE object per
  // widget.id: `createMenuActions(widget)` used to mint a fresh object on every
  // render, which defeated every downstream widget's React.memo (and its
  // wrapperProps memo). The factory caches per id in a Map that is rebuilt only
  // when the underlying handlers change identity (both are now stable), so the
  // same widget gets the same menuActions reference across renders.
  const createMenuActions = useMemo(() => {
    const cache = new Map<string, WidgetMenuActions>();
    return (widget: GridWidgetConfig): WidgetMenuActions => {
      let actions = cache.get(widget.id);
      if (!actions) {
        actions = {
          onDelete: () => handleDeleteWidget(widget.id),
          onDuplicate: () => handleDuplicateWidget(widget.id),
          onOptions: () => {
            // Trigger the widget's options handler if it has one
            // This will be handled by the individual widget components
          },
        };
        cache.set(widget.id, actions);
      }
      return actions;
    };
  }, [handleDeleteWidget, handleDuplicateWidget]);

  // Simplified resize handlers - no aggressive scroll blocking
  const handleResizeStart = useCallback(() => {
    // Just prevent smooth scrolling during resize
    if (containerRef.current) {
      containerRef.current.style.scrollBehavior = 'auto';
    }
    const mainContent = document.querySelector(
      '[data-main-content]'
    ) as HTMLElement;
    if (mainContent) {
      mainContent.style.scrollBehavior = 'auto';
    }
  }, []);

  // Handle resize stop - restore scrolling
  const handleResizeStop = useCallback(
    (layout: Layout[], oldItem: Layout, newItem: Layout) => {
      // Restore smooth scrolling
      if (containerRef.current) {
        containerRef.current.style.scrollBehavior = '';
      }
      const mainContent = document.querySelector(
        '[data-main-content]'
      ) as HTMLElement;
      if (mainContent) {
        mainContent.style.scrollBehavior = '';
      }

      // Track custom sizes when user manually resizes
      if (
        oldItem &&
        newItem &&
        (oldItem.w !== newItem.w || oldItem.h !== newItem.h)
      ) {
        const { setWidgetCustomSize } = useWidgetSettingsStore.getState();
        setWidgetCustomSize(newItem.i, newItem.w, newItem.h);

        // Mark layout as customized since user manually resized a widget
        markLayoutAsCustomized();

        // Only update the specific widget that was resized, not the entire layout
        // This preserves the default responsive heights of other widgets
        const updatedLayout = currentLayout.map((item: Layout) =>
          item.i === newItem.i
            ? {
                ...item,
                w: newItem.w,
                h: newItem.h,
                x: newItem.x,
                y: newItem.y,
              }
            : item
        );

        // Update only with the manually resized widget, preserving others
        updateLayout(updatedLayout);

        // Also update the widget's layoutData to ensure persistence
        const resizedWidget = widgets.find(
          (w: GridWidgetConfig) => w.id === newItem.i
        );
        if (resizedWidget) {
          updateWidget(resizedWidget.id, {
            layoutData: {
              ...resizedWidget.layoutData,
              w: newItem.w,
              h: newItem.h,
              x: newItem.x,
              y: newItem.y,
            },
          });
        }
      } else {
        // If no resize occurred, process normally
        handleLayoutChange(layout);
      }
    },
    [
      handleLayoutChange,
      markLayoutAsCustomized,
      currentLayout,
      updateLayout,
      widgets,
      updateWidget,
    ]
  );

  // Widget component rendering utility
  const getWidgetComponent = useCallback(
    (_widget: GridWidgetConfig) => {
      // All widgets are handled directly in the GridLayout component
      return null;
    },
    [
      /* registry */
    ]
  );

  // Default breakpoints and column counts for responsive design
  const gridConfig = {
    breakpoints: {
      lg: 1200,
      md: 996,
      sm: 768,
      xs: 480,
      xxs: 0,
    },
    cols: {
      lg: 12,
      md: 12,
      sm: 12,
      xs: 12,
      xxs: 12,
    },
  };

  return {
    // Store state
    widgets,
    currentLayout,
    isGridLayoutLocked,
    savedLayouts,

    // Store actions
    updateLayout,
    updateWidget,
    addWidget,
    removeWidget,
    toggleGridLock,
    markLayoutAsCustomized,
    reorderWidgets,
    tidyUpLayout,
    resetLayout,
    saveLayout,
    loadLayout,
    deleteLayout,
    exportLayout,
    importLayout,
    applyLayoutPreset,
    adjustLayoutForCurrentScreen,
    resetToLastSavedPreset,

    // Layout handlers
    handleLayoutChange,
    handleWidgetCollapse,
    handleDeleteWidget,
    handleDuplicateWidget,
    createMenuActions,
    handleResizeStart,
    handleResizeStop,

    // Utilities
    compactLayout,
    applyCollapsedStatesAndCompact,
    getWidgetComponent,

    // Configuration
    gridConfig,
    containerRef,

    // Registry info
    registry,
  };
};
