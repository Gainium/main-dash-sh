import { useEffect, useState } from "react";

export interface LimitPriceInput {
  /** The price shown and sent: the live market price until the person types or picks a preset. */
  limitPrice: string;
  /** True while the price follows the market (nothing typed or picked). */
  following: boolean;
  setLimitPrice: (next: string) => void;
  followMarket: () => void;
  /** A valid price above 0, or undefined. */
  value: number | undefined;
  /** Something typed that is not a price above 0. */
  invalid: boolean;
}

/**
 * The limit price of a manual order (close deal, add / reduce funds). Starts
 * on the live market price and follows it until the person types a price or
 * picks a preset; the "Market" preset goes back to following. Reset on open.
 */
export const useLimitPriceInput = (
  open: boolean,
  marketPrice: number | null | undefined,
  initial = "",
): LimitPriceInput => {
  const [typed, setTyped] = useState(initial);
  const [touched, setTouched] = useState(!!initial);

  useEffect(() => {
    if (open) {
      setTyped(initial);
      setTouched(!!initial);
    }
  }, [open, initial]);

  const limitPrice = touched ? typed : marketPrice ? `${marketPrice}` : "";
  const parsed = Number(limitPrice);
  const valid = limitPrice.trim() !== "" && parsed > 0;
  return {
    limitPrice,
    following: !touched,
    setLimitPrice: (next) => {
      setTyped(next);
      setTouched(true);
    },
    followMarket: () => setTouched(false),
    value: valid ? parsed : undefined,
    invalid: limitPrice.trim() !== "" && !valid,
  };
};
