// Hedge bots on spot: the per-leg start action (main-app spec 044 phase 3).
//
// A hedge DCA / hedge combo bot on spot starts each leg with an action
// (`ActionsEnum`, sent as `changeStatus.hedgeConfig`). This module holds the
// pure parts of the start dialog: which actions a leg offers, which one it
// defaults to, and the funding-preview inputs read off the leg's ladder — the
// same example orders the bot form renders (`createDCAOrders` /
// `createComboOrders`), never a second copy of the ladder maths.
import {
  ActionsEnum,
  DCAOrderTypeEnum,
  StrategyEnum,
  type BotVars,
  type DCAGrid,
} from '@/types';
import { isFuturesExchange } from '@/utils/exchangeUtils';

export type HedgeLegSide = StrategyEnum.long | StrategyEnum.short;

/** One leg of a hedge wrapper, normalised from any of the shapes passed around. */
export interface HedgeStartLeg {
  id: string;
  side: HedgeLegSide;
  exchange: string;
  exchangeUUID: string;
  pair: string;
  baseAsset: string;
  quoteAsset: string;
  futures: boolean;
  useDca: boolean;
  settings: unknown;
  vars: BotVars | null;
}

interface LegShape {
  _id?: string;
  id?: string;
  exchange?: string;
  exchangeUUID?: string;
  pair?: string;
  vars?: BotVars | null;
  settings?: {
    strategy?: string;
    futures?: boolean;
    useDca?: boolean;
    pair?: string[] | string;
  };
  symbol?:
    | { symbol?: string; baseAsset?: string; quoteAsset?: string }
    | { value?: { symbol?: string; baseAsset?: string; quoteAsset?: string } }[];
}

const symbolOf = (leg: LegShape) => {
  const s = leg.symbol;
  return Array.isArray(s) ? s[0]?.value : s;
};

/** A hedge leg read from a raw / list / drawer bot, or null when unusable. */
export function toHedgeStartLeg(raw: unknown): HedgeStartLeg | null {
  const leg = (raw ?? {}) as LegShape;
  const strategy = leg.settings?.strategy;
  if (strategy !== StrategyEnum.long && strategy !== StrategyEnum.short) {
    return null;
  }
  const sym = symbolOf(leg);
  const settingsPair = leg.settings?.pair;
  const pair =
    sym?.symbol ??
    (Array.isArray(settingsPair) ? settingsPair[0] : settingsPair) ??
    leg.pair ??
    '';
  return {
    id: leg._id ?? leg.id ?? '',
    side: strategy,
    exchange: leg.exchange ?? '',
    exchangeUUID: leg.exchangeUUID ?? '',
    pair,
    baseAsset: sym?.baseAsset ?? '',
    quoteAsset: sym?.quoteAsset ?? '',
    // `settings.futures` when present, else the exchange's market type — the
    // rule the server and the reverse action apply.
    futures:
      typeof leg.settings?.futures === 'boolean'
        ? leg.settings.futures
        : isFuturesExchange(leg.exchange),
    useDca: leg.settings?.useDca !== false,
    settings: leg.settings,
    vars: leg.vars ?? null,
  };
}

const pairKey = (value: string | undefined) =>
  (value ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();

/**
 * A leg's price from a price-feed answer, falling back to the last price seen
 * for the pair. The global poll replaces its prices with whatever answered
 * that round, so a pair can drop out of one answer and come back in the next;
 * without the fallback the start dialog would lose its price (and its funding
 * preview) until then. `memory` is the caller's own map — the feed itself is
 * left untouched. `remembered` marks a price not in the latest answer.
 */
export function resolvePairPrice(
  prices: readonly { symbol?: string; exchange?: string; price?: number | string }[],
  leg: Pick<HedgeStartLeg, 'exchange' | 'pair'>,
  memory: Map<string, number>
): { price: number; remembered: boolean } {
  const target = pairKey(leg.pair);
  const key = `${leg.exchange}|${target}`;
  const hit =
    prices.find((p) => p.symbol === leg.pair && p.exchange === leg.exchange) ??
    prices.find(
      (p) =>
        pairKey(p.symbol) === target && (!p.exchange || p.exchange === leg.exchange)
    );
  const price = Number(hit?.price);
  if (target && Number.isFinite(price) && price > 0) {
    memory.set(key, price);
    return { price, remembered: false };
  }
  const last = memory.get(key);
  return last ? { price: last, remembered: true } : { price: 0, remembered: false };
}

/** The legs of a hedge wrapper (`{ bots: [long, short] }`), long first. */
export function hedgeStartLegs(wrapper: unknown): HedgeStartLeg[] {
  const bots = (wrapper as { bots?: unknown[] } | null | undefined)?.bots;
  if (!Array.isArray(bots)) return [];
  return bots
    .map(toHedgeStartLeg)
    .filter((leg): leg is HedgeStartLeg => !!leg)
    .sort((a, b) => (a.side === b.side ? 0 : a.side === StrategyEnum.long ? -1 : 1));
}

/**
 * A hedge whose start needs the per-leg action dialog: at least one spot leg.
 * A payload without its legs (or without their exchange) keeps the plain start.
 */
export const isSpotHedge = (wrapper: unknown): boolean =>
  hedgeStartLegs(wrapper).some((leg) => !leg.futures && !!leg.exchange);

/** The leg's ladder, summed the way the funding planner takes it. */
export interface HedgeLegOrderTotals {
  /** Base order, in base. */
  baseOrderQty: number;
  /** Base order, in quote (qty × price). */
  baseOrderQuote: number;
  /** Σ safety-order qty, in base. */
  safetyQty: number;
  /** Σ safety-order qty × price, in quote. */
  safetyQuote: number;
  /** Number of safety (DCA) levels. */
  safetyLevels: number;
}

/** Combo leg settings the planner needs on top of the ladder sums. */
export interface HedgeComboLegSettings {
  /** The bot's `gridLevel` (engine default 1). */
  gridLevel: number;
  /** The bot places a fee order at deal open. */
  feeOrder: boolean;
}

/**
 * A combo leg's planner settings, read the way the engine reads them:
 * `gridLevel` defaults to 1 (`comboHelper.fundedSafetyQty`), `feeOrder` is the
 * spot setting (futures place none). Pass settings with variables resolved.
 */
export function comboLegSettings(settings: unknown): HedgeComboLegSettings {
  const s = (settings ?? {}) as {
    gridLevel?: string | number | null;
    feeOrder?: boolean | null;
    futures?: boolean | null;
  };
  const gridLevel = +(s.gridLevel ?? '1');
  return {
    gridLevel: Number.isFinite(gridLevel) && gridLevel >= 0 ? gridLevel : 1,
    feeOrder: !s.futures && !!s.feeOrder,
  };
}

/**
 * Sums the example orders the dashboard renders for a leg. Safety orders are
 * every DCA level, including those an active combo minigrid executes (hidden
 * in the table, still committed by the deal); TP / SL / minigrid rows are not
 * funded.
 */
export function sumHedgeLegOrders(orders: readonly DCAGrid[]): HedgeLegOrderTotals {
  const totals: HedgeLegOrderTotals = {
    baseOrderQty: 0,
    baseOrderQuote: 0,
    safetyQty: 0,
    safetyQuote: 0,
    safetyLevels: 0,
  };
  for (const order of orders) {
    const qty = Number(order.qty);
    const price = Number(order.price);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) continue;
    if (order.type === DCAOrderTypeEnum.bo) {
      totals.baseOrderQty += qty;
      totals.baseOrderQuote += qty * price;
    } else if (order.type === DCAOrderTypeEnum.dca) {
      totals.safetyQty += qty;
      totals.safetyQuote += qty * price;
      totals.safetyLevels += 1;
    }
  }
  return totals;
}

/** One leg of the `previewHedgeFunding` input (contract: spec 044 phase 3). */
export interface PreviewHedgeFundingLegInput {
  side: HedgeLegSide;
  action: ActionsEnum;
  baseOrderQty: number;
  safetyQty: number;
  safetyQuote: number;
  useDca: boolean;
  /** Combo legs only (optional, newer API): the bot's `gridLevel`. */
  comboGridLevel?: number;
  /** Combo legs only: the number of safety levels. */
  safetyLevels?: number;
  /** Combo legs only: the bot places a fee order at deal open. */
  feeOrder?: boolean;
}

/** The optional combo-only fields of a leg input. */
export const COMBO_LEG_INPUT_FIELDS = [
  'comboGridLevel',
  'safetyLevels',
  'feeOrder',
] as const;

/**
 * One leg of the preview input. A combo leg (`combo` given) also carries its
 * grid level, level count and fee-order setting; a DCA leg never does.
 */
export function hedgeLegPreviewInput(
  leg: Pick<HedgeStartLeg, 'side' | 'useDca'>,
  action: ActionsEnum,
  totals: HedgeLegOrderTotals,
  combo?: HedgeComboLegSettings
): PreviewHedgeFundingLegInput {
  return {
    side: leg.side,
    action,
    baseOrderQty: totals.baseOrderQty,
    safetyQty: totals.safetyQty,
    safetyQuote: totals.safetyQuote,
    useDca: leg.useDca,
    ...(combo
      ? {
          comboGridLevel: combo.gridLevel,
          safetyLevels: totals.safetyLevels,
          feeOrder: combo.feeOrder,
        }
      : {}),
  };
}

/** The leg input without the combo-only fields (an API that predates them). */
export const withoutComboLegFields = (
  leg: PreviewHedgeFundingLegInput
): PreviewHedgeFundingLegInput => {
  const { comboGridLevel: _g, safetyLevels: _l, feeOrder: _f, ...rest } = leg;
  return rest;
};

/** Actions a spot leg offers, in the legacy dialog's order. */
export function hedgeLegActionOptions(
  side: HedgeLegSide,
  useDca: boolean
): ActionsEnum[] {
  const funding =
    side === StrategyEnum.long
      ? [ActionsEnum.sellDiff, ActionsEnum.sellForAll]
      : [ActionsEnum.buyDiff, ActionsEnum.buyForAll];
  return [
    ActionsEnum.useBalance,
    ...(useDca ? funding : []),
    ActionsEnum.useOppositeBalance,
  ];
}

export function hedgeLegActionLabel(
  action: ActionsEnum,
  side: HedgeLegSide,
  assets: { baseAsset: string; quoteAsset: string }
): string {
  const base = assets.baseAsset || 'base';
  const quote = assets.quoteAsset || 'quote';
  const held = side === StrategyEnum.long ? quote : base;
  const opposite = side === StrategyEnum.long ? base : quote;
  switch (action) {
    case ActionsEnum.useBalance:
      return `Use ${held} balance`;
    case ActionsEnum.buyDiff:
      return `Buy the difference`;
    case ActionsEnum.buyForAll:
      return `Buy for all`;
    case ActionsEnum.sellDiff:
      return `Sell the difference`;
    case ActionsEnum.sellForAll:
      return `Sell for all`;
    case ActionsEnum.useOppositeBalance:
      return `Use ${opposite} balance`;
    case ActionsEnum.noAction:
    default:
      return 'No action';
  }
}

/**
 * The action a leg starts on, as the legacy start dialog chose it: the held
 * balance when it covers the deal, else the funding "difference" action (DCA
 * on), else the opposite balance when that covers it. With nothing covering
 * the deal it stays on the held balance — the funding preview then says what
 * is missing.
 */
export function defaultHedgeLegAction(
  side: HedgeLegSide,
  useDca: boolean,
  totals: HedgeLegOrderTotals,
  free: { base: number; quote: number }
): ActionsEnum {
  const dealBase = totals.baseOrderQty + totals.safetyQty;
  const dealQuote = totals.baseOrderQuote + totals.safetyQuote;
  const [held, need, opposite, oppositeNeed] =
    side === StrategyEnum.long
      ? [free.quote, dealQuote, free.base, dealBase]
      : [free.base, dealBase, free.quote, dealQuote];
  if (need > 0 && held >= need) return ActionsEnum.useBalance;
  if (useDca) {
    return side === StrategyEnum.long ? ActionsEnum.sellDiff : ActionsEnum.buyDiff;
  }
  if (oppositeNeed > 0 && opposite >= oppositeNeed) {
    return ActionsEnum.useOppositeBalance;
  }
  return ActionsEnum.useBalance;
}

/**
 * `changeStatus.hedgeConfig`: the chosen action per spot leg; a futures leg
 * starts on its balance, as in the legacy dialog.
 */
export function buildHedgeConfig(
  legs: readonly Pick<HedgeStartLeg, 'side' | 'futures'>[],
  chosen: Partial<Record<HedgeLegSide, ActionsEnum>>
): Record<HedgeLegSide, ActionsEnum> {
  const pick = (side: HedgeLegSide) => {
    const leg = legs.find((l) => l.side === side);
    if (!leg || leg.futures) return ActionsEnum.useBalance;
    return chosen[side] ?? ActionsEnum.useBalance;
  };
  return {
    [StrategyEnum.long]: pick(StrategyEnum.long),
    [StrategyEnum.short]: pick(StrategyEnum.short),
  } as Record<HedgeLegSide, ActionsEnum>;
}
