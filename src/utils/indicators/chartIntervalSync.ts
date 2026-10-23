import { tvIntervalMap, type IndicatorEnum } from '@/types';
import type { IndicatorConfig } from '@/types/indicators/indicators';
import { INDICATOR_CATALOG } from '@/types/indicators/indicatorCatalog';

/** True when the indicator is computed on a timeframe the user picks. */
export function indicatorHasTimeframe(type: IndicatorEnum): boolean {
  const definition = INDICATOR_CATALOG[type];
  if (!definition) return false;
  return [...definition.fields, ...(definition.advancedFields ?? [])].some(
    (field) => field.key === 'indicatorInterval'
  );
}

/**
 * The chart only draws indicators whose timeframe matches its own, so when an
 * indicator joins the chart (added, or its action came into use) or changes
 * timeframe the chart has to follow it, or that indicator is silently missing.
 * Returns the TV resolution of the last joined/retimed indicator, or null.
 */
export function chartIntervalToFollow(
  prev: IndicatorConfig[] | undefined,
  next: IndicatorConfig[] | undefined
): string | null {
  if (!next || next === prev) return null;
  const prevByUuid = new Map((prev ?? []).map((i) => [i.uuid, i]));
  let follow: string | null = null;
  for (const indicator of next) {
    if (
      !indicator.indicatorInterval ||
      !indicatorHasTimeframe(indicator.type)
    ) {
      continue;
    }
    const before = prevByUuid.get(indicator.uuid);
    if (before && before.indicatorInterval === indicator.indicatorInterval) {
      continue;
    }
    follow = tvIntervalMap[indicator.indicatorInterval] ?? follow;
  }
  return follow;
}
