import type {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

// Interface for table preferences
export interface TablePreferences {
  columnOrder: string[];
  columnVisibility: VisibilityState;
  columnWidths?: Record<string, number>;
  pinnedColumns?: {
    left: string[];
    right: string[];
  };
  pagination?: {
    pageSize: number;
    pageIndex: number;
  };
  viewMode?: 'table' | 'cards';
  sorting?: SortingState;
  columnFilters?: ColumnFiltersState;
  /** Free-text search box value. Persisted alongside columnFilters so the
   *  search survives remounts (paper/live switch, live-data skeleton flips,
   *  navigating away and back) natively — without relying on the debounced
   *  URL sync. */
  globalFilter?: string;
  /** Bag for widget-specific state that lives next to a table but isn't a
   *  built-in tanstack-table feature (e.g. an "Open vs Closed" segment toggle
   *  rendered above the table, a custom non-column filter dropdown, etc).
   *  Consumers read/write via `useTableCustomState(tableId, key, default)`. */
  customState?: Record<string, unknown>;
}

// Store state interface
interface TablePreferencesState {
  // Table preferences by table ID
  preferences: Record<string, TablePreferences>;

  // Actions
  setColumnOrder: (tableId: string, columnOrder: string[]) => void;
  setColumnVisibility: (
    tableId: string,
    columnVisibility: VisibilityState
  ) => void;
  setColumnWidths: (
    tableId: string,
    columnWidths: Record<string, number>
  ) => void;
  setPinnedColumns: (
    tableId: string,
    pinnedColumns: { left: string[]; right: string[] }
  ) => void;
  setPagination: (
    tableId: string,
    pagination: { pageSize: number; pageIndex: number }
  ) => void;
  setViewMode: (tableId: string, viewMode: 'table' | 'cards') => void;
  setSorting: (tableId: string, sorting: SortingState) => void;
  setColumnFilters: (
    tableId: string,
    columnFilters: ColumnFiltersState
  ) => void;
  setGlobalFilter: (tableId: string, globalFilter: string) => void;
  setCustomState: (tableId: string, key: string, value: unknown) => void;
  getPreferences: (tableId: string) => TablePreferences | undefined;
  resetPreferences: (tableId: string) => void;
  resetAllPreferences: () => void;
}

// Create the store with persistence
export const useTablePreferencesStore = create<TablePreferencesState>()(
  persist(
    (set, get) => ({
      preferences: {},

      setColumnOrder: (tableId: string, columnOrder: string[]) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              columnOrder,
            },
          },
        }));
      },

      setColumnVisibility: (
        tableId: string,
        columnVisibility: VisibilityState
      ) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              columnVisibility,
            },
          },
        }));
      },

      setColumnWidths: (
        tableId: string,
        columnWidths: Record<string, number>
      ) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              columnWidths,
            },
          },
        }));
      },

      setPinnedColumns: (
        tableId: string,
        pinnedColumns: { left: string[]; right: string[] }
      ) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              pinnedColumns,
            },
          },
        }));
      },

      setPagination: (
        tableId: string,
        pagination: { pageSize: number; pageIndex: number }
      ) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              pagination,
            },
          },
        }));
      },

      setViewMode: (tableId: string, viewMode: 'table' | 'cards') => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              viewMode,
            },
          },
        }));
      },

      setSorting: (tableId: string, sorting: SortingState) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              sorting,
            },
          },
        }));
      },

      setColumnFilters: (
        tableId: string,
        columnFilters: ColumnFiltersState
      ) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              columnFilters,
            },
          },
        }));
      },

      setGlobalFilter: (tableId: string, globalFilter: string) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              globalFilter,
            },
          },
        }));
      },

      setCustomState: (tableId: string, key: string, value: unknown) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            [tableId]: {
              ...state.preferences[tableId],
              customState: {
                ...state.preferences[tableId]?.customState,
                [key]: value,
              },
            },
          },
        }));
      },

      getPreferences: (tableId: string) => {
        return get().preferences[tableId];
      },

      resetPreferences: (tableId: string) => {
        set((state) => {
          const newPreferences = { ...state.preferences };
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete newPreferences[tableId];
          return { preferences: newPreferences };
        });
      },

      resetAllPreferences: () => {
        set({ preferences: {} });
      },
    }),
    {
      name: 'table-preferences-storage',
      version: 2,
      // v1 -> v2: force the Actions column back to the right edge of every
      // table. Saved layouts predate the per-table
      // `defaultPinnedColumns={{ right: ['actions'] }}`, and some can't be
      // repaired by merging in the default pin: column ids were refactored
      // (e.g. flat `startCondition` -> nested `settings.startCondition`), so a
      // stale persisted `columnOrder` references ids react-table no longer
      // knows and lets columns render past the right pin. Drop the saved
      // `columnOrder` + `pinnedColumns` so each table falls back to its
      // `defaultColumnOrder` + `defaultPinnedColumns`. Widths, visibility,
      // sorting, filters, pagination and view mode are kept.
      migrate: (persistedState, version) => {
        if (version >= 2) return persistedState as TablePreferencesState;
        const state = persistedState as {
          preferences?: Record<string, TablePreferences>;
        } | null;
        const prefs = state?.preferences;
        if (!prefs) return persistedState as TablePreferencesState;
        const next: Record<string, TablePreferences> = {};
        for (const [tableId, p] of Object.entries(prefs)) {
          next[tableId] = {
            ...p,
            columnOrder: [],
            pinnedColumns: undefined,
          };
        }
        return { ...state, preferences: next } as TablePreferencesState;
      },
    }
  )
);

/**
 * Read/write a single piece of widget-specific state that should be persisted
 * alongside a table's prefs (e.g. an Open/Closed segment toggle above the
 * table). Returns a `[value, setValue]` tuple in the style of useState.
 *
 * The state is stored under `preferences[tableId].customState[key]`, so reuse
 * the same `tableId` you'd pass to `<DataTable tableId={...} />` and a stable
 * `key` per piece of state.
 */
export function useTableCustomState<T>(
  tableId: string,
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const value = useTablePreferencesStore(
    (state) => state.preferences[tableId]?.customState?.[key] as T | undefined
  );
  const setCustomState = useTablePreferencesStore(
    (state) => state.setCustomState
  );

  const setValue = useCallback(
    (next: T) => setCustomState(tableId, key, next),
    [setCustomState, tableId, key]
  );

  return [value === undefined ? defaultValue : value, setValue];
}

// Hook to get table preferences with defaults
export const useTablePreferences = (
  tableId: string,
  defaultColumnOrder: string[],
  defaultColumnVisibility: VisibilityState,
  defaultPageSize: number,
  defaultViewMode: 'table' | 'cards',
  defaultPinnedColumns?: { left: string[]; right: string[] },
  defaultSorting?: SortingState,
  defaultColumnFilters?: ColumnFiltersState
) => {
  // Subscribe to THIS table's slice only. Calling the store with no selector
  // subscribes to the whole `preferences` map, so a pref write for ANY other
  // tableId (every table on the page shares this store) produced a new root
  // object and re-rendered every mounted DataTable — e.g. changing the page
  // size on one table re-rendered all the others. `preferences[tableId]` keeps
  // its reference when another table is written, so those tables now stay put.
  const tablePreferences = useTablePreferencesStore(
    (state) => state.preferences[tableId]
  );

  // Actions are created once by `create()` and never replaced, so this
  // shallow-compared selector never fires an update.
  const {
    setColumnOrder,
    setColumnVisibility,
    setColumnWidths,
    setPinnedColumns,
    setPagination,
    setViewMode,
    setSorting,
    setColumnFilters,
    setGlobalFilter,
    resetPreferences,
  } = useTablePreferencesStore(
    useShallow((state) => ({
      setColumnOrder: state.setColumnOrder,
      setColumnVisibility: state.setColumnVisibility,
      setColumnWidths: state.setColumnWidths,
      setPinnedColumns: state.setPinnedColumns,
      setPagination: state.setPagination,
      setViewMode: state.setViewMode,
      setSorting: state.setSorting,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
      resetPreferences: state.resetPreferences,
    }))
  );

  const defOrder = useMemo(
    () => defaultColumnOrder ?? [],
    [defaultColumnOrder]
  );

  const defPagination = useMemo(
    () => ({ pageSize: defaultPageSize, pageIndex: 0 }),
    [defaultPageSize]
  );

  const defColumnWidth: Record<string, number> = useMemo(() => ({}), []);

  const defVisibility = useMemo(
    () => defaultColumnVisibility ?? {},
    [defaultColumnVisibility]
  );

  const defPinnedColumns = useMemo(
    () =>
      defaultPinnedColumns ?? {
        left: [],
        right: [],
      },
    [defaultPinnedColumns]
  );

  const defViewMode = useMemo(
    () => defaultViewMode ?? 'table',
    [defaultViewMode]
  );

  const defSorting = useMemo(() => defaultSorting ?? [], [defaultSorting]);
  const defFilters = useMemo(
    () => defaultColumnFilters ?? [],
    [defaultColumnFilters]
  );

  // Merge persisted pins with defaults: any column the call site marks as
  // default-pinned should still take effect if it's not already pinned in
  // persisted state (left or right). Without this, users with stale
  // localStorage from before a `defaultPinnedColumns` was added would never
  // see the default pin (e.g. the actions column staying mid-table).
  const mergedPinnedColumns = useMemo(() => {
    const persisted = tablePreferences?.pinnedColumns;
    if (!persisted) return defPinnedColumns;
    const known = new Set([...persisted.left, ...persisted.right]);
    const extraLeft = defPinnedColumns.left.filter((id) => !known.has(id));
    const extraRight = defPinnedColumns.right.filter((id) => !known.has(id));
    if (extraLeft.length === 0 && extraRight.length === 0) return persisted;
    return {
      left: [...persisted.left, ...extraLeft],
      right: [...persisted.right, ...extraRight],
    };
  }, [tablePreferences?.pinnedColumns, defPinnedColumns]);

  // The tableId-bound setters depend only on the tableId and the (permanent)
  // store actions — never on the persisted VALUES. Memoising them separately
  // from `result` keeps their identities stable when this table's own prefs
  // change; folding them into the value memo below handed every consumer ten
  // fresh callbacks on each write, invalidating the downstream `useCallback`s
  // and `React.memo` boundaries in DataTableComponent that close over them.
  const setters = useMemo(
    () => ({
      setColumnOrder: (order: string[]) => setColumnOrder(tableId, order),
      setColumnVisibility: (visibility: VisibilityState) =>
        setColumnVisibility(tableId, visibility),
      setColumnWidths: (widths: Record<string, number>) =>
        setColumnWidths(tableId, widths),
      setPinnedColumns: (pinned: { left: string[]; right: string[] }) =>
        setPinnedColumns(tableId, pinned),
      setPagination: (pagination: { pageSize: number; pageIndex: number }) =>
        setPagination(tableId, pagination),
      setViewMode: (mode: 'table' | 'cards') => setViewMode(tableId, mode),
      setSorting: (sorting: SortingState) => setSorting(tableId, sorting),
      setColumnFilters: (filters: ColumnFiltersState) =>
        setColumnFilters(tableId, filters),
      setGlobalFilter: (value: string) => setGlobalFilter(tableId, value),
      resetPreferences: () => resetPreferences(tableId),
    }),
    [
      tableId,
      setColumnOrder,
      setColumnVisibility,
      setColumnWidths,
      setPinnedColumns,
      setPagination,
      setViewMode,
      setSorting,
      setColumnFilters,
      setGlobalFilter,
      resetPreferences,
    ]
  );

  const result = useMemo(
    () => ({
      columnOrder: tablePreferences?.columnOrder ?? defOrder,
      columnVisibility: tablePreferences?.columnVisibility ?? defVisibility,
      columnWidths: tablePreferences?.columnWidths ?? defColumnWidth,
      pinnedColumns: mergedPinnedColumns,
      pagination: tablePreferences?.pagination ?? defPagination,
      viewMode: tablePreferences?.viewMode ?? defViewMode,
      sorting: tablePreferences?.sorting ?? defSorting,
      columnFilters: tablePreferences?.columnFilters ?? defFilters,
      globalFilter: tablePreferences?.globalFilter ?? '',
      ...setters,
    }),
    [
      defOrder,
      defColumnWidth,
      defFilters,
      defPagination,
      defViewMode,
      mergedPinnedColumns,
      defSorting,
      defVisibility,
      setters,
      tablePreferences?.globalFilter,
      tablePreferences?.columnOrder,
      tablePreferences?.columnVisibility,
      tablePreferences?.pagination,
      tablePreferences?.viewMode,
      tablePreferences?.sorting,
      tablePreferences?.columnFilters,
      tablePreferences?.columnWidths,
    ]
  );

  return result;
};
