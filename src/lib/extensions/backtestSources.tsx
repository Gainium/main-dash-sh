import type { LucideIcon } from 'lucide-react';
import {
  type ComponentType,
  type ReactNode,
  useSyncExternalStore,
} from 'react';

// Backtest result sources — rows of the Backtests table that another process
// produced (a stored result's optional `source {kind, id, variant, status,
// progress}`). A host build registers a kind to mark its rows, show their
// status, expand them inline and extend the standard results modal for them.
// Unregistered (the default) ⇒ the table and the modal are unchanged.
//
//   registerBacktestSourceKind({ kind: 'x', label: 'X', icon, Detail, … });
//   setBacktestListExtraFields('source { kind id variant status progress }');

export interface BacktestResultSourceRef {
  kind?: string | null;
  id?: string | null;
  variant?: string | null;
  status?: string | null;
  /** 0 … 100 */
  progress?: number | null;
}

/** What the table and the modal know of a row. */
export interface BacktestSourceRow {
  _id: string;
  source?: BacktestResultSourceRef | null;
  settings?: { name?: string } | null;
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  exchange?: string;
  deals?: unknown[];
}

/** A chart note (marker) on the Deals view's chart. */
export interface BacktestChartNote {
  id: string;
  /** ms */
  time: number;
  /** Placed at this price; omitted ⇒ the bar's close (or the deal's entry). */
  price?: number | null;
  /** Shown on hover. */
  text: string;
  color: string;
  /** The engine deal the note belongs to, if any (`deals[].id`). */
  dealId?: string | null;
}

/** Extensions of the Deals view (markers, a card, deal badges). */
export interface BacktestDealsExtension {
  /** Label of the markers' toggle next to Lines / Icons. */
  markersLabel: string;
  markers: BacktestChartNote[];
  /** Highlighted marker (e.g. the card's selected entry). */
  activeMarkerId?: string | null;
  onMarkerClick?: (id: string) => void;
  /** A card next to Deal detail / Execution / DCA ladder, per deal. */
  renderCard?: (deal: BacktestDealRef) => ReactNode;
  /** A small badge on a deal of the deal list. */
  dealBadge?: (deal: BacktestDealRef) => ReactNode;
}

/** A deal of the open result, as extensions see it. */
export interface BacktestDealRef {
  /** `deals[].id` of the result */
  id: string | null;
  /** ms */
  startTime: number | null;
  /** ms; null while open */
  closeTime: number | null;
}

/** Ask the modal to show a deal (Deals view, the deal selected, chart at time). */
export interface BacktestDealFocus {
  dealId: string | null;
  /** ms */
  time: number | null;
  /** Changes on every request, so the same deal can be asked again. */
  nonce: number;
}

/** What a source kind adds to the standard results modal for its row. */
export interface BacktestResultsExtension {
  /** Rendered in the modal header (e.g. a result selector). */
  headerExtra?: ReactNode;
  /**
   * The result to show instead of the row's own (e.g. another variant);
   * `null` while it loads. Undefined = the row's own result.
   */
  result?: unknown | null;
  extraTabs?: { key: string; label: string; content: ReactNode }[];
  deals?: BacktestDealsExtension;
  /** Open on this tab. */
  initialTab?: string;
  focus?: BacktestDealFocus | null;
}

export interface BacktestSourceKind {
  kind: string;
  /** The Type column's value for these rows. */
  label: string;
  icon: LucideIcon;
  /** Status / progress beside the name (e.g. while it runs). */
  RowStatus?: ComponentType<{ row: BacktestSourceRow }>;
  /** Inline expansion under the row. `openResults(tab)` opens the modal. */
  Detail?: ComponentType<{
    row: BacktestSourceRow;
    openResults: (tab?: string) => void;
  }>;
  /** False while the row has no result to open (it expands instead). */
  canOpen?: (row: BacktestSourceRow) => boolean;
  /**
   * A React hook called by the results modal's host on every render with the
   * open row when it is of this kind, else null (registration order is fixed
   * at boot). `tab` is the tab the modal was asked to open on.
   */
  useResultsExtension?: (
    row: BacktestSourceRow | null,
    ctx: { initialTab?: string | undefined }
  ) => BacktestResultsExtension | null;
}

const kinds: BacktestSourceKind[] = [];

export function registerBacktestSourceKind(kind: BacktestSourceKind): void {
  const index = kinds.findIndex((k) => k.kind === kind.kind);
  if (index >= 0) kinds[index] = kind;
  else kinds.push(kind);
}

export function getBacktestSourceKinds(): readonly BacktestSourceKind[] {
  return kinds;
}

export function backtestSourceKindOf(
  row: { source?: BacktestResultSourceRef | null } | null | undefined
): BacktestSourceKind | null {
  const k = row?.source?.kind;
  return k ? (kinds.find((x) => x.kind === k) ?? null) : null;
}

/** The Type column's value of a row ('Backtest' for a plain one). */
export function backtestTypeLabel(
  row: { source?: BacktestResultSourceRef | null } | null | undefined
): string {
  const kind = backtestSourceKindOf(row);
  if (kind) return kind.label;
  return row?.source?.kind ? row.source.kind : 'Backtest';
}

/**
 * Calls every registered kind's results hook (fixed order) and returns the
 * extension of the open row's kind, if any.
 */
export function useBacktestResultsExtension(
  row: BacktestSourceRow | null,
  ctx: { initialTab?: string | undefined }
): BacktestResultsExtension | null {
  let out: BacktestResultsExtension | null = null;
  for (const kind of kinds) {
    if (!kind.useResultsExtension) continue;
    const mine = row && row.source?.kind === kind.kind ? row : null;
    const ext = kind.useResultsExtension(mine, ctx);
    if (mine && ext) out = ext;
  }
  return out;
}

// ---------------------------------------------------------------------
// Extra fields of the backtest list queries
// ---------------------------------------------------------------------

let extraFields = '';
const listeners = new Set<() => void>();

/**
 * Extra GraphQL selection for getBacktests / getComboBacktests rows (e.g.
 * `source { … }`), set once the backend is known to serve it. Changing it
 * refetches the lists.
 */
export function setBacktestListExtraFields(fields: string): void {
  if (fields === extraFields) return;
  extraFields = fields;
  listeners.forEach((l) => l());
}

export function getBacktestListExtraFields(): string {
  return extraFields;
}

export function useBacktestListExtraFields(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => extraFields,
    () => extraFields
  );
}
