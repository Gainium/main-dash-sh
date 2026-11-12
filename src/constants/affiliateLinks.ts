import { ExchangeEnum } from '@/types/exchange.types';

/**
 * Gainium's sign-up (affiliate) link per exchange, keyed by the exchange
 * config `name` (one entry covers every market of that venue). Shown to users
 * who are connecting an exchange they have no account on yet.
 */
const exchangeAffiliateLinks: Record<string, { label: string; url: string }> = {
  binance: {
    label: 'Binance',
    url: 'https://www.binance.com/register?ref=GAINIUM',
  },
  bitget: { label: 'Bitget', url: 'https://partner.bitget.com/bg/gainium' },
  bybit: { label: 'Bybit', url: 'https://partner.bybit.com/b/GAINIUM' },
  hyperliquid: {
    label: 'Hyperliquid',
    url: 'https://app.hyperliquid.xyz/join/GAINIUM',
  },
  kraken: { label: 'Kraken', url: 'https://kraken.pxf.io/gainium' },
  kucoin: { label: 'KuCoin', url: 'https://www.kucoin.com/r/af/GAINIUM' },
  okx: { label: 'OKX', url: 'https://okx.ac/join/GAINIUM' },
};

/** Binance.US shares the `binance` name but is a separate venue with no link. */
const noAffiliateLink = new Set<string>([ExchangeEnum.binanceUS]);

export const getExchangeSignup = (provider?: string, name?: string) =>
  provider && name && !noAffiliateLink.has(provider)
    ? exchangeAffiliateLinks[name]
    : undefined;
