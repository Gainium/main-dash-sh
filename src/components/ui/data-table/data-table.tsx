import { logger } from '@/lib/loggerInstance';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { rankItem } from '@tanstack/match-sorter-utils';
import {
  createTable,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type GroupingState,
  type Row,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Download,
  EyeOff,
  Filter,
  Grid2x2,
  GripVertical,
  Menu,
  Minus,
  MoreVertical,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Rows3,
  ScanLine,
  Search,
  SquareCheck,
  X,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DataTableFooter } from './data-table-footer';
import { downloadCsv } from './exportCsv';
import { ColumnFilter } from './filter-components';
import {
  countActiveFilters,
  createEnhancedColumnFilter,
  enhancedColumnFilter,
} from './filter-logic';
import { QuickFilterBar } from './QuickFilterBar';
import { QuickFilters, type QuickFilterConfig } from './QuickFilters';
import { deserializeFilters, deserializeSorting, serialize } from './urlSync';

import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRenderLoopTripwire } from '@/hooks/useRenderLoopTripwire';
import { useTablePreferences } from '../../../stores/tablePreferencesStore';
import { Badge } from '../badge';
import { Button } from '../button';
import { Card } from '../card';
import { Checkbox } from '../checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { Input } from '../input';
import { Label } from '../label';
import { MasonryLayout } from '../MasonryLayout';
import {
  ResponsiveButtonRow,
  type OverflowMenuItem,
  type ResponsiveButtonConfig,
} from '../ResponsiveButtonRow';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';

/**
 * Overflow metadata for toolbar action buttons.
 * When provided, allows the button to appear in the overflow menu when space is constrained.
 */
export interface ToolbarActionOverflowMeta {
  /** Label to show in overflow menu */
  menuLabel: React.ReactNode;
  /** Icon to show in overflow menu */
  menuIcon?: React.ComponentType<{ className?: string }>;
  /** Callback when clicked from overflow menu */
  onMenuClick: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
}

/**
 * Bulk action definition for DataTable.
 *
 * OVERVIEW:
 * Bulk actions allow users to perform operations on multiple selected rows at once.
 * When provided, the DataTable automatically adds:
 * - A selection checkbox column (always first, sticky left)
 * - "Select all" checkbox in header
 * - Individual row checkboxes in each row
 * - A toolbar button showing selected count with dropdown menu of actions
 *
 * USAGE EXAMPLE:
 * ```tsx
 * const bulkActions: BulkAction<Bot>[] = [
 *   {
 *     id: 'delete',
 *     label: 'Delete selected',
 *     icon: Trash2,
 *     destructive: true,
 *     onAction: (selectedBots) => {
 *       selectedBots.forEach(bot => deleteBot(bot.id));
 *     },
 *   },
 *   {
 *     id: 'export',
 *     label: 'Export to CSV',
 *     icon: Download,
 *     onAction: (selectedBots) => {
 *       exportToCSV(selectedBots);
 *     },
 *   },
 * ];
 *
 * <DataTable
 *   bulkActions={bulkActions}
 *   getRowId={(row) => row.id} // CRITICAL: Must provide stable IDs
 *   // ... other props
 * />
 * ```
 *
 * CRITICAL REQUIREMENTS:
 * 1. MUST provide getRowId prop that returns stable, unique IDs for each row
 *    - Without this, selection breaks when data is sorted/filtered
 *    - Row index is used as fallback but is fragile and NOT recommended
 *
 * 2. Row IDs MUST be consistent across renders
 *    - Same data item should always have same ID
 *    - If IDs change, selection will break or reset unexpectedly
 *
 * 3. Actions receive array of original row data (not table row objects)
 *    - Type is TData[], matching your data prop type
 *    - Contains only selected rows' original data
 *
 * HOW IT WORKS INTERNALLY:
 * 1. DataTable checks if bulkActions is provided and non-empty
 * 2. If yes, creates a special _selection column (always first)
 * 3. Enables React Table's row selection feature
 * 4. Tracks selection in rowSelection state: { "row-id": true, ... }
 * 5. Computes selectedRows array by mapping IDs to actual data
 * 6. Renders toolbar button when selectedRows.length > 0
 * 7. Executes action.onAction(selectedRows) when action is clicked
 *
 * COMMON ISSUES & FIXES:
 * - Checkboxes don't respond to clicks
 *   → Check enableRowSelection in table config (should be true)
 * - Selection count shows 0 even when rows are selected
 *   → Check selectedRows memo dependencies include rowSelection
 * - Bulk actions button doesn't appear
 *   → Verify bulkActions prop is defined, non-empty, and selectedRows.length > 0
 * - Actions receive wrong/stale data
 *   → Ensure getRowId returns stable IDs, check selectedRows calculation
 * - Selection resets unexpectedly
 *   → Check if data reference is changing unnecessarily
 *   → Verify getRowId returns consistent IDs
 *
 * TESTING CHECKLIST:
 * 1. Can select/deselect individual rows
 * 2. Can select/deselect all rows with header checkbox
 * 3. Selection count updates in toolbar button
 * 4. Bulk actions dropdown appears when rows are selected
 * 5. Action receives correct selected rows data
 * 6. Clear selection works and hides button
 * 7. Selection persists when filtering/sorting (for visible rows)
 * 8. Selection clears when data prop changes
 *
 * Each action will appear in the "Actions" dropdown when rows are selected.
 */
export interface BulkAction<TData> {
  /** Unique identifier for this action */
  id: string;
  /** Label to display in the dropdown menu */
  label: React.ReactNode;
  /** Optional icon to show next to the label */
  icon?: React.ComponentType<{ className?: string }>;
  /** Callback when the action is triggered with selected rows */
  onAction: (selectedRows: TData[]) => void;
  /** Whether the action is destructive (will be styled accordingly) */
  destructive?: boolean;
  /** Whether the action is disabled */
  disabled?: boolean;
  /** Optional function to determine if this action should be shown based on selected rows */
  shouldShow?: (selectedRows: TData[]) => boolean;
}

/**
 * Shape guards for table state restored from the URL. The URL is user-editable
 * and can also carry params written by an older build, so anything read out of
 * it is validated before it replaces the persisted preferences — applying a
 * half-parsed value is how filters got wiped on every reload.
 */
const isColumnFiltersState = (parsed: unknown): parsed is ColumnFiltersState =>
  Array.isArray(parsed) &&
  parsed.length > 0 &&
  parsed.every(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as { id?: unknown }).id === 'string' &&
      'value' in (entry as object)
  );

const isSortingState = (parsed: unknown): parsed is SortingState =>
  Array.isArray(parsed) &&
  parsed.length > 0 &&
  parsed.every(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as { id?: unknown }).id === 'string'
  );

// Fuzzy filter function
const fuzzyFilter = (
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  value: string,
  addMeta: (meta: { itemRank: { passed: boolean } }) => void
) => {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
};

// Draggable column header component
interface DraggableColumnHeaderProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  header: any;
  children: React.ReactNode;
  isPinned?: 'left' | 'right' | false;
  onTogglePin?: (columnId: string, side: 'left' | 'right') => void;
  onResize?: (columnId: string, width: number) => void;
  onAutoResize?: (columnId: string) => void;
  columnWidth?: number;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  enableColumnResizing?: boolean;
  enableColumnFilters?: boolean;
  onToggleFilters?: () => void;
  stickyPosition?: React.CSSProperties;
}

const DraggableColumnHeader: React.FC<DraggableColumnHeaderProps> = ({
  header,
  children,
  isPinned = false,
  onTogglePin,
  onResize,
  onAutoResize,
  columnWidth = 192, // Default 12rem in pixels
  minColumnWidth = 80,
  maxColumnWidth,
  enableColumnResizing = true,
  enableColumnFilters = true,
  onToggleFilters,
  stickyPosition = {},
}) => {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: header.column.id,
    disabled: isPinned !== false, // Disable dragging for pinned columns
  });

  // Track whether mobile controls are visible (toggled by tapping header)
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const thRef = useRef<HTMLTableCellElement>(null);

  const showControls = isHovered || controlsVisible;

  // Click-outside listener to dismiss controls on mobile
  useEffect(() => {
    if (!controlsVisible) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (thRef.current && !thRef.current.contains(e.target as Node)) {
        setControlsVisible(false);
      }
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [controlsVisible]);

  // Combined ref setter for both dnd-kit and our thRef
  const setCombinedRef = useCallback(
    (node: HTMLTableCellElement | null) => {
      setNodeRef(node);
      (thRef as React.MutableRefObject<HTMLTableCellElement | null>).current =
        node;
    },
    [setNodeRef]
  );

  const style = {
    opacity: isDragging ? 0.8 : 1,
    transform: CSS.Translate.toString(transform),
    transition,
    // Add sticky positioning for pinned columns
    position: isPinned ? ('sticky' as const) : ('relative' as const),
    ...stickyPosition,
    zIndex: isPinned ? 10 : 1,
    width: `${columnWidth}px`,
    minWidth: `${minColumnWidth}px`,
    maxWidth: `${maxColumnWidth ?? columnWidth}px`,
  };

  // Handle column header click for sorting
  const handleHeaderClick = (e: React.MouseEvent) => {
    // Prevent sorting when clicking on certain elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('[data-resize-handle]') ||
      target.closest('[data-drag-handle]')
    ) {
      return;
    }

    // Toggle controls visibility on tap (for touch devices)
    // On first tap: show controls and skip sorting
    // On second tap (controls already visible): sort normally
    if (!controlsVisible) {
      setControlsVisible(true);
      return; // Skip sorting on first tap — just reveal controls
    }

    if (header.column.getCanSort()) {
      const currentSort = header.column.getIsSorted();
      const isMultiSort = e.shiftKey; // Hold Shift for multi-column sorting

      if (currentSort === false) {
        header.column.toggleSorting(false, isMultiSort); // Sort ascending
      } else if (currentSort === 'asc') {
        header.column.toggleSorting(true, isMultiSort); // Sort descending
      } else {
        // On third click, clear this column's sort
        if (isMultiSort) {
          // Remove only this column from sorting, keep others
          const table = header.getContext().table;
          const currentSorting = table.getState().sorting || [];
          const newSorting = currentSorting.filter(
            (s: { id: string }) => s.id !== header.column.id
          );
          table.setSorting(newSorting);
        } else {
          // Without shift, clear all sorting
          header.column.clearSorting();
        }
      }
    }
  };

  // Get sort indicator (shows on hover or when sorted)
  const getSortIndicator = () => {
    const sortDirection = header.column.getIsSorted();
    const sortedIndex = header.column.getSortIndex();
    const hasMultipleSorts =
      (header.getContext().table.getState().sorting || []).length > 1;

    if (sortDirection === 'asc') {
      return (
        <div className="flex items-center gap-0.5">
          <ChevronUp className="h-3 w-3 text-primary opacity-100 transition-opacity" />
          {hasMultipleSorts && sortedIndex >= 0 && (
            <span className="text-xs font-semibold text-primary leading-none">
              {sortedIndex + 1}
            </span>
          )}
        </div>
      );
    } else if (sortDirection === 'desc') {
      return (
        <div className="flex items-center gap-0.5">
          <ChevronDown className="h-3 w-3 text-primary opacity-100 transition-opacity" />
          {hasMultipleSorts && sortedIndex >= 0 && (
            <span className="text-xs font-semibold text-primary leading-none">
              {sortedIndex + 1}
            </span>
          )}
        </div>
      );
    }
    // No sort applied: show transparent chevron on hover
    return (
      <ChevronUp
        className={clsx(
          'h-3 w-3 text-muted-foreground transition-opacity',
          showControls ? 'opacity-60' : 'opacity-0'
        )}
      />
    );
  };

  return (
    <th
      ref={setCombinedRef}
      style={style}
      className={clsx(
        'px-1 py-0.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left relative group border-r border-transparent',
        'bg-inner-container shadow-sm overflow-visible',
        'hover:border-r-border hover:border-l-border transition-colors',
        header.column.getCanSort() && 'cursor-pointer hover:bg-muted/30',
        isDragging && 'z-50',
        isPinned === 'left' && 'bg-background shadow-lg border-r border-border',
        isPinned === 'right' && 'bg-background shadow-lg border-l border-border'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...attributes}
      onClick={handleHeaderClick}
      title={
        header.column.getCanSort()
          ? 'Click to sort, Shift+Click for multi-column sort'
          : undefined
      }
    >
      <div className="relative flex items-center w-full h-6 px-2">
        {/* Left controls: always overlay, shown on hover/tap */}
        <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5">
          {/* Only show drag handle for unpinned columns, left side */}
          {!isPinned && (
            <Button
              variant="ghost"
              size="sm"
              {...listeners}
              data-drag-handle="true"
              onClick={(e) => e.stopPropagation()}
              className={clsx(
                'h-6 w-6 p-0 transition-opacity cursor-grab active:cursor-grabbing hover:bg-muted/50',
                showControls ? 'opacity-100' : 'opacity-0'
              )}
              title="Move column"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
          {/* Grouping button */}
          {header.column.getCanGroup() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                header.column.getToggleGroupingHandler()();
              }}
              className={clsx(
                'h-5 w-5 p-0 transition-opacity',
                showControls || header.column.getIsGrouped()
                  ? 'opacity-100'
                  : 'opacity-0',
                header.column.getIsGrouped() && 'text-gradient-start'
              )}
              title={header.column.getIsGrouped() ? 'Ungroup' : 'Group'}
            >
              {header.column.getIsGrouped() ? (
                <Minus className="h-3 w-3" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>

        {/* Title: centered, full width, truncated with ellipsis */}
        <div className="flex-1 min-w-0 text-center overflow-hidden whitespace-nowrap text-ellipsis">
          {children}
          {/* Sort indicator */}
          {header.column.getCanSort() && (
            <span className="inline-flex ml-0.5 align-middle absolute right-9 top-1/2 -translate-y-1/2 z-10">
              {getSortIndicator()}
            </span>
          )}
        </div>

        {/* Right controls: always overlay, shown on hover/tap */}
        <div
          className={clsx(
            'absolute right-1 top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5 transition-opacity',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-muted/50"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Sort options */}
              {header.column.getCanSort() && (
                <>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Hold Shift to sort multiple columns
                  </div>
                  <DropdownMenuCheckboxItem
                    checked={header.column.getIsSorted() === 'asc'}
                    onCheckedChange={() => {
                      header.column.toggleSorting(false);
                    }}
                    className="text-xs"
                  >
                    {header.column.getIsSorted() === 'asc' &&
                      header.column.getSortIndex() >= 0 && (
                        <span className="mr-1 font-semibold">
                          #{header.column.getSortIndex() + 1}
                        </span>
                      )}
                    Sort ASC
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={header.column.getIsSorted() === 'desc'}
                    onCheckedChange={() => {
                      header.column.toggleSorting(true);
                    }}
                    className="text-xs"
                  >
                    {header.column.getIsSorted() === 'desc' &&
                      header.column.getSortIndex() >= 0 && (
                        <span className="mr-1 font-semibold">
                          #{header.column.getSortIndex() + 1}
                        </span>
                      )}
                    Sort DESC
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      // Remove only this column from sorting, keep others
                      const table = header.getContext().table;
                      const currentSorting = table.getState().sorting || [];
                      const newSorting = currentSorting.filter(
                        (s: { id: string }) => s.id !== header.column.id
                      );
                      table.setSorting(newSorting);
                    }}
                    className="text-xs"
                    disabled={!header.column.getIsSorted()}
                  >
                    Clear Sort
                  </DropdownMenuItem>
                  {(header.getContext().table.getState().sorting || []).length >
                    1 && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        header.getContext().table.resetSorting();
                      }}
                      className="text-xs text-destructive"
                    >
                      Clear All Sorts
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Pin options */}
              {onTogglePin && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(header.column.id, 'left');
                    }}
                    className="text-xs"
                  >
                    {isPinned === 'left' ? (
                      <>
                        <PinOff className="h-3 w-3 mr-2" />
                        Unpin from left
                      </>
                    ) : (
                      <>
                        <Pin className="h-3 w-3 mr-2" />
                        Pin left
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin(header.column.id, 'right');
                    }}
                    className="text-xs"
                  >
                    {isPinned === 'right' ? (
                      <>
                        <PinOff className="h-3 w-3 mr-2" />
                        Unpin from right
                      </>
                    ) : (
                      <>
                        <Pin className="h-3 w-3 mr-2" />
                        Pin right
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Filter option */}
              {enableColumnFilters && onToggleFilters && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFilters();
                    }}
                    className="text-xs"
                  >
                    <Filter className="h-3 w-3 mr-2" />
                    Filter
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                </>
              )}

              {/* Hide column option */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  header.column.toggleVisibility(false);
                }}
                className="text-xs"
              >
                <EyeOff className="h-3 w-3 mr-2" />
                Hide column
              </DropdownMenuItem>

              {/* Group by column option */}
              {header.column.getCanGroup() && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    header.column.toggleGrouping();
                  }}
                  className="text-xs"
                >
                  <Grid2x2 className="h-3 w-3 mr-2" />
                  {header.column.getIsGrouped()
                    ? 'Ungroup column'
                    : 'Group by column'}
                </DropdownMenuItem>
              )}

              {/* Auto-resize column option */}
              {onAutoResize && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onAutoResize(header.column.id);
                  }}
                  className="text-xs"
                >
                  <ScanLine className="h-3 w-3 mr-2" />
                  Auto-resize column
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Column resize handle */}
      {enableColumnResizing && onResize && (
        <ColumnResizeHandle
          column={header.column}
          onResize={onResize}
          currentWidth={columnWidth}
        />
      )}
    </th>
  );
};

// Column resize handle component
interface ColumnResizeHandleProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: Column<any, unknown>;
  onResize: (columnId: string, width: number) => void;
  currentWidth: number;
}

const ColumnResizeHandle: React.FC<ColumnResizeHandleProps> = ({
  column,
  onResize,
  currentWidth,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      logger.debug('Starting resize for column:', { columnId: column.id });
      setIsResizing(true);
      setIsSelected(true);
      setStartX(e.clientX);
      setStartWidth(currentWidth);
    },
    [currentWidth, column.id]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      logger.debug('Starting touch resize for column:', {
        columnId: column.id,
      });
      const touch = e.touches[0];
      setIsResizing(true);
      setIsSelected(true);
      setStartX(touch.clientX);
      setStartWidth(currentWidth);
    },
    [currentWidth, column.id]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // On mobile, a single tap/click selects the resize handle
      if (window.innerWidth <= 768) {
        setIsSelected(!isSelected);
        logger.debug('Mobile resize handle selected:', {
          columnId: column.id,
          selected: !isSelected,
        });
      }
    },
    [isSelected, column.id]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const diff = e.clientX - startX;
      const newWidth = Math.max(80, startWidth + diff); // Minimum width of 80px
      onResize(column.id, newWidth);
    },
    [isResizing, startX, startWidth, column.id, onResize]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isResizing) return;

      const touch = e.touches[0];
      const diff = touch.clientX - startX;
      const newWidth = Math.max(80, startWidth + diff); // Minimum width of 80px
      onResize(column.id, newWidth);
    },
    [isResizing, startX, startWidth, column.id, onResize]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    // Keep selection active for a moment after mouse up
    setTimeout(() => {
      if (!isResizing) {
        setIsSelected(false);
      }
    }, 1000);
  }, [isResizing]);

  const handleTouchEnd = useCallback(() => {
    setIsResizing(false);
    // Keep selection active for a moment after touch end
    setTimeout(() => {
      if (!isResizing) {
        setIsSelected(false);
      }
    }, 1000);
  }, [isResizing]);

  React.useEffect(() => {
    if (!isResizing) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [
    isResizing,
    handleMouseMove,
    handleMouseUp,
    handleTouchMove,
    handleTouchEnd,
  ]);

  // Auto-deselect after 3 seconds if not interacting
  React.useEffect(() => {
    if (!isSelected || isResizing) return;

    const timer = setTimeout(() => {
      setIsSelected(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isSelected, isResizing]);

  return (
    <div
      data-resize-handle="true"
      className={clsx(
        'absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent transition-all duration-200',
        'group-hover:bg-muted-foreground/20',
        // Highlight when header controls are active (mobile tap)
        'group-data-controls-active:bg-muted-foreground/30',
        // Mobile-first: larger hit area and better visibility
        'md:w-2 w-4 md:hover:bg-gradient-start/70',
        // Selected state - use brand color
        isSelected && 'bg-(--primary) shadow-lg',
        // Resizing state
        isResizing && 'bg-(--primary) shadow-lg',
        // Enhanced visibility on mobile
        'md:bg-transparent bg-muted-foreground/10'
      )}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      style={{
        zIndex: 15, // Lower z-index than the menu but higher than regular content
      }}
      title="Tap to select, then drag to resize column"
    >
      {/* Larger hit area for mobile, more precise for desktop */}
      <div className="absolute right-0 top-0 h-full w-6 md:w-3 cursor-col-resize" />

      {/* Visual indicator for mobile selection */}
      {isSelected && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-(--primary) rounded-full shadow-md md:hidden" />
      )}
    </div>
  );
};

// Main DataTable component props
interface DataTableProps<TData, TValue> {
  tableId: string; // Unique identifier for persisting preferences
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  enableGlobalFilter?: boolean;
  enableColumnFilters?: boolean;
  enableSorting?: boolean;
  // External sorting state (for persistence)
  sorting?: SortingState;
  onSortingChange?: (
    updater: SortingState | ((prev: SortingState) => SortingState)
  ) => void;
  enableColumnReordering?: boolean;
  enableColumnVisibility?: boolean;
  enableColumnResizing?: boolean;
  enableGrouping?: boolean;
  showPagination?: boolean;
  className?: string;
  emptyMessage?: string;
  /**
   * Rich empty-state node rendered when there are no rows. Takes precedence
   * over `emptyMessage` — use this to pass an <EmptyState> with icon + CTA
   * instead of a plain string.
   */
  emptyContent?: React.ReactNode;
  defaultColumnVisibility?: Record<string, boolean>;
  defaultPinnedColumns?: { left: string[]; right: string[] };
  initialPageSize?: number; // Initial page size for new tables (defaults to 5)
  firstToolbarActions?: React.ReactNode; // Rendered first, before all other buttons
  /**
   * Narrower variant of firstToolbarActions used when the toolbar is tight.
   * When provided, the responsive row will swap to this version instead of
   * pushing the full action into the overflow menu. Omit if your full
   * version already fits any width you expect to see.
   */
  firstToolbarActionsCompact?: React.ReactNode;
  /** Overflow metadata for firstToolbarActions - enables showing in overflow menu */
  firstToolbarActionsOverflow?: ToolbarActionOverflowMeta;
  customToolbarActions?: React.ReactNode;
  /** Narrower variant of customToolbarActions; see firstToolbarActionsCompact. */
  customToolbarActionsCompact?: React.ReactNode;
  /** Overflow metadata for customToolbarActions - enables showing in overflow menu */
  customToolbarActionsOverflow?: ToolbarActionOverflowMeta;
  // Content to render between toolbar and data (cards/table)
  betweenToolbarAndContent?: React.ReactNode;
  // Card view props
  enableCardView?: boolean;
  defaultView?: 'table' | 'cards';
  /**
   * Component used to render each row in card view.
   *
   * IMPORTANT: This must be a STABLE reference — defined outside the render
   * function or wrapped with `useMemo(() => ..., [])`.
   * If the reference changes on every render, React will unmount and remount
   * every card (causing visible flicker and losing local state).
   *
   * For values that change over time, use refs inside the memoized component:
   *   const myValueRef = useRef(myValue);
   *   myValueRef.current = myValue;
   *   const MyCard = useMemo(
   *     () => ({ item }) => <Card value={myValueRef.current} />,
   *     [] // empty deps — refs keep values current
   *   );
   */
  cardComponent?: React.ComponentType<{ item: TData; index: number }>;
  cardViewBreakpoints?: {
    default: number;
    [key: number]: number;
  };
  cardViewGap?: number;
  // Export props
  enableExport?: boolean;
  exportFilename?: string;
  /**
   * Optional async provider of the COMPLETE dataset for exports. When set,
   * "Export as CSV/JSON" serialize the returned data (all server pages)
   * instead of only the client-loaded rows — tables that partially load
   * (e.g. a bot's closed deals, capped by the display auto-loader) would
   * otherwise silently export a subset. Falls back to the loaded rows when
   * the fetch fails or returns nothing.
   */
  getExportData?: () => Promise<TData[] | null>;
  /**
   * Server-side total row count when the table's data is a partial window of
   * a larger server dataset. Rendered in the pagination footer as
   * "start-end (loaded of total)" so a partially-loaded table doesn't read
   * as complete.
   */
  serverTotalRows?: number;
  // Row interaction props
  onRowClick?: (row: TData) => void;
  getRowIsSelected?: (row: TData) => boolean;
  // Final toolbar actions (rendered after ViewToggle, at the very end)
  finalToolbarActions?: React.ReactNode;
  /** Narrower variant of finalToolbarActions; see firstToolbarActionsCompact. */
  finalToolbarActionsCompact?: React.ReactNode;
  /** Overflow metadata for finalToolbarActions - enables showing in overflow menu */
  finalToolbarActionsOverflow?: ToolbarActionOverflowMeta;
  // Hot button filters for quick access to essential filters
  hotButtonFilters?: {
    title: string;
    filters: {
      columnId: string;
      label: string;
      options: { label: string; value: string }[];
    }[];
  };
  // View mode change callback
  onViewModeChange?: (viewMode: 'table' | 'cards') => void;
  // Column filters visibility change callback
  onColumnFiltersVisibilityChange?: (visible: boolean) => void;
  // Quick filters configuration
  quickFilters?: QuickFilterConfig[];
  quickFiltersState?: Record<string, string[]>;
  onQuickFiltersChange?: (category: string, value: string) => void;
  onQuickFiltersClearAll?: () => void;
  showQuickFilters?: boolean;
  onShowQuickFiltersChange?: (visible: boolean) => void;
  /**
   * CRITICAL FOR BULK ACTIONS: Bulk actions configuration and row ID getter
   *
   * bulkActions: Array of bulk actions to enable on selected rows
   * - When provided, automatically adds selection checkboxes to the table
   * - Creates a toolbar button showing selection count and action dropdown
   * - See BulkAction interface documentation above for full details
   *
   * getRowId: Function to extract unique ID from each row (CRITICAL for bulk actions)
   * - REQUIRED for bulk actions to work reliably
   * - Must return a STABLE, UNIQUE string ID for each row
   * - Used as keys in selection state: { "row-id": true, "another-id": true }
   * - Without this, row selection breaks when data is sorted/filtered/paginated
   *
   * RECOMMENDED IMPLEMENTATION:
   * ```tsx
   * getRowId={(row) => row.id}  // If your data has an 'id' property
   * getRowId={(row) => row.uuid}  // Or use any unique identifier
   * getRowId={(row) => `${row.type}-${row.id}`}  // Can combine multiple fields
   * ```
   *
   * DEFAULT BEHAVIOR (NOT RECOMMENDED):
   * - Falls back to row index if getRowId not provided
   * - Index-based IDs break when data is reordered by sorting/filtering
   * - Example: Row at index 0 gets ID "0", but after sorting it might be a different row
   *
   * WHY THIS IS CRITICAL:
   * - React Table uses row IDs to track which rows are selected
   * - When you sort/filter, rows move to different indexes
   * - If using index as ID, selection appears to "jump" to wrong rows
   * - With stable IDs, selection follows the actual data item
   *
   * COMMON MISTAKES:
   * - Using row index: getRowId={(row, index) => String(index)} → BREAKS
   * - Using non-unique IDs: getRowId={(row) => row.type} → BREAKS
   * - Using unstable IDs: getRowId={(row) => Math.random()} → BREAKS
   * - Not converting to string: getRowId={(row) => row.id} where id is number → Works but better to String(row.id)
   *
   * TESTING YOUR getRowId:
   * 1. Select some rows
   * 2. Sort the table by different columns
   * 3. Verify the same data items remain selected (not just same positions)
   * 4. Filter the table
   * 5. Verify selection persists for visible rows that were selected
   */
  // Bulk actions configuration - when provided, enables row selection with checkboxes
  bulkActions?: BulkAction<TData>[];
  /** Unique key getter for row identification in bulk selection (defaults to row index) */
  getRowId?: (row: TData) => string;
  /** Enable syncing filters and sorting with URL query params (default: true) */
  enableUrlSync?: boolean;
  /** Enable quick filter bar with chips for active filters (default: false) */
  enableQuickFilterBar?: boolean;
  /** Storage key for saving quick filters (default: 'quick-filters') */
  quickFilterBarStorageKey?: string;
}

/**
 * Enhanced DataTable with field type-based filtering and column grouping
 *
 * To use type-based filters, add meta.filterType to your column definitions:
 *
 * @example
 * const columns = [
 *   {
 *     accessorKey: "name",
 *     header: "Name",
 *     meta: { filterType: "string" } // Available: string, number, date, boolean
 *   },
 *   {
 *     accessorKey: "age",
 *     header: "Age",
 *     meta: { filterType: "number" }
 *   },
 *   {
 *     accessorKey: "isActive",
 *     header: "Active",
 *     meta: { filterType: "boolean" }
 *   },
 *   {
 *     accessorKey: "createdAt",
 *     header: "Created",
 *     meta: { filterType: "date" }
 *   }
 * ];
 *
 * To enable grouping, set enableGrouping=true and optionally define aggregation functions:
 *
 * @example
 * const columns = [
 *   {
 *     accessorKey: "category",
 *     header: "Category",
 *     // This column can be grouped
 *   },
 *   {
 *     accessorKey: "sales",
 *     header: "Sales",
 *     aggregationFn: "sum", // Will sum values when grouped
 *     aggregatedCell: ({ getValue }) => getValue().toLocaleString(),
 *   }
 * ];
 *
 * To enable card view, set enableCardView=true and optionally provide defaultView:
 *
 * @example
 * <DataTable
 *   enableCardView={true}
 *   defaultView="cards" // Start in card view instead of table view
 *   cardComponent={CustomCardComponent}
 *   cardViewBreakpoints={{ default: 1, 768: 2, 1024: 3 }}
 * />
 */

/**
 * Toolbar button priorities for ResponsiveButtonRow.
 * Higher number = higher priority (compacts last).
 * Lower number = lower priority (compacts first).
 */
const TOOLBAR_PRIORITIES = {
  /** Export - lowest priority, compacts first */
  EXPORT: 1,
  /** Auto-resize columns */
  AUTO_RESIZE: 2,
  /** Filter toggle */
  FILTER: 3,
  /** Column visibility (also marked neverOverflow) */
  COLUMN_VISIBILITY: 4,
  /** View toggle (table/cards) - highest among toolbar buttons; overflows last (before column visibility which never overflows) */
  VIEW_TOGGLE: 5,
  /** Bulk actions - very high priority when rows are selected */
  BULK_ACTIONS: 85,
  /** First toolbar actions - high priority */
  FIRST_ACTIONS: 90,
  /** Custom toolbar actions - highest priority */
  CUSTOM_ACTIONS: 100,
  /** Final toolbar actions - very highest priority */
  FINAL_ACTIONS: 110,
} as const;

// Internal toolbar button row component using ResponsiveButtonRow
interface ToolbarButtonRowProps<TData> {
  enableColumnFilters: boolean;
  enableColumnResizing: boolean;
  enableColumnVisibility: boolean;
  enableExport: boolean;
  enableCardView: boolean;
  enableQuickFilterBar: boolean;
  viewMode: 'table' | 'cards';
  setViewMode: (mode: 'table' | 'cards') => void;
  showColumnFilters: boolean;
  setShowColumnFilters: (show: boolean) => void;
  showQuickFilters: boolean;
  onShowQuickFiltersChange?: (visible: boolean) => void;
  columnFilters: ColumnFiltersState;
  setColumnFilters: (filters: ColumnFiltersState) => void;
  quickFilters?: QuickFilterConfig[];
  autoResizeColumns: (reset?: boolean) => void;
  handleExportToCsv: () => void;
  handleExportToJson: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  firstToolbarActions?: React.ReactNode;
  firstToolbarActionsCompact?: React.ReactNode;
  firstToolbarActionsOverflow?: ToolbarActionOverflowMeta;
  customToolbarActions?: React.ReactNode;
  customToolbarActionsCompact?: React.ReactNode;
  customToolbarActionsOverflow?: ToolbarActionOverflowMeta;
  finalToolbarActions?: React.ReactNode;
  finalToolbarActionsCompact?: React.ReactNode;
  finalToolbarActionsOverflow?: ToolbarActionOverflowMeta;
  // Bulk actions props
  bulkActions?: BulkAction<TData>[];
  selectedRows?: TData[];
  onClearSelection?: () => void;
  // Reset table handler
  onResetTable?: () => void;
  // Layout metrics callback: forwarded to ResponsiveButtonRow so the parent
  // toolbar can size the search input based on actual button widths.
  onLayoutMetrics?: (metrics: { requiredFullWidth: number }) => void;
}

function ToolbarButtonRow<TData>({
  enableColumnFilters,
  enableColumnResizing,
  enableColumnVisibility,
  enableExport,
  enableCardView,
  enableQuickFilterBar,
  viewMode,
  setViewMode,
  showColumnFilters,
  setShowColumnFilters,
  showQuickFilters,
  onShowQuickFiltersChange,
  columnFilters,
  setColumnFilters,
  quickFilters,
  autoResizeColumns,
  handleExportToCsv,
  handleExportToJson,
  table,
  firstToolbarActions,
  firstToolbarActionsCompact,
  firstToolbarActionsOverflow,
  customToolbarActions,
  customToolbarActionsCompact,
  customToolbarActionsOverflow,
  finalToolbarActions,
  finalToolbarActionsCompact,
  finalToolbarActionsOverflow,
  bulkActions,
  selectedRows,
  onClearSelection,
  onResetTable,
  onLayoutMetrics,
}: ToolbarButtonRowProps<TData>) {
  // Defensive: don't let `table` identity drive the buttonConfigs memo. The
  // selectedRows memo below documents that react-table can hand back a fresh
  // `table` object across renders (it caused a React #185 loop there); listing
  // `table` as a buttonConfigs dep would rebuild the whole button array whenever
  // that happens, feeding ResponsiveButtonRow (memoised) a new `buttons`
  // reference and re-rendering the toolbar on parent churn. Same fix as
  // selectedRows: read `table` via a ref, and depend only on a stable signature
  // of what the column dropdown actually renders (column id / visibility /
  // hideability), so the array recomputes only when the columns or their
  // visibility genuinely change.
  const tableRef = useRef(table);
  tableRef.current = table;
  const columnMenuSignature =
    enableColumnVisibility && viewMode === 'table'
      ? table
          .getAllColumns()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((c: any) =>
            `${c.id}:${c.getIsVisible() ? 1 : 0}:${c.getCanHide() ? 1 : 0}`
          )
          .join('|')
      : '';

  // Build button configs for ResponsiveButtonRow
  const buttonConfigs = useMemo((): ResponsiveButtonConfig[] => {
    const configs: ResponsiveButtonConfig[] = [];

    // Filter toggle button.
    // The QuickFilterBar renders outside the table body, so it works the same in
    // card view as in table view — the toggle has to be reachable in both. The
    // per-column filter row and the `quickFilters` chips are view-specific, so
    // those two only offer the button in the view that can render them.
    const showFilter =
      enableQuickFilterBar ||
      (enableColumnFilters && viewMode === 'table') ||
      (!!quickFilters && viewMode === 'cards');
    if (showFilter) {
      const activeFilterCount = countActiveFilters(columnFilters);
      const isFilterActive =
        (quickFilters ? showQuickFilters : showColumnFilters) ||
        activeFilterCount > 0;
      const filterTitle = enableQuickFilterBar
        ? showColumnFilters
          ? 'Hide filters'
          : 'Show filters'
        : quickFilters
          ? showQuickFilters
            ? 'Hide quick filters'
            : 'Show quick filters'
          : activeFilterCount > 0
            ? `Clear ${activeFilterCount} filters`
            : 'Toggle filters';

      const handleFilterClick = () => {
        if (enableQuickFilterBar) {
          setShowColumnFilters(!showColumnFilters);
        } else if (quickFilters && onShowQuickFiltersChange) {
          const newState = !showQuickFilters;
          onShowQuickFiltersChange(newState);
          setShowColumnFilters(newState);
        } else if (activeFilterCount > 0) {
          setColumnFilters([]);
          setShowColumnFilters(false);
        } else {
          setShowColumnFilters(!showColumnFilters);
        }
      };

      const filterLabel =
        activeFilterCount > 0 && !quickFilters && !enableQuickFilterBar
          ? `Clear (${activeFilterCount})`
          : 'Filters';
      const FilterIcon =
        activeFilterCount > 0 && !quickFilters && !enableQuickFilterBar
          ? X
          : Filter;
      configs.push({
        id: 'filter',
        priority: TOOLBAR_PRIORITIES.FILTER,
        fullContent: (
          <Button
            variant={isFilterActive ? 'default' : 'ghost'}
            size="sm"
            onClick={handleFilterClick}
            className="h-9 gap-2 px-3 relative"
            title={filterTitle}
          >
            <FilterIcon className="h-4 w-4" />
            <span>{filterLabel}</span>
            {enableQuickFilterBar && activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 rounded-full px-1.5 text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        ),
        compactContent: (
          <Button
            variant={isFilterActive ? 'default' : 'ghost'}
            size="icon"
            onClick={handleFilterClick}
            className="h-9 w-9 relative"
            title={filterTitle}
          >
            <FilterIcon className="h-4 w-4" />
            {enableQuickFilterBar && activeFilterCount > 0 && (
              <Badge
                variant="default"
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        ),
        menuLabel: filterTitle,
        menuIcon: activeFilterCount > 0 && !quickFilters ? X : Filter,
        onMenuClick: handleFilterClick,
      });
    }

    // Auto-resize columns button
    if (enableColumnResizing && viewMode === 'table') {
      configs.push({
        id: 'auto-resize',
        priority: TOOLBAR_PRIORITIES.AUTO_RESIZE,
        fullContent: (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => autoResizeColumns(true)}
            className="h-9 gap-2 px-3"
            title="Auto-resize all columns"
          >
            <ScanLine className="h-4 w-4" />
            <span>Resize</span>
          </Button>
        ),
        compactContent: (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => autoResizeColumns(true)}
            className="h-9 w-9"
            title="Auto-resize all columns"
          >
            <ScanLine className="h-4 w-4" />
          </Button>
        ),
        menuLabel: 'Auto-resize columns',
        menuIcon: ScanLine,
        onMenuClick: () => autoResizeColumns(true),
      });
    }

    // Column visibility toggle
    if (enableColumnVisibility && viewMode === 'table') {
      configs.push({
        id: 'column-visibility',
        priority: TOOLBAR_PRIORITIES.COLUMN_VISIBILITY,
        neverOverflow: true, // This is a dropdown, keep it visible
        fullContent: (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2 px-3"
                title="Toggle column visibility"
              >
                <Menu className="h-4 w-4" />
                <span>Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[150px] max-h-[400px] overflow-y-auto"
            >
              {tableRef.current
                .getAllColumns()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((column: any) => column.getCanHide())
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((column: any) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => {
                      column.toggleVisibility(!!value);
                    }}
                    onSelect={(e) => {
                      e.preventDefault();
                    }}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onResetTable}
                className="text-xs text-destructive"
              >
                <RotateCcw className="h-3 w-3 mr-2" />
                Reset Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        compactContent: (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                title="Toggle column visibility"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[150px] max-h-[400px] overflow-y-auto"
            >
              {tableRef.current
                .getAllColumns()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((column: any) => column.getCanHide())
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((column: any) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => {
                      column.toggleVisibility(!!value);
                    }}
                    onSelect={(e) => {
                      e.preventDefault();
                    }}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onResetTable}
                className="text-xs text-destructive"
              >
                <RotateCcw className="h-3 w-3 mr-2" />
                Reset Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }

    // View toggle button
    if (enableCardView) {
      configs.push({
        id: 'view-toggle',
        priority: TOOLBAR_PRIORITIES.VIEW_TOGGLE,
        fullContent: (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setViewMode(viewMode === 'table' ? 'cards' : 'table')
            }
            className="h-9 gap-2 px-3"
            title={
              viewMode === 'table'
                ? 'Switch to card view'
                : 'Switch to table view'
            }
          >
            {viewMode === 'table' ? (
              <>
                <Grid2x2 className="h-4 w-4" />
                <span>Cards</span>
              </>
            ) : (
              <>
                <Rows3 className="h-4 w-4" />
                <span>Table</span>
              </>
            )}
          </Button>
        ),
        compactContent: (
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setViewMode(viewMode === 'table' ? 'cards' : 'table')
            }
            className="h-9 w-9"
            title={
              viewMode === 'table'
                ? 'Switch to card view'
                : 'Switch to table view'
            }
          >
            {viewMode === 'table' ? (
              <Grid2x2 className="h-4 w-4" />
            ) : (
              <Rows3 className="h-4 w-4" />
            )}
          </Button>
        ),
        menuLabel: viewMode === 'table' ? 'Card view' : 'Table view',
        menuIcon: viewMode === 'table' ? Grid2x2 : Rows3,
        onMenuClick: () =>
          setViewMode(viewMode === 'table' ? 'cards' : 'table'),
      });
    }

    /**
     * CRITICAL: Bulk actions button configuration
     *
     * This button ONLY appears when rows are selected. It provides a dropdown
     * menu with all configured bulk actions plus a "Clear selection" option.
     *
     * RENDERING CONDITIONS (ALL must be true):
     * 1. bulkActions prop is defined and non-empty
     * 2. selectedRows array exists
     * 3. selectedRows.length > 0
     *
     * If button doesn't appear when rows are selected, check:
     * - Is selectedRows being passed to ToolbarButtonRow? (should be from parent)
     * - Is selectedRows.length > 0? (check with React DevTools)
     * - Are the conditions above all true?
     *
     * BUTTON FEATURES:
     * - Shows count badge with number of selected rows
     * - Has highest priority (85) to stay visible even on mobile
     * - neverOverflow: true ensures it's never hidden in overflow menu
     * - Dropdown contains all bulk actions from bulkActions prop
     * - Each action receives selectedRows array when clicked
     * - Clear selection option at bottom clears all checkboxes
     *
     * ACTION EXECUTION FLOW:
     * 1. User clicks action in dropdown
     * 2. action.onAction(selectedRows) is called with currently selected rows
     * 3. onClearSelection() is called to deselect all rows (optional but recommended)
     * 4. Action callback handles the actual operation (delete, export, etc.)
     *
     * COMMON ISSUES:
     * - Button appears but shows 0 count → selectedRows not updating (check memo)
     * - Button doesn't appear → one of the conditions above is false
     * - Actions don't execute → check onAction callback in bulkActions definition
     * - Selection doesn't clear → onClearSelection not working (check setRowSelection)
     *
     * STYLING:
     * - Uses 'default' variant (primary color) to stand out
     * - Badge shows selection count in secondary variant
     * - Destructive actions styled in red (text-destructive)
     * - Disabled actions are grayed out and non-interactive
     *
     * MAINTENANCE NOTES:
     * - This is conditionally rendered - ensure conditions match expected behavior
     * - selectedRows dependency is CRITICAL - must update when selection changes
     * - onClearSelection should call setRowSelection({}) to clear all selections
     * - Keep neverOverflow: true to ensure bulk actions are always accessible
     */
    if (
      bulkActions &&
      bulkActions.length > 0 &&
      selectedRows &&
      selectedRows.length > 0
    ) {
      const bulkActionsContent = (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="default"
              size="sm"
              className="h-9 gap-2"
              title={`Actions for ${selectedRows.length} selected rows`}
            >
              <SquareCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Actions</span>
              <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                {selectedRows.length}
              </Badge>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {bulkActions
              .filter(
                (action) =>
                  !action.shouldShow || action.shouldShow(selectedRows)
              )
              .map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  onClick={() => {
                    // Execute the action with selected rows
                    action.onAction(selectedRows);
                    // Clear selection after action (recommended but optional)
                    onClearSelection?.();
                  }}
                  disabled={action.disabled}
                  className={clsx(
                    'text-sm',
                    action.destructive &&
                      'text-destructive focus:text-destructive'
                  )}
                >
                  {action.icon && <action.icon className="h-4 w-4 mr-2" />}
                  {action.label}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onClearSelection}
              className="text-sm text-muted-foreground"
            >
              <X className="h-4 w-4 mr-2" />
              Clear selection
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      configs.push({
        id: 'bulk-actions',
        priority: TOOLBAR_PRIORITIES.BULK_ACTIONS,
        neverOverflow: true, // Keep bulk actions always visible
        fullContent: bulkActionsContent,
        compactContent: bulkActionsContent,
      });
    }

    // First toolbar actions - wrapped as a button config with high priority
    // Can be hidden when space is constrained (canHide: true)
    // If overflow metadata provided, can appear in overflow menu
    if (firstToolbarActions) {
      // If caller supplied a compact form, they want this action visible at
      // all widths (the compact form is its narrow representation). Mark it
      // neverOverflow so the responsive row swaps in the compact content
      // instead of moving the whole thing to the menu.
      const hasCompact = firstToolbarActionsCompact != null;
      configs.push({
        id: 'first-actions',
        priority: TOOLBAR_PRIORITIES.FIRST_ACTIONS,
        fullContent: firstToolbarActions,
        compactContent: firstToolbarActionsCompact ?? firstToolbarActions,
        canHide: !hasCompact,
        neverOverflow: hasCompact,
        ...(firstToolbarActionsOverflow && {
          menuLabel: firstToolbarActionsOverflow.menuLabel,
          menuIcon: firstToolbarActionsOverflow.menuIcon,
          onMenuClick: firstToolbarActionsOverflow.onMenuClick,
          disabled: firstToolbarActionsOverflow.disabled,
        }),
      });
    }

    // Custom toolbar actions - wrapped as a button config with highest priority
    // Can be hidden when space is constrained (canHide: true)
    // If overflow metadata provided, can appear in overflow menu
    if (customToolbarActions) {
      const hasCompact = customToolbarActionsCompact != null;
      configs.push({
        id: 'custom-actions',
        priority: TOOLBAR_PRIORITIES.CUSTOM_ACTIONS,
        fullContent: customToolbarActions,
        compactContent: customToolbarActionsCompact ?? customToolbarActions,
        canHide: !hasCompact,
        neverOverflow: hasCompact,
        ...(customToolbarActionsOverflow && {
          menuLabel: customToolbarActionsOverflow.menuLabel,
          menuIcon: customToolbarActionsOverflow.menuIcon,
          onMenuClick: customToolbarActionsOverflow.onMenuClick,
          disabled: customToolbarActionsOverflow.disabled,
        }),
      });
    }

    // Final toolbar actions - wrapped as a button config with very highest priority
    // Can be hidden when space is constrained (canHide: true)
    // If overflow metadata provided, can appear in overflow menu
    if (finalToolbarActions) {
      const hasCompact = finalToolbarActionsCompact != null;
      configs.push({
        id: 'final-actions',
        priority: TOOLBAR_PRIORITIES.FINAL_ACTIONS,
        fullContent: finalToolbarActions,
        compactContent: finalToolbarActionsCompact ?? finalToolbarActions,
        canHide: !hasCompact,
        neverOverflow: hasCompact,
        ...(finalToolbarActionsOverflow && {
          menuLabel: finalToolbarActionsOverflow.menuLabel,
          menuIcon: finalToolbarActionsOverflow.menuIcon,
          onMenuClick: finalToolbarActionsOverflow.onMenuClick,
          disabled: finalToolbarActionsOverflow.disabled,
        }),
      });
    }

    return configs;
    // `columnMenuSignature` stands in for the fresh-every-render `table` object:
    // it is not read in the body (the dropdown reads `tableRef.current`) but is
    // listed so the memo recomputes exactly when the column set / visibility
    // changes. exhaustive-deps would otherwise flag it as an unnecessary dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enableColumnFilters,
    enableColumnResizing,
    enableColumnVisibility,
    enableCardView,
    viewMode,
    showColumnFilters,
    showQuickFilters,
    columnFilters,
    quickFilters,
    autoResizeColumns,
    setShowColumnFilters,
    setColumnFilters,
    onShowQuickFiltersChange,
    setViewMode,
    columnMenuSignature,
    firstToolbarActions,
    firstToolbarActionsCompact,
    firstToolbarActionsOverflow,
    customToolbarActions,
    customToolbarActionsCompact,
    customToolbarActionsOverflow,
    finalToolbarActions,
    finalToolbarActionsCompact,
    finalToolbarActionsOverflow,
    bulkActions,
    selectedRows,
    onClearSelection,
    onResetTable,
    enableQuickFilterBar,
  ]);

  // Build export menu items for overflow
  const overflowMenuItems = useMemo((): OverflowMenuItem[] => {
    if (!enableExport) return [];

    return [
      {
        type: 'item',
        label: 'Export as CSV',
        onSelect: handleExportToCsv,
        icon: Download,
        id: 'export-csv',
      },
      {
        type: 'item',
        label: 'Export as JSON',
        onSelect: handleExportToJson,
        icon: Download,
        id: 'export-json',
      },
    ];
  }, [enableExport, handleExportToCsv, handleExportToJson]);

  return (
    <div className="flex items-center gap-1 justify-end sm:justify-start flex-1 min-w-0">
      <ResponsiveButtonRow
        buttons={buttonConfigs}
        gap={4}
        buffer={0}
        alignment="right"
        enableOverflowMenu={enableExport || buttonConfigs.length > 0}
        overflowMenuItems={overflowMenuItems}
        overflowMenuAriaLabel="More table options"
        onLayoutMetrics={onLayoutMetrics}
        className="flex-1 min-w-0"
      />
    </div>
  );
}

const mouseConfig = {
  activationConstraint: {
    distance: 8,
  },
};

const touchConfig = {
  activationConstraint: {
    delay: 200,
    tolerance: 5,
  },
};

const DEFAULT_COLUMN_WIDTH = 192;
const DEFAULT_MIN_COLUMN_WIDTH = 80;
const COMPACT_ACTIONS_COLUMN_WIDTH = 56;

const RowCard = <TData,>({
  row,
  index,
  CardComponent,
}: {
  row: Row<TData>;
  index: number;
  CardComponent?:
    | React.ComponentType<{
        item: TData;
        index: number;
      }>
    | undefined;
}) => {
  // FLICKER DEBUG: detect actual remounts — each mount/unmount pair = a full card remount
  useEffect(() => {
    logger.debug('[flicker] RowCard MOUNTED', { rowId: row.id, index });
    return () => {
      logger.debug('[flicker] RowCard UNMOUNTED', { rowId: row.id, index });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FLICKER DEBUG: detect when CardComponent reference changes (causes implicit remount)
  const prevCardComponentRef = useRef(CardComponent);
  if (prevCardComponentRef.current !== CardComponent) {
    logger.warn('[flicker] CardComponent reference CHANGED — cards will remount!', {
      rowId: row.id,
      prev: prevCardComponentRef.current?.name,
      next: CardComponent?.name,
    });
    prevCardComponentRef.current = CardComponent;
  }

  if (CardComponent) {
    return <CardComponent key={row.id} item={row.original} index={index} />;
  }
  // Fallback card if no CardComponent provided
  return (
    <Card
      key={row.id}
      position={1}
      className="border border-border rounded-lg gap-2 py-2"
    >
      <div className="space-y-2">
        {row
          .getVisibleCells()
          .slice(0, 5)
          .map((cell) => (
            <div key={cell.id} className="text-sm">
              <span className="font-medium text-muted-foreground">
                {typeof cell.column.columnDef.header === 'string'
                  ? cell.column.columnDef.header
                  : cell.column.id}
                :
              </span>{' '}
              <span>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </span>
            </div>
          ))}
      </div>
    </Card>
  );
};

function DataTableComponent<TData, TValue>(
  props: DataTableProps<TData, TValue>
) {
  // Render-loop tripwire (additive, non-fatal). This component is the innermost
  // app frame of the React #185 crashes reported as Claus #161 / #258 / #457 /
  // #528 — always on a different page, which is why fixing one call site never
  // ended the class. Qualifying the label by `tableId` means the report names
  // the offending table, not just "a DataTable somewhere".
  // Kill via localStorage['gainium:tripwire']='off'.
  useRenderLoopTripwire(
    `DataTable:${props.tableId ?? 'unknown'}`,
    props as unknown as Record<string, unknown>
  );

  const isMobile = useMediaQuery('(max-width: 767px)');
  const {
    tableId,
    columns: initialColumns,
    data,
    enableGlobalFilter,
    enableColumnFilters,
    enableSorting,
    sorting: externalSorting,
    onSortingChange: externalOnSortingChange,
    //enableColumnReordering = true,
    enableColumnVisibility,
    enableColumnResizing,
    enableGrouping,
    emptyContent,
    showPagination,
    className,
    emptyMessage,
    defaultColumnVisibility,
    defaultPinnedColumns,
    initialPageSize,
    firstToolbarActions,
    firstToolbarActionsCompact,
    firstToolbarActionsOverflow,
    customToolbarActions,
    customToolbarActionsCompact,
    customToolbarActionsOverflow,
    betweenToolbarAndContent,
    // Column filters visibility change callback
    onColumnFiltersVisibilityChange,
    // Card view props
    enableCardView,
    defaultView,
    cardComponent: CardComponent,
    cardViewBreakpoints,
    cardViewGap,
    // Export props
    enableExport,
    exportFilename,
    getExportData,
    serverTotalRows,
    // Row interaction props
    onRowClick,
    getRowIsSelected,
    // Final toolbar actions
    finalToolbarActions,
    finalToolbarActionsCompact,
    finalToolbarActionsOverflow,
    // Hot button filters
    hotButtonFilters,
    // View mode change callback
    onViewModeChange,
    // Quick filters
    quickFilters,
    quickFiltersState,
    onQuickFiltersChange,
    onQuickFiltersClearAll,
    showQuickFilters,
    onShowQuickFiltersChange,
    // Bulk actions
    bulkActions,
    getRowId,
    enableUrlSync,
    enableQuickFilterBar,
    quickFilterBarStorageKey,
  } = useMemo(
    () => ({
      tableId: props.tableId,
      columns: props.columns,
      data: props.data,
      enableGlobalFilter: props.enableGlobalFilter ?? true,
      enableColumnFilters: props.enableColumnFilters ?? true,
      enableSorting: props.enableSorting ?? true,
      sorting: props.sorting,
      onSortingChange: props.onSortingChange,
      enableColumnVisibility: props.enableColumnVisibility ?? true,
      enableColumnResizing: props.enableColumnResizing ?? true,
      enableGrouping: props.enableGrouping ?? false,
      showPagination: props.showPagination ?? true,
      className: props.className,
      emptyMessage: props.emptyMessage ?? 'No results.',
      emptyContent: props.emptyContent,
      defaultColumnVisibility: props.defaultColumnVisibility ?? {},
      defaultPinnedColumns: props.defaultPinnedColumns ?? {
        left: [],
        right: [],
      },
      initialPageSize: props.initialPageSize ?? 10,
      firstToolbarActions: props.firstToolbarActions,
      firstToolbarActionsCompact: props.firstToolbarActionsCompact,
      firstToolbarActionsOverflow: props.firstToolbarActionsOverflow,
      customToolbarActions: props.customToolbarActions,
      customToolbarActionsCompact: props.customToolbarActionsCompact,
      customToolbarActionsOverflow: props.customToolbarActionsOverflow,
      betweenToolbarAndContent: props.betweenToolbarAndContent,
      onColumnFiltersVisibilityChange: props.onColumnFiltersVisibilityChange,
      enableCardView: props.enableCardView ?? false,
      defaultView: props.defaultView ?? 'table',
      cardComponent: props.cardComponent,
      cardViewBreakpoints: props.cardViewBreakpoints ?? {
        default: 1,
        600: 2,
        900: 3,
        1200: 4,
      },
      cardViewGap: props.cardViewGap ?? 16,
      enableExport: props.enableExport ?? true,
      exportFilename: props.exportFilename ?? 'data-export',
      getExportData: props.getExportData,
      serverTotalRows: props.serverTotalRows,
      onRowClick: props.onRowClick,
      getRowIsSelected: props.getRowIsSelected,
      finalToolbarActions: props.finalToolbarActions,
      finalToolbarActionsCompact: props.finalToolbarActionsCompact,
      finalToolbarActionsOverflow: props.finalToolbarActionsOverflow,
      hotButtonFilters: props.hotButtonFilters,
      onViewModeChange: props.onViewModeChange,
      quickFilters: props.quickFilters,
      quickFiltersState: props.quickFiltersState ?? {},
      onQuickFiltersChange: props.onQuickFiltersChange,
      onQuickFiltersClearAll: props.onQuickFiltersClearAll,
      showQuickFilters: props.showQuickFilters ?? false,
      onShowQuickFiltersChange: props.onShowQuickFiltersChange,
      bulkActions: props.bulkActions,
      getRowId: props.getRowId,
      enableUrlSync: props.enableUrlSync ?? true,
      enableQuickFilterBar: props.enableQuickFilterBar ?? false,
      quickFilterBarStorageKey:
        props.quickFilterBarStorageKey ?? 'quick-filters',
    }),
    [props]
  );
  // Get default column order and visibility.
  // Mirror react-table's own column-ID resolution (table-core `createColumn`):
  //   id ?? (accessorKey with dots replaced by underscores) ?? header-string
  // Two things matter here:
  //   1. Prefer `id` over `accessorKey`. When a column defines both (e.g.
  //      id: 'currentBalances', accessorKey: 'currentBalance'), react-table
  //      registers it under `id`.
  //   2. A *nested* accessorKey like `settings.startCondition` is registered
  //      by react-table under `settings_startCondition` (dots → underscores).
  // If we emit a raw dotted key (or the wrong field) here, our columnOrder
  // references an ID react-table doesn't know, and it auto-appends the
  // "missing" column at the tail — past anything we tried to pin right (this
  // is what pushed nested-accessor columns to the right of the Actions column).
  const defaultColumnOrder = useMemo(
    () =>
      initialColumns.map((col: ColumnDef<TData, TValue>) => {
        const columnWithId = col as ColumnDef<TData, TValue> & {
          accessorKey?: string;
          id?: string;
        };
        if (columnWithId.id) return columnWithId.id;
        if (typeof columnWithId.accessorKey === 'string') {
          return columnWithId.accessorKey.replace(/\./g, '_');
        }
        return '';
      }),
    [initialColumns]
  );

  // Use the provided defaultColumnVisibility prop

  // The props-normalization memo above lists `[props]` as its only dependency,
  // and `props` is a fresh object every render — so `defaultColumnVisibility`
  // and `defaultPinnedColumns` are rebuilt as new `{}` / `{ left, right }`
  // literals on every render. Passed straight into useTablePreferences, those
  // fresh objects made its entire `result` (every persisted value AND setter)
  // recompute each render, which churned the toolbar's button-config array and
  // re-rendered the memoised ResponsiveButtonRow ~26x/s under live bot-stats
  // updates (RenderLoopTripwire on /trading — worst on mobile, where the
  // `isMobile` branch below also allocates a fresh object). Pin both args to
  // their content so the preferences result stays referentially stable across
  // parent churn.
  const defaultColumnVisibilityKey = JSON.stringify(
    defaultColumnVisibility ?? {}
  );
  const stableDefaultColumnVisibility = useMemo(
    () => defaultColumnVisibility ?? {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultColumnVisibilityKey]
  );
  const pinnedColumnsArg = useMemo(
    () =>
      isMobile
        ? { left: [], right: [] }
        : (defaultPinnedColumns ?? { left: [], right: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMobile, JSON.stringify(defaultPinnedColumns ?? { left: [], right: [] })]
  );

  // Get persisted preferences from Zustand store
  const {
    columnOrder,
    columnVisibility,
    columnWidths,
    pinnedColumns,
    pagination,
    viewMode: persistedViewMode,
    sorting: persistedSorting,
    columnFilters: persistedColumnFilters,
    globalFilter: persistedGlobalFilter,
    setColumnOrder,
    setColumnVisibility,
    setColumnWidths,
    setPinnedColumns,
    setPagination,
    setViewMode: setPersistedViewMode,
    setSorting: setPersistedSorting,
    setColumnFilters: setPersistedColumnFilters,
    setGlobalFilter: setPersistedGlobalFilter,
    resetPreferences,
  } = useTablePreferences(
    tableId,
    defaultColumnOrder,
    stableDefaultColumnVisibility,
    initialPageSize,
    defaultView,
    pinnedColumnsArg
  );

  // On mobile, never pin any columns regardless of persisted preferences
  const effectivePinnedColumns = useMemo(
    () => (isMobile ? { left: [], right: [] } : pinnedColumns),
    [isMobile, pinnedColumns]
  );

  // Sorting state - use external, persisted, or internal state
  const sorting = useMemo(
    () => (externalSorting !== undefined ? externalSorting : persistedSorting),
    [externalSorting, persistedSorting]
  );

  // Handle sorting changes with proper updater function support and persistence
  const setSorting = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      const newSorting =
        typeof updater === 'function' ? updater(sorting) : updater;
      if (externalOnSortingChange) {
        externalOnSortingChange(newSorting);
      } else {
        setPersistedSorting(newSorting);
      }
    },
    [externalOnSortingChange, sorting, setPersistedSorting]
  );

  // Column filters state - use persisted state
  const columnFilters = useMemo(
    () => persistedColumnFilters,
    [persistedColumnFilters]
  );

  // Handle column filters changes with persistence
  const setColumnFilters = useCallback(
    (
      updater:
        | ColumnFiltersState
        | ((prev: ColumnFiltersState) => ColumnFiltersState)
    ) => {
      const newFilters =
        typeof updater === 'function' ? updater(columnFilters) : updater;
      setPersistedColumnFilters(newFilters);
    },
    [columnFilters, setPersistedColumnFilters]
  );

  // Global (search) filter is persisted per-tableId in the same store as
  // columnFilters, so the search box survives remounts (paper/live switch,
  // live-data skeleton flips, navigating away and back) without depending on
  // the debounced URL sync. Setter accepts a value or an updater function so
  // it stays drop-in compatible with react-table's onGlobalFilterChange.
  const globalFilter = persistedGlobalFilter;
  const setGlobalFilter = useCallback(
    (updater: string | ((prev: string) => string)) => {
      const next =
        typeof updater === 'function' ? updater(persistedGlobalFilter) : updater;
      setPersistedGlobalFilter(next);
    },
    [persistedGlobalFilter, setPersistedGlobalFilter]
  );
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [toolbarRowRef, toolbarRowWidth] = useContainerWidth();
  // Search is the lowest-priority toolbar slot: it only renders inline when
  // the toolbar has room for every button at full size AND a meaningful
  // input alongside them. ResponsiveButtonRow publishes the width it needs
  // to keep all buttons visible at full; we compare against that. No
  // hard-coded breakpoint — adapts to the actual button set and label
  // widths.
  const [buttonRowFullWidth, setButtonRowFullWidth] = useState(0);
  const handleToolbarMetrics = useCallback(
    (metrics: { requiredFullWidth: number }) => {
      setButtonRowFullWidth(metrics.requiredFullWidth);
    },
    []
  );
  // Outer toolbar uses gap-3 (12px) between search and the button row.
  const OUTER_TOOLBAR_GAP = 12;
  // Comfortable width for an inline search input.
  const INLINE_SEARCH_WIDTH = 200;
  const isSearchInline =
    toolbarRowWidth > 0 &&
    buttonRowFullWidth > 0 &&
    toolbarRowWidth - INLINE_SEARCH_WIDTH - OUTER_TOOLBAR_GAP >=
      buttonRowFullWidth;
  const isSearchCollapsible = !isSearchInline;
  const [showColumnFilters, setShowColumnFilters] = useState(
    () => columnFilters.length > 0
  );
  const [grouping, setGrouping] = useState<GroupingState>(() => []);
  const [expanded, setExpanded] = useState<ExpandedState>(() => ({}));
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(
    () => ({})
  );

  // Shift-click range selection + live-data flicker control.
  // Refs (not state) so reading/writing them never triggers a re-render and the
  // memoized selection column can close over them without being recreated.
  // - lastSelectedRowIdRef: anchor row for the next shift-click range.
  // - hasAnimatedEntranceRef: true once the table has painted its first set of
  //   rows, so rows that appear later (e.g. during a bulk merge) snap in
  //   instead of replaying the staggered entrance animation = no flicker.
  const lastSelectedRowIdRef = useRef<string | null>(null);
  const hasAnimatedEntranceRef = useRef(false);

  // Reset table handler - clears all stored preferences for this table
  const handleResetTable = useCallback(() => {
    logger.info('[DataTable] Resetting table preferences', { tableId });
    resetPreferences();
    // Reset local states as well
    setPersistedColumnFilters([]);
    setPersistedSorting([]);
    setGlobalFilter('');
    setShowColumnFilters(false);
    setGrouping([]);
    setExpanded({});
    setRowSelection({});
  }, [
    tableId,
    resetPreferences,
    setPersistedColumnFilters,
    setPersistedSorting,
  ]);

  // View mode state - use persisted view mode when card view is enabled, otherwise use defaultView
  const viewMode = useMemo(
    () => (enableCardView ? persistedViewMode || defaultView : 'table'),
    [enableCardView, defaultView, persistedViewMode]
  );
  const setViewMode = useMemo(
    () =>
      enableCardView
        ? (newViewMode: 'table' | 'cards') => {
            setPersistedViewMode(newViewMode);
            onViewModeChange?.(newViewMode);
          }
        : () => {},
    [enableCardView, setPersistedViewMode, onViewModeChange]
  ); // No-op when card view is disabled

  // Scroll indicator states
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Notify parent of initial view mode
  useEffect(() => {
    onViewModeChange?.(viewMode);
  }, [viewMode, onViewModeChange]);

  // Notify parent of column filters visibility changes
  useEffect(() => {
    onColumnFiltersVisibilityChange?.(showColumnFilters);
  }, [showColumnFilters, onColumnFiltersVisibilityChange]);

  // Check scroll position and update indicators
  const checkScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  // Handle scroll events
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => checkScrollPosition();
    const handleResize = () => {
      // Delay to ensure layout is updated
      setTimeout(checkScrollPosition, 100);
    };

    container.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleResize);

    // Initial check
    checkScrollPosition();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [checkScrollPosition]);

  // Check scroll when data or columns change
  useEffect(() => {
    setTimeout(checkScrollPosition, 100);
  }, [data, columnVisibility, columnOrder, checkScrollPosition]);

  // Cleanup dragging state on unmount
  useEffect(() => {
    return () => {
      document.body.removeAttribute('data-dragging-columns');
      document.body.classList.remove('dragging-columns');
    };
  }, []);

  // Scroll functions
  const scrollLeft = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: -200,
      behavior: 'smooth',
    });
  }, []);

  const scrollRight = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: 200,
      behavior: 'smooth',
    });
  }, []);

  const handleToggleColumnFilters = useCallback(() => {
    setShowColumnFilters((prev) => !prev);
  }, []);

  // URL sync: serialize/deserialize helper functions and init / update logic
  const filtersParamKey = useMemo(() => `filters_${tableId}`, [tableId]);
  const sortingParamKey = useMemo(() => `sort_${tableId}`, [tableId]);
  const globalParamKey = useMemo(() => `global_${tableId}`, [tableId]);

  const initializedFromUrlRef = useRef(false);

  // Use URL-safe Base64 to keep query params compact and readable.
  // Keep backwards compatibility by attempting JSON.parse on raw and decoded values.
  // helpers moved to urlSync; import above

  // serialize and deserialize now imported from ./urlSync

  // Initialize filters and sorting from URL on mount
  useEffect(() => {
    if (!enableUrlSync) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const filtersStr = params.get(filtersParamKey);
      const sortStr = params.get(sortingParamKey);
      const globalStr = params.get(globalParamKey);

      if (filtersStr) {
        // Parse with the filter-specific reader, not the sniffing `deserialize`:
        // a filters param that doesn't look like filters would otherwise fall
        // through to the sorting reader, which accepts ANY token and returns
        // `[{ id, desc }]`. That passed the Array.isArray check below and was
        // written back as the column filters — i.e. every reload silently
        // cleared the table's filters.
        const parsed = deserializeFilters<ColumnFiltersState>(filtersStr);
        if (isColumnFiltersState(parsed)) {
          setColumnFilters(parsed);
          setShowColumnFilters(true);
        }
      }

      if (sortStr) {
        const parsed = deserializeSorting<SortingState>(sortStr);
        if (isSortingState(parsed)) {
          setSorting(parsed);
        }
      }

      if (globalStr) {
        setGlobalFilter(globalStr);
      }
    } finally {
      // Mark as initialized so subsequent changes sync back to URL
      initializedFromUrlRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, enableUrlSync]);

  // Update URL when columnFilters, sorting or globalFilter change
  useEffect(() => {
    if (!enableUrlSync) return;
    if (!initializedFromUrlRef.current) return;

    const timeout = window.setTimeout(() => {
      try {
        const current = new URLSearchParams(window.location.search);

        if (columnFilters && columnFilters.length > 0) {
          current.set(filtersParamKey, serialize(columnFilters));
        } else {
          current.delete(filtersParamKey);
        }

        if (sorting && (sorting as SortingState).length > 0) {
          current.set(sortingParamKey, serialize(sorting));
        } else {
          current.delete(sortingParamKey);
        }

        if (globalFilter && globalFilter !== '') {
          current.set(globalParamKey, String(globalFilter));
        } else {
          current.delete(globalParamKey);
        }

        const newUrl = `${window.location.pathname}${
          current.toString() ? `?${current.toString()}` : ''
        }${window.location.hash || ''}`;
        history.replaceState({}, '', newUrl);
        logger.debug('DataTableURLSync: updated URL params', {
          tableId,
          filters: columnFilters,
          sorting,
          globalFilter,
        });
      } catch (err) {
        logger.warn('DataTableURLSync: failed to update URL', { tableId, err });
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [
    columnFilters,
    sorting,
    globalFilter,
    tableId,
    enableUrlSync,
    filtersParamKey,
    sortingParamKey,
    globalParamKey,
  ]);

  // Sensors for drag and drop - use default sensors with proper event handling
  const mouseSensor = useSensor(MouseSensor, mouseConfig);
  const touchSensor = useSensor(TouchSensor, touchConfig);
  const sensors = useSensors(mouseSensor, touchSensor);

  // Memoized columns - DO NOT reorder based on pinning here
  // React Table will handle column ordering via the columnOrder state
  const columns = useMemo(() => {
    // Just return the initial columns - React Table will order them via state.columnOrder
    return initialColumns;
  }, [initialColumns]);

  /**
   * CRITICAL: Selection column for bulk actions
   *
   * Creates a checkbox column when bulk actions are enabled. This column:
   * - Is ALWAYS rendered first (before all other columns)
   * - Has a fixed width of 48px
   * - Is sticky positioned on the left
   * - Cannot be hidden, sorted, filtered, resized, or grouped
   * - Has special event handling to prevent row click propagation
   *
   * HOW IT WORKS:
   * - Header shows "select all" checkbox that toggles all PAGE rows
   * - Each cell shows an individual row checkbox
   * - Checkbox state is managed by React Table's rowSelection state
   * - Selection persists across pagination/filtering for rows that remain visible
   *
   * IMPORTANT: This column is ONLY created when bulkActions is provided and non-empty
   * If bulkActions becomes empty/undefined, the column disappears and selection is disabled
   *
   * STOP EVENTS: Click/mouseDown events are stopped to prevent:
   * - Row selection from triggering onRowClick
   * - Checkbox interaction from triggering table drag
   * - Selection from interfering with other interactive elements
   *
   * MAINTENANCE NOTES:
   * - Column ID is '_selection' - used throughout the component for special handling
   * - Size values (48px) are hardcoded in multiple places - keep them synchronized
   * - If checkboxes stop working, verify:
   *   1. bulkActions prop is provided and non-empty
   *   2. enableRowSelection is true in table config
   *   3. rowSelection state is being updated
   *   4. Event propagation isn't being blocked elsewhere
   *
   * DEPENDENCIES:
   * - Requires bulkActions prop to be defined
   * - Changes to bulkActions array trigger column recreation
   * - Column is prepended to enhancedColumns (see below)
   */
  const selectionColumn: ColumnDef<TData, TValue> | null = useMemo(() => {
    // Only create selection column if bulk actions are configured
    if (!bulkActions || bulkActions.length === 0) return null;

    return {
      id: '_selection',
      header: ({ table: t }) => (
        <div
          className="flex items-center justify-center px-2"
          onClick={(e) => {
            // CRITICAL: Stop propagation to prevent sorting/filtering triggers
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <Checkbox
            checked={
              t.getIsAllPageRowsSelected() ||
              (t.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => {
              // Toggle all rows on current page only (not all filtered rows)
              t.toggleAllPageRowsSelected(!!value);
            }}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row, table: t }) => (
        <div
          className="flex items-center justify-center px-2 select-none"
          onClick={(e) => {
            // CRITICAL: Stop propagation to prevent onRowClick from firing
            e.stopPropagation();
            e.preventDefault();
          }}
          // Intercept SHIFT-click in the capture phase — this fires before the
          // Radix checkbox's own click toggle, so stopping propagation here
          // prevents the single-row toggle and lets us run a range select
          // instead. Reading e.shiftKey straight off the click avoids any
          // timing games with onCheckedChange (which gets no mouse event).
          onClickCapture={(e) => {
            if (!e.shiftKey) return;
            e.preventDefault();
            e.stopPropagation();

            const anchorId = lastSelectedRowIdRef.current;
            const rows = t.getRowModel().rows;
            // The clicked row decides the target state: if it's currently
            // unselected, the range becomes selected, otherwise deselected.
            const nextSelected = !row.getIsSelected();

            const fromIndex = anchorId
              ? rows.findIndex((r) => r.id === anchorId)
              : -1;
            const toIndex = rows.findIndex((r) => r.id === row.id);

            if (anchorId && anchorId !== row.id && fromIndex !== -1 && toIndex !== -1) {
              const [start, end] =
                fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
              setRowSelection((prev) => {
                const next = { ...prev };
                for (let i = start; i <= end; i++) {
                  const id = rows[i].id;
                  if (nextSelected) {
                    next[id] = true;
                  } else {
                    next[id] = false;
                  }
                }
                return next;
              });
            } else {
              // No anchor yet (or same row) — behave like a normal toggle.
              row.toggleSelected(nextSelected);
            }

            // This row becomes the anchor for the next shift-click.
            lastSelectedRowIdRef.current = row.id;
          }}
          onMouseDown={(e) => e.stopPropagation()} // Prevent drag handlers
        >
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => {
              // Normal (non-shift) mouse click or keyboard toggle.
              row.toggleSelected(!!value);
              lastSelectedRowIdRef.current = row.id;
            }}
            aria-label="Select row"
          />
        </div>
      ),
      // Disable all interactive features for this column
      enableSorting: false,
      enableHiding: false,
      enableColumnFilter: false,
      enableResizing: false,
      enableGrouping: false,
      // Fixed size - do not allow resizing
      size: 48,
      minSize: 48,
      maxSize: 48,
    } as ColumnDef<TData, TValue>;
  }, [bulkActions]);

  /**
   * Enhanced columns with custom filter functions and selection column
   *
   * This creates the final column configuration used by React Table:
   * 1. Adds default filter function (enhancedColumnFilter) to columns without custom filterFn
   * 2. Preserves custom filterFn if already defined on the column
   * 3. Prepends selection column (if bulk actions enabled) BEFORE all other columns
   *
   * COLUMN ORDER:
   * - Selection column (_selection) is ALWAYS first when present
   * - Followed by all user-defined columns in their specified order
   * - Column order state later controls visual reordering (but _selection stays first)
   *
   * FILTER FUNCTION:
   * - enhancedColumnFilter supports operators: contains, equals, startsWith, etc.
   * - Works with different field types: string, number, date, boolean
   * - Set via column meta: { filterType: 'string' | 'number' | 'date' | 'boolean' }
   * - Custom filterFn on columns is preserved (use for complex fields like coinPair, exchange)
   *
   * DEPENDENCIES:
   * - columns: User-defined column config (should be memoized by caller)
   * - selectionColumn: Created above, depends on bulkActions
   * - Changes to either trigger full column reconfiguration
   *
   * MAINTENANCE NOTES:
   * - Order matters: [selectionColumn, ...baseColumns] ensures selection is first
   * - If columns seem misaligned, check that selectionColumn is properly prepended
   * - Custom filterFn is preserved using nullish coalescing (??)
   * - Filter function is applied to ALL columns (including selection) but selection
   *   column has enableColumnFilter: false, so it's ignored
   */
  const enhancedColumns = useMemo(() => {
    // Add custom filter function to columns that don't have their own filterFn
    const baseColumns = columns.map((column) => ({
      ...column,
      // Preserve custom filterFn if defined, otherwise use createEnhancedColumnFilter
      // which picks up meta.getFilterValue for multi-field matching
      filterFn:
        column.filterFn ??
        createEnhancedColumnFilter(
          column.meta as Record<string, unknown> | undefined
        ),
    }));

    // Prepend selection column if bulk actions are enabled
    // Selection column is always first, regardless of column order or pinning
    if (selectionColumn) {
      return [selectionColumn, ...baseColumns];
    }

    return baseColumns;
  }, [columns, selectionColumn]);

  /**
   * CRITICAL: Clear row selection when data changes
   *
   * This is ESSENTIAL for bulk actions stability:
   * - When data prop changes, previously selected row IDs may no longer exist
   * - Stale selection state causes bulk actions to receive non-existent rows
   * - Can lead to errors, empty selections, or actions on wrong data
   *
   * WHY WE CLEAR:
   * - getRowId returns IDs based on row data (often row.id property)
   * - If data array is replaced, old IDs are likely invalid
   * - React Table doesn't auto-clear selection on data change
   * - Manual clear prevents stale state and user confusion
   *
   * ALTERNATIVES CONSIDERED:
   * 1. Try to preserve selection by matching IDs - complex and error-prone
   * 2. Only clear if specific rows are removed - requires deep comparison
   * 3. Use autoResetRowSelection - doesn't work reliably with custom getRowId
   *
   * TRADEOFFS:
   * - PRO: Simple, reliable, prevents bugs
   * - PRO: User expectation - data changed, selection should reset
   * - CON: User loses selection when data updates (e.g., polling)
   * - CON: Can be annoying if data updates frequently
   *
   * IF THIS CAUSES ISSUES:
   * - Consider making it conditional: only clear if row IDs changed
   * - Add a prop to control this behavior: preserveSelectionOnDataChange
   * - Use deep equality check on data to avoid unnecessary clears
   *
   * MAINTENANCE NOTES:
   * - This effect MUST run when data changes - do not remove dependency
   * - If selection persists when it shouldn't, verify data reference changes
   * - If selection clears too often, check if data is being unnecessarily recreated
   */
  // Keep getRowId reachable from the prune effect below without making the
  // effect re-run when callers pass an inline (non-memoized) getRowId.
  const getRowIdRef = useRef(getRowId);
  getRowIdRef.current = getRowId;

  useEffect(() => {
    // Live data (e.g. unrealized-PnL ticks, websocket deal updates) gives `data`
    // a fresh array reference very frequently. Wiping the whole selection on
    // every such tick made the selection — and bulk-action toolbar — flicker
    // and made multi-row selection unusable while prices moved. Instead, prune
    // only the selected rows that no longer exist (e.g. deals merged away),
    // preserving the rest. Return the previous state unchanged when nothing was
    // dropped so we don't trigger an extra render on benign ticks.
    setRowSelection((prev) => {
      const selectedIds = Object.keys(prev);
      if (selectedIds.length === 0) return prev;

      const resolveId = getRowIdRef.current;
      const currentIds = new Set(
        data.map((row, index) =>
          resolveId ? (resolveId(row) ?? String(index)) : String(index)
        )
      );

      let changed = false;
      const next: RowSelectionState = {};
      for (const id of selectedIds) {
        if (currentIds.has(id)) {
          next[id] = prev[id];
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data]);

  /**
   * React Table instance configuration
   *
   * CRITICAL BULK ACTIONS CONFIGURATION:
   * Three settings below are ESSENTIAL for bulk actions to work:
   *
   * 1. state.rowSelection
   *    - Object mapping row IDs to selection state: { "row-id": true }
   *    - MUST be included in state for React Table to track selection
   *    - Updated by user checkbox interactions
   *
   * 2. enableRowSelection
   *    - MUST be true when bulkActions are provided
   *    - Controls whether checkboxes are interactive
   *    - Formula: !!bulkActions && bulkActions.length > 0
   *    - If false, checkboxes appear but don't respond to clicks
   *
   * 3. onRowSelectionChange
   *    - Callback when selection state changes
   *    - MUST be connected to setRowSelection state updater
   *    - React Table calls this when user clicks checkboxes
   *    - Without this, selection state never updates
   *
   * 4. getRowId
   *    - Function that returns unique ID for each row
   *    - CRITICAL: IDs must be stable across renders
   *    - Default: use row index (fragile if data reorders)
   *    - Recommended: provide prop with row.id or similar
   *    - Used as keys in rowSelection state object
   *    - Inconsistent IDs break selection completely
   *
   * COMMON BULK ACTIONS FAILURES:
   * - enableRowSelection is false → checkboxes don't work
   * - onRowSelectionChange not set → selection state never updates
   * - rowSelection not in state → React Table doesn't track selection
   * - getRowId returns non-unique IDs → multiple rows share selection
   * - getRowId returns different IDs each render → selection resets
   * - getRowId fallback to index → selection breaks on sort/filter
   *
   * OTHER IMPORTANT SETTINGS:
   * - autoResetPageIndex: false → page doesn't jump when data changes
   * - autoResetExpanded: false → expanded rows stay expanded
   * - debugTable: false → disable console logging (set true for debugging)
   *
   * DEBUGGING CHECKLIST:
   * If bulk actions don't work, verify in React DevTools:
   * 1. Is enableRowSelection true?
   * 2. Is rowSelection in table state?
   * 3. Does rowSelection update when clicking checkboxes?
   * 4. Does selectedRows memo update when rowSelection changes?
   * 5. Does ToolbarButtonRow receive updated selectedRows?
   * 6. Is getRowId provided and returning stable IDs?
   */
  // Build the effective column order:
  // 1. Selection column always first.
  // 2. Left-pinned columns next (in their pin-list order).
  // 3. Unpinned columns in their persisted/default order, with any new
  //    columns (added to the ColumnDef list since the order was persisted)
  //    appended so react-table doesn't fall back to rendering them after
  //    our right-pins.
  // 4. Right-pinned columns at the end (in their pin-list order).
  // Without step 4, persisted column orders predating a pin can leave the
  // pinned column rendered mid-table.
  // Memoised rather than inlined as an IIFE in the `state` block below: it
  // allocated three Sets and a fresh array on EVERY render, and the new array
  // identity busted react-table's internal column-order memos (visible leaf
  // columns, header groups) each time — so unrelated renders rebuilt the whole
  // column model.
  const effectiveColumnOrder = useMemo(() => {
    const leftPins = effectivePinnedColumns.left;
    const rightPins = effectivePinnedColumns.right;
    const pinnedSet = new Set([...leftPins, ...rightPins, '_selection']);
    const persistedSet = new Set(columnOrder);
    const persistedMiddle = columnOrder.filter((id) => !pinnedSet.has(id));
    const newColumns = defaultColumnOrder.filter(
      (id) => id && !persistedSet.has(id) && !pinnedSet.has(id)
    );
    const head = selectionColumn ? ['_selection'] : [];
    return [
      ...head,
      ...leftPins,
      ...persistedMiddle,
      ...newColumns,
      ...rightPins,
    ];
  }, [effectivePinnedColumns, columnOrder, defaultColumnOrder, selectionColumn]);

  // `showPagination={false}` hides the footer — and with it every control that
  // could reach page 2 — but the pagination row model still slices to
  // `pageSize` (10 by default). The tail of the data was therefore rendered
  // nowhere and there was no affordance saying so: the bot form's DCA overview
  // listed 10 orders of a 33-order ladder while the graph next to it and the
  // Coverage / Total Funds tiles were computed from all of them.
  // Without a footer there is no page to turn, so the page IS the whole table.
  // (`pages/Exchanges.tsx` already worked around this per-call-site with
  // `initialPageSize={9999}`; that only helps tables the user has never
  // rendered, because a persisted preference wins over the initial size.)
  const effectivePagination = useMemo(
    () =>
      showPagination
        ? pagination
        : { pageIndex: 0, pageSize: Math.max(data.length, 1) },
    [showPagination, pagination, data.length]
  );

  const table = useReactTable({
    data,
    columns: enhancedColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      columnOrder: effectiveColumnOrder,
      pagination: effectivePagination,
      grouping,
      expanded,
      rowSelection, // CRITICAL: Must be in state for bulk actions
    },
    // CRITICAL: Enable row selection when bulk actions are provided
    enableRowSelection: !!bulkActions && bulkActions.length > 0,
    // CRITICAL: Connect selection state updates to our state setter
    onRowSelectionChange: setRowSelection,
    // CRITICAL: Provide stable row IDs for selection tracking
    // Fallback to index if no getRowId provided, but this is fragile
    getRowId: getRowId
      ? (row, index) => getRowId(row) ?? String(index)
      : (_, index) => String(index),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: (updater) => {
      const newVisibility =
        typeof updater === 'function' ? updater(columnVisibility) : updater;
      setColumnVisibility(newVisibility);
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: (updater) => {
      const newOrder =
        typeof updater === 'function' ? updater(columnOrder) : updater;
      setColumnOrder(newOrder);
    },
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function' ? updater(pagination) : updater;
      // Guard to avoid redundant store writes that can cause render loops
      if (
        newPagination.pageIndex !== pagination.pageIndex ||
        newPagination.pageSize !== pagination.pageSize
      ) {
        setPagination(newPagination);
      }
    },
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: fuzzyFilter,
    filterFns: {
      enhancedColumnFilter: enhancedColumnFilter,
    },
    enableSorting,
    enableColumnFilters,
    enableGlobalFilter,
    enableGrouping,
    // Prevent auto reset of pageIndex when data reference changes (we control it)
    autoResetPageIndex: false,
    autoResetExpanded: false,
    debugTable: false,
  });

  // Whether DataTableFooter will render a sticky totals row (same check it
  // makes internally) — drives the scroll container's bottom padding.
  const hasTotalsFooter = table
    .getFooterGroups()
    .some((footerGroup) =>
      footerGroup.headers.some((header) =>
        Boolean(
          (header.column.columnDef.meta as { enableTotalsRow?: boolean })
            ?.enableTotalsRow
        )
      )
    );


  // Clamp pageIndex to a valid range whenever data length or pageSize changes
  useEffect(() => {
    try {
      const totalRows = table.getFilteredRowModel().rows.length;
      const pageSize = pagination.pageSize;
      const lastPageIndex = Math.max(0, Math.ceil(totalRows / pageSize) - 1);
      if (pagination.pageIndex > lastPageIndex) {
        setPagination({ ...pagination, pageIndex: lastPageIndex });
      }
    } catch {
      // no-op
    }
    // We specifically depend on data, pagination, and table row model
  }, [data, pagination, setPagination, table]);

  /**
   * CRITICAL: Selected rows calculation for bulk actions
   *
   * This memoization is ESSENTIAL for bulk actions functionality and must be handled carefully:
   *
   * PROBLEM: The `table` object from useReactTable is recreated on EVERY render, making it
   * unsuitable as a dependency. Using [table] causes the memo to recompute every render but
   * doesn't trigger child re-renders when selection actually changes.
   *
   * SOLUTION: We explicitly depend on `rowSelection` state (the source of truth) and `data`
   * (to handle data updates). This ensures:
   * 1. Child components re-render when selection changes
   * 2. Bulk actions receive updated selectedRows
   * 3. The toolbar shows correct selection count
   *
   * HOW IT WORKS:
   * - rowSelection: Object like {"0": true, "2": true} where keys are row IDs
   * - We map these IDs back to actual row data using the table's filtered row model
   * - The filtered model respects current filters/sorting, ensuring consistency
   *
   * WHY THIS IS FRAGILE:
   * - Relies on rowSelection state being properly maintained by React Table
   * - Requires getRowId to be consistent and deterministic
   * - If data changes while rows are selected, selection may become stale
   *   (but we clear selection on data change - see useEffect above)
   *
   * MAINTENANCE NOTES:
   * - DO NOT add `table` as a dependency - it causes infinite loops
   * - DO NOT remove `rowSelection` or `data` - breaks reactivity
   * - If bulk actions stop working, check:
   *   1. Is rowSelection state being updated? (React DevTools)
   *   2. Is getRowId prop provided and returning consistent IDs?
   *   3. Are row IDs stable across renders?
   *   4. Is enableRowSelection properly set based on bulkActions?
   *
   * TESTING:
   * - Select/deselect rows and verify toolbar updates
   * - Change filters with rows selected (selection should persist for visible rows)
   * - Change data with rows selected (selection should clear)
   * - Execute bulk action and verify correct rows are passed
   */
  const selectedRows = useMemo(() => {
    // Get all filtered rows from the table
    const filteredRows = table.getFilteredRowModel().rows;

    // Get selected row IDs from the selection state
    const selectedIds = Object.keys(rowSelection).filter(
      (id) => rowSelection[id] === true
    );

    // Map selected IDs back to original data
    // We use filteredRows to respect current filters and ensure consistency
    const selected = filteredRows
      .filter((row) => selectedIds.includes(row.id))
      .map((row) => row.original);

    logger.debug('[DataTable] Selected rows updated', {
      tableId,
      selectionState: rowSelection,
      selectedIds,
      selectedCount: selected.length,
      totalFiltered: filteredRows.length,
    });

    return selected;
    // `table` is intentionally omitted: react-table hands us a fresh `table`
    // object on every render, so listing it here makes this memo recompute each
    // render and feeds the toolbar a new array, driving a "Maximum update depth
    // exceeded" loop (React #185). rowSelection/tableId are the real inputs; the
    // memo reads the current table via closure when selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection, tableId]);

  // Compute the visual column order from the table's header groups
  // This ensures SortableContext items match the actual rendered order
  const visualColumnOrder = useMemo(() => {
    const headerGroups = table.getHeaderGroups();
    if (headerGroups.length === 0) return columnOrder;
    return headerGroups[0].headers.map((h) => h.column.id);
  }, [table, columnOrder]);

  // Handle column drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      // Clean up the dragging indicator
      document.body.removeAttribute('data-dragging-columns');
      document.body.classList.remove('dragging-columns');

      const { active, over } = event;

      if (active && over && active.id !== over.id) {
        const activeId = active.id as string;
        const overId = over.id as string;

        // Don't allow dragging pinned columns (the source column)
        if (
          effectivePinnedColumns.left.includes(activeId) ||
          effectivePinnedColumns.right.includes(activeId)
        ) {
          return;
        }

        // Use visual column order for drag-drop operations
        const oldIndex = visualColumnOrder.indexOf(activeId);
        let newIndex = visualColumnOrder.indexOf(overId);

        // If dropping over a pinned column, find the nearest unpinned position
        if (
          effectivePinnedColumns.left.includes(overId) ||
          effectivePinnedColumns.right.includes(overId)
        ) {
          // If dropping over a left-pinned column, place after the last left-pinned column
          if (effectivePinnedColumns.left.includes(overId)) {
            const lastLeftPinnedIndex = effectivePinnedColumns.left.length - 1;
            newIndex = lastLeftPinnedIndex + 1;
          }
          // If dropping over a right-pinned column, place before the first right-pinned column
          else if (effectivePinnedColumns.right.includes(overId)) {
            const firstRightPinnedIndex = visualColumnOrder.findIndex((id) =>
              effectivePinnedColumns.right.includes(id)
            );
            newIndex =
              firstRightPinnedIndex > 0 ? firstRightPinnedIndex - 1 : 0;
          }
        }

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          // Reorder based on visual order, then update the state
          const newVisualOrder = arrayMove(
            visualColumnOrder,
            oldIndex,
            newIndex
          );
          setColumnOrder(newVisualOrder);
        }
      }
    },
    [visualColumnOrder, setColumnOrder, effectivePinnedColumns]
  );

  // Handle column drag start to prevent propagation
  const handleDragStart = useCallback((event: DragEndEvent) => {
    // Stop propagation to prevent widget wrapper drag
    if (event.active) {
      // Add a data attribute to indicate we're dragging columns
      document.body.setAttribute('data-dragging-columns', 'true');
      // Add CSS class to prevent pointer events on widget wrapper
      document.body.classList.add('dragging-columns');
    }
  }, []);

  // Handle column pinning
  const toggleColumnPin = useCallback(
    (columnId: string, side: 'left' | 'right') => {
      const currentLeft = effectivePinnedColumns.left;
      const currentRight = effectivePinnedColumns.right;
      let newLeft = [...currentLeft];
      let newRight = [...currentRight];

      if (side === 'left') {
        if (currentLeft.includes(columnId)) {
          // Unpin from left
          newLeft = currentLeft.filter((id) => id !== columnId);
        } else {
          // Pin to left (remove from right if there)
          newLeft = [...currentLeft, columnId];
          newRight = currentRight.filter((id) => id !== columnId);
        }
      } else {
        if (currentRight.includes(columnId)) {
          // Unpin from right
          newRight = currentRight.filter((id) => id !== columnId);
        } else {
          // Pin to right (remove from left if there)
          newRight = [...currentRight, columnId];
          newLeft = currentLeft.filter((id) => id !== columnId);
        }
      }

      // Update pinned columns
      setPinnedColumns({
        left: newLeft,
        right: newRight,
      });

      // IMPORTANT: use the table's *actual* leaf column IDs as the source of truth.
      // Some columns (e.g. display columns like "Actions") don't have accessorKey,
      // so deriving IDs from the ColumnDef list can miss them or mismatch IDs.
      const allLeafColumnIds = table
        .getAllLeafColumns()
        .map((col) => col.id)
        .filter((id) => id && id !== '_selection');

      // Keep only valid pinned IDs (avoid persisting stale IDs)
      newLeft = newLeft.filter((id) => allLeafColumnIds.includes(id));
      newRight = newRight.filter((id) => allLeafColumnIds.includes(id));

      // Base order: preserve current columnOrder as much as possible,
      // then append any columns that weren't previously in columnOrder.
      const baseOrder = [
        ...columnOrder.filter(
          (id) => id !== '_selection' && allLeafColumnIds.includes(id)
        ),
        ...allLeafColumnIds.filter((id) => !columnOrder.includes(id)),
      ];

      // Build complete column order: leftPinned -> unpinned -> rightPinned
      const unpinned = baseOrder.filter(
        (id) => !newLeft.includes(id) && !newRight.includes(id)
      );

      const newColumnOrder = [...newLeft, ...unpinned, ...newRight];
      setColumnOrder(newColumnOrder);

      logger.debug('[DataTable] Column pinning updated', {
        tableId,
        columnId,
        side,
        newLeft,
        newRight,
        allLeafColumnIds,
        baseOrder,
        unpinned,
        newColumnOrder,
      });
    },
    [
      effectivePinnedColumns,
      setPinnedColumns,
      columnOrder,
      setColumnOrder,
      table,
      tableId,
    ]
  );

  // Handle column resizing
  const handleColumnResize = useCallback(
    (columnId: string, width: number) => {
      const nextWidth =
        columnId === 'actions' ? COMPACT_ACTIONS_COLUMN_WIDTH : width;

      logger.debug('Resizing column:', { columnId, width: nextWidth });
      const newWidths = { ...columnWidths, [columnId]: nextWidth };
      setColumnWidths(newWidths);
    },
    [columnWidths, setColumnWidths]
  );

  const getColumnDefById = useCallback(
    (columnId: string) => {
      return initialColumns.find((col) => {
        const columnWithId = col as ColumnDef<TData, TValue> & {
          accessorKey?: string;
          id?: string;
        };
        // Match react-table's leaf-id resolution: prefer `id`, otherwise a
        // nested accessorKey (`a.b`) is registered as `a_b`.
        if (columnWithId.id) return columnWithId.id === columnId;
        if (typeof columnWithId.accessorKey === 'string') {
          return columnWithId.accessorKey.replace(/\./g, '_') === columnId;
        }
        return false;
      }) as
        | (ColumnDef<TData, TValue> & {
            size?: number;
            minSize?: number;
            maxSize?: number;
          })
        | undefined;
    },
    [initialColumns]
  );

  const getColumnMinWidth = useCallback(
    (columnId: string) => {
      if (columnId === 'actions') {
        return COMPACT_ACTIONS_COLUMN_WIDTH;
      }

      const columnDef = getColumnDefById(columnId);
      return columnDef?.minSize ?? DEFAULT_MIN_COLUMN_WIDTH;
    },
    [getColumnDefById]
  );

  const getColumnDefaultWidth = useCallback(
    (columnId: string) => {
      if (columnId === 'actions') {
        return COMPACT_ACTIONS_COLUMN_WIDTH;
      }

      const columnDef = getColumnDefById(columnId);
      const minWidth = getColumnMinWidth(columnId);

      return Math.max(columnDef?.size ?? DEFAULT_COLUMN_WIDTH, minWidth);
    },
    [getColumnDefById, getColumnMinWidth]
  );

  const getColumnMaxWidth = useCallback(
    (columnId: string) => {
      if (columnId === 'actions') {
        return COMPACT_ACTIONS_COLUMN_WIDTH;
      }

      const columnDef = getColumnDefById(columnId);
      return columnDef?.maxSize;
    },
    [getColumnDefById]
  );

  // Auto-resize single column to fit content (including header)
  const autoResizeSingleColumn = useCallback(
    (columnId: string) => {
      if (!enableColumnResizing) return;

      if (columnId === 'actions') {
        handleColumnResize(columnId, COMPACT_ACTIONS_COLUMN_WIDTH);
        return;
      }

      const tableElement = scrollContainerRef.current?.querySelector('table');
      if (!tableElement) return;

      const columnIndex = table
        .getAllColumns()
        .findIndex((col) => col.id === columnId);
      if (columnIndex === -1) return;

      const headerEl = tableElement.querySelector(
        `thead th:nth-child(${columnIndex + 1})`
      );
      const rows = tableElement.querySelectorAll(
        'tbody tr:not([data-placeholder])'
      );

      let maxWidth = getColumnMinWidth(columnId);

      // Measure header
      if (headerEl) {
        const headerContent =
          headerEl.querySelector('[data-header-content]') || headerEl;
        const tempSpan = document.createElement('span');
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.whiteSpace = 'nowrap';
        tempSpan.style.fontSize =
          window.getComputedStyle(headerContent).fontSize;
        tempSpan.style.fontFamily =
          window.getComputedStyle(headerContent).fontFamily;
        tempSpan.style.fontWeight =
          window.getComputedStyle(headerContent).fontWeight;
        tempSpan.textContent = headerContent.textContent || '';

        document.body.appendChild(tempSpan);
        const headerWidth = tempSpan.offsetWidth + 80;
        document.body.removeChild(tempSpan);

        maxWidth = Math.max(maxWidth, headerWidth);
      }

      // Measure cells
      const rowsToCheck = Math.min(rows.length, 20);
      for (let i = 0; i < rowsToCheck; i++) {
        const cell = rows[i]?.children[columnIndex] as HTMLElement;
        if (cell) {
          const tempSpan = document.createElement('span');
          tempSpan.style.visibility = 'hidden';
          tempSpan.style.position = 'absolute';
          tempSpan.style.whiteSpace = 'nowrap';
          tempSpan.style.fontSize = window.getComputedStyle(cell).fontSize;
          tempSpan.style.fontFamily = window.getComputedStyle(cell).fontFamily;
          tempSpan.style.fontWeight = window.getComputedStyle(cell).fontWeight;
          tempSpan.textContent = cell.textContent || '';

          document.body.appendChild(tempSpan);
          const textWidth = tempSpan.offsetWidth + 48;
          document.body.removeChild(tempSpan);

          maxWidth = Math.max(maxWidth, textWidth);
        }
      }

      maxWidth = Math.min(maxWidth, 400);
      handleColumnResize(columnId, maxWidth);
    },
    [enableColumnResizing, table, handleColumnResize, getColumnMinWidth]
  );

  // Get column width with fallback to default
  const getColumnWidth = useCallback(
    (columnId: string) => {
      if (columnId === 'actions') {
        return COMPACT_ACTIONS_COLUMN_WIDTH;
      }

      return columnWidths[columnId] ?? getColumnDefaultWidth(columnId);
    },
    [columnWidths, getColumnDefaultWidth]
  );

  // Auto-resize columns to fit content (including header)
  const autoResizeColumns = useCallback(
    (resetCustomWidths = false) => {
      if (!enableColumnResizing) return;

      const tableElement = scrollContainerRef.current?.querySelector('table');
      if (!tableElement) return;

      const newWidths: Record<string, number> = {};
      const headers = tableElement.querySelectorAll('thead th');
      const rows = tableElement.querySelectorAll(
        'tbody tr:not([data-placeholder])'
      );

      headers.forEach((header, colIndex) => {
        const columnId = table.getAllColumns()[colIndex]?.id;
        if (!columnId) return;

        if (columnId === 'actions') {
          newWidths[columnId] = COMPACT_ACTIONS_COLUMN_WIDTH;
          return;
        }

        // Skip if already has custom width and we're not resetting
        if (!resetCustomWidths && columnWidths[columnId]) return;

        let maxWidth = getColumnMinWidth(columnId);

        // Measure header content width
        const headerContent =
          header.querySelector('[data-header-content]') || header;
        if (headerContent) {
          const tempSpan = document.createElement('span');
          tempSpan.style.visibility = 'hidden';
          tempSpan.style.position = 'absolute';
          tempSpan.style.whiteSpace = 'nowrap';
          tempSpan.style.fontSize =
            window.getComputedStyle(headerContent).fontSize;
          tempSpan.style.fontFamily =
            window.getComputedStyle(headerContent).fontFamily;
          tempSpan.style.fontWeight =
            window.getComputedStyle(headerContent).fontWeight;
          tempSpan.textContent = headerContent.textContent || '';

          document.body.appendChild(tempSpan);
          const headerWidth = tempSpan.offsetWidth + 80; // Add padding for controls
          document.body.removeChild(tempSpan);

          maxWidth = Math.max(maxWidth, headerWidth);
        }

        // Check content width in visible rows (max 20 for performance)
        const rowsToCheck = Math.min(rows.length, 20);
        for (let i = 0; i < rowsToCheck; i++) {
          const cell = rows[i]?.children[colIndex] as HTMLElement;
          if (cell) {
            // Create a temporary span to measure text width
            const tempSpan = document.createElement('span');
            tempSpan.style.visibility = 'hidden';
            tempSpan.style.position = 'absolute';
            tempSpan.style.whiteSpace = 'nowrap';
            tempSpan.style.fontSize = window.getComputedStyle(cell).fontSize;
            tempSpan.style.fontFamily =
              window.getComputedStyle(cell).fontFamily;
            tempSpan.style.fontWeight =
              window.getComputedStyle(cell).fontWeight;
            tempSpan.textContent = cell.textContent || '';

            document.body.appendChild(tempSpan);
            const textWidth = tempSpan.offsetWidth + 48; // Add padding
            document.body.removeChild(tempSpan);

            maxWidth = Math.max(maxWidth, textWidth);
          }
        }

        // Cap at reasonable maximum
        maxWidth = Math.min(maxWidth, 400);
        newWidths[columnId] = maxWidth;
      });

      if (Object.keys(newWidths).length > 0) {
        // Only apply changes when values actually differ to prevent render loops
        const changed: Record<string, number> = {};
        for (const [id, width] of Object.entries(newWidths)) {
          if (columnWidths[id] !== width) {
            changed[id] = width;
          }
        }

        if (Object.keys(changed).length === 0) {
          return; // No-op if nothing changed
        }

        if (resetCustomWidths) {
          // Replace all widths
          setColumnWidths({ ...columnWidths, ...changed });
        } else {
          // Merge only changed entries
          setColumnWidths({ ...columnWidths, ...changed });
        }
      }
    },
    [
      enableColumnResizing,
      columnWidths,
      setColumnWidths,
      table,
      getColumnMinWidth,
    ]
  );

  // Auto-resize on data changes (throttled)
  const resizeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    // Delay to ensure DOM is updated and coalesce multiple triggers
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = window.setTimeout(() => {
      autoResizeColumns();
      resizeTimerRef.current = null;
    }, 150);
    return () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Calculate sticky position for pinned columns using actual widths
  const calculateStickyPosition = useCallback(
    (columnId: string, isPinned: 'left' | 'right' | false) => {
      if (!isPinned) return {};

      if (isPinned === 'left') {
        const columnIndex = effectivePinnedColumns.left.indexOf(columnId);
        // Start with selection column width if bulk actions are enabled
        let leftOffset = bulkActions && bulkActions.length > 0 ? 48 : 0;

        // Add widths of previous left pinned columns
        for (let i = 0; i < columnIndex; i++) {
          leftOffset += getColumnWidth(effectivePinnedColumns.left[i]);
        }
        return { left: `${leftOffset}px` };
      } else if (isPinned === 'right') {
        const columnIndex = effectivePinnedColumns.right.indexOf(columnId);
        const remainingColumns =
          effectivePinnedColumns.right.length - columnIndex - 1;

        if (remainingColumns === 0) {
          return { right: 0 };
        }
        // Calculate cumulative width of columns to the right
        let rightOffset = 0;
        for (
          let i = columnIndex + 1;
          i < effectivePinnedColumns.right.length;
          i++
        ) {
          rightOffset += getColumnWidth(effectivePinnedColumns.right[i]);
        }
        return { right: `${rightOffset}px` };
      }

      return {};
    },
    [effectivePinnedColumns, getColumnWidth, bulkActions]
  );

  // Export functions
  //
  // When `getExportData` is provided the export serializes the COMPLETE
  // dataset fetched from the server, not just the client-loaded subset. The
  // fetched data is run through a detached table instance built from the
  // live table's resolved options, so column visibility and active filters
  // apply to the export exactly as they do on screen.
  const buildExportRows = useCallback(
    (fullData: TData[]): Row<TData>[] => {
      const exportTable = createTable<TData>({
        ...table.options,
        data: fullData,
        state: {
          ...table.getState(),
          pagination: {
            pageIndex: 0,
            pageSize: Math.max(fullData.length, 1),
          },
        },
        onStateChange: () => {},
      });
      return exportTable.getFilteredRowModel().rows;
    },
    [table]
  );

  const resolveExportRows = useCallback(async (): Promise<Row<TData>[]> => {
    if (getExportData) {
      try {
        const fullData = await getExportData();
        if (fullData && fullData.length > 0) {
          return buildExportRows(fullData);
        }
      } catch (e) {
        logger.error(
          '[DataTable] Full-data export fetch failed; falling back to loaded rows',
          e
        );
      }
    }
    return table.getFilteredRowModel().rows; // Use filtered data
  }, [getExportData, buildExportRows, table]);

  const handleExportToCsv = useCallback(async () => {
    const headers = table
      .getHeaderGroups()
      .map((x) => x.headers)
      .flat();

    const rows = await resolveExportRows();

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${exportFilename}-${timestamp}`;

    downloadCsv(filename, headers, rows);
  }, [table, exportFilename, resolveExportRows]);

  const handleExportToJson = useCallback(async () => {
    const data = (await resolveExportRows()).map((row) => row.original);
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${exportFilename}-${timestamp}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [resolveExportRows, exportFilename]);
  // Read these live each render rather than memoizing on the (stable) `table`
  // instance: a `useMemo(..., [table])` captures the getter's result once at
  // mount — when async/streamed data is still empty — and never recomputes, so
  // the row count and pagination freeze at their initial (empty) values. The
  // react-table getters are internally memoized on state, so calling them per
  // render is cheap and always reflects the current data.
  const tableState = table.getState();
  const tableFilter = table.getFilteredRowModel();
  const { pageIndex, pageSize } = useMemo(
    () => tableState.pagination,
    [tableState?.pagination]
  );
  const totalRows = useMemo(
    () => tableFilter.rows.length,
    [tableFilter?.rows.length]
  );
  const paginationStart = useMemo(
    () => pageIndex * pageSize + 1,
    [pageIndex, pageSize]
  );
  const paginationEnd = useMemo(
    () => Math.min(pageIndex * pageSize + pageSize, totalRows),
    [pageIndex, pageSize, totalRows]
  );
  const pageRangeLabel = useMemo(() => {
    if (totalRows === 0) return '0-0 (0)';
    const range = `${paginationStart.toLocaleString()}-${paginationEnd.toLocaleString()}`;
    // When the table only holds a window of a larger server dataset, say so
    // — "(400 of 970)" — instead of implying the loaded rows are everything.
    if (serverTotalRows && serverTotalRows > totalRows) {
      return `${range} (${totalRows.toLocaleString()} of ${serverTotalRows.toLocaleString()})`;
    }
    return `${range} (${totalRows.toLocaleString()})`;
  }, [paginationStart, paginationEnd, totalRows, serverTotalRows]);
  const totalPages = useMemo(
    () => Math.ceil(totalRows / pageSize),
    [totalRows, pageSize]
  );
  const pageInfoLabel = useMemo(
    () => `${pageIndex + 1}/${totalPages}`,
    [pageIndex, totalPages]
  );

  const isTableView = useMemo(
    () => viewMode === 'table' || !enableCardView,
    [viewMode, enableCardView]
  );

  const onClearSection = useCallback(() => {
    setRowSelection({});
    lastSelectedRowIdRef.current = null;
  }, [setRowSelection]);

  // Mark the entrance animation as "done" once the first set of rows has
  // painted. After that, rows that appear later (e.g. the merged deal after a
  // bulk merge, or a status-filter switch) snap into place instead of replaying
  // the staggered slide-in — which otherwise reads as flicker during the churn.
  const renderedRowCount = table.getRowModel().rows.length;
  useEffect(() => {
    if (renderedRowCount > 0) {
      hasAnimatedEntranceRef.current = true;
    }
  }, [renderedRowCount]);

  return (
    <div className={clsx('w-full h-full min-h-0 flex flex-col', className)}>
      <style>{`
        body.dragging-columns .widget-wrapper {
          pointer-events: none !important;
        }
        body.dragging-columns .data-table-container {
          pointer-events: auto !important;
        }

        /* macOS Chrome height fixes */
        @supports (-webkit-appearance: none) {
          .data-table-container {
            height: auto !important;
            min-height: 0 !important;
          }
        }


      `}</style>
      {/* Toolbar */}
      <div className="py-2 shrink-0">
        <div
          ref={toolbarRowRef}
          className="relative flex flex-nowrap items-center gap-3 justify-between py-2"
        >
          {/* Search bar - in collapsible mode the icon stays in flow and the
              full input renders as an absolute overlay on expand, so the
              underlying button row keeps its width and doesn't shift. */}
          {enableGlobalFilter &&
            (isSearchCollapsible ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => {
                  setSearchExpanded(true);
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }}
                title="Search"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </Button>
            ) : (
              <div className="relative shrink w-40 min-w-32 max-w-40 sm:w-auto sm:min-w-48 sm:max-w-xs md:max-w-sm lg:max-w-md">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search..."
                  value={globalFilter ?? ''}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="pl-8 pr-8 h-9 w-full text-sm"
                />
                {globalFilter && (
                  <button
                    type="button"
                    onClick={() => setGlobalFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-primary focus:outline-none"
                    title="Clear search"
                    tabIndex={0}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

          {/* Action buttons using ResponsiveButtonRow */}
          <ToolbarButtonRow
            enableColumnFilters={enableColumnFilters}
            enableColumnResizing={enableColumnResizing}
            enableColumnVisibility={enableColumnVisibility}
            enableExport={enableExport}
            enableCardView={enableCardView}
            enableQuickFilterBar={enableQuickFilterBar}
            viewMode={viewMode}
            setViewMode={setViewMode}
            showColumnFilters={showColumnFilters}
            setShowColumnFilters={setShowColumnFilters}
            showQuickFilters={showQuickFilters}
            onShowQuickFiltersChange={onShowQuickFiltersChange}
            columnFilters={columnFilters}
            setColumnFilters={setColumnFilters}
            quickFilters={quickFilters}
            autoResizeColumns={autoResizeColumns}
            handleExportToCsv={handleExportToCsv}
            handleExportToJson={handleExportToJson}
            table={table}
            firstToolbarActions={firstToolbarActions}
            firstToolbarActionsCompact={firstToolbarActionsCompact}
            firstToolbarActionsOverflow={firstToolbarActionsOverflow}
            customToolbarActions={customToolbarActions}
            customToolbarActionsCompact={customToolbarActionsCompact}
            customToolbarActionsOverflow={customToolbarActionsOverflow}
            finalToolbarActions={finalToolbarActions}
            finalToolbarActionsCompact={finalToolbarActionsCompact}
            finalToolbarActionsOverflow={finalToolbarActionsOverflow}
            bulkActions={bulkActions}
            selectedRows={selectedRows}
            onClearSelection={onClearSection}
            onResetTable={handleResetTable}
            onLayoutMetrics={handleToolbarMetrics}
          />

          {/* Expanded search overlay (collapsible mode). Sits on top of the
              toolbar row instead of squeezing the button row, so opening it
              doesn't reshuffle the buttons. */}
          {enableGlobalFilter && isSearchCollapsible && searchExpanded && (
            <div className="absolute inset-y-1 left-0 right-0 z-10 flex items-center gap-1 rounded-lg bg-background px-1 shadow-sm ring-1 ring-border/50">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search..."
                  value={globalFilter ?? ''}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  onBlur={() => {
                    if (!globalFilter) setSearchExpanded(false);
                  }}
                  className="pl-8 pr-8 h-9 w-full text-sm"
                />
                {globalFilter && (
                  <button
                    type="button"
                    onClick={() => setGlobalFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-primary focus:outline-none"
                    title="Clear search"
                    tabIndex={0}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => {
                  setGlobalFilter('');
                  setSearchExpanded(false);
                }}
                title="Close search"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Filters - rendered when showQuickFilters is true */}
      {quickFilters &&
        showQuickFilters &&
        onQuickFiltersChange &&
        onQuickFiltersClearAll && (
          <QuickFilters
            filters={quickFilters}
            activeFilters={quickFiltersState}
            onFilterChange={onQuickFiltersChange}
            onClearAll={onQuickFiltersClearAll}
            totalCount={data.length}
            filteredCount={tableFilter.rows.length}
          />
        )}

      {/* Quick Filter Bar - Generic filter chip bar that syncs with column filters */}
      {enableQuickFilterBar && showColumnFilters && (
        <QuickFilterBar
          table={table}
          columns={table.getAllColumns()}
          storageKey={quickFilterBarStorageKey}
          onResetFilters={() => {
            table.resetColumnFilters();
            onQuickFiltersClearAll?.();
          }}
        />
      )}

      {/* Content between toolbar and data */}
      {betweenToolbarAndContent}

      {/* Table or Card View */}
      {isTableView ? (
        <div
          className="relative overflow-hidden data-table-container"
          style={{
            // Prevent event bubbling to widget wrapper during column drag
            isolation: 'isolate',
          }}
        >
          {/* Left scroll indicator */}
          {canScrollLeft && (
            <div
              className="absolute left-0 top-0 bottom-0 z-30 w-6 bg-background/95 flex items-center justify-center cursor-pointer hover:bg-background transition-all duration-200 border-r border-border/30"
              onClick={scrollLeft}
              title="Scroll left"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
            </div>
          )}

          {/* Right scroll indicator */}
          {canScrollRight && (
            <div
              className="absolute right-0 top-0 bottom-0 z-30 w-6 bg-background/95 flex items-center justify-center cursor-pointer hover:bg-background transition-all duration-200 border-l border-border/30"
              onClick={scrollRight}
              title="Scroll right"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
            </div>
          )}

          <div
            ref={scrollContainerRef}
            className={clsx(
              'overflow-auto w-full h-full custom-scrollbar',
              // Sticky elements pin to the scrollport's PADDING edge, so
              // bottom padding here would float the sticky totals row 16px
              // above the container bottom with clipped rows showing in the
              // gap. Keep the breathing room only when there is no totals
              // row.
              hasTotalsFooter ? 'pb-0' : 'pb-4',
              canScrollLeft ? 'pl-6' : 'pl-0',
              canScrollRight ? 'pr-6' : 'pr-0'
            )}
            onMouseDown={(e) => {
              // Check if this is a drag handle interaction
              const target = e.target as HTMLElement;
              if (target.closest('[data-drag-handle="true"]')) {
                // Prevent event from reaching parent drag contexts
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
            onTouchStart={(e) => {
              // Check if this is a drag handle interaction
              const target = e.target as HTMLElement;
              if (target.closest('[data-drag-handle="true"]')) {
                // Prevent event from reaching parent drag contexts
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
              }
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToHorizontalAxis]}
            >
              <table
                className="w-full text-sm"
                style={{ tableLayout: 'fixed', width: '100%' }}
              >
                <thead className="bg-background border-separate sticky top-0 z-20">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b-2 border-border bg-background"
                    >
                      <SortableContext
                        items={headerGroup.headers.map((h) => h.column.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {headerGroup.headers.map((header) => {
                          const columnId = header.column.id;
                          const isSelectionColumn = columnId === '_selection';
                          const isPinnedLeft =
                            effectivePinnedColumns.left.includes(columnId);
                          const isPinnedRight =
                            effectivePinnedColumns.right.includes(columnId);
                          // Selection column is always "pinned" left (sticky)
                          const pinnedState = isSelectionColumn
                            ? 'left'
                            : isPinnedLeft
                              ? 'left'
                              : isPinnedRight
                                ? 'right'
                                : false;

                          // Selection column has fixed width and special handling
                          if (isSelectionColumn) {
                            return (
                              <th
                                key={header.id}
                                className="px-1 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center sticky left-0 z-10 bg-inner-container shadow-sm"
                                style={{
                                  width: '48px',
                                  minWidth: '48px',
                                  maxWidth: '48px',
                                }}
                              >
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext()
                                    )}
                              </th>
                            );
                          }

                          return (
                            <DraggableColumnHeader
                              key={header.id}
                              header={header}
                              isPinned={pinnedState}
                              onTogglePin={toggleColumnPin}
                              onAutoResize={autoResizeSingleColumn}
                              enableColumnFilters={enableColumnFilters}
                              onToggleFilters={handleToggleColumnFilters}
                              stickyPosition={calculateStickyPosition(
                                columnId,
                                pinnedState
                              )}
                              {...(enableColumnResizing && {
                                onResize: handleColumnResize,
                                columnWidth: getColumnWidth(columnId),
                                minColumnWidth: getColumnMinWidth(columnId),
                                maxColumnWidth: getColumnMaxWidth(columnId),
                                enableColumnResizing: true,
                              })}
                            >
                              <div className="flex items-center space-x-2 w-full">
                                <div
                                  className="flex-1 font-medium"
                                  data-header-content
                                >
                                  {header.isPlaceholder
                                    ? null
                                    : flexRender(
                                        header.column.columnDef.header,
                                        header.getContext()
                                      )}
                                </div>
                              </div>
                            </DraggableColumnHeader>
                          );
                        })}
                      </SortableContext>
                    </tr>
                  ))}
                  {/* Filter Row */}
                  {enableColumnFilters && showColumnFilters && (
                    // tr had  before, not sure why -> top-[57px]
                    <tr className="border-b sticky z-19">
                      {table.getHeaderGroups()[0]?.headers.map((header) => {
                        const columnId = header.column.id;
                        const isSelectionColumn = columnId === '_selection';
                        const isPinnedLeft =
                          effectivePinnedColumns.left.includes(columnId);
                        const isPinnedRight =
                          effectivePinnedColumns.right.includes(columnId);
                        const isPinned = isSelectionColumn
                          ? 'left'
                          : isPinnedLeft
                            ? 'left'
                            : isPinnedRight
                              ? 'right'
                              : false;

                        // Calculate sticky position for multiple pinned columns
                        const stickyPosition = isSelectionColumn
                          ? { left: 0 }
                          : calculateStickyPosition(columnId, isPinned);

                        // Selection column filter cell - empty but maintains layout
                        if (isSelectionColumn) {
                          return (
                            <th
                              key={`filter-${header.id}`}
                              className="px-1 h-11 bg-muted/30 sticky left-0 z-9 align-middle"
                              style={{
                                width: '48px',
                                minWidth: '48px',
                                maxWidth: '48px',
                              }}
                            />
                          );
                        }

                        return (
                          <th
                            key={`filter-${header.id}`}
                            className={clsx(
                              'p-0 h-11 overflow-hidden bg-muted/30 align-middle',
                              isPinned === 'left' &&
                                'bg-background border-r border-border',
                              isPinned === 'right' &&
                                'bg-background border-l border-border'
                            )}
                            style={{
                              position: isPinned ? 'sticky' : 'relative',
                              ...stickyPosition,
                              zIndex: isPinned ? 9 : 1,
                              width: `${getColumnWidth(columnId)}px`,
                              minWidth: `${getColumnMinWidth(columnId)}px`,
                              maxWidth: `${getColumnWidth(columnId)}px`, // Ensure max width matches width
                            }}
                          >
                            <div className="flex items-center h-full w-full px-1.5">
                              {header.column.getCanFilter() ? (
                                <ColumnFilter column={header.column} />
                              ) : null}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  )}

                  {/* Hot Button Filters Row */}
                  {enableColumnFilters &&
                    showColumnFilters &&
                    hotButtonFilters && (
                      <tr className="border-b bg-card sticky top-[114px] z-18">
                        <td
                          colSpan={
                            table.getHeaderGroups()[0]?.headers.length || 1
                          }
                          className="p-3 md:p-4 border-b"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <Filter className="w-4 h-4 text-primary" />
                              <span className="text-sm font-semibold text-foreground">
                                {hotButtonFilters.title}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-md">
                              {hotButtonFilters.filters.map((filter) => (
                                <div
                                  key={filter.columnId}
                                  className="flex items-center gap-2"
                                >
                                  <Label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                                    {filter.label}:
                                  </Label>
                                  <div className="flex flex-wrap gap-1">
                                    {filter.options.map((option) => {
                                      const column = table.getColumn(
                                        filter.columnId
                                      );
                                      const currentFilter =
                                        column?.getFilterValue() as
                                          | string
                                          | undefined;
                                      const isActive =
                                        currentFilter === option.value;

                                      return (
                                        <Badge
                                          key={option.value}
                                          variant={
                                            isActive ? 'default' : 'outline'
                                          }
                                          className={clsx(
                                            'cursor-pointer text-xs px-2 py-1 transition-all duration-200',
                                            isActive
                                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                              : 'hover:bg-muted border-muted-foreground/20 hover:border-muted-foreground/40'
                                          )}
                                          onClick={() => {
                                            if (isActive) {
                                              column?.setFilterValue(undefined);
                                            } else {
                                              column?.setFilterValue(
                                                option.value
                                              );
                                            }
                                          }}
                                        >
                                          {option.label}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Clear all hot filters button */}
                            {hotButtonFilters.filters.some((filter) => {
                              const column = table.getColumn(filter.columnId);
                              return column?.getFilterValue();
                            }) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  hotButtonFilters.filters.forEach((filter) => {
                                    const column = table.getColumn(
                                      filter.columnId
                                    );
                                    column?.setFilterValue(undefined);
                                  });
                                }}
                                className="self-start text-xs text-muted-foreground hover:text-foreground"
                              >
                                <X className="w-3 h-3 mr-1" />
                                Clear all filters
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                </thead>
                <tbody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row, rowIndex) => {
                      const isRowSelected =
                        getRowIsSelected?.(row.original) ?? row.getIsSelected();

                      return (
                        <motion.tr
                          key={row.id}
                          initial={
                            hasAnimatedEntranceRef.current
                              ? false
                              : { opacity: 0, x: -20 }
                          }
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.3,
                            delay: rowIndex * 0.03, // Very fast sequential timing
                            ease: 'easeOut',
                          }}
                          className={`border-b border-border/40 transition-all duration-200 ease-out hover:bg-muted/60 hover:border-border hover:shadow-sm data-[state=selected]:bg-primary/10 data-[state=selected]:border-primary/30 h-16 ${onRowClick && !row.getIsGrouped() ? 'cursor-pointer hover:scale-[1.002] hover:-translate-y-px' : ''}`}
                          onClick={(e) => {
                            // Don't trigger row click if clicking on selection checkbox
                            const target = e.target as HTMLElement;
                            if (
                              target.closest('[data-selection-cell]') ||
                              target.closest('input[type="checkbox"]') ||
                              target.closest('button[role="checkbox"]') ||
                              target.closest('button') ||
                              target.closest('a') ||
                              target.closest('[role="menu"]') ||
                              target.closest('[role="menuitem"]') ||
                              target.closest(
                                '[data-radix-dropdown-menu-trigger]'
                              ) ||
                              target.closest(
                                '[data-radix-dropdown-menu-content]'
                              )
                            ) {
                              return;
                            }
                            // Don't trigger row click for grouped rows
                            if (row.getIsGrouped()) {
                              return;
                            }
                            onRowClick?.(row.original);
                          }}
                          style={{
                            transformOrigin: 'center',
                          }}
                          data-state={isRowSelected ? 'selected' : undefined}
                          aria-selected={isRowSelected || undefined}
                        >
                          {row.getVisibleCells().map((cell) => {
                            const columnId = cell.column.id;
                            const isSelectionColumn = columnId === '_selection';
                            const isPinnedLeft =
                              effectivePinnedColumns.left.includes(columnId);
                            const isPinnedRight =
                              effectivePinnedColumns.right.includes(columnId);
                            const isPinned = isSelectionColumn
                              ? 'left'
                              : isPinnedLeft
                                ? 'left'
                                : isPinnedRight
                                  ? 'right'
                                  : false;

                            // Calculate sticky position for multiple pinned columns
                            const stickyPosition = isSelectionColumn
                              ? { left: 0 }
                              : calculateStickyPosition(columnId, isPinned);

                            // Selection column cell - special handling
                            if (isSelectionColumn) {
                              return (
                                <td
                                  key={cell.id}
                                  data-selection-cell="true"
                                  className="px-1 py-2 overflow-hidden sticky left-0 z-9 bg-background"
                                  style={{
                                    width: '48px',
                                    minWidth: '48px',
                                    maxWidth: '48px',
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )}
                                </td>
                              );
                            }

                            return (
                              <td
                                key={cell.id}
                                className={clsx(
                                  'px-3 py-2 overflow-hidden',
                                  isPinned === 'left' &&
                                    'bg-background border-r border-border',
                                  isPinned === 'right' &&
                                    'bg-background border-l border-border',
                                  // Styling for grouped rows
                                  cell.getIsGrouped() &&
                                    'bg-gradient-start/10 font-semibold',
                                  cell.getIsAggregated() &&
                                    'bg-orange-50 dark:bg-orange-900/20 font-medium',
                                  cell.getIsPlaceholder() &&
                                    'bg-red-50 dark:bg-red-900/20 opacity-50'
                                )}
                                style={{
                                  position: isPinned ? 'sticky' : 'relative',
                                  ...stickyPosition,
                                  zIndex: isPinned ? 9 : 1,
                                  width: `${getColumnWidth(columnId)}px`,
                                  minWidth: `${getColumnMinWidth(columnId)}px`,
                                  maxWidth: `${getColumnWidth(columnId)}px`,
                                }}
                              >
                                {cell.getIsGrouped() ? (
                                  // Grouped cell with expand/collapse functionality
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={row.getToggleExpandedHandler()}
                                      className="p-0"
                                      disabled={!row.getCanExpand()}
                                    >
                                      {row.getIsExpanded() ? (
                                        <Minus className="h-3 w-3" />
                                      ) : (
                                        <Plus className="h-3 w-3" />
                                      )}
                                    </Button>
                                    <span>
                                      {flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext()
                                      )}
                                    </span>
                                    <span className="text-muted-foreground text-xs">
                                      ({row.subRows.length})
                                    </span>
                                  </div>
                                ) : cell.getIsAggregated() ? (
                                  // Aggregated cell
                                  flexRender(
                                    cell.column.columnDef.aggregatedCell ??
                                      cell.column.columnDef.cell,
                                    cell.getContext()
                                  )
                                ) : cell.getIsPlaceholder() ? null : (
                                  // Regular cell
                                  flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )
                                )}
                              </td>
                            );
                          })}
                        </motion.tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="text-center text-muted-foreground"
                      >
                        {emptyContent ?? (
                          <div className="h-24 flex items-center justify-center">
                            {emptyMessage}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
                <DataTableFooter
                  tableId={tableId}
                  table={table}
                  pinnedColumns={effectivePinnedColumns}
                  getColumnWidth={getColumnWidth}
                  calculateStickyPosition={calculateStickyPosition}
                />
              </table>
            </DndContext>
          </div>
        </div>
      ) : (
        // Card View
        <div className="w-full h-full min-h-0 overflow-auto">
          {table.getRowModel().rows?.length ? (
            <MasonryLayout
              gap={cardViewGap}
              containerBreakpoints={cardViewBreakpoints}
            >
              {table.getRowModel().rows.map((row, index) => (
                <RowCard
                  key={row.id}
                  row={row}
                  index={index}
                  CardComponent={CardComponent}
                />
              ))}
            </MasonryLayout>
          ) : (
            <div className="flex items-center justify-center text-center text-muted-foreground">
              {emptyContent ?? (
                <div className="h-24 flex items-center justify-center">
                  {emptyMessage}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Pagination */}
      {showPagination && (
        <div className="flex justify-end pt-2 shrink-0">
          <div className="flex items-center space-x-2 text-sm">
            {/* Range: start-end (total) - positioned left of page size */}
            <div className="text-xs text-muted-foreground tabular-nums">
              {pageRangeLabel}
            </div>

            {/* Page size selector */}
            <div className="flex items-center space-x-1">
              <span className="text-muted-foreground text-xs hidden sm:inline">
                Rows:
              </span>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-8 w-[70px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {[5, 10, 25, 50, 100].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page info */}
            <div className="text-xs text-muted-foreground min-w-[30px] hidden sm:block">
              {pageInfoLabel}
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-card-foreground hover:bg-muted disabled:opacity-30"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                title="First page"
              >
                <ChevronsLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-card-foreground hover:bg-muted disabled:opacity-30"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                title="Previous page"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-card-foreground hover:bg-muted disabled:opacity-30"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                title="Next page"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-card-foreground hover:bg-muted disabled:opacity-30"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                title="Last page"
              >
                <ChevronsRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const DataTable = React.memo(
  DataTableComponent
) as typeof DataTableComponent;
