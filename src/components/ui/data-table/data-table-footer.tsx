import { flexRender, type Table } from '@tanstack/react-table';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import React from 'react';
import { useTableCustomState } from '../../../stores/tablePreferencesStore';
import { Badge } from '../badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu';

interface DataTableFooterProps<TData> {
  /** Table id used to persist the per-column totals aggregation choice. */
  tableId: string;
  table: Table<TData>;
  pinnedColumns: {
    left: string[];
    right: string[];
  };
  getColumnWidth: (columnId: string) => number;
  calculateStickyPosition: (
    columnId: string,
    pinnedState: 'left' | 'right' | false
  ) => React.CSSProperties;
}

type AggregationType = 'sum' | 'average' | 'min' | 'max' | 'count';

type ColumnTotalsMeta<TData> = {
  enableTotalsRow?: boolean;
  totalsDefaultAggregation?: AggregationType;
  /**
   * Optional override to compute totals from a different value than the column accessor.
   * Useful when the cell shows one value (e.g., token amount) but totals should sum another (e.g., USD).
   */
  totalsValueFn?: (row: TData) => number;
};

export function DataTableFooter<TData>({
  tableId,
  table,
  pinnedColumns,
  getColumnWidth,
  calculateStickyPosition,
}: DataTableFooterProps<TData>) {
  // Track aggregation type per column, persisted per-table in local storage so
  // the selection (total, average, min, max) survives remounts and sessions.
  const [columnAggregations, setColumnAggregations] = useTableCustomState<
    Record<string, AggregationType>
  >(tableId, 'totalsAggregations', {});

  const setAggregation = (columnId: string, type: AggregationType) =>
    setColumnAggregations({ ...columnAggregations, [columnId]: type });

  // Check if any column has a footer defined
  const hasFooters = table.getFooterGroups().some((footerGroup) =>
    footerGroup.headers.some((header) => {
      const columnMeta =
        (header.column.columnDef.meta as ColumnTotalsMeta<TData> | undefined) ??
        {};
      return Boolean(columnMeta.enableTotalsRow);
    })
  );

  // Don't render footer if no columns have footers defined
  if (!hasFooters) return null;

  const getAggregationLabel = (type: AggregationType): string => {
    switch (type) {
      case 'sum':
        return 'Total';
      case 'average':
        return 'Average';
      case 'min':
        return 'Min';
      case 'max':
        return 'Max';
      case 'count':
        return 'Count';
      default:
        return 'Total';
    }
  };

  const calculateAggregation = (
    columnId: string,
    type: AggregationType,
    columnMeta: ColumnTotalsMeta<TData>
  ): number => {
    const rows = table.getFilteredRowModel().rows;
    const values = rows
      .map((row) => {
        if (typeof columnMeta.totalsValueFn === 'function') {
          const v = columnMeta.totalsValueFn(row.original);
          return typeof v === 'number' ? v : NaN;
        }

        const v = row.getValue(columnId);
        return typeof v === 'number' ? v : NaN;
      })
      .filter((value) => Number.isFinite(value)) as number[];

    if (values.length === 0) return 0;

    switch (type) {
      case 'sum':
        return values.reduce((sum, value) => sum + value, 0);
      case 'average':
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
      default:
        return values.reduce((sum, value) => sum + value, 0);
    }
  };

  return (
    <tfoot className="bg-background border-t-2 border-border sticky bottom-0 z-20">
      {table.getFooterGroups().map((footerGroup) => (
        <tr key={footerGroup.id} className="border-t border-border">
          {footerGroup.headers.map((header) => {
            const columnId = header.column.id;
            const isPinnedLeft = pinnedColumns.left.includes(columnId);
            const isPinnedRight = pinnedColumns.right.includes(columnId);
            const isPinned = isPinnedLeft
              ? 'left'
              : isPinnedRight
                ? 'right'
                : false;

            // Calculate sticky position for pinned columns
            const stickyPosition = calculateStickyPosition(columnId, isPinned);

            // Get the column definition meta to check for totals support
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const columnDef = header.column.columnDef as any;
            const columnMeta =
              (columnDef.meta as ColumnTotalsMeta<TData> | undefined) ?? {};
            const hasAggregation = Boolean(columnMeta.enableTotalsRow);

            // Determine default aggregation type
            const defaultAggregation =
              columnMeta.totalsDefaultAggregation ??
              (columnDef.aggregationFn === 'mean' ? 'average' : 'sum');

            // Get current aggregation type or default
            const currentAggregation =
              columnAggregations[columnId] ?? defaultAggregation;

            return (
              <th
                key={header.id}
                className={clsx(
                  'px-3 py-3 text-xs font-semibold text-foreground text-left overflow-hidden',
                  isPinned === 'left' && 'bg-background border-r border-border',
                  isPinned === 'right' &&
                    'bg-background border-l border-border',
                  !isPinned && 'bg-background'
                )}
                style={{
                  position: isPinned ? 'sticky' : 'relative',
                  ...stickyPosition,
                  zIndex: isPinned ? 10 : 1,
                  width: `${getColumnWidth(columnId)}px`,
                  minWidth: '80px',
                  maxWidth: `${getColumnWidth(columnId)}px`,
                }}
              >
                {header.isPlaceholder ? null : hasAggregation ? (
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Badge
                          variant="secondary"
                          className="text-xs px-2 py-0.5 h-5 cursor-pointer hover:bg-secondary/80 transition-colors flex items-center gap-1"
                        >
                          {getAggregationLabel(currentAggregation)}
                          <ChevronDown className="h-3 w-3" />
                        </Badge>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => setAggregation(columnId, 'sum')}
                        >
                          Total (Sum)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setAggregation(columnId, 'average')}
                        >
                          Average
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setAggregation(columnId, 'min')}
                        >
                          Minimum
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setAggregation(columnId, 'max')}
                        >
                          Maximum
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span>
                      {flexRender(() => {
                        const value = calculateAggregation(
                          columnId,
                          currentAggregation,
                          columnMeta
                        );
                        // Use the column's cell formatting if available
                        return columnDef.footerValue
                          ? columnDef.footerValue(value)
                          : value.toFixed(2);
                      }, header.getContext())}
                    </span>
                  </div>
                ) : null}
              </th>
            );
          })}
        </tr>
      ))}
    </tfoot>
  );
}
