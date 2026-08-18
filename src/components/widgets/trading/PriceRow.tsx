import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProfitLossPercChip } from '@/components/ui/chip';
import type { TradingPair } from '@/hooks/useTradingPairs';
import { cn } from '@/lib/utils';
import type { PriceUpdate } from '@/services/ExchangeWebSocketService';
import type { ExchangeEnum } from '@/types';
import { X } from 'lucide-react';
import React from 'react';
import CoinPair from '../shared/CoinPair';

export interface PriceRowProps {
  pair: TradingPair;
  priceData?: PriceUpdate;
  /** No public price stream exists for this pair's exchange. */
  isStreamUnavailable?: boolean;
  onRemove: (pair: string, exchange: ExchangeEnum) => void;
  isRemovable?: boolean;
  onClick?: (pair: TradingPair) => void;
  isActive?: boolean;
}

const PriceRow: React.FC<PriceRowProps> = ({
  pair,
  priceData,
  isStreamUnavailable = false,
  onRemove,
  isRemovable = true,
  onClick,
  isActive = false,
}) => {
  const formatPrice = (price: number, precision: number = 8) => {
    let formatted: string;
    if (price >= 1) {
      formatted = price.toFixed(2);
    } else if (price >= 0.01) {
      formatted = price.toFixed(4);
    } else {
      formatted = price.toFixed(precision);
    }

    // Add thousand separators before decimal point
    const [integerPart, decimalPart] = formatted.split('.');
    const formattedInteger = parseInt(integerPart).toLocaleString();
    return decimalPart
      ? `${formattedInteger}.${decimalPart}`
      : formattedInteger;
  };

  const formatAbsolutePriceChange = (price: number, changePercent: number) => {
    const absoluteChange = (price * changePercent) / 100;
    return formatPrice(Math.abs(absoluteChange));
  };

  // Determine if price went up or down (for background animation)
  const priceDirection =
    priceData?.changePercent24h !== undefined
      ? priceData.changePercent24h > 0
        ? 'up'
        : priceData.changePercent24h < 0
          ? 'down'
          : 'neutral'
      : null;

  return (
    <Card
      position={1}
      className={cn(
        'mt-1 max-w-[370px] p-0 group/row transition-colors',
        isActive && 'ring-1 ring-primary/60'
      )}
    >
      <div
        className={cn(
          'relative flex items-center justify-between transition-all py-2 px-3',
          'hover:bg-muted/50 cursor-pointer',
          // On touch the remove button is always visible (see below), so
          // reserve exactly its gutter (24px button + right-2) instead of
          // letting it sit on top of the price.
          isRemovable && '[@media(hover:none)]:pr-8',
          priceDirection === 'up' && 'bg-[oklch(var(--profit))]/5',
          priceDirection === 'down' && 'bg-[oklch(var(--loss))]/5'
        )}
        onClick={() => onClick?.(pair)}
      >
        {/* Pair Info */}
        <div className="flex items-center gap-sm flex-1 min-w-0">
          <CoinPair
            pair={`${pair.baseAsset.name}/${pair.quoteAsset.name}`}
            iconSize="sm"
            showText={false}
          />
          <div className="flex flex-col min-w-0">
            <div className="font-medium text-sm truncate">{pair.pair}</div>
            <div className="text-xs text-muted-foreground capitalize font-medium truncate">
              {pair.exchange}
            </div>
          </div>
        </div>

        {/* Price Info - with transition when hovered */}
        <div
          className={cn(
            'flex items-center transition-all duration-200',
            isRemovable &&
              'group-hover/row:opacity-30 group-hover/row:transform group-hover/row:translate-x-2'
          )}
        >
          {priceData ? (
            <>
              {/* Current Price */}
              <div className="text-right">
                <div className="font-mono text-sm font-medium text-foreground">
                  {formatPrice(priceData.price, pair.priceAssetPrecision)}
                </div>
                {priceData.changePercent24h !== undefined && (
                  <div className="flex items-center gap-xs text-xs">
                    <span
                      className={cn(
                        'font-mono font-medium',
                        priceData.changePercent24h > 0 &&
                          'text-(--color-profit)',
                        priceData.changePercent24h < 0 && 'text-loss',
                        priceData.changePercent24h === 0 &&
                          'text-muted-foreground'
                      )}
                    >
                      {priceData.changePercent24h > 0
                        ? '+'
                        : priceData.changePercent24h < 0
                          ? '-'
                          : ''}
                      {formatAbsolutePriceChange(
                        priceData.price,
                        priceData.changePercent24h
                      )}
                    </span>
                    <ProfitLossPercChip
                      value={priceData.changePercent24h}
                      size="sm"
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            // Loading / no-data state. "Connecting..." is only honest while a
            // price can still arrive; for an exchange we have no stream for it
            // would hang there forever, so say so instead.
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                {isStreamUnavailable ? 'Price unavailable' : 'Connecting...'}
              </div>
            </div>
          )}
        </div>

        {/* Remove Button - Slides in from right on hover */}
        {isRemovable && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${pair.pair}`}
            className={cn(
              'absolute top-1/2 right-2 transform -translate-y-1/2 h-6 w-6 p-0',
              'opacity-0 translate-x-2 group-hover/row:opacity-100 group-hover/row:translate-x-0',
              // Tailwind gates hover variants behind `(hover: hover)`, so on a
              // touch device the group-hover rule never matches and this stayed
              // invisible — there was no way to remove a pair on mobile.
              '[@media(hover:none)]:opacity-100 [@media(hover:none)]:translate-x-0',
              'transition-all duration-200 bg-background/90 backdrop-blur-sm',
              'hover:bg-destructive hover:text-destructive-foreground z-10'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(pair.pair, pair.exchange);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
};

export default PriceRow;
