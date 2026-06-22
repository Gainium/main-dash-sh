import {
  BotTypesEnum,
  StrategyEnum,
  type AddFundsSettings,
  type DCAGrid,
  type TransactionChart,
} from '@/types';
import type { ViewOrder } from '@/types/bots';
import type { SmartViewOrder } from '@/hooks/bots/dca/useDealSmartOrders';
import { extractPairAssets } from '@/utils/pairs';
import { Activity, Clock, DollarSign, Layers } from 'lucide-react';
import React from 'react';
import { formatCurrency, formatPercentage } from '../../lib/utils';
import { formatNumber } from '../../utils/numberFormatter';
import { Card } from '../ui/card';
import {
  BotTypeChip,
  ExchangeChip,
  ProfitAndPerc,
  StatusChip,
  StrategyChip,
} from '../ui/chip';
import { DealOrdersSection } from './DealOrdersSection';

interface TradeDetailContentProps {
  trade: {
    id: string;
    type: 'DCA' | 'Combo' | 'Hedge DCA' | 'Hedge Combo' | 'Grid' | 'Terminal';
    symbol:
      | string
      | {
          symbol: string;
          baseAsset: string;
          quoteAsset: string;
        };
    strategy: string;
    status: string;
    exchange: string;
    exchangeUUID?: string;
    botName?: string | undefined;
    botId?: string; // Added to support orders fetching
    currentBalance: {
      base: number;
      quote: number;
    };
    usage: {
      current: {
        base: number;
        quote: number;
      };
      currentUsd?: number;
      max?: {
        base: number;
        quote: number;
      };
      maxUsd?: number;
    };
    profit?:
      | {
          total: number;
          totalUsd: number;
          pureBase: number;
          pureQuote: number;
        }
      | undefined;
    funding?:
      | {
          total: number;
          totalUsd: number;
          lastTime?: number;
        }
      | undefined;
    unrealizedProfit?: number | undefined;
    avgPrice?: number | undefined;
    levels: {
      complete: number;
      all: number;
    };
    created?: number | undefined;
  };
  privacyMode?: boolean;
  showChips?: boolean;
  pendingOrders: ViewOrder[];
  completedOrders: ViewOrder[];
  isLoadingOrders: boolean;
  chartOrders?: DCAGrid[];
  chartTransactions?: TransactionChart[];
  smartOrders?: SmartViewOrder[];
  strategy?: StrategyEnum;
  pendingAddFunds?: (AddFundsSettings & { id: string })[];
  pendingReduceFunds?: (AddFundsSettings & { id: string })[];
}

export const TradeDetailContent: React.FC<TradeDetailContentProps> = ({
  trade,
  privacyMode = false,
  showChips = false,
  pendingOrders,
  completedOrders,
  isLoadingOrders,
  chartOrders,
  chartTransactions,
  smartOrders,
  strategy,
  pendingAddFunds,
  pendingReduceFunds,
}) => {
  const progressPercentage =
    trade.levels.all > 0 ? (trade.levels.complete / trade.levels.all) * 100 : 0;

  const normalizedStatus = String(trade.status || '').toLowerCase();
  const isClosedTrade = ['closed', 'cancelled', 'canceled'].includes(
    normalizedStatus
  );

  // Extract symbol string
  const symbolString =
    typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;

  const { baseAsset, quoteAsset } = extractPairAssets(symbolString);

  // Convert type to match BotTypeChip expectations
  const getBotType = (type: string): BotTypesEnum => {
    switch (type) {
      case 'DCA':
        return BotTypesEnum.dca;
      case 'Combo':
        return BotTypesEnum.combo;
      case 'Hedge DCA':
        return BotTypesEnum.hedgeDca;
      case 'Hedge Combo':
        return BotTypesEnum.hedgeCombo;
      case 'Grid':
        return BotTypesEnum.grid;
      case 'Terminal':
        return BotTypesEnum.dca;
      default:
        return BotTypesEnum.dca;
    }
  };

  return (
    <div className="space-y-lg">
      {/* Status and Type Section */}
      {showChips && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">Type</div>
              <BotTypeChip
                botType={getBotType(trade.type)}
                size="sm"
                chipStyle="solid"
              />
            </div>
          </Card>

          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">Status</div>
              <StatusChip status={trade.status} size="sm" chipStyle="solid" />
            </div>
          </Card>

          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">Strategy</div>
              <StrategyChip
                strategy={trade.strategy}
                size="sm"
                chipStyle="solid"
              />
            </div>
          </Card>

          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">Exchange</div>
              <ExchangeChip
                exchangeId={trade.exchangeUUID || trade.exchange}
                size="sm"
                chipStyle="solid"
              />
            </div>
          </Card>
        </div>
      )}

      {/* Bot Name if available */}
      {trade.botName && (
        <Card className="p-md">
          <div className="space-y-xs">
            <div className="text-sm text-muted-foreground">Bot Name</div>
            <div className="font-medium">{trade.botName}</div>
          </div>
        </Card>
      )}

      {/* Profit & Loss Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-xs">
          <DollarSign className="w-5 h-5" />
          Profit & Loss
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">
                Realized Profit
              </div>
              <ProfitAndPerc
                value={trade.profit?.totalUsd || 0}
                percentage={
                  trade.usage.currentUsd
                    ? ((trade.profit?.totalUsd || 0) / trade.usage.currentUsd) *
                      100
                    : 0
                }
                privacyMode={privacyMode}
                chipPosition="right"
                size="lg"
              />
              <div className="text-sm text-muted-foreground">
                {formatNumber(trade.profit?.pureBase || 0, false)} {baseAsset} /{' '}
                {formatNumber(trade.profit?.pureQuote || 0, false)} {quoteAsset}
              </div>
            </div>
          </Card>

          {trade.unrealizedProfit !== undefined && !isClosedTrade && (
            <Card className="p-md">
              <div className="space-y-xs">
                <div className="text-sm text-muted-foreground">
                  Unrealized Profit
                </div>
                <ProfitAndPerc
                  value={trade.unrealizedProfit}
                  percentage={
                    trade.usage.currentUsd
                      ? (trade.unrealizedProfit / trade.usage.currentUsd) * 100
                      : 0
                  }
                  privacyMode={privacyMode}
                  chipPosition="right"
                  size="lg"
                />
              </div>
            </Card>
          )}

          {!!trade.funding?.totalUsd && (
            <Card className="p-md">
              <div className="space-y-xs">
                <div className="text-sm text-muted-foreground">
                  Funding Fees
                </div>
                <ProfitAndPerc
                  value={trade.funding.totalUsd}
                  percentage={
                    trade.usage.currentUsd
                      ? (trade.funding.totalUsd / trade.usage.currentUsd) * 100
                      : 0
                  }
                  privacyMode={privacyMode}
                  chipPosition="right"
                  size="lg"
                />
                {trade.funding.lastTime ? (
                  <div className="text-sm text-muted-foreground">
                    Last funding {new Date(trade.funding.lastTime).toLocaleString()}
                  </div>
                ) : null}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Balance & Usage Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-xs">
          <Activity className="w-5 h-5" />
          Balance & Usage
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">
                Current Balance
              </div>
              <div className="space-y-1">
                <div className="font-medium">
                  {privacyMode
                    ? '***'
                    : formatNumber(trade.currentBalance.base, false)}{' '}
                  {baseAsset}
                </div>
                <div className="font-medium">
                  {privacyMode
                    ? '***'
                    : formatNumber(trade.currentBalance.quote, false)}{' '}
                  {quoteAsset}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">Current Usage</div>
              <div className="space-y-1">
                <div className="font-medium">
                  {privacyMode
                    ? '***'
                    : formatNumber(trade.usage.current.base, false)}{' '}
                  {baseAsset}
                </div>
                <div className="font-medium">
                  {privacyMode
                    ? '***'
                    : formatNumber(trade.usage.current.quote, false)}{' '}
                  {quoteAsset}
                </div>
                {trade.usage.currentUsd && (
                  <div className="text-sm text-muted-foreground">
                    ≈{' '}
                    {privacyMode
                      ? '***'
                      : formatCurrency(trade.usage.currentUsd, 2)}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {trade.usage.max && (
            <Card className="p-md">
              <div className="space-y-xs">
                <div className="text-sm text-muted-foreground">Max Usage</div>
                <div className="space-y-1">
                  <div className="font-medium">
                    {privacyMode
                      ? '***'
                      : formatNumber(trade.usage.max.base, false)}{' '}
                    {baseAsset}
                  </div>
                  <div className="font-medium">
                    {privacyMode
                      ? '***'
                      : formatNumber(trade.usage.max.quote, false)}{' '}
                    {quoteAsset}
                  </div>
                  {trade.usage.maxUsd && (
                    <div className="text-sm text-muted-foreground">
                      ≈{' '}
                      {privacyMode
                        ? '***'
                        : formatCurrency(trade.usage.maxUsd, 2)}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Price Information */}
      {trade.avgPrice && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-xs">
            <DollarSign className="w-5 h-5" />
            Price Information
          </h3>
          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">Average Price</div>
              <div className="text-2xl font-bold">
                {formatCurrency(trade.avgPrice, 2)} {quoteAsset}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Levels Progress */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-xs">
          <Layers className="w-5 h-5" />
          Progress
        </h3>
        <Card className="p-md">
          <div className="space-y-md">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Levels Completed
              </div>
              <div className="font-medium">
                {trade.levels.complete} / {trade.levels.all}
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="text-sm text-muted-foreground text-center">
              {formatPercentage(progressPercentage / 100)}
            </div>
          </div>
        </Card>
      </div>

      {/* Created Time */}
      {trade.created && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-xs">
            <Clock className="w-5 h-5" />
            Timeline
          </h3>
          <Card className="p-md">
            <div className="space-y-xs">
              <div className="text-sm text-muted-foreground">Created</div>
              <div className="font-medium">
                {new Date(trade.created).toLocaleString()}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Orders Section */}
      {trade.botId ? (
        <DealOrdersSection
          dealId={trade.id}
          botId={trade.botId}
          botType={trade.type}
          exchange={trade.exchange}
          completedOrders={completedOrders}
          pendingOrders={pendingOrders}
          isLoadingOrders={isLoadingOrders}
          chartOrders={chartOrders}
          chartTransactions={chartTransactions}
          smartOrders={smartOrders}
          {...(strategy && { strategy })}
          {...(pendingAddFunds && { pendingAddFunds })}
          {...(pendingReduceFunds && { pendingReduceFunds })}
        />
      ) : (
        import.meta.env.DEV && (
          <Card className="p-lg">
            <div className="text-sm text-muted-foreground">
              Orders section unavailable: botId is missing from trade data
              <br />
              <span className="text-xs">Deal ID: {trade.id}</span>
            </div>
          </Card>
        )
      )}
    </div>
  );
};
