import { beforeEach, describe, expect, test } from 'vitest';
import {
  TV_FAVORITE_INTERVALS_KEY,
  createFavoriteIntervalSettingsAdapter,
  getFavoriteChartInterval,
  pickFavoriteInterval,
  useChartFavoriteIntervalStore,
} from '@/stores/chartFavoriteIntervalStore';

describe('chart favourite interval', () => {
  beforeEach(() => {
    useChartFavoriteIntervalStore.setState({ favoriteInterval: null });
  });

  test('the shortest starred interval is the favourite', () => {
    expect(pickFavoriteInterval(['240', '1D', '60'])).toBe('60');
    expect(pickFavoriteInterval(['1W', '1D'])).toBe('1D');
    expect(pickFavoriteInterval(['30S', '1'])).toBe('30S');
    expect(pickFavoriteInterval([])).toBeNull();
  });

  test('a star set in TradingView seeds the next chart with only that one', () => {
    const first = createFavoriteIntervalSettingsAdapter();
    expect(first.initialSettings).toEqual({});
    first.setValue(TV_FAVORITE_INTERVALS_KEY, JSON.stringify(['240', '120']));
    first.setValue('some.other.setting', 'x');
    expect(getFavoriteChartInterval()).toBe('120');

    const next = createFavoriteIntervalSettingsAdapter();
    expect(next.initialSettings).toEqual({
      [TV_FAVORITE_INTERVALS_KEY]: JSON.stringify(['120']),
    });

    next.setValue(TV_FAVORITE_INTERVALS_KEY, '[]');
    expect(getFavoriteChartInterval()).toBeNull();
  });
});
