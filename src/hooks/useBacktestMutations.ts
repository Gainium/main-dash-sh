import { useMutation, useQueryClient } from '@tanstack/react-query';
import { botQueries } from '../lib/api/GraphQLQueries-bot-queries';
// import { useGraphQL } from './useGraphQL';
import { logger } from '../lib/loggerInstance';
import {
  BotTypesEnum,
  ExchangeIntervals,
  type BacktestingSettings,
  type DCABacktestingResultShort,
  type DCABotSettings,
  type ExchangeInUser,
  type ServerSideBacktestPayload,
  type Settings,
  type Symbols,
} from '@/types';
import type { BotFormData } from '@/types/bots';
import { toExchangeCandleSymbol } from '@/utils/exchangeUtils';

export type BacktestInput = DCABacktestingResultShort & {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  userId: string;
  time: number;
  savePermanent: boolean;
  config: BacktestingSettings;
};

export type SSBinput = {
  payload: ServerSideBacktestPayload;
  symbols: { pair: string; quoteAsset: string; baseAsset: string }[];
};

export interface BacktestResult {
  status: string;
  reason?: string;
  data?: unknown;
}

export function useRunBacktest() {
  const queryClient = useQueryClient();

  return useMutation<BacktestResult, Error, SSBinput>({
    mutationFn: async (input: SSBinput) => {
      logger.info('[useRunBacktest] Starting backtest execution:', {
        symbol: input.symbols[0],
        dateRange: `${input.payload.config.firstDataTime} to ${input.payload.config.lastDataTime}`,
        timeframe: input.payload.data.interval,
      });

      const payload = input;
      const { query, variables } =
        botQueries.requestServerSideBacktest(payload);

      // Use a direct GraphQL client call instead of useGraphQL hook
      const { GraphQLClient } = await import('../lib/api');
      const { useAuthStore } = await import('../stores/authStore');
      const { useUIStore } = await import('../stores/uiStore');

      const { tokens } = useAuthStore.getState();
      const { isLiveTrading } = useUIStore.getState();

      if (!tokens?.accessToken) {
        throw new Error('Authentication required to run backtest');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;

      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const result = await client.request<BacktestResult>(query, variables);

      logger.info('[useRunBacktest] Backtest execution completed:', {
        status: result.status,
        hasData: !!result.data,
      });

      if (result.status !== 'OK') {
        throw new Error(result.reason || 'Failed to run backtest');
      }

      return result;
    },
    onSuccess: (data) => {
      logger.info('[useRunBacktest] Backtest mutation successful:', {
        status: data.status,
      });

      // Invalidate backtest queries to refresh the data
      queryClient.invalidateQueries({
        queryKey: ['getBotBacktestSummary'],
      });
      queryClient.invalidateQueries({
        queryKey: ['getBacktests'],
      });
    },
    onError: (error) => {
      logger.error('[useRunBacktest] Backtest mutation failed:', {
        error: error.message,
      });
    },
  });
}

// Helper function to prepare backtest input from bot and config
export function prepareBacktestInput(
  formData: BotFormData,
  currentExchange: ExchangeInUser | null,
  backtestConfig: BacktestingSettings,
  interval: ExchangeIntervals
): SSBinput {
  if (!currentExchange) {
    throw new Error('Current exchange is not defined');
  }
  const fullSymbols: Symbols[] = [];
  // The server-side backtest resolves the pair against the `pairs` collection
  // (case-sensitive `$in` on the exchange's native symbol), so the pair it
  // receives has to be the exchange-native string. `pairMetadata[key].pair` IS
  // that string — the connector's own form, including case the compact form
  // key destroys (Kraken `AAPLx-USD` → key `AAPLXUSD`) and shapes no heuristic
  // can rebuild (OKX-EU `BTC-USD_UM_XPERP`). Prefer it; fall back to the
  // chart chokepoint's converter only when the metadata is missing. Same
  // pattern as the bot create/update mappers.
  const toNativePair = (pair: string): string =>
    formData.pairMetadata[pair]?.pair ??
    toExchangeCandleSymbol(currentExchange.provider, pair);
  const symbols = [formData.pair]
    .flat()
    .map((s) => {
      if (s in formData.pairMetadata) {
        fullSymbols.push({
          ...formData.pairMetadata[s],
          maxOrders: 200,
          exchange: currentExchange.provider,
        });
        return {
          pair: toNativePair(s),
          baseAsset: formData.pairMetadata[s].baseAsset.name,
          quoteAsset: formData.pairMetadata[s].quoteAsset.name,
        };
      }
      return null;
    })
    .filter(Boolean) as SSBinput['symbols'];

  // Transport fields shared by every bot type. Only `type`, `settings`,
  // and the `combo` flag vary per bot type — mirroring legacy, which sets
  // `type` from the bot type and sends the bot's own settings (useDCAPage
  // `type: combo ? combo : dca` with the combo flag; gridbot `type: grid`).
  // Hardcoding dca/combo:false/formData.dca ran combo and grid bots as a
  // plain DCA bot with the empty DCA slice → trivial/garbage results.
  const commonData = {
    exchange: currentExchange.provider,
    exchangeUUID: currentExchange.uuid,
    interval,
    balances: [],
    from: backtestConfig.firstDataTime,
    to: backtestConfig.lastDataTime,
    slippage: +backtestConfig.slippage,
    userFee: +backtestConfig.userFee,
  };
  const pairList = [formData.pair].flat();

  let payload: ServerSideBacktestPayload;
  if (formData.type === BotTypesEnum.grid) {
    payload = {
      type: BotTypesEnum.grid,
      data: {
        ...commonData,
        settings: {
          ...formData.grid,
          pair: pairList[0] ? toNativePair(pairList[0]) : '',
          name: formData.name,
          // Legacy forces this true at backtest time; the form mapper
          // defaults it to false for edited/cloned bots (the stored
          // payload strips it), which fee-reduces the budget and diverges
          // from legacy. Matches the grid local-backtest path.
          updatedBudget: true,
        } as unknown as Settings,
      },
      config: backtestConfig,
    };
  } else {
    const isCombo = formData.type === BotTypesEnum.combo;
    payload = {
      type: isCombo ? BotTypesEnum.combo : BotTypesEnum.dca,
      data: {
        ...commonData,
        settings: {
          ...(isCombo ? formData.combo : formData.dca),
          pair: pairList.map(toNativePair),
          name: formData.name,
        } as unknown as DCABotSettings,
        combo: isCombo,
      },
      config: backtestConfig,
    };
  }

  return { symbols, payload };
}
