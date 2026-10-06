/**
 * dealListControls.ts — sort / filter / CSV export for the backtest Deals
 * rail. Pure functions over {@link DealVM}; the rail keeps the state.
 *
 * Every function works on ORIGINAL deal indices (positions in
 * `vm.dealList`), never on a re-ordered copy: the inspector reads
 * `vm.raw.deals[i]` parallel-indexed with `vm.dealList`, so a selection must
 * stay an original index whatever order the rail shows.
 */

import { csvField } from '@/components/ui/data-table/exportCsv';

import type { DealVM } from './viewModel';

export type DealOutcomeFilter = 'all' | 'win' | 'loss' | 'open';

export type DealSortKey =
  | 'no'
  | 'startTime'
  | 'closeTime'
  | 'pnlPerc'
  | 'pnlUsd'
  | 'durationH'
  | 'filled'
  | 'volume';

export interface DealSort {
  key: DealSortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_DEAL_SORT: DealSort = { key: 'no', dir: 'asc' };

export const DEAL_SORT_LABELS: Record<DealSortKey, string> = {
  no: 'Deal number',
  startTime: 'Start time',
  closeTime: 'Close time',
  pnlPerc: 'P&L %',
  pnlUsd: 'P&L $',
  durationH: 'Duration',
  filled: 'Safety orders filled',
  volume: 'Volume',
};

/** Inclusive `[min, max]`; a null bound is open. */
export interface NumRange {
  min: number | null;
  max: number | null;
}

export interface DealFilters {
  pnlPerc: NumRange;
  durationH: NumRange;
  filled: NumRange;
  /** Start-time window, epoch ms (the `max` day is inclusive). */
  startTime: NumRange;
  /** Empty = every pair. */
  pairs: string[];
}

export const EMPTY_DEAL_FILTERS: DealFilters = {
  pnlPerc: { min: null, max: null },
  durationH: { min: null, max: null },
  filled: { min: null, max: null },
  startTime: { min: null, max: null },
  pairs: [],
};

const inRange = (v: number, r: NumRange): boolean =>
  (r.min == null || v >= r.min) && (r.max == null || v <= r.max);

const rangeSet = (r: NumRange): boolean => r.min != null || r.max != null;

/** Number of active filter groups (drives the filter-button badge). */
export function activeFilterCount(f: DealFilters): number {
  return (
    Number(rangeSet(f.pnlPerc)) +
    Number(rangeSet(f.durationH)) +
    Number(rangeSet(f.filled)) +
    Number(rangeSet(f.startTime)) +
    Number(f.pairs.length > 0)
  );
}

function sortValue(d: DealVM, key: DealSortKey): number | null {
  switch (key) {
    case 'closeTime':
      return d.closeTime;
    default:
      return d[key];
  }
}

/**
 * Original indices of the deals that pass the outcome tab and the filters,
 * in the requested order. Ties (and open deals with no close time, which
 * always sort last) keep deal-number order so the list is stable.
 */
export function visibleDealIndices(
  deals: DealVM[],
  outcome: DealOutcomeFilter,
  filters: DealFilters,
  sort: DealSort,
): number[] {
  const out: number[] = [];
  deals.forEach((d, i) => {
    if (outcome !== 'all' && d.out !== outcome) return;
    if (!inRange(d.pnlPerc, filters.pnlPerc)) return;
    if (!inRange(d.durationH, filters.durationH)) return;
    if (!inRange(d.filled, filters.filled)) return;
    if (!inRange(d.startTime, filters.startTime)) return;
    if (filters.pairs.length && !filters.pairs.includes(d.pair)) return;
    out.push(i);
  });
  const sign = sort.dir === 'asc' ? 1 : -1;
  return out.sort((a, b) => {
    const da = deals[a] as DealVM;
    const db = deals[b] as DealVM;
    const va = sortValue(da, sort.key);
    const vb = sortValue(db, sort.key);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && va !== vb) return (va - vb) * sign;
    return da.no - db.no;
  });
}

const iso = (t: number | null): string =>
  t == null ? '' : new Date(t).toISOString();

/** Drop float noise (`83.60510000000001` → `83.6051`); empty when absent. */
const num = (v: number | null): number | '' =>
  v == null || !Number.isFinite(v) ? '' : Number(v.toPrecision(12));

const CSV_COLUMNS: [string, (d: DealVM) => unknown][] = [
  ['No', (d) => d.no],
  ['Pair', (d) => d.pair],
  ['Status', (d) => d.status],
  ['Outcome', (d) => d.out],
  ['Start time (UTC)', (d) => iso(d.startTime)],
  ['Close time (UTC)', (d) => iso(d.closeTime)],
  ['Duration (h)', (d) => +d.durationH.toFixed(2)],
  ['P&L %', (d) => num(d.pnlPerc)],
  ['P&L $', (d) => num(d.pnlUsd)],
  ['Entry price', (d) => num(d.entry)],
  ['Avg price', (d) => num(d.avg)],
  ['Close price', (d) => num(d.closePrice)],
  ['TP price', (d) => num(d.tp)],
  ['SOs filled', (d) => d.filled],
  ['Max SOs', (d) => d.maxSo],
  ['Volume', (d) => num(d.volume)],
];

/** RFC-4180 CSV of `deals` in the given order. */
export function dealsToCsv(deals: DealVM[]): string {
  const lines = [
    CSV_COLUMNS.map(([h]) => csvField(h)).join(','),
    ...deals.map((d) => CSV_COLUMNS.map(([, f]) => csvField(f(d))).join(',')),
  ];
  return lines.join('\r\n') + '\r\n';
}
