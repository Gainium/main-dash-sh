import { TrendingDown, TrendingUp } from 'lucide-react';
import React from 'react';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { Badge } from '../ui/badge';
import CoinIcon from '../widgets/shared/CoinIcon';

const FavoritesBar: React.FC = () => {
  const { favorites, isNavbarFavoritesVisible } = useFavoritesStore();

  if (!isNavbarFavoritesVisible || favorites.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-border bg-card/50">
      <div className="container mx-auto px-6">
        <div className="flex items-center gap-md py-2 overflow-x-auto">
          {favorites.slice(0, 8).map((coin) => {
            const isPositive = (coin.change24h || 0) > 0;

            return (
              <div
                key={coin.id}
                className="flex items-center gap-xs min-w-0 shrink-0 cursor-pointer hover:bg-accent/50 px-2 py-1 rounded transition-colors"
              >
                <CoinIcon symbol={coin.symbol} size="w-4 h-4" />

                <div className="flex items-center gap-1 text-xs">
                  <span className="font-medium">{coin.symbol}</span>
                  <span className="text-muted-foreground">/USDT</span>
                </div>

                <div className="text-xs font-medium">
                  $
                  {coin.price.toLocaleString('en-US', {
                    minimumFractionDigits: coin.price < 1 ? 4 : 0,
                    maximumFractionDigits: coin.price < 1 ? 4 : 0,
                  })}
                </div>

                <Badge
                  variant={isPositive ? 'default' : 'destructive'}
                  className={`text-xs px-1 py-0 h-auto ${
                    isPositive
                      ? 'bg-green-100 text-green-700 border-green-200'
                      : 'bg-red-100 text-red-700 border-red-200'
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="w-2 h-2 mr-0.5" />
                  ) : (
                    <TrendingDown className="w-2 h-2 mr-0.5" />
                  )}
                  {isPositive ? '+' : ''}
                  {(coin.change24h || 0).toFixed(1)}%
                </Badge>
              </div>
            );
          })}

          {favorites.length > 8 && (
            <div className="text-xs text-muted-foreground shrink-0">
              +{favorites.length - 8} more
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FavoritesBar;
