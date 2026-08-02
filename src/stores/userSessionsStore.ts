/* eslint-disable @typescript-eslint/no-explicit-any */
import { GraphQLClient } from '@/lib/api/GraphQLClient';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import { serializeCrashMeta } from '@/lib/crashBreadcrumbs';
import logger from '@/lib/loggerInstance';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { createIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Invocation-storm tripwire for startPageVisit/endPageVisit.
 *
 * Normal navigation calls these ~2x per route change (start + the previous
 * visit's end). A redirect/unmount timing race in MainLayout could, before the
 * store-subscription narrowing, re-enter the page-visit effect and cascade into
 * a sustained storm that manifests as React #185. This module-level counter
 * (deliberately NOT in store state, so it never itself triggers a re-render)
 * watches the combined call rate and, if it goes unambiguously abnormal, sends
 * ONE non-fatal report via the same `sendError` path AppErrorBoundary uses,
 * then disarms for the rest of the session. Mirrors useRenderLoopTripwire's
 * one-shot + kill-switch (`localStorage['gainium:tripwire'] = 'off'`) pattern.
 *
 * Hot-path cost: one numeric array push + a timestamp compare. Never throws,
 * never blocks the real tracking logic (fire-and-forget report).
 */
const STORM_WINDOW_MS = 500;
// Normal navigation is 2 calls per route change; >15 within 500ms is
// unambiguously a re-entry storm, not real user navigation.
const STORM_LIMIT = 15;
// How many recent call timestamps to retain (a small ring; > STORM_LIMIT so a
// full window is always measurable).
const STORM_RING_LEN = 24;
// How many recent currentPagePath values to include in the report (to reveal
// the redirect loop).
const STORM_PATH_HISTORY_LEN = 10;

const stormCallTimes: number[] = [];
const stormPathHistory: (string | null)[] = [];
let stormReported = false;

/**
 * Record one start/endPageVisit invocation and fire the tripwire if the
 * combined call rate is abnormal. Never throws; adds negligible overhead.
 */
function noteSessionInvocation(currentPagePath: string | null): void {
  try {
    if (stormReported) return;

    // Kill switch — shared with useRenderLoopTripwire.
    try {
      if (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem('gainium:tripwire') === 'off'
      ) {
        return;
      }
    } catch {
      /* localStorage may throw in some sandboxed contexts */
    }

    const now = Date.now();

    stormCallTimes.push(now);
    if (stormCallTimes.length > STORM_RING_LEN) stormCallTimes.shift();

    stormPathHistory.push(currentPagePath);
    if (stormPathHistory.length > STORM_PATH_HISTORY_LEN) {
      stormPathHistory.shift();
    }

    // Count calls within the trailing window.
    let inWindow = 0;
    for (let i = stormCallTimes.length - 1; i >= 0; i--) {
      if (now - stormCallTimes[i] <= STORM_WINDOW_MS) inWindow += 1;
      else break;
    }
    if (inWindow <= STORM_LIMIT) return;

    // Tripped. Disarm immediately so the report path runs exactly once.
    stormReported = true;

    const pathTrail = stormPathHistory.slice();

    try {
      const token = useAuthStore.getState().tokens?.accessToken;
      const message = `[InvocationStormTripwire] userSessionsStore.startPageVisit/endPageVisit — ${inWindow} calls in ${STORM_WINDOW_MS}ms`;
      const stack =
        `Combined start/endPageVisit invocations: ${inWindow} within ${STORM_WINDOW_MS}ms (limit ${STORM_LIMIT}).\n` +
        `Recent currentPagePath values (oldest → newest):\n` +
        pathTrail.map((p, i) => `#${i}: ${p ?? '(null)'}`).join('\n') +
        serializeCrashMeta({ tripwire: 'userSessionsStore.pageVisit' });

      logger.error(message, { inWindow, pathTrail });

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint, token);
      const { query, variables } = otherQueries.sendError({
        error: { message, stack },
        errorInfo: { componentStack: '' },
        subType: 'Browser',
        source: 'v2',
      });
      void client.request(query, variables).catch((err) => {
        logger.error('[InvocationStormTripwire] Failed to report:', err);
      });
    } catch (err) {
      try {
        logger.error('[InvocationStormTripwire] Report path threw:', err);
      } catch {
        /* noop */
      }
    }
  } catch {
    // The tripwire must never disrupt the real tracking logic.
  }
}

export type PageCategory =
  | 'dashboard'
  | 'trading-bots'
  | 'grid-bots'
  | 'combo-bots'
  | 'hedge-dca-bots'
  | 'hedge-combo-bots'
  | 'manual-backtesting'
  | 'rulebooks'
  | 'trade-journal'
  | 'portfolio'
  | 'trades'
  | 'terminal'
  | 'reports'
  | 'chat'
  | 'settings'
  | 'other';

export interface PageVisit {
  path: string;
  title: string;
  category: PageCategory;
  timestamp: number;
  timeSpent: number; // in milliseconds
  displayName?: string; // Friendly display name (e.g., bot name)
  botId?: string; // Bot MongoDB ID if applicable
  botPnl?: number; // Bot profit/loss if available
  botPnlPercentage?: number; // Bot profit/loss percentage if available
  botStatus?: string; // Bot status if available
  // Optional cached fields to help render fallbacks when bot data is missing
  exchange?: string;
  exchangeUUID?: string;
  baseAsset?: string;
  quoteAsset?: string;
  symbol?: string;
  symbols?: any[];
  coinPair?: string;
  tradingMode?: 'live' | 'paper' | 'demo'; // Trading context when visit was recorded
}

interface BotMetadata {
  id: string;
  name: string;
  category: PageCategory;
}

interface UserSessionsStore {
  visits: PageVisit[];
  currentPagePath: string | null;
  currentPageStartTime: number | null;
  currentPageTradingContext: 'live' | 'paper' | 'demo' | null; // Track trading context for current visit
  botMetadata: Record<string, BotMetadata>; // Cache of bot names by ID

  // Actions
  startPageVisit: (
    path: string,
    title: string,
    category: PageCategory,
    displayName?: string,
    tradingMode?: 'live' | 'paper' | 'demo'
  ) => void;
  endPageVisit: () => void;
  cacheBotMetadata: (id: string, name: string, category: PageCategory) => void;
  getRecentVisitsByCategory: (
    category: PageCategory,
    limit?: number,
    tradingMode?: 'live' | 'paper' | 'demo'
  ) => PageVisit[];
  getAllRecentVisits: (limit?: number) => PageVisit[];
  clearHistory: () => void;
  clearVisitsByCategory: (category: PageCategory) => void;
  clearVisitsByCategories: (categories: PageCategory[]) => void;
  hasVisitedDashboard: boolean;
  markDashboardVisited: () => void;
}

// Helper function to determine category from path
export const getCategoryFromPath = (path: string): PageCategory => {
  const normalizedPath = path.toLowerCase().split('?')[0];

  if (normalizedPath === '/' || normalizedPath.startsWith('/dashboard'))
    return 'dashboard';
  // Check hedge paths (including legacy aliases) before generic /bot paths
  if (
    normalizedPath.startsWith('/hedge/combo') ||
    normalizedPath.startsWith('/hedge-bots/combo')
  ) {
    return 'hedge-combo-bots';
  }
  if (
    normalizedPath.startsWith('/hedge/bot') ||
    normalizedPath.startsWith('/hedge-bots/dca')
  ) {
    return 'hedge-dca-bots';
  }
  // Now check for other bot types
  if (normalizedPath.startsWith('/grid')) return 'grid-bots';
  if (normalizedPath.startsWith('/combo')) return 'combo-bots';
  if (normalizedPath.startsWith('/bot') || normalizedPath.includes('/bot/'))
    return 'trading-bots';
  if (normalizedPath.startsWith('/manual-backtesting'))
    return 'manual-backtesting';
  if (normalizedPath.startsWith('/rulebooks')) return 'rulebooks';
  if (normalizedPath.startsWith('/journal')) return 'trade-journal';
  if (normalizedPath.startsWith('/portfolio')) return 'portfolio';
  if (normalizedPath.startsWith('/trading')) return 'trades';
  if (normalizedPath.startsWith('/terminal')) return 'terminal';
  if (normalizedPath.startsWith('/reports')) return 'reports';
  if (normalizedPath.startsWith('/chat')) return 'chat';
  if (normalizedPath.startsWith('/settings')) return 'settings';

  return 'other';
};

// Helper function to get display title for category
export const getCategoryDisplayName = (category: PageCategory): string => {
  const displayNames: Record<PageCategory, string> = {
    dashboard: 'Dashboards',
    'trading-bots': 'Trading Bots',
    'grid-bots': 'Grid Bots',
    'combo-bots': 'Combo Bots',
    'hedge-dca-bots': 'Hedge DCA Bots',
    'hedge-combo-bots': 'Hedge Combo Bots',
    'manual-backtesting': 'Manual Backtesting',
    rulebooks: 'Rulebooks',
    'trade-journal': 'Trade Journal',
    portfolio: 'Portfolio',
    trades: 'Trades',
    terminal: 'Trading Terminal',
    reports: 'Reports',
    chat: 'Chat',
    settings: 'Settings',
    other: 'Other',
  };
  return displayNames[category];
};

// Helper function to check if a path is a detail page (not a list page)
// Excludes edit pages to only track view pages in recent items
export const isDetailPage = (path: string): boolean => {
  const normalizedPath = path.toLowerCase();
  // Exclude edit and new pages from recent items (don't record '.../new' pages)
  if (normalizedPath.includes('/edit/') || normalizedPath.includes('/new')) {
    return false;
  }
  // Check if path is a view page or bot detail page
  return (
    normalizedPath.startsWith('/hedge/bot/') ||
    normalizedPath.startsWith('/hedge/combo/') ||
    normalizedPath.startsWith('/hedge-bots/dca/') ||
    normalizedPath.startsWith('/hedge-bots/combo/') ||
    normalizedPath.includes('/view/') ||
    /\/[a-f0-9]{24}/.test(normalizedPath) // MongoDB ObjectId pattern
  );
};

// Helper to extract ID from path
export const extractIdFromPath = (path: string): string | null => {
  const segments = path.split('/').filter(Boolean);

  if (segments.includes('view') || segments.includes('edit')) {
    const actionIndex = segments.findIndex((s) => s === 'view' || s === 'edit');
    return segments[actionIndex + 1] || null;
  }

  // For journal/rulebooks paths
  const lastSegment = segments[segments.length - 1];
  if (lastSegment && /^[a-f0-9]{24}$/i.test(lastSegment)) {
    return lastSegment;
  }

  return null;
};

// Helper to get fallback name based on category
const getFallbackName = (category: PageCategory): string => {
  const fallbacks: Record<PageCategory, string> = {
    'trading-bots': 'Trading Bot',
    'grid-bots': 'Grid Bot',
    'combo-bots': 'Combo Bot',
    'hedge-dca-bots': 'Hedge DCA Bot',
    'hedge-combo-bots': 'Hedge Combo Bot',
    rulebooks: 'Rulebook',
    'trade-journal': 'Journal Entry',
    'manual-backtesting': 'Backtest Session',
    dashboard: 'Dashboard',
    portfolio: 'Portfolio',
    trades: 'Trades',
    terminal: 'Terminal',
    reports: 'Reports',
    chat: 'Chat',
    settings: 'Settings',
    other: 'Page',
  };
  return fallbacks[category];
};

// Helper function to get a display name from path using cached metadata
export const getDisplayName = (
  path: string,
  botMetadata: Record<string, BotMetadata>,
  category: PageCategory
): string => {
  if (!isDetailPage(path)) {
    logger.debug('[recent-items] Display name fallback for list page', {
      path,
      category,
    });
    return getFallbackName(category);
  }

  const id = extractIdFromPath(path);

  logger.debug('[recent-items] Getting display name for:', {
    id,
    category,
    path,
  });

  // First try to get from React Query cache
  if (id) {
    const cachedBotData = getBotDataFromCache(id, category);
    if (cachedBotData?.name) {
      logger.info('[recent-items] Using name from cache:', cachedBotData.name);
      return cachedBotData.name;
    }
    logger.warn('[recent-items] Cache found but no name available');
  }

  // Check if we have cached metadata (but only if it's not a fallback)
  if (
    id &&
    botMetadata[id] &&
    botMetadata[id].name &&
    !botMetadata[id].name.includes('Bot')
  ) {
    logger.debug(
      '[recent-items] Using name from metadata:',
      botMetadata[id].name
    );
    return botMetadata[id].name;
  }

  // Fallback to generic name
  logger.warn(
    '[recent-items] No name found, using fallback:',
    getFallbackName(category)
  );
  return getFallbackName(category);
};

// Helper function to get bot data from React Query cache
export const getBotDataFromCache = (
  botId: string,
  category: PageCategory
): {
  name?: string;
  pnl?: number;
  pnlPercentage?: number;
  status?: string;
  // Optional fields to help render fallbacks
  exchange?: string;
  exchangeUUID?: string;
  baseAsset?: string;
  quoteAsset?: string;
  symbol?: string;
  symbols?: any[];
  coinPair?: string;
} | null => {
  try {
    logger.debug('[recent-items] Searching cache for bot:', {
      botId,
      category,
    });

    // Get all queries from the cache
    const queryCache = queryClient.getQueryCache();
    const allQueries = queryCache.getAll();

    logger.debug('[recent-items] Total queries in cache:', allQueries.length);

    // Search for bot list queries based on category
    const botListKeys = [
      'dcaBotList',
      'gridBotList',
      'comboBotList',
      'hedgeDCABotList',
      'hedgeComboBotList',
      'botList', // grid bots query key
    ];

    for (const query of allQueries) {
      const queryKey = query.queryKey as unknown[];
      if (!Array.isArray(queryKey) || queryKey.length === 0) continue;

      const keyName = queryKey[0] as string;
      if (!botListKeys.includes(keyName)) continue;

      logger.debug('[recent-items] Found bot list query:', {
        keyName,
        state: query.state.status,
      });

      const data = query.state.data as any;
      if (!data?.data) continue;

      // Handle both array and object response formats
      let bots: any[] = [];
      if (Array.isArray(data.data)) {
        bots = data.data;
      } else if (data.data.result) {
        bots = data.data.result;
      }

      logger.debug('[recent-items] Checking bots in list:', {
        count: bots.length,
        keyName,
      });

      // Search for the bot in the list
      const bot = bots.find((b: any) => b._id === botId || b.id === botId);
      if (bot) {
        // Log the full bot object structure to understand what fields are available
        logger.debug('[recent-items] Full bot object:', {
          botId,
          botKeys: Object.keys(bot),
          botSample: {
            _id: bot._id,
            id: bot.id,
            name: bot.name,
            botName: bot.botName,
            title: bot.title,
            profit: bot.profit,
            profitPercentage: bot.profitPercentage,
            roi: bot.roi,
            stats: bot.stats,
          },
        });

        // Extract PNL percentage from various possible locations
        let pnlPercentage =
          bot.stats?.numerical?.general?.netProfitPerc ??
          bot.profit?.percentage ??
          bot.profit?.roi ??
          bot.profitPercentage ??
          bot.roi ??
          bot.stats?.roi ??
          bot.stats?.profitPercentage ??
          undefined;

        // Convert to percentage (multiply by 100 if it's a decimal like 0.389)
        if (pnlPercentage !== undefined && Math.abs(pnlPercentage) < 1) {
          pnlPercentage = pnlPercentage * 100;
        }

        logger.info('[recent-items] Extracted PNL percentage:', {
          botId,
          pnlPercentage,
          profitObject: bot.profit,
          statsGeneral: bot.stats?.numerical?.general,
        });

        const botData = {
          name:
            bot.settings?.name ||
            bot.name ||
            bot.botName ||
            bot.title ||
            undefined,
          pnl:
            bot.profit?.value ??
            bot.profit?.totalUsd ??
            bot.profit ??
            bot.totalProfit ??
            bot.stats?.profit ??
            undefined,
          pnlPercentage,
          status:
            bot.status ||
            bot.state ||
            bot.settings?.status ||
            bot.botStatus ||
            undefined,
          exchange:
            bot.exchange ?? bot.exchangeId ?? bot.exchangeUUID ?? undefined,
          exchangeUUID: bot.exchangeUUID ?? bot.exchangeId ?? undefined,
          // baseAsset/quoteAsset can be top-level OR nested in symbol[0].value
          baseAsset:
            bot.baseAsset ??
            (Array.isArray(bot.symbol) && bot.symbol[0]?.value?.baseAsset) ??
            undefined,
          quoteAsset:
            bot.quoteAsset ??
            (Array.isArray(bot.symbol) && bot.symbol[0]?.value?.quoteAsset) ??
            undefined,
          // symbol can be a string OR nested in symbol[0].value.symbol
          symbol:
            typeof bot.symbol === 'string'
              ? bot.symbol
              : Array.isArray(bot.symbol) && bot.symbol[0]?.value?.symbol
                ? bot.symbol[0].value.symbol
                : undefined,
          symbols: Array.isArray(bot.symbols) ? bot.symbols : undefined,
          coinPair: bot.coinPair ?? bot.settings?.pair ?? undefined,
        };
        logger.info('[recent-items] Found bot in cache:', {
          botId,
          botData,
          botObject: { name: bot.name, botName: bot.botName },
          source: keyName,
        });
        return botData;
      }
    }

    // If not found in list queries, also check single-object queries
    for (const query of allQueries) {
      try {
        const data = query.state.data as any;
        // Unwrap common response shapes
        const candidate = data?.data ?? data;
        if (!candidate || typeof candidate !== 'object') continue;

        // If candidate is the bot object itself
        if (candidate._id === botId || candidate.id === botId) {
          logger.debug('[recent-items] Found single-item bot query:', {
            botId,
            queryKey: query.queryKey,
          });

          const bot = candidate;
          let pnlPercentage =
            bot.stats?.numerical?.general?.netProfitPerc ??
            bot.profit?.percentage ??
            bot.profit?.roi ??
            bot.profitPercentage ??
            bot.roi ??
            bot.stats?.roi ??
            bot.stats?.profitPercentage ??
            undefined;

          if (pnlPercentage !== undefined && Math.abs(pnlPercentage) < 1) {
            pnlPercentage = pnlPercentage * 100;
          }

          const botData = {
            name:
              bot.settings?.name ||
              bot.name ||
              bot.botName ||
              bot.title ||
              undefined,
            pnl:
              bot.profit?.value ??
              bot.profit?.totalUsd ??
              bot.profit ??
              bot.totalProfit ??
              bot.stats?.profit ??
              undefined,
            pnlPercentage,
            status:
              bot.status ||
              bot.state ||
              bot.settings?.status ||
              bot.botStatus ||
              undefined,
            exchange:
              bot.exchange ?? bot.exchangeId ?? bot.exchangeUUID ?? undefined,
            exchangeUUID: bot.exchangeUUID ?? bot.exchangeId ?? undefined,
            // baseAsset/quoteAsset can be top-level OR nested in symbol[0].value
            baseAsset:
              bot.baseAsset ??
              (Array.isArray(bot.symbol) && bot.symbol[0]?.value?.baseAsset) ??
              undefined,
            quoteAsset:
              bot.quoteAsset ??
              (Array.isArray(bot.symbol) && bot.symbol[0]?.value?.quoteAsset) ??
              undefined,
            // symbol can be a string OR nested in symbol[0].value.symbol
            symbol:
              typeof bot.symbol === 'string'
                ? bot.symbol
                : Array.isArray(bot.symbol) && bot.symbol[0]?.value?.symbol
                  ? bot.symbol[0].value.symbol
                  : undefined,
            symbols: Array.isArray(bot.symbols) ? bot.symbols : undefined,
            coinPair: bot.coinPair ?? bot.settings?.pair ?? undefined,
          };

          logger.info('[recent-items] Found bot in single-item cache:', {
            botId,
            botData,
            source: query.queryKey,
          });
          return botData;
        }
      } catch (err) {
        // Ignore errors parsing a particular query
        logger.debug(
          '[recent-items] Error while inspecting query for single bot:',
          err
        );
      }
    }

    logger.warn('[recent-items] Bot not found in any cache:', {
      botId,
      category,
    });
    return null;
  } catch (error) {
    logger.error('[recent-items] Error accessing cache:', error);
    return null;
  }
};

const MAX_VISITS = 100; // Keep only the last 100 visits

export const useUserSessionsStore = create<UserSessionsStore>()(
  persist(
    (set, get) => ({
      visits: [],
      currentPagePath: null,
      currentPageStartTime: null,
      currentPageTradingContext: null,
      botMetadata: {},
      hasVisitedDashboard: false,

      markDashboardVisited: () => {
        set({ hasVisitedDashboard: true });
      },

      cacheBotMetadata: (id: string, name: string, category: PageCategory) => {
        set((state) => ({
          botMetadata: {
            ...state.botMetadata,
            [id]: { id, name, category },
          },
        }));
      },

      startPageVisit: (
        path: string,
        title: string,
        category: PageCategory,
        displayName?: string,
        tradingMode?: 'live' | 'paper' | 'demo'
      ) => {
        const cacheDisplayName = () => {
          // If displayName provided, cache it for the bot ID
          if (displayName && isDetailPage(path)) {
            const id = extractIdFromPath(path);
            if (id) {
              get().cacheBotMetadata(id, displayName, category);
            }
          }
        };

        // Idempotent for the page already being tracked. A re-entry for the
        // SAME path (a remount, or a caller re-announcing a title that only
        // resolved after mount) must refresh the cached name without ending
        // and restarting the visit: restarting resets the dwell timer under
        // the 1s floor in `endPageVisit`, so a page whose title/mode settles
        // asynchronously could never be recorded at all — and each restart
        // costs three tracking invocations, which is what tripped the
        // invocation-storm tripwire.
        if (get().currentPagePath === path) {
          cacheDisplayName();
          return;
        }

        noteSessionInvocation(get().currentPagePath);

        // End previous visit if any (a no-op when nothing is in progress)
        get().endPageVisit();

        // Start new visit
        set({
          currentPagePath: path,
          currentPageStartTime: Date.now(),
          currentPageTradingContext: tradingMode ?? null,
        });

        cacheDisplayName();
      },

      endPageVisit: () => {
        const {
          currentPagePath,
          currentPageStartTime,
          currentPageTradingContext,
          visits,
          botMetadata,
        } = get();

        // Nothing in progress — a true no-op, so it must not be counted as an
        // invocation either. Counting it made every no-op end show up in the
        // tripwire's trail as a `(null)` currentPagePath and inflated the
        // measured call rate by ~50% over the real number of page changes.
        if (!currentPagePath || !currentPageStartTime) {
          return;
        }

        noteSessionInvocation(currentPagePath);

        const timeSpent = Date.now() - currentPageStartTime;
        const category = getCategoryFromPath(currentPagePath);

        logger.debug('[recent-items] Ending page visit:', {
          path: currentPagePath,
          category,
          timeSpent,
        });

        // Extract meaningful title from path
        const pathSegments = currentPagePath.split('/').filter(Boolean);
        const title =
          pathSegments.length > 0 ? pathSegments.join(' / ') : 'Home';

        // Get display name from metadata or cache
        const displayName = getDisplayName(
          currentPagePath,
          botMetadata,
          category
        );

        // Extract bot ID and get PNL from cache if it's a bot detail page
        let botId: string | undefined;
        let botPnl: number | undefined;
        let botPnlPercentage: number | undefined;
        let botStatus: string | undefined;
        let cachedBotData: ReturnType<typeof getBotDataFromCache> | null = null;

        if (isDetailPage(currentPagePath)) {
          const extractedId = extractIdFromPath(currentPagePath);
          if (extractedId) {
            botId = extractedId;
            cachedBotData = getBotDataFromCache(extractedId, category);
            if (cachedBotData) {
              botPnl = cachedBotData.pnl;
              botPnlPercentage = cachedBotData.pnlPercentage;
              botStatus = cachedBotData.status;
              logger.debug('[recent-items] Bot PNL from cache:', {
                botId,
                pnl: botPnl,
                pnlPercentage: botPnlPercentage,
              });
            }
          }
        }

        // Only record visits that lasted at least 1 second
        if (timeSpent >= 1000) {
          const newVisit: PageVisit = {
            path: currentPagePath,
            title,
            category,
            timestamp: currentPageStartTime,
            timeSpent,
            displayName,
            ...(botId !== undefined && { botId }),
            ...(botPnl !== undefined && { botPnl }),
            ...(botPnlPercentage !== undefined && { botPnlPercentage }),
            ...(botStatus && { botStatus }),
            // Carry through cached exchange/pair data when available so UI can render fallbacks
            ...(cachedBotData?.exchange && {
              exchange: cachedBotData.exchange,
            }),
            ...(cachedBotData?.exchangeUUID && {
              exchangeUUID: cachedBotData.exchangeUUID,
            }),
            ...(cachedBotData?.baseAsset && {
              baseAsset: cachedBotData.baseAsset,
            }),
            ...(cachedBotData?.quoteAsset && {
              quoteAsset: cachedBotData.quoteAsset,
            }),
            ...(cachedBotData?.symbol && { symbol: cachedBotData.symbol }),
            ...(cachedBotData?.symbols && { symbols: cachedBotData.symbols }),
            ...(cachedBotData?.coinPair && {
              coinPair: cachedBotData.coinPair,
            }),
            ...(currentPageTradingContext !== null && {
              tradingMode: currentPageTradingContext,
            }),
          };

          logger.info('[recent-items] Recording visit:', newVisit);

          // Add new visit and keep only the most recent MAX_VISITS
          const updatedVisits = [newVisit, ...visits].slice(0, MAX_VISITS);

          set({
            visits: updatedVisits,
            currentPagePath: null,
            currentPageStartTime: null,
            currentPageTradingContext: null,
          });
        } else {
          logger.debug('[recent-items] Visit too short, not recording:', {
            timeSpent,
          });
          // Visit too short, just clear current page
          set({
            currentPagePath: null,
            currentPageStartTime: null,
            currentPageTradingContext: null,
          });
        }
      },

      getRecentVisitsByCategory: (
        category: PageCategory,
        limit = 5,
        tradingMode?: 'live' | 'paper' | 'demo'
      ) => {
        const { visits } = get();
        // Filter to only detail pages and remove duplicates by path
        let detailVisits = visits.filter(
          (visit) => visit.category === category && isDetailPage(visit.path)
        );

        // Filter by trading context if specified
        if (tradingMode !== undefined) {
          detailVisits = detailVisits.filter(
            (visit) => visit.tradingMode === tradingMode
          );
        }

        // Deduplicate by path, keeping the most recent visit
        const uniquePaths = new Map<string, PageVisit>();
        detailVisits.forEach((visit) => {
          if (!uniquePaths.has(visit.path)) {
            uniquePaths.set(visit.path, visit);
          }
        });

        return Array.from(uniquePaths.values()).slice(0, limit);
      },

      getAllRecentVisits: (limit = 20) => {
        const { visits } = get();
        return visits.slice(0, limit);
      },

      clearVisitsByCategory: (category: PageCategory) => {
        set((state) => ({
          visits: state.visits.filter((v) => v.category !== category),
        }));
      },

      clearVisitsByCategories: (categories: PageCategory[]) => {
        set((state) => ({
          visits: state.visits.filter((v) => !categories.includes(v.category)),
        }));
      },

      clearHistory: () => {
        set({
          visits: [],
          currentPagePath: null,
          currentPageStartTime: null,
        });
      },
    }),
    {
      name: 'user-sessions-store',
      storage: createIndexedDBStorage('user-sessions-store'),
      version: 1,
      partialize: (state) => ({
        visits: state.visits,
        currentPagePath: state.currentPagePath,
        currentPageStartTime: state.currentPageStartTime,
        currentPageTradingContext: state.currentPageTradingContext,
        botMetadata: state.botMetadata,
        hasVisitedDashboard: state.hasVisitedDashboard,
      }),
    }
  )
);
