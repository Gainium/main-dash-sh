import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useTrackedBotFormState,
} from '@/contexts/bots/form/BotFormProvider';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { cn } from '@/lib/utils';
import { CloseGRIDTypeEnum, CloseTypeEnum, StrategyEnum } from '@/types';
import type { GridBot } from '@/types/gridBot';
import { PauseOctagon } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';

export interface GridStopBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    cancelPartiallyFilled?: boolean,
    closeType?: CloseGRIDTypeEnum
  ) => void;
  isProcessing?: boolean;
}

export const GridStopBotDialog: React.FC<GridStopBotDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  isProcessing = false,
}) => {
  const [selectedIndexClose, setSelectedIndexClose] = useState<CloseTypeEnum>(
    CloseTypeEnum.cancelAll
  );

  const { formData } = useTrackedBotFormState();

  const settings = useMemo(() => formData.grid, [formData.grid]);
  const { bot } = useBotFormQuery();

  const isShort = useMemo(
    () => settings.strategy === StrategyEnum.short,
    [settings.strategy]
  );

  const oppositeAction = useMemo(() => (!isShort ? 'Sell' : 'Buy'), [isShort]);

  const closeOptions = useMemo(() => {
    const _options: { [x: string]: string } = {
      [CloseTypeEnum.cancelAll]: 'Cancel all orders',
    };
    if (
      !settings.futures ||
      (settings.futures && (bot as GridBot)?.position?.price !== 0)
    ) {
      _options[CloseTypeEnum.cancelAndSellByLimit] = settings.futures
        ? 'Cancel and close position by LIMIT order'
        : `Cancel and ${oppositeAction.toLowerCase()} base by LIMIT order`;
      _options[CloseTypeEnum.cancelAndSellByMarket] = settings.futures
        ? 'Cancel and close position by MARKET order'
        : `Cancel and ${oppositeAction.toLowerCase()} base by MARKET order`;
    }
    _options[CloseTypeEnum.cancelExceptPartiallyFilled] =
      'Cancel except partially filled';

    return _options;
  }, [bot, settings.futures, oppositeAction]);

  const handleConfirm = useCallback(() => {
    onConfirm(
      selectedIndexClose === CloseTypeEnum.cancelAll,
      [
        CloseTypeEnum.cancelAll,
        CloseTypeEnum.cancelExceptPartiallyFilled,
      ].includes(selectedIndexClose)
        ? CloseGRIDTypeEnum.cancel
        : selectedIndexClose === CloseTypeEnum.cancelAndSellByLimit
          ? CloseGRIDTypeEnum.closeByLimit
          : CloseGRIDTypeEnum.closeByMarket
    );
  }, [selectedIndexClose, onConfirm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <PauseOctagon className="h-5 w-5 text-destructive" />
            Stop bot options
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            How do you want to stop the bot?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          <div className="space-y-sm">
            {Object.entries(closeOptions).map(([key, option]) => {
              const isSelected = selectedIndexClose === key;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedIndexClose(key as CloseTypeEnum)}
                  className={cn(
                    'w-full text-left rounded-xl border border-border/60 bg-muted/5 p-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary/50',
                    isSelected
                      ? 'ring-2 ring-primary/80 bg-primary/5 border-primary/50 shadow-lg'
                      : 'hover:bg-muted/20'
                  )}
                  disabled={isProcessing}
                >
                  <div className="font-medium text-sm sm:text-base text-card-foreground">
                    {option}
                  </div>
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
            {isProcessing ? 'Stopping…' : 'Stop bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GridStopBotDialog;
