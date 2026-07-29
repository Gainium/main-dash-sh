// Export all drawer components
export { DrawerAdditionalDetails } from './DrawerAdditionalDetails';
export { default as DrawerAssetAllocation } from './DrawerAssetAllocation';
export { default as DrawerBacktestResults } from './DrawerBacktestResults';
export { default as DrawerBalanceInfo } from './DrawerBalanceInfo';
export { default as DrawerBotEvents } from './DrawerBotEvents';
export { default as DrawerBotSettings } from './DrawerBotSettings';
export { DrawerBotSummary } from './DrawerBotSummary';
export { default as DrawerComboOverview } from './DrawerComboOverview';
export { default as DrawerDealsTable } from './DrawerDealsTable';
export { DrawerGeneralInfo } from './DrawerGeneralInfo';
/* export { default as DrawerHedgePnl } from './DrawerHedgePnl'; */
export { DrawerDCAMetrics } from './DrawerDCAMetrics';
export { default as DrawerGridFundsOverview } from './DrawerGridFundsOverview';
export { default as DrawerGridProfitChart } from './DrawerGridProfitChart';
export { default as DrawerMinigridsTable } from './DrawerMinigridsTable';
export { default as DrawerOrdersTable } from './DrawerOrdersTable';
export { default as DrawerPerformanceChart } from './DrawerPerformanceChart';
export { default as DrawerProfitChart } from './DrawerProfitChart';
export { default as DrawerProfitTabs } from './DrawerProfitTabs';
export { default as DrawerUnsupported } from './DrawerUnsupported';
export { default as DrawerWebhookInfo } from './DrawerWebhookInfo';

// Export DrawerSection for use in other drawer components
export { DrawerSection } from './DrawerSection';
export type { DrawerSectionProps } from './DrawerSection';

// Widget type definitions
export type DrawerWidgetType =
  | 'drawer-performance-chart'
  | 'drawer-profit-tabs'
  | 'drawer-asset-allocation'
  | 'drawer-deals-table'
  | 'drawer-minigrids-table'
  //| 'drawer-hedge-pnl'
  | 'drawer-orders-table'
  | 'drawer-profit-chart'
  | 'drawer-grid-funds-overview'
  | 'drawer-grid-profit-chart'
  | 'drawer-risk-metrics'
  | 'drawer-bot-events'
  | 'drawer-webhook-info'
  | 'drawer-balance-info'
  | 'drawer-backtest-results'
  | 'drawer-additional-details'
  | 'drawer-bot-summary'
  | 'drawer-combo-overview'
  | 'drawer-general-info'
  | 'drawer-bot-settings'
  | 'drawer-unsupported';
