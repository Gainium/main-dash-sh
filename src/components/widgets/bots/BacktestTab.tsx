import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface BacktestTabProps {
  backtestEnabled: boolean;
  setBacktestEnabled: (enabled: boolean) => void;
  backtestConfig: {
    startDate: string;
    endDate: string;
    initialBalance: number;
    timeframe: string;
    commission: number;
    slippage: number;
  };
  setBacktestConfig: (config: BacktestTabProps['backtestConfig']) => void;
}

const BacktestTab: React.FC<BacktestTabProps> = ({
  backtestEnabled,
  setBacktestEnabled,
  backtestConfig,
  setBacktestConfig,
}) => {
  const updateConfig = (
    key: keyof BacktestTabProps['backtestConfig'],
    value: string | number
  ) => {
    setBacktestConfig({
      ...backtestConfig,
      [key]: value,
    });
  };

  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-xs">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            Backtest Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-lg">
          <div className="flex items-center space-x-xs">
            <Checkbox
              id="backtest-enabled"
              checked={backtestEnabled}
              onCheckedChange={setBacktestEnabled}
            />
            <Label htmlFor="backtest-enabled" className="text-sm font-medium">
              Enable backtesting for this bot
            </Label>
          </div>

          {backtestEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
              {/* Date Range */}
              <div className="space-y-md">
                <Label className="text-sm font-medium">Test Period</Label>

                <div className="space-y-xs">
                  <Label
                    htmlFor="start-date"
                    className="text-xs text-muted-foreground"
                  >
                    Start Date
                  </Label>
                  <DateInput
                    id="start-date"
                    value={backtestConfig.startDate}
                    onChange={(value) => updateConfig('startDate', value)}
                  />
                </div>

                <div className="space-y-xs">
                  <Label
                    htmlFor="end-date"
                    className="text-xs text-muted-foreground"
                  >
                    End Date
                  </Label>
                  <DateInput
                    id="end-date"
                    value={backtestConfig.endDate}
                    onChange={(value) => updateConfig('endDate', value)}
                  />
                </div>
              </div>

              {/* Trading Parameters */}
              <div className="space-y-md">
                <Label className="text-sm font-medium">
                  Trading Parameters
                </Label>

                <div className="space-y-xs">
                  <Label
                    htmlFor="initial-balance"
                    className="text-xs text-muted-foreground"
                  >
                    Initial Balance ($)
                  </Label>
                  <Input
                    id="initial-balance"
                    type="number"
                    value={backtestConfig.initialBalance}
                    onChange={(e) =>
                      updateConfig(
                        'initialBalance',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    placeholder="1000"
                  />
                </div>

                <div className="space-y-xs">
                  <Label
                    htmlFor="timeframe"
                    className="text-xs text-muted-foreground"
                  >
                    Timeframe
                  </Label>
                  <Select
                    value={backtestConfig.timeframe}
                    onValueChange={(value) => updateConfig('timeframe', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1m">1 minute</SelectItem>
                      <SelectItem value="5m">5 minutes</SelectItem>
                      <SelectItem value="15m">15 minutes</SelectItem>
                      <SelectItem value="30m">30 minutes</SelectItem>
                      <SelectItem value="1h">1 hour</SelectItem>
                      <SelectItem value="4h">4 hours</SelectItem>
                      <SelectItem value="1d">1 day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-xs">
                  <Label
                    htmlFor="commission"
                    className="text-xs text-muted-foreground"
                  >
                    Commission (%)
                  </Label>
                  <Input
                    id="commission"
                    type="number"
                    step="0.01"
                    value={backtestConfig.commission}
                    onChange={(e) =>
                      updateConfig(
                        'commission',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    placeholder="0.1"
                  />
                </div>

                <div className="space-y-xs">
                  <Label
                    htmlFor="slippage"
                    className="text-xs text-muted-foreground"
                  >
                    Slippage (%)
                  </Label>
                  <Input
                    id="slippage"
                    type="number"
                    step="0.01"
                    value={backtestConfig.slippage}
                    onChange={(e) =>
                      updateConfig('slippage', parseFloat(e.target.value) || 0)
                    }
                    placeholder="0.1"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {backtestEnabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Backtest Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-md text-sm">
              <div>
                <div className="text-muted-foreground">Period</div>
                <div className="font-medium">
                  {backtestConfig.startDate && backtestConfig.endDate
                    ? `${formatDateForDisplay(backtestConfig.startDate)} - ${formatDateForDisplay(backtestConfig.endDate)}`
                    : 'Not set'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Initial Balance</div>
                <div className="font-medium">
                  ${backtestConfig.initialBalance.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Timeframe</div>
                <div className="font-medium">{backtestConfig.timeframe}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Fees</div>
                <div className="font-medium">
                  {(
                    backtestConfig.commission + backtestConfig.slippage
                  ).toFixed(2)}
                  %
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BacktestTab;
