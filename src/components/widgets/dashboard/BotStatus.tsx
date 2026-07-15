import { useGraphQL } from '@/hooks/useGraphQL';
import { GraphQlQuery, type ReturnResult } from '@/lib/api';
import { logger } from '@/lib/loggerInstance';
import { BotTypesEnum } from '@/types';
import { getBotStatusConfig, getBotTypeConfig } from '@/utils/botUtils';
import { Bot } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useWidgetSettings,
  type BotStatsWidgetSettings,
} from '../../../hooks/useWidgetSettings';
import { useWidgetDisplayName } from '../../../utils/widgetUtils';
import { ResponsiveRow } from '../../ui/ResponsiveRow';
import {
  FilterSection,
  SelectionDialog,
  type FilterItem,
} from '../shared/WidgetFilterArea';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';
import { getWidgetMetadata } from './index';

// API Response Types
// These types represent the data payload returned by the API (not wrapped in ReturnResult)
interface BotDashboardStatsApiResponse {
  result: Array<{
    status: string;
    count: number;
  }>;
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
  result: Array<{
    quote: number;
  }>;
}

// Types
export type BotType = 'all' | 'dca' | 'grid' | 'combo' | 'terminal' | 'hedge';

export interface BotStatus {
  status: {
    open: number;
    range: number;
    monitoring: number;
    error: number;
    closed: number;
  };
  deals: {
    inProfit: number;
    normal: number;
    dcaPercent: number;
    maxDca: number;
  };
  unrealizedPnl: number;
  totalProfit: number;
  totalCount: number;
}

export interface BotStatsProps {
  widgetId?: string;
  isEditable?: boolean;
  isCollapsible?: boolean;
  onRemove?: () => void;
  onSettings?: () => void;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
}

// Bot types configuration
const BOT_TYPES = [
  {
    id: 'all',
    name: 'All Bots',
    icon: Bot,
    color: '#6b7280',
  },
  {
    id: 'dca',
    name: 'DCA Bots',
    icon: getBotTypeConfig(BotTypesEnum.dca).icon,
    color: getBotTypeConfig(BotTypesEnum.dca).color,
  },
  {
    id: 'grid',
    name: 'Grid Bots',
    icon: getBotTypeConfig(BotTypesEnum.grid).icon,
    color: getBotTypeConfig(BotTypesEnum.grid).color,
  },
  {
    id: 'combo',
    name: 'Combo Bots',
    icon: getBotTypeConfig(BotTypesEnum.combo).icon,
    color: getBotTypeConfig(BotTypesEnum.combo).color,
  },
  {
    id: 'terminal',
    name: 'Terminal Deals',
    icon: getBotTypeConfig('terminal').icon,
    color: getBotTypeConfig('terminal').color,
  },
  {
    id: 'hedge',
    name: 'Hedge Bots',
    icon: getBotTypeConfig(BotTypesEnum.hedgeCombo).icon,
    color: getBotTypeConfig(BotTypesEnum.hedgeCombo).color,
  },
] as const;

export const BotStatus: React.FC<BotStatsProps> = ({
  widgetId = 'bot-status',
  isEditable = false,
  isCollapsible = true,
  onRemove,
  onSettings,
  onCollapse,
  onTabMove,
  menuActions,
}) => {
  // Use the generic widget settings hook with type safety
  const { usePersistedState } =
    useWidgetSettings<BotStatsWidgetSettings>(widgetId);

  const botDashboardQueryDefs = useMemo(
    () => ({
      dca: GraphQlQuery.botDashboardStats({ type: BotTypesEnum.dca }),
      grid: GraphQlQuery.botDashboardStats({ type: BotTypesEnum.grid }),
      combo: GraphQlQuery.botDashboardStats({ type: BotTypesEnum.combo }),
      hedge: GraphQlQuery.botDashboardStats({ type: BotTypesEnum.hedgeCombo }),
    }),
    []
  );

  const dealDashboardQueryDefs = useMemo(
    () => ({
      dca: GraphQlQuery.dealDashboardStats({
        type: BotTypesEnum.dca,
        terminal: false,
      }),
      // NOTE: no `grid` deal-stats query. Grid bots have no DCA-style deals,
      // and the backend's dealDashboardStats resolver returns the *DCA*
      // dataset for `type: grid` — so summing it double-counts every DCA deal
      // (normal/inProfit counts + unrealizedProfit). The legacy dashboard
      // (main-dash) never queries dealDashboardStats for grid; it only pulls
      // grid bot-status counts + realized profit. Mirror that here. Grid bot
      // counts still flow through botDashboardStats (processBotStats) below.
      combo: GraphQlQuery.dealDashboardStats({
        type: BotTypesEnum.combo,
        terminal: false,
      }),
      hedge: GraphQlQuery.dealDashboardStats({
        type: BotTypesEnum.hedgeCombo,
        terminal: false,
      }),
      terminal: GraphQlQuery.dealDashboardStats({
        type: BotTypesEnum.dca,
        terminal: true,
      }),
    }),
    []
  );

  const profitQueryDefs = useMemo(
    () => ({
      dca: GraphQlQuery.getProfitByUser(
        {
          timeframe: 3,
          botType: BotTypesEnum.dca,
          terminal: false,
        },
        'quote'
      ),
      grid: GraphQlQuery.getProfitByUser(
        {
          timeframe: 3,
          botType: BotTypesEnum.grid,
        },
        'quote'
      ),
      combo: GraphQlQuery.getProfitByUser(
        {
          timeframe: 3,
          botType: BotTypesEnum.combo,
        },
        'quote'
      ),
      hedge: GraphQlQuery.getProfitByUser(
        {
          timeframe: 3,
          botType: BotTypesEnum.hedgeCombo,
        },
        'quote'
      ),
      terminal: GraphQlQuery.getProfitByUser(
        {
          timeframe: 3,
          botType: BotTypesEnum.dca,
          terminal: true,
        },
        'quote'
      ),
    }),
    []
  );

  // Track all GraphQL queries for stale-while-revalidate indicator.
  // Depends only on the (memoized) query-def objects, so it's stable.
  const cacheQueries = useMemo(
    () => [
      {
        queryKey: 'dcaBotDashboardStats',
        variables: botDashboardQueryDefs.dca.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'gridBotDashboardStats',
        variables: botDashboardQueryDefs.grid.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'comboBotDashboardStats',
        variables: botDashboardQueryDefs.combo.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'hedgeBotDashboardStats',
        variables: botDashboardQueryDefs.hedge.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'dcaDealDashboardStats',
        variables: dealDashboardQueryDefs.dca.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'comboDealDashboardStats',
        variables: dealDashboardQueryDefs.combo.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'hedgeDealDashboardStats',
        variables: dealDashboardQueryDefs.hedge.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'terminalDealDashboardStats',
        variables: dealDashboardQueryDefs.terminal.variables as Record<
          string,
          unknown
        >,
      },
      {
        queryKey: 'dcaProfitData',
        variables: profitQueryDefs.dca.variables as Record<string, unknown>,
      },
      {
        queryKey: 'gridProfitData',
        variables: profitQueryDefs.grid.variables as Record<string, unknown>,
      },
      {
        queryKey: 'comboProfitData',
        variables: profitQueryDefs.combo.variables as Record<string, unknown>,
      },
      {
        queryKey: 'hedgeComboProfitData',
        variables: profitQueryDefs.hedge.variables as Record<string, unknown>,
      },
      {
        queryKey: 'terminalProfitData',
        variables: profitQueryDefs.terminal.variables as Record<
          string,
          unknown
        >,
      },
    ],
    [botDashboardQueryDefs, dealDashboardQueryDefs, profitQueryDefs]
  );

  // GraphQL data queries - Using dashboard stats instead of bot lists
  // Bot stats queries (bot dashboard stats don't support terminal parameter)
  const { data: dcaBotStats, isLoading: dcaBotLoading } =
    useGraphQL<BotDashboardStatsApiResponse>(
      'dcaBotDashboardStats',
      botDashboardQueryDefs.dca
    );

  const { data: gridBotStats, isLoading: gridBotLoading } =
    useGraphQL<BotDashboardStatsApiResponse>(
      'gridBotDashboardStats',
      botDashboardQueryDefs.grid
    );

  const { data: comboBotStats, isLoading: comboBotLoading } =
    useGraphQL<BotDashboardStatsApiResponse>(
      'comboBotDashboardStats',
      botDashboardQueryDefs.combo
    );

  const { data: hedgeBotStats, isLoading: hedgeBotLoading } =
    useGraphQL<BotDashboardStatsApiResponse>(
      'hedgeBotDashboardStats',
      botDashboardQueryDefs.hedge
    );

  // Deal stats queries (exclude terminal deals with terminal: false)
  const { data: dcaDealStats } = useGraphQL<DealDashboardStatsApiResponse>(
    'dcaDealDashboardStats',
    dealDashboardQueryDefs.dca
  );

  const { data: comboDealStats } = useGraphQL<DealDashboardStatsApiResponse>(
    'comboDealDashboardStats',
    dealDashboardQueryDefs.combo
  );

  const { data: hedgeDealStats } = useGraphQL<DealDashboardStatsApiResponse>(
    'hedgeDealDashboardStats',
    dealDashboardQueryDefs.hedge
  );

  // Terminal deal stats query (only terminal deals)
  const { data: terminalDealStats } = useGraphQL<DealDashboardStatsApiResponse>(
    'terminalDealDashboardStats',
    dealDashboardQueryDefs.terminal
  );

  // Profit queries (timeframe: 3 = all time)
  const { data: dcaProfitData } = useGraphQL<ProfitApiResponse>(
    'dcaProfitData',
    profitQueryDefs.dca
  );

  const { data: gridProfitData } = useGraphQL<ProfitApiResponse>(
    'gridProfitData',
    profitQueryDefs.grid
  );

  const { data: comboProfitData } = useGraphQL<ProfitApiResponse>(
    'comboProfitData',
    profitQueryDefs.combo
  );

  const { data: hedgeComboProfitData } = useGraphQL<ProfitApiResponse>(
    'hedgeComboProfitData',
    profitQueryDefs.hedge
  );

  const { data: terminalProfitData } = useGraphQL<ProfitApiResponse>(
    'terminalProfitData',
    profitQueryDefs.terminal
  );

  // Data processing functions
  const calculateBotStats = useMemo(() => {
    const stats: Record<BotType, BotStatus> = {
      all: {
        status: { open: 0, range: 0, monitoring: 0, error: 0, closed: 0 },
        deals: { inProfit: 0, normal: 0, dcaPercent: 0, maxDca: 0 },
        unrealizedPnl: 0,
        totalProfit: 0,
        totalCount: 0,
      },
      dca: {
        status: { open: 0, range: 0, monitoring: 0, error: 0, closed: 0 },
        deals: { inProfit: 0, normal: 0, dcaPercent: 0, maxDca: 0 },
        unrealizedPnl: 0,
        totalProfit: 0,
        totalCount: 0,
      },
      grid: {
        status: { open: 0, range: 0, monitoring: 0, error: 0, closed: 0 },
        deals: { inProfit: 0, normal: 0, dcaPercent: 0, maxDca: 0 },
        unrealizedPnl: 0,
        totalProfit: 0,
        totalCount: 0,
      },
      combo: {
        status: { open: 0, range: 0, monitoring: 0, error: 0, closed: 0 },
        deals: { inProfit: 0, normal: 0, dcaPercent: 0, maxDca: 0 },
        unrealizedPnl: 0,
        totalProfit: 0,
        totalCount: 0,
      },
      terminal: {
        status: { open: 0, range: 0, monitoring: 0, error: 0, closed: 0 },
        deals: { inProfit: 0, normal: 0, dcaPercent: 0, maxDca: 0 },
        unrealizedPnl: 0,
        totalProfit: 0,
        totalCount: 0,
      },
      hedge: {
        status: { open: 0, range: 0, monitoring: 0, error: 0, closed: 0 },
        deals: { inProfit: 0, normal: 0, dcaPercent: 0, maxDca: 0 },
        unrealizedPnl: 0,
        totalProfit: 0,
        totalCount: 0,
      },
    };

    // Helper function to process bot status data
    const processBotStats = (
      botData: ReturnResult<BotDashboardStatsApiResponse> | undefined,
      statsKey: BotType
    ) => {
      if (botData?.status === 'OK' && botData?.data?.result) {
        botData.data.result.forEach(
          (item: { status: string; count: number }) => {
            const status = item.status.toLowerCase();
            const count = item.count;

            stats[statsKey].totalCount += count;

            if (status === 'open') stats[statsKey].status.open += count;
            else if (status === 'range') stats[statsKey].status.range += count;
            else if (status === 'monitoring')
              stats[statsKey].status.monitoring += count;
            else if (status === 'error') stats[statsKey].status.error += count;
            else if (status === 'closed')
              stats[statsKey].status.closed += count;
          }
        );
      }
    };

    // Helper function to process deal stats data
    const processDealStats = (
      dealData: ReturnResult<DealDashboardStatsApiResponse> | undefined,
      statsKey: BotType
    ) => {
      if (
        dealData?.status === 'OK' &&
        dealData?.data?.result &&
        Array.isArray(dealData.data.result) &&
        dealData.data.result.length > 0
      ) {
        // The API returns result as an array with one object
        const result = dealData.data.result[0];
        stats[statsKey].deals.normal = result.normal || 0;
        stats[statsKey].deals.inProfit = result.inProfit || 0;
        stats[statsKey].deals.maxDca = result.max || 0;
        stats[statsKey].unrealizedPnl = result.unrealizedProfit || 0;

        // Calculate DCA percentage
        stats[statsKey].deals.dcaPercent = result.eighty || 0;
      }
    };

    // Helper function to process profit data
    const processProfitStats = (
      profitData: ReturnResult<ProfitApiResponse> | undefined,
      statsKey: BotType
    ) => {
      if (
        profitData?.status === 'OK' &&
        profitData?.data?.result &&
        Array.isArray(profitData.data.result) &&
        profitData.data.result.length > 0
      ) {
        stats[statsKey].totalProfit = profitData.data.result[0]?.quote || 0;
      }
    };

    // Process DCA bot and deal stats
    processBotStats(dcaBotStats, 'dca');
    processDealStats(dcaDealStats, 'dca');
    processProfitStats(dcaProfitData, 'dca');

    // Process Grid bot stats + profit only. Grid has no DCA-style deals; see
    // dealDashboardQueryDefs note (backend returns DCA data for type:grid).
    processBotStats(gridBotStats, 'grid');
    processProfitStats(gridProfitData, 'grid');

    // Process Combo bot and deal stats
    processBotStats(comboBotStats, 'combo');
    processDealStats(comboDealStats, 'combo');
    processProfitStats(comboProfitData, 'combo');

    // Process Hedge bot and deal stats
    processBotStats(hedgeBotStats, 'hedge');
    processDealStats(hedgeDealStats, 'hedge');
    processProfitStats(hedgeComboProfitData, 'hedge');

    // Process Terminal deal stats (no bot stats for terminal, only deal stats)
    processDealStats(terminalDealStats, 'terminal');
    processProfitStats(terminalProfitData, 'terminal');

    // Calculate aggregate stats for 'all'
    Object.keys(stats).forEach((key) => {
      if (key !== 'all') {
        const botType = stats[key as BotType];
        stats.all.status.open += botType.status.open;
        stats.all.status.range += botType.status.range;
        stats.all.status.monitoring += botType.status.monitoring;
        stats.all.status.error += botType.status.error;
        stats.all.status.closed += botType.status.closed;
        stats.all.totalCount += botType.totalCount;
        stats.all.deals.inProfit += botType.deals.inProfit;
        stats.all.deals.normal += botType.deals.normal;
        stats.all.deals.maxDca += botType.deals.maxDca;
        stats.all.deals.dcaPercent += botType.deals.dcaPercent;
        stats.all.unrealizedPnl += botType.unrealizedPnl;
        stats.all.totalProfit += botType.totalProfit;
      }
    });

    // Debug logging
    logger.debug('BotStatus Dashboard Debug:', {
      rawData: {
        dcaBotStats,
        gridBotStats,
        comboBotStats,
        hedgeBotStats,
      },
      statsObject: stats,
    });

    return stats;
  }, [
    dcaBotStats,
    gridBotStats,
    comboBotStats,
    hedgeBotStats,
    dcaDealStats,
    comboDealStats,
    hedgeDealStats,
    terminalDealStats,
    dcaProfitData,
    gridProfitData,
    comboProfitData,
    hedgeComboProfitData,
    terminalProfitData,
  ]);

  // Persisted settings for this widget instance
  const [selectedBotType, setSelectedBotType] = usePersistedState(
    'selectedBotType',
    'all' as BotType
  );

  // Filter area state
  const [selectedBotTypes, setSelectedBotTypes] = usePersistedState(
    'selectedBotTypes',
    ['ALL'] as string[]
  );

  // Local UI state (not persisted)
  const [showBotTypeDialog, setShowBotTypeDialog] = useState(false);
  const [showBotTypeFilterDialog, setShowBotTypeFilterDialog] = useState(false);

  // Convert BOT_TYPES to FilterItem format for the filter area
  const botTypeFilterItems: FilterItem[] = useMemo(
    () =>
      BOT_TYPES.filter((bot) => bot.id !== 'all').map((bot) => ({
        id: bot.id,
        name: bot.name,
        icon: bot.id,
        color: bot.color,
        isBotType: true,
      })),
    []
  );

  // Filter handlers
  const handleBotTypeFilterRemove = useCallback(
    (botTypeId: string) => {
      if (botTypeId === 'ALL') {
        // If removing ALL, select the first specific bot type
        setSelectedBotTypes([BOT_TYPES[1].id]);
      } else {
        const updated = selectedBotTypes.filter((id) => id !== botTypeId);
        // If no items left, select ALL
        if (updated.length === 0) {
          setSelectedBotTypes(['ALL']);
        } else {
          setSelectedBotTypes(updated);
        }
      }
    },
    [selectedBotTypes, setSelectedBotTypes]
  );

  const handleBotTypeFilterToggle = useCallback(
    (botTypeId: string) => {
      if (botTypeId === 'ALL') {
        setSelectedBotTypes(['ALL']);
      } else {
        const currentIds = selectedBotTypes.filter((id) => id !== 'ALL');
        const isSelected = currentIds.includes(botTypeId);

        if (isSelected) {
          const updated = currentIds.filter((id) => id !== botTypeId);
          setSelectedBotTypes(updated.length === 0 ? ['ALL'] : updated);
        } else {
          setSelectedBotTypes([...currentIds, botTypeId]);
        }
      }
    },
    [selectedBotTypes, setSelectedBotTypes]
  );

  // Calculate effective bot data based on filters
  const botData: BotStatus = useMemo(() => {
    if (selectedBotTypes.includes('ALL')) {
      return calculateBotStats['all'];
    }

    // If multiple bot types selected, aggregate their data
    const aggregatedStats: BotStatus = {
      status: { open: 0, range: 0, monitoring: 0, error: 0, closed: 0 },
      deals: { inProfit: 0, normal: 0, dcaPercent: 0, maxDca: 0 },
      unrealizedPnl: 0,
      totalProfit: 0,
      totalCount: 0,
    };

    selectedBotTypes.forEach((botTypeId) => {
      if (botTypeId !== 'ALL') {
        const botType = botTypeId as BotType;
        const stats = calculateBotStats[botType];

        aggregatedStats.status.open += stats.status.open;
        aggregatedStats.status.range += stats.status.range;
        aggregatedStats.status.monitoring += stats.status.monitoring;
        aggregatedStats.status.error += stats.status.error;
        aggregatedStats.status.closed += stats.status.closed;
        aggregatedStats.totalProfit += stats.totalProfit;
        aggregatedStats.totalCount += stats.totalCount;
        aggregatedStats.unrealizedPnl += stats.unrealizedPnl;
        aggregatedStats.deals.inProfit += stats.deals.inProfit;
        aggregatedStats.deals.normal += stats.deals.normal;
        aggregatedStats.deals.dcaPercent += stats.deals.dcaPercent;
        aggregatedStats.deals.maxDca += stats.deals.maxDca;
      }
    });

    return aggregatedStats;
  }, [selectedBotTypes, calculateBotStats]);

  const StatusItem = ({
    count,
    label,
    status,
  }: {
    count: number;
    label: string;
    status?: string;
  }) => {
    const config = status ? getBotStatusConfig(status) : null;

    return (
      <div className="bg-muted rounded-lg p-xs flex items-center gap-xs min-w-0">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: config?.color || '#6b7280' }}
        ></div>
        <span className="text-foreground text-lg font-bold">{count}</span>
        <span className="text-muted-foreground text-xs truncate">{label}</span>
      </div>
    );
  };

  // Initial-load skeleton: show until at least one bot-stats query returns.
  // Once any data lands, the real cards render (a card legitimately showing 0
  // means "no bots of that status," not "still loading").
  const anyBotDataLoaded =
    !!dcaBotStats || !!gridBotStats || !!comboBotStats || !!hedgeBotStats;
  const anyBotLoading =
    dcaBotLoading || gridBotLoading || comboBotLoading || hedgeBotLoading;
  const showSkeleton = !anyBotDataLoaded && anyBotLoading;

  const SkeletonStatTile = () => (
    <div className="bg-muted rounded-lg p-xs flex items-center gap-xs min-w-0">
      <Skeleton className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/30" />
      <Skeleton className="h-5 w-6 bg-muted-foreground/20" />
      <Skeleton className="h-3 w-14 bg-muted-foreground/20" />
    </div>
  );

  // Use the widget display name hook for dynamic names
  const dynamicDisplayName = useWidgetDisplayName({
    id: widgetId,
    type: 'bot-status',
    title: 'Status',
  });

  // Header-right "value" display removed — uPnL is now surfaced in the Hero
  // widget's KPI strip instead of duplicated in this widget's header.

  // Generate dropdown options from bot types
  // Note: We don't include icons in the dropdown labels since they are React components
  // The full dialog shows the proper icons
  const botTypeDropdownOptions = useMemo(
    () =>
      BOT_TYPES.map((botType) => ({
        value: botType.id,
        label: botType.name,
      })),
    []
  );

  const content = (
    <div className="flex flex-col h-full p-md @container" aria-busy={showSkeleton}>
      {/* Main Content Grid - Container responsive */}
      <ResponsiveRow
        breakpoints={{ base: 1, sm: 2 }}
        gap="gap-md"
        className="flex-1"
      >
        {/* Status Column */}
        <div className="space-y-sm">
          <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Status
          </h4>
          <ResponsiveRow breakpoints={{ base: 1, sm: 2, md: 5 }}>
            {showSkeleton ? (
              <>
                <SkeletonStatTile />
                <SkeletonStatTile />
                <SkeletonStatTile />
                <SkeletonStatTile />
                <SkeletonStatTile />
              </>
            ) : (
              <>
                <StatusItem
                  count={botData.status.open}
                  label="open"
                  status="open"
                />
                <StatusItem
                  count={botData.status.range}
                  label="range"
                  status="range"
                />
                <StatusItem
                  count={botData.status.monitoring}
                  label="monitoring"
                  status="monitoring"
                />
                <StatusItem
                  count={botData.status.error}
                  label="error"
                  status="error"
                />
                <StatusItem
                  count={botData.status.closed}
                  label="closed"
                  status="closed"
                />
              </>
            )}
          </ResponsiveRow>
        </div>

        {/* Deals Column */}
        <div className="space-y-sm">
          <h4 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Deals
          </h4>
          <div className="space-y-xs">
            {/* Top row - 4 deal stat boxes */}
            <ResponsiveRow breakpoints={{ base: 1, sm: 2, md: 4 }}>
              {showSkeleton ? (
                <>
                  <SkeletonStatTile />
                  <SkeletonStatTile />
                  <SkeletonStatTile />
                  <SkeletonStatTile />
                </>
              ) : (
                <>
                  <StatusItem
                    count={botData.deals.inProfit}
                    label="in profit"
                    status="open"
                  />
                  <StatusItem count={botData.deals.normal} label="normal" />
                  <StatusItem
                    count={botData.deals.dcaPercent}
                    label="80% DCA"
                    status="range"
                  />
                  <StatusItem
                    count={botData.deals.maxDca}
                    label="max DCA"
                    status="error"
                  />
                </>
              )}
            </ResponsiveRow>

          </div>
        </div>
      </ResponsiveRow>

      {/* Bot Type Selection Dialog (for dropdown) */}
      {showBotTypeDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowBotTypeDialog(false)}
        >
          <div
            className="bg-popover rounded-lg shadow-2xl p-md w-80 max-h-96 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold">Select Bot Type</h3>
              <button
                onClick={() => setShowBotTypeDialog(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-xs">
              {BOT_TYPES.map((botType) => {
                const IconComponent = botType.icon;
                return (
                  <div
                    key={botType.id}
                    className="flex items-center justify-between p-sm rounded hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      setSelectedBotType(botType.id);
                      setShowBotTypeDialog(false);
                    }}
                  >
                    <div className="flex items-center gap-sm">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                        style={{
                          backgroundColor: botType.color + '20',
                          color: botType.color,
                        }}
                      >
                        <IconComponent size={16} />
                      </div>
                      <div>
                        <div className="text-foreground font-medium text-sm">
                          {botType.name}
                        </div>
                      </div>
                    </div>
                    {selectedBotType === botType.id && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-primary-foreground"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const metadata = useMemo(
    () => ({
      ...getWidgetMetadata('bot-status'),
      id: widgetId,
      displayName: dynamicDisplayName,
      hasDropdown: true,
      dropdownOptions: botTypeDropdownOptions,
      selectedDropdownValue: selectedBotType,
      hasFilters: true,
      filtersActive:
        !selectedBotTypes.includes('ALL') || selectedBotTypes.length > 1,
      filterContent: (
        <>
          <FilterSection
            title="Bot Types"
            selectedItems={selectedBotTypes}
            availableItems={botTypeFilterItems}
            onItemRemove={handleBotTypeFilterRemove}
            onShowDialog={() => setShowBotTypeFilterDialog(true)}
            addButtonText="Add bot types"
            showAllOption={true}
            renderIcon={(item) => {
              const botType = BOT_TYPES.find((b) => b.id === item.id);
              if (!botType) return null;
              const IconComponent = botType.icon;
              return <IconComponent size={12} />;
            }}
          />
          <SelectionDialog
            isOpen={showBotTypeFilterDialog}
            onClose={() => setShowBotTypeFilterDialog(false)}
            title="Bot Types"
            items={botTypeFilterItems}
            selectedItems={selectedBotTypes}
            onItemToggle={handleBotTypeFilterToggle}
            showAllOption={true}
            renderIcon={(item) => {
              const botType = BOT_TYPES.find(
                (b) => b.id === item.id || (item.id === 'ALL' && b.id === 'all')
              );
              if (!botType) return null;
              const IconComponent = botType.icon;
              return (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: botType.color + '20',
                    color: botType.color,
                  }}
                >
                  <IconComponent size={16} />
                </div>
              );
            }}
          />
        </>
      ),
      onClearFilters: () => setSelectedBotTypes(['ALL']),
    }),
    [
      widgetId,
      dynamicDisplayName,
      botTypeDropdownOptions,
      selectedBotType,
      selectedBotTypes,
      botTypeFilterItems,
      showBotTypeFilterDialog,
      handleBotTypeFilterRemove,
      handleBotTypeFilterToggle,
      setSelectedBotTypes,
    ]
  );

  const onDropdownChange = useCallback(
    (value: string) => setSelectedBotType(value as BotType),
    [setSelectedBotType]
  );

  // Plain literal (not a memo): every value here is already reference-stable —
  // `metadata`/`cacheQueries` are memoized above, `onDropdownChange` is a
  // `useCallback`, the remaining callbacks come from props, and `menuActions`
  // is passed through directly (the wrapper only reads it). `WidgetWrapper` is
  // `React.memo`'d and receives these spread as individual props, so a container
  // memo bought nothing over per-key stability while adding a hand-maintained
  // dep-array to keep in sync.
  const wrapperProps = {
    metadata,
    isEditable,
    isCollapsible,
    onDropdownChange,
    ...(onRemove && { onRemove }),
    ...(onSettings && { onSettings }),
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && { menuActions }),
    cacheQueries,
  };

  return <WidgetWrapper {...wrapperProps}>{content}</WidgetWrapper>;
};

export default React.memo(BotStatus);
