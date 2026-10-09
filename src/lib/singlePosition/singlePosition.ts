// Single position per pair (DCA bots): the pure rules the dashboard applies.
//
// A single-position bot holds at most one open deal per pair. A start signal on
// a pair that already has an open deal adds an ENTRY to it, and deals that
// arrive from elsewhere are ADOPTED into it. Everything here is pure, so the
// form, the save confirmation, the move/merge flows and the deal displays all
// agree on one set of rules (and the tests can hold them to it).
import { StartConditionEnum } from '@/types';

/** Server reasons. Shown verbatim; kept here so the client says the same. */
export const SINGLE_POSITION_ASAP_REASON =
  'Single position with ASAP needs a dynamic price filter or a cooldown after deal start';
export const SINGLE_POSITION_START_BOT_REASON =
  'Start the bot to switch it to single position';
/** Prefix of the refusal sent while a pair holds more than one open deal. */
export const SINGLE_POSITION_MULTI_DEAL_PREFIX =
  'Single position: more than one open deal on';
export const SINGLE_POSITION_CLOSE_AFTER_OPENED_MESSAGE =
  '"Stop after X deals opened" is not available with single position per pair: a position never re-opens per signal.';

export const ADOPTION_IRREVERSIBLE_SENTENCE =
  'Open safety orders and take-profit orders of these deals are cancelled and replaced. This cannot be undone.';

/** The server refused because a pair has several open deals (needs `adoptOpenDeals`). */
export const isMultiDealRefusal = (reason: string | null | undefined): boolean =>
  String(reason ?? '')
    .replace(/^(Save failed:\s*|Failed to update bot:\s*)/i, '')
    .trim()
    .startsWith(SINGLE_POSITION_MULTI_DEAL_PREFIX);

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value.trim().replace(',', '.'));
  }
  return NaN;
};

// ─── Max entries ────────────────────────────────────────────────────────────

/** '' / '0' / missing all mean "no limit". */
export const parseMaxPositionEntries = (raw: unknown): number => {
  const n = toNumber(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

/**
 * The wire value: a string like `maxDealsPerPair`, and '0' (not '') for "no
 * limit" because the update path drops empty strings — clearing the field on
 * an edit would otherwise be a no-op.
 */
export const normalizeMaxPositionEntries = (raw: unknown): string => {
  const trimmed = String(raw ?? '').trim();
  return trimmed === '' ? '0' : trimmed;
};

/** Stored '0' reads back as an empty field ("no limit"). */
export const maxPositionEntriesToForm = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  const s = String(raw).trim();
  return s === '0' ? '' : s;
};

/** Null when valid. Whole number, 0/empty = no limit. */
export const maxPositionEntriesError = (raw: unknown): string | null => {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) {
    return 'Max entries per position must be a whole number (empty or 0 = no limit)';
  }
  return null;
};

/** "3/5", or "3" when the position has no entry limit. */
export const formatPositionEntries = (
  entries: number,
  maxEntries?: unknown
): string => {
  const max = parseMaxPositionEntries(maxEntries);
  const n = Math.max(0, Math.trunc(Number(entries) || 0));
  return max > 0 ? `${n}/${max}` : `${n}`;
};

/** A single-position bot's open positions, for its Usage ring. */
export interface BotPositionEntries {
  entries: number;
  positions: number;
  maxPositionEntries: string;
}

/**
 * The Usage ring of a single-position bot. Cost-vs-max says nothing there: a
 * position has no safety ladder, so its max cost is its cost and the ring
 * reads 100% as soon as every deal slot holds a position. Entries are what
 * fill up instead — against the entry limit of the open positions, or as a
 * bare count when the positions have no limit.
 */
export const positionUsageRing = (
  p: BotPositionEntries
): { percent: number; centerText: string; label: string; title: string } => {
  const max = parseMaxPositionEntries(p.maxPositionEntries);
  const capacity = max * p.positions;
  const where = `${p.positions} open position${p.positions === 1 ? '' : 's'}`;
  if (capacity > 0) {
    const percent = Math.min(100, (p.entries / capacity) * 100);
    return {
      percent,
      centerText: `${percent.toFixed(0)}%`,
      label: `${p.entries}/${capacity}`,
      title: `${p.entries} of ${capacity} entries used across ${where}`,
    };
  }
  return {
    percent: 0,
    centerText: `${p.entries}`,
    label: 'entries',
    title: `${p.entries} entries across ${where}, no entry limit`,
  };
};

// ─── §7 ASAP spacing ────────────────────────────────────────────────────────

export interface SinglePositionSpacingSettings {
  singlePosition?: boolean | undefined;
  startCondition?: StartConditionEnum | string | undefined;
  useDynamicPriceFilter?: boolean | undefined;
  dynamicPriceFilterDeviation?: string | number | undefined;
  dynamicPriceFilterDirection?: string | undefined;
  dynamicPriceFilterOverValue?: string | number | undefined;
  dynamicPriceFilterUnderValue?: string | number | undefined;
  useCooldown?: boolean | undefined;
  cooldownAfterDealStart?: boolean | undefined;
  cooldownAfterDealStartInterval?: string | number | undefined;
}

const positive = (value: unknown) => {
  const n = toNumber(value);
  return Number.isFinite(n) && n > 0;
};

/** The dynamic price filter is on and has a deviation for its direction. */
export const hasDynamicPriceSpacing = (
  s: SinglePositionSpacingSettings
): boolean => {
  if (!s.useDynamicPriceFilter) return false;
  // The engine arms the filter only when the deviation field is set.
  if (!positive(s.dynamicPriceFilterDeviation)) return false;
  const direction = s.dynamicPriceFilterDirection ?? 'under';
  if (direction === 'over') return positive(s.dynamicPriceFilterOverValue);
  if (direction === 'overAndUnder') {
    return (
      positive(s.dynamicPriceFilterOverValue) &&
      positive(s.dynamicPriceFilterUnderValue)
    );
  }
  return positive(s.dynamicPriceFilterUnderValue);
};

/** A cooldown after deal start with an interval. */
export const hasStartCooldownSpacing = (
  s: SinglePositionSpacingSettings
): boolean =>
  !!s.useCooldown &&
  !!s.cooldownAfterDealStart &&
  positive(s.cooldownAfterDealStartInterval);

/**
 * §7.1: single position with ASAP needs something that spaces the entries,
 * or every check adds one and fills the position at almost one price.
 */
export const singlePositionAsapError = (
  s: SinglePositionSpacingSettings
): string | null => {
  if (!s.singlePosition) return null;
  if ((s.startCondition ?? StartConditionEnum.asap) !== StartConditionEnum.asap) {
    return null;
  }
  if (hasDynamicPriceSpacing(s) || hasStartCooldownSpacing(s)) return null;
  return SINGLE_POSITION_ASAP_REASON;
};

/** Field updates behind the one-click "Enable dynamic price filter". */
export const enableDynamicPriceFilterPatch = (
  s: SinglePositionSpacingSettings
): Record<string, string | boolean> => {
  const patch: Record<string, string | boolean> = {
    useDynamicPriceFilter: true,
  };
  // The engine arms the filter only when the deviation field is set.
  if (!positive(s.dynamicPriceFilterDeviation)) {
    patch['dynamicPriceFilterDeviation'] = '1';
  }
  const direction = s.dynamicPriceFilterDirection ?? 'under';
  if (
    (direction === 'under' || direction === 'overAndUnder') &&
    !positive(s.dynamicPriceFilterUnderValue)
  ) {
    patch['dynamicPriceFilterUnderValue'] = '5';
  }
  if (
    (direction === 'over' || direction === 'overAndUnder') &&
    !positive(s.dynamicPriceFilterOverValue)
  ) {
    patch['dynamicPriceFilterOverValue'] = '5';
  }
  return patch;
};

/** Field updates behind the one-click "Add cooldown". */
export const addStartCooldownPatch = (
  s: SinglePositionSpacingSettings
): Record<string, string | number | boolean> => {
  const patch: Record<string, string | number | boolean> = {
    useCooldown: true,
    cooldownAfterDealStart: true,
  };
  if (!positive(s.cooldownAfterDealStartInterval)) {
    patch['cooldownAfterDealStartInterval'] = 1;
  }
  return patch;
};

// ─── §5.1.3 / §5.2.3 adoption preview ───────────────────────────────────────

/** The parts of an open deal the preview reads (all from the long-standing deal fields). */
export interface PreviewDeal {
  _id: string;
  symbol: string;
  createTime?: number | string | null | undefined;
  avgPrice?: number | null | undefined;
  strategy?: string | null | undefined;
  initialBalances?: { base?: number | null; quote?: number | null } | null | undefined;
  currentBalances?: { base?: number | null; quote?: number | null } | null | undefined;
  levels?: { all?: number | null; complete?: number | null } | null | undefined;
  settings?: { tpPerc?: string | number | null; useTp?: boolean | null } | null | undefined;
  /**
   * Price of the take profit resting for this deal on the exchange, when it
   * was loaded. Includes whatever the bot adds to the TP % (fees), so it is the
   * figure to show — and the ratio to carry over to the new average.
   */
  restingTpPrice?: number | null | undefined;
}

export interface PreviewBotSettings {
  strategy?: string | null | undefined;
  tpPerc?: string | number | null | undefined;
  useTp?: boolean | null | undefined;
}

export interface AdoptionPreviewRow {
  pair: string;
  /** 'adopt' folds several deals into the oldest; 'ladder' cancels a lone deal's safety orders. */
  kind: 'adopt' | 'ladder';
  dealCount: number;
  targetDealId: string;
  sourceDealIds: string[];
  /** Base quantity of the position before (the target deal) and after. */
  sizeBefore: number;
  sizeAfter: number;
  avgBefore: number;
  /** Size-weighted average of every deal folded in (estimated). */
  avgAfter: number;
  /** The target's resting take profit; estimated from TP % when it was not loaded. */
  tpBefore: number | null;
  /** True when `tpBefore` is the order resting on the exchange, not an estimate. */
  tpBeforeLive: boolean;
  /**
   * Estimated: the resting TP's ratio to the average carried over to the new
   * average, else the bot's TP % over the new average.
   */
  tpAfter: number | null;
}

const isShort = (strategy: unknown) =>
  String(strategy ?? '').toUpperCase() === 'SHORT';

const timeOf = (value: PreviewDeal['createTime']): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
};

/** Filled base quantity of a deal: bought for a long, sold for a short. */
export const dealBaseSize = (deal: PreviewDeal, strategy?: unknown): number => {
  const initial = Number(deal.initialBalances?.base ?? 0) || 0;
  const current = Number(deal.currentBalances?.base ?? 0) || 0;
  const size = isShort(deal.strategy ?? strategy)
    ? initial - current
    : current - initial;
  return size > 0 ? size : 0;
};

export const tpPriceFor = (
  avg: number,
  tpPerc: unknown,
  strategy: unknown
): number | null => {
  const tp = toNumber(tpPerc);
  if (!(avg > 0) || !Number.isFinite(tp)) return null;
  return isShort(strategy) ? avg * (1 - tp / 100) : avg * (1 + tp / 100);
};

const hasUnfilledLadder = (deal: PreviewDeal): boolean => {
  const all = Number(deal.levels?.all ?? 0) || 0;
  const complete = Number(deal.levels?.complete ?? 0) || 0;
  return all > complete && complete > 0;
};

const pairKey = (symbol: string) => symbol.replace(/[^a-z0-9]/gi, '').toUpperCase();

/**
 * One deal's position after `sources` are adopted into `target` (§4): the
 * target keeps its id; sizes add up; the average is size-weighted; the TP is
 * re-derived from the bot's TP % over the new average.
 */
export const previewAdoption = (
  target: PreviewDeal,
  sources: PreviewDeal[],
  bot: PreviewBotSettings
): AdoptionPreviewRow => {
  const strategy = target.strategy ?? bot.strategy;
  const all = [target, ...sources];
  let size = 0;
  let notional = 0;
  for (const deal of all) {
    const s = dealBaseSize(deal, strategy);
    const avg = Number(deal.avgPrice ?? 0) || 0;
    if (s > 0 && avg > 0) {
      size += s;
      notional += s * avg;
    }
  }
  const avgBefore = Number(target.avgPrice ?? 0) || 0;
  const avgAfter = size > 0 ? notional / size : avgBefore;
  const targetUsesTp = target.settings?.useTp ?? bot.useTp ?? true;
  const resting = Number(target.restingTpPrice ?? 0) || 0;
  const tpBeforeLive = resting > 0 && avgBefore > 0;
  const tpBefore = tpBeforeLive
    ? resting
    : targetUsesTp
      ? tpPriceFor(avgBefore, target.settings?.tpPerc ?? bot.tpPerc, strategy)
      : null;
  const tpAfter =
    bot.useTp === false
      ? null
      : tpBeforeLive
        ? avgAfter * (resting / avgBefore)
        : tpPriceFor(avgAfter, bot.tpPerc, strategy);
  return {
    pair: target.symbol,
    kind: sources.length > 0 ? 'adopt' : 'ladder',
    dealCount: all.length,
    targetDealId: target._id,
    sourceDealIds: sources.map((d) => d._id),
    sizeBefore: dealBaseSize(target, strategy),
    sizeAfter: size > 0 ? size : dealBaseSize(target, strategy),
    avgBefore,
    avgAfter,
    tpBefore,
    tpBeforeLive,
    tpAfter,
  };
};

/**
 * §5.1.1 per pair, for a save that turns single position on:
 * - more than one open deal: the OLDEST is the target, the rest are adopted;
 * - exactly one with an unfilled safety-order ladder: the ladder is cancelled;
 * - otherwise nothing changes, so no row.
 */
export const buildAdoptionPreview = (
  openDeals: PreviewDeal[],
  bot: PreviewBotSettings
): AdoptionPreviewRow[] => {
  const byPair = new Map<string, PreviewDeal[]>();
  for (const deal of openDeals) {
    if (!deal?._id || !deal.symbol) continue;
    const key = pairKey(deal.symbol);
    const list = byPair.get(key) ?? [];
    list.push(deal);
    byPair.set(key, list);
  }
  const rows: AdoptionPreviewRow[] = [];
  for (const deals of byPair.values()) {
    const sorted = [...deals].sort(
      (a, b) => timeOf(a.createTime) - timeOf(b.createTime)
    );
    const [target, ...sources] = sorted;
    if (!target) continue;
    if (sources.length === 0 && !hasUnfilledLadder(target)) continue;
    rows.push(previewAdoption(target, sources, bot));
  }
  return rows.sort((a, b) => a.pair.localeCompare(b.pair));
};

/** The pairs that hold more than one open deal (the server's refusal set). */
export const pairsNeedingAdoption = (rows: AdoptionPreviewRow[]): string[] =>
  rows.filter((r) => r.kind === 'adopt').map((r) => r.pair);

/** "BTCUSDT — 3 deals → 1 position" / "ETHUSDT — 1 deal, safety orders cancelled". */
export const adoptionRowTitle = (row: AdoptionPreviewRow): string =>
  row.kind === 'adopt'
    ? `${row.pair} — ${row.dealCount} deals → 1 position`
    : `${row.pair} — 1 deal, safety orders cancelled`;

/**
 * The open deal of a single-position bot that an incoming deal on `symbol`
 * merges into (§5.2.1), or null when the bot has none there. The oldest wins
 * if, against the invariant, several are open.
 */
export const findPositionDeal = <T extends PreviewDeal>(
  openDeals: T[],
  symbol: string,
  excludeIds: readonly string[] = []
): T | null => {
  const want = pairKey(symbol);
  const candidates = openDeals
    .filter((d) => pairKey(d.symbol) === want && !excludeIds.includes(d._id))
    .sort((a, b) => timeOf(a.createTime) - timeOf(b.createTime));
  return candidates[0] ?? null;
};

/**
 * Whether a save turns single position on: it is on in the form and was not
 * on in the saved settings.
 */
export const isTurningSinglePositionOn = (
  saved: boolean | null | undefined,
  next: boolean | null | undefined
): boolean => !!next && !saved;

/** Sizes and prices in the preview: up to 6 significant digits, "—" when unknown. */
export const formatPreviewNumber = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value.toLocaleString('en-US', { maximumSignificantDigits: 6 })
    : '—';

/** Picker label for a single-position bot that already holds the pair (§5.2.3). */
export const mergesIntoPositionLabel = (symbol: string): string =>
  `Merges into your open ${symbol} position`;

export type MoveTargetPlan =
  | { mode: 'adopt'; targetDealId: string }
  | { mode: 'merge' };

/**
 * §5.2.1: a deal moved or merged into a bot is ADOPTED into that bot's open
 * position when the bot is single-position and holds the pair; otherwise the
 * current path (`mergeDeals`) is unchanged.
 */
export const planMoveIntoBot = (
  botId: string,
  singlePositionByBot: Record<string, { singlePosition: boolean } | undefined>,
  positionByBot: Record<string, { _id: string } | undefined>
): MoveTargetPlan => {
  const position = positionByBot[botId];
  if (singlePositionByBot[botId]?.singlePosition && position?._id) {
    return { mode: 'adopt', targetDealId: position._id };
  }
  return { mode: 'merge' };
};
