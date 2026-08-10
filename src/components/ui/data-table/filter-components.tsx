/**
 * Filter UI components for DataTable.
 *
 * Contains all filter input components (text, number, date, boolean, range,
 * multi-select), the operator definitions (FILTER_OPERATORS), and the
 * ColumnFilter component rendered under each column header.
 */

import { logger } from '@/lib/loggerInstance';
import type { Column } from '@tanstack/react-table';
import { ChevronDown, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { Badge } from '../badge';
import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { Input } from '../input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';

import type { FilterState } from './filter-logic';

// ---------------------------------------------------------------------------
// FilterOperator type
// ---------------------------------------------------------------------------

export type FilterOperator = {
  readonly id: string;
  readonly label: string;
  readonly displayLabel?: string;
  readonly type: 'string' | 'number' | 'date' | 'boolean' | 'select';
  readonly component: React.ComponentType<{
    value: unknown;
    onChange: (value: unknown) => void;
    placeholder?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    column?: Column<any, unknown>;
  }>;
};

// ---------------------------------------------------------------------------
// Input components
// ---------------------------------------------------------------------------

const TextFilterInput: React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <Input
    type="text"
    value={String(value ?? '')}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="h-8 text-xs w-full border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
  />
);

const NumberFilterInput: React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <Input
    type="number"
    value={String(value ?? '')}
    onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
    placeholder={placeholder}
    className="h-8 text-xs w-full border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
  />
);

const DateFilterInput: React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => (
  <Input
    type="date"
    value={String(value ?? '')}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="h-8 text-xs w-full pr-8 scheme-light dark:scheme-dark border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
  />
);

const BooleanFilterInput: React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ value, onChange }) => (
  <Select value={String(value ?? '')} onValueChange={onChange}>
    <SelectTrigger className="h-8 text-xs w-full border-0 bg-transparent rounded-none focus:ring-0 focus:ring-offset-0">
      <SelectValue placeholder="Is" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="true">True</SelectItem>
      <SelectItem value="false">False</SelectItem>
    </SelectContent>
  </Select>
);

const NumberRangeFilterInput: React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
}> = ({ value, onChange }) => {
  const [minValue, maxValue] = Array.isArray(value) ? value : ['', ''];

  const handleMinChange = (newMin: string) => {
    onChange([newMin ? Number(newMin) : '', maxValue]);
  };

  const handleMaxChange = (newMax: string) => {
    onChange([minValue, newMax ? Number(newMax) : '']);
  };

  return (
    <div className="flex gap-1 w-full min-w-0">
      <Input
        type="number"
        value={String(minValue ?? '')}
        onChange={(e) => handleMinChange(e.target.value)}
        placeholder="Min"
        className="h-8 text-xs flex-1 min-w-0 border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <Input
        type="number"
        value={String(maxValue ?? '')}
        onChange={(e) => handleMaxChange(e.target.value)}
        placeholder="Max"
        className="h-8 text-xs flex-1 min-w-0 border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
};

const DateRangeFilterInput: React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
}> = ({ value, onChange }) => {
  const [startDate, endDate] = Array.isArray(value) ? value : ['', ''];

  const handleStartDateChange = (newStartDate: string) => {
    onChange([newStartDate, endDate]);
  };

  const handleEndDateChange = (newEndDate: string) => {
    onChange([startDate, newEndDate]);
  };

  return (
    <div className="flex gap-1 w-full min-w-0">
      <Input
        type="date"
        value={String(startDate ?? '')}
        onChange={(e) => handleStartDateChange(e.target.value)}
        placeholder="From"
        className="h-8 text-xs flex-1 min-w-0 scheme-light dark:scheme-dark border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <Input
        type="date"
        value={String(endDate ?? '')}
        onChange={(e) => handleEndDateChange(e.target.value)}
        placeholder="To"
        className="h-8 text-xs flex-1 min-w-0 scheme-light dark:scheme-dark border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// MultiSelectFilterInput
// ---------------------------------------------------------------------------

const MultiSelectFilterInput: React.FC<{
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column?: Column<any, unknown>;
}> = ({ value, onChange, placeholder = 'Select values...', column }) => {
  const [inputValue, setInputValue] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const values = Array.isArray(value) ? value : value ? [value] : [];

  // Extract unique display-friendly values from column data
  const availableOptions = useMemo(() => {
    if (!column) return [];

    const uniqueValues = new Set<string>();

    // Helper to extract a plain string from an item (skip React elements)
    const toDisplayString = (item: unknown): string | null => {
      if (item === null || item === undefined || item === '') return null;
      if (typeof item === 'string') return item;
      if (typeof item === 'number' || typeof item === 'boolean')
        return String(item);
      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (obj['$$typeof'] || obj['_owner'] !== undefined) return null;
        const val =
          obj['name'] ||
          obj['label'] ||
          obj['symbol'] ||
          obj['title'] ||
          obj['displayName'];
        if (val && typeof val === 'string') return val;
      }
      return null;
    };

    try {
      const rows = column.getFacetedRowModel().rows;
      const colDef = column.columnDef;
      const meta = colDef.meta as Record<string, unknown> | undefined;

      // If meta.filterOptions is explicitly defined, use those
      if (meta?.['filterOptions'] && Array.isArray(meta['filterOptions'])) {
        (meta['filterOptions'] as unknown[]).forEach((opt: unknown) => {
          const v = toDisplayString(opt);
          if (v) uniqueValues.add(v);
        });
        return Array.from(uniqueValues)
          .filter(
            (v) =>
              v && v !== 'undefined' && v !== 'null' && v !== '[object Object]'
          )
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 100);
      }

      // Use meta.getFilterValue if available — same function used for filtering
      const getFilterValueFn = meta?.['getFilterValue'] as
        | ((original: unknown) => string | string[])
        | undefined;

      rows.forEach((row) => {
        try {
          const extracted: string[] = [];

          // 1. Use getFilterValue from meta (primary source)
          if (getFilterValueFn) {
            const result = getFilterValueFn(row.original);
            const vals = Array.isArray(result) ? result : [result];
            vals.forEach((v) => {
              if (v && typeof v === 'string') extracted.push(v);
            });
          }

          // 2. Try getGroupingValue if getFilterValue didn't yield results
          if (
            extracted.length === 0 &&
            typeof colDef.getGroupingValue === 'function'
          ) {
            try {
              const groupVal = (
                colDef.getGroupingValue as (row: unknown, id: string) => unknown
              )(row.original, column.id);
              const gv = toDisplayString(groupVal);
              if (gv) extracted.push(gv);
            } catch {
              // getGroupingValue failed
            }
          }

          // 3. Fallback to raw cell value
          if (extracted.length === 0) {
            const cellValue = row.getValue(column.id);
            if (Array.isArray(cellValue)) {
              cellValue.forEach((item) => {
                const dv = toDisplayString(item);
                if (dv) extracted.push(dv);
              });
            } else {
              const dv = toDisplayString(cellValue);
              if (dv) extracted.push(dv);
            }
          }

          extracted.forEach((v) => uniqueValues.add(v));
        } catch (error) {
          logger.debug(
            'MULTI_SELECT_FILTER: Error extracting option from row',
            { error }
          );
        }
      });
    } catch (error) {
      logger.debug('MULTI_SELECT_FILTER: Error accessing faceted row model', {
        error,
      });
      return [];
    }

    return Array.from(uniqueValues)
      .filter(
        (v) => v && v !== 'undefined' && v !== 'null' && v !== '[object Object]'
      )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 100);
  }, [column]);

  // Filter options based on input
  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return availableOptions;
    return availableOptions.filter((option) =>
      option.toLowerCase().includes(inputValue.toLowerCase())
    );
  }, [availableOptions, inputValue]);

  const addValue = (newValue: string) => {
    if (newValue.trim() && !values.includes(newValue.trim())) {
      onChange([...values, newValue.trim()]);
      setInputValue('');
      setDropdownOpen(false);
    }
  };

  const removeValue = (valueToRemove: string) => {
    const newValues = values.filter((v) => v !== valueToRemove);
    onChange(newValues.length > 0 ? newValues : undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (filteredOptions.length > 0 && inputValue.trim()) {
        const exactMatch = filteredOptions.find(
          (opt) => opt.toLowerCase() === inputValue.toLowerCase()
        );
        addValue(exactMatch || filteredOptions[0]);
      } else {
        addValue(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      removeValue(values[values.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownOpen(true);
    } else if (e.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  return (
    // Single row, never wrapping: this renders inside a fixed-height table
    // filter cell whose width is the column width, so wrapping would push the
    // chips out of the cell. Chips shrink and truncate instead.
    <div className="flex flex-nowrap items-center gap-1 h-8 w-full min-w-0 overflow-hidden">
      {/* Selected values */}
      {values.length > 0 &&
        values.map((val: string, index: number) => (
          <Badge
            key={index}
            variant="secondary"
            className="text-xs px-2 py-0 h-5 cursor-pointer hover:bg-destructive/20 min-w-0 shrink"
            onClick={() => removeValue(val)}
            title={`${val} — click to remove`}
          >
            <span className="truncate">{val}</span>
            <X className="h-3 w-3 shrink-0" />
          </Badge>
        ))}

      <Popover
        open={dropdownOpen && filteredOptions.length > 0}
        onOpenChange={setDropdownOpen}
      >
        <PopoverTrigger asChild>
          {/* Grows to fill the row when nothing is selected, but `shrink-0` +
              `min-w-8` pins it at chevron width once chips appear — so the
              chips absorb the shrinking and stay readable instead of the
              (empty) text field holding space they need. */}
          <div className="relative flex-1 min-w-6 shrink-0">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (e.target.value.trim() && !dropdownOpen) {
                  setDropdownOpen(true);
                }
              }}
              onKeyDown={handleKeyDown}
              onClick={() => {
                if (filteredOptions.length > 0) {
                  setDropdownOpen(true);
                }
              }}
              placeholder={values.length > 0 ? '' : placeholder}
              className="h-8 text-xs w-full pr-6 border-0 bg-transparent rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted-foreground/10"
            >
              <ChevronDown
                className={`h-3 w-3 text-muted-foreground transition-transform ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 max-h-48 overflow-y-auto w-(--radix-popover-trigger-width)"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="py-1">
            {filteredOptions.map((option, index) => (
              <div
                key={index}
                onClick={() => addValue(option)}
                className="px-2 py-1 text-xs hover:bg-muted cursor-pointer flex items-center justify-between"
              >
                <span>{option}</span>
                {values.includes(option) && (
                  <Badge variant="secondary" className="h-4 text-xs px-1">
                    ✓
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Filter Operators Configuration
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export const FILTER_OPERATORS = {
  string: [
    {
      id: 'contains',
      label: 'Contains',
      displayLabel: '⊃',
      type: 'string' as const,
      component: TextFilterInput,
    },
    {
      id: 'equals',
      label: 'Equals',
      displayLabel: '=',
      type: 'string' as const,
      component: TextFilterInput,
    },
    {
      id: 'startsWith',
      label: 'Starts with',
      displayLabel: '^',
      type: 'string' as const,
      component: TextFilterInput,
    },
    {
      id: 'endsWith',
      label: 'Ends with',
      displayLabel: '$',
      type: 'string' as const,
      component: TextFilterInput,
    },
    {
      id: 'notContains',
      label: 'Not contains',
      displayLabel: '⊅',
      type: 'string' as const,
      component: TextFilterInput,
    },
    {
      id: 'isEmpty',
      label: 'Is empty',
      displayLabel: 'Empty',
      type: 'string' as const,
      component: () => null,
    },
    {
      id: 'isNotEmpty',
      label: 'Is not empty',
      displayLabel: '¬Empty',
      type: 'string' as const,
      component: () => null,
    },
  ],
  number: [
    {
      id: 'equals',
      label: 'Equals',
      displayLabel: '=',
      type: 'number' as const,
      component: NumberFilterInput,
    },
    {
      id: 'greaterThan',
      label: 'Greater than',
      displayLabel: '>',
      type: 'number' as const,
      component: NumberFilterInput,
    },
    {
      id: 'lessThan',
      label: 'Less than',
      displayLabel: '<',
      type: 'number' as const,
      component: NumberFilterInput,
    },
    {
      id: 'greaterThanOrEqual',
      label: 'Greater than or equal',
      displayLabel: '≥',
      type: 'number' as const,
      component: NumberFilterInput,
    },
    {
      id: 'lessThanOrEqual',
      label: 'Less than or equal',
      displayLabel: '≤',
      type: 'number' as const,
      component: NumberFilterInput,
    },
    {
      id: 'between',
      label: 'Between',
      displayLabel: '↔',
      type: 'number' as const,
      component: NumberRangeFilterInput,
    },
    {
      id: 'isEmpty',
      label: 'Is empty',
      displayLabel: 'Empty',
      type: 'number' as const,
      component: () => null,
    },
    {
      id: 'isNotEmpty',
      label: 'Is not empty',
      displayLabel: '¬Empty',
      type: 'number' as const,
      component: () => null,
    },
  ],
  date: [
    {
      id: 'equals',
      label: 'Equals',
      displayLabel: '=',
      type: 'date' as const,
      component: DateFilterInput,
    },
    {
      id: 'after',
      label: 'After',
      displayLabel: '>',
      type: 'date' as const,
      component: DateFilterInput,
    },
    {
      id: 'before',
      label: 'Before',
      displayLabel: '<',
      type: 'date' as const,
      component: DateFilterInput,
    },
    {
      id: 'between',
      label: 'Between',
      displayLabel: '↔',
      type: 'date' as const,
      component: DateRangeFilterInput,
    },
    {
      id: 'onOrAfter',
      label: 'On or after',
      displayLabel: '≥',
      type: 'date' as const,
      component: DateFilterInput,
    },
    {
      id: 'onOrBefore',
      label: 'On or before',
      displayLabel: '≤',
      type: 'date' as const,
      component: DateFilterInput,
    },
    {
      id: 'isEmpty',
      label: 'Is empty',
      displayLabel: 'Empty',
      type: 'date' as const,
      component: () => null,
    },
    {
      id: 'isNotEmpty',
      label: 'Is not empty',
      displayLabel: '¬Empty',
      type: 'date' as const,
      component: () => null,
    },
  ],
  array: [
    {
      id: 'isAnyOf',
      label: 'Is any of',
      displayLabel: '∈',
      type: 'select' as const,
      component: (props: {
        value: unknown;
        onChange: (value: unknown) => void;
        placeholder?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        column?: Column<any, unknown>;
      }) => <MultiSelectFilterInput {...props} />,
    },
    {
      id: 'isNoneOf',
      label: 'Is none of',
      displayLabel: '∉',
      type: 'select' as const,
      component: (props: {
        value: unknown;
        onChange: (value: unknown) => void;
        placeholder?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        column?: Column<any, unknown>;
      }) => <MultiSelectFilterInput {...props} />,
    },
    {
      id: 'contains',
      label: 'Contains',
      displayLabel: '⊃',
      type: 'string' as const,
      component: TextFilterInput,
    },
    {
      id: 'equals',
      label: 'Equals',
      displayLabel: '=',
      type: 'string' as const,
      component: TextFilterInput,
    },
    {
      id: 'isEmpty',
      label: 'Is empty',
      displayLabel: 'Empty',
      type: 'string' as const,
      component: () => null,
    },
    {
      id: 'isNotEmpty',
      label: 'Is not empty',
      displayLabel: '¬Empty',
      type: 'string' as const,
      component: () => null,
    },
  ],
  boolean: [
    {
      id: 'equals',
      label: 'Is',
      displayLabel: '=',
      type: 'boolean' as const,
      component: BooleanFilterInput,
    },
  ],
};

// ---------------------------------------------------------------------------
// ColumnFilter component (rendered under each column header)
// ---------------------------------------------------------------------------

export const ColumnFilter: React.FC<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  column: Column<any, unknown>;
}> = ({ column }) => {
  const fieldType =
    (column.columnDef.meta as Record<string, unknown>)?.['filterType'] ??
    'string';
  const operators =
    FILTER_OPERATORS[fieldType as keyof typeof FILTER_OPERATORS] ||
    FILTER_OPERATORS['string'];

  const columnFilterValue = column.getFilterValue() as
    | FilterState
    | FilterState[]
    | string
    | undefined;

  const hasMultipleFilters =
    Array.isArray(columnFilterValue) && columnFilterValue.length > 1;

  const currentFilter: FilterState = useMemo(() => {
    if (Array.isArray(columnFilterValue)) {
      if (columnFilterValue.length === 1) {
        const singleFilter = columnFilterValue[0];
        if (typeof singleFilter === 'object' && singleFilter !== null) {
          return singleFilter as FilterState;
        }
      }
      return { operator: operators[0]?.id || 'contains', value: '' };
    }
    if (typeof columnFilterValue === 'string') {
      return { operator: 'contains', value: columnFilterValue };
    }
    return (
      columnFilterValue || {
        operator: operators[0]?.id || 'contains',
        value: '',
      }
    );
  }, [columnFilterValue, operators]);

  const hasFilter =
    currentFilter.value !== undefined &&
    currentFilter.value !== null &&
    currentFilter.value !== '';

  const handleOperatorChange = (newOperator: string) => {
    const newFilter = { ...currentFilter, operator: newOperator };
    if (['isEmpty', 'isNotEmpty'].includes(newOperator)) {
      newFilter.value = 'true';
    }
    column.setFilterValue(newFilter);
  };

  const handleValueChange = (newValue: unknown) => {
    if (newValue === '' || newValue === null || newValue === undefined) {
      column.setFilterValue(undefined);
      return;
    }

    const newFilter = { ...currentFilter, value: newValue };
    if (Array.isArray(columnFilterValue) && columnFilterValue.length === 1) {
      column.setFilterValue([newFilter]);
    } else {
      column.setFilterValue(newFilter);
    }
  };

  const clearFilter = () => {
    column.setFilterValue(undefined);
  };

  const selectedOperator: FilterOperator | null =
    operators.find((op: FilterOperator) => op.id === currentFilter.operator) ||
    operators[0] ||
    null;
  const FilterComponent = selectedOperator?.component;

  const needsInput = !['isEmpty', 'isNotEmpty'].includes(
    currentFilter.operator
  );

  const hasActiveFilter = needsInput
    ? hasFilter
    : ['isEmpty', 'isNotEmpty'].includes(currentFilter.operator);

  if (hasMultipleFilters) {
    return (
      <div className="flex items-center space-x-1">
        <div className="h-8 px-3 py-2 text-xs bg-muted/30 border border-input rounded-md flex items-center justify-center flex-1 min-w-0">
          <span className="text-muted-foreground text-xs">
            Multiple filters active
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-1 w-full">
      {/* Filter input with operator as start adornment */}
      {FilterComponent && needsInput && (
        <div className="relative flex-1 min-w-0 flex bg-input/50 border border-input rounded-lg overflow-hidden">
          {/* Operator selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-1.5 py-1 rounded-none border-0 bg-muted/60 hover:bg-muted/80 min-w-fit whitespace-nowrap shrink-0"
                title={`Change filter operator${
                  selectedOperator ? ` (${selectedOperator.label})` : ''
                }`}
              >
                {selectedOperator
                  ? selectedOperator.displayLabel || selectedOperator.label
                  : 'Filter'}
                <ChevronDown className="h-3 w-3 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {operators.map((operator: FilterOperator) => (
                <DropdownMenuCheckboxItem
                  key={operator.id}
                  checked={currentFilter.operator === operator.id}
                  onCheckedChange={() => handleOperatorChange(operator.id)}
                  className="text-xs"
                >
                  {operator.label}
                  {operator.displayLabel &&
                    operator.displayLabel !== operator.label && (
                      <span className="ml-1 text-muted-foreground">
                        ({operator.displayLabel})
                      </span>
                    )}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Separator */}
          <div className="w-px bg-border my-1 shrink-0"></div>

          {/* Filter input. min-w-0 is what lets it shrink below its intrinsic
              width — without it the input overflows the bordered container in
              any column narrower than its content. */}
          <div className="flex-1 min-w-0">
            <FilterComponent
              value={currentFilter.value}
              onChange={handleValueChange}
              placeholder={selectedOperator?.label || 'Filter...'}
              column={column}
            />
          </div>
        </div>
      )}

      {/* No-input operators (isEmpty, isNotEmpty) */}
      {!needsInput && (
        <div className="relative flex-1 min-w-0">
          <div className="h-8 px-3 py-2 text-xs bg-muted/50 border border-input rounded-md flex items-center justify-between">
            <span className="text-muted-foreground">
              {selectedOperator?.label}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-muted-foreground/10"
                  title="Change filter operator"
                >
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {operators.map((operator: FilterOperator) => (
                  <DropdownMenuCheckboxItem
                    key={operator.id}
                    checked={currentFilter.operator === operator.id}
                    onCheckedChange={() => handleOperatorChange(operator.id)}
                    className="text-xs"
                  >
                    {operator.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Clear filter button */}
      {hasActiveFilter && (
        <Button
          variant="ghost"
          onClick={clearFilter}
          className="h-8 w-6 p-0 shrink-0"
          title="Clear filter"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};
