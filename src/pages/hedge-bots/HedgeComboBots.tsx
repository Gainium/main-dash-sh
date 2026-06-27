/**
 * Hedge Combo bot — list page.
 *
 * Same wrapper / motion / DataTable shell as HedgeDcaBots; only difference
 * is which store/hook backs the data and which edit-route the rows /
 * cards navigate to. Routes: `/hedge/combo`.
 */
import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Boxes, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';

import {
  BotDetailsDrawer,
  type HedgeDrawerContext,
} from '@/components/bots/BotDetailsDrawer';
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
import Widget from '@/components/ui/widget';
import BotListStatsBoxes from '@/components/ui/BotListStatsBoxes';
import { computeBotListStats, type BotForStats } from '@/hooks/useBotListStats';
import { useUIStore } from '@/stores/uiStore';
import { useHedgeComboBots } from '@/hooks/useHedgeComboBots';
import { useExchangesFromContext } from '@/contexts/ExchangeDataContext';
import { getLocalPrices } from '@/helper/price';
import { useHedgeUnPnlMap } from '@/utils/bots/hedge/useHedgeUnPnlMap';
import { computeHedgeUnPnl } from '@/utils/bots/hedge/computeHedgeUnPnl';
import { useHedgeLegUnrealized } from '@/hooks/useHedgeLegUnrealized';
import type { DrawerBot } from '@/types/bots/drawer';
import {
  BotTypesEnum,
  StrategyEnum,
  type ComboBot,
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

// Stable wrapper — see HedgeDcaBots for the rationale (live updates flow
// through item, not through closure, so the cardComponent identity stays
// stable and the cards don't remount + replay their entrance animation).
const HedgeComboBotCardWrapper = ({
  item,
  index,
}: {
  item: EnrichedHedgeBot;
  index: number;
}) => (
  <HedgeBotCard
    item={item}
    index={index}
    botType={BotTypesEnum.hedgeCombo}
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

const HedgeComboBots = () => {
  // Premium gate via the license adapter.
  // Placed after hook calls to keep React's hook count stable across
  // license-state transitions (see HedgeDcaBots for the same note).
  const { isPremium } = useLicense();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const selectedBotId = params.id ?? null;
  const { bots, isLoading } = useHedgeComboBots();
  const privacyMode = useUIStore((s) => s.privacyMode);

  const unPnlMap = useHedgeUnPnlMap(bots, true);

  /** Unified KPI stats. Same pattern as HedgeDcaBots: hedge wrapper has
   * no aggregated `profit/dealsInBot`, so we walk the legs. Capital
   * deployed / required come from the same `unPnlMap` the table's "Cost" /
   * "Max cost" columns read (`currentValue` / `maxValue`) rather than the
   * reserved `assets.used.quote`, so the stat reconciles with the table —
   * see HedgeDcaBots for the full rationale. */
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

  // Server-accurate per-leg unrealized (see HedgeDcaBots / useHedgeLegUnrealized
  // — the client price calc reads 0 for price-feed-less exchanges).
  const legUnrealized = useHedgeLegUnrealized(true);

  const enrichedBots = useMemo<EnrichedHedgeBot[]>(
    () =>
      bots.map((bot) => {
        const u = unPnlMap.get(bot._id);
        const totalProfitUsd = (bot.bots ?? []).reduce(
          (acc, leg) => acc + (leg.profit?.totalUsd ?? 0),
          0
        );
        const longLeg = (bot.bots ?? []).find(
          (l) => l.settings?.strategy === StrategyEnum.long
        );
        const shortLeg = (bot.bots ?? []).find(
          (l) => l.settings?.strategy === StrategyEnum.short
        );
        const longUn = longLeg ? (legUnrealized.get(longLeg._id) ?? 0) : 0;
        const shortUn = shortLeg ? (legUnrealized.get(shortLeg._id) ?? 0) : 0;
        const combinedUn = longUn + shortUn;
        const longCost = u?.legCost?.long ?? 0;
        const shortCost = u?.legCost?.short ?? 0;
        const currentCost = u?.currentValue ?? 0;
        return {
          ...bot,
          __unPnl: combinedUn,
          __unPnlPerc:
            currentCost > 0 ? (combinedUn / currentCost) * 100 : 0,
          __totalProfitUsd: totalProfitUsd,
          __currentCost: u?.currentValue,
          __maxCost: u?.maxValue,
          __avgDaily: u?.avgDaily,
          __avgDailyPerc: u?.avgDailyPerc,
          __annualizedReturn: u?.annualizedReturn,
          ...(u?.legUsage ? { __legUsage: u.legUsage } : {}),
          ...(u?.legCost ? { __legCost: u.legCost } : {}),
          ...(u?.legMaxCost ? { __legMaxCost: u.legMaxCost } : {}),
          __legUnPnl: { long: longUn, short: shortUn },
          __legUnPnlPerc: {
            long: longCost > 0 ? (longUn / longCost) * 100 : 0,
            short: shortCost > 0 ? (shortUn / shortCost) * 100 : 0,
          },
        };
      }),
    [bots, unPnlMap, legUnrealized]
  );

  const currentUser = useAuthStore((s) => s.user);
  const { shareId } = useShareContext();
  const sharedBotResult = useSharedBot({
    botId: selectedBotId ?? '',
    type: BotTypesEnum.hedgeCombo,
    shareId,
  });

  const selectedHedgeBot = useMemo(() => {
    const fromList = bots.find((b) => b._id === selectedBotId) ?? null;
    if (fromList) return fromList;
    if (shareId && sharedBotResult.bot) {
      return sharedBotResult.bot as unknown as (typeof bots)[number];
    }
    return null;
  }, [bots, selectedBotId, shareId, sharedBotResult.bot]);

  // Both legs transformed (combo formula) for the combined drawer view.
  const { longBot, shortBot } = useMemo(() => {
    const build = (strategy: StrategyEnum): DrawerBot | null => {
      const leg = selectedHedgeBot?.bots?.find(
        (b) => b.settings?.strategy === strategy
      );
      if (!leg) return null;
      try {
        return transformDcaBotToBot(
          leg as ComboBot,
          [],
          getLocalPrices(),
          true,
          exchanges
        );
      } catch {
        return null;
      }
    };
    return {
      longBot: build(StrategyEnum.long),
      shortBot: build(StrategyEnum.short),
    };
  }, [selectedHedgeBot, exchanges]);

  const drawerPrimaryBot = longBot ?? shortBot;

  const hedgeDrawerContext = useMemo<HedgeDrawerContext | null>(() => {
    if (!selectedHedgeBot || !drawerPrimaryBot) return null;
    const unPnl =
      unPnlMap.get(selectedHedgeBot._id) ??
      computeHedgeUnPnl(selectedHedgeBot, getLocalPrices(), [], true, exchanges);
    const totalProfitUsd = (selectedHedgeBot.bots ?? []).reduce(
      (acc, leg) => acc + (leg.profit?.totalUsd ?? 0),
      0
    );
    return {
      longBot,
      shortBot,
      unPnl,
      totalProfitUsd,
      isCombo: true,
      wrapperId: selectedHedgeBot._id,
      sharedSettings: selectedHedgeBot.sharedSettings,
    };
  }, [selectedHedgeBot, drawerPrimaryBot, longBot, shortBot, unPnlMap, exchanges]);

  const handleSelectBot = useCallback(
    (botId: string) => navigate(`/hedge/combo/view/${botId}`),
    [navigate]
  );
  const handleCloseDrawer = useCallback(
    () => navigate('/hedge/combo'),
    [navigate]
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
        // Deal-derived unrealized enriched onto the row (client value reads 0
        // for price-feed-less exchanges).
        accessorFn: (row) => row.__unPnl ?? 0,
        cell: ({ row }) => (
          <ProfitAndPerc
            value={row.original.__unPnl ?? 0}
            percentage={row.original.__unPnlPerc ?? 0}
            privacyMode={false}
            size="sm"
          />
        ),
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
            botType={BotTypesEnum.hedgeCombo}
          />
        ),
      },
    ],
    // Column defs read each row's already-enriched bot, not unPnlMap directly
    // (the unrealized values are baked into `enrichedBots`), so the table
    // structure has no reactive deps.
    []
  );

  if (!isPremium) {
    return (
      <MainLayout pageTitle="Hedge Combo Bots" activePage="/hedge/combo">
        <PremiumUpgrade
          feature="Hedge combo bots"
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
      <MainLayout pageTitle="Shared hedge bot" activePage="/hedge/combo">
        {drawerPrimaryBot && selectedHedgeBot && hedgeDrawerContext ? (
          <BotDetailsDrawer
            type={BotTypesEnum.hedgeCombo}
            bot={drawerPrimaryBot}
            parentBotId={selectedHedgeBot._id}
            hedge={hedgeDrawerContext}
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
    <MainLayout pageTitle="Hedge Combo Bots" activePage="/hedge/combo">
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
              <div className="flex h-full min-h-[500px] flex-col">
                <motion.div
                  className="mb-md shrink-0"
                  {...HEDGE_BOTS_HEADER_MOTION}
                >
                  <div className="flex items-center justify-between gap-xs sm:hidden">
                    <h2 className="text-xl font-semibold">Hedge Combo Bots</h2>
                    <MotionButton
                      variant="default"
                      onClick={() => navigate('/hedge/combo/new')}
                    >
                      <Plus className="mr-xs h-4 w-4" />
                      New
                    </MotionButton>
                  </div>
                  <div className="w-full sm:hidden mt-2">
                    <BotListStatsBoxes
                      stats={botListStats}
                      privacyMode={privacyMode}
                      isLoading={isLoading}
                      className="w-full"
                    />
                  </div>

                  <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-xs w-full">
                    <h2 className="text-xl font-semibold">Hedge Combo Bots</h2>
                    <div className="min-w-0 flex justify-end px-md">
                      <BotListStatsBoxes
                        stats={botListStats}
                        privacyMode={privacyMode}
                        isLoading={isLoading}
                      />
                    </div>
                    <MotionButton
                      variant="default"
                      onClick={() => navigate('/hedge/combo/new')}
                    >
                      <Plus className="mr-xs h-4 w-4" />
                      New
                    </MotionButton>
                  </div>
                </motion.div>

                <motion.div
                  className="flex-1 min-h-[400px] overflow-hidden"
                  {...HEDGE_BOTS_TABLE_MOTION}
                >
                  {!isLoading && bots.length === 0 ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <EmptyState
                        size="page"
                        icon={<Boxes className="w-6 h-6" />}
                        title="No hedge combo bots yet"
                        description="Hedge combo bots pair long and short combo configurations to stay market-neutral while trading multiple pairs. Create one to get started."
                        action={{
                          label: 'Create hedge combo bot',
                          onClick: () => navigate('/hedge/combo/new'),
                          icon: <Plus className="w-5 h-5" />,
                        }}
                      />
                    </div>
                  ) : (
                    <DataTable
                      tableId="hedge-combo-bots"
                      columns={columns}
                      data={enrichedBots}
                      getRowId={(row) => row._id}
                      enableGlobalFilter
                      enableColumnVisibility
                      defaultColumnVisibility={{ botId: false }}
                      enableSorting
                      enableCardView
                      defaultView="cards"
                      cardComponent={HedgeComboBotCardWrapper}
                      cardViewBreakpoints={HEDGE_CARD_VIEW_BREAKPOINTS}
                      cardViewGap={16}
                      showPagination
                      defaultPinnedColumns={{ left: [], right: ['actions'] }}
                      className="h-full min-h-[400px]"
                      emptyMessage={
                        isLoading
                          ? 'Loading hedge combo bots…'
                          : 'No hedge combo bots match your filters.'
                      }
                      onRowClick={(row) => handleSelectBot(row._id)}
                    />
                  )}
                </motion.div>
              </div>
            </Widget>
          </motion.div>

          {drawerPrimaryBot && selectedHedgeBot && hedgeDrawerContext && (() => {
            const sharedOwnerId =
              (selectedHedgeBot as unknown as { userId?: string })?.userId;
            const viewOnly =
              !!shareId ||
              (!!currentUser && !!sharedOwnerId && sharedOwnerId !== currentUser.id);
            return (
              <BotDetailsDrawer
                type={BotTypesEnum.hedgeCombo}
                bot={drawerPrimaryBot}
                parentBotId={selectedHedgeBot._id}
                hedge={hedgeDrawerContext}
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

export default HedgeComboBots;
