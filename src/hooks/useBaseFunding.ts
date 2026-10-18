// React bindings for base funding (short spot DCA / combo). The reads live in
// `@/lib/baseFunding/baseFundingApi` (see its header for why the setting
// travels in its own document).
import { useQuery } from '@tanstack/react-query';

import { useSinglePositionClient } from '@/hooks/useSinglePosition';
import {
  fetchBaseFundingSettings,
  fetchFundingPreview,
  type BaseFundingBackend,
  type BaseFundingBotKind,
  type BotBaseFundingSettings,
  type FundingPreview,
  type PreviewFundingInput,
} from '@/lib/baseFunding/baseFundingApi';

export const BASE_FUNDING_QUERY_KEY = 'baseFundingSettings';
export const FUNDING_PREVIEW_QUERY_KEY = 'fundingPreview';

export interface UseBaseFundingSettingsResult {
  /** 'unknown' while the first answer is pending or the request failed. */
  backend: BaseFundingBackend;
  settings: BotBaseFundingSettings | undefined;
  isFetching: boolean;
}

/**
 * The bot's base-funding settings; with no bot id, the capability probe alone
 * (create mode). An 'old' answer is kept for the session; a transport failure
 * stays 'unknown' and is retried on the next mount.
 */
export function useBaseFundingSettings(
  botId: string | undefined,
  kind: BaseFundingBotKind,
  active = true,
  /** Always refetch on mount (the edit form: a cached value would be saved back). */
  fresh = false
): UseBaseFundingSettingsResult {
  const { make, enabled, paperContext } = useSinglePositionClient();
  const q = useQuery({
    queryKey: [BASE_FUNDING_QUERY_KEY, paperContext, kind, botId ?? ''],
    enabled: enabled && active,
    retry: false,
    staleTime: !botId ? Infinity : fresh ? 0 : 30_000,
    ...(fresh
      ? { refetchOnMount: 'always' as const, refetchOnWindowFocus: false }
      : {}),
    queryFn: () => fetchBaseFundingSettings(make(), botId, kind),
  });
  return {
    backend: q.data?.backend ?? 'unknown',
    settings: q.data?.settings,
    isFetching: q.isFetching,
  };
}

/** Quantities are rounded into the key so a price tick does not refetch. */
const keyOf = (input: PreviewFundingInput) => [
  input.exchangeUUID,
  input.pair,
  input.mode,
  input.dealId ?? '',
  Number(input.baseOrderQty.toPrecision(6)),
  Number(input.safetyQty.toPrecision(6)),
  Number(input.price.toPrecision(4)),
];

/**
 * What the bot would buy, reserve or refuse for `input` (null: nothing to
 * preview). A preview, not a promise — the engine re-plans when it acts.
 */
export function useFundingPreview(input: PreviewFundingInput | null): {
  preview: FundingPreview | null;
  isFetching: boolean;
} {
  const { make, enabled, paperContext } = useSinglePositionClient();
  const valid =
    !!input &&
    !!input.exchangeUUID &&
    !!input.pair &&
    input.price > 0 &&
    Number.isFinite(input.safetyQty) &&
    Number.isFinite(input.baseOrderQty);
  const q = useQuery({
    queryKey: [
      FUNDING_PREVIEW_QUERY_KEY,
      paperContext,
      ...(valid && input ? keyOf(input) : []),
    ],
    enabled: enabled && valid,
    retry: false,
    staleTime: 15_000,
    queryFn: () => fetchFundingPreview(make(), input as PreviewFundingInput),
  });
  return { preview: valid ? (q.data ?? null) : null, isFetching: q.isFetching };
}
