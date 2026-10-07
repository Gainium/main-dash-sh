import getLatestPrices, { getLocalPrices } from '@/helper/price';
import { useBotOrders } from '@/hooks/useBotOrders';
import { cn } from '@/lib/utils';
import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import { BotTypesEnum } from '@/types';
import { formatPriceWithPrecision } from '@/utils/formatters';
import { Layers } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { DrawerSection } from './DrawerSection';

export interface DrawerGridOrderBookProps {
  widgetId: string;
  botId?: string;
  bot?: DrawerBot;
}

interface BookLevel {
  id: string;
  price: number;
  qty: number;
  /** Signed % the market has to move from the current price to fill it. */
  distance: number;
}

const formatQty = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 8 });

const formatDistance = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

/**
 * Order book of a grid bot's resting orders: buys below the price on the
 * left, sells above it on the right, each with the move needed to fill it.
 * The chart can't label every level and isn't shown on mobile, so this is
 * the only place a user can read the whole ladder.
 */
const DrawerGridOrderBook: React.FC<DrawerGridOrderBookProps> = ({
  widgetId,
  botId,
  bot: botProp,
}) => {
  const gridBot = botProp as unknown as GridBot | undefined;
  const pair = gridBot?.settings?.pair;
  const exchange = gridBot?.exchange;

  const { orders, isLoading, hasValidResponse } = useBotOrders(
    botId || '',
    BotTypesEnum.grid,
    { status: 'NEW' }
  );
  const baseAsset = gridBot?.symbol?.baseAsset || orders[0]?.baseAsset || '';
  const quoteAsset =
    gridBot?.symbol?.quoteAsset || orders[0]?.quoteAsset || '';

  const findLivePrice = useMemo(
    () => (prices: ReturnType<typeof getLocalPrices>) =>
      prices.find((p) => p.symbol === pair && p.exchange === exchange)?.price,
    [pair, exchange]
  );
  const [livePrice, setLivePrice] = useState<number | undefined>(() =>
    findLivePrice(getLocalPrices())
  );
  useEffect(() => {
    setLivePrice(findLivePrice(getLocalPrices()));
    return getLatestPrices((result) => {
      if (result.status === 'OK' && result.data) {
        const next = findLivePrice(result.data);
        if (next) setLivePrice(next);
      }
    }, false);
  }, [findLivePrice]);

  const currentPrice = livePrice || gridBot?.lastPrice || 0;

  const { buys, sells } = useMemo(() => {
    const toLevel = (o: (typeof orders)[number]): BookLevel => {
      const price = parseFloat(o.price);
      return {
        id: o.clientOrderId,
        price,
        qty: parseFloat(o.origQty) - (parseFloat(o.executedQty) || 0),
        distance: currentPrice > 0 ? (price / currentPrice - 1) * 100 : 0,
      };
    };
    const open = orders.filter((o) => parseFloat(o.price) > 0);
    return {
      // Nearest to the price first on both sides.
      buys: open
        .filter((o) => o.side === 'BUY')
        .map(toLevel)
        .sort((a, b) => b.price - a.price),
      sells: open
        .filter((o) => o.side === 'SELL')
        .map(toLevel)
        .sort((a, b) => a.price - b.price),
    };
  }, [orders, currentPrice]);

  const total = buys.length + sells.length;
  // Clamped so a near-empty side still has room for its own label.
  const buyShare =
    total > 0 ? Math.min(Math.max((buys.length / total) * 100, 20), 80) : 50;
  const rows = Math.max(buys.length, sells.length);
  const levels = gridBot?.settings?.levels ?? 0;
  const truncated =
    !!gridBot?.settings?.useOrderInAdvance && levels > 0 && total < levels;

  // Per-grid size is the same for every level when the bot sizes in base;
  // show it only when it is actually uniform rather than guess one.
  const perGridQty = useMemo(() => {
    const qtys = [...buys, ...sells].map((l) => l.qty);
    if (!qtys.length) return null;
    const first = qtys[0];
    return qtys.every((q) => Math.abs(q - first) <= first * 1e-6)
      ? first
      : null;
  }, [buys, sells]);

  const price = (value: number) => formatPriceWithPrecision(value, '');

  const renderSide = (level: BookLevel | undefined, index: number, side: 'buy' | 'sell') => {
    if (!level) return <div />;
    const isBuy = side === 'buy';
    return (
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 tabular-nums',
          isBuy ? 'pr-2' : 'flex-row-reverse pl-2'
        )}
        title={`${formatQty(level.qty)} ${baseAsset}`}
      >
        <span
          className={cn(
            'w-5 text-xs',
            isBuy ? 'text-success' : 'text-right text-destructive'
          )}
        >
          {index + 1}
        </span>
        <span className="text-sm text-foreground">{price(level.price)}</span>
        <span
          className={cn(
            'text-xs',
            isBuy ? 'ml-auto' : 'mr-auto',
            level.distance < 0 ? 'text-destructive' : 'text-success'
          )}
        >
          {formatDistance(level.distance)}
        </span>
      </div>
    );
  };

  return (
    <DrawerSection
      widgetId={widgetId}
      widgetType="drawer-grid-order-book"
      title="Open orders"
      icon={Layers}
    >
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <div className="text-xs text-muted-foreground">Current price</div>
          <div className="text-sm font-medium tabular-nums">
            {currentPrice > 0 ? `${price(currentPrice)} ${quoteAsset}` : '—'}
          </div>
        </div>
        {perGridQty !== null && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              Order size per grid
            </div>
            <div className="text-sm font-medium tabular-nums">
              {formatQty(perGridQty)} {baseAsset}
            </div>
          </div>
        )}
      </div>

      {isLoading && !hasValidResponse ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Loading orders…
        </div>
      ) : total === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No open orders
        </div>
      ) : (
        <>
          <div className="flex h-6 overflow-hidden rounded text-xs font-medium">
            <div
              className="flex items-center whitespace-nowrap bg-success/15 px-2 text-success"
              style={{ width: `${buyShare}%` }}
            >
              Buy {buys.length}
            </div>
            <div className="flex flex-1 items-center justify-end whitespace-nowrap bg-destructive/15 px-2 text-destructive">
              Sell {sells.length}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 text-xs text-muted-foreground">
            <div className="flex justify-between pr-2">
              <span>Buy price ({quoteAsset})</span>
              <span>To fill</span>
            </div>
            <div className="flex justify-between pl-2">
              <span>To fill</span>
              <span>Sell price ({quoteAsset})</span>
            </div>
          </div>

          <div className="grid grid-cols-2">
            <div className="border-r border-border">
              {Array.from({ length: rows }, (_, i) => (
                <React.Fragment key={buys[i]?.id ?? `b-${i}`}>
                  {renderSide(buys[i], i, 'buy')}
                </React.Fragment>
              ))}
            </div>
            <div>
              {Array.from({ length: rows }, (_, i) => (
                <React.Fragment key={sells[i]?.id ?? `s-${i}`}>
                  {renderSide(sells[i], i, 'sell')}
                </React.Fragment>
              ))}
            </div>
          </div>

          {truncated && (
            <div className="mt-3 text-center text-xs text-muted-foreground">
              Orders in advance is on — only the nearest levels are placed on
              the exchange.
            </div>
          )}
        </>
      )}
    </DrawerSection>
  );
};

export default DrawerGridOrderBook;
