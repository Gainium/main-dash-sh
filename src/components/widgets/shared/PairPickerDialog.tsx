/**
 * The bot form's add-pairs dialog as a data table (spec 115, parent repo):
 * card view renders the picker's own pair row (`ListModalRow`), table view
 * shows every datum the row carries as a sortable / filterable column, plus
 * the exchange's trading limits.
 *
 * It combines, it doesn't replace (§2.4): the list picker's asset-class
 * chips, sort menu, favourites-first and "Canonical only" all stay, and
 * drive the table's own sorting and filters.
 *
 * Presentational: the caller supplies the rows (already enriched with min
 * order, max leverage and the bot-fit reason) and the selection callbacks.
 */
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from '@tanstack/react-table';
import { Star, X as CloseIcon } from 'lucide-react';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { Chip } from '@/components/ui/chip';
import { DataTable } from '@/components/ui/data-table/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import type { AssetClass } from '@/hooks/useTradingPairs';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import { formatMinOrder, pairContractSymbol } from '@/utils/pairPicker';
import { ASSET_CLASS_LABELS, ASSET_CLASS_ORDER } from './assetClassLabels';
import CoinPair from './CoinPair';
import { ListModalRow, type ListItem } from './ListModal';

export const PAIR_PICKER_TABLE_ID = 'bot-form-pair-picker';

/** One candidate pair. `fitReason` is why the bot can't trade it as set up. */
export interface PairPickerRow extends ListItem {
  baseAsset: string;
  quoteAsset: string;
  fitReason?: string;
}

export interface PairPickerAnchor {
  dimension: 'base' | 'quote';
  asset: string;
}

export interface PairPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  rows: PairPickerRow[];
  selectedItems: string[];
  onItemToggle: (symbol: string) => void;
  onToggleFavorite: (symbol: string) => void;
  /** Adds several pairs through the form's bulk-add path; returns a message. */
  onAddMany: (symbols: string[]) => string | undefined;
  /** Removes several pairs at once (the select-all checkbox, unticked). */
  onRemoveMany?: (symbols: string[]) => void;
  /** The asset every candidate has to share — seeded as a column filter. */
  anchor?: PairPickerAnchor | null;
  /** The plan's pair limit; "Select all matching" never offers more. */
  maxSelectable?: number;
  /**
   * The bot holds one pair: a pick swaps it (the caller closes the dialog),
   * so there is no "Select all matching".
   */
  singlePick?: boolean;
  /** Sort mode on first open (one of the sort menu's values). */
  initialSortMode?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  zIndex?: number;
}

/** What a row's checkbox / card has to read without re-creating the card type. */
interface PickerRowContextValue {
  selected: ReadonlySet<string>;
  onToggle: (symbol: string) => void;
  onToggleFavorite: (symbol: string) => void;
  /** The select-all checkbox; null where a pick swaps the one pair. */
  selectAll: SelectAllState | null;
}

interface SelectAllState {
  checked: boolean | 'indeterminate';
  /** What a tick would add (capped at the plan's slots left). */
  addCount: number;
  label: string;
  onToggle: () => void;
}
const PickerRowContext = createContext<PickerRowContextValue | null>(null);

const blockedReason = (row: PairPickerRow) =>
  row.disabledReason ?? row.fitReason;

/**
 * Card view: the picker's own row. Module-scoped so DataTable never sees a
 * new component type (that remounts every card).
 */
const PairCard: React.FC<{ item: PairPickerRow; index: number }> = ({
  item,
}) => {
  const ctx = useContext(PickerRowContext);
  const reason = blockedReason(item);
  const listItem = useMemo<ListItem>(
    () => (reason ? { ...item, disabledReason: reason } : item),
    [item, reason]
  );
  if (!ctx) return null;
  return (
    <ListModalRow
      item={listItem}
      isSelected={ctx.selected.has(item.symbol)}
      enableFavorites
      onToggle={ctx.onToggle}
      onToggleFavorite={ctx.onToggleFavorite}
    />
  );
};

const FavoriteCell: React.FC<{ row: PairPickerRow }> = ({ row }) => {
  const ctx = useContext(PickerRowContext);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        ctx?.onToggleFavorite(row.symbol);
      }}
      aria-label={
        row.isFavorite ? `Unfavorite ${row.name}` : `Favorite ${row.name}`
      }
      aria-pressed={Boolean(row.isFavorite)}
      className={`transition-colors ${
        row.isFavorite
          ? 'text-warning'
          : 'text-muted-foreground/40 hover:text-warning'
      }`}
    >
      <Star
        className="h-4 w-4"
        fill={row.isFavorite ? 'currentColor' : 'none'}
      />
    </button>
  );
};

const SelectCell: React.FC<{ row: PairPickerRow }> = ({ row }) => {
  const ctx = useContext(PickerRowContext);
  const reason = blockedReason(row);
  const box = (
    <Checkbox
      checked={!reason && Boolean(ctx?.selected.has(row.symbol))}
      disabled={Boolean(reason)}
      tabIndex={-1}
      className="pointer-events-none"
      aria-hidden
    />
  );
  return reason ? (
    <Tooltip tooltip={reason} side="left">
      {box}
    </Tooltip>
  ) : (
    box
  );
};

/**
 * §6.2 — "Select all matching" as a checkbox: in the select column's header
 * (table view) and in the toolbar (card view, which has no header).
 */
const SelectAllCheckbox: React.FC = () => {
  const ctx = useContext(PickerRowContext);
  const all = ctx?.selectAll;
  if (!all) return null;
  return (
    <Tooltip tooltip={all.label} side="bottom">
      <span
        className="inline-flex"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={all.checked}
          onCheckedChange={all.onToggle}
          aria-label={all.label}
          className="data-[state=indeterminate]:bg-primary/40"
        />
      </span>
    </Tooltip>
  );
};

const PairCell: React.FC<{ row: PairPickerRow }> = ({ row }) => {
  const reason = blockedReason(row);
  const contract = pairContractSymbol(
    row.symbol,
    row.baseAsset,
    row.quoteAsset
  );
  return (
    <div
      className={`flex items-center gap-sm min-w-0 ${reason ? 'opacity-50' : ''}`}
    >
      <CoinPair
        baseAsset={row.baseAsset}
        quoteAsset={row.quoteAsset}
        {...(row.assetCategory ? { assetClass: row.assetCategory } : {})}
        {...(row.exchange ? { exchange: row.exchange } : {})}
        iconSize="sm"
        showText={false}
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sm font-semibold leading-tight shrink-0">
            {row.baseLabel ?? row.baseAsset}
          </span>
          {contract && (
            <span className="text-muted-foreground text-xs font-mono truncate leading-tight">
              {contract}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground leading-tight truncate">
          {row.baseDisplayName
            ? `${row.baseDisplayName} · ${row.quoteAsset}`
            : row.quoteAsset}
        </div>
      </div>
    </div>
  );
};

const compactUsd = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
};

const formatPrice = (n: number) => {
  if (n >= 1)
    return `$${n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
};

const ChangeValue: React.FC<{ value: number }> = ({ value }) => (
  <span
    className={`tabular-nums ${value >= 0 ? 'text-success' : 'text-destructive'}`}
  >
    {value >= 0 ? '+' : ''}
    {value.toFixed(2)}%
  </span>
);

type NumericField =
  | 'price'
  | 'change1h'
  | 'change24h'
  | 'change7d'
  | 'change30d'
  | 'volume24h'
  | 'marketCap'
  | 'marketCapRank'
  | 'volatility'
  | 'rsi'
  | 'roi'
  | 'minOrder'
  | 'maxLeverage';

/** A numeric column; the cell is empty when the pair has no value. */
const numericColumn = (
  field: NumericField,
  header: string,
  render: (n: number, row: PairPickerRow) => React.ReactNode,
  opts: { descFirst?: boolean } = {}
): ColumnDef<PairPickerRow, unknown> => ({
  id: field,
  accessorFn: (r) => r[field],
  header,
  cell: ({ row }) => {
    const v = row.original[field];
    return v == null ? null : (
      <span className="tabular-nums">{render(v, row.original)}</span>
    );
  },
  meta: { filterType: 'number' },
  sortUndefined: 'last',
  sortDescFirst: opts.descFirst ?? false,
  size: 110,
  minSize: 80,
});

/** Every numeric field the rows can carry, in column order. */
const NUMERIC_COLUMNS: Array<{
  field: NumericField;
  col: ColumnDef<PairPickerRow, unknown>;
}> = [
  { field: 'price', col: numericColumn('price', 'Price', formatPrice) },
  {
    field: 'change1h',
    col: numericColumn('change1h', '1h', (v) => <ChangeValue value={v} />, {
      descFirst: true,
    }),
  },
  {
    field: 'change24h',
    col: numericColumn('change24h', '24h', (v) => <ChangeValue value={v} />, {
      descFirst: true,
    }),
  },
  {
    field: 'change7d',
    col: numericColumn('change7d', '7d', (v) => <ChangeValue value={v} />, {
      descFirst: true,
    }),
  },
  {
    field: 'change30d',
    col: numericColumn('change30d', '30d', (v) => <ChangeValue value={v} />, {
      descFirst: true,
    }),
  },
  {
    field: 'volume24h',
    col: numericColumn('volume24h', 'Volume', compactUsd, { descFirst: true }),
  },
  {
    field: 'marketCap',
    col: numericColumn('marketCap', 'Market cap', compactUsd, {
      descFirst: true,
    }),
  },
  {
    field: 'marketCapRank',
    col: numericColumn('marketCapRank', 'Rank', (v) => `#${v}`),
  },
  {
    field: 'volatility',
    col: numericColumn('volatility', 'Volatility', (v) => `${v.toFixed(1)}%`, {
      descFirst: true,
    }),
  },
  {
    field: 'rsi',
    col: numericColumn('rsi', 'RSI', (v) => v.toFixed(0), { descFirst: true }),
  },
  {
    field: 'roi',
    col: numericColumn(
      'roi',
      'Curated Strat. ROI',
      (v) => (
        <span className="text-success">+{v.toFixed(v >= 100 ? 0 : 1)}%</span>
      ),
      { descFirst: true }
    ),
  },
  {
    field: 'minOrder',
    col: numericColumn(
      'minOrder',
      'Min order',
      (v, r) => `${formatMinOrder(v)} ${r.quoteAsset}`
    ),
  },
  {
    field: 'maxLeverage',
    col: numericColumn('maxLeverage', 'Max leverage', (v) => `${v}×`, {
      descFirst: true,
    }),
  },
];

/** Shown by default (§3.4); the rest are one click away in Columns. */
const HIDDEN_BY_DEFAULT: Record<string, boolean> = {
  blocked: false,
  quote: false,
  base: false,
  assetCategory: false,
  price: false,
  change1h: false,
  change7d: false,
  change30d: false,
  marketCapRank: false,
  volatility: false,
  rsi: false,
};

const buildColumns = (
  present: ReadonlySet<NumericField>
): ColumnDef<PairPickerRow, unknown>[] => [
  {
    // Sort key only: pairs the bot can't take sink below the ones it can.
    id: 'blocked',
    accessorFn: (r) => (blockedReason(r) ? 1 : 0),
    header: '',
    enableHiding: false,
    enableColumnFilter: false,
  },
  {
    id: 'favorite',
    accessorFn: (r) => (r.isFavorite ? 1 : 0),
    header: () => <Star className="h-4 w-4" aria-label="Favorite" />,
    cell: ({ row }) => <FavoriteCell row={row.original} />,
    enableColumnFilter: false,
    sortDescFirst: true,
    meta: { label: 'Favorite' },
    size: 44,
    minSize: 40,
    maxSize: 56,
  },
  {
    id: 'pair',
    accessorFn: (r) => (r.name || r.symbol).toLowerCase(),
    header: 'Pair',
    cell: ({ row }) => <PairCell row={row.original} />,
    meta: {
      getFilterValue: (r: PairPickerRow) =>
        [r.symbol, r.baseAsset, r.baseDisplayName ?? ''].filter(Boolean),
    },
    size: 200,
    minSize: 140,
  },
  {
    id: 'quote',
    accessorFn: (r) => r.quoteAsset,
    header: 'Quote',
    meta: { filterType: 'array' },
  },
  {
    id: 'base',
    accessorFn: (r) => r.baseAsset,
    header: 'Base',
    meta: { filterType: 'array' },
  },
  {
    id: 'assetCategory',
    accessorFn: (r) => r.assetCategory ?? 'crypto',
    header: 'Asset class',
    meta: { filterType: 'array' },
  },
  ...NUMERIC_COLUMNS.filter((c) => present.has(c.field)).map((c) => c.col),
  {
    id: 'select',
    header: () => <SelectAllCheckbox />,
    // The header is the select-all checkbox: no menu / drag overlay on it.
    meta: { headerControls: false },
    cell: ({ row }) => <SelectCell row={row.original} />,
    enableSorting: false,
    enableColumnFilter: false,
    enableHiding: false,
    size: 44,
    minSize: 40,
    maxSize: 56,
  },
];

/**
 * The sort menu: the list picker's modes (§2.4) plus the trading limits.
 * Each maps to one column sort; `needs` is the field that has to exist for
 * the mode to be offered.
 */
const SORT_MODES: Array<{
  value: string;
  label: string;
  sort: { id: string; desc: boolean };
  needs?: NumericField;
}> = [
  {
    value: 'marketcap',
    label: 'By market cap',
    sort: { id: 'marketCapRank', desc: false },
    needs: 'marketCapRank',
  },
  {
    value: 'roi',
    label: 'By Curated Strat. ROI',
    sort: { id: 'roi', desc: true },
    needs: 'roi',
  },
  {
    value: 'volume',
    label: 'By 24h volume',
    sort: { id: 'volume24h', desc: true },
    needs: 'volume24h',
  },
  {
    value: 'change',
    label: 'By 24h change',
    sort: { id: 'change24h', desc: true },
    needs: 'change24h',
  },
  {
    value: 'volatility',
    label: 'By volatility',
    sort: { id: 'volatility', desc: true },
    needs: 'volatility',
  },
  {
    value: 'rsi',
    label: 'By RSI',
    sort: { id: 'rsi', desc: true },
    needs: 'rsi',
  },
  {
    value: 'minOrder',
    label: 'By min order',
    sort: { id: 'minOrder', desc: false },
    needs: 'minOrder',
  },
  {
    value: 'maxLeverage',
    label: 'By max leverage',
    sort: { id: 'maxLeverage', desc: true },
    needs: 'maxLeverage',
  },
  { value: 'alpha', label: 'A–Z', sort: { id: 'pair', desc: false } },
];

const buildSorting = (
  mode: string | null,
  favoritesFirst: boolean
): SortingState => {
  const sort = SORT_MODES.find((m) => m.value === mode)?.sort;
  return [
    { id: 'blocked', desc: false },
    ...(favoritesFirst ? [{ id: 'favorite', desc: true }] : []),
    ...(sort ? [sort] : []),
  ];
};

const anchorFilter = (anchor: PairPickerAnchor): ColumnFiltersState => [
  {
    id: anchor.dimension,
    value: { operator: 'isAnyOf', value: [anchor.asset.toUpperCase()] },
  },
];

const ASSET_CLASS_COLUMN = 'assetCategory';

// §2.5 — the select checkbox never scrolls out of view, on any screen.
const LOCKED_PINS = { right: ['select'] };

export const PairPickerDialog: React.FC<PairPickerDialogProps> = ({
  isOpen,
  onClose,
  title,
  rows,
  selectedItems,
  onItemToggle,
  onToggleFavorite,
  onAddMany,
  onRemoveMany,
  anchor,
  maxSelectable,
  singlePick = false,
  initialSortMode,
  isLoading = false,
  loadingMessage = 'Fetching trading pairs from your exchange…',
  zIndex,
}) => {
  const [fitsOnly, setFitsOnly] = useState(true);
  const [canonicalOnly, setCanonicalOnly] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() =>
    anchor ? anchorFilter(anchor) : []
  );
  const [filteredRows, setFilteredRows] = useState<PairPickerRow[]>([]);
  const [pageRows, setPageRows] = useState<PairPickerRow[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(
    () =>
      useTablePreferencesStore.getState().preferences[PAIR_PICKER_TABLE_ID]
        ?.viewMode ?? 'cards'
  );

  // Fields any row carries → which columns and sort modes exist.
  const present = useMemo(() => {
    const set = new Set<NumericField>();
    for (const r of rows) {
      for (const c of NUMERIC_COLUMNS) {
        if (r[c.field] != null) set.add(c.field);
      }
    }
    return set as ReadonlySet<NumericField>;
  }, [rows]);
  const sortModes = useMemo(
    () => SORT_MODES.filter((m) => !m.needs || present.has(m.needs)),
    [present]
  );

  const [favoritesFirst, setFavoritesFirst] = useState(false);
  const [sortMode, setSortMode] = useState<string | null>(
    initialSortMode ?? null
  );
  // Until the user picks, follow the data: market cap when it's there (the
  // list picker's default), else A–Z.
  const effectiveSortMode =
    sortMode ?? (present.has('marketCapRank') ? 'marketcap' : 'alpha');
  const [headerSorting, setHeaderSorting] = useState<SortingState | null>(null);
  const sorting = useMemo(
    () => headerSorting ?? buildSorting(effectiveSortMode, favoritesFirst),
    [headerSorting, effectiveSortMode, favoritesFirst]
  );
  const handleSortMode = useCallback((value: string) => {
    setHeaderSorting(null);
    setSortMode(value);
  }, []);
  const toggleFavoritesFirst = useCallback(() => {
    setHeaderSorting(null);
    setFavoritesFirst((v) => !v);
  }, []);
  // A column-header click in table view takes over until the menu is used.
  const handleSortingChange = useCallback(
    (next: SortingState | ((prev: SortingState) => SortingState)) => {
      setHeaderSorting((prev) =>
        typeof next === 'function' ? next(prev ?? sorting) : next
      );
    },
    [sorting]
  );

  // §2.2 — each opening starts from the bot's anchor: the anchor moves with
  // the selection, so last session's filters may name an asset it no longer has.
  const anchorKey = anchor ? `${anchor.dimension}:${anchor.asset}` : '';
  useEffect(() => {
    if (!isOpen) return;
    setColumnFilters(anchor ? anchorFilter(anchor) : []);
    // The search is per opening too, like the list picker's.
    useTablePreferencesStore
      .getState()
      .setGlobalFilter(PAIR_PICKER_TABLE_ID, '');
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed per open / anchor
  }, [isOpen, anchorKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Asset-class chips (§2.4) are a filter on the class column, so the
  // table's own "Clear" resets them too.
  const assetClasses = useMemo(() => {
    const found = new Set<AssetClass>();
    rows.forEach((r) => found.add(r.assetCategory ?? 'crypto'));
    return ASSET_CLASS_ORDER.filter((c) => found.has(c));
  }, [rows]);
  const activeAssetClass = useMemo(() => {
    const f = columnFilters.find((c) => c.id === ASSET_CLASS_COLUMN)?.value as
      { value?: unknown } | undefined;
    const v = Array.isArray(f?.value) ? f.value[0] : undefined;
    return (typeof v === 'string' ? v : 'all') as AssetClass | 'all';
  }, [columnFilters]);
  const setAssetClass = useCallback((cls: AssetClass | 'all') => {
    setColumnFilters((prev) => [
      ...prev.filter((c) => c.id !== ASSET_CLASS_COLUMN),
      ...(cls === 'all'
        ? []
        : [
            {
              id: ASSET_CLASS_COLUMN,
              value: { operator: 'isAnyOf', value: [cls] },
            },
          ]),
    ]);
  }, []);

  const hasNonCanonical = useMemo(
    () => rows.some((r) => r.isCanonical === false),
    [rows]
  );
  const data = useMemo(
    () =>
      rows.filter(
        (r) =>
          !(fitsOnly && r.fitReason) &&
          !(hasNonCanonical && canonicalOnly && r.isCanonical === false)
      ),
    [rows, fitsOnly, canonicalOnly, hasNonCanonical]
  );

  const columns = useMemo(() => buildColumns(present), [present]);

  const selected = useMemo(() => new Set(selectedItems), [selectedItems]);

  const handleRowClick = useCallback(
    (row: PairPickerRow) => {
      if (blockedReason(row)) return;
      onItemToggle(row.symbol);
    },
    [onItemToggle]
  );
  const getRowIsSelected = useCallback(
    (row: PairPickerRow) => !blockedReason(row) && selected.has(row.symbol),
    [selected]
  );

  // §6.2 — the pairs "Select all matching" adds: shown, pickable, not yet
  // selected, in display order, capped at the slots the plan leaves.
  const selectedCount = selectedItems.filter((s) => s !== 'ALL').length;
  const slotsLeft =
    maxSelectable === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, maxSelectable - selectedCount);
  const toAdd = useMemo(
    () =>
      filteredRows
        .filter((r) => !blockedReason(r) && !selected.has(r.symbol))
        .slice(0, slotsLeft)
        .map((r) => r.symbol),
    [filteredRows, selected, slotsLeft]
  );
  // §6.2 — the header checkbox acts on the current PAGE (Gmail-style):
  // ticked when every pickable pair on it is selected, partly when some are.
  // Ticking adds the page's rest (capped); unticking a full page removes it.
  // Past the page, the bar offers "Select all N matching" (or "Clear").
  const pagePickable = useMemo(
    () => pageRows.filter((r) => !blockedReason(r)).map((r) => r.symbol),
    [pageRows]
  );
  const pageSelected = pagePickable.filter((sym) => selected.has(sym));
  const pageAllSelected =
    pagePickable.length > 0 && pageSelected.length === pagePickable.length;
  const shownPickable = useMemo(
    () => filteredRows.filter((r) => !blockedReason(r)).map((r) => r.symbol),
    [filteredRows]
  );
  const shownSelected = shownPickable.filter((sym) => selected.has(sym));
  const allShownSelected =
    shownPickable.length > 0 && shownSelected.length === shownPickable.length;

  const addCapped = useCallback(
    (symbols: string[]) => {
      const add = symbols
        .filter((sym) => !selected.has(sym))
        .slice(0, slotsLeft);
      if (!add.length) {
        if (maxSelectable !== undefined && slotsLeft === 0) {
          setNotice(`Your plan allows ${maxSelectable} pairs per bot.`);
        }
        return;
      }
      setNotice(onAddMany(add) ?? null);
    },
    [selected, slotsLeft, maxSelectable, onAddMany]
  );
  const removeMany = useCallback(
    (symbols: string[]) => {
      if (!symbols.length) return;
      onRemoveMany?.(symbols);
      setNotice(null);
    },
    [onRemoveMany]
  );
  const handleTogglePage = useCallback(() => {
    if (pageAllSelected) removeMany(pageSelected);
    else addCapped(pagePickable);
  }, [pageAllSelected, removeMany, pageSelected, addCapped, pagePickable]);

  const selectAll = useMemo<SelectAllState | null>(
    () =>
      singlePick
        ? null
        : {
            checked: pageAllSelected
              ? true
              : pageSelected.length > 0
                ? 'indeterminate'
                : false,
            addCount: Math.min(
              pagePickable.length - pageSelected.length,
              slotsLeft
            ),
            label: pageAllSelected
              ? 'Unselect this page'
              : 'Select all on this page',
            onToggle: handleTogglePage,
          },
    [
      singlePick,
      pageAllSelected,
      pageSelected.length,
      pagePickable.length,
      slotsLeft,
      handleTogglePage,
    ]
  );

  // The "select all matching" bar: only once the page is fully ticked and
  // more pairs match than the page shows.
  const moreThanPage = shownPickable.length > pagePickable.length;
  const selectAllBar =
    !singlePick && pageAllSelected && moreThanPage ? (
      <div className="flex flex-wrap items-center justify-center gap-xs rounded-md bg-muted/50 px-sm py-1.5 text-sm">
        {allShownSelected ? (
          <>
            <span>All {shownPickable.length} matching pairs are selected.</span>
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => removeMany(shownSelected)}
            >
              Clear selection
            </button>
          </>
        ) : (
          <>
            <span>All {pagePickable.length} pairs on this page are selected.</span>
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => addCapped(shownPickable)}
            >
              {toAdd.length < shownPickable.length - shownSelected.length
                ? `Select ${toAdd.length} more (plan limit ${maxSelectable})`
                : `Select all ${shownPickable.length} matching`}
            </button>
          </>
        )}
      </div>
    ) : null;
  const ctx = useMemo<PickerRowContextValue>(
    () => ({ selected, onToggle: onItemToggle, onToggleFavorite, selectAll }),
    [selected, onItemToggle, onToggleFavorite, selectAll]
  );

  if (!isOpen) return null;

  const isCards = viewMode !== 'table';
  // §2.4 — the table sorts from its headers; cards have none, so they keep
  // the list picker's sort menu and favourites-first.
  const cardSortControls = isCards ? (
    <>
      <Select
        value={
          headerSorting
            ? undefined
            : sortModes.some((m) => m.value === effectiveSortMode)
              ? effectiveSortMode
              : undefined
        }
        onValueChange={handleSortMode}
      >
        <SelectTrigger
          size="sm"
          className="w-auto min-w-0 shrink"
          aria-label="Sort pairs"
        >
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {sortModes.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={toggleFavoritesFirst}
        aria-pressed={favoritesFirst}
        aria-label="Show favorites first"
        title="Show favorites first"
        className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
          favoritesFirst
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Star
          className="h-4 w-4"
          fill={favoritesFirst ? 'currentColor' : 'none'}
        />
      </button>
    </>
  ) : null;

  const toolbar = (
    <div className="flex flex-nowrap items-center gap-sm">
      <label className="flex items-center gap-2 text-sm text-foreground whitespace-nowrap">
        <Switch
          checked={fitsOnly}
          onCheckedChange={setFitsOnly}
          aria-label="Fits this bot"
        />
        Fits this bot
        <Tooltip
          side="bottom"
          tooltip="Hides pairs this bot can't trade with its current settings: an order below the exchange minimum, leverage above the pair's maximum, or not enough free balance in the pair's quote asset for the base order."
        >
          <InfoIcon />
        </Tooltip>
      </label>
      {hasNonCanonical && (
        <label className="flex items-center gap-2 text-sm text-foreground whitespace-nowrap">
          <Switch
            checked={canonicalOnly}
            onCheckedChange={setCanonicalOnly}
            aria-label="Canonical only"
          />
          Canonical only
          <Tooltip
            side="bottom"
            tooltip="Non-canonical pairs are permissionless listings — they can impersonate real tickers or carry liquidity/rug risk. Turn off to show them."
          >
            <InfoIcon />
          </Tooltip>
        </label>
      )}
      {cardSortControls}
      {isCards && <SelectAllCheckbox />}
    </div>
  );

  const content = (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-xs"
      style={zIndex !== undefined ? { zIndex } : undefined}
      onClick={onClose}
      data-testid="pair-picker-overlay"
    >
      {/* Card view keeps the list dialog's width; the table needs room for
          its columns, so it widens (sized off --base-font-size, like
          ListModal, so the shell tracks the type). */}
      <div
        className={`bg-popover rounded-2xl shadow-xl @container h-[85vh] flex flex-col ${
          viewMode === 'table'
            ? 'w-[min(100%,calc(var(--base-font-size)*72))]'
            : 'w-[min(100%,calc(var(--base-font-size)*30))] md:w-[min(90vw,calc(var(--base-font-size)*36))] xl:w-[min(90vw,calc(var(--base-font-size)*42))]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="pair-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-md pt-md space-y-sm">
          <div className="flex items-center justify-between gap-sm">
            <h3 className="text-foreground font-semibold text-lg">{title}</h3>
            <button
              onClick={onClose}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-muted"
              aria-label="Close"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {assetClasses.length >= 2 && (
            <div className="flex flex-wrap gap-xs">
              {(['all', ...assetClasses] as Array<AssetClass | 'all'>).map(
                (cls) => {
                  const isActive = activeAssetClass === cls;
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => setAssetClass(cls)}
                      className="focus:outline-none"
                      aria-pressed={isActive}
                    >
                      <Chip
                        variant={isActive ? 'primary' : 'default'}
                        chipStyle={isActive ? 'soft' : 'ghost'}
                        size="sm"
                        className="cursor-pointer"
                      >
                        {ASSET_CLASS_LABELS[cls]}
                      </Chip>
                    </button>
                  );
                }
              )}
            </div>
          )}

        </div>
        {notice && (
          <p role="status" className="px-md pt-xs text-xs text-destructive">
            {notice}
          </p>
        )}
        {/* The table scrolls itself (so its header and toolbar stay put):
            give it the remaining height rather than scrolling this box. */}
        <div className="flex-1 min-h-0 flex flex-col px-md py-sm">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-sm py-12">
              <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground text-center px-6">
                {loadingMessage}
              </p>
            </div>
          ) : (
            <PickerRowContext.Provider value={ctx}>
              <DataTable<PairPickerRow, unknown>
                tableId={PAIR_PICKER_TABLE_ID}
                // The table area takes the remaining height (so its header can
                // stick); the one-column card grid drops masonry's gap
                // compensation (negative margins + wider width), which
                // otherwise scrolls the cards sideways inside this box.
                className="[&_.data-table-container]:flex-1 [&_.data-table-container]:min-h-0 [&_.masonry-grid]:mx-0! [&_.masonry-grid]:w-full!"
                columns={columns}
                data={data}
                getRowId={(r) => r.symbol}
                enableCardView
                defaultView="cards"
                cardComponent={PairCard}
                cardViewBreakpoints={{ default: 1 }}
                cardViewGap={4}
                onViewModeChange={setViewMode}
                defaultColumnVisibility={HIDDEN_BY_DEFAULT}
                lockedPinnedColumns={LOCKED_PINS}
                sorting={sorting}
                onSortingChange={handleSortingChange}
                columnFilters={columnFilters}
                onColumnFiltersChange={setColumnFilters}
                onFilteredRowsChange={setFilteredRows}
                onPageRowsChange={setPageRows}
                betweenToolbarAndContent={selectAllBar}
                onRowClick={handleRowClick}
                getRowIsSelected={getRowIsSelected}
                firstToolbarActions={toolbar}
                initialPageSize={50}
                enableExport={false}
                enableColumnReordering={false}
                enableUrlSync={false}
                emptyMessage="No pairs match these filters."
              />
            </PickerRowContext.Provider>
          )}
        </div>
        {!isLoading && (
          <div className="px-md py-md flex gap-sm">
            {/* Clear everything picked so far (multi-pair bots only — a
                single-pair bot always keeps its one pair). */}
            {!singlePick && onRemoveMany && selectedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onRemoveMany(selectedItems.filter((sym) => sym !== 'ALL'));
                  setNotice(null);
                }}
                className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Clear selection
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {selectedCount > 0 ? `Done (${selectedCount})` : 'Done'}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' && document.body
    ? createPortal(content, document.body)
    : content;
};
