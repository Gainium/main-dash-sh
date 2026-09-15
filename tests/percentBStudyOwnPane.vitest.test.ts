import { describe, expect, test } from 'vitest';

import { IndicatorEnum, MAEnum, type ChartIndicatorConfig } from '@/types';
import { buildTradingViewStudyDescriptor } from '@/components/widgets/shared/TradingViewChart/indicatorStudyConfig';

/**
 * `buildTradingViewStudyDescriptor().forceOverlay` becomes the second argument
 * of `chart.createStudy(name, forceOverlay, …)`, which the charting library
 * documents as "forces the Charting Library to place the created indicator on
 * the main pane" — it overrides the study's own `is_price_study`.
 *
 * So the flag may only be set for studies that plot in price units. The two
 * %B studies (`Bollinger Bands %B (Custom)`, `Keltner Channel %B`) declare
 * `is_price_study: false` in `utils/tradingView/customIndicators.js` because
 * they output a unitless 0…1 ratio; forcing them onto the candle pane draws
 * them over the price series on a second, unrelated axis. Legacy V1
 * (`TVChartContainer.addCommonIndicator`) passes `forceOverlay: undefined` for
 * every indicator, so there each study honours its own declaration.
 *
 * Spec §1, §3 of `specs/016.percent-b-oscillators-forced-onto-the-price-pane`.
 */

const build = (type: IndicatorEnum, extra: Partial<ChartIndicatorConfig> = {}) =>
  buildTradingViewStudyDescriptor({
    type,
    uuid: `test-${type}`,
    length: 20,
    ...extra,
  } as ChartIndicatorConfig);

describe('TradingView study pane placement', () => {
  // Spec §1.1 — the defect.
  test('the %B oscillators are not forced onto the price pane', () => {
    const bbpb = build(IndicatorEnum.bbpb);
    const kcpb = build(IndicatorEnum.kcpb);

    expect(bbpb?.name).toBe('Bollinger Bands %B (Custom)');
    expect(kcpb?.name).toBe('Keltner Channel %B');
    expect(bbpb?.forceOverlay).toBeFalsy();
    expect(kcpb?.forceOverlay).toBeFalsy();
  });

  // Spec §2.3 — the ten genuine price studies must keep the flag.
  test('the genuine price overlays still carry forceOverlay', () => {
    const overlays: Array<[IndicatorEnum, Partial<ChartIndicatorConfig>]> = [
      [IndicatorEnum.ma, { maType: MAEnum.ema }],
      [IndicatorEnum.bb, {}],
      [IndicatorEnum.kc, {}],
      [IndicatorEnum.psar, {}],
      [IndicatorEnum.st, {}],
      [IndicatorEnum.pp, {}],
      [IndicatorEnum.qfl, {}],
      [IndicatorEnum.sr, {}],
      [IndicatorEnum.obfvg, {}],
      [IndicatorEnum.dc, {}],
    ];

    for (const [type, extra] of overlays) {
      expect(build(type, extra)?.forceOverlay, `${type} must overlay`).toBe(
        true
      );
    }
  });

  // Spec §2.3 — the AR-price variants are a separate opt-in and keep theirs.
  test('the AR-price variants still overlay, plain ATR/ADR still do not', () => {
    expect(build(IndicatorEnum.atr, { arPrice: true })?.forceOverlay).toBe(true);
    expect(build(IndicatorEnum.adr, { arPrice: true })?.forceOverlay).toBe(true);
    expect(build(IndicatorEnum.atr)?.forceOverlay).toBeFalsy();
    expect(build(IndicatorEnum.adr)?.forceOverlay).toBeFalsy();
  });

  // Spec §1.2 — %B belongs with the other oscillators, not with its band parent.
  test('%B is treated like the other oscillators, not like its band parent', () => {
    for (const type of [
      IndicatorEnum.rsi,
      IndicatorEnum.bbw,
      IndicatorEnum.macd,
    ]) {
      expect(build(type)?.forceOverlay).toBeFalsy();
    }
  });
});
