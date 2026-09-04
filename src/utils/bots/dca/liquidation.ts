/**
 * Estimated liquidation price for leveraged (futures) DCA / combo ladders.
 *
 * This is a CLIENT-SIDE ESTIMATE, deliberately labelled "Est." everywhere it
 * surfaces. Gainium never receives a maintenance-margin bracket table from the
 * exchanges (`getLeverageBracket` returns max leverage / step / min only — see
 * `LeverageBracket`), so the maintenance-margin rate is an assumption, not a
 * fact. The number is meant to answer "roughly where does liquidation sit, and
 * how does each safety order move it?", not to be reconciled against the
 * exchange's own figure to the tick.
 *
 * Model (isolated margin, linear contracts), long:
 *   equity      = margin + (P - entry) * qty
 *   maintenance = mmr * P * qty
 *   margin      = entry * qty / leverage
 *   liquidation when equity == maintenance
 *     => P = entry * (1 - 1/L) / (1 - mmr)
 * short:
 *     => P = entry * (1 + 1/L) / (1 + mmr)
 *
 * With leverage <= 1 there is no liquidation (0 for long, +inf for short).
 */

import { BotOrderSideEnum, StrategyEnum, type DCAGrid } from '@/types';

/**
 * Fallback maintenance-margin rate when the exchange tier is unknown.
 * 0.5% is the common tier-1 rate on Binance/Bybit USDⓈ-M majors.
 */
export const DEFAULT_MAINTENANCE_MARGIN_RATE = 0.005;

export type LiquidationSide = 'long' | 'short';

export interface LiquidationParams {
  side: LiquidationSide;
  leverage: number;
  /** Maintenance-margin rate as a fraction (0.005 = 0.5%). */
  maintenanceMarginRate?: number;
}

/** Single-position estimated liquidation price. Returns null when N/A. */
export const estimateLiquidationPrice = (
  entryPrice: number,
  { side, leverage, maintenanceMarginRate }: LiquidationParams
): number | null => {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
  if (!Number.isFinite(leverage) || leverage <= 1) return null;

  const mmr = Number.isFinite(maintenanceMarginRate as number)
    ? (maintenanceMarginRate as number)
    : DEFAULT_MAINTENANCE_MARGIN_RATE;

  const price =
    side === 'long'
      ? (entryPrice * (1 - 1 / leverage)) / (1 - mmr)
      : (entryPrice * (1 + 1 / leverage)) / (1 + mmr);

  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
};

/**
 * Price formatting for liquidation figures. Deliberately NOT `formatNumber`,
 * which abbreviates ("73.5K") — a liquidation price a user compares against
 * their exchange has to be readable to the tick.
 */
export const formatLiquidationPrice = (price: number): string => {
  if (!Number.isFinite(price)) return '—';
  const decimals = price >= 1000 ? 2 : price >= 1 ? 4 : 8;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/** Signed distance from `price` to `liquidation`, as a positive % buffer. */
export const liquidationDistancePercent = (
  price: number,
  liquidationPrice: number
): number | null => {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(liquidationPrice) || liquidationPrice <= 0) return null;
  return (Math.abs(price - liquidationPrice) / price) * 100;
};

export type LiquidationRisk = 'safe' | 'caution' | 'danger';

/** Green above 20% buffer, amber 8-20%, red below 8%. */
export const liquidationRisk = (bufferPercent: number | null): LiquidationRisk => {
  if (bufferPercent == null) return 'safe';
  if (bufferPercent < 8) return 'danger';
  if (bufferPercent < 20) return 'caution';
  return 'safe';
};

export interface LadderLiquidationStep {
  /** Index into the entry-order ladder (0 = base order). */
  index: number;
  orderId: string;
  /** Price of the order that fills at this step. */
  orderPrice: number;
  /** Weighted average entry once this order has filled. */
  avgPrice: number;
  /** Estimated liquidation price for the position after this fill. */
  liquidationPrice: number | null;
  /** Buffer from this order's price down (long) / up (short) to liquidation, %. */
  bufferPercent: number | null;
  risk: LiquidationRisk;
  /**
   * True when filling this order pushes liquidation past the trigger of the
   * NEXT safety order — i.e. the ladder liquidates before it can finish
   * deploying (the "cascade" the community thread describes).
   */
  cascade: boolean;
}

export interface LadderLiquidation {
  side: LiquidationSide;
  leverage: number;
  maintenanceMarginRate: number;
  steps: LadderLiquidationStep[];
  /** Liquidation after the base order only (nothing else filled). */
  initial: LadderLiquidationStep | null;
  /** Liquidation once the whole ladder has filled. */
  final: LadderLiquidationStep | null;
  /**
   * The liquidation the position would ACTUALLY hit. Walking the ladder down,
   * each fill lowers (long) the liquidation price — unless a fill leaves
   * liquidation above the next safety order's trigger, in which case the deal
   * liquidates there and the rest of the ladder never deploys. That first
   * cascading step is the operative number; with no cascade it is `final`.
   */
  effective: LadderLiquidationStep | null;
  /** Steps whose fill would push liquidation past the next order's trigger. */
  cascadeSteps: LadderLiquidationStep[];
  /** Worst (highest-risk) rating across the ladder. */
  risk: LiquidationRisk;
}

const ENTRY_TYPES = new Set(['Start order', 'DCA order', 'Smart order']);

/**
 * Per-step liquidation projection across a DCA / combo entry ladder.
 *
 * Margin scales with notional (each safety order brings its own margin), so
 * for isolated margin the whole position collapses to the single-entry formula
 * evaluated at the running weighted-average entry — which the ladder already
 * carries as `avgPrice`.
 */
export const computeLadderLiquidation = (
  orders: DCAGrid[],
  params: LiquidationParams
): LadderLiquidation | null => {
  const { side, leverage } = params;
  if (!Number.isFinite(leverage) || leverage <= 1) return null;

  const mmr = Number.isFinite(params.maintenanceMarginRate as number)
    ? (params.maintenanceMarginRate as number)
    : DEFAULT_MAINTENANCE_MARGIN_RATE;

  const entries = orders.filter(
    (o) => !o.hide && ENTRY_TYPES.has(String(o.type ?? 'Smart order'))
  );
  if (entries.length === 0) return null;

  const steps: LadderLiquidationStep[] = entries.map((order, index) => {
    const avgPrice =
      Number.isFinite(order.avgPrice as number) && (order.avgPrice as number) > 0
        ? (order.avgPrice as number)
        : order.price;
    const liquidationPrice = estimateLiquidationPrice(avgPrice, {
      side,
      leverage,
      maintenanceMarginRate: mmr,
    });
    const bufferPercent =
      liquidationPrice != null
        ? liquidationDistancePercent(order.price, liquidationPrice)
        : null;

    const next = entries[index + 1];
    const cascade =
      liquidationPrice != null && next != null
        ? side === 'long'
          ? liquidationPrice >= next.price
          : liquidationPrice <= next.price
        : false;

    return {
      index,
      orderId: order.id,
      orderPrice: order.price,
      avgPrice,
      liquidationPrice,
      bufferPercent,
      risk: liquidationRisk(bufferPercent),
      cascade,
    };
  });

  const cascadeSteps = steps.filter((s) => s.cascade);
  const order: Record<LiquidationRisk, number> = {
    safe: 0,
    caution: 1,
    danger: 2,
  };
  const risk = steps.reduce<LiquidationRisk>(
    (worst, s) => (order[s.risk] > order[worst] ? s.risk : worst),
    'safe'
  );

  return {
    side,
    leverage,
    maintenanceMarginRate: mmr,
    steps,
    initial: steps[0] ?? null,
    final: steps[steps.length - 1] ?? null,
    effective: cascadeSteps[0] ?? steps[steps.length - 1] ?? null,
    cascadeSteps,
    risk: cascadeSteps.length > 0 ? 'danger' : risk,
  };
};


/**
 * Liquidation projection for a LIVE deal.
 *
 * The form's ladder starts from an empty position; an open deal starts from the
 * position it already holds, and only its still-resting safety orders can move
 * the average entry from here. Step 0 is therefore the position as it stands
 * (`avgPrice`, `positionQty`), and each subsequent step folds in one pending
 * entry order at its resting price.
 */
export interface DealLiquidationContext extends LiquidationParams {
  /** Weighted average entry of the position held right now. */
  avgPrice: number;
  /** Size of that position, in base units (sign ignored). */
  positionQty: number;
}

export const computeDealLiquidation = (
  orders: DCAGrid[],
  ctx: DealLiquidationContext
): LadderLiquidation | null => {
  const { side, leverage, avgPrice, positionQty } = ctx;
  if (!Number.isFinite(leverage) || leverage <= 1) return null;
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
  if (!Number.isFinite(positionQty) || positionQty <= 0) return null;

  const mmr = Number.isFinite(ctx.maintenanceMarginRate as number)
    ? (ctx.maintenanceMarginRate as number)
    : DEFAULT_MAINTENANCE_MARGIN_RATE;

  // Still-resting entry orders, in the order price would reach them: further
  // from the current average entry each time (down for a long, up for a short).
  //
  // Classified by SIDE, not by `type`: a deal's chart orders carry the raw
  // backend `typeOrder` ('dealRegular', 'dealTP', …) while the form's ladder
  // carries the display enum ('DCA order', 'TP order', …). The side is the same
  // in both vocabularies, and it already excludes the exits — a long's TP/SL is
  // a SELL, a short's is a BUY.
  const entrySide = side === 'long' ? BotOrderSideEnum.buy : BotOrderSideEnum.sell;
  const pending = orders
    .filter(
      (o) =>
        !o.hide &&
        o.side === entrySide &&
        Number.isFinite(o.price) &&
        o.price > 0 &&
        Number.isFinite(o.qty) &&
        o.qty > 0 &&
        (side === 'long' ? o.price < avgPrice : o.price > avgPrice)
    )
    .sort((a, b) => (side === 'long' ? b.price - a.price : a.price - b.price));

  const makeStep = (
    index: number,
    orderId: string,
    orderPrice: number,
    runningAvg: number
  ): LadderLiquidationStep => {
    const liquidationPrice = estimateLiquidationPrice(runningAvg, {
      side,
      leverage,
      maintenanceMarginRate: mmr,
    });
    const bufferPercent =
      liquidationPrice != null
        ? liquidationDistancePercent(orderPrice, liquidationPrice)
        : null;
    return {
      index,
      orderId,
      orderPrice,
      avgPrice: runningAvg,
      liquidationPrice,
      bufferPercent,
      risk: liquidationRisk(bufferPercent),
      cascade: false,
    };
  };

  const steps: LadderLiquidationStep[] = [
    makeStep(0, 'deal-position', avgPrice, avgPrice),
  ];

  let qty = positionQty;
  let notional = avgPrice * positionQty;
  pending.forEach((order, i) => {
    qty += order.qty;
    notional += order.price * order.qty;
    steps.push(makeStep(i + 1, order.id, order.price, notional / qty));
  });

  // A step cascades when, once it fills, liquidation already sits past the next
  // resting order — that order never fills, the deal liquidates first.
  steps.forEach((step, i) => {
    const next = steps[i + 1];
    if (!next || step.liquidationPrice == null) return;
    step.cascade =
      side === 'long'
        ? step.liquidationPrice >= next.orderPrice
        : step.liquidationPrice <= next.orderPrice;
  });

  const cascadeSteps = steps.filter((s) => s.cascade);
  const rank: Record<LiquidationRisk, number> = {
    safe: 0,
    caution: 1,
    danger: 2,
  };
  const risk = steps.reduce<LiquidationRisk>(
    (worst, s) => (rank[s.risk] > rank[worst] ? s.risk : worst),
    'safe'
  );

  return {
    side,
    leverage,
    maintenanceMarginRate: mmr,
    steps,
    initial: steps[0] ?? null,
    final: steps[steps.length - 1] ?? null,
    effective: cascadeSteps[0] ?? steps[steps.length - 1] ?? null,
    cascadeSteps,
    risk: cascadeSteps.length > 0 ? 'danger' : risk,
  };
};

/**
 * Pull the liquidation inputs out of a deal + its bot's settings. Per-deal
 * setting overrides win over the bot's, matching `mergeDealSettings`. Returns
 * null for spot, leverage <= 1, or a deal with no position yet.
 */
export const buildDealLiquidationContext = (
  botSettings:
    | { futures?: boolean; leverage?: number; strategy?: string }
    | null
    | undefined,
  deal:
    | {
        avgPrice?: number;
        strategy?: string;
        currentBalances?: { base?: number };
        settings?: { futures?: boolean; leverage?: number };
      }
    | null
    | undefined
): DealLiquidationContext | null => {
  if (!deal) return null;

  const futures = deal.settings?.futures ?? botSettings?.futures;
  if (!futures) return null;

  const leverage = Number(deal.settings?.leverage ?? botSettings?.leverage ?? 0);
  if (!(leverage > 1)) return null;

  const avgPrice = Number(deal.avgPrice ?? 0);
  const positionQty = Math.abs(Number(deal.currentBalances?.base ?? 0));
  if (!(avgPrice > 0) || !(positionQty > 0)) return null;

  return {
    side: strategyToLiquidationSide(deal.strategy ?? botSettings?.strategy),
    leverage,
    avgPrice,
    positionQty,
  };
};

/** Map a bot `strategy` setting onto the liquidation side. */
export const strategyToLiquidationSide = (
  strategy: string | undefined | null
): LiquidationSide => (strategy === StrategyEnum.short ? 'short' : 'long');
