import type { Currency } from '@/utils/currencyUtils';
import { math } from '@/utils/math';
import {
  getReportingCurrency,
  holdingToReporting,
  usdToReporting,
} from '@/utils/reportingCurrency';

/**
 * A bot/deal profit as the USD amount the USD-taking formatters should be
 * given. Profit carries its own figure (`total`, in `asset`) and a USD twin
 * (`totalUsd`); when `asset` already is the reporting currency (a EUR-quoted
 * bot while reporting in EUR) the own figure is what must be shown, so return
 * the USD amount that converts back to exactly it. Otherwise the USD twin.
 */
export const profitUsdForReporting = (
  asset: string | null | undefined,
  total: number,
  totalUsd: number,
  currency: Currency = getReportingCurrency()
): number =>
  currency.rate > 0
    ? holdingToReporting(asset, total, totalUsd, currency) / currency.rate
    : totalUsd;

/** `math.friendly` of a USD value in the reporting currency, e.g. `-€1.2K`. */
export const friendlyUsd = (
  usd: number,
  round = false,
  currency: Currency = getReportingCurrency()
): string => {
  const v = usdToReporting(usd || 0, currency);
  const abs = round ? math.round(Math.abs(v)) : Math.abs(v);
  return `${v < 0 ? '-' : ''}${currency.symbol}${math.friendly(abs)}`;
};

/** `profitUsdForReporting` for a raw DCA/Combo bot (or hedge leg). */
export const dcaBotProfitUsdForReporting = (bot: {
  profit?: { total?: number; totalUsd?: number } | null;
  settings?: { profitCurrency?: string | null; coinm?: boolean | null } | null;
  symbol?: { value?: { baseAsset?: string; quoteAsset?: string } }[] | null;
}): number => {
  const pair = bot.symbol?.[0]?.value;
  const asset =
    bot.settings?.profitCurrency === 'base' || bot.settings?.coinm
      ? pair?.baseAsset
      : pair?.quoteAsset;
  return profitUsdForReporting(
    asset,
    bot.profit?.total ?? 0,
    bot.profit?.totalUsd ?? 0
  );
};

/**
 * `profitUsdForReporting` for a deal. A deal does not say which asset its
 * `profit.total` is in, so the owning bot's profit currency must be passed;
 * without it the USD twin is used.
 */
export const dealProfitUsdForReporting = (
  deal: {
    profit?: { total?: number; totalUsd?: number } | null;
    symbol?: { baseAsset?: string; quoteAsset?: string } | null;
  },
  profitCurrency: string | null | undefined,
  coinm?: boolean | null
): number => {
  const totalUsd = deal.profit?.totalUsd ?? 0;
  if (!profitCurrency) return totalUsd;
  const asset =
    profitCurrency === 'base' || coinm
      ? deal.symbol?.baseAsset
      : deal.symbol?.quoteAsset;
  return profitUsdForReporting(asset, deal.profit?.total ?? 0, totalUsd);
};
