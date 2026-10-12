import { AlertTriangle, ArrowRight, ArrowUpDown } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';

import {
  reverseErrorMessage,
  useBotReverse,
  useReverseBotPreview,
  type ReverseBotPreview,
  type ReverseBotType,
} from './reverseBotApi';

export interface ReverseBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botId: string;
  botType: ReverseBotType;
  botName: string;
  /** Quote asset of the bot's pair (order size unit). */
  quoteAsset?: string;
  /** Base asset of the bot's pair (order size unit). */
  baseAsset?: string;
}

const START_LABEL: Record<string, string> = {
  ASAP: 'Opens at start',
  Manual: 'Manual',
  TradingviewSignals: 'Webhook signal',
  Timer: 'Timer',
  TechnicalIndicators: 'Indicator conditions',
};

const sideTone = (side: string) =>
  side === 'LONG' ? 'text-success' : 'text-destructive';

const pnlTone = (v: number | null | undefined) =>
  v === null || v === undefined
    ? 'text-muted-foreground'
    : v >= 0
      ? 'text-success'
      : 'text-destructive';

const signedUsd = (v: number) => `${v >= 0 ? '+' : ''}${formatCurrency(v)}`;

const fmtNum = (v: number) =>
  v >= 1000
    ? v.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : v.toLocaleString('en-US', { maximumSignificantDigits: 6 });

function sizeUnit(
  type: string | null,
  quote?: string,
  base?: string
): string {
  switch (type) {
    case 'base':
      return base ? ` ${base}` : '';
    case 'quote':
      return quote ? ` ${quote}` : '';
    case 'usd':
      return ' USD';
    case 'percTotal':
      return '% of total';
    case 'percFree':
      return '% of free';
    default:
      return '';
  }
}

const Row: React.FC<{ label: string; tooltip?: string; children: React.ReactNode }> = ({
  label,
  tooltip,
  children,
}) => (
  <div className="flex items-center justify-between gap-md py-1 text-sm">
    <span className="flex items-center gap-1 text-muted-foreground">
      {label}
      {tooltip && (
        <Tooltip tooltip={tooltip}>
          <InfoIcon />
        </Tooltip>
      )}
    </span>
    <span className="text-right font-medium tabular-nums text-card-foreground">
      {children}
    </span>
  </div>
);

const Section: React.FC<{ title: string; tooltip?: string; children: React.ReactNode }> = ({
  title,
  tooltip,
  children,
}) => (
  <div className="rounded-lg border border-border/60 px-3 py-2">
    <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
      {tooltip && (
        <Tooltip tooltip={tooltip}>
          <InfoIcon />
        </Tooltip>
      )}
    </div>
    {children}
  </div>
);

function Steps({ p, start }: { p: ReverseBotPreview; start: boolean }) {
  const n = p.deals.length;
  const steps = [
    p.running ? 'Stop the bot' : null,
    n ? `Close ${n} deal${n > 1 ? 's' : ''} at market` : null,
    'Wait for a flat position',
    `Switch to ${p.to}`,
    start ? 'Start the bot' : null,
  ].filter(Boolean) as string[];
  return (
    <ol className="space-y-0.5 text-sm">
      {steps.map((s, i) => (
        <li key={s} className="flex gap-sm">
          <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">
            {i + 1}.
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export const ReverseBotDialog: React.FC<ReverseBotDialogProps> = ({
  open,
  onOpenChange,
  botId,
  botType,
  botName,
  quoteAsset,
  baseAsset,
}) => {
  const preview = useReverseBotPreview(botId, botType, open);
  const reverse = useBotReverse(botType);
  const [start, setStart] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFailure(null);
      setStart(true);
    }
  }, [open]);

  const p = preview.data;
  const busy = reverse.isPending;
  const blocked = !p || !!p.refusal || preview.isFetching;

  const confirm = () => {
    setFailure(null);
    reverse.mutate(
      { botId, start },
      {
        onSuccess: (res) => {
          if (res.ok) {
            toast.success(res.message);
            onOpenChange(false);
          } else {
            setFailure(res.message);
            toast.error(`Reverse stopped: ${res.message}`);
          }
        },
        onError: (e) => {
          const msg = reverseErrorMessage(e);
          setFailure(msg);
          toast.error(`Reverse failed: ${msg}`);
        },
      }
    );
  };

  const nb = p?.newBot;
  const unit = sizeUnit(nb?.orderSizeType ?? null, quoteAsset, baseAsset);
  const indicatorWarning = p?.warnings.find((w) => w.includes('NOT mirrored'));
  const otherWarnings = (p?.warnings ?? []).filter(
    (w) => w !== indicatorWarning && w !== 'This bot is stopped.'
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-sm">
            <ArrowUpDown className="h-4 w-4" />
            {p ? `Reverse to ${p.to}` : 'Reverse bot'}
          </DialogTitle>
          <div className="flex items-center gap-sm text-sm">
            <span className="truncate font-medium">{botName}</span>
            {p && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold">
                <span className={sideTone(p.from)}>{p.from}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className={sideTone(p.to)}>{p.to}</span>
              </span>
            )}
          </div>
        </DialogHeader>

        {preview.isLoading && (
          <div className="space-y-sm" aria-busy="true">
            <div className="h-16 animate-pulse rounded-xl bg-muted/20" />
            <div className="h-24 animate-pulse rounded-xl bg-muted/20" />
            <div className="h-24 animate-pulse rounded-xl bg-muted/20" />
          </div>
        )}

        {preview.isError && (
          <Alert variant="destructive">
            <AlertDescription>{reverseErrorMessage(preview.error)}</AlertDescription>
          </Alert>
        )}

        {p?.refusal && (
          <Alert variant="destructive">
            <AlertDescription>{p.refusal}</AlertDescription>
          </Alert>
        )}

        {p && !p.refusal && nb && (
          <div className="space-y-2">
            <Section
              title="Steps"
              tooltip="If the deal does not close or the position does not go flat within about a minute, the bot stays stopped in its current direction and nothing is reversed."
            >
              <Steps p={p} start={start} />
            </Section>

            {p.deals.length > 0 && (
              <Section
                title="Closing"
                tooltip="Estimated P&L after fees at the current price, the same figure as the deals table. A market order can fill at a different price."
              >
                {p.deals.map((d) => (
                  <div
                    key={d.dealId}
                    className="flex items-center justify-between gap-md py-1 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{d.symbol}</span>{' '}
                      <span className={cn('text-xs font-semibold', sideTone(d.side))}>
                        {d.side}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {fmtNum(d.size)}
                        {d.avgPrice ? ` @ ${fmtNum(d.avgPrice)}` : ''}
                      </span>
                    </span>
                    {d.unrealizedUsd !== null && (
                      <span className={cn('text-right tabular-nums', pnlTone(d.unrealizedUsd))}>
                        {signedUsd(d.unrealizedUsd)}
                        {d.unrealizedPerc !== null && (
                          <span className="block text-xs">
                            {d.unrealizedPerc >= 0 ? '+' : ''}
                            {d.unrealizedPerc.toFixed(2)}%
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                ))}
                {p.totalUnrealizedUsd !== null && (
                  <div className="mt-1 border-t border-border/50 pt-1">
                    <Row
                      label={p.pnlComplete ? 'Est. P&L on close' : 'Est. P&L (partial)'}
                    >
                      <span className={pnlTone(p.totalUnrealizedUsd)}>
                        {signedUsd(p.totalUnrealizedUsd)}
                      </span>
                    </Row>
                    {!!p.totalRealizedUsd && (
                      <Row
                        label="Already realized"
                        tooltip="Profit these deals already booked from partial take profits. It stays in the bot's history."
                      >
                        <span className={pnlTone(p.totalRealizedUsd)}>
                          {signedUsd(p.totalRealizedUsd)}
                        </span>
                      </Row>
                    )}
                  </div>
                )}
              </Section>
            )}

            <Section
              title={`Starts as ${p.to}`}
              tooltip="Same settings, amounts, leverage and history. Take profit and stop loss keep their percentages and apply to the new side."
            >
              {nb.leverage !== null && (
                <Row label="Leverage">
                  {nb.leverage}x{nb.marginType && nb.marginType !== 'inherit' ? ` ${nb.marginType}` : ''}
                </Row>
              )}
              {nb.baseOrderSize && (
                <Row label="Base order">
                  {nb.baseOrderSize}
                  {unit}
                </Row>
              )}
              {nb.useDca && nb.orderSize && (
                <Row label="Safety orders">
                  {nb.ordersCount ? `${nb.ordersCount} × ` : ''}
                  {nb.orderSize}
                  {unit}
                </Row>
              )}
              {nb.useTp && nb.tpPerc && <Row label="Take profit">{nb.tpPerc}%</Row>}
              {nb.useSl && nb.slPerc && <Row label="Stop loss">{nb.slPerc}%</Row>}
              {nb.startCondition && (
                <Row label="First deal">
                  {START_LABEL[nb.startCondition] ?? nb.startCondition}
                </Row>
              )}
            </Section>

            {p.indicators.length > 0 && (
              <Section
                title="Indicators unchanged"
                tooltip={indicatorWarning ?? 'Indicator conditions are not mirrored.'}
              >
                <ul className="space-y-0.5 text-sm">
                  {p.indicators.map((i) => (
                    <li key={i} className="flex items-start gap-sm">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {otherWarnings.map((w) => (
              <div key={w} className="flex items-start gap-sm text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}

            <label className="flex cursor-pointer items-center gap-sm text-sm">
              <Checkbox
                checked={start}
                onCheckedChange={(v) => setStart(v === true)}
                disabled={busy}
              />
              Start the bot after reversing
            </label>
          </div>
        )}

        {failure && (
          <Alert variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:items-center">
          {p && !p.refusal && p.deals.length > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              A market close cannot be undone.
            </span>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="w-full text-sm sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={blocked || busy}
            className="w-full text-sm sm:w-auto"
          >
            {busy ? (
              <>
                <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent sm:h-4 sm:w-4" />
                Reversing…
              </>
            ) : (
              <>
                <ArrowUpDown className="mr-1 h-4 w-4" />
                {p ? `Reverse to ${p.to}` : 'Reverse'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
