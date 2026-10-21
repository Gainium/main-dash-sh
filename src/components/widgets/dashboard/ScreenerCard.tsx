import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { cardHoverVariants } from '@/lib/animations/variants';
import { Card } from '../../ui/card';
import CoinIcon from '../shared/CoinIcon';
import ProfitLossPercChip from '../../ui/chip/ProfitLossPercChip';
import { type ScreenerCoinData } from '@/types';

interface ScreenerCardProps {
  item: ScreenerCoinData;
  index: number;
  onClick?: (coin: ScreenerCoinData) => void;
  isSelected?: boolean;
}

export const ScreenerCard: React.FC<ScreenerCardProps> = ({
  item: coin,
  onClick,
  isSelected = false,
  index,
}) => {
  const { currency, toReporting } = useReportingCurrency();

  const handleClick = () => {
    if (onClick) {
      onClick(coin);
    }
  };

  // Helper function to format large USD numbers in the reporting currency
  const formatNumber = (usd: number) => {
    const num = toReporting(usd);
    const { symbol } = currency;
    if (num >= 1e12) return `${symbol}${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${symbol}${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${symbol}${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${symbol}${(num / 1e3).toFixed(2)}K`;
    return `${symbol}${num.toFixed(2)}`;
  };

  // Helper function to format a USD price in the reporting currency
  const formatPrice = (usd: number) => {
    const price = toReporting(usd);
    let formattedPrice: string;
    if (price < 0.001) {
      formattedPrice = price.toFixed(8);
    } else if (price < 1) {
      formattedPrice = price.toFixed(5);
    } else {
      formattedPrice = price.toFixed(2);
    }

    // Add comma separators only to the integer part
    const [intPart, decPart] = formattedPrice.split('.');
    const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined
      ? `${intWithCommas}.${decPart}`
      : intWithCommas;
  };

  // Helper function to get liquidity score color
  const getLiquidityScoreColor = (score: number) => {
    if (score >= 9) return 'text-success';
    if (score >= 7) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Card position={1} className="p-0 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: 0.4,
          delay: index * 0.05,
          ease: [0.34, 1.56, 0.64, 1],
          type: 'spring',
          stiffness: 300,
          damping: 25,
        }}
        whileHover="hover"
        whileTap="tap"
        variants={cardHoverVariants}
        className={`cursor-pointer overflow-hidden bg-transparent border-none rounded-lg group shadow-none transition-colors duration-200 min-h-[180px] touch-manipulation ${
          isSelected ? 'ring-2 ring-primary/20' : 'hover:bg-accent/5'
        }`}
        onClick={handleClick}
        style={{
          transformOrigin: 'center',
        }}
      >
        {/* Header */}
        <div className="p-md pb-2 relative">
          <motion.div
            className="flex items-center justify-between w-full mb-3"
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.3,
              delay: index * 0.05 + 0.1,
              ease: 'easeOut',
            }}
          >
            <div className="flex items-center gap-sm">
              <CoinIcon symbol={coin.symbol} size="lg" />
              <div className="flex flex-col">
                <h3 className="text-2xl font-bold text-card-foreground">
                  {coin.symbol.toUpperCase()}
                </h3>
                <div className="flex items-center gap-xs mt-1">
                  <div
                    className={clsx(
                      'text-xl font-bold',
                      coin.priceChangePercentage24h > 0
                        ? 'text-success'
                        : coin.priceChangePercentage24h < 0
                          ? 'text-destructive'
                          : 'text-card-foreground'
                    )}
                  >
                    {currency.symbol}
                    {formatPrice(coin.currentPrice)}
                  </div>
                  <ProfitLossPercChip
                    value={coin.priceChangePercentage24h}
                    size="sm"
                  />
                </div>
              </div>
            </div>
            <div
              className="flex items-center justify-center w-10 h-10 rounded-full bg-muted/20 text-card-foreground text-2xl font-bold shadow-sm shrink-0"
              title="Market Cap Rank"
            >
              #{coin.marketCapRank}
            </div>
          </motion.div>

          {/* Full Width Sparkline */}
          <motion.div
            className="w-full h-24 mb-2"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.3,
              delay: index * 0.05 + 0.15,
              ease: 'easeOut',
            }}
          >
            {coin.sparkline && coin.sparkline.length > 0 && (
              <div className="relative w-full h-full bg-muted/10 rounded-lg overflow-hidden">
                <svg
                  width="100%"
                  height="100%"
                  className="absolute inset-0"
                  preserveAspectRatio="none"
                  viewBox="0 0 100 100"
                >
                  <defs>
                    <linearGradient
                      id={`gradient-${index}`}
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <stop
                        offset="0%"
                        stopColor={
                          coin.priceChangePercentage7d >= 0
                            ? 'var(--color-profit)'
                            : 'var(--color-loss)'
                        }
                        stopOpacity="0.3"
                      />
                      <stop
                        offset="100%"
                        stopColor={
                          coin.priceChangePercentage7d >= 0
                            ? 'var(--color-profit)'
                            : 'var(--color-loss)'
                        }
                        stopOpacity="0.05"
                      />
                    </linearGradient>
                  </defs>
                  <polyline
                    points={coin.sparkline
                      ?.map((value, idx) => {
                        const min = Math.min(...(coin.sparkline || []));
                        const max = Math.max(...(coin.sparkline || []));
                        const range = max - min;
                        const x =
                          (idx / ((coin.sparkline?.length || 1) - 1)) * 100;
                        const y =
                          range === 0 ? 50 : 100 - ((value - min) / range) * 80;
                        return `${x},${y}`;
                      })
                      .join(' ')}
                    fill="none"
                    stroke={
                      coin.priceChangePercentage7d >= 0
                        ? 'var(--color-profit)'
                        : 'var(--color-loss)'
                    }
                    strokeWidth="2"
                  />
                  <polyline
                    points={
                      coin.sparkline
                        ?.map((value: number, idx: number) => {
                          const min = Math.min(...(coin.sparkline || []));
                          const max = Math.max(...(coin.sparkline || []));
                          const range = max - min;
                          const x =
                            (idx / ((coin.sparkline?.length || 1) - 1)) * 100;
                          const y =
                            range === 0
                              ? 50
                              : 100 - ((value - min) / range) * 80;
                          return `${x},${y}`;
                        })
                        .join(' ') + ' 100,100 0,100'
                    }
                    fill={`url(#gradient-${index})`}
                    stroke="none"
                  />
                </svg>
              </div>
            )}
          </motion.div>
        </div>

        {/* Main Content */}
        <motion.div
          className="px-4 pb-4"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            delay: index * 0.05 + 0.15,
            ease: 'easeOut',
          }}
        >
          {/* Price Changes Section */}
          <div className="mb-4">
            <div className="text-sm font-semibold text-card-foreground mb-2">
              Price Changes
            </div>
            <div className="grid grid-cols-4 gap-xs">
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">1H</div>
                <ProfitLossPercChip
                  value={coin.priceChangePercentage1h}
                  size="sm"
                />
              </div>
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">24H</div>
                <ProfitLossPercChip
                  value={coin.priceChangePercentage24h}
                  size="sm"
                />
              </div>
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">7D</div>
                <ProfitLossPercChip
                  value={coin.priceChangePercentage7d}
                  size="sm"
                />
              </div>
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">30D</div>
                <ProfitLossPercChip
                  value={coin.priceChangePercentage30d}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* Volatility Changes Section */}
          <div className="mb-4">
            <div className="text-sm font-semibold text-card-foreground mb-2">
              Volatility
            </div>
            <div className="grid grid-cols-4 gap-xs">
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">1D</div>
                <div className="text-card-foreground font-semibold text-xs">
                  {coin.volatility1d?.toFixed(1)}%
                </div>
              </div>
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">7D</div>
                <div className="text-card-foreground font-semibold text-xs">
                  {((coin.volatility1d ?? 0) * 1.2).toFixed(1)}%
                </div>
              </div>
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">30D</div>
                <div className="text-card-foreground font-semibold text-xs">
                  {((coin.volatility1d ?? 0) * 0.8).toFixed(1)}%
                </div>
              </div>
              <div className="text-center p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground text-xs">Liquidity</div>
                <div
                  className={clsx(
                    'font-semibold text-xs',
                    getLiquidityScoreColor(coin.liquidityScore)
                  )}
                >
                  {coin.liquidityScore?.toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          {/* Volume Changes Section */}
          <div className="mb-4">
            <div className="text-sm font-semibold text-card-foreground mb-2">
              Volume & Market Cap
            </div>
            <div className="grid grid-cols-2 gap-sm">
              <div className="p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground mb-1 text-xs">
                  24h Volume
                </div>
                <div
                  className="text-card-foreground font-semibold text-sm truncate"
                  title={formatNumber(coin.totalVolume)}
                >
                  {formatNumber(coin.totalVolume)}
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  <ProfitLossPercChip
                    value={coin.volumeChange24h ?? 0}
                    size="sm"
                  />
                </div>
              </div>
              <div className="p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground mb-1 text-xs">
                  Market Cap
                </div>
                <div
                  className="text-card-foreground font-semibold text-sm truncate"
                  title={formatNumber(coin.marketCap)}
                >
                  {formatNumber(coin.marketCap)}
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  <ProfitLossPercChip
                    value={coin.marketCapChangePercentage24h ?? 0}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ATH/ATL Section */}
          <div className="mb-4">
            <div className="text-sm font-semibold text-card-foreground mb-2">
              All Time High/Low
            </div>
            <div className="grid grid-cols-2 gap-sm">
              <div className="p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground mb-1 text-xs">
                  ATH Change
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  <ProfitLossPercChip
                    value={coin.athChangePercentage ?? 0}
                    size="sm"
                  />
                </div>
              </div>
              <div className="p-xs bg-muted/20 rounded">
                <div className="text-muted-foreground mb-1 text-xs">
                  ATL Change
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  <ProfitLossPercChip
                    value={coin.atlChangePercentage ?? 0}
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Card>
  );
};

export default ScreenerCard;
