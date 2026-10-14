/**
 * The bot form's add-pairs dialog as a data table (spec 115, parent repo):
 * card view renders the picker's own pair row (`ListModalRow`), table view
 * adds sortable / filterable columns for the exchange's trading limits.
 *
 * Presentational: the caller supplies the rows (already enriched with min
 * order, max leverage and the bot-fit reason) and the selection callbacks.
 */
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/data-table/data-table';
import { Switch } from '@/components/ui/switch';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useTablePreferencesStore } from '@/stores/tablePreferencesStore';
import CoinPair from './CoinPair';
import { formatMinOrder } from '@/utils/pairPicker';
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
  /** The asset every candidate has to share — seeded as a column filter. */
  anchor?: PairPickerAnchor | null;
  isLoading?: boolean;
  loadingMessage?: string;
  zIndex?: number;
}

/** What a row's checkbox / card has to read without re-creating the card type. */
interface PickerRowContextValue {
  selected: ReadonlySet<string>;
  onToggle: (symbol: string) => void;
  onToggleFavorite: (symbol: string) => void;
}
const PickerRowContext = createContext<PickerRowContextValue | null>(null);

const blockedReason = (row: PairPickerRow) =>
  row.disabledReason ?? row.fitReason;

/**
 * Card view: the picker's own row, unmodified. Module-scoped so DataTable
 * never sees a new component type (that remounts every card).
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

const PairCell: React.FC<{ row: PairPickerRow }> = ({ row }) => {
  const reason = blockedReason(row);
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
        <div className="text-sm font-semibold leading-tight truncate">
          {row.baseLabel ?? row.baseAsset}
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

const numberCell = (
  value: number | undefined,
  render: (n: number) => string
) =>
  value == null ? null : <span className="tabular-nums">{render(value)}</span>;

const compactUsd = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
};

const buildColumns = (opts: {
  marketData: boolean;
  leverage: boolean;
  minOrder: boolean;
}): ColumnDef<PairPickerRow, unknown>[] => {
  const cols: ColumnDef<PairPickerRow, unknown>[] = [
    {
      id: 'favorite',
      accessorFn: (r) => (r.isFavorite ? 1 : 0),
      header: () => <Star className="h-4 w-4" aria-label="Favorite" />,
      cell: ({ row }) => <FavoriteCell row={row.original} />,
      enableColumnFilter: false,
      sortDescFirst: true,
      size: 48,
    },
    {
      id: 'pair',
      accessorFn: (r) => r.symbol,
      header: 'Pair',
      cell: ({ row }) => <PairCell row={row.original} />,
      meta: {
        getFilterValue: (r: PairPickerRow) =>
          [r.symbol, r.baseAsset, r.baseDisplayName ?? ''].filter(Boolean),
      },
      size: 200,
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
      header: 'Class',
      meta: { filterType: 'array' },
    },
  ];
  if (opts.marketData) {
    cols.push(
      {
        id: 'change24h',
        accessorFn: (r) => r.change24h,
        header: '24h',
        cell: ({ row }) => {
          const v = row.original.change24h;
          if (v == null) return null;
          return (
            <span
              className={`tabular-nums ${v >= 0 ? 'text-success' : 'text-destructive'}`}
            >
              {v >= 0 ? '+' : ''}
              {v.toFixed(2)}%
            </span>
          );
        },
        meta: { filterType: 'number' },
        sortUndefined: 'last',
      },
      {
        id: 'volume24h',
        accessorFn: (r) => r.volume24h,
        header: 'Volume',
        cell: ({ row }) => numberCell(row.original.volume24h, compactUsd),
        meta: { filterType: 'number' },
        sortUndefined: 'last',
        sortDescFirst: true,
      },
      {
        id: 'marketCapRank',
        accessorFn: (r) => r.marketCapRank,
        header: 'Rank',
        cell: ({ row }) =>
          numberCell(row.original.marketCapRank, (n) => `#${n}`),
        meta: { filterType: 'number' },
        sortUndefined: 'last',
      }
    );
  }
  if (opts.minOrder) {
    cols.push({
      id: 'minOrder',
      accessorFn: (r) => r.minOrder,
      header: 'Min order',
      cell: ({ row }) =>
        numberCell(
          row.original.minOrder,
          (n) => `${formatMinOrder(n)} ${row.original.quoteAsset}`
        ),
      meta: { filterType: 'number' },
      sortUndefined: 'last',
    });
  }
  if (opts.leverage) {
    cols.push({
      id: 'maxLeverage',
      accessorFn: (r) => r.maxLeverage,
      header: 'Max leverage',
      cell: ({ row }) => numberCell(row.original.maxLeverage, (n) => `${n}×`),
      meta: { filterType: 'number' },
      sortUndefined: 'last',
      sortDescFirst: true,
    });
  }
  cols.push({
    id: 'select',
    header: '',
    cell: ({ row }) => <SelectCell row={row.original} />,
    enableSorting: false,
    enableColumnFilter: false,
    enableHiding: false,
    size: 40,
  });
  return cols;
};

const anchorFilter = (anchor: PairPickerAnchor): ColumnFiltersState => [
  {
    id: anchor.dimension,
    value: { operator: 'isAnyOf', value: [anchor.asset.toUpperCase()] },
  },
];

const HIDDEN_BY_DEFAULT = { quote: false, base: false, assetCategory: false };

export const PairPickerDialog: React.FC<PairPickerDialogProps> = ({
  isOpen,
  onClose,
  title,
  rows,
  selectedItems,
  onItemToggle,
  onToggleFavorite,
  onAddMany,
  anchor,
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
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(
    () =>
      useTablePreferencesStore.getState().preferences[PAIR_PICKER_TABLE_ID]
        ?.viewMode ?? 'cards'
  );

  // §2.2 — each opening starts from the bot's anchor: the anchor moves with
  // the selection, so last session's filters may name an asset it no longer has.
  const anchorKey = anchor ? `${anchor.dimension}:${anchor.asset}` : '';
  useEffect(() => {
    if (!isOpen) return;
    setColumnFilters(anchor ? anchorFilter(anchor) : []);
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

  const columns = useMemo(
    () =>
      buildColumns({
        marketData: rows.some(
          (r) =>
            r.marketCapRank != null ||
            r.volume24h != null ||
            r.change24h != null
        ),
        leverage: rows.some((r) => r.maxLeverage != null),
        minOrder: rows.some((r) => r.minOrder != null),
      }),
    [rows]
  );

  const selected = useMemo(() => new Set(selectedItems), [selectedItems]);
  const ctx = useMemo<PickerRowContextValue>(
    () => ({ selected, onToggle: onItemToggle, onToggleFavorite }),
    [selected, onItemToggle, onToggleFavorite]
  );

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

  const addable = useMemo(
    () =>
      filteredRows
        .filter((r) => !blockedReason(r) && !selected.has(r.symbol))
        .map((r) => r.symbol),
    [filteredRows, selected]
  );
  const handleSelectAll = useCallback(() => {
    if (!addable.length) return;
    setNotice(onAddMany(addable) ?? null);
  }, [addable, onAddMany]);

  if (!isOpen) return null;

  const toolbar = (
    <div className="flex flex-wrap items-center gap-sm">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Switch
          checked={fitsOnly}
          onCheckedChange={setFitsOnly}
          aria-label="Fits this bot"
        />
        Fits this bot
        <Tooltip
          side="bottom"
          tooltip="Hides pairs this bot can't trade with its current settings: an order below the exchange minimum, or leverage above the pair's maximum."
        >
          <InfoIcon />
        </Tooltip>
      </label>
      {hasNonCanonical && (
        <label className="flex items-center gap-2 text-sm text-foreground">
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSelectAll}
        disabled={addable.length === 0}
      >
        Select all matching{addable.length ? ` (${addable.length})` : ''}
      </Button>
    </div>
  );

  const selectedCount = selectedItems.filter((s) => s !== 'ALL').length;

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
        className={`bg-popover rounded-2xl shadow-xl @container max-h-[85vh] flex flex-col ${
          viewMode === 'table'
            ? 'w-[min(100%,calc(var(--base-font-size)*64))]'
            : 'w-[min(100%,calc(var(--base-font-size)*30))] md:w-[min(90vw,calc(var(--base-font-size)*36))] xl:w-[min(90vw,calc(var(--base-font-size)*42))]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="pair-picker-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-md pt-md flex items-center justify-between gap-sm">
          <h3 className="text-foreground font-semibold text-lg">{title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 hover:bg-muted"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
        {notice && (
          <p role="status" className="px-md pt-xs text-xs text-destructive">
            {notice}
          </p>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-md py-sm">
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
                columnFilters={columnFilters}
                onColumnFiltersChange={setColumnFilters}
                onFilteredRowsChange={setFilteredRows}
                onRowClick={handleRowClick}
                getRowIsSelected={getRowIsSelected}
                firstToolbarActions={toolbar}
                initialPageSize={50}
                enableExport={false}
                enableColumnReordering={false}
                enableColumnResizing={false}
                enableUrlSync={false}
                emptyMessage="No pairs match these filters."
              />
            </PickerRowContext.Provider>
          )}
        </div>
        {!isLoading && (
          <div className="px-md py-md">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
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
