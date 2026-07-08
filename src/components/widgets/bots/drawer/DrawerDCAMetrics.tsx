import { useBotSpecificDeals } from '@/hooks/useBotSpecificDeals';
import { useBotDcaProjection } from '@/hooks/bots/dca/useBotDcaProjection';
import { formatTotalFunds } from '@/utils/bots/dca/deal-summary';
import {
  BotTypesEnum,
  DCADealStatusEnum,
  DCAOrderTypeEnum,
  type StrategyEnum,
} from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import {
  Activity,
  DollarSign,
  GitBranch,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { ProgressBar } from '../../../ui/ProgressBar';
import { DrawerSection } from './DrawerSection';

export interface DrawerDCAMetricsProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

interface DcaDistributionItem {
  dcaCount: number;
  deals: number;
  percentage: number;
}

interface RiskMetricsData {
  totalDeals: number;
  totalActiveDeals: number;
  totalFinishedDeals: number;
  avgDcasFinished: number;
  maxDcasFinished: number;
  maxConfiguredDcas: number;
  avgFinishedDcaCoverage: number;
  avgActiveDcaCoverage: number;
  finishedDistribution: DcaDistributionItem[];
}

export const DrawerDCAMetrics: React.FC<DrawerDCAMetricsProps> = ({
  widgetId,
  botId,
  bot,
}) => {
  const isComboBot = React.useMemo(
    () => bot?.type === BotTypesEnum.combo,
    [bot?.type]
  );

  // Config-based projection (coverage / avg down power / capital needed),
  // derived straight from the saved settings — available even before the bot
  // has any deals, and identical to the bot form's DCA overview figures.
  const { summary: projection, orders: projectionOrders } =
    useBotDcaProjection(bot);

  // Number of configured DCA (safety) orders for the bot's CURRENT settings,
  // taken from the same example-orders engine the bot form's DCA overview uses.
  // This is correct across every `dcaCondition` mode — for `indicators`/`custom`
  // bots the raw `ordersCount` field stays at its percentage-mode value (e.g.
  // 32) and does NOT reflect the real DCA orders (the indicator startDca count /
  // the custom DCA table length), which is what users see in the old UI.
  const configuredDcaCount = useMemo(
    () =>
      projectionOrders.filter(
        (order) => !order.hide && order.type === DCAOrderTypeEnum.dca
      ).length,
    [projectionOrders]
  );
  const projectionTiles = useMemo(() => {
    const settings = bot?.settings as
      | { strategy?: StrategyEnum; futures?: boolean; coinm?: boolean }
      | undefined;
    const [baseAsset = '', quoteAsset = ''] = (bot?.pair ?? '').split(/[/-]/);
    return [
      {
        label: 'Deviation Covered',
        value: `${projection.coverage}%`,
        icon: TrendingDown,
      },
      {
        label: 'Avg Down Power',
        value: `${parseFloat(projection.avgDownPower || '0').toFixed(1)}%`,
        icon: TrendingUp,
      },
      {
        label: 'Capital Needed',
        value: formatTotalFunds(projection, {
          strategy: settings?.strategy,
          futures: settings?.futures,
          coinm: settings?.coinm,
          baseAsset,
          quoteAsset,
        }),
        icon: DollarSign,
      },
    ];
  }, [projection, bot?.settings, bot?.pair]);

  const useDealsOpenInput = useMemo(
    () => ({
      botId: botId || '',
      status: DCADealStatusEnum.open,
      dealType: isComboBot ? ('combo' as const) : ('dca' as const),
    }),
    [botId, isComboBot]
  );

  const useDealsClosedInput = useMemo(
    () => ({
      botId: botId || '',
      status: DCADealStatusEnum.closed,
      dealType: isComboBot ? ('combo' as const) : ('dca' as const),
    }),
    [botId, isComboBot]
  );

  // Combine both live and paper deals for comprehensive analysis
  const { deals: activeDealsData, isLoading: activeLoading } =
    useBotSpecificDeals(useDealsOpenInput);

  const { deals: closedDealsData, isLoading: closedLoading } =
    useBotSpecificDeals(useDealsClosedInput);

  const botDeals = React.useMemo(() => {
    const result = [...activeDealsData, ...closedDealsData];
    return result;
  }, [activeDealsData, closedDealsData]);

  const riskMetrics = useMemo((): RiskMetricsData | null => {
    if (!bot || !botDeals.length) return null;

    const activeDeals = botDeals.filter(
      (deal) =>
        deal.status !== DCADealStatusEnum.canceled &&
        deal.status !== DCADealStatusEnum.closed
    );
    const completedDeals = botDeals.filter(
      (deal) =>
        deal.status === DCADealStatusEnum.canceled ||
        deal.status === DCADealStatusEnum.closed
    );

    const getConfiguredDcas = (deal: (typeof botDeals)[number]) => {
      // Prefer the engine-projected count for the bot's current config — it is
      // correct for indicator/custom DCA where `ordersCount` is stale. Fall back
      // to the deal's own level count only when the projection isn't ready.
      if (configuredDcaCount > 0) {
        return configuredDcaCount;
      }

      const configuredFromLevels = Math.max(0, (deal.levels?.all ?? 0) - 1);
      return configuredFromLevels;
    };

    const getUsedDcas = (deal: (typeof botDeals)[number]) => {
      const buyTransactions = deal.transactions?.buy;
      const usedFromBuys =
        typeof buyTransactions === 'number'
          ? Math.max(0, Math.floor(buyTransactions) - 1)
          : undefined;

      const fallbackFromLevels = Math.max(0, (deal.levels?.complete ?? 0) - 1);
      const usedRaw = usedFromBuys ?? fallbackFromLevels;

      return Math.min(usedRaw, getConfiguredDcas(deal));
    };

    const completedDcaCounts = completedDeals.map((deal) => getUsedDcas(deal));

    const activeCoverageRatios = activeDeals
      .map((deal) => {
        const configuredDcas = getConfiguredDcas(deal);
        const usedDcas = getUsedDcas(deal);

        return configuredDcas > 0 ? usedDcas / configuredDcas : 0;
      })
      .filter((value) => Number.isFinite(value));

    const finishedCoverageRatios = completedDeals
      .map((deal) => {
        const configuredDcas = getConfiguredDcas(deal);
        const usedDcas = getUsedDcas(deal);

        return configuredDcas > 0 ? usedDcas / configuredDcas : 0;
      })
      .filter((value) => Number.isFinite(value));

    const finishedDistributionMap = completedDcaCounts.reduce(
      (acc, dcaCount) => {
        acc.set(dcaCount, (acc.get(dcaCount) ?? 0) + 1);
        return acc;
      },
      new Map<number, number>()
    );

    const finishedDistribution = Array.from(finishedDistributionMap.entries())
      .sort(([left], [right]) => left - right)
      .map(([dcaCount, deals]) => ({
        dcaCount,
        deals,
        percentage:
          completedDeals.length > 0 ? (deals / completedDeals.length) * 100 : 0,
      }));

    const avgDcasFinished =
      completedDcaCounts.length > 0
        ? completedDcaCounts.reduce((sum, value) => sum + value, 0) /
          completedDcaCounts.length
        : 0;

    const maxDcasFinished =
      completedDcaCounts.length > 0 ? Math.max(...completedDcaCounts) : 0;

    // Configured DCA orders for the bot's current settings, from the projection
    // engine (correct for percentage / indicators / custom). Only when the
    // projection isn't available do we fall back to the deals' own level counts.
    const maxConfiguredDcas =
      configuredDcaCount > 0
        ? configuredDcaCount
        : Math.max(
            0,
            ...activeDeals.map((deal) => getConfiguredDcas(deal)),
            ...completedDeals.map((deal) => getConfiguredDcas(deal))
          );

    const avgFinishedDcaCoverage =
      finishedCoverageRatios.length > 0
        ? (finishedCoverageRatios.reduce((sum, value) => sum + value, 0) /
            finishedCoverageRatios.length) *
          100
        : 0;

    const avgActiveDcaCoverage =
      activeCoverageRatios.length > 0
        ? (activeCoverageRatios.reduce((sum, value) => sum + value, 0) /
            activeCoverageRatios.length) *
          100
        : 0;

    return {
      totalDeals: botDeals.length,
      totalActiveDeals: activeDeals.length,
      totalFinishedDeals: completedDeals.length,
      avgDcasFinished,
      maxDcasFinished,
      maxConfiguredDcas,
      avgFinishedDcaCoverage,
      avgActiveDcaCoverage,
      finishedDistribution,
    };
  }, [bot, botDeals, configuredDcaCount]);

  const isLoadingDeals = activeLoading || closedLoading;

  // The projection is config-based, so the section renders for any bot the
  // layout includes it for — even one with no deals yet. The deal-based
  // analysis below only appears once deals exist.
  if (!bot) {
    return null;
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-risk-metrics"
      title="DCA Analysis"
      icon={GitBranch}
      minSize={{ w: 6, h: 10 }}
      maxSize={{ w: 12, h: 16 }}
      hasOptions={false}
    >
      <div className="p-sm md:p-md space-y-md">
        {/* Configured projection — coverage / avg down power / capital needed */}
        <div className="grid grid-cols-3 gap-sm">
          {projectionTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div
                key={tile.label}
                className="rounded-lg border border-border/40 bg-background/40 p-sm"
              >
                <div className="flex items-center gap-xs text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon className="h-3 w-3" /> {tile.label}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {tile.value}
                </div>
              </div>
            );
          })}
        </div>

        {isLoadingDeals ? (
          <div className="text-center text-muted-foreground py-6 text-sm">
            Loading DCA analysis...
          </div>
        ) : !riskMetrics ? (
          <div className="text-xs text-muted-foreground py-2">
            Deal-level analysis appears once this bot opens deals.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-sm">
              <div className="rounded-lg border border-border/40 bg-background/40 p-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Avg DCAs (Finished)
                </p>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {riskMetrics.avgDcasFinished.toFixed(1)}
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-background/40 p-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Max DCAs (Finished)
                </p>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {riskMetrics.maxDcasFinished}
                </div>
              </div>
            </div>

            <div className="space-y-sm rounded-lg border border-border/40 bg-background/40 p-sm">
              <div className="flex items-center gap-xs">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  DCA Coverage
                </h4>
              </div>

              <div className="space-y-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Finished Deals Coverage
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {riskMetrics.avgFinishedDcaCoverage.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar
                  value={riskMetrics.avgFinishedDcaCoverage}
                  max={100}
                  className="h-2"
                  variant="success"
                />
                <p className="text-xs text-muted-foreground">
                  Average percentage of configured DCA levels used in finished
                  deals
                </p>
              </div>

              <div className="space-y-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Active Deals Coverage
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {riskMetrics.avgActiveDcaCoverage.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar
                  value={riskMetrics.avgActiveDcaCoverage}
                  max={100}
                  className="h-2"
                  variant="warning"
                />
                <p className="text-xs text-muted-foreground">
                  Average percentage of configured DCA levels currently used
                </p>
              </div>
            </div>

            <div className="space-y-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Finished Deals by DCA Count
                </p>
                <span className="text-xs text-muted-foreground">
                  Total: {riskMetrics.totalFinishedDeals} /{' '}
                  {riskMetrics.totalDeals}
                </span>
              </div>

              <div className="space-y-xs">
                {riskMetrics.finishedDistribution.length > 0 ? (
                  riskMetrics.finishedDistribution.map((bucket) => (
                    <div
                      key={`dca-finished-${bucket.dcaCount}`}
                      className="space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {bucket.dcaCount} DCA
                          {bucket.dcaCount === 1 ? '' : 's'}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          {bucket.deals} deals ({bucket.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <ProgressBar
                        value={bucket.percentage}
                        max={100}
                        className="h-2"
                        variant="success"
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground py-2">
                    No finished deals available yet.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-sm rounded-lg border border-border/40 bg-background/40 p-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">
                    {riskMetrics.maxConfiguredDcas}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Max Configured DCAs
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">
                    {riskMetrics.avgFinishedDcaCoverage.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg Finished Coverage
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DrawerSection>
  );
};
