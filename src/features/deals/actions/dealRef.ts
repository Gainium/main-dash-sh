// One normalized deal shape for every per-deal action surface.
//
// Deal rows reach the menus in several shapes: the trades table rows, the card
// rows, the bot drawer rows and the bot-page history rows. Each used to decide
// on its own what kind of deal it was holding, and they disagreed. The adapters
// below are the only place a deal's kind is derived; everything that gates or
// routes an action reads `DealRef.kind`.
import type { PercentBasis } from '@/features/bots/shared/runtime/dialogs/adjustFundsAmount';
import { BotTypesEnum } from '@/types';
import type { TransformedTrade } from '@/types/dcaDeal';
import { extractPairAssets } from '@/utils/pairs';

export type DealKind =
  | 'dca'
  | 'combo'
  | 'hedgeDca'
  | 'hedgeCombo'
  | 'terminal'
  | 'grid';

export const DEAL_KINDS: readonly DealKind[] = [
  'dca',
  'combo',
  'hedgeDca',
  'hedgeCombo',
  'terminal',
  'grid',
];

/**
 * The trade rows the deal tables and cards render. The trades table rows carry
 * a few extra fields of their own (`dealId`, `settings.futures`, flat asset
 * names, an exit time), read here when present.
 */
export type DealTradeSource = TransformedTrade & {
  dealId?: string | undefined;
  baseAsset?: string | undefined;
  quoteAsset?: string | undefined;
  settings?: { futures?: boolean | undefined } | undefined;
  exitTime?: number | undefined;
};

export interface DealRef {
  /** Id the deal mutations take. */
  id: string;
  /** The deal's own id where a row id differs from it (journal, merge). */
  dealId: string;
  botId: string | undefined;
  kind: DealKind;
  /** Lower-cased deal status. */
  status: string;
  symbol: string;
  baseAsset: string | undefined;
  quoteAsset: string | undefined;
  exchange: string | undefined;
  exchangeUUID: string | undefined;
  strategy: string | undefined;
  long: boolean;
  futures: boolean;
  /** Risk-based DCA deal: its levels belong to the risk engine. */
  riskBased: boolean;
  levels: { complete: number; all: number } | undefined;
  percentBasis: PercentBasis | undefined;
  /**
   * The row this deal was adapted from, for the actions that need the whole
   * trade (journal, view, edit, execute next DCA). Absent for history rows.
   */
  trade: DealTradeSource | undefined;
}

const TRADE_TYPE_KIND: Record<TransformedTrade['type'], DealKind> = {
  DCA: 'dca',
  Combo: 'combo',
  'Hedge DCA': 'hedgeDca',
  'Hedge Combo': 'hedgeCombo',
  Grid: 'grid',
  Terminal: 'terminal',
};

const BOT_TYPE_KIND: Record<BotTypesEnum, DealKind> = {
  [BotTypesEnum.dca]: 'dca',
  [BotTypesEnum.combo]: 'combo',
  [BotTypesEnum.hedgeDca]: 'hedgeDca',
  [BotTypesEnum.hedgeCombo]: 'hedgeCombo',
  [BotTypesEnum.terminal]: 'terminal',
  [BotTypesEnum.grid]: 'grid',
};

/**
 * The kind of a trade row. A terminal deal is terminal whatever type label it
 * carries (some rows label it by strategy). A hedge leg's deal is rendered with
 * its leg's plain type, so the `hedge` flag the row was built with decides.
 */
export function dealKindOfTrade(
  trade: Pick<TransformedTrade, 'type' | 'terminal' | 'hedge'>
): DealKind {
  if (trade.terminal || trade.type === 'Terminal') {
    return 'terminal';
  }
  const kind = TRADE_TYPE_KIND[trade.type] ?? 'dca';
  if (trade.hedge) {
    if (kind === 'combo') return 'hedgeCombo';
    if (kind === 'dca') return 'hedgeDca';
  }
  return kind;
}

export function dealKindOfBotType(botType: BotTypesEnum): DealKind {
  return BOT_TYPE_KIND[botType] ?? 'dca';
}

const normalizeStatus = (status: string | undefined | null): string =>
  String(status ?? '').toLowerCase();

/** Adapter for the trades table, card and bot drawer rows. */
export function dealRefFromTrade(trade: DealTradeSource): DealRef {
  const symbolObject = typeof trade.symbol === 'string' ? null : trade.symbol;
  const symbol = symbolObject ? symbolObject.symbol : String(trade.symbol);
  // Some lists hand over a bare exchange symbol. Split it rather than leave
  // the funds dialog with an unnamed "Base/Quote asset" picker, which is how a
  // base amount gets entered as quote; no label beats a guessed one.
  const parsed = symbolObject ? null : extractPairAssets(symbol);
  return {
    id: trade.id,
    dealId: trade.dealId || trade.id,
    botId: trade.botId || undefined,
    kind: dealKindOfTrade(trade),
    status: normalizeStatus(trade.status),
    symbol,
    baseAsset:
      symbolObject?.baseAsset || trade.baseAsset || parsed?.baseAsset || undefined,
    quoteAsset:
      symbolObject?.quoteAsset ||
      trade.quoteAsset ||
      parsed?.quoteAsset ||
      undefined,
    exchange: trade.exchange || undefined,
    exchangeUUID: trade.exchangeUUID || undefined,
    strategy: trade.strategy || undefined,
    long: trade.side !== 'SELL',
    // Two sources because the rows come from different mappers: some set a
    // top-level `futures`, the trades page carries it under `settings`.
    futures: !!(trade.futures ?? trade.settings?.futures),
    riskBased: !!trade.riskBased,
    levels: trade.levels,
    percentBasis: trade.percentBasis,
    trade,
  };
}

/** What the bot-page deal history knows about one of its rows. */
export interface DealHistoryRowInput {
  id: string;
  botId: string | undefined;
  status: string;
  symbol: string;
  baseAsset?: string | undefined;
  quoteAsset?: string | undefined;
  exchange?: string | undefined;
  exchangeUUID?: string | undefined;
  strategy?: string | undefined;
  long: boolean;
  futures: boolean;
  percentBasis?: PercentBasis | undefined;
  levels?: { complete: number; all: number } | undefined;
}

/**
 * Adapter for the bot-page deal history. Its rows carry no type of their own;
 * every row belongs to the page's bot, so the bot type decides.
 */
export function dealRefFromHistoryRow(
  row: DealHistoryRowInput,
  botType: BotTypesEnum
): DealRef {
  return {
    id: row.id,
    dealId: row.id,
    botId: row.botId || undefined,
    kind: dealKindOfBotType(botType),
    status: normalizeStatus(row.status),
    symbol: row.symbol,
    baseAsset: row.baseAsset,
    quoteAsset: row.quoteAsset,
    exchange: row.exchange,
    exchangeUUID: row.exchangeUUID,
    strategy: row.strategy,
    long: row.long,
    futures: row.futures,
    riskBased: false,
    levels: row.levels,
    percentBasis: row.percentBasis,
    trade: undefined,
  };
}

// ---------------------------------------------------------------------------
// Status rules. Each mirrors what the engine accepts for the action using it.
// ---------------------------------------------------------------------------

/**
 * `open`: funds, execute next DCA, close by market/limit, deal edits from the
 * menus, moves. The engine refuses or ignores those on a deal that is still
 * starting or has errored.
 */
export const isDealOpen = (deal: Pick<DealRef, 'status'>): boolean =>
  deal.status === 'open';

/** `start`, `open` or `error`: the engine can still cancel the deal. */
export const isDealLive = (deal: Pick<DealRef, 'status'>): boolean =>
  deal.status === 'open' || deal.status === 'start' || deal.status === 'error';

/** `open` or `error`: the engine can re-place the deal's orders. */
export const isDealRestartable = (deal: Pick<DealRef, 'status'>): boolean =>
  deal.status === 'open' || deal.status === 'error';

export const isDealCanceled = (deal: Pick<DealRef, 'status'>): boolean =>
  deal.status === 'canceled' || deal.status === 'cancelled';

/** Combo and hedge-combo deals live in the combo collection. */
export const runsOnComboEngine = (kind: DealKind): boolean =>
  kind === 'combo' || kind === 'hedgeCombo';

/** The bot type the deal mutations and order queries are addressed with. */
export const dealEngineBotType = (kind: DealKind): BotTypesEnum =>
  runsOnComboEngine(kind) ? BotTypesEnum.combo : BotTypesEnum.dca;

const KIND_LABEL: Record<DealKind, TransformedTrade['type']> = {
  dca: 'DCA',
  combo: 'Combo',
  hedgeDca: 'Hedge DCA',
  hedgeCombo: 'Hedge Combo',
  terminal: 'Terminal',
  grid: 'Grid',
};

/** The bot-type label the deal tables render for a kind. */
export const dealKindLabel = (kind: DealKind): TransformedTrade['type'] =>
  KIND_LABEL[kind];
