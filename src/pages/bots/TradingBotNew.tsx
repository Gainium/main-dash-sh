import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BotPanelInsights } from '@/components/bots/panels';
import {
  BotPanelLayout,
  type BotPanelInsightsConfig,
} from '@/components/bots/panels/BotPanelLayout';
import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import BotFormPanel from '@/components/bots/panels/contents/form/BotFormPanel';
import { BotBacktestPanel } from '@/components/bots/panels/contents/insights/BotBacktestPanel';
import { usePanelMenuBridge } from '@/components/bots/panels/hooks/usePanelMenuBridge';
import { type PanelContentConfig } from '@/components/bots/panels/PanelContainer';
import MainLayout from '@/components/layout/MainLayout';
import WidgetContainer from '@/components/layout/WidgetContainer';
import { Badge } from '@/components/ui/badge';
import { TVChartPicker } from '@/components/widgets/shared/TradingViewChart';
import type { TradingViewChartRef } from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import {
  TradingTerminalUtilsProvider,
  useTradingTerminalUtils,
} from '@/context/TradingTerminalUtilsContext';
import { useBotConfigPreload } from '@/hooks/useBotConfigPreload';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import { GraphQLClient } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { Slot } from '@/lib/extensions';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { useAuthStore } from '@/stores/authStore';
import { indicatorStore } from '@/stores/indicatorStore';
import {
  BotTypesEnum,
  type BotChartData,
  type DCABacktestingResultHistory,
  type DCABot,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';
import { useSearchParams } from 'react-router-dom';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';

const INITIAL_LOADING_DELAY_MS = 1200;

const TradingBotNewWidget = () => {
  useBotPageRedirect('/bot');
  const isLoading = useBotPageLoading(INITIAL_LOADING_DELAY_MS);
  // Preloaded form seed from sessionStorage.botConfig (set by the
  // curated-presets widget, BotCard "Copy to live", etc.) plus URL hints.
  // Returns null when nothing is staged or a `?clone=` URL wins.
  const preload = useBotConfigPreload();

  // Clone-from-bot via `?load=<id>`: fetch the source DCA bot, map its
  // settings to form data, append "(Clone)" to the name, and seed the
  // form. Mirrors the hedge clone flow in HedgeBotFormProvider.
  const [searchParams] = useSearchParams();
  const loadFromBotId = searchParams.get('load');
  const [loadedFormData, setLoadedFormData] = useState<
    Partial<BotFormData> | null
  >(null);
  const [loadFromBotPending, setLoadFromBotPending] = useState(
    Boolean(loadFromBotId)
  );

  useEffect(() => {
    if (!loadFromBotId) return;
    let cancelled = false;
    setLoadFromBotPending(true);

    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const token = useAuthStore.getState().tokens?.accessToken;
    const client = new GraphQLClient(endpoint, token ?? 'demo');
    const { query, variables } = botQueries.getDCABot({ id: loadFromBotId });

    client
      .request<{
        getDCABot: { status: string; reason?: string; data?: DCABot };
      }>(query, variables)
      .then((response) => {
        if (cancelled) return;
        const payload = response.getDCABot;
        if (payload?.status === 'OK' && payload.data) {
          try {
            const bot = payload.data;
            const { formData } = mapBotSettingsToFormData(
              BotTypesEnum.dca,
              bot.settings,
              { bot }
            );
            const base = formData.name?.trim();
            setLoadedFormData({
              ...formData,
              name: base ? `${base} (Clone)` : 'Bot (Clone)',
            });
          } catch (err) {
            logger.error('[TradingBotNew] Failed to map loaded bot settings', {
              error: err instanceof Error ? err.message : String(err),
              id: loadFromBotId,
            });
            toast.error('Failed to load bot settings');
            setLoadedFormData(null);
          }
        } else {
          toast.error(payload?.reason || 'Could not load bot to clone');
          setLoadedFormData(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        logger.error('[TradingBotNew] getDCABot for clone failed', {
          error: err instanceof Error ? err.message : String(err),
          id: loadFromBotId,
        });
        toast.error(
          err instanceof Error ? err.message : 'Failed to load bot to clone'
        );
        setLoadedFormData(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadFromBotPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadFromBotId]);

  const [activeInsightsTab, setActiveInsightsTab] = useState('backtests');
  const [formReloadKey, setFormReloadKey] = useState(0);

  useEffect(() => {
    return () => {
      indicatorStore.reset();
      exampleOrdersStore.reset();
    };
  }, []);

  // "Load in settings" — in-place form reload with the backtest's settings.
  const handleLoadBacktest = useCallback(
    (backtest: DCABacktestingResultHistory) => {
      try {
        const { formData: mappedFormData } = mapBotSettingsToFormData(
          BotTypesEnum.dca,
          {
            settings: backtest.settings,
            exchangeUUID: backtest.exchangeUUID,
          }
        );
        setLoadedFormData(mappedFormData);
        setFormReloadKey((prev) => prev + 1);
        toast.success('Backtest settings loaded into bot form');
      } catch (error) {
        logger.error('[TradingBotNew] Failed to load backtest settings', {
          id: backtest._id,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error('Failed to load backtest settings into bot form');
      }
    },
    []
  );

  const [chartMenu, handleChartMenuChange] = usePanelMenuBridge();
  const [chartData, setChartData] = useState<BotChartData>({});
  const tvRef = useRef<TradingViewChartRef | null>(null);

  const [activePickerField, setActivePickerField] = useState<string | false>(
    false
  );

  const onActiveChanged = useCallback((isActive: boolean) => {
    if (!isActive) {
      setActivePickerField(false);
    }
  }, []);

  const handleFormDataChange = useCallback((data: BotChartData) => {
    setChartData(data);
  }, []);

  const { setCoordinates } = useTradingTerminalUtils();

  const chartPanel: PanelContentConfig = useMemo(() => {
    const base: PanelContentConfig = {
      content: (
        <>
          <BotChartPanel
            widgetId="bot-chart"
            className="h-full"
            {...(chartData.symbol ? { symbol: chartData.symbol } : {})}
            data={{
              ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
              exchange: chartData.exchange || 'binance',
              ...(chartData.botId ? { botId: chartData.botId } : {}),
            }}
            onPanelMenuChange={handleChartMenuChange}
            ref={tvRef}
          />
          <TVChartPicker
            chartRef={tvRef}
            isActive={!!activePickerField}
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
    chartData,
    activePickerField,
    onActiveChanged,
    setCoordinates,
  ]);

  const loadingInsightsConfig: BotPanelInsightsConfig = useMemo(
    () => ({
      defaultTab: 'backtests',
      tabs: [
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
      ],
    }),
    []
  );

  const loadingChartPanel: PanelContentConfig = useMemo(
    () => ({
      title: 'Market chart',
      description: 'Preparing live data…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
          <div className="h-[220px] w-full animate-pulse rounded-xl bg-muted" />
          <div className="flex gap-xs">
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[320px]',
    }),
    []
  );

  const loadingFormPanel: PanelContentConfig = useMemo(
    () => ({
      title: 'Configure your bot',
      description: 'Getting forms ready…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="space-y-sm">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
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

  return (
    <BotBacktestPanel
      mode="create"
      tableId="dca-backtests-table-new"
      activeInsightsTab={activeInsightsTab}
      onActiveInsightsTabChange={setActiveInsightsTab}
      onLoadBacktestIntoForm={handleLoadBacktest}
      enableShareViewer
      showShareSelectedButton
    >
      {({ insights, onBacktestComplete, isShareMode, shareContent }) => {
        // Share-mode: render the shared backtest detail. MainLayout
        // short-circuits to SharedPageLayout so the surrounding chrome
        // stays minimal.
        if (isShareMode) {
          return (
            <MainLayout pageTitle="Shared backtest" activePage="/bot/backtests">
              {shareContent}
            </MainLayout>
          );
        }

        // When `?load=` is in the URL, gate the form mount until the
        // fetched seed is ready — otherwise BotFormPanel would briefly
        // render with the last-used config and then remount, flashing
        // stale values at the user.
        let formPanel: PanelContentConfig;
        if (loadFromBotId && loadFromBotPending) {
          formPanel = {
            content: (
              <div className="flex h-full flex-col gap-md">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-11 w-full animate-pulse rounded bg-muted" />
                <div className="h-11 w-full animate-pulse rounded bg-muted" />
                <div className="h-24 w-full animate-pulse rounded bg-muted" />
              </div>
            ),
            contentClassName: 'flex h-full flex-col',
            containerClassName: 'min-h-[360px]',
          };
        } else {
          const initialFormData = loadedFormData ?? preload?.initialFormData;
          formPanel = {
            content: (
              <BotFormPanel
                key={`dca-create-form-${formReloadKey}`}
                widgetId="create-bot"
                mode="create"
                onFormDataChange={handleFormDataChange}
                botType={BotTypesEnum.dca}
                terminal={false}
                initialFormData={initialFormData}
                // On mobile, BotPanelLayout provides the top-level tabs (Settings/Chart/Backtests),
                // but the form should still show its internal section navigation (Entry, DCA, etc.)
                disableMobileAutoDetect
                onBacktestComplete={onBacktestComplete}
              />
            ),
            contentClassName: 'flex h-full flex-col',
            containerClassName: 'min-h-[360px]',
          };
        }

        return (
          <MainLayout
            pageTitle="Trading Bot - New"
            activePage="/bot/new"
            fullyScrollable
            navigationBack
          >
            <Slot name="bot.formMounted" />
            <WidgetContainer layout="flex">
              {isLoading ? (
                <BotPanelLayout
                  chart={loadingChartPanel}
                  form={loadingFormPanel}
                  insights={
                    <BotPanelInsights
                      tabs={loadingInsightsConfig.tabs}
                      value={activeInsightsTab}
                      onTabChange={setActiveInsightsTab}
                    />
                  }
                  className="flex-1"
                  botType="dca"
                  key={`dca-new`}
                  mobileFullscreen
                  scrollable
                />
              ) : (
                <BotPanelLayout
                  chart={chartPanel}
                  form={formPanel}
                  insights={insights}
                  className="flex-1"
                  botType="dca"
                  key={`dca-new`}
                  mobileFullscreen
                  scrollable
                />
              )}
            </WidgetContainer>
          </MainLayout>
        );
      }}
    </BotBacktestPanel>
  );
};

const TradingBotNew = () => {
  return (
    <TradingTerminalUtilsProvider>
      <TradingBotNewWidget />
    </TradingTerminalUtilsProvider>
  );
};

export default TradingBotNew;
