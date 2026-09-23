import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CloseDCATypeEnum } from '@/types';
import { PauseOctagon, ShieldAlert } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

export type CloseTypeOption = CloseDCATypeEnum;

type CloseOptionItem = {
  value: CloseTypeOption;
  title: string;
  dealTitle?: string;
  description: string;
  dealDescription?: string;
  /** Deal mode, several deals selected. Falls back to `dealDescription`. */
  dealsDescription?: string;
};

const CLOSE_TYPE_OPTIONS: CloseOptionItem[] = [
  {
    value: CloseDCATypeEnum.leave,
    title: 'Leave positions open',
    description:
      'Stop opening new deals and leave current orders/deals untouched.',
    dealDescription:
      'Keep the deal running while disabling additional automation changes.',
  },
  {
    value: CloseDCATypeEnum.cancel,
    title: 'Cancel bot',
    dealTitle: 'Cancel deal',
    description:
      "The position will remain open on your exchange but will be removed from Gainium. You'll need to manage it manually on your exchange if necessary.",
    dealDescription:
      "The position will remain open on your exchange but will be removed from Gainium. You'll need to manage it manually on your exchange if necessary.",
    dealsDescription:
      "The positions will remain open on your exchange but will be removed from Gainium. You'll need to manage them manually on your exchange if necessary.",
  },
  {
    value: CloseDCATypeEnum.closeByMarket,
    title: 'Close at market price',
    description:
      'Close all active positions immediately using market orders. May incur slippage and taker fees.',
    dealDescription:
      'Close this deal immediately using market orders. May incur slippage and taker fees.',
    dealsDescription:
      'Close these deals immediately using market orders. May incur slippage and taker fees.',
  },
  {
    value: CloseDCATypeEnum.closeByLimit,
    title: 'Close with limit orders',
    description:
      'Place a limit order near the current price to avoid slippage and market order fees. The order will be repositioned if needed but may take longer to close.',
    dealDescription:
      'Place a limit order near the current price to avoid slippage and market order fees. The order will be repositioned if needed but may take longer to close.',
  },
];

export interface CloseOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (closeType: CloseTypeOption) => void;
  isProcessing?: boolean;
  defaultCloseType?: CloseTypeOption;
  ignoreOptions?: CloseDCATypeEnum[];
  mode?: 'deal' | 'bot';
  /** Deal mode: number of deals being closed (bulk). Defaults to 1. */
  count?: number;
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
}) => {
  const isBulkDeals = mode === 'deal' && count > 1;
  const [selected, setSelected] = useState<CloseTypeOption>(defaultCloseType);

  useEffect(() => {
    if (open) {
      setSelected(defaultCloseType);
    }
  }, [open, defaultCloseType]);

  const handleConfirm = () => {
    if (isProcessing) {
      return;
    }

    onConfirm(selected);
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
          : 'Close deal options',
    [mode, isBulkDeals, count]
  );

  const isDeal = useMemo(() => mode === 'deal', [mode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <PauseOctagon className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          {!isDeal && (
            <DialogDescription className="text-sm text-muted-foreground">
              Choose how the bot should handle open orders and positions before
              stopping.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-md">
          <Alert className="border-destructive/40 bg-destructive/10">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription className="text-xs sm:text-sm">
              Positions may be closed at a loss depending on market conditions.
              Make sure the chosen option matches your risk tolerance.
            </AlertDescription>
          </Alert>

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
                >
                  <div className="font-medium text-sm sm:text-base text-card-foreground">
                    {isDeal && option.dealTitle
                      ? isBulkDeals
                        ? `${option.dealTitle}s`
                        : option.dealTitle
                      : option.title}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {isDeal && option.dealDescription
                      ? (isBulkDeals && option.dealsDescription) ||
                        option.dealDescription
                      : option.description}
                  </p>
                </button>
              );
            })}
          </div>
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
            disabled={isProcessing}
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
