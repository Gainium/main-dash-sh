/* eslint-disable @typescript-eslint/no-explicit-any */
import BotItemPanel from '@/components/bots/BotItemPanel';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserSessionsStore } from '@/stores/userSessionsStore';

import { useGridBots } from '@/hooks/useGridBots';
// grid deals hook not available yet; stats will show only bots and visits
import { useStarredBotsStore } from '@/stores/starredBotsStore';
import { useUIStore } from '@/stores/uiStore';
import { getBotTypeRoute } from '@/utils/botUtils';
import { FlaskConical, Star, X } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PanelLinkItem from './PanelLinkItem';
import PanelPositionStats from './PanelPositionStats';
import RightPanel from './RightPanel';
import { BotTypesEnum } from '@/types';

interface GridBotsPanelProps {
  onClose: () => void;
  onNavigate?: () => void;
}

const BOT_CATEGORIES: Array<any> = ['grid-bots'];

/** Server totals shown at the top of the panel. */
const GRID_STATS = {
  positions: ['grid'], pnl: [],
} as const;

const GridBotsPanel: React.FC<GridBotsPanelProps> = ({
  onClose,
  onNavigate,
}) => {
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

  // Deal hooks for Grid only
  // Bots (for the "recent bots" list)
  const { bots: gridBots = [] } = useGridBots({ status: ['open'] as any });

  const allBots = useMemo(
    () => gridBots.map((b) => ({ ...b, botType: BotTypesEnum.grid })),
    [gridBots]
  );

  function getBotTimestamp(b: any): number {
    const t = b?.created ?? b?.updated ?? b?.createTime ?? b?.createdAt;
    if (t) return new Date(t).getTime();
    const id = b?._id ?? b?.id ?? '';
    if (typeof id === 'string' && id.length >= 8) {
      const first8 = id.slice(0, 8);
      if (/^[0-9a-fA-F]+$/.test(first8)) return parseInt(first8, 16) * 1000;
    }
    return 0;
  }

  const starredBots = useMemo(
    () =>
      allBots
        .filter((bot) => starredBotIds.has(bot._id))
        .sort((a, b) => getBotTimestamp(b) - getBotTimestamp(a)),
    [allBots, starredBotIds]
  );
  const displayedStarredBots = showMoreStarred
    ? starredBots.slice(0, 10)
    : starredBots.slice(0, 3);

  const clearVisitsByCategories = useUserSessionsStore(
    (s) => s.clearVisitsByCategories
  );

  const visits = useUserSessionsStore((s) => s.visits);

  const recentVisits = useMemo(() => {
    const filtered = visits.filter((v) => {
      if (!BOT_CATEGORIES.includes(v.category)) return false;
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

    const recentBotsWithData = sortedVisits.map((visit) => {
      const parts = visit.path.split('/').filter(Boolean);
      const id = parts[parts.length - 1];
      const actualBot = allBots.find((b) => b._id === id);
      if (actualBot)
        return {
          ...actualBot,
          visitPath: visit.path,
          visitTimestamp: visit.timestamp,
        };
      return {
        _id: id,
        settings: { name: visit.displayName || 'Unknown Bot' },
        profit: visit.botPnl ?? 0,
        profitUsd: visit.botPnl ?? 0,
        botType: BotTypesEnum.grid,
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


  const handleBotClick = (bot: any) => {
    const type = (bot?.botType || bot?.type || '').toString();
    const base = getBotTypeRoute(type || 'grid');
    navigate(`${base}/view/${bot._id}`);
    onNavigate?.();
    if (!navigationSecondaryPinned) onClose();
  };

  return (
    <RightPanel
      title="Grid Bots"
      pinned={navigationSecondaryPinned}
      onClose={onClose}
      onPinToggle={toggleNavigationSecondaryPinned}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            title="Create Grid bot"
            aria-label="Create Grid bot"
            onClick={() => {
              navigate('/grid/new');
              onNavigate?.();
              if (!navigationSecondaryPinned) onClose();
            }}
            className="h-8 w-8 p-0 bg-primary text-primary-foreground rounded flex items-center justify-center hover:bg-primary/90"
          >
            <span className="sr-only">Create Grid bot</span>
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
            <PanelPositionStats {...GRID_STATS} />
          </div>

          <PanelLinkItem
            label="Backtests"
            icon={<FlaskConical className="h-4 w-4" />}
            onClick={() => {
              navigate('/grid/backtests');
              onNavigate?.();
              if (!navigationSecondaryPinned) onClose();
            }}
          />

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

export default GridBotsPanel;
