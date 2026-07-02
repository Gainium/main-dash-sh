import { exchangeQueries } from '@/lib/api/GraphQLQueries-exchange-queries';
import { ExchangeEnum, type QuantRulesCooldown } from '@/types/exchange.types';
import { useExchangesStore } from '@/stores/exchangesStore';
import { useGraphQL } from './useGraphQL';
import { useMemo } from 'react';

/**
 * Parse the `until` field of a quant-rules cooldown defensively into epoch ms.
 *
 * main-app serializes it as an ISO-8601 string (see
 * `core/src/graphql/handlers/quantRules.handler.ts` — `new Date(...).toISOString()`),
 * but GraphQL Date scalars elsewhere in the schema can serialize as epoch-ms
 * numbers or numeric strings, so we accept all three shapes.
 *
 * Returns `NaN` for anything unparseable so callers can filter it out.
 */
export function parseUntilMs(until: string | number | null | undefined): number {
  if (until === null || until === undefined) return NaN;
  if (typeof until === 'number') return until;
  const trimmed = String(until).trim();
  if (trimmed === '') return NaN;
  // Pure-numeric string => epoch ms (Date scalar can serialize this way).
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  const ms = new Date(trimmed).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

/** A cooldown with its `until` normalized to epoch ms (guaranteed finite). */
export interface ActiveQuantRulesCooldown extends QuantRulesCooldown {
  untilMs: number;
}

export interface UseQuantRulesStatusResult {
  /** Active cooldowns (untilMs > now), sorted soonest-to-expire first. */
  cooldowns: ActiveQuantRulesCooldown[];
  /** True when there is at least one active cooldown. */
  hasActive: boolean;
  /** True when at least one active cooldown is a whole-account restriction. */
  accountWide: boolean;
  isLoading: boolean;
}

// Provider strings on ExchangeInUser that mean "this user has a Binance
// account that could trip the futures Quantitative Rules". Spot-only Binance
// accounts can't be reduce-only-restricted, but the umbrella providers
// (binance / binanceAll) may carry futures, so we include them to be safe.
const BINANCE_PROVIDERS = new Set<string>([
  ExchangeEnum.binance,
  ExchangeEnum.binanceAll,
  ExchangeEnum.binanceUsdm,
  ExchangeEnum.binanceCoinm,
]);

/**
 * Live status of Binance Futures Quantitative Rules (-4400) cooldowns for the
 * authenticated user.
 *
 * Backed by the `getQuantRulesStatus` GraphQL query. Polls every 60s (the
 * cooldown windows are minutes-to-hours long, so 60s is plenty) and treats
 * data as fresh for 30s. The banner is additive to the existing bot-message
 * toast + notification-bell surfaces; this hook only drives the banner.
 *
 * The query is only enabled for users who actually have a Binance account
 * connected (cheap gate via the exchanges store) — users who can't be affected
 * never fire it.
 *
 * Note: refresh is poll-only. The cooldown warning already arrives on the
 * `bot sends message` socket path (with `subType === 'Exchange rules'`) and is
 * surfaced by the toaster + notification bell independently; we intentionally
 * rely on the 60s poll here rather than coupling the banner to that socket
 * event, so a missed/duplicated socket message can't desync the banner from
 * the authoritative backend list.
 */
export function useQuantRulesStatus(): UseQuantRulesStatusResult {
  const exchanges = useExchangesStore((s) => s.exchanges);

  // Only run the query for users with a Binance account that could be affected.
  const hasBinanceFutures = useMemo(
    () =>
      Object.values(exchanges).some((ex) =>
        BINANCE_PROVIDERS.has(ex.provider as string)
      ),
    [exchanges]
  );

  const { query } = exchangeQueries.getQuantRulesStatus();

  const { data, isLoading } = useGraphQL<QuantRulesCooldown[]>(
    'getQuantRulesStatus',
    { query },
    {
      enabled: hasBinanceFutures,
      refetchInterval: 60_000,
      staleTime: 30_000,
    }
  );

  const cooldowns = useMemo<ActiveQuantRulesCooldown[]>(() => {
    const rows = data?.status === 'OK' ? (data.data ?? []) : [];
    const now = Date.now();
    return rows
      .map((row) => ({ ...row, untilMs: parseUntilMs(row.until) }))
      // Belt-and-braces: backend already filters to until > now, but a stale
      // cached response or clock skew could slip an expired row through.
      .filter((row) => Number.isFinite(row.untilMs) && row.untilMs > now)
      .sort((a, b) => a.untilMs - b.untilMs);
  }, [data]);

  return {
    cooldowns,
    hasActive: cooldowns.length > 0,
    accountWide: cooldowns.some((c) => c.scope === 'account' || c.symbol == null),
    isLoading,
  };
}
