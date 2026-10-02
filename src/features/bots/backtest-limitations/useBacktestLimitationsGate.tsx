import { FlaskConical } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  evaluateBacktestLimitationRules,
  getBacktestLimitationSources,
  type BacktestLimitationBotType,
  type BacktestLimitationContext,
  type BacktestLimitationItem,
} from '@/lib/extensions/backtestLimitations';
import {
  BacktestLimitationsDialog,
  type BacktestLimitationGroup,
} from './BacktestLimitationsDialog';
import { BUILTIN_BACKTEST_LIMITATION_RULES } from './builtinRules';
import { dismissLimitations, readDismissedLimitations } from './dismissals';

interface GateOptions {
  /** Anything but 'dca' / 'combo' never shows the dialog. */
  botType: string | undefined;
  botId?: string | undefined;
  sourceBotId?: string | undefined;
  /** The active bot type's settings at the moment a run starts. */
  getSettings: () => Record<string, unknown> | undefined;
}

const BUILTIN_GROUP = {
  title: 'Bot settings',
  tone: 'neutral' as const,
  icon: FlaskConical,
};

function asBotType(t: string | undefined): BacktestLimitationBotType | null {
  return t === 'dca' || t === 'combo' ? t : null;
}

/**
 * Before a DCA / Combo backtest: lists the bot's active settings the
 * backtester does not simulate. `confirm()` resolves true at once when
 * nothing applies (or everything that applies was dismissed with "Don't
 * remind me again"); otherwise it opens the dialog and resolves with the
 * user's choice. Render `dialog` inside the bot form.
 */
export function useBacktestLimitationsGate({
  botType,
  botId,
  sourceBotId,
  getSettings,
}: GateOptions): {
  confirm: () => Promise<boolean>;
  dialog: React.ReactNode;
} {
  const type = asBotType(botType);
  const baseCtx = { botType: type ?? 'dca', botId, sourceBotId };

  // Host sources are hooks; the registry is fixed at boot, so the call
  // order is stable across renders.
  const sources = getBacktestLimitationSources();
  const evaluators = sources.map((source) => ({
    source,
    evaluate: source.useEvaluator(baseCtx),
  }));
  const latest = useRef({ evaluators, type, botId, sourceBotId, getSettings });
  latest.current = { evaluators, type, botId, sourceBotId, getSettings };

  const [groups, setGroups] = useState<BacktestLimitationGroup[] | null>(
    null
  );
  const resolver = useRef<((run: boolean) => void) | null>(null);

  // A gate left pending (form unmounted mid-dialog) must not hang the run.
  useEffect(
    () => () => {
      resolver.current?.(false);
      resolver.current = null;
    },
    []
  );

  const confirm = useCallback((): Promise<boolean> => {
    const cur = latest.current;
    if (!cur.type) return Promise.resolve(true);
    const settings = cur.getSettings();
    if (!settings) return Promise.resolve(true);
    const ctx: BacktestLimitationContext = {
      botType: cur.type,
      settings,
      botId: cur.botId,
      sourceBotId: cur.sourceBotId,
    };
    const dismissed = readDismissedLimitations();
    const keep = (items: BacktestLimitationItem[]) =>
      items.filter((i) => !dismissed.has(i.key));

    const next: BacktestLimitationGroup[] = [];
    const builtin = keep(
      evaluateBacktestLimitationRules(BUILTIN_BACKTEST_LIMITATION_RULES, ctx)
    );
    const hosts = cur.evaluators.map(({ source, evaluate }) => {
      let items: BacktestLimitationItem[] = [];
      try {
        items = evaluate ? keep(evaluate(ctx)) : [];
      } catch {
        items = [];
      }
      return { source, items };
    });
    for (const { source, items } of hosts) {
      if ((source.order ?? 100) < 100 && items.length) {
        next.push({ key: source.key, style: source.group, items });
      }
    }
    if (builtin.length) {
      next.push({ key: 'builtin', style: BUILTIN_GROUP, items: builtin });
    }
    for (const { source, items } of hosts) {
      if ((source.order ?? 100) >= 100 && items.length) {
        next.push({ key: source.key, style: source.group, items });
      }
    }
    if (next.length === 0) return Promise.resolve(true);

    resolver.current?.(false);
    setGroups(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback(
    (run: boolean, dontRemind = false) => {
      if (run && dontRemind && groups) {
        dismissLimitations(groups.flatMap((g) => g.items.map((i) => i.key)));
      }
      setGroups(null);
      const resolve = resolver.current;
      resolver.current = null;
      resolve?.(run);
    },
    [groups]
  );

  const dialog = (
    <BacktestLimitationsDialog
      open={!!groups}
      groups={groups ?? []}
      onRun={(dontRemind) => finish(true, dontRemind)}
      onCancel={() => finish(false)}
      onAction={(action) => {
        finish(false);
        action.onSelect();
      }}
    />
  );

  return { confirm, dialog };
}
