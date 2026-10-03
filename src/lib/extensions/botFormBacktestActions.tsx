import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Bot form backtest actions — lets a host build offer other ways to backtest
// the form, next to the footer's Backtest button. Unregistered (the default)
// ⇒ the footer is exactly as before.
//
//   registerBotFormBacktestAction({ key, useAction: (ctx) => … });

/** The form as Save would send it, at the moment an action runs. */
export interface BotFormBacktestSnapshot {
  mode: 'create' | 'edit';
  botType: string;
  /** Saved bot id (edit form). */
  botId?: string | undefined;
  /** The bot settings in the create shape (pair, exchange, …). */
  settings: Record<string, unknown>;
}

export interface BotFormBacktestActionContext {
  mode: 'create' | 'edit';
  /** The form's own mode ('create', 'edit', 'deal-edit', …). */
  formMode: string;
  botType: string;
  botId?: string | undefined;
  isTerminal: boolean;
}

/** What the footer's backtest box shows when an action is chosen. */
export interface BotFormBacktestActionOptions {
  /** The period picked in the footer (UTC ms), if any. */
  period?: { from: number; to: number } | undefined;
}

/** One action as the footer renders it. */
export interface BotFormBacktestActionView {
  key: string;
  /** Accessible name and tooltip. */
  label: string;
  /** The button text (default: `label`). */
  shortLabel?: string;
  /** Narrow footers show the icon only. */
  icon: LucideIcon;
  /** `getSnapshot` validates the form like Save; null = not runnable
   *  (the form already shows why). */
  onSelect: (
    getSnapshot: () => BotFormBacktestSnapshot | null,
    options: BotFormBacktestActionOptions
  ) => void;
  /**
   * Rendered once inside the bot form (e.g. the dialog the action opens), so
   * it can use the form's own pickers and context.
   */
  element?: ReactNode;
  /**
   * The action's own backtest in progress. The footer's backtest box shows
   * it exactly as it shows a normal backtest (it becomes the progress bar,
   * with Cancel); a normal backtest in progress takes precedence.
   */
  running?: BotFormBacktestActionRunning | null;
  /** The action's backtest just finished: the box's "View results" chip. */
  done?: BotFormBacktestActionDone | null;
}

export interface BotFormBacktestActionRunning {
  /** 0 … 100 */
  progress: number;
  /** What runs, as the progress bar's line. */
  text: string;
  /** More detail, in the line's tooltip. */
  detail?: string;
  onCancel?: () => void;
}

export interface BotFormBacktestActionDone {
  /** The chip's eyebrow (default "Backtest complete"). */
  label?: string;
  /**
   * Net %, win rate %, deals — as a normal backtest's chip. `note` replaces
   * the net / win figures when they are not a result (e.g. no deal closed).
   */
  summary: { netPerc: number; winRate: number; deals: number; note?: string };
  onView: () => void;
  onDismiss: () => void;
}

export interface BotFormBacktestAction {
  key: string;
  /**
   * A React hook, called on every render of the bot form in registration
   * order (register at boot only). Return null to offer nothing.
   */
  useAction: (
    ctx: BotFormBacktestActionContext
  ) => Omit<BotFormBacktestActionView, 'key'> | null;
}

const actions: BotFormBacktestAction[] = [];

/** Register (or replace, by `key`) a backtest action. Call at boot. */
export function registerBotFormBacktestAction(
  action: BotFormBacktestAction
): void {
  const index = actions.findIndex((a) => a.key === action.key);
  if (index >= 0) actions[index] = action;
  else actions.push(action);
}

/** The visible actions for this form (calls every registered hook). */
export function useBotFormBacktestActions(
  ctx: BotFormBacktestActionContext
): BotFormBacktestActionView[] {
  const out: BotFormBacktestActionView[] = [];
  for (const action of actions) {
    const view = action.useAction(ctx);
    if (view) out.push({ ...view, key: action.key });
  }
  return out;
}
