import { useCallback, type ReactNode } from 'react';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import { BarChart3, Layers, ListFilter } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import type {
  GridCurrency,
  GridFundsSnapshot,
  GridMarketOverviewState,
} from '@/types/bots/grid';

interface MarketOverviewProps {
  state: GridMarketOverviewState;
  onChange: (next: GridMarketOverviewState) => void;
  funds?: GridFundsSnapshot;
  pairLabel: string;
  exchangeLabel: string;
  formatAmount: (
    value: number,
    options?: { currency?: GridCurrency; maximumFractionDigits?: number }
  ) => string;
}

const ToggleRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  icon: ReactNode;
}> = ({ label, description, checked, onCheckedChange, icon }) => (
  <div className="flex items-center justify-between gap-md rounded-lg border border-border/60 bg-background/40 px-4 py-3">
    <div className="flex items-center gap-sm">
      <div className="rounded-md border border-border/50 bg-card/60 p-xs text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-card-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

export const MarketOverview: React.FC<MarketOverviewProps> = ({
  state,
  onChange,
  funds,
  pairLabel,
  exchangeLabel,
  formatAmount,
}) => {
  const reportingCode = useReportingCurrency().currency.code;
  const handleToggle = useCallback(
    (key: keyof GridMarketOverviewState) => (value: boolean) => {
      onChange({
        ...state,
        [key]: value,
      });
    },
    [onChange, state]
  );

  return (
    <Card className="space-y-md border-border/60 bg-card/70 p-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Market Overview Controls
        </h3>
        <p className="text-xs text-muted-foreground">
          Toggle which monitoring panels are visible for {pairLabel} on{' '}
          {exchangeLabel || 'the selected exchange'}.
        </p>
      </div>

      <div className="grid gap-sm">
        <ToggleRow
          label="Trading View Chart"
          description="Show the live market chart with bot orders overlay."
          checked={state.showTradingView}
          onCheckedChange={handleToggle('showTradingView')}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <ToggleRow
          label="Orders Overview"
          description="Display the list of open and completed orders."
          checked={state.showOrders}
          onCheckedChange={handleToggle('showOrders')}
          icon={<Layers className="h-4 w-4" />}
        />
        <ToggleRow
          label="Transactions Feed"
          description="Show the executed transactions with profit metrics."
          checked={state.showTransactions}
          onCheckedChange={handleToggle('showTransactions')}
          icon={<ListFilter className="h-4 w-4" />}
        />
      </div>

      {funds && (
        <div className="grid gap-sm rounded-lg border border-border/60 bg-background/40 p-md text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last Price</span>
            <span className="font-semibold text-card-foreground">
              {formatAmount(funds.lastPrice, {
                currency: 'quote',
                maximumFractionDigits: 4,
              })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{reportingCode} Rate</span>
            <span className="font-semibold text-card-foreground">
              {formatAmount(funds.usdRate, {
                currency: 'usd',
                maximumFractionDigits: 4,
              })}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};

export default MarketOverview;
