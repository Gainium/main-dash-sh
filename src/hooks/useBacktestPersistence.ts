import { dispatchBacktestDbEvent } from '@/constants/backtest';
// useCallback is imported above via unified imports
import { GraphQLClient } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { logger } from '@/lib/loggerInstance';
import type { CreateDCABotPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  BotTypesEnum,
  type BacktestingSettings,
  type DCABacktestingResult,
  type DCABacktestingResultShort,
  type DCABotSettings,
  type ExchangeInUser,
  type GridBacktestingResult,
  type GRIDBacktestingResultShort,
  type Settings,
  type StoreBacktest,
  type StoreHedgeBacktest,
  type Symbols,
} from '@/types';
import {
  saveHedge as saveBacktestHedgeInDB,
  save as saveBacktestInDB,
} from '@/utils/backtest/db';
import { useCallback } from 'react';

type SaveBacktestResponse = {
  saveBacktest: {
    status: string;
    reason?: string;
    data?: string;
  };
};

type SaveGridBacktestResponse = {
  saveGridBacktest: {
    status: string;
    reason?: string;
    data?: string;
  };
};

type PersistBacktestParams = {
  result: DCABacktestingResult;
  config: BacktestingSettings;
  /** Settings payload used for server save (legacy saveBacktest expects bot settings payload shape). */
  settings: CreateDCABotPayload;
  /** Settings used for local history rendering (Stats tab expects DCABotSettings shape). */
  historySettings?: DCABotSettings;
  symbol: Symbols;
  exchange: ExchangeInUser;
  botType: BotTypesEnum;
  periodName?: string;
};

type PersistGridBacktestParams = {
  result: GridBacktestingResult;
  config: BacktestingSettings;
  settings: Settings;
  symbol: Symbols;
  exchange: ExchangeInUser;
  periodName?: string;
};

type BuildPayloadParams = PersistBacktestParams & { userId: string };

type SaveBacktestInput = DCABacktestingResultShort & {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  userId: string;
  time: number;
  savePermanent: boolean;
  config: BacktestingSettings;
  exchange: ExchangeInUser['provider'];
  exchangeUUID: string;
  settings: CreateDCABotPayload;
};

/* const ensureNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const sanitizeIndicators = (indicators?: unknown[]): unknown[] => {
  if (!Array.isArray(indicators)) {
    return [];
  }
  return indicators.map((indicator) => {
    if (!indicator || typeof indicator !== 'object') {
      return indicator;
    }
    const sanitized = { ...(indicator as Record<string, unknown>) };
    Object.entries(sanitized).forEach(([key, value]) => {
      if (value === null) {
        delete sanitized[key];
      }
    });
    return sanitized;
  });
}; */

/* const sanitizeSettings = (
  settings: CreateDCABotPayload,
  fallbackPair: string
): CreateDCABotPayload => {
  const clone: Record<string, unknown> = { ...settings };

  const pairList = Array.isArray(settings.pair) ? settings.pair : [];
  clone['pair'] = pairList.length > 0 ? pairList : [fallbackPair];
  clone['indicators'] = sanitizeIndicators(settings.indicators as unknown[]);
  clone['indicatorGroups'] = settings.indicatorGroups ?? [];
  clone['multiTp'] = settings.multiTp ?? [];
  clone['multiSl'] = settings.multiSl ?? [];

  // Set defaults for TP/SL if missing, matching legacy behavior
  if (!clone['tpPerc']) {
    clone['tpPerc'] = '10';
  }
  if (!clone['slPerc']) {
    clone['slPerc'] = '-10';
  }

  const numericFields: Array<keyof CreateDCABotPayload> = [
    'ordersCount',
    'activeOrdersCount',
    'cooldownAfterDealStartInterval',
    'cooldownAfterDealStopInterval',
    'moveSLValue',
    'closeByTimerValue',
    'leverage',
  ];

  for (const field of numericFields) {
    if (field in clone) {
      const key = field as string;
      const numeric = ensureNumber(clone[key]);
      if (numeric === undefined) {
        delete clone[key];
      } else {
        clone[key] = numeric;
      }
    }
  }

  Object.entries(clone).forEach(([key, value]) => {
    // Remove null values or string 'null'
    if (value === null || value === 'null') {
      delete clone[key];
    }
  });

  return clone as CreateDCABotPayload;
}; */

const sanitizeResult = (
  result: DCABacktestingResult,
  periodName?: string
): DCABacktestingResultShort => {
  // Use shallow copy instead of JSON serialization to preserve types/undefined
  const copy = { ...result } as unknown as DCABacktestingResultShort;
  delete (copy as Partial<DCABacktestingResult>).deals;
  delete (copy as Partial<DCABacktestingResult>).profits;
  delete (copy as Partial<DCABacktestingResult>).indicatorsEvents;
  delete (copy as Partial<DCABacktestingResult>).buyAndHoldEquity;
  delete (copy as Partial<DCABacktestingResult>).portfolio;

  if (copy.duration && periodName) {
    copy.duration = {
      ...copy.duration,
      periodName,
    };
  }

  return copy;
};

const sanitizeConfig = (config: BacktestingSettings): BacktestingSettings => {
  const clone = { ...config };
  delete (clone as Partial<BacktestingSettings>).locked;
  delete (clone as Partial<BacktestingSettings>).forceCustom;
  return clone;
};

const buildBacktestSaveInput = (
  params: BuildPayloadParams
): SaveBacktestInput => {
  const { result, config, settings, symbol, exchange, userId, periodName } =
    params;
  const sanitizedResult = sanitizeResult(result, periodName);
  const sanitizedSettings =
    settings; /* || sanitizeSettings(settings, symbol.pair) */
  const sanitizedConfig = sanitizeConfig(config);

  // Build the final payload, explicitly setting duration with periodName (matching legacy behavior)
  return {
    ...sanitizedResult,
    symbol: symbol.pair,
    baseAsset: symbol.baseAsset.name,
    quoteAsset: symbol.quoteAsset.name,
    userId: userId.toString(), // Ensure string (legacy uses .toString())
    time: Date.now(),
    exchange: exchange.provider,
    exchangeUUID: exchange.uuid,
    settings: sanitizedSettings,
    savePermanent: false,
    config: sanitizedConfig,
    // Explicitly override duration to match legacy pattern: { ..._data.duration, periodName }
    duration: {
      ...sanitizedResult.duration,
      ...(periodName ? { periodName } : {}),
    },
  };
};

const computeSerializedSize = (payload: string): number => {
  if (typeof Blob !== 'undefined') {
    return new Blob([payload]).size;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(payload).length;
  }
  return payload.length;
};

export const useBacktestPersistence = () => {
  const tokens = useAuthStore((state) => state.tokens);
  const user = useAuthStore((state) => state.user);
  const isLiveTrading = useUIStore((state) => state.isLiveTrading);

  const persistBacktestResult = useCallback(
    async (params: PersistBacktestParams) => {
      // Allow local saves even when not authenticated. Remote GraphQL save
      // should only be attempted when we have valid auth tokens and user id.
      if (!params.symbol) {
        throw new Error('Missing symbol metadata for backtest result.');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const canSaveRemote = !!tokens?.accessToken && !!user?.id;
      const client = canSaveRemote
        ? new GraphQLClient(endpoint, tokens.accessToken, !isLiveTrading)
        : null;

      const payload = buildBacktestSaveInput({
        ...params,
        userId: user?.id ?? 'local',
      });

      // Debug: log the full payload structure
      logger.infoCategory(
        'backtester',
        '[useBacktestPersistence] Full payload for saveBacktest',
        {
          payload: JSON.stringify(payload, null, 2).substring(0, 5000),
        }
      );

      // Attempt remote save only if we can. If the remote save fails,
      // log the error but continue to save locally (resilient behavior).
      let mutationResult: SaveBacktestResponse['saveBacktest'] | null = null;
      if (canSaveRemote && client) {
        try {
          const { query, variables } = botQueries.saveBacktest(payload);
          const response = await client.request<SaveBacktestResponse>(
            query,
            variables
          );
          mutationResult = response?.saveBacktest ?? null;
          if (!mutationResult || mutationResult.status !== 'OK') {
            logger.errorCategory(
              'backtester',
              '[useBacktestPersistence] Remote save failed',
              {
                reason: mutationResult?.reason,
              }
            );
            mutationResult = null;
          }
        } catch (e) {
          logger.errorCategory(
            'backtester',
            '[useBacktestPersistence] Remote save error',
            {
              error: e instanceof Error ? e.message : String(e),
            }
          );
          mutationResult = null;
        }
      }

      const entryType =
        params.botType === BotTypesEnum.combo
          ? 'Combo'
          : params.botType === BotTypesEnum.grid
            ? 'Grid'
            : params.botType === BotTypesEnum.hedgeCombo
              ? 'HedgeCombo'
              : params.botType === BotTypesEnum.hedgeDca
                ? 'HedgeDca'
                : 'DCA';
      const computedId =
        (mutationResult && mutationResult.data) ||
        payload._id ||
        `${payload.symbol}-${payload.time}`;

      // Store a full history-like payload locally so UI lists/details can render
      // even when the user is offline or not authenticated.
      const serialized = JSON.stringify({
        ...params.result,
        // `params.result` is the raw engine output — its `duration` has no
        // `periodName`. The local copy shadows the remote row in the list
        // merge (same `_id` wins), so without this the saved-period name
        // would render as N/A even though the server stored it correctly.
        duration: payload.duration,
        config: params.config,
        _id: computedId,
        time: payload.time,
        exchange: params.exchange.provider,
        exchangeUUID: params.exchange.uuid,
        symbol: payload.symbol,
        baseAsset: params.symbol.baseAsset.name,
        quoteAsset: params.symbol.quoteAsset.name,
        // Store the settings used for the backtest. This matches what the backend
        // returns for saved history items.
        settings: params.historySettings ?? payload.settings,
        savePermanent: false,
        serverSide: false,
        userId: payload.userId,
        note: (payload as unknown as { note?: string }).note,
      });

      const commonMeta = {
        data: serialized,
        size: computeSerializedSize(serialized),
        id: computedId,
        exchange: params.exchange.provider,
        baseAsset: params.symbol.baseAsset.name,
        quoteAsset: params.symbol.quoteAsset.name,
        symbol: payload.symbol,
        type: entryType,
      };

      let saved = false;
      // For hedged bots, save into the hedge DB format
      if (
        params.botType === BotTypesEnum.hedgeCombo ||
        params.botType === BotTypesEnum.hedgeDca
      ) {
        const hedgeEntry = {
          ...commonMeta,
          long: {
            exchange: params.exchange.provider,
            baseAsset: params.symbol.baseAsset.name,
            quoteAsset: params.symbol.quoteAsset.name,
            symbol: payload.symbol,
          },
          short: {
            exchange: params.exchange.provider,
            baseAsset: params.symbol.baseAsset.name,
            quoteAsset: params.symbol.quoteAsset.name,
            symbol: payload.symbol,
          },
        } as StoreHedgeBacktest;

        saved = await saveBacktestHedgeInDB(hedgeEntry as StoreHedgeBacktest);
      } else {
        const entry: StoreBacktest = {
          ...commonMeta,
          exchange: params.exchange.provider,
          baseAsset: params.symbol.baseAsset.name,
          quoteAsset: params.symbol.quoteAsset.name,
          symbol: payload.symbol,
        };
        saved = await saveBacktestInDB(entry);
      }
      if (!saved) {
        logger.errorCategory(
          'backtester',
          '[useBacktestPersistence] Local save failed',
          {
            id: computedId,
          }
        );
      }
      dispatchBacktestDbEvent();
      return computedId;
    },
    [isLiveTrading, tokens?.accessToken, user?.id]
  );

  const persistGridBacktestResult = useCallback(
    async (params: PersistGridBacktestParams) => {
      if (!params.symbol) {
        throw new Error('Missing symbol metadata for grid backtest result.');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const canSaveRemote = !!tokens?.accessToken && !!user?.id;
      const client = canSaveRemote
        ? new GraphQLClient(endpoint, tokens.accessToken, !isLiveTrading)
        : null;

      const {
        result,
        config,
        settings: _settings,
        symbol,
        exchange,
        periodName,
      } = params;
      const { updatedBudget: _, ...settings } = _settings;

      // Sanitize result: remove heavy data for server save
      const sanitizedResult = {
        ...result,
      } as unknown as GRIDBacktestingResultShort;
      delete (sanitizedResult as Partial<GridBacktestingResult>).orders;
      delete (sanitizedResult as Partial<GridBacktestingResult>).transaction;
      delete (sanitizedResult as Partial<GridBacktestingResult>).filledOrders;
      delete (sanitizedResult as Partial<GridBacktestingResult>).ordersHistory;
      delete (sanitizedResult as Partial<GridBacktestingResult>)
        .buyAndHoldEquity;
      delete (sanitizedResult as Partial<GridBacktestingResult>).values;
      if (sanitizedResult.duration && periodName) {
        sanitizedResult.duration = {
          ...sanitizedResult.duration,
          periodName,
        };
      }

      const sanitizedConfig = sanitizeConfig(config);
      const userId = user?.id ?? 'local';

      const payload = {
        ...sanitizedResult,
        symbol: symbol.pair,
        baseAsset: symbol.baseAsset.name,
        quoteAsset: symbol.quoteAsset.name,
        userId: userId.toString(),
        time: Date.now(),
        settings: {
          ...settings,
          topPrice: settings.topPrice ? Number(settings.topPrice) : undefined,
          lowPrice: settings.lowPrice ? Number(settings.lowPrice) : undefined,
          budget: settings.budget ? Number(settings.budget) : undefined,
          exchange: exchange.provider,
          exchangeUUID: exchange.uuid,
        },
        savePermanent: false,
        config: sanitizedConfig,
        duration: {
          ...sanitizedResult.duration,
          ...(periodName ? { periodName } : {}),
        },
      };

      logger.infoCategory(
        'backtester',
        '[useBacktestPersistence] Full payload for saveGridBacktest',
        {
          payload: JSON.stringify(payload, null, 2).substring(0, 5000),
        }
      );

      let mutationResult: SaveGridBacktestResponse['saveGridBacktest'] | null =
        null;
      if (canSaveRemote && client) {
        try {
          const { query, variables } = botQueries.saveGridBacktest(
            payload as unknown as Parameters<
              typeof botQueries.saveGridBacktest
            >[0]
          );
          const response = await client.request<SaveGridBacktestResponse>(
            query,
            variables
          );
          mutationResult = response?.saveGridBacktest ?? null;
          if (!mutationResult || mutationResult.status !== 'OK') {
            logger.errorCategory(
              'backtester',
              '[useBacktestPersistence] Remote grid save failed',
              {
                reason: mutationResult?.reason,
              }
            );
            mutationResult = null;
          }
        } catch (e) {
          logger.errorCategory(
            'backtester',
            '[useBacktestPersistence] Remote grid save error',
            {
              error: e instanceof Error ? e.message : String(e),
            }
          );
          mutationResult = null;
        }
      }

      const computedId =
        (mutationResult && mutationResult.data) ||
        (payload as unknown as { _id?: string })._id ||
        `${payload.symbol}-${payload.time}`;

      const serialized = JSON.stringify({
        ...result,
        // See the DCA path: the local copy wins the list merge, so it has to
        // carry the period name too or the column falls back to N/A.
        duration: payload.duration,
        config,
        _id: computedId,
        time: payload.time,
        exchange: exchange.provider,
        exchangeUUID: exchange.uuid,
        symbol: payload.symbol,
        baseAsset: symbol.baseAsset.name,
        quoteAsset: symbol.quoteAsset.name,
        settings,
        savePermanent: false,
        serverSide: false,
        userId,
      });

      const entry: StoreBacktest = {
        data: serialized,
        size: computeSerializedSize(serialized),
        id: computedId,
        exchange: exchange.provider,
        baseAsset: symbol.baseAsset.name,
        quoteAsset: symbol.quoteAsset.name,
        symbol: payload.symbol,
        type: 'Grid',
      };

      const saved = await saveBacktestInDB(entry);
      if (!saved) {
        logger.errorCategory(
          'backtester',
          '[useBacktestPersistence] Local grid save failed',
          {
            id: computedId,
          }
        );
      }
      dispatchBacktestDbEvent();
      return computedId;
    },
    [isLiveTrading, tokens?.accessToken, user?.id]
  );

  return { persistBacktestResult, persistGridBacktestResult };
};
