import { useCallback, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { BotBacktestPanel } from '@/components/bots/panels/contents/insights/BotBacktestPanel';
import {
  comboPageDescriptor,
  dcaPageDescriptor,
  gridPageDescriptor,
  type BacktestRowBase,
  type BotPageDescriptor,
} from '@/components/bots/workbench/descriptors';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { useShareContext } from '@/hooks/useShareContext';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';

interface BotBacktestsPageProps<TResult extends BacktestRowBase> {
  descriptor: BotPageDescriptor<TResult>;
  /** Page title, e.g. "Trading Bot - Backtests". */
  title: string;
}

/**
 * Standalone backtests list for one bot type (V1's `/bot/backtests`,
 * `/combo/backtests`, `/grid/backtests`). Reuses BotBacktestPanel in `edit`
 * mode: row click opens the full-screen results modal, and "Load in settings"
 * stages the settings and opens a new bot form of this type.
 */
export function BotBacktestsPage<TResult extends BacktestRowBase>({
  descriptor,
  title,
}: BotBacktestsPageProps<TResult>) {
  const navigate = useNavigate();
  const [activeInsightsTab, setActiveInsightsTab] = useState(
    descriptor.backtests.tabKey
  );
  const newPath = `${descriptor.basePath}/new`;

  const handleLoadBacktest = useCallback(
    (backtest: TResult) => {
      try {
        // Same one-shot channel the edit pages use; the new form reads it
        // via useBotConfigPreload.
        sessionStorage.setItem(
          'botConfig',
          JSON.stringify({
            type: descriptor.botType,
            settings: backtest.settings,
          })
        );
        toast.success('Backtest settings loaded into new bot form');
        navigate(newPath);
      } catch (error) {
        logger.error('[BotBacktests] Failed to load backtest settings', {
          id: backtest._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    [descriptor.botType, navigate, newPath]
  );

  const pageActions = (
    <Button size="sm" onClick={() => navigate(newPath)}>
      <Plus className="h-4 w-4" />
      New backtest
    </Button>
  );

  return (
    <BotBacktestPanel
      descriptor={descriptor.backtests}
      mode="edit"
      summaryMessages={descriptor.backtests.summaryMessages?.edit}
      activeInsightsTab={activeInsightsTab}
      onActiveInsightsTabChange={setActiveInsightsTab}
      onLoadBacktestIntoForm={handleLoadBacktest}
    >
      {({ insights }) => (
        <MainLayout
          pageTitle={title}
          activePage={`${descriptor.basePath}/backtests`}
          pageActions={pageActions}
          mobileActions={pageActions}
        >
          <div className="flex min-h-[480px] flex-1 flex-col">{insights}</div>
        </MainLayout>
      )}
    </BotBacktestPanel>
  );
}

/**
 * `{base}/backtests` serves two things: a shared-backtest link
 * (`?backtestShare=<id>`, rendered by the type's New page share viewer) and,
 * without that param, the backtests list.
 */
export function BacktestsRoute({
  newPage: NewPage,
  listPage: ListPage,
}: {
  newPage: ComponentType;
  listPage: ComponentType;
}) {
  const { backtestShareId } = useShareContext();
  return backtestShareId ? <NewPage /> : <ListPage />;
}

export const TradingBotBacktests = () => (
  <BotBacktestsPage
    descriptor={dcaPageDescriptor}
    title="Trading Bot - Backtests"
  />
);

export const ComboBotBacktests = () => (
  <BotBacktestsPage
    descriptor={comboPageDescriptor}
    title="Combo Bot - Backtests"
  />
);

export const GridBotBacktests = () => (
  <BotBacktestsPage
    descriptor={gridPageDescriptor}
    title="Grid Bot - Backtests"
  />
);
