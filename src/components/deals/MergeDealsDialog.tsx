import React from 'react';
import { Merge } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { fetchDealOrders } from '@/hooks/useDealOrders';
import getLatestPrices from '@/helper/price';
import { useDcaBotsStore } from '@/stores/live';
import { BotTypesEnum, type DCABotSettings } from '@/types';
import { formatBalance } from '@/utils/numberFormatter';
import { formatPairPrice } from '@/utils/formatters';
import type { DealRef } from '@/features/deals/actions/dealRef';
import {
  dealMergeFigures,
  exitAlreadyReached,
  mergedFigures,
  mergeExit,
  type DealMergeFigures,
  type MergeExit,
} from './mergeDealsPreview';

export interface MergeDealsOptions {
  useTp: boolean;
  useSl: boolean;
}

export interface MergeDealsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected deals; the merged deal lands in the first one's bot. */
  deals: DealRef[];
  onConfirm: (options: MergeDealsOptions) => void;
  isProcessing?: boolean;
}

/** Prices in full: two averages a few dollars apart must not both read `81K`. */
const fmt = (v: number | undefined) =>
  typeof v === 'number' && isFinite(v) ? formatPairPrice(v) : '';

/** Live price for one pair, while `enabled`. */
function useLivePrice(symbol: string, enabled: boolean) {
  const [price, setPrice] = React.useState<number | undefined>();
  React.useEffect(() => {
    if (!enabled) return;
    return getLatestPrices((result) => {
      if (result.status === 'OK') {
        const match = result.data.find((p) => p.symbol === symbol);
        if (match && match.price > 0) setPrice(match.price);
      }
    }, false);
  }, [enabled, symbol]);
  return price;
}

interface ChartLine {
  key: string;
  price: number;
  label: string;
  className: string;
  dash?: string | undefined;
  width?: number | undefined;
}

const CHART_H = 132;
const LABEL_GAP = 12;

/**
 * Thumbnail of the price levels: each deal's average, the merged average, the
 * market and the exits the merged deal would carry.
 */
function MergeLevelsChart({ lines }: { lines: ChartLine[] }) {
  if (lines.length < 2) return null;
  const prices = lines.map((l) => l.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo || hi * 0.01) * 0.12;
  const y = (p: number) =>
    8 + ((hi + pad - p) / (hi - lo + 2 * pad)) * (CHART_H - 16);

  // Labels never overlap: walk them top-down and push each below the last.
  const placed = [...lines]
    .map((l) => ({ ...l, y: y(l.price), labelY: y(l.price) }))
    .sort((a, b) => a.y - b.y);
  placed.forEach((cur, i) => {
    const prev = placed[i - 1];
    if (prev && cur.labelY - prev.labelY < LABEL_GAP) {
      cur.labelY = prev.labelY + LABEL_GAP;
    }
  });
  const overflow = (placed.at(-1)?.labelY ?? 0) - (CHART_H - 6);
  if (overflow > 0) placed.forEach((l) => (l.labelY -= overflow));

  return (
    <svg
      viewBox={`0 0 320 ${CHART_H}`}
      className="h-[132px] w-full rounded-lg border border-border bg-muted/10"
      role="img"
      aria-label="Price levels before and after the merge"
    >
      {placed.map((l) => (
        <g key={l.key} className={l.className}>
          <line
            x1={8}
            x2={196}
            y1={l.y}
            y2={l.y}
            stroke="currentColor"
            strokeWidth={l.width ?? 1}
            strokeDasharray={l.dash}
          />
          <line
            x1={196}
            x2={204}
            y1={l.y}
            y2={l.labelY}
            stroke="currentColor"
            strokeWidth={0.5}
          />
          <text
            x={208}
            y={l.labelY}
            dominantBaseline="middle"
            fontSize={10}
            fill="currentColor"
          >
            {l.label} {fmt(l.price)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ExitOption({
  id,
  label,
  exit,
  checked,
  onChange,
  reached,
}: {
  id: string;
  label: string;
  exit: MergeExit;
  checked: boolean;
  onChange: (v: boolean) => void;
  reached: boolean;
}) {
  const disabled = exit.kind === 'none';
  const value =
    exit.kind === 'price'
      ? `≈ ${fmt(exit.price)} (${exit.perc}%${exit.extra ? `, ${exit.extra}` : ''})`
      : exit.kind === 'other'
        ? exit.label
        : '';
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-sm text-sm">
        <div className="flex items-center gap-xs">
          <Checkbox
            id={id}
            checked={checked && !disabled}
            disabled={disabled}
            onCheckedChange={(v) => onChange(v === true)}
          />
          <label
            htmlFor={id}
            className={disabled ? 'text-muted-foreground' : 'cursor-pointer'}
          >
            {label}
          </label>
          {exit.kind === 'none' && (
            <Tooltip tooltip={exit.reason}>
              <InfoIcon />
            </Tooltip>
          )}
        </div>
        {value && <span className="text-muted-foreground">{value}</span>}
      </div>
      {checked && reached && (
        <p className="pl-6 text-xs text-warning">
          Already reached at the market price
        </p>
      )}
    </div>
  );
}

/**
 * Confirm merging deals: what each deal holds, what the merged deal will hold,
 * and whether it takes the bot's take profit and stop loss (neither, by
 * default). Figures follow the engine's merge; they are an estimate until the
 * merge runs.
 */
export const MergeDealsDialog: React.FC<MergeDealsDialogProps> = ({
  open,
  onOpenChange,
  deals,
  onConfirm,
  isProcessing = false,
}) => {
  const first = deals[0];
  const isLong = first?.long ?? true;
  const symbol = first?.symbol ?? '';
  const baseAsset = first?.baseAsset ?? '';

  const [useTp, setUseTp] = React.useState(false);
  const [useSl, setUseSl] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setUseTp(false);
      setUseSl(false);
    }
  }, [open]);

  const orderQueries = useQueries({
    queries: deals.map((d) => ({
      queryKey: ['mergePreviewOrders', d.botId, d.dealId],
      queryFn: () => fetchDealOrders(d.botId ?? '', d.dealId, BotTypesEnum.dca),
      enabled: open && !!d.botId,
      staleTime: 10_000,
    })),
  });
  const loaded = orderQueries.every((q) => q.isSuccess);
  const figures: DealMergeFigures[] | undefined = React.useMemo(
    () =>
      loaded
        ? orderQueries.map((q) => dealMergeFigures(q.data ?? [], isLong))
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, isLong, ...orderQueries.map((q) => q.dataUpdatedAt)]
  );
  const merged = figures ? mergedFigures(figures) : undefined;

  const botSettings = useDcaBotsStore((s) =>
    first?.botId
      ? (s.bots[first.botId] as { settings?: DCABotSettings } | undefined)
          ?.settings
      : undefined
  );
  const market = useLivePrice(symbol, open);

  const tpExit = mergeExit('tp', botSettings, merged?.avg, isLong);
  const slExit = mergeExit('sl', botSettings, merged?.avg, isLong);
  const tpOn = useTp && tpExit.kind !== 'none';
  const slOn = useSl && slExit.kind !== 'none';

  const chartLines: ChartLine[] = [];
  if (figures && merged?.avg) {
    figures.forEach((f, i) => {
      if (f.avg) {
        chartLines.push({
          key: `deal-${i}`,
          price: f.avg,
          label: `#${i + 1}`,
          className: 'text-muted-foreground',
          dash: '3 3',
        });
      }
    });
    chartLines.push({
      key: 'merged',
      price: merged.avg,
      label: 'Merged',
      className: 'text-primary',
      width: 2,
    });
    if (market) {
      chartLines.push({
        key: 'market',
        price: market,
        label: 'Market',
        className: 'text-foreground',
        dash: '1 3',
      });
    }
    if (tpOn && tpExit.kind === 'price') {
      chartLines.push({
        key: 'tp',
        price: tpExit.price,
        label: 'TP',
        className: 'text-success',
      });
    }
    if (slOn && slExit.kind === 'price') {
      chartLines.push({
        key: 'sl',
        price: slExit.price,
        label: 'SL',
        className: 'text-destructive',
      });
    }
  }

  const cell = 'px-sm py-xs text-right tabular-nums';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <Merge className="h-5 w-5 text-primary" />
            Merge {deals.length} deals
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {[first?.exchange, symbol].filter(Boolean).join(' · ')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          {figures && merged ? (
            <div className="overflow-hidden rounded-lg border border-border text-sm">
              <table className="w-full">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-sm py-xs text-left font-normal">Deal</th>
                    <th className={`${cell} font-normal`}>Size</th>
                    <th className={`${cell} font-normal`}>
                      <span className="inline-flex items-center gap-xs">
                        Avg. price
                        <Tooltip tooltip="Volume-weighted price of each deal's filled entry orders — what the merged deal's average is built from.">
                          <InfoIcon />
                        </Tooltip>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {figures.map((f, i) => (
                    <tr
                      key={deals[i]?.dealId ?? i}
                      className="border-b border-border/60"
                    >
                      <td
                        className="px-sm py-xs text-muted-foreground"
                        title={deals[i]?.dealId}
                      >
                        #{i + 1}
                      </td>
                      <td className={cell}>
                        {formatBalance(f.position, baseAsset)} {baseAsset}
                      </td>
                      <td className={cell}>{fmt(f.avg)}</td>
                    </tr>
                  ))}
                  <tr className="bg-primary/5 font-medium">
                    <td className="px-sm py-xs">Merged</td>
                    <td className={cell}>
                      {formatBalance(merged.position, baseAsset)} {baseAsset}
                    </td>
                    <td className={cell}>{fmt(merged.avg)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="h-24 animate-pulse rounded-lg bg-muted/20" />
          )}

          <MergeLevelsChart lines={chartLines} />

          {/* A single-position bot adopts the deals into its open position,
              which keeps its own exits. */}
          {!botSettings?.singlePosition && (
            <div className="space-y-xs rounded-lg border border-border p-sm">
              <div className="flex items-center gap-xs text-xs text-muted-foreground">
                Merged deal exits
                <Tooltip tooltip="By default the merged deal has no take profit or stop loss and is closed by you. Tick one to give it the bot's, priced from the merged average. Prices are estimates: the placed take profit is adjusted slightly to cover trading fees.">
                  <InfoIcon />
                </Tooltip>
              </div>
              <ExitOption
                id="merge-use-tp"
                label="Use bot take profit"
                exit={tpExit}
                checked={useTp}
                onChange={setUseTp}
                reached={
                  tpExit.kind === 'price' &&
                  exitAlreadyReached('tp', tpExit.price, market, isLong)
                }
              />
              <ExitOption
                id="merge-use-sl"
                label="Use bot stop loss"
                exit={slExit}
                checked={useSl}
                onChange={setUseSl}
                reached={
                  slExit.kind === 'price' &&
                  exitAlreadyReached('sl', slExit.price, market, isLong)
                }
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm({ useTp: tpOn, useSl: slOn })}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Processing…' : 'Merge deals'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
