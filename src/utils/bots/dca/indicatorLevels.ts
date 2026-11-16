import { IndicatorAction } from '@/types';

/**
 * DCA by indicators: the ladder levels (main-app spec 244).
 *
 * A level is one safety order placed when its conditions hold. Its
 * conditions are the `startDca` indicators sharing `dcaLevel`; an indicator
 * without `dcaLevel` (bots saved before per-level conditions) is a level of
 * its own, keyed by its `uuid`. Levels are ordered by the first appearance of
 * their key. The level's size and minimum % live on its anchor: the
 * indicator whose `uuid` is the key, else the level's first indicator.
 *
 * Same rules as main-app (`core/src/bot/dca/indicatorLevels.ts`) and the
 * backtester (`src/dca/strategy/ti/levels.ts`); keep them in step or the
 * projected ladder disagrees with what trades.
 */
type LevelIndicator = {
  uuid: string;
  indicatorAction?: IndicatorAction | string | null;
  dcaLevel?: string | null;
};

export type StartDcaLevel<T extends LevelIndicator> = {
  key: string;
  anchor: T;
  indicators: T[];
};

export const dcaLevelKey = (indicator: LevelIndicator): string =>
  indicator.dcaLevel || indicator.uuid;

export function startDcaLevels<T extends LevelIndicator>(
  indicators: ReadonlyArray<T> | null | undefined
): StartDcaLevel<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, T[]>();
  for (const indicator of indicators ?? []) {
    if (indicator.indicatorAction !== IndicatorAction.startDca) continue;
    const key = dcaLevelKey(indicator);
    let list = byKey.get(key);
    if (!list) {
      list = [];
      byKey.set(key, list);
      order.push(key);
    }
    list.push(indicator);
  }
  return order.map((key) => {
    const list = byKey.get(key) ?? [];
    return {
      key,
      anchor: list.find((i) => i.uuid === key) ?? (list[0] as T),
      indicators: list,
    };
  });
}

/** One indicator per level: the one holding its size and minimum %. */
export const startDcaLevelAnchors = <T extends LevelIndicator>(
  indicators: ReadonlyArray<T> | null | undefined
): T[] => startDcaLevels(indicators).map((level) => level.anchor);
