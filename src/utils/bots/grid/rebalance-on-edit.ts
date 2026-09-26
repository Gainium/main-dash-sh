import { getLocalPrices } from '@/helper/price';
import type { Bot } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import {
  createGridBotOrders,
  defaultContext,
  getEstimateGridBalance,
} from '@/utils/bots/dca/example-orders-core';

/**
 * Whether saving these grid settings on a live bot changes the balances the
 * grid holds, so the user has to choose how to cover the difference (buy /
 * sell the difference, or proceed) before `changeBot` — the start dialog in
 * update mode. Port of legacy main-dash `gridbot/index.tsx` `changeBot`:
 * the grid's full order set is rebuilt from the edited settings and its
 * estimated base/quote compared with the bot's `currentBalances`, or smart
 * orders are being switched off.
 *
 * Returns false whenever it cannot tell (no pair metadata or price yet): the
 * save then goes through the normal path, as it did before this check.
 */
export const gridEditNeedsRebalance = (
  formData: BotFormData,
  bot: Bot
): boolean => {
  if (['archive', 'closed'].includes(`${bot.status ?? ''}`)) {
    return false;
  }
  const settings = formData.grid;
  if (bot.settings?.useOrderInAdvance && !settings.useOrderInAdvance) {
    return true;
  }

  const pair = [formData.pair].flat()[0];
  const metadata = pair ? formData.pairMetadata?.[pair] : undefined;
  if (!metadata) {
    return false;
  }
  // Same shape the start dialog builds from the pair metadata.
  const symbol = { ...metadata, maxOrders: 200 };
  const latestPrice = getLocalPrices()?.find(
    (p) =>
      p.symbol?.toUpperCase?.() === symbol.pair?.toUpperCase?.() &&
      (!p.exchange || p.exchange === symbol.exchange)
  )?.price;
  if (typeof latestPrice !== 'number' || !(latestPrice > 0)) {
    return false;
  }

  const startPrice =
    settings.useStartPrice &&
    settings.startPrice &&
    settings.startPrice !== '0'
      ? +settings.startPrice
      : latestPrice;
  const grids =
    createGridBotOrders(
      {
        all: true,
        nosplice: false,
        withoutErrorCheck: true,
        initialPrice:
          (bot as { initialPriceStart?: number }).initialPriceStart ??
          startPrice,
      },
      {
        ...defaultContext,
        gridSettings: settings,
        symbol,
        inputLatestPrice: latestPrice,
        userFee: formData.userFee?.makerCommission || 0,
      }
    ) || [];
  const needed = getEstimateGridBalance(
    grids,
    { ...settings, pair: symbol.pair, name: '' },
    symbol,
    undefined,
    true
  ) || { base: 0, quote: 0 };
  const current = (
    bot as { currentBalances?: { base?: number; quote?: number } }
  ).currentBalances;
  const currentBase = current?.base ?? 0;
  const currentQuote = current?.quote ?? 0;

  // Same test as legacy: a change on either side, and each side either moved
  // by more than the exchange minimum or is empty on both sides.
  const baseMoved =
    ((needed.base || currentBase) &&
      Math.abs(needed.base - currentBase) > symbol.baseAsset.minAmount) ||
    (!needed.base && !currentBase);
  const quoteMoved =
    ((needed.quote || currentQuote) &&
      Math.abs(needed.quote - currentQuote) > symbol.quoteAsset.minAmount) ||
    (!needed.quote && !currentQuote);
  return (
    (needed.base !== currentBase || needed.quote !== currentQuote) &&
    Boolean(baseMoved) &&
    Boolean(quoteMoved)
  );
};
