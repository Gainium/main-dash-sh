import {
  useOptionalBotFormContext,
  useOptionalBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { DEFAULT_READ_TIMEOUT_MS, GraphQLClient } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import type { IndicatorEnum } from '@/types';
import {
  parseIndicatorFavoriteCodes,
  toIndicatorFavoriteCode,
} from '@/utils/indicators';
import {
  requestFavoriteIndicators,
  type FavoritePresetParams,
} from '@/utils/indicators/favoritePresets';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface FavoriteMutationState {
  pendingIndicators: Set<IndicatorEnum>;
  version: number;
}

const useFavoriteMutationState = () => {
  const stateRef = useRef<FavoriteMutationState>({
    pendingIndicators: new Set<IndicatorEnum>(),
    version: 0,
  });
  const [, setVersion] = useState(0);

  const markPending = useCallback(
    (indicator: IndicatorEnum, pending: boolean) => {
      const state = stateRef.current;
      if (pending) {
        if (!state.pendingIndicators.has(indicator)) {
          state.pendingIndicators.add(indicator);
          state.version += 1;
          setVersion(state.version);
        }
        return;
      }

      if (state.pendingIndicators.delete(indicator)) {
        state.version += 1;
        setVersion(state.version);
      }
    },
    []
  );

  const isPending = useCallback(
    (indicator: IndicatorEnum) =>
      stateRef.current.pendingIndicators.has(indicator),
    []
  );

  const hasPending = stateRef.current.pendingIndicators.size > 0;

  return {
    isPending,
    markPending,
    hasPending,
  };
};

interface FavoriteMutationResponse {
  status: string;
  reason?: string | null;
  data?: { indicators?: IndicatorEnum[] | null } | null;
}

const extractFavoriteIndicators = (
  payload: FavoriteMutationResponse | null | undefined
): IndicatorEnum[] | null => {
  if (!payload || payload.status !== 'OK') {
    return null;
  }

  const rawIndicators = payload.data?.indicators ?? [];
  const { favorites, unknownCodes } =
    parseIndicatorFavoriteCodes(rawIndicators);

  if (unknownCodes.length > 0) {
    console.warn(
      '[useFavoriteIndicators] Unknown favorite indicator codes received:',
      unknownCodes
    );
  }

  return favorites;
};

const formatMutationError = (reason?: string | null): string => {
  const normalized = reason?.trim();
  if (normalized) {
    return normalized;
  }
  return 'Unexpected response while updating favorite indicators.';
};

export const useFavoriteIndicators = () => {
  // Narrow reads: only the top-level `favoriteIndicators` field + the stable
  // dispatch. Previously this used the broad `useBotFormState()`, which
  // re-rendered every consumer of this shared hook on EVERY keystroke.
  // Inside the bot form the favourites live in the form (the provider loads
  // them). Outside it — a standalone indicator editor — they live in local
  // state, loaded once with the same query.
  const botForm = useOptionalBotFormContext();
  const formFavorites = useOptionalBotFormTopLevelSelector('favoriteIndicators');
  const [localFavorites, setLocalFavorites] = useState<string[]>([]);
  const favoriteIndicators = botForm ? formFavorites : localFavorites;
  const formUpdate = botForm?.updateFormData;
  const updateFormData = useCallback(
    (_field: 'favoriteIndicators', value: string[]) => {
      if (formUpdate) {
        formUpdate('favoriteIndicators', value);
      } else {
        setLocalFavorites(value);
      }
    },
    [formUpdate]
  );
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const standalone = !botForm;
  useEffect(() => {
    if (!standalone || !tokens?.accessToken) return;
    let active = true;
    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const client = new GraphQLClient(
      endpoint,
      tokens.accessToken,
      !isLiveTrading
    );
    requestFavoriteIndicators(
      client,
      { kind: 'get' },
      { timeoutMs: DEFAULT_READ_TIMEOUT_MS }
    )
      .then((payload) => {
        const loaded = extractFavoriteIndicators(payload);
        if (active && loaded) setLocalFavorites(loaded);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [standalone, tokens?.accessToken, isLiveTrading]);
  const favorites = useMemo(
    () => (favoriteIndicators || []).filter(Boolean) as IndicatorEnum[],
    [favoriteIndicators]
  );
  const favoritesRef = useRef<IndicatorEnum[]>(favorites);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  const { isPending, markPending, hasPending } = useFavoriteMutationState();

  const mutateFavorites = useCallback(
    async (
      indicator: IndicatorEnum,
      nextIsFavorite: boolean,
      params?: FavoritePresetParams
    ) => {
      const code = toIndicatorFavoriteCode(indicator);
      if (!code) {
        toast.error('Unsupported indicator cannot be marked as favorite.');
        return;
      }

      if (!tokens?.accessToken) {
        toast.error('Authentication required to persist favorites.');
        return;
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        !isLiveTrading
      );

      const previousFavorites = favoritesRef.current;
      const optimisticFavorites = nextIsFavorite
        ? Array.from(new Set([...previousFavorites, indicator]))
        : previousFavorites.filter((value) => value !== indicator);

      favoritesRef.current = optimisticFavorites;
      updateFormData(
        'favoriteIndicators',
        optimisticFavorites as unknown as string[]
      );

      markPending(indicator, true);

      try {
        const payload = await requestFavoriteIndicators(
          client,
          nextIsFavorite
            ? {
                kind: 'add',
                indicator: code,
                ...(params ? { params } : {}),
              }
            : { kind: 'remove', indicator: code }
        );

        const serverFavorites = extractFavoriteIndicators(payload);
        if (serverFavorites) {
          favoritesRef.current = serverFavorites;
          updateFormData(
            'favoriteIndicators',
            serverFavorites as unknown as string[]
          );
        } else {
          throw new Error(formatMutationError(payload?.reason));
        }
      } catch (error) {
        updateFormData(
          'favoriteIndicators',
          previousFavorites as unknown as string[]
        );

        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to update favorite indicators.';
        toast.error(message);
      } finally {
        markPending(indicator, false);
      }
    },
    [isLiveTrading, markPending, tokens?.accessToken, updateFormData]
  );

  /**
   * `params`: the indicator's settings to keep with the favorite (starring
   * from the form). Picking that favorite later starts from them.
   */
  const toggleFavorite = useCallback(
    (
      indicator: IndicatorEnum,
      nextIsFavorite: boolean,
      params?: FavoritePresetParams
    ) => {
      if (isPending(indicator)) {
        return;
      }

      void mutateFavorites(indicator, nextIsFavorite, params);
    },
    [isPending, mutateFavorites]
  );

  return {
    favorites,
    toggleFavorite,
    isMutating: hasPending,
    isIndicatorMutating: isPending,
  };
};
