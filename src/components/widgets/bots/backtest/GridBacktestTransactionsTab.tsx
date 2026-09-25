import { DataTable } from '@/components/ui/data-table/data-table';
import { Checkbox } from '@/components/ui/checkbox';
import TradingViewChart, {
  type TradingViewChartRef,
} from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import {
  dealToTradingView,
  intervalToResolution,
} from '@/components/widgets/bots/backtest/redesign/dealToTradingView';
import type {
  GRIDBacktestingResultHistory,
  PreparedDeal,
  PreparedTransaction,
  Symbols,
} from '@/types';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useRef, useState } from 'react';

interface GridBacktestTransactionsTabProps {
  backtest: GRIDBacktestingResultHistory;
}

const formatUsd = (value: number | undefined | null) => {
  if (value === undefined || value === null) return '-';
  return `$${value.toFixed(2)}`;
};

/**
 * Adapt a grid backtest result into the read-only chart props the per-deal
 * `TradingViewChart` already understands.
 *
 * Unlike DCA/combo, a grid result does NOT populate `ordersHistory` with real
 * lines (it carries only a junk price-0 `avgLine` artifact). The grid's resting
 * levels live in `orders` (`{ price, side, qty, id }`, no timestamps), so we
 * synthesize one history entry per level spanning the whole run window — each
 * renders as a horizontal grid line via the plain per-entry branch (no
 * minigrids). Buy/sell fill markers come from `transaction`. Exact per-fill line
 * ends aren't available here, which is acceptable for grid. Returns `null` when
 * the result lacks a resolvable symbol.
 */
function gridChartProps(backtest: GRIDBacktestingResultHistory) {
  const pair = backtest.symbol;
  const exchange = backtest.exchange;
  if (!pair || !exchange) return null;

  const symbol: Symbols = {
    pair,
    exchange,
    baseAsset: { name: backtest.baseAsset ?? '', minAmount: 0, maxAmount: 0, step: 0 },
    quoteAsset: { name: backtest.quoteAsset ?? '', minAmount: 0 },
    maxOrders: 0,
    priceAssetPrecision: 0,
  };

  const firstDataTime = backtest.duration?.firstDataTime ?? 0;
  const lastDataTime = backtest.duration?.lastDataTime ?? firstDataTime;

  // Grid levels → synthetic full-window history entries (no `filledTime`, so the
  // per-entry branch runs each line across the whole window).
  const gridLines = (backtest.orders ?? []).map((o) => ({
    price: o.price,
    side: o.side,
    id: o.id,
    startTime: firstDataTime,
  }));

  // Minimal PreparedDeal — `dealToTradingView` only reads symbol, ordersHistory,
  // filledOrders, mingrids, transactions, startTime, closedTime.
  const pseudoDeal = {
    symbol,
    ordersHistory: gridLines,
    filledOrders: [],
    mingrids: [],
    transactions: backtest.transaction ?? [],
    startTime: firstDataTime,
    closedTime: undefined,
  } as unknown as PreparedDeal;

  return dealToTradingView(
    pseudoDeal,
    intervalToResolution(backtest.interval),
    lastDataTime,
  );
}

export function GridBacktestTransactionsTab({
  backtest,
}: GridBacktestTransactionsTabProps) {
  const chartRef = useRef<TradingViewChartRef>(null);
  const [showLines, setShowLines] = useState(true);
  const [showIcons, setShowIcons] = useState(true);

  const chartProps = useMemo(() => gridChartProps(backtest), [backtest]);

  const columns = useMemo<ColumnDef<PreparedTransaction>[]>(
    () => [
      {
        accessorKey: 'index',
        header: '#',
        meta: { filterType: 'number' },
        cell: ({ row }) => <div className="text-sm">{row.original.index}</div>,
      },
      {
        accessorKey: 'updateTime',
        header: 'Time',
        meta: { filterType: 'date' },
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {row.original.updateTime
              ? new Date(row.original.updateTime).toLocaleString()
              : '-'}
          </div>
        ),
      },
      {
        accessorKey: 'side',
        header: 'Side',
        meta: { filterType: 'array' },
        cell: ({ row }) => (
          <div className="text-sm">{String(row.original.side ?? '-')}</div>
        ),
      },
      {
        accessorKey: 'priceBuy',
        header: 'Buy price',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {row.original.priceBuy || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'priceSell',
        header: 'Sell price',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {row.original.priceSell || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'amountQuoteBuy',
        header: 'Quote buy',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {row.original.amountQuoteBuy || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'amountQuoteSell',
        header: 'Quote sell',
        meta: { filterType: 'number' },
        cell: ({ row }) => (
          <div className="text-sm tabular-nums">
            {row.original.amountQuoteSell || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'profitUsd',
        header: 'P&L (USD)',
        meta: { filterType: 'number' },
        cell: ({ row }) => {
          const value = row.original.profitUsd;
          return <div className="text-sm tabular-nums">{formatUsd(value)}</div>;
        },
      },
      {
        id: 'profitPerc',
        header: 'P&L %',
        cell: (/* { row } */) => {
          // PreparedTransaction doesn’t include a percent; show nothing.
          // Keep the column so layout matches other tables.
          return <span className="text-muted-foreground">-</span>;
        },
      },
    ],
    []
  );

  const rows = backtest.transaction ?? [];

  // Clicking a transaction pans the chart to that execution's time.
  const focusTransaction = (t: PreparedTransaction) => {
    if (t.updateTime) chartRef.current?.centerAtTimestampMs(t.updateTime);
  };

  return (
    <div className="flex h-full w-full flex-col gap-3">
      {chartProps?.symbol && (
        <div className="flex shrink-0 flex-col">
          <div className="mb-2 flex items-center justify-end gap-4 text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-1.5">
              <Checkbox
                checked={showLines}
                onCheckedChange={(v) => setShowLines(v === true)}
              />
              Lines
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <Checkbox
                checked={showIcons}
                onCheckedChange={(v) => setShowIcons(v === true)}
              />
              Icons
            </label>
          </div>
          <div className="h-[340px] overflow-hidden rounded-lg">
            <TradingViewChart
              ref={chartRef}
              widgetId="grid-backtest-chart"
              symbol={chartProps.symbol}
              availableSymbols={chartProps.availableSymbols}
              interval={chartProps.interval}
              initialTimeframe={chartProps.initialTimeframe}
              transactions={chartProps.transactions}
              ordersForDrawing={chartProps.ordersForDrawing}
              enableAutoSave={false}
              enableLoadLastChart={false}
              enableSeparateDrawingsStorage={false}
              showPastOrders={showLines}
              showTransactions={showIcons}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <DataTable
          tableId={`grid-backtest-transactions-${backtest._id}`}
          columns={columns}
          data={rows}
          enableGlobalFilter={true}
          enableSorting={true}
          enableColumnVisibility={true}
          showPagination={true}
          initialPageSize={10}
          emptyMessage="No transactions"
          className="h-full"
          onRowClick={focusTransaction}
        />
      </div>
    </div>
  );
}
