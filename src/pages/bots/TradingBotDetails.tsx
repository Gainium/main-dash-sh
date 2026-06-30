import { useIsReadOnly } from '@/lib/demoMode';
import { ArrowLeft, Copy, Edit, Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  BotPanelLayout,
  type BotPanelInsightsConfig,
} from '@/components/bots/panels/BotPanelLayout';
import BotChartPanel from '@/components/bots/panels/contents/chart/BotChartPanel';
import BotNotesPanel from '@/components/bots/panels/contents/notes/BotNotesPanel';
import { usePanelMenuBridge } from '@/components/bots/panels/hooks/usePanelMenuBridge';
import { type PanelContentConfig } from '@/components/bots/panels/PanelContainer';
import MainLayout from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import Backtests from '@/components/widgets/bots/Backtests';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { useResolvePairAsset } from '@/hooks/useResolvePairAsset';
/* import { useLiveUpdate } from '@/contexts/LiveUpdateContext'; */
import { resolveBotType } from '@/features/bots/registry/BotTypeRegistry';
import { useBacktests } from '@/hooks/useBacktests';
import { useBacktestsSummary } from '@/hooks/useBacktestsSummary';
import { useDcaBots } from '@/hooks/useDcaBots';
import { formatCurrency, formatPercentage } from '@/lib/utils';
import { useNotesStore } from '@/stores/notesStore';
import { buildBotEditRoute } from '@/utils/bots/navigation';

const INITIAL_LOADING_DELAY_MS = 900;

const TradingBotDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const resolvePairAsset = useResolvePairAsset();
  const isReadOnly = useIsReadOnly();

  // Redirect if in demo mode
  useEffect(() => {
    if (isReadOnly) {
      navigate('/bot', { replace: true });
    }
  }, [isReadOnly, navigate]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsBootstrapping(false);
    }, INITIAL_LOADING_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  const hasBotId = Boolean(id);
  const safeBotId = id ?? '';

  const { bots, isLoading: botsLoading } = useDcaBots({
    terminal: false,
    paperContext: false,
    all: true,
  });
  const bot = bots.find((b) => b._id === safeBotId);

  /* const { webSocketManager } = useLiveUpdate();

  useEffect(() => {
    if (!webSocketManager || !safeBotId) return;

    webSocketManager.subscribeToBot(safeBotId);

    return () => {
      webSocketManager.unsubscribeFromBot(safeBotId);
    };
  }, [safeBotId, webSocketManager]); */

  const {
    backtests,
    isLoading: backtestsLoading,
    error: backtestsError,
  } = useBacktests({
    filters: {
      page: 0,
      pageSize: 25,
    },
    enabled: hasBotId,
  });

  const backtestsSummary = useBacktestsSummary({
    backtests,
    isLoading: backtestsLoading,
    error: backtestsError,
    messages: {
      loadingSubtitle: 'Loading trading backtests',
    },
  });

  const backtestsBadge = useMemo<ReactNode>(() => {
    switch (backtestsSummary.status) {
      case 'loading':
        return <Badge variant="secondary">{backtestsSummary.badgeLabel}</Badge>;
      case 'error':
        return (
          <Badge variant="destructive">{backtestsSummary.badgeLabel}</Badge>
        );
      case 'empty':
        return <Badge variant="outline">{backtestsSummary.badgeLabel}</Badge>;
      case 'ready':
      default:
        return <Badge variant="secondary">{backtestsSummary.badgeLabel}</Badge>;
    }
  }, [backtestsSummary.badgeLabel, backtestsSummary.status]);

  const notesWidgetId = hasBotId
    ? `trading-notes-${safeBotId}`
    : 'trading-notes-detail';
  const notesEntry = useNotesStore((state) => state.notes[notesWidgetId]);

  const notesBadge = useMemo<ReactNode>(() => {
    if (!notesEntry) {
      return <Badge variant="secondary">New</Badge>;
    }

    const hasContent = Boolean(notesEntry.content?.trim());
    return hasContent ? (
      <Badge variant="outline">Saved</Badge>
    ) : (
      <Badge variant="outline">Empty</Badge>
    );
  }, [notesEntry]);

  const [chartMenu, handleChartMenuChange] = usePanelMenuBridge();

  const overviewPanel = useMemo<PanelContentConfig>(() => {
    if (!bot) {
      return {
        title: 'Bot overview',
        description: 'Key metrics summary.',
        content: (
          <Card className="h-full">
            <CardHeader className="space-y-xs px-0">
              <CardTitle className="text-lg">No data available</CardTitle>
              <CardDescription>
                We could not load metrics for this bot.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex h-full flex-col justify-between gap-md px-0">
              <p className="text-sm text-muted-foreground">
                The bot may be archived or unavailable. Try refreshing the page
                or returning to the bot list.
              </p>
              <div className="rounded-md bg-muted px-sm py-xs text-xs text-muted-foreground">
                <span className="font-medium">Bot ID</span>:{' '}
                <span className="font-mono">{safeBotId}</span>
              </div>
            </CardContent>
          </Card>
        ),
        contentClassName: 'flex h-full flex-col',
        containerClassName: 'min-h-[280px]',
      } satisfies PanelContentConfig;
    }

    const totalProfit = bot.profit?.totalUsd ?? 0;
    const netProfitPerc = bot.stats?.numerical?.general?.netProfitPerc ?? 0;
    const activeDeals = bot.dealsInBot?.active ?? 0;
    const totalDeals = bot.dealsInBot?.all ?? 0;
    const createdDate = bot.created
      ? new Date(bot.created).toLocaleDateString()
      : '—';
    const statusLabel = (bot.status ?? 'unknown').replace(/-/g, ' ');

    return {
      title: 'Bot overview',
      description: 'Key performance indicators and metadata.',
      content: (
        <Card className="h-full">
          <CardHeader className="space-y-xs px-0">
            <CardTitle className="text-lg">
              {bot.settings?.name || 'Trading bot'}
            </CardTitle>
            <CardDescription>
              {bot.exchange} • {bot.settings?.strategy || 'Unknown strategy'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-between gap-md px-0">
            <div className="grid gap-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border px-sm py-xs">
                <p className="text-xs uppercase text-muted-foreground">
                  Total profit (USD)
                </p>
                <p className="text-lg font-semibold">
                  {formatCurrency(totalProfit)}
                </p>
              </div>
              <div className="rounded-lg border border-border px-sm py-xs">
                <p className="text-xs uppercase text-muted-foreground">
                  Net profit
                </p>
                <p className="text-lg font-semibold">
                  {formatPercentage(netProfitPerc)}
                </p>
              </div>
              <div className="rounded-lg border border-border px-sm py-xs">
                <p className="text-xs uppercase text-muted-foreground">
                  Active deals
                </p>
                <p className="text-lg font-semibold">
                  {activeDeals}/{totalDeals}
                </p>
              </div>
              <div className="rounded-lg border border-border px-sm py-xs">
                <p className="text-xs uppercase text-muted-foreground">
                  Status
                </p>
                <p className="text-lg font-semibold capitalize">
                  {statusLabel}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-xs px-0">
            <p className="text-xs text-muted-foreground">
              Created: <span className="font-medium">{createdDate}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Bot ID: <span className="font-mono">{safeBotId}</span>
            </p>
          </CardFooter>
        </Card>
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[320px]',
    } satisfies PanelContentConfig;
  }, [bot, safeBotId]);

  const chartPanel = useMemo<PanelContentConfig>(() => {
    const base: PanelContentConfig = {
      content: (
        <BotChartPanel
          widgetId="trading-detail-bot-chart"
          data={{ botId: safeBotId }}
          variant="panel"
          className="h-full"
          onPanelMenuChange={handleChartMenuChange}
        />
      ),
      contentClassName: 'flex h-full flex-col',
      containerClassName: 'min-h-[320px]',
    };

    if (chartMenu) {
      base.menu = chartMenu;
    }

    return base;
  }, [chartMenu, handleChartMenuChange, safeBotId]);

  const insightsConfig = useMemo<BotPanelInsightsConfig>(
    () => ({
      defaultTab: backtestsSummary.total > 0 ? 'backtests' : 'notes',
      actions: backtestsSummary.subtitle ? (
        <span>{backtestsSummary.subtitle}</span>
      ) : undefined,
      tabs: [
        {
          key: 'backtests',
          title: 'Backtests',
          badge: backtestsBadge,
          content: (
            <Backtests
              widgetId="trading-backtests-detail"
              variant="panel"
              data={{ botId: safeBotId }}
            />
          ),
        },
        {
          key: 'notes',
          title: 'Notes',
          badge: notesBadge,
          content: <BotNotesPanel widgetId={notesWidgetId} />,
        },
      ],
    }),
    [
      backtestsBadge,
      backtestsSummary.subtitle,
      backtestsSummary.total,
      notesBadge,
      notesWidgetId,
      safeBotId,
    ]
  );

  const loadingOverviewPanel = useMemo<PanelContentConfig>(
    () => ({
      title: 'Bot overview',
      description: 'Preparing summary…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <div className="space-y-sm">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="grid gap-sm sm:grid-cols-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[320px]',
    }),
    []
  );

  const loadingChartPanel = useMemo<PanelContentConfig>(
    () => ({
      title: 'Bot performance chart',
      description: 'Fetching metrics…',
      content: (
        <div className="flex h-full flex-col gap-md">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-[220px] w-full rounded-xl" />
          <div className="flex gap-xs">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ),
      containerClassName: 'min-h-[320px]',
    }),
    []
  );

  const loadingInsightsConfig: BotPanelInsightsConfig = useMemo(
    () => ({
      defaultTab: 'backtests',
      tabs: [
        {
          key: 'backtests',
          title: 'Backtests',
          badge: <Skeleton className="h-5 w-16 rounded-full" />,
          content: (
            <div className="flex h-full flex-col gap-sm">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ),
        },
        {
          key: 'notes',
          title: 'Notes',
          badge: <Skeleton className="h-5 w-12 rounded-full" />,
          content: (
            <div className="flex h-full flex-col gap-sm">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full" />
            </div>
          ),
        },
      ],
    }),
    []
  );

  const handleEdit = () => {
    if (!safeBotId) {
      return;
    }

    const botTypeId = resolveBotType('trading').id;
    navigate(buildBotEditRoute(botTypeId, safeBotId));
  };

  const handleClone = () => {
    navigate(`/bot/new?load=${safeBotId}`);
  };

  const handleStatusToggle = () => {
    // TODO: Implement status toggle logic
    console.log('Toggle bot status:', safeBotId);
  };

  const handleBack = () => {
    navigate('/bot');
  };

  if (!hasBotId) {
    return (
      <MainLayout pageTitle="Trading Bot Details" activePage="/bot">
        <div className="p-lg">
          <div className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-md py-md text-amber-900">
            No bot ID provided.
          </div>
        </div>
      </MainLayout>
    );
  }

  const isLoading = isBootstrapping || botsLoading;

  if (!bot && !isLoading) {
    return (
      <MainLayout pageTitle="Bot Not Found" activePage={`/bot/${safeBotId}`}>
        <div className="flex h-64 flex-col items-center justify-center space-y-md">
          <div className="text-muted-foreground">Bot not found</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-xs h-4 w-4" />
            Back
          </Button>
        </div>
      </MainLayout>
    );
  }

  const symbolPair =
    bot?.symbol?.[0]?.value?.symbol || bot?.settings?.pair?.[0] || 'BTCUSDT';
  // Resolve asset class + venue so a tokenized-stock bot shows its real logo.
  const stockMeta = resolvePairAsset(
    bot?.exchange,
    bot?.symbol?.[0]?.value?.baseAsset,
    bot?.symbol?.[0]?.value?.quoteAsset
  );
  const isActive = bot?.status === 'open';

  return (
    <MainLayout
      pageTitle="Trading Bot Details"
      activePage={`/bot/${safeBotId}`}
    >
      <div className="flex flex-1 flex-col gap-md p-sm md:p-md">
        {isLoading ? (
          <Card className="p-lg">
            <div className="flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-md">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-xs">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64" />
                </div>
              </div>
              <div className="flex gap-xs">
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </Card>
        ) : bot ? (
          <Card className="p-lg">
            <div className="flex flex-col gap-md lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-md">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="p-xs"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <CoinPair
                  baseAsset={bot.symbol?.[0]?.value?.baseAsset}
                  quoteAsset={bot.symbol?.[0]?.value?.quoteAsset}
                  pair={symbolPair}
                  assetClass={stockMeta.assetClass}
                  exchange={stockMeta.exchange}
                />
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold">
                    {bot.settings?.name || 'Unnamed Bot'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-xs text-sm text-muted-foreground">
                    <span>{bot.exchange}</span>
                    <span>•</span>
                    <span>{bot.settings?.strategy || 'Unknown Strategy'}</span>
                    <span>•</span>
                    <StatusChip status={bot.status} size="sm" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-xs">
                {bot.status === 'open' /* || bot.status === 'paused' */ && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStatusToggle}
                  >
                    {isActive ? (
                      <>
                        <Pause className="mr-xs h-4 w-4" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play className="mr-xs h-4 w-4" />
                        Resume
                      </>
                    )}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleClone}>
                  <Copy className="mr-xs h-4 w-4" />
                  Clone
                </Button>
                <Button
                  onClick={handleEdit}
                  size="sm"
                  className="gradient-brand hover:opacity-90"
                >
                  <Edit className="mr-xs h-4 w-4" />
                  Edit
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <BotPanelLayout
          chart={isLoading ? loadingChartPanel : chartPanel}
          form={isLoading ? loadingOverviewPanel : overviewPanel}
          insights={isLoading ? loadingInsightsConfig : insightsConfig}
          className="flex-1"
          botType="dca"
        />
      </div>
    </MainLayout>
  );
};

export default TradingBotDetails;
