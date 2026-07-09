import { useCallback, useMemo, useRef, useState } from 'react';

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
import WidgetContainer from '@/components/layout/WidgetContainer';
import { Badge } from '@/components/ui/badge';
import { TVChartPicker } from '@/components/widgets/shared/TradingViewChart';
import type { TradingViewChartRef } from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import { Slot } from '@/lib/extensions';
import {
  BotTypesEnum,
  type BotChartData,
  type DCABacktestingResultHistory,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

// Mode-keyed initial skeleton window. Both pages called useBotPageLoading
// unconditionally today; only the delay diverged (New 1200ms / Edit 1000ms).
const INITIAL_LOADING_DELAY_MS = {
  create: 1200,
  edit: 1000,
} as const;

interface BotWorkbenchCreateProps {
  mode: 'create';
  /** loadedFormData ?? preload?.initialFormData — the page-resolved seed. */
  initialFormData?: Partial<BotFormData>;
  /** Bumped by "Load in settings" to force BotFormPanel remount (key). */
  formReloadKey: number;
  /**
   * True while a `?load=<id>` clone fetch is in flight. Gates the real form
   * behind the seed-pending skeleton so BotFormPanel never flashes the
   * last-used config then remounts. (= loadFromBotId && loadFromBotPending)
   */
  isSeedPending: boolean;
  /** In-place reload: map settings -> setLoadedFormData -> bump formReloadKey. */
  onLoadBacktestIntoForm: (backtest: DCABacktestingResultHistory) => void;
}

interface BotWorkbenchEditProps {
  mode: 'edit';
  /** Route bot id; '' when the param is absent (safeBotId). */
  botId: string;
  /** Boolean(id) — drives the no-botId notice AND backtestsEnabled. */
  hasBotId: boolean;
  /** modeGuard.notFound — drives the BotNotFoundNotice short-circuit. */
  notFound: boolean;
  /** Stage settings in sessionStorage.botConfig, then navigate('/bot/new'). */
  onLoadBacktestIntoForm: (backtest: DCABacktestingResultHistory) => void;
}

export type BotWorkbenchProps = BotWorkbenchCreateProps | BotWorkbenchEditProps;

export function BotWorkbench(props: BotWorkbenchProps) {
  const mode = props.mode;
  // Route bot id (edit only). undefined on create so the chart data builder
  // and the layout key template skip the edit-specific botId seeding.
  const editBotId = props.mode === 'edit' ? props.botId : undefined;

  useBotPageRedirect('/bot');
  const isLoading = useBotPageLoading(INITIAL_LOADING_DELAY_MS[mode]);

  // Shared across BotBacktestPanel, the loading-state BotPanelInsights, and the
  // mobile top-level tabs, so it must be owned here (above BotBacktestPanel).
  const [activeInsightsTab, setActiveInsightsTab] = useState('backtests');

  // Chart state block — identical on both sides.
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

  const chartPanel = useMemo<PanelContentConfig>(() => {
    const data =
      editBotId !== undefined
        ? {
            botId: editBotId,
            ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
            exchange: chartData.exchange || 'binance',
            ...(chartData.botId ? { botId: chartData.botId } : {}),
          }
        : {
            ...(chartData.symbol ? { symbol: chartData.symbol } : {}),
            exchange: chartData.exchange || 'binance',
            ...(chartData.botId ? { botId: chartData.botId } : {}),
          };

    const base: PanelContentConfig = {
      content: (
        <>
          <BotChartPanel
            widgetId={mode === 'edit' ? 'edit-bot-chart' : 'bot-chart'}
            className="h-full"
            data={data}
            onPanelMenuChange={handleChartMenuChange}
            ref={tvRef}
            {...(mode === 'edit' ? { variant: 'panel' as const } : {})}
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
    mode,
    editBotId,
    chartMenu,
    handleChartMenuChange,
    chartData,
    activePickerField,
    onActiveChanged,
    setCoordinates,
  ]);

  const loadingChartPanel = useMemo<PanelContentConfig>(() => {
    if (mode === 'edit') {
      return {
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
      };
    }
    return {
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
    };
  }, [mode]);

  const loadingFormPanel = useMemo<PanelContentConfig>(() => {
    const isEdit = mode === 'edit';
    return {
      title: isEdit ? 'Bot configuration' : 'Configure your bot',
      description: isEdit ? 'Loading current settings…' : 'Getting forms ready…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="space-y-sm">
            <div
              className={`h-4 ${isEdit ? 'w-32' : 'w-28'} animate-pulse rounded bg-muted`}
            />
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
    };
  }, [mode]);

  const loadingInsightsTabs = useMemo<BotPanelInsightsTab[]>(() => {
    const backtestsTab: BotPanelInsightsTab = {
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
    };
    if (mode === 'edit') {
      return [
        backtestsTab,
        {
          key: 'stats',
          title: 'Stats',
          enabled: false,
          content: null,
        },
      ];
    }
    return [backtestsTab];
  }, [mode]);

  const loadingInsights = (
    <BotPanelInsights
      tabs={loadingInsightsTabs}
      value={activeInsightsTab}
      onTabChange={setActiveInsightsTab}
    />
  );

  if (props.mode === 'edit') {
    const { botId, hasBotId, notFound, onLoadBacktestIntoForm } = props;
    const layoutKey = `dca-${botId || 'edit'}`;

    return (
      <BotBacktestPanel
        mode="edit"
        tableId="dca-backtests-table"
        pinnedInitTableId="dca-backtests-table-edit"
        backtestsEnabled={hasBotId}
        summaryMessages={{ loadingSubtitle: 'Loading linked backtests' }}
        activeInsightsTab={activeInsightsTab}
        onActiveInsightsTabChange={setActiveInsightsTab}
        onLoadBacktestIntoForm={onLoadBacktestIntoForm}
      >
        {({ insights, onBacktestComplete }) => {
          const formPanel: PanelContentConfig = {
            content: (
              <BotFormPanel
                widgetId="edit-bot"
                mode="edit"
                onFormDataChange={handleFormDataChange}
                botId={botId}
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
              ) : notFound ? (
                <BotNotFoundNotice
                  backTo="/bot"
                  backLabel="bots"
                  botId={botId}
                />
              ) : (
                <div className="flex flex-col gap-md">
                  {isLoading ? (
                    <BotPanelLayout
                      chart={loadingChartPanel}
                      form={loadingFormPanel}
                      insights={loadingInsights}
                      className="flex-1"
                      key={layoutKey}
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
                      key={layoutKey}
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
  }

  const { initialFormData, formReloadKey, isSeedPending, onLoadBacktestIntoForm } =
    props;

  return (
    <BotBacktestPanel
      mode="create"
      tableId="dca-backtests-table-new"
      activeInsightsTab={activeInsightsTab}
      onActiveInsightsTabChange={setActiveInsightsTab}
      onLoadBacktestIntoForm={onLoadBacktestIntoForm}
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
        if (isSeedPending) {
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
                  insights={loadingInsights}
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
}

export default BotWorkbench;
