import type { AssetClass } from '@/hooks/useTradingPairs';

/** Canonical order + labels for the asset-class filter chips. */
export const ASSET_CLASS_ORDER: AssetClass[] = [
  'crypto',
  'stock',
  'etf',
  'commodity',
  'metal',
  'forex',
  'index',
];
export const ASSET_CLASS_LABELS: Record<AssetClass | 'all', string> = {
  all: 'All',
  crypto: 'Crypto',
  stock: 'Stocks',
  etf: 'ETFs',
  commodity: 'Commodities',
  metal: 'Metals',
  forex: 'Forex',
  index: 'Indices',
};

