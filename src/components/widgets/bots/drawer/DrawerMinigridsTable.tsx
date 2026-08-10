import type { ComboMinigrid } from '@/types';
import type { DrawerBot } from '@/types/bots/drawer';
import { CheckCircle, Clock, Grid3x3 } from 'lucide-react';
import React, { useMemo, useState } from 'react';
/* import { useComboBots } from '../../../../hooks/useComboBots'; */
import { useComboMinigrids } from '../../../../hooks/useComboMinigrids';
/* import { useHedgeComboBots } from '../../../../hooks/useHedgeComboBots'; */
import { cn, formatCurrency } from '../../../../lib/utils';
import { Badge } from '../../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../ui/tabs';
import CoinPair from '../../shared/CoinPair';
import { DrawerSection } from './DrawerSection';

export interface DrawerMinigridsTableProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

export const DrawerMinigridsTable: React.FC<DrawerMinigridsTableProps> = ({
  widgetId,
  botId,
  bot: botProp,
}) => {
  const [selectedTab, setSelectedTab] = useState<'open' | 'closed'>('open');

  // Determine bot type from prop
  const botType = botProp?.type || 'combo';

  // Get bot data
  /* const { bots: comboBots } = useComboBots({ paperContext: false });
  const { bots: hedgeComboBots } = useHedgeComboBots({
    terminal: false,
    paperContext: false,
  });
 */
  // Use prop bot if available, otherwise find from fetched data
  const bot = botProp; /* ||
    (botType === 'hedgeCombo'
      ? hedgeComboBots.find((b) => b._id === botId)
      : comboBots.find((b) => b._id === botId)) */

  // Prefer API-sourced minigrids; fallback to bot snapshot if absent
  // Primary source: parent hedge combo minigrids
  const {
    open,
    closed,
    isLoading: parentLoading,
    isError: parentError,
  } = useComboMinigrids((bot as unknown as { _id?: string })?._id || botId, {
    hedge: botType === 'hedgeCombo',
    status: 'open',
    page: 0,
  });

  // Fallback source: merge child legs (long/short) minigrids when parent returns none
  /* const longBotId = bot?.extra?.hedgeCombo?.longBotId || '';
  const shortBotId = bot?.extra?.hedgeCombo?.shortBotId || '';
  const {
    open: openLong,
    closed: closedLong,
    isLoading: longLoading,
    isError: longError,
  } = useComboMinigrids(longBotId || undefined, {
    hedge: false,
    status: 'open',
    page: 0,
  });
  const {
    open: openShort,
    closed: closedShort,
    isLoading: shortLoading,
    isError: shortError,
  } = useComboMinigrids(shortBotId || undefined, {
    hedge: false,
    status: 'open',
    page: 0,
  }); */

  const snapshotMinigrids = useMemo(() => {
    const rawBot = bot as unknown as { minigrids?: ComboMinigrid[] };
    return rawBot?.minigrids || [];
  }, [bot]);

  // Filter minigrids by status
  const snapshotOpenMinigrids = useMemo(
    () =>
      snapshotMinigrids.filter(
        (m) => m.status === 'active' || m.status === 'range'
      ),
    [snapshotMinigrids]
  );

  const openMinigrids = useMemo(() => {
    if (open.length > 0) return open;
    /* const mergedLegs = [...openLong, ...openShort];
    if (botType === 'hedgeCombo' && mergedLegs.length > 0) return mergedLegs; */
    return snapshotOpenMinigrids;
  }, [open, /* openLong, openShort,  */ snapshotOpenMinigrids /* , botType */]);

  const snapshotClosedMinigrids = useMemo(
    () => snapshotMinigrids.filter((m) => m.status === 'closed'),
    [snapshotMinigrids]
  );

  const closedMinigrids = useMemo(() => {
    if (closed.length > 0) return closed;
    /* const mergedLegs = [...closedLong, ...closedShort];
    if (botType === 'hedgeCombo' && mergedLegs.length > 0) return mergedLegs; */
    return snapshotClosedMinigrids;
  }, [
    closed,
    /*  closedLong, closedShort,  */ snapshotClosedMinigrids /*  botType */,
  ]);

  const isLoading = parentLoading; /* || longLoading || shortLoading; */
  const isError = parentError; /* || longError || shortError; */

  if (import.meta.env.DEV && botType === 'hedgeCombo') {
    console.debug('[DrawerMinigridsTable] Hedge minigrids', {
      parent: {
        open: open.length,
        closed: closed.length,
        parentLoading,
        parentError,
      },
      /*  long: {
        id: longBotId,
        open: openLong.length,
        closed: closedLong.length,
        longLoading,
        longError,
      },
      short: {
        id: shortBotId,
        open: openShort.length,
        closed: closedShort.length,
        shortLoading,
        shortError,
      }, */
    });
  }

  const handleTabChange = (value: string) => {
    setSelectedTab(value as 'open' | 'closed');
  };

  interface MinigridRowProps {
    minigrid: ComboMinigrid;
  }

  const MinigridRow: React.FC<MinigridRowProps> = ({ minigrid }) => {
    const profitIsPositive = minigrid.profit.totalUsd >= 0;
    const profitClass = profitIsPositive
      ? 'text-green-600 dark:text-green-400'
      : 'text-red-600 dark:text-red-400';

    const statusColor =
      minigrid.status === 'active'
        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
        : minigrid.status === 'range'
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : 'bg-gray-500/10 text-gray-600 dark:text-gray-400';

    return (
      <div className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
        <div className="p-md">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-md mb-3">
            <div className="flex items-center gap-sm min-w-0 flex-1">
              <CoinPair
                baseAsset={minigrid.symbol.baseAsset}
                quoteAsset={minigrid.symbol.quoteAsset}
                iconSize="sm"
                showText={false}
              />
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {minigrid.symbol.symbol}
                </div>
                <Badge
                  variant="secondary"
                  className={cn('text-xs', statusColor)}
                >
                  {minigrid.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <div className={cn('text-sm font-semibold', profitClass)}>
                {profitIsPositive ? '+' : ''}
                {formatCurrency(minigrid.profit.totalUsd)}
              </div>
              <div className="text-xs text-muted-foreground">P&L</div>
            </div>
          </div>

          {/* Grid Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm text-xs">
            <div>
              <div className="text-muted-foreground mb-1">Grids</div>
              <div className="font-medium">
                {minigrid.grids.buy} buy / {minigrid.grids.sell} sell
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Avg Price</div>
              <div className="font-medium">
                {minigrid.avgPrice.toFixed(8)} {minigrid.symbol.quoteAsset}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Entry Price</div>
              <div className="font-medium">
                {minigrid.initialPrice.toFixed(8)} {minigrid.symbol.quoteAsset}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Transactions</div>
              <div className="font-medium">
                {minigrid.transactions.buy + minigrid.transactions.sell}
              </div>
            </div>
          </div>

          {/* Balances Row */}
          <div className="grid grid-cols-2 gap-sm text-xs mt-3 pt-3 border-t border-border/40">
            <div>
              <div className="text-muted-foreground mb-1">Initial Balances</div>
              <div className="font-medium space-y-0.5">
                <div>
                  Base: {minigrid.initialBalances.base.toFixed(8)}{' '}
                  {minigrid.symbol.baseAsset}
                </div>
                <div>
                  Quote: {minigrid.initialBalances.quote.toFixed(8)}{' '}
                  {minigrid.symbol.quoteAsset}
                </div>
              </div>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Current Balances</div>
              <div className="font-medium space-y-0.5">
                <div>
                  Base: {minigrid.currentBalances.base.toFixed(8)}{' '}
                  {minigrid.symbol.baseAsset}
                </div>
                <div>
                  Quote: {minigrid.currentBalances.quote.toFixed(8)}{' '}
                  {minigrid.symbol.quoteAsset}
                </div>
              </div>
            </div>
          </div>

          {/* Timestamps */}
          <div className="flex flex-wrap gap-y-1 text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
            <div>Created: {new Date(minigrid.createTime).toLocaleString()}</div>
            <div>Updated: {new Date(minigrid.updateTime).toLocaleString()}</div>
            {minigrid.closeTime && (
              <div>Closed: {new Date(minigrid.closeTime).toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!bot) {
    return (
      <DrawerSection
        widgetId={widgetId}
        widgetType="drawer-minigrids-table"
        title="Bot Minigrids"
        minSize={{ w: 6, h: 6 }}
        maxSize={{ w: 12, h: 12 }}
        hasOptions={false}
      >
        <div className="p-lg">
          <div className="text-center text-muted-foreground">Bot not found</div>
        </div>
      </DrawerSection>
    );
  }

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-minigrids-table"
      title="Bot Minigrids"
      minSize={{ w: 6, h: 6 }}
      maxSize={{ w: 12, h: 12 }}
      hasOptions={false}
    >
      <div className="p-md">
        <div className="flex items-center gap-xs mb-3">
          <Grid3x3 className="w-4 h-4 text-white" />
          <h3 className="text-base font-semibold">Bot Minigrids</h3>
        </div>

        {isLoading && (
          <div className="text-center text-muted-foreground py-6">
            Loading minigrids...
          </div>
        )}
        {isError && !isLoading && (
          <div className="text-center text-destructive py-6">
            Failed to load minigrids
          </div>
        )}

        <Tabs value={selectedTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="open"
              className="flex items-center gap-xs text-xs"
            >
              <Clock className="w-4 h-4" />
              Open ({openMinigrids.length})
            </TabsTrigger>
            <TabsTrigger
              value="closed"
              className="flex items-center gap-xs text-xs"
            >
              <CheckCircle className="w-4 h-4" />
              Closed ({closedMinigrids.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-4">
            {openMinigrids.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  {openMinigrids.map((minigrid) => (
                    <MinigridRow key={minigrid._id} minigrid={minigrid} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Grid3x3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No open minigrids</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="closed" className="mt-4">
            {closedMinigrids.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  {closedMinigrids.map((minigrid) => (
                    <MinigridRow key={minigrid._id} minigrid={minigrid} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No closed minigrids</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DrawerSection>
  );
};

export default DrawerMinigridsTable;
