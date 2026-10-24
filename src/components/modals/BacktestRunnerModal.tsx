import React, { useCallback, useState } from 'react';
import { Button } from '../ui/button';
import { DateInput } from '../ui/date-input';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
/* import {
  useRunBacktest,
  prepareBacktestInput,
} from '../../hooks/useBacktestMutations'; */
import { useAuthStore } from '../../stores/authStore';

import { Alert, AlertDescription } from '../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Play,
  Calendar,
  AlertCircle,
  RefreshCw,
  BarChart3,
  Clock,
} from 'lucide-react';
import type { DrawerBot } from '@/types/bots/drawer';

interface BacktestRunnerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botId: string;
  botName?: string;
  botSymbol?: string;
  bot?: DrawerBot; // Add full bot object for backend integration
  onRunBacktest?: (config: BacktestConfig) => void;
}

interface BacktestConfig {
  startDate: string;
  endDate: string;
  initialBalance: number;
  timeframe: string;
  includeCommissions: boolean;
  slippagePercent: number;
}

const TIMEFRAME_OPTIONS = [
  {
    value: '1m',
    label: '1 Minute',
    description: 'Most accurate, slower execution',
  },
  {
    value: '5m',
    label: '5 Minutes',
    description: 'Good balance of speed and accuracy',
  },
  {
    value: '15m',
    label: '15 Minutes',
    description: 'Faster execution, less precise',
  },
  {
    value: '1h',
    label: '1 Hour',
    description: 'Fast execution, general trends only',
  },
];

const PRESET_PERIODS = [
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 3 Months', days: 90 },
  { label: 'Last 6 Months', days: 180 },
  { label: 'Last Year', days: 365 },
];

export const BacktestRunnerModal: React.FC<BacktestRunnerModalProps> = ({
  open,
  onOpenChange,
  botName,
  botSymbol,
  bot,
  onRunBacktest,
}) => {
  const [config, setConfig] = useState<BacktestConfig>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // Today
    initialBalance: 1000,
    timeframe: '5m',
    includeCommissions: true,
    slippagePercent: 0.1,
  });

  const [isRunning, setIsRunning] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Backend integration hooks
  /* const runBacktestMutation = useRunBacktest(); */
  const { user } = useAuthStore();

  const calculateEstimatedTime = useCallback(() => {
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    const days = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    let multiplier = 1;
    switch (config.timeframe) {
      case '1m':
        multiplier = 4;
        break;
      case '5m':
        multiplier = 1;
        break;
      case '15m':
        multiplier = 0.5;
        break;
      case '1h':
        multiplier = 0.2;
        break;
    }

    const estimatedMinutes = Math.ceil(days * multiplier);

    if (estimatedMinutes < 1) {
      setEstimatedTime('< 1 minute');
    } else if (estimatedMinutes < 60) {
      setEstimatedTime(`~${estimatedMinutes} minutes`);
    } else {
      const hours = Math.floor(estimatedMinutes / 60);
      const mins = estimatedMinutes % 60;
      setEstimatedTime(`~${hours}h ${mins}m`);
    }
  }, [config.startDate, config.endDate, config.timeframe]);

  React.useEffect(() => {
    calculateEstimatedTime();
  }, [calculateEstimatedTime]);

  const handlePresetPeriod = (days: number) => {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    setConfig((prev) => ({
      ...prev,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    }));
  };

  const handleRunBacktest = async () => {
    if (!bot || !user?.id) {
      setError('Bot information or user authentication is missing');
      return;
    }

    setIsRunning(true);
    setError('');

    try {
      // Prepare backtest input for backend
      //TODO: rebuild to use correct input
      /* const backtestInput = prepareBacktestInput(bot, config, user.id);

      // Run backtest via backend API
      await runBacktestMutation.mutateAsync(backtestInput); */

      // Call the callback with config for UI updates
      onRunBacktest?.(config);

      // Close modal on success
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Failed to run backtest:', error);
      setError(
        (error as Error).message || 'Failed to run backtest. Please try again.'
      );
    } finally {
      setIsRunning(false);
    }
  };

  const isValidDateRange = () => {
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    const now = new Date();

    return start < end && end <= now && start >= new Date('2020-01-01');
  };

  const getDaysInRange = () => {
    const start = new Date(config.startDate);
    const end = new Date(config.endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[95vh] overflow-y-auto custom-scrollbar">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-xs">
            <BarChart3 className="w-5 h-5 text-white" />
            Run Backtest
          </DialogTitle>
          <DialogDescription>
            Test how {botName || 'this bot'} would have performed with
            historical data
            {botSymbol && ` on ${botSymbol}`}.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 space-y-lg">
          {/* Quick Presets */}
          <div className="space-y-sm">
            <Label className="text-sm font-medium">Quick Time Periods</Label>
            <div className="flex flex-wrap gap-xs">
              {PRESET_PERIODS.map((preset) => (
                <Button
                  key={preset.days}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetPeriod(preset.days)}
                  className="text-xs"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-md">
            <Label className="text-sm font-medium">Custom Date Range</Label>
            <div className="grid grid-cols-2 gap-md">
              <div className="space-y-xs">
                <Label htmlFor="start-date" className="text-xs">
                  Start Date
                </Label>
                <DateInput
                  id="start-date"
                  value={config.startDate}
                  onChange={(startDate) =>
                    setConfig((prev) => ({
                      ...prev,
                      startDate,
                    }))
                  }
                  max={config.endDate}
                  min="2020-01-01"
                />
              </div>
              <div className="space-y-xs">
                <Label htmlFor="end-date" className="text-xs">
                  End Date
                </Label>
                <DateInput
                  id="end-date"
                  value={config.endDate}
                  onChange={(endDate) =>
                    setConfig((prev) => ({ ...prev, endDate }))
                  }
                  min={config.startDate}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            {isValidDateRange() && (
              <div className="flex items-center gap-xs text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>{getDaysInRange()} days selected</span>
              </div>
            )}
            {!isValidDateRange() && (
              <Alert className="border-red-500">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription className="text-xs">
                  Please select a valid date range. Start date must be before
                  end date and not in the future.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Initial Balance */}
          <div className="space-y-xs">
            <Label htmlFor="initial-balance" className="text-sm font-medium">
              Initial Balance (USDT)
            </Label>
            <Input
              id="initial-balance"
              type="number"
              value={config.initialBalance}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  initialBalance: parseFloat(e.target.value) || 0,
                }))
              }
              min="100"
              max="1000000"
              step="100"
            />
            <p className="text-xs text-muted-foreground">
              The starting balance for the backtest simulation
            </p>
          </div>

          {/* Timeframe */}
          <div className="space-y-sm">
            <Label className="text-sm font-medium">Timeframe</Label>
            <Select
              value={config.timeframe}
              onValueChange={(value) =>
                setConfig((prev) => ({ ...prev, timeframe: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="custom-scrollbar">
                {TIMEFRAME_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="flex-col items-start p-sm"
                  >
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {option.description}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advanced Settings */}
          <div className="space-y-md pt-4 border-t">
            <Label className="text-sm font-medium">Advanced Settings</Label>

            <div className="space-y-sm">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium">
                    Include Trading Fees
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Factor in exchange commissions (0.1% per trade)
                  </p>
                </div>
                <Checkbox
                  checked={config.includeCommissions}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => ({
                      ...prev,
                      includeCommissions: checked === true,
                    }))
                  }
                />
              </div>

              <div className="space-y-xs">
                <Label htmlFor="slippage" className="text-xs font-medium">
                  Slippage (%)
                </Label>
                <Input
                  id="slippage"
                  type="number"
                  value={config.slippagePercent}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      slippagePercent: parseFloat(e.target.value) || 0,
                    }))
                  }
                  min="0"
                  max="5"
                  step="0.1"
                />
                <p className="text-xs text-muted-foreground">
                  Price impact simulation (0.1% is typical)
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Alert className="border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Estimated Time */}
          {estimatedTime && !error && (
            <Alert>
              <Clock className="w-4 h-4" />
              <AlertDescription className="text-xs">
                <strong>Estimated execution time:</strong> {estimatedTime}
                <br />
                <span className="text-muted-foreground">
                  Actual time may vary based on server load and data
                  availability.
                </span>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <div className="flex flex-col sm:flex-row gap-sm w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none"
              disabled={isRunning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRunBacktest}
              disabled={
                !isValidDateRange() ||
                config.initialBalance < 100 ||
                isRunning ||
                !bot ||
                !user?.id
              }
              className="flex-1 sm:flex-none"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Running Backtest...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Backtest
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BacktestRunnerModal;
