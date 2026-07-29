import { logger } from '@/lib/loggerInstance';
import type { Layout } from 'react-grid-layout';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { tidyLayout } from '../components/layout/TidyLayoutEngine';
import {
  getCompatibilityDefaultSize,
  getCurrentBreakpoint,
  getDefaultLayoutWidgetsByWidth,
  getDefaultWidgetSize,
} from '../components/widgets/DefaultWidgetSizes';
import {
  getTradingWidgetMetadata,
  type TradingWidgetConfig,
  type TradingWidgetType,
} from '../components/widgets/trading';
import type { SavedLayout } from '../types/layout';
import { getEnhancedScreenSize, getScreenSize } from '../utils/screenSize';
import { useWidgetSettingsStore } from './widgetSettingsStore';

interface TradingTerminalState {
  isGridLayoutLocked: boolean;
  widgets: TradingWidgetConfig[];
  currentLayout: Layout[];
  savedLayouts: SavedLayout<TradingWidgetConfig>[];
  lastSavedPreset: string | null;
  isUsingDefaultLayout: boolean; // Track if user is using unmodified default layout

  // Actions
  toggleGridLock: () => void;
  updateLayout: (newLayout: Layout[]) => void;
  addWidget: (widget: TradingWidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  updateWidget: (
    widgetId: string,
    updates: Partial<TradingWidgetConfig>
  ) => void;
  reorderWidgets: (activeId: string, overId: string) => void;
  initializeDefaultWidgets: () => void;
  adjustLayoutForCurrentScreen: () => void;
  markLayoutAsCustomized: () => void;

  // Layout management
  applyLayoutPreset: (presetName: string) => void;
  resetLayout: () => void;
  tidyUpLayout: () => void;
  updateWidgetSizesToDefaults: () => void;
  saveLayout: (name: string) => void;
  loadLayout: (name: string) => void;
  deleteLayout: (name: string) => void;
  resetToLastSavedPreset: () => void;
  exportLayout: () => string;
  importLayout: (layoutData: string) => boolean;

  // Tab management (stub implementations for compatibility)
  moveTab: (
    fromWidgetId: string,
    toWidgetId: string,
    fromTabId: string,
    toIndex?: number
  ) => void;
  reorderTabs: (widgetId: string, fromIndex: number, toIndex: number) => void;
}

export const useTradingTerminalStore = create<TradingTerminalState>()(
  devtools(
    persist(
      (set, get) => ({
        isGridLayoutLocked: false,
        widgets: [],
        currentLayout: [],
        savedLayouts: [],
        lastSavedPreset: null,
        isUsingDefaultLayout: false,

        toggleGridLock: () =>
          set((state) => ({ isGridLayoutLocked: !state.isGridLayoutLocked })),
        updateLayout: (newLayout) => set({ currentLayout: newLayout }),
        addWidget: (widget) =>
          set((state) => {
            const newState: Partial<TradingTerminalState> = {
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
            const newState: Partial<TradingTerminalState> = {
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
              `Reordered trading widget ${activeId} to position of ${overId}`
            );
            logger.debug(
              'New trading widget order with updated positions:',
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
              'No trading widgets found, applying default layout for first time'
            );
            // Apply the default layout using the new responsive system
            state.applyLayoutPreset('default');
          } else {
            // If widgets exist, check if we need to adjust them for current screen size
            // This handles cases where user refreshes after setting default layout on small screen
            state.adjustLayoutForCurrentScreen();
          }
        },

        // Layout management
        applyLayoutPreset: (presetName: string) => {
          logger.info(
            'applyLayoutPreset called for trading terminal with:',
            presetName
          );

          if (presetName === 'default') {
            // Get current container width for responsive widget selection
            const containerWidth = window.innerWidth - 64; // Account for sidebar and padding
            const breakpoint = getCurrentBreakpoint(containerWidth);

            // Get default widgets for current breakpoint
            const defaultWidgetConfigs = getDefaultLayoutWidgetsByWidth(
              containerWidth,
              'trading'
            );

            // Create widgets with proper layout data
            const createDefaultTradingWidgets = (): TradingWidgetConfig[] => {
              const widgets: TradingWidgetConfig[] = [];
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
                const widgetWidth = widgetSize.w;
                const widgetHeight = widgetSize.h;

                // Check if widget fits in current row
                if (currentX + widgetWidth > GRID_COLS) {
                  // Move to next row
                  currentX = 0;
                  currentY += rowHeight;
                  rowHeight = 0;
                }

                // Create widget
                const widget: TradingWidgetConfig = {
                  id: `${widgetConfig.type}-${Date.now()}-${index}`,
                  type: widgetConfig.type as TradingWidgetType,
                  title:
                    widgetConfig.title ||
                    getTradingWidgetMetadata(
                      widgetConfig.type as TradingWidgetType
                    )?.title ||
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
                    getTradingWidgetMetadata(
                      widgetConfig.type as TradingWidgetType
                    )?.hasOptions || false,
                };

                widgets.push(widget);

                // Update position for next widget
                currentX += widgetWidth;
                rowHeight = Math.max(rowHeight, widgetHeight);
              });

              return widgets;
            };

            const defaultWidgets = createDefaultTradingWidgets();
            const defaultLayout = defaultWidgets.map((widget) => ({
              ...widget.layoutData,
            }));

            logger.debug(
              `Applying default trading layout with widgets for breakpoint ${breakpoint}:`,
              defaultWidgets
            );

            set({
              widgets: defaultWidgets,
              currentLayout: defaultLayout,
              isUsingDefaultLayout: true, // Mark as using default layout
            });

            // Perform tidy up after setting the default layout
            setTimeout(() => {
              const state = get();
              state.tidyUpLayout();
            }, 0);
          }
        },
        resetLayout: () => {
          logger.info('resetLayout called for trading terminal');
          // Use the new responsive default layout system
          const state = get();
          state.applyLayoutPreset('default');
        },
        tidyUpLayout: () => {
          logger.info(
            'Tidying up layout for trading terminal using TidyLayoutEngine'
          );
          const state = get();

          if (state.widgets.length === 0) {
            logger.info('No widgets to tidy up');
            return;
          }

          // Convert TradingWidgetConfig to WidgetConfig for the engine
          // The TidyLayoutEngine works with the generic WidgetConfig interface
          const widgetsForEngine = state.widgets.map((widget) => ({
            ...widget,
            // Ensure compatibility with the engine's expected interface
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          })) as any; // Type assertion needed due to interface differences

          // Use the sophisticated TidyLayoutEngine for comprehensive layout
          // optimization. It measures the real grid container itself, so the
          // breakpoint it sizes for is the one the grid renders at.
          const tidyResult = tidyLayout(widgetsForEngine, {
            gridCols: 12,
            enableHorizontalExpansion: true,
            enableVerticalCompaction: true,
            minRowGap: 0,
            registry: 'trading',
          });

          logger.info(
            'Trading terminal tidy layout optimization completed:',
            tidyResult.stats
          );

          // Convert back to TradingWidgetConfig and apply the optimized layout
          const optimizedWidgets = tidyResult.widgets.map((widget, index) => ({
            ...state.widgets[index], // Preserve original trading widget data
            layoutData: widget.layoutData, // Apply optimized layout
          }));

          set({
            widgets: optimizedWidgets,
            currentLayout: tidyResult.layout,
            isUsingDefaultLayout: false, // Mark as customized after tidy up
          });
        },
        saveLayout: (name: string) => {
          const { widgets, currentLayout, savedLayouts } = get();
          const screenInfo = getEnhancedScreenSize();
          const newLayout = {
            name,
            layout: currentLayout,
            widgets,
            screenSize: getScreenSize(), // Keep for backward compatibility
            screenInfo, // Enhanced screen information
          };
          set({
            savedLayouts: [
              ...savedLayouts.filter((l) => l.name !== name),
              newLayout,
            ],
            lastSavedPreset: name,
          });
        },
        loadLayout: (name: string) => {
          const { savedLayouts } = get();
          const layout = savedLayouts.find((l) => l.name === name);
          if (layout) {
            set({
              widgets: layout.widgets,
              currentLayout: layout.layout,
              lastSavedPreset: name,
            });
          }
        },
        deleteLayout: (name: string) => {
          set((state) => ({
            savedLayouts: state.savedLayouts.filter((l) => l.name !== name),
          }));
        },
        resetToLastSavedPreset: () => {
          const { lastSavedPreset } = get();
          if (lastSavedPreset) {
            get().loadLayout(lastSavedPreset);
          } else {
            get().resetLayout();
          }
        },
        exportLayout: () => {
          const { widgets, currentLayout } = get();
          const screenInfo = getEnhancedScreenSize();
          const exportData = {
            widgets,
            layout: currentLayout,
            exportedAt: new Date().toISOString(),
            screenSize: getScreenSize(), // Keep for backward compatibility
            screenInfo, // Enhanced screen information
            version: '1.1', // Bump version to indicate enhanced screen info
            page: 'trading-terminal',
          };
          return JSON.stringify(exportData, null, 2);
        },
        importLayout: (layoutData: string) => {
          try {
            const parsed = JSON.parse(layoutData);
            if (parsed.widgets && parsed.layout) {
              set({ widgets: parsed.widgets, currentLayout: parsed.layout });
              return true;
            }
            return false;
          } catch {
            return false;
          }
        },

        // Tab management (stub implementations for compatibility)
        moveTab: (_fromWidgetId, _toWidgetId, _fromTabId, _toIndex) => {},
        reorderTabs: (_widgetId, _fromIndex, _toIndex) => {},

        updateWidgetSizesToDefaults: () => {
          const state = get();
          const { getWidgetHasCustomSize } = useWidgetSettingsStore.getState();

          let hasChanges = false;
          const updatedWidgets = state.widgets.map((widget) => {
            // Skip widgets that have custom sizes
            if (getWidgetHasCustomSize(widget.id)) {
              return widget;
            }

            // Get new default size for this widget type
            const newDefaultSize = getCompatibilityDefaultSize(widget.type);
            const currentSize = {
              w: widget.layoutData.w,
              h: widget.layoutData.h,
            };

            // Check if size needs updating
            if (
              currentSize.w !== newDefaultSize.w ||
              currentSize.h !== newDefaultSize.h
            ) {
              hasChanges = true;
              return {
                ...widget,
                layoutData: {
                  ...widget.layoutData,
                  w: newDefaultSize.w,
                  h: newDefaultSize.h,
                },
              };
            }

            return widget;
          });

          if (hasChanges) {
            // Update current layout to match widget changes
            const newCurrentLayout = updatedWidgets.map((w) => ({
              i: w.id,
              x: w.layoutData.x,
              y: w.layoutData.y,
              w: w.layoutData.w,
              h: w.layoutData.h,
              moved: false,
              static: false,
            }));

            set({
              widgets: updatedWidgets,
              currentLayout: newCurrentLayout,
            });

            logger.info('Updated trading widget sizes to new defaults', {
              updatedCount: updatedWidgets.filter(
                (w, i) => w !== state.widgets[i]
              ).length,
            });
          }
        },

        adjustLayoutForCurrentScreen: () => {
          const state = get();

          if (state.widgets.length === 0) {
            return; // Nothing to adjust
          }

          // Only adjust layout if user is using unmodified default layout
          if (!state.isUsingDefaultLayout) {
            logger.debug(
              'User has customized trading terminal layout, skipping automatic adjustment'
            );
            return;
          }

          // Get current container width for responsive widget adjustment
          const containerWidth = window.innerWidth - 64; // Account for sidebar and padding
          const currentBreakpoint = getCurrentBreakpoint(containerWidth);

          logger.info(
            'Checking trading terminal layout adjustment for current screen:',
            {
              containerWidth,
              breakpoint: currentBreakpoint,
              windowWidth: window.innerWidth,
            }
          );

          // Check if current layout needs adjustment based on screen size
          let needsAdjustment = false;

          // Also check if we need to add/remove widgets based on the current breakpoint
          const defaultWidgetConfigs = getDefaultLayoutWidgetsByWidth(
            containerWidth,
            'trading'
          );

          const currentWidgetTypes = new Set(state.widgets.map((w) => w.type));
          const expectedWidgetTypes = new Set(
            defaultWidgetConfigs.map((w) => w.type)
          );

          // Check if widget composition differs (widgets missing or extra)
          const widgetsNeedAdjustment =
            currentWidgetTypes.size !== expectedWidgetTypes.size ||
            [...expectedWidgetTypes].some(
              (type) => !currentWidgetTypes.has(type as TradingWidgetType)
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
              logger.debug(
                `Trading widget ${widget.type} needs size adjustment:`,
                {
                  current: { w: widget.layoutData.w, h: widget.layoutData.h },
                  target: currentSize,
                  breakpoint: currentBreakpoint,
                }
              );
            }
          });

          if (needsAdjustment || widgetsNeedAdjustment) {
            logger.info(
              'Trading terminal layout adjustment needed, re-applying default layout for current screen size'
            );

            // Create new widgets with proper layout for current breakpoint
            const createAdjustedWidgets = () => {
              const adjustedWidgets: TradingWidgetConfig[] = [];
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
                  const widgetWidth = widgetSize.w;
                  const widgetHeight = widgetSize.h;

                  // Check if widget fits in current row
                  if (currentX + widgetWidth > GRID_COLS) {
                    // Move to next row
                    currentX = 0;
                    currentY += rowHeight;
                    rowHeight = 0;
                  }

                  // Create adjusted widget preserving existing data and settings
                  const adjustedWidget: TradingWidgetConfig = {
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
                  const newWidget: TradingWidgetConfig = {
                    id: `${widgetConfig.type}-${Date.now()}-${index}`,
                    type: widgetConfig.type as TradingWidgetType,
                    title:
                      widgetConfig.title ||
                      getTradingWidgetMetadata(
                        widgetConfig.type as TradingWidgetType
                      )?.title ||
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
                      getTradingWidgetMetadata(
                        widgetConfig.type as TradingWidgetType
                      )?.hasOptions || false,
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

            logger.debug('Applied screen-adjusted trading terminal layout:', {
              breakpoint: currentBreakpoint,
              adjustedWidgets: adjustedWidgets.length,
              originalWidgets: state.widgets.length,
              widgetsNeedAdjustment,
            });

            set({
              widgets: adjustedWidgets,
              currentLayout: adjustedLayout,
            });
          } else {
            logger.debug(
              'No trading terminal layout adjustment needed for current screen size'
            );
          }
        },

        markLayoutAsCustomized: () => {
          set({ isUsingDefaultLayout: false });
        },
      }),
      {
        name: 'trading-terminal-store',
      }
    )
  )
);
