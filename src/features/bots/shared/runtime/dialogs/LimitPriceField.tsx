import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuickValueButtons } from "@/components/ui/quick-value-buttons";
import React, { useMemo } from "react";
import type { LimitPriceInput } from "./useLimitPriceInput";

/** Quick limit prices, as % from the market price (like the bot form's). */
const LIMIT_PRICE_PERCENTS = [-1, -0.5, 0.5, 1];

/** Rounded to the market price's own decimals (the pair's price step). */
const priceAtPercent = (market: number, percent: number): string => {
  const decimals = (`${market}`.split(".")[1] ?? "").length;
  return `${Number((market * (1 + percent / 100)).toFixed(decimals))}`;
};

interface LimitPriceFieldProps {
  id: string;
  input: LimitPriceInput;
  marketPrice: number | null | undefined;
  quoteAsset?: string | undefined;
  disabled?: boolean;
}

/** Price box with Market / ±% quick buttons, shared by the manual-order dialogs. */
export const LimitPriceField: React.FC<LimitPriceFieldProps> = ({
  id,
  input,
  marketPrice,
  quoteAsset,
  disabled,
}) => {
  const presets = useMemo(
    () =>
      marketPrice
        ? [
            { value: "market", label: "Market", price: `${marketPrice}` },
            ...LIMIT_PRICE_PERCENTS.map((percent) => ({
              value: `${percent}`,
              label: `${percent > 0 ? "+" : ""}${percent}%`,
              price: priceAtPercent(marketPrice, percent),
            })),
          ]
        : [],
    [marketPrice],
  );
  // "Market" is active while the price follows the market (untouched).
  const active = input.following
    ? "market"
    : (presets.find(
        (p) => p.value !== "market" && +p.price === Number(input.limitPrice),
      )?.value ?? "");

  return (
    <div className="space-y-xs">
      <Label htmlFor={id}>Limit price</Label>
      <div className="flex items-center gap-xs">
        <Input
          id={id}
          className="min-w-[110px] flex-1"
          value={input.limitPrice}
          onChange={(event) => input.setLimitPrice(event.target.value ?? "")}
          placeholder={
            quoteAsset ? `Current price (${quoteAsset})` : "Current price"
          }
          inputMode="decimal"
          disabled={disabled}
          aria-invalid={input.invalid || undefined}
        />
        {presets.length > 0 && (
          <QuickValueButtons
            layout="row"
            aria-label="Limit price presets"
            value={active}
            onValueChange={(next) => {
              if (next === "market") {
                input.followMarket();
                return;
              }
              const preset = presets.find((p) => p.value === next);
              if (preset) {
                input.setLimitPrice(preset.price);
              }
            }}
            options={presets.map(({ value, label }) => ({ value, label }))}
          />
        )}
      </div>
      {input.invalid && (
        <p className="text-xs text-destructive">Enter a price above 0.</p>
      )}
    </div>
  );
};

export default LimitPriceField;
