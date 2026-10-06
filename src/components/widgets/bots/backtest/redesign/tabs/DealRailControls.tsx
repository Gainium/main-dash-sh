/**
 * DealRailControls.tsx — the Deals rail header: count, sort menu, filter
 * popover, CSV export, outcome tabs and removable filter chips. Stateless:
 * the rail owns the state (see `dealListControls.ts`).
 */

import { ArrowDownUp, Download, Filter, X } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import {
  activeFilterCount,
  DEAL_SORT_LABELS,
  EMPTY_DEAL_FILTERS,
  type DealFilters,
  type DealOutcomeFilter,
  type DealSort,
  type DealSortKey,
  type NumRange,
} from '../dealListControls';

const OUTCOMES: [DealOutcomeFilter, string][] = [
  ['all', 'All'],
  ['win', 'Wins'],
  ['loss', 'Losses'],
  ['open', 'Open'],
];

type RangeKey = 'pnlPerc' | 'durationH' | 'filled';

const RANGE_FIELDS: [RangeKey, string, string][] = [
  ['pnlPerc', 'P&L', '%'],
  ['durationH', 'Duration', 'h'],
  ['filled', 'SOs filled', ''],
];

const DAY_MS = 86_400_000;

const toNum = (s: string): number | null => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** `yyyy-mm-dd` (UTC) ↔ epoch ms; the `max` bound covers its whole day. */
const toDateInput = (t: number | null, isMax: boolean): string =>
  t == null
    ? ''
    : new Date(isMax ? t - DAY_MS + 1 : t).toISOString().slice(0, 10);

const fromDateInput = (s: string, isMax: boolean): number | null => {
  if (!s) return null;
  const t = Date.parse(s + 'T00:00:00Z');
  if (!Number.isFinite(t)) return null;
  return isMax ? t + DAY_MS - 1 : t;
};

function rangeLabel(r: NumRange, unit: string): string {
  if (r.min != null && r.max != null) return `${r.min}–${r.max}${unit}`;
  if (r.min != null) return `≥ ${r.min}${unit}`;
  return `≤ ${r.max}${unit}`;
}

const iconBtn =
  'flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground';

export interface DealRailControlsProps {
  total: number;
  shown: number;
  pairs: string[];
  outcome: DealOutcomeFilter;
  onOutcome: (o: DealOutcomeFilter) => void;
  sort: DealSort;
  onSort: (s: DealSort) => void;
  filters: DealFilters;
  onFilters: (f: DealFilters) => void;
  onExport: () => void;
}

export function DealRailControls({
  total,
  shown,
  pairs,
  outcome,
  onOutcome,
  sort,
  onSort,
  filters,
  onFilters,
  onExport,
}: DealRailControlsProps) {
  const nFilters = activeFilterCount(filters);
  const setRange = (key: keyof DealFilters, r: NumRange) =>
    onFilters({ ...filters, [key]: r });

  const pickSort = (key: DealSortKey) =>
    onSort(
      sort.key === key
        ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : // P&L, duration, fills and volume read best biggest-first.
          { key, dir: key === 'no' || key.endsWith('Time') ? 'asc' : 'desc' },
    );

  const chips: { id: string; label: string; clear: () => void }[] = [];
  for (const [key, label, unit] of RANGE_FIELDS) {
    const r = filters[key];
    if (r.min != null || r.max != null) {
      chips.push({
        id: key,
        label: `${label} ${rangeLabel(r, unit)}`,
        clear: () => setRange(key, { min: null, max: null }),
      });
    }
  }
  if (filters.startTime.min != null || filters.startTime.max != null) {
    chips.push({
      id: 'startTime',
      label: `Started ${toDateInput(filters.startTime.min, false) || '…'} → ${
        toDateInput(filters.startTime.max, true) || '…'
      }`,
      clear: () => setRange('startTime', { min: null, max: null }),
    });
  }
  if (filters.pairs.length) {
    chips.push({
      id: 'pairs',
      label: filters.pairs.join(', '),
      clear: () => onFilters({ ...filters, pairs: [] }),
    });
  }

  return (
    <div className="border-b border-border/60">
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2">
        <span className="text-sm font-extrabold text-foreground">
          Deals
          <span className="ml-1.5 tabular-nums text-muted-foreground/70">
            {shown === total ? total : `${shown} / ${total}`}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={iconBtn} title="Sort deals">
                <ArrowDownUp className="size-3.5" />
                {sort.key !== 'no' || sort.dir !== 'asc' ? (
                  <span className="max-w-[72px] truncate">
                    {DEAL_SORT_LABELS[sort.key]} {sort.dir === 'asc' ? '↑' : '↓'}
                  </span>
                ) : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {(Object.keys(DEAL_SORT_LABELS) as DealSortKey[]).map((key) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => pickSort(key)}
                  className="justify-between"
                >
                  {DEAL_SORT_LABELS[key]}
                  {sort.key === key && (
                    <span className="text-primary">
                      {sort.dir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(iconBtn, nFilters > 0 && 'text-primary')}
                title="Filter deals"
              >
                <Filter className="size-3.5" />
                {nFilters > 0 && <span className="tabular-nums">{nFilters}</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="flex flex-col gap-2.5">
                {RANGE_FIELDS.map(([key, label, unit]) => (
                  <div
                    key={key}
                    className="grid grid-cols-[88px_1fr_1fr] items-center gap-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      {label}
                      {unit ? ` (${unit})` : ''}
                    </span>
                    {(['min', 'max'] as const).map((b) => (
                      <Input
                        key={b}
                        type="number"
                        inputMode="decimal"
                        placeholder={b}
                        aria-label={`${label} ${b}`}
                        className="h-8 px-2 text-sm"
                        value={filters[key][b] ?? ''}
                        onChange={(e) =>
                          setRange(key, {
                            ...filters[key],
                            [b]: toNum(e.target.value),
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
                <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Started (UTC)
                  </span>
                  {(['min', 'max'] as const).map((b) => (
                    <Input
                      key={b}
                      type="date"
                      aria-label={`Started ${b === 'min' ? 'from' : 'to'}`}
                      className="h-8 px-1.5 text-xs"
                      value={toDateInput(filters.startTime[b], b === 'max')}
                      onChange={(e) =>
                        setRange('startTime', {
                          ...filters.startTime,
                          [b]: fromDateInput(e.target.value, b === 'max'),
                        })
                      }
                    />
                  ))}
                </div>
                {pairs.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {pairs.map((p) => {
                      const on = filters.pairs.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() =>
                            onFilters({
                              ...filters,
                              pairs: on
                                ? filters.pairs.filter((x) => x !== p)
                                : [...filters.pairs, p],
                            })
                          }
                          className={cn(
                            'rounded-md px-2 py-0.5 text-xs font-medium',
                            on
                              ? 'bg-primary/10 text-primary'
                              : 'bg-foreground/[0.06] text-muted-foreground',
                          )}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                )}
                {nFilters > 0 && (
                  <button
                    type="button"
                    onClick={() => onFilters(EMPTY_DEAL_FILTERS)}
                    className="self-end text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <button
            type="button"
            className={iconBtn}
            onClick={onExport}
            disabled={shown === 0}
            title="Export shown deals as CSV"
            aria-label="Export shown deals as CSV"
          >
            <Download className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-3.5 pb-2">
        {OUTCOMES.map(([o, label]) => (
          <button
            key={o}
            type="button"
            onClick={() => onOutcome(o)}
            aria-pressed={outcome === o}
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-medium transition-colors',
              outcome === o
                ? 'bg-foreground/[0.08] text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3.5 pb-2">
          {chips.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1 rounded-md bg-primary/10 py-0.5 pr-1 pl-2 text-xs font-medium text-primary"
            >
              {c.label}
              <button
                type="button"
                onClick={c.clear}
                aria-label={`Remove filter ${c.label}`}
                className="rounded hover:bg-primary/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
