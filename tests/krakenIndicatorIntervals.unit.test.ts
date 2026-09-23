import { test, expect } from '@playwright/test';

import { ExchangeEnum, ExchangeIntervals } from '@/types';
import { filterIntervalsByExchange } from '@/types/indicators/indicatorLogic';

/**
 * The indicator interval picker must offer a Kraken spot bot every width the
 * backend can serve: Kraken's eight native OHLC widths plus 3m/2h/8h, which
 * exchange-connector builds by aggregating a finer native width. Kraken
 * futures has no aggregation step, so it keeps the eight native widths.
 * Mirrors main-app `krakenSpotSupported` / `krakenUsdmSupported`.
 *
 * Run: npx playwright test --config=playwright.unit.config.ts tests/krakenIndicatorIntervals.unit.test.ts
 */
const ALL = Object.values(ExchangeIntervals) as ExchangeIntervals[];

const NATIVE = [
  ExchangeIntervals.oneM,
  ExchangeIntervals.fiveM,
  ExchangeIntervals.fifteenM,
  ExchangeIntervals.thirtyM,
  ExchangeIntervals.oneH,
  ExchangeIntervals.fourH,
  ExchangeIntervals.oneD,
  ExchangeIntervals.oneW,
];
const AGGREGATED = [
  ExchangeIntervals.threeM,
  ExchangeIntervals.twoH,
  ExchangeIntervals.eightH,
];

const sorted = (list: ExchangeIntervals[]) => [...list].sort();

test.describe('Kraken indicator intervals (spec 050)', () => {
  test('§1.1 Kraken spot offers the native widths plus 3m/2h/8h', () => {
    for (const exchange of [ExchangeEnum.kraken, ExchangeEnum.paperKraken]) {
      expect(sorted(filterIntervalsByExchange(ALL, exchange))).toEqual(
        sorted([...NATIVE, ...AGGREGATED])
      );
    }
  });

  test('§1.1 Kraken futures stays on the native widths', () => {
    for (const exchange of [
      ExchangeEnum.krakenUsdm,
      ExchangeEnum.paperKrakenUsdm,
    ]) {
      expect(sorted(filterIntervalsByExchange(ALL, exchange))).toEqual(
        sorted(NATIVE)
      );
    }
  });
});
