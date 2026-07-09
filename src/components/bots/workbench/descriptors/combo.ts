import { buildComboBacktestColumns } from '@/components/bots/panels/contents/insights/columns/combo-backtest-columns';
import { useComboBacktests } from '@/hooks/useComboBacktests';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { indicatorStore } from '@/stores/indicatorStore';
import {
  BotTypesEnum,
  type DCABacktestingResultHistory,
  type DCABotSettings,
} from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';

import type { BotPageDescriptor } from './types';

export const comboPageDescriptor: BotPageDescriptor<DCABacktestingResultHistory> =
  {
    botType: BotTypesEnum.combo,
    layoutType: 'combo',
    basePath: '/combo',
    listLabel: 'combo bots',
    hasChart: true,
    titles: {
      create: 'Combo Bot - New',
      edit: 'Combo Bot - Edit',
      share: 'Shared backtest',
    },
    activePage: {
      create: '/combo/new',
      edit: '/combo',
      share: '/combo/backtests',
    },
    chartWidgetId: { create: 'combo-bot-chart', edit: 'combo-edit-bot-chart' },
    formWidgetId: { create: 'combo-create-bot', edit: 'combo-edit-bot' },
    loadingDelayMs: { create: 1200, edit: 1000 },
    // combo resets both indicator + example-orders stores on page unmount.
    resetStores: [indicatorStore, exampleOrdersStore],
    backtests: {
      kind: 'combo',
      noteType: BotTypesEnum.combo,
      resultStrategy: 'Combo',
      useList: useComboBacktests,
      useLinkedSummary: true,
      // Combo shows its custom loading subtitle on BOTH new and edit.
      summaryMessages: {
        create: { loadingSubtitle: 'Loading linked combo backtests' },
        edit: { loadingSubtitle: 'Loading linked combo backtests' },
      },
      buildColumns: buildComboBacktestColumns,
      tabKey: 'history',
      tabTitle: 'History',
      // BOTH combo modes persist to 'combo-backtests-table' (shared prefs);
      // this is intentional and matches the current pages.
      tableId: {
        create: 'combo-backtests-table',
        edit: 'combo-backtests-table',
      },
      // Mismatched vs the DataTable id (which is 'combo-backtests-table') so the
      // pin-init write is a no-op — preserves the existing quirk where combo
      // pin-inits '-new'/'-edit' while the table persists under the shared id.
      pinnedInitTableId: {
        create: 'combo-backtests-table-new',
        edit: 'combo-backtests-table-edit',
      },
      sharePath: '/combo/backtests',
      shareSubKind: 'combo',
      getByShareId: botQueries.getComboBacktestByShareId,
      getModalSettings: (bt) => (bt.settings ?? {}) as DCABotSettings,
    },
  };
