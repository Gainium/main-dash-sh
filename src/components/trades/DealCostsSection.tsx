import { Receipt } from 'lucide-react';
import React from 'react';

import { cn } from '@/lib/utils';
import { Card } from '../ui/card';
import { PendingLiveValue } from '../ui/pending-live-value';
import { useDealCosts } from '@/hooks/useTradingCosts';
import { useReportingCurrency } from '@/hooks/useReportingCurrency';
import type { DealCostBreakdown, DealSlippage } from '@/types';
import {
  FEES_ESTIMATED_TOOLTIP,
  SLIPPAGE_RECONSTRUCTED_TOOLTIP,
  axisPos,
  buildCostWaterfall,
  costShareOfGross,
  dealUsdPerQuote,
  fiatTone,
  formatPnlBps,
  formatSignedFiat,
  formatSignedQuote,
  formatTick,
  isFiniteNumber,
  pnlTone,
  type WaterfallStep,
} from '@/utils/tradingCosts';

const STEP_LABEL: Record<WaterfallStep['key'], string> = {
  gross: 'Gross P&L',
  fees: 'Fees',
  slippage: 'Slippage',
  net: 'Net P&L',
};

/** Bar fill: gain = profit, cost = loss; slippage a lighter tint of either. */
const barClass = (step: WaterfallStep): string => {
  const gain = step.value >= 0;
  if (step.key === 'slippage') return gain ? 'bg-profit/60' : 'bg-loss/60';
  return gain ? 'bg-profit' : 'bg-loss';
};

const TONE_CLASS = {
  up: 'text-profit',
  down: 'text-loss',
  neutral: 'text-foreground',
} as const;

/** Row height in px — the dashed connectors are laid out against it. */
const ROW_H = 28;

export interface DealCostWaterfallProps {
  breakdown: DealCostBreakdown | null | undefined;
  slippage: DealSlippage | null | undefined;
  quoteAsset: string;
  /** The deal's profit — its Realized Profit figure (`totalUsd`). */
  profit?: { total?: number | null; totalUsd?: number | null } | undefined;
  privacyMode?: boolean;
}

/**
 * Gross P&L → Fees → Slippage → Net P&L as one horizontal waterfall on a
 * shared axis: each cost bar starts where the previous step ended, dashed
 * connectors mark the step points, and a solid line marks zero.
 *
 * Amounts are shown exactly as the deal's Realized Profit is (USD from the
 * deal's own profit, in the reporting currency, through the same formatter),
 * so Net P&L always reads the same digits as Realized Profit. A deal whose
 * breakdown is not in its profit's unit stays in the quote asset.
 */
export const DealCostWaterfall: React.FC<DealCostWaterfallProps> = ({
  breakdown,
  slippage,
  quoteAsset,
  profit,
  privacyMode = false,
}) => {
  const { currency } = useReportingCurrency();
  const slippageQuote = isFiniteNumber(breakdown?.slippageQuote)
    ? breakdown.slippageQuote
    : slippage?.quote;

  // Quote → shown units: USD per quote from the deal's own profit, then the
  // reporting currency — the path the Realized Profit figure takes.
  const usdPerQuote = dealUsdPerQuote(breakdown?.netQuote, profit);
  const k = usdPerQuote !== undefined ? usdPerQuote * currency.rate : undefined;
  const shown = (q: number | null | undefined) =>
    isFiniteNumber(q) && k !== undefined ? q * k : q;
  const formatShown = (v: number) =>
    k !== undefined
      ? formatSignedFiat(v, currency)
      : formatSignedQuote(v, quoteAsset);
  const toneOf = (v: number) =>
    k !== undefined ? fiatTone(v, currency) : pnlTone(v, quoteAsset);
  const unit = k !== undefined ? currency.code : quoteAsset;

  const waterfall = buildCostWaterfall({
    gross: shown(breakdown?.grossQuote),
    fees: shown(breakdown?.feesQuote),
    slippage: shown(slippageQuote),
    // Net = the Realized Profit value itself.
    net:
      k !== undefined && isFiniteNumber(profit?.totalUsd)
        ? profit.totalUsd * currency.rate
        : shown(breakdown?.netQuote),
  });
  if (!waterfall) return null;
  const { steps } = waterfall;
  const pos = (x: number) => axisPos(waterfall, x);
  const zero = pos(0);

  const estimate = (key: WaterfallStep['key']): string | undefined =>
    key === 'fees' && breakdown?.feesEstimated
      ? FEES_ESTIMATED_TOOLTIP
      : key === 'slippage' && slippage?.reconstructed
        ? SLIPPAGE_RECONSTRUCTED_TOOLTIP
        : undefined;

  // A connector joins each step's end to the next step's start; Net starts
  // at 0, so it is joined where its bar ends (= the last cost's end).
  const connectors = steps.slice(0, -1).map((step, i) => ({
    x: pos(step.to),
    top: (i + 0.5) * ROW_H,
  }));

  const fees = isFiniteNumber(breakdown?.feesQuote) ? breakdown.feesQuote : 0;
  const totalCosts = fees + (isFiniteNumber(slippageQuote) ? slippageQuote : 0);
  const share = costShareOfGross({
    feesQuote: fees,
    slippageQuote: slippageQuote ?? null,
    grossQuote: isFiniteNumber(breakdown?.grossQuote)
      ? breakdown.grossQuote
      : null,
  });
  const avgBps = slippage?.bps;
  const marketOrders = slippage?.orders;
  const summary = [
    `Costs ${formatShown(-(shown(totalCosts) ?? totalCosts))}${
      share !== undefined ? ` (${share.toFixed(1)}% of gross)` : ''
    }`,
    isFiniteNumber(avgBps)
      ? `Avg slippage ${formatPnlBps(avgBps)}${
          isFiniteNumber(marketOrders)
            ? ` over ${marketOrders} market order${marketOrders === 1 ? '' : 's'}`
            : ''
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-sm">
      <div className="relative grid grid-cols-[auto_1fr_auto] gap-x-md items-center">
        {/* Hairline above the Net row, across labels, bars and values. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 border-t border-border/60"
          style={{ top: (steps.length - 1) * ROW_H }}
        />
        {/* Labels */}
        <div className="flex flex-col">
          {steps.map((step) => (
            <div
              key={step.key}
              className="flex items-center text-sm text-muted-foreground whitespace-nowrap"
              style={{ height: ROW_H }}
            >
              {STEP_LABEL[step.key]}
            </div>
          ))}
        </div>

        {/* Bars on the shared axis */}
        <div className="relative" style={{ height: steps.length * ROW_H }}>
          {connectors.map((c, i) => (
            <div
              key={i}
              aria-hidden="true"
              className="absolute border-l border-dashed border-muted-foreground/50"
              style={{ left: `${c.x}%`, top: c.top, height: ROW_H }}
            />
          ))}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-foreground/50"
            style={{ left: `${zero}%` }}
          />
          {steps.map((step, i) => {
            const left = pos(Math.min(step.from, step.to));
            const width = Math.abs(pos(step.to) - pos(step.from));
            const tooltip = estimate(step.key);
            return (
              <div
                key={step.key}
                className={cn(
                  'absolute rounded-sm',
                  barClass(step),
                  tooltip && 'opacity-50'
                )}
                style={{
                  left: `${left}%`,
                  width: `max(${width}%, 1px)`,
                  top: i * ROW_H + ROW_H * 0.25,
                  height: ROW_H * 0.5,
                }}
              />
            );
          })}
        </div>

        {/* Signed values */}
        <div className="flex flex-col items-end">
          {steps.map((step) => {
            const tooltip = estimate(step.key);
            return (
              <div
                key={step.key}
                className={cn(
                  'flex items-center justify-end text-sm font-bold tabular-nums whitespace-nowrap',
                  privacyMode
                    ? 'text-muted-foreground'
                    : TONE_CLASS[toneOf(step.value)]
                )}
                style={{ height: ROW_H }}
              >
                <PendingLiveValue
                  pending={!!tooltip}
                  variant="saved"
                  tooltip={tooltip}
                >
                  {privacyMode ? '***' : formatShown(step.value)}
                </PendingLiveValue>
              </div>
            );
          })}
        </div>

        {/* Axis ticks under the bars, unit at the end */}
        {!privacyMode && (
          <>
            <div />
            <div className="relative h-4 text-xs tabular-nums text-muted-foreground">
              {waterfall.ticks.map((t) => (
                <span
                  key={t}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${pos(t)}%` }}
                >
                  {formatTick(t)}
                </span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {unit}
            </div>
          </>
        )}
      </div>

      {!privacyMode && summary && (
        <div className="text-xs text-muted-foreground">{summary}</div>
      )}
    </div>
  );
};

interface DealCostsSectionProps {
  botId: string;
  dealId: string;
  kind: 'dca' | 'combo';
  quoteAsset: string;
  /** The deal's profit, as its Realized Profit figure shows it. */
  profit?: { total?: number | null; totalUsd?: number | null } | undefined;
  privacyMode?: boolean;
  /** Changes whenever the deal's figures can have moved (fills, close). */
  version?: string;
}

/**
 * The deal's costs, so a deal that closed negative because of fees and
 * slippage reads as such. Renders nothing on a backend without them.
 */
export const DealCostsSection: React.FC<DealCostsSectionProps> = ({
  botId,
  dealId,
  kind,
  quoteAsset,
  profit,
  privacyMode = false,
  version,
}) => {
  const costs = useDealCosts({
    botId,
    dealId,
    kind,
    ...(version !== undefined && { version }),
  });
  const breakdown = costs?.breakdown;
  if (
    !breakdown ||
    ![breakdown.grossQuote, breakdown.netQuote].some((v) => isFiniteNumber(v))
  ) {
    return null;
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-xs">
        <Receipt className="w-5 h-5" />
        Costs
      </h3>
      <Card className="p-md">
        <DealCostWaterfall
          breakdown={breakdown}
          slippage={costs?.slippage}
          quoteAsset={quoteAsset}
          profit={profit}
          privacyMode={privacyMode}
        />
      </Card>
    </div>
  );
};
