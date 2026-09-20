import { useEffect, useState } from 'react';
import {
  BotTypesEnum,
  OrderTypeEnum,
  type BotVars,
  type DCAGrid,
  type ExchangeEnum,
  type Prices,
  type Symbols,
} from '@/types';
import {
  createComboOrders,
  createDCAOrders,
  defaultContext,
  type DCABotSettings as EngineDCASettings,
  type ExampleOrdersStoreContext,
} from '@/utils/bots/dca/example-orders-core';
import {
  computeDealSummary,
  EMPTY_DEAL_SUMMARY,
  type DealOverviewSummary,
} from '@/utils/bots/dca/deal-summary';
import {
  useTradingPairsDataStore,
  type TradingPair,
} from '@/stores/tradingPairsDataStore';
import { getLocalPrices } from '@/helper/price';

/** Minimal bot shape the projection needs — satisfied by both `DrawerBot`
 *  (drawer widget) and the form's query bot (read-only settings view). */
interface ProjectionBot {
  type?: string;
  pair?: string;
  exchange?: string;
  _id?: string;
  id?: string;
  settings?: unknown;
  /** The bot's global-variable bindings. A bound setting keeps its old
   *  literal in the bot document, so a projection built without these is
   *  built from a value the engine will not spend. */
  vars?: BotVars | null;
}

type EngineSettings = EngineDCASettings & {
  baseOrderPrice?: string;
  startOrderType?: OrderTypeEnum;
  useLimitPrice?: boolean;
};

const norm = (value: string | undefined): string =>
  (value ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();

// Look up the real exchange pair metadata (numeric step / price precision).
// Tries the exact provider+pair key first, then a normalized match so the
// dashed selection form ("BTC-USDT") resolves to the exchange pair ("BTCUSDT").
const resolveSymbol = (
  exchange: string | undefined,
  pair: string | undefined
): TradingPair | undefined => {
  if (!exchange || !pair) {
    return undefined;
  }
  const state = useTradingPairsDataStore.getState();
  const byProvider = state.pairsByProvider?.[exchange];
  if (byProvider) {
    if (byProvider[pair]) {
      return byProvider[pair];
    }
    const target = norm(pair);
    for (const key in byProvider) {
      if (norm(key) === target) {
        return byProvider[key];
      }
    }
  }
  try {
    const list = state.getPairsByExchange(exchange as ExchangeEnum) ?? [];
    const target = norm(pair);
    return list.find((p) => norm(p.pair) === target);
  } catch {
    return undefined;
  }
};

const resolvePrice = (
  exchange: string | undefined,
  pair: string | undefined
): number | undefined => {
  const target = norm(pair);
  if (!target) {
    return undefined;
  }
  const prices: Prices = getLocalPrices() ?? [];
  const match = prices.find(
    (p) =>
      norm(p.symbol) === target && (p.exchange ? p.exchange === exchange : true)
  );
  return typeof match?.price === 'number' ? match.price : undefined;
};

// The engine bails to a base-order-only grid when `symbol` is null, and needs
// NUMERIC precision fields. When real pair metadata isn't cached, this generic
// high-precision stand-in still yields exact coverage / avg-down-power and
// near-exact capital (those are ratio-based), so the projection never collapses
// to 0 just because the pairs cache is cold.
const buildGenericSymbol = (bot: ProjectionBot): Symbols => {
  const [base = 'BASE', quote = 'USDT'] = (bot.pair ?? '').split(/[/-]/);
  return {
    pair: bot.pair ?? '',
    exchange: bot.exchange,
    priceAssetPrecision: 8,
    baseAsset: { name: base || 'BASE', step: 1e-8, minAmount: 0, maxAmount: 0 },
    quoteAsset: { name: quote || 'USDT', minAmount: 0 },
    maxOrders: 200,
  } as unknown as Symbols;
};

/**
 * Builds the example-orders engine context for a saved bot from its settings,
 * the cached pair metadata (real numeric precision), and the latest local
 * price — everything `createDCAOrders` / `createComboOrders` need to reproduce
 * the bot form's DCA overview orders without a mounted form.
 *
 * Returns `null` when the bot can't be projected (missing id / settings).
 */
export const buildBotProjectionContext = (
  bot: ProjectionBot | null | undefined
): ExampleOrdersStoreContext | null => {
  const settings = bot?.settings as EngineSettings | undefined;
  const botId = bot?._id ?? bot?.id;
  if (!bot || !botId || !settings) {
    return null;
  }

  const isCombo =
    bot.type === BotTypesEnum.combo || bot.type === BotTypesEnum.hedgeCombo;

  const realSymbol = resolveSymbol(bot.exchange, bot.pair);
  const price = resolvePrice(bot.exchange, bot.pair);
  // Use the real metadata only when we also have a price — at the wrong price
  // scale a low-precision symbol rounds the grid and skews coverage, whereas
  // the generic high-precision symbol stays exact regardless of price.
  const symbol =
    realSymbol && price
      ? ({ ...realSymbol, maxOrders: 200 } as unknown as Symbols)
      : buildGenericSymbol(bot);

  return {
    ...defaultContext,
    botType: isCombo ? BotTypesEnum.combo : BotTypesEnum.dca,
    settings,
    symbol,
    errors: {},
    // Hand the generators the bindings, not a stripped copy: they run
    // `resolveSettingsVars` themselves before reading a field, so this is the
    // whole of what a bound bot needs to project at the value it trades at.
    botVars: bot.vars ?? null,
    userFee: 0,
    usdPrice: 1,
    inputLatestPrice: price ?? 0,
    baseOrderPrice: settings.baseOrderPrice,
    startOrderType: settings.startOrderType ?? OrderTypeEnum.market,
    useLimitPrice: settings.useLimitPrice ?? false,
  };
};

/**
 * Projects a saved bot's DCA configuration into the headline overview figures
 * (coverage / avg down power / total funds) — the same numbers the bot form's
 * DCA section shows — without mounting the form. Used by the bot drawer's DCA
 * Analysis, which has no form provider or store to read from.
 *
 * Pass `null` to disable — the hook then no-ops and returns the empty summary.
 */
export interface BotDcaProjection {
  summary: DealOverviewSummary;
  /** The generated example orders, so a read-only view can populate the shared
   *  deal-overview table/graph the same way the live form does. */
  orders: DCAGrid[];
}

const EMPTY_PROJECTION: BotDcaProjection = {
  summary: EMPTY_DEAL_SUMMARY,
  orders: [],
};

export const useBotDcaProjection = (
  bot: ProjectionBot | null | undefined
): BotDcaProjection => {
  const [result, setResult] = useState<BotDcaProjection>(EMPTY_PROJECTION);

  const botId = bot?._id ?? bot?.id;
  const botType = bot?.type;
  const botPair = bot?.pair;
  const botExchange = bot?.exchange;
  // Primitive identity of the bot's variable bindings, so a rebind (or a swap
  // to a different variable) recomputes the projection. `bot.settings` is
  // immutable per loaded bot but `vars` is not — the same bot id can come back
  // bound differently — and depending on the object itself would re-run on
  // every parent render.
  const botVarsKey = JSON.stringify(bot?.vars ?? null);
  // Primitive that advances when the trading-pairs cache changes, so the symbol
  // lookup re-runs once metadata finishes loading — without re-running on every
  // render (depending on the `bot` object directly would).
  const pairsVersion = useTradingPairsDataStore(
    (s) => `${s.timestamp}:${s._hasHydrated}`
  );

  useEffect(() => {
    const context = buildBotProjectionContext(bot);
    if (!context) {
      setResult(EMPTY_PROJECTION);
      return;
    }

    let active = true;
    const generate =
      context.botType === BotTypesEnum.combo
        ? createComboOrders
        : createDCAOrders;
    generate({}, context)
      .then((orders) => {
        if (active) {
          setResult({ summary: computeDealSummary(orders), orders });
        }
      })
      .catch(() => {
        if (active) {
          setResult(EMPTY_PROJECTION);
        }
      });

    return () => {
      active = false;
    };
    // `bot.settings` is immutable per loaded bot, so keying on `botId` (+ pair/
    // exchange/type, the bindings and the pairs-cache version) is sufficient
    // and avoids a re-run on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, botType, botPair, botExchange, botVarsKey, pairsVersion]);

  return result;
};
