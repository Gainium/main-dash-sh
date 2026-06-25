/**
 * Hedge DCA bot — list page.
 *
 * Wraps the data in the same `WidgetContainer` / `Widget` shell that the
 * regular `/bot` (Trading Bots) page uses, so the page chrome looks
 * consistent. The DataTable's built-in card↔table toggle handles the
 * view switching; cards are rendered with `HedgeBotCard`, which mirrors
 * the regular `BotCard`'s visual language. Backed by `useHedgeDcaBots`
 * which is store-driven and updates live via `socketIntegration`.
 *
 * Routes: `/hedge/bot`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bot, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';

import { BotDetailsDrawer } from '@/components/bots/BotDetailsDrawer';
import { HedgeBotCard } from '@/components/bots/HedgeBotCard';
import { PremiumUpgrade } from '@/components/license/PremiumUpgrade';
import MainLayout from '@/components/layout/MainLayout';
import { useLicense } from '@/lib/license';
import WidgetContainer from '@/components/layout/WidgetContainer';
import {
  ExchangeChip,
  ProfitAndPerc,
  ProfitLossPercChip,
  StatusChip,
} from '@/components/ui/chip';
import { DataTable } from '@/components/ui/data-table/data-table';
import EmptyState from '@/components/ui/empty-state';
import { HedgeBotActionsCell } from './HedgeBotActionsCell';
import { MotionButton } from '@/components/ui/MotionWrapper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Widget from '@/components/ui/widget';
import OpenOrdersWidget from '@/components/widgets/shared/OpenOrdersWidget';
import BotListStatsBoxes from '@/components/ui/BotListStatsBoxes';
import { computeBotListStats, type BotForStats } from '@/hooks/useBotListStats';
import { useUIStore } from '@/stores/uiStore';
import { useHedgeDcaDeals } from '@/hooks/useHedgeDcaDeals';
import { dcaDealToOpenTrade } from '@/lib/utils/dcaDealToOpenTrade';
import { useHedgeDcaBots } from '@/hooks/useHedgeDcaBots';
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';
import { getLocalPrices } from '@/helper/price';
import { useHedgeUnPnlMap } from '@/utils/bots/hedge/useHedgeUnPnlMap';
import {
  BotTypesEnum,
  DCADealStatusEnum,
  StrategyEnum,
  type DCABot,
  type HedgeBot,
} from '@/types';
import { transformDcaBotToBot } from '@/types/dcaBot';
import { useShareContext } from '@/hooks/useShareContext';
import { useSharedBot } from '@/hooks/useSharedBot';
import { useAuthStore } from '@/stores/authStore';

const HEDGE_BOTS_WIDGET_MOTION = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: 0.4,
    delay: 0.3,
    ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  },
};

const HEDGE_BOTS_HEADER_MOTION = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.3, delay: 0.5 },
};

const HEDGE_BOTS_TABLE_MOTION = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: 0.6 },
};

const HEDGE_CARD_VIEW_BREAKPOINTS = {
  default: 1,
  480: 1,
  600: 2,
  900: 3,
  1200: 4,
};

const formatPair = (bot: HedgeBot): string => {
  const first = bot.symbol?.[0]?.value;
  if (!first) return '—';
  return first.symbol ?? `${first.baseAsset}${first.quoteAsset}`;
};

// Stable wrapper component — never closes over unPnlMap so its identity
// doesn't change every price tick. Reads unPnl from the row item itself
// (the parent enriches the bots list with __unPnl / __unPnlPerc below).
// Without the stable identity, the DataTable would unmount + remount
// every card on each WS price update and the entrance animation would
// flicker.
type EnrichedHedgeBot = HedgeBot & {
  __unPnl?: number;
  __unPnlPerc?: number;
  __totalProfitUsd?: number;
  __currentCost?: number;
  __maxCost?: number;
  __avgDaily?: number;
  __avgDailyPerc?: number;
  __annualizedReturn?: number;
  __legUsage?: { long?: number; short?: number };
  __legCost?: { long?: number; short?: number };
  __legMaxCost?: { long?: number; short?: number };
  __legUnPnl?: { long?: number; short?: number };
  __legUnPnlPerc?: { long?: number; short?: number };
};

const HedgeDcaBotCardWrapper = ({
  item,
  index,
}: {
  item: EnrichedHedgeBot;
  index: number;
}) => (
  <HedgeBotCard
    item={item}
    index={index}
    botType={BotTypesEnum.hedgeDca}
    unPnl={item.__unPnl}
    unPnlPerc={item.__unPnlPerc}
    totalProfitUsd={item.__totalProfitUsd}
    currentCost={item.__currentCost}
    maxCost={item.__maxCost}
    avgDaily={item.__avgDaily}
    avgDailyPerc={item.__avgDailyPerc}
    annualizedReturn={item.__annualizedReturn}
    {...(item.__legUsage ? { legUsage: item.__legUsage } : {})}
    {...(item.__legCost ? { legCost: item.__legCost } : {})}
    {...(item.__legMaxCost ? { legMaxCost: item.__legMaxCost } : {})}
    {...(item.__legUnPnl ? { legUnPnl: item.__legUnPnl } : {})}
    {...(item.__legUnPnlPerc ? { legUnPnlPerc: item.__legUnPnlPerc } : {})}
  />
);

const HedgeDcaBots = () => {
  // Hedge bots are a premium-only feature.
  // The premium check fires AFTER all the data hooks so React's hook
  // count stays stable across `isPremium` transitions — the wasted
  // fetch on free-tier is negligible and avoids a Rules-of-Hooks
  // violation that would otherwise crash the page when the user's
  // license state flips.
  const { isPremium } = useLicense();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const selectedBotId = params.id ?? null;
  const { bots, isLoading } = useHedgeDcaBots();
  const unPnlMap = useHedgeUnPnlMap(bots, false);
  const privacyMode = useUIStore((s) => s.privacyMode);

  /** Unified KPI stats for the bot-list header. Sums per-leg fields up to
   * the hedge wrapper because the backend leaves `profit/dealsInBot`
   * un-aggregated on the wrapper itself.
   *
   * Capital deployed / required come from the SAME `unPnlMap` the table's
   * "Cost" and "Max cost" columns read (`currentValue` / `maxValue`), not the
   * raw `assets.used.quote`. The raw assets sum ignores `usdRate` and isn't
   * leg-direction-aware, so on hedge bots — which always carry a short leg
   * valued off its base balance — it diverged from the per-bot cost shown in
   * the table. Sourcing both from `unPnlMap` keeps the stat reconciled with
   * the column it summarizes. */
  const botListStats = useMemo(
    () =>
      computeBotListStats(
        bots.map<BotForStats>((bot) => {
          const legs = bot.bots ?? [];
          const u = unPnlMap.get(bot._id);
          return {
            status: bot.status,
            totalProfitUsd: legs.reduce(
              (sum, leg) => sum + (leg.profit?.totalUsd || 0),
              0
            ),
            todayProfitUsd: legs.reduce(
              (sum, leg) => sum + (leg.profitToday?.totalTodayUsd || 0),
              0
            ),
            usedQuote: u?.currentValue ?? 0,
            requiredQuote: u?.maxValue ?? 0,
            activeDeals: legs.reduce(
              (sum, leg) => sum + (leg.dealsInBot?.active || 0),
              0
            ),
          };
        })
      ),
    [bots, unPnlMap]
  );
  const { data: exchangesData } = useExchangesFromContext();
  const exchanges = exchangesData?.data?.exchanges;

  const enrichedBots = useMemo<EnrichedHedgeBot[]>(
    () =>
      bots.map((bot) => {
        const u = unPnlMap.get(bot._id);
        // The hedge wrapper's `profit.totalUsd` is not aggregated by the
        // backend — only each leg holds its own realised profit. Sum
        // them here so card / table consumers don't have to repeat the
        // arithmetic and don't render 0 when only one leg has closed
        // deals.
        const totalProfitUsd = (bot.bots ?? []).reduce(
          (acc, leg) => acc + (leg.profit?.totalUsd ?? 0),
          0
        );
        return {
          ...bot,
          __unPnl: u?.unPnl,
          __unPnlPerc: u?.unPnlPerc,
          __totalProfitUsd: totalProfitUsd,
          __currentCost: u?.currentValue,
          __maxCost: u?.maxValue,
          __avgDaily: u?.avgDaily,
          __avgDailyPerc: u?.avgDailyPerc,
          __annualizedReturn: u?.annualizedReturn,
          ...(u?.legUsage ? { __legUsage: u.legUsage } : {}),
          ...(u?.legCost ? { __legCost: u.legCost } : {}),
          ...(u?.legMaxCost ? { __legMaxCost: u.legMaxCost } : {}),
          ...(u?.legUnPnl ? { __legUnPnl: u.legUnPnl } : {}),
          ...(u?.legUnPnlPerc ? { __legUnPnlPerc: u.legUnPnlPerc } : {}),
        };
      }),
    [bots, unPnlMap]
  );

  const currentUser = useAuthStore((s) => s.user);
  const { shareId } = useShareContext();
  const sharedBotResult = useSharedBot({
    botId: selectedBotId ?? '',
    type: BotTypesEnum.hedgeDca,
    shareId,
  });

  const selectedHedgeBot = useMemo(() => {
    const fromList = bots.find((b) => b._id === selectedBotId) ?? null;
    if (fromList) return fromList;
    if (shareId && sharedBotResult.bot) {
      // The hedge query returns the wrapper shape; cast through unknown.
      return sharedBotResult.bot as unknown as (typeof bots)[number];
    }
    return null;
  }, [bots, selectedBotId, shareId, sharedBotResult.bot]);

  // Active leg for the drawer (long / short). Reset to "long" whenever
  // the selected hedge bot changes so reopening the drawer doesn't carry
  // over the leg from a previous bot.
  const [drawerLeg, setDrawerLeg] = useState<'long' | 'short'>('long');
  useEffect(() => {
    setDrawerLeg('long');
  }, [selectedBotId]);

  // Reuse BotDetailsDrawer with the active leg transformed via the same
  // formula the regular trading-bots page uses. Switching legs swaps
  // the bot prop — the drawer's queries (deals / orders / settings)
  // re-key off `bot._id`, so the panels update without remounting the
  // drawer chrome itself.
  const drawerBot = useMemo(() => {
    if (!selectedHedgeBot) return null;
    const targetStrategy =
      drawerLeg === 'long' ? StrategyEnum.long : StrategyEnum.short;
    const leg = selectedHedgeBot.bots?.find(
      (b) => b.settings?.strategy === targetStrategy
    );
    if (!leg) return null;
    try {
      return transformDcaBotToBot(
        leg as DCABot,
        [],
        getLocalPrices(),
        false,
        exchanges
      );
    } catch {
      return null;
    }
  }, [selectedHedgeBot, exchanges, drawerLeg]);

  const legSwitcher = useMemo(
    () => (
      <Tabs
        value={drawerLeg}
        onValueChange={(v) => setDrawerLeg(v as 'long' | 'short')}
      >
        <TabsList>
          <TabsTrigger value="long">Long leg</TabsTrigger>
          <TabsTrigger value="short">Short leg</TabsTrigger>
        </TabsList>
      </Tabs>
    ),
    [drawerLeg]
  );

  const handleSelectBot = useCallback(
    (botId: string) => navigate(`/hedge/bot/view/${botId}`),
    [navigate]
  );
  const handleCloseDrawer = useCallback(
    () => navigate('/hedge/bot'),
    [navigate]
  );

  // ----- Deals tab -----
  // `?view=deals` drives the page-level Bots/Deals toggle so reloads and deep
  // links land on the right view — same contract the regular `/bot` page uses.
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab: 'bots' | 'deals' =
    searchParams.get('view') === 'deals' ? 'deals' : 'bots';
  const setPageTab = useCallback(
    (tab: 'bots' | 'deals') => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === 'deals') next.set('view', 'deals');
          else next.delete('view');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Drive the deal fetch by the widget's open/closed toggle (backend defaults
  // to open-only, so the Closed view is empty without this). Fetch only while
  // the Deals tab is active — the dedicated `hedgeDcaDealList` query keeps its
  // own react-query cache and never touches the shared DCA deal store, so it
  // can't be clobbered by the list page's `useDcaDeals` reconcile (which is
  // what made these deals appear then vanish).
  const [dealsStatus, setDealsStatus] = useState<'open' | 'closed'>('open');
  const { deals: hedgeDealsForTab } = useHedgeDcaDeals({
    status:
      dealsStatus === 'closed'
        ? DCADealStatusEnum.closed
        : DCADealStatusEnum.open,
    enabled: pageTab === 'deals',
  });

  const hedgeDealsAsOpenTrades = useMemo(
    () => hedgeDealsForTab.map(dcaDealToOpenTrade),
    [hedgeDealsForTab]
  );

  const columns = useMemo<ColumnDef<EnrichedHedgeBot>[]>(
    () => [
      {
        id: 'pair',
        header: 'Pair',
        accessorFn: (row) => formatPair(row),
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue() as string}</span>
        ),
      },
      {
        id: 'name',
        header: 'Name',
        // Hedge wrapper has no name of its own — surface whichever leg
        // has one so the user can tell their bots apart in the list.
        accessorFn: (row) => {
          const long = row.bots?.find(
            (b) => b.settings?.strategy === StrategyEnum.long
          );
          const short = row.bots?.find(
            (b) => b.settings?.strategy === StrategyEnum.short
          );
          return long?.settings?.name || short?.settings?.name || 'Hedge bot';
        },
        cell: ({ getValue }) => (
          <span className="truncate" title={getValue() as string}>
            {getValue() as string}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row.status,
        cell: ({ getValue }) => (
          <StatusChip status={getValue() as string} size="sm" />
        ),
      },
      {
        id: 'longExchange',
        header: 'Long exchange',
        accessorFn: (row) => {
          const leg = row.bots?.find(
            (b) => b.settings?.strategy === StrategyEnum.long
          );
          return leg?.exchange ?? '';
        },
        cell: ({ row }) => {
          const leg = row.original.bots?.find(
            (b) => b.settings?.strategy === StrategyEnum.long
          );
          if (!leg?.exchangeUUID) return '—';
          return (
            <ExchangeChip
              exchangeId={leg.exchangeUUID}
              {...(leg.exchange ? { provider: leg.exchange } : {})}
              size="xs"
              chipStyle="ghost"
            />
          );
        },
      },
      {
        id: 'shortExchange',
        header: 'Short exchange',
        accessorFn: (row) => {
          const leg = row.bots?.find(
            (b) => b.settings?.strategy === StrategyEnum.short
          );
          return leg?.exchange ?? '';
        },
        cell: ({ row }) => {
          const leg = row.original.bots?.find(
            (b) => b.settings?.strategy === StrategyEnum.short
          );
          if (!leg?.exchangeUUID) return '—';
          return (
            <ExchangeChip
              exchangeId={leg.exchangeUUID}
              {...(leg.exchange ? { provider: leg.exchange } : {})}
              size="xs"
              chipStyle="ghost"
            />
          );
        },
      },
      {
        id: 'deals',
        header: 'Deals',
        // accessor returns the combined active count so column sorting
        // ranks the busiest bots highest.
        accessorFn: (row) => {
          const legs = row.bots ?? [];
          return legs.reduce((acc, l) => acc + (l.dealsInBot?.active ?? 0), 0);
        },
        cell: ({ row }) => {
          const legs = row.original.bots ?? [];
          const active = legs.reduce(
            (acc, l) => acc + (l.dealsInBot?.active ?? 0),
            0
          );
          const all = legs.reduce(
            (acc, l) => acc + (l.dealsInBot?.all ?? 0),
            0
          );
          return (
            <span className="text-sm">
              <span className="font-medium">{active}</span>
              <span className="text-muted-foreground"> / {all}</span>
            </span>
          );
        },
        meta: { filterType: 'number' as const },
      },
      {
        id: 'currentCost',
        header: 'Cost',
        accessorFn: (row) => row.__currentCost ?? 0,
        cell: ({ getValue }) => (
          <span className="text-sm">
            ${(getValue() as number).toFixed(2)}
          </span>
        ),
        meta: { filterType: 'number' as const },
      },
      {
        id: 'maxCost',
        header: 'Max cost',
        accessorFn: (row) => row.__maxCost ?? 0,
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            ${(getValue() as number).toFixed(2)}
          </span>
        ),
        meta: { filterType: 'number' as const },
      },
      {
        id: 'profitTotalUsd',
        header: 'Total profit',
        accessorFn: (row) => row.__totalProfitUsd ?? row.profit?.totalUsd ?? 0,
        cell: ({ getValue }) => (
          <ProfitAndPerc
            value={getValue() as number}
            percentage={0}
            privacyMode={false}
            hidePercentage
            size="sm"
          />
        ),
        meta: { filterType: 'number' as const },
      },
      {
        id: 'unPnl',
        header: 'Unrealized PnL',
        accessorFn: (row) => unPnlMap.get(row._id)?.unPnl ?? 0,
        cell: ({ row }) => {
          const u = unPnlMap.get(row.original._id);
          return (
            <ProfitAndPerc
              value={u?.unPnl ?? 0}
              percentage={u?.unPnlPerc ?? 0}
              privacyMode={false}
              size="sm"
            />
          );
        },
        meta: { filterType: 'number' as const },
      },
      {
        id: 'avgDaily',
        header: 'Avg daily',
        accessorFn: (row) => row.__avgDaily ?? 0,
        cell: ({ row }) => (
          <ProfitAndPerc
            value={row.original.__avgDaily ?? 0}
            percentage={row.original.__avgDailyPerc ?? 0}
            privacyMode={false}
            size="sm"
          />
        ),
        meta: { filterType: 'number' as const },
      },
      {
        id: 'annualized',
        header: 'Annualized',
        accessorFn: (row) => row.__annualizedReturn ?? 0,
        cell: ({ getValue }) => (
          <ProfitLossPercChip value={getValue() as number} size="sm" />
        ),
        meta: { filterType: 'number' as const },
      },
      {
        id: 'created',
        header: 'Created',
        accessorFn: (row) => row.created,
        cell: ({ getValue }) => {
          const v = getValue();
          if (!v) return '—';
          const d = new Date(v as string | number);
          return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
        },
      },
      {
        id: 'botId',
        accessorFn: (row) => row._id,
        header: 'BOT ID',
        enableSorting: false,
        cell: ({ row }) => {
          const value = row.original._id;
          if (!value) return <span className="text-muted-foreground">—</span>;
          return <span className="text-xs font-mono">{value}</span>;
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <HedgeBotActionsCell
            bot={row.original}
            botType={BotTypesEnum.hedgeDca}
          />
        ),
      },
    ],
    [unPnlMap]
  );

  if (!isPremium) {
    return (
      <MainLayout pageTitle="Hedge DCA Bots" activePage="/hedge/bot">
        <PremiumUpgrade
          feature="Hedge DCA bots"
          description="Hedge bots run paired long/short strategies and require a premium license."
        />
      </MainLayout>
    );
  }

  // Share-mode: render ONLY the shared bot's drawer. MainLayout flips
  // to SharedPageLayout so the chrome is already minimal.
  if (shareId) {
    const sharedOwnerId =
      (selectedHedgeBot as unknown as { userId?: string })?.userId;
    return (
      <MainLayout pageTitle="Shared hedge bot" activePage="/hedge/bot">
        {drawerBot && selectedHedgeBot ? (
          <BotDetailsDrawer
            type={BotTypesEnum.hedgeDca}
            bot={drawerBot}
            parentBotId={selectedHedgeBot._id}
            legSwitcher={legSwitcher}
            open
            privacyMode={false}
            onClose={handleCloseDrawer}
            viewOnly
            ownerUserId={sharedOwnerId}
            fullWidth
          >
            <div />
          </BotDetailsDrawer>
        ) : (
          <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
            {sharedBotResult.isLoading
              ? 'Loading shared bot…'
              : 'Shared bot is not available.'}
          </div>
        )}
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Hedge DCA Bots" activePage="/hedge/bot">
      <div className="flex h-full min-h-0 flex-col">
        <WidgetContainer
          layout="flex"
          verticalGap
          className="h-full min-h-0 flex-1"
        >
          <motion.div {...HEDGE_BOTS_WIDGET_MOTION}>
            <Widget
              className="p-sm md:p-md text-card-foreground flex-1 min-h-[500px]"
              noPadding
              overflow="auto"
            >
              <Tabs
                value={pageTab}
                onValueChange={(v) => setPageTab(v as 'bots' | 'deals')}
              >
              <div className="flex h-full min-h-[500px] flex-col">
                <motion.div
                  className="mb-md shrink-0"
                  {...HEDGE_BOTS_HEADER_MOTION}
                >
                  {/* Small screens: title + New stacked, stats row below */}
                  <div className="flex items-center justify-between gap-xs sm:hidden">
                    <h2 className="text-xl font-semibold">Hedge DCA Bots</h2>
                    <div className="flex items-center gap-xs">
                      <TabsList className="w-auto!" fullWidth={false}>
                        <TabsTrigger value="bots">Bots</TabsTrigger>
                        <TabsTrigger value="deals">Deals</TabsTrigger>
                      </TabsList>
                      <MotionButton
                        variant="default"
                        onClick={() => navigate('/hedge/bot/new')}
                      >
                        <Plus className="mr-xs h-4 w-4" />
                        New
                      </MotionButton>
                    </div>
                  </div>
                  <div className="w-full sm:hidden mt-2">
                    <BotListStatsBoxes
                      stats={botListStats}
                      privacyMode={privacyMode}
                      isLoading={isLoading}
                      className="w-full"
                    />
                  </div>

                  {/* Large screens: title, stats and button on a single row */}
                  <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-xs w-full">
                    <h2 className="text-xl font-semibold">Hedge DCA Bots</h2>
                    <div className="min-w-0 flex justify-end px-md">
                      <BotListStatsBoxes
                        stats={botListStats}
                        privacyMode={privacyMode}
                        isLoading={isLoading}
                      />
                    </div>
                    <div className="flex items-center gap-xs justify-end">
                      <TabsList className="w-auto!" fullWidth={false}>
                        <TabsTrigger value="bots">Bots</TabsTrigger>
                        <TabsTrigger value="deals">Deals</TabsTrigger>
                      </TabsList>
                      <MotionButton
                        variant="default"
                        onClick={() => navigate('/hedge/bot/new')}
                      >
                        <Plus className="mr-xs h-4 w-4" />
                        New
                      </MotionButton>
                    </div>
                  </div>
                </motion.div>

                <TabsContent
                  value="bots"
                  className="flex-1 min-h-[400px] overflow-hidden mt-0"
                >
                <motion.div
                  className="flex-1 min-h-[400px] overflow-hidden"
                  {...HEDGE_BOTS_TABLE_MOTION}
                >
                  {!isLoading && bots.length === 0 ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <EmptyState
                        size="page"
                        icon={<Bot className="w-6 h-6" />}
                        title="No hedge DCA bots yet"
                        description="Hedge DCA bots pair a long and short DCA position to profit from volatility while staying market-neutral. Create one to get started."
                        action={{
                          label: 'Create hedge DCA bot',
                          onClick: () => navigate('/hedge/bot/new'),
                          icon: <Plus className="w-5 h-5" />,
                        }}
                      />
                    </div>
                  ) : (
                    <DataTable
                      tableId="hedge-dca-bots"
                      columns={columns}
                      data={enrichedBots}
                      getRowId={(row) => row._id}
                      enableGlobalFilter
                      enableColumnVisibility
                      defaultColumnVisibility={{ botId: false }}
                      enableSorting
                      enableCardView
                      defaultView="cards"
                      cardComponent={HedgeDcaBotCardWrapper}
                      cardViewBreakpoints={HEDGE_CARD_VIEW_BREAKPOINTS}
                      cardViewGap={16}
                      showPagination
                      defaultPinnedColumns={{ left: [], right: ['actions'] }}
                      className="h-full min-h-[400px]"
                      emptyMessage={
                        isLoading
                          ? 'Loading hedge bots…'
                          : 'No hedge DCA bots match your filters.'
                      }
                      onRowClick={(row) => handleSelectBot(row._id)}
                    />
                  )}
                </motion.div>
                </TabsContent>

                <TabsContent
                  value="deals"
                  className="flex-1 min-h-[400px] overflow-hidden mt-0"
                >
                  <OpenOrdersWidget
                    widgetId="hedge-dca-bot-deals"
                    data={{ trades: hedgeDealsAsOpenTrades }}
                    rawDeals={hedgeDealsForTab}
                    enableStatusToggle={true}
                    onStatusFilterChange={setDealsStatus}
                    privacyMode={privacyMode}
                  />
                </TabsContent>
              </div>
              </Tabs>
            </Widget>
          </motion.div>

          {drawerBot && selectedHedgeBot && (() => {
            const sharedOwnerId =
              (selectedHedgeBot as unknown as { userId?: string })?.userId;
            const viewOnly =
              !!shareId ||
              (!!currentUser && !!sharedOwnerId && sharedOwnerId !== currentUser.id);
            return (
              <BotDetailsDrawer
                type={BotTypesEnum.hedgeDca}
                bot={drawerBot}
                parentBotId={selectedHedgeBot._id}
                legSwitcher={legSwitcher}
                open
                privacyMode={false}
                onClose={handleCloseDrawer}
                viewOnly={viewOnly}
                ownerUserId={sharedOwnerId}
              >
                <div />
              </BotDetailsDrawer>
            );
          })()}
        </WidgetContainer>
      </div>
    </MainLayout>
  );
};

export default HedgeDcaBots;
