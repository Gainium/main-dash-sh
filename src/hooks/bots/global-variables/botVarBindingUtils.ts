import type { BotVars } from '@/types';
import type { VarBindingPath } from './useBotVarBinding';

export const buildBotVars = (
  current: BotVars | null,
  path: VarBindingPath,
  variableId: string
) => {
  const nextPaths = [
    ...(current?.paths ?? []).filter((entry) => entry.path !== path),
    { path, variable: variableId },
  ];
  const nextList = Array.from(
    new Set([
      ...(current?.list ?? []),
      ...nextPaths.map((entry) => entry.variable),
    ])
  );

  return {
    list: nextList,
    paths: nextPaths,
  } satisfies BotVars;
};

export const pruneBotVars = (current: BotVars | null, path: string) => {
  if (!current) {
    return null;
  }

  const nextPaths = current.paths.filter((entry) => entry.path !== path);
  if (nextPaths.length === 0) {
    return null;
  }

  const nextList = Array.from(
    new Set(nextPaths.map((entry) => entry.variable))
  );

  return {
    list: nextList,
    paths: nextPaths,
  } satisfies BotVars;
};

/**
 * `indicator` with every field bound to a global variable (`indicators.<uuid>.<field>`)
 * replaced by that variable's value — what the bot engine evaluates
 * (`replaceBotSettings` in main-app core). Returns the same object when
 * nothing applies, so callers can keep referential equality.
 */
export const resolveIndicatorVars = <T extends { uuid?: string }>(
  indicator: T,
  paths: BotVars['paths'],
  variables: readonly { id: string; value: unknown }[]
): T => {
  if (!indicator.uuid || !paths.length || !variables.length) {
    return indicator;
  }
  const prefix = `indicators.${indicator.uuid}.`;
  let resolved: T | null = null;
  for (const entry of paths) {
    if (!entry.path.startsWith(prefix)) {
      continue;
    }
    const variable = variables.find((v) => v.id === entry.variable);
    if (!variable) {
      continue;
    }
    resolved ??= { ...indicator };
    (resolved as Record<string, unknown>)[entry.path.slice(prefix.length)] =
      variable.value;
  }
  return resolved ?? indicator;
};
