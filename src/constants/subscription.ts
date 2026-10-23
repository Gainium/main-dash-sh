import { IS_CLOUD } from '@/config/mode';
import { ExchangeEnum } from '@/types/exchange.types';

// Exchanges that require a paid subscription. Cloud gates the listed
// providers behind paid plans; sh has no plan tiers (premium is the
// license-key add-on, gated separately via `useLicense`/`useEntitlements`)
// so every exchange is freely selectable — the array is empty there.
export const paidExchanges = IS_CLOUD
  ? [
      ExchangeEnum.binance,
      ExchangeEnum.binanceCoinm,
      ExchangeEnum.binanceUsdm,
      ExchangeEnum.binanceUS,
      ExchangeEnum.coinbase,
      ExchangeEnum.binanceAll,
      ExchangeEnum.binanceSpot,
      ExchangeEnum.okx,
      ExchangeEnum.okxAll,
      ExchangeEnum.okxInverse,
      ExchangeEnum.okxLinear,
      ExchangeEnum.okxSpot,
      ExchangeEnum.bybit,
      ExchangeEnum.bybitAll,
      ExchangeEnum.bybitSpot,
      ExchangeEnum.bybitCoinm,
      ExchangeEnum.bybitUsdm,
    ]
  : [];

// Subscription plans that are considered "paid" (not free)
// Must match backend's NewSubscriptionName enum values (lowercase)
export const paidPlans = [
  'advanced',
  'basic',
  'pro',
  'enterprise',
  'edge',
  'elite',
  'legend',
  'master',
  'mini',
  'prime',
  'vip1',
  'vip2',
  'vip3',
  'vip4',
  'trial',
];

export const freePairs = 50;
export const paidPairs = 500;
