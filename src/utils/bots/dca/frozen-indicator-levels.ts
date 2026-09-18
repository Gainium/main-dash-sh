/**
 * Apply a deal's frozen indicator-DCA levels onto merged bot + deal settings.
 *
 * Kept dependency-free so it stays unit testable — see
 * `tests/frozenIndicatorLevels.unit.test.ts`.
 */
import {
  IndicatorAction,
  type DCAIndicatorLevel,
  type SettingsIndicators,
} from '@/types';

/**
 * On an indicator ladder each startDca indicator is one level, and its
 * `orderSize` / `minPercFromLast` size and space that level. main-app freezes
 * those two values per deal when it opens (`deal.settings.dcaIndicatorLevels`)
 * and resolves level N as: the deal's frozen entry N if there is one, else the
 * bot's live N-th startDca indicator. This mirrors that, so the deal's
 * projected ladder shows what the bot will actually place — not what the bot
 * would place for a NEW deal.
 *
 * Levels match by position, as in main-app. Everything else on an indicator
 * (what triggers it) stays live. Returns `settings` untouched when the deal
 * has no snapshot (deals opened before it existed).
 */
export function applyFrozenIndicatorLevels<
  T extends {
    indicators?: SettingsIndicators[];
    dcaIndicatorLevels?: DCAIndicatorLevel[] | null;
  },
>(settings: T): T {
  const frozen = settings.dcaIndicatorLevels;
  if (!frozen?.length || !settings.indicators?.length) return settings;
  let level = 0;
  return {
    ...settings,
    indicators: settings.indicators.map((indicator) => {
      if (indicator.indicatorAction !== IndicatorAction.startDca) {
        return indicator;
      }
      const entry = frozen[level++];
      if (!entry) return indicator;
      return {
        ...indicator,
        orderSize: entry.orderSize ?? undefined,
        minPercFromLast: entry.minPercFromLast ?? undefined,
      };
    }),
  };
}
