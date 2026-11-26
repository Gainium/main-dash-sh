import { Button } from "@/components/ui/button";
import { useDialogPresentation } from "@/components/ui/dialog-presentation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuickValueButtons } from "@/components/ui/quick-value-buttons";
import { unitAdornment } from "@/features/bots/shared/utils/unit-adornment";
import { Crosshair } from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";
import { useChartPricePicker } from "./chartPricePicker";
import type { LimitPriceInput } from "./useLimitPriceInput";

/** Quick limit prices, as % from the market price (like the bot form's). */
const LIMIT_PRICE_PERCENTS = [-1, -0.5, 0.5, 1];

const decimalsOf = (value: number): number =>
  (`${value}`.split(".")[1] ?? "").length;

/** Rounded to the market price's own decimals (the pair's price step). */
const priceAtPercent = (market: number, percent: number): string =>
  `${Number((market * (1 + percent / 100)).toFixed(decimalsOf(market)))}`;

/**
 * A price read off the chart, rounded to the market price's decimals (at least
 * two), or to 8 significant digits when there is no market price yet.
 */
const roundPicked = (price: number, market: number | null | undefined): string =>
  market
    ? `${Number(price.toFixed(Math.max(2, decimalsOf(market))))}`
    : `${Number(price.toPrecision(8))}`;

interface LimitPriceFieldProps {
  id: string;
  input: LimitPriceInput;
  marketPrice: number | null | undefined;
  quoteAsset?: string | undefined;
  disabled?: boolean;
  /** Label of the draft line drawn on a chart beside the field. */
  chartLabel?: string;
  /** Side of the order, which colours the draft line. */
  chartSide?: "buy" | "sell";
}

/** Price box with Market / ±% quick buttons, shared by the manual-order dialogs. */
export const LimitPriceField: React.FC<LimitPriceFieldProps> = ({
  id,
  input,
  marketPrice,
  quoteAsset,
  disabled,
  chartLabel = "Limit price",
  chartSide = "buy",
}) => {
  // A chart is only reachable while the form is drawn inline beside it; a
  // modal covers the chart, so a pick button there would lead nowhere.
  const picker = useChartPricePicker();
  const presentation = useDialogPresentation();
  const canPick = !!picker && presentation === "inline";
  const picking = canPick && picker?.activeField === id;

  const lastPick = picker?.lastPick;
  const seenPick = useRef(lastPick?.seq ?? 0);
  const setLimitPrice = input.setLimitPrice;
  useEffect(() => {
    if (!lastPick || lastPick.seq === seenPick.current) return;
    seenPick.current = lastPick.seq;
    if (lastPick.field === id) {
      setLimitPrice(roundPicked(lastPick.price, marketPrice));
    }
  }, [lastPick, id, marketPrice, setLimitPrice]);

  // The chosen price as a draft line; none while it just follows the market.
  const setDraft = picker?.setDraft;
  const draftPrice = canPick && !input.following ? input.value : undefined;
  useEffect(() => {
    if (!setDraft) return;
    setDraft(
      id,
      draftPrice ? { price: draftPrice, label: chartLabel, side: chartSide } : null,
    );
  }, [setDraft, id, draftPrice, chartLabel, chartSide]);
  useEffect(
    () => () => {
      setDraft?.(id, null);
      if (picker?.activeField === id) picker.cancel();
    },
    // Unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
      <div className="flex flex-wrap items-center gap-xs">
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
          endAdornment={
            quoteAsset || canPick ? (
              // The same unit + crosshair the bot form's price fields carry.
              <span className="inline-flex items-center gap-2">
                {quoteAsset && unitAdornment(quoteAsset)}
                {canPick && picker && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => (picking ? picker.cancel() : picker.start(id))}
                    className={
                      picking ? "bg-primary/10 text-primary h-6 w-6" : "h-6 w-6"
                    }
                    aria-label="Pick price from chart"
                    aria-pressed={picking}
                    title="Pick price from chart"
                  >
                    <Crosshair className="h-4 w-4" />
                  </Button>
                )}
              </span>
            ) : undefined
          }
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
