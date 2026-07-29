import type { Layout } from 'react-grid-layout';
import { logger } from '../../lib/loggerInstance';
import type { WidgetConfig } from '../../stores/dashboardStore';
import {
  getCurrentBreakpoint,
  getDefaultWidgetSize,
  type Breakpoint,
} from '../widgets/DefaultWidgetSizes';
import { getWidgetMetadata, type WidgetType } from '../widgets/dashboard';

/**
 * TidyLayoutEngine - A comprehensive layout optimization system
 *
 * This component handles the intelligent reorganization of dashboard widgets to:
 * 1. Reset all widgets to their default sizes
 * 2. Minimize empty spaces through optimal positioning
 * 3. Expand widgets to fill available space while respecting constraints
 *
 * ALGORITHM OVERVIEW:
 * ==================
 *
 * Phase 1: Reset to Default Sizes
 * - Each widget is reset to its predefined default width and height
 * - This ensures consistent starting point regardless of previous manual resizing
 * - Default sizes are defined in DefaultWidgetSizes.ts
 *
 * Phase 2: Optimal Positioning (Grid Packing)
 * - Widgets are arranged in rows, left to right, top to bottom
 * - When the next widget is too wide for what is left of the row, we look
 *   further down the queue for one that does fit rather than wrapping and
 *   abandoning those columns
 *
 * Phase 3: Space Expansion (Horizontal Optimization)
 * - Whatever columns a row did not use are handed back to that row's widgets,
 *   one column at a time so the space is shared evenly
 * - No widget grows past its maxSize; a row whose widgets are all capped keeps
 *   its remainder (that cap is a deliberate per-widget constraint)
 *
 * Phase 4: Vertical Compaction
 * - Rows are stacked directly under one another, each as tall as its tallest
 *   widget, so no dead band survives between rows
 */

export interface TidyLayoutOptions {
  /** Grid system column count (typically 12) */
  gridCols?: number;
  /** Whether to enable horizontal expansion to fill empty spaces */
  enableHorizontalExpansion?: boolean;
  /** Whether to enable vertical compaction */
  enableVerticalCompaction?: boolean;
  /** Minimum gap between rows (in grid units) */
  minRowGap?: number;
  /** Registry type for appropriate widget sizing ('dashboard' | 'trading') */
  registry?: 'dashboard' | 'trading';
  /** Override container width for breakpoint calculation */
  containerWidth?: number;
}

export interface TidyLayoutResult {
  /** Optimized layout array for react-grid-layout */
  layout: Layout[];
  /** Updated widget configurations with new layout data */
  widgets: WidgetConfig[];
  /** Breakpoint the sizes were computed for (callers persist sizes against it) */
  breakpoint: Breakpoint;
  /** Statistics about the optimization */
  stats: {
    totalWidgets: number;
    spaceSavedVertically: number;
    spaceSavedHorizontally: number;
    averageWidgetExpansion: number;
  };
}

/**
 * Main tidy layout engine class
 * Encapsulates all the logic for intelligent widget reorganization
 */
export class TidyLayoutEngine {
  private options: TidyLayoutOptions;

  constructor(options: TidyLayoutOptions = {}) {
    this.options = {
      gridCols: 12,
      enableHorizontalExpansion: true,
      enableVerticalCompaction: true,
      minRowGap: 0,
      registry: 'dashboard',
      ...options,
    };
  }

  /**
   * Main entry point for layout optimization
   * Performs all phases of the tidy up process
   */
  public tidyLayout(widgets: WidgetConfig[]): TidyLayoutResult {
    logger.info('Starting tidy layout process', {
      widgetCount: widgets.length,
      options: this.options,
    });

    const breakpoint = getCurrentBreakpoint(this.resolveContainerWidth());

    if (widgets.length === 0) {
      return {
        layout: [],
        widgets: [],
        breakpoint,
        stats: {
          totalWidgets: 0,
          spaceSavedVertically: 0,
          spaceSavedHorizontally: 0,
          averageWidgetExpansion: 0,
        },
      };
    }

    // Phase 1: Reset to default sizes
    const resizedWidgets = this.resetToDefaultSizes(widgets, breakpoint);
    logger.debug('Phase 1 complete: Reset to default sizes');

    // Phase 2: Optimal positioning (grid packing)
    const packedLayout = this.packWidgets(resizedWidgets);
    logger.debug('Phase 2 complete: Optimal positioning');

    // Phase 3: Space expansion (horizontal optimization)
    const expandedLayout = this.options.enableHorizontalExpansion
      ? this.fillHorizontalGaps(packedLayout, resizedWidgets)
      : packedLayout;
    logger.debug('Phase 3 complete: Horizontal expansion');

    // Phase 4: Vertical compaction
    const compactedLayout = this.options.enableVerticalCompaction
      ? this.compactVertically(expandedLayout)
      : expandedLayout;
    logger.debug('Phase 4 complete: Vertical compaction');

    // Update widget configurations with final layout data
    const finalWidgets = this.updateWidgetLayoutData(
      resizedWidgets,
      compactedLayout
    );

    // Calculate optimization statistics
    const stats = this.calculateStats(widgets, finalWidgets, compactedLayout);

    logger.info('Tidy layout process completed', stats);

    return {
      layout: compactedLayout,
      widgets: finalWidgets,
      breakpoint,
      stats,
    };
  }

  /**
   * Resolve the width the grid is actually rendered at.
   *
   * The breakpoint decides which default widget sizes we lay out with, and the
   * renderer picks its own breakpoint from the *grid container* width. Guessing
   * from `window.innerWidth` disagrees with it whenever the sidebar, page
   * padding or a scrollbar is in play, which produced layouts sized for one
   * breakpoint but drawn at another.
   */
  private resolveContainerWidth(): number {
    if (this.options.containerWidth !== undefined) {
      return this.options.containerWidth;
    }

    if (typeof document !== 'undefined') {
      const grid = document.querySelector('.react-grid-layout');
      if (grid && grid.clientWidth > 0) {
        return grid.clientWidth;
      }
    }

    const viewportWidth =
      typeof window !== 'undefined' ? window.innerWidth - 64 : 0;

    // A zero/negative width means nothing has been laid out yet (SSR, hidden
    // tab). Fall back to a desktop width rather than tidying for `xxs`.
    return viewportWidth > 0 ? viewportWidth : 1200;
  }

  /**
   * PHASE 1: Reset all widgets to their default dimensions
   *
   * Why this is important:
   * - Users may have manually resized widgets over time
   * - Some widgets might be in non-optimal sizes
   * - Creates a clean, consistent starting point for optimization
   * - Ensures predictable behavior regardless of current state
   * - Uses responsive sizing based on current screen width
   */
  private resetToDefaultSizes(
    widgets: WidgetConfig[],
    breakpoint: Breakpoint
  ): WidgetConfig[] {
    logger.debug(
      `Resetting widgets to default sizes for breakpoint: ${breakpoint}`
    );

    const gridCols = this.options.gridCols ?? 12;

    return widgets.map((widget) => {
      // Get the responsive default size for this widget type and current breakpoint
      const defaultSize = getDefaultWidgetSize(widget.type, breakpoint);

      logger.debug(
        `Resetting widget ${widget.id} (${widget.type}) to responsive default size:`,
        {
          breakpoint,
          from: { w: widget.layoutData.w, h: widget.layoutData.h },
          to: { w: defaultSize.w, h: defaultSize.h },
        }
      );

      return {
        ...widget,
        layoutData: {
          ...widget.layoutData,
          w: Math.min(Math.max(1, defaultSize.w), gridCols),
          h: defaultSize.h,
          // Keep current position for now, will be optimized in next phase
        },
      };
    });
  }

  /**
   * PHASE 2: Create optimal packed layout (minimize empty spaces)
   *
   * Algorithm: row packing with look-ahead.
   * - Widgets are laid into rows in order, but when the next widget is too wide
   *   for what is left of the current row we look further down the queue for one
   *   that does fit instead of wrapping immediately
   * - That look-ahead is the difference between a row that ends at 8/12 columns
   *   (the old behaviour, which left a permanent hole) and a row that fills
   */
  private packWidgets(widgets: WidgetConfig[]): Layout[] {
    const gridCols = this.options.gridCols ?? 12;
    const minRowGap = this.options.minRowGap ?? 0;
    const queue = widgets.map((widget) => ({
      id: widget.id,
      w: Math.min(Math.max(1, widget.layoutData.w), gridCols),
      h: widget.layoutData.h,
    }));

    const layouts: Layout[] = [];
    let currentY = 0;

    while (queue.length > 0) {
      let remaining = gridCols;
      let x = 0;
      let rowHeight = 0;

      // Keep pulling the first widget that still fits this row.
      for (;;) {
        const index = queue.findIndex((candidate) => candidate.w <= remaining);
        if (index === -1) break;

        const [widget] = queue.splice(index, 1);
        layouts.push({
          i: widget.id,
          x,
          y: currentY,
          w: widget.w,
          h: widget.h,
          moved: false,
          static: false,
        });

        logger.debug(
          `Placed widget ${widget.id} at (${x}, ${currentY}) size (${widget.w}x${widget.h})`
        );

        x += widget.w;
        remaining -= widget.w;
        rowHeight = Math.max(rowHeight, widget.h);
      }

      currentY += rowHeight + minRowGap;
    }

    return layouts;
  }

  /**
   * PHASE 3: Horizontal expansion to fill empty spaces
   *
   * Hands the columns a row did not use to the widgets in that row, one column
   * at a time so the space is shared evenly, and never past a widget's maxSize.
   *
   * The previous implementation split the leftover proportionally and floored
   * every share, so it routinely gave away fewer columns than were free - and a
   * row holding a single widget kept its whole gap.
   */
  private fillHorizontalGaps(
    layouts: Layout[],
    widgets: WidgetConfig[]
  ): Layout[] {
    if (layouts.length === 0) return layouts;

    const gridCols = this.options.gridCols ?? 12;
    const expanded: Layout[] = [];

    for (const rowLayouts of this.groupLayoutsByRow(layouts).values()) {
      const row = rowLayouts.map((layout) => ({ ...layout }));
      const maxWidths = row.map((layout) => {
        const widget = widgets.find((candidate) => candidate.id === layout.i);
        return Math.min(this.getMaxSize(widget?.type || '').w, gridCols);
      });

      let remaining =
        gridCols - row.reduce((sum, layout) => sum + layout.w, 0);

      // Round-robin a column at a time: exact, and no widget hogs the gap.
      let progressed = true;
      while (remaining > 0 && progressed) {
        progressed = false;
        for (let index = 0; index < row.length && remaining > 0; index++) {
          if (row[index].w < maxWidths[index]) {
            row[index].w += 1;
            remaining -= 1;
            progressed = true;
          }
        }
      }

      // Re-flow the row now that the widths are final.
      let x = 0;
      for (const layout of row) {
        layout.x = x;
        x += layout.w;
        expanded.push(layout);
      }
    }

    return expanded;
  }

  /**
   * PHASE 4: Vertical compaction to remove unnecessary gaps
   *
   * Stacks the rows directly under one another, each row as tall as its tallest
   * widget, so no dead band survives between rows.
   */
  private compactVertically(layouts: Layout[]): Layout[] {
    if (layouts.length === 0) return layouts;

    const minRowGap = this.options.minRowGap ?? 0;
    const rows = Array.from(this.groupLayoutsByRow(layouts).entries()).sort(
      ([a], [b]) => a - b
    );

    const compacted: Layout[] = [];
    let currentY = 0;

    for (const [, rowLayouts] of rows) {
      const rowHeight = Math.max(...rowLayouts.map((layout) => layout.h));

      for (const layout of rowLayouts) {
        compacted.push({ ...layout, y: currentY });
      }

      currentY += rowHeight + minRowGap;
    }

    // Preserve the incoming order so callers can zip layouts to widgets.
    return layouts.map(
      (item) => compacted.find((entry) => entry.i === item.i) ?? { ...item }
    );
  }

  /**
   * Group layouts by their Y coordinate (row), keeping each row left-to-right
   */
  private groupLayoutsByRow(layouts: Layout[]): Map<number, Layout[]> {
    const rowGroups = new Map<number, Layout[]>();

    for (const layout of [...layouts].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rowGroups.get(layout.y);
      if (row) {
        row.push(layout);
      } else {
        rowGroups.set(layout.y, [layout]);
      }
    }

    return rowGroups;
  }

  /**
   * Get maximum allowed size for a widget type
   */
  private getMaxSize(type: string): { w: number; h: number } {
    try {
      return (
        getWidgetMetadata(type as WidgetType).maxSize ?? { w: 12, h: 8 }
      );
    } catch {
      // Fallback for unknown widget types
      logger.warn(`Unknown widget type: ${type}. Using fallback max size.`);
      return { w: 12, h: 8 };
    }
  }

  /**
   * Update widget configurations with final layout data
   */
  private updateWidgetLayoutData(
    widgets: WidgetConfig[],
    layouts: Layout[]
  ): WidgetConfig[] {
    return widgets.map((widget) => {
      const layoutItem = layouts.find((item) => item.i === widget.id);
      if (layoutItem) {
        return {
          ...widget,
          // Spread over the existing layoutData so per-widget constraints
          // (minW/maxW/...) survive the tidy pass.
          layoutData: { ...widget.layoutData, ...layoutItem },
        };
      }
      return widget;
    });
  }

  /**
   * Calculate optimization statistics for reporting
   */
  private calculateStats(
    originalWidgets: WidgetConfig[],
    finalWidgets: WidgetConfig[],
    finalLayout: Layout[]
  ) {
    const originalMaxY = Math.max(
      ...originalWidgets.map((w) => w.layoutData.y + w.layoutData.h),
      0
    );
    const finalMaxY = Math.max(...finalLayout.map((l) => l.y + l.h), 0);

    const spaceSavedVertically = Math.max(0, originalMaxY - finalMaxY);

    const totalExpansion = finalWidgets.reduce((sum, widget, index) => {
      const originalWidget = originalWidgets[index];
      const expansion = widget.layoutData.w - originalWidget.layoutData.w;
      return sum + Math.max(0, expansion);
    }, 0);

    const averageWidgetExpansion =
      finalWidgets.length > 0 ? totalExpansion / finalWidgets.length : 0;

    return {
      totalWidgets: finalWidgets.length,
      spaceSavedVertically,
      spaceSavedHorizontally: totalExpansion,
      averageWidgetExpansion,
    };
  }
}

/**
 * Convenience function to create and use the tidy layout engine
 *
 * @param widgets - Array of widget configurations to optimize
 * @param options - Optional configuration for the optimization process
 * @returns Optimized layout result with statistics
 */
export function tidyLayout(
  widgets: WidgetConfig[],
  options?: TidyLayoutOptions
): TidyLayoutResult {
  const engine = new TidyLayoutEngine(options);
  return engine.tidyLayout(widgets);
}

/**
 * USAGE EXAMPLES:
 * ===============
 *
 * Basic usage:
 * ```typescript
 * const result = tidyLayout(currentWidgets);
 * // Apply result.layout and result.widgets to your store
 * ```
 *
 * With custom options:
 * ```typescript
 * const result = tidyLayout(currentWidgets, {
 *   gridCols: 12,
 *   enableHorizontalExpansion: true,
 *   enableVerticalCompaction: true,
 *   minRowGap: 1
 * });
 * ```
 *
 * Disable certain optimizations:
 * ```typescript
 * const result = tidyLayout(currentWidgets, {
 *   enableHorizontalExpansion: false, // Only pack and compact
 *   enableVerticalCompaction: true
 * });
 * ```
 */
