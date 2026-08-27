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
  type DCABotSettings,
  type DCADeals,
  type DCAGrid,
  type Symbols,
} from '@/types';
import type { ViewOrder } from '@/types/bots';
import { projectIndicatorDcaThresholds } from '@/utils/bots/dca/indicator-dca-thresholds';
import {
  createComboOrders,
  createDCAOrders,
  DCA_BY_MARKET_LABEL,
  DCA_MIN_PERC_LABEL,
  defaultContext,
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
  /** Bot whose settings seed the ladder (merged with the deal's own settings). */
  bot: { settings?: DCABotSettings; exchangeUUID?: string } | null | undefined;
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
}

export interface UseDealSmartOrdersResult {
  /** Projected rows for the orders table. */
  smartOrders: SmartViewOrder[];
  /** Projected grey levels for the price chart (grey:true → renders grey). */
  smartChartOrders: DCAGrid[];
  strategy: StrategyEnum;
}

const EMPTY: UseDealSmartOrdersResult = {
  smartOrders: [],
  smartChartOrders: [],
  strategy: StrategyEnum.long,
};

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
}: UseDealSmartOrdersParams): UseDealSmartOrdersResult {
  const { pairsByExchange } = useTradingPairsFromContext();
  const allBalances = useBalanceStore((s) => s.balances);
  const { rate: usdRate } = useUsdRate();
  const { getCachedFee } = useUserFees();

  const mergedSettings = useMemo<DCABotSettings | null>(() => {
    if (!bot?.settings) return null;
    return { ...bot.settings, ...(deal?.settings ?? {}) } as DCABotSettings;
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

  /** Per-level "Minimum % from last filled order", in startDca order. */
  const minPercFromLast = useMemo<number[]>(() => {
    if (!isIndicatorDca) return [];
    return (mergedSettings?.indicators ?? [])
      .filter((i) => i.indicatorAction === IndicatorAction.startDca)
      .map((i) => +(i.minPercFromLast ?? '0') / 100)
      .map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  }, [isIndicatorDca, mergedSettings?.indicators]);

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
        : mergedSettings.useSmartOrders || isIndicatorDca)
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

  const [ladder, setLadder] = useState<DCAGrid[]>([]);
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
      inds: isIndicatorDca ? minPercFromLast : undefined,
    });
  }, [
    guardPass,
    deal,
    mergedSettings,
    symbol,
    usdRate,
    isCombo,
    isIndicatorDca,
    minPercFromLast,
  ]);

  const lastKeyRef = useRef<string>('');
  useEffect(() => {
    if (!guardPass || !mergedSettings || !symbol || !deal) {
      if (ladder.length) setLadder([]);
      lastKeyRef.current = '';
      return;
    }
    if (computeKey === lastKeyRef.current) return;
    lastKeyRef.current = computeKey;

    let cancelled = false;
    const userFee = getCachedFee(bot?.exchangeUUID ?? '', symbol.pair)?.maker;
    const context: ExampleOrdersStoreContext = {
      ...defaultContext,
      settings: mergedSettings,
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
    run({ all: true, noCheck: true }, context)
      .then((res) => {
        if (!cancelled) setLadder(res ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('[useDealSmartOrders] ladder compute failed', err);
          setLadder([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeKey, guardPass]);

  const result = useMemo<UseDealSmartOrdersResult>(() => {
    if (!guardPass || !deal || !symbol || ladder.length === 0) return EMPTY;

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

    return { smartOrders, smartChartOrders, strategy };
  }, [
    guardPass,
    deal,
    symbol,
    ladder,
    strategy,
    isCombo,
    isIndicatorDca,
    minPercFromLast,
    projectionLabel,
    pendingOrders,
    completedOrders,
  ]);

  return result;
}
