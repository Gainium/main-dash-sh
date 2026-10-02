import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Bot form backtest actions — lets a host build offer other ways to backtest
// the form, next to the footer's Backtest button, and add its own runs to the
// form's Backtests panel. Unregistered (the default) ⇒ the footer and the
// panel are exactly as before.
//
//   registerBotFormBacktestAction({ key, useAction: (ctx) => … });
//   registerBotBacktestPanelSection({ key, useSection: (ctx) => … });

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

// ---------------------------------------------------------------------
// Backtests panel sections
// ---------------------------------------------------------------------

export interface BotBacktestPanelContext {
  mode: 'create' | 'edit';
  /** 'dca' | 'combo' | 'grid' */
  botType: string;
  botId?: string | undefined;
}

export interface BotBacktestPanelSectionView {
  /** Added to the Backtests tab's count. */
  count: number;
  /** Rendered above the backtests table. */
  content: ReactNode;
}

export interface BotBacktestPanelSection {
  key: string;
  /** A React hook (registration order fixed at boot). Null = nothing. */
  useSection: (
    ctx: BotBacktestPanelContext
  ) => BotBacktestPanelSectionView | null;
}

const sections: BotBacktestPanelSection[] = [];

export function registerBotBacktestPanelSection(
  section: BotBacktestPanelSection
): void {
  const index = sections.findIndex((s) => s.key === section.key);
  if (index >= 0) sections[index] = section;
  else sections.push(section);
}

export function useBotBacktestPanelSections(
  ctx: BotBacktestPanelContext
): (BotBacktestPanelSectionView & { key: string })[] {
  const out: (BotBacktestPanelSectionView & { key: string })[] = [];
  for (const section of sections) {
    const view = section.useSection(ctx);
    if (view) out.push({ ...view, key: section.key });
  }
  return out;
}
