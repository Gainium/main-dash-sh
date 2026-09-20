import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import { useUsdRate } from '@/hooks/useUsdRate';
import { useUserFees } from '@/hooks/useUserFeesService';
import logger from '@/lib/loggerInstance';
import {
  BotOrderSideEnum,
  DCAConditionEnum,
  DCAOrderTypeEnum,
  IndicatorAction,
  StrategyEnum,
  type Asset,
  type BotVars,
  type DCABotSettings,
  type DCADeals,
  type DCAGrid,
  type Symbols,
} from '@/types';
import type { ViewOrder } from '@/types/bots';
import { applyFrozenIndicatorLevels } from '@/utils/bots/dca/frozen-indicator-levels';
import { projectIndicatorDcaThresholds } from '@/utils/bots/dca/indicator-dca-thresholds';
import {
  createComboOrders,
  createDCAOrders,
  DCA_BY_MARKET_LABEL,
  DCA_MIN_PERC_LABEL,
  defaultContext,
  resolveSettingsVars,
  type ExampleOrdersStoreContext,
} from '@/utils/bots/dca/example-orders-core';
import { useBalanceStore } from '@/stores/live/balanceStore';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A smart order is a `ViewOrder` shaped projected (not-yet-placed) ladder
 * level. The `__smart` marker lets the table render it as a "Smart order /
 * NEW" row distinct from real exchange orders.
 */
export type SmartViewOrder = ViewOrder & { __smart: true };

export interface UseDealSmartOrdersParams {
  /**
   * Bot whose settings seed the ladder (merged with the deal's own settings).
   *
   * `vars` is the bot's global-variable bindings and is NOT optional in
   * practice: a bound setting keeps its superseded literal in the bot document,
   * so a ladder built without the bindings is built from values the engine will
   * not use. Every caller holds a full bot record, on which `vars` is both
   * typed and GraphQL-selected — pass it.
   */
  bot:
    | { settings?: DCABotSettings; exchangeUUID?: string; vars?: BotVars | null }
    | null
    | undefined;
  /** The raw deal (NOT the lossy TradeDetails). */
  deal: DCADeals | null | undefined;
  /** Real placed orders for this deal — used for the legacy price bound + dedup. */
  pendingOrders: ViewOrder[];
  /** Real filled/cancelled orders for this deal — used for dedup (the bug fix). */
  completedOrders: ViewOrder[];
  /** Combo bots project grid levels instead of DCA levels. */
  isCombo?: boolean;
  /** Master switch (e.g. selected deal id matches). */
  enabled?: boolean;
  /**
   * Build the ladder even when the bot has smart orders off. The projected-row
   * output keeps its own rules either way; this exists for callers that need
   * `fullLadder` — the whole configured ladder, level by level — on every bot,
   * including those whose safety orders all rest on the venue.
   */
  computeRegardlessOfSmartOrders?: boolean;
}

export interface UseDealSmartOrdersResult {
  /** Projected rows for the orders table. */
  smartOrders: SmartViewOrder[];
  /** Projected grey levels for the price chart (grey:true → renders grey). */
  smartChartOrders: DCAGrid[];
  strategy: StrategyEnum;
  /**
   * Every level the bot's settings define, in level order, unfiltered — the
   * base order, each DCA level, TP and SL entries as the generator emitted
   * them. Unlike `smartOrders` it is not bounded by resting orders or deduped by
   * price, so level N is the Nth DCA entry: the same identity the engine uses
   * (`levelNumber === levels.complete`). Empty unless the guard passed.
   */
  fullLadder: DCAGrid[];
  /**
   * The settings the ladder above was actually built from — the bot's, with the
   * deal's own overrides applied and its frozen indicator levels restored. A
   * caller that has to reason about a level (what denominates it, which
   * condition drew it) must read it from here rather than re-deriving the merge
   * off the bot, or it describes a ladder it is not looking at.
   */
  settings: DCABotSettings | null;
}

const EMPTY: UseDealSmartOrdersResult = {
  smartOrders: [],
  smartChartOrders: [],
  strategy: StrategyEnum.long,
  fullLadder: [],
  settings: null,
};

/** One async ladder compute's output — the three pieces must move together. */
interface ComputedLadder {
  ladder: DCAGrid[];
  /** The settings the ladder was built from, variable bindings resolved. */
  settings: DCABotSettings | null;
  /** Per-level "Minimum % from last filled order", in startDca order. */
  minPercFromLast: number[];
}

const NO_LADDER: ComputedLadder = {
  ladder: [],
  settings: null,
  minPercFromLast: [],
};

/**
 * Per-level "Minimum % from last filled order", in startDca order, as a
 * fraction. Read it off the settings the ladder was built from: these are
 * bindable, so the literals on the bot are not the distances the engine uses.
 */
function startDcaMinPercs(settings: DCABotSettings | null): number[] {
  return (settings?.indicators ?? [])
    .filter((i) => i.indicatorAction === IndicatorAction.startDca)
    .map((i) => +(i.minPercFromLast ?? '0') / 100)
    .map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
}

/**
 * Computes the projected (not-yet-placed) ladder for an active deal, mirroring
 * legacy `main-dash` (`useDCAPage.getChartOrders`):
 *
 *  1. Build the FULL DCA/combo ladder client-side from the deal's merged
 *     settings + `initialPrice` (legacy calls `createOrders(..., all=true)`).
 *  2. Keep only the levels the bot has NOT placed yet — for a long deal,
 *     those strictly below the lowest pending real DCA order (mirror for
 *     short), bounded by the stop-loss line.
 *  3. **Dedupe against real placed/filled orders by price.** Legacy does NOT
 *     do this, which is why it shows a "Smart order" and a "FILLED" row at the
 *     same price; we drop the projected level when a real order already sits
 *     there.
 *
 * Two things differ from legacy for `dcaCondition: 'indicators'`, where the bot
 * rests nothing on the exchange and instead market-buys once a startDca
 * indicator fires past its "Minimum % from last filled order":
 *
 *  - the projection runs regardless of `useSmartOrders` (inert for this
 *    condition) and is labelled `DCA (min. %)` rather than `Smart order`;
 *  - level prices are re-anchored on `deal.lastPrice` via
 *    {@link projectIndicatorDcaThresholds}, because step 1's ladder chains off
 *    `initialPrice` and drifts once a level fills below its threshold.
 */
export function useDealSmartOrders({
  bot,
  deal,
  pendingOrders,
  completedOrders,
  isCombo = false,
  enabled = true,
  computeRegardlessOfSmartOrders = false,
}: UseDealSmartOrdersParams): UseDealSmartOrdersResult {
  const { pairsByExchange } = useTradingPairsFromContext();
  const allBalances = useBalanceStore((s) => s.balances);
  const { rate: usdRate } = useUsdRate();
  const { getCachedFee } = useUserFees();

  const mergedSettings = useMemo<DCABotSettings | null>(() => {
    if (!bot?.settings) return null;
    return applyFrozenIndicatorLevels({
      ...bot.settings,
      ...(deal?.settings ?? {}),
    }) as DCABotSettings;
  }, [bot?.settings, deal?.settings]);

  const strategy = (mergedSettings?.strategy ??
    StrategyEnum.long) as StrategyEnum;

  /**
   * Indicator-driven DCA is not a smart-order ladder: nothing is placed on the
   * exchange. The bot fires a MARKET order when a startDca indicator triggers
   * AND price has moved at least that indicator's `minPercFromLast` away from
   * `deal.lastPrice` (the last fill). So the projection is meaningful whether
   * or not `useSmartOrders` is on — for this condition the setting is inert.
   */
  const isIndicatorDca = Boolean(
    !isCombo && mergedSettings?.dcaCondition === DCAConditionEnum.indicators
  );

  /**
   * The bot's global-variable bindings. A bound setting keeps its superseded
   * literal in the bot document, so the ladder — and everything derived from it
   * below — has to be computed from the RESOLVED settings, not from these.
   */
  const botVars = bot?.vars ?? null;

  const projectionLabel = isCombo
    ? 'Combo grid order'
    : isIndicatorDca
      ? DCA_MIN_PERC_LABEL
      : mergedSettings?.dcaByMarket
        ? DCA_BY_MARKET_LABEL
        : 'Smart order';

  // Resolve the rich Symbols object (precision + min/step) for the deal's pair.
  const symbol = useMemo<Symbols | null>(() => {
    if (!deal?.symbol || !pairsByExchange) return null;
    const dealExchange = String(deal.exchange ?? '').toUpperCase();
    const base = (deal.symbol.baseAsset ?? '').toUpperCase();
    const quote = (deal.symbol.quoteAsset ?? '').toUpperCase();
    for (const [exchangeName, pairs] of Object.entries(pairsByExchange)) {
      if (dealExchange && exchangeName.toUpperCase() !== dealExchange) continue;
      const match = pairs.find(
        (p) =>
          (p.baseAsset?.name ?? '').toUpperCase() === base &&
          (p.quoteAsset?.name ?? '').toUpperCase() === quote
      );
      if (match) return { ...match, maxOrders: 200 } as Symbols;
    }
    return null;
  }, [deal?.symbol, deal?.exchange, pairsByExchange]);

  const guardPass = Boolean(
    enabled &&
      deal &&
      deal.status === 'open' &&
      symbol &&
      mergedSettings &&
      (isCombo
        ? mergedSettings.comboUseSmartGrids
        : mergedSettings.useSmartOrders ||
          isIndicatorDca ||
          computeRegardlessOfSmartOrders)
  );

  const balances = useMemo<Asset[]>(() => {
    if (!bot?.exchangeUUID) return [];
    return allBalances
      .filter((b) => b.exchangeUUID === bot.exchangeUUID && b.asset)
      .map((b) => ({
        asset: b.asset,
        free: `${b.free}`,
        locked: `${b.locked}`,
      }));
  }, [allBalances, bot?.exchangeUUID]);

  const [computed, setComputed] = useState<ComputedLadder>(NO_LADDER);
  const { ladder } = computed;
  // Key the async compute on the stable inputs that change the ladder.
  const computeKey = useMemo(() => {
    if (!guardPass || !deal || !mergedSettings || !symbol) return '';
    return JSON.stringify({
      id: deal._id,
      ip: deal.initialPrice,
      st: mergedSettings.strategy,
      step: mergedSettings.step,
      stepScale: mergedSettings.stepScale,
      vol: mergedSettings.volumeScale,
      oc: mergedSettings.ordersCount,
      os: mergedSettings.orderSize,
      bos: mergedSettings.baseOrderSize,
      ost: mergedSettings.orderSizeType,
      tp: mergedSettings.tpPerc,
      sl: mergedSettings.slPerc,
      ps: deal.settings?.orderSizePercQty,
      sym: symbol.pair,
      prec: symbol.priceAssetPrecision,
      usd: usdRate,
      combo: isCombo,
      // Indicator-condition ladders size themselves off the startDca indicator
      // list (level count + per-level order size), so it has to key the compute.
      inds: isIndicatorDca
        ? (mergedSettings.indicators ?? [])
            .filter((i) => i.indicatorAction === IndicatorAction.startDca)
            .map((i) => [i.minPercFromLast, i.orderSize])
        : undefined,
      // Any of the above may be BOUND to a global variable, in which case the
      // literal keyed above is not what the ladder is built from — rebind and
      // the ladder has to be recomputed.
      vars: botVars,
    });
  }, [
    guardPass,
    deal,
    mergedSettings,
    symbol,
    usdRate,
    isCombo,
    isIndicatorDca,
    botVars,
  ]);

  const lastKeyRef = useRef<string>('');
  useEffect(() => {
    if (!guardPass || !mergedSettings || !symbol || !deal) {
      if (ladder.length) setComputed(NO_LADDER);
      lastKeyRef.current = '';
      return;
    }
    if (computeKey === lastKeyRef.current) return;
    lastKeyRef.current = computeKey;

    let cancelled = false;
    const userFee = getCachedFee(bot?.exchangeUUID ?? '', symbol.pair)?.maker;

    // Resolve the bot's variable bindings ONCE, here, rather than letting the
    // generator do it internally: the resolved settings are an input to the
    // indicator re-anchoring below and to what this hook reports as `settings`,
    // and those must describe the same ladder. The generator re-runs the
    // resolution on the way in, which with `botVars: null` is an exact no-op.
    //
    // Resolve the BOT's settings and spread the deal's snapshot over the
    // result, rather than resolving the already-merged object. The engine
    // aggregates in exactly that order, so a value the deal froze when it
    // opened — its own base order size, DCA order size, take profit, step, … —
    // wins over the variable's current value: moving a variable applies to NEW
    // deals only. Resolving after the merge would re-resolve those frozen keys
    // and quote a number this deal will never be sized at. The deal's frozen
    // indicator levels go on last for the same reason.
    const compute = async (): Promise<ComputedLadder> => {
      const settings = applyFrozenIndicatorLevels({
        ...(await resolveSettingsVars(
          (bot?.settings ?? {}) as DCABotSettings,
          botVars
        )),
        ...(deal.settings ?? {}),
      }) as DCABotSettings;
      const context: ExampleOrdersStoreContext = {
        ...defaultContext,
        settings,
        symbol,
        errors: {},
        botVars: null,
        inputLatestPrice: deal.initialPrice || 0,
        usdPrice: usdRate || 0,
        balances,
        breakpoints: deal.gridBreakpoints ?? [],
        tpSlTargetFilled: deal.tpSlTargetFilled ?? [],
        dcaArValues: deal.dynamicAr ?? [],
        percOrderSize: deal.settings?.orderSizePercQty ?? 0,
        userFee: typeof userFee === 'number' ? userFee : 0.001,
      };
      const run = isCombo ? createComboOrders : createDCAOrders;
      return {
        ladder: (await run({ all: true, noCheck: true }, context)) ?? [],
        settings,
        minPercFromLast: startDcaMinPercs(settings),
      };
    };

    compute()
      .then((res) => {
        if (!cancelled) setComputed(res);
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('[useDealSmartOrders] ladder compute failed', err);
          setComputed(NO_LADDER);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeKey, guardPass]);

  const result = useMemo<UseDealSmartOrdersResult>(() => {
    if (!guardPass || !deal || !symbol || ladder.length === 0) return EMPTY;

    // Read off the same compute the ladder came from, never off the raw bot —
    // both are variable-resolved, and mixing the two would re-anchor a resolved
    // ladder on unresolved distances.
    const { settings: ladderSettings, minPercFromLast } = computed;
    const isLong = strategy === StrategyEnum.long;
    const projType = isCombo ? DCAOrderTypeEnum.grid : DCAOrderTypeEnum.dca;

    // Lowest/highest pending real DCA order — the legacy bound.
    const pendingDcaPrices = pendingOrders
      .filter((o) => o.typeOrder === 'dealRegular')
      .map((o) => o.price)
      .filter((p) => p > 0);
    const boundPrice = isLong
      ? pendingDcaPrices.length
        ? Math.min(...pendingDcaPrices)
        : Infinity
      : pendingDcaPrices.length
      ? Math.max(...pendingDcaPrices)
      : 0;

    // Stop-loss line from the computed ladder (legacy uses the SL order price).
    const slPrice = ladder.find((o) => o.type === DCAOrderTypeEnum.sl)?.price;

    // Real order prices (placed + filled) for dedup — fixes the legacy
    // "smart order + filled order at same price" duplicate.
    const prec = symbol.priceAssetPrecision ?? 8;
    const roundP = (p: number) => Number(p.toFixed(prec));
    const realPrices = new Set(
      [...pendingOrders, ...completedOrders]
        .map((o) => o.price)
        .filter((p) => p > 0)
        .map(roundP)
    );

    // Re-anchor indicator-driven levels on the deal's last fill.
    //
    // The shared ladder chains each `minPercFromLast` off `deal.initialPrice`
    // through its own *projected* levels. The backend instead measures every
    // threshold from `deal.lastPrice` (the deepest fill so far) at the moment
    // the indicator fires. Those agree only if each level filled exactly on its
    // projected threshold — but the indicator normally fires some way past the
    // minimum, so the ladder drifts and draws the next DCA nearer than it can
    // actually be. Chain from `deal.lastPrice` instead, and drop the levels the
    // deal has already consumed (for this condition there are no resting DCA
    // orders, so the pending-order bound below can't filter them out).
    let effectiveLadder = ladder;
    if (isIndicatorDca && deal.lastPrice > 0 && minPercFromLast.length) {
      const thresholds = projectIndicatorDcaThresholds({
        lastPrice: deal.lastPrice,
        levelsComplete: deal.levels?.complete ?? 1,
        minPercFromLast,
        isLong,
        precision: prec,
      });
      let level = -1;
      effectiveLadder = ladder.map((o) => {
        if (o.type !== projType) return o;
        level += 1;
        const price = thresholds[level];
        return price == null ? { ...o, hide: true } : { ...o, price };
      });
    }

    const projected = effectiveLadder.filter((o) => {
      if (o.type !== projType) return false;
      if (o.hide || o.note) return false;
      if (!(o.price > 0) || !(o.qty > 0)) return false;
      // Only un-placed levels: beyond the lowest/highest pending real DCA.
      if (isLong ? !(o.price < boundPrice) : !(o.price > boundPrice)) {
        return false;
      }
      // Inside the stop loss.
      if (slPrice != null) {
        if (isLong ? !(o.price > slPrice) : !(o.price < slPrice)) return false;
      }
      // Dedup against real orders at the same price (the legacy bug fix).
      if (realPrices.has(roundP(o.price))) return false;
      return true;
    });

    const side = isLong ? BotOrderSideEnum.buy : BotOrderSideEnum.sell;
    const sideLower: 'buy' | 'sell' = isLong ? 'buy' : 'sell';
    const label = projectionLabel;

    const smartChartOrders: DCAGrid[] = projected.map((o) => ({
      ...o,
      side,
      grey: true,
      greyLabel: label,
    }));

    const smartOrders: SmartViewOrder[] = projected.map((o, i) => {
      const qty = o.qty;
      const price = o.price;
      return {
        __smart: true,
        id: `smart-${deal._id}-${i}-${roundP(price)}`,
        dealId: deal._id,
        type: sideLower,
        side: sideLower,
        status: 'pending',
        symbol: deal.symbol.symbol,
        baseAsset: deal.symbol.baseAsset,
        quoteAsset: deal.symbol.quoteAsset,
        amount: qty,
        price,
        filled: 0,
        remaining: qty,
        total: qty * price,
        // Epoch means "never placed" — a projected level has no creation time,
        // but `ViewOrder.createTime` is a required string so it cannot simply be
        // omitted. Renderers MUST treat <= 0 as absent rather than as a date:
        // this string is truthy, so a plain `if (!createTime)` guard lets it
        // through and the row displays "01/01/1970". See `formatOrderTime` in
        // components/trades/DealOrdersSection.tsx.
        createTime: new Date(0).toISOString(),
        executedQuantity: 0,
        executedPrice: 0,
        orderType: label,
        origQty: `${qty}`,
        executedQty: '0',
        typeOrder: isCombo ? 'dealGrid' : 'dealRegular',
        clientOrderId: '',
        time: 0,
      } as SmartViewOrder;
    });

    return {
      smartOrders,
      smartChartOrders,
      strategy,
      fullLadder: ladder,
      settings: ladderSettings,
    };
  }, [
    guardPass,
    deal,
    symbol,
    ladder,
    computed,
    strategy,
    isCombo,
    isIndicatorDca,
    projectionLabel,
    pendingOrders,
    completedOrders,
  ]);

  return result;
}
