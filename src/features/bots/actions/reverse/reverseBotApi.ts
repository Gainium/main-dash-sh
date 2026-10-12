/**
 * Reverse a futures DCA / Combo bot in place (LONG ↔ SHORT).
 *
 * Cloud backend only (`reverseBotPreview` / `reverseBot` live in the cloud
 * app's schema), so the action is offered only when `IS_CLOUD` — see
 * `useBotActions`.
 */
import { useMutation, useQuery } from '@tanstack/react-query';

import { GraphQLClient } from '@/lib/api/GraphQLClient';
import { invalidateListCaches, BOT_LIST_QUERY_KEYS_BY_TYPE } from '@/lib/queryCacheUtils';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export type ReverseBotType = 'dca' | 'combo';

export interface ReversePreviewDeal {
  dealId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  avgPrice: number | null;
  unrealizedUsd: number | null;
  unrealizedPerc: number | null;
  pnlSource: string | null;
  realizedUsd: number | null;
}

export interface ReverseBotPreview {
  botId: string;
  botType: ReverseBotType;
  botName: string;
  exchange: string;
  pairs: string[];
  from: 'LONG' | 'SHORT';
  to: 'LONG' | 'SHORT';
  status: string;
  running: boolean;
  refusal: string | null;
  deals: ReversePreviewDeal[];
  totalUnrealizedUsd: number | null;
  totalRealizedUsd: number | null;
  pnlComplete: boolean;
  newBot: {
    strategy: 'LONG' | 'SHORT';
    leverage: number | null;
    marginType: string | null;
    baseOrderSize: string | null;
    orderSize: string | null;
    ordersCount: number | null;
    useDca: boolean;
    orderSizeType: string | null;
    useTp: boolean;
    tpPerc: string | null;
    useSl: boolean;
    slPerc: string | null;
    startCondition: string | null;
    startsImmediately: boolean;
  };
  indicators: string[];
  warnings: string[];
  otherHolders: { botId: string; botName: string; symbol: string }[];
}

export interface ReverseBotResult {
  ok: boolean;
  strategy: 'LONG' | 'SHORT';
  stage: string | null;
  started: boolean;
  message: string;
}

const PREVIEW_QUERY = `query reverseBotPreview($botId: String!, $type: String!) {
  reverseBotPreview(botId: $botId, type: $type) {
    botId botType botName exchange pairs from to status running refusal
    deals { dealId symbol side size avgPrice unrealizedUsd unrealizedPerc pnlSource realizedUsd }
    totalUnrealizedUsd totalRealizedUsd pnlComplete
    newBot {
      strategy leverage marginType baseOrderSize orderSize ordersCount useDca
      orderSizeType useTp tpPerc useSl slPerc startCondition startsImmediately
    }
    indicators warnings
    otherHolders { botId botName symbol }
  }
}`;

const REVERSE_MUTATION = `mutation reverseBot($botId: String!, $type: String!, $start: Boolean) {
  reverseBot(botId: $botId, type: $type, start: $start) { ok strategy stage started message }
}`;

/** The whole server sequence is bounded near a minute; leave room for the start. */
const REVERSE_TIMEOUT_MS = 150_000;

/** "GraphQL errors: <reason>" → "<reason>". */
export const reverseErrorMessage = (e: unknown): string =>
  `${(e as Error)?.message ?? e}`.replace(/^GraphQL errors:\s*/, '');

function useClient() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  return () => {
    if (!tokens?.accessToken) throw new Error('Authentication required');
    return new GraphQLClient(
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000',
      tokens.accessToken,
      !isLiveTrading
    );
  };
}

export function useReverseBotPreview(
  botId: string,
  type: ReverseBotType,
  enabled: boolean
) {
  const client = useClient();
  return useQuery({
    queryKey: ['reverseBotPreview', botId, type],
    enabled: enabled && !!botId,
    // Prices move: always re-read when the dialog opens.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      const res = await client().request<{ reverseBotPreview: ReverseBotPreview }>(
        PREVIEW_QUERY,
        { botId, type }
      );
      return res.reverseBotPreview;
    },
  });
}

export function useBotReverse(type: ReverseBotType) {
  const client = useClient();
  return useMutation({
    mutationFn: async (vars: { botId: string; start: boolean }) => {
      const res = await client().request<{ reverseBot: ReverseBotResult }>(
        REVERSE_MUTATION,
        { botId: vars.botId, type, start: vars.start },
        { timeoutMs: REVERSE_TIMEOUT_MS }
      );
      return res.reverseBot;
    },
    // The direction lives in the list caches; the status socket does not carry it.
    onSettled: () => {
      invalidateListCaches(BOT_LIST_QUERY_KEYS_BY_TYPE[type]);
    },
  });
}
