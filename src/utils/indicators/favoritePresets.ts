import { create } from 'zustand';

import { GraphQlQuery, type GraphQLClient } from '@/lib/api';
import type { IndicatorEnum } from '@/types';
import { getIndicatorDefinition } from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';

export type FavoritePresetParams = Partial<IndicatorParamsState>;

interface FavoritePresetsState {
  presets: Partial<Record<IndicatorEnum, FavoritePresetParams>>;
  /** False once the server has refused the presets fields (older backend). */
  supported: boolean;
  replaceAll: (
    presets: Partial<Record<IndicatorEnum, FavoritePresetParams>>
  ) => void;
  markUnsupported: () => void;
}

/** Saved settings per favorite indicator, as returned by the server. */
export const useFavoritePresetsStore = create<FavoritePresetsState>((set) => ({
  presets: {},
  supported: true,
  replaceAll: (presets) => set({ presets }),
  markUnsupported: () => set({ supported: false }),
}));

interface RawPreset {
  indicator?: string | null;
  params?: string | null;
}

export interface FavoriteIndicatorsPayload {
  status: string;
  reason?: string | null;
  data?: {
    indicators?: IndicatorEnum[] | null;
    presets?: RawPreset[] | null;
  } | null;
}

/** Store the presets carried by a favorites response (no-op without them). */
export const storeFavoritePresets = (
  payload: FavoriteIndicatorsPayload | null | undefined
) => {
  const raw = payload?.status === 'OK' ? payload.data?.presets : undefined;
  if (!raw) {
    return;
  }
  const presets: Partial<Record<IndicatorEnum, FavoritePresetParams>> = {};
  for (const entry of raw) {
    if (!entry?.indicator || !entry.params) continue;
    try {
      const parsed = JSON.parse(entry.params) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        presets[entry.indicator as IndicatorEnum] =
          parsed as FavoritePresetParams;
      }
    } catch {
      /* skip a corrupt preset */
    }
  }
  useFavoritePresetsStore.getState().replaceAll(presets);
};

/**
 * The indicator's own settings worth keeping with a favorite: only the keys
 * its catalog fields declare, never group, uuid, action or section.
 */
export const extractFavoritePresetParams = (
  indicator: IndicatorParamsState & { type: IndicatorEnum }
): FavoritePresetParams => {
  const definition = getIndicatorDefinition(indicator.type);
  const keys = new Set<string>();
  for (const field of [
    ...definition.fields,
    ...(definition.advancedFields ?? []),
  ]) {
    keys.add(field.key as string);
    for (const alt of field.keyWhen ?? []) keys.add(alt.key as string);
  }
  const source = indicator as Record<string, unknown>;
  const params: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      params[key] = source[key];
    }
  }
  return params as FavoritePresetParams;
};

const isPresetsSchemaError = (error: unknown) =>
  error instanceof Error && /presets|params/.test(error.message);

type FavoritesOperation =
  | { kind: 'get' }
  | { kind: 'add'; indicator: string; params?: FavoritePresetParams }
  | { kind: 'remove'; indicator: string };

/**
 * Read or change favorites, with saved settings when the backend supports
 * them. An older backend rejects the presets fields; then this retries the
 * plain request once and stops asking for presets for the session.
 */
export const requestFavoriteIndicators = async (
  client: GraphQLClient,
  op: FavoritesOperation,
  options?: { timeoutMs?: number }
): Promise<FavoriteIndicatorsPayload | null> => {
  const run = async (withPresets: boolean) => {
    if (op.kind === 'get') {
      const { query } = GraphQlQuery.getUserFavoriteIndicators(withPresets);
      const res = await client.request<{
        getUserFavoriteIndicators: FavoriteIndicatorsPayload;
      }>(query, undefined, options);
      return res?.getUserFavoriteIndicators ?? null;
    }
    if (op.kind === 'add') {
      const input =
        withPresets && op.params
          ? { indicator: op.indicator, params: JSON.stringify(op.params) }
          : { indicator: op.indicator };
      const { query, variables } = GraphQlQuery.addUserFavoriteIndicator(
        input,
        withPresets
      );
      const res = await client.request<{
        addUserFavoriteIndicator: FavoriteIndicatorsPayload;
      }>(query, variables, options);
      return res?.addUserFavoriteIndicator ?? null;
    }
    const { query, variables } = GraphQlQuery.removeUserFavoriteIndicator(
      { indicator: op.indicator },
      withPresets
    );
    const res = await client.request<{
      removeUserFavoriteIndicator: FavoriteIndicatorsPayload;
    }>(query, variables, options);
    return res?.removeUserFavoriteIndicator ?? null;
  };

  const store = useFavoritePresetsStore.getState();
  if (!store.supported) {
    return run(false);
  }
  try {
    const payload = await run(true);
    storeFavoritePresets(payload);
    return payload;
  } catch (error) {
    if (!isPresetsSchemaError(error)) throw error;
    store.markUnsupported();
    return run(false);
  }
};
