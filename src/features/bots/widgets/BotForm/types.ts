import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

import type { PanelMenuConfig } from '@/components/bots/panels/PanelContainer';
import type { WidgetMenuActions } from '@/components/widgets/WidgetWrapper';
import type {
  BotFormFeatureFlags,
  BotFormMode,
  BotFormTabId,
  BotFormUpdateValue,
  Fields,
} from '@/contexts/bots/form/BotFormProvider';
import type { RefreshBalancesResult } from '@/hooks/bots/base/useBotFormMutations';
import type {
  BotChartData,
  ComboBot,
  DCABot,
  ExchangeInUser,
} from '@/types';
import type { BotFormData, BotFormErrors } from '@/types/bots/form';

export type GetBalanceFn = (
  exchangeUUID: string,
  asset: string,
  type?: string
) => number | null | undefined;

export interface BotFormProps {
  widgetId?: string;
  isEditable?: boolean;
  mode?: BotFormMode;
  botId?: string;
  defaultTab?: BotFormTabId;
  variant?: 'widget' | 'panel' | 'mobile';
  /**
   * When true, the form will not render its own sticky section navigation header.
   * Useful when the form is rendered inside a parent layout that provides its own tab navigation.
   */
  hideSectionNavigation?: boolean;
  /**
   * When true, the form's primary submit button (the one in the footer) is
   * forced into a disabled state and the click handler is short-circuited.
   * Used by the hedge edit layout where each leg is a full BotFormWidget but
   * saving has to go through the unified hedge mutation in the outer
   * HedgeBotEditLayout — the per-leg footer button must not save standalone.
   */
  forceSubmitDisabled?: boolean;
  /**
   * When true, the form's entire footer (save / backtest / templates / status
   * toggle / credits) is not rendered. Used by the hedge edit layout which
   * provides its own unified footer covering both legs.
   */
  hideFooter?: boolean;
  /**
   * Pre-fetched bot to seed `useBotFormInitialization`. The standard flow
   * fetches the bot via `useBotFormQuery` keyed by `botId`, but hedge legs
   * live nested inside a parent `HedgeBot` and aren't reachable that way —
   * the hedge layout already has each leg's full bot object and passes it
   * through here so the leg's BotFormShell can finish loading instead of
   * being stuck on "Loading bot configuration…".
   */
  initialBot?: DCABot | ComboBot | null;
  /**
   * Override applied to the form's BotFormFooter. Used by the hedge edit
   * layout so each leg's BotFormShell still renders the standard footer UI
   * (look & feel, credits widget, layout) but the Save/Backtest buttons
   * trigger the unified hedge handlers in the parent layout. Whatever isn't
   * provided falls back to the leg's own internal handlers.
   */
  footerOverride?: {
    onSubmit?: () => void | Promise<void>;
    submitLabel?: string;
    submitDisabled?: boolean;
    submitIsPending?: boolean;
    onBacktest?: (
      formData?: BotFormData,
      cfg?: Partial<
        import('./components/BacktestSettingsDialog').BacktestConfig
      >
    ) => void;
    /** Direct run hook (footer's big Backtest button, skips dialog).
     *  Used by hedge bots so the quick-run path hits the hedge runner
     *  instead of falling back to the leg's local DCA backtest. */
    onRunBacktestDirect?: (
      cfg: import('./components/BacktestSettingsDialog').BacktestConfig
    ) => void | Promise<void>;
    /** Live progress payload for the footer's inline progress bar.
     *  Hedge wires this from `useHedgeBacktestRunner.progress`. */
    backtestProgress?: import('@/types').BacktestProgress | null;
    /** Cancel hook for the inline progress bar. */
    onCancelBacktest?: () => void;
    backtestPending?: boolean;
    /** Headline numbers for the footer's "VIEW RESULTS" done-state chip.
     *  When null/undefined the footer shows the run controls instead. */
    backtestSummary?: {
      netPerc: number;
      winRate: number;
      deals: number;
    } | null;
    /** Open the full-screen results modal from the done-state chip. */
    onViewResults?: () => void;
    /** Dismiss the done-state chip and restore the backtest run controls. */
    onDismissResults?: () => void;
    showCredits?: boolean;
    /** Hide the "Save as preset" templates menu. Used for hedge bots. */
    hideTemplates?: boolean;
    /** Multiplier applied to the credits readout. Hedge bots set 2 so the
     *  cost reflects long + short legs running together. */
    creditsMultiplier?: number;
    /** Override the start/stop button. Used by the hedge layout so the
     *  toggle calls `changeStatus` with the hedge bot id + hedge type
     *  rather than the leg's id + leg type. The argument is the broader
     *  `ToggleStatusPayload` shape from BotFormFooter; we keep this loose
     *  to avoid pulling in the shared type via a circular import. */
    onToggleStatus?: (payload: {
      nextStatus: string;
      closeType?: string;
      buyType?: string;
      buyCount?: string;
      buyAmount?: number;
      cancelPartiallyFilled?: boolean;
      closeGridType?: string;
    }) => void;
    toggleDisabled?: boolean;
    togglePending?: boolean;
    /** Status the start/stop button reads from to decide whether to show
     *  "Start" or "Stop". For hedge bots this is the hedge wrapper's
     *  status, not either leg's. */
    botStatus?: string | null;
    /** Number of currently-active deals. The footer opens its built-in
     *  stop-confirmation dialog (with "Cancel / Leave / Close by limit /
     *  Close by market" options) when stopping while > 0. Without an
     *  override the footer reads this off `bot.dealsInBot.active`, which
     *  for a hedge points at the leg's own counter — but a hedge stop
     *  applies to *both* legs, so the layout passes the summed count. */
    activeDeals?: number;
    /** Replace the footer's overflow (⋮) menu items. The leg's own menu is
     *  leg-scoped (import/export/reset of a single leg); the hedge layout
     *  supplies hedge-level items (import/export both legs + shared, reset
     *  the whole hedge, save/load hedge templates) here instead. When
     *  provided (including `null`) it wins over the leg's computed menu. */
    menuConfig?: PanelMenuConfig | null;
  };
  onCollapse?: () => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  data?: { botId?: string; mode?: BotFormMode; [key: string]: unknown };
  settings?: Record<string, unknown>;
  onSubmitSuccess?: (result: {
    botId: string;
    action: 'created' | 'updated';
    payload: unknown;
  }) => void;
  debug?: boolean;
  onPanelMenuChange?: (menu: PanelMenuConfig | null) => void;
  onFormDataChange?: (data: BotChartData) => void;
  /**
   * Handler invoked when user clicks the Backtest button from the form footer.
   * Receives the current form data, plus the period/timeframe the footer's
   * backtest bar is showing when the full settings dialog is opened.
   */
  onBacktest?: (
    formData?: BotFormData,
    cfg?: Partial<import('./components/BacktestSettingsDialog').BacktestConfig>
  ) => void;
  /**
   * Handler invoked after a backtest finishes and is persisted successfully.
   * Receives the ID of the newly saved backtest so the parent can auto-select it.
   */
  onBacktestComplete?: (backtestId: string) => void;
  terminal: boolean;
  tabDescriptorsFilter?: (tab: BotFormTabDescriptor) => boolean;
}

export interface BotFormTabComponentProps {
  currentExchange: ExchangeInUser | null;
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  errors: BotFormErrors;
  mode: BotFormMode;
  isFieldLocked: (field: Fields) => boolean;
  getBalance?: GetBalanceFn;
  bot?: unknown;
  handleUpdateBalances?: () =>
    | Promise<RefreshBalancesResult>
    | RefreshBalancesResult;
  exchangesData?: ExchangeInUser[];
  exchangesLoading?: boolean;
  activeTab: BotFormTabId;
  onTabChange: (tabId: BotFormTabId) => void;
  features?: BotFormFeatureFlags;
}

export interface BotFormTabNavigationTarget {
  id: BotFormTabId;
  label?: string;
  variant?: 'default' | 'outline';
}

export interface BotFormTabNavigationConfig {
  currentLabel?: string;
  previous?: BotFormTabNavigationTarget;
  next?: BotFormTabNavigationTarget;
}

export type BotFormTabBadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline';

export interface BotFormTabBadge {
  label: string;
  variant?: BotFormTabBadgeVariant;
}

export type BotFormTabBadgeResolver = (
  errors: Record<string, string>
) => BotFormTabBadge | undefined;

export interface BotFormTabDescriptor {
  id: BotFormTabId;
  label: string;
  icon: LucideIcon;
  Component: ComponentType<BotFormTabComponentProps>;
  description?: string;
  tooltipText?: string;
  tooltipUrl?: string;
  featureFlag?: keyof BotFormFeatureFlags | string;
  navigation?: BotFormTabNavigationConfig;
  badge?: BotFormTabBadgeResolver;
  isTerminal?: boolean;
  isDca?: boolean;
}
