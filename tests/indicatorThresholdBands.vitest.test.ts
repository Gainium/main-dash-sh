import { describe, expect, test } from 'vitest';

import { IndicatorEnum, type ChartIndicatorConfig } from '@/types';
import { buildTradingViewStudyDescriptor } from '@/components/widgets/shared/TradingViewChart/indicatorStudyConfig';

/**
 * A study's threshold lines come from two overrides handed to
 * `chart.createStudy(…, overrides)`: `upperLimit.value` / `lowerLimit.value`
 * move the study's two hline bands onto the levels the user's condition
 * actually names, and `hlines background.visible` shades the gap between
 * them. Without the two `.value` overrides the bands keep the defaults baked
 * into the PineJS definition (for `Bollinger Bands %B (Custom)` that is 1 and
 * 0, i.e. the whole %B range) — so the shading covers the entire pane and a
 * single-threshold condition draws no line at all.
 *
 * Legacy V1 (`main-dash/components/TVChartContainer.getCommonOverrides`)
 * applies both `.value` overrides for every study it builds overrides for,
 * and strips them again for the price overlays further down. V2 must match:
 * the threshold belongs to the user's condition, not to a hand-maintained
 * list of indicator types.
 *
 * Spec §1, §3 of `specs/017.indicator-thresholds-dropped-outside-an-allowlist`.
 */

const build = (type: IndicatorEnum, extra: Partial<ChartIndicatorConfig> = {}) =>
  buildTradingViewStudyDescriptor({
    type,
    uuid: `test-${type}`,
    length: 20,
    ...extra,
  } as ChartIndicatorConfig);

describe('TradingView study threshold bands', () => {
  // Spec §1.1 — a `lt 0.05` condition shades 0 … 0.05, not 0 … 1.
  test('%B with a two-sided threshold moves both bands onto it', () => {
    const o = build(IndicatorEnum.bbpb, { upperLimit: 0.05, lowerLimit: 0 })
      ?.overrides;

    expect(o?.['lowerLimit.value']).toBe(0);
    expect(o?.['upperLimit.value']).toBe(0.05);
    // Both levels present → the band between them is shaded and the two
    // dashed lines are redundant.
    expect(o?.['hlines background.visible']).toBe(true);
    expect(o?.['upperLimit.visible']).toBe(false);
    expect(o?.['lowerLimit.visible']).toBe(false);
  });

  // Spec §1.1 — a `cu 0.03` condition draws one line at 0.03.
  test('%B with a single threshold draws that one line', () => {
    const o = build(IndicatorEnum.bbpb, { upperLimit: 0.03 })?.overrides;

    expect(o?.['upperLimit.value']).toBe(0.03);
    expect(o?.['upperLimit.visible']).toBe(true);
    expect(o?.['hlines background.visible']).toBe(false);
  });

  // Spec §1.2 — the same defect, same family.
  test('the other pane studies outside the old allowlist get their thresholds', () => {
    for (const type of [
      IndicatorEnum.kcpb,
      IndicatorEnum.bbwp,
      IndicatorEnum.atr,
      IndicatorEnum.adr,
    ]) {
      const o = build(type, { upperLimit: 7, lowerLimit: 2 })?.overrides;
      expect(o?.['upperLimit.value'], `${type} upper`).toBe(7);
      expect(o?.['lowerLimit.value'], `${type} lower`).toBe(2);
    }
  });

  // Spec §4 — the studies that already worked must be untouched.
  test('the oscillators that already had thresholds are unchanged', () => {
    for (const type of [
      IndicatorEnum.rsi,
      IndicatorEnum.cci,
      IndicatorEnum.mfi,
      IndicatorEnum.wr,
      IndicatorEnum.stoch,
      IndicatorEnum.stochRSI,
      IndicatorEnum.ao,
      IndicatorEnum.mom,
      IndicatorEnum.vo,
      IndicatorEnum.uo,
      IndicatorEnum.adx,
      IndicatorEnum.macd,
      IndicatorEnum.bbw,
      IndicatorEnum.mar,
      IndicatorEnum.ath,
    ]) {
      const o = build(type, { upperLimit: 30, lowerLimit: 0 })?.overrides;
      expect(o?.['upperLimit.value'], `${type} upper`).toBe(30);
      expect(o?.['lowerLimit.value'], `${type} lower`).toBe(0);
      expect(o?.['upperLimit.visible'], `${type} upper line`).toBe(false);
      expect(o?.['lowerLimit.visible'], `${type} lower line`).toBe(false);
    }
  });

  // Spec §4 — the price overlays must still carry no threshold at all: their
  // limits are price-unit nonsense on a 0-1 study scale.
  test('the price overlays still have every threshold override stripped', () => {
    for (const type of [
      IndicatorEnum.psar,
      IndicatorEnum.bb,
      IndicatorEnum.kc,
      IndicatorEnum.qfl,
      IndicatorEnum.sr,
      IndicatorEnum.ecd,
      IndicatorEnum.xo,
      IndicatorEnum.div,
      IndicatorEnum.pc,
      IndicatorEnum.pp,
      IndicatorEnum.obfvg,
    ]) {
      const o = build(type, { upperLimit: 30, lowerLimit: 0 })?.overrides ?? {};
      const leaked = Object.keys(o).filter((k) => /limit/i.test(k));
      expect(leaked, `${type} must carry no limit override`).toEqual([]);
    }
  });

  // Spec §4 — and the AR-price variants, which return a lone plot override.
  test('the AR-price variants are unaffected', () => {
    for (const type of [IndicatorEnum.atr, IndicatorEnum.adr]) {
      const o = build(type, { arPrice: true, upperLimit: 30, lowerLimit: 0 })
        ?.overrides;
      expect(o).toEqual({ 'plot_0.visible': false });
    }
  });
});
