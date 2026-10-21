import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import { Activity, Layers, TrendingUp } from 'lucide-react';
import React, { useMemo } from 'react';
/* import { useGridBots } from '../../../../hooks/useGridBots'; */
import { formatQuoteAmount } from '@/utils/formatters';
import { extractPairAssets } from '@/utils/pairs';
import { DrawerSection } from './DrawerSection';
import { PendingLiveValue } from '@/components/ui/pending-live-value';
import { useLivePairPrice } from '@/hooks/useLatestPrices';
import type { AdditionalBotData } from '@/types';

export interface DrawerGridOverviewProps {
  widgetId: string;
  botId?: string;
  botSnapshot?: DrawerBot;
}

const formatMaybePrice = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
};

const formatMaybeNumber = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString();
};

const DrawerGridOverview: React.FC<DrawerGridOverviewProps> = ({
  widgetId,
  botSnapshot,
}) => {
  // Prefer real grid bot data from hooks when botId is provided; fallback to snapshot extra.grid
  /* const { bots: gridBots } = useGridBots(); */

  /* const rawGrid: GridBot | undefined = useMemo(() => {
    if (!botSnapshot?.type || botSnapshot.type !== 'grid') return undefined;
    const id = botSnapshot?.id || undefined;
    if (!id) return undefined;
    return gridBots.find((b) => b._id === id);
  }, [gridBots, botSnapshot]); */

  const rawGrid = useMemo(
    () => botSnapshot as (GridBot & AdditionalBotData) | undefined,
    [botSnapshot]
  );

  const livePrice = useLivePairPrice(
    rawGrid?.exchange,
    rawGrid?.settings?.pair
  );

  const grid = useMemo(() => {
    if (rawGrid) {
      const levelsTotal =
        (rawGrid.levels?.all?.buy || 0) + (rawGrid.levels?.all?.sell || 0);
      return {
        topPrice: rawGrid.settings?.topPrice,
        lowPrice: rawGrid.settings?.lowPrice,
        currentPrice: rawGrid.lastPrice,
        gridStep: rawGrid.settings?.gridStep,
        levelsTotal,
        levelsActiveBuy: rawGrid.levels?.active?.buy,
        levelsActiveSell: rawGrid.levels?.active?.sell,
      } as const;
    }
    return null;
  }, [rawGrid]);

  // Old dashboard displays invested for Grid as initial budget (settings.budget)
  const investedBudget = useMemo(
    () => rawGrid?.settings?.budget ?? 0,
    [rawGrid?.settings?.budget]
  );

  if (!botSnapshot || !grid) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-grid-overview"
        title="Grid Overview"
        minSize={{ w: 4, h: 4 }}
        maxSize={{ w: 12, h: 8 }}
      >
        <div className="text-center text-muted-foreground">
          Grid analytics are not available for this bot.
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-grid-overview"
      title="Grid Overview"
      minSize={{ w: 4, h: 4 }}
      maxSize={{ w: 12, h: 8 }}
    >
      {grid && (
        <>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Grid Controls
          </div>
          <div className="grid gap-sm sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
              <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-muted-foreground" /> Price
                Range
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {formatMaybePrice(grid.lowPrice)} —{' '}
                {formatMaybePrice(grid.topPrice)}
              </div>
              <div className="text-xs text-muted-foreground">
                Current price{' '}
                <PendingLiveValue pending={!livePrice.live}>
                  {formatMaybePrice(livePrice.price ?? grid.currentPrice)}
                </PendingLiveValue>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
              <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
                <Layers className="h-3 w-3 text-muted-foreground" /> Levels
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {formatMaybeNumber(grid.levelsTotal)} total
              </div>
              <div className="text-xs text-muted-foreground">
                Buy {formatMaybeNumber(grid.levelsActiveBuy)} • Sell{' '}
                {formatMaybeNumber(grid.levelsActiveSell)}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
              <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
                <Activity className="h-3 w-3 text-muted-foreground" /> Step Size
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {formatMaybePrice(grid.gridStep)}
              </div>
              <div className="text-xs text-muted-foreground">
                Invested{' '}
                {formatQuoteAmount(
                  investedBudget,
                  extractPairAssets(rawGrid?.settings?.pair ?? '').quoteAsset
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </DrawerSection>
  );
};

export default DrawerGridOverview;
