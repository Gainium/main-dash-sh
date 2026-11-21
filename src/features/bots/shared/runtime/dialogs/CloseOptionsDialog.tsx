import { Button } from '@/components/ui/button';
import { QuickValueButtons } from '@/components/ui/quick-value-buttons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsAlert from '@/components/ui/SettingsAlert';
import { useMarketPrice } from '@/features/bots/shared/runtime/dialogs/AdjustFundsDialog';
import { OrderExecutionSettings } from '@/features/bots/shared/components/OrderExecutionSettings';
import { cn } from '@/lib/utils';
import { CloseDCATypeEnum } from '@/types';
import {
  EXECUTION_MODE_DEFAULTS,
  type OrderExecution,
} from '@/types/orderExecution';
import { PauseOctagon } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

export type CloseTypeOption = CloseDCATypeEnum;

type CloseOptionItem = {
  value: CloseTypeOption;
  title: string;
  description: string;
};

const CLOSE_TYPE_OPTIONS: CloseOptionItem[] = [
  {
    value: CloseDCATypeEnum.leave,
    title: 'Leave positions open',
    description:
      'Stop opening new deals and leave current orders/deals untouched.',
  },
  {
    value: CloseDCATypeEnum.cancel,
    title: 'Cancel bot',
    description:
      "The position will remain open on your exchange but will be removed from Gainium. You'll need to manage it manually on your exchange if necessary.",
  },
  {
    value: CloseDCATypeEnum.closeByMarket,
    title: 'Close at market price',
    description:
      'Close all active positions immediately using market orders. May incur slippage and taker fees.',
  },
  {
    value: CloseDCATypeEnum.closeByLimit,
    title: 'Close with limit orders',
    description:
      'Place a limit order near the current price to avoid slippage and market order fees. The order will be repositioned if needed but may take longer to close.',
  },
];

/**
 * Deal mode (spec 249) closes the position, and only that: the dialog is the
 * execution block (market, limit, chasing limit or split, with its timeout).
 * Cancelling a deal is its own menu action with its own confirmation.
 */

/** Quick limit prices, as % from the market price (like the bot form's). */
const LIMIT_PRICE_PERCENTS = [-1, -0.5, 0.5, 1];

/** Rounded to the market price's own decimals (the pair's price step). */
const priceAtPercent = (market: number, percent: number): string => {
  const decimals = (`${market}`.split('.')[1] ?? '').length;
  return `${Number((market * (1 + percent / 100)).toFixed(decimals))}`;
};

export interface CloseOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deal mode passes the chosen execution with a close. */
  onConfirm: (
    closeType: CloseTypeOption,
    execution?: OrderExecution,
    limitPrice?: number
  ) => void;
  isProcessing?: boolean;
  defaultCloseType?: CloseTypeOption;
  ignoreOptions?: CloseDCATypeEnum[];
  mode?: 'deal' | 'bot';
  /** Deal mode: number of deals being closed (bulk). Defaults to 1. */
  count?: number;
  /** Deal mode: the execution the close starts from. */
  defaultExecution?: OrderExecution;
  /** Deal mode: a combo deal (market or chasing limit only). */
  isCombo?: boolean;
  /** Deal mode, one deal: the pair, for the limit price box. */
  symbol?: string;
  exchange?: string;
  quoteAsset?: string;
}

export const CloseOptionsDialog: React.FC<CloseOptionsDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  isProcessing = false,
  defaultCloseType = CloseDCATypeEnum.leave,
  ignoreOptions = [],
  mode = 'bot',
  count = 1,
  defaultExecution = EXECUTION_MODE_DEFAULTS.chase,
  isCombo = false,
  symbol,
  exchange,
  quoteAsset,
}) => {
  const isBulkDeals = mode === 'deal' && count > 1;
  const [selected, setSelected] = useState<CloseTypeOption>(defaultCloseType);
  const [execution, setExecution] = useState<OrderExecution>(defaultExecution);
  // The default arrives after the dialog opens (the bot's settings load);
  // it applies until the person changes the block themselves.
  const [executionTouched, setExecutionTouched] = useState(false);
  // Starts on the live market price — the price the close would be placed at
  // — and follows it until the person types or picks a preset.
  const [typedLimitPrice, setTypedLimitPrice] = useState('');
  const [limitPriceTouched, setLimitPriceTouched] = useState(false);
  const marketPrice = useMarketPrice(
    open && symbol ? symbol : undefined,
    exchange
  );
  const limitPrice = limitPriceTouched
    ? typedLimitPrice
    : marketPrice
      ? `${marketPrice}`
      : '';
  const setLimitPrice = (next: string) => {
    setTypedLimitPrice(next);
    setLimitPriceTouched(true);
  };

  useEffect(() => {
    if (open) {
      setSelected(defaultCloseType);
      setExecutionTouched(false);
      setTypedLimitPrice('');
      setLimitPriceTouched(false);
    }
  }, [open, defaultCloseType]);

  useEffect(() => {
    if (open && !executionTouched) {
      setExecution(defaultExecution);
    }
  }, [open, executionTouched, defaultExecution]);

  const isDeal = mode === 'deal';
  const isClosePosition = isDeal;
  // One price only means something for one pair; combo has no fixed limit.
  const showLimitPrice =
    isClosePosition && execution.mode === 'limit' && !isBulkDeals && !isCombo;
  const limitPriceValue = Number(limitPrice);
  const chosenLimitPrice =
    showLimitPrice && limitPrice.trim() !== '' && limitPriceValue > 0
      ? limitPriceValue
      : undefined;
  const limitPriceInvalid =
    showLimitPrice && limitPrice.trim() !== '' && !(limitPriceValue > 0);
  const limitPricePresets = useMemo(
    () =>
      marketPrice
        ? [
            { value: 'market', label: 'Market', price: `${marketPrice}` },
            ...LIMIT_PRICE_PERCENTS.map((percent) => ({
              value: `${percent}`,
              label: `${percent > 0 ? '+' : ''}${percent}%`,
              price: priceAtPercent(marketPrice, percent),
            })),
          ]
        : [],
    [marketPrice]
  );
  // "Market" is active while the price follows the market (untouched).
  const activeLimitPricePreset = !limitPriceTouched
    ? 'market'
    : (limitPricePresets.find(
        (p) => p.value !== 'market' && +p.price === limitPriceValue
      )?.value ?? '');

  const handleConfirm = () => {
    if (isProcessing) {
      return;
    }

    onConfirm(
      isDeal ? CloseDCATypeEnum.closeByMarket : selected,
      isClosePosition ? execution : undefined,
      chosenLimitPrice
    );
  };

  const options = useMemo(
    () =>
      CLOSE_TYPE_OPTIONS.filter(
        (option) => !ignoreOptions.includes(option.value)
      ),
    [ignoreOptions]
  );

  const title = useMemo(
    () =>
      mode === 'bot'
        ? 'Stop bot & close positions'
        : isBulkDeals
          ? `Close ${count} deals`
          : 'Close deal',
    [mode, isBulkDeals, count]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <PauseOctagon className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          {!isDeal && (
            <DialogDescription className="sr-only text-sm text-muted-foreground">
              Choose how the bot should handle open orders and positions before
              stopping.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-md">
          <SettingsAlert
            variant="warning"
            title="Positions may close at a loss"
            description="Positions may be closed at a loss depending on market conditions. Make sure the chosen option matches your risk tolerance."
          />

          {!isDeal && (
            <div className="space-y-sm">
              {options.map((option) => {
                const isSelected = selected === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelected(option.value)}
                    className={cn(
                      'w-full text-left rounded-xl border border-border/60 bg-muted/5 p-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary/50',
                      isSelected
                        ? 'ring-2 ring-primary/80 bg-primary/5 border-primary/50 shadow-lg'
                        : 'hover:bg-muted/20'
                    )}
                    disabled={isProcessing}
                    title={option.description}
                  >
                    <div className="font-medium text-sm sm:text-base text-card-foreground">
                      {option.title}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {isClosePosition && (
            <div
              className="rounded-xl border border-border/60 p-md"
              data-testid="close-execution"
            >
              <div className="mb-sm text-sm font-medium text-card-foreground">
                How to close
              </div>
              <OrderExecutionSettings
                bare
                stage="close"
                trigger="manual"
                modeContext={{ isCombo }}
                value={execution}
                onChange={(next) => {
                  setExecutionTouched(true);
                  setExecution(next);
                }}
                disabled={isProcessing}
                limitPrice={chosenLimitPrice}
                beforeFields={
                  showLimitPrice ? (
                    <div className="space-y-xs">
                      <Label htmlFor="close-deal-limit-price">
                        Limit price
                      </Label>
                      <div className="flex items-center gap-xs">
                        <Input
                          id="close-deal-limit-price"
                          className="min-w-[110px] flex-1"
                          value={limitPrice}
                          onChange={(event) =>
                            setLimitPrice(event.target.value ?? '')
                          }
                          placeholder={
                            quoteAsset
                              ? `Current price (${quoteAsset})`
                              : 'Current price'
                          }
                          inputMode="decimal"
                          disabled={isProcessing}
                          aria-invalid={limitPriceInvalid || undefined}
                        />
                        {limitPricePresets.length > 0 && (
                          <QuickValueButtons
                            layout="row"
                            aria-label="Limit price presets"
                            value={activeLimitPricePreset}
                            onValueChange={(next) => {
                              if (next === 'market') {
                                // Back to following the live market price.
                                setLimitPriceTouched(false);
                                return;
                              }
                              const preset = limitPricePresets.find(
                                (p) => p.value === next
                              );
                              if (preset) {
                                setLimitPrice(preset.price);
                              }
                            }}
                            options={limitPricePresets.map(
                              ({ value, label }) => ({
                                value,
                                label,
                              })
                            )}
                          />
                        )}
                      </div>
                      {limitPriceInvalid && (
                        <p className="text-xs text-destructive">
                          Enter a price above 0.
                        </p>
                      )}
                    </div>
                  ) : undefined
                }
              />
            </div>
          )}
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
            variant="destructive"
            onClick={handleConfirm}
            disabled={isProcessing || limitPriceInvalid}
            className="w-full sm:w-auto"
          >
            {isProcessing
              ? isDeal
                ? 'Closing…'
                : 'Stopping…'
              : isDeal
                ? isBulkDeals
                  ? `Close ${count} deals`
                  : 'Close deal'
                : 'Stop bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseOptionsDialog;
