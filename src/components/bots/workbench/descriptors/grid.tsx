import { buildGridBacktestColumns } from '@/components/bots/panels/contents/insights/columns/grid-backtest-columns';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  GridBacktestEquityCurveTab,
  GridBacktestOverviewTab,
  GridBacktestStatsTab,
  GridBacktestTransactionsTab,
} from '@/components/widgets/bots/backtest';
import { useGridBacktests } from '@/hooks/useGridBacktests';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { BotTypesEnum, type GRIDBacktestingResultHistory } from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';

import type { BotPageDescriptor } from './types';

/**
 * Grid share-viewer tabs (Overview / Transactions / Equity Curve / Stats),
 * lifted verbatim from GridBotNew.tsx's `?backtestShare=` block. Supplied via
 * `renderShareContent` so the unified panel doesn't fall back to DCA tabs over
 * grid data.
 */
function GridShareTabs({
  backtest,
}: {
  backtest: GRIDBacktestingResultHistory;
}) {
  return (
    <Tabs defaultValue="bt-overview" className="w-full">
      <TabsList>
        <TabsTrigger value="bt-overview">Overview</TabsTrigger>
        <TabsTrigger value="bt-transactions">Transactions</TabsTrigger>
        <TabsTrigger value="bt-equity">Equity Curve</TabsTrigger>
        <TabsTrigger value="bt-stats">Stats</TabsTrigger>
      </TabsList>
      <TabsContent value="bt-overview" className="mt-md">
        <GridBacktestOverviewTab backtest={backtest} />
      </TabsContent>
      <TabsContent value="bt-transactions" className="mt-md">
        <GridBacktestTransactionsTab backtest={backtest} />
      </TabsContent>
      <TabsContent value="bt-equity" className="mt-md">
        <GridBacktestEquityCurveTab backtest={backtest} />
      </TabsContent>
      <TabsContent value="bt-stats" className="mt-md">
        <GridBacktestStatsTab backtest={backtest} />
      </TabsContent>
    </Tabs>
  );
}

export const gridPageDescriptor: BotPageDescriptor<GRIDBacktestingResultHistory> =
  {
    botType: BotTypesEnum.grid,
    layoutType: 'grid',
    basePath: '/grid',
    listLabel: 'grid bots',
    // Grid DOES render a chart (BotChartPanel + TVChartPicker) on both new and
    // edit — widgetIds grid-bot-chart / grid-edit-bot-chart. (Round-1 notes
    // wrongly said grid had none; the actual pages always rendered one.)
    hasChart: true,
    titles: {
      create: 'Grid Bot - New',
      edit: 'Grid Bot - Edit',
      share: 'Shared backtest',
    },
    activePage: {
      create: '/grid/new',
      edit: '/grid',
      share: '/grid/backtests',
    },
    chartWidgetId: { create: 'grid-bot-chart', edit: 'grid-edit-bot-chart' },
    formWidgetId: { create: 'grid-create-bot', edit: 'grid-edit-bot' },
    loadingDelayMs: { create: 1200, edit: 1000 },
    // Grid's edit loading state shows only the Backtests tab (no disabled Stats).
    loadingHasStatsTab: false,
    // Grid resets only example orders on unmount (no indicators).
    resetStores: [exampleOrdersStore],
    backtests: {
      kind: 'grid',
      noteType: BotTypesEnum.grid,
      resultStrategy: 'Grid',
      useList: useGridBacktests,
      useLinkedSummary: false,
      buildColumns: buildGridBacktestColumns,
      defaultColumnVisibility: {
        serverSide: false,
        savePermanent: false,
        note: false,
        'financial.profitTotal': false,
        'financial.profitTotalPerc': false,
        'financial.avgNetDailyUsd': false,
        'financial.avgTransactionProfit': false,
        'financial.initialBalances': false,
        'financial.currentBalances': false,
        'financial.valueChangeUsd': false,
        'financial.startPrice': false,
        'financial.lastPrice': false,
        'financial.breakevenPrice': false,
        'duration.firstDataTime': false,
        'duration.lastDataTime': false,
        'numerical.transactionsPerDay': false,
        'numerical.buy': false,
        'numerical.sell': false,
        'ratios.buyAndHold.perc': false,
      },
      tabKey: 'backtests',
      tabTitle: 'Backtests',
      tableId: {
        create: 'grid-backtests-table-new',
        edit: 'grid-backtests-table-edit',
      },
      sharePath: '/grid/backtests',
      shareSubKind: 'grid',
      getByShareId: botQueries.getGridBacktestByShareId,
      renderShareContent: (bt) => <GridShareTabs backtest={bt} />,
    },
  };
