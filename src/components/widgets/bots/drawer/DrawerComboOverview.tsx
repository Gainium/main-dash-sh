import type { DrawerBot } from '@/types/bots/drawer';
import { Activity, Layers, Users, Network } from 'lucide-react';
import React, { useMemo } from 'react';
import { formatAssetAmount, formatQuoteAmount } from '@/utils/formatters';
import { extractPairAssets } from '@/utils/pairs';
import { DrawerSection } from './DrawerSection';
import type { AdditionalBotData, ComboBot } from '@/types';

export interface DrawerComboOverviewProps {
  widgetId: string;
  botId?: string;
  botSnapshot?: DrawerBot;
}

const DrawerComboOverview: React.FC<DrawerComboOverviewProps> = ({
  widgetId,
  botSnapshot,
}) => {
  const combo = useMemo(
    () => botSnapshot as ComboBot & AdditionalBotData,
    [botSnapshot]
  );

  // Usage and balances are in the pair's own assets, not USD.
  const { baseAsset, quoteAsset } = extractPairAssets(botSnapshot?.pair ?? '');

  if (!botSnapshot || !combo) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-combo-overview"
        title="Combo Overview"
        icon={Network}
        minSize={{ w: 4, h: 4 }}
        maxSize={{ w: 12, h: 8 }}
      >
        <div className="text-center text-muted-foreground">
          Combo bot analytics are not available for this bot.
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-combo-overview"
      title="Combo Overview"
      icon={Network}
      minSize={{ w: 4, h: 4 }}
      maxSize={{ w: 12, h: 8 }}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Strategy Mix
      </div>
      <div className="grid gap-sm sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
          <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
            <Users className="h-3 w-3 text-primary" /> Pair
          </div>
          <div className="text-xs text-muted-foreground">
            {botSnapshot.pair}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
          <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
            <Activity className="h-3 w-3 text-success" /> Quote Usage
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {formatQuoteAmount(combo.usage.current.quote ?? 0, quoteAsset)}
          </div>
          <div className="text-xs text-muted-foreground">
            Initial{' '}
            {formatQuoteAmount(
              combo.initialBalances?.quote?.[0]?.value ?? 0,
              quoteAsset
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/20 p-sm">
          <div className="flex items-center gap-xs text-xs font-medium text-muted-foreground">
            <Layers className="h-3 w-3 text-warning" /> Base Usage
          </div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {formatAssetAmount(combo.usage.current.base ?? 0)} {baseAsset}
          </div>
          <div className="text-xs text-muted-foreground">
            Current quote{' '}
            {formatQuoteAmount(
              combo.currentBalances?.quote?.[0]?.value ?? 0,
              quoteAsset
            )}
          </div>
        </div>
      </div>
    </DrawerSection>
  );
};

export default DrawerComboOverview;
