import { BarChart3, ChevronLeft, LineChart, Settings } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { SplitPanel } from '@/components/ui/split-panel';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type SubtabItem,
} from '@/components/ui/tabs';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { logger } from '@/lib/loggerInstance';
import { cn } from '@/lib/utils';
import {
  useBotPanelLayoutStore,
  type BotType,
} from '@/stores/botPanelLayoutStore';

// Re-export so page descriptors (components/bots/workbench/descriptors) can
// source the layout bot-type union from the layout component they feed.
export type { BotType } from '@/stores/botPanelLayoutStore';

import type {
  BotPanelInsightsSubtab,
  BotPanelInsightsTab,
} from './BotPanelInsights';
import { PanelContainer, type PanelContentConfig } from './PanelContainer';

/** Small breakpoint for full-screen mobile form (phone-sized screens) */
const MOBILE_FULLSCREEN_BREAKPOINT = '(max-width: 768px)';

export interface DesktopLayoutConfig {
  /** Default sizes (percentages) for the top-level horizontal split: [chart, form]. */
  topSplit?: [number, number];
  /** Default sizes (percentages) for the overall vertical split: [upper, lower]. */
  verticalSplit?: [number, number];
}

export interface BotPanelInsightsConfig {
  tabs: BotPanelInsightsTab[];
  defaultTab?: string;
  /**
   * Optional key to force the insights Tabs to reset/remount.
   * Useful when the tab list is uncontrolled (defaultValue) and you need to
   * jump to a tab (e.g., Overview) when selecting a different backtest.
   */
  resetKey?: string | number;
  /** Optional actions rendered to the right of the tab list. */
  actions?: ReactNode;
  /** Class override for the outer insights container. */
  containerClassName?: string;
}

/** Configuration for mobile tab labels */
export interface MobileTabLabels {
  settings?: string;
  chart?: string;
  insights?: string;
}

export interface BotPanelLayoutProps {
  chart?: PanelContentConfig; // Optional for bot types without chart data (e.g., Grid bots)
  form: PanelContentConfig;
  /** Can be either a BotPanelInsightsConfig object or a ReactNode (e.g., BotPanelInsights component) */
  insights: BotPanelInsightsConfig | ReactNode;
  className?: string;
  desktopLayout?: DesktopLayoutConfig;
  /** Bot type for persisting panel layout per bot type */
  botType?: BotType;
  /**
   * When true and on small screens (<=768px), renders a full-screen tabbed
   * mobile layout instead of the split-panel layout. The form content is
   * rendered directly (not wrapped in PanelContainer).
   */
  mobileFullscreen?: boolean;
  /** Content to render for the Chart tab in mobile fullscreen mode */
  mobileChartContent?: ReactNode;
  /** Content to render for the Backtests tab in mobile fullscreen mode */
  mobileBacktestsContent?: ReactNode;
  /** Custom labels for mobile tabs. Defaults: { settings: 'Settings', chart: 'Chart', insights: 'Backtests' } */
  mobileTabLabels?: MobileTabLabels;
  /** Hide the insights/backtests tab in mobile fullscreen mode */
  hideMobileInsightsTab?: boolean;
  /**
   * When true, the layout height is no longer capped at the viewport. The
   * outer container grows naturally and the parent scroll container (provided
   * by MainLayout when fullyScrollable={true}) is responsible for scrolling.
   * Pass panelGroupStyle with an explicit height to each SplitPanel so that
   * react-resizable-panels can measure and distribute sizes correctly.
   */
  scrollable?: boolean;
}

const DEFAULT_DESKTOP_LAYOUT: Required<DesktopLayoutConfig> = {
  topSplit: [65, 35],
  verticalSplit: [60, 40],
};

export function BotPanelLayout({
  chart,
  form,
  insights,
  className,
  desktopLayout,
  botType,
  mobileFullscreen = false,
  mobileChartContent,
  mobileBacktestsContent,
  mobileTabLabels,
  hideMobileInsightsTab = false,
  scrollable = false,
}: BotPanelLayoutProps) {
  const isMobileFullscreen = useMediaQuery(MOBILE_FULLSCREEN_BREAKPOINT);
  const navigate = useNavigate();

  // Handler for the back button - navigates back in history
  const handleBackNavigation = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const desktopConfig = { ...DEFAULT_DESKTOP_LAYOUT, ...desktopLayout };

  const getPanelLayout = useBotPanelLayoutStore((s) => s.getPanelLayout);
  const setPanelLayout = useBotPanelLayoutStore((s) => s.setPanelLayout);

  const storedLayout = botType ? getPanelLayout(botType) : undefined;

  const [isChartCollapsed, setIsChartCollapsed] = useState(
    () => storedLayout?.isChartCollapsed ?? false
  );
  const [isFormCollapsed, setIsFormCollapsed] = useState(
    () => storedLayout?.isFormCollapsed ?? false
  );
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(
    () => storedLayout?.isBottomCollapsed ?? false
  );

  // State for mobile fullscreen tab - initialize from stored value
  const [mobileTab, setMobileTab] = useState<
    'settings' | 'chart' | 'backtests'
  >(() => {
    const initialTab = storedLayout?.mobileActiveTab ?? 'settings';
    logger.info('[BotPanelLayout] Initializing mobile tab', {
      botType,
      storedTab: storedLayout?.mobileActiveTab,
      initialTab,
    });
    return initialTab;
  });

  // Sync mobileTab state with stored layout when botType or storedLayout changes
  useEffect(() => {
    if (storedLayout?.mobileActiveTab) {
      logger.info('[BotPanelLayout] Syncing mobile tab from storage', {
        botType,
        storedTab: storedLayout.mobileActiveTab,
      });
      setMobileTab(storedLayout.mobileActiveTab);
    }
  }, [storedLayout?.mobileActiveTab, botType]);

  // Check if insights is a React node or config object
  const isInsightsReactNode = useMemo(() => {
    return insights && typeof insights === 'object' && 'type' in insights;
  }, [insights]);

  const insightsConfig = useMemo(() => {
    return !isInsightsReactNode && insights
      ? (insights as BotPanelInsightsConfig)
      : null;
  }, [insights, isInsightsReactNode]);

  const tabs = useMemo(
    () => insightsConfig?.tabs ?? [],
    [insightsConfig?.tabs]
  );

  // Hide mobile bottom nav when in mobile fullscreen mode
  useEffect(() => {
    const body = document?.body;
    if (!body) return;

    const shouldHide = mobileFullscreen && isMobileFullscreen;
    if (shouldHide) {
      body.classList.add('hide-mobile-bottom-nav');
    } else {
      body.classList.remove('hide-mobile-bottom-nav');
    }

    return () => {
      body.classList.remove('hide-mobile-bottom-nav');
    };
  }, [mobileFullscreen, isMobileFullscreen]);

  const chartPanel = useMemo(
    () =>
      chart ? (
        <PanelContainer
          {...chart}
          paddinglessBody
          containerClassName={cn('min-h-[260px]', chart.containerClassName)}
        />
      ) : null,
    [chart]
  );

  const formPanel = useMemo(
    () => (
      <PanelContainer
        {...form}
        containerClassName={cn('min-h-[260px]', form.containerClassName)}
      />
    ),
    [form]
  );

  const insightsPanel = useMemo(() => {
    // If insights is a ReactNode, render it directly
    if (isInsightsReactNode) {
      return insights as ReactNode;
    }

    // Otherwise, render the legacy config-based panel
    if (!tabs.length) {
      return null;
    }

    // Build subtabs map and flattened tab contents for legacy config
    const { subtabsRecord, flattenedTabs } = (() => {
      const subtabsRec: Record<string, SubtabItem[]> = {};
      const flat: Array<BotPanelInsightsTab | BotPanelInsightsSubtab> = [];

      tabs.forEach((t) => {
        flat.push(t);
        if (t.subtabs && Array.isArray(t.subtabs)) {
          const enabled = t.subtabs.filter((st) => st.enabled !== false);
          subtabsRec[t.key] = enabled.map((st) => ({
            value: st.key,
            label: st.title,
            disabled: st.enabled === false,
          }));
          flat.push(...enabled);
        }
      });

      return { subtabsRecord: subtabsRec, flattenedTabs: flat };
    })();

    const hasSubtabs = Object.keys(subtabsRecord).length > 0;

    return (
      <PanelContainer
        paddinglessBody
        containerClassName={cn(
          'min-h-[220px]',
          insightsConfig?.containerClassName
        )}
        bodyClassName="flex flex-col"
        content={
          <Tabs
            key={`${insightsConfig?.defaultTab ?? tabs[0]?.key}:${insightsConfig?.resetKey ?? ''}`}
            defaultValue={insightsConfig?.defaultTab ?? tabs[0]?.key}
            className="flex h-full flex-col"
          >
            <div className="flex items-center gap-sm px-sm py-xs">
              <div className="rounded-md bg-card p-1.5">
                <TabsList
                  fullWidth={!hasSubtabs}
                  subtabs={hasSubtabs ? subtabsRecord : undefined}
                >
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.key} value={tab.key}>
                      <span>{tab.title}</span>
                      {tab.badge && <span className="ml-2">{tab.badge}</span>}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {insightsConfig?.actions ? (
                <div className="ml-auto flex items-center gap-xs text-sm text-muted-foreground">
                  {insightsConfig.actions}
                </div>
              ) : null}
            </div>
            <div className="flex-1 overflow-hidden px-sm py-sm">
              {flattenedTabs.map((tab) => (
                <TabsContent
                  key={tab.key}
                  value={tab.key}
                  className="mt-0 h-full"
                >
                  <div
                    className={cn('h-full overflow-auto', tab.bodyClassName)}
                  >
                    {tab.content}
                  </div>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        }
      />
    );
  }, [
    tabs,
    insightsConfig?.defaultTab,
    insightsConfig?.actions,
    insightsConfig?.containerClassName,
    isInsightsReactNode,
    insights,
    insightsConfig?.resetKey,
  ]);

  const splitPanel = useMemo(
    () => [
      {
        index: 0,
        collapsed: isChartCollapsed,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCollapsedChange: (next: any) => {
          setIsChartCollapsed(next);
          if (botType) {
            setPanelLayout(botType, {
              ...(getPanelLayout(botType) ?? {}),
              isChartCollapsed: next,
            });
          }
        },
        collapseButtonLabel: 'Toggle chart panel',
      },
      {
        index: 1,
        collapsed: isFormCollapsed,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCollapsedChange: (next: any) => {
          setIsFormCollapsed(next);
          if (botType) {
            setPanelLayout(botType, {
              ...(getPanelLayout(botType) ?? {}),
              isFormCollapsed: next,
            });
          }
        },
        collapseButtonLabel: 'Toggle form panel',
      },
    ],
    [botType, getPanelLayout, setPanelLayout, isChartCollapsed, isFormCollapsed]
  );
  const splitPanel2 = useMemo(
    () => [
      {
        index: 0,
        collapsed: isFormCollapsed,
        onCollapsedChange: setIsFormCollapsed,
        collapseButtonLabel: 'Toggle form panel',
      },
      {
        index: 1,
        collapsed: isBottomCollapsed,
        onCollapsedChange: setIsBottomCollapsed,
        collapseButtonLabel: 'Toggle insights panel',
      },
    ],
    [
      isFormCollapsed,
      setIsFormCollapsed,
      isBottomCollapsed,
      setIsBottomCollapsed,
    ]
  );
  const splitPanel3 = useMemo(
    () => [
      {
        index: 1,
        collapsed: isBottomCollapsed,
        onCollapsedChange: setIsBottomCollapsed,
        collapseButtonLabel: 'Toggle insights panel',
      },
    ],
    [isBottomCollapsed, setIsBottomCollapsed]
  );
  const splitPanel4 = useMemo(
    () => [
      {
        index: 0,
        collapsed: isChartCollapsed,
        onCollapsedChange: setIsChartCollapsed,
        collapseButtonLabel: 'Toggle chart panel',
      },
      {
        index: 1,
        collapsed: isFormCollapsed,
        onCollapsedChange: setIsFormCollapsed,
        collapseButtonLabel: 'Toggle form panel',
      },
    ],
    [isChartCollapsed, setIsChartCollapsed, isFormCollapsed, setIsFormCollapsed]
  );
  // Mobile fullscreen layout - renders a tabbed full-screen view
  // This takes priority and prevents the split panel layout from loading
  if (mobileFullscreen && isMobileFullscreen) {
    // Resolve tab labels with defaults
    const settingsLabel = mobileTabLabels?.settings ?? 'Settings';
    const chartLabel = mobileTabLabels?.chart ?? 'Chart';
    const insightsLabel = mobileTabLabels?.insights ?? 'More';

    // Determine number of columns based on which tabs are shown
    const showChart = !!chart;
    const showInsights = !hideMobileInsightsTab;
    const colCount = 1 + (showChart ? 1 : 0) + (showInsights ? 1 : 0);

    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex flex-col bg-background',
          className
        )}
      >
        <Tabs
          value={mobileTab}
          onValueChange={(value) => {
            const newTab = value as 'settings' | 'chart' | 'backtests';
            logger.info('[BotPanelLayout] Mobile tab changed', {
              botType,
              oldTab: mobileTab,
              newTab,
            });
            setMobileTab(newTab);
            if (botType) {
              const updatedLayout = {
                ...(getPanelLayout(botType) ?? {}),
                mobileActiveTab: newTab,
              };
              logger.info('[BotPanelLayout] Persisting mobile tab', {
                botType,
                updatedLayout,
              });
              setPanelLayout(botType, updatedLayout);
            }
          }}
          className="flex flex-col h-full"
        >
          {/* Top tabs for Settings / Chart / Backtests */}
          <div className="shrink-0 z-20 bg-background border-b border-border px-2 pt-2 pb-1 safe-area-inset-top">
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Go back"
                onClick={handleBackNavigation}
                className="ml-0 mr-2 z-40 shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <TabsList
                className={cn(
                  'flex-1 h-auto p-1 grid',
                  colCount === 3
                    ? 'grid-cols-3'
                    : colCount === 2
                      ? 'grid-cols-2'
                      : 'grid-cols-1'
                )}
                disableDropdown
              >
                <TabsTrigger
                  value="settings"
                  className="flex items-center gap-xs py-2"
                >
                  <Settings className="w-4 h-4" />
                  <span>{settingsLabel}</span>
                </TabsTrigger>
                {showChart && (
                  <TabsTrigger
                    value="chart"
                    className="flex items-center gap-xs py-2"
                  >
                    <LineChart className="w-4 h-4" />
                    <span>{chartLabel}</span>
                  </TabsTrigger>
                )}
                {showInsights && (
                  <TabsTrigger
                    value="backtests"
                    className="flex items-center gap-xs py-2"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>{insightsLabel}</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
          </div>

          {/* Tab content - allow form to manage its own scroll and footer */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <TabsContent
              value="settings"
              className="flex-1 m-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
            >
              {/* Render form content directly without PanelContainer wrapper */}
              {form.content}
            </TabsContent>
            {showChart && (
              <TabsContent
                value="chart"
                className="flex-1 m-0 overflow-auto p-xs"
              >
                {mobileChartContent ?? chart.content}
              </TabsContent>
            )}
            {showInsights && (
              <TabsContent
                value="backtests"
                className="flex-1 m-0 overflow-auto p-xs"
              >
                {mobileBacktestsContent ??
                  (isInsightsReactNode
                    ? (insights as ReactNode)
                    : insightsPanel)}
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    );
  }

  if (!insightsPanel) {
    // No insights panel - show chart + form or just form
    if (!chartPanel) {
      return (
        <div
          className={cn(
            scrollable
              ? 'flex flex-col w-full'
              : 'flex h-full w-full flex-col min-h-0 overflow-hidden',
            className
          )}
        >
          {formPanel}
        </div>
      );
    }

    return (
      <div
        className={cn(
          scrollable
            ? 'flex flex-col w-full'
            : 'flex h-full w-full flex-col min-h-0 overflow-hidden',
          className
        )}
      >
        <SplitPanel
          direction="horizontal"
          defaultSizes={desktopConfig.topSplit}
          className={scrollable ? 'min-h-[260px]' : 'flex-1 min-h-0'}
          collapsiblePanels={splitPanel}
          showCollapseButton
          gappedHandle
          autoSaveId={botType ? `bot-panel-${botType}-two-panel` : null}
          key={
            botType ? `bot-panel-${botType}-two-panel` : 'bot-panel-none-two'
          }
        >
          {chartPanel}
          {formPanel}
        </SplitPanel>
      </div>
    );
  }

  // Desktop layout
  if (!chartPanel) {
    // No chart - form on left, insights on right
    return (
      <div
        className={cn(
          scrollable ? 'flex flex-col w-full' : 'flex h-full w-full flex-col',
          className
        )}
      >
        <SplitPanel
          direction="horizontal"
          defaultSizes={[60, 40]}
          className={scrollable ? 'min-h-[260px]' : 'h-full'}
          collapsiblePanels={splitPanel2}
          showCollapseButton
          gappedHandle
          autoSaveId={botType ? `bot-panel-${botType}-desktop-no-chart` : null}
          key={
            botType
              ? `bot-panel-${botType}-desktop-no-chart`
              : 'bot-panel-none-desktop-no-chart'
          }
        >
          {formPanel}
          {insightsPanel}
        </SplitPanel>
      </div>
    );
  }

  return (
    <div
      className={cn(
        scrollable ? 'flex flex-col w-full' : 'flex h-full w-full flex-col',
        className
      )}
    >
      <SplitPanel
        direction="vertical"
        defaultSizes={desktopConfig.verticalSplit}
        className="h-full"
        panelGroupStyle={
          scrollable ? { height: 'max(600px, 150dvh)' } : undefined
        }
        collapsiblePanels={splitPanel3}
        showCollapseButton
        gappedHandle
        autoSaveId={botType ? `bot-panel-${botType}-desktop-outer` : null}
        key={
          botType
            ? `bot-panel-${botType}-desktop-outer`
            : 'bot-panel-none-desktop-outer'
        }
      >
        <SplitPanel
          direction="horizontal"
          defaultSizes={desktopConfig.topSplit}
          collapsiblePanels={splitPanel4}
          showCollapseButton
          gappedHandle
          className="h-full"
          autoSaveId={botType ? `bot-panel-${botType}-desktop-inner` : null}
          key={
            botType
              ? `bot-panel-${botType}-desktop-inner`
              : 'bot-panel-none-desktop-inner'
          }
        >
          {chartPanel}
          {formPanel}
        </SplitPanel>
        {insightsPanel}
      </SplitPanel>
    </div>
  );
}
