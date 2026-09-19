import { extractPairAssets } from '@/utils/pairs';

/**
 * Filter meta for the deals tables' Symbol column.
 *
 * Extracted from `OpenOrdersWidget`'s column defs so the shipped accessors can
 * be driven directly by a test, in the same spirit as `dcaDealToOpenTrade`.
 *
 * The two accessors answer DIFFERENT questions and must not be conflated:
 *
 * - `getFilterValue` — "which strings should a typed search term be matched
 *   against?" Deliberately generous: a user typing `BTC`, `BTC/USDT`,
 *   `BTCUSDT` or `USDT` all expect to hit a BTC/USDT row.
 * - `getOptionValue` — "what is this row's value for this column?" Exactly one
 *   string, the symbol as the rest of the UI spells it. This is what the
 *   multi-select dropdown offers as discrete choices; feeding it the matching
 *   variants instead turned N symbols into ~3N entries, most of them bare
 *   assets or derived spellings that are not symbols at all.
 */
export const SYMBOL_COLUMN_FILTER_META = {
  filterType: 'array' as const,

  getOptionValue: (row: unknown) =>
    ((row as Record<string, unknown>)['symbol'] as string) || '',

  getFilterValue: (row: unknown) => {
    const trade = row as Record<string, unknown>;
    const symbol = (trade['symbol'] as string) || '';
    const pair = (trade['pair'] as string) || '';

    // Extract base and quote assets from symbol using shared helper
    const { baseAsset, quoteAsset } = extractPairAssets(symbol);

    return [symbol, pair, baseAsset, quoteAsset, symbol.replace('/', '')].filter(
      Boolean
    );
  },
};
