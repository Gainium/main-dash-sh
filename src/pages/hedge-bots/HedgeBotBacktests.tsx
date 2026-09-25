import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { BotPanelInsights } from '@/components/bots/panels';
import { BotPageBoundary } from '@/components/bots/workbench/BotPageBoundary';
import {
  hedgeComboPageDescriptor,
  hedgeDcaPageDescriptor,
  type BotPageBoundaryDescriptor,
} from '@/components/bots/workbench/descriptors';
import MainLayout from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HedgeBacktestListView } from '@/components/widgets/bots/backtest/HedgeBacktestTab';
import { BacktestResultsFullModal } from '@/components/widgets/bots/backtest/redesign';
import {
  useHedgeBacktestRunner,
  type HedgeBacktestHistoryItem,
} from '@/hooks/bots/hedge/useHedgeBacktestRunner';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { BotTypesEnum } from '@/types';

/**
 * One-shot hand-off for "Load in settings": the backtest row is staged here
 * and HedgeBotEditLayout (create mode) applies it on mount.
 */
export const HEDGE_BACKTEST_LOAD_KEY = 'hedgeBacktestLoad';

const noSnapshot = () => null;

interface HedgeBotBacktestsPageProps {
  descriptor: BotPageBoundaryDescriptor;
  hedgeBotType: BotTypesEnum.hedgeDca | BotTypesEnum.hedgeCombo;
  title: string;
}

/**
 * Standalone hedge backtests list (V1's `/hedge/bot/backtests`). History rows
 * come from the server; full results load from this device's IndexedDB.
 */
const HedgeBotBacktestsPage = ({
  descriptor,
  hedgeBotType,
  title,
}: HedgeBotBacktestsPageProps) => {
  const navigate = useNavigate();
  const newPath = `${descriptor.basePath}/new`;

  // List-only: no snapshot, so the runner never runs — it serves history,
  // loadById (IndexedDB) and deletes.
  const runner = useHedgeBacktestRunner({
    getSnapshot: noSnapshot,
    hedgeBotType,
  });

  const [selectedMeta, setSelectedMeta] =
    useState<HedgeBacktestHistoryItem | null>(null);
  const [activating, setActivating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSelect = useCallback(
    async (item: HedgeBacktestHistoryItem) => {
      setSelectedMeta(item);
      setActivating(true);
      try {
        await runner.loadById(item._id);
      } finally {
        setActivating(false);
      }
      setModalOpen(true);
    },
    [runner]
  );

  const handleLoadIntoForm = useCallback(
    (item: HedgeBacktestHistoryItem) => {
      try {
        sessionStorage.setItem(HEDGE_BACKTEST_LOAD_KEY, JSON.stringify(item));
        navigate(newPath);
      } catch (error) {
        logger.error('[HedgeBotBacktests] Failed to stage backtest settings', {
          id: item._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    [navigate, newPath]
  );

  const pageActions = (
    <Button size="sm" onClick={() => navigate(newPath)}>
      <Plus className="h-4 w-4" />
      New backtest
    </Button>
  );

  return (
    <MainLayout
      pageTitle={title}
      activePage={`${descriptor.basePath}/backtests`}
      pageActions={pageActions}
      mobileActions={pageActions}
    >
      <div className="flex min-h-[480px] flex-1 flex-col">
        <BotPanelInsights
          value="backtests"
          tabs={[
            {
              key: 'backtests',
              title: 'Backtests',
              badge: runner.historyLoading ? (
                <Badge variant="secondary">…</Badge>
              ) : (
                <Badge variant="default">{runner.history.length}</Badge>
              ),
              content: (
                <HedgeBacktestListView
                  runner={runner}
                  onSelect={handleSelect}
                  onLoadIntoForm={handleLoadIntoForm}
                  activating={activating}
                />
              ),
            },
          ]}
        />
      </div>

      <BacktestResultsFullModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        strategy={hedgeBotType}
        result={runner.result}
        hedgeMeta={selectedMeta}
        hedgeBotType={hedgeBotType}
        botName={selectedMeta?.long?.settings?.name}
      />
    </MainLayout>
  );
};

export const HedgeDcaBotBacktests = () => (
  <BotPageBoundary descriptor={hedgeDcaPageDescriptor} mode="create">
    <HedgeBotBacktestsPage
      descriptor={hedgeDcaPageDescriptor}
      hedgeBotType={BotTypesEnum.hedgeDca}
      title="Hedge DCA Bot — Backtests"
    />
  </BotPageBoundary>
);

export const HedgeComboBotBacktests = () => (
  <BotPageBoundary descriptor={hedgeComboPageDescriptor} mode="create">
    <HedgeBotBacktestsPage
      descriptor={hedgeComboPageDescriptor}
      hedgeBotType={BotTypesEnum.hedgeCombo}
      title="Hedge Combo Bot — Backtests"
    />
  </BotPageBoundary>
);
