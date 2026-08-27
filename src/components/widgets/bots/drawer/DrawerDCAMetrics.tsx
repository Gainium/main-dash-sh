import {
  useBotDcaUsage,
  type DcaUsageBucket,
} from '@/hooks/bots/dca/useBotDcaUsage';
import { useBotDcaProjection } from '@/hooks/bots/dca/useBotDcaProjection';
import { formatTotalFunds } from '@/utils/bots/dca/deal-summary';
import { BotTypesEnum, DCAOrderTypeEnum, type StrategyEnum } from '@/types';
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

  // Deal-derived half: one server-side histogram instead of paging every deal
  // document into the browser. See useBotDcaUsage for why.
  const {
    usage,
    isLoading: usageLoading,
    isError: usageError,
  } = useBotDcaUsage({ botId, isComboBot });

  const riskMetrics = useMemo((): RiskMetricsData | null => {
    if (!bot || !usage) return null;

    // How many DCAs a deal can be said to have used is capped by the ladder it
    // is measured against. The old per-deal fold used the projection engine's
    // count for the bot's CURRENT settings, falling back to that deal's own
    // `levels.all - 1` when the projection wasn't ready — so ceilings are
    // per-bucket, not global, and both branches are reproduced here exactly.
    const ceilingOf = (bucket: DcaUsageBucket) =>
      configuredDcaCount > 0 ? configuredDcaCount : bucket.configured;

    const fold = (buckets: DcaUsageBucket[]) => {
      const byDcas = new Map<number, number>();
      let deals = 0;
      let usedTotal = 0;
      let coverageTotal = 0;
      let maxUsed = 0;
      let maxConfigured = 0;

      buckets.forEach((bucket) => {
        const ceiling = ceilingOf(bucket);
        const used = ceiling > 0 ? Math.min(bucket.dcas, ceiling) : bucket.dcas;

        byDcas.set(used, (byDcas.get(used) ?? 0) + bucket.deals);
        deals += bucket.deals;
        usedTotal += used * bucket.deals;
        coverageTotal += ceiling > 0 ? (used / ceiling) * bucket.deals : 0;
        maxUsed = Math.max(maxUsed, used);
        maxConfigured = Math.max(maxConfigured, ceiling);
      });

      return {
        deals,
        avgUsed: deals > 0 ? usedTotal / deals : 0,
        // Mean of the per-deal used/configured ratios — the same quantity the
        // old fold averaged, not a ratio of the means.
        coverage: deals > 0 ? (coverageTotal / deals) * 100 : 0,
        maxUsed,
        maxConfigured,
        distribution: Array.from(byDcas.entries())
          .sort(([left], [right]) => left - right)
          .map(([dcaCount, count]) => ({
            dcaCount,
            deals: count,
            percentage: deals > 0 ? (count / deals) * 100 : 0,
          })),
      };
    };

    const finished = fold(usage.finished);
    const active = fold(usage.active);

    return {
      totalDeals: finished.deals + active.deals,
      totalActiveDeals: active.deals,
      totalFinishedDeals: finished.deals,
      avgDcasFinished: finished.avgUsed,
      maxDcasFinished: finished.maxUsed,
      maxConfiguredDcas:
        configuredDcaCount > 0
          ? configuredDcaCount
          : Math.max(finished.maxConfigured, active.maxConfigured),
      avgFinishedDcaCoverage: finished.coverage,
      avgActiveDcaCoverage: active.coverage,
      finishedDistribution: finished.distribution,
    };
  }, [bot, usage, configuredDcaCount]);

  const isLoadingDeals = usageLoading;

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
      <div className="p-sm space-y-md">
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
        ) : !riskMetrics || riskMetrics.totalDeals === 0 ? (
          <div className="text-xs text-muted-foreground py-2">
            {usageError
              ? 'Deal-level analysis is unavailable right now.'
              : 'Deal-level analysis appears once this bot opens deals.'}
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
