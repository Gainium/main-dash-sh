import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import {
  BotTypesEnum,
  CloseGRIDTypeEnum,
  PositionSide,
  type BotSettings,
} from '@/types';
import { isFuturesExchange } from '@/utils/exchangeUtils';
import type { DrawerBot } from '@/types/bots/drawer';
import type { GridBot } from '@/types/gridBot';
import { buildBotEditRoute } from '@/utils/bots/navigation';
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
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useBotDelete,
  useBotStatusToggle,
} from '../../hooks/useBotMutations';
import {
  BotStatusConfirmationModal,
  DeleteConfirmationModal,
  SuccessFeedbackModal,
} from '../modals';
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

export const GridBotCard: React.FC<GridBotCardProps> = ({
  item: bot,
  onClick,
  isSelected = false,
}) => {
  const navigate = useNavigate();
  const resolvePairAsset = useResolvePairAsset();

  // Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [successData, setSuccessData] = useState<{
    type: 'clone' | 'delete';
    newItemId?: string;
    botTypeId?: string;
  } | null>(null);

  // Bot mutations
  const _botTypeEnum = BotTypesEnum.grid;
  const statusToggleMutation = useBotStatusToggle(_botTypeEnum);
  const deleteMutation = useBotDelete();
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

  // Bot action handlers
  const handleEdit = () => {
    navigate(buildBotEditRoute(bot.type, bot.id));
  };

  const handleClone = () => {
    navigate(`/grid/new?load=${bot.id}`);
  };

  const handleStatusToggle = () => {
    setStatusModalOpen(true);
  };

  const handleConfirmStatusChange = (
    closeType?: string,
    cancelPartiallyFilled?: boolean
  ) => {
    const isActive = bot.isActive;
    const newStatus = isActive ? 'closed' : 'open'; // Use 'paused' for grid bots

    statusToggleMutation.mutate(
      {
        id: bot.id,
        status: newStatus,
        closeGridType: closeType as CloseGRIDTypeEnum | undefined,
        cancelPartiallyFilled,
      },
      {
        onSuccess: () => {
          setStatusModalOpen(false);
          toast.success(`Bot ${isActive ? 'stopped' : 'started'} successfully`);
        },
        onError: (error) => {
          console.error('Failed to change bot status:', error);
          toast.error(`Failed to ${isActive ? 'stop' : 'start'} bot`);
        },
      }
    );
  };

  const handleDelete = () => {
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ id: bot.id, type: BotTypesEnum.grid });
      setSuccessData({ type: 'delete' });
      setSuccessModalOpen(true);
    } catch (error) {
      console.error('Failed to delete bot:', error);
    }
  };

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
                disabled={statusToggleMutation.isPending}
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
                disabled={deleteMutation.isPending}
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

      {/* Modals */}
      <BotStatusConfirmationModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        onConfirm={handleConfirmStatusChange}
        botName={bot.name}
        currentStatus={bot.status}
        targetStatus={bot.isActive ? 'closed' : 'open'}
        hasActiveDeals={false} // Grid bots don't have deals in the same way
        botType={BotTypesEnum.grid}
        gridFutures={isFuturesExchange(bot.exchange)}
        gridHasOpenPosition={((bot as GridBot).position?.price ?? 0) !== 0}
        gridIsShort={(bot as GridBot).position?.side === PositionSide.SHORT}
        isLoading={statusToggleMutation.isPending}
      />

      <DeleteConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleConfirmDelete}
        title="Delete Bot"
        description="Are you sure you want to delete this bot? This action cannot be undone."
        itemName={bot.name}
        itemType="bot"
        additionalInfo={{
          activeDeals: 0, // Grid bots don't have deals in the same way
          totalValue: bot.budget || 0,
          currency: quoteAsset || 'USD',
          lastActivity: 'Unknown',
        }}
        isLoading={deleteMutation.isPending}
        requireConfirmation={false}
      />

      <SuccessFeedbackModal
        open={successModalOpen}
        onOpenChange={setSuccessModalOpen}
        type={successData?.type || 'clone'}
        itemName={bot.name}
        itemType="bot"
        newItemId={successData?.newItemId || undefined}
        details={
          successData?.type === 'clone'
            ? {
                originalName: bot.name,
                newName: `${bot.name} (Clone)`,
                botTypeId: successData?.botTypeId ?? bot.type,
              }
            : undefined
        }
      />
    </Card>
  );
};
