import { getDashboardShortcutId } from '@/lib/dashboardShortcuts';
import { logger } from '@/lib/loggerInstance';
import { track as analyticsTrack } from '@/lib/analytics';
import { createIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import { pouchdbSync } from '@/lib/zustand-pouchdb-middleware';
import type { Layout } from 'react-grid-layout';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { tidyLayout } from '../components/layout/TidyLayoutEngine';
import {
  getCurrentBreakpoint,
  getDefaultLayoutWidgetsByWidth,
  getDefaultWidgetSize,
} from '../components/widgets/DefaultWidgetSizes';
import {
  getWidgetMetadata,
  isWidgetTypeAvailable,
  type WidgetType,
} from '../components/widgets/dashboard';
import type { SavedLayout } from '../types/layout';
import { getEnhancedScreenSize, getScreenSize } from '../utils/screenSize';
import type { WidgetConfig, WidgetTab } from './dashboardStore';
import {
  getAllDashboardTemplates,
  getDashboardTemplate,
  type DashboardTemplate,
} from './dashboardTemplates';
import { useShortcutStore } from './shortcutStore';
import { useWidgetSettingsStore } from './widgetSettingsStore';

// Utility function to create URL-safe slugs from dashboard names
export const createDashboardSlug = (name: string): string => {
  // Handle undefined, null, or empty names
  if (!name || typeof name !== 'string') {
    return 'untitled-dashboard';
  }

  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim() // Remove leading/trailing whitespace
      .replace(
        /^[\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2212]+|[\u002D\u2010\u2011\u2012\u2013\u2014\u2015\u2212]+$/g,
        ''
      ) || // Remove leading/trailing hyphens
    'untitled-dashboard'
  ); // Fallback if result is empty
};

// Utility function to find dashboard by slug
export const findDashboardBySlug = (
  dashboards: DashboardConfig[],
  slug: string
): DashboardConfig | undefined => {
  return dashboards.find(
    (dashboard) => createDashboardSlug(dashboard.name) === slug
  );
};

export interface DashboardConfig {
  id: string;
  name: string;
  isGridLayoutLocked: boolean;
  widgets: WidgetConfig[];
  currentLayout: Layout[];
  savedLayouts: SavedLayout<WidgetConfig>[];
  lastSavedPreset: string | null;
  isUsingDefaultLayout: boolean;
  isIntentionallyEmpty?: boolean; // Flag to prevent auto-initialization of widgets
  layoutBreakpoint?: string; // Breakpoint (lg, md, sm, xs, xxs) that the current layout/widget sizes were created for
  createdAt: number;
  updatedAt: number;
}

interface MultiDashboardState {
  // Dashboard management
  dashboards: DashboardConfig[];
  currentDashboardId: string;

  // Actions
  createDashboard: (name?: string, skipDefaultWidgets?: boolean) => string;
  deleteDashboard: (dashboardId: string) => boolean;
  switchDashboard: (dashboardId: string) => boolean;
  renameDashboard: (dashboardId: string, name: string) => boolean;
  cloneDashboard: (dashboardId: string, name?: string) => string;
  reorderDashboards: (fromIndex: number, toIndex: number) => void;
  createInitialDashboards: () => void; // New method for creating 3 default dashboards

  // Get current dashboard
  getCurrentDashboard: () => DashboardConfig | null;

  // Dashboard-specific actions (proxy to current dashboard)
  toggleGridLock: () => void;
  updateLayout: (newLayout: Layout[]) => void;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (widgetId: string, updates: Partial<WidgetConfig>) => void;
  reorderWidgets: (activeId: string, overId: string) => void;
  initializeDefaultWidgets: () => void;
  applyLayoutPreset: (presetName: string) => void;
  resetLayout: () => void;
  tidyUpLayout: () => void;
  saveLayout: (name: string) => void;
  loadLayout: (name: string) => void;
  deleteLayout: (name: string) => void;
  resetToLastSavedPreset: () => void;
  exportLayout: () => string;
  importLayout: (layoutData: string) => boolean;
  adjustLayoutForCurrentScreen: () => void;
  markLayoutAsCustomized: () => void;

  // Template functionality
  getAvailableTemplates: () => DashboardTemplate[];
  createDashboardFromTemplate: (
    templateId: string,
    customName?: string
  ) => string;
  applyTemplateToCurrentDashboard: (templateId: string) => void;

  // Tab management
  addTab: (widgetId: string, tab: WidgetTab) => void;
  removeTab: (widgetId: string, tabId: string) => void;
  moveTab: (
    fromWidgetId: string,
    toWidgetId: string,
    tabId: string,
    toIndex?: number
  ) => void;
  reorderTabs: (widgetId: string, fromIndex: number, toIndex: number) => void;
  updateTab: (
    widgetId: string,
    tabId: string,
    updates: Partial<WidgetTab>
  ) => void;
}

// Helper function to create a new dashboard
const createNewDashboard = (
  id: string,
  name: string,
  isIntentionallyEmpty: boolean = false
): DashboardConfig => {
  const now = Date.now();
  const containerWidth =
    typeof window !== 'undefined' ? window.innerWidth - 64 : 1200;
  const currentBreakpoint = getCurrentBreakpoint(containerWidth);
  return {
    id,
    name,
    isGridLayoutLocked: false,
    widgets: [],
    currentLayout: [],
    savedLayouts: [],
    lastSavedPreset: null,
    isUsingDefaultLayout: false,
    isIntentionallyEmpty,
    layoutBreakpoint: currentBreakpoint,
    createdAt: now,
    updatedAt: now,
  };
};

// Helper function to generate unique dashboard name
const generateUniqueDashboardName = (
  dashboards: DashboardConfig[],
  baseName: string = 'New Dashboard'
): string => {
  const existingNames = new Set(dashboards.map((d) => d.name));

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  while (existingNames.has(`${baseName} ${counter}`)) {
    counter++;
  }

  return `${baseName} ${counter}`;
};

export const useMultiDashboardStore = create<MultiDashboardState>()(
  pouchdbSync(
    devtools(
      persist(
        (set, get) => ({
          // Initial state
          dashboards: [],
          currentDashboardId: '',

          // Dashboard management actions
          createDashboard: (name, skipDefaultWidgets = false) => {
            const state = get();
            const dashboardName =
              name || generateUniqueDashboardName(state.dashboards);

            // Prevent creating dashboards with reserved names
            if (dashboardName.toLowerCase() === 'tour') {
              throw new Error(
                'Dashboard name "tour" is reserved. Please choose a different name.'
              );
            }

            const sanitizedName = dashboardName
              .toLowerCase()
              .replace(/\s+/g, '_');
            const newId = `dashboard_${sanitizedName}_${Date.now()}`;

            const newDashboard = createNewDashboard(
              newId,
              dashboardName,
              skipDefaultWidgets
            );

            set({
              dashboards: [...state.dashboards, newDashboard],
              currentDashboardId: newId,
            });

            logger.info(`Created new dashboard: ${dashboardName} (${newId})`);

            // Track dashboard creation
            analyticsTrack('dashboard_created', {
              location: 'dashboard_manager',
              dashboard_name: dashboardName,
              is_default: !skipDefaultWidgets,
            });

            // Initialize with default widgets only if not skipped
            if (!skipDefaultWidgets) {
              setTimeout(() => {
                get().initializeDefaultWidgets();
              }, 0);
            }

            return newId;
          },

          deleteDashboard: (dashboardId) => {
            const state = get();

            // Cannot delete if it's the only dashboard
            if (state.dashboards.length <= 1) {
              logger.warn('Cannot delete the only dashboard');
              return false;
            }

            // Cannot delete if dashboard doesn't exist
            const dashboardIndex = state.dashboards.findIndex(
              (d) => d.id === dashboardId
            );
            if (dashboardIndex === -1) {
              logger.warn(`Dashboard ${dashboardId} not found`);
              return false;
            }

            const newDashboards = state.dashboards.filter(
              (d) => d.id !== dashboardId
            );
            let newCurrentId = state.currentDashboardId;

            // If we're deleting the current dashboard, switch to another one
            if (state.currentDashboardId === dashboardId) {
              // Switch to the dashboard before the deleted one, or the first one if deleting the first
              const newIndex = dashboardIndex > 0 ? dashboardIndex - 1 : 0;
              newCurrentId = newDashboards[newIndex].id;
            }

            set({
              dashboards: newDashboards,
              currentDashboardId: newCurrentId,
            });

            logger.info(`Deleted dashboard: ${dashboardId}`);
            // Cleanup: remove associated dashboard shortcut from store completely
            try {
              const id = getDashboardShortcutId(dashboardId);
              const { shortcuts } = useShortcutStore.getState();
              if (shortcuts[id]) {
                // Directly mutate store to remove entry safely via set
                const setShortcuts = (newShortcuts: typeof shortcuts) =>
                  useShortcutStore.setState({ shortcuts: newShortcuts });
                // Build new object without the id
                const next: typeof shortcuts = { ...shortcuts };
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete next[id];
                setShortcuts(next);
              }
            } catch (_e) {
              // no-op
            }
            return true;
          },

          switchDashboard: (dashboardId) => {
            const state = get();
            const dashboard = state.dashboards.find(
              (d) => d.id === dashboardId
            );

            if (!dashboard) {
              logger.warn(`Dashboard ${dashboardId} not found`);
              return false;
            }

            set({ currentDashboardId: dashboardId });
            logger.info(
              `Switched to dashboard: ${dashboard.name} (${dashboardId})`
            );
            return true;
          },

          renameDashboard: (dashboardId, name) => {
            const state = get();
            const dashboardIndex = state.dashboards.findIndex(
              (d) => d.id === dashboardId
            );

            if (dashboardIndex === -1) {
              logger.warn(`Dashboard ${dashboardId} not found`);
              return false;
            }

            // Prevent renaming to reserved names
            if (name.toLowerCase() === 'tour') {
              logger.warn('Dashboard name "tour" is reserved');
              return false;
            }

            // Check for name conflicts
            const existingNames = new Set(
              state.dashboards
                .filter((d) => d.id !== dashboardId)
                .map((d) => d.name)
            );

            if (existingNames.has(name)) {
              logger.warn(`Dashboard name "${name}" already exists`);
              return false;
            }

            const newDashboards = [...state.dashboards];
            newDashboards[dashboardIndex] = {
              ...newDashboards[dashboardIndex],
              name,
              updatedAt: Date.now(),
            };

            set({ dashboards: newDashboards });
            logger.info(`Renamed dashboard ${dashboardId} to: ${name}`);
            // Update associated shortcut label and action
            try {
              const id = getDashboardShortcutId(dashboardId);
              const { registerShortcut } = useShortcutStore.getState();
              const existing = useShortcutStore.getState().shortcuts[id];
              if (existing) {
                registerShortcut({
                  ...existing,
                  id,
                  label: name,
                  description: `Go to ${name}`,
                  action: () => {
                    const slug = createDashboardSlug(name);
                    window.history.pushState(null, '', `/dashboard/${slug}`);
                  },
                });
              }
            } catch (_e) {
              // no-op
            }
            return true;
          },

          cloneDashboard: (dashboardId, name) => {
            const state = get();
            const sourceDashboard = state.dashboards.find(
              (d) => d.id === dashboardId
            );

            if (!sourceDashboard) {
              logger.warn(`Dashboard ${dashboardId} not found`);
              return '';
            }

            const cloneName =
              name ||
              generateUniqueDashboardName(
                state.dashboards,
                `${sourceDashboard.name} Copy`
              );
            const sanitizedName = cloneName.toLowerCase().replace(/\s+/g, '_');
            const newId = `dashboard_${sanitizedName}_${Date.now()}`;
            const now = Date.now();

            // Deep clone the dashboard with new IDs for widgets
            const clonedWidgets = sourceDashboard.widgets.map((widget) => ({
              ...widget,
              id: `${widget.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              layoutData: {
                ...widget.layoutData,
                i: `${widget.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              },
            }));

            const clonedLayout = clonedWidgets.map((widget) => ({
              ...widget.layoutData,
            }));

            const clonedDashboard: DashboardConfig = {
              ...sourceDashboard,
              id: newId,
              name: cloneName,
              widgets: clonedWidgets,
              currentLayout: clonedLayout,
              createdAt: now,
              updatedAt: now,
            };

            set({
              dashboards: [...state.dashboards, clonedDashboard],
              currentDashboardId: newId,
            });

            logger.info(
              `Cloned dashboard ${sourceDashboard.name} as: ${cloneName} (${newId})`
            );
            return newId;
          },

          reorderDashboards: (fromIndex, toIndex) => {
            const state = get();

            if (
              fromIndex < 0 ||
              fromIndex >= state.dashboards.length ||
              toIndex < 0 ||
              toIndex >= state.dashboards.length ||
              fromIndex === toIndex
            ) {
              return;
            }

            const newDashboards = [...state.dashboards];
            const [movedDashboard] = newDashboards.splice(fromIndex, 1);
            newDashboards.splice(toIndex, 0, movedDashboard);

            set({ dashboards: newDashboards });
            logger.info(
              `Reordered dashboard from position ${fromIndex} to ${toIndex}`
            );
          },

          createInitialDashboards: () => {
            const state = get();

            // Only create initial dashboards if none exist
            if (state.dashboards.length > 0) {
              logger.info(
                'Dashboards already exist, skipping initial creation'
              );
              return;
            }

            logger.info(
              'Creating initial dashboards: Trading, Portfolio, Market'
            );

            // Create Trading dashboard
            const tradingId = state.createDashboardFromTemplate(
              'trading',
              'Trading'
            );

            // Create Portfolio dashboard
            const portfolioId = state.createDashboardFromTemplate(
              'portfolio',
              'Portfolio'
            );

            // Create Market dashboard
            const marketId = state.createDashboardFromTemplate(
              'market',
              'Market'
            );

            // Switch to Portfolio dashboard as default
            state.switchDashboard(portfolioId);

            logger.info(
              `Created initial dashboards: Trading (${tradingId}), Portfolio (${portfolioId}), Market (${marketId})`
            );
          },

          getCurrentDashboard: () => {
            const state = get();
            return (
              state.dashboards.find((d) => d.id === state.currentDashboardId) ||
              null
            );
          },

          // Proxy methods that operate on the current dashboard
          toggleGridLock: () => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    isGridLayoutLocked: !d.isGridLayoutLocked,
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          updateLayout: (newLayout) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            // Get current breakpoint when updating layout
            const containerWidth =
              typeof window !== 'undefined' ? window.innerWidth - 64 : 1200;
            const currentBreakpoint = getCurrentBreakpoint(containerWidth);

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    currentLayout: newLayout,
                    layoutBreakpoint: currentBreakpoint,
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          addWidget: (widget) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: [...d.widgets, widget],
                    isUsingDefaultLayout: d.isUsingDefaultLayout
                      ? false
                      : d.isUsingDefaultLayout,
                    isIntentionallyEmpty: false, // Clear the flag when user adds a widget
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          removeWidget: (widgetId) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: d.widgets.filter((w) => w.id !== widgetId),
                    isUsingDefaultLayout: d.isUsingDefaultLayout
                      ? false
                      : d.isUsingDefaultLayout,
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          updateWidget: (widgetId, updates) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: d.widgets.map((w) =>
                      w.id === widgetId ? { ...w, ...updates } : w
                    ),
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          reorderWidgets: (activeId, overId) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const activeIndex = currentDashboard.widgets.findIndex(
              (w) => w.id === activeId
            );
            const overIndex = currentDashboard.widgets.findIndex(
              (w) => w.id === overId
            );

            if (activeIndex === -1 || overIndex === -1) return;

            const newWidgets = [...currentDashboard.widgets];
            const [movedWidget] = newWidgets.splice(activeIndex, 1);
            newWidgets.splice(overIndex, 0, movedWidget);

            // Recalculate grid positions (simplified version)
            const GRID_COLS = 12;
            let currentX = 0;
            let currentY = 0;
            let rowHeight = 0;

            const updatedWidgets = newWidgets.map((widget) => {
              const widgetWidth = widget.layoutData.w;
              const widgetHeight = widget.layoutData.h;

              if (currentX + widgetWidth > GRID_COLS) {
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
              }

              const updatedWidget = {
                ...widget,
                layoutData: {
                  ...widget.layoutData,
                  x: currentX,
                  y: currentY,
                },
              };

              currentX += widgetWidth;
              rowHeight = Math.max(rowHeight, widgetHeight);

              return updatedWidget;
            });

            const newCurrentLayout = updatedWidgets.map((widget) => ({
              ...widget.layoutData,
            }));

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: updatedWidgets,
                    currentLayout: newCurrentLayout,
                    isUsingDefaultLayout: false,
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
            logger.info(
              `Reordered widget ${activeId} to position of ${overId}`
            );
          },

          initializeDefaultWidgets: () => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            // Don't initialize if dashboard is intentionally empty
            if (currentDashboard.isIntentionallyEmpty) {
              logger.info(
                'Dashboard is intentionally empty, skipping default widget initialization'
              );
              return;
            }

            // Only apply default layout if no widgets exist (truly empty state)
            if (currentDashboard.widgets.length === 0) {
              logger.info(
                'No widgets found, applying default layout for first time'
              );
              // Apply the default layout using the responsive system
              state.applyLayoutPreset('default');
            } else {
              // If widgets exist, check if we need to adjust them for current screen size
              // This handles cases where user refreshes after setting default layout on small screen
              state.adjustLayoutForCurrentScreen();
            }
          },

          applyLayoutPreset: (presetName: string) => {
            logger.info('applyLayoutPreset called with:', presetName);

            if (presetName === 'default') {
              const state = get();
              const currentDashboard = state.getCurrentDashboard();
              if (!currentDashboard) return;

              // Get current container width for responsive widget selection
              const containerWidth = window.innerWidth - 64; // Account for sidebar and padding
              const breakpoint = getCurrentBreakpoint(containerWidth);

              // Get default widgets for current breakpoint. Skip types not
              // registered in the current build (e.g. cloud-only widgets on
              // sh) — same policy as createDashboardFromTemplate.
              const defaultWidgetConfigs = getDefaultLayoutWidgetsByWidth(
                containerWidth,
                'dashboard'
              ).filter((widgetConfig) =>
                isWidgetTypeAvailable(widgetConfig.type)
              );

              // Create widgets with proper layout data
              const createDefaultWidgets = () => {
                const widgets: WidgetConfig[] = [];
                let currentX = 0;
                let currentY = 0;
                let rowHeight = 0;

                // Always use 12 columns regardless of breakpoint
                const GRID_COLS = 12;

                defaultWidgetConfigs.forEach((widgetConfig, index) => {
                  const widgetSize = getDefaultWidgetSize(
                    widgetConfig.type,
                    breakpoint
                  );
                  // Always use default sizes when applying default layout - ignore custom sizes
                  const widgetWidth = widgetSize.w;
                  const widgetHeight = widgetSize.h;

                  // Find existing widget of this type to preserve ID only
                  const existingWidget = currentDashboard.widgets.find(
                    (w) => w.type === widgetConfig.type
                  );

                  let widgetId: string;
                  if (existingWidget) {
                    // Preserve existing widget ID
                    widgetId = existingWidget.id;
                  } else {
                    // Create new ID for new widget
                    widgetId = `${widgetConfig.type}-${Date.now()}-${index}`;
                  }

                  // Check if widget fits in current row
                  if (currentX + widgetWidth > GRID_COLS) {
                    // Move to next row
                    currentX = 0;
                    currentY += rowHeight;
                    rowHeight = 0;
                  }

                  // Create widget with default sizes (ignore any custom sizes)
                  const widget: WidgetConfig = {
                    id: widgetId,
                    type: widgetConfig.type,
                    title:
                      widgetConfig.title ||
                      getWidgetMetadata(widgetConfig.type as WidgetType)
                        ?.title ||
                      widgetConfig.type,
                    layoutData: {
                      i: widgetId,
                      x: currentX,
                      y: currentY,
                      w: widgetWidth,
                      h: widgetHeight,
                      moved: false,
                      static: false,
                    },
                    data: existingWidget?.data || {},
                    settings: existingWidget?.settings || {},
                    hasOptions:
                      getWidgetMetadata(widgetConfig.type as WidgetType)
                        ?.hasOptions || false,
                  };

                  widgets.push(widget);

                  // Update position for next widget
                  currentX += widgetWidth;
                  rowHeight = Math.max(rowHeight, widgetHeight);
                });

                return widgets;
              };

              const defaultWidgets = createDefaultWidgets();
              const defaultLayout = defaultWidgets.map((widget) => ({
                ...widget.layoutData,
              }));

              logger.debug(
                `Applying default layout with widgets for breakpoint ${breakpoint}:`,
                defaultWidgets
              );

              // Clear all custom sizes when applying default layout
              const { clearAllCustomSizes, cleanupOrphanedSettings } =
                useWidgetSettingsStore.getState();
              clearAllCustomSizes();

              const newDashboards = state.dashboards.map((d) =>
                d.id === state.currentDashboardId
                  ? {
                      ...d,
                      widgets: defaultWidgets,
                      currentLayout: defaultLayout,
                      isUsingDefaultLayout: true, // Mark as using default layout
                      layoutBreakpoint: breakpoint,
                      updatedAt: Date.now(),
                    }
                  : d
              );

              set({ dashboards: newDashboards });

              // Clean up orphaned widget settings for widgets that no longer exist
              cleanupOrphanedSettings(defaultWidgets.map((w) => w.id));
            }
          },

          resetLayout: () => {
            logger.info('Resetting layout for current dashboard');
            const state = get();
            state.applyLayoutPreset('default');
          },

          tidyUpLayout: () => {
            logger.info(
              'Tidying up layout for current dashboard using TidyLayoutEngine'
            );
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            if (currentDashboard.widgets.length === 0) {
              logger.info('No widgets to tidy up');
              return;
            }

            // Use the sophisticated TidyLayoutEngine for comprehensive layout optimization
            const containerWidth =
              typeof window !== 'undefined'
                ? window.innerWidth - 64
                : undefined;
            const tidyResult = tidyLayout(currentDashboard.widgets, {
              gridCols: 12,
              enableHorizontalExpansion: true,
              enableVerticalCompaction: true,
              minRowGap: 0,
              registry: 'dashboard',
              ...(containerWidth !== undefined && { containerWidth }), // Only include if defined
            });

            logger.info(
              'Tidy layout optimization completed:',
              tidyResult.stats
            );

            // Apply the optimized layout to the dashboard
            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: tidyResult.widgets,
                    currentLayout: tidyResult.layout,
                    isUsingDefaultLayout: false, // Mark as customized after tidy up
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          saveLayout: (name: string) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const filtered = currentDashboard.savedLayouts.filter(
              (l) => l.name !== name
            );
            const screenInfo = getEnhancedScreenSize();
            const newSavedLayout = {
              name,
              layout: currentDashboard.currentLayout,
              widgets: currentDashboard.widgets,
              screenSize: getScreenSize(),
              screenInfo,
            };

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    savedLayouts: [...filtered, newSavedLayout],
                    lastSavedPreset: name,
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          loadLayout: (name: string) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const found = currentDashboard.savedLayouts.find(
              (l) => l.name === name
            );
            if (found) {
              const newDashboards = state.dashboards.map((d) =>
                d.id === state.currentDashboardId
                  ? {
                      ...d,
                      currentLayout: found.layout,
                      widgets: found.widgets,
                      lastSavedPreset: name,
                      updatedAt: Date.now(),
                    }
                  : d
              );

              set({ dashboards: newDashboards });
            }
          },

          deleteLayout: (name: string) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    savedLayouts: d.savedLayouts.filter((l) => l.name !== name),
                    lastSavedPreset:
                      d.lastSavedPreset === name ? null : d.lastSavedPreset,
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          resetToLastSavedPreset: () => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            if (currentDashboard.lastSavedPreset) {
              const found = currentDashboard.savedLayouts.find(
                (l) => l.name === currentDashboard.lastSavedPreset
              );
              if (found) {
                state.loadLayout(currentDashboard.lastSavedPreset);
                logger.info(
                  `Reset to last saved preset: ${currentDashboard.lastSavedPreset}`
                );
              } else {
                logger.info(
                  'Last saved preset no longer exists, resetting to default'
                );
                state.resetLayout();
              }
            } else {
              logger.info('No saved preset to reset to, using default layout');
              state.resetLayout();
            }
          },

          exportLayout: () => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return '{}';

            const screenInfo = getEnhancedScreenSize();
            const exportData = {
              dashboard: currentDashboard,
              exportedAt: new Date().toISOString(),
              screenSize: getScreenSize(),
              screenInfo,
              version: '2.0', // Multi-dashboard version
            };
            return JSON.stringify(exportData, null, 2);
          },

          importLayout: (layoutData: string) => {
            try {
              const parsedData = JSON.parse(layoutData);

              // Handle both single dashboard and multi-dashboard imports
              if (parsedData.dashboard) {
                // Multi-dashboard format
                const state = get();
                const currentDashboard = state.getCurrentDashboard();
                if (!currentDashboard) return false;

                const newDashboards = state.dashboards.map((d) =>
                  d.id === state.currentDashboardId
                    ? {
                        ...d,
                        widgets: parsedData.dashboard.widgets,
                        currentLayout: parsedData.dashboard.currentLayout,
                        savedLayouts: parsedData.dashboard.savedLayouts || [],
                        updatedAt: Date.now(),
                      }
                    : d
                );

                set({ dashboards: newDashboards });
                return true;
              } else if (parsedData.widgets && parsedData.currentLayout) {
                // Legacy single dashboard format
                const state = get();
                const currentDashboard = state.getCurrentDashboard();
                if (!currentDashboard) return false;

                const newDashboards = state.dashboards.map((d) =>
                  d.id === state.currentDashboardId
                    ? {
                        ...d,
                        widgets: parsedData.widgets,
                        currentLayout: parsedData.currentLayout,
                        savedLayouts: parsedData.savedLayouts || [],
                        updatedAt: Date.now(),
                      }
                    : d
                );

                set({ dashboards: newDashboards });
                return true;
              }

              return false;
            } catch (error) {
              console.error('Failed to import layout:', error);
              return false;
            }
          },

          adjustLayoutForCurrentScreen: () => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            if (currentDashboard.widgets.length === 0) {
              return; // Nothing to adjust
            }

            // Only adjust layout if user is using unmodified default layout
            if (!currentDashboard.isUsingDefaultLayout) {
              logger.debug(
                'User has customized layout, skipping automatic adjustment'
              );
              return;
            }

            // Get current container width for responsive widget adjustment
            const containerWidth = window.innerWidth - 64; // Account for sidebar and padding
            const currentBreakpoint = getCurrentBreakpoint(containerWidth);

            logger.info('Checking layout adjustment for current screen:', {
              containerWidth,
              breakpoint: currentBreakpoint,
              windowWidth: window.innerWidth,
            });

            // Check if current layout needs adjustment based on screen size
            let needsAdjustment = false;

            // Also check if we need to add/remove widgets based on the current
            // breakpoint. Skip types not registered in the current build.
            const defaultWidgetConfigs = getDefaultLayoutWidgetsByWidth(
              containerWidth,
              'dashboard'
            ).filter((widgetConfig) =>
              isWidgetTypeAvailable(widgetConfig.type)
            );

            const currentWidgetTypes = new Set(
              currentDashboard.widgets.map((w) => w.type)
            );
            const expectedWidgetTypes = new Set(
              defaultWidgetConfigs.map((w) => w.type)
            );

            // Check if widget composition differs (widgets missing or extra)
            const widgetsNeedAdjustment =
              currentWidgetTypes.size !== expectedWidgetTypes.size ||
              [...expectedWidgetTypes].some(
                (type) => !currentWidgetTypes.has(type)
              );

            currentDashboard.widgets.forEach((widget) => {
              const currentSize = getDefaultWidgetSize(
                widget.type,
                currentBreakpoint
              );

              // Check if widget size should be adjusted for current breakpoint
              if (
                widget.layoutData.w !== currentSize.w ||
                widget.layoutData.h !== currentSize.h
              ) {
                needsAdjustment = true;
                logger.debug(`Widget ${widget.type} needs size adjustment:`, {
                  current: { w: widget.layoutData.w, h: widget.layoutData.h },
                  target: currentSize,
                  breakpoint: currentBreakpoint,
                });
              }
            });

            if (needsAdjustment || widgetsNeedAdjustment) {
              logger.info(
                'Layout adjustment needed, re-applying default layout for current screen size'
              );

              // Re-create the default layout for current screen size
              // Create new widgets with proper layout for current breakpoint
              const createAdjustedWidgets = () => {
                const adjustedWidgets: WidgetConfig[] = [];
                let currentX = 0;
                let currentY = 0;
                let rowHeight = 0;
                const GRID_COLS = 12;

                // Only include widgets that exist in current default layout for this breakpoint
                defaultWidgetConfigs.forEach((widgetConfig, index) => {
                  // Find existing widget of this type
                  const existingWidget = currentDashboard.widgets.find(
                    (w) => w.type === widgetConfig.type
                  );

                  if (existingWidget) {
                    const widgetSize = getDefaultWidgetSize(
                      widgetConfig.type,
                      currentBreakpoint
                    );
                    let widgetWidth = widgetSize.w;
                    let widgetHeight = widgetSize.h;

                    // Only preserve custom sizes if user has customized the layout
                    // If still using default layout, always use default sizes
                    if (!currentDashboard.isUsingDefaultLayout) {
                      // Check if widget has custom size and preserve it
                      const { getWidgetHasCustomSize, getWidgetCustomSize } =
                        useWidgetSettingsStore.getState();
                      if (getWidgetHasCustomSize(existingWidget.id)) {
                        const customSize = getWidgetCustomSize(
                          existingWidget.id
                        );
                        if (customSize) {
                          widgetWidth = customSize.w;
                          widgetHeight = customSize.h;
                          logger.debug(
                            `Preserving custom size for widget ${existingWidget.id}:`,
                            customSize
                          );
                        }
                      }
                    } else {
                      logger.debug(
                        `Using default size for widget ${existingWidget.id} (layout is still default)`
                      );
                    }

                    // Check if widget fits in current row
                    if (currentX + widgetWidth > GRID_COLS) {
                      // Move to next row
                      currentX = 0;
                      currentY += rowHeight;
                      rowHeight = 0;
                    }

                    // Create adjusted widget preserving existing data and settings
                    const adjustedWidget: WidgetConfig = {
                      ...existingWidget,
                      layoutData: {
                        i: existingWidget.id,
                        x: currentX,
                        y: currentY,
                        w: widgetWidth,
                        h: widgetHeight,
                        moved: false,
                        static: false,
                      },
                    };

                    adjustedWidgets.push(adjustedWidget);

                    // Update position for next widget
                    currentX += widgetWidth;
                    rowHeight = Math.max(rowHeight, widgetHeight);
                  } else {
                    // Widget doesn't exist, create it (for cases where new widgets should be added on this breakpoint)
                    const widgetSize = getDefaultWidgetSize(
                      widgetConfig.type,
                      currentBreakpoint
                    );
                    const widgetWidth = widgetSize.w;
                    const widgetHeight = widgetSize.h;

                    // Check if widget fits in current row
                    if (currentX + widgetWidth > GRID_COLS) {
                      // Move to next row
                      currentX = 0;
                      currentY += rowHeight;
                      rowHeight = 0;
                    }

                    // Create new widget
                    const newWidget: WidgetConfig = {
                      id: `${widgetConfig.type}-${Date.now()}-${index}`,
                      type: widgetConfig.type,
                      title:
                        widgetConfig.title ||
                        getWidgetMetadata(widgetConfig.type as WidgetType)
                          ?.title ||
                        widgetConfig.type,
                      layoutData: {
                        i: `${widgetConfig.type}-${Date.now()}-${index}`,
                        x: currentX,
                        y: currentY,
                        w: widgetWidth,
                        h: widgetHeight,
                        moved: false,
                        static: false,
                      },
                      data: {},
                      settings: {},
                      hasOptions:
                        getWidgetMetadata(widgetConfig.type as WidgetType)
                          ?.hasOptions || false,
                    };

                    adjustedWidgets.push(newWidget);

                    // Update position for next widget
                    currentX += widgetWidth;
                    rowHeight = Math.max(rowHeight, widgetHeight);
                  }
                });

                return adjustedWidgets;
              };

              const adjustedWidgets = createAdjustedWidgets();
              const adjustedLayout = adjustedWidgets.map((widget) => ({
                ...widget.layoutData,
              }));

              logger.debug('Applied screen-adjusted layout:', {
                breakpoint: currentBreakpoint,
                adjustedWidgets: adjustedWidgets.length,
                originalWidgets: currentDashboard.widgets.length,
                widgetsNeedAdjustment,
              });

              const newDashboards = state.dashboards.map((d) =>
                d.id === state.currentDashboardId
                  ? {
                      ...d,
                      widgets: adjustedWidgets,
                      currentLayout: adjustedLayout,
                      layoutBreakpoint: currentBreakpoint,
                      updatedAt: Date.now(),
                    }
                  : d
              );

              set({ dashboards: newDashboards });

              // Clean up orphaned widget settings for widgets that no longer exist
              const { cleanupOrphanedSettings } =
                useWidgetSettingsStore.getState();
              cleanupOrphanedSettings(adjustedWidgets.map((w) => w.id));
            } else {
              logger.debug(
                'No layout adjustment needed for current screen size'
              );
            }
          },

          markLayoutAsCustomized: () => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? { ...d, isUsingDefaultLayout: false, updatedAt: Date.now() }
                : d
            );

            set({ dashboards: newDashboards });
          },

          // Tab management methods
          addTab: (widgetId: string, tab: WidgetTab) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: d.widgets.map((widget) =>
                      widget.id === widgetId
                        ? { ...widget, tabs: [...(widget.tabs || []), tab] }
                        : widget
                    ),
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          removeTab: (widgetId: string, tabId: string) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: d.widgets.map((widget) =>
                      widget.id === widgetId
                        ? {
                            ...widget,
                            tabs:
                              widget.tabs?.filter((tab) => tab.id !== tabId) ||
                              [],
                          }
                        : widget
                    ),
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          moveTab: (
            fromWidgetId: string,
            toWidgetId: string,
            tabId: string,
            toIndex?: number
          ) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const fromWidget = currentDashboard.widgets.find(
              (w) => w.id === fromWidgetId
            );
            const tabToMove = fromWidget?.tabs?.find((t) => t.id === tabId);

            if (!fromWidget || !tabToMove) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: d.widgets.map((widget) => {
                      if (widget.id === fromWidgetId) {
                        return {
                          ...widget,
                          tabs:
                            widget.tabs?.filter((tab) => tab.id !== tabId) ||
                            [],
                        };
                      }
                      if (widget.id === toWidgetId) {
                        const currentTabs = widget.tabs || [];
                        const insertIndex =
                          toIndex !== undefined ? toIndex : currentTabs.length;
                        const newTabs = [...currentTabs];
                        newTabs.splice(insertIndex, 0, tabToMove);
                        return {
                          ...widget,
                          tabs: newTabs,
                        };
                      }
                      return widget;
                    }),
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          reorderTabs: (
            widgetId: string,
            fromIndex: number,
            toIndex: number
          ) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: d.widgets.map((widget) =>
                      widget.id === widgetId
                        ? {
                            ...widget,
                            tabs: (() => {
                              const tabs = [...(widget.tabs || [])];
                              const [movedTab] = tabs.splice(fromIndex, 1);
                              tabs.splice(toIndex, 0, movedTab);
                              return tabs;
                            })(),
                          }
                        : widget
                    ),
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          updateTab: (
            widgetId: string,
            tabId: string,
            updates: Partial<WidgetTab>
          ) => {
            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) return;

            const newDashboards = state.dashboards.map((d) =>
              d.id === state.currentDashboardId
                ? {
                    ...d,
                    widgets: d.widgets.map((widget) =>
                      widget.id === widgetId
                        ? {
                            ...widget,
                            tabs:
                              widget.tabs?.map((tab) =>
                                tab.id === tabId ? { ...tab, ...updates } : tab
                              ) || [],
                          }
                        : widget
                    ),
                    updatedAt: Date.now(),
                  }
                : d
            );

            set({ dashboards: newDashboards });
          },

          // Template functionality
          getAvailableTemplates: () => {
            return getAllDashboardTemplates();
          },

          createDashboardFromTemplate: (
            templateId: string,
            customName?: string
          ) => {
            const template = getDashboardTemplate(templateId);
            if (!template) {
              throw new Error(`Template with id "${templateId}" not found`);
            }
            // Skip widgets whose type isn't registered in the current
            // build. Templates from cloud may reference widgets not
            // present in sh and vice-versa; rather than rendering ghost
            // cards, drop them silently.
            const availableWidgets = template.widgets.filter((w) =>
              isWidgetTypeAvailable(w.type)
            );

            const state = get();
            const dashboardName = customName || template.name;

            // Ensure unique name
            let finalName = dashboardName;
            let counter = 1;
            while (state.dashboards.some((d) => d.name === finalName)) {
              finalName = `${dashboardName} (${counter})`;
              counter++;
            }

            const newDashboard = createNewDashboard(
              `dashboard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              finalName
            );

            // Determine current breakpoint
            const containerWidth =
              typeof window !== 'undefined' ? window.innerWidth - 64 : 1200;
            const breakpoint = getCurrentBreakpoint(containerWidth);

            // Apply template widgets with responsive sizes
            newDashboard.widgets = availableWidgets.map((widget, index) => {
              const responsiveSizes = getDefaultWidgetSize(
                widget.type,
                breakpoint
              );
              return {
                ...widget,
                id: `${widget.type}-${Date.now()}-${index}`, // Ensure unique IDs
                layoutData: {
                  ...widget.layoutData,
                  i: `${widget.type}-${Date.now()}-${index}`,
                  w: responsiveSizes.w,
                  h: responsiveSizes.h,
                },
              };
            });

            // Create layout with responsive positions
            let currentX = 0;
            let currentY = 0;
            let rowHeight = 0;
            const GRID_COLS = 12;

            newDashboard.currentLayout = newDashboard.widgets.map((widget) => {
              const widgetWidth = widget.layoutData.w;
              const widgetHeight = widget.layoutData.h;

              // Check if widget fits in current row
              if (currentX + widgetWidth > GRID_COLS) {
                // Move to next row
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
              }

              const layoutItem = {
                i: widget.id,
                x: currentX,
                y: currentY,
                w: widgetWidth,
                h: widgetHeight,
                moved: false,
                static: false,
              };

              // Update position for next widget
              currentX += widgetWidth;
              rowHeight = Math.max(rowHeight, widgetHeight);

              return layoutItem;
            });

            // Update layout data in widgets to match calculated positions
            newDashboard.widgets = newDashboard.widgets.map(
              (widget, index) => ({
                ...widget,
                layoutData: {
                  ...newDashboard.currentLayout[index],
                  i: widget.id,
                },
              })
            );

            set((state) => ({
              dashboards: [...state.dashboards, newDashboard],
              currentDashboardId: newDashboard.id,
            }));

            logger.info(
              `Created dashboard from template: ${template.name} -> ${finalName}`
            );
            return newDashboard.id;
          },

          applyTemplateToCurrentDashboard: (templateId: string) => {
            const template = getDashboardTemplate(templateId);
            if (!template) {
              throw new Error(`Template with id "${templateId}" not found`);
            }
            const availableWidgets = template.widgets.filter((w) =>
              isWidgetTypeAvailable(w.type)
            );

            const state = get();
            const currentDashboard = state.getCurrentDashboard();
            if (!currentDashboard) {
              throw new Error('No active dashboard');
            }

            // Determine current breakpoint
            const containerWidth =
              typeof window !== 'undefined' ? window.innerWidth - 64 : 1200;
            const breakpoint = getCurrentBreakpoint(containerWidth);

            // Apply template widgets with responsive sizes
            const newWidgets = availableWidgets.map((widget, index) => {
              const responsiveSizes = getDefaultWidgetSize(
                widget.type,
                breakpoint
              );
              return {
                ...widget,
                id: `${widget.type}-${Date.now()}-${index}`, // Ensure unique IDs
                layoutData: {
                  ...widget.layoutData,
                  i: `${widget.type}-${Date.now()}-${index}`,
                  w: responsiveSizes.w,
                  h: responsiveSizes.h,
                },
              };
            });

            // Create layout with responsive positions
            let currentX = 0;
            let currentY = 0;
            let rowHeight = 0;
            const GRID_COLS = 12;

            const newLayout = newWidgets.map((widget) => {
              const widgetWidth = widget.layoutData.w;
              const widgetHeight = widget.layoutData.h;

              // Check if widget fits in current row
              if (currentX + widgetWidth > GRID_COLS) {
                // Move to next row
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
              }

              const layoutItem = {
                i: widget.id,
                x: currentX,
                y: currentY,
                w: widgetWidth,
                h: widgetHeight,
                moved: false,
                static: false,
              };

              // Update position for next widget
              currentX += widgetWidth;
              rowHeight = Math.max(rowHeight, widgetHeight);

              return layoutItem;
            });

            // Update layout data in widgets to match calculated positions
            const updatedWidgets = newWidgets.map((widget, index) => ({
              ...widget,
              layoutData: {
                ...newLayout[index],
                i: widget.id,
              },
            }));

            set((state) => ({
              dashboards: state.dashboards.map((d) =>
                d.id === currentDashboard.id
                  ? {
                      ...d,
                      widgets: updatedWidgets,
                      currentLayout: newLayout,
                      isUsingDefaultLayout: false,
                      updatedAt: Date.now(),
                    }
                  : d
              ),
            }));

            logger.info(
              `Applied template "${template.name}" to dashboard "${currentDashboard.name}"`
            );
          },
        }),
        {
          name: 'multi-dashboard-store',
          storage: createIndexedDBStorage('multi-dashboard-store'),
          partialize: (state) => ({
            dashboards: state.dashboards,
            currentDashboardId: state.currentDashboardId,
          }),
        }
      ),
      { name: 'multi-dashboard-store' }
    ),
    {
      category: 'dashboards',
      selector: (state) => state.dashboards,
      debounceMs: 1000,
    }
  )
);
