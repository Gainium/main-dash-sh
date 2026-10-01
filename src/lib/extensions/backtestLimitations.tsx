import type { LucideIcon } from 'lucide-react';

// Backtest limitations — settings a bot has turned on that the backtester
// does not simulate (or only partly). Before a DCA / Combo backtest starts,
// the bot form lists the ones that apply in an informational dialog
// (`useBacktestLimitationsGate`). Core ships the built-in rules
// (`features/bots/backtest-limitations/builtinRules.ts`); a host build adds
// its own sources at boot with `registerBacktestLimitationSource`.
// Unregistered ⇒ only the built-in rules apply.

export type BacktestLimitationBotType = 'dca' | 'combo';

/** How far the backtest is from live behaviour for this item. */
export type BacktestLimitationStatus = 'ignored' | 'partial';

/** One line of the dialog. */
export interface BacktestLimitationItem {
  /**
   * Stable id. "Don't remind me again" is remembered per key, so a
   * limitation the user has not dismissed yet still shows.
   */
  key: string;
  label: string;
  /** What the backtest does instead, in one or two sentences. */
  explanation: string;
  status: BacktestLimitationStatus;
}

/** What a run is about to test. */
export interface BacktestLimitationContext {
  botType: BacktestLimitationBotType;
  /** The active bot type's settings, as the form holds them now. */
  settings: Readonly<Record<string, unknown>>;
  /** Saved bot id (edit form), if any. */
  botId?: string | undefined;
  /** The bot the form was loaded from (`?load=`), if any. */
  sourceBotId?: string | undefined;
}

/** A declarative rule: applies when `when(settings)` is true. */
export interface BacktestLimitationRule
  extends Omit<BacktestLimitationItem, 'explanation'> {
  botTypes?: readonly BacktestLimitationBotType[];
  when: (
    settings: Readonly<Record<string, unknown>>,
    ctx: BacktestLimitationContext
  ) => boolean;
  explanation:
    | string
    | ((
        settings: Readonly<Record<string, unknown>>,
        ctx: BacktestLimitationContext
      ) => string);
}

/** Rendering of a source's group in the dialog. */
export interface BacktestLimitationGroupStyle {
  /** Heading above the group's items. */
  title: string;
  /** Optional line under the heading. */
  description?: string;
  /** `accent` renders the group on the AI surface tokens. */
  tone?: 'neutral' | 'accent';
  icon?: LucideIcon;
}

/**
 * A source of limitations. `useEvaluator` is a React hook (called on every
 * render of the bot form, in registration order — register at boot only); it
 * returns a function the gate calls when a run starts, with the settings as
 * they are at that moment. Return null while the data it needs is loading.
 */
export interface BacktestLimitationSource {
  key: string;
  /** Lower first. Built-in rules are 100. */
  order?: number;
  group: BacktestLimitationGroupStyle;
  useEvaluator: (
    ctx: Omit<BacktestLimitationContext, 'settings'>
  ) => ((ctx: BacktestLimitationContext) => BacktestLimitationItem[]) | null;
}

const sources: BacktestLimitationSource[] = [];

/** Register (or replace, by `key`) a limitation source. Call at boot. */
export function registerBacktestLimitationSource(
  source: BacktestLimitationSource
): void {
  const index = sources.findIndex((s) => s.key === source.key);
  if (index >= 0) sources[index] = source;
  else sources.push(source);
  sources.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

export function getBacktestLimitationSources(): readonly BacktestLimitationSource[] {
  return sources;
}

/** Evaluate declarative rules against a run's context. */
export function evaluateBacktestLimitationRules(
  rules: readonly BacktestLimitationRule[],
  ctx: BacktestLimitationContext
): BacktestLimitationItem[] {
  const out: BacktestLimitationItem[] = [];
  for (const rule of rules) {
    if (rule.botTypes && !rule.botTypes.includes(ctx.botType)) continue;
    let applies = false;
    try {
      applies = rule.when(ctx.settings, ctx);
    } catch {
      applies = false;
    }
    if (!applies) continue;
    out.push({
      key: rule.key,
      label: rule.label,
      status: rule.status,
      explanation:
        typeof rule.explanation === 'function'
          ? rule.explanation(ctx.settings, ctx)
          : rule.explanation,
    });
  }
  return out;
}
