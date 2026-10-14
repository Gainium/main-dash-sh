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

type DcaSettings = Pick<
  DCABotSettings,
  | 'useDca'
  | 'dcaCondition'
  | 'scaleDcaType'
  | 'dcaVolumeBaseOn'
  | 'orderSizeType'
  | 'useRiskReward'
  | 'ordersCount'
  | 'orderSize'
  | 'step'
  | 'stepScale'
  | 'volumeScale'
>;

/**
 * Whether the engine carries this bot's DCA ladder to a merged deal: a plain
 * percentage ladder sized in quote or base. Same rule as `mergeDcaSupported`
 * in the engine.
 */
export function mergeDcaSupported(
  settings: Partial<DcaSettings> | undefined
): boolean {
  if (!settings?.useDca || settings.useRiskReward) return false;
  const condition = settings.dcaCondition as string | undefined;
  const scale = settings.scaleDcaType as string | undefined;
  return (
    (!condition || condition === 'percentage') &&
    (!scale || scale === 'percentage') &&
    (settings.dcaVolumeBaseOn as string | undefined) !== 'change' &&
    (settings.orderSizeType === 'quote' || settings.orderSizeType === 'base')
  );
}

export interface MergeDcaLevel {
  price: number;
  /** Distance from the merged average, in percent. */
  deviation: number;
  /** Order value in quote. */
  cost: number;
  qty: number;
  /** Quote the deal holds once this level has filled. */
  total: number;
  /** Average entry price once this level has filled. */
  avgAfter: number;
}

/**
 * The ladder the merged deal would place: the bot's percentage ladder started
 * from the merged average (each level `step × stepScale^(i-1)` of it beyond
 * the one before), sized `orderSize × volumeScale^(i-1)`. The engine rounds
 * prices to the tick, so these are estimates.
 */
export function mergeDcaLadder(
  settings: Partial<DcaSettings>,
  merged: Pick<DealMergeFigures, 'avg' | 'position'>,
  isLong: boolean,
  levels: number
): MergeDcaLevel[] {
  const avg = merged.avg;
  const step = Number(settings.step ?? '1') / 100;
  const stepScale = Number(settings.stepScale ?? '1');
  const volumeScale = Number(settings.volumeScale ?? '1');
  const size = Number(settings.orderSize ?? '0');
  if (!avg || !(step > 0) || !(size > 0)) return [];
  const sizeInBase = settings.orderSizeType === 'base';
  const out: MergeDcaLevel[] = [];
  let level = avg;
  let base = merged.position;
  let quote = merged.position * avg;
  for (let i = 1; i <= levels; i++) {
    level -= (isLong ? 1 : -1) * avg * step * stepScale ** (i - 1);
    if (level <= 0) break;
    const scaled = size * volumeScale ** (i - 1);
    const qty = sizeInBase ? scaled : scaled / level;
    const cost = qty * level;
    base += qty;
    quote += cost;
    out.push({
      price: level,
      deviation: (Math.abs(level - avg) / avg) * 100,
      cost,
      qty,
      total: quote,
      avgAfter: quote / base,
    });
  }
  return out;
}
