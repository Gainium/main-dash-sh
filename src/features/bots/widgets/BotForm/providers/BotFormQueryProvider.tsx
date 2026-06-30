/* eslint-disable react-refresh/only-export-components */
import logger from '@/lib/loggerInstance';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { CoinFilterPairMetadata } from '@/components/widgets/shared/CoinSelect';
import {
  useBotFormState,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider';
import {
  useBotFormDataQuery,
  type UseBotFormDataQueryResult,
} from '@/hooks/bots/forms/useBotFormDataQuery';
import { type TradingPair } from '@/hooks/useTradingPairs';
import { useUserFee } from '@/hooks/useUserFee';
import type { Asset, CoinListItem, ExchangeInUser } from '@/types';

import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import { isCoinmExchange, isFuturesExchange } from '@/utils/exchangeUtils';

export interface BotFormQueryProviderProps {
  mode: BotFormMode;
  botId?: string | undefined;
  debug?: boolean;
  children: ReactNode;
}
export type BotFormQueryContextValue = UseBotFormDataQueryResult & {
  mode: BotFormMode;
  botId?: string | undefined;
  currentExchange: ExchangeInUser | null;
  balances?: Asset[] | null;
  pairItems: CoinListItem[];
  pairMetadata: CoinFilterPairMetadata;
};

export const BotFormQueryContext = createContext<
  BotFormQueryContextValue | undefined
>(undefined);

/**
 * Pick a sensible default pair from the exchange's pair metadata. The
 * canonical key returned matches what `formData.pair` expects (the
 * `byPair` map key — base+quote concatenated, e.g. `BTCUSDT`).
 *
 * Preference order: BTC/USDT > BTC/USDC > any BTC pair > ETH/USDT >
 * ETH/USDC > any ETH pair > any pair with a stablecoin quote > first
 * available. This handles the common case where a user-saved
 * `BTCUSDT` is invalid on the current exchange (e.g. Hyperliquid,
 * which only quotes against USDC).
 */
const STABLE_QUOTES = ['USDT', 'USDC', 'USD', 'BUSD', 'USDP'];

const pickDefaultPair = (
  byPair: Record<string, TradingPair>
): string | null => {
  const keys = Object.keys(byPair);
  if (keys.length === 0) return null;

  const findKey = (predicate: (entry: TradingPair, key: string) => boolean) =>
    keys.find((k) => predicate(byPair[k], k)) ?? null;

  const baseOf = (entry: TradingPair) =>
    entry.baseAsset?.name?.toUpperCase?.() ?? '';
  const quoteOf = (entry: TradingPair) =>
    entry.quoteAsset?.name?.toUpperCase?.() ?? '';

  return (
    findKey((e) => baseOf(e) === 'BTC' && quoteOf(e) === 'USDT') ??
    findKey((e) => baseOf(e) === 'BTC' && quoteOf(e) === 'USDC') ??
    findKey((e) => baseOf(e) === 'BTC') ??
    findKey((e) => baseOf(e) === 'ETH' && quoteOf(e) === 'USDT') ??
    findKey((e) => baseOf(e) === 'ETH' && quoteOf(e) === 'USDC') ??
    findKey((e) => baseOf(e) === 'ETH') ??
    findKey((e) => STABLE_QUOTES.includes(quoteOf(e))) ??
    keys[0]
  );
};

export const BotFormQueryProvider: React.FC<BotFormQueryProviderProps> = ({
  mode,
  botId,
  debug,
  children,
}) => {
  const queryResult = useBotFormDataQuery({
    mode,
    ...(botId ? { botId } : {}),
    ...(debug !== undefined ? { debug } : {}),
  });

  const { exchanges } = queryResult; // Added to inspect exchanges if needed
  const { formData, updateFormData } = useBotFormState();

  const currentExchange = useMemo(() => {
    if (!formData.exchangeUUID || exchanges.length === 0) {
      logger.error(
        '[BotFormQueryProvider] No exchangeUUID in formData or exchanges list is empty — returning null for currentExchange',
        { exchangeUUID: formData.exchangeUUID, exchanges }
      );
      return null;
    }
    return exchanges.find((ex) => ex.uuid === formData.exchangeUUID) || null;
  }, [formData.exchangeUUID, exchanges]);

  const { pairsByExchange } = useTradingPairsFromContext();

  const { items: pairItems, metadata: pairMetadata } = useMemo(() => {
    if (!pairsByExchange || !currentExchange) {
      logger.error(
        '[BotFormQueryProvider] No pairsByExchange or currentExchange available — returning empty pair items',
        {
          pairsByExchange,
          currentExchange,
        }
      );
      return {
        items: [] as CoinListItem[],
        metadata: {
          bySelectionSymbol: {} as Record<string, TradingPair>,
          byPair: {} as Record<string, TradingPair>,
        },
      };
    }

    const items: Map<string, CoinListItem> = new Map();
    const bySelectionSymbol: Record<string, TradingPair> = {};
    const byPair: Record<string, TradingPair> = {};

    Object.entries(pairsByExchange).forEach(([exchangeName, pairs]) => {
      if (
        exchangeName.toUpperCase() !== currentExchange?.provider.toUpperCase()
      ) {
        return;
      }

      pairs.forEach((pair) => {
        const base = pair.baseAsset?.name?.toUpperCase?.() ?? '';
        const quote = pair.quoteAsset?.name?.toUpperCase?.() ?? '';

        if (!base || !quote) {
          return;
        }

        const selectionSymbol = `${base}-${quote}`;

        // Avoid duplicates when multiple exchanges share the same pair
        if (items.has(selectionSymbol)) {
          return;
        }

        // No exchange subtitle: the selector is already scoped to the
        // current exchange, so repeating the venue on every row is noise.
        // The market-cap rank / curated ROI now occupy that secondary line.
        items.set(selectionSymbol, {
          symbol: selectionSymbol,
          name: `${base}/${quote}`,
          baseAsset: base,
          quoteAsset: quote,
          // Carry the venue so CoinIcon can normalize tokenized-stock tickers
          // (the base is upper-cased here, so the lower-case wrapper hint is
          // gone — exchange is the only signal left to strip RAAPL/AAPLX).
          exchange: pair.exchange,
          color: 'var(--color-primary)',
        });

        const normalizedPairKey = `${base}${quote}`;
        bySelectionSymbol[selectionSymbol] = pair;
        if (!(normalizedPairKey in byPair)) {
          byPair[normalizedPairKey] = pair;
        }
      });
    });

    // Sort alphabetically for easier navigation
    const sortedItems = [...items.values()].sort((a, b) =>
      a.symbol.localeCompare(b.symbol)
    );

    const result = {
      items: sortedItems,
      metadata: {
        bySelectionSymbol,
        byPair,
      },
    };
    logger.debug(
      '[BotFormQueryProvider] Computed pair items and metadata',
      result
    );
    return result;
  }, [pairsByExchange, currentExchange]);

  const [shouldCheckPairs, setShouldCheckPairs] = useState(false);

  useEffect(() => {
    const metadataPayload = pairMetadata.byPair;
    // Don't clobber an already-populated pairMetadata with an empty
    // payload while the exchange / pairs queries are still loading on
    // remount. If we do, the leg's `formData.pair` survives but the
    // BotForm `setContext({ symbol })` lookup misses (pairMetadata is
    // briefly empty), and the example-orders chart preview appears blank
    // until the queries return. Only write when we either have data, or
    // the existing metadata is also empty (initial mount path).
    const incomingHasEntries = Object.keys(metadataPayload).length > 0;
    const existingHasEntries =
      Object.keys(formData.pairMetadata ?? {}).length > 0;
    if (incomingHasEntries || !existingHasEntries) {
      updateFormData('pairMetadata', metadataPayload);
    }
    setShouldCheckPairs(true);
  }, [pairMetadata, updateFormData, formData.pairMetadata]);

  useEffect(() => {
    if (shouldCheckPairs && Object.keys(pairMetadata.byPair).length > 0) {
      const validPairKeys = new Set<string>([
        ...Object.keys(pairMetadata.byPair),
        ...Object.values(pairMetadata.byPair).map((p) => p.pair),
      ]);
      const currentPairs = [formData.pair].flat().filter(Boolean);
      const filteredPairs = currentPairs.filter((p) => validPairKeys.has(p));

      // When filtering empties the list, pick a sensible default so the
      // form never lands in a no-pair state (which leaves the user
      // staring at a useless form when their saved pair doesn't exist
      // on the current exchange — e.g. BTCUSDT default on Hyperliquid,
      // which only has BTCUSDC).
      let nextPairs = filteredPairs;
      if (
        nextPairs.length === 0 &&
        Object.keys(pairMetadata.byPair).length > 0
      ) {
        nextPairs = [pickDefaultPair(pairMetadata.byPair)].filter(
          (p): p is string => Boolean(p)
        );
      }

      // Only write when the result actually differs from current. Without
      // this guard the write produces a NEW array reference even when
      // the contents are identical, which retriggers every effect that
      // depends on `formData.pair` — and, for pairs whose canonical key
      // doesn't appear in `validPairKeys` (e.g. HIP-3 selection symbols
      // like `FLX:GOLD-USDH` while byPair is keyed by `FLX:GOLDUSDH`),
      // we'd be re-emitting an already-empty filter on every render.
      const sameContents =
        nextPairs.length === currentPairs.length &&
        nextPairs.every((p, i) => p === currentPairs[i]);
      if (!sameContents) {
        updateFormData('pair', nextPairs);
      }
      setShouldCheckPairs(false);
    }
  }, [shouldCheckPairs, formData.pair, pairMetadata, updateFormData]);

  const futuresSetRef = useRef<boolean | null>(null);
  const coinmSetRef = useRef<boolean | null>(null);
  const exchangeProviderRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      currentExchange?.provider &&
      exchangeProviderRef.current !== currentExchange?.provider
    ) {
      const futures = isFuturesExchange(currentExchange.provider);
      const coinm = isCoinmExchange(currentExchange.provider);
      if (futuresSetRef.current !== futures) {
        futuresSetRef.current = futures;
        updateFormData('futures', futures);
        updateFormData('profitCurrency', 'quote');
      }
      if (coinmSetRef.current !== coinm) {
        coinmSetRef.current = coinm;
        updateFormData('coinm', coinm);
        updateFormData('profitCurrency', 'base');
      }
    }
  }, [currentExchange?.provider, updateFormData]);

  const contextValue = useMemo<BotFormQueryContextValue>(
    () => ({
      ...queryResult,
      mode,
      botId,
      currentExchange,
      pairItems,
      pairMetadata,
    }),
    [queryResult, mode, botId, currentExchange, pairItems, pairMetadata]
  );

  // Use the extracted useUserFee hook
  const { fetchUserFee, userFee: fetchedUserFee } = useUserFee({
    showToasts: true,
  });

  const userFeeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      mode === 'deal-edit' ||
      mode === 'deal-mass-edit' ||
      mode === 'settings-readonly'
    ) {
      return;
    }
    const exchangeUUID =
      typeof currentExchange?.uuid === 'string'
        ? currentExchange?.uuid.trim()
        : '';
    const pair =
      Array.isArray(formData.pair) && formData.pair.length > 0
        ? formData.pair[0]
        : '';
    // Normalize the pair to match pairMetadata keys (e.g., "BTC-USDT" -> "BTCUSDT")
    const normalizedPair = pair.replace(/-/g, '').toUpperCase();
    // Use the locally computed pairMetadata instead of waiting for formData sync
    const find = pairMetadata.byPair?.[normalizedPair];
    const primaryPairRaw =
      find && find.exchange === currentExchange?.provider ? find.pair : '';

    const symbol = primaryPairRaw;
    const key = exchangeUUID && symbol ? `${exchangeUUID}::${symbol}` : null;

    if (!exchangeUUID || !symbol) {
      userFeeKeyRef.current = null;
      updateFormData('userFee', null);
      return;
    }

    // Skip if we already fetched for this key
    if (userFeeKeyRef.current === key) {
      return;
    }

    userFeeKeyRef.current = key;

    fetchUserFee(exchangeUUID, symbol).then((result) => {
      if (result) {
        updateFormData('userFee', {
          ...result,
          makerCommission: result.maker,
          takerCommission: result.taker,
        });
      } else {
        updateFormData('userFee', null);
      }
    });
  }, [
    formData.pair,
    pairMetadata,
    currentExchange?.uuid,
    currentExchange?.provider,
    fetchUserFee,
    updateFormData,
    mode,
  ]);

  // Sync fetched fee back to form if it changes
  useEffect(() => {
    if (fetchedUserFee) {
      updateFormData('userFee', {
        ...fetchedUserFee,
        makerCommission: fetchedUserFee.maker,
        takerCommission: fetchedUserFee.taker,
      });
    }
  }, [fetchedUserFee, updateFormData]);

  return (
    <BotFormQueryContext.Provider value={contextValue}>
      {children}
    </BotFormQueryContext.Provider>
  );
};

export const useBotFormQuery = (): BotFormQueryContextValue => {
  const context = useContext(BotFormQueryContext);

  if (!context) {
    // During Fast Refresh the provider may briefly be undefined which causes
    // the hook to throw and crash the UI. Provide a safe DEV-only fallback
    // (with a warning) to avoid transient crashes while preserving the
    // original thrown error in production.
    if (import.meta.env.DEV) {
      logger.warn(
        '[BotFormQueryProvider] useBotFormQuery used outside provider during HMR — returning safe defaults to avoid transient crash'
      );

      const fallback = {
        dcaBots: [],
        gridBots: [],
        comboBots: [],
        hedgeDcaBots: [],
        hedgeComboBots: [],
        bots: [],
        botsLoading: false,
        bot: null,
        botSettings: null,
        botSettingsLoading: false,
        exchanges: [],
        exchangesLoading: false,
        refetchExchanges: async () => void 0,
        mode: 'edit' as BotFormMode,
        botId: undefined,
        currentExchange: null,
        balances: null,
        pairItems: [],
        pairMetadata: { bySelectionSymbol: {}, byPair: {} },
      } as BotFormQueryContextValue;

      return fallback;
    }

    throw new Error(
      'useBotFormQuery must be used within a BotFormQueryProvider'
    );
  }

  return context;
};
