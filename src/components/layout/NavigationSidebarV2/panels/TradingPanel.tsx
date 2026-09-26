/* eslint-disable @typescript-eslint/no-explicit-any */
import BotItemPanel from '@/components/bots/BotItemPanel';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getBotDataFromCache,
  useUserSessionsStore,
} from '@/stores/userSessionsStore';

import TradeItemPanel from '@/components/widgets/dashboard/TradeItemPanel';
import { useComboBots } from '@/hooks/useComboBots';
import { useDcaBots } from '@/hooks/useDcaBots';
import { useDcaDeals } from '@/hooks/useDcaDeals';
import { useComboDeals } from '@/hooks/useComboDeals';
import { useGridBots } from '@/hooks/useGridBots';
/* import { useHedgeComboBots } from '@/hooks/useHedgeComboBots';
import { useHedgeComboDeals } from '@/hooks/useHedgeComboDeals';
import { useHedgeDcaBots } from '@/hooks/useHedgeDcaBots';
import { useHedgeDcaDeals } from '@/hooks/useHedgeDcaDeals'; */
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import { useUIStore } from '@/stores/uiStore';
import { getBotTypeRoute } from '@/utils/botUtils';
import { Star, X } from 'lucide-react';
// icons removed for compact menu stats
import NewBotWizard from '@/components/wizards/NewBotWizard';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RightPanel from './RightPanel';
import PanelPositionStats from './PanelPositionStats';
import { BotTypesEnum } from '@/types';

interface TradingPanelProps {
  onClose: () => void;
  onNavigate?: () => void;
}

const BOT_CATEGORIES: Array<any> = [
  'trading-bots',
  'grid-bots',
  'combo-bots',
  'hedge-dca-bots',
  'hedge-combo-bots',
];

const RECENT_TRADES_PAGE = { page: 0, pageSize: 10 } as const;

/** Server totals shown at the top of the panel. */
const TRADING_STATS = {
  positions: ['dca', 'terminal', 'combo', 'grid'], pnl: ['dca', 'terminal', 'combo'],
} as const;

const TradingPanel: React.FC<TradingPanelProps> = ({ onClose, onNavigate }) => {
  const navigationSecondaryPinned = useUIStore(
    (s) => s.navigationSecondaryPinned
  );
  const toggleNavigationSecondaryPinned = useUIStore(
    (s) => s.toggleNavigationSecondaryPinned
  );
  const navigate = useNavigate();
  const privacyMode = useUIStore((s) => s.privacyMode);
  const tradingMode = useUIStore((s) => s.tradingMode);
  const [showNewBotWizard, setShowNewBotWizard] = React.useState(false);

  // Use Zustand store for starred bots
  const toggleStarred = useStarredBotsStore((s) => s.toggleStarred);
  const starredBotIds = useStarredBotsStore((s) => s.starredBotIds);

  const [showMoreRecent, setShowMoreRecent] = React.useState(false);
  const [showMoreStarred, setShowMoreStarred] = React.useState(false);

  // Bots (for the starred / recent bots lists)
  const { bots: dcaBots = [] } = useDcaBots({
    status: ['open'] as any,
    terminal: false,
  });
  const { bots: comboBots = [] } = useComboBots({ status: ['open'] as any });
  const { bots: gridBots = [] } = useGridBots({ status: ['open'] as any });

  // Recent trades: the newest open deals only — one small server page per
  // list instead of every open deal. (Server default order: newest first.)
  const { deals: dcaDeals } = useDcaDeals(
    { terminal: false },
    RECENT_TRADES_PAGE
  );
  const { deals: terminalDeals } = useDcaDeals(
    { terminal: true },
    RECENT_TRADES_PAGE
  );
  const { deals: comboDeals } = useComboDeals();
  const allDeals = useMemo(
    () => [...dcaDeals, ...comboDeals, ...terminalDeals],
    [dcaDeals, comboDeals, terminalDeals]
  );

  // Recent bots and trades
  const allBots = useMemo(() => {
    return [
      ...dcaBots.map((b) => ({ ...b, botType: BotTypesEnum.dca })),
      ...comboBots.map((b) => ({ ...b, botType: BotTypesEnum.combo })),
      ...gridBots.map((b) => ({ ...b, botType: BotTypesEnum.grid })),
      /*  ...hedgeDcaBots.map((b) => ({ ...b, botType: 'hedgeDca' as const })),
      ...hedgeComboBots.map((b) => ({ ...b, botType: 'hedgeCombo' as const })), */
    ];
  }, [dcaBots, comboBots, gridBots /* , hedgeDcaBots, hedgeComboBots */]);

  // Helper: best-effort created timestamp
  function getBotTimestamp(b: any): number {
    const t = b?.created ?? b?.updated ?? b?.createTime ?? b?.createdAt;
    if (t) return new Date(t).getTime();
    const id = b?._id ?? b?.id ?? '';
    if (typeof id === 'string' && id.length >= 8) {
      const first8 = id.slice(0, 8);
      if (/^[0-9a-fA-F]+$/.test(first8)) {
        return parseInt(first8, 16) * 1000;
      }
    }
    return 0;
  }

  // Separate starred and non-starred bots
  const starredBots = useMemo(() => {
    return allBots
      .filter((bot) => starredBotIds.has(bot._id))
      .sort((a, b) => getBotTimestamp(b) - getBotTimestamp(a));
  }, [allBots, starredBotIds]);

  const displayedStarredBots = showMoreStarred
    ? starredBots.slice(0, 10)
    : starredBots.slice(0, 3);

  const recentTrades = allDeals
    .slice()
    .sort(
      (a: any, b: any) =>
        (b.createTime ? new Date(b.createTime).getTime() : 0) -
        (a.createTime ? new Date(a.createTime).getTime() : 0)
    )
    .slice(0, 20); // keep a small buffer, we'll display up to 3 and allow load more

  // Recent visits (mirror legacy sidebar visit-based recent items)
  const clearVisitsByCategories = useUserSessionsStore(
    (s) => s.clearVisitsByCategories
  );

  // Subscribe to visits array and memoize the derived result
  const visits = useUserSessionsStore((s) => s.visits);
  const recentVisits = useMemo(() => {
    // Only include visits to specific bot pages (view/edit), not listing pages
    const filtered = visits.filter((v) => {
      if (!BOT_CATEGORIES.includes(v.category)) return false;
      // Must have /view/ or /edit/ in the path
      if (!v.path.includes('/view/') && !v.path.includes('/edit/'))
        return false;
      // Filter by current trading mode
      return v.tradingMode === tradingMode;
    });

    const uniq = new Map<string, any>();
    for (const v of filtered) {
      if (!uniq.has(v.path)) uniq.set(v.path, v);
    }

    const sortedVisits = Array.from(uniq.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    // Map visits to actual bot data from allBots by matching IDs
    const recentBotsWithData = sortedVisits.map((visit) => {
      const parts = visit.path.split('/').filter(Boolean);
      const id = parts[parts.length - 1]; // Last part is the bot ID

      // Find the actual bot from allBots
      const actualBot = allBots.find((b) => b._id === id);

      if (actualBot) {
        // Return actual bot data with visit metadata
        return {
          ...actualBot,
          visitPath: visit.path,
          visitTimestamp: visit.timestamp,
        };
      }

      // Fallback if bot not found in allBots (deleted bot)
      const botTypeFromCategory = (category: string) => {
        switch (category) {
          case 'trading-bots':
            return BotTypesEnum.dca;
          case 'combo-bots':
            return BotTypesEnum.combo;
          case 'grid-bots':
            return BotTypesEnum.grid;
          case 'hedge-dca-bots':
            return BotTypesEnum.hedgeDca;
          case 'hedge-combo-bots':
            return BotTypesEnum.hedgeCombo;
          default:
            return BotTypesEnum.dca;
        }
      };

      // If the bot isn't in the current allBots list (deleted or not loaded),
      // try to enrich the visit with any single-bot cache data we can find.
      const cached = getBotDataFromCache(id, visit.category);

      return {
        _id: id,
        settings: { name: visit.displayName || 'Unknown Bot' },
        profit: visit.botPnl ?? 0,
        profitUsd: visit.botPnl ?? 0,
        botType: botTypeFromCategory(visit.category),
        // Prefer any cached exchange or pair information recorded with the visit
        exchange:
          visit.exchange ?? visit.exchangeUUID ?? cached?.exchange ?? undefined,
        exchangeUUID: visit.exchangeUUID ?? cached?.exchangeUUID ?? undefined,
        baseAsset: visit.baseAsset ?? cached?.baseAsset ?? undefined,
        quoteAsset: visit.quoteAsset ?? cached?.quoteAsset ?? undefined,
        symbol: visit.symbol ?? cached?.symbol ?? undefined,
        symbols: visit.symbols ?? cached?.symbols ?? undefined,
        coinPair: visit.coinPair ?? cached?.coinPair ?? undefined,
        visitPath: visit.path,
        visitTimestamp: visit.timestamp,
      };
    });

    return recentBotsWithData;
  }, [visits, allBots, tradingMode]);


  const handleBotClick = (bot: any) => {
    const type = (bot?.botType || bot?.type || '').toString();
    const base = getBotTypeRoute(type || 'dca');
    navigate(`${base}/view/${bot._id}`);

    onNavigate?.();
    if (!navigationSecondaryPinned) {
      onClose();
    }
  };

  const handleTradesClick = () => {
    navigate('/trading?trading-view=trades');
    onNavigate?.();
    if (!navigationSecondaryPinned) {
      onClose();
    }
  };

  // (Helpers are already declared above; keep those implementations)

  return (
    <>
      <RightPanel
        title="Trading"
        pinned={navigationSecondaryPinned}
        onClose={onClose}
        onPinToggle={toggleNavigationSecondaryPinned}
        headerActions={
          <div className="flex items-center gap-2">
            <button
              title="Create new bot"
              aria-label="Create bot"
              onClick={() => setShowNewBotWizard(true)}
              className="h-8 w-8 p-0 bg-primary text-primary-foreground rounded flex items-center justify-center hover:bg-primary/90"
            >
              <span className="sr-only">Create bot</span>
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        }
      >
        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-4">
            <div>
              <PanelPositionStats {...TRADING_STATS} />
            </div>

            {/* Starred Bots */}
            {starredBots.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Starred Bots
                  </h3>
                  <Badge className="ml-auto h-5 px-2 text-xs bg-muted/50 text-card-foreground border-0">
                    {starredBots.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {displayedStarredBots.map((bot) => (
                    <BotItemPanel
                      key={String(bot._id)}
                      bot={bot}
                      botType={bot.botType}
                      privacyMode={privacyMode}
                      onClick={handleBotClick}
                      onStarToggle={toggleStarred}
                      isStarred={starredBotIds.has(bot._id)}
                    />
                  ))}
                  {starredBots.length > 3 && (
                    <button
                      onClick={() => setShowMoreStarred(!showMoreStarred)}
                      className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-card-foreground hover:bg-muted/30 rounded-lg transition-colors"
                    >
                      {showMoreStarred
                        ? 'Show less'
                        : `Show ${Math.min(starredBots.length - 3, 7)} more`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Recent Bots */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Recent Bots
                </h3>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    aria-label="Clear recent bots"
                    title="Clear recent bots"
                    onClick={() =>
                      clearVisitsByCategories(BOT_CATEGORIES as any)
                    }
                    className="p-1 rounded hover:bg-muted/30"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>

                  <Badge className="h-5 px-2 text-xs bg-muted/50 text-card-foreground border-0">
                    {recentVisits.length}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                {recentVisits.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    No recent bots
                  </div>
                )}

                {/* Map visits to bot-like items and render BotItemPanel */}
                {(showMoreRecent
                  ? recentVisits.slice(0, 10)
                  : recentVisits.slice(0, 3)
                ).map((bot) => (
                  <BotItemPanel
                    key={bot.visitPath || bot._id}
                    bot={bot}
                    botType={bot.botType}
                    privacyMode={privacyMode}
                    onClick={handleBotClick}
                    onStarToggle={toggleStarred}
                    isStarred={starredBotIds.has(bot._id)}
                  />
                ))}

                {recentVisits.length > 3 && (
                  <button
                    onClick={() => setShowMoreRecent(!showMoreRecent)}
                    className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-card-foreground hover:bg-muted/30 rounded-lg transition-colors"
                  >
                    {showMoreRecent
                      ? 'Show less'
                      : `Show ${Math.min(recentVisits.length - 3, 7)} more`}
                  </button>
                )}
              </div>
            </div>

            {/* Recent Trades */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Recent Trades
                </h3>
                <Badge className="ml-auto h-5 px-2 text-xs bg-muted/50 text-card-foreground border-0">
                  {recentTrades.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {recentTrades.length === 0 && (
                  <div className="text-xs text-muted-foreground">
                    No recent trades
                  </div>
                )}

                {(showMoreRecent
                  ? recentTrades.slice(0, 10)
                  : recentTrades.slice(0, 3)
                ).map((t: any) => {
                  // Resolve a nice bot name here to ensure we show human name when available
                  const findBot = allBots.find(
                    (b) => b._id === (t.botId || t.botId || t.bot?._id)
                  );
                  const resolvedBotName =
                    t.botName ||
                    findBot?.settings?.name ||
                    t.bot?.settings?.name ||
                    t.bot?.name ||
                    undefined;
                  return (
                    <TradeItemPanel
                      key={String(t._id)}
                      trade={t}
                      privacyMode={privacyMode}
                      onClick={handleTradesClick}
                      displayBotName={resolvedBotName}
                    />
                  );
                })}

                {recentTrades.length > 3 && (
                  <button
                    onClick={() => setShowMoreRecent(!showMoreRecent)}
                    className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-card-foreground hover:bg-muted/30 rounded-lg transition-colors"
                  >
                    {showMoreRecent
                      ? 'Show less'
                      : `Show ${Math.min(recentTrades.length - 3, 7)} more`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </RightPanel>
      <NewBotWizard
        open={showNewBotWizard}
        onOpenChange={(o) => setShowNewBotWizard(o)}
      />
    </>
  );
};

export default TradingPanel;
