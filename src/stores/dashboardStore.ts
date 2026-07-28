import { logger } from '@/lib/loggerInstance';
import { createIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import type { Layout } from 'react-grid-layout';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { tidyLayout } from '../components/layout/TidyLayoutEngine';
import {
  getWidgetMetadata,
  isWidgetTypeAvailable,
  type WidgetType,
} from '../components/widgets/dashboard';
import {
  getCurrentBreakpoint,
  getDefaultLayoutWidgetsByWidth,
  getDefaultWidgetSize,
} from '../components/widgets/DefaultWidgetSizes';
import type { SavedLayout } from '../types/layout';
import { getEnhancedScreenSize, getScreenSize } from '../utils/screenSize';
import { useWidgetSettingsStore } from './widgetSettingsStore';

export interface WidgetTab {
  id: string;
  title: string;
  data?: Record<string, unknown>;
}

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  layoutData: Layout;
  data?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  tabs?: WidgetTab[];
  hasOptions?: boolean; // <-- Add this line
}

interface DashboardState {
  // Dashboard layout and preferences
  isGridLayoutLocked: boolean;
  isStickyHeader: boolean;
  widgets: WidgetConfig[];
  currentLayout: Layout[];
  savedLayouts: SavedLayout<WidgetConfig>[];
  lastSavedPreset: string | null; // Track the last saved preset for reset functionality
  isUsingDefaultLayout: boolean; // Track if user is using unmodified default layout

  // Actions
  toggleGridLock: () => void;
  toggleStickyHeader: () => void;
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

// Layout presets - only default layout based on uploaded file
export const layoutPresets = {
  default: [
    { type: 'bot-status', x: 0, y: 7, w: 6, h: 4 },
    { type: 'profit', x: 6, y: 0, w: 6, h: 7 },
    { type: 'portfolio-value', x: 0, y: 0, w: 6, h: 7 },
    { type: 'accumulated-profit', x: 0, y: 11, w: 6, h: 7 },
    { type: 'portfolio-allocation', x: 6, y: 11, w: 6, h: 7 },
    { type: 'portfolio-balances', x: 0, y: 18, w: 12, h: 7 },
  ],
} as const;

export const useDashboardStore = create<DashboardState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        isGridLayoutLocked: false,
        isStickyHeader: false,
        widgets: [],
        currentLayout: [],
        savedLayouts: [],
        lastSavedPreset: null,
        isUsingDefaultLayout: false,

        // Actions
        toggleGridLock: () =>
          set((state) => ({ isGridLayoutLocked: !state.isGridLayoutLocked })),

        toggleStickyHeader: () =>
          set((state) => ({ isStickyHeader: !state.isStickyHeader })),

        updateLayout: (newLayout) => set({ currentLayout: newLayout }),

        addWidget: (widget) =>
          set((state) => {
            const newState: Partial<DashboardState> = {
              widgets: [...state.widgets, widget],
            };
            // Mark layout as customized when adding widgets
            if (state.isUsingDefaultLayout) {
              newState.isUsingDefaultLayout = false;
            }
            return newState;
          }),

        removeWidget: (widgetId) =>
          set((state) => {
            const newState: Partial<DashboardState> = {
              widgets: state.widgets.filter((w) => w.id !== widgetId),
            };
            // Mark layout as customized when removing widgets
            if (state.isUsingDefaultLayout) {
              newState.isUsingDefaultLayout = false;
            }
            return newState;
          }),

        updateWidget: (widgetId, updates) =>
          set((state) => ({
            widgets: state.widgets.map((w) =>
              w.id === widgetId ? { ...w, ...updates } : w
            ),
          })),

        reorderWidgets: (activeId, overId) =>
          set((state) => {
            const activeIndex = state.widgets.findIndex(
              (w) => w.id === activeId
            );
            const overIndex = state.widgets.findIndex((w) => w.id === overId);

            if (activeIndex === -1 || overIndex === -1) return state;

            const newWidgets = [...state.widgets];
            const [movedWidget] = newWidgets.splice(activeIndex, 1);
            newWidgets.splice(overIndex, 0, movedWidget);

            // Recalculate grid positions based on new widget order
            // This ensures that reordering in the list view translates to proper grid layout
            const GRID_COLS = 12;
            let currentX = 0;
            let currentY = 0;
            let rowHeight = 0;

            const updatedWidgets = newWidgets.map((widget) => {
              const widgetWidth = widget.layoutData.w;
              const widgetHeight = widget.layoutData.h;

              // Check if widget fits in current row
              if (currentX + widgetWidth > GRID_COLS) {
                // Move to next row
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
              }

              // Update widget's layout data with new position
              const updatedWidget = {
                ...widget,
                layoutData: {
                  ...widget.layoutData,
                  x: currentX,
                  y: currentY,
                },
              };

              // Update position for next widget
              currentX += widgetWidth;
              rowHeight = Math.max(rowHeight, widgetHeight);

              return updatedWidget;
            });

            // Update the currentLayout to match the new positions
            const newCurrentLayout = updatedWidgets.map((widget) => ({
              ...widget.layoutData,
            }));

            logger.info(
              `Reordered widget ${activeId} to position of ${overId}`
            );
            logger.debug(
              'New widget order with updated positions:',
              updatedWidgets.map((w) => ({
                id: w.id,
                type: w.type,
                x: w.layoutData.x,
                y: w.layoutData.y,
              }))
            );

            return {
              widgets: updatedWidgets,
              currentLayout: newCurrentLayout,
              isUsingDefaultLayout: false, // Mark as customized when reordering
            };
          }),

        initializeDefaultWidgets: () => {
          const state = get();
          // Only apply default layout if no widgets exist (truly empty state)
          if (state.widgets.length === 0) {
            logger.info(
              'No widgets found, applying default layout for first time'
            );
            // Apply the default layout using the new responsive system
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
            // Get current container width for responsive widget selection
            const containerWidth = window.innerWidth - 64; // Account for sidebar and padding
            const breakpoint = getCurrentBreakpoint(containerWidth);

            // Get default widgets for current breakpoint. Skip types not
            // registered in the current build (e.g. cloud-only widgets on
            // sh) — same policy as createDashboardFromTemplate.
            const defaultWidgetConfigs = getDefaultLayoutWidgetsByWidth(
              containerWidth,
              'dashboard'
            ).filter((widgetConfig) => isWidgetTypeAvailable(widgetConfig.type));

            // Create widgets with proper layout data
            const createDefaultWidgets = () => {
              const widgets: WidgetConfig[] = [];
              let currentX = 0;
              let currentY = 0;
              let rowHeight = 0;

              // Always use 12 columns regardless of breakpoint
              const GRID_COLS = 12;

              // Get current state to find existing widgets for preserving IDs only
              const state = get();

              defaultWidgetConfigs.forEach((widgetConfig, index) => {
                const widgetSize = getDefaultWidgetSize(
                  widgetConfig.type,
                  breakpoint
                );
                // Always use default sizes when applying default layout - ignore custom sizes
                const widgetWidth = widgetSize.w;
                const widgetHeight = widgetSize.h;

                // Find existing widget of this type to preserve ID only
                const existingWidget = state.widgets.find(
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
                    getWidgetMetadata(widgetConfig.type as WidgetType)?.title ||
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

            set({
              widgets: defaultWidgets,
              currentLayout: defaultLayout,
              isUsingDefaultLayout: true, // Mark as using default layout
            });

            // Clean up orphaned widget settings for widgets that no longer exist
            cleanupOrphanedSettings(defaultWidgets.map((w) => w.id));

            // Temporarily disable tidy-up to debug layout issues
            // setTimeout(() => {
            //   const state = get();
            //   state.tidyUpLayout();
            // }, 0);
          } else {
            // For other presets (if any are added later), use the original logic
            const state = get();
            const preset =
              layoutPresets[presetName as keyof typeof layoutPresets];
            logger.debug('Found preset:', preset);
            logger.debug('Current widgets:', state.widgets);

            if (preset) {
              // Update widget layout data by matching widget type to preset type
              const updatedWidgets = state.widgets.map((widget) => {
                const presetItem = preset.find(
                  (item) => item.type === widget.type
                );
                if (presetItem) {
                  logger.debug(
                    `Updating widget ${widget.id} (type: ${widget.type}) with layout:`,
                    presetItem
                  );
                  const newLayoutData = {
                    i: widget.id, // Keep the original widget ID
                    x: presetItem.x,
                    y: presetItem.y,
                    w: presetItem.w,
                    h: presetItem.h,
                  };
                  return {
                    ...widget,
                    layoutData: newLayoutData,
                  };
                }
                return widget;
              });

              logger.debug('Updated widgets:', updatedWidgets);

              // Create currentLayout from updated widgets
              const newCurrentLayout = updatedWidgets.map((widget) => ({
                ...widget.layoutData,
              }));

              set({
                widgets: updatedWidgets,
                currentLayout: newCurrentLayout,
              });
            } else {
              logger.warn('No preset found for:', presetName);
            }
          }
        },

        resetLayout: () => {
          logger.info('resetLayout called');
          const state = get();
          const defaultPreset = layoutPresets.default;
          logger.debug('Default preset:', defaultPreset);
          logger.debug('Current widgets:', state.widgets);

          const updatedWidgets = state.widgets.map((widget) => {
            const defaultItem = defaultPreset.find(
              (item) => item.type === widget.type
            );
            if (defaultItem) {
              logger.debug(
                `Resetting widget ${widget.id} (type: ${widget.type}) to default layout:`,
                defaultItem
              );
              const newLayoutData = {
                i: widget.id, // Keep the original widget ID
                x: defaultItem.x,
                y: defaultItem.y,
                w: defaultItem.w,
                h: defaultItem.h,
              };
              return {
                ...widget,
                layoutData: newLayoutData,
              };
            }
            return widget;
          });

          logger.debug('Updated widgets after reset:', updatedWidgets);

          // Create currentLayout from updated widgets
          const newCurrentLayout = updatedWidgets.map((widget) => ({
            ...widget.layoutData,
          }));

          set({
            widgets: updatedWidgets,
            currentLayout: newCurrentLayout,
          });
        },

        tidyUpLayout: () => {
          logger.info('Tidying up layout using TidyLayoutEngine');
          const state = get();

          if (state.widgets.length === 0) {
            logger.info('No widgets to tidy up');
            return;
          }

          // Use the sophisticated TidyLayoutEngine for comprehensive layout optimization
          const containerWidth =
            typeof window !== 'undefined' ? window.innerWidth - 64 : undefined;
          const tidyResult = tidyLayout(state.widgets, {
            gridCols: 12,
            enableHorizontalExpansion: true,
            enableVerticalCompaction: true,
            minRowGap: 0,
            registry: 'dashboard',
            ...(containerWidth !== undefined && { containerWidth }), // Only include if defined
          });

          logger.info('Tidy layout optimization completed:', tidyResult.stats);

          // Apply the optimized layout
          set({
            widgets: tidyResult.widgets,
            currentLayout: tidyResult.layout,
            isUsingDefaultLayout: false, // Mark as customized after tidy up
          });
        },

        saveLayout: (name) => {
          set((state) => {
            // Remove existing with same name
            const filtered = state.savedLayouts.filter((l) => l.name !== name);
            const screenInfo = getEnhancedScreenSize();
            return {
              savedLayouts: [
                ...filtered,
                {
                  name,
                  layout: state.currentLayout,
                  widgets: state.widgets,
                  screenSize: getScreenSize(), // Keep for backward compatibility
                  screenInfo, // Enhanced screen information
                },
              ],
              lastSavedPreset: name, // Track the last saved preset
            };
          });
        },
        loadLayout: (name) => {
          const state = get();
          const found = state.savedLayouts.find((l) => l.name === name);
          if (found) {
            set({
              currentLayout: found.layout,
              widgets: found.widgets,
              lastSavedPreset: name, // Track when we load a saved layout
            });
          }
        },
        deleteLayout: (name) => {
          set((state) => ({
            savedLayouts: state.savedLayouts.filter((l) => l.name !== name),
            lastSavedPreset:
              state.lastSavedPreset === name ? null : state.lastSavedPreset,
          }));
        },

        resetToLastSavedPreset: () => {
          const state = get();
          if (state.lastSavedPreset) {
            // If we have a last saved preset, load it
            const found = state.savedLayouts.find(
              (l) => l.name === state.lastSavedPreset
            );
            if (found) {
              set({
                currentLayout: found.layout,
                widgets: found.widgets,
              });
              logger.info(
                `Reset to last saved preset: ${state.lastSavedPreset}`
              );
            } else {
              // If the preset was deleted, clear lastSavedPreset and reset to default
              logger.info(
                'Last saved preset no longer exists, resetting to default'
              );
              set({ lastSavedPreset: null });
              state.resetLayout();
            }
          } else {
            // If no last saved preset, reset to default
            logger.info('No saved preset to reset to, using default layout');
            state.resetLayout();
          }
        },

        exportLayout: () => {
          const state = get();
          const screenInfo = getEnhancedScreenSize();
          const exportData = {
            widgets: state.widgets,
            currentLayout: state.currentLayout,
            savedLayouts: state.savedLayouts,
            exportedAt: new Date().toISOString(),
            screenSize: getScreenSize(), // Keep for backward compatibility
            screenInfo, // Enhanced screen information
            version: '1.1', // Bump version to indicate enhanced screen info
          };
          return JSON.stringify(exportData, null, 2);
        },

        importLayout: (layoutData: string) => {
          try {
            const parsedData = JSON.parse(layoutData);

            // Validate the structure
            if (
              !parsedData.widgets ||
              !Array.isArray(parsedData.widgets) ||
              !parsedData.currentLayout ||
              !Array.isArray(parsedData.currentLayout)
            ) {
              return false;
            }

            // Optional: check version compatibility
            if (parsedData.version && parsedData.version !== '1.0') {
              console.warn('Layout version mismatch, attempting import anyway');
            }

            set({
              widgets: parsedData.widgets,
              currentLayout: parsedData.currentLayout,
              savedLayouts: parsedData.savedLayouts || [],
            });

            return true;
          } catch (error) {
            console.error('Failed to import layout:', error);
            return false;
          }
        },

        // Tab management functions
        addTab: (widgetId, tab) => {
          set((state) => ({
            widgets: state.widgets.map((widget) =>
              widget.id === widgetId
                ? {
                    ...widget,
                    tabs: [...(widget.tabs || []), tab],
                  }
                : widget
            ),
          }));
        },

        removeTab: (widgetId, tabId) => {
          set((state) => ({
            widgets: state.widgets.map((widget) =>
              widget.id === widgetId
                ? {
                    ...widget,
                    tabs: widget.tabs?.filter((tab) => tab.id !== tabId) || [],
                  }
                : widget
            ),
          }));
        },

        moveTab: (fromWidgetId, toWidgetId, tabId, toIndex) => {
          set((state) => {
            const fromWidget = state.widgets.find((w) => w.id === fromWidgetId);
            const tabToMove = fromWidget?.tabs?.find((t) => t.id === tabId);

            if (!fromWidget || !tabToMove) return state;

            // Remove tab from source widget
            const updatedWidgets = state.widgets.map((widget) => {
              if (widget.id === fromWidgetId) {
                return {
                  ...widget,
                  tabs: widget.tabs?.filter((tab) => tab.id !== tabId) || [],
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
            });

            return { widgets: updatedWidgets };
          });
        },

        reorderTabs: (widgetId, fromIndex, toIndex) => {
          set((state) => ({
            widgets: state.widgets.map((widget) =>
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
          }));
        },

        updateTab: (widgetId, tabId, updates) => {
          set((state) => ({
            widgets: state.widgets.map((widget) =>
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
          }));
        },

        adjustLayoutForCurrentScreen: () => {
          const state = get();

          if (state.widgets.length === 0) {
            return; // Nothing to adjust
          }

          // Only adjust layout if user is using unmodified default layout
          if (!state.isUsingDefaultLayout) {
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
          ).filter((widgetConfig) => isWidgetTypeAvailable(widgetConfig.type));

          const currentWidgetTypes = new Set(state.widgets.map((w) => w.type));
          const expectedWidgetTypes = new Set(
            defaultWidgetConfigs.map((w) => w.type)
          );

          // Check if widget composition differs (widgets missing or extra)
          const widgetsNeedAdjustment =
            currentWidgetTypes.size !== expectedWidgetTypes.size ||
            [...expectedWidgetTypes].some(
              (type) => !currentWidgetTypes.has(type)
            );

          state.widgets.forEach((widget) => {
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
                const existingWidget = state.widgets.find(
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
                  if (!state.isUsingDefaultLayout) {
                    // Check if widget has custom size and preserve it
                    const { getWidgetHasCustomSize, getWidgetCustomSize } =
                      useWidgetSettingsStore.getState();
                    if (getWidgetHasCustomSize(existingWidget.id)) {
                      const customSize = getWidgetCustomSize(existingWidget.id);
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
              originalWidgets: state.widgets.length,
              widgetsNeedAdjustment,
            });

            set({
              widgets: adjustedWidgets,
              currentLayout: adjustedLayout,
            });

            // Clean up orphaned widget settings for widgets that no longer exist
            const { cleanupOrphanedSettings } =
              useWidgetSettingsStore.getState();
            cleanupOrphanedSettings(adjustedWidgets.map((w) => w.id));
          } else {
            logger.debug('No layout adjustment needed for current screen size');
          }
        },

        markLayoutAsCustomized: () => {
          set({ isUsingDefaultLayout: false });
        },
      }),
      {
        name: 'dashboard-store',
        storage: createIndexedDBStorage('dashboard-store'),
        partialize: (state) => ({
          isGridLayoutLocked: state.isGridLayoutLocked,
          widgets: state.widgets,
          currentLayout: state.currentLayout,
          savedLayouts: state.savedLayouts,
          lastSavedPreset: state.lastSavedPreset,
          isUsingDefaultLayout: state.isUsingDefaultLayout,
        }),
      }
    ),
    {
      name: 'dashboard-store',
    }
  )
);
