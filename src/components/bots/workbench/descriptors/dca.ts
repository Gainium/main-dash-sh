import { buildDcaBacktestColumns } from '@/components/bots/panels/contents/insights/columns/dca-backtest-columns';
import { useDcaBacktests } from '@/hooks/useDcaBacktests';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import {
  BotTypesEnum,
  type DCABacktestingResultHistory,
  type DCABotSettings,
} from '@/types';

import type { BotPageDescriptor } from './types';

export const dcaPageDescriptor: BotPageDescriptor<DCABacktestingResultHistory> =
  {
    botType: BotTypesEnum.dca,
    layoutType: 'dca',
    basePath: '/bot',
    listLabel: 'bots',
    hasChart: true,
    titles: {
      create: 'Trading Bot - New',
      edit: 'Trading Bot - Edit',
      share: 'Shared backtest',
    },
    activePage: {
      create: '/bot/new',
      edit: '/bot/edit',
      share: '/bot/backtests',
    },
    chartWidgetId: { create: 'bot-chart', edit: 'edit-bot-chart' },
    formWidgetId: { create: 'create-bot', edit: 'edit-bot' },
    loadingDelayMs: { create: 1200, edit: 1000 },
    backtests: {
      kind: 'dca',
      noteType: BotTypesEnum.dca,
      resultStrategy: 'DCA',
      useList: useDcaBacktests,
      useLinkedSummary: true,
      // NOTE: only the EDIT branch passes this today (create passes nothing).
      // The workbench keeps that per-mode wiring so create stays byte-for-byte.
      summaryMessages: { edit: { loadingSubtitle: 'Loading linked backtests' } },
      buildColumns: buildDcaBacktestColumns,
      tabKey: 'backtests',
      tabTitle: 'Backtests',
      tableId: { create: 'dca-backtests-table-new', edit: 'dca-backtests-table' },
      // create omitted -> pin effect falls back to tableId.create
      // ('dca-backtests-table-new'). edit intentionally mismatched vs its
      // DataTable's 'dca-backtests-table' so the pin-init write is a no-op
      // (preserves the existing quirk).
      pinnedInitTableId: { edit: 'dca-backtests-table-edit' },
      sharePath: '/bot/backtests',
      shareSubKind: 'dca',
      getByShareId: botQueries.getBacktestByShareId,
      getModalSettings: (bt) => (bt.settings ?? {}) as DCABotSettings,
    },
  };
