import type { ColumnDef } from '@tanstack/react-table';
import { FileUp, MoreVertical, Trash2, Upload } from 'lucide-react';

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
import { BotTypesEnum } from '@/types';
import type { HedgeBacktestHistoryItem } from '@/hooks/bots/hedge/useHedgeBacktestRunner';

/**
 * Hedge backtest table columns — the hedge counterpart to
 * dca-backtest-columns.tsx, giving the local hedge history list the same
 * financial / duration / numerical / usage / ratios breadth, Name, inline
 * Notes, and a row Actions menu.
 *
 * Two deliberate divergences from the DCA set, both hedge-legitimate:
 *  - "Pairs" replaces DCA's single "Pair": a hedge run spans two pairs
 *    ("long over short"), so the cell stacks the long leg's CoinPair over
 *    the short leg's.
 *  - No "Server Side" column and no Share / Export-JSON / Import-as-paper
 *    row actions: hedge backtests are local-only (no server-side variant
 *    and no hedge share/import/export endpoints — see useHedgeBacktestRunner).
 *    Rather than fake disabled entries we simply omit them.
 *
 * All metrics live under `hedgeResult` (the combined aggregate) — the same
 * shape as a DCA result's financial/duration/usage/numerical/ratios — so the
 * cells mirror the DCA ones with a `.hedgeResult` hop.
 *
 * Column `id`s are stable and drive sort/visibility persistence keyed by the
 * table id; do NOT rename them or existing users' saved column prefs reset.
 */
export interface HedgeBacktestColumnContext {
  /** Picks the right "save permanently" / note mutation variant. */
  hedgeBotType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
  backtestNoteOverrides: Record<string, string>;
  onSaveNote: (id: string, next: string, prev: string) => void;
  /** Post-success local patch after the checkbox flips savePermanent. */
  onToggleSavePermanent: (id: string, next: boolean) => void;
  /** "Load in settings" — reseed both legs' form from this backtest. */
  onLoadIntoForm: (bt: HedgeBacktestHistoryItem) => void;
  /** "Load details" — open the results modal for this row. */
  onLoadDetails: (bt: HedgeBacktestHistoryItem) => void;
  onDelete: (ids: string[]) => void;
}

/**
 * Default visibility: mirror the DCA/Grid convention of surfacing a lean set
 * up front and hiding the deep metrics behind the column-visibility menu.
 * Unlisted columns default to visible.
 */
export const defaultHedgeBacktestColumnVisibility: Record<string, boolean> = {
  savePermanent: false,
  note: false,
  'financial.avgNetDailyPerc': false,
  'financial.annualizedReturn': false,
  'financial.maxDrawDownEquityPerc': false,
  'financial.unrealizedPnL': false,
  'duration.botWorkingTime': false,
  'duration.firstDataTime': false,
  'duration.lastDataTime': false,
  'duration.periodName': false,
  'duration.maxDealDuration': false,
  'numerical.actualPriceDeviation': false,
  'numerical.avgDCATriggered': false,
  'numerical.dealsPerDay': false,
  'usage.avgRealUsage': false,
  'ratios.buyAndHold.perc': false,
  'ratios.profitFactor': false,
  'ratios.sharpe': false,
  'ratios.sortino': false,
  'ratios.cwr': false,
};

export function buildHedgeBacktestColumns(
  ctx: HedgeBacktestColumnContext
): ColumnDef<HedgeBacktestHistoryItem>[] {
  const {
    hedgeBotType,
    backtestNoteOverrides,
    onSaveNote,
    onToggleSavePermanent,
    onLoadIntoForm,
    onLoadDetails,
    onDelete,
  } = ctx;

  return [
    {
      id: 'pairs',
      header: 'Pairs',
      // Flatten both symbols for global filter + sort.
      accessorFn: (row) => `${row.long.symbol} ${row.short.symbol}`,
      cell: ({ row }) => {
        const { long, short } = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            {long.baseAsset && long.quoteAsset ? (
              <CoinPair
                baseAsset={long.baseAsset}
                quoteAsset={long.quoteAsset}
                iconSize="sm"
                showText
              />
            ) : (
              <span className="text-sm font-medium">{long.symbol}</span>
            )}
            {short.baseAsset && short.quoteAsset ? (
              <CoinPair
                baseAsset={short.baseAsset}
                quoteAsset={short.quoteAsset}
                iconSize="sm"
                showText
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {short.symbol}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'savePermanent',
      header: 'Save Permanently',
      cell: ({ row }) => (
        <BacktestPermanentCheckbox
          id={row.original._id ?? ''}
          type={hedgeBotType}
          checked={!!row.original.savePermanent}
          onToggled={(next) =>
            onToggleSavePermanent(row.original._id ?? '', next)
          }
        />
      ),
    },
    {
      id: 'name',
      header: 'Name',
      // Both legs carry the shared hedge name (handleSave fans it out), so
      // the long leg's is representative.
      accessorFn: (row) => row.long.settings?.name ?? '',
      cell: ({ row }) => (
        <div className="font-medium">{row.original.long.settings?.name || ''}</div>
      ),
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
      id: 'financial.avgNetDailyPerc',
      header: 'Avg. Net Daily',
      accessorFn: (row) => row.hedgeResult.financial?.avgNetDailyPerc ?? 0,
      cell: ({ getValue }) => (
        <ProfitLossPercChip value={(getValue() as number) ?? 0} size="sm" />
      ),
    },
    {
      id: 'financial.annualizedReturn',
      header: 'Annualized Return',
      accessorFn: (row) => row.hedgeResult.financial?.annualizedReturn ?? null,
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
        if (value === null || value === undefined)
          return <span className="text-muted-foreground">-</span>;
        return <ProfitLossPercChip value={value} size="sm" />;
      },
    },
    {
      id: 'financial.maxDrawDownPerc',
      header: '% Max. Draw Down',
      accessorFn: (row) => row.hedgeResult.financial?.maxDrawDownPerc ?? 0,
      cell: ({ getValue }) => {
        const value = (getValue() as number) ?? 0;
        // Drawdown is always shown as negative.
        return <ProfitLossPercChip value={-Math.abs(value)} size="sm" />;
      },
    },
    {
      id: 'financial.maxDrawDownEquityPerc',
      header: '% Max. Equity Draw Down',
      accessorFn: (row) =>
        row.hedgeResult.financial?.maxDrawDownEquityPerc ?? null,
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
        if (value === null || value === undefined)
          return <span className="text-muted-foreground">-</span>;
        return <ProfitLossPercChip value={-Math.abs(value)} size="sm" />;
      },
    },
    {
      id: 'financial.netProfitTotalPerc',
      header: '% Net Profit',
      accessorFn: (row) => row.hedgeResult.financial?.netProfitTotalPerc ?? 0,
      cell: ({ getValue }) => (
        <ProfitLossPercChip
          value={(getValue() as number) ?? 0}
          size="sm"
          showSign
        />
      ),
    },
    {
      id: 'financial.unrealizedPnL',
      header: 'Unrealized Profit',
      accessorFn: (row) => row.hedgeResult.financial?.unrealizedPnL ?? 0,
      cell: ({ getValue }) => {
        const value = (getValue() as number) ?? 0;
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
      id: 'duration.botWorkingTime',
      header: 'Bot Working Time',
      accessorFn: (row) => row.hedgeResult.duration?.botWorkingTime?.d ?? 0,
      cell: ({ row }) => {
        const workingTime = row.original.hedgeResult.duration?.botWorkingTime;
        if (!workingTime) return <div className="text-sm">N/A</div>;
        return (
          <div className="text-sm text-muted-foreground">
            {workingTime.d || 0}d {workingTime.h || 0}h {workingTime.min || 0}m
          </div>
        );
      },
    },
    {
      id: 'duration.firstDataTime',
      header: 'Start Date',
      accessorFn: (row) => row.hedgeResult.duration?.firstDataTime ?? 0,
      cell: ({ row }) => {
        const t = row.original.hedgeResult.duration?.firstDataTime;
        return (
          <div className="text-sm text-muted-foreground">
            {t ? new Date(t).toLocaleString() : 'N/A'}
          </div>
        );
      },
    },
    {
      id: 'duration.lastDataTime',
      header: 'End Date',
      accessorFn: (row) => row.hedgeResult.duration?.lastDataTime ?? 0,
      cell: ({ row }) => {
        const t = row.original.hedgeResult.duration?.lastDataTime;
        return (
          <div className="text-sm text-muted-foreground">
            {t ? new Date(t).toLocaleString() : 'N/A'}
          </div>
        );
      },
    },
    {
      id: 'duration.periodName',
      header: 'Testing Period Name',
      accessorFn: (row) => row.hedgeResult.duration?.periodName ?? '',
      cell: ({ row }) => (
        <div className="text-sm">
          {row.original.hedgeResult.duration?.periodName || 'N/A'}
        </div>
      ),
    },
    {
      id: 'duration.maxDealDuration',
      header: 'Max Deal Duration',
      accessorFn: (row) => row.hedgeResult.duration?.maxDealDuration?.d ?? 0,
      cell: ({ row }) => {
        const maxDuration = row.original.hedgeResult.duration?.maxDealDuration;
        if (!maxDuration) return <div className="text-sm">N/A</div>;
        return (
          <div className="text-sm text-muted-foreground">
            {maxDuration.d || 0}d {maxDuration.h || 0}h {maxDuration.min || 0}m
          </div>
        );
      },
    },
    {
      id: 'numerical.actualPriceDeviation',
      header: 'Actual Price Deviation',
      accessorFn: (row) => row.hedgeResult.numerical?.actualPriceDeviation,
      cell: ({ getValue }) => {
        const value = getValue() as number | undefined;
        return (
          <div className="text-sm">{value !== undefined ? value : 'N/A'}</div>
        );
      },
    },
    {
      id: 'numerical.all',
      header: 'Deals',
      accessorFn: (row) => row.hedgeResult.numerical?.all ?? 0,
      cell: ({ getValue }) => (
        <div className="text-sm font-medium">{(getValue() as number) || 0}</div>
      ),
    },
    {
      id: 'numerical.avgDCATriggered',
      header: 'Avg DCA Orders Triggered',
      accessorFn: (row) => row.hedgeResult.numerical?.avgDCATriggered ?? 0,
      cell: ({ getValue }) => (
        <div className="text-sm">{(getValue() as number) || 0}</div>
      ),
    },
    {
      id: 'numerical.dealsPerDay',
      header: 'Deals Per Day',
      accessorFn: (row) => row.hedgeResult.numerical?.dealsPerDay ?? 0,
      cell: ({ getValue }) => (
        <div className="text-sm">
          {((getValue() as number) ?? 0).toFixed(1)}
        </div>
      ),
    },
    {
      id: 'usage.avgRealUsage',
      header: 'Avg Real Usage',
      accessorFn: (row) => row.hedgeResult.usage?.avgRealUsage ?? 0,
      cell: ({ getValue }) => (
        <div className="text-sm">
          {((getValue() as number) ?? 0).toFixed(3)}
        </div>
      ),
    },
    {
      id: 'ratios.buyAndHold.perc',
      header: 'Buy and Hold Return',
      accessorFn: (row) => row.hedgeResult.ratios?.buyAndHold?.perc ?? null,
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
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
      id: 'ratios.profitFactor',
      header: 'Profit Factor',
      accessorFn: (row) => row.hedgeResult.ratios?.profitFactor ?? null,
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
        if (value === null || value === undefined)
          return <div className="text-sm">∞</div>;
        return <div className="text-sm">{value.toFixed(2)}</div>;
      },
    },
    {
      id: 'ratios.sharpe',
      header: 'Sharpe Ratio',
      accessorFn: (row) => row.hedgeResult.ratios?.sharpe ?? null,
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <div className="text-sm">{value.toFixed(3)}</div>;
      },
    },
    {
      id: 'ratios.sortino',
      header: 'Sortino Ratio',
      accessorFn: (row) => row.hedgeResult.ratios?.sortino ?? null,
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
        if (value === null || value === undefined)
          return <div className="text-sm">-</div>;
        return <div className="text-sm">{value.toFixed(3)}</div>;
      },
    },
    {
      id: 'ratios.cwr',
      header: 'CWR',
      accessorFn: (row) => row.hedgeResult.ratios?.cwr ?? null,
      cell: ({ getValue }) => {
        const value = getValue() as number | null;
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
                <DropdownMenuItem onClick={() => onLoadIntoForm(backtest)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Load in settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onLoadDetails(backtest)}>
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
