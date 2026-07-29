import type { BotStats } from '@/types';
import type { DrawerBot, DrawerBotType } from '@/types/bots/drawer';
import type { DrawerWidgetType } from '../widgets/bots/drawer';
import type { DrawerWidget } from '../widgets/bots/drawer/DrawerWidgetRenderer';

type LayoutDefinition = {
  type: DrawerWidgetType;
  when?: (bot: DrawerBot) => boolean;
  buildProps?: (bot: DrawerBot) => Record<string, unknown> | undefined;
  requireData?: boolean;
  fallback?:
    | LayoutDefinition
    | ((bot: DrawerBot) => LayoutDefinition | undefined);
};

type DrawerWidgetBuilder = (bot: DrawerBot) => DrawerWidget[];

type PerformanceChartPoint = {
  time: number;
  equity?: number;
  realizedProfit?: number;
  buyAndHold?: number;
};

const buildPerformanceChartProps = (
  bot: DrawerBot
): Record<string, unknown> | undefined => {
  const chart = (bot.stats as BotStats)?.chart;
  if (!Array.isArray(chart) || chart.length === 0) {
    return undefined;
  }

  // Accept both numeric and string timestamps; coerce to epoch ms
  const sanitized: PerformanceChartPoint[] = chart
    .filter((point) => point !== undefined && point !== null)
    .map(
      (point: {
        time?: number | string;
        equity?: number;
        realizedProfit?: number;
        buyAndHold?: number;
      }) => {
        const t = point.time;
        const timeNumber =
          typeof t === 'number'
            ? t
            : typeof t === 'string'
              ? new Date(t).getTime() || Number.parseInt(t, 10) || NaN
              : NaN;
        return {
          time: timeNumber,
          ...(typeof point.equity === 'number' ? { equity: point.equity } : {}),
          ...(typeof point.realizedProfit === 'number'
            ? { realizedProfit: point.realizedProfit }
            : {}),
          ...(typeof point.buyAndHold === 'number'
            ? { buyAndHold: point.buyAndHold }
            : {}),
        } as PerformanceChartPoint;
      }
    )
    .filter((p) => Number.isFinite(p.time));

  if (sanitized.length === 0) {
    return undefined;
  }

  return { initialChartData: sanitized };
};

const buildAdditionalDetailsProps = (
  bot: DrawerBot
): Record<string, unknown> => ({ botSnapshot: bot });

const buildGeneralInfoProps = (bot: DrawerBot): Record<string, unknown> => ({
  botSnapshot: bot,
});

const createPlaceholderDefinition = (message?: string): LayoutDefinition => ({
  type: 'drawer-unsupported',
  buildProps: (bot) => ({
    botType: bot.type,
    message,
  }),
});

const PERFORMANCE_CHART_DEFINITION: LayoutDefinition = {
  type: 'drawer-performance-chart',
  buildProps: buildPerformanceChartProps,
  // Do not require data here; the widget renders a consistent, centered
  // "No performance data available" message when empty, matching other widgets.
};

const ADDITIONAL_DETAILS_DEFINITION: LayoutDefinition = {
  type: 'drawer-additional-details',
  buildProps: buildAdditionalDetailsProps,
};

const GENERAL_INFO_DEFINITION: LayoutDefinition = {
  type: 'drawer-general-info',
  buildProps: buildGeneralInfoProps,
};

const BOT_EVENTS_DEFINITION: LayoutDefinition = { type: 'drawer-bot-events' };

const GRID_LAYOUT: LayoutDefinition[] = [
  // General Information at the top
  GENERAL_INFO_DEFINITION,

  // Profit Metrics (Grid bots have profit tracking - includes Grid Controls)
  { type: 'drawer-profit-tabs' },

  // Funds Overview (Current / Initial Funds with currency toggle — mirrors legacy grid page)
  { type: 'drawer-grid-funds-overview' },

  // Profit Chart (daily/weekly/monthly/total bar chart — mirrors legacy TotalProfit)
  { type: 'drawer-grid-profit-chart' },

  // Phase 1: Core Data (Grid bots don't have performance chart data from backend)
  { type: 'drawer-balance-info' },
  { type: 'drawer-orders-table' },

  // Phase 2: Analytics & History
  BOT_EVENTS_DEFINITION,
  { type: 'drawer-backtest-results' },

  // Always Last
  ADDITIONAL_DETAILS_DEFINITION,
];

const COMBO_LAYOUT: LayoutDefinition[] = [
  // General Information at the top
  GENERAL_INFO_DEFINITION,

  // Profit & Performance (like DCA)
  { type: 'drawer-profit-tabs' },
  // Performance = equity/realized-profit panel + deal-returns panel, one
  // widget on a shared time axis (they were two widgets with independent
  // axes and different history depths, which made them unreadable together).
  PERFORMANCE_CHART_DEFINITION,

  // Trading Activity (Combo has deals like DCA + minigrids)
  { type: 'drawer-deals-table' },
  { type: 'drawer-minigrids-table' },
  { type: 'drawer-balance-info' },
  { type: 'drawer-orders-table' },

  // Analytics & History
  BOT_EVENTS_DEFINITION,
  { type: 'drawer-backtest-results' },

  // Configuration
  { type: 'drawer-webhook-info' },
  ADDITIONAL_DETAILS_DEFINITION,

  // DCA Analysis (projection + deal-level usage) — always shown for combo
  // bots, which always run a DCA leg.
  { type: 'drawer-risk-metrics' },
];

const DCA_LAYOUT: LayoutDefinition[] = [
  // General Information at the top
  GENERAL_INFO_DEFINITION,

  { type: 'drawer-profit-tabs' },
  // Performance = equity/realized-profit panel + deal-returns panel, one
  // widget on a shared time axis (they were two widgets with independent
  // axes and different history depths, which made them unreadable together).
  PERFORMANCE_CHART_DEFINITION,
  { type: 'drawer-deals-table' },
  { type: 'drawer-balance-info' },
  { type: 'drawer-orders-table' },
  BOT_EVENTS_DEFINITION,
  { type: 'drawer-webhook-info' },
  { type: 'drawer-backtest-results' },
  ADDITIONAL_DETAILS_DEFINITION,
  {
    type: 'drawer-risk-metrics',
    when: (bot) => ('useDca' in bot.settings ? bot.settings?.useDca : false),
  },
];

const HEDGE_DCA_LAYOUT: LayoutDefinition[] = [
  // General Information at the top
  GENERAL_INFO_DEFINITION,

  // Profit & Performance
  { type: 'drawer-profit-tabs' },
  //{ type: 'drawer-hedge-pnl' },
  // Performance = equity/realized-profit panel + deal-returns panel, one
  // widget on a shared time axis (they were two widgets with independent
  // axes and different history depths, which made them unreadable together).
  PERFORMANCE_CHART_DEFINITION,

  // Trading Activity
  // Deals table now aggregates child bot deals (long/short legs)
  { type: 'drawer-deals-table' },
  { type: 'drawer-balance-info' },
  { type: 'drawer-orders-table' },

  // Analytics & History
  BOT_EVENTS_DEFINITION,
  { type: 'drawer-backtest-results' },

  // Configuration
  { type: 'drawer-webhook-info' },
  ADDITIONAL_DETAILS_DEFINITION,
];

const HEDGE_COMBO_LAYOUT: LayoutDefinition[] = [
  // General Information at the top
  GENERAL_INFO_DEFINITION,

  // Profit & Performance
  { type: 'drawer-profit-tabs' },
  //{ type: 'drawer-hedge-pnl' },
  // Performance = equity/realized-profit panel + deal-returns panel, one
  // widget on a shared time axis (they were two widgets with independent
  // axes and different history depths, which made them unreadable together).
  PERFORMANCE_CHART_DEFINITION,

  // Trading Activity (Hedge Combo has minigrids)
  // Deals table now aggregates child bot deals (long/short legs)
  { type: 'drawer-deals-table' },
  { type: 'drawer-minigrids-table' },
  { type: 'drawer-balance-info' },
  { type: 'drawer-orders-table' },

  // Analytics & History
  BOT_EVENTS_DEFINITION,
  { type: 'drawer-backtest-results' },

  // Configuration
  { type: 'drawer-webhook-info' },
  ADDITIONAL_DETAILS_DEFINITION,
];

const UNSUPPORTED_LAYOUT: LayoutDefinition[] = [
  createPlaceholderDefinition(
    'Drawer widgets for this bot type are not available yet.'
  ),
];

const buildWidgets = (
  layout: LayoutDefinition[],
  bot: DrawerBot
): DrawerWidget[] => {
  const widgets: DrawerWidget[] = [];

  for (const definition of layout) {
    if (definition.when && !definition.when(bot)) {
      continue;
    }

    const props = definition.buildProps?.(bot);

    if (definition.requireData && props === undefined) {
      const fallbackDefinition =
        typeof definition.fallback === 'function'
          ? definition.fallback(bot)
          : definition.fallback;

      if (fallbackDefinition) {
        widgets.push(...buildWidgets([fallbackDefinition], bot));
      }
      continue;
    }

    widgets.push(
      props
        ? { type: definition.type, botId: bot.id, props }
        : { type: definition.type, botId: bot.id }
    );
  }

  return widgets;
};

const builders: Partial<Record<DrawerBotType, DrawerWidgetBuilder>> = {
  dca: (bot) => buildWidgets(DCA_LAYOUT, bot),
  terminal: (bot) => buildWidgets(DCA_LAYOUT, bot),
  grid: (bot) => buildWidgets(GRID_LAYOUT, bot),
  combo: (bot) => buildWidgets(COMBO_LAYOUT, bot),
  hedgeDca: (bot) => buildWidgets(HEDGE_DCA_LAYOUT, bot),
  hedgeCombo: (bot) => buildWidgets(HEDGE_COMBO_LAYOUT, bot),
  signal: (bot) => buildWidgets(UNSUPPORTED_LAYOUT, bot),
};

export const getDrawerWidgetsForBot = (bot: DrawerBot): DrawerWidget[] => {
  const builder = builders[bot.type];
  if (builder) {
    return builder(bot);
  }
  return buildWidgets(UNSUPPORTED_LAYOUT, bot);
};
