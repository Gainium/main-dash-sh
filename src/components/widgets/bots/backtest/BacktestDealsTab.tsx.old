import { useMemo } from 'react';

import { DataTable } from '@/components/ui/data-table/data-table';
import { ProfitLossPercChip } from '@/components/ui/chip';
import type { ColumnDef } from '@tanstack/react-table';

import { math } from '@/lib/utils/math';
import type {
  DCABacktestingResultHistory,
  PreparedDeal,
  SplitTime,
} from '@/types';

interface BacktestDealsTabProps {
  backtest: DCABacktestingResultHistory;
}

const parseSplitNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatSplitDuration = (split?: SplitTime) => {
  if (!split) return '-';
  const d = parseSplitNumber(split.d);
  const h = parseSplitNumber(split.h);
  const min = parseSplitNumber(split.min);
  const s = parseSplitNumber(split.s);

  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (min) parts.push(`${min}m`);
  if (!parts.length && s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
};

export function BacktestDealsTab({ backtest }: BacktestDealsTabProps) {
  const deals = backtest.deals ?? [];

  const formatUsd = (value?: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const columns = useMemo<ColumnDef<PreparedDeal>[]>(
    () => [
      {
        id: 'number',
        header: 'No',
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {row.original.number ?? row.index + 1}
          </div>
        ),
      },
      {
        id: 'pair',
        header: 'PAIR',
        cell: ({ row }) => (
          <div className="text-sm">{row.original.symbol?.pair ?? '-'}</div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'STATUS',
        cell: ({ row }) => (
          <div className="text-sm capitalize">{row.original.status}</div>
        ),
      },
      {
        accessorKey: 'startTime',
        header: 'START TIME',
        cell: ({ row }) => (
          <div className="text-sm">
            {new Date(row.original.startTime).toLocaleString()}
          </div>
        ),
      },
      {
        accessorKey: 'closedTime',
        header: 'CLOSE TIME',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.closedTime
              ? new Date(row.original.closedTime).toLocaleString()
              : ''}
          </div>
        ),
      },
      {
        id: 'profit',
        header: 'P&L',
        cell: ({ row }) => {
          const total = row.original.profit?.total;
          const totalUsd = row.original.profit?.totalUsd;
          const perc = row.original.profit?.perc;

          const settings = backtest.settings;
          const profitAsset = settings?.futures
            ? settings.coinm
              ? row.original.symbol?.baseAsset?.name
              : row.original.symbol?.quoteAsset?.name
            : settings?.profitCurrency === 'base'
              ? row.original.symbol?.baseAsset?.name
              : row.original.symbol?.quoteAsset?.name;

          return (
            <div className="flex items-center justify-end gap-xs">
              <div className="text-sm tabular-nums whitespace-nowrap">
                {typeof total === 'number' && typeof totalUsd === 'number'
                  ? `${math.convertFromExponential(total, 8)} ${profitAsset ?? ''} (${formatUsd(totalUsd)})`
                  : typeof totalUsd === 'number'
                    ? formatUsd(totalUsd)
                    : ''}
              </div>
              {typeof perc === 'number' ? (
                <ProfitLossPercChip value={perc} size="xs" showSign={true} />
              ) : null}
            </div>
          );
        },
        meta: { align: 'right' },
      },
      {
        id: 'volume',
        header: 'VOLUME',
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {formatUsd(row.original.volume)}
          </div>
        ),
        meta: { align: 'right' },
      },
      {
        id: 'equityUsd',
        header: '$ EQUITY',
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {formatUsd(row.original.equity)}
          </div>
        ),
        meta: { align: 'right' },
      },
      {
        id: 'equity',
        header: 'EQUITY',
        cell: ({ row }) => {
          const eq = row.original.equityInAsset;
          const baseName = row.original.symbol?.baseAsset?.name;
          const quoteName = row.original.symbol?.quoteAsset?.name;
          if (!eq || (!eq.base && !eq.quote))
            return <div className="text-sm">N/A</div>;
          return (
            <div className="text-sm tabular-nums">
              <div>
                {baseName ?? 'BASE'}: {eq.base}
              </div>
              <div>
                {quoteName ?? 'QUOTE'}: {eq.quote}
              </div>
            </div>
          );
        },
      },
      {
        id: 'duration',
        header: 'DURATION',
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {formatSplitDuration(row.original.splitDuration)}
          </div>
        ),
      },
      {
        id: 'dealOrders',
        header: 'DEAL ORDERS',
        cell: ({ row }) => {
          const complete = row.original.levels?.complete ?? 0;
          const all = row.original.levels?.all ?? 0;
          const max = row.original.levels?.max ?? 0;
          const maxSuffix = max && max !== all ? ` (max ${max})` : '';
          return (
            <div className="text-sm tabular-nums whitespace-nowrap">{`${complete}/${all}${maxSuffix}`}</div>
          );
        },
        meta: { align: 'right' },
      },
      {
        id: 'avgPrice',
        header: 'AV. PRICE',
        cell: ({ row }) => {
          const precision =
            row.original.symbol?.priceAssetPrecision ?? backtest.precision ?? 8;
          const quote =
            row.original.symbol?.quoteAsset?.name ?? backtest.quoteAsset;
          return (
            <div className="text-sm tabular-nums whitespace-nowrap">
              {`${math.convertFromExponential(row.original.avgPrice ?? 0, precision)} ${quote}`}
            </div>
          );
        },
        meta: { align: 'right' },
      },
      {
        id: 'startPrice',
        header: 'START PRICE',
        cell: ({ row }) => {
          const precision =
            row.original.symbol?.priceAssetPrecision ?? backtest.precision ?? 8;
          const quote =
            row.original.symbol?.quoteAsset?.name ?? backtest.quoteAsset;
          return (
            <div className="text-sm tabular-nums whitespace-nowrap">
              {`${math.convertFromExponential(row.original.startPrice ?? 0, precision)} ${quote}`}
            </div>
          );
        },
        meta: { align: 'right' },
      },
      {
        id: 'closePrice',
        header: 'CLOSE PRICE',
        cell: ({ row }) => {
          const precision =
            row.original.symbol?.priceAssetPrecision ?? backtest.precision ?? 8;
          const quote =
            row.original.symbol?.quoteAsset?.name ?? backtest.quoteAsset;
          const close = row.original.closePrice;
          return (
            <div className="text-sm tabular-nums whitespace-nowrap">
              {typeof close === 'number'
                ? `${math.convertFromExponential(close, precision)} ${quote}`
                : ''}
            </div>
          );
        },
        meta: { align: 'right' },
      },
    ],
    [backtest.precision, backtest.quoteAsset, backtest.settings]
  );

  return (
    <div className="h-full p-md">
      <DataTable
        tableId="backtest-deals-table"
        columns={columns}
        data={deals}
        enableGlobalFilter={true}
        enableSorting={true}
        enableColumnVisibility={true}
        showPagination={true}
        initialPageSize={10}
        emptyMessage="No deals available"
        className="h-full"
      />
    </div>
  );
}
