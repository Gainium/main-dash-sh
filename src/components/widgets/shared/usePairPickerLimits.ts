import { useCallback, useMemo } from 'react';
import {
  useOptionalBotFormPick,
  useOptionalBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import type { TradingPair } from '@/hooks/useTradingPairs';
import { useGraphQL } from '@/hooks/useGraphQL';
import { useLatestPrices, usePricesLive } from '@/hooks/useLatestPrices';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { useBalanceStore } from '@/stores/live/balanceStore';
import { useUIStore } from '@/stores/uiStore';
import { isCoinmExchange, isFuturesExchange } from '@/utils/exchangeUtils';
import { BotTypesEnum } from '@/types';
import {
  isDatedContract,
  pairFitReason,
  pairMinOrderQuote,
  resolveBotFirstOrderQuote,
  resolveBotSmallestOrderQuote,
  type FitOrderSettings,
} from '@/utils/pairPicker';

interface LeverageBracketRow {
  symbol: string;
  leverage: number;
}

const NO_TOP_KEYS = [] as const;
const NO_BALANCES: ReturnType<typeof useBalanceStore.getState>['balances'] = [];
const SLICE_KEYS = [
  'futures',
  'leverage',
  'orderSizeType',
  'baseOrderSize',
  'orderSize',
  'useDca',
  'allowRaiseToExchangeMin',
] as const;

export interface PairLimits {
  /** Values whose source is still loading (shown as "Loading…"). */
  pending?: { minOrder?: boolean; maxLeverage?: boolean };
  minOrder?: number;
  minLeverage?: number;
  maxLeverage?: number;
  /** Delivery time of a dated futures contract (absent for perpetuals). */
  deliveryTime?: number;
  fitReason?: string;
}

/**
 * Trading limits for the pair picker (spec 115 §3.5, §3.6, §4): each pair's
 * min order in its quote asset, its max leverage, and why the bot (as set up
 * in the form) can't trade it.
 *
 * Never blocks: every source is already cached or running in the background.
 * - Prices: the app-wide feed, read only while the dialog is open (`open`),
 *   so the form isn't re-rendered by price ticks while the dialog is shut.
 * - Leverage: the same query + key as the form's leverage block, fetched
 *   whenever this is `enabled` (bot form mounted), so the cache is warm by
 *   the time the dialog opens.
 */
export const usePairPickerLimits = (
  enabled: boolean,
  open: boolean,
  pairsBySelection: Record<string, TradingPair> | undefined
): ((selectionSymbol: string) => PairLimits | null) => {
  const form = useOptionalBotFormPick(NO_TOP_KEYS, SLICE_KEYS);
  const exchangeUUID = useOptionalBotFormTopLevelSelector('exchangeUUID');
  const isLive = useUIStore((s) => s.isLiveTrading);

  const slice = (
    form.type === BotTypesEnum.combo
      ? form.combo
      : form.type === BotTypesEnum.grid
        ? form.grid
        : form.dca
  ) as
    | Partial<FitOrderSettings & { futures: boolean; leverage: unknown }>
    | undefined;
  const futures = Boolean(slice?.futures);
  const botLeverage = Number(slice?.leverage);

  const uuid = typeof exchangeUUID === 'string' ? exchangeUUID.trim() : '';
  const fetchLeverage = enabled && futures && isLive && uuid !== '';
  const leverageInput = useMemo(
    () => botQueries.getLeverageBracket({ uuid }),
    [uuid]
  );
  const leverageQuery = useGraphQL<LeverageBracketRow[]>(
    'getLeverageBracket',
    leverageInput,
    { enabled: fetchLeverage, staleTime: 5 * 60 * 1000 }
  );
  const leverageLoading =
    fetchLeverage && (leverageQuery.isLoading || leverageQuery.isFetching);
  const leverageBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    const res = leverageQuery.data;
    if (!fetchLeverage || res?.status !== 'OK' || !Array.isArray(res.data)) {
      return map;
    }
    for (const b of res.data) {
      if (!b?.symbol || !Number.isFinite(b.leverage) || b.leverage <= 0)
        continue;
      const key = b.symbol.toUpperCase();
      const prev = map.get(key);
      map.set(
        key,
        prev === undefined ? b.leverage : Math.min(prev, b.leverage)
      );
    }
    return map;
  }, [leverageQuery.data, fetchLeverage]);

  const prices = useLatestPrices(enabled && open);
  const pricesLive = usePricesLive(enabled && open);
  const priceIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of prices) {
      const v = Number(p.price);
      if (Number.isFinite(v) && v > 0) map.set(`${p.exchange}:${p.symbol}`, v);
    }
    return map;
  }, [prices]);

  // Free balance per asset on this account (spot only: futures margin can be
  // pooled across coins, so a per-asset figure would hide tradable pairs).
  // Read only while the dialog is open; until the account's balances have
  // loaded the check is skipped rather than treating every asset as 0.
  const balances = useBalanceStore((st) =>
    enabled && open ? st.balances : NO_BALANCES
  );
  const freeByAsset = useMemo(() => {
    if (futures || !uuid) return null;
    const rows = balances.filter((b) => b.exchangeUUID === uuid);
    if (!rows.length) return null;
    const map = new Map<string, number>();
    for (const b of rows) {
      const asset = b.asset?.toUpperCase();
      if (!asset) continue;
      map.set(asset, (map.get(asset) ?? 0) + (Number(b.free) || 0));
    }
    return map;
  }, [balances, futures, uuid]);

  const bot = useMemo(
    () => ({
      firstOrderQuote:
        form.type === BotTypesEnum.grid || !slice
          ? null
          : resolveBotFirstOrderQuote(slice),
      // Grid bots size per level from a budget, not a base order — the
      // order-size check is DCA / Combo only.
      smallestOrderQuote:
        form.type === BotTypesEnum.grid || !slice
          ? null
          : resolveBotSmallestOrderQuote(slice),
      leverage:
        futures && Number.isFinite(botLeverage) && botLeverage > 0
          ? botLeverage
          : null,
    }),
    [form.type, slice, futures, botLeverage]
  );

  return useCallback(
    (selectionSymbol: string) => {
      if (!enabled) return null;
      const pair = pairsBySelection?.[selectionSymbol];
      if (!pair) return null;
      const minOrder = pairMinOrderQuote(
        pair,
        priceIndex.get(`${pair.exchange}:${pair.pair}`)
      );
      // Max: the account's own bracket when we have it (live futures —
      // account-specific), else the exchange's published per-pair limit
      // (spec 115 phase 2: on paper and before an account is chosen too).
      // Min: the published limit only.
      const pos = (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
      // Spot venues publish margin leverage (OKX spot) that spot bots never
      // use — leverage is shown for futures pairs only.
      const isFuturesPair = isFuturesExchange(pair.exchange);
      const maxLeverage = isFuturesPair
        ? (leverageBySymbol.get(pair.pair?.toUpperCase?.() ?? '') ??
          pos(pair.maxLeverage))
        : null;
      const minLeverage = isFuturesPair ? pos(pair.minLeverage) : null;
      // Still loading: a min order that needs a price before the price feed
      // is live, and a max leverage while the account's brackets load.
      const minOrderPending =
        minOrder === null &&
        !isCoinmExchange(pair.exchange) &&
        (pair.baseAsset?.minAmount ?? 0) > 0 &&
        !pricesLive;
      const maxLeveragePending =
        maxLeverage === null && isFuturesPair && leverageLoading;
      const quote = pair.quoteAsset?.name ?? '';
      const fitReason = pairFitReason(
        {
          minOrder,
          maxLeverage,
          quote,
          ...(freeByAsset
            ? { freeQuote: freeByAsset.get(quote.toUpperCase()) ?? 0 }
            : {}),
        },
        bot
      );
      return {
        ...(minOrderPending || maxLeveragePending
          ? {
              pending: {
                ...(minOrderPending ? { minOrder: true } : {}),
                ...(maxLeveragePending ? { maxLeverage: true } : {}),
              },
            }
          : {}),
        ...(minOrder !== null ? { minOrder } : {}),
        ...(minLeverage !== null ? { minLeverage } : {}),
        ...(maxLeverage !== null ? { maxLeverage } : {}),
        ...(isDatedContract(pair) ? { deliveryTime: pair.deliveryTime } : {}),
        ...(fitReason ? { fitReason } : {}),
      };
    },
    [
      enabled,
      pairsBySelection,
      priceIndex,
      pricesLive,
      leverageBySymbol,
      leverageLoading,
      freeByAsset,
      bot,
    ]
  );
};
