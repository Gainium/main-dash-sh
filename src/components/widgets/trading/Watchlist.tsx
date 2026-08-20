import React, { useMemo, useCallback, useState } from 'react';
import { Plus, Wifi, WifiOff } from 'lucide-react';
import WidgetWrapper, { type WidgetMenuActions } from '../WidgetWrapper';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import PairSelector from './PairSelector';
import PriceRow from './PriceRow';
import ChartPortal from './ChartPortal';
import { usePriceStream } from '@/hooks/usePriceStream';
import { type TradingPair } from '@/hooks/useTradingPairs';
import { useWidgetSettings } from '@/hooks/useWidgetSettings';
import { ExchangeEnum } from '@/types';
import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';

export interface TradingPairSelection {
  pair: string;
  exchange: ExchangeEnum;
}

// Widget settings interface for watchlist
interface WatchlistWidgetSettings {
  selectedPairs: TradingPairSelection[];
}

export interface WatchlistProps {
  widgetId?: string;
  isEditable?: boolean;
  onCollapse?: (widgetId: string, collapsed: boolean) => void;
  onTabMove?: (
    fromTabId: string,
    toWidgetId: string,
    toTabIndex: number
  ) => void;
  menuActions?: WidgetMenuActions;
  _data?: Record<string, unknown>;
}

const Watchlist: React.FC<WatchlistProps> = ({
  widgetId = 'watchlist',
  isEditable = false,
  onCollapse,
  onTabMove,
  menuActions,
  _data = {},
}) => {
  // Chart portal state
  const [chartPortalOpen, setChartPortalOpen] = useState(false);
  const [selectedPairForChart, setSelectedPairForChart] =
    useState<TradingPair | null>(null);

  // Use widget-specific settings instead of global store
  const { usePersistedState } =
    useWidgetSettings<WatchlistWidgetSettings>(widgetId);
  const [storedPairs, setStoredPairs] = usePersistedState('selectedPairs', [
    { pair: 'BTCUSDT', exchange: ExchangeEnum.binance },
    { pair: 'ETHUSDT', exchange: ExchangeEnum.binance },
    { pair: 'BNBUSDT', exchange: ExchangeEnum.binance },
  ]);

  // Load trading pairs data
  const { pairsByExchange, isLoading: pairsLoading } =
    useTradingPairsFromContext();

  // Convert stored pairs to full pair objects
  const selectedPairs = useMemo(() => {
    if (!pairsByExchange) {
      // Fallback using stored pairs directly for testing if no API data
      return storedPairs.map((storedPair) => ({
        pair: storedPair.pair,
        exchange: storedPair.exchange,
        baseAsset: {
          name: storedPair.pair.replace('USDT', ''),
          minAmount: 0,
          maxAmount: 100000,
          step: 0.01,
        },
        quoteAsset: { name: 'USDT', minAmount: 0 },
        priceAssetPrecision: 2,
        crossAvailable: true,
      }));
    }

    const allPairs: TradingPair[] = [];
    Object.values(pairsByExchange).forEach((pairs) => {
      allPairs.push(...pairs);
    });

    return storedPairs
      .map((storedPair) =>
        allPairs.find(
          (pair) =>
            pair.pair === storedPair.pair &&
            pair.exchange === storedPair.exchange
        )
      )
      .filter((pair): pair is TradingPair => pair !== undefined);
  }, [pairsByExchange, storedPairs]);

  // Setup price streaming
  const { prices, connectionStatus, isConnected, unsupportedPairs } =
    usePriceStream(selectedPairs, {
      enableStream: true,
    });

  // Handle adding a new pair
  const handlePairAdd = useCallback(
    (pair: TradingPair) => {
      const newPair = { pair: pair.pair, exchange: pair.exchange };
      if (
        !storedPairs.some(
          (p) => p.pair === newPair.pair && p.exchange === newPair.exchange
        )
      ) {
        setStoredPairs([...storedPairs, newPair]);
      }
    },
    [storedPairs, setStoredPairs]
  );

  // Handle removing a pair. Match on pair AND exchange: the same symbol can be
  // watched on several exchanges (e.g. ALGOUSDT on binance and bybitLinear),
  // and matching by symbol alone removed every one of them at once.
  const handlePairRemove = useCallback(
    (pairSymbol: string, exchange: ExchangeEnum) => {
      setStoredPairs(
        storedPairs.filter(
          (p) => !(p.pair === pairSymbol && p.exchange === exchange)
        )
      );
    },
    [storedPairs, setStoredPairs]
  );

  // Handle pair click to open chart
  const handlePairClick = useCallback((pair: TradingPair) => {
    setSelectedPairForChart(pair);
    setChartPortalOpen(true);
  }, []);

  // Handle closing chart portal
  const handleChartPortalClose = useCallback(() => {
    setChartPortalOpen(false);
    setSelectedPairForChart(null);
  }, []);

  // Widget metadata
  const metadata = {
    id: widgetId,
    type: 'watchlist',
    title: 'Watchlist',
    description: 'Real-time price monitoring for trading pairs',
    hasOptions: false,
  };

  const wrapperProps = {
    metadata,
    isEditable,
    isCollapsible: true,
    ...(onCollapse && { onCollapse }),
    ...(onTabMove && { onTabMove }),
    ...(menuActions && { menuActions }),
  };

  return (
    <WidgetWrapper {...wrapperProps}>
      <div className="h-full flex flex-col">
        {/* Prices List. The widget has a fixed height from the dashboard grid
            while this list grows with every pair added, so the overflow has to
            scroll: with `overflow-hidden` the rows past the widget's bottom
            edge were silently sliced off, and their remove (X) — and the Add
            Pair cell — could not be reached at all. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar mb-4">
          {pairsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-muted-foreground">Loading pairs...</div>
            </div>
          ) : selectedPairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-sm">
              <div className="text-muted-foreground text-center">
                No trading pairs selected.
                <br />
                Click "Add Pair" to get started.
              </div>
              <PairSelector
                onPairSelect={handlePairAdd}
                selectedPairs={storedPairs}
                widgetId={widgetId}
              >
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Pair
                </Button>
              </PairSelector>
            </div>
          ) : (
            <div className="@container">
              <div
                className="grid gap-1 items-start"
                style={{
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                }}
              >
                {selectedPairs.map((pair) => (
                  <PriceRow
                    key={`${pair.exchange}-${pair.pair}`}
                    pair={pair}
                    priceData={prices[`${pair.pair}_${pair.exchange}`]}
                    isStreamUnavailable={unsupportedPairs.has(
                      `${pair.pair}_${pair.exchange}`
                    )}
                    onRemove={handlePairRemove}
                    isRemovable={selectedPairs.length > 1}
                    onClick={handlePairClick}
                  />
                ))}

                {/* Add Pair Button as dotted element */}
                <PairSelector
                  onPairSelect={handlePairAdd}
                  selectedPairs={storedPairs}
                  widgetId={widgetId}
                >
                  <Card
                    position={1}
                    className="mt-1 p-0 max-w-[370px] group/add-pair border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 transition-colors"
                  >
                    <div className="flex items-center justify-center py-2 px-3 cursor-pointer hover:bg-muted/20 transition-colors">
                      <div className="flex items-center gap-xs">
                        <Plus className="h-4 w-4 text-muted-foreground group-hover/add-pair:text-foreground transition-colors" />
                        <span className="text-sm text-muted-foreground group-hover/add-pair:text-foreground transition-colors">
                          Add Pair
                        </span>
                      </div>
                    </div>
                  </Card>
                </PairSelector>
              </div>
            </div>
          )}
        </div>

        {/* Connection Status at Bottom */}
        <div className="flex items-center justify-center pt-2 border-t border-border/50">
          <div className="flex items-center gap-xs text-xs text-muted-foreground">
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3 text-green-500" />
                <span>Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-red-500" />
                <span>
                  {connectionStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Disconnected'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chart Portal */}
      <ChartPortal
        isOpen={chartPortalOpen}
        onClose={handleChartPortalClose}
        pair={selectedPairForChart}
        widgetId={widgetId}
      />
    </WidgetWrapper>
  );
};

export default Watchlist;
