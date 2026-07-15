import {
  useBotFormActions,
  useBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { GraphQLClient, GraphQlQuery } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import type { IndicatorEnum } from '@/types';
import {
  parseIndicatorFavoriteCodes,
  toIndicatorFavoriteCode,
} from '@/utils/indicators';
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
  const favoriteIndicators = useBotFormTopLevelSelector('favoriteIndicators');
  const { updateFormData } = useBotFormActions();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
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
    async (indicator: IndicatorEnum, nextIsFavorite: boolean) => {
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
        let payload: FavoriteMutationResponse | null | undefined;

        if (nextIsFavorite) {
          const { query, variables } = GraphQlQuery.addUserFavoriteIndicator({
            indicator: code,
          });
          const response = await client.request<{
            addUserFavoriteIndicator: FavoriteMutationResponse;
          }>(query, variables);
          payload = response?.addUserFavoriteIndicator;
        } else {
          const { query, variables } = GraphQlQuery.removeUserFavoriteIndicator(
            {
              indicator: code,
            }
          );
          const response = await client.request<{
            removeUserFavoriteIndicator: FavoriteMutationResponse;
          }>(query, variables);
          payload = response?.removeUserFavoriteIndicator;
        }

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

  const toggleFavorite = useCallback(
    (indicator: IndicatorEnum, nextIsFavorite: boolean) => {
      if (isPending(indicator)) {
        return;
      }

      void mutateFavorites(indicator, nextIsFavorite);
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
