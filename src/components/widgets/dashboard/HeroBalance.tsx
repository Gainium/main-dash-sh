/* eslint-disable spacing/no-hardcoded-font-size */
import {
  ResponsiveCurrencyValue,
  type FontStep,
} from '@/components/ui/ResponsiveCurrencyValue';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useLegacyDashboardStats } from '@/hooks/useDashboardStatsBatch';
import {
  usePositionTotals,
  type PositionTotalsScope,
} from '@/hooks/usePositionTotals';
import { NotCalculated } from '@/components/ui/large-account';
import { GraphQlQuery, type ReturnResult } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  StatusEnum,
  type PortfolioQuery,
  type ProfitQuery,
} from '@/types';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import { getValidTimezone } from '@/utils/timeUtils';
import { Skeleton } from '@/components/ui/skeleton';
import React, { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

interface PortfolioAssetWithExchanges {
  name: string;
  amount: number;
  amountUsd: number;
  exchanges?: unknown[] | null;
}

interface DealDashboardStatsApiResponse {
  result: Array<{
    normal: number;
    inProfit: number;
    eighty: number;
    max: number;
    unrealizedProfit: number;
  }>;
}

interface ProfitApiResponse {
  result: Array<{ quote: number }>;
}

type AllocationDataItem = {
  name: string;
  value: number;
  color: string;
  percentage: number;
};

const HERO_BALANCE_FONT_STEPS: FontStep[] = [
  { sizeClass: 'text-7xl', px: 72 },
  { sizeClass: 'text-6xl', px: 60 },
  { sizeClass: 'text-5xl', px: 48 },
  { sizeClass: 'text-4xl', px: 36 },
  { sizeClass: 'text-3xl', px: 30 },
];

// Font ladder for the KPI tile values. Starts at text-xl and drops to text-xs
// so long currency values like "-$12,609.69" stay on one line in narrow tiles.
const KPI_FONT_STEPS: FontStep[] = [
  { sizeClass: 'text-xl', px: 20 },
  { sizeClass: 'text-lg', px: 18 },
  { sizeClass: 'text-base', px: 16 },
  { sizeClass: 'text-sm', px: 14 },
  { sizeClass: 'text-xs', px: 12 },
];

// Calendar date (YYYY-MM-DD) in the user's timezone. The daily-profit backend
// keys rows by the timezone's STANDARD-offset midnight and does NOT apply DST,
// so an exact-ISO match drops every row in summer (the instant is off by an
// hour). Matching on the calendar day instead stays correct across DST. Mirrors
// the Profit widget's `toTzDateKey`.
function toTzDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const POSITION_TOTALS_SCOPES: {
  positions: PositionTotalsScope[];
  pnl: PositionTotalsScope[];
} = {
  positions: ['dca', 'terminal', 'combo', 'grid', 'hedgeDca', 'hedgeCombo'],
  pnl: ['dca', 'terminal', 'combo', 'hedgeCombo'],
};

export const HeroBalance: React.FC = () => {
  const privacyMode = useUIStore((s) => s.privacyMode);
  const { exchanges } = useTransformedExchangesFromContext();
  // Stored timezone is free-text and may be an invalid IANA id (e.g. the
  // localized "Europa/Roma"); an invalid value throws in toTzDateKey's Intl
  // call and makes getProfitByUser return NOTOK. Sanitize to a valid zone.
  const userTimezone = useAuthStore((s) => getValidTimezone(s.user?.timezone));

  // Portfolio snapshots — only the last two days: the card shows the latest
  // total, its change against the previous snapshot and the latest asset
  // split. It used to pull the default 30-day history (with every asset of
  // every snapshot) for that. `from` floored to the UTC day keeps the cache
  // key stable.
  const portfolioQuery = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const from = Math.floor(Date.now() / dayMs) * dayMs - 2 * dayMs;
    return GraphQlQuery.getPortfolioByUser({ from });
  }, []);
  const { data: portfolioData, isLoading: portfolioLoading } =
    useGraphQL<PortfolioQuery>('getPortfolioByUser', portfolioQuery);

  // Reuse the exact daily-profit query Profit widget makes; cache key + variables
  // match so the two widgets share the same fetch.
  const dailyProfitQuery = useMemo(
    () =>
      GraphQlQuery.getProfitByUser(
        { timezone: userTimezone, timeframe: 0 },
        'quote\ndate'
      ),
    [userTimezone]
  );
  const { data: dailyProfit } = useGraphQL<ProfitQuery>(
    'getProfitByUser',
    dailyProfitQuery
  );

  // "In positions" and uPnL are summed on the server in USD. This used to
  // add `usage.current.quote` over three full bot lists (a separate 5 MB
  // fetch, truncated at 500 bots), treating USDT, BTC and USD amounts as if
  // they were all dollars, with grid bots counted at their budget.
  const positionTotals = usePositionTotals(POSITION_TOTALS_SCOPES);

  // Deal stats and all-time profit per bot type: the same single batched
  // request (and cache entry) the Status widget and usePositionTotals use.
  const legacyStats = useLegacyDashboardStats();
  const dcaDealStats = legacyStats.data?.dealDca as
    | ReturnResult<DealDashboardStatsApiResponse>
    | undefined;
  const comboDealStats = legacyStats.data?.dealCombo as typeof dcaDealStats;
  const hedgeDealStats = legacyStats.data?.dealHedge as typeof dcaDealStats;
  const terminalDealStats = legacyStats.data
    ?.dealTerminal as typeof dcaDealStats;
  const dcaAllProfit = legacyStats.data?.profitDca as
    | ReturnResult<ProfitApiResponse>
    | undefined;
  const gridAllProfit = legacyStats.data?.profitGrid as typeof dcaAllProfit;
  const comboAllProfit = legacyStats.data?.profitCombo as typeof dcaAllProfit;
  const hedgeAllProfit = legacyStats.data?.profitHedge as typeof dcaAllProfit;
  const terminalAllProfit = legacyStats.data
    ?.profitTerminal as typeof dcaAllProfit;

  const {
    totalValue,
    changeValue,
    changePercent,
    exchangeCount,
    allocationData,
    topAllocation,
  } = useMemo(() => {
    const fallback = {
      totalValue: 0,
      changeValue: 0,
      changePercent: 0,
      exchangeCount: exchanges.filter((e) => e.id !== 'ALL').length,
      allocationData: [] as AllocationDataItem[],
      topAllocation: null as AllocationDataItem | null,
    };
    if (
      !portfolioData?.data?.result ||
      portfolioData.status !== StatusEnum.ok
    ) {
      return fallback;
    }
    const snapshots = portfolioData.data.result;
    if (!snapshots.length) return fallback;

    const sorted = [...snapshots].sort((a, b) => a.updateTime - b.updateTime);
    const latest = sorted[sorted.length - 1];
    const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    const total = latest.totalUsd;
    let change = 0;
    let changePct = 0;
    if (previous) {
      change = latest.totalUsd - previous.totalUsd;
      changePct =
        previous.totalUsd > 0 ? (change / previous.totalUsd) * 100 : 0;
    }

    let allocation: AllocationDataItem[] = [];
    if (latest.assets) {
      const extended = latest.assets as PortfolioAssetWithExchanges[];
      const raw = extended.map((asset, index) => ({
        name: asset.name.toUpperCase(),
        value: asset.amountUsd,
        color: `hsl(${(index * 40) % 360}, 70%, 60%)`,
        percentage: total > 0 ? (asset.amountUsd / total) * 100 : 0,
      }));
      const sortedAssets = raw.sort((a, b) => b.value - a.value);
      if (sortedAssets.length <= 6) {
        allocation = sortedAssets;
      } else {
        const top = sortedAssets.slice(0, 5);
        const rest = sortedAssets.slice(5);
        const othersValue = rest.reduce((s, t) => s + t.value, 0);
        allocation =
          othersValue > 0
            ? [
                ...top,
                {
                  name: 'Others',
                  value: othersValue,
                  color: '#6b7280',
                  percentage: total > 0 ? (othersValue / total) * 100 : 0,
                },
              ]
            : top;
      }
    }

    return {
      totalValue: total,
      changeValue: change,
      changePercent: changePct,
      exchangeCount: fallback.exchangeCount,
      allocationData: allocation,
      topAllocation: allocation[0] ?? null,
    };
  }, [portfolioData, exchanges]);

  // Today's PnL — pull the row matching today's tz-aware midnight from the
  // shared daily-profit response.
  const todayProfit = useMemo(() => {
    if (
      !dailyProfit ||
      dailyProfit.status !== StatusEnum.ok ||
      !dailyProfit.data?.result
    ) {
      return 0;
    }
    const todayKey = toTzDateKey(new Date(), userTimezone);
    const row = dailyProfit.data.result.find(
      (r) =>
        r.date != null &&
        toTzDateKey(new Date(r.date as string), userTimezone) === todayKey
    );
    return row?.quote ?? 0;
  }, [dailyProfit, userTimezone]);

  // uPnL + Open Trades + Total Profit aggregated from the same authoritative
  // server-side dashboard responses BotStatus uses.
  const aggregatedStats = useMemo(() => {
    const dealsRow = (
      d: typeof dcaDealStats
    ): {
      normal: number;
      inProfit: number;
      eighty: number;
      max: number;
      unrealizedProfit: number;
    } => {
      if (d?.status !== StatusEnum.ok) {
        return {
          normal: 0,
          inProfit: 0,
          eighty: 0,
          max: 0,
          unrealizedProfit: 0,
        };
      }
      const row = d.data?.result?.[0];
      return {
        normal: row?.normal ?? 0,
        inProfit: row?.inProfit ?? 0,
        eighty: row?.eighty ?? 0,
        max: row?.max ?? 0,
        unrealizedProfit: row?.unrealizedProfit ?? 0,
      };
    };
    const profitVal = (p: typeof dcaAllProfit) =>
      p?.status === StatusEnum.ok ? (p.data?.result?.[0]?.quote ?? 0) : 0;

    const buckets = [
      dealsRow(dcaDealStats),
      // grid intentionally omitted — see dealStatsQueries note above.
      dealsRow(comboDealStats),
      dealsRow(hedgeDealStats),
      dealsRow(terminalDealStats),
    ];

    // `normal` is already the TOTAL number of open deals in the bucket — the
    // backend aggregates it as `$sum: 1` over every open deal. `inProfit`,
    // `eighty` and `max` are OVERLAPPING sub-categories of those same deals
    // (a deal can be both in profit and at 80% DCA), so adding them on top of
    // `normal` double-counts and inflates "Open trades". Count `normal` only —
    // matching V1 (main-dash StatusStats) and the BotStatus widget, neither of
    // which ever sums these four together.
    const openTrades = buckets.reduce((s, b) => s + b.normal, 0);
    const unrealizedPnl = buckets.reduce((s, b) => s + b.unrealizedProfit, 0);
    const totalProfit =
      profitVal(dcaAllProfit) +
      profitVal(gridAllProfit) +
      profitVal(comboAllProfit) +
      profitVal(hedgeAllProfit) +
      profitVal(terminalAllProfit);

    return { openTrades, unrealizedPnl, totalProfit };
  }, [
    dcaDealStats,
    comboDealStats,
    hedgeDealStats,
    terminalDealStats,
    dcaAllProfit,
    gridAllProfit,
    comboAllProfit,
    hedgeAllProfit,
    terminalAllProfit,
  ]);

  const kpis = {
    openTrades: aggregatedStats.openTrades,
    amountInPositions: positionTotals.inPositionsUsd,
    unrealizedPnl: positionTotals.unrealizedIsNet
      ? (positionTotals.unrealizedUsd ?? aggregatedStats.unrealizedPnl)
      : aggregatedStats.unrealizedPnl,
    totalProfit: aggregatedStats.totalProfit,
  };

  const todayChangePercent =
    totalValue > 0 ? (todayProfit / totalValue) * 100 : 0;
  const changeDirection: 'up' | 'down' | 'flat' =
    changeValue > 0 ? 'up' : changeValue < 0 ? 'down' : 'flat';
  const todayDirection: 'up' | 'down' | 'flat' =
    todayProfit > 0 ? 'up' : todayProfit < 0 ? 'down' : 'flat';
  const isPositive = changeValue >= 0;
  const todayPositive = todayProfit >= 0;
  const pnlPositive = kpis.unrealizedPnl >= 0;
  const totalProfitPositive = kpis.totalProfit >= 0;

  const directionToken = (d: 'up' | 'down' | 'flat') =>
    d === 'up' ? 'var(--color-profit)' : 'var(--color-loss)';
  const cornerGradient = (
    d: 'up' | 'down' | 'flat',
    corner: '0% 0%' | '100% 0%'
  ) =>
    d === 'flat'
      ? null
      : `radial-gradient(120% 140% at ${corner}, color-mix(in oklab, ${directionToken(
          d
        )} 14%, transparent) 0%, transparent 55%)`;
  const heroBackground = [
    cornerGradient(changeDirection, '0% 0%'),
    cornerGradient(todayDirection, '100% 0%'),
    'var(--color-card)',
  ]
    .filter(Boolean)
    .join(', ');

  // Show skeleton on first paint (no cached portfolio data yet). Once data
  // arrives — even if every value is 0 — we render the real numbers.
  const showSkeleton = portfolioLoading && !portfolioData;

  if (showSkeleton) {
    return (
      <section
        className="relative flex h-full flex-col gap-md overflow-hidden rounded-lg bg-card p-lg shadow-md @container"
        style={{ background: 'var(--color-card)' }}
        aria-busy="true"
        data-walkthrough="overview-balance"
      >
        <Skeleton className="h-3 w-40" />
        <div className="flex w-full min-w-0 flex-wrap items-center gap-md">
          <div className="flex min-w-0 flex-1 flex-col gap-sm">
            <Skeleton className="h-16 w-64 max-w-full" />
            <Skeleton className="h-5 w-32 max-w-full" />
          </div>
          <div className="flex shrink-0 items-center gap-md">
            <Skeleton className="h-[110px] w-[110px] rounded-full" />
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
        <div className="mt-auto grid grid-cols-2 gap-xs @[420px]:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-xl bg-muted/60 px-md py-sm"
            >
              <Skeleton className="h-3 w-20 bg-muted-foreground/20" />
              <Skeleton className="h-5 w-16 bg-muted-foreground/20" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative flex h-full flex-col gap-md overflow-hidden rounded-lg bg-card p-lg shadow-md @container"
      style={{ background: heroBackground }}
      data-walkthrough="overview-balance"
    >
      <div className="flex flex-wrap items-center gap-xs text-xs uppercase tracking-wide text-muted-foreground">
        <span>Total Balance</span>
        <span aria-hidden>·</span>
        <span>
          {exchangeCount} {exchangeCount === 1 ? 'Exchange' : 'Exchanges'}
        </span>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-md">
        {/* LEFT: balance value + 24h chip — grows to fill */}
        <div className="flex min-w-0 flex-1 flex-col gap-sm">
          <div className="min-w-0">
            {privacyMode ? (
              <span className="text-6xl font-bold">***</span>
            ) : (
              <ResponsiveCurrencyValue
                value={totalValue}
                showSign={false}
                fontSteps={HERO_BALANCE_FONT_STEPS}
                colorClassOverride="text-foreground"
                align="left"
                className="leading-none"
              />
            )}
          </div>

          {!privacyMode && (
            <div className="flex flex-wrap items-center gap-sm">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                  changeDirection === 'up'
                    ? 'bg-profit/10 text-profit'
                    : changeDirection === 'down'
                      ? 'bg-loss/10 text-loss'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {`${isPositive ? '+' : ''}${formatCurrency(
                  changeValue,
                  'USD'
                )} (${formatPercentage(changePercent)})`}
              </span>
              <span className="text-xs text-muted-foreground">past 24h</span>
            </div>
          )}
        </div>

        {/* RIGHT: donut + today — inline on same row as the value */}
        <div className="flex shrink-0 items-center gap-md">
          {allocationData.length > 0 && (
            <div className="relative h-[110px] w-[110px] shrink-0">
              <PieChart width={110} height={110}>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  innerRadius="65%"
                  outerRadius="90%"
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={1}
                  isAnimationActive={false}
                >
                  {allocationData.map((item, index) => (
                    <Cell
                      key={`cell-${item.name}-${index}`}
                      fill={item.color}
                    />
                  ))}
                </Pie>
              </PieChart>
              {topAllocation && !privacyMode && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Top
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {topAllocation.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {topAllocation.percentage.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {!privacyMode && (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Today
              </span>
              <span
                className={`text-2xl font-semibold ${
                  todayDirection === 'up'
                    ? 'text-profit'
                    : todayDirection === 'down'
                      ? 'text-loss'
                      : 'text-foreground'
                }`}
              >
                {`${todayPositive ? '+' : ''}${formatCurrency(todayProfit, 'USD')}`}
              </span>
              <span
                className={`text-xs ${
                  todayDirection === 'up'
                    ? 'text-profit'
                    : todayDirection === 'down'
                      ? 'text-loss'
                      : 'text-muted-foreground'
                }`}
              >
                {formatPercentage(todayChangePercent)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM: KPI strip — spans full width; each cell auto-fits its number. */}
      <div className="mt-auto grid grid-cols-2 gap-xs @[420px]:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-md py-sm">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Open trades
          </span>
          <span className="text-lg font-semibold">{kpis.openTrades}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-md py-sm">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            In positions
          </span>
          {privacyMode ? (
            <span className="text-lg font-semibold">***</span>
          ) : kpis.amountInPositions === null ? (
            <NotCalculated
              compact
              reason="Your server does not report the value of open positions yet. Update it to see this number."
            />
          ) : kpis.amountInPositions === undefined ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <span className="flex flex-col">
              <ResponsiveCurrencyValue
                value={kpis.amountInPositions}
                showSign={false}
                fontSteps={KPI_FONT_STEPS}
                colorClassOverride="text-foreground"
                align="left"
              />
              {positionTotals.inPositionsUnpriced > 0 && (
                <Tooltip
                  tooltip={`${positionTotals.inPositionsUnpriced.toLocaleString()} of ${positionTotals.inPositionsCount.toLocaleString()} positions could not be priced in USD and are not included.`}
                  side="top"
                  className="normal-case"
                >
                  <span className="text-[11px] text-muted-foreground">
                    {positionTotals.inPositionsUnpriced.toLocaleString()} unpriced
                  </span>
                </Tooltip>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-md py-sm">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Unrealized PnL
            <Tooltip
              tooltip="Open profit or loss across every deal running right now, on all your bots."
              side="top"
              className="normal-case"
            >
              <InfoIcon />
            </Tooltip>
          </span>
          {privacyMode ? (
            <span className="text-lg font-semibold">***</span>
          ) : (
            <ResponsiveCurrencyValue
              value={kpis.unrealizedPnl}
              showSign
              fontSteps={KPI_FONT_STEPS}
              colorClassOverride={pnlPositive ? 'text-profit' : 'text-loss'}
              align="left"
            />
          )}
        </div>
        <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-md py-sm">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Realized PnL
            <Tooltip
              tooltip="Profit banked from closed deals across every bot type and the trading terminal. Deals still running are in Unrealized PnL."
              side="top"
              className="normal-case"
            >
              <InfoIcon />
            </Tooltip>
          </span>
          {privacyMode ? (
            <span className="text-lg font-semibold">***</span>
          ) : (
            <ResponsiveCurrencyValue
              value={kpis.totalProfit}
              showSign
              fontSteps={KPI_FONT_STEPS}
              colorClassOverride={
                totalProfitPositive ? 'text-profit' : 'text-loss'
              }
              align="left"
            />
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroBalance;
