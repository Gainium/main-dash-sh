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
import SettingsAlert from '@/components/ui/SettingsAlert';
import { cn } from '@/lib/utils';
import { CloseDCATypeEnum } from '@/types';
import { AlertTriangle, CircleDollarSign } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

export interface CloseDealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (closeType: CloseDCATypeEnum) => void;
  isProcessing?: boolean;
  defaultCloseType?: CloseDCATypeEnum;
  dealLabel?: string;
  unrealizedPnl?: string;
  allowedTypes?: CloseDCATypeEnum[];
}

type CloseDealOption = {
  value: CloseDCATypeEnum;
  title: string;
  description: string;
};

const CLOSE_DEAL_OPTIONS: CloseDealOption[] = [
  {
    value: CloseDCATypeEnum.closeByMarket,
    title: 'Close by MARKET',
    description:
      'Exit the deal immediately using market orders. May incur slippage in fast markets.',
  },
  {
    value: CloseDCATypeEnum.closeByLimit,
    title: 'Close by LIMIT',
    description:
      'Submit limit orders at the configured target price. Fill depends on liquidity and price reach.',
  },
  {
    value: CloseDCATypeEnum.cancel,
    title: 'Cancel pending orders',
    description:
      'Cancel outstanding orders and leave the current position open until conditions are met.',
  },
  {
    value: CloseDCATypeEnum.leave,
    title: 'Leave deal unchanged',
    description:
      'Keep the deal running while disabling additional automation changes.',
  },
];

export const CloseDealDialog: React.FC<CloseDealDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  isProcessing = false,
  defaultCloseType = CloseDCATypeEnum.closeByMarket,
  dealLabel,
  unrealizedPnl,
  allowedTypes,
}) => {
  const [selected, setSelected] = useState<CloseDCATypeEnum>(defaultCloseType);

  useEffect(() => {
    if (open) {
      setSelected(defaultCloseType);
    }
  }, [open, defaultCloseType]);

  const filteredOptions = useMemo(() => {
    if (!allowedTypes || allowedTypes.length === 0) {
      return CLOSE_DEAL_OPTIONS;
    }

    const whitelist = new Set(allowedTypes);
    return CLOSE_DEAL_OPTIONS.filter((option) => whitelist.has(option.value));
  }, [allowedTypes]);

  const handleConfirm = () => {
    if (isProcessing) {
      return;
    }

    onConfirm(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Close active deal
          </DialogTitle>
          <DialogDescription className="sr-only text-sm text-muted-foreground">
            Select how the system should exit the active position. Review order
            queues prior to confirmation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          {(dealLabel || unrealizedPnl) && (
            <Alert className="border-border/50 bg-muted/15">
              <AlertDescription className="text-xs sm:text-sm flex flex-col gap-1">
                {dealLabel ? <span>Deal: {dealLabel}</span> : null}
                {unrealizedPnl ? (
                  <span className="inline-flex items-center gap-1">
                    <CircleDollarSign className="h-3.5 w-3.5" />
                    Unrealized PnL: {unrealizedPnl}
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-sm">
            {filteredOptions.map((option) => {
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

          <SettingsAlert
            variant="warning"
            title="Market close executes immediately"
            description="Market closes execute immediately and can crystallize unrealized losses. Verify size and slippage tolerance before proceeding."
          />
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
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Closing…' : 'Confirm close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseDealDialog;
