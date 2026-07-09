import type { ColumnDef } from '@tanstack/react-table';
import {
  Database,
  FileUp,
  MoreVertical,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';

import type { BacktestColumnContext } from '@/components/bots/workbench/descriptors/types';
import { Button } from '@/components/ui/button';
import { ProfitLossPercChip, StrategyChip } from '@/components/ui/chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import InlineNoteCell from '@/components/ui/InlineNoteCell';
import { BacktestPermanentCheckbox } from '@/components/widgets/bots/backtest';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { BotTypesEnum, type DCABacktestingResultHistory } from '@/types';

/**
 * DCA backtest table columns — lifted verbatim from BotBacktestPanel's inline
 * useMemo. The 30 columns (Pair..Notes + actions), accessorKeys, and cells are
 * unchanged; the previously closed-over handlers/state are now read off `ctx`.
 *
 * accessorKeys drive sort/visibility persistence keyed by the table id — do
 * NOT rename or drop any, or existing users' saved column prefs silently reset.
 */
export function buildDcaBacktestColumns(
  ctx: BacktestColumnContext<DCABacktestingResultHistory>
): ColumnDef<DCABacktestingResultHistory>[] {
  const {
    user,
    backtestNoteOverrides,
    onSaveNote,
    onShare,
    onLoadIntoForm,
    onLoadDetails,
    onDelete,
    onImportAsPaper,
  } = ctx;

  return [
    {
      accessorKey: 'symbol',
      header: 'Pair',
      cell: ({ row }) => {
        const baseAsset = row.original.baseAsset;
        const quoteAsset = row.original.quoteAsset;

        if (!baseAsset || !quoteAsset) {
          return <span className="text-muted-foreground">N/A</span>;
        }

        return (
          <CoinPair
            baseAsset={baseAsset}
            quoteAsset={quoteAsset}
            iconSize="sm"
            showText={true}
          />
        );
      },
    },
    {
      accessorKey: 'serverSide',
      header: 'Server Side',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.serverSide === null
            ? 'no'
            : row.original.serverSide
              ? 'yes'
              : 'no'}
        </div>
      ),
    },
    {
      accessorKey: 'savePermanent',
      header: 'Save Permanently',
      cell: ({ row }) => (
        <BacktestPermanentCheckbox
          id={row.original._id ?? ''}
          type={BotTypesEnum.dca}
          checked={!!row.original.savePermanent}
        />
      ),
    },
    {
      accessorKey: 'settings.name',
      header: 'Name',
      cell: ({ row }) => {
        const hasLocalData = (row.original.deals?.length ?? 0) > 0;
        return (
          <div className="font-medium inline-flex items-center gap-1">
            <span>{row.original.settings?.name || ''}</span>
            {hasLocalData ? (
              <span title="Local backtest details available">
                <Database
                  className="h-3.5 w-3.5 text-primary"
                  aria-label="Local backtest details available"
                />
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'settings.startCondition',
      header: 'Start Condition',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.settings?.startCondition || 'N/A'}
        </div>
      ),
    },
    {
      accessorKey: 'settings.strategy',
      header: 'Strategy',
      cell: ({ row }) => {
        const strategy = row.original.settings?.strategy || 'LONG';
        return <StrategyChip strategy={strategy} size="sm" />;
      },
    },
    {
      accessorKey: 'time',
      header: 'Created Time',
      cell: ({ row }) => {
        const date = row.original.time
          ? new Date(row.original.time).toLocaleString()
          : 'N/A';
        return <div className="text-sm text-muted-foreground">{date}</div>;
      },
    },
    {
      accessorKey: 'financial.avgNetDailyPerc',
      header: 'Avg. Net Daily',
      cell: ({ row }) => {
        const value = row.original.financial?.avgNetDailyPerc || 0;
        return <ProfitLossPercChip value={value} size="sm" />;
      },
    },
    {
      accessorKey: 'financial.annualizedReturn',
      header: 'Annualized Return',
      cell: ({ row }) => {
        const value = row.original.financial?.annualizedReturn;
        if (value === null || value === undefined)
          return <span className="text-muted-foreground">-</span>;
        return <ProfitLossPercChip value={value} size="sm" />;
      },
    },
    {
      accessorKey: 'financial.maxDrawDownPerc',
      header: '% Max. Draw Down',
      cell: ({ row }) => {
        const value = row.original.financial?.maxDrawDownPerc || 0;
        // Drawdown is always shown as negative
        return <ProfitLossPercChip value={-Math.abs(value)} size="sm" />;
      },
    },
    {
      accessorKey: 'financial.maxDrawDownEquityPerc',
      header: '% Max. Equity Draw Down',
      cell: ({ row }) => {
        const value = row.original.financial?.maxDrawDownEquityPerc;
        if (value === null || value === undefined)
          return <span className="text-muted-foreground">-</span>;
        // Drawdown is always shown as negative
        return <ProfitLossPercChip value={-Math.abs(value)} size="sm" />;
      },
    },
    {
      accessorKey: 'financial.netProfitTotalPerc',
      header: '% Net Profit',
      cell: ({ row }) => {
        const value = row.original.financial?.netProfitTotalPerc || 0;
        return <ProfitLossPercChip value={value} size="sm" showSign={true} />;
      },
    },
    {
      accessorKey: 'financial.unrealizedPnL',
      header: 'Unrealized Profit',
      cell: ({ row }) => {
        const value = row.original.financial?.unrealizedPnL || 0;
        const isPositive = value >= 0;
        return (
          <span
            className={`text-sm font-medium ${isPositive ? 'text-profit' : 'text-loss'}`}
          >
            {isPositive ? '+' : ''}
            {value.toFixed(8)}
          </span>
        );
      },
    },
    {
      accessorKey: 'duration.botWorkingTimeNumber',
      header: 'Bot Working Time',
      cell: ({ row }) => {
        const workingTime = row.original.duration?.botWorkingTime;
        if (!workingTime) return <div className="text-sm">N/A</div>;
        const d = workingTime.d || 0;
        const h = workingTime.h || 0;
        const min = workingTime.min || 0;
        return (
          <div className="text-sm text-muted-foreground">
            {d}d {h}h {min}m
          </div>
        );
      },
    },
    {
      accessorKey: 'duration.firstDataTime',
      header: 'Start Date',
      cell: ({ row }) => {
        const date = row.original.duration?.firstDataTime
          ? new Date(row.original.duration.firstDataTime).toLocaleString()
          : 'N/A';
        return <div className="text-sm text-muted-foreground">{date}</div>;
      },
    },
    {
      accessorKey: 'duration.lastDataTime',
      header: 'End Date',
      cell: ({ row }) => {
        const date = row.original.duration?.lastDataTime
          ? new Date(row.original.duration.lastDataTime).toLocaleString()
          : 'N/A';
        return <div className="text-sm text-muted-foreground">{date}</div>;
      },
    },
    {
      accessorKey: 'duration.periodName',
      header: 'Testing Period Name',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.duration?.periodName || 'N/A'}
        </div>
      ),
    },
    {
      accessorKey: 'duration.maxDealDuration',
      header: 'Max Deal Duration',
      cell: ({ row }) => {
        const maxDuration = row.original.duration?.maxDealDuration;
        if (!maxDuration) return <div className="text-sm">N/A</div>;
        const d = maxDuration.d || 0;
        const h = maxDuration.h || 0;
        const min = maxDuration.min || 0;
        return (
          <div className="text-sm text-muted-foreground">
            {d}d {h}h {min}m
          </div>
        );
      },
    },
    {
      accessorKey: 'interval',
      header: 'Interval',
      cell: ({ row }) => (
        <div className="text-sm">{row.original.interval || 'N/A'}</div>
      ),
    },
    {
      accessorKey: 'numerical.actualPriceDeviation',
      header: 'Actual Price Deviation',
      cell: ({ row }) => {
        const value = row.original.numerical?.actualPriceDeviation;
        return (
          <div className="text-sm">{value !== undefined ? value : 'N/A'}</div>
        );
      },
    },
    {
      accessorKey: 'numerical.all',
      header: 'Deals',
      cell: ({ row }) => (
        <div className="text-sm font-medium">
          {row.original.numerical?.all || 0}
        </div>
      ),
    },
    {
      accessorKey: 'numerical.avgDCATriggered',
      header: 'Avg DCA Orders Triggered',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.numerical?.avgDCATriggered || 0}
        </div>
      ),
    },
    {
      accessorKey: 'numerical.dealsPerDay',
      header: 'Deals Per Day',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.numerical?.dealsPerDay?.toFixed(1) || '0.0'}
        </div>
      ),
    },
    {
      accessorKey: 'usage.avgRealUsage',
      header: 'Avg Real Usage',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.usage?.avgRealUsage?.toFixed(3) || '0.000'}
        </div>
      ),
    },
    {
      accessorKey: 'ratios.buyAndHold.perc',
      header: 'Buy and Hold Return',
      cell: ({ row }) => {
        const value = row.original.ratios?.buyAndHold?.perc;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        const isPositive = value >= 0;
        return (
          <div
            className={`text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}
          >
            {isPositive ? '+' : ''}
            {value.toFixed(2)}%
          </div>
        );
      },
    },
    {
      accessorKey: 'ratios.profitFactor',
      header: 'Profit Factor',
      cell: ({ row }) => {
        const value = row.original.ratios?.profitFactor;
        if (value === null || value === undefined)
          return <div className="text-sm">∞</div>;
        return <div className="text-sm">{value.toFixed(2)}</div>;
      },
    },
    {
      accessorKey: 'ratios.sharpe',
      header: 'Sharpe Ratio',
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
      cell: ({ row }) => {
        const value = row.original.ratios?.sortino;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <div className="text-sm">{value.toFixed(3)}</div>;
      },
    },
    {
      accessorKey: 'ratios.cwr',
      header: 'CWR',
      cell: ({ row }) => {
        const value = row.original.ratios?.cwr;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <div className="text-sm">{value.toFixed(4)}</div>;
      },
    },
    {
      accessorKey: 'note',
      header: 'Notes',
      size: 200,
      cell: ({ row }) => {
        const backtestId = row.original._id ?? '';
        const currentNote =
          backtestNoteOverrides[backtestId] ?? row.original.note ?? '';
        return (
          <InlineNoteCell
            id={backtestId}
            note={currentNote}
            onSave={onSaveNote}
          />
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: {
        pinned: 'right',
      },
      cell: ({ row }) => {
        const backtest = row.original;
        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onShare(backtest)}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onLoadIntoForm(backtest)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Load in settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void onLoadDetails(backtest)}>
                  <FileUp className="mr-2 h-4 w-4" />
                  Load details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete([backtest._id])}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
                {user?.importAsPaper && (
                  <DropdownMenuItem
                    onClick={() => void onImportAsPaper(backtest)}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Import as paper bot
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
