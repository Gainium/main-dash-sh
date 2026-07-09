/**
 * Public barrel for the redesigned DCA backtest results modal.
 *
 * Cloud + self-hosted both import from here (e.g. BotForm mounts
 * `<BacktestResultsFullModal />`). Keep this the single entry point for the
 * redesign surface so consumers never reach into individual files.
 */

export {
  BacktestResultsFullModal,
  default as BacktestResultsFullModalDefault,
} from './BacktestResultsFullModal';
export type { BacktestResultsFullModalProps } from './BacktestResultsFullModal';

// Adapter + view-model types — the contract that the modal, tabs, and the
// BotForm integration seam all render against.
export { RedesignOverviewTab } from './tabs/RedesignOverviewTab';
export { RedesignDealsTab } from './tabs/RedesignDealsTab';
export { buildBacktestViewModel } from './viewModel';
export type {
  BacktestViewModel,
  BacktestViewModelMeta,
  DealVM,
  EquityPointVM,
  SafetyLevelVM,
  DealCandleVM,
} from './viewModel';

// Charts + per-deal chart shaping (used by the tabs; re-exported for any
// downstream consumer that wants the same frame).
export { CandleChart, EquityChart } from './charts';
export type {
  PriceLineVM,
  MarkerVM,
  CandleChartProps,
  EquityChartProps,
} from './charts';
export { dealToChart, MARKER_LEGEND } from './dealToChart';

// Per-deal TradingView embed shaping (real candles + buy/sell markers +
// DCA/avg/TP lines) used by the Deals tab.
export {
  dealToTradingView,
  intervalToResolution,
} from './dealToTradingView';
export type { DealTradingViewProps } from './dealToTradingView';
