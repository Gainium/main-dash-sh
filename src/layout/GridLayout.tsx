/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GridLayout Component - Widget Rendering System
 *
 * CRITICAL: When adding a new widget type, you MUST complete these steps:
 *
 * 1. Import the widget component at the top of this file
 * 2. Add a case for the widget type in the renderWidgetComponent() switch statement (around line 184)
 * 3. Register the widget in the appropriate registry file:
 *    - Dashboard widgets: src/components/widgets/dashboard/WIDGET_REGISTRY.ts
 *    - Report widgets: src/reports/widgets/reportWidgetRegistry.ts
 *    - Bot widgets: src/components/widgets/bots/index.ts
 * 4. Add default sizes in src/components/widgets/DefaultWidgetSizes.ts
 * 5. Add the widget to available widgets list in WidgetBrowser
 *
 * If any step is missed, the widget will show as a "Widget placeholder" with the message:
 * "Widget placeholder - Type: [widget-type]"
 *
 * This file handles rendering for ALL widget registries:
 * - 'dashboard': Trading dashboard widgets (portfolio, profit, bots, etc.)
 * - 'report': Reports page widgets (charts, tables, histogram, scatter, etc.)
 * - 'bot': Bot-specific widgets (handled separately in drawer)
 */

import { Plus } from 'lucide-react';
import React, { useCallback, useMemo, useRef } from 'react';
import {
  Responsive as ResponsiveGridLayout,
  WidthProvider,
  type Layout,
} from 'react-grid-layout';
import { Button } from '../components/ui/button';
import {
  AccumulatedProfit,
  BotStatsAdvanced,
  BotStatus,
  CoinChart,
  LatestOrders,
  NewsRSS,
  NotesWidget,
  OverviewQuickActions,
  PortfolioAllocation,
  PortfolioBalances,
  PortfolioCategoriesAnalysis,
  PortfolioExchangeDistribution,
  PortfolioValue,
  Profit,
  TreemapDeals,
  Watchlist,
} from '../components/widgets/dashboard';
import { hasSlot, Slot, type SlotName } from '../lib/extensions';
import {
  getDefaultWidgetSize,
  type Breakpoint,
} from '../components/widgets/DefaultWidgetSizes';
import { useGridLayout } from '../hooks/useGridLayout';
import { useGridMargins } from '../hooks/useSpacing';
import { cn } from '../lib/utils';
import { type WidgetConfig } from '../stores/dashboardStore';
import { useWidgetSettingsStore } from '../stores/widgetSettingsStore';

// Import react-grid-layout CSS
import 'react-grid-layout/css/styles.css';
const ResponsiveGrid = WidthProvider(ResponsiveGridLayout);

interface GridLayoutProps {
  className?: string;
  children?: React.ReactNode;
  registry?: 'dashboard' | 'report';
}

const GridLayout: React.FC<GridLayoutProps> = ({
  className,
  children,
  registry = 'dashboard',
}) => {
  // Use the comprehensive grid layout hook
  const {
    widgets,
    currentLayout,
    isGridLayoutLocked,
    handleLayoutChange,
    handleWidgetCollapse,
    createMenuActions,
    handleResizeStart,
    handleResizeStop,
    gridConfig,
    containerRef,
    updateWidget,
  } = useGridLayout({ registry });

  // Get widget settings to check for custom sizes
  const { getWidgetHasCustomSize, getWidgetCollapsed } =
    useWidgetSettingsStore();

  // Get dynamic grid margins based on visual settings (compact/comfortable)
  const gridMargins = useGridMargins();

  // Use a ref to track if we're in the middle of a breakpoint change
  // This prevents saving auto-rearranged layouts during responsive breakpoint transitions
  const isBreakpointChanging = useRef(false);

  /**
   * Generate responsive layouts for each breakpoint
   * Uses default sizes from DefaultWidgetSizes unless user has customized
   * Always uses default positions from widget.layoutData to ensure proper responsive behavior
   */
  const responsiveLayouts = useMemo(() => {
    const breakpoints: Breakpoint[] = ['lg', 'md', 'sm', 'xs', 'xxs'];
    const layouts: Record<string, Layout[]> = {};

    breakpoints.forEach((breakpoint) => {
      const breakpointLayout: Layout[] = [];

      widgets.forEach((widget, _index) => {
        // Check if user has customized this widget's size
        const hasCustom = getWidgetHasCustomSize(widget.id);
        // Check if widget is currently collapsed
        const isCollapsed = getWidgetCollapsed(widget.id);

        let widgetWidth: number;
        let widgetHeight: number;

        // Find stored layout for this widget
        const storedLayout = currentLayout.find((l) => l.i === widget.id);

        // Get default size for this breakpoint
        const defaultSize = getDefaultWidgetSize(widget.type, breakpoint);

        if (hasCustom && storedLayout) {
          // User has customized - use the stored layout dimensions
          widgetWidth = storedLayout.w;
          widgetHeight = storedLayout.h;
        } else if (storedLayout) {
          // Layout exists but not customized - use responsive size
          widgetWidth = defaultSize.w;
          widgetHeight = defaultSize.h;
        } else {
          // No layout exists - use default size
          widgetWidth = defaultSize.w;
          widgetHeight = defaultSize.h;
        }

        // Override height to 0.75 if widget is collapsed (60px with rowHeight 80)
        if (isCollapsed) {
          widgetHeight = 0.75;
        }

        // Always use default positions from widget.layoutData
        // react-grid-layout will handle responsive repositioning automatically
        const layoutItem: Layout = {
          i: widget.id,
          x: widget.layoutData.x,
          y: widget.layoutData.y,
          w: widgetWidth,
          h: widgetHeight,
          moved: false,
          static: false,
        };

        breakpointLayout.push(layoutItem);
      });

      layouts[breakpoint] = breakpointLayout;
    });

    return layouts;
  }, [widgets, currentLayout, getWidgetHasCustomSize, getWidgetCollapsed]);

  /**
   * Handle breakpoint changes from react-grid-layout
   * Set a flag to prevent saving auto-rearranged layouts during breakpoint transitions
   */
  const handleBreakpointChange = useCallback(() => {
    // Set flag to ignore the next few layout changes during breakpoint transition
    isBreakpointChanging.current = true;

    // Reset the flag after a short delay to allow react-grid-layout to settle
    setTimeout(() => {
      isBreakpointChanging.current = false;
    }, 100);
  }, []);

  /**
   * Wrapped layout change handler that ignores changes during breakpoint transitions
   */
  const wrappedHandleLayoutChange = useCallback(
    (layout: Layout[]) => {
      // Don't save layouts that are auto-generated during breakpoint changes
      if (isBreakpointChanging.current) {
        return;
      }
      handleLayoutChange(layout);
    },
    [handleLayoutChange]
  );

  // Render widget content
  const renderWidget = useCallback(
    (widget: WidgetConfig | any) => {
      const menuActions = createMenuActions(widget);

      const renderWidgetComponent = () => {
        // Dashboard and report widgets
        switch (widget.type) {
          case 'portfolio-value':
            return (
              <PortfolioValue
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'profit':
            return (
              <Profit
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'accumulated-profit':
            return (
              <AccumulatedProfit
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'bot-status':
            return (
              <BotStatus
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'bot-stats-advanced':
            return (
              <BotStatsAdvanced
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'latest-orders':
            return (
              <LatestOrders
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                showPagination={true}
                menuActions={menuActions}
              />
            );
          case 'treemap-deals':
            return (
              <TreemapDeals
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'watchlist':
            return (
              <Watchlist
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'portfolio-allocation':
            return (
              <PortfolioAllocation
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'portfolio-balances':
            return (
              <PortfolioBalances
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'coin-chart':
            return (
              <CoinChart
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'notes':
            return (
              <NotesWidget
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                isCollapsible={true}
                allowResize={true}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'news-rss':
            return (
              <NewsRSS
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                isCollapsible={true}
                allowResize={true}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'overview-quick-actions':
            return (
              <OverviewQuickActions
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'portfolio-categories-analysis':
            return (
              <PortfolioCategoriesAnalysis
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          case 'portfolio-exchange-distribution':
            return (
              <PortfolioExchangeDistribution
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          default: {
            // Widget types not handled above are looked up through the
            // slot adapter. Host builds register components under
            // `widget.<type>`.
            const slotName = `widget.${widget.type}` as SlotName;
            if (!hasSlot(slotName)) {
              // No registration for this type (e.g. a cloud-only widget in
              // an sh build, or a stale saved layout). Rendering `null`
              // here used to leave an invisible, unremovable grid cell —
              // show an explicit placeholder with a remove action instead.
              return (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg bg-card p-md text-center">
                  <p className="text-sm text-muted-foreground">
                    This widget is not available in this edition.
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Type: {widget.type}
                  </p>
                  {!isGridLayoutLocked && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => menuActions.onDelete?.()}
                    >
                      Remove widget
                    </Button>
                  )}
                </div>
              );
            }
            return (
              <Slot
                name={slotName}
                widgetId={widget.id}
                isEditable={!isGridLayoutLocked}
                onCollapse={handleWidgetCollapse}
                menuActions={menuActions}
              />
            );
          }
        }
      };

      // Check if this widget is collapsed
      const isCollapsed = getWidgetCollapsed(widget.id);

      return (
        <div
          key={widget.id}
          className="h-full"
          style={{ height: '100%' }}
          data-widget-collapsed={isCollapsed ? 'true' : 'false'}
        >
          {renderWidgetComponent()}
        </div>
      );
    },
    [
      isGridLayoutLocked,
      handleWidgetCollapse,
      createMenuActions,
      getWidgetCollapsed,
      updateWidget,
    ]
  );

  // Grid layout configuration
  const { breakpoints } = gridConfig;

  // Compute the correct margin based on the current viewport width
  // We match the same breakpoint detection logic used by react-grid-layout
  const currentMargin = useMemo(() => {
    // The key insight: gridMargins is already reactive and changes when spacing mode changes
    // We just need to apply the right breakpoint's margin based on current window width
    if (typeof window === 'undefined') {
      return gridMargins['lg']; // SSR fallback
    }

    const width = window.innerWidth;

    // Match the breakpoints defined in gridConfig
    if (width >= breakpoints.lg) return gridMargins['lg'];
    if (width >= breakpoints.md) return gridMargins['md'];
    if (width >= breakpoints.sm) return gridMargins['sm'];
    if (width >= breakpoints.xs) return gridMargins['xs'];
    return gridMargins['xs'];
  }, [gridMargins, breakpoints]);

  // Container padding: keep vertical padding but remove horizontal
  // since MainLayout now handles the horizontal margins
  const containerPadding: [number, number] = useMemo(() => {
    return [0, currentMargin[1]];
  }, [currentMargin]);

  // Handle opening the widget manager
  const handleOpenWidgetManager = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('openWidgetsManager', {
        detail: { registry, action: 'toggle' },
      })
    );
  }, [registry]);

  // Show empty state when there are no widgets
  if (widgets.length === 0) {
    return (
      <div
        className={cn(
          'w-full h-full flex items-center justify-center bg-background',
          className
        )}
        ref={containerRef}
      >
        <div className="flex flex-col items-center justify-center gap-md text-center p-xl max-w-md">
          <div className="rounded-full bg-muted p-lg">
            <Plus className="h-12 w-12 text-muted-foreground" />
          </div>
          <div className="space-y-xs">
            <h3 className="text-2xl font-semibold tracking-tight">
              No widgets yet
            </h3>
            <p className="text-sm text-muted-foreground">
              Get started by adding widgets to your dashboard. Click the button
              below to browse available widgets.
            </p>
          </div>
          <Button onClick={handleOpenWidgetManager} size="lg" className="mt-2">
            <Plus className="mr-2 h-4 w-4" />
            Add Widgets
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('w-full custom-scrollbar bg-background', className)}
      ref={containerRef}
      style={{ scrollBehavior: 'smooth' }}
      data-tour="grid-layout"
    >
      {/* Grid spacing and rounded corners styling */}
      <style>{`
        .react-grid-layout {
          margin: 0 !important;
        }

        .react-grid-item {
          /* Remove default margins since we'll use react-grid-layout's margin prop */
          margin: 0 !important;
        }

        /* Ensure widget content respects rounded corners and fills the grid item */
        .react-grid-item > div {
          height: 100%;
          overflow: hidden; /* This ensures rounded corners are respected */
        }

        /* Hide resize handle for collapsed widgets */
        .react-grid-item:has(> div[data-widget-collapsed="true"]) .react-resizable-handle {
          display: none !important;
        }
      `}</style>
      <ResponsiveGrid
        className="layout"
        layouts={responsiveLayouts}
        breakpoints={breakpoints}
        cols={gridConfig.cols}
        rowHeight={80}
        onLayoutChange={wrappedHandleLayoutChange}
        onBreakpointChange={handleBreakpointChange}
        isDraggable={!isGridLayoutLocked}
        isResizable={!isGridLayoutLocked}
        draggableHandle="[data-drag-handle]"
        compactType="vertical"
        preventCollision={false}
        margin={currentMargin}
        containerPadding={containerPadding}
        useCSSTransforms={true}
        transformScale={1}
        allowOverlap={false}
        isBounded={false}
        autoSize={true}
        maxRows={Infinity}
        style={{ minHeight: 'calc(100vh - 120px)' }}
        onResizeStart={handleResizeStart}
        onResizeStop={handleResizeStop}
      >
        {widgets.map(renderWidget)}
      </ResponsiveGrid>

      {/* Render any additional children outside the grid */}
      {children}
    </div>
  );
};

export default GridLayout;
