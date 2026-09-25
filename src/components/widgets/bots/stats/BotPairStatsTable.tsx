/**
 * Per-pair breakdown for multi-pair bots — one ROW per pair, so a 50-pair bot
 * is a sortable, searchable, exportable list instead of 50 columns to scroll
 * sideways through (the legacy port this replaced put metrics down the rows).
 *
 * Built on the shared DataTable for sorting, pair search, column visibility
 * and CSV export. Every column's accessor is the raw number — cells format,
 * accessors don't — so sorting and the CSV see values, not strings.
 */

import type { ColumnDef } from '@tanstack/react-table';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { useMemo, useState, type FC } from 'react';

import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table/data-table';
import {
  PeriodDatePicker,
  type PeriodValue,
} from '@/components/ui/PeriodDatePicker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { cn } from '@/lib/utils';
import {
  formatCurrency,
  formatDuration,
  formatQuoteAmount,
} from '@/utils/formatters';

import type { BotPairStatsRowVM } from './pairStatsViewModel';

const DASH = <span className="text-muted-foreground">—</span>;

const signClass = (v: number): string =>
  v > 0 ? 'text-profit' : v < 0 ? 'text-loss' : 'text-foreground';

const usdCell = (v: number | undefined, colored = true) =>
  v === undefined ? (
    DASH
  ) : (
    <span className={colored ? signClass(v) : undefined}>
      {formatCurrency(v)}
    </span>
  );

const percCell = (v: number | undefined, colored = true) =>
  v === undefined ? (
    DASH
  ) : (
    <span className={colored ? signClass(v) : undefined}>{v.toFixed(2)}%</span>
  );

const durationCell = (v: number | undefined) =>
  v === undefined ? DASH : formatDuration(v);

type Col = ColumnDef<BotPairStatsRowVM>;

/** Numbers right-aligned, undefined ("not available") sorted last. */
const num = (
  id: keyof BotPairStatsRowVM,
  header: string,
  cell: (r: BotPairStatsRowVM) => React.ReactNode
): Col => ({
  id,
  accessorFn: (r) => r[id],
  header,
  sortUndefined: 'last',
  cell: ({ row }) => (
    <div className="text-right tabular-nums">{cell(row.original)}</div>
  ),
});

const columns: Col[] = [
  {
    id: 'pair',
    accessorKey: 'pair',
    header: 'Pair',
    meta: { pinned: 'left' },
    cell: ({ row }) => (
      <CoinPair
        baseAsset={row.original.baseAsset}
        quoteAsset={row.original.quoteAsset}
        iconSize="sm"
        showText
      />
    ),
  },
  num('closedDeals', 'Deals', (r) => (
    <>
      {r.closedDeals}
      <span className="ml-1 text-xs text-muted-foreground">
        {r.wins}W / {r.losses}L
      </span>
    </>
  )),
  num('winRatePerc', 'Win rate', (r) => percCell(r.winRatePerc, false)),
  num('realizedProfitUsd', 'Realized P&L', (r) => usdCell(r.realizedProfitUsd)),
  num('roiPerc', 'Return on capital', (r) => percCell(r.roiPerc)),
  num('avgProfitUsd', 'Avg P&L / deal', (r) => usdCell(r.avgProfitUsd)),
  num('profitFactor', 'Profit factor', (r) =>
    r.profitFactor === undefined
      ? DASH
      : Number.isFinite(r.profitFactor)
        ? r.profitFactor.toFixed(2)
        : '∞'
  ),
  num('maxDrawdownPerc', 'Max drawdown', (r) =>
    r.maxDrawdownPerc === undefined ? (
      DASH
    ) : (
      <span className={r.maxDrawdownPerc > 0 ? 'text-loss' : undefined}>
        {r.maxDrawdownPerc > 0 ? '-' : ''}
        {r.maxDrawdownPerc.toFixed(2)}%
      </span>
    )
  ),
  num('maxDealCapitalUsd', 'Max deal capital', (r) =>
    usdCell(r.maxDealCapitalUsd, false)
  ),
  num('feesQuote', 'Fees', (r) =>
    r.feesQuote === undefined
      ? DASH
      : formatQuoteAmount(r.feesQuote, r.quoteAsset, 4)
  ),
  num('avgDealDuration', 'Avg duration', (r) =>
    durationCell(r.avgDealDuration)
  ),
  num('maxDealDuration', 'Max duration', (r) =>
    durationCell(r.maxDealDuration)
  ),
  num('openDeals', 'Open deals', (r) => r.openDeals ?? DASH),
  num('unrealizedProfitUsd', 'Open P&L', (r) => usdCell(r.unrealizedProfitUsd)),
];

const shortDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

interface RangeChipProps {
  value: PeriodValue | null;
  onChange: (value: PeriodValue | null) => void;
}

const RangeChip: FC<RangeChipProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const label = value
    ? `${shortDate(value.from)} – ${shortDate(value.to)}`
    : 'All time';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose the period of closed deals"
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md bg-card px-2 text-xs font-medium tabular-nums text-foreground shadow-sm transition-colors hover:bg-card/80',
            open && 'ring-1 ring-border'
          )}
        >
          <CalendarRange className="h-3.5 w-3.5 opacity-70" />
          <span>{label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <PeriodDatePicker
          value={value}
          onApply={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onReset={() => {
            onChange(null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};

export interface BotPairStatsTableProps {
  botId: string;
  rows: BotPairStatsRowVM[];
  isLoading?: boolean;
  /** Null = all time. Omit `onRangeChange` to hide the picker (old backend). */
  range: PeriodValue | null;
  onRangeChange?: (value: PeriodValue | null) => void;
  /** Rows came from the stored per-pair aggregate (backend without the query). */
  fromStoredStats?: boolean;
}

export const BotPairStatsTable: FC<BotPairStatsTableProps> = ({
  botId,
  rows,
  isLoading = false,
  range,
  onRangeChange,
  fromStoredStats = false,
}) => {
  const rangeChip = useMemo(
    () =>
      onRangeChange ? (
        <RangeChip value={range} onChange={onRangeChange} />
      ) : undefined,
    [range, onRangeChange]
  );

  return (
    <Card position={2} className="p-md">
      <h3 className="mb-2 text-sm font-semibold text-foreground">
        Per-pair statistics
      </h3>
      <DataTable
        tableId="bot-pair-stats"
        columns={columns}
        data={rows}
        getRowId={(r) => r.pair}
        enableUrlSync={false}
        enableGlobalFilter
        enableColumnFilters={false}
        enableColumnReordering={false}
        enableColumnVisibility
        enableSorting
        enableExport
        exportFilename={`bot-${botId}-pairs`}
        showPagination
        initialPageSize={25}
        defaultColumnVisibility={{ maxDealDuration: false }}
        firstToolbarActions={rangeChip}
        emptyMessage={isLoading ? 'Loading pairs…' : 'No deals in this period.'}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {fromStoredStats ? (
          <>
            Return on capital is net profit over the capital allocated to the
            pair. Update the server for fees, capital, drawdown, open positions
            and a date range.
          </>
        ) : (
          <>
            {range ? 'The period filters closed deals by close time. ' : ''}
            Return on capital is realized P&L divided by the largest capital a
            single deal of that pair used. Max drawdown is the deepest a single
            deal went below its entry. Open deals and open P&L show the current
            position and ignore the period.
          </>
        )}
      </p>
    </Card>
  );
};
