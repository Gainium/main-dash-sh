import {
  CloseConditionEnum,
  StrategyEnum,
  TrailingModeEnum,
  type DCABotSettings,
  type DCADeals,
} from '@/types';

/**
 * Trailing / stop-loss state of one open deal, derived the same way the bot
 * engine derives it (`core/src/bot/dcaHelper.ts` in main-app).
 *
 * The engine keeps the *live* trailing stop in three persisted deal fields —
 * `trailingMode`, `trailingLevel` and `bestPrice` — written together by
 * `triggerTrailing`. Everything else it uses (the arm price, the effective
 * stop-loss price, the move-SL trigger) lives only in the worker's memory, so
 * the dashboard has to recompute it from the deal's own settings.
 *
 * Two rules this module exists to keep straight:
 *
 * 1. **`trailingMode` is a latch, not a hint.** `getDealStopLossPrice` refuses
 *    to return a trailing exit unless `trailingMode && trailingLevel` are both
 *    truthy, so a deal whose price is deep past its trailing-TP arm price is
 *    still NOT trailing while those fields are empty. Never infer "trailing"
 *    from `bestPrice` alone — `bestPrice` is written on every new extreme
 *    whether or not trailing ever armed.
 * 2. **Deal settings win over bot settings.** The engine merges them as
 *    `{ ...botSettings, ...deal.settings }`, so a deal opened before a setting
 *    changed keeps its own snapshot. Read the merged view, never the bot's.
 */
export interface DealTrailingInfo {
  /** Armed mode straight off the deal, or null when nothing is armed. */
  mode: TrailingModeEnum | null;
  /** Armed trailing stop price. 0 when not armed. */
  level: number;
  /** `mode` is set AND `level` is a usable price — the engine will exit here. */
  active: boolean;
  /** Short badge label, e.g. `Trailing TP`. Empty when not active. */
  label: string;
  /** Long tooltip / chart-label text. Empty when not active. */
  description: string;
  /**
   * Trailing TP is configured on this deal but has not armed yet — price has
   * not reached {@link armPrice}. Mutually exclusive with `active`.
   */
  pending: boolean;
  /**
   * Price at which trailing TP arms: `avg * (1 + tpPerc/100 + 2 * takerFee)`
   * for a long. 0 when trailing TP isn't configured.
   */
  armPrice: number;
  /** Trailing deviation in percent (`trailingTpPerc` / `slPerc`). */
  deviationPerc: number;
  /** Running high (long) / low (short) the engine has recorded. 0 when none. */
  bestPrice: number;
}

const EMPTY_TRAILING: DealTrailingInfo = {
  mode: null,
  level: 0,
  active: false,
  label: '',
  description: '',
  pending: false,
  armPrice: 0,
  deviationPerc: 0,
  bestPrice: 0,
};

export interface DealSlInfo {
  /** Effective stop-loss price, or 0 when the deal has no usable stop. */
  price: number;
  /** Move SL is configured on this deal. */
  moveSlEnabled: boolean;
  /** Move SL has fired — `settings.slPerc` now holds `moveSLValue`. */
  moveSlActivated: boolean;
  /** Price that fires move SL. 0 when move SL isn't configured/still relevant. */
  moveSlTriggerPrice: number;
  /** Label for {@link price}, e.g. `Stop loss (moved)`. */
  label: string;
}

const EMPTY_SL: DealSlInfo = {
  price: 0,
  moveSlEnabled: false,
  moveSlActivated: false,
  moveSlTriggerPrice: 0,
  label: '',
};

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(`${value ?? ''}`);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** `checkNumber` in the engine: present, numeric and non-zero. */
const isSetNumber = (value: unknown): boolean =>
  value !== undefined && value !== null && `${value}` !== '' && num(value) !== 0;

/**
 * Reference price every TP/SL/trailing formula measures from.
 *
 * The engine writes this as `settings.avgPrice ?? deal.avgPrice`, and that `??`
 * is a live bug: an edited deal can end up with `settings.avgPrice === 0`, and
 * `0 ?? x` is `0`, which silently zeroes the trailing-TP arm price so trailing
 * never arms. We use `||` so the dashboard still draws the line the user
 * expects rather than inheriting the engine's blind spot.
 */
export const dealAvgPrice = (
  deal: Pick<DCADeals, 'avgPrice' | 'settings'>
): number => num(deal.settings?.avgPrice) || num(deal.avgPrice);

/** Merged settings, deal-first — mirrors the engine's `getAggregatedSettings`. */
export const mergeDealSettings = (
  botSettings: Partial<DCABotSettings> | undefined,
  deal: Pick<DCADeals, 'settings'> | null | undefined
): Partial<DCABotSettings> => ({
  ...(botSettings ?? {}),
  ...((deal?.settings as Partial<DCABotSettings>) ?? {}),
});

/** True when trailing TP is configured such that the engine would watch it. */
const trailingTpConfigured = (s: Partial<DCABotSettings>): boolean =>
  Boolean(
    s.useTp &&
      s.dealCloseCondition === CloseConditionEnum.tp &&
      s.trailingTp &&
      isSetNumber(s.trailingTpPerc) &&
      isSetNumber(s.tpPerc) &&
      !s.useMultiTp
  );

/** True when trailing SL is configured such that the engine would watch it. */
const trailingSlConfigured = (s: Partial<DCABotSettings>): boolean =>
  Boolean(
    s.useSl &&
      s.dealCloseConditionSL === CloseConditionEnum.tp &&
      s.trailingSl &&
      isSetNumber(s.slPerc) &&
      !s.useMultiSl
  );

/**
 * Resolves a deal's trailing state for display.
 *
 * @param deal      the raw deal (NOT the lossy `TradeDetails`).
 * @param settings  merged bot+deal settings ({@link mergeDealSettings}).
 * @param takerFee  taker fee rate (e.g. 0.001). The engine adds `2 * taker` to
 *                  the arm threshold as the round-trip displacement.
 */
export function getDealTrailing(
  deal: Pick<
    DCADeals,
    'avgPrice' | 'settings' | 'trailingMode' | 'trailingLevel' | 'bestPrice'
  > | null
  | undefined,
  settings: Partial<DCABotSettings>,
  takerFee = 0
): DealTrailingInfo {
  if (!deal) return EMPTY_TRAILING;

  const hasTp = trailingTpConfigured(settings);
  const hasSl = trailingSlConfigured(settings);
  if (!hasTp && !hasSl) return EMPTY_TRAILING;

  const isLong = (settings.strategy ?? StrategyEnum.long) === StrategyEnum.long;
  const long = isLong ? 1 : -1;
  const avg = dealAvgPrice(deal);
  const bestPrice = num(deal.bestPrice);
  const level = num(deal.trailingLevel);
  const mode = (deal.trailingMode as TrailingModeEnum | undefined) ?? null;
  const active = Boolean(mode) && level > 0;

  // Trailing-TP arm price, exactly as `getTrailingSettings` computes it.
  let armPrice = 0;
  if (hasTp) {
    armPrice =
      settings.useFixedTPPrices && isSetNumber(settings.fixedTpPrice)
        ? num(settings.fixedTpPrice)
        : avg * (1 + long * (num(settings.tpPerc) / 100 + takerFee * 2));
  }

  const deviationPerc =
    mode === TrailingModeEnum.tsl || (!mode && hasSl && !hasTp)
      ? num(settings.slPerc)
      : num(settings.trailingTpPerc);

  if (!active) {
    return {
      ...EMPTY_TRAILING,
      armPrice,
      deviationPerc,
      bestPrice,
      pending: hasTp && armPrice > 0,
    };
  }

  const isTsl = mode === TrailingModeEnum.tsl;
  const label = isTsl ? 'Trailing SL' : 'Trailing TP';
  const description = isTsl
    ? 'Trailing stop loss'
    : 'Trailing take profit';

  return {
    mode,
    level,
    active: true,
    label,
    description,
    pending: false,
    armPrice,
    deviationPerc,
    bestPrice,
  };
}

/**
 * Resolves a deal's effective stop-loss price, including a moved stop.
 *
 * Move SL leaves no price field behind — on activation the engine simply
 * overwrites `settings.slPerc` with `moveSLValue` and flips `moveSlActivated`,
 * so the price has to be recomputed here (`getDealStopLossPrice`).
 *
 * Returns `price: 0` when the deal has no drawable stop: either SL is off, or
 * `slPerc` is at/below -100% (the "never stop out" setting), which would put
 * the line at ~0 and collapse the chart's price scale.
 */
export function getDealSl(
  deal: Pick<DCADeals, 'avgPrice' | 'settings' | 'moveSlActivated'> | null | undefined,
  settings: Partial<DCABotSettings>,
  takerFee = 0
): DealSlInfo {
  if (!deal || !settings.useSl) return EMPTY_SL;
  // A trailing stop is drawn from `trailingLevel` instead — see getDealTrailing.
  if (trailingSlConfigured(settings)) return EMPTY_SL;

  const isLong = (settings.strategy ?? StrategyEnum.long) === StrategyEnum.long;
  const long = isLong ? 1 : -1;
  const avg = dealAvgPrice(deal);
  if (avg <= 0) return EMPTY_SL;

  const moveSlEnabled = Boolean(
    settings.moveSL &&
      isSetNumber(settings.moveSLTrigger) &&
      isSetNumber(settings.moveSLValue) &&
      !settings.useFixedSLPrices
  );
  const moveSlActivated = Boolean(deal.moveSlActivated);

  const slPerc = num(settings.slPerc);
  const fee = settings.useFixedSLPrices ? 0 : takerFee * 2;

  const price =
    settings.useFixedSLPrices && isSetNumber(settings.fixedSlPrice)
      ? num(settings.fixedSlPrice)
      : slPerc <= -100
        ? 0
        : avg * (1 + long * (slPerc / 100 + fee));

  const moveSlTriggerPrice =
    moveSlEnabled && !moveSlActivated
      ? avg * (1 + long * (num(settings.moveSLTrigger) / 100 + takerFee * 2))
      : 0;

  return {
    price: price > 0 ? price : 0,
    moveSlEnabled,
    moveSlActivated,
    moveSlTriggerPrice,
    label: moveSlActivated ? 'Stop loss (moved)' : 'Stop loss',
  };
}
