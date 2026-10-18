import React from 'react';
import { Minus, Plus, SlidersHorizontal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumberInput } from '@/components/ui/number-input';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { useFundingPreview } from '@/hooks/useBaseFunding';
import type { PreviewFundingInput } from '@/lib/baseFunding/baseFundingApi';

export interface ChangeDcaLevelsDialogProps {
  /** Dialog visibility flag controlled by the parent */
  open: boolean;
  /** Update handler when dialog visibility changes */
  onOpenChange: (open: boolean) => void;
  /** Number of DCA levels already filled on the deal (`levels.complete - 1`) */
  currentLevel: number;
  /** Current max DCA levels configured for the deal (`levels.all - 1`) */
  maxLevel: number;
  /**
   * Invoked with the new max DCA levels. `0` turns DCA off; a positive value
   * updates the deal's `ordersCount` (mirrors legacy main-dash behavior).
   */
  onConfirm: (newMax: number) => void;
  /** Controls loading state while the confirm action is busy */
  isProcessing?: boolean;
  /**
   * A bot-funded short spot deal (main-app spec 044): the preview input for a
   * new max, or null when that max needs no funding preview.
   */
  fundingInputFor?: (newMax: number) => PreviewFundingInput | null;
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: n >= 1 ? 4 : 8 });

const FUNDING_TOOLTIP =
  'Estimated from the order size. The bot buys this at market when you save, before the new levels are placed. If your free quote cannot cover it, the change is refused and the deal is left as it was.';

/**
 * Adjust the maximum number of DCA safety orders on an open deal — the V2
 * equivalent of main-dash's "Change DCA levels" dialog. The value can never be
 * lowered below the levels already completed, and confirming is disabled until
 * it differs from the current max.
 */
export const ChangeDcaLevelsDialog: React.FC<ChangeDcaLevelsDialogProps> = ({
  open,
  onOpenChange,
  currentLevel,
  maxLevel,
  onConfirm,
  isProcessing = false,
  fundingInputFor,
}) => {
  const minValue = Math.max(0, currentLevel);
  const [value, setValue] = React.useState<number>(maxLevel);

  React.useEffect(() => {
    if (open) {
      setValue(maxLevel);
    }
  }, [open, maxLevel]);

  const error =
    value < minValue
      ? `DCA levels cannot be lower than the ${currentLevel} already completed.`
      : null;
  const unchanged = value === maxLevel;
  const fundingInput = React.useMemo(
    () =>
      fundingInputFor && value > maxLevel ? fundingInputFor(value) : null,
    [fundingInputFor, value, maxLevel]
  );
  const { preview } = useFundingPreview(fundingInput);

  const handleConfirm = () => {
    if (error || unchanged) {
      return;
    }
    onConfirm(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <SlidersHorizontal className="h-5 w-5" />
            Change DCA levels
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Adjust the maximum number of DCA safety orders for this deal. Set it
            to 0 to disable further DCA orders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          <div className="grid grid-cols-2 gap-sm text-sm">
            <div className="rounded-lg bg-muted/20 p-sm">
              <div className="text-xs text-muted-foreground">
                Current DCA level
              </div>
              <div className="text-lg font-medium">{currentLevel}</div>
            </div>
            <div className="rounded-lg bg-muted/20 p-sm">
              <div className="text-xs text-muted-foreground">Max levels</div>
              <div className="text-lg font-medium">{maxLevel}</div>
            </div>
          </div>

          <div className="space-y-xs">
            <Label htmlFor="change-dca-levels-value">New Max DCA levels</Label>
            <div className="flex items-center gap-sm">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Decrease"
                disabled={value <= minValue}
                onClick={() => setValue((v) => Math.max(minValue, v - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <NumberInput
                id="change-dca-levels-value"
                className="text-center"
                value={value}
                min={minValue}
                onChange={(next) =>
                  setValue(
                    typeof next === 'number' && Number.isFinite(next)
                      ? Math.max(minValue, Math.round(next))
                      : minValue
                  )
                }
                showControls={false}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Increase"
                onClick={() => setValue((v) => v + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {error ? (
              <div className="text-sm text-destructive">{error}</div>
            ) : null}
          </div>

          {preview?.kind === 'fund' && preview.buyQty > 0 ? (
            <div className="flex items-center justify-between gap-sm rounded-lg bg-muted/20 p-sm text-sm">
              <span className="flex items-center gap-xs text-muted-foreground">
                Bot buys at market
                <Tooltip tooltip={FUNDING_TOOLTIP}>
                  <InfoIcon />
                </Tooltip>
              </span>
              <span className="font-medium tabular-nums">
                ≈ {fmt(preview.buyQty)} {preview.baseAsset} ({fmt(preview.buyQuote)}{' '}
                {preview.quoteAsset})
              </span>
            </div>
          ) : null}
          {preview?.kind === 'refuse' ? (
            <div className="text-sm text-destructive">
              Not enough {preview.quoteAsset}: ≈ {fmt(preview.buyQuote)}{' '}
              needed, {fmt(Math.max(0, preview.freeQuote - preview.reservedQuote))}{' '}
              available
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing || !!error || unchanged}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Processing…' : 'Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
