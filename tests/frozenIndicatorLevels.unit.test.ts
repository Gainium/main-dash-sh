import { test, expect } from '@playwright/test';

import { IndicatorAction, type SettingsIndicators } from '@/types';
import { applyFrozenIndicatorLevels } from '@/utils/bots/dca/frozen-indicator-levels';

/**
 * A running deal's projected indicator-DCA ladder must show the sizes and
 * distances the deal opened with. main-app freezes them per deal
 * (`deal.settings.dcaIndicatorLevels`) and resolves level N as the deal's
 * frozen entry N, else the bot's live N-th startDca indicator. Before this,
 * the deal view merged `{ ...bot.settings, ...deal.settings }` and read the
 * bot's LIVE indicators — so after raising the bot's sizes, a deal opened at
 * a $50 base showed a next safety order of ~$1,155.
 */
const ind = (
  uuid: string,
  orderSize: string,
  minPercFromLast: string,
  indicatorAction = IndicatorAction.startDca
) =>
  ({
    uuid,
    indicatorAction,
    orderSize,
    minPercFromLast,
  }) as unknown as SettingsIndicators;

const liveIndicators = [
  ind('start', '', '', IndicatorAction.startDeal),
  ind('l1', '1155', '10'),
  ind('l2', '2310', '10'),
  ind('l3', '4620', '10'),
];

const startDca = (s: { indicators?: SettingsIndicators[] }) =>
  (s.indicators ?? [])
    .filter((i) => i.indicatorAction === IndicatorAction.startDca)
    .map((i) => [i.orderSize, i.minPercFromLast]);

test.describe('applyFrozenIndicatorLevels', () => {
  test('a running deal shows the sizes and distances it opened with', () => {
    const merged = applyFrozenIndicatorLevels({
      indicators: liveIndicators,
      dcaIndicatorLevels: [
        { orderSize: '75', minPercFromLast: '2' },
        { orderSize: '150', minPercFromLast: '2' },
        { orderSize: '300', minPercFromLast: '2' },
      ],
    });
    expect(startDca(merged)).toEqual([
      ['75', '2'],
      ['150', '2'],
      ['300', '2'],
    ]);
  });

  test('what triggers a level stays live', () => {
    const merged = applyFrozenIndicatorLevels({
      indicators: liveIndicators,
      dcaIndicatorLevels: [{ orderSize: '75', minPercFromLast: '2' }],
    });
    expect(merged.indicators?.map((i) => i.uuid)).toEqual([
      'start',
      'l1',
      'l2',
      'l3',
    ]);
    expect(merged.indicators?.[0]).toBe(liveIndicators[0]);
  });

  test('a level the bot gained after the deal opened uses the live value', () => {
    const merged = applyFrozenIndicatorLevels({
      indicators: liveIndicators,
      dcaIndicatorLevels: [
        { orderSize: '75', minPercFromLast: '2' },
        { orderSize: '150', minPercFromLast: '2' },
      ],
    });
    expect(startDca(merged)).toEqual([
      ['75', '2'],
      ['150', '2'],
      ['4620', '10'],
    ]);
  });

  test('a deal opened before the snapshot existed follows the bot', () => {
    const settings = { indicators: liveIndicators };
    expect(applyFrozenIndicatorLevels(settings)).toBe(settings);
    const nulled = { indicators: liveIndicators, dcaIndicatorLevels: null };
    expect(applyFrozenIndicatorLevels(nulled)).toBe(nulled);
  });

  test('an empty frozen size stays empty (the deal falls back to its own orderSize)', () => {
    const merged = applyFrozenIndicatorLevels({
      indicators: liveIndicators,
      dcaIndicatorLevels: [{ orderSize: null, minPercFromLast: '2' }],
    });
    expect(startDca(merged)[0]).toEqual([undefined, '2']);
  });
});
