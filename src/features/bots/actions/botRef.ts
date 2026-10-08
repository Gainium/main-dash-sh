/**
 * Adapters from the bot shapes the app passes around (raw GraphQL bots, the
 * list-page transforms, hedge wrappers, drawer legs) to the normalised
 * `BotRef` the action layer works on. Every surface builds its BotRef here,
 * so the grid stop context, the hedge target id and the open-deal count are
 * derived the same way everywhere.
 */
import { PositionSide, StrategyEnum } from '@/types';
import { isBotActive, isBotArchived } from '@/utils/botStatusUtils';
import { isFuturesExchange } from '@/utils/exchangeUtils';

import type { BotKind, BotRef, GridStopContext } from './botActions';

/** Structural view of the bot fields the adapters read. */
interface BotLikeShape {
  _id?: string;
  id?: string;
  name?: string;
  status?: string;
  created?: string | number;
  exchange?: string;
  settings?: { name?: string; strategy?: string };
  dealsInBot?: { active?: number };
  usage?: { current?: { quote?: number } };
  value?: number;
  symbol?:
    | { quoteAsset?: string }
    | { value?: { quoteAsset?: string } }[];
  position?: { price?: number; side?: string };
  levels?: { active?: { buy?: number; sell?: number } };
  bots?: BotLikeShape[];
}

const asShape = (bot: unknown): BotLikeShape =>
  (bot ?? {}) as BotLikeShape;

const quoteOf = (bot: BotLikeShape): string => {
  const symbol = bot.symbol;
  if (Array.isArray(symbol)) return symbol[0]?.value?.quoteAsset ?? '';
  return symbol?.quoteAsset ?? '';
};

/**
 * Grid stop-dialog context: futures market, open position, short strategy.
 * The one place this is derived — cards, rows and the drawer used to each
 * compute (or omit) it differently.
 */
export const gridStopContext = (bot: unknown): GridStopContext => {
  const shape = asShape(bot);
  return {
    futures: isFuturesExchange(shape.exchange),
    hasOpenPosition: (shape.position?.price ?? 0) !== 0,
    isShort: shape.position?.side === PositionSide.SHORT,
  };
};

/** Grid "open deals" are its active buy + sell levels. */
const gridActiveLevels = (shape: BotLikeShape): number =>
  (shape.levels?.active?.buy ?? 0) + (shape.levels?.active?.sell ?? 0);

export interface ToBotRefOptions {
  /** Bot lives in paper trading (`useBotActions` resolves it to the current mode). */
  paper?: boolean;
  /** Overrides the derived id (hedge drawer: the wrapper id). */
  id?: string;
  /** Overrides the derived status (hedge drawer: the wrapper status). */
  status?: string;
  name?: string;
}

/**
 * Normalise a DCA / combo / grid bot (raw or list-transformed) or a hedge
 * wrapper (`{ _id, status, bots: [long, short] }`).
 */
export function toBotRef(
  bot: unknown,
  kind: BotKind,
  options: ToBotRefOptions = {}
): BotRef {
  const shape = asShape(bot);
  const status = options.status ?? shape.status ?? '';
  const isHedge = kind === 'hedgeDca' || kind === 'hedgeCombo';
  const legs = isHedge ? (shape.bots ?? []) : [];
  const legName =
    legs.find((leg) => leg.settings?.strategy === StrategyEnum.long)?.settings?.name ??
    legs[0]?.settings?.name;

  const activeDeals = isHedge
    ? legs.reduce((sum, leg) => sum + (leg.dealsInBot?.active ?? 0), 0)
    : kind === 'grid'
      ? gridActiveLevels(shape)
      : (shape.dealsInBot?.active ?? 0);

  return {
    kind,
    id: options.id ?? shape._id ?? shape.id ?? '',
    name:
      options.name ??
      (isHedge ? legName : undefined) ??
      shape.settings?.name ??
      shape.name ??
      (isHedge ? 'Hedge bot' : ''),
    status,
    paper: options.paper ?? false,
    archived: isBotArchived(status),
    active: isBotActive(status),
    activeDeals,
    totalValue: shape.usage?.current?.quote ?? shape.value ?? 0,
    currency: quoteOf(shape),
    lastActivity:
      shape.created !== undefined && shape.created !== ''
        ? String(shape.created)
        : 'Unknown',
    ...(kind === 'grid' ? { grid: gridStopContext(shape) } : {}),
    raw: bot,
  };
}

/**
 * The bot form's (and the hedge edit page's) BotRef. Built from whatever bot
 * the form loaded, of any type, and addressed by the route's bot id: only an
 * edit form of a saved bot has one. The create form (and an edit form whose
 * route has no id) gets an empty id, which hides every saved-bot action.
 */
export function formBotRef(params: {
  bot: unknown;
  kind: BotKind;
  mode: string;
  botId: string | null | undefined;
}): BotRef {
  return toBotRef(params.bot ?? {}, params.kind, {
    id: params.mode === 'edit' && params.botId ? params.botId : '',
  });
}

/**
 * Hedge bot as shown in the detail drawer: the drawer's `bot` is a LEG, but
 * every action must target the hedge wrapper (its id, status and type), and
 * the open-deal count spans both legs.
 */
export function toHedgeDrawerBotRef(params: {
  kind: 'hedgeDca' | 'hedgeCombo';
  wrapperId: string;
  wrapperStatus: string;
  name: string;
  legs: unknown[];
  /**
   * The full hedge bot. Share Configuration copies it, as the hedge list
   * rows and cards do — the hedge-level shared settings live only there.
   */
  wrapper?: unknown;
  paper?: boolean;
}): BotRef {
  const ref = toBotRef(
    { _id: params.wrapperId, status: params.wrapperStatus, bots: params.legs },
    params.kind,
    {
      name: params.name,
      ...(params.paper !== undefined ? { paper: params.paper } : {}),
    }
  );
  return params.wrapper ? { ...ref, raw: params.wrapper } : ref;
}

/** BotTypesEnum value → BotKind (terminal bots have no bot actions). */
export const botKindFromType = (type: string): BotKind =>
  type === 'combo' ||
  type === 'grid' ||
  type === 'hedgeDca' ||
  type === 'hedgeCombo'
    ? type
    : 'dca';
