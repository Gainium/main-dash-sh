import { GRID_FORM_DEFAULTS } from '@/contexts/bots/form/formDefaults';
import { FuturesStrategyEnum, StrategyEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { MarketStats } from '@/utils/marketStats';

/**
 * The side the range tilts towards. Spot grids only ever have long/short
 * (`grid.strategy`); futures grids carry the third, NEUTRAL, on
 * `grid.futuresStrategy`. Both enums are string enums sharing 'LONG'/'SHORT',
 * so callers pass whichever field applies to the bot they're configuring and
 * the helpers below normalise.
 */
export type GridRangeDirection = StrategyEnum | FuturesStrategyEnum;

const isShortDirection = (direction: GridRangeDirection | undefined): boolean =>
  direction === StrategyEnum.short || direction === FuturesStrategyEnum.short;

const isNeutralDirection = (
  direction: GridRangeDirection | undefined
): boolean => direction === FuturesStrategyEnum.neutral;

/**
 * Grid Quick Setup presets. Grid does NOT reuse the DCA preset module
 * because the math is fundamentally different — grid sizes a *price
 * range* (top/low) for a single pair, not a safety-order ladder.
 *
 * Calibration approach (two-tier hybrid):
 *
 *   half_width = max(K_atr × ATR%, K_dd × drawdown_target, floor_pct)
 *
 * Per-tier constants (see QUICK_GRID_PRESETS for canonical values):
 *   - short (Narrow): K_atr=2,  K_dd=1.0 (month.p50),     floor=1.5%
 *   - mid (Balanced): K_atr=5,  K_dd=1.0 (month.p80),     floor=5%
 *   - long (Wide):    K_atr=12, K_dd=1.0 (fullPeriodMax), floor=15%
 *
 * Final clamp: half_width ∈ [1, 80] (% of latestPrice).
 *
 * The strategy tilt then converts half_width into a range:
 *   - long  → tilts down: low = price × (1 - 2×hw), top = price × (1 + hw)
 *   - short → mirror (upside-tilted)
 *   - neutral → symmetric ±hw around the price
 *
 * gridStep is derived from the geometric grid formula
 *   step = ((topPrice / lowPrice) ^ (1/levels) - 1) × 100
 * and clamped to a sane range so a flat coin doesn't end up with a
 * 0.01% grid or a wild coin doesn't blow past sensible step sizes.
 *
 * Calibration only needs `latestPrice` + `atrPct`. Drawdowns and
 * sampleCount, when available, raise the half_width to survive deeper
 * dips — but their absence no longer disables calibration: the ATR
 * leg and floor_pct still produce a valid range on freshly-listed
 * pairs.
 */
/**
 * Tier ids match the server's unified vocabulary across all bot types
 * (short/mid/long). The user-facing labels keep their grid-specific
 * names — "Narrow" / "Balanced" / "Wide" — in QUICK_GRID_PRESETS[].label.
 */
export type QuickGridPresetId = 'short' | 'mid' | 'long';

/**
 * Which historical drawdown the range width is sized against. Same
 * semantics as the DCA preset module's `DrawdownTarget` (see
 * quickSetupPresets.ts for the percentile definitions).
 */
export type GridDrawdownTarget = 'month_p50' | 'month_p80' | 'fullPeriodMax';

export interface GridPresetCalibration {
  /** Drawdown source for the range width. */
  drawdownTarget: GridDrawdownTarget;
  /** Number of grid lines this tier should use. */
  levels: number;
  /** Grid math type — always geometric for the calibrated presets. */
  gridType: 'geometric' | 'arithmetic';
  /** ATR multiplier — how many ATR% widths the range should span. */
  kAtr: number;
  /** Drawdown multiplier (against the selected drawdownTarget). */
  kDd: number;
  /** Absolute minimum half-width in %. Survives flat coins / missing data. */
  floorPct: number;
}

export interface QuickGridPreset {
  id: QuickGridPresetId;
  label: string;
  tagline: string;
  explanation: string;
  calibration: GridPresetCalibration;
  /**
   * Static fallback values. Used whenever MarketStats can't drive
   * calibration (no candles, <1y of history, missing latestPrice).
   * `topPrice` / `lowPrice` are intentionally left at zero — without
   * a reference price we can't make up a range — the user must enter
   * one manually if calibration fails. Everything else (levels,
   * gridType, gridStep guess) is set so the form stays valid.
   */
  values: Partial<BotFormData['grid']>;
}

// Clamp ranges for derived gridStep / levels. Picked to match the
// loose `STEP_MIN/STEP_MAX` style from quickSetupPresets.ts — wide
// enough to let calibration breathe, tight enough to keep the bot
// usable on a fresh exchange account.
const STEP_MIN = 0.2;
const STEP_MAX = 10;
const LEVELS_MIN = 3;
const LEVELS_MAX = 100;

// Final clamp on the calibrated half-width (% of latestPrice).
// Floors guarantee a non-degenerate range even when ATR and drawdowns
// are tiny; the ceiling keeps a hyper-volatile coin from producing a
// range that's wider than the price itself.
const HALF_WIDTH_MIN = 1;
const HALF_WIDTH_MAX = 80;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Round to N decimals, drop NaN/Infinity. */
const round = (v: number, decimals = 4): number => {
  if (!Number.isFinite(v)) return 0;
  const m = Math.pow(10, decimals);
  return Math.round(v * m) / m;
};

const pickDrawdownTarget = (
  stats: MarketStats,
  target: GridDrawdownTarget
): number => {
  const dd = stats.drawdowns;
  if (target === 'fullPeriodMax') return dd.fullPeriodMax;
  if (target === 'month_p50') return dd.month.p50;
  return dd.month.p80;
};

/**
 * Two-tier hybrid half-width (% of latestPrice). Always positive
 * thanks to `floorPct`. Drawdowns can be zero/NaN when history is
 * thin — they then drop out of the `max(...)` and the ATR + floor
 * legs carry calibration.
 */
const computeHalfWidthPct = (
  stats: MarketStats,
  calibration: GridPresetCalibration
): number => {
  const atrLeg = Number.isFinite(stats.atrPct)
    ? calibration.kAtr * Math.max(0, stats.atrPct)
    : 0;
  const drawdown = pickDrawdownTarget(stats, calibration.drawdownTarget);
  const ddLeg =
    Number.isFinite(drawdown) && drawdown > 0
      ? calibration.kDd * drawdown
      : 0;
  const raw = Math.max(atrLeg, ddLeg, calibration.floorPct);
  return clamp(raw, HALF_WIDTH_MIN, HALF_WIDTH_MAX);
};

export const QUICK_GRID_PRESETS: QuickGridPreset[] = [
  {
    id: 'short',
    label: 'Short-term',
    tagline: 'Tight range, frequent fills.',
    explanation:
      'Range sized for the typical dip seen in the past year. Frequent fills, smaller per-trade profit.',
    calibration: {
      drawdownTarget: 'month_p50',
      levels: 10,
      gridType: 'geometric',
      kAtr: 2,
      kDd: 1,
      floorPct: 1.5,
    },
    values: {
      levels: 10,
      gridStep: 1,
      gridType: 'geometric',
    },
  },
  {
    id: 'mid',
    label: 'Mid-term',
    tagline: 'Balanced range and grid spacing.',
    explanation:
      'Range sized for a bad correction (top 20% of historical dips). A balanced default.',
    calibration: {
      drawdownTarget: 'month_p80',
      levels: 20,
      gridType: 'geometric',
      kAtr: 5,
      kDd: 1,
      floorPct: 5,
    },
    values: {
      levels: 20,
      gridStep: 1.5,
      gridType: 'geometric',
    },
  },
  {
    id: 'long',
    label: 'Long-term',
    tagline: 'Wide range to survive deep drawdowns.',
    explanation:
      'Range sized for the worst drawdown observed in the past year. Fewer fills, larger steps.',
    calibration: {
      drawdownTarget: 'fullPeriodMax',
      levels: 40,
      gridType: 'geometric',
      kAtr: 12,
      kDd: 1,
      floorPct: 15,
    },
    values: {
      levels: 40,
      gridStep: 2,
      gridType: 'geometric',
    },
  },
];

export const getQuickGridPreset = (
  id: string | null
): QuickGridPreset | undefined =>
  QUICK_GRID_PRESETS.find((preset) => preset.id === id);

/**
 * True when we have the bare minimum the two-tier calibration needs:
 * a positive latest price. ATR%, drawdowns, and a full year of history
 * are *optional inputs* — when present they raise the half-width to
 * survive deeper dips, but their absence drops their respective legs
 * out of the `max(...)` and `floorPct` still guarantees a non-zero
 * half-width. So freshly-listed pairs (no ATR, no drawdowns) still
 * calibrate to the preset's floor — never leaving topPrice/lowPrice
 * at 0 when we have a reference price to multiply against.
 */
const canCalibrate = (stats: MarketStats | null): stats is MarketStats =>
  Boolean(
    stats && Number.isFinite(stats.latestPrice) && stats.latestPrice > 0
  );

/**
 * Geometric step% derived from a top/low/levels combo:
 *   step = ((top/low)^(1/levels) - 1) × 100
 * Clamped to [STEP_MIN, STEP_MAX] so calibration never emits a degenerate
 * value.
 */
const computeGeometricStep = (
  topPrice: number,
  lowPrice: number,
  levels: number
): number => {
  if (
    !Number.isFinite(topPrice) ||
    !Number.isFinite(lowPrice) ||
    !Number.isFinite(levels) ||
    topPrice <= 0 ||
    lowPrice <= 0 ||
    topPrice <= lowPrice ||
    levels <= 0
  ) {
    return 0;
  }
  const ratio = topPrice / lowPrice;
  const step = (Math.pow(ratio, 1 / levels) - 1) * 100;
  return clamp(step, STEP_MIN, STEP_MAX);
};

/**
 * Range bounds derived from a half-width % around the latest price.
 *   - long:    tilts down — low = price × (1 - 2hw), top = price × (1 + hw)
 *   - short:   mirror of long (upside-tilted)
 *   - neutral: symmetric ±hw on each side
 *
 * The asymmetric long shape gives the bot ~2× more room below the
 * entry than above, matching the bias of "buy dips, sell rallies".
 */
// Practical floor for the downside (long) / upside (short) leg as a
// fraction of latestPrice. Without a cap, a wide half-width (e.g. 60%)
// drives the doubled side past 100% and clamps to 0 — leaving the grid
// without a valid bound. 0.1 keeps the bot's furthest order ≥10% of
// the current price, which is the lowest a real grid would ever want
// to operate.
const FAR_LEG_FLOOR = 0.1;

const computeRange = (
  latestPrice: number,
  halfWidthPct: number,
  strategy: GridRangeDirection | undefined
): { lowPrice: number; topPrice: number } => {
  const hw = Math.max(0, halfWidthPct) / 100;
  if (isNeutralDirection(strategy)) {
    // Neutral (futures only) — the bot opens no position and works both
    // sides from flat, so neither leg is favoured: symmetric ±hw.
    return {
      lowPrice: latestPrice * Math.max(FAR_LEG_FLOOR, 1 - hw),
      topPrice: latestPrice * (1 + hw),
    };
  }
  if (isShortDirection(strategy)) {
    // Upside-tilted; topPrice gets the 2× leg. Cap how far it can run.
    const topMult = Math.min(1 + hw * 2, 1 + (1 - FAR_LEG_FLOOR));
    return {
      lowPrice: latestPrice * (1 - hw),
      topPrice: latestPrice * topMult,
    };
  }
  // Long (default) — expects upside, downside-tilted range.
  // Floor the downside multiplier so lowPrice never collapses to 0.
  return {
    lowPrice: latestPrice * Math.max(FAR_LEG_FLOOR, 1 - hw * 2),
    topPrice: latestPrice * (1 + hw),
  };
};

export interface GridPresetPreview {
  /** Calibrated low bound (0 when calibration didn't run). */
  rangeLow: number;
  /** Calibrated high bound (0 when calibration didn't run). */
  rangeHigh: number;
  /** Derived geometric step % (clamped). */
  gridStep: number;
  /** Number of grid lines. */
  levels: number;
  /**
   * Half-width (% of latestPrice) used by the two-tier calibration.
   * Null when calibration didn't run.
   */
  halfWidth: number | null;
  /** True when the preview values came from live MarketStats. */
  isCalibrated: boolean;
}

/**
 * Returns the headline numbers each preset card should display. When
 * calibration data isn't available, falls back to the preset's static
 * `values` and reports `isCalibrated: false` so the picker can show a
 * graceful "no live data" state.
 */
export const getGridPresetPreview = (
  preset: QuickGridPreset,
  stats: MarketStats | null,
  strategy: GridRangeDirection | undefined
): GridPresetPreview => {
  const levels = clamp(
    Number(preset.values.levels ?? preset.calibration.levels),
    LEVELS_MIN,
    LEVELS_MAX
  );
  if (!canCalibrate(stats)) {
    return {
      rangeLow: 0,
      rangeHigh: 0,
      gridStep: Number(preset.values.gridStep ?? 0),
      levels,
      halfWidth: null,
      isCalibrated: false,
    };
  }
  const halfWidth = computeHalfWidthPct(stats, preset.calibration);
  if (!Number.isFinite(halfWidth) || halfWidth <= 0) {
    return {
      rangeLow: 0,
      rangeHigh: 0,
      gridStep: Number(preset.values.gridStep ?? 0),
      levels,
      halfWidth: null,
      isCalibrated: false,
    };
  }
  const { lowPrice, topPrice } = computeRange(
    stats.latestPrice,
    halfWidth,
    strategy
  );
  const gridStep = computeGeometricStep(topPrice, lowPrice, levels);
  return {
    rangeLow: lowPrice,
    rangeHigh: topPrice,
    gridStep,
    levels,
    halfWidth,
    isCalibrated: true,
  };
};

/**
 * The Partial<grid> a preset would write into formData. When
 * calibration runs we emit `topPrice`, `lowPrice`, `gridStep`,
 * `levels`, and `gridType`. When it doesn't, we emit the static
 * `values` only — `topPrice` / `lowPrice` stay at 0 (the form's
 * defaults), and the user has to type them in manually.
 *
 * If `fallbackLatestPrice` is provided AND full calibration can't run
 * (no marketStats — paper exchanges, fresh listings), we still
 * synthesize a tiered range around the fallback price using the
 * preset's `floorPct` as the half-width. The result won't match a
 * proper drawdown-aware calibration, but it preserves the tier intent
 * (short = narrow, mid = balanced, long = wide) — much better UX than
 * the tier switch silently leaving the range untouched.
 *
 * Strategy is intentionally NOT included — the user picks direction
 * in the form's Direction row and the picker reads it as input. We
 * don't want preset clicks to overwrite the user's chosen side.
 */
export const getGridPresetFormState = (
  preset: QuickGridPreset,
  stats: MarketStats | null,
  strategy: GridRangeDirection | undefined,
  fallbackLatestPrice: number = 0
): Partial<BotFormData['grid']> => {
  const preview = getGridPresetPreview(preset, stats, strategy);
  if (!preview.isCalibrated) {
    if (Number.isFinite(fallbackLatestPrice) && fallbackLatestPrice > 0) {
      const halfWidth = clamp(
        preset.calibration.floorPct,
        HALF_WIDTH_MIN,
        HALF_WIDTH_MAX
      );
      const { lowPrice, topPrice } = computeRange(
        fallbackLatestPrice,
        halfWidth,
        strategy
      );
      const gridStep = computeGeometricStep(topPrice, lowPrice, preview.levels);
      return {
        ...preset.values,
        topPrice: round(topPrice, 8),
        lowPrice: round(lowPrice, 8),
        gridStep: round(gridStep, 4),
        levels: preview.levels,
        gridType: preset.calibration.gridType,
      };
    }
    return {
      ...preset.values,
      levels: preview.levels,
    };
  }
  return {
    ...preset.values,
    topPrice: round(preview.rangeHigh, 8),
    lowPrice: round(preview.rangeLow, 8),
    gridStep: round(preview.gridStep, 4),
    levels: preview.levels,
    gridType: preset.calibration.gridType,
  };
};

/**
 * Full grid-slice state a preset produces: defaults overlaid with the
 * preset's (optionally calibrated) values. Used both to apply the
 * preset and to detect when the user has tuned the form away from it.
 */
export const getGridPresetState = (
  preset: QuickGridPreset,
  stats: MarketStats | null = null,
  strategy: GridRangeDirection | undefined = undefined
): BotFormData['grid'] =>
  ({
    ...GRID_FORM_DEFAULTS,
    ...getGridPresetFormState(preset, stats, strategy),
  }) as BotFormData['grid'];
