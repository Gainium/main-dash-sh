import {
  AlertCircle,
  BarChart3,
  Calendar,
  DollarSign,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { InlineError } from '@/components/ui/inline-error';
import React from 'react';
import type { BacktestData } from '../../hooks/useBacktests';
import logger from '../../lib/loggerInstance';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface BacktestResultsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backtestResult: BacktestData | null;
  botName?: string;
  backtestConfig?: {
    startDate: string;
    endDate: string;
    initialBalance: number;
    timeframe: string;
  };
  isLoading?: boolean;
  error?: string | null;
}

export const BacktestResultsModal: React.FC<BacktestResultsModalProps> = ({
  open,
  onOpenChange,
  backtestResult,
  botName,
  backtestConfig,
  isLoading = false,
  error = null,
}) => {
  const formatCurrency = (value: number | undefined, currency = 'USDT') => {
    if (value === undefined || value === null) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ${currency}`;
  };

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || value === null) return 'N/A';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getProfitColor = (value: number | undefined) => {
    if (value === undefined || value === null) return 'text-gray-500';
    return value >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getProfitIcon = (value: number | undefined) => {
    if (value === undefined || value === null)
      return <BarChart3 className="w-4 h-4" />;
    return value >= 0 ? (
      <TrendingUp className="w-4 h-4 text-green-600" />
    ) : (
      <TrendingDown className="w-4 h-4 text-red-600" />
    );
  };

  const financial = backtestResult?.financial;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Backtest Results
            {botName && <Badge variant="outline">{botName}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {backtestConfig && (
              <div className="flex items-center gap-md text-sm text-muted-foreground mt-2">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(
                    backtestConfig.startDate
                  ).toLocaleDateString()} -{' '}
                  {new Date(backtestConfig.endDate).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  Initial: ${backtestConfig.initialBalance.toLocaleString()}
                </div>
                <div className="flex items-center gap-1">
                  <Target className="w-4 h-4" />
                  {backtestConfig.timeframe} timeframe
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-lg">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-muted-foreground">
                Loading backtest results...
              </span>
            </div>
          )}

          {error && (
            <InlineError title="Backtest Error" message={error} />
          )}

          {backtestResult && !isLoading && !error && (
            <>
              {/* Overall Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-xs">
                    {getProfitIcon(financial?.netProfitTotal)}
                    Overall Performance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-md">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                    <div className="text-center">
                      <div
                        className={`text-2xl font-bold ${getProfitColor(financial?.netProfitTotal)}`}
                      >
                        {formatCurrency(financial?.netProfitTotal)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Net Profit
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className={`text-2xl font-bold ${getProfitColor(financial?.netProfitTotalPerc)}`}
                      >
                        {formatPercent(financial?.netProfitTotalPerc)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Total Return
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {formatPercent(financial?.maxDrawDownPerc)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Max Drawdown
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {financial?.annualizedReturn
                          ? formatPercent(financial.annualizedReturn)
                          : 'N/A'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Annualized Return
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Profit/Loss Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-green-700 flex items-center gap-xs">
                      <TrendingUp className="w-4 h-4" />
                      Profits
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-sm">
                    <div className="flex justify-between">
                      <span className="text-sm">Gross Profit:</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(financial?.grossProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Avg. Profit per Trade:</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(financial?.avgGrossProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Max Profit:</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(financial?.maxDealProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Win Rate:</span>
                      <span className="font-medium">
                        {financial?.grossProfit && financial?.grossLoss
                          ? `${((financial.grossProfit / (financial.grossProfit + Math.abs(financial.grossLoss || 0))) * 100).toFixed(1)}%`
                          : 'N/A'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-red-700 flex items-center gap-xs">
                      <TrendingDown className="w-4 h-4" />
                      Losses
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-sm">
                    <div className="flex justify-between">
                      <span className="text-sm">Gross Loss:</span>
                      <span className="font-medium text-red-600">
                        {formatCurrency(financial?.grossLoss)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Avg. Loss per Trade:</span>
                      <span className="font-medium text-red-600">
                        {formatCurrency(financial?.avgGrossLoss)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Max Loss:</span>
                      <span className="font-medium text-red-600">
                        {formatCurrency(financial?.maxDealLoss)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Profit Factor:</span>
                      <span className="font-medium">
                        {financial?.grossProfit && financial?.grossLoss
                          ? (
                              financial.grossProfit /
                              Math.abs(financial.grossLoss || 1)
                            ).toFixed(2)
                          : 'N/A'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Additional Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle>Additional Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-md text-sm">
                    <div>
                      <div className="text-muted-foreground">
                        Avg. Daily Return
                      </div>
                      <div className="font-medium">
                        {formatPercent(financial?.avgNetDailyPerc)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Max Run-up</div>
                      <div className="font-medium text-green-600">
                        {formatPercent(financial?.maxRunUpPerc)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">
                        Initial Balance
                      </div>
                      <div className="font-medium">
                        $
                        {financial?.initialBalanceUsd?.toLocaleString() ||
                          'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Final Balance</div>
                      <div className="font-medium">
                        $
                        {(
                          financial?.initialBalanceUsd ||
                          0 + (financial?.netProfitTotalUsd || 0)
                        ).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Messages/Warnings */}
              {backtestResult.messages &&
                backtestResult.messages.length > 0 && (
                  <Card className="border-yellow-200 bg-yellow-50">
                    <CardHeader>
                      <CardTitle className="text-yellow-800 flex items-center gap-xs">
                        <AlertCircle className="w-4 h-4" />
                        Backtest Messages
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {backtestResult.messages.map((message, index) => (
                          <li key={index} className="text-yellow-700 text-sm">
                            • {message}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

              {/* No Data Warning */}
              {backtestResult.noData && (
                <Card className="border-orange-200 bg-orange-50">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-xs text-orange-700">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">Limited Data</span>
                    </div>
                    <p className="text-orange-600 mt-2">
                      Backtest completed but with limited historical data.
                      Results may not be representative of actual performance.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {backtestResult && (
            <Button
              onClick={() => {
                // TODO: Navigate to detailed backtest view
                logger.info(
                  'Navigate to detailed backtest view:',
                  backtestResult._id
                );
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              View Detailed Results
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BacktestResultsModal;
