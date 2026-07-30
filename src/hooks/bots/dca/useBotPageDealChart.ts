import { useDealOrders } from '@/hooks/useDealOrders';
import { useBotSpecificDeals } from '@/hooks/useBotSpecificDeals';
import { useDealSmartOrders } from '@/hooks/bots/dca/useDealSmartOrders';
import {
  useComboBotsStore,
  useDcaBotsStore,
  useDealStore,
  type DealType,
} from '@/stores/live';
import {
  BotTypesEnum,
  DCADealStatusEnum,
  StrategyEnum,
  type DCABotSettings,
  type DCAGrid,
  type TransactionChart,
} from '@/types';
import {
  dealCompletedOrdersToTransactions,
  dealPendingOrdersToChartLines,
} from '@/utils/bots/dca/deal-chart-orders';
import { splitDealOrders } from '@/utils/orders/viewOrder';
import { normalizePairKey } from '@/utils/pairs';
import { useMemo, useRef } from 'react';

export interface UseBotPageDealChartParams {
  /** Route bot id. Empty string disables the hook. */
  botId: string;
  /** Only `dca` and `combo` project a deal ladder; anything else disables. */
  botType: BotTypesEnum;
  /**
   * Pair the chart is anchored on (the form's selected pair). Multi-pair bots
   * can have several open deals, so the overlay only resolves when one of them
   * matches — otherwise a chart showing BTCUSDT would draw ETHUSDT's ladder.
   */
  pair?: string | undefined;
  enabled?: boolean;
}

export interface UseBotPageDealChartResult {
  /** '' when nothing is being overlaid. */
  dealId: string;
  /**
   * Pair the overlay belongs to (normalized, alphanumeric-uppercase). The chart
   * re-checks this before drawing so switching the TradingView symbol away from
   * the deal's pair drops the overlay instead of mis-drawing it.
   */
  pair: string;
  /** Real resting orders (solid) + projected not-yet-placed levels (grey). */
  orders: DCAGrid[];
  /** The deal's filled/cancelled orders as chart buy/sell markers. */
  transactions: TransactionChart[];
}

const EMPTY_ORDERS: DCAGrid[] = [];
const EMPTY_TRANSACTIONS: TransactionChart[] = [];

const EMPTY_RESULT: UseBotPageDealChartResult = {
  dealId: '',
  pair: '',
  orders: EMPTY_ORDERS,
  transactions: EMPTY_TRANSACTIONS,
};

/** `BTC-USDT`, `BTC/USDT` and `BTCUSDT` all have to compare equal. */
const pairKey = (value: string | undefined | null): string =>
  normalizePairKey(value ?? '');

/**
 * Resolves the open deal a bot page's chart should be annotated with, and
 * returns it as ready-to-draw chart lines.
 *
 * The bot page's chart otherwise only knows the FORM's projected ladder, which
 * is anchored on the current market price — it answers "what would a new deal
 * look like", not "where does this running deal buy next". Legacy `main-dash`
 * merged both on the bot page (`useDCAPage.getChartOrders`, the
 * `id && activeDeal && !edit` branch); this restores that for V2 by reusing the
 * projection the deal drawer already runs ({@link useDealSmartOrders}).
 *
 * Returns {@link EMPTY_RESULT} whenever the bot has no open deal for the
 * charted pair, so callers can treat a non-empty `orders` as "overlay me".
 */
export function useBotPageDealChart({
  botId,
  botType,
  pair,
  enabled = true,
}: UseBotPageDealChartParams): UseBotPageDealChartResult {
  const isCombo = botType === BotTypesEnum.combo;
  const isSupported = botType === BotTypesEnum.dca || isCombo;
  const active = Boolean(enabled && botId && isSupported);

  // Memoized: useBotSpecificDeals keys effects off these fields, and an inline
  // literal would hand it a new object every render.
  const dealsFilter = useMemo(
    () => ({
      botId: active ? botId : '',
      status: DCADealStatusEnum.open,
      dealType: (isCombo ? 'combo' : 'dca') as DealType,
    }),
    [active, botId, isCombo]
  );
  const { deals: openDeals } = useBotSpecificDeals(dealsFilter);

  // Pick the deal the chart is actually showing. With a pair in hand we require
  // a match; without one (the form hasn't resolved a pair yet) a single open
  // deal is unambiguous, but several are not — overlay nothing rather than
  // guess.
  const selectedDeal = useMemo(() => {
    if (!active) return null;
    const open = openDeals.filter((d) => d.status === 'open');
    if (!open.length) return null;
    const wanted = pairKey(pair);
    if (wanted) {
      return (
        open.find((d) => {
          const symbol = pairKey(d.symbol?.symbol);
          const composed = normalizePairKey(
            `${d.symbol?.baseAsset ?? ''}${d.symbol?.quoteAsset ?? ''}`
          );
          return symbol === wanted || composed === wanted;
        }) ?? null
      );
    }
    return open.length === 1 ? (open[0] ?? null) : null;
  }, [active, openDeals, pair]);

  const dealId = selectedDeal?._id ?? '';

  const { orders: dealOrders } = useDealOrders(
    dealId ? botId : '',
    dealId,
    isCombo ? BotTypesEnum.combo : BotTypesEnum.dca
  );

  const { pendingOrders, completedOrders } = useMemo(
    () => splitDealOrders(dealOrders, selectedDeal?.exchange),
    [dealOrders, selectedDeal?.exchange]
  );

  // The deal off the shared store rather than the list copy: it carries the
  // live `lastPrice` / `levels` the socket keeps fresh, which is what the
  // indicator-DCA re-anchoring in useDealSmartOrders measures from.
  const storeDeal = useDealStore((s) =>
    dealId ? (s.deals[botId]?.[dealId] ?? null) : null
  );
  const deal = storeDeal ?? selectedDeal;

  // Settings come from the SAVED bot (both the form's `useDcaBots`/`useComboBots`
  // queries populate these stores), not the in-progress form state: the overlay
  // must show where the running bot will actually place its next order, not
  // where an unsaved edit would.
  const dcaBot = useDcaBotsStore((s) =>
    dealId && !isCombo ? s.bots[botId] : undefined
  );
  const comboBot = useComboBotsStore((s) =>
    dealId && isCombo ? s.bots[botId] : undefined
  );
  const bot = dcaBot ?? comboBot;

  const smartBot = useMemo(
    () =>
      bot
        ? {
            settings: (bot as { settings?: DCABotSettings }).settings,
            exchangeUUID:
              (bot as { exchangeUUID?: string }).exchangeUUID ??
              deal?.exchangeUUID,
          }
        : null,
    [bot, deal?.exchangeUUID]
  );

  const { smartChartOrders, strategy } = useDealSmartOrders({
    bot: smartBot,
    deal,
    pendingOrders,
    completedOrders,
    isCombo,
    enabled: Boolean(dealId),
  });

  const orders = useMemo<DCAGrid[]>(() => {
    if (!dealId) return EMPTY_ORDERS;
    const real = dealPendingOrdersToChartLines(
      pendingOrders,
      strategy ?? StrategyEnum.long
    );
    if (!real.length && !smartChartOrders.length) return EMPTY_ORDERS;
    return [...real, ...smartChartOrders];
  }, [dealId, pendingOrders, smartChartOrders, strategy]);

  const transactions = useMemo<TransactionChart[]>(() => {
    if (!dealId || !completedOrders.length) return EMPTY_TRANSACTIONS;
    return dealCompletedOrdersToTransactions(completedOrders);
  }, [dealId, completedOrders]);

  const result = useMemo<UseBotPageDealChartResult>(() => {
    if (!dealId || !orders.length) return EMPTY_RESULT;
    return {
      dealId,
      pair: normalizePairKey(
        deal?.symbol?.symbol ??
          `${deal?.symbol?.baseAsset ?? ''}${deal?.symbol?.quoteAsset ?? ''}`
      ),
      orders,
      transactions,
    };
  }, [dealId, deal?.symbol, orders, transactions]);

  // `useDealOrders` rebuilds its array on every render (the store selector
  // returns a fresh one), so every memo above it churns identity even when
  // nothing changed. The caller feeds this straight into the chart panel's
  // useMemo, so hand back the PREVIOUS object whenever the content is
  // unchanged — otherwise the panel (and the TradingView chart under it)
  // re-renders on every parent render. The payload is a handful of price
  // levels, so a serialized comparison is cheap.
  const lastRef = useRef<{ key: string; value: UseBotPageDealChartResult }>({
    key: '',
    value: EMPTY_RESULT,
  });
  const key = result === EMPTY_RESULT ? '' : JSON.stringify(result);
  if (key !== lastRef.current.key) {
    lastRef.current = { key, value: result };
  }
  return lastRef.current.value;
}
