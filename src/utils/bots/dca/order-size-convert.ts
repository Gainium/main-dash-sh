import { OrderSizeTypeEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

type OrderSizeType = BotFormData['dca']['orderSizeType'];

const isBase = (t: OrderSizeType | undefined) => t === OrderSizeTypeEnum.base;
const isQuoteLike = (t: OrderSizeType | undefined) =>
  t === OrderSizeTypeEnum.quote || t === OrderSizeTypeEnum.usd;

/**
 * Re-express the order sizes of a DCA leg when its `orderSizeType` changes
 * between quote/usd and base (e.g. a spot leg flipped to short).
 *
 * The number in `baseOrderSize` / `orderSize` only means something together
 * with its unit. Flipping the unit and keeping the number turned "10 USDT"
 * into "10 BTC" — a default 60 USDT ladder became a 60 BTC one, which the bot
 * then refused to start for lack of funds. Each size is converted at
 * `latestPrice` instead (quote/usd -> base divides, base -> quote multiplies),
 * so the leg keeps the value the user chose. usd and quote are treated as the
 * same unit here, as the rest of the form does for stable-quoted pairs.
 *
 * Without a usable price the sizes cannot be converted, so they are zeroed
 * rather than carried over: an empty investment is visibly wrong and blocked
 * by the order-minimum guard; a mis-denominated one is not.
 *
 * Returns null when no conversion is needed (same unit, or a unit pair this
 * does not handle, such as the percentage types).
 */
export const convertOrderSizesForUnit = (
  sizes: { baseOrderSize?: string; orderSize?: string },
  from: OrderSizeType | undefined,
  to: OrderSizeType | undefined,
  latestPrice: number | undefined,
  decimals: number
): { baseOrderSize: string; orderSize: string } | null => {
  const toBase = isQuoteLike(from) && isBase(to);
  const toQuote = isBase(from) && isQuoteLike(to);
  if (!toBase && !toQuote) return null;

  const price = Number(latestPrice);
  const hasPrice = Number.isFinite(price) && price > 0;
  const convert = (raw: string | undefined): string => {
    const value = Number(raw ?? 0);
    if (!hasPrice || !Number.isFinite(value) || value <= 0) {
      return (0).toFixed(decimals);
    }
    const next = toBase ? value / price : value * price;
    const factor = Math.pow(10, decimals);
    return (Math.floor(next * factor) / factor).toFixed(decimals);
  };

  return {
    baseOrderSize: convert(sizes.baseOrderSize),
    orderSize: convert(sizes.orderSize),
  };
};
