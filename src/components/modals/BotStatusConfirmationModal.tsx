import { Activity, Play, Square } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../ui/button';
import { StatusChip } from '../ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  BotTypesEnum,
  CloseGRIDTypeEnum,
  CloseTypeEnum,
  type BotStatus,
} from '@/types';
import { cn } from '@/lib/utils';

export interface BotStatusConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called on confirm. For DCA/combo bots the first arg is a
   * `CloseDCATypeEnum` value; for grid bots it is a `CloseGRIDTypeEnum`
   * value and `cancelPartiallyFilled` is also supplied (grid parity with
   * legacy — grid never "leaves" a position untouched).
   */
  onConfirm: (closeType?: string, cancelPartiallyFilled?: boolean) => void;
  botName: string;
  currentStatus: BotStatus;
  targetStatus: BotStatus;
  hasActiveDeals: boolean;
  isLoading?: boolean;
  /**
   * When set to `grid`, the stop step shows grid-specific close options
   * (cancel orders / cancel & close by LIMIT|MARKET / cancel except
   * partially filled) instead of the DCA deal options, mirroring V1.
   */
  botType?: BotTypesEnum;
  /** Grid only: futures contract (affects wording + position gating). */
  gridFutures?: boolean;
  /**
   * Grid + futures only: whether an open position exists. `undefined`
   * (unknown, e.g. list view without position data) is treated as "show
   * the close-position options" to match the legacy bot list.
   */
  gridHasOpenPosition?: boolean;
  /** Grid + spot only: short strategy flips the base action to "buy". */
  gridIsShort?: boolean;
}

export default function BotStatusConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  botName,
  currentStatus,
  targetStatus,
  hasActiveDeals,
  isLoading = false,
  botType,
  gridFutures = false,
  gridHasOpenPosition,
  gridIsShort = false,
}: BotStatusConfirmationModalProps) {
  const [closeType, setCloseType] = useState<string>('leave');
  const isGrid = botType === BotTypesEnum.grid;
  // Grid stop selection — defaults to "cancel all orders" (never a no-op).
  const [gridCloseType, setGridCloseType] = useState<CloseTypeEnum>(
    CloseTypeEnum.cancelAll
  );

  // Reset selections when modal opens/closes
  React.useEffect(() => {
    if (!open) {
      setCloseType('leave');
      setGridCloseType(CloseTypeEnum.cancelAll);
    }
  }, [open]);

  const isStarting = targetStatus === 'open';
  const isStopping = targetStatus === 'closed';

  // Grid close options mirror the legacy dialog: always offer "cancel all",
  // offer "cancel & close position" unless we know it's a futures bot with no
  // open position, and always offer "cancel except partially filled".
  const gridOppositeAction = gridIsShort ? 'buy' : 'sell';
  const gridCloseOptions = React.useMemo<Record<string, string>>(() => {
    const options: Record<string, string> = {
      [CloseTypeEnum.cancelAll]: 'Cancel all orders',
    };
    const hideCloseByOrders = gridFutures && gridHasOpenPosition === false;
    if (!hideCloseByOrders) {
      options[CloseTypeEnum.cancelAndSellByLimit] = gridFutures
        ? 'Cancel and close position by LIMIT order'
        : `Cancel and ${gridOppositeAction} base by LIMIT order`;
      options[CloseTypeEnum.cancelAndSellByMarket] = gridFutures
        ? 'Cancel and close position by MARKET order'
        : `Cancel and ${gridOppositeAction} base by MARKET order`;
    }
    options[CloseTypeEnum.cancelExceptPartiallyFilled] =
      'Cancel except partially filled';
    return options;
  }, [gridFutures, gridHasOpenPosition, gridOppositeAction]);

  const handleConfirm = () => {
    if (isStopping && isGrid) {
      const cancelPartiallyFilled = gridCloseType === CloseTypeEnum.cancelAll;
      const closeGridType = [
        CloseTypeEnum.cancelAll,
        CloseTypeEnum.cancelExceptPartiallyFilled,
      ].includes(gridCloseType)
        ? CloseGRIDTypeEnum.cancel
        : gridCloseType === CloseTypeEnum.cancelAndSellByLimit
          ? CloseGRIDTypeEnum.closeByLimit
          : CloseGRIDTypeEnum.closeByMarket;
      onConfirm(closeGridType, cancelPartiallyFilled);
    } else if (isStopping && hasActiveDeals) {
      onConfirm(closeType);
    } else {
      onConfirm();
    }
  };

  const getCloseOptionDescription = (option: string) => {
    switch (option) {
      case 'leave':
        return 'Bot stops but deals remain active and can be managed manually';
      case 'cancel':
        return 'All active deals are immediately canceled without executing any orders';
      case 'closeByLimit':
        return 'Place LIMIT orders to close all deals at current take profit levels';
      case 'closeByMarket':
        return 'Place MARKET orders to close all deals immediately at current market price';
      default:
        return '';
    }
  };

  const getTitle = () => {
    if (isStarting) {
      return 'Start the bot';
    } else {
      return 'Stop the bot';
    }
  };

  const getDescription = () => {
    if (isStarting) {
      return `Are you sure you want to start "${botName}"?`;
    } else {
      return `Are you sure you want to stop "${botName}"?`;
    }
  };

  const getButtonText = () => {
    if (isStarting) {
      return 'Start Bot';
    } else {
      return 'Stop Bot';
    }
  };

  const getButtonIcon = () => {
    if (isStarting) {
      return <Play className="w-4 h-4 mr-2" />;
    } else {
      return <Square className="w-4 h-4 mr-2" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <Activity className="w-5 h-5 text-white" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 space-y-md sm:space-y-5">
          {/* Bot Information */}
          <div className="space-y-xs">
            <div className="flex items-center gap-xs">
              <span className="text-sm font-medium">{botName}</span>
              <span className="text-muted-foreground">·</span>
              <StatusChip status={currentStatus} size="xs" chipStyle="soft" />
            </div>
          </div>

          {/* Grid close-type selection (parity with V1) */}
          {isStopping && isGrid && (
            <div className="space-y-sm pb-2">
              <Label className="text-sm font-medium">
                How do you want to stop the bot?
              </Label>
              <div className="space-y-sm">
                {Object.entries(gridCloseOptions).map(([key, option]) => {
                  const isSelected = gridCloseType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGridCloseType(key as CloseTypeEnum)}
                      disabled={isLoading}
                      className={cn(
                        'w-full text-left rounded-xl p-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50',
                        isSelected
                          ? 'ring-2 ring-primary/80 bg-primary/5'
                          : 'bg-muted/5 hover:bg-muted/20'
                      )}
                    >
                      <div className="font-medium text-sm text-card-foreground">
                        {option}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Close Type Selection */}
          {isStopping && !isGrid && hasActiveDeals && (
            <div className="space-y-sm pb-2">
              <Label className="text-sm font-medium">
                How do you want to handle active deals?
              </Label>
              <Select value={closeType} onValueChange={setCloseType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select close type" />
                </SelectTrigger>
                <SelectContent className="z-70">
                  <SelectItem value="leave">Leave deals open</SelectItem>
                  <SelectItem value="cancel">Cancel all deals</SelectItem>
                  <SelectItem value="closeByLimit">Close by LIMIT</SelectItem>
                  <SelectItem value="closeByMarket">Close by MARKET</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getCloseOptionDescription(closeType)}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-sm">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="w-full sm:w-auto text-sm"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleConfirm}
            disabled={isLoading}
            className="w-full sm:w-auto text-sm"
            autoFocus
          >
            {isLoading ? (
              <>
                <div className="w-3 h-3 sm:w-4 sm:h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isStarting ? 'Starting...' : 'Stopping...'}
              </>
            ) : (
              <>
                {getButtonIcon()}
                {getButtonText()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
