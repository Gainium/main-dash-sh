/**
 * Pair market-data adapter — the extension point shared code (the bot
 * pair selector, `CoinFilter` / `ListModal`) uses to sort and decorate
 * the trading-pair list by market metrics it cannot fetch itself.
 *
 * Cloud registers a hook backed by the screener (`/api/screener`) and the
 * curated-presets leaderboard, returning a `lookup(baseAsset)` over
 * marketcap / volume / 24h change / best curated ROI. Self-hosted / sh
 * builds leave the registration unset and the no-op default returns
 * `null` for every coin — the selector then falls back to alphabetical
 * sort with no ROI badge, since there is no screener or curated worker
 * in sh.
 *
 * Mirrors the curatedPresets / analytics / license adapter pattern:
 * register synchronously at boot from `main.tsx` so the number of hooks
 * called inside `usePairMarketData()` stays stable across renders.
 */

export interface PairMarketDatum {
  /** Current price (USD). */
  price?: number;
  /** USD market capitalization. */
  marketCap?: number;
  /** 1-based market-cap rank (1 = largest). Lower sorts first. */
  marketCapRank?: number;
  /** 24h total traded volume (USD). */
  volume24h?: number;
  /** Price change over the last 1h / 24h / 7d / 30d, percent. */
  change1h?: number;
  change24h?: number;
  change7d?: number;
  change30d?: number;
  /** 1-day realized volatility, percent. */
  volatility?: number;
  /** Latest RSI (1d) for the asset. */
  rsi?: number;
  /**
   * Best POSITIVE curated-strategy ROI across this coin's available bot
   * types / tiers, percent. Left undefined when the coin has no curated
   * preset or none with positive ROI — a missing badge is more honest
   * than surfacing a non-positive number.
   */
  roi?: number;
}

export interface PairMarketDataResult {
  /** Lookup keyed on the uppercased base asset (e.g. `"BTC"`). */
  lookup: (baseAsset: string) => PairMarketDatum | null;
  isLoading: boolean;
  /**
   * Which sources are still loading (optional, per source): the market
   * fields (screener), the curated ROI, the RSI. A consumer shows "Loading…"
   * for a missing value while its source loads, and nothing once it has.
   */
  loading?: { market?: boolean; roi?: boolean; rsi?: boolean };
}

/**
 * Identifies which curated-strategy ROI to surface, so the pair selector
 * matches the risk-profile cards in the bot form: same leaderboard
 * (DCA for DCA & Combo bots, Grid for Grid) and same direction.
 */
export interface PairRoiContext {
  botType: 'dca' | 'grid';
  strategy: 'long' | 'short';
}

/**
 * @param active whether the consumer is currently showing market data
 *   (e.g. the pair dialog is open). Providers should gate their fetches
 *   on this so nothing loads until the data is actually needed.
 * @param roiContext the bot form's curated botType + direction, so the
 *   ROI badge matches the risk-profile cards. Null = best-effort.
 */
export type UsePairMarketDataHook = (
  active: boolean,
  roiContext?: PairRoiContext | null,
) => PairMarketDataResult;

const noopHook: UsePairMarketDataHook = () => ({
  lookup: () => null,
  isLoading: false,
});

let providerHook: UsePairMarketDataHook = noopHook;

/**
 * Register the pair-market-data hook for this build. Cloud registers a
 * real hook; sh leaves it unregistered and the default returns an empty
 * lookup. Must run synchronously before the first render.
 */
export function registerPairMarketDataProvider(
  hook: UsePairMarketDataHook,
): void {
  providerHook = hook;
}

/**
 * Whether this build has a market-data provider (cloud does; self-hosted
 * doesn't). Decides whether market-data columns exist at all — a column
 * must not appear and disappear with its data.
 */
export function hasPairMarketDataProvider(): boolean {
  return providerHook !== noopHook;
}

/**
 * Read the registered pair-market-data lookup. Returns an empty lookup
 * (`() => null`) when no provider is registered. Pass `active=false`
 * (e.g. dialog closed) to let the provider defer its fetches.
 */
export function usePairMarketData(
  active = true,
  roiContext?: PairRoiContext | null,
): PairMarketDataResult {
  return providerHook(active, roiContext ?? null);
}
