import type { ColumnDef } from '@tanstack/react-table';
import { Download, MoreVertical, Trash2 } from 'lucide-react';

import {
  backtestBooleanFilterMeta,
  backtestPairFilterMeta,
  splitTimeToDays,
} from './dca-backtest-columns';
import type { BacktestColumnContext } from '@/components/bots/workbench/descriptors/types';
import { Button } from '@/components/ui/button';
import { ProfitLossPercChip } from '@/components/ui/chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InlineNoteCell from '@/components/ui/InlineNoteCell';
import { BacktestPermanentCheckbox } from '@/components/widgets/bots/backtest';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { math } from '@/lib/utils/math';
import { BotTypesEnum, type GRIDBacktestingResultHistory } from '@/types';

/**
 * Grid backtest table columns — lifted verbatim from the identical inline
 * useMemo arrays in GridBotNew.tsx / GridBotEdit.tsx. Grid's actions column is
 * Delete-only (it stops row-click propagation), so the builder reads only
 * `onDelete`, `onSaveNote`, and `backtestNoteOverrides` off `ctx`.
 *
 * accessorKeys drive sort/visibility persistence keyed by the table id — do
 * NOT rename or drop any, or existing users' saved column prefs silently reset.
 */
export function buildGridBacktestColumns(
  ctx: BacktestColumnContext<GRIDBacktestingResultHistory>
): ColumnDef<GRIDBacktestingResultHistory>[] {
  const { backtestNoteOverrides, onSaveNote, onExport, onDelete } = ctx;

  return [
    {
      accessorKey: 'symbol',
      header: 'Pair',
      meta: backtestPairFilterMeta,
      cell: ({ row }) => {
        const { baseAsset, quoteAsset } = row.original;
        if (!baseAsset || !quoteAsset)
          return <div className="text-sm">{row.original.symbol || 'N/A'}</div>;
        return (
          <CoinPair
            baseAsset={baseAsset}
            quoteAsset={quoteAsset}
            iconSize="sm"
            showText
          />
        );
      },
    },
    {
      accessorKey: 'serverSide',
      header: 'Server Side',
      meta: backtestBooleanFilterMeta('serverSide'),
      cell: ({ row }) => (
        <div className="text-sm">{row.original.serverSide ? 'yes' : 'no'}</div>
      ),
    },
    {
      accessorKey: 'savePermanent',
      header: 'Save Permanently',
      meta: backtestBooleanFilterMeta('savePermanent'),
      cell: ({ row }) => (
        <BacktestPermanentCheckbox
          id={row.original._id ?? ''}
          type={BotTypesEnum.grid}
          checked={!!row.original.savePermanent}
        />
      ),
    },
    {
      accessorKey: 'settings.name',
      header: 'Name',
      meta: { filterType: 'string' },
      cell: ({ row }) => (
        <div className="font-medium">{row.original.settings?.name || ''}</div>
      ),
    },
    {
      accessorKey: 'note',
      header: 'Notes',
      meta: { filterType: 'string' },
      size: 200,
      cell: ({ row }) => {
        const backtestId = row.original._id ?? '';
        const currentNote =
          backtestNoteOverrides[backtestId] ?? row.original.note ?? '';
        return (
          <InlineNoteCell id={backtestId} note={currentNote} onSave={onSaveNote} />
        );
      },
    },
    {
      accessorKey: 'time',
      header: 'Created Time',
      meta: { filterType: 'date' },
      cell: ({ row }) => {
        const date = row.original.time
          ? new Date(row.original.time).toLocaleString()
          : 'N/A';
        return <div className="text-sm text-muted-foreground">{date}</div>;
      },
    },
    {
      accessorKey: 'financial.profitTotalUsd',
      header: '$ Net Profit',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const usd = row.original.financial?.profitTotalUsd ?? 0;
        const perc = row.original.financial?.profitTotalPerc ?? 0;
        const isPositive = usd >= 0;
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span
              className={`text-sm font-medium ${isPositive ? 'text-profit' : 'text-loss'}`}
            >
              {isPositive ? '+' : ''}${math.round(usd)}
            </span>
            <ProfitLossPercChip value={perc} size="sm" showSign />
          </div>
        );
      },
    },
    {
      accessorKey: 'financial.profitTotal',
      header: 'P&L',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const val = row.original.financial?.profitTotal ?? 0;
        const isPositive = +val >= 0;
        return (
          <span
            className={`text-sm ${isPositive ? 'text-profit' : 'text-loss'}`}
          >
            {val} {row.original.quoteAsset}
          </span>
        );
      },
    },
    {
      accessorKey: 'financial.profitTotalPerc',
      header: '% Net Profit',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const value = row.original.financial?.profitTotalPerc || 0;
        return <ProfitLossPercChip value={value} size="sm" showSign />;
      },
    },
    {
      accessorKey: 'financial.budgetUsd',
      header: '$ Budget',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          ${math.round(row.original.financial?.budgetUsd ?? 0)}
        </div>
      ),
    },
    {
      accessorKey: 'financial.avgNetDailyPerc',
      header: 'Avg Net Daily',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const value = row.original.financial?.avgNetDailyPerc || 0;
        return <ProfitLossPercChip value={value} size="sm" />;
      },
    },
    {
      accessorKey: 'financial.avgNetDailyUsd',
      header: '$ Avg Net Daily',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          ${row.original.financial?.avgNetDailyUsd ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.annualizedReturn',
      header: 'Annualized Return',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const value = row.original.financial?.annualizedReturn;
        if (value === null || value === undefined)
          return <span className="text-muted-foreground">-</span>;
        return <ProfitLossPercChip value={value} size="sm" />;
      },
    },
    {
      accessorKey: 'financial.avgTransactionProfitUsd',
      header: '$ Avg Transaction Profit',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          ${row.original.financial?.avgTransactionProfitUsd ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.avgTransactionProfit',
      header: 'Avg Transaction Profit',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.financial?.avgTransactionProfit ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.initialBalancesUsd',
      header: '$ Initial Balances',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          ${row.original.financial?.initialBalancesUsd ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.initialBalances',
      header: 'Initial Balances',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.financial?.initialBalances ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.currentBalancesUsd',
      header: '$ Current Balances',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          ${row.original.financial?.currentBalancesUsd ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.currentBalances',
      header: 'Current Balances',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.financial?.currentBalances ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.valueChange',
      header: 'Value Change',
      meta: {
        filterType: 'number',
        // The cell shows the USD change as a percent of the initial balance.
        getNumericFilterValue: (row: unknown) => {
          const { valueChangeUsd, initialBalancesUsd } =
            (row as GRIDBacktestingResultHistory).financial ?? {};
          return initialBalancesUsd
            ? math.round((+(valueChangeUsd ?? 0) / +initialBalancesUsd) * 100)
            : 0;
        },
      },
      cell: ({ row }) => {
        const { valueChangeUsd, initialBalancesUsd } =
          row.original.financial ?? {};
        const perc = initialBalancesUsd
          ? math.round((+(valueChangeUsd ?? 0) / +initialBalancesUsd) * 100)
          : 0;
        return <ProfitLossPercChip value={perc} size="sm" />;
      },
    },
    {
      accessorKey: 'financial.valueChangeUsd',
      header: '$ Value Change',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          ${row.original.financial?.valueChangeUsd ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'financial.startPrice',
      header: 'Initial Price',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">{row.original.financial?.startPrice ?? 0}</div>
      ),
    },
    {
      accessorKey: 'financial.lastPrice',
      header: 'Last Price',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">{row.original.financial?.lastPrice ?? 0}</div>
      ),
    },
    {
      accessorKey: 'financial.breakevenPrice',
      header: 'Breakeven Price',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.financial?.breakevenPrice ?? 0}
        </div>
      ),
    },
    {
      accessorKey: 'duration.botWorkingTime',
      header: 'Bot Working Time',
      meta: {
        filterType: 'number',
        filterUnit: 'days',
        getNumericFilterValue: (row: unknown) =>
          splitTimeToDays(
            (row as GRIDBacktestingResultHistory).duration?.botWorkingTime
          ),
      },
      cell: ({ row }) => {
        const wt = row.original.duration?.botWorkingTime;
        if (!wt) return <div className="text-sm">N/A</div>;
        return (
          <div className="text-sm text-muted-foreground">
            {wt.d || 0}d {wt.h || 0}h {wt.min || 0}m
          </div>
        );
      },
    },
    {
      accessorKey: 'duration.firstDataTime',
      header: 'Start Date',
      meta: { filterType: 'date' },
      cell: ({ row }) => {
        const ts = row.original.duration?.firstDataTime;
        return (
          <div className="text-sm text-muted-foreground">
            {ts ? new Date(ts).toLocaleString() : 'N/A'}
          </div>
        );
      },
    },
    {
      accessorKey: 'duration.lastDataTime',
      header: 'End Date',
      meta: { filterType: 'date' },
      cell: ({ row }) => {
        const ts = row.original.duration?.lastDataTime;
        return (
          <div className="text-sm text-muted-foreground">
            {ts ? new Date(ts).toLocaleString() : 'N/A'}
          </div>
        );
      },
    },
    {
      accessorKey: 'duration.periodName',
      header: 'Testing Period Name',
      meta: { filterType: 'array' },
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.duration?.periodName || 'N/A'}
        </div>
      ),
    },
    {
      accessorKey: 'interval',
      header: 'Interval',
      meta: { filterType: 'array' },
      cell: ({ row }) => (
        <div className="text-sm">{row.original.interval || 'N/A'}</div>
      ),
    },
    {
      accessorKey: 'numerical.all',
      header: 'Transactions',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm font-medium">
          {row.original.numerical?.all || 0}
        </div>
      ),
    },
    {
      accessorKey: 'numerical.transactionsPerDay',
      header: 'Transactions/Day',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.numerical?.transactionsPerDay?.toFixed(1) || '0.0'}
        </div>
      ),
    },
    {
      accessorKey: 'numerical.buy',
      header: 'Buy Transactions',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">{row.original.numerical?.buy || 0}</div>
      ),
    },
    {
      accessorKey: 'numerical.sell',
      header: 'Sell Transactions',
      meta: { filterType: 'number' },
      cell: ({ row }) => (
        <div className="text-sm">{row.original.numerical?.sell || 0}</div>
      ),
    },
    {
      accessorKey: 'ratios.buyAndHold.valueUsd',
      header: '$ Buy & Hold Return',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const value = row.original.ratios?.buyAndHold?.valueUsd;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <div className="text-sm">${value}</div>;
      },
    },
    {
      accessorKey: 'ratios.buyAndHold.perc',
      header: '% Buy & Hold Return',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const value = row.original.ratios?.buyAndHold?.perc;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <ProfitLossPercChip value={value} size="sm" />;
      },
    },
    {
      accessorKey: 'ratios.sharpe',
      header: 'Sharpe Ratio',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const value = row.original.ratios?.sharpe;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <div className="text-sm">{value.toFixed(3)}</div>;
      },
    },
    {
      accessorKey: 'ratios.sortino',
      header: 'Sortino Ratio',
      meta: { filterType: 'number' },
      cell: ({ row }) => {
        const value = row.original.ratios?.sortino;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <div className="text-sm">{value.toFixed(3)}</div>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { pinned: 'right' },
      cell: ({ row }) => {
        const backtest = row.original;
        // Only locally-stored backtests (full payload hydrated in IndexedDB)
        // can be exported. Grid stores its trades under `orders`.
        const canExport = (backtest.orders?.length ?? 0) > 0;
        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!canExport}
                  onClick={(e) => {
                    e.stopPropagation();
                    onExport(backtest);
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete([backtest._id]);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
