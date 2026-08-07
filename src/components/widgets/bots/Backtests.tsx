import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import type { DCABotSettings } from '@/types';
import { type ColumnDef } from '@tanstack/react-table';
import { BarChart3, Download, MoreVertical, Trash2 } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { Badge } from '../../ui/badge';
import { Card, CardContent } from '../../ui/card';
import { DataTable } from '../../ui/data-table/data-table';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';

import {
  useDeleteBacktests,
  useExportBacktests,
  useLoadBacktestDetails,
} from '../../../hooks/useBacktestDataManagement';
import { useBacktests, type BacktestData } from '../../../hooks/useBacktests';
import { logger } from '../../../lib/loggerInstance';
import { toast } from '../../../lib/toast';
import { getById as getLocalBacktestById } from '../../../utils/backtest/db';
import { Button } from '../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';

// Transform BacktestData to UI format
interface UIBacktest {
  id: string;
  pair: string;
  serverSide: boolean;
  savePermanently: boolean;
  name: string;
  notes: string;
  startCondition: string;
  strategy: string;
  createdTime: Date;
  avgNetDaily: number;
  annualizedReturn: number;
  maxDrawDown: number;
  maxEquityDrawDown: number;
  netProfit: number;
  unrealizedProfit: number;
  botWorkingTime: string;
  startDate: Date;
  endDate: Date;
  testingPeriod: string;
  testingPeriodName: string;
  maxDealDuration: string;
  interval: string;
  actualPriceDeviation: number;
  deals: number;
  avgDCAOrdersTriggered: number;
  dealsPerDay: number;
  avgRealUsage: number;
  buyAndHoldReturn: number;
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  cwr: number;
}

// Keep original interface for backward compatibility
export type Backtest = UIBacktest;

export interface BacktestsProps {
  widgetId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  data?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  variant?: 'widget' | 'panel';
  className?: string;
}

const Backtests: React.FC<BacktestsProps> = ({
  widgetId = 'backtests',
  isEditable = false,
  onCollapse,
  onTabMove,
  menuActions,
  data: _data,
  settings: _settings,
  variant = 'widget',
  className,
}) => {
  // Get real backtest data
  const {
    backtests: rawBacktests,
    isLoading,
    error,
  } = useBacktests({
    filters: {
      page: 0,
      pageSize: 25,
    },
  });

  // Redesigned full-screen results modal — opened from a row/card click.
  // We no longer render results inline in the widget (the old
  // `BacktestDetailDrawer`); a click now opens the shared modal.
  const [resultsRow, setResultsRow] = useState<BacktestData | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);

  // Lookup from display-row id (`_id`) back to the raw `BacktestData`, which
  // still carries financial/numerical/ratios/settings the modal renders from
  // (the flattened `Backtest` display type drops those nested objects).
  const rawById = useMemo(() => {
    const map = new Map<string, BacktestData>();
    for (const bt of rawBacktests ?? []) {
      if (bt._id) map.set(bt._id, bt);
    }
    return map;
  }, [rawBacktests]);

  const loadBacktestDetailsMutation = useLoadBacktestDetails();

  // Open the bot-type-aware modal from a raw row. The list rows from the
  // server are SHORT (no deals/transaction/values), so we hydrate the full
  // result from the local IndexedDB cache — where dca/combo/grid runs are all
  // saved — before the per-deal / transactions views can render. We open
  // immediately with the short row (header is valid) and swap in the full
  // result when it resolves.
  const openResults = useCallback(
    async (raw: BacktestData) => {
      setResultsRow(raw);
      setResultsOpen(true);
      if (!raw._id) return;
      try {
        let store = await getLocalBacktestById(raw._id, true);
        if (!store?.data) {
          // Not cached yet — fetch + persist locally, then re-read.
          await loadBacktestDetailsMutation.mutateAsync({ id: raw._id });
          store = await getLocalBacktestById(raw._id, true);
        }
        if (store?.data) {
          const full = JSON.parse(store.data) as BacktestData;
          // Only apply if the user hasn't navigated to a different row.
          setResultsRow((cur) =>
            cur && cur._id === raw._id ? { ...raw, ...full } : cur,
          );
        }
      } catch (e) {
        logger.warn('[Backtests] could not load full backtest details', e);
      }
    },
    [loadBacktestDetailsMutation],
  );

  // Transform backend data to UI format
  const transformBacktestData = (data: BacktestData): Backtest => {
    const pair = Array.isArray(data.settings?.pair)
      ? data.settings.pair[0]
      : data.settings?.pair || 'Unknown';
    const startDate = data.created ? new Date(data.created) : new Date();
    const endDate = data.updated ? new Date(data.updated) : new Date();

    // Calculate testing period
    const testingPeriodMs = endDate.getTime() - startDate.getTime();
    const testingPeriodDays = Math.max(
      1,
      Math.ceil(testingPeriodMs / (24 * 60 * 60 * 1000))
    );

    // Calculate bot working time
    const workingTimeMs = data.duration?.botWorkingTime?.d
      ? data.duration.botWorkingTime.d * 24 * 60 * 60 * 1000 +
        (data.duration.botWorkingTime.h || 0) * 60 * 60 * 1000 +
        (data.duration.botWorkingTime.min || 0) * 60 * 1000
      : testingPeriodMs;

    const workingDays = Math.floor(workingTimeMs / (24 * 60 * 60 * 1000));
    const workingHours = Math.floor(
      (workingTimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
    );
    const botWorkingTime = `${workingDays}d ${workingHours}h`;

    return {
      id: data._id || `backtest-${Date.now()}`,
      pair,
      serverSide: data.serverSide || false,
      savePermanently: false, // Not available in current data structure
      name: data.settings?.name || `${pair} Backtest`,
      notes: data.settings?.notes || '',
      startCondition: data.settings?.startCondition || 'Manual',
      strategy: data.settings?.strategy || 'DCA',
      createdTime: startDate,
      avgNetDaily: data.financial?.avgNetDaily || 0,
      annualizedReturn: data.financial?.annualizedReturn || 0,
      maxDrawDown: data.financial?.maxDrawDown || 0,
      maxEquityDrawDown: data.financial?.maxDrawDownEquityPerc || 0,
      netProfit: data.financial?.netProfitTotal || 0,
      unrealizedProfit: 0, // Not available in current data structure
      botWorkingTime,
      startDate,
      endDate,
      testingPeriod: `${testingPeriodDays} days`,
      testingPeriodName: data.duration?.periodName || `${testingPeriodDays}D`,
      maxDealDuration: data.duration?.avgDealDuration
        ? `${data.duration.avgDealDuration}h`
        : '0h',
      interval: '1h', // Default interval
      actualPriceDeviation: 0, // Not available in current data structure
      deals: 0, // Not available in current data structure
      avgDCAOrdersTriggered: 0, // Not available in current data structure
      dealsPerDay: 0, // Not available in current data structure
      avgRealUsage: data.usage?.avgRealUsage || 0,
      buyAndHoldReturn: 0, // Not available in current data structure
      profitFactor: 0, // Not available in current data structure
      sharpeRatio: 0, // Would need separate calculation
      sortinoRatio: 0, // Would need separate calculation
      cwr: 0, // Would need separate calculation
    };
  };

  const backtestData = useMemo(() => {
    // Use real data if available
    if (rawBacktests && rawBacktests.length > 0) {
      return rawBacktests.map(transformBacktestData);
    }

    // Return empty array if no real data available
    return [];
  }, [rawBacktests]);

  // BacktestCard component for DataTable card view
  const BacktestCard: React.FC<{ item: Backtest; index: number }> = ({
    item: backtest,
    index: _index,
  }) => {
    const raw = rawById.get(backtest.id);
    return (
      <button
        type="button"
        className="w-full text-left"
        disabled={!raw}
        onClick={() => {
          if (raw) void openResults(raw);
        }}
      >
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardContent className="p-md">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="font-semibold text-sm">{backtest.name}</h4>
                <p className="text-xs text-muted-foreground">{backtest.pair}</p>
              </div>
              <Badge
                variant={backtest.netProfit >= 0 ? 'default' : 'destructive'}
                className="text-xs"
              >
                {backtest.netProfit >= 0 ? '+' : ''}
                {backtest.netProfit.toFixed(0)}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-xs text-xs">
              <div>
                <span className="text-muted-foreground">Return:</span>
                <span
                  className={`ml-1 font-medium ${
                    backtest.annualizedReturn >= 0
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {backtest.annualizedReturn >= 0 ? '+' : ''}
                  {backtest.annualizedReturn.toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Deals:</span>
                <span className="ml-1 font-medium">{backtest.deals}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Max DD:</span>
                <span className="ml-1 font-medium text-red-600">
                  {backtest.maxDrawDown.toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Period:</span>
                <span className="ml-1 font-medium">
                  {backtest.testingPeriod}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {backtest.createdTime.toLocaleDateString()}
                </span>
                <div className="flex items-center gap-1">
                  {backtest.serverSide && (
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      Server
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    {backtest.strategy}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </button>
    );
  };

  // Define columns for the DataTable
  const columns: ColumnDef<Backtest>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.pair}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'strategy',
      header: 'Strategy',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {row.original.strategy}
        </Badge>
      ),
    },
    {
      accessorKey: 'netProfit',
      header: 'Net Profit',
      cell: ({ row }) => (
        <div
          className={`font-medium ${
            row.original.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {row.original.netProfit >= 0 ? '+' : ''}$
          {row.original.netProfit.toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'annualizedReturn',
      header: 'Annual Return',
      cell: ({ row }) => (
        <div
          className={`font-medium ${
            row.original.annualizedReturn >= 0
              ? 'text-green-600'
              : 'text-red-600'
          }`}
        >
          {row.original.annualizedReturn >= 0 ? '+' : ''}
          {row.original.annualizedReturn.toFixed(1)}%
        </div>
      ),
    },
    {
      accessorKey: 'maxDrawDown',
      header: 'Max Drawdown',
      cell: ({ row }) => (
        <div className="font-medium text-red-600">
          {row.original.maxDrawDown.toFixed(1)}%
        </div>
      ),
    },
    {
      accessorKey: 'deals',
      header: 'Deals',
      cell: ({ row }) => (
        <div className="text-center">{row.original.deals}</div>
      ),
    },
    {
      accessorKey: 'profitFactor',
      header: 'Profit Factor',
      cell: ({ row }) => (
        <div
          className={`font-medium ${
            row.original.profitFactor >= 1 ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {row.original.profitFactor.toFixed(2)}
        </div>
      ),
    },
    {
      accessorKey: 'testingPeriod',
      header: 'Period',
      cell: ({ row }) => (
        <div className="text-sm">{row.original.testingPeriod}</div>
      ),
    },
    {
      accessorKey: 'createdTime',
      header: 'Created',
      cell: ({ row }) => (
        <div className="text-sm text-muted-foreground">
          {row.original.createdTime.toLocaleDateString()}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const bt = row.original;
        const handleExport = async () => {
          try {
            await exportBacktestsMutation.mutateAsync({ ids: [bt.id] });
            toast.success(`Exported backtest "${bt.name}"`);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'Failed to export backtest.'
            );
          }
        };

        const handleDelete = async () => {
          try {
            await deleteBacktestsMutation.mutateAsync({ ids: [bt.id] });
            toast.success(`Deleted backtest "${bt.name}"`);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : 'Failed to delete backtest.'
            );
          }
        };

        return (
          <div className="py-xs flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={handleExport}>
                  <Download className="w-3 h-3" /> Export
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDelete}>
                  <Trash2 className="w-3 h-3" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  // Backtest management mutations
  const exportBacktestsMutation = useExportBacktests();
  const deleteBacktestsMutation = useDeleteBacktests();

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalBacktests = backtestData.length;
    const profitableBacktests = backtestData.filter(
      (b: Backtest) => b.netProfit > 0
    ).length;
    const avgAnnualReturn =
      backtestData.reduce(
        (sum: number, b: Backtest) => sum + b.annualizedReturn,
        0
      ) / totalBacktests;
    const avgProfitFactor =
      backtestData.reduce(
        (sum: number, b: Backtest) => sum + b.profitFactor,
        0
      ) / totalBacktests;

    return {
      total: totalBacktests,
      profitable: profitableBacktests,
      profitablePercent:
        totalBacktests > 0 ? (profitableBacktests / totalBacktests) * 100 : 0,
      avgAnnualReturn: totalBacktests > 0 ? avgAnnualReturn : 0,
      avgProfitFactor: totalBacktests > 0 ? avgProfitFactor : 0,
    };
  }, [backtestData]);

  const containerClassName = `${variant === 'panel' ? 'flex h-full flex-col' : 'flex h-full flex-col bg-background'}${className ? ` ${className}` : ''}`;

  const renderWithChrome = (
    content: React.ReactNode,
    value: {
      primary: string | number;
      secondary?: string;
      isProfit?: boolean;
    }
  ) => {
    const body = <div className={containerClassName}>{content}</div>;

    if (variant === 'panel') {
      return body;
    }

    return (
      <WidgetWrapper
        metadata={{
          id: widgetId,
          type: 'backtests',
          title: 'Backtests',
          hasOptions: true,
          value,
        }}
        isEditable={isEditable}
        {...(onCollapse && { onCollapse })}
        {...(onTabMove && { onTabMove })}
        {...(menuActions && { menuActions })}
      >
        {body}
      </WidgetWrapper>
    );
  };

  if (isLoading) {
    const loadingContent = (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <BarChart3 className="mx-auto mb-2 h-8 w-8 animate-pulse opacity-50" />
          <div className="text-sm text-muted-foreground">
            Loading backtests...
          </div>
        </div>
      </div>
    );

    return renderWithChrome(loadingContent, {
      primary: '...',
      secondary: 'Loading...',
      isProfit: true,
    });
  }

  if (error) {
    const errorContent = (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-red-600">
          <BarChart3 className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <div className="text-sm">Failed to load backtests</div>
          <div className="mt-1 text-xs opacity-70">{error.message}</div>
        </div>
      </div>
    );

    return renderWithChrome(errorContent, {
      primary: 'Error',
      secondary: 'Failed to load',
      isProfit: false,
    });
  }

  const mainContent =
    backtestData.length === 0 ? (
      <div className="flex flex-1 items-center justify-center">
        <div className="py-8 text-center">
          <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="mb-2 text-lg font-medium">No Backtests Available</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Create your first backtest to analyze bot performance with
            historical data.
          </p>
        </div>
      </div>
    ) : (
      <>
        <DataTable
          tableId={`backtests-${widgetId}`}
          columns={columns}
          data={backtestData}
          // Row click opens the shared full-screen results modal (replaces the
          // old inline `BacktestDetailDrawer`).
          onRowClick={(rowData: Backtest) => {
            const raw = rawById.get(rowData.id);
            if (raw) void openResults(raw);
          }}
          // Bulk actions for exporting / deleting selected backtests
          bulkActions={[
            {
              id: 'export-selected',
              label: 'Export Selected',
              onAction: async (selectedRows: Backtest[]) => {
                const ids = selectedRows.map((r) => r.id);
                try {
                  await exportBacktestsMutation.mutateAsync({ ids });
                  toast.success(
                    `Exported ${ids.length} backtest${ids.length > 1 ? 's' : ''}`
                  );
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : 'Failed to export selected backtests.'
                  );
                }
              },
            },
            {
              id: 'delete-selected',
              label: 'Delete Selected',
              destructive: true,
              onAction: async (selectedRows: Backtest[]) => {
                const ids = selectedRows.map((r) => r.id);
                try {
                  await deleteBacktestsMutation.mutateAsync({ ids });
                  toast.success(
                    `Deleted ${ids.length} backtest${ids.length > 1 ? 's' : ''}`
                  );
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : 'Failed to delete selected backtests.'
                  );
                }
              },
            },
          ]}
          enableGlobalFilter={true}
          enableColumnFilters={true}
          enableSorting={true}
          enableColumnReordering={true}
          enableColumnVisibility={true}
          enableColumnResizing={true}
          enableGrouping={true}
          showPagination={true}
          className="flex-1"
          emptyMessage="No backtest results match your search criteria."
          defaultPinnedColumns={{ left: [], right: ['actions'] }}
          enableCardView={true}
          cardComponent={BacktestCard}
          cardViewBreakpoints={{
            default: 1,
            600: 2,
            900: 3,
            1200: 4,
          }}
          cardViewGap={16}
        />
        {resultsRow && (
          <BacktestResultsFullModal
            open={resultsOpen}
            onOpenChange={setResultsOpen}
            result={resultsRow}
            strategy={resultsRow.settings?.strategy}
            settings={resultsRow.settings as unknown as DCABotSettings}
            meta={{
              symbol: resultsRow.symbol,
              exchange: resultsRow.exchange,
              baseAsset: resultsRow.baseAsset,
              quoteAsset: resultsRow.quoteAsset,
            }}
            botName={
              (resultsRow.settings?.name as string | undefined) ||
              resultsRow.symbol ||
              undefined
            }
          />
        )}
      </>
    );

  return renderWithChrome(mainContent, {
    primary: summaryStats.profitable,
    secondary: `${summaryStats.profitablePercent.toFixed(0)}% profitable`,
    isProfit: summaryStats.profitablePercent > 50,
  });
};

export default Backtests;
