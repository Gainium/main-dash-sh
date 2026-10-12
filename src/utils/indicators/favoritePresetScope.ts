import type { IndicatorEnum } from '@/types';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';

/**
 * The saved settings of the favorite being picked right now, if any.
 *
 * The indicator selector runs its caller's `onSelect` inside
 * `withFavoritePreset`, and `getIndicatorDefaultParams` layers this preset
 * over the catalog defaults for that one synchronous call. That way every
 * section's "pick an indicator" handler gets a favorite's values without each
 * of them threading the preset through. Outside that call it is always null,
 * so mapping saved bots never sees it.
 */
let active: { type: IndicatorEnum; params: Partial<IndicatorParamsState> } | null =
  null;

export const getActiveFavoritePreset = (
  type: IndicatorEnum
): Partial<IndicatorParamsState> | null =>
  active && active.type === type ? active.params : null;

export const withFavoritePreset = (
  type: IndicatorEnum,
  params: Partial<IndicatorParamsState> | undefined,
  run: () => void
): void => {
  if (!params) {
    run();
    return;
  }
  active = { type, params };
  try {
    run();
  } finally {
    active = null;
  }
};
