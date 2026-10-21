import { ShieldAlert, Zap } from 'lucide-react';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type {
  GridBotSummaryMetrics,
  GridCurrency,
  GridFundsSnapshot,
  GridLeverageState,
} from '@/types/bots/grid';

interface InfoPanelProps {
  metrics?: GridBotSummaryMetrics;
  funds?: GridFundsSnapshot;
  leverage: GridLeverageState;
  isFuturesBot: boolean;
  formatAmount: (
    value: number,
    options?: { currency?: GridCurrency; maximumFractionDigits?: number }
  ) => string;
}

const InfoRow: React.FC<{
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  accent?: string;
}> = ({ label, value, icon, accent }) => (
  <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
    <div className="flex items-center gap-xs text-muted-foreground">
      {icon}
      <span>{label}</span>
    </div>
    <span className={`font-medium ${accent ?? ''}`}>{value}</span>
  </div>
);

export const InfoPanel: React.FC<InfoPanelProps> = ({
  metrics,
  funds,
  leverage,
  isFuturesBot,
  formatAmount,
}) => {
  const reportingCode = useReportingCurrency().currency.code;
  const transactionsTotal =
    (metrics?.transactions?.buy ?? 0) + (metrics?.transactions?.sell ?? 0);
  const statusLabel = metrics?.status
    ? metrics.status.toLowerCase()
    : 'unknown';
  const statusVariant: React.ComponentProps<typeof Badge>['variant'] =
    statusLabel === 'error'
      ? 'destructive'
      : statusLabel === 'paused'
        ? 'secondary'
        : 'outline';

  const primaryBracket = leverage.brackets[0] as
    | Record<string, unknown>
    | undefined;
  const leverageValueRaw =
    primaryBracket && typeof primaryBracket['leverage'] === 'number'
      ? primaryBracket['leverage']
      : primaryBracket && typeof primaryBracket['initialLeverage'] === 'number'
        ? primaryBracket['initialLeverage']
        : null;
  const leverageValue =
    typeof leverageValueRaw === 'number' ? leverageValueRaw : null;

  const leverageLabel = isFuturesBot
    ? leverage.brackets.length > 0
      ? leverageValue !== null
        ? `${leverageValue}x`
        : 'Available'
      : 'Available'
    : '—';

  return (
    <Card className="space-y-sm border-border/60 bg-card/60 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bot Status
        </h3>
        {metrics?.status && (
          <Badge variant={statusVariant} className="capitalize">
            {statusLabel}
          </Badge>
        )}
      </div>

      {metrics?.statusReason && (
        <div className="flex items-center gap-xs rounded-md border border-destructive/40 bg-destructive/5 p-sm text-xs text-destructive">
          <ShieldAlert className="h-4 w-4" />
          <span>{metrics.statusReason}</span>
        </div>
      )}

      <div className="grid gap-xs">
        <InfoRow label="Working Time" value={metrics?.workingTime ?? '—'} />
        <InfoRow label="Transactions" value={transactionsTotal} />
        <InfoRow
          label={`Daily Profit (${reportingCode})`}
          value={formatAmount(metrics?.dailyProfitUsd ?? 0, {
            currency: 'usd',
            maximumFractionDigits: 2,
          })}
          icon={<Zap className="h-4 w-4 text-warning" />}
        />
        <InfoRow
          label="Market Price"
          value={formatAmount(funds?.lastPrice ?? 0, {
            maximumFractionDigits: 6,
          })}
        />
        <InfoRow
          label={`${reportingCode} Conversion`}
          value={`1 ${funds?.quoteAsset ?? 'QUOTE'} = ${formatAmount(
            funds?.usdRate ?? 0,
            {
              currency: 'usd',
              maximumFractionDigits: 4,
            }
          )}`}
        />
        <InfoRow label="Active Levels" value={metrics?.levels?.active ?? 0} />
        <InfoRow label="Total Levels" value={metrics?.levels?.total ?? 0} />
        <InfoRow label="Leverage" value={isFuturesBot ? leverageLabel : '—'} />
      </div>
    </Card>
  );
};

export default InfoPanel;
