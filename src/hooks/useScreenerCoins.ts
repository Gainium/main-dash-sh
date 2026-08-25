import { useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { StatusEnum, type ScreenerCoinData } from '@/types';

/**
 * The market screener as a *coin metadata* source, shared by every widget that
 * needs it.
 *
 * Why this file exists. Five widgets each hand-rolled this query, and all five
 * used the SAME React Query key `['screener', 'all']` while asking for
 * different things:
 *
 *  - the deals treemap PAGED the whole universe (100/page, up to 50 pages —
 *    ~950 coins, ~2.6 MB), because its market mode genuinely charts every coin;
 *  - the four portfolio widgets asked for `page: 0, pageSize: 500`, which the
 *    backend silently clamps to `DEFAULT_DB_LIMIT = 100` (measured: 273 KB).
 *
 * React Query dedupes by key, so whichever widget mounted first decided what
 * every other one received. That is not only wasteful, it is wrong in both
 * directions: the market treemap silently charts 100 coins when a portfolio
 * widget won the race, and the portfolio widgets pull 2.6 MB they have no use
 * for when the treemap did. Three of the five also set `refetchInterval: 30s`
 * and two set none, so the poll rate was decided the same arbitrary way — on a
 * public, unauthenticated endpoint, per open dashboard.
 *
 * So: one key per shape of request, and a cadence that matches what this
 * payload actually is. Since holdings are priced from the venue's own rate
 * (`getBalances(includeUsdValues)`), nothing here is on a 30-second clock any
 * more — market-cap rank, categories and coin names do not move that fast.
 */

/** Metadata, not a price feed: refresh on a human timescale, not a market one. */
const METADATA_STALE_MS = 15 * 60 * 1000;

const SCREENER_PAGE_SIZE = 100; // = main-app's DEFAULT_DB_LIMIT; asking for more is silently clamped.

const endpoint = () =>
  import.meta.env.VITE_API_ENDPOINT || 'https://api.gainium.io';

const postScreener = async (body: Record<string, unknown>) => {
  const resp = await fetchWithTimeout(`${endpoint()}/api/screener`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-type': 'application/json' },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch screener data: ${resp.status}`);
  }
  const json = await resp.json();
  if (json.status === StatusEnum.notok) throw new Error(json.reason);
  return (json.data?.result || []) as ScreenerCoinData[];
};

/**
 * Every coin the screener carries, paged until exhausted.
 *
 * Only for a consumer that genuinely charts the whole market. A widget that
 * just needs metadata for the coins a user holds wants
 * {@link useScreenerCoinsForSymbols} instead — this one is ~950 coins.
 */
export const useAllScreenerCoins = () =>
  useQuery({
    // NOT `['screener', 'all']`: that key used to be shared with the
    // page-0 consumers, which meant this could resolve to 100 coins.
    queryKey: ['screener', 'universe'],
    queryFn: async () => {
      const all: ScreenerCoinData[] = [];
      for (let page = 0; page < 50; page += 1) {
        const items = await postScreener({
          page,
          pageSize: SCREENER_PAGE_SIZE,
        });
        all.push(...items);
        if (items.length < SCREENER_PAGE_SIZE) break;
      }
      return { status: StatusEnum.ok, data: { result: all } } as const;
    },
    staleTime: METADATA_STALE_MS,
    refetchInterval: METADATA_STALE_MS,
    retry: 3,
  });

/**
 * The screener's first page — the highest-ranked coins.
 *
 * This is what the portfolio widgets have always actually received (their
 * `pageSize: 500` was clamped to 100), so it keeps their behaviour identical
 * while taking them off the shared key and the 30-second poll. It is a
 * best-effort metadata source: a coin outside this page simply is not in it,
 * which is why holdings are priced from the venue rather than from here.
 */
export const useTopScreenerCoins = () =>
  useQuery({
    queryKey: ['screener', 'top'],
    queryFn: async () => {
      const result = await postScreener({
        page: 0,
        pageSize: SCREENER_PAGE_SIZE,
      });
      return { status: StatusEnum.ok, data: { result } } as const;
    },
    staleTime: METADATA_STALE_MS,
    refetchInterval: METADATA_STALE_MS,
  });
