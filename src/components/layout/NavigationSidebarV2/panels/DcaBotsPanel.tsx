/* eslint-disable @typescript-eslint/no-explicit-any */
import BotItemPanel from '@/components/bots/BotItemPanel';
import { Badge } from '@/components/ui/badge';
import {
  MenuPanelStatsBoxes,
  type MenuStatBox,
} from '@/components/ui/MenuPanelStatsBoxes';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserSessionsStore } from '@/stores/userSessionsStore';

import { useDcaBots } from '@/hooks/useDcaBots';
import { useDcaDeals } from '@/hooks/useDcaDeals';
import { useUnrealizedPnL } from '@/lib/hooks/useUnrealizedPnL';
import { formatCurrency } from '@/lib/utils';
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import { useUIStore } from '@/stores/uiStore';
import { getBotTypeRoute } from '@/utils/botUtils';
import { Star, X } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RightPanel from './RightPanel';
import { BotTypesEnum } from '@/types';

interface DcaBotsPanelProps {
  onClose: () => void;
  onNavigate?: () => void;
}

const BOT_CATEGORIES: Array<any> = ['trading-bots'];

const DcaBotsPanel: React.FC<DcaBotsPanelProps> = ({ onClose, onNavigate }) => {
  const navigationSecondaryPinned = useUIStore(
    (s) => s.navigationSecondaryPinned
  );
  const toggleNavigationSecondaryPinned = useUIStore(
    (s) => s.toggleNavigationSecondaryPinned
  );
  const navigate = useNavigate();
  const privacyMode = useUIStore((s) => s.privacyMode);
  const tradingMode = useUIStore((s) => s.tradingMode);

  // Use Zustand store for starred bots
  const toggleStarred = useStarredBotsStore((s) => s.toggleStarred);
  const starredBotIds = useStarredBotsStore((s) => s.starredBotIds);

  const [showMoreRecent, setShowMoreRecent] = React.useState(false);
  const [showMoreStarred, setShowMoreStarred] = React.useState(false);

  // Deal hooks for DCA only
  const { deals: dcaDeals = [] } = useDcaDeals({ terminal: false });
  const { deals: terminalDeals = [] } = useDcaDeals({ terminal: true });

  // Bots (for the "recent bots" list)
  const { bots: dcaBots = [] } = useDcaBots({
    status: ['open'] as any,
    terminal: false,
  });

  const allDeals = useMemo(() => {
    return [...dcaDeals, ...terminalDeals];
  }, [dcaDeals, terminalDeals]);

  const { getTotalUnrealizedPnL, isLoading: pricesLoading } = useUnrealizedPnL(
    allDeals as any
  );

  const totalUnrealizedPnL = getTotalUnrealizedPnL();

  // Helper: extract numeric value from a potentially nested object
  function extractNumeric(val: any): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    if (typeof val.value === 'number') return val.value;
    if (typeof val.totalUsd === 'number') return val.totalUsd;
    if (typeof val.total === 'number') return val.total;
    if (val?.value && typeof val.value.totalUsd === 'number')
      return val.value.totalUsd;
    if (val?.value && typeof val.value === 'number') return val.value;
    // Some shapes: { key, value } -> value can be string/number
    if (typeof val.value === 'string' && !isNaN(Number(val.value)))
      return Number(val.value);
    if (typeof val.totalUsd === 'string' && !isNaN(Number(val.totalUsd)))
      return Number(val.totalUsd);
    if (typeof val.total === 'string' && !isNaN(Number(val.total)))
      return Number(val.total);
    return 0;
  }

  const totalRealized = useMemo(() => {
    return allDeals.reduce(
      (sum, d: any) => sum + extractNumeric(d.profit || 0),
      0
    );
  }, [allDeals]);

  const moneyInPositions = useMemo(() => {
    // Try to sum usage.currentUsd if present, otherwise usage.current.quote
    return allDeals.reduce((sum, d: any) => {
      const v = d.usage?.currentUsd ?? d.usage?.current?.quote ?? 0;
      return sum + extractNumeric(v);
    }, 0);
  }, [allDeals]);

  const totalPnL = totalRealized + totalUnrealizedPnL;

  const pnlToday = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return allDeals.reduce((sum, d: any) => {
      const ct = d?.createTime ? new Date(d.createTime) : null;
      if (ct && ct >= startOfToday) {
        return sum + extractNumeric(d.profit || 0);
      }
      return sum;
    }, 0);
  }, [allDeals]);

  // Recent bots and trades
  const allBots = useMemo(() => {
    return dcaBots.map((b) => ({ ...b, botType: BotTypesEnum.dca }));
  }, [dcaBots]);

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
      return {
        _id: id,
        settings: { name: visit.displayName || 'Unknown Bot' },
        profit: visit.botPnl ?? 0,
        profitUsd: visit.botPnl ?? 0,
        botType: BotTypesEnum.dca,
        // Use cached visit fields when available so we can show exchange/pair
        exchange: visit.exchange ?? visit.exchangeUUID ?? undefined,
        exchangeUUID: visit.exchangeUUID ?? undefined,
        baseAsset: visit.baseAsset ?? undefined,
        quoteAsset: visit.quoteAsset ?? undefined,
        symbol: visit.symbol ?? undefined,
        symbols: visit.symbols ?? undefined,
        coinPair: visit.coinPair ?? undefined,
        visitPath: visit.path,
        visitTimestamp: visit.timestamp,
      };
    });

    return recentBotsWithData;
  }, [visits, allBots, tradingMode]);

  const stats: MenuStatBox[] = [
    {
      title: 'PnL today',
      value: privacyMode ? '***' : formatCurrency(pnlToday, 2),
      colorClass:
        pnlToday >= 0
          ? 'from-green-500 to-green-600'
          : 'from-red-500 to-red-600',
    },
    {
      title: 'Total PnL',
      value:
        pricesLoading && !privacyMode ? (
          <Skeleton className="h-4 w-16" />
        ) : privacyMode ? (
          '***'
        ) : (
          formatCurrency(totalPnL, 2)
        ),
      colorClass:
        totalPnL >= 0
          ? 'from-green-500 to-green-600'
          : 'from-red-500 to-red-600',
    },
    {
      title: 'Money in Positions',
      value: privacyMode ? '***' : formatCurrency(moneyInPositions, 2),
      colorClass: 'from-indigo-500 to-indigo-600',
    },
    {
      title: 'uPnL',
      value:
        pricesLoading && !privacyMode ? (
          <Skeleton className="h-4 w-16" />
        ) : privacyMode ? (
          '***'
        ) : (
          formatCurrency(totalUnrealizedPnL, 2)
        ),
      colorClass: 'from-yellow-500 to-yellow-600',
    },
  ];

  const handleBotClick = (bot: any) => {
    const type = (bot?.botType || bot?.type || '').toString();
    const base = getBotTypeRoute(type || 'dca');
    navigate(`${base}/view/${bot._id}`);

    onNavigate?.();
    if (!navigationSecondaryPinned) {
      onClose();
    }
  };

  return (
    <RightPanel
      title="Trading Bots"
      pinned={navigationSecondaryPinned}
      onClose={onClose}
      onPinToggle={toggleNavigationSecondaryPinned}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            title="Create DCA bot"
            aria-label="Create DCA bot"
            onClick={() => {
              navigate('/bot/new');
              onNavigate?.();
              if (!navigationSecondaryPinned) onClose();
            }}
            className="h-8 w-8 p-0 bg-primary text-primary-foreground rounded flex items-center justify-center hover:bg-primary/90"
          >
            <span className="sr-only">Create DCA bot</span>
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
            <MenuPanelStatsBoxes
              boxes={stats}
              title="Stats"
              className="p-1"
              cols={2}
            />
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
                  onClick={() => clearVisitsByCategories(BOT_CATEGORIES as any)}
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
        </div>
      </ScrollArea>
    </RightPanel>
  );
};

export default DcaBotsPanel;
