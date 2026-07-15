import { logger } from '@/lib/loggerInstance';
import { BotTypesEnum, PositionSide, type BotSettings } from '@/types';
import { isFuturesExchange } from '@/utils/exchangeUtils';
import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import { extractPairAssets } from '@/utils/pairs';
import {
  Copy,
  Edit,
  Grid3X3,
  MoreVertical,
  Play,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React from 'react';
import { useBotActions } from '../../hooks/useBotActions';
import { BotActionsModals } from './BotActionsModals';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import CoinPair from '../widgets/shared/CoinPair';
import ExchangeIcon from '../widgets/shared/ExchangeIcon';
import { useResolvePairAsset } from '@/hooks/useResolvePairAsset';

interface GridBotCardProps {
  item: DrawerBot;
  index: number;
  onClick?: (bot: DrawerBot) => void;
  isSelected?: boolean;
}

const GridBotCardComponent: React.FC<GridBotCardProps> = ({
  item: bot,
  onClick,
  isSelected = false,
}) => {
  const resolvePairAsset = useResolvePairAsset();

  // Shared bot-action orchestration (status/delete + their modals). Clone
  // opens the pre-filled create page. This card keeps its own bespoke menu,
  // but the handlers/modals now come from the shared hook.
  const botActions = useBotActions({
    botId: bot.id,
    botType: BotTypesEnum.grid,
    botName: bot.name,
    status: bot.status,
    activeDeals: 0, // grid bots don't have deals in the same way
    totalValue: bot.budget || 0,
    currency: extractPairAssets(bot.pair).quoteAsset || 'USD',
    lastActivity: 'Unknown',
    botData: bot,
    gridFutures: isFuturesExchange(bot.exchange),
    gridHasOpenPosition: ((bot as GridBot).position?.price ?? 0) !== 0,
    gridIsShort: (bot as GridBot).position?.side === PositionSide.SHORT,
  });

  // Helper function to get exchange data and trading type
  const getExchangeData = (exchangeId: string) => {
    let baseExchangeId = exchangeId.toLowerCase();
    let tradingType = 'Spot'; // Default to spot

    // Extract base exchange name and determine trading type
    if (baseExchangeId.includes('usdm')) {
      tradingType = 'USDT-M Futures';
      baseExchangeId = baseExchangeId.replace('-usdm', '');
    } else if (baseExchangeId.includes('coinm')) {
      tradingType = 'COIN-M Futures';
      baseExchangeId = baseExchangeId.replace('-coinm', '');
    } else if (baseExchangeId.includes('futures')) {
      tradingType = 'Futures';
      baseExchangeId = baseExchangeId.replace('-futures', '');
    }

    return {
      tradingType,
    };
  };

  const { tradingType } = getExchangeData(bot.exchange);

  const handleCardClick = () => {
    if (onClick) {
      try {
        onClick(bot);
        logger.debug('[GridBotCard] Bot clicked:', {
          botId: bot.id,
          botName: bot.name,
        });
      } catch (error) {
        logger.error('[GridBotCard] Error in onClick handler:', error);
      }
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  };

  // Bot action handlers — thin aliases over the shared orchestration so the
  // bespoke menu below keeps its existing call sites.
  const handleEdit = botActions.edit;
  const handleClone = botActions.clone;
  const handleStatusToggle = botActions.openStatusModal;
  const handleDelete = botActions.openDeleteModal;

  const { baseAsset, quoteAsset } = extractPairAssets(bot.pair);
  // Resolve asset class + venue so tokenized-stock pairs show their real logo.
  const stockMeta = resolvePairAsset(bot.exchange, baseAsset, quoteAsset);

  return (
    <Card
      className={`group relative flex flex-col transition-all duration-200 hover:shadow-lg cursor-pointer max-w-[400px] ${
        isSelected
          ? 'ring-2 ring-primary ring-offset-2 bg-primary/5'
          : 'hover:bg-accent/50'
      }`}
      onClick={handleCardClick}
    >
      <div className="p-4 space-y-4">
        {/* Header with bot name and actions */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{bot.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                <Grid3X3 className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase font-medium">
                  Grid Bot
                </span>
              </div>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {tradingType}
              </span>
            </div>
          </div>

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Status Actions */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleStatusToggle();
                }}
                disabled={botActions.pending.statusToggle}
              >
                {bot.isActive ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start
                  </>
                )}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Management Actions */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit();
                }}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleClone();
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Clone
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Destructive Actions */}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="text-destructive focus:text-destructive"
                disabled={botActions.pending.delete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Trading pair and exchange */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CoinPair
              baseAsset={baseAsset}
              quoteAsset={quoteAsset}
              pair={bot.pair}
              assetClass={stockMeta.assetClass}
              exchange={stockMeta.exchange}
              baseName={stockMeta.displayName}
            />
          </div>
          <div className="flex items-center gap-1">
            <ExchangeIcon
              icon={'/images/exchanges/default.svg'}
              size="w-4 h-4"
            />
            <span className="text-xs text-muted-foreground font-medium">
              {bot.exchange}
            </span>
          </div>
        </div>

        {/* Grid information */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Price Range</span>
            <div className="text-sm font-medium">
              ${(bot.settings as BotSettings).lowPrice.toFixed(4)} - $
              {(bot.settings as BotSettings).topPrice.toFixed(4)}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Current Price</span>
            <div className="text-sm font-medium">
              ${(bot as GridBot).lastPrice.toFixed(4)}
            </div>
          </div>
        </div>

        {/* Grid levels and budget */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Active Levels</span>
            <div className="text-sm font-medium">
              {(bot as GridBot).levels.active.buy +
                (bot as GridBot).levels.active.sell}{' '}
              /{' '}
              {(bot as GridBot).levels.all.buy +
                (bot as GridBot).levels.all.sell}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Budget</span>
            <div className="text-sm font-medium">
              {formatCurrency(bot.budget || 0)}
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Buy Orders</span>
            <div className="text-sm font-medium text-success">
              {(bot as GridBot).transactionsCount.buy}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Sell Orders</span>
            <div className="text-sm font-medium text-destructive">
              {(bot as GridBot).transactionsCount.sell}
            </div>
          </div>
        </div>

        {/* Profit and PnL */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Profit (USD)</span>
            <div
              className={`text-sm font-semibold flex items-center gap-1 ${
                bot.totalProfitUsd >= 0 ? 'text-success' : 'text-destructive'
              }`}
            >
              {bot.totalProfitUsd >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {formatCurrency(bot.totalProfitUsd)}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">PnL %</span>
            <span
              className={`text-sm font-semibold ${
                (bot.profitPerc || 0) >= 0 ? 'text-success' : 'text-destructive'
              }`}
            >
              {formatPercentage(bot.profitPerc || 0)}
            </span>
          </div>
        </div>

        {/* Status and runtime */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                bot.status === 'error'
                  ? 'bg-destructive'
                  : bot.isActive
                    ? 'bg-success'
                    : 'bg-muted-foreground'
              }`}
            />
            <span
              className={`text-xs font-medium capitalize ${
                bot.status === 'error'
                  ? 'text-destructive'
                  : bot.isActive
                    ? 'text-success'
                    : 'text-muted-foreground'
              }`}
            >
              {bot.status === 'closed' ? 'stopped' : bot.status}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {bot.workingTime}
          </span>
        </div>
      </div>

      {/* Shared status / delete / success modals, driven by useBotActions. */}
      <BotActionsModals {...botActions.modalProps} />
    </Card>
  );
};

// Memoized to match BotCard / HedgeBotCard: a re-render of the parent list
// shouldn't re-render a grid card whose props are referentially unchanged.
export const GridBotCard = React.memo(GridBotCardComponent);
GridBotCard.displayName = 'GridBotCard';
