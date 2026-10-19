/* eslint-disable react-refresh/only-export-components */
/**
 * Which long and short deals the hedge take profit / stop loss closed
 * together. Reads `hedgeCloses` from a hedge backtest result (backtester
 * 1.17.0+); results without it render nothing.
 */
import React, { useMemo } from 'react';

import { Chip } from '@/components/ui/chip';
import CoinPair from '@/components/widgets/shared/CoinPair';
import type { BacktestDealRef } from '@/lib/extensions/backtestSources';
import type {
  HedgeBacktestingResult,
  HedgeClose,
  PreparedDeal,
} from '@/types';
import { cn } from '@/lib/utils';

type Leg = 'long' | 'short';

interface ClosedDeal {
  no: number;
  perc: number;
}

/** A deal the hedge closed, with what it closed alongside. */
export interface HedgeClosedDeal {
  close: HedgeClose;
  leg: Leg;
  /** Display numbers (the Deals rail's `#`) of the other leg's deals. */
  partnerNos: number[];
}

export interface HedgeCloseIndex {
  rows: {
    close: HedgeClose;
    long: ClosedDeal[];
    short: ClosedDeal[];
  }[];
  byDealId: Map<string, HedgeClosedDeal>;
}

const dealsById = (deals: PreparedDeal[] | undefined) => {
  const map = new Map<string, ClosedDeal>();
  (deals ?? []).forEach((d, i) => {
    // Same numbering as the Deals rail (viewModel: number ?? index + 1).
    map.set(d.id, { no: d.number ?? i + 1, perc: d.profit?.perc ?? 0 });
  });
  return map;
};

export const buildHedgeCloseIndex = (
  result: HedgeBacktestingResult | null | undefined
): HedgeCloseIndex | null => {
  const closes = result?.hedgeCloses;
  if (!result || !closes) return null;
  const longDeals = dealsById(result.longResult?.deals);
  const shortDeals = dealsById(result.shortResult?.deals);
  const pick = (ids: string[], from: Map<string, ClosedDeal>) =>
    ids.flatMap((id) => {
      const d = from.get(id);
      return d ? [d] : [];
    });

  const byDealId = new Map<string, HedgeClosedDeal>();
  const rows = closes.map((close) => {
    const long = pick(close.longDealIds, longDeals);
    const short = pick(close.shortDealIds, shortDeals);
    for (const id of close.longDealIds) {
      byDealId.set(id, { close, leg: 'long', partnerNos: short.map((d) => d.no) });
    }
    for (const id of close.shortDealIds) {
      byDealId.set(id, { close, leg: 'short', partnerNos: long.map((d) => d.no) });
    }
    return { close, long, short };
  });
  return { rows, byDealId };
};

const fmtPerc = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const ReasonChip: React.FC<{ reason: HedgeClose['reason'] }> = ({ reason }) => (
  <Chip
    variant={reason === 'tp' ? 'success' : 'destructive'}
    chipStyle="soft"
    size="xs"
    className="whitespace-nowrap"
  >
    {reason === 'tp' ? 'Hedge TP' : 'Hedge SL'}
  </Chip>
);

/** Rail badge for a leg's deal list: why the hedge closed it, and with what. */
export const hedgeDealBadge =
  (index: HedgeCloseIndex) =>
  (deal: BacktestDealRef): React.ReactNode => {
    const hit = deal.id ? index.byDealId.get(deal.id) : undefined;
    if (!hit) return null;
    const other = hit.leg === 'long' ? 'short' : 'long';
    return (
      <>
        <ReasonChip reason={hit.close.reason} />
        <span className="whitespace-nowrap">
          {hit.partnerNos.length
            ? `with ${other} ${hit.partnerNos.map((n) => `#${n}`).join(', ')}`
            : `no ${other} open`}
        </span>
      </>
    );
  };

const LegCell: React.FC<{ deals: ClosedDeal[] }> = ({ deals }) =>
  deals.length ? (
    <span className="flex flex-col">
      {deals.map((d) => (
        <span
          key={d.no}
          className={cn(
            'tabular-nums',
            d.perc >= 0 ? 'text-success' : 'text-destructive'
          )}
        >
          <span className="text-muted-foreground">#{d.no} </span>
          {fmtPerc(d.perc)}
        </span>
      ))}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

export const HedgeClosesTab: React.FC<{ index: HedgeCloseIndex }> = ({
  index,
}) => {
  const rows = useMemo(
    () => [...index.rows].sort((a, b) => b.close.time - a.close.time),
    [index.rows]
  );
  const tp = rows.filter((r) => r.close.reason === 'tp').length;

  if (!rows.length) {
    return (
      <p className="px-md py-lg text-sm text-muted-foreground">
        The hedge take profit and stop loss didn't close any pair in this
        backtest.
      </p>
    );
  }

  return (
    <div className="space-y-md">
      <div className="grid grid-cols-2 gap-sm sm:grid-cols-3">
        {[
          ['Hedge TP closes', tp],
          ['Hedge SL closes', rows.length - tp],
          [
            'Deals closed',
            rows.reduce((n, r) => n + r.long.length + r.short.length, 0),
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/40 px-md py-sm">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-lg font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="px-md py-sm font-medium">Pair</th>
              <th className="px-sm py-sm font-medium">Closed</th>
              <th className="px-sm py-sm font-medium">Long</th>
              <th className="px-sm py-sm font-medium">Short</th>
              <th className="px-sm py-sm font-medium">Hedge</th>
              <th className="px-md py-sm font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.close.pair}-${r.close.time}-${i}`}
                className="border-t border-border/60 align-top"
              >
                <td className="px-md py-sm">
                  <CoinPair
                    pair={r.close.pair}
                    iconSize="sm"
                    layout="horizontal"
                    textVariant="symbol"
                  />
                </td>
                <td className="px-sm py-sm tabular-nums text-muted-foreground">
                  {fmtTime(r.close.time)}
                </td>
                <td className="px-sm py-sm">
                  <LegCell deals={r.long} />
                </td>
                <td className="px-sm py-sm">
                  <LegCell deals={r.short} />
                </td>
                <td className="px-sm py-sm tabular-nums">
                  {fmtPerc(r.close.perc)}
                </td>
                <td className="px-md py-sm">
                  <ReasonChip reason={r.close.reason} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
