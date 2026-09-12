import { DCA_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import type { BotFormData } from '@/types/bots/form';
import { computePlannedDeviation } from '@/utils/bots/dca/capital-summary';
import type { MarketStats } from '@/utils/marketStats';

/**
 * Combo bot settings are a superset of DCA settings (see
 * `COMBO_FORM_DEFAULTS = { ...DCA_FORM_DEFAULTS, ... }` in
 * formDefaults.ts). Every field these helpers touch
 * (`baseOrderSize`, `orderSize`, `ordersCount`, `activeOrdersCount`,
 * `step`, `stepScale`, `volumeScale`, `tpPerc`, `maxNumberOfOpenDeals`,
 * `maxDealsPerPair`) exists on both with the same name + type. Treat
 * combo as "DCA-like" for preset/calibration/investment math and skip
 * renaming the helpers — the math is identical.
 */
export type QuickSetupDcaLike = BotFormData['dca'] | BotFormData['combo'];

export type QuickSetupPresetId = 'short-term' | 'mid-term' | 'long-term';

/**
 * Calibration knobs per preset. Two independent volatility signals
 * drive the two calibrated DCA params:
 *
 *   step   = target_drawdown / Σ stepScale^i   for i ∈ [0, ordersCount)
 *          where target_drawdown = drawdowns[`p${drawdownPercentile}`]
 *
 *   tpPerc = atrPct × tpAtrMultiplier   (clamped)
 *
 * Different signals because they answer different questions: step
 * sizes the *safety ladder* for the coin's historic worst-case dips
 * (drawdown percentiles), while TP sizes the *exit target* against
 * the coin's typical bounce magnitude (ATR, a smoothed measure of
 * day-to-day range). Tying TP to step lets ladder shape pollute the
 * exit decision and can invert tier ordering (Mid's larger ladder
 * shrinks per-step → smaller TP than Short).
 *
 * The tpAtrMultiplier values are chosen so they're strictly
 * increasing across tiers, which guarantees TP_short < TP_mid <
 * TP_long for any coin where ATR > 0.
 *
 * Calibration only runs when MarketStats.hasFullYear is true — for
 * newer coins we fall back to the static `values`.
 */
/**
 * Where to pull the target drawdown from:
 *   - `month_p50`/`month_p80`: percentile of max-drawdowns observed
 *     within rolling 30-day windows (hundreds of samples).
 *   - `fullPeriodMax`: the worst peak-to-trough decline anywhere in
 *     the full ~1-year candle history (one number, the catastrophe).
 *
 * `month_p50 ≤ month_p80 ≤ fullPeriodMax` is guaranteed by
 * construction, which keeps the tiers monotonically ordered for any
 * coin.
 */
export type DrawdownTarget = 'month_p50' | 'month_p80' | 'fullPeriodMax';

export interface PresetCalibration {
  /** Which historical drawdown the ladder should be sized to survive. */
  drawdownTarget: DrawdownTarget;
  /** TP% = atrPct × tpAtrMultiplier. Must be strictly increasing across tiers. */
  tpAtrMultiplier: number;
}

export interface QuickSetupPreset {
  id: QuickSetupPresetId;
  label: string;
  tagline: string;
  /** One-sentence plain-English description of what this tier does. */
  explanation: string;
  /** Drives calibration when MarketStats has a full year of data. */
  calibration: PresetCalibration;
  /**
   * Static fallback values. Used whenever calibration data isn't
   * available (loading, fetch failed, or <1y of history), and also
   * for the non-volatility-driven ladder shape (ordersCount,
   * stepScale, volumeScale, deal caps).
   *
   * Applying a preset resets the whole `dca` section to defaults first
   * so leftover advanced-mode tweaks can't leak through.
   */
  values: Partial<BotFormData['dca']>;
}

const STEP_MIN = 0.3;
const STEP_MAX = 8;
const TP_MIN = 0.3;
const TP_MAX = 25;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Round to 2 decimals, drop trailing zeros, return as form-ready string. */
const fmtPct = (v: number): string => {
  const rounded = Math.round(v * 100) / 100;
  return String(rounded);
};

/** Σ stepScale^i for i in [0, n). Closed form for stepScale ≠ 1. */
const ladderSum = (n: number, stepScale: number): number => {
  if (n <= 0) return 0;
  if (stepScale === 1) return n;
  return (Math.pow(stepScale, n) - 1) / (stepScale - 1);
};

const pickDrawdownTarget = (
  stats: MarketStats,
  target: DrawdownTarget
): number => {
  const dd = stats.drawdowns;
  if (target === 'fullPeriodMax') return dd.fullPeriodMax;
  if (target === 'month_p50') return dd.month.p50;
  return dd.month.p80;
};

/**
 * Pure risk-allocation presets. They configure TP and the DCA
 * safety-order ladder. SL is intentionally not set — averaging down
 * through safety orders carries the risk-management load. Pair,
 * exchange, and bot name live at the root of `formData` and are
 * untouched by these.
 */
export const QUICK_SETUP_PRESETS: QuickSetupPreset[] = [
  {
    id: 'short-term',
    label: 'Short-term',
    tagline: 'Small TP, light averaging. Fast cycles.',
    explanation:
      'Sized for the typical dip seen in the past year. Cycles often, light protection.',
    calibration: { drawdownTarget: 'month_p50', tpAtrMultiplier: 0.6 },
    values: {
      tpPerc: '1.5',
      ordersCount: '4',
      activeOrdersCount: '1',
      step: '1',
      stepScale: '1.1',
      volumeScale: '1.2',
      maxNumberOfOpenDeals: '3',
      maxDealsPerPair: '1',
    },
  },
  {
    id: 'mid-term',
    label: 'Mid-term',
    tagline: 'Balanced TP with moderate averaging.',
    explanation:
      'Sized for a bad correction (top 20% of historical dips). Balanced cycling and protection.',
    calibration: { drawdownTarget: 'month_p80', tpAtrMultiplier: 1.2 },
    values: {
      tpPerc: '3',
      ordersCount: '8',
      activeOrdersCount: '2',
      step: '2',
      stepScale: '1.15',
      volumeScale: '1.5',
      maxNumberOfOpenDeals: '5',
      maxDealsPerPair: '1',
    },
  },
  {
    id: 'long-term',
    label: 'Long-term',
    tagline: 'Wider TP, deep averaging across many orders.',
    explanation:
      'Sized for the worst drawdown observed in the past year. Slow cycling, heaviest protection.',
    calibration: { drawdownTarget: 'fullPeriodMax', tpAtrMultiplier: 2.4 },
    values: {
      tpPerc: '6',
      ordersCount: '10',
      activeOrdersCount: '3',
      step: '3',
      stepScale: '1.1',
      volumeScale: '1.5',
      maxNumberOfOpenDeals: '5',
      maxDealsPerPair: '1',
    },
  },
];

/**
 * Calibrates both `step` and `tpPerc` from the coin's price history:
 *
 *   step   ← drawdown percentile (ladder must survive that drop)
 *   tpPerc ← ATR% (exit target sized to the coin's typical bounce)
 *
 * Ladder shape (ordersCount, stepScale, volumeScale, deal caps) comes
 * from `preset.values` since it encodes the tier philosophy (fast
 * cycling vs deep averaging).
 *
 * Calibration runs only when MarketStats.hasFullYear is true and we
 * have at least one completed drawdown episode. Otherwise we return
 * the static `values`, so newly-listed coins fall back gracefully.
 */
export const getCalibratedPresetValues = (
  preset: QuickSetupPreset,
  stats: MarketStats | null
): Partial<BotFormData['dca']> => {
  if (
    !stats ||
    !stats.hasFullYear ||
    stats.drawdowns.month.sampleCount === 0
  ) {
    return preset.values;
  }
  const target = pickDrawdownTarget(stats, preset.calibration.drawdownTarget);
  if (!Number.isFinite(target) || target <= 0) return preset.values;

  const ordersCount = Math.max(1, Number(preset.values.ordersCount ?? 1));
  const stepScale = Math.max(0.01, Number(preset.values.stepScale ?? 1));
  const sum = ladderSum(ordersCount, stepScale);
  if (sum <= 0) return preset.values;

  const step = fmtPct(clamp(target / sum, STEP_MIN, STEP_MAX));
  const tpPerc =
    Number.isFinite(stats.atrPct) && stats.atrPct > 0
      ? fmtPct(
          clamp(stats.atrPct * preset.calibration.tpAtrMultiplier, TP_MIN, TP_MAX)
        )
      : undefined;
  return {
    ...preset.values,
    step,
    ...(tpPerc !== undefined ? { tpPerc } : {}),
  };
};

export const getQuickSetupPreset = (
  id: string | null
): QuickSetupPreset | undefined =>
  QUICK_SETUP_PRESETS.find((preset) => preset.id === id);

export interface PresetPreview {
  /** TP% the preset would apply right now. */
  tpPerc: number;
  /** First safety-order price step %. */
  step: number;
  /** Total number of safety orders. */
  ordersCount: number;
  /** Cumulative ladder deviation in % (= what the bot would survive). */
  deviation: number;
  /**
   * The drawdown depth this tier is currently calibrated to, in %.
   * Null when calibration didn't run (no stats, <1y of history).
   */
  targetDrawdown: number | null;
  /** True when the values shown are derived from live history. */
  isCalibrated: boolean;
}

/**
 * Returns the headline numbers each preset row should display: the
 * values that would actually be applied if the user clicked it, plus
 * the calibration target (when applicable) so the row can show
 * "Target X%".
 */
export const getPresetPreview = (
  preset: QuickSetupPreset,
  stats: MarketStats | null
): PresetPreview => {
  const calibrated = getCalibratedPresetValues(preset, stats);
  const step = Number(calibrated.step ?? '0');
  const tpPerc = Number(calibrated.tpPerc ?? '0');
  const ordersCount = Number(calibrated.ordersCount ?? '0');
  const stepScale = Number(calibrated.stepScale ?? '1');
  const deviation = computePlannedDeviation(ordersCount, step, stepScale);
  const isCalibrated = Boolean(
    stats?.hasFullYear && stats.drawdowns.month.sampleCount > 0
  );
  const targetDrawdown =
    isCalibrated && stats
      ? pickDrawdownTarget(stats, preset.calibration.drawdownTarget)
      : null;
  return {
    step,
    tpPerc,
    ordersCount,
    deviation,
    targetDrawdown,
    isCalibrated,
  };
};

/**
 * The full dca-like state a preset produces: defaults overlaid with the
 * preset's (optionally calibrated) values. Used both to apply the
 * preset and to detect when the user has tuned the form away from it.
 * Pass `stats` to get volatility-tuned tpPerc/step; omit for the
 * static fallback values.
 *
 * Combo callers also use this: COMBO_FORM_DEFAULTS extends
 * DCA_FORM_DEFAULTS and the fields presets touch are identical
 * between the two slices, so the DCA defaults are a safe base.
 */
export const getPresetDcaState = (
  preset: QuickSetupPreset,
  stats: MarketStats | null = null
): QuickSetupDcaLike =>
  ({
    ...DCA_FORM_DEFAULTS,
    ...getCalibratedPresetValues(preset, stats),
  }) as QuickSetupDcaLike;

/**
 * Shared investment-math helpers used by both the Quick form's
 * investment slider and the preset/template appliers so that the
 * total funds the user picked stays constant when ordersCount or
 * volumeScale change underneath them. Must match the formula in
 * `deriveCapitalSummary` (utils/bots/dca/capital-summary.ts):
 *   totalPerDeal = baseOrderSize + Σ orderSize * volumeScale^i
 * With base = orderSize the divisor is 1 + Σ v^i.
 */
export const computeInvestmentDivisor = (
  ordersCountRaw: unknown,
  volumeScaleRaw: unknown
): number => {
  const ordersCount = Math.max(0, Math.trunc(Number(ordersCountRaw ?? 0)));
  const v = Number(volumeScaleRaw ?? 1);
  const volumeScale = Number.isFinite(v) && v > 0 ? v : 1;
  if (ordersCount === 0) return 1;
  const geometricSum =
    volumeScale === 1
      ? ordersCount
      : (Math.pow(volumeScale, ordersCount) - 1) / (volumeScale - 1);
  return 1 + geometricSum;
};

/** Investment ( = total per deal ) given a dca-like state. */
export const computeInvestmentFromDca = (
  dca: QuickSetupDcaLike
): number => {
  const base = Number(dca.baseOrderSize ?? 0);
  const order = Number(dca.orderSize ?? 0);
  const divisor = computeInvestmentDivisor(dca.ordersCount, dca.volumeScale);
  // divisor = 1 + Σ v^i, so geometricSum = divisor - 1.
  return (Number.isFinite(base) ? base : 0) +
    (Number.isFinite(order) ? order : 0) * (divisor - 1);
};

/** Distribute a target total-investment into baseOrderSize / orderSize.
 *  `precision` controls the per-order decimal places — defaults to 2 (the
 *  quote-currency case), bumped higher when the investment is denominated
 *  in base (e.g. BTC at 5-8 decimals).
 *
 *  The safety orders take an even share rounded DOWN to those decimals and the
 *  base order takes the remainder, so `computeInvestmentFromDca` gives back the
 *  figure that went in. Giving both the same rounded share instead quantized
 *  the reachable total to `divisor x 10^-precision` — half a unit of quote on
 *  an 8-order, 1.5-volume-scale ladder — so the Investment field could not
 *  represent most of what a user typed into it, and answered each keystroke
 *  with a different number.
 *
 *  Rounding DOWN rather than to nearest is what keeps the remainder
 *  non-negative: the base order is then never left below a safety order, and
 *  so never below the exchange per-order minimum that the safety orders
 *  already clear. It is bounded by one rounding unit per safety order. */
export const distributeInvestmentToDca = (
  investment: number,
  dca: QuickSetupDcaLike,
  precision: number = 2
): { baseOrderSize: string; orderSize: string } => {
  const safe = Number.isFinite(investment) && investment >= 0 ? investment : 0;
  const divisor = computeInvestmentDivisor(dca.ordersCount, dca.volumeScale);
  const decimals = Math.max(0, Math.min(20, Math.floor(precision)));
  const factor = Math.pow(10, decimals);
  const perOrder =
    divisor > 0
      ? Math.floor(Number(((safe / divisor) * factor).toPrecision(12))) / factor
      : safe;
  const base = Math.max(0, safe - perOrder * (divisor - 1));
  return {
    baseOrderSize: base.toFixed(decimals),
    orderSize: perOrder.toFixed(decimals),
  };
};
