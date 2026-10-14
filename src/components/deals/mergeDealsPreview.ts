// Preview figures for the merge-deals dialog.
//
// Mirrors the engine's `mergeDealsBody`: the merged deal's average is the
// volume-weighted price of every filled entry order of every source deal
// (base order, safety orders, added funds — everything but take-profit fills),
// and its position is what those entries bought less what was taken off.
import type { CloseConditionEnum, DCABotSettings } from '@/types';

export interface MergePreviewOrder {
  price: string;
  executedQty: string;
  side: string;
  status: string;
  typeOrder?: string | undefined;
}

export interface DealMergeFigures {
  /** Weighted entry price; undefined when the deal has no filled entry. */
  avg: number | undefined;
  /** Position still held, in base. */
  position: number;
  entryBase: number;
  entryQuote: number;
}

const FILLED = new Set(['FILLED', 'PARTIALLY_FILLED']);
const DEAL_ORDER_TYPES = new Set(['dealStart', 'dealRegular', 'dealTP']);

export function dealMergeFigures(
  orders: readonly MergePreviewOrder[],
  isLong: boolean
): DealMergeFigures {
  let entryBase = 0;
  let entryQuote = 0;
  let signed = 0;
  for (const o of orders) {
    if (!FILLED.has(o.status) || !DEAL_ORDER_TYPES.has(o.typeOrder ?? '')) {
      continue;
    }
    const qty = Number(o.executedQty);
    const price = Number(o.price);
    if (!isFinite(qty) || !isFinite(price) || qty <= 0) continue;
    if (o.typeOrder !== 'dealTP') {
      entryBase += qty;
      entryQuote += qty * price;
    }
    signed += o.side === 'BUY' ? qty : -qty;
  }
  return {
    avg: entryBase > 0 ? entryQuote / entryBase : undefined,
    position: Math.max(0, isLong ? signed : -signed),
    entryBase,
    entryQuote,
  };
}

export function mergedFigures(
  deals: readonly DealMergeFigures[]
): DealMergeFigures {
  const entryBase = deals.reduce((a, d) => a + d.entryBase, 0);
  const entryQuote = deals.reduce((a, d) => a + d.entryQuote, 0);
  return {
    avg: entryBase > 0 ? entryQuote / entryBase : undefined,
    position: deals.reduce((a, d) => a + d.position, 0),
    entryBase,
    entryQuote,
  };
}

/** What the merged deal would get from the bot for one exit. */
export type MergeExit =
  | { kind: 'none'; reason: string }
  | { kind: 'price'; price: number; perc: number; extra?: string | undefined }
  | { kind: 'other'; label: string };

type ExitSettings = Pick<
  DCABotSettings,
  | 'useTp'
  | 'tpPerc'
  | 'dealCloseCondition'
  | 'useMultiTp'
  | 'trailingTp'
  | 'useSl'
  | 'slPerc'
  | 'dealCloseConditionSL'
  | 'useMultiSl'
  | 'trailingSl'
  | 'moveSL'
  | 'useRiskReward'
>;

const CONDITION_LABEL: Partial<Record<CloseConditionEnum, string>> = {
  techInd: 'Indicator close',
  webhook: 'Webhook close',
  manual: 'Manual close',
};

/**
 * The bot's take profit or stop loss as the merged deal would carry it. Same
 * rule as the engine: risk-reward and dynamic-AR exits are never followed —
 * they are sized from what their deal opened with.
 */
export function mergeExit(
  which: 'tp' | 'sl',
  settings: Partial<ExitSettings> | undefined,
  avg: number | undefined,
  isLong: boolean
): MergeExit {
  if (!settings) return { kind: 'none', reason: 'Bot settings not loaded' };
  const tp = which === 'tp';
  const enabled = tp ? settings.useTp : settings.useSl;
  if (!enabled) {
    return {
      kind: 'none',
      reason: tp ? 'The bot has no take profit' : 'The bot has no stop loss',
    };
  }
  const condition = tp
    ? settings.dealCloseCondition
    : settings.dealCloseConditionSL;
  if (settings.useRiskReward || condition === 'dynamicAr') {
    return {
      kind: 'none',
      reason: settings.useRiskReward
        ? 'Risk-reward exits cannot be carried to a merged deal'
        : 'Dynamic exits cannot be carried to a merged deal',
    };
  }
  if (condition && condition !== 'tp') {
    return { kind: 'other', label: CONDITION_LABEL[condition] ?? condition };
  }
  if (tp ? settings.useMultiTp : settings.useMultiSl) {
    return { kind: 'other', label: 'Multiple targets' };
  }
  const perc = Math.abs(Number(tp ? settings.tpPerc : settings.slPerc));
  if (!avg || !isFinite(perc) || perc <= 0) {
    return { kind: 'other', label: 'As the bot' };
  }
  const up = tp === isLong;
  const extra = tp
    ? settings.trailingTp
      ? 'trailing'
      : undefined
    : settings.trailingSl
      ? 'trailing'
      : settings.moveSL
        ? 'moves to break-even'
        : undefined;
  return {
    kind: 'price',
    price: avg * (1 + ((up ? 1 : -1) * perc) / 100),
    perc,
    extra,
  };
}

/** True when the market is already past the exit price: it fills at once. */
export function exitAlreadyReached(
  which: 'tp' | 'sl',
  exitPrice: number,
  market: number | undefined,
  isLong: boolean
): boolean {
  if (!market) return false;
  const above = market >= exitPrice;
  return which === 'tp' ? above === isLong : above !== isLong;
}
