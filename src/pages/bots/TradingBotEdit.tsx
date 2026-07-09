import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import BotNotFoundNotice from '@/components/bots/BotNotFoundNotice';
import {
  BotPanelInsights,
  BotPanelLayout,
  type BotPanelInsightsTab,
} from '@/components/bots/panels';
import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import BotFormPanel from '@/components/bots/panels/contents/form/BotFormPanel';
import { BotBacktestPanel } from '@/components/bots/panels/contents/insights/BotBacktestPanel';
import { usePanelMenuBridge } from '@/components/bots/panels/hooks/usePanelMenuBridge';
import { type PanelContentConfig } from '@/components/bots/panels/PanelContainer';
import MainLayout from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { TVChartPicker } from '@/components/widgets/shared/TradingViewChart';
import type { TradingViewChartRef } from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import {
  TradingTerminalUtilsProvider,
  useTradingTerminalUtils,
} from '@/context/TradingTerminalUtilsContext';
import { useBotModeGuard } from '@/hooks/bots/base/useBotModeGuard';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { indicatorStore } from '@/stores/indicatorStore';
import {
  BotTypesEnum,
  type BotChartData,
  type DCABacktestingResultHistory,
} from '@/types';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';

const INITIAL_LOADING_DELAY_MS = 1000;

const TradingBotEditWidget = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useBotPageRedirect('/bot');
  const isLoading = useBotPageLoading(INITIAL_LOADING_DELAY_MS);

  const [activeInsightsTab, setActiveInsightsTab] = useState('backtests');

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  // Keep this bot's real paper/live mode authoritative over the global
  // toggle so a refresh doesn't flip it (and surface a clear error when the
  // bot exists in neither mode instead of "Unknown exchange"). Thread 4872.
  const modeGuard = useBotModeGuard(safeBotId, BotTypesEnum.dca, {
    enabled: hasBotId,
  });

  useEffect(() => {
    return () => {
      indicatorStore.reset();
      exampleOrdersStore.reset();
    };
  }, []);

  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        // Stage the backtest settings for the fresh form on /bot/new
        // (same one-shot channel as "Copy to live"); the new form reads
        // it via useBotConfigPreload.
        sessionStorage.setItem(
          'botConfig',
          JSON.stringify({
            type: BotTypesEnum.dca,
            settings: backtest.settings,
          })
        );
        toast.success('Backtest settings loaded into new bot form');
        navigate('/bot/new');
      } catch (error) {
        logger.error('[TradingBotEdit] Failed to load backtest settings', {
          id: backtest._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    [navigate]
  );

  const [chartMenu, handleChartMenuChange] = usePanelMenuBridge();

  const tvRef = useRef<TradingViewChartRef | null>(null);

  const [activePickerField, setActivePickerField] = useState<string | false>(
    false
  );
  const [chartData, setChartData] = useState<BotChartData>({});

  const onActiveChanged = useCallback((isActive: boolean) => {
    if (!isActive) {
      setActivePickerField(false);
    }
  }, []);

  const handleFormDataChange = useCallback((data: BotChartData) => {
    setChartData(data);
  }, []);

  const { setCoordinates } = useTradingTerminalUtils();

  const chartPanel = useMemo<PanelContentConfig>(() => {
    const base: PanelContentConfig = {
      content: (
        <>
          <BotChartPanel
            widgetId="edit-bot-chart"
            data={{
              botId: safeBotId,
              ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
              exchange: chartData.exchange || 'binance',
              ...(chartData.botId ? { botId: chartData.botId } : {}),
            }}
            variant="panel"
            className="h-full"
            onPanelMenuChange={handleChartMenuChange}
            ref={tvRef}
            {...(chartData.symbol ? { symbol: chartData.symbol } : {})}
          />
          <TVChartPicker
            chartRef={tvRef}
            isActive={Boolean(activePickerField)}
            onPick={setCoordinates}
            onActiveChange={onActiveChanged}
          />
        </>
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[320px]',
    };

    if (chartMenu) {
      base.menu = chartMenu;
    }

    return base;
  }, [
    chartMenu,
    handleChartMenuChange,
    safeBotId,
    activePickerField,
    onActiveChanged,
    chartData,
    setCoordinates,
  ]);

  const loadingChartPanel = useMemo<PanelContentConfig>(
    () => ({
      title: 'Bot performance chart',
      description: 'Fetching bot metrics…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="h-5 w-52 animate-pulse rounded bg-muted" />
          <div className="h-[220px] w-full animate-pulse rounded-xl bg-muted" />
          <div className="flex gap-xs">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[320px]',
    }),
    []
  );

  const loadingFormPanel = useMemo<PanelContentConfig>(
    () => ({
      title: 'Bot configuration',
      description: 'Loading current settings…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="space-y-sm">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-11 w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-11 w-full animate-pulse rounded bg-muted" />
          <div className="h-11 w-full animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
          <div className="mt-auto flex gap-xs">
            <div className="h-10 w-24 animate-pulse rounded bg-muted" />
            <div className="h-10 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[360px]',
    }),
    []
  );

  const loadingInsightsTabs = useMemo<BotPanelInsightsTab[]>(
    () => [
      {
        key: 'backtests',
        title: 'Backtests',
        badge: <Badge variant="secondary">...</Badge>,
        content: (
          <div className="flex h-full flex-col gap-sm">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-28 w-full animate-pulse rounded bg-muted" />
            <div className="h-28 w-full animate-pulse rounded bg-muted" />
          </div>
        ),
      },
      {
        key: 'stats',
        title: 'Stats',
        enabled: false,
        content: null,
      },
    ],
    []
  );

  return (
    <BotBacktestPanel
      mode="edit"
      tableId="dca-backtests-table"
      pinnedInitTableId="dca-backtests-table-edit"
      backtestsEnabled={hasBotId}
      summaryMessages={{ loadingSubtitle: 'Loading linked backtests' }}
      activeInsightsTab={activeInsightsTab}
      onActiveInsightsTabChange={setActiveInsightsTab}
      onLoadBacktestIntoForm={handleLoadBacktest}
    >
      {({ insights, onBacktestComplete }) => {
        const formPanel: PanelContentConfig = {
          content: (
            <BotFormPanel
              widgetId="edit-bot"
              mode="edit"
              onFormDataChange={handleFormDataChange}
              botId={safeBotId}
              botType={BotTypesEnum.dca}
              terminal={false}
              // On mobile, BotPanelLayout provides the top-level tabs (Settings/Chart/Backtests),
              // but the form should still show its internal section navigation (Entry, DCA, etc.)
              // Don't auto-detect mobile to let BotPanelLayout handle the overall layout
              disableMobileAutoDetect
              onBacktestComplete={onBacktestComplete}
            />
          ),
          contentClassName: 'flex h-full flex-col',
          containerClassName: 'min-h-[360px]',
        };

        return (
          <MainLayout
            pageTitle="Trading Bot - Edit"
            activePage="/bot/edit"
            fullyScrollable
            navigationBack
          >
            {!hasBotId ? (
              <div className="p-lg">
                <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-md py-md text-amber-900">
                  No bot ID provided.
                </div>
              </div>
            ) : modeGuard.notFound ? (
              <BotNotFoundNotice
                backTo="/bot"
                backLabel="bots"
                botId={safeBotId}
              />
            ) : (
              <div className="flex flex-col gap-md">
                {isLoading ? (
                  <BotPanelLayout
                    chart={loadingChartPanel}
                    form={loadingFormPanel}
                    insights={
                      <BotPanelInsights
                        tabs={loadingInsightsTabs}
                        value={activeInsightsTab}
                        onTabChange={setActiveInsightsTab}
                      />
                    }
                    className="flex-1"
                    key={`dca-${safeBotId || 'edit'}`}
                    botType="dca"
                    mobileFullscreen
                    scrollable
                  />
                ) : (
                  <BotPanelLayout
                    chart={chartPanel}
                    form={formPanel}
                    insights={insights}
                    className="flex-1"
                    key={`dca-${safeBotId || 'edit'}`}
                    botType="dca"
                    mobileFullscreen
                    scrollable
                  />
                )}
              </div>
            )}
          </MainLayout>
        );
      }}
    </BotBacktestPanel>
  );
};
const TradingBotEdit = () => {
  return (
    <TradingTerminalUtilsProvider>
      <TradingBotEditWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default TradingBotEdit;
