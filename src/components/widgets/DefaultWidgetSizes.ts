/**
 * DefaultWidgetSizes - Manages default widget sizes per breakpoint
 *
 * This component provides responsive widget sizing that adapts to different screen sizes
 * while maintaining optimal layout and usability across all breakpoints.
 *
 * NEW ORGANIZATION: This file is now organized per breakpoint, with widget sizes and
 * default availability defined within each breakpoint section.
 */

export interface WidgetSize {
  w: number; // Width in grid units
  h: number; // Height in grid units
}

export interface ResponsiveWidgetSize {
  lg: WidgetSize; // Desktop: 1200px+, 12 columns
  md: WidgetSize; // Tablet: 996px+, 12 columns
  sm: WidgetSize; // Small tablet: 768px+, 12 columns
  xs: WidgetSize; // Mobile: 480px+, 12 columns
  xxs: WidgetSize; // Small mobile: 0px+, 12 columns
}

export interface DefaultWidgetSizesConfig {
  [widgetType: string]: ResponsiveWidgetSize;
}

/**
 * Configuration for default enabled widgets and their order per breakpoint
 * This defines which widgets should be added when the "Default Layout" button is pressed
 */
export interface DefaultLayoutWidgetConfig {
  type: string;
  title?: string; // Optional custom title, will use widget metadata title if not provided
}

export interface DefaultLayoutConfig {
  lg: DefaultLayoutWidgetConfig[]; // Desktop: 1200px+, 12 columns
  md: DefaultLayoutWidgetConfig[]; // Tablet: 996px+, 12 columns
  sm: DefaultLayoutWidgetConfig[]; // Small tablet: 768px+, 12 columns
  xs: DefaultLayoutWidgetConfig[]; // Mobile: 480px+, 12 columns
  xxs: DefaultLayoutWidgetConfig[]; // Small mobile: 0px+, 12 columns
}

/**
 * Breakpoint configuration interface
 * Contains both widget sizes and default enabled widgets for each breakpoint
 */
export interface BreakpointConfig {
  widgetSizes: { [widgetType: string]: WidgetSize };
  defaultDashboardWidgets: DefaultLayoutWidgetConfig[];
  defaultTradingWidgets: DefaultLayoutWidgetConfig[];
}

export interface BreakpointConfigurations {
  lg: BreakpointConfig; // Desktop: 1200px+, 12 columns
  md: BreakpointConfig; // Tablet: 996px+, 12 columns
  sm: BreakpointConfig; // Small tablet: 768px+, 12 columns
  xs: BreakpointConfig; // Mobile: 480px+, 12 columns
  xxs: BreakpointConfig; // Small mobile: 0px+, 12 columns
}

/**
 * Organized configuration per breakpoint
 * Each breakpoint defines widget sizes and which widgets are available by default
 */
export const BREAKPOINT_CONFIGURATIONS: BreakpointConfigurations = {
  // Desktop (lg): 1200px+, 12 columns - Full featured layout
  lg: {
    widgetSizes: {
      // Dashboard widgets
      'portfolio-value': { w: 6, h: 7 },
      profit: { w: 6, h: 7 },
      'accumulated-profit': { w: 6, h: 7 },
      'bot-status': { w: 6, h: 7 },
      'bot-stats-advanced': { w: 8, h: 8 },
      'latest-orders': { w: 6, h: 7 },
      screener: { w: 6, h: 7 },
      'portfolio-allocation': { w: 6, h: 7 },
      'portfolio-balances': { w: 6, h: 7 },
      'portfolio-categories-analysis': { w: 6, h: 7 },
      'portfolio-market-cap-analysis': { w: 6, h: 7 },
      'portfolio-performance-analysis': { w: 6, h: 7 },
      'portfolio-exchange-distribution': { w: 6, h: 7 },
      'coin-chart': { w: 6, h: 7 },
      'marketcap-prices': { w: 6, h: 7 },
      // New: Fear & Greed Index
      'fear-greed-index': { w: 4, h: 6 },
      // New: Technical Indicator Heatmap
      'indicator-heatmap-market': { w: 6, h: 7 },
      'indicator-heatmap-portfolio': { w: 6, h: 7 },
      'technical-indicator-heatmap': { w: 6, h: 7 },
      // New: Notes widget
      notes: { w: 6, h: 7 },
      // New: News RSS widget
      'news-rss': { w: 6, h: 7 },
      // New: Overview Quick Actions widget
      'overview-quick-actions': { w: 2, h: 3 },

      // Bot widgets
      'bot-overview': { w: 6, h: 6 },
      'bot-performance': { w: 6, h: 6 },
      'edit-bot-profit': { w: 6, h: 6 },
      'edit-bot': { w: 6, h: 8 },
      'edit-bot-events': { w: 6, h: 6 },
      'edit-bot-performance': { w: 6, h: 6 },
      'profit-chart': { w: 6, h: 6 },
      'ai-bot-assistant': { w: 4, h: 6 },
      'deal-history': { w: 10, h: 7 },
      'example-orders': { w: 10, h: 8 },
      'grid-bot-data': { w: 12, h: 10 },

      // Trading terminal widgets
      'trading-chart': { w: 8, h: 8 },
      'order-book': { w: 4, h: 6 },
      'trading-panel': { w: 4, h: 6 },
      'market-depth': { w: 6, h: 4 },
      watchlist: { w: 6, h: 8 },
      'open-orders': { w: 6, h: 8 },
      'create-deal': { w: 4, h: 8 },
      favorites: { w: 4, h: 3 },
      backtests: { w: 12, h: 8 },
      'bot-chart': { w: 8, h: 8 },
      'create-bot': { w: 4, h: 8 },
    },
    defaultDashboardWidgets: [
      { type: 'portfolio-value', title: 'Portfolio Value' },
      { type: 'profit', title: 'Profit over time' },
      { type: 'bot-status', title: 'Overview' },
      { type: 'bot-stats-advanced', title: 'Bot Stats' },
      { type: 'accumulated-profit', title: 'Accumulated Profit' },
      { type: 'portfolio-allocation', title: 'Portfolio Allocation' },
      { type: 'portfolio-balances', title: 'Portfolio Balances' },
      { type: 'latest-orders', title: 'Latest Orders' },
      { type: 'screener', title: 'Screener' },
      // New default
      { type: 'fear-greed-index', title: 'Fear & Greed' },
      { type: 'indicator-heatmap-market', title: 'Indicators: Market' },
      { type: 'indicator-heatmap-portfolio', title: 'Indicators: Portfolio' },
    ],
    defaultTradingWidgets: [
      { type: 'trading-chart', title: 'Trading Chart' },
      { type: 'create-deal', title: 'Create Deal' },
      { type: 'open-orders', title: 'Open Orders' },
      { type: 'watchlist', title: 'Watchlist' },
    ],
  },

  // Tablet (md): 996px+, 12 columns - Reduced widgets, prioritize most important
  md: {
    widgetSizes: {
      // Dashboard widgets
      'portfolio-value': { w: 6, h: 8 },
      profit: { w: 6, h: 8 },
      'accumulated-profit': { w: 6, h: 8 },
      'bot-status': { w: 6, h: 7 },
      'bot-stats-advanced': { w: 12, h: 8 },
      'latest-orders': { w: 6, h: 7 },
      screener: { w: 6, h: 7 },
      'portfolio-allocation': { w: 6, h: 7 },
      'portfolio-balances': { w: 6, h: 7 },
      'portfolio-categories-analysis': { w: 6, h: 7 },
      'portfolio-market-cap-analysis': { w: 6, h: 7 },
      'portfolio-performance-analysis': { w: 6, h: 7 },
      'portfolio-exchange-distribution': { w: 6, h: 7 },
      'coin-chart': { w: 6, h: 7 },
      'marketcap-prices': { w: 6, h: 7 },
      // New: Fear & Greed Index
      'fear-greed-index': { w: 4, h: 6 },
      // New: Technical Indicator Heatmap
      'technical-indicator-heatmap': { w: 6, h: 7 },
      // New: Notes widget
      notes: { w: 6, h: 7 },
      // New: News RSS widget
      'news-rss': { w: 6, h: 7 },
      // New: Overview Quick Actions widget
      'overview-quick-actions': { w: 3, h: 3 },

      // Bot widgets
      'bot-overview': { w: 6, h: 7 },
      'bot-performance': { w: 6, h: 7 },
      'edit-bot-profit': { w: 6, h: 7 },
      'edit-bot': { w: 6, h: 8 },
      'edit-bot-events': { w: 6, h: 7 },
      'edit-bot-performance': { w: 6, h: 7 },
      'profit-chart': { w: 6, h: 7 },
      'ai-bot-assistant': { w: 4, h: 7 },
      'deal-history': { w: 12, h: 7 },
      'example-orders': { w: 12, h: 8 },
      'grid-bot-data': { w: 12, h: 11 },

      // Trading terminal widgets
      'trading-chart': { w: 10, h: 8 },
      'order-book': { w: 5, h: 6 },
      'trading-panel': { w: 5, h: 6 },
      'market-depth': { w: 5, h: 4 },
      watchlist: { w: 5, h: 7 },
      'open-orders': { w: 10, h: 7 },
      'create-deal': { w: 5, h: 7 },
      favorites: { w: 5, h: 3 },
      backtests: { w: 12, h: 8 },
      'bot-chart': { w: 8, h: 7 },
      'create-bot': { w: 5, h: 7 },
    },
    defaultDashboardWidgets: [
      { type: 'portfolio-value', title: 'Portfolio Value' },
      { type: 'profit', title: 'Profit over time' },
      { type: 'bot-status', title: 'Overview' },
      { type: 'bot-stats-advanced', title: 'Bot Stats' },
      { type: 'accumulated-profit', title: 'Accumulated Profit' },
      { type: 'portfolio-allocation', title: 'Portfolio Allocation' },
      { type: 'portfolio-balances', title: 'Portfolio Balances' },
      { type: 'latest-orders', title: 'Latest Orders' },
      // New default
      { type: 'fear-greed-index', title: 'Fear & Greed' },
    ],
    defaultTradingWidgets: [
      { type: 'trading-chart', title: 'Trading Chart' },
      { type: 'create-deal', title: 'Create Deal' },
      { type: 'open-orders', title: 'Open Orders' },
    ],
  },

  // Small Tablet (sm): 768px+, 12 columns - Core widgets only
  sm: {
    widgetSizes: {
      // Dashboard widgets
      'portfolio-value': { w: 6, h: 9 },
      profit: { w: 6, h: 9 },
      'accumulated-profit': { w: 6, h: 8 },
      'bot-status': { w: 6, h: 7 },
      'bot-stats-advanced': { w: 12, h: 9 },
      'latest-orders': { w: 6, h: 7 },
      screener: { w: 6, h: 7 },
      'portfolio-allocation': { w: 6, h: 7 },
      'portfolio-balances': { w: 6, h: 7 },
      'portfolio-categories-analysis': { w: 6, h: 7 },
      'portfolio-market-cap-analysis': { w: 6, h: 7 },
      'portfolio-performance-analysis': { w: 6, h: 7 },
      'portfolio-exchange-distribution': { w: 6, h: 7 },
      'coin-chart': { w: 6, h: 7 },
      'marketcap-prices': { w: 6, h: 7 },
      // New: Fear & Greed Index
      'fear-greed-index': { w: 6, h: 7 },
      // New: Technical Indicator Heatmap
      'technical-indicator-heatmap': { w: 6, h: 7 },
      // New: Notes widget
      notes: { w: 6, h: 7 },
      // New: News RSS widget
      'news-rss': { w: 6, h: 7 },
      // New: Overview Quick Actions widget
      'overview-quick-actions': { w: 4, h: 3 },

      // Bot widgets
      'bot-overview': { w: 6, h: 8 },
      'bot-performance': { w: 6, h: 8 },
      'edit-bot-profit': { w: 6, h: 8 },
      'edit-bot': { w: 6, h: 8 },
      'edit-bot-events': { w: 6, h: 8 },
      'edit-bot-performance': { w: 6, h: 8 },
      'profit-chart': { w: 6, h: 8 },
      'ai-bot-assistant': { w: 6, h: 8 },
      'deal-history': { w: 12, h: 7 },
      'example-orders': { w: 12, h: 8 },
      'grid-bot-data': { w: 12, h: 12 },

      // Trading terminal widgets
      'trading-chart': { w: 12, h: 8 },
      'order-book': { w: 12, h: 6 },
      'trading-panel': { w: 12, h: 6 },
      'market-depth': { w: 12, h: 4 },
      watchlist: { w: 12, h: 8 },
      'open-orders': { w: 12, h: 8 },
      'create-deal': { w: 12, h: 7 },
      favorites: { w: 12, h: 3 },
      backtests: { w: 12, h: 8 },
      'bot-chart': { w: 12, h: 8 },
      'create-bot': { w: 12, h: 7 },
    },
    defaultDashboardWidgets: [
      { type: 'portfolio-value', title: 'Portfolio Value' },
      { type: 'profit', title: 'Profit over time' },
      { type: 'bot-status', title: 'Overview' },
      { type: 'bot-stats-advanced', title: 'Bot Stats' },
      { type: 'accumulated-profit', title: 'Accumulated Profit' },
      { type: 'portfolio-allocation', title: 'Portfolio Allocation' },
      { type: 'portfolio-balances', title: 'Portfolio Balances' },
      { type: 'latest-orders', title: 'Latest Orders' },
      // New default
      { type: 'fear-greed-index', title: 'Fear & Greed' },
    ],
    defaultTradingWidgets: [{ type: 'trading-chart', title: 'Trading Chart' }],
  },

  // Mobile (xs)
  xs: {
    widgetSizes: {
      'portfolio-value': { w: 12, h: 9 },
      profit: { w: 12, h: 9 },
      'accumulated-profit': { w: 12, h: 8 },
      'bot-status': { w: 12, h: 7 },
      'bot-stats-advanced': { w: 12, h: 9 },
      'latest-orders': { w: 12, h: 7 },
      screener: { w: 12, h: 7 },
      'portfolio-allocation': { w: 12, h: 7 },
      'portfolio-balances': { w: 12, h: 7 },
      'portfolio-categories-analysis': { w: 12, h: 7 },
      'portfolio-market-cap-analysis': { w: 12, h: 7 },
      'portfolio-performance-analysis': { w: 12, h: 7 },
      'portfolio-exchange-distribution': { w: 12, h: 7 },
      'coin-chart': { w: 12, h: 7 },
      'marketcap-prices': { w: 12, h: 7 },
      // New: Fear & Greed Index
      'fear-greed-index': { w: 12, h: 7 },
      // New: Technical Indicator Heatmap
      'technical-indicator-heatmap': { w: 12, h: 7 },
      // New: Notes widget
      notes: { w: 12, h: 7 },
      // New: News RSS widget
      'news-rss': { w: 12, h: 7 },
      // New: Overview Quick Actions widget
      'overview-quick-actions': { w: 12, h: 3 },

      // Bot widgets
      'bot-overview': { w: 12, h: 6 },
      'bot-performance': { w: 12, h: 8 },
      'edit-bot-profit': { w: 12, h: 8 },
      'edit-bot': { w: 12, h: 8 },
      'edit-bot-events': { w: 12, h: 8 },
      'edit-bot-performance': { w: 12, h: 8 },
      'profit-chart': { w: 12, h: 8 },
      'ai-bot-assistant': { w: 12, h: 8 },
      'deal-history': { w: 12, h: 8 },
      'example-orders': { w: 12, h: 9 },
      'grid-bot-data': { w: 12, h: 14 },

      // Trading terminal widgets
      'trading-chart': { w: 12, h: 9 },
      'order-book': { w: 12, h: 7 },
      'trading-panel': { w: 12, h: 7 },
      'market-depth': { w: 12, h: 5 },
      watchlist: { w: 12, h: 8 },
      'open-orders': { w: 12, h: 8 },
      'create-deal': { w: 12, h: 8 },
      favorites: { w: 12, h: 4 },
      backtests: { w: 12, h: 8 },
      'bot-chart': { w: 12, h: 9 },
      'create-bot': { w: 12, h: 8 },
    },
    defaultDashboardWidgets: [
      { type: 'portfolio-value', title: 'Portfolio Value' },
      { type: 'profit', title: 'Profit over time' },
      { type: 'bot-status', title: 'Overview' },
      { type: 'bot-stats-advanced', title: 'Bot Stats' },
      { type: 'accumulated-profit', title: 'Accumulated Profit' },
      { type: 'portfolio-allocation', title: 'Portfolio Allocation' },
      { type: 'portfolio-balances', title: 'Portfolio Balances' },
      { type: 'latest-orders', title: 'Latest Orders' },
      // New default
      { type: 'fear-greed-index', title: 'Fear & Greed' },
    ],
    defaultTradingWidgets: [{ type: 'trading-chart', title: 'Trading Chart' }],
  },

  // Small mobile (xxs)
  xxs: {
    widgetSizes: {
      'portfolio-value': { w: 12, h: 9 },
      profit: { w: 12, h: 9 },
      'accumulated-profit': { w: 12, h: 8 },
      'bot-status': { w: 12, h: 7 },
      'bot-stats-advanced': { w: 12, h: 9 },
      'latest-orders': { w: 12, h: 7 },
      screener: { w: 12, h: 7 },
      'portfolio-allocation': { w: 12, h: 7 },
      'portfolio-balances': { w: 12, h: 7 },
      'portfolio-categories-analysis': { w: 12, h: 7 },
      'portfolio-market-cap-analysis': { w: 12, h: 7 },
      'portfolio-performance-analysis': { w: 12, h: 7 },
      'portfolio-exchange-distribution': { w: 12, h: 7 },
      'coin-chart': { w: 12, h: 7 },
      'marketcap-prices': { w: 12, h: 7 },
      // New: Fear & Greed Index
      'fear-greed-index': { w: 12, h: 7 },
      // New: Technical Indicator Heatmap
      'technical-indicator-heatmap': { w: 12, h: 7 },
      // New: Notes widget
      notes: { w: 12, h: 7 },
      // New: News RSS widget
      'news-rss': { w: 12, h: 7 },
      // New: Overview Quick Actions widget
      'overview-quick-actions': { w: 12, h: 3 },

      // Bot widgets
      'bot-overview': { w: 12, h: 6 },
      'bot-performance': { w: 12, h: 8 },
      'edit-bot-profit': { w: 12, h: 8 },
      'edit-bot': { w: 12, h: 8 },
      'edit-bot-events': { w: 12, h: 8 },
      'edit-bot-performance': { w: 12, h: 8 },
      'profit-chart': { w: 12, h: 8 },
      'ai-bot-assistant': { w: 12, h: 8 },
      'deal-history': { w: 12, h: 8 },
      'example-orders': { w: 12, h: 9 },
      'grid-bot-data': { w: 12, h: 14 },

      // Trading terminal widgets
      'trading-chart': { w: 12, h: 9 },
      'order-book': { w: 12, h: 7 },
      'trading-panel': { w: 12, h: 7 },
      'market-depth': { w: 12, h: 5 },
      watchlist: { w: 12, h: 8 },
      'open-orders': { w: 12, h: 8 },
      'create-deal': { w: 12, h: 8 },
      favorites: { w: 12, h: 4 },
      backtests: { w: 12, h: 8 },
      'bot-chart': { w: 12, h: 9 },
      'create-bot': { w: 12, h: 8 },
    },
    defaultDashboardWidgets: [
      { type: 'portfolio-value', title: 'Portfolio Value' },
      { type: 'profit', title: 'Profit over time' },
      { type: 'bot-status', title: 'Overview' },
      { type: 'bot-stats-advanced', title: 'Bot Stats' },
      { type: 'accumulated-profit', title: 'Accumulated Profit' },
      { type: 'portfolio-allocation', title: 'Portfolio Allocation' },
      { type: 'portfolio-balances', title: 'Portfolio Balances' },
      { type: 'latest-orders', title: 'Latest Orders' },
      // New default
      { type: 'fear-greed-index', title: 'Fear & Greed' },
    ],
    defaultTradingWidgets: [{ type: 'trading-chart', title: 'Trading Chart' }],
  },
};

/**
 * Legacy compatibility - Default widget sizes configuration per breakpoint
 * Generated from BREAKPOINT_CONFIGURATIONS for backward compatibility
 */
export const DEFAULT_WIDGET_SIZES: DefaultWidgetSizesConfig = {
  // Dashboard widgets
  'portfolio-value': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['portfolio-value'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['portfolio-value'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['portfolio-value'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['portfolio-value'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['portfolio-value'],
  },

  profit: {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['profit'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['profit'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['profit'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['profit'],
    xxs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['profit'],
  },

  'accumulated-profit': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['accumulated-profit'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['accumulated-profit'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['accumulated-profit'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['accumulated-profit'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['accumulated-profit'],
  },

  'bot-status': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['bot-status'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['bot-status'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['bot-status'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['bot-status'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['bot-status'],
  },

  'bot-stats-advanced': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['bot-stats-advanced'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['bot-stats-advanced'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['bot-stats-advanced'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['bot-stats-advanced'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['bot-stats-advanced'],
  },

  'latest-orders': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['latest-orders'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['latest-orders'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['latest-orders'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['latest-orders'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['latest-orders'],
  },

  screener: {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['screener'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['screener'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['screener'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['screener'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['screener'],
  },

  'portfolio-allocation': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['portfolio-allocation'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['portfolio-allocation'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['portfolio-allocation'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['portfolio-allocation'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['portfolio-allocation'],
  },

  'portfolio-balances': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['portfolio-balances'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['portfolio-balances'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['portfolio-balances'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['portfolio-balances'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['portfolio-balances'],
  },

  'portfolio-categories-analysis': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes[
      'portfolio-categories-analysis'
    ],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes[
      'portfolio-categories-analysis'
    ],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes[
      'portfolio-categories-analysis'
    ],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes[
      'portfolio-categories-analysis'
    ],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes[
      'portfolio-categories-analysis'
    ],
  },

  'portfolio-market-cap-analysis': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes[
      'portfolio-market-cap-analysis'
    ],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes[
      'portfolio-market-cap-analysis'
    ],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes[
      'portfolio-market-cap-analysis'
    ],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes[
      'portfolio-market-cap-analysis'
    ],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes[
      'portfolio-market-cap-analysis'
    ],
  },

  'portfolio-performance-analysis': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes[
      'portfolio-performance-analysis'
    ],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes[
      'portfolio-performance-analysis'
    ],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes[
      'portfolio-performance-analysis'
    ],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes[
      'portfolio-performance-analysis'
    ],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes[
      'portfolio-performance-analysis'
    ],
  },

  'portfolio-exchange-distribution': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes[
      'portfolio-exchange-distribution'
    ],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes[
      'portfolio-exchange-distribution'
    ],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes[
      'portfolio-exchange-distribution'
    ],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes[
      'portfolio-exchange-distribution'
    ],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes[
      'portfolio-exchange-distribution'
    ],
  },

  'coin-chart': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['coin-chart'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['coin-chart'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['coin-chart'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['coin-chart'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['coin-chart'],
  },

  'marketcap-prices': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['marketcap-prices'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['marketcap-prices'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['marketcap-prices'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['marketcap-prices'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['marketcap-prices'],
  },

  // New Treemap variants
  'treemap-market': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['marketcap-prices'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['marketcap-prices'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['marketcap-prices'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['marketcap-prices'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['marketcap-prices'],
  },

  'treemap-portfolio': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['marketcap-prices'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['marketcap-prices'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['marketcap-prices'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['marketcap-prices'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['marketcap-prices'],
  },

  // New: Fear & Greed Index
  'fear-greed-index': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['fear-greed-index'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['fear-greed-index'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['fear-greed-index'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['fear-greed-index'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['fear-greed-index'],
  },

  // New: Technical Indicator Heatmap
  'technical-indicator-heatmap': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['technical-indicator-heatmap'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['technical-indicator-heatmap'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['technical-indicator-heatmap'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['technical-indicator-heatmap'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes[
      'technical-indicator-heatmap'
    ],
  },

  'indicator-heatmap-market': {
    lg: { w: 6, h: 7 },
    md: { w: 6, h: 7 },
    sm: { w: 6, h: 7 },
    xs: { w: 12, h: 7 },
    xxs: { w: 12, h: 7 },
  },

  'indicator-heatmap-portfolio': {
    lg: { w: 6, h: 7 },
    md: { w: 6, h: 7 },
    sm: { w: 6, h: 7 },
    xs: { w: 12, h: 7 },
    xxs: { w: 12, h: 7 },
  },

  // Cloud-only widgets (registered via slot in cloud overlay).
  // Sizes live here so layout stores can compute defaults without warnings.
  'curated-presets-strip': {
    lg: { w: 12, h: 4 },
    md: { w: 12, h: 4 },
    sm: { w: 12, h: 4 },
    xs: { w: 12, h: 4 },
    xxs: { w: 12, h: 4 },
  },

  'onboarding-steps': {
    lg: { w: 12, h: 3 },
    md: { w: 12, h: 3 },
    sm: { w: 12, h: 3 },
    xs: { w: 12, h: 3 },
    xxs: { w: 12, h: 3 },
  },

  notes: {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['notes'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['notes'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['notes'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['notes'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['notes'],
  },

  'news-rss': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['news-rss'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['news-rss'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['news-rss'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['news-rss'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['news-rss'],
  },

  'overview-quick-actions': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['overview-quick-actions'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['overview-quick-actions'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['overview-quick-actions'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['overview-quick-actions'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['overview-quick-actions'],
  },

  // Bot widgets
  'bot-overview': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['bot-overview'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['bot-overview'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['bot-overview'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['bot-overview'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['bot-overview'],
  },

  'bot-performance': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['bot-performance'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['bot-performance'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['bot-performance'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['bot-performance'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['bot-performance'],
  },

  'edit-bot': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['edit-bot'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['edit-bot'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['edit-bot'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['edit-bot'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['edit-bot'],
  },

  'edit-bot-profit': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['edit-bot-profit'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['edit-bot-profit'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['edit-bot-profit'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['edit-bot-profit'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['edit-bot-profit'],
  },

  'edit-bot-events': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['edit-bot-events'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['edit-bot-events'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['edit-bot-events'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['edit-bot-events'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['edit-bot-events'],
  },

  'edit-bot-performance': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['edit-bot-performance'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['edit-bot-performance'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['edit-bot-performance'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['edit-bot-performance'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['edit-bot-performance'],
  },

  'ai-bot-assistant': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['ai-bot-assistant'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['ai-bot-assistant'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['ai-bot-assistant'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['ai-bot-assistant'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['ai-bot-assistant'],
  },

  'deal-history': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['deal-history'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['deal-history'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['deal-history'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['deal-history'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['deal-history'],
  },

  'example-orders': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['example-orders'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['example-orders'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['example-orders'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['example-orders'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['example-orders'],
  },

  'grid-bot-data': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['grid-bot-data'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['grid-bot-data'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['grid-bot-data'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['grid-bot-data'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['grid-bot-data'],
  },

  // Trading terminal widgets
  'trading-chart': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['trading-chart'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['trading-chart'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['trading-chart'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['trading-chart'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['trading-chart'],
  },

  'order-book': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['order-book'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['order-book'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['order-book'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['order-book'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['order-book'],
  },

  'trading-panel': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['trading-panel'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['trading-panel'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['trading-panel'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['trading-panel'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['trading-panel'],
  },

  'market-depth': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['market-depth'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['market-depth'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['market-depth'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['market-depth'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['market-depth'],
  },

  watchlist: {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['watchlist'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['watchlist'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['watchlist'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['watchlist'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['watchlist'],
  },

  'open-orders': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['open-orders'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['open-orders'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['open-orders'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['open-orders'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['open-orders'],
  },

  'create-deal': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['create-deal'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['create-deal'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['create-deal'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['create-deal'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['create-deal'],
  },

  favorites: {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['favorites'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['favorites'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['favorites'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['favorites'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['favorites'],
  },

  backtests: {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['backtests'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['backtests'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['backtests'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['backtests'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['backtests'],
  },

  'bot-chart': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['bot-chart'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['bot-chart'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['bot-chart'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['bot-chart'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['bot-chart'],
  },

  'create-bot': {
    lg: BREAKPOINT_CONFIGURATIONS.lg.widgetSizes['create-bot'],
    md: BREAKPOINT_CONFIGURATIONS.md.widgetSizes['create-bot'],
    sm: BREAKPOINT_CONFIGURATIONS.sm.widgetSizes['create-bot'],
    xs: BREAKPOINT_CONFIGURATIONS.xs.widgetSizes['create-bot'],
    xxs: BREAKPOINT_CONFIGURATIONS.xxs.widgetSizes['create-bot'],
  },

  // Drawer widgets (used in bot details drawer)
  'bot-orders': {
    lg: { w: 12, h: 6 },
    md: { w: 12, h: 6 },
    sm: { w: 12, h: 6 },
    xs: { w: 12, h: 7 },
    xxs: { w: 12, h: 8 },
  },

  'bot-events': {
    lg: { w: 12, h: 5 },
    md: { w: 12, h: 5 },
    sm: { w: 12, h: 6 },
    xs: { w: 12, h: 6 },
    xxs: { w: 12, h: 7 },
  },
};

/**
 * Legacy compatibility - Default enabled widgets configuration per breakpoint for dashboard
 * Generated from BREAKPOINT_CONFIGURATIONS for backward compatibility
 */
export const DEFAULT_LAYOUT_WIDGETS: DefaultLayoutConfig = {
  lg: BREAKPOINT_CONFIGURATIONS.lg.defaultDashboardWidgets,
  md: BREAKPOINT_CONFIGURATIONS.md.defaultDashboardWidgets,
  sm: BREAKPOINT_CONFIGURATIONS.sm.defaultDashboardWidgets,
  xs: BREAKPOINT_CONFIGURATIONS.xs.defaultDashboardWidgets,
  xxs: BREAKPOINT_CONFIGURATIONS.xxs.defaultDashboardWidgets,
};

/**
 * Legacy compatibility - Default enabled widgets configuration per breakpoint for trading terminal
 * Generated from BREAKPOINT_CONFIGURATIONS for backward compatibility
 */
export const DEFAULT_TRADING_LAYOUT_WIDGETS: DefaultLayoutConfig = {
  lg: BREAKPOINT_CONFIGURATIONS.lg.defaultTradingWidgets,
  md: BREAKPOINT_CONFIGURATIONS.md.defaultTradingWidgets,
  sm: BREAKPOINT_CONFIGURATIONS.sm.defaultTradingWidgets,
  xs: BREAKPOINT_CONFIGURATIONS.xs.defaultTradingWidgets,
  xxs: BREAKPOINT_CONFIGURATIONS.xxs.defaultTradingWidgets,
};

/**
 * Breakpoint names for type safety
 */
export type Breakpoint = keyof ResponsiveWidgetSize;

/**
 * Get default size for a widget type at a specific breakpoint
 *
 * @param widgetType - The type of widget
 * @param breakpoint - The current breakpoint (lg, md, sm, xs, xxs)
 * @returns WidgetSize object with width and height
 */
export function getDefaultWidgetSize(
  widgetType: string,
  breakpoint: Breakpoint = 'lg'
): WidgetSize {
  const widgetSizes = DEFAULT_WIDGET_SIZES[widgetType];

  if (!widgetSizes) {
    console.warn(`Unknown widget type: ${widgetType}. Using fallback size.`);
    return { w: 6, h: 4 }; // Fallback size
  }

  const size = widgetSizes[breakpoint];

  if (!size) {
    console.warn(
      `Widget type "${widgetType}" missing size for breakpoint "${breakpoint}". Using fallback size.`
    );
    return { w: 6, h: 4 }; // Fallback size if breakpoint is missing
  }

  return size;
}

/**
 * Get all sizes for a widget type across all breakpoints
 *
 * @param widgetType - The type of widget
 * @returns ResponsiveWidgetSize object with sizes for all breakpoints
 */
export function getResponsiveWidgetSizes(
  widgetType: string
): ResponsiveWidgetSize {
  const widgetSizes = DEFAULT_WIDGET_SIZES[widgetType];

  if (!widgetSizes) {
    console.warn(`Unknown widget type: ${widgetType}. Using fallback sizes.`);
    return {
      lg: { w: 6, h: 4 },
      md: { w: 5, h: 4 },
      sm: { w: 6, h: 4 },
      xs: { w: 4, h: 4 },
      xxs: { w: 2, h: 4 },
    };
  }

  return widgetSizes;
}

/**
 * Get the current breakpoint based on container width
 *
 * @param width - Container width in pixels
 * @returns Current breakpoint name
 */
export function getCurrentBreakpoint(width: number): Breakpoint {
  if (width >= 1200) return 'lg';
  if (width >= 996) return 'md';
  if (width >= 768) return 'sm';
  if (width >= 480) return 'xs';
  return 'xxs';
}

/**
 * Hook to get responsive widget size based on current container width
 *
 * @param widgetType - The type of widget
 * @param containerWidth - Current container width in pixels
 * @returns WidgetSize for the current breakpoint
 */
export function useResponsiveWidgetSize(
  widgetType: string,
  containerWidth: number
): WidgetSize {
  const breakpoint = getCurrentBreakpoint(containerWidth);
  return getDefaultWidgetSize(widgetType, breakpoint);
}

/**
 * Get default size for backward compatibility (uses lg breakpoint)
 * This maintains compatibility with existing code that expects a single defaultSize
 *
 * @param widgetType - The type of widget
 * @returns WidgetSize object (lg breakpoint size)
 */
export function getCompatibilityDefaultSize(widgetType: string): WidgetSize {
  return getDefaultWidgetSize(widgetType, 'lg');
}

/**
 * Check if a widget should use new default sizes
 * Returns true if the widget doesn't have custom sizes set by the user
 *
 * @param widgetId - The widget ID to check
 * @param getWidgetHasCustomSize - Function to check if widget has custom size
 * @returns boolean indicating if widget should use default sizes
 */
export function shouldUseDefaultSize(
  widgetId: string,
  getWidgetHasCustomSize: (id: string) => boolean
): boolean {
  return !getWidgetHasCustomSize(widgetId);
}

/**
 * Get the appropriate size for a widget (custom or default)
 *
 * @param widgetType - The type of widget
 * @param widgetId - The widget ID
 * @param breakpoint - The current breakpoint
 * @param getWidgetHasCustomSize - Function to check if widget has custom size
 * @param getWidgetCustomSize - Function to get custom size
 * @returns WidgetSize object
 */
export function getWidgetSize(
  widgetType: string,
  widgetId: string,
  breakpoint: Breakpoint = 'lg',
  getWidgetHasCustomSize: (id: string) => boolean,
  getWidgetCustomSize: (id: string) => WidgetSize | undefined
): WidgetSize {
  // If widget has custom size, use it
  if (getWidgetHasCustomSize(widgetId)) {
    const customSize = getWidgetCustomSize(widgetId);
    if (customSize) {
      return customSize;
    }
  }

  // Otherwise use default size for the breakpoint
  return getDefaultWidgetSize(widgetType, breakpoint);
}

/**
 * Get the default widgets configuration for a specific breakpoint
 *
 * @param breakpoint - The current breakpoint (lg, md, sm, xs, xxs)
 * @param registry - The widget registry type ('dashboard' or 'trading')
 * @returns Array of default widget configurations for the breakpoint
 */
export function getDefaultLayoutWidgets(
  breakpoint: Breakpoint = 'lg',
  registry: 'dashboard' | 'trading' = 'dashboard'
): DefaultLayoutWidgetConfig[] {
  const config =
    registry === 'trading'
      ? DEFAULT_TRADING_LAYOUT_WIDGETS
      : DEFAULT_LAYOUT_WIDGETS;
  return config[breakpoint];
}

/**
 * Get the default widgets configuration based on current container width
 *
 * @param containerWidth - Current container width in pixels
 * @param registry - The widget registry type ('dashboard' or 'trading')
 * @returns Array of default widget configurations for the current breakpoint
 */
export function getDefaultLayoutWidgetsByWidth(
  containerWidth: number,
  registry: 'dashboard' | 'trading' = 'dashboard'
): DefaultLayoutWidgetConfig[] {
  const breakpoint = getCurrentBreakpoint(containerWidth);
  return getDefaultLayoutWidgets(breakpoint, registry);
}

/**
 * Check if a widget type is included in the default layout for a specific breakpoint
 *
 * @param widgetType - The type of widget to check
 * @param breakpoint - The breakpoint to check (default: 'lg')
 * @param registry - The widget registry type ('dashboard' or 'trading')
 * @returns boolean indicating if the widget is in the default layout
 */
export function isWidgetInDefaultLayout(
  widgetType: string,
  breakpoint: Breakpoint = 'lg',
  registry: 'dashboard' | 'trading' = 'dashboard'
): boolean {
  const defaultWidgets = getDefaultLayoutWidgets(breakpoint, registry);
  return defaultWidgets.some((widget) => widget.type === widgetType);
}

/**
 * NEW UTILITY FUNCTIONS for working with the new breakpoint-organized structure
 */

/**
 * Get widget size from the new breakpoint configuration
 *
 * @param widgetType - The type of widget
 * @param breakpoint - The current breakpoint (lg, md, sm, xs, xxs)
 * @returns WidgetSize object with width and height
 */
export function getBreakpointWidgetSize(
  widgetType: string,
  breakpoint: Breakpoint = 'lg'
): WidgetSize {
  const breakpointConfig = BREAKPOINT_CONFIGURATIONS[breakpoint];
  const widgetSize = breakpointConfig.widgetSizes[widgetType];

  if (!widgetSize) {
    console.warn(
      `Unknown widget type: ${widgetType} for breakpoint: ${breakpoint}. Using fallback size.`
    );
    return { w: 6, h: 4 }; // Fallback size
  }

  return widgetSize;
}

/**
 * Get all widget sizes for a specific breakpoint
 *
 * @param breakpoint - The current breakpoint (lg, md, sm, xs, xxs)
 * @returns Object containing all widget sizes for the breakpoint
 */
export function getAllWidgetSizesForBreakpoint(breakpoint: Breakpoint = 'lg'): {
  [widgetType: string]: WidgetSize;
} {
  return BREAKPOINT_CONFIGURATIONS[breakpoint].widgetSizes;
}

/**
 * Get default dashboard widgets for a specific breakpoint
 *
 * @param breakpoint - The current breakpoint (lg, md, sm, xs, xxs)
 * @returns Array of default dashboard widget configurations
 */
export function getDefaultDashboardWidgets(
  breakpoint: Breakpoint = 'lg'
): DefaultLayoutWidgetConfig[] {
  return BREAKPOINT_CONFIGURATIONS[breakpoint].defaultDashboardWidgets;
}

/**
 * Get default trading widgets for a specific breakpoint
 *
 * @param breakpoint - The current breakpoint (lg, md, sm, xs, xxs)
 * @returns Array of default trading widget configurations
 */
export function getDefaultTradingWidgets(
  breakpoint: Breakpoint = 'lg'
): DefaultLayoutWidgetConfig[] {
  return BREAKPOINT_CONFIGURATIONS[breakpoint].defaultTradingWidgets;
}

/**
 * Get complete breakpoint configuration
 *
 * @param breakpoint - The current breakpoint (lg, md, sm, xs, xxs)
 * @returns Complete configuration for the breakpoint
 */
export function getBreakpointConfiguration(
  breakpoint: Breakpoint = 'lg'
): BreakpointConfig {
  return BREAKPOINT_CONFIGURATIONS[breakpoint];
}

export default {
  BREAKPOINT_CONFIGURATIONS,
  DEFAULT_WIDGET_SIZES,
  DEFAULT_LAYOUT_WIDGETS,
  DEFAULT_TRADING_LAYOUT_WIDGETS,
  getDefaultWidgetSize,
  getResponsiveWidgetSizes,
  getCurrentBreakpoint,
  useResponsiveWidgetSize,
  getCompatibilityDefaultSize,
  shouldUseDefaultSize,
  getWidgetSize,
  getDefaultLayoutWidgets,
  getDefaultLayoutWidgetsByWidth,
  isWidgetInDefaultLayout,
  // New functions for breakpoint-organized structure
  getBreakpointWidgetSize,
  getAllWidgetSizesForBreakpoint,
  getDefaultDashboardWidgets,
  getDefaultTradingWidgets,
  getBreakpointConfiguration,
};
