import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

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
import type {
  BacktestRowBase,
  BotPageDescriptor,
} from '@/components/bots/workbench/descriptors/types';
import MainLayout from '@/components/layout/MainLayout';
import WidgetContainer from '@/components/layout/WidgetContainer';
import { Badge } from '@/components/ui/badge';
import { TVChartPicker } from '@/components/widgets/shared/TradingViewChart';
import type { TradingViewChartRef } from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import { useTradingTerminalUtils } from '@/context/TradingTerminalUtilsContext';
import { useBotPageLoading } from '@/hooks/bots/base/useBotPageLoading';
import { useBotPageRedirect } from '@/hooks/bots/base/useBotPageRedirect';
import { Slot } from '@/lib/extensions';
import { type BotChartData, type DCABacktestingResultHistory } from '@/types';
import type { BotFormData } from '@/types/bots/form';

interface BotWorkbenchCreateProps<TResult extends BacktestRowBase> {
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
  onLoadBacktestIntoForm: (backtest: TResult) => void;
}

interface BotWorkbenchEditProps<TResult extends BacktestRowBase> {
  mode: 'edit';
  /** Route bot id; '' when the param is absent (safeBotId). */
  botId: string;
  /** Boolean(id) — drives the no-botId notice AND backtestsEnabled. */
  hasBotId: boolean;
  /** Stage settings in sessionStorage.botConfig, then navigate('/bot/new'). */
  onLoadBacktestIntoForm: (backtest: TResult) => void;
  /**
   * Optional wrapper around the panel-layout region (both loading and
   * resolved). Grid-Edit uses it to mount <GridPageProvider>. Defaults to
   * identity when absent.
   */
  contentWrapper?: (node: ReactNode) => ReactNode;
}

export type BotWorkbenchProps<
  TResult extends BacktestRowBase = DCABacktestingResultHistory,
> = {
  /** Per-type page contract; TradingBot{New,Edit} pass dcaPageDescriptor. */
  descriptor: BotPageDescriptor<TResult>;
} & (BotWorkbenchCreateProps<TResult> | BotWorkbenchEditProps<TResult>);

export function BotWorkbench<
  TResult extends BacktestRowBase = DCABacktestingResultHistory,
>(props: BotWorkbenchProps<TResult>) {
  const { descriptor } = props;
  const mode = props.mode;
  // Route bot id (edit only). undefined on create so the chart data builder
  // and the layout key template skip the edit-specific botId seeding.
  const editBotId = props.mode === 'edit' ? props.botId : undefined;

  useBotPageRedirect(descriptor.basePath);
  const isLoading = useBotPageLoading(descriptor.loadingDelayMs[mode]);

  // Shared across BotBacktestPanel, the loading-state BotPanelInsights, and the
  // mobile top-level tabs, so it must be owned here (above BotBacktestPanel).
  // Seeded from the descriptor so combo starts on 'history', dca/grid on
  // 'backtests'.
  const [activeInsightsTab, setActiveInsightsTab] = useState(
    descriptor.backtests.tabKey
  );

  // Chart state block — identical on both sides. Hooks stay unconditional
  // (Rules-of-Hooks); descriptor.hasChart only gates whether the built chart
  // panel is passed to BotPanelLayout. DCA has hasChart=true so nothing changes.
  const [chartMenu, handleChartMenuChange] = usePanelMenuBridge();
  const [chartData, setChartData] = useState<BotChartData>({});
  const tvRef = useRef<TradingViewChartRef | null>(null);
  const handleFormDataChange = useCallback((data: BotChartData) => {
    setChartData(data);
  }, []);

  const { activePickerField, handleChartPick, onActiveChanged } =
    useTradingTerminalUtils();

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
            widgetId={descriptor.chartWidgetId[mode]}
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
            onPick={handleChartPick}
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
    handleChartPick,
    onActiveChanged,
    descriptor.chartWidgetId,
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
      key: descriptor.backtests.tabKey,
      title: descriptor.backtests.tabTitle,
      badge: <Badge variant="secondary">...</Badge>,
      content: (
        <div className="flex h-full flex-col gap-sm">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-28 w-full animate-pulse rounded bg-muted" />
          <div className="h-28 w-full animate-pulse rounded bg-muted" />
        </div>
      ),
    };
    // dca/combo edit show a disabled Stats tab during load; grid does not
    // (loadingHasStatsTab=false). Defaults to true when the flag is absent.
    if (mode === 'edit' && (descriptor.loadingHasStatsTab ?? true)) {
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
  }, [
    mode,
    descriptor.backtests.tabKey,
    descriptor.backtests.tabTitle,
    descriptor.loadingHasStatsTab,
  ]);

  const loadingInsights = (
    <BotPanelInsights
      tabs={loadingInsightsTabs}
      value={activeInsightsTab}
      onTabChange={setActiveInsightsTab}
    />
  );

  if (props.mode === 'edit') {
    const { botId, hasBotId, onLoadBacktestIntoForm, contentWrapper } = props;
    const layoutKey = `${descriptor.layoutType}-${botId || 'edit'}`;
    const wrapContent = contentWrapper ?? ((node: ReactNode) => node);

    return (
      <BotBacktestPanel
        descriptor={descriptor.backtests}
        mode="edit"
        backtestsEnabled={hasBotId}
        summaryMessages={descriptor.backtests.summaryMessages?.edit}
        activeInsightsTab={activeInsightsTab}
        onActiveInsightsTabChange={setActiveInsightsTab}
        onLoadBacktestIntoForm={onLoadBacktestIntoForm}
      >
        {({ insights, onBacktestComplete }) => {
          const formPanel: PanelContentConfig = {
            content: (
              <BotFormPanel
                widgetId={descriptor.formWidgetId.edit}
                mode="edit"
                onFormDataChange={handleFormDataChange}
                botId={botId}
                botType={descriptor.botType}
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
              pageTitle={descriptor.titles.edit}
              activePage={descriptor.activePage.edit}
              fullyScrollable
              navigationBack
            >
              {!hasBotId ? (
                <div className="p-lg">
                  <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-md py-md text-amber-900">
                    No bot ID provided.
                  </div>
                </div>
              ) : (
                wrapContent(
                  <div className="flex flex-col gap-md">
                    {isLoading ? (
                      <BotPanelLayout
                        chart={
                          descriptor.hasChart ? loadingChartPanel : undefined
                        }
                        form={loadingFormPanel}
                        insights={loadingInsights}
                        className="flex-1"
                        key={layoutKey}
                        botType={descriptor.layoutType}
                        mobileFullscreen
                        scrollable
                      />
                    ) : (
                      <BotPanelLayout
                        chart={descriptor.hasChart ? chartPanel : undefined}
                        form={formPanel}
                        insights={insights}
                        className="flex-1"
                        key={layoutKey}
                        botType={descriptor.layoutType}
                        mobileFullscreen
                        scrollable
                      />
                    )}
                  </div>
                )
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
      descriptor={descriptor.backtests}
      mode="create"
      summaryMessages={descriptor.backtests.summaryMessages?.create}
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
            <MainLayout
              pageTitle={descriptor.titles.share}
              activePage={descriptor.activePage.share}
            >
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
                key={`${descriptor.layoutType}-create-form-${formReloadKey}`}
                widgetId={descriptor.formWidgetId.create}
                mode="create"
                onFormDataChange={handleFormDataChange}
                botType={descriptor.botType}
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
            pageTitle={descriptor.titles.create}
            activePage={descriptor.activePage.create}
            fullyScrollable
            navigationBack
          >
            <Slot name="bot.formMounted" />
            <WidgetContainer layout="flex">
              {isLoading ? (
                <BotPanelLayout
                  chart={descriptor.hasChart ? loadingChartPanel : undefined}
                  form={loadingFormPanel}
                  insights={loadingInsights}
                  className="flex-1"
                  botType={descriptor.layoutType}
                  key={`${descriptor.layoutType}-new`}
                  mobileFullscreen
                  scrollable
                />
              ) : (
                <BotPanelLayout
                  chart={descriptor.hasChart ? chartPanel : undefined}
                  form={formPanel}
                  insights={insights}
                  className="flex-1"
                  botType={descriptor.layoutType}
                  key={`${descriptor.layoutType}-new`}
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
