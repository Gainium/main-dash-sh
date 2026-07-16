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
  useBotFormActions,
  useBotFormTopLevelSelector,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider';
import {
  useBotFormDataQuery,
  type UseBotFormDataQueryResult,
} from '@/hooks/bots/forms/useBotFormDataQuery';
import { type TradingPair } from '@/hooks/useTradingPairs';
import { useUserFee } from '@/hooks/useUserFee';
import type { Asset, CoinListItem, ExchangeInUser } from '@/types';
import { OKXSource } from '@/types/exchange.types';

import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import {
  getDefaultSeedPair,
  isCoinmExchange,
  isFuturesExchange,
} from '@/utils/exchangeUtils';

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
 * canonical key returned matches what `formPair` expects (the
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
  // Narrow reads: this provider only needs the top-level pair/exchange fields.
  // The old broad `useBotFormState()` re-rendered the provider (and rebuilt its
  // context value) on EVERY keystroke, which re-rendered every section that
  // consumes `useBotFormQuery`. These selectors bail unless the field changes.
  const formExchangeUUID = useBotFormTopLevelSelector('exchangeUUID');
  const formPair = useBotFormTopLevelSelector('pair');
  const formPairMetadata = useBotFormTopLevelSelector('pairMetadata');
  const { updateFormData } = useBotFormActions();

  const currentExchange = useMemo(() => {
    if (!formExchangeUUID || exchanges.length === 0) {
      logger.error(
        '[BotFormQueryProvider] No exchangeUUID in formData or exchanges list is empty — returning null for currentExchange',
        { exchangeUUID: formExchangeUUID, exchanges }
      );
      return null;
    }
    return exchanges.find((ex) => ex.uuid === formExchangeUUID) || null;
  }, [formExchangeUUID, exchanges]);

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

      const accountIsOkxEu = currentExchange?.okxSource === OKXSource.my;
      pairs.forEach((pair) => {
        // OKX Europe (okxSource=my) accounts trade a distinct USDC/EUR universe
        // tagged source='my'; every other account — including global OKX — uses
        // the source-less global list. Keep the two from leaking into each other.
        if (accountIsOkxEu !== (pair.source === OKXSource.my)) {
          return;
        }
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
          // Human-readable base-asset name for display alongside the ticker
          // (falls back to the ticker in the UI when unresolved).
          baseDisplayName: pair.baseAsset?.displayName,
          // Carry the venue so CoinIcon can normalize tokenized-stock tickers
          // (the base is upper-cased here, so the lower-case wrapper hint is
          // gone — exchange is the only signal left to strip RAAPL/AAPLX).
          exchange: pair.exchange,
          // Carry this pair's OWN class (already scoped to the current
          // exchange) so the picker's Stocks/Crypto filter is exchange-correct
          // and doesn't inherit a same-named symbol's class from another venue.
          assetCategory: pair.assetCategory,
          // Canonical flag → drives the picker's "Canonical only" toggle.
          isCanonical: pair.isCanonical,
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
    // remount. If we do, the leg's `formPair` survives but the
    // BotForm `setContext({ symbol })` lookup misses (pairMetadata is
    // briefly empty), and the example-orders chart preview appears blank
    // until the queries return. Only write when we either have data, or
    // on the initial mount path (see the null check below).
    const incomingHasEntries = Object.keys(metadataPayload).length > 0;
    // Only seed on the initial mount path (`formPairMetadata` never written,
    // i.e. still null/undefined). Using `!existingHasEntries` here instead
    // meant an already-written *empty* `{}` also passed the guard, so for a
    // bot with a missing/invalid exchange — where the payload stays empty —
    // this effect rewrote a fresh empty object every render, re-triggering
    // itself via the `formPairMetadata` dependency into a React #185 loop
    // (grid/edit crash). Comparing against null distinguishes "never written"
    // from "written but empty" and closes the loop.
    if (incomingHasEntries || formPairMetadata == null) {
      updateFormData('pairMetadata', metadataPayload);
    }
    setShouldCheckPairs(true);
  }, [pairMetadata, updateFormData, formPairMetadata]);

  // Before the aggregate pairs list loads, seed an exchange-appropriate default
  // pair so the chart never starts on the generic `BTCUSDT` when that pair is
  // invalid for the current exchange (e.g. Kraken futures → BTC/USD only). This
  // closes the blank-chart window that opens when `getAllPairs` is slow: the
  // filter/correction below can't run while `pairMetadata.byPair` is empty, so
  // without this the form would ask the chart for `BTC-USDT` on Kraken (which
  // the candle API rejects) until the query lands. Only touches an untouched
  // generic default in create mode; the correction below still refines it once
  // the real pair list arrives.
  const seededProviderRef = useRef<string | null>(null);
  useEffect(() => {
    const provider = currentExchange?.provider;
    if (!provider || mode !== 'create') return;
    // Once the real pair list is available the correction below is authoritative.
    if (Object.keys(pairMetadata.byPair).length > 0) return;
    const currentPairs = [formPair].flat().filter(Boolean);
    // Never override a real selection — only the untouched generic seed.
    if (currentPairs.length !== 1 || currentPairs[0] !== 'BTCUSDT') return;
    const seed = getDefaultSeedPair(provider);
    if (seed === 'BTCUSDT') return;
    if (seededProviderRef.current === provider) return;
    seededProviderRef.current = provider;
    updateFormData('pair', [seed]);
  }, [
    currentExchange?.provider,
    mode,
    pairMetadata.byPair,
    formPair,
    updateFormData,
  ]);

  useEffect(() => {
    if (shouldCheckPairs && Object.keys(pairMetadata.byPair).length > 0) {
      const validPairKeys = new Set<string>([
        ...Object.keys(pairMetadata.byPair),
        ...Object.values(pairMetadata.byPair).map((p) => p.pair),
      ]);
      const currentPairs = [formPair].flat().filter(Boolean);
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
      // depends on `formPair` — and, for pairs whose canonical key
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
  }, [shouldCheckPairs, formPair, pairMetadata, updateFormData]);

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
      Array.isArray(formPair) && formPair.length > 0
        ? formPair[0]
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
    formPair,
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
