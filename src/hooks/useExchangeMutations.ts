import { ACTIVATION_EVENTS, trackActivation } from '@/lib/analytics/events';
import { logger } from '@/lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { getExchangeTradeType, TradeTypeEnum } from '@/utils/exchangeUtils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ExchangeFormData } from '../components/exchanges/types';
import { createExchangeService } from '../services/exchangeService';
import {
  CoinbaseKeysType,
  ExchangeEnum,
  OKXSource,
} from '../types/exchange.types';
import { useExchangesStore } from '@/stores/exchangesStore';

// Add exchange mutation input
export interface AddExchangeInput {
  provider: ExchangeEnum;
  key: string;
  secret: string;
  name: string;
  passphrase?: string | undefined;
  stablecoinBalance?: number | undefined;
  coinToTopUp?: string | undefined;
  topUps?:
    | { provider: ExchangeEnum; asset: string; amount: number }[]
    | undefined;
  tradeType?: string | undefined;
  keysType?: CoinbaseKeysType | undefined;
  okxSource?: OKXSource | undefined;
  bybitHost?: string | undefined;
  shouldCheckAffiliate?: boolean | undefined;
  subaccount?: boolean | undefined;
}

// Update exchange mutation input
export interface UpdateExchangeInput {
  uuid: string;
  key?: string | undefined;
  secret?: string | undefined;
  name?: string | undefined;
  passphrase?: string | undefined;
  stablecoinBalance?: number | undefined;
  coinToTopUp?: string | undefined;
  keysType?: CoinbaseKeysType | undefined;
  okxSource?: OKXSource | undefined;
  bybitHost?: string | undefined;
}

// Delete exchange mutation input
export interface DeleteExchangeInput {
  uuid: string;
}

// Set hedge mode input
export interface SetHedgeModeInput {
  uuid: string;
  hedge: boolean;
}

// Set zero fee input
export interface SetZeroFeeInput {
  uuid: string;
  value: boolean;
}

// Update balance input
export interface UpdateBalanceInput {
  skipSnapshot?: boolean | undefined;
  // Refresh only this exchange's balances from the venue (snapshot totals
  // still recompute server-side). Requires app >= 2.71.14 / app-sh core 1.37.6.
  uuid?: string | undefined;
}

// Create exchange service factory
const createExchangeServiceInstance = (
  tokens?: { accessToken?: string } | null,
  isLiveTrading?: boolean
) => {
  const endpoint =
    import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
  const paperContext = !isLiveTrading; // Paper context is true when NOT in live trading mode

  return createExchangeService(endpoint, tokens?.accessToken, paperContext);
};

/**
 * Maps UI provider enums to backend provider enums.
 * When "All" or "Spot" variants are selected, the backend creates multiple exchange instances.
 * For example, bybitAll -> bybit (backend creates spot, linear, and inverse exchanges)
 */
export const mapProviderToBackend = (provider: ExchangeEnum): ExchangeEnum => {
  // Binance mappings
  if ([ExchangeEnum.binanceAll, ExchangeEnum.binanceSpot].includes(provider)) {
    return ExchangeEnum.binance;
  }
  if (
    [ExchangeEnum.paperBinanceAll, ExchangeEnum.paperBinanceSpot].includes(
      provider
    )
  ) {
    return ExchangeEnum.paperBinance;
  }

  // Bybit mappings
  if ([ExchangeEnum.bybitAll, ExchangeEnum.bybitSpot].includes(provider)) {
    return ExchangeEnum.bybit;
  }
  if (
    [ExchangeEnum.paperBybitAll, ExchangeEnum.paperBybitSpot].includes(provider)
  ) {
    return ExchangeEnum.paperBybit;
  }

  // OKX mappings
  if ([ExchangeEnum.okxAll, ExchangeEnum.okxSpot].includes(provider)) {
    return ExchangeEnum.okx;
  }
  if (
    [ExchangeEnum.paperOkxAll, ExchangeEnum.paperOkxSpot].includes(provider)
  ) {
    return ExchangeEnum.paperOkx;
  }

  // KuCoin mappings
  if ([ExchangeEnum.kucoinAll, ExchangeEnum.kucoinSpot].includes(provider)) {
    return ExchangeEnum.kucoin;
  }
  if (
    [ExchangeEnum.paperKucoinAll, ExchangeEnum.paperKucoinSpot].includes(
      provider
    )
  ) {
    return ExchangeEnum.paperKucoin;
  }

  // Bitget mappings
  if ([ExchangeEnum.bitgetAll, ExchangeEnum.bitgetSpot].includes(provider)) {
    return ExchangeEnum.bitget;
  }
  if (
    [ExchangeEnum.paperBitgetAll, ExchangeEnum.paperBitgetSpot].includes(
      provider
    )
  ) {
    return ExchangeEnum.paperBitget;
  }

  // Hyperliquid mappings
  if ([ExchangeEnum.hyperliquidAll].includes(provider)) {
    return ExchangeEnum.hyperliquid;
  }
  if ([ExchangeEnum.paperHyperliquidAll].includes(provider)) {
    return ExchangeEnum.paperHyperliquid;
  }

  // Kraken mappings — backend's `Exchange` enum only exposes the base
  // umbrella + per-market types (kraken, krakenUsdm, krakenCoinm); the
  // frontend's `krakenAll` / `krakenSpot` are synthetic UX shortcuts.
  // Collapse them to the base provider so the addExchange mutation
  // validates against the backend schema. (See parallel mapping for
  // bybit/okx/etc above.) `krakenUsdm` already exists on the backend so
  // it falls through unchanged.
  if (
    [
      ExchangeEnum.krakenAll,
      ExchangeEnum.krakenSpot,
      ExchangeEnum.kraken,
    ].includes(provider)
  ) {
    return ExchangeEnum.kraken;
  }
  if (
    [
      ExchangeEnum.paperKrakenAll,
      ExchangeEnum.paperKrakenSpot,
      ExchangeEnum.paperKraken,
    ].includes(provider)
  ) {
    return ExchangeEnum.paperKraken;
  }

  // Return provider as-is for all other cases
  return provider;
};

// Helper function to convert ExchangeFormData to AddExchangeInput
export const formDataToAddExchangeInput = (
  formData: ExchangeFormData,
  options?: {
    shouldCheckAffiliate?: boolean;
    subaccount?: boolean;
  }
): AddExchangeInput => {
  return {
    provider: mapProviderToBackend(formData.provider),
    key: formData.key,
    secret: formData.secret,
    name: formData.name,
    passphrase: formData.passphrase || undefined,
    stablecoinBalance: formData.isPaperTrading
      ? parseFloat(formData.stablecoinBalance)
      : undefined,
    coinToTopUp: formData.isPaperTrading ? formData.coinToTopUp : undefined,
    // Independent per-sub-account funding for a paper `SPOT & Futures`
    // create. Omitted (undefined) for single-market selections so the
    // backend keeps using coinToTopUp/stablecoinBalance — backward
    // compatible.
    topUps:
      formData.isPaperTrading &&
      formData.paperTopUps &&
      formData.paperTopUps.length > 0
        ? formData.paperTopUps.map((t) => ({
            provider: t.provider,
            asset: t.asset,
            amount: parseFloat(t.amount),
          }))
        : undefined,
    keysType: formData.keysType || undefined,
    okxSource: formData.okxSource || undefined,
    bybitHost: formData.bybitHost || undefined,
    // OKX Europe (my.okx.com) has no supported futures — never send `all`/
    // `futures` for an EU account, so the backend only ever creates the spot
    // sub-account. Safety net for the form's provider auto-correction.
    tradeType:
      mapProviderToBackend(formData.provider) === ExchangeEnum.okx &&
      formData.okxSource === OKXSource.my
        ? TradeTypeEnum.spot
        : getExchangeTradeType(formData.provider),
    shouldCheckAffiliate: options?.shouldCheckAffiliate,
    subaccount: options?.subaccount || false,
  };
};

// Helper function to convert ExchangeFormData to UpdateExchangeInput
export const formDataToUpdateExchangeInput = (
  formData: ExchangeFormData,
  uuid: string
): UpdateExchangeInput => {
  // Only include the paper-trading top-up fields when the user
  // actually entered a positive amount. The form keeps its
  // `stablecoinBalance` field at the seed default (`'10000'`) for
  // shape reasons even when the topUpAmount input is empty, so
  // serialising it directly would top the paper account up on every
  // save (e.g. when the user only flipped hedge mode).
  const parsedBalance = parseFloat(formData.stablecoinBalance);
  const includeTopUp =
    formData.isPaperTrading &&
    Number.isFinite(parsedBalance) &&
    parsedBalance > 0;

  return {
    uuid,
    key: formData.key,
    // Omit an empty secret so a rename-only edit keeps the stored
    // credential. The backend never returns the secret, so the form's
    // field is blank unless the user typed a replacement — sending ''
    // would clear it. Mirror the passphrase handling below.
    secret: formData.secret || undefined,
    name: formData.name,
    passphrase: formData.passphrase || undefined,
    stablecoinBalance: includeTopUp ? parsedBalance : undefined,
    coinToTopUp: includeTopUp ? formData.coinToTopUp : undefined,
    keysType: formData.keysType || undefined,
    okxSource: formData.okxSource || undefined,
    bybitHost: formData.bybitHost || undefined,
  };
};

/**
 * Hook for managing exchange mutations with TanStack Query
 * Provides add, update, delete, and utility mutations for exchanges
 */
export function useExchangeMutations() {
  const queryClient = useQueryClient();
  const { tokens, refreshUser } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  // Add exchange mutation
  const addExchange = useMutation({
    mutationFn: async (input: AddExchangeInput) => {
      const service = createExchangeServiceInstance(tokens, isLiveTrading);
      return service.addExchange(input);
    },
    onSuccess: (exchanges, input) => {
      logger.info('Exchange(s) added successfully:', exchanges);

      trackActivation(ACTIVATION_EVENTS.exchange_connect_succeeded, {
        exchange: input.provider,
        trading_mode: isLiveTrading ? 'live' : 'paper',
      });

      // `['user']` is the exchange list's real cache key: `useExchanges`
      // calls `useGraphQL('user', …)` and `useCacheKey` builds
      // `[baseKey, vars, userId, tradingContext]`, so this prefix-invalidate
      // is what actually refetches it. Do NOT mistake it for a profile
      // refresh — the profile lives in the auth store, not React Query.
      queryClient.invalidateQueries({ queryKey: ['user'] });

      // Connecting an exchange flips server-owned profile flags
      // (`hasExchanges`, `hasLiveExchanges`, `hasPaperExchanges`,
      // `onboardingSteps.liveExchange`). Only `refreshUser` re-reads them;
      // without it the onboarding widget stays on "Add a Live Exchange"
      // until the next full page load.
      void refreshUser();

      // A `SPOT & Futures` (all) selection creates BOTH a spot and a
      // futures account, so the backend returns more than one exchange.
      // Add every one to the store — adding only exchanges[0] left the
      // second account missing from "My Accounts" until a hard refresh.
      (exchanges ?? []).forEach((exchange) => {
        useExchangesStore.getState().addOrUpdateExchange(exchange);
      });
    },
    onError: (error, input) => {
      logger.error('Failed to add exchange:', error);
      trackActivation(ACTIVATION_EVENTS.exchange_connect_failed, {
        exchange: input?.provider,
        trading_mode: isLiveTrading ? 'live' : 'paper',
        reason: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // Update exchange mutation
  const updateExchange = useMutation({
    mutationFn: async (input: UpdateExchangeInput) => {
      const service = createExchangeServiceInstance(tokens, isLiveTrading);
      return service.updateExchange(input);
    },
    onSuccess: (data) => {
      logger.info('Exchange updated successfully:', data);

      // See addExchange: `['user']` is the exchange list's cache key.
      queryClient.invalidateQueries({ queryKey: ['user'] });

      // Editing keys can move an account between live and paper, which
      // shifts `hasLiveExchanges` / `hasPaperExchanges` on the profile.
      void refreshUser();

      // Merge into the existing store entry instead of replacing. The
      // server's `updateExchange` response can come back with stale or
      // missing `hedge` / `zeroFee` fields (those live behind separate
      // mutations); a hard replace clobbers the local truth we just set
      // via the live toggle, which is how the dialog ended up rendering
      // hedge=false even though the DB had hedge=true.
      const existing = useExchangesStore.getState().exchanges[data.uuid];
      useExchangesStore
        .getState()
        .addOrUpdateExchange(existing ? { ...existing, ...data } : data);
    },
    onError: (error) => {
      logger.error('Failed to update exchange:', error);
    },
  });

  // Delete exchange mutation
  const deleteExchange = useMutation({
    mutationFn: async (input: DeleteExchangeInput) => {
      logger.info(
        '[delete-exchange] deleteExchange mutation called with input:',
        input
      );
      const service = createExchangeServiceInstance(tokens, isLiveTrading);
      logger.info(
        '[delete-exchange] Exchange service instance created, calling deleteExchange'
      );
      return service.deleteExchange(input);
    },
    onSuccess: (message, variables) => {
      logger.info(
        '[delete-exchange] deleteExchange mutation onSuccess, message:',
        message
      );
      logger.info('[delete-exchange] Deleted exchange uuid:', variables.uuid);

      // See addExchange: `['user']` is the exchange list's cache key.
      queryClient.invalidateQueries({ queryKey: ['user'] });
      logger.info('[delete-exchange] Invalidated queries');

      // Removing the last exchange must clear `hasExchanges` &co on the
      // profile, otherwise empty states and onboarding stay "connected".
      void refreshUser();

      useExchangesStore.getState().removeExchange(variables.uuid);
    },
    onError: (error) => {
      logger.error('[delete-exchange] deleteExchange mutation onError:', error);
    },
  });

  // Set hedge mode mutation. Service returns only `{ uuid, hedge }`
  // (the GraphQL response is a Boolean success flag, not the exchange
  // object). Merge into the existing cache entry rather than replace it
  // — calling `addOrUpdateExchange` with the partial would wipe every
  // other field on the exchange.
  const setHedgeMode = useMutation({
    mutationFn: async (input: SetHedgeModeInput) => {
      const service = createExchangeServiceInstance(tokens, isLiveTrading);
      return service.setHedgeMode(input);
    },
    onSuccess: (data) => {
      logger.info('Hedge mode updated successfully:', data);

      const existing = useExchangesStore.getState().exchanges[data.uuid];
      if (existing) {
        useExchangesStore.getState().addOrUpdateExchange({
          ...existing,
          hedge: data.hedge,
        });
      }

      // Mark the store stale and invalidate the GraphQL query that
      // `useExchanges` listens on, so a background refetch reconciles
      // any other fields that may have shifted server-side.
      useExchangesStore.getState().markStale();
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error) => {
      logger.error('Failed to update hedge mode:', error);
    },
  });

  // Set zero fee mutation. Same partial-result shape / merge strategy.
  const setZeroFee = useMutation({
    mutationFn: async (input: SetZeroFeeInput) => {
      const service = createExchangeServiceInstance(tokens, isLiveTrading);
      return service.setZeroFee(input);
    },
    onSuccess: (data) => {
      logger.info('Zero fee updated successfully:', data);

      const existing = useExchangesStore.getState().exchanges[data.uuid];
      if (existing) {
        useExchangesStore.getState().addOrUpdateExchange({
          ...existing,
          zeroFee: data.zeroFee,
        });
      }

      useExchangesStore.getState().markStale();
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error) => {
      logger.error('Failed to update zero fee:', error);
    },
  });

  // Update balance mutation
  const updateBalance = useMutation({
    mutationFn: async (input: UpdateBalanceInput) => {
      const service = createExchangeServiceInstance(tokens, isLiveTrading);
      return service.updateBalance(input);
    },
    onSuccess: (data) => {
      logger.info('Balance updated successfully:', data);

      // Mark exchange store stale so consumers refetch latest balances
      useExchangesStore.getState().markStale();

      // See addExchange: `['user']` is the exchange list's cache key, so this
      // is what refetches the updated balances.
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error) => {
      logger.error('Failed to update balance:', error);
    },
  });

  return {
    // Main mutations
    addExchange,
    updateExchange,
    deleteExchange,

    // Utility mutations
    setHedgeMode,
    setZeroFee,
    updateBalance,

    // Loading states
    isAddingExchange: addExchange.isPending,
    isUpdatingExchange: updateExchange.isPending,
    isDeletingExchange: deleteExchange.isPending,
    isUpdatingBalance: updateBalance.isPending,

    // Error states
    addExchangeError: addExchange.error,
    updateExchangeError: updateExchange.error,
    deleteExchangeError: deleteExchange.error,
    updateBalanceError: updateBalance.error,

    // Helper functions
    formDataToAddExchangeInput,
    formDataToUpdateExchangeInput,
  };
}
