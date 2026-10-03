import type { ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronRight } from 'lucide-react';

import {
  backtestSourceKindOf,
  backtestTypeLabel,
  getBacktestSourceKinds,
  type BacktestSourceRow,
} from '@/lib/extensions/backtestSources';

/**
 * Backtest result sources in the Backtests table: with a source kind
 * registered and the list serving rows' sources, a Type column (Backtest / <kind label>) follows Name and the
 * Name cell of a sourced row carries its icon, an expand toggle and its
 * status. Every other column — and so every sort and filter — is the
 * descriptor's own, over the same rows. Nothing registered ⇒ the columns
 * come back unchanged.
 */
export function decorateBacktestColumns<TResult extends { _id: string }>(
  columns: ColumnDef<TResult>[],
  opts: {
    /** Rows carry a source (the list asks for it); else nothing changes. */
    enabled: boolean;
    isExpanded: (id: string) => boolean;
    toggle: (id: string) => void;
  }
): ColumnDef<TResult>[] {
  if (!opts.enabled || getBacktestSourceKinds().length === 0) return columns;
  const nameIndex = columns.findIndex(
    (c) => (c as { accessorKey?: string }).accessorKey === 'settings.name'
  );
  const out = columns.map((c, i) => {
    if (i !== nameIndex || !c.cell || typeof c.cell !== 'function') return c;
    const inner = c.cell;
    const cell: ColumnDef<TResult>['cell'] = (props) => {
      const row = props.row.original as unknown as BacktestSourceRow;
      const kind = backtestSourceKindOf(row);
      const base = inner(props);
      if (!kind) return base;
      const Icon = kind.icon;
      const open = opts.isExpanded(row._id);
      const Status = kind.RowStatus;
      return (
        <div className="inline-flex min-w-0 items-center gap-1.5">
          {kind.Detail && (
            <button
              type="button"
              aria-label={open ? 'Collapse' : 'Expand'}
              aria-expanded={open}
              data-row-expand
              onClick={(e) => {
                e.stopPropagation();
                opts.toggle(row._id);
              }}
              className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          )}
          <span title={kind.label} className="shrink-0 text-primary">
            <Icon className="size-3.5" aria-label={kind.label} />
          </span>
          {base}
          {Status && <Status row={row} />}
        </div>
      );
    };
    return { ...c, cell };
  });
  const typeColumn: ColumnDef<TResult> = {
    id: 'type',
    header: 'Type',
    accessorFn: (row) => backtestTypeLabel(row as unknown as BacktestSourceRow),
    meta: { filterType: 'array' },
    cell: ({ row }) => {
      const r = row.original as unknown as BacktestSourceRow;
      const kind = backtestSourceKindOf(r);
      const Icon = kind?.icon;
      return (
        <span className="inline-flex items-center gap-1 text-sm">
          {Icon && <Icon className="size-3.5 text-primary" />}
          {backtestTypeLabel(r)}
        </span>
      );
    },
  };
  out.splice(nameIndex >= 0 ? nameIndex + 1 : 0, 0, typeColumn);
  return out;
}
