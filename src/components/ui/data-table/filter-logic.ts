/**
 * Centralized filter logic for DataTable.
 *
 * All operator matching (contains, equals, isAnyOf, isNoneOf, between, etc.)
 * lives here. Columns can declare `meta.getFilterValue` to provide the
 * searchable string(s) from row.original — the operator logic is handled
 * entirely by this module.
 *
 * This eliminates the need for custom `filterFn` on individual column
 * definitions in page files (TradingBots, ComboBots, GridBots, etc.).
 */

import type { ColumnFiltersState } from '@tanstack/react-table';

import { getTzDayBounds } from '@/utils/timeUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Filter state stored per-column in the table's columnFilters array. */
export interface FilterState {
  operator: string;
  value: unknown;
}

/** Type guard for FilterState. */
export const isFilterState = (value: unknown): value is FilterState => {
  return typeof value === 'object' && value !== null && 'operator' in value;
};

// ---------------------------------------------------------------------------
// Multi-field string helpers
// ---------------------------------------------------------------------------

function includesAny(strings: string[], search: string): boolean {
  const s = search.toLowerCase();
  return strings.some((v) => v.toLowerCase().includes(s));
}

function startsWithAny(strings: string[], search: string): boolean {
  const s = search.toLowerCase();
  return strings.some((v) => v.toLowerCase().startsWith(s));
}

function endsWithAny(strings: string[], search: string): boolean {
  const s = search.toLowerCase();
  return strings.some((v) => v.toLowerCase().endsWith(s));
}

function equalsAny(strings: string[], search: string): boolean {
  const s = search.toLowerCase();
  return strings.some((v) => v.toLowerCase() === s);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** What `<input type="date">` emits — a calendar day, never an instant. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The interval a date filter value denotes.
 *
 * Every date operator's input is an `<input type="date">`, so its value is a
 * DAY (`YYYY-MM-DD`) while the cell it is compared against holds a full
 * timestamp. Comparing the two as instants is what makes `=` match nothing:
 * no row's `closeTime` is exactly `2026-09-20T00:00:00`. A day therefore
 * resolves to the whole interval it covers.
 *
 * WHOSE day: the ACCOUNT's, via `timeZone` — the user's Settings timezone,
 * which is the platform's canonical per-user day boundary (`getProfitByUser`
 * buckets daily profit by it, and the Profit / Hero Balance widgets ask for it
 * by name). The date columns render in that same zone, so the day the user
 * reads in the cell is the day they get when they pick it in the filter, and
 * both agree with what the daily-profit surfaces counted. Without it the
 * boundary was the BROWSER's midnight, which files one deal under two
 * different days for anyone whose account zone is not their machine's.
 *
 * No zone, or one the engine cannot resolve, falls back to browser-local —
 * which is exactly what `getValidTimezone` hands back for an account that
 * never set the field, so nothing moves for them.
 *
 * Anything that is not a bare day keeps today's meaning: the single instant
 * it parses to, so a filter restored from an older saved preference or link
 * behaves exactly as before.
 */
function dayBounds(
  value: unknown,
  timeZone?: string | null
): { start: number; end: number } | null {
  const match = DATE_ONLY.exec(String(value ?? ''));
  if (!match) {
    const instant = new Date(value as string).getTime();
    return Number.isNaN(instant) ? null : { start: instant, end: instant };
  }
  const [, year, month, day] = match.map(Number);
  if (timeZone) {
    const inZone = getTzDayBounds(year, month, day, timeZone);
    if (inZone) return inZone;
  }
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0).getTime(),
    end: new Date(year, month - 1, day, 23, 59, 59, 999).getTime(),
  };
}

/**
 * A row's date cell as epoch ms. Date columns reach here in three shapes —
 * an ISO string (`dcaDealToOpenTrade`), epoch ms (the `Update Time`
 * accessor) and a `Date` (the terminal's order columns). A cell with no date
 * is `null`, which no date operator matches: an unfinished deal has no close
 * time, so it is neither on, before nor after the selected day.
 */
function cellTime(cellValue: unknown): number | null {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return null;
  const time =
    cellValue instanceof Date
      ? cellValue.getTime()
      : new Date(cellValue as string | number).getTime();
  return Number.isNaN(time) ? null : time;
}

// ---------------------------------------------------------------------------
// Core operator matching
// ---------------------------------------------------------------------------

/**
 * Apply a single operator to a cell value.
 *
 * When `searchableStrings` is provided (from `meta.getFilterValue`), string-
 * based operators match against ANY of the provided strings (OR logic).
 * Numeric / date operators always use `cellValue` directly.
 *
 * `filterType` is the column's declared `meta.filterType`. It is only needed
 * to tell a DATE column's `equals` / `between` apart from the string and
 * number operator sets, which share those two operator ids; the remaining
 * date operators exist in no other set.
 *
 * `timeZone` is the account timezone every date operator bounds its day by
 * (see `dayBounds`). It is threaded in rather than read from a store so this
 * module stays free of app state.
 */
function applyOperator(
  cellValue: unknown,
  operator: string,
  value: unknown,
  searchableStrings?: string[] | null,
  optionStrings?: string[] | null,
  filterType?: string | null,
  timeZone?: string | null
): boolean {
  const strings = searchableStrings || [String(cellValue ?? '')];

  switch (operator) {
    // -- String operators --
    case 'contains':
      return includesAny(strings, String(value));

    case 'equals':
      // On a date column `=` means "anywhere inside the selected day".
      // Without this the generic branches below compare a full timestamp
      // against a bare `YYYY-MM-DD` — never equal as a string, and `NaN`
      // once an epoch-ms accessor sends it through `Number()` — so the
      // operator matched no row at all.
      if (filterType === 'date') {
        const bounds = dayBounds(value, timeZone);
        const time = cellTime(cellValue);
        return (
          bounds !== null &&
          time !== null &&
          time >= bounds.start &&
          time <= bounds.end
        );
      }
      if (searchableStrings) return equalsAny(strings, String(value));
      if (typeof cellValue === 'number' && typeof value === 'string')
        return cellValue === Number(value);
      if (typeof cellValue === 'boolean' && typeof value === 'string')
        return cellValue === (value === 'true');
      return cellValue === value || String(cellValue) === String(value);

    case 'startsWith':
      return startsWithAny(strings, String(value));

    case 'endsWith':
      return endsWithAny(strings, String(value));

    case 'notContains':
      return !includesAny(strings, String(value));

    // -- Numeric operators --
    case 'greaterThan':
      return Number(cellValue) > Number(value);
    case 'lessThan':
      return Number(cellValue) < Number(value);
    case 'greaterThanOrEqual':
      return Number(cellValue) >= Number(value);
    case 'lessThanOrEqual':
      return Number(cellValue) <= Number(value);

    case 'between':
      if (Array.isArray(value) && value.length === 2) {
        if (filterType === 'date') {
          // Each side is a DAY, so the range runs from the start of the
          // first to the END of the last — otherwise picking the same day
          // twice spans a zero-width instant and returns nothing. A side
          // left blank is unbounded, the same open-ended behaviour the
          // numeric range below has, so a half-typed range doesn't empty
          // the table.
          const time = cellTime(cellValue);
          if (time === null) return false;
          const from = value[0] === '' ? null : dayBounds(value[0], timeZone);
          const to = value[1] === '' ? null : dayBounds(value[1], timeZone);
          return (
            (from === null || time >= from.start) &&
            (to === null || time <= to.end)
          );
        }
        if (typeof value[0] === 'number' || typeof value[1] === 'number') {
          const numValue = Number(cellValue);
          const min = value[0] !== '' ? Number(value[0]) : -Infinity;
          const max = value[1] !== '' ? Number(value[1]) : Infinity;
          return numValue >= min && numValue <= max;
        }
        // Date between
        const date = new Date(cellValue as string);
        const startDate = new Date(value[0] as string);
        const endDate = new Date(value[1] as string);
        return date >= startDate && date <= endDate;
      }
      return true;

    // -- Date operators --
    //
    // All four bound the SELECTED DAY rather than its midnight. Against the
    // instant, `>` still returned every row later that same day (making it
    // indistinguishable from `≥`) and `≤` dropped the selected day entirely.
    case 'after':
    case 'before':
    case 'onOrAfter':
    case 'onOrBefore': {
      const bounds = dayBounds(value, timeZone);
      const time = cellTime(cellValue);
      if (bounds === null || time === null) return false;
      if (operator === 'after') return time > bounds.end;
      if (operator === 'before') return time < bounds.start;
      if (operator === 'onOrAfter') return time >= bounds.start;
      return time <= bounds.end;
    }

    // -- Array / multi-select operators --
    //
    // `isNoneOf` is the exact negation of `isAnyOf` (an empty selection aside,
    // where both mean "no filter applied"), so the two share one matcher.
    // Keeping them as hand-mirrored copies is what let the over-matching below
    // exist twice, once in each direction.
    case 'isAnyOf':
    case 'isNoneOf': {
      const negate = operator === 'isNoneOf';

      /**
       * Match ONE value of a multi-select selection against this row.
       *
       * A selected value is either a DISCRETE OPTION the user picked from the
       * dropdown, or free text they typed. The input snaps a typed term to a
       * matching option whenever one exists, so free text can only ever be a
       * term that matches NO option. Therefore: a value that is a substring of
       * this row's canonical option value (`meta.getOptionValue`) came from
       * the option list, and must be compared EXACTLY — picking `AKE-USD` may
       * not also return `CAKE-USD`, and `isNoneOf` may not silently hide it.
       *
       * Everything else keeps the generous substring match over
       * `meta.getFilterValue`'s variants (for the Symbol column: symbol, pair,
       * base, quote, unslashed symbol), which is what free text needs.
       * Columns that declare no `getOptionValue` have no canonical value to
       * compare against and keep today's behaviour unchanged.
       */
      const matchesSelection = (v: string): boolean => {
        if (optionStrings?.length && includesAny(optionStrings, v)) {
          return equalsAny(optionStrings, v);
        }
        if (searchableStrings) return includesAny(strings, v);
        if (Array.isArray(cellValue)) {
          return cellValue.some((cellVal) =>
            String(cellVal).toLowerCase().includes(v.toLowerCase())
          );
        }
        return String(cellValue).toLowerCase().includes(v.toLowerCase());
      };

      if (Array.isArray(value)) {
        if (value.length === 0) return true;
        const matched = value.some((v) => matchesSelection(String(v)));
        return negate ? !matched : matched;
      }

      // Degenerate single-value shape (a filter restored from a link, say).
      // Without canonical option values there is nothing to compare exactly
      // against, so this stays on the pre-existing substring path verbatim.
      const matched = optionStrings?.length
        ? matchesSelection(String(value))
        : includesAny(strings, String(value));
      return negate ? !matched : matched;
    }

    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Single-condition matching
// ---------------------------------------------------------------------------

/**
 * Evaluate one filter condition against a cell value.
 * Handles legacy string filters, FilterState objects, and empty/not-empty.
 */
function matchesSingleFilter(
  cellValue: unknown,
  singleFilter: unknown,
  searchableStrings?: string[] | null,
  optionStrings?: string[] | null,
  filterType?: string | null,
  timeZone?: string | null
): boolean {
  // Legacy plain-string filter
  if (typeof singleFilter === 'string') {
    if (searchableStrings) return includesAny(searchableStrings, singleFilter);
    return String(cellValue).toLowerCase().includes(singleFilter.toLowerCase());
  }

  // Object-based filter with operator
  if (isFilterState(singleFilter)) {
    const { operator, value } = singleFilter;

    // isEmpty / isNotEmpty don't need a value
    if (operator === 'isEmpty') {
      if (searchableStrings)
        return searchableStrings.every((s) => !s || s.trim() === '');
      return cellValue === null || cellValue === undefined || cellValue === '';
    }
    if (operator === 'isNotEmpty') {
      if (searchableStrings)
        return searchableStrings.some((s) => s && s.trim() !== '');
      return cellValue !== null && cellValue !== undefined && cellValue !== '';
    }

    // No value provided → show all rows
    if (value === '' || value === null || value === undefined) return true;

    return applyOperator(
      cellValue,
      operator,
      value,
      searchableStrings,
      optionStrings,
      filterType,
      timeZone
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// Column filter factory
// ---------------------------------------------------------------------------

/**
 * Resolve the searchable value(s) for a row + column combination.
 *
 * When `getFilterValueFn` is provided (via `meta.getFilterValue`), the
 * returned string(s) are used for ALL string-based operator matching.
 * This lets columns declare multiple searchable fields without writing
 * a custom `filterFn`.
 */
function resolveFilterValue(
  row: { getValue: (columnId: string) => unknown; original?: unknown },
  columnId: string,
  getFilterValueFn?: ((original: unknown) => string | string[]) | null
): { cellValue: unknown; searchableStrings: string[] | null } {
  if (getFilterValueFn && row.original !== undefined) {
    const result = getFilterValueFn(row.original);
    if (Array.isArray(result)) {
      const strings = result.filter(Boolean).map(String);
      return { cellValue: strings[0] ?? '', searchableStrings: strings };
    }
    return {
      cellValue: result,
      searchableStrings: result ? [String(result)] : null,
    };
  }
  return { cellValue: row.getValue(columnId), searchableStrings: null };
}

/**
 * Resolve the row's CANONICAL value(s) for a column — what the multi-select
 * dropdown offers as discrete choices (`meta.getOptionValue`, the same
 * accessor `filter-components` builds its option list from).
 *
 * This answers a different question from `getFilterValue`: "what IS this
 * row's value for this column?", not "which strings should a typed term be
 * matched against?". `isAnyOf` / `isNoneOf` need the former to tell a picked
 * option apart from free text.
 */
function resolveOptionValues(
  row: { original?: unknown },
  getOptionValueFn?: ((original: unknown) => string | string[]) | null
): string[] | null {
  if (!getOptionValueFn || row.original === undefined) return null;
  const result = getOptionValueFn(row.original);
  const values = (Array.isArray(result) ? result : [result])
    .filter(Boolean)
    .map(String);
  return values.length > 0 ? values : null;
}

/**
 * Create a column filter function.
 *
 * If `meta.getFilterValue` is present, the filter matches against the
 * returned values instead of `row.getValue(columnId)`. This eliminates
 * the need for custom `filterFn` on columns that must match against
 * multiple fields from `row.original`.
 *
 * @example
 * // Column definition — no custom filterFn needed:
 * {
 *   accessorKey: 'exchangeUUID',
 *   meta: {
 *     filterType: 'array',
 *     getFilterValue: (row) => [row.exchangeName, row.exchange].filter(Boolean),
 *   },
 * }
 */
export function createEnhancedColumnFilter(
  meta?: Record<string, unknown> | null,
  timeZone?: string | null
) {
  const getFilterValueFn = meta?.['getFilterValue'] as
    | ((original: unknown) => string | string[])
    | undefined;
  const getOptionValueFn = meta?.['getOptionValue'] as
    | ((original: unknown) => string | string[])
    | undefined;
  // The same declaration `filter-components` picks the operator set from, so
  // a date column's `equals` / `between` are matched as the date operators
  // the user was offered rather than as their string / number namesakes.
  const filterType = meta?.['filterType'] as string | undefined;

  return (
    row: { getValue: (columnId: string) => unknown; original?: unknown },
    columnId: string,
    filterValue: unknown
  ): boolean => {
    if (!filterValue) return true;

    const { cellValue, searchableStrings } = resolveFilterValue(
      row,
      columnId,
      getFilterValueFn
    );
    const optionStrings = resolveOptionValues(row, getOptionValueFn);

    // Array of filter conditions → AND logic
    if (Array.isArray(filterValue)) {
      return filterValue.every((f) =>
        matchesSingleFilter(
          cellValue,
          f,
          searchableStrings,
          optionStrings,
          filterType,
          timeZone
        )
      );
    }

    // Legacy string filter
    if (typeof filterValue === 'string') {
      if (searchableStrings) return includesAny(searchableStrings, filterValue);
      return String(cellValue)
        .toLowerCase()
        .includes(filterValue.toLowerCase());
    }

    // Object-based filter
    return matchesSingleFilter(
      cellValue,
      filterValue,
      searchableStrings,
      optionStrings,
      filterType,
      timeZone
    );
  };
}

/**
 * Default enhanced column filter (no meta.getFilterValue).
 * Used as the registered `filterFns.enhancedColumnFilter` on the table
 * and as fallback for columns that don't define meta at all.
 */
export const enhancedColumnFilter = createEnhancedColumnFilter();

// ---------------------------------------------------------------------------
// Active-filter counter
// ---------------------------------------------------------------------------

/**
 * Count only active filters (filters with non-empty values).
 * Prevents empty filter objects from inflating the count shown in the UI.
 */
export const countActiveFilters = (filters: ColumnFiltersState): number => {
  return filters.filter((filter) => {
    const value = filter.value;

    // Array of conditions
    if (Array.isArray(value)) {
      return value.some((v) => {
        if (typeof v === 'object' && v !== null && 'value' in v) {
          const filterValue = (v as { value: unknown }).value;
          return (
            filterValue !== '' &&
            filterValue !== null &&
            filterValue !== undefined
          );
        }
        return v !== '' && v !== null && v !== undefined;
      });
    }

    // Object filter with operator
    if (typeof value === 'object' && value !== null && 'value' in value) {
      const filterValue = (value as { value: unknown }).value;
      const operator = (value as { operator?: string }).operator;
      if (operator === 'isEmpty' || operator === 'isNotEmpty') return true;
      return (
        filterValue !== '' && filterValue !== null && filterValue !== undefined
      );
    }

    // Legacy string filter
    return value !== '' && value !== null && value !== undefined;
  }).length;
};
