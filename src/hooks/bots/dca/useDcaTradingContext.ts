import React, { useEffect, useMemo, useState } from 'react';

import getLatestPrices, { getLocalPrices } from '@/helper/price';
//import { usePriceStream } from '@/hooks/usePriceStream';
import type { TradingPair } from '@/hooks/useTradingPairs';
import { useBalanceStore } from '@/stores/live/balanceStore';
import type { BotFormData } from '@/types/bots/form';
import type { DcaBot } from '@/types/dcaBot';
import {
  resolveDcaRanges,
  type DcaDerivedRanges,
  type RangeBounds,
} from '@/utils/bots/dca/ranges';

import type { AggregatedBalanceSnapshot } from '@/utils/bots/dca/base-order-context';
export { resolveBaseOrderContext } from '@/utils/bots/dca/base-order-context';
export type { AggregatedBalanceSnapshot } from '@/utils/bots/dca/base-order-context';

import { useBotFormSelector, type BotFormMode } from '@/features/bots';
import { findUSDRate } from '@/lib/utils/unrealizedPnL';
import {
  MAX_DCA_ORDERS,
  MAX_DCA_STEP_SCALE,
  MAX_DCA_VOLUME_SCALE,
  MIN_DCA_ORDERS,
  MIN_DCA_STEP_SCALE,
  MIN_DCA_TP,
  MIN_DCA_TP_NEW,
  MIN_DCA_VOLUME_SCALE,
  OrderTypeEnum,
  type Prices,
} from '@/types';
import { normalizePairKey } from '@/utils/bots/dca/basic-settings';
import { exampleOrdersStore } from '@/utils/bots/dca/example-orders';
import { normalizeBalanceAsset } from '@/utils/exchangeUtils';

interface BalanceSnapshot {
  free: number;
  locked: number;
  total: number;
  usdValue?: number;
}

export interface DcaTradingContext {
  selectedPairs: TradingPair[];
  activePair?: TradingPair;
  baseAsset?: string;
  quoteAsset?: string;
  aggregatedBalances: {
    base: AggregatedBalanceSnapshot;
    quote: AggregatedBalanceSnapshot;
  };
  /**
   * Effective reference price used for $-based inputs (TP, SL, DCA, R:R etc.).
   * When a limit order is active and a limit price exists, this will be the limit price,
   * otherwise it will be the live market price.
   */
  latestPrice?: number;
  /** Raw market price from price feeds (unchanged) */
  marketPrice?: number;
  /** Limit price taken from form or settings (if any) */
  limitPrice?: number;
  fallbackLimitPrice?: number;
  /** Whether limit price should be used as reference */
  shouldUseLimitPrice?: boolean;
  /** Quote -> USD conversion rate (already computed for $-based inputs). */
  usdPrice?: number;
  /** Raw quote asset minimum amount from the active pair (drives coinm Cont sizing). */
  quoteMinAmount?: number;
  /** Raw base asset minimum amount from the active pair. */
  baseMinAmount?: number;
  /** Active pair exchange/provider string (used for the bybit coinm check). */
  provider?: string;
  /** Taker/maker fee fraction: spot uses the user fee, futures uses 0. */
  fee?: number;
  ranges: DcaDerivedRanges;
}

interface UseDcaTradingContextOptions {
  bot?: DcaBot | null;
  mode?: BotFormMode;
}

const buildDefaultRange = ({
  min,
  max,
  baseValue,
}: {
  min: number;
  max: number | null;
  baseValue?: number;
}): RangeBounds => ({
  min,
  max,
  source: 'default',
  appliedOverrides: [],
  base: {
    value: baseValue ?? min,
    source: 'default',
    min,
    max,
  },
});

const DEFAULT_TP_RANGE = (formData: BotFormData): RangeBounds => {
  const isCombo = formData.type === 'combo';
  const isHedge =
    formData.type === 'hedgeCombo' || formData.type === 'hedgeDca';
  const baseMin = (isCombo || isHedge ? MIN_DCA_TP_NEW : MIN_DCA_TP) * 100;

  return {
    ...buildDefaultRange({ min: baseMin, max: null }),
    base: {
      value: baseMin,
      source: isCombo ? 'combo-default' : isHedge ? 'hedge-default' : 'default',
      min: baseMin,
      max: null,
    },
  };
};

const DEFAULT_ORDERS_RANGE = buildDefaultRange({
  min: MIN_DCA_ORDERS,
  max: MAX_DCA_ORDERS,
});

const DEFAULT_STEP_RANGE = buildDefaultRange({
  min: 0.1,
  max: 10,
});

const DEFAULT_STEP_SCALE_RANGE = buildDefaultRange({
  min: MIN_DCA_STEP_SCALE,
  max: MAX_DCA_STEP_SCALE,
});

const DEFAULT_VOLUME_SCALE_RANGE = buildDefaultRange({
  min: MIN_DCA_VOLUME_SCALE,
  max: MAX_DCA_VOLUME_SCALE,
});

const DEFAULT_SMART_ORDERS_RANGE = buildDefaultRange({
  min: MIN_DCA_ORDERS,
  max: MAX_DCA_ORDERS,
});

const ensureRangeBounds = (
  range: RangeBounds | undefined,
  fallback: RangeBounds
): RangeBounds => {
  if (!range) {
    return fallback;
  }

  const min = Number.isFinite(range.min) ? range.min : fallback.min;
  const max =
    range.max === null || range.max === undefined
      ? fallback.max
      : Number.isFinite(range.max)
        ? range.max
        : fallback.max;

  const fallbackBaseMin = fallback.base.min ?? fallback.min;
  const fallbackBaseMax =
    fallback.base.max === undefined ? fallback.max : fallback.base.max;

  const resolvedBaseMin = Number.isFinite(range.base?.min as number)
    ? (range.base?.min as number)
    : (fallbackBaseMin ?? min);

  const rawBaseMax = range.base?.max;
  const resolvedBaseMax =
    rawBaseMax === null || rawBaseMax === undefined
      ? (fallbackBaseMax ?? max ?? null)
      : Number.isFinite(rawBaseMax as number)
        ? (rawBaseMax as number)
        : (fallbackBaseMax ?? max ?? null);

  return {
    ...fallback,
    ...range,
    min,
    max,
    appliedOverrides: Array.isArray(range.appliedOverrides)
      ? range.appliedOverrides
      : fallback.appliedOverrides,
    base: {
      ...fallback.base,
      ...(range.base ?? {}),
      value: Number.isFinite(range.base?.value)
        ? (range.base?.value as number)
        : fallback.base.value,
      min: resolvedBaseMin,
      max: resolvedBaseMax,
      source: range.base?.source ?? fallback.base.source,
    },
  };
};

const buildAggregatedSnapshot = (
  assetSymbols: Set<string>,
  balanceMap: Map<string, BalanceSnapshot>
): AggregatedBalanceSnapshot => {
  let free = 0;
  let total = 0;
  let usd = 0;

  assetSymbols.forEach((symbol) => {
    const balance = balanceMap.get(symbol);
    if (balance) {
      free += Number(balance.free) || 0;
      total += Number(balance.total) || 0;
      usd += Number(balance.usdValue) || 0;
    }
  });

  return {
    free,
    total,
    usd,
  };
};

const normalizeAsset = (asset?: string) =>
  asset?.toUpperCase?.().trim() || undefined;

const normalizePriceInput = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number.parseFloat(trimmed.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

export const useDcaTradingContext = (
  formData: BotFormData,
  options?: UseDcaTradingContextOptions
): DcaTradingContext => {
  const balances = useBalanceStore((state) => state.balances);
  const botSettings = options?.bot?.settings;
  const selectedPairs = React.useMemo(() => {
    const metadataRecord = formData.pairMetadata ?? {};
    const metadataValues = Object.values(metadataRecord);
    const rawPairs = Array.isArray(formData.pair) ? formData.pair : [];

    const unique = new Map<string, TradingPair>();
    rawPairs.forEach((pairKey) => {
      if (typeof pairKey !== 'string' || pairKey.length === 0) {
        return;
      }
      // `pairMetadata.byPair` is keyed by the concatenated `${base}${quote}`
      // form (e.g. `BTCUSDT`), but `formData.pair` is often the selection
      // symbol form (`BTC-USDT`) set by the pair picker. Mirror the pair
      // selector's normalization (`normalizePairKey`) so the lookup
      // succeeds for either format — without this, freshly onboarded
      // bots render with `selectedPairs = []` and the manual tab shows
      // "BAL 0 QUOTE" because `quoteAsset` resolves to undefined.
      const normalized = normalizePairKey(pairKey);
      const pairMeta =
        metadataRecord[normalized] ??
        metadataRecord[pairKey] ??
        metadataValues.find((meta) => meta.pair === pairKey);
      if (!pairMeta) {
        return;
      }
      const identifier = `${pairMeta.exchange}_${pairMeta.pair}`;
      if (!unique.has(identifier)) {
        unique.set(identifier, pairMeta);
      }
    });

    return Array.from(unique.values());
  }, [formData.pairMetadata, formData.pair]);

  /* const { prices } = usePriceStream(selectedPairs, {
    enableStream: selectedPairs.length > 0,
  }); */

  const [prices, setPrices] = useState<Prices>([]);

  useEffect(() => {
    const unsubscribe = getLatestPrices((d) => setPrices(d.data ?? []), false);
    return () => {
      unsubscribe();
    };
  }, [setPrices]);

  const fallbackSymbol = React.useMemo(() => {
    const symbol = options?.bot?.symbol?.[0]?.value as
      | { baseAsset?: string; quoteAsset?: string }
      | undefined;

    if (!symbol) {
      return undefined;
    }

    return {
      baseAsset: normalizeAsset(symbol.baseAsset),
      quoteAsset: normalizeAsset(symbol.quoteAsset),
    };
  }, [options?.bot?.symbol]);

  const activePair = useMemo(() => selectedPairs[0], [selectedPairs]);

  const baseAsset = React.useMemo(() => {
    const asset =
      normalizeAsset(activePair?.baseAsset?.name) || fallbackSymbol?.baseAsset;
    return asset || undefined;
  }, [activePair?.baseAsset?.name, fallbackSymbol?.baseAsset]);

  const quoteAsset = React.useMemo(() => {
    const asset =
      normalizeAsset(activePair?.quoteAsset?.name) ||
      fallbackSymbol?.quoteAsset;
    return asset || undefined;
  }, [activePair?.quoteAsset?.name, fallbackSymbol?.quoteAsset]);

  const balanceMap = React.useMemo(() => {
    const map = new Map<string, BalanceSnapshot>();
    balances
      .filter((balance) => balance.exchangeUUID === formData.exchangeUUID)
      .forEach((balance) => {
        if (!balance?.asset) {
          return;
        }
        // Canonicalize the wallet symbol to the pair-facing symbol (e.g.
        // Hyperliquid spot "UBTC" -> "BTC") so per-asset balances reconcile
        // against the selected pair's base/quote. Without this the user's
        // Hyperliquid spot BTC reads 0 (forum #4860).
        const key = normalizeBalanceAsset(balance.asset);
        const usdValue =
          typeof balance.usdValue === 'number' ? balance.usdValue : undefined;
        // Merge on collision (defensive — a wallet shouldn't hold both the
        // synthetic and canonical symbol, but summing is the correct behavior
        // if it ever does) rather than letting the last write win.
        const existing = map.get(key);
        const mergedUsd =
          usdValue !== undefined || existing?.usdValue !== undefined
            ? (existing?.usdValue ?? 0) + (usdValue ?? 0)
            : undefined;
        map.set(key, {
          free: (existing?.free ?? 0) + (Number(balance.free) || 0),
          locked: (existing?.locked ?? 0) + (Number(balance.locked) || 0),
          total: (existing?.total ?? 0) + (Number(balance.total) || 0),
          ...(mergedUsd !== undefined ? { usdValue: mergedUsd } : {}),
        });
      });
    return map;
  }, [balances, formData.exchangeUUID]);
  const isDealEdit = useMemo(
    () => options?.mode === 'deal-edit' || options?.mode === 'deal-mass-edit',
    [options?.mode]
  );
  const isSettingsReadonly = useMemo(
    () => options?.mode === 'settings-readonly',
    [options?.mode]
  );
  const isSkipExampleOrders = useMemo(
    () => isSettingsReadonly || isDealEdit,
    [isDealEdit, isSettingsReadonly]
  );
  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({
      balances: [...balanceMap.entries()].map(([asset, data]) => ({
        asset,
        free: `${data.free}`,
        locked: `${data.locked}`,
      })),
    });
  }, [balanceMap, isSkipExampleOrders]);

  const aggregatedBalances = React.useMemo(() => {
    const baseSymbols = new Set<string>();
    const quoteSymbols = new Set<string>();

    selectedPairs.forEach((pair) => {
      const base = normalizeAsset(pair.baseAsset?.name);
      const quote = normalizeAsset(pair.quoteAsset?.name);
      if (base) {
        baseSymbols.add(base);
      }
      if (quote) {
        quoteSymbols.add(quote);
      }
    });

    if (baseAsset) {
      baseSymbols.add(baseAsset);
    }
    if (quoteAsset) {
      quoteSymbols.add(quoteAsset);
    }

    // The per-asset free balances are the real, deployable amounts. We never
    // fall back to currentExchange.balance (the account's total USD): that
    // figure is denominated in the settlement asset, so showing it for a
    // different quote/base asset (e.g. USDC when the account holds USDT) is
    // always wrong. A 0 here is a real zero — the user holds none of that
    // asset — and must display as 0.
    const result = {
      base: buildAggregatedSnapshot(baseSymbols, balanceMap),
      quote: buildAggregatedSnapshot(quoteSymbols, balanceMap),
    };

    return result;
  }, [selectedPairs, balanceMap, baseAsset, quoteAsset]);

  const ranges = React.useMemo((): DcaDerivedRanges => {
    const resolved = resolveDcaRanges(formData);
    const defaultTp = DEFAULT_TP_RANGE(formData);

    return {
      tpPerc: ensureRangeBounds(resolved.tpPerc, defaultTp),
      ordersCount: ensureRangeBounds(
        resolved.ordersCount,
        DEFAULT_ORDERS_RANGE
      ),
      step: ensureRangeBounds(resolved.step, DEFAULT_STEP_RANGE),
      stepScale: ensureRangeBounds(
        resolved.stepScale,
        DEFAULT_STEP_SCALE_RANGE
      ),
      volumeScale: ensureRangeBounds(
        resolved.volumeScale,
        DEFAULT_VOLUME_SCALE_RANGE
      ),
      smartOrders: ensureRangeBounds(
        resolved.smartOrders,
        DEFAULT_SMART_ORDERS_RANGE
      ),
    };
  }, [formData]);

  /*   const activePriceKey = React.useMemo(() => {
    if (!activePair) {
      return undefined;
    }
    return `${activePair.pair}_${activePair.exchange}`;
  }, [activePair]); */

  const fallbackPrice = React.useMemo(() => {
    if (!activePair) {
      return undefined;
    }

    try {
      const localPrices = getLocalPrices();
      const targetSymbol = activePair.pair?.toUpperCase?.();
      if (!Array.isArray(localPrices) || !targetSymbol) {
        return undefined;
      }

      const match = localPrices.find((price) => {
        const symbolMatches = price.symbol?.toUpperCase?.() === targetSymbol;
        const exchangeMatches = price.exchange
          ? price.exchange === activePair.exchange
          : true;
        return symbolMatches && exchangeMatches;
      });

      return match?.price;
    } catch {
      return undefined;
    }
  }, [activePair]);

  const latestPrice = React.useMemo(() => {
    if (!activePair) {
      return fallbackPrice;
    }

    const update = prices.find(
      (p) =>
        p.symbol === activePair?.pair && p.exchange === activePair?.exchange
    );
    return typeof update?.price === 'number' ? update.price : fallbackPrice;
  }, [activePair, prices, fallbackPrice]);

  const usdPrice = React.useMemo(
    () => findUSDRate(quoteAsset || 'USDT', prices ?? [], activePair?.exchange),
    [quoteAsset, prices, activePair?.exchange]
  );

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({ inputLatestPrice: latestPrice });
  }, [latestPrice, isSkipExampleOrders]);

  useEffect(() => {
    if (isSkipExampleOrders) {
      return;
    }
    exampleOrdersStore.setContext({ usdPrice: usdPrice });
  }, [usdPrice, isSkipExampleOrders]);

  const startOrderType = useBotFormSelector('startOrderType');
  const futuresFlag = useBotFormSelector('futures');

  // Legacy fee parity (`example-orders-core.ts:1353`,
  // `feeFactor = 1 + (settings.futures ? 0 : userFee)`): the order-size max
  // computations apply the fee on spot paths only; futures uses 0.
  const fee = React.useMemo(() => {
    if (futuresFlag) {
      return 0;
    }
    const maker = formData.userFee?.makerCommission;
    return typeof maker === 'number' && Number.isFinite(maker) ? maker : 0;
  }, [futuresFlag, formData.userFee?.makerCommission]);

  const useLimitPrice = useBotFormSelector('useLimitPrice');
  const baseOrderPrice = useBotFormSelector('baseOrderPrice');
  const startBotPriceValue = useBotFormSelector('startPrice');

  const shouldUseLimitPrice = React.useMemo(() => {
    if (startOrderType === OrderTypeEnum.limit || useLimitPrice) {
      return true;
    }

    const sot = botSettings?.startOrderType;
    if (typeof sot === 'string' && sot.toLowerCase() === 'limit') {
      return true;
    }

    if (botSettings?.useLimitPrice) {
      return true;
    }

    return false;
  }, [
    startOrderType,
    useLimitPrice,
    botSettings?.startOrderType,
    botSettings?.useLimitPrice,
  ]);

  const limitPriceCandidates = React.useMemo(() => {
    const values: number[] = [];

    const pushCandidate = (candidate: unknown) => {
      const normalized = normalizePriceInput(candidate);
      if (typeof normalized === 'number' && !values.includes(normalized)) {
        values.push(normalized);
      }
    };

    pushCandidate(baseOrderPrice);
    pushCandidate(startBotPriceValue);
    pushCandidate(botSettings?.baseOrderPrice);
    pushCandidate(botSettings?.startPrice);

    return values;
  }, [
    baseOrderPrice,
    startBotPriceValue,
    botSettings?.baseOrderPrice,
    botSettings?.startPrice,
  ]);

  const primaryLimitPrice = limitPriceCandidates[0];
  const secondaryLimitPrice = limitPriceCandidates
    .slice(1)
    .find((candidate) => candidate !== primaryLimitPrice);

  // Preserve the raw market price separately
  const marketPrice = latestPrice;

  // Determine an effective reference price: prefer limit price when configured
  const referencePrice = React.useMemo(() => {
    if (
      shouldUseLimitPrice &&
      typeof primaryLimitPrice === 'number' &&
      primaryLimitPrice > 0
    ) {
      return primaryLimitPrice;
    }
    return marketPrice;
  }, [shouldUseLimitPrice, primaryLimitPrice, marketPrice]);

  // Memoize the assembled context so it only changes reference when one of its
  // constituent (already-memoized) fields actually changes. Returning a fresh
  // object literal every render made every consumer's downstream memos rebuild
  // on each live-price tick — e.g. the bot form footer's button-config array,
  // which re-rendered the memoised ResponsiveButtonRow ~26x/s (RenderLoopTripwire
  // on /bot/new, /combo/new, /grid/edit, …).
  const context = useMemo<DcaTradingContext>(() => {
    const ctx: DcaTradingContext = {
      selectedPairs,
      aggregatedBalances,
      ranges,
      shouldUseLimitPrice,
    };

    if (activePair) {
      ctx.activePair = activePair;
    }
    if (baseAsset) {
      ctx.baseAsset = baseAsset;
    }
    if (quoteAsset) {
      ctx.quoteAsset = quoteAsset;
    }

    // latestPrice is the effective reference price used across the form
    if (typeof referencePrice === 'number') {
      ctx.latestPrice = referencePrice;
    }

    // Expose raw market price separately for components that need it
    if (typeof marketPrice === 'number') {
      ctx.marketPrice = marketPrice;
    }

    if (typeof primaryLimitPrice === 'number') {
      ctx.limitPrice = primaryLimitPrice;
    }
    if (typeof secondaryLimitPrice === 'number') {
      ctx.fallbackLimitPrice = secondaryLimitPrice;
    }

    if (typeof usdPrice === 'number') {
      ctx.usdPrice = usdPrice;
    }
    if (typeof activePair?.quoteAsset?.minAmount === 'number') {
      ctx.quoteMinAmount = activePair.quoteAsset.minAmount;
    }
    if (typeof activePair?.baseAsset?.minAmount === 'number') {
      ctx.baseMinAmount = activePair.baseAsset.minAmount;
    }
    if (activePair?.exchange) {
      ctx.provider = activePair.exchange;
    }
    ctx.fee = fee;

    return ctx;
  }, [
    selectedPairs,
    aggregatedBalances,
    ranges,
    shouldUseLimitPrice,
    activePair,
    baseAsset,
    quoteAsset,
    referencePrice,
    marketPrice,
    primaryLimitPrice,
    secondaryLimitPrice,
    usdPrice,
    fee,
  ]);

  return context;
};
