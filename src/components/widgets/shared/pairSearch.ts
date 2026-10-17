import { normalizePairKey } from '../../../utils/pairs';
import type { ListItem } from './ListModal';

/**
 * Searchable text of one item. The separator-stripped forms matter: a pair is
 * displayed as `ETH/BTC` and identified as `ETH-BTC`, but users type — and the
 * bot form STORES — the concatenated `ETHBTC`, which matches neither. Before
 * this, searching `BTCUSDT` on a venue with dated futures returned the eight
 * `BTCUSDT-<expiry>` contracts (whose native symbol contains that literal
 * string) and hid the actual BTCUSDT perpetual.
 */
export const searchableTextFor = (item: ListItem): string =>
  [
    item.name,
    item.symbol,
    normalizePairKey(item.name),
    normalizePairKey(item.symbol),
    item.subtitle || '',
    // The company name shown under a stock's ticker (`Apple Inc.` for RAAPL),
    // so a stock can be found by its name, not only its ticker.
    item.baseDisplayName || '',
  ]
    .join(' ')
    .toLowerCase();

/** A query split into words, each with its separator-stripped form. */
export const pairSearchWordForms = (query: string): [string, string][] =>
  query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => [word, normalizePairKey(word).toLowerCase()]);

/**
 * All search words must appear somewhere in the combined text. Each word is
 * also tried separator-stripped, so `eth/btc`, `eth-btc` and `ethbtc` are
 * interchangeable in the query as well as in the haystack.
 */
export const matchesPairSearch = (
  searchableText: string,
  wordForms: [string, string][]
): boolean =>
  wordForms.every(
    ([word, stripped]) =>
      searchableText.includes(word) || searchableText.includes(stripped)
  );
