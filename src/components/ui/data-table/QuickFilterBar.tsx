// QuickFilterBar - Generic filter bar component for data tables
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logger } from '@/lib/loggerInstance';
import type { Column, Table } from '@tanstack/react-table';
import {
  ChevronDown,
  Edit2,
  Filter,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterChip } from '../../../reports/components/FilterChip';
import {
  QuickFilterConfigDialog,
  type QuickFilterConfig,
} from './QuickFilterConfigDialog';
import { SaveFilterDialog } from './SaveFilterDialog';
import { FILTER_OPERATORS } from './filter-components';

const logPrefix = 'QUICK_FILTER_BAR';

// Maximum number of filter chips to display before showing "+X more"
const MAX_VISIBLE_FILTERS = 5;
const NO_VALUE_OPERATORS = ['isEmpty', 'isNotEmpty'];
const OPERATOR_DISPLAY_MAP: Record<string, string> = Object.values(
  FILTER_OPERATORS
)
  .flat()
  .reduce<Record<string, string>>((acc, operator) => {
    acc[operator.id] = operator.displayLabel || operator.label;
    return acc;
  }, {});

interface SavedFilter {
  id: string;
  name: string;
  filters: QuickFilterConfig[];
}

export interface QuickFilterBarProps<TData> {
  table: Table<TData>;
  columns: Column<TData, unknown>[];
  onResetFilters?: () => void;
  storageKey?: string; // Key for localStorage to save filters
}

export function QuickFilterBar<TData>({
  table,
  columns,
  onResetFilters,
  storageKey = 'quick-filters',
}: QuickFilterBarProps<TData>) {
  // Read column filters state to trigger reactivity when filters change
  const columnFiltersState = table.getState().columnFilters;
  const [editingFilter, setEditingFilter] = useState<QuickFilterConfig | null>(
    null
  );
  // Track the original filter value when editing (to replace instead of add)
  const [originalFilterValue, setOriginalFilterValue] = useState<unknown>(null);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [editingSavedFilter, setEditingSavedFilter] =
    useState<SavedFilter | null>(null);

  // Load saved filters from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${storageKey}-saved`);
      if (saved) {
        setSavedFilters(JSON.parse(saved));
      }
    } catch (error) {
      logger.error(`${logPrefix}: Failed to load saved filters`, { error });
    }
  }, [storageKey]);

  // Save filters to localStorage
  const saveSavedFilters = useCallback(
    (filters: SavedFilter[]) => {
      try {
        localStorage.setItem(`${storageKey}-saved`, JSON.stringify(filters));
        setSavedFilters(filters);
      } catch (error) {
        logger.error(`${logPrefix}: Failed to save filters`, { error });
      }
    },
    [storageKey]
  );

  // Get all filterable columns
  const filterableColumns = useMemo(() => {
    return columns.filter((col) => col.getCanFilter());
  }, [columns]);

  // Get active filters from table state - supporting multiple filters per column
  const activeFilters = useMemo(() => {
    const filters: QuickFilterConfig[] = [];

    filterableColumns.forEach((column) => {
      const filterValue = column.getFilterValue();

      // Check if filter is an array (multiple conditions for same column)
      if (Array.isArray(filterValue)) {
        filterValue.forEach((singleValue) => {
          if (
            singleValue !== undefined &&
            singleValue !== null &&
            singleValue !== ''
          ) {
            // Check if value is an object with operator/value structure
            let hasValue = false;
            if (
              typeof singleValue === 'object' &&
              !Array.isArray(singleValue)
            ) {
              const filterObj = singleValue as {
                operator?: string;
                value?: unknown;
              };
              // Enhanced check for array filter values
              if (Array.isArray(filterObj.value)) {
                hasValue = filterObj.value.length > 0;
              } else {
                hasValue =
                  filterObj.value !== undefined &&
                  filterObj.value !== null &&
                  filterObj.value !== '';
              }
              // Special handling for operators that don't need values
              if (NO_VALUE_OPERATORS.includes(filterObj.operator || '')) {
                hasValue = true;
              }
            } else {
              hasValue = true;
            }

            if (hasValue) {
              const columnDef = column.columnDef;
              const header =
                typeof columnDef.header === 'string'
                  ? columnDef.header
                  : column.id;

              filters.push({
                columnId: column.id,
                label: header,
                value: singleValue,
              });
            }
          }
        });
      } else {
        // Single filter for column (legacy format)
        let hasValue = false;
        if (
          filterValue !== undefined &&
          filterValue !== null &&
          filterValue !== ''
        ) {
          if (typeof filterValue === 'object' && !Array.isArray(filterValue)) {
            const filterObj = filterValue as {
              operator?: string;
              value?: unknown;
            };
            // Enhanced check for array filter values
            if (Array.isArray(filterObj.value)) {
              hasValue = filterObj.value.length > 0;
            } else {
              hasValue =
                filterObj.value !== undefined &&
                filterObj.value !== null &&
                filterObj.value !== '';
            }
            // Special handling for operators that don't need values
            if (NO_VALUE_OPERATORS.includes(filterObj.operator || '')) {
              hasValue = true;
            }
          } else {
            hasValue = true;
          }
        }

        if (hasValue) {
          const columnDef = column.columnDef;
          const header =
            typeof columnDef.header === 'string' ? columnDef.header : column.id;

          filters.push({
            columnId: column.id,
            label: header,
            value: filterValue,
          });
        }
      }
    });

    return filters;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterableColumns, columnFiltersState]);

  const handleAddFilter = useCallback((column: Column<TData, unknown>) => {
    const columnDef = column.columnDef;
    const header =
      typeof columnDef.header === 'string' ? columnDef.header : column.id;

    const newFilter: QuickFilterConfig = {
      columnId: column.id,
      label: header,
      value: '',
    };

    setEditingFilter(newFilter);
    setOriginalFilterValue(null);
    setIsEditingExisting(false);
    setShowConfigDialog(true);
    logger.info(`${logPrefix}: Adding filter`, { columnId: column.id, header });
  }, []);

  const handleEditFilter = useCallback((filter: QuickFilterConfig) => {
    setEditingFilter(filter);
    setOriginalFilterValue(filter.value);
    setIsEditingExisting(true);
    setShowConfigDialog(true);
    logger.info(`${logPrefix}: Editing filter`, { filter });
  }, []);

  const handleRemoveFilter = useCallback(
    (filter: QuickFilterConfig) => {
      const column = table.getColumn(filter.columnId);
      if (column) {
        const currentValue = column.getFilterValue();

        // If current value is an array, remove just this filter
        if (Array.isArray(currentValue)) {
          const newFilters = currentValue.filter((v) => v !== filter.value);
          column.setFilterValue(newFilters.length > 0 ? newFilters : undefined);
        } else {
          // Single filter, remove completely
          column.setFilterValue(undefined);
        }

        logger.info(`${logPrefix}: Removed filter`, { filter });
      }
    },
    [table]
  );

  const handleSaveFilter = useCallback(
    (filter: QuickFilterConfig) => {
      const column = table.getColumn(filter.columnId);
      if (column) {
        const currentValue = column.getFilterValue();

        // If filter value is undefined, remove it
        if (filter.value === undefined) {
          // Remove the filter
          if (Array.isArray(currentValue)) {
            const newFilters = currentValue.filter((v) => {
              // Compare the actual filter values using originalFilterValue if editing
              const compareValue = isEditingExisting
                ? originalFilterValue
                : filter.value;
              if (typeof v === 'object' && typeof compareValue === 'object') {
                return JSON.stringify(v) !== JSON.stringify(compareValue);
              }
              return v !== compareValue;
            });
            column.setFilterValue(
              newFilters.length > 0 ? newFilters : undefined
            );
          } else {
            column.setFilterValue(undefined);
          }
          // Reset editing state
          setOriginalFilterValue(null);
          setIsEditingExisting(false);
          return;
        }

        // If editing existing filter, replace it instead of adding
        if (isEditingExisting && originalFilterValue !== null) {
          if (Array.isArray(currentValue)) {
            // Find and replace the original filter
            const newFilters = currentValue.map((v) => {
              if (
                typeof v === 'object' &&
                typeof originalFilterValue === 'object'
              ) {
                if (JSON.stringify(v) === JSON.stringify(originalFilterValue)) {
                  return filter.value;
                }
              } else if (v === originalFilterValue) {
                return filter.value;
              }
              return v;
            });
            column.setFilterValue(newFilters);
          } else {
            // Single filter case
            column.setFilterValue([filter.value]);
          }
          logger.info(`${logPrefix}: Updated existing filter`, {
            filter,
            originalFilterValue,
          });
        } else {
          // Add new filter to array
          if (Array.isArray(currentValue)) {
            // Check if this exact filter already exists
            const exists = currentValue.some((v) => {
              if (typeof v === 'object' && typeof filter.value === 'object') {
                return JSON.stringify(v) === JSON.stringify(filter.value);
              }
              return v === filter.value;
            });

            if (!exists) {
              column.setFilterValue([...currentValue, filter.value]);
            }
          } else if (currentValue !== undefined) {
            // Convert single filter to array
            column.setFilterValue([currentValue, filter.value]);
          } else {
            // First filter for this column - store as array for consistency
            column.setFilterValue([filter.value]);
          }
          logger.info(`${logPrefix}: Saved new filter`, { filter });
        }

        // Reset editing state
        setOriginalFilterValue(null);
        setIsEditingExisting(false);
      }
    },
    [table, isEditingExisting, originalFilterValue]
  );

  const handleResetFilters = () => {
    table.resetColumnFilters();
    setShowAllFilters(false);
    onResetFilters?.();
    logger.info(`${logPrefix}: Filters reset`);
  };

  const handleSaveCurrentFilters = () => {
    if (activeFilters.length === 0) return;
    setShowSaveDialog(true);
  };

  const handleConfirmSaveFilter = (name: string) => {
    const newSavedFilter: SavedFilter = {
      id: `filter-${Date.now()}`,
      name,
      filters: activeFilters,
    };

    saveSavedFilters([...savedFilters, newSavedFilter]);
    logger.info(`${logPrefix}: Filters saved`, {
      name,
      filters: activeFilters,
    });
  };

  const handleApplySavedFilter = (savedFilter: SavedFilter) => {
    // Clear existing filters
    table.resetColumnFilters();

    // Apply saved filters
    savedFilter.filters.forEach((filter) => {
      const column = table.getColumn(filter.columnId);
      if (column) {
        column.setFilterValue(filter.value);
      }
    });

    logger.info(`${logPrefix}: Applied saved filter`, {
      name: savedFilter.name,
    });
  };

  const handleDeleteSavedFilter = (filterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedFilters.filter((f) => f.id !== filterId);
    saveSavedFilters(updated);
    logger.info(`${logPrefix}: Deleted saved filter`, { filterId });
  };

  const handleEditSavedFilter = (filter: SavedFilter, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSavedFilter(filter);
    setShowSaveDialog(true);
  };

  const handleConfirmEditSavedFilter = (newName: string) => {
    if (!editingSavedFilter) return;

    const updated = savedFilters.map((f) =>
      f.id === editingSavedFilter.id ? { ...f, name: newName } : f
    );
    saveSavedFilters(updated);
    logger.info(`${logPrefix}: Renamed saved filter`, {
      filterId: editingSavedFilter.id,
      newName,
    });
    setEditingSavedFilter(null);
  };

  const getFilterDisplayValue = (filter: QuickFilterConfig): string => {
    if (filter.value === undefined || filter.value === null) {
      return '';
    }

    // Handle object with operator/value structure
    if (typeof filter.value === 'object' && !Array.isArray(filter.value)) {
      const filterObj = filter.value as { operator?: string; value?: unknown };
      if (filterObj.operator) {
        const symbol =
          OPERATOR_DISPLAY_MAP[filterObj.operator] || filterObj.operator;

        // Operators that don't need a value display
        if (NO_VALUE_OPERATORS.includes(filterObj.operator)) {
          return symbol;
        }

        // Format the value part
        let valueDisplay = '';
        if (Array.isArray(filterObj.value)) {
          valueDisplay =
            filterObj.value.slice(0, 2).join(', ') +
            (filterObj.value.length > 2
              ? ` +${filterObj.value.length - 2}`
              : '');
        } else if (filterObj.value !== undefined && filterObj.value !== null) {
          valueDisplay = String(filterObj.value);
        }

        return valueDisplay ? `${symbol} ${valueDisplay}` : symbol;
      }
      return JSON.stringify(filter.value);
    }

    if (Array.isArray(filter.value)) {
      return (
        filter.value.slice(0, 2).join(', ') +
        (filter.value.length > 2 ? ` +${filter.value.length - 2}` : '')
      );
    }

    return String(filter.value);
  };

  const visibleFilters = showAllFilters
    ? activeFilters
    : activeFilters.slice(0, MAX_VISIBLE_FILTERS);
  const hiddenFiltersCount = activeFilters.length - MAX_VISIBLE_FILTERS;

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <>
      {/* Sits on the same inner-fill surface as the cards/rows it filters, so it
          reads as part of the list rather than as a separate chrome strip.
          Bottom-only margin: the toolbar above already ends with its own
          padding, so a symmetric margin here would read as a bigger gap above
          than below. The value comes from the spacing scale (comfortable /
          compact) rather than a fixed px — the single-side `mb-*` token classes
          don't exist in this codebase, only `m-*`/`mx-*`/`my-*`. */}
      <div
        className="bg-muted rounded-lg shrink-0"
        style={{ marginBottom: 'var(--spacing-xs)' }}
      >
        <div className="flex items-center gap-2 px-md py-sm flex-wrap">
          {/* Add Filter Button with Badge */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 relative">
                <Filter className="h-4 w-4 mr-1" />
                Filter
                <ChevronDown className="h-4 w-4 ml-1" />
                {hasActiveFilters && (
                  <Badge
                    variant="default"
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                  >
                    {activeFilters.length}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-60 max-h-[400px] overflow-y-auto"
            >
              <DropdownMenuLabel>Add Filter</DropdownMenuLabel>
              {filterableColumns.map((column) => {
                const columnDef = column.columnDef;
                const header =
                  typeof columnDef.header === 'string'
                    ? columnDef.header
                    : column.id;
                const activeFiltersForColumn = activeFilters.filter(
                  (f) => f.columnId === column.id
                ).length;

                return (
                  <DropdownMenuItem
                    key={column.id}
                    onClick={() => handleAddFilter(column)}
                  >
                    {header}
                    {activeFiltersForColumn > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {activeFiltersForColumn}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                );
              })}

              {/* Saved Filters Section */}
              {savedFilters.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Saved Filters</DropdownMenuLabel>
                  {savedFilters.map((savedFilter) => (
                    <DropdownMenuItem
                      key={savedFilter.id}
                      onClick={() => handleApplySavedFilter(savedFilter)}
                      className="flex items-center justify-between group"
                    >
                      <span className="flex-1">{savedFilter.name}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => handleEditSavedFilter(savedFilter, e)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={(e) =>
                            handleDeleteSavedFilter(savedFilter.id, e)
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Save Current Filters */}
              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSaveCurrentFilters}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Current Filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Active Filter Chips */}
          {visibleFilters.map((filter, index) => (
            <FilterChip
              key={`${filter.columnId}-${index}`}
              label={filter.label}
              value={getFilterDisplayValue(filter)}
              onEdit={() => handleEditFilter(filter)}
              onRemove={() => handleRemoveFilter(filter)}
            />
          ))}

          {/* +X More Chip */}
          {hiddenFiltersCount > 0 && !showAllFilters && (
            <Badge
              variant="secondary"
              className="h-7 px-2 cursor-pointer hover:bg-secondary/80 transition-colors"
              onClick={() => setShowAllFilters(true)}
            >
              <span className="text-xs">+{hiddenFiltersCount} more</span>
            </Badge>
          )}

          {/* Show Less Button */}
          {showAllFilters && hiddenFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowAllFilters(false)}
            >
              Show less
            </Button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Reset Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-8 w-8 p-0 shrink-0"
              title="Reset filters"
              aria-label="Reset filters"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Save Filter Dialog */}
      <SaveFilterDialog
        open={showSaveDialog}
        onOpenChange={(open) => {
          setShowSaveDialog(open);
          if (!open) {
            setEditingSavedFilter(null);
          }
        }}
        onSave={(name) => {
          if (editingSavedFilter) {
            handleConfirmEditSavedFilter(name);
          } else {
            handleConfirmSaveFilter(name);
          }
        }}
        defaultName={editingSavedFilter?.name || ''}
      />

      {/* Filter Configuration Dialog */}
      <QuickFilterConfigDialog
        open={showConfigDialog}
        onOpenChange={setShowConfigDialog}
        filter={editingFilter}
        table={table}
        onSave={handleSaveFilter}
      />
    </>
  );
}
