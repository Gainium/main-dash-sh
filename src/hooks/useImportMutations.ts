import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { exchangeQueries } from '@/lib/api/GraphQLQueries-exchange-queries';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { GraphQLClient, type ReturnResult } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { isCoinmExchange, isFuturesExchange } from '@/utils/exchangeUtils';
import {
  StrategyEnum,
  OrderTypeEnum,
  StartConditionEnum,
  CloseConditionEnum,
  DCATypeEnum,
  OrderSizeTypeEnum,
  BotMarginTypeEnum,
  TerminalDealTypeEnum,
  CloseDCATypeEnum,
  DCADealStatusEnum,
  type ExchangeEnum,
  type DCABot,
} from '@/types';
import type { Order, Position } from '@/types/bots/trading';
import {
  flattenPosition,
  readVenuePosition,
  sweepRemainder,
  type FlattenTarget,
} from '@/features/trading-terminal/utils/flattenPosition';

interface DealResult {
  status: 'OK' | 'NOTOK';
  reason?: string;
  data?: unknown;
}

export interface UseImportMutationsReturn {
  importOrderMutation: UseMutationResult<
    unknown,
    Error,
    {
      orderId: string;
      symbol: string;
      exchangeUUID: string;
      newBotSettings: {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        price: string;
        quantity: string;
        side: string;
      };
    }
  >;
  importPositionMutation: UseMutationResult<unknown, Error, Position>;
  cancelOrderMutation: UseMutationResult<
    unknown,
    Error,
    {
      orderId: string;
      symbol: string;
      exchangeUUID: string;
    }
  >;
  closeDealMutation: UseMutationResult<
    unknown,
    Error,
    { botId: string; dealId: string; type?: CloseDCATypeEnum }
  >;
  handleImportOrder: (order: Order) => void;
  handleImportPosition: (position: Position) => void;
  handleCancelOrder: (order: Order) => void; // branches deal vs order
  /**
   * The only way this panel closes a position: flatten it through Gainium, so
   * every part of it — each linked bot's deal and the remainder nobody owned —
   * is closed as a deal and recorded. The raw `closePositionOnExchange` path
   * was removed deliberately: it flattened the position on the venue, left no
   * record, and desynced every bot still holding a share of it.
   */
  handleFlattenPosition: (
    target: FlattenTarget,
    stopReopeningBots: boolean
  ) => Promise<void>;
  /** True while a flatten is in flight. */
  isClosingAsDeal: boolean;
}

/** How long to wait for the bot worker to adopt a freshly imported position. */
const DEAL_ADOPTION_TIMEOUT_MS = 45_000;
const DEAL_ADOPTION_POLL_MS = 2_000;

/**
 * Mutations for the Trading Terminal "Exchange" tab — import/cancel raw
 * exchange orders & positions, ported from the legacy `TradingPositions`.
 *
 * Each call builds a fresh `GraphQLClient` carrying the current token + the
 * paper-context flag (live/paper sensitive), mirroring `useDealActions` /
 * `useBotMutations`. The optional `onSuccess` callback lets the panel refetch
 * the active tab after every action (legacy refetched after each one).
 */
export const useImportMutations = (opts?: {
  onSuccess?: () => void;
}): UseImportMutationsReturn => {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const endpoint =
    import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
  // Per-call client carries token + paper-context header (live/paper sensitive).
  const client = new GraphQLClient(
    endpoint,
    tokens?.accessToken,
    !isLiveTrading
  );
  const refetch = () => opts?.onSuccess?.();

  // ---- Import order (server builds bot from newBotSettings) ----
  const importOrderMutation = useMutation({
    mutationFn: async (params: {
      orderId: string;
      symbol: string;
      exchangeUUID: string;
      newBotSettings: {
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        price: string;
        quantity: string;
        side: string;
      };
    }) => {
      const { query, variables } = exchangeQueries.importExchangeOrder(params);
      const res = await client.request<{ importExchangeOrder: DealResult }>(
        query,
        variables
      );
      if (res.importExchangeOrder.status !== 'OK') {
        throw new Error(
          res.importExchangeOrder.reason || 'Failed to import order'
        );
      }
      return res.importExchangeOrder;
    },
    onSuccess: () => {
      toast.success(
        'Order successfully imported, it may take some time for orders to be updated in the list'
      );
      refetch();
    },
    onError: (e: Error) =>
      toast.error(
        `Failed to import order. Reason ${e?.message || 'Unknown error'}`
      ),
  });

  // ---- Import position (createDCABot; no dedicated mutation) ----
  const importPositionMutation = useMutation({
    mutationFn: async (position: Position) => {
      // next-midnight (legacy: new Date(); date.setHours(24, 0, 0))
      const date = new Date();
      date.setHours(24, 0, 0);
      const {
        quantity,
        price,
        exchange,
        exchangeUUID,
        side,
        symbol,
        marginType,
        leverage,
        baseAssetName,
        quoteAssetName,
        positionId,
      } = position;
      // COIN-M -> abs(quantity); otherwise -> abs(quantity * price)
      const orderSize = `${Math.abs(
        +(isCoinmExchange(exchange) ? quantity : `${+quantity * +price}`)
      )}`;
      // strategy: LONG/SHORT explicit, else quantity-sign fallback
      const strategy =
        side === 'LONG'
          ? StrategyEnum.long
          : side === 'SHORT'
            ? StrategyEnum.short
            : +quantity > 0
              ? StrategyEnum.long
              : StrategyEnum.short;

      const { query, variables } = botQueries.createDCABot({
        pair: [symbol],
        name: '',
        strategy,
        profitCurrency: 'quote',
        baseOrderSize: orderSize,
        startOrderType: OrderTypeEnum.limit,
        startCondition: StartConditionEnum.asap,
        tpPerc: '1',
        orderFixedIn: 'base',
        orderSize,
        step: '1',
        ordersCount: 5,
        activeOrdersCount: 1,
        volumeScale: '1',
        stepScale: '1',
        useTp: false,
        useSl: false,
        slPerc: '-10',
        useSmartOrders: false,
        minOpenDeal: '',
        maxOpenDeal: '',
        useDca: false,
        hodlDay: '7',
        hodlAt: '15:00:00',
        hodlNextBuy: date.getTime(),
        maxNumberOfOpenDeals: '',
        indicators: [],
        baseOrderPrice: price,
        orderSizeType: OrderSizeTypeEnum.quote,
        limitTimeout: '20',
        useLimitTimeout: false,
        type: DCATypeEnum.terminal,
        moveSL: false,
        moveSLTrigger: '0.5',
        moveSLValue: '0.2',
        dealCloseCondition: CloseConditionEnum.tp,
        dealCloseConditionSL: CloseConditionEnum.tp,
        terminalDealType: TerminalDealTypeEnum.import,
        trailingTpPerc: '0.3',
        useMultiTp: false,
        multiTp: [],
        useMultiSl: false,
        multiSl: [],
        marginType: marginType as BotMarginTypeEnum,
        leverage: +leverage,
        futures: isFuturesExchange(exchange),
        coinm: isCoinmExchange(exchange),
        useLimitPrice: true,
        baseAsset: [baseAssetName],
        quoteAsset: [quoteAssetName],
        exchange: exchange as ExchangeEnum,
        exchangeUUID,
        importFrom: positionId,
        indicatorGroups: [],
        vars: { list: [], paths: [] },
      });
      const res = await client.request<{ createDCABot: ReturnResult<DCABot> }>(
        query,
        variables
      );
      if (res.createDCABot.status !== 'OK') {
        throw new Error(res.createDCABot.reason || 'Failed to import position');
      }
      return res.createDCABot.data;
    },
    onSuccess: () => {
      toast.success(
        'Deal successfully imported, it may take some time for orders to be updated in the list'
      );
      refetch();
    },
    onError: (e: Error) =>
      toast.error(`Deal wasn't created. Reason ${e?.message || 'Unknown error'}`),
  });

  // ---- Cancel raw order on exchange ----
  const cancelOrderMutation = useMutation({
    mutationFn: async (p: {
      orderId: string;
      symbol: string;
      exchangeUUID: string;
    }) => {
      const { query, variables } = exchangeQueries.closeOrderOnExchange(p);
      const res = await client.request<{ closeOrderOnExchange: DealResult }>(
        query,
        variables
      );
      if (res.closeOrderOnExchange.status !== 'OK') {
        throw new Error(
          res.closeOrderOnExchange.reason || 'Failed to cancel order'
        );
      }
      return res.closeOrderOnExchange;
    },
    onSuccess: (res) => {
      const data = (res as DealResult).data;
      toast.info(
        `Order canceled: ${data}, it may take some time for orders to be updated in the list`
      );
      refetch();
    },
    onError: (e: Error) => toast.error(e?.message || 'Failed to cancel order'),
  });

  // ---- Close deal (orders-Cancel branch when botId && dealId) ----
  const closeDealMutation = useMutation({
    mutationFn: async (p: {
      botId: string;
      dealId: string;
      type?: CloseDCATypeEnum;
    }) => {
      const { query, variables } = botQueries.closeDCADeal({
        botId: p.botId,
        dealId: p.dealId,
        // Legacy default for the orders branch: cancel the resting orders.
        type: p.type ?? CloseDCATypeEnum.cancel,
      });
      const res = await client.request<{ closeDCADeal: DealResult }>(
        query,
        variables
      );
      if (res.closeDCADeal.status !== 'OK') {
        throw new Error(res.closeDCADeal.reason || 'Failed to close deal');
      }
      return res.closeDCADeal;
    },
    onSuccess: () => {
      toast.info(
        'Deal closed. It may take some time for orders to be updated in the list'
      );
      refetch();
    },
    onError: (e: Error) => toast.error(e?.message || 'Failed to close deal'),
  });

  // ---- Handlers (replicate legacy guards/branches) ----
  const handleImportOrder = (order: Order) => {
    if (!order.baseAssetName || !order.quoteAssetName) return; // legacy: silent return
    importOrderMutation.mutate({
      orderId: order.orderId,
      symbol: order.symbol,
      exchangeUUID: order.exchangeUUID,
      newBotSettings: {
        symbol: order.symbol,
        baseAsset: order.baseAssetName,
        quoteAsset: order.quoteAssetName,
        price: order.price,
        quantity: order.quantity,
        side: order.side,
      },
    });
  };

  const handleImportPosition = (position: Position) => {
    if (!position.baseAssetName || !position.quoteAssetName) return; // legacy guard
    importPositionMutation.mutate(position);
  };

  const handleCancelOrder = (order: Order) => {
    // legacy branch: botId && dealId -> closeDeal; else cancelOrder
    const dealId = (order as Order & { dealId?: string }).dealId;
    if (order.botId && dealId) {
      closeDealMutation.mutate({ botId: order.botId, dealId });
    } else {
      cancelOrderMutation.mutate({
        orderId: order.orderId,
        symbol: order.symbol,
        exchangeUUID: order.exchangeUUID,
      });
    }
  };

  // ---- Close a position as a Gainium deal (import first, then close) ----

  /**
   * The open deal the freshly imported terminal bot holds on `symbol`, or
   * `undefined`. Minimal projection — we only need to identify the deal.
   *
   * Three things about `dcaDealList` that this got wrong and prod rejected:
   *  - there is no `all` field on `getDcaDealListInput`; sending one fails the
   *    whole query with BAD_USER_INPUT, so the lookup never returned anything;
   *  - `terminal` must be passed explicitly, or terminal deals are excluded;
   *  - a top-level `status` is IGNORED (it has to go through
   *    `dataGridInput.filterModel`), so asking for `open` did nothing. The
   *    backend defaults to active deals only, which is exactly what we want.
   * `useDcaDeals` documents the last one; this now mirrors that hook.
   */
  const findOpenDeal = async (
    botId: string,
    symbol: string
  ): Promise<string | undefined> => {
    const { query, variables } = dealQueries.dcaDealList(
      { botId, terminal: true },
      `_id botId status symbol { symbol }`
    );
    const res = await client.request<{
      dcaDealList: ReturnResult<{
        result: {
          _id: string;
          botId: string;
          status: string;
          symbol?: { symbol?: string };
        }[];
      }>;
    }>(query, variables);
    if (res.dcaDealList.status !== 'OK') return undefined;
    const deals = res.dcaDealList.data?.result ?? [];
    // Match the pair so we never close somebody else's position, and skip
    // anything already finished in case the active-only default ever changes.
    return deals.find(
      (d) =>
        d.symbol?.symbol === symbol &&
        d.status !== DCADealStatusEnum.closed &&
        d.status !== DCADealStatusEnum.canceled
    )?._id;
  };

  const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  /** Poll until the bot worker has adopted the imported position into a deal. */
  const waitForOpenDeal = async (botId: string, symbol: string) => {
    const deadline = Date.now() + DEAL_ADOPTION_TIMEOUT_MS;
    // The import is picked up by the bot worker on its own cycle, so the deal
    // does not exist the moment `createDCABot` returns.
    for (;;) {
      const dealId = await findOpenDeal(botId, symbol);
      if (dealId) return dealId;
      if (Date.now() >= deadline) return undefined;
      await wait(DEAL_ADOPTION_POLL_MS);
    }
  };

  /**
   * Flatten a venue position, through Gainium, leaving a record of all of it.
   *
   * Stages live in `flattenPosition`: stop the bots that would re-open, close
   * each linked deal at market, wait for the venue to reflect it, and hand back
   * whatever remains. That remainder — the part no deal owned — is then
   * imported as a terminal deal and closed, so it lands in the deal history
   * too instead of being flattened off the venue silently.
   *
   * A position with no linked bots is just the degenerate case: nothing to
   * close first, so the whole thing is imported and closed as one deal.
   */
  const flattenMutation = useMutation({
    mutationFn: async ({
      target,
      stopReopeningBots,
    }: {
      target: FlattenTarget;
      stopReopeningBots: boolean;
    }) => {
      const outcome = await flattenPosition(client, target, {
        stopReopeningBots,
        onProgress: (m) => toast.info(m),
      });
      if (outcome.warning) {
        throw new Error(outcome.warning);
      }

      const remainder = outcome.remainingPosition;
      if (!remainder) {
        return outcome;
      }
      if (!remainder.baseAssetName || !remainder.quoteAssetName) {
        throw new Error(
          `${target.symbol} is partly closed, but the rest is missing its assets so it cannot be imported. Close it from the exchange.`
        );
      }

      toast.info(`Importing the rest of ${target.symbol}…`);
      const bot = await importPositionMutation.mutateAsync(
        remainder as unknown as Position
      );
      const botId = (bot as DCABot | undefined)?._id;
      if (!botId) {
        throw new Error('Import did not return a bot');
      }

      toast.info(`Waiting for the ${target.symbol} deal to open…`);
      const dealId = await waitForOpenDeal(botId, target.symbol);
      if (!dealId) {
        throw new Error(
          `The rest of ${target.symbol} was imported but its deal has not opened yet. It is now tracked on the Trading Bots page — close it from there.`
        );
      }
      await closeDealMutation.mutateAsync({
        botId,
        dealId,
        type: CloseDCATypeEnum.closeByMarket,
      });

      // Confirm rather than assume, then finish the job. Adopting a position
      // rounds the order to the venue's step, so one pass can leave a sub-step
      // remainder (0.024 ETH adopted as 0.023, leaving 0.001). That remainder
      // belongs to no deal, so there is nothing to record for it — but the
      // action promises a flat position, so sweep it reduce-only rather than
      // leaving it to re-appear as a fresh unowned row.
      await wait(DEAL_ADOPTION_POLL_MS);
      const left = await readVenuePosition(client, target);
      if (!left) return outcome;

      const swept = await sweepRemainder(client, target);
      if (!swept) {
        return { ...outcome, leftover: Math.abs(+left.quantity) };
      }
      await wait(DEAL_ADOPTION_POLL_MS);
      const stillLeft = await readVenuePosition(client, target);
      return stillLeft
        ? { ...outcome, leftover: Math.abs(+stillLeft.quantity) }
        : { ...outcome, sweptRemainder: Math.abs(+left.quantity) };
    },
    onSuccess: (outcome) => {
      const bits = [
        outcome.closedDeals ? `${outcome.closedDeals} deal(s) closed` : null,
        outcome.stoppedBots ? `${outcome.stoppedBots} bot(s) stopped` : null,
      ].filter(Boolean);
      const { leftover, sweptRemainder: swept } = outcome as {
        leftover?: number;
        sweptRemainder?: number;
      };
      if (swept) bits.push(`${swept} swept`);
      if (leftover) {
        toast.warning(
          `Closed ${bits.join(', ') || 'the position'}, but ${leftover} is still open on the exchange — close it there.`
        );
      } else {
        toast.success(
          bits.length
            ? `Position flattened — ${bits.join(', ')}.`
            : 'Position flattened.'
        );
      }
      refetch();
    },
    onError: (e: Error) =>
      toast.error(e?.message || 'Failed to flatten the position'),
  });

  const handleFlattenPosition = async (
    target: FlattenTarget,
    stopReopeningBots: boolean
  ) => {
    await flattenMutation
      .mutateAsync({ target, stopReopeningBots })
      .catch(() => {
        // surfaced by onError; swallow so menu handlers stay sync-friendly
      });
  };

  return {
    importOrderMutation,
    importPositionMutation,
    cancelOrderMutation,
    closeDealMutation,
    handleImportOrder,
    handleImportPosition,
    handleCancelOrder,
    handleFlattenPosition,
    isClosingAsDeal: flattenMutation.isPending,
  };
};
