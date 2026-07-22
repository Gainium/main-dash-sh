/**
 * RedesignDealsTab.tsx — Direction-B "Split inspector" for the redesigned
 * backtest results modal. Recreates the prototype `directionB.jsx` visual
 * output against the REAL design tokens + the {@link BacktestViewModel},
 * but FULLY INTERACTIVE (the prototype was static):
 *
 *  - Left: a scrollable RAIL listing every deal (no, pair, outcome dot,
 *    SO filled/max, duration, P&L % + USD). Clicking a row selects it; the
 *    active row reads via surface elevation (`bg-popover`) + a thin primary
 *    ring (no heavy border, per DESIGN_SYSTEM §3).
 *  - Right: deal header (status chip, time range, working prev/next + "N/total"),
 *    the per-deal price chart (a real `TradingViewChart` embed showing candles,
 *    buy/sell execution markers, and DCA/avg/TP lines via `dealToTradingView`),
 *    a deal-detail panel, and the safety-order ladder (Entry row + each SO rung).
 *
 * The modal body is the card-level surface (`bg-card`), so these inner blocks
 * are `bg-muted` insets (`<Inset>`), NOT `<Card>` (which is also `bg-card` and
 * would collapse into the body in both themes — identical white in light mode,
 * and a wrong-direction recessed step in dark mode). `bg-muted` reads as a
 * proper same-level inset above the card body in both themes per
 * DESIGN_SYSTEM §2 (card-inside-card via a muted inner fill).
 *
 *  State: the selected deal index lives in `useState`, defaulting to the
 *  deepest-laddered loss (best showcase of the ladder) exactly as the
 *  prototype picks `sel`. Prev/next buttons and ArrowLeft/ArrowRight keyboard
 *  navigation move the selection; the key handler is scoped so it never fires
 *  while the user is typing in an input/textarea/contentEditable.
 *
 * Light + dark safe (all colors come from tokens / chart inline vars). No
 * stray borders — only the rail-header / detail hairline dividers
 * (`border-border/60`) and input/focus rings, per the borders policy.
 */

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import TradingViewChart, {
  type TradingViewChartRef,
} from '@/components/widgets/shared/TradingViewChart/TradingViewChart';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  type ClipCandle,
  dealToTradingView,
  intervalToResolution,
} from '../dealToTradingView';
import type { BacktestViewModel, DealVM } from '../viewModel';
import Candles from '@/utils/candles';
import type { ExchangeIntervals } from '@/types';
import logger from '@/lib/loggerInstance';

// ── formatters (mirror the prototype's GX.fmt* helpers) ─────────────────────

const fmtUsd = (v: number, d = 2): string =>
  (v < 0 ? '-$' : '$') +
  Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

const fmtPx = (v: number | null): string =>
  v == null
    ? '—'
    : v.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });

const fmtPct = (v: number, d = 2): string =>
  (v > 0 ? '+' : '') + v.toFixed(d) + '%';

const fmtDur = (h: number): string => {
  const days = Math.floor(h / 24);
  const hh = Math.round(h % 24);
  return (days ? days + 'd ' : '') + hh + 'h';
};

const fmtTime = (t: number | null): string =>
  t == null
    ? '—'
    : new Date(t).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

/** Token color for a deal outcome (profit / loss / neutral). */
function outColor(out: DealVM['out']): string {
  return out === 'win'
    ? 'var(--color-profit)'
    : out === 'loss'
      ? 'var(--color-loss)'
      : 'var(--color-muted-foreground)';
}

/** Tailwind text-color class for a deal outcome. */
function outTextClass(out: DealVM['out']): string {
  return out === 'win'
    ? 'text-profit'
    : out === 'loss'
      ? 'text-loss'
      : 'text-muted-foreground';
}

/**
 * Text color for a deal's P&L figure. Open deals show *unrealized* P&L, so
 * they colour by the sign of that value (and stay neutral at exactly 0);
 * closed deals colour by their win/loss outcome.
 */
function pnlTextClass(deal: DealVM): string {
  if (deal.out === 'open') {
    return deal.pnlPerc > 0
      ? 'text-profit'
      : deal.pnlPerc < 0
        ? 'text-loss'
        : 'text-muted-foreground';
  }
  return outTextClass(deal.out);
}

/**
 * Pick the default selected deal: the loss with the deepest filled ladder
 * (best showcase for the safety-order panel), falling back to the deal with
 * the most filled rungs overall, then index 0. Ported from prototype `DealsB`.
 */
function pickDefaultIndex(deals: DealVM[]): number {
  let sel = 0;
  let bestFill = -1;
  deals.forEach((d, i) => {
    if (d.out === 'loss' && d.filled > bestFill) {
      bestFill = d.filled;
      sel = i;
    }
  });
  if (bestFill < 0) {
    deals.forEach((d, i) => {
      if (d.filled > bestFill) {
        bestFill = d.filled;
        sel = i;
      }
    });
  }
  return sel;
}

// ── inset panel ───────────────────────────────────────────────────────────--

/**
 * A `bg-muted` rounded inset — the same-level inner fill that sits above the
 * card-level modal body. Replaces `<Card>` here so the inner blocks don't
 * collapse into the body (see file header). No border, no shadow; surface
 * contrast carries it.
 */
function Inset({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-xl bg-muted', className)}>{children}</div>
  );
}

// ── rail row ────────────────────────────────────────────────────────────────

interface RailRowProps {
  deal: DealVM;
  active: boolean;
  onSelect: () => void;
}

function RailRow({ deal, active, onSelect }: RailRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
        active
          ? 'bg-popover ring-1 ring-primary'
          : 'hover:bg-foreground/[0.04]',
      )}
    >
      <span className="w-6 shrink-0 text-xs font-bold tabular-nums text-muted-foreground/70">
        {deal.no}
      </span>
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: outColor(deal.out) }}
      />
      <span className="min-w-0 flex-1">
        {deal.pair ? (
          <CoinPair
            pair={deal.pair}
            iconSize="sm"
            layout="horizontal"
            textVariant="symbol"
            className="text-sm font-semibold text-foreground"
          />
        ) : (
          <span className="block truncate text-sm font-semibold text-foreground">
            —
          </span>
        )}
        <span className="block text-xs tabular-nums text-muted-foreground/70">
          {deal.filled}/{deal.maxSo} DCA · {fmtDur(deal.durationH)}
        </span>
      </span>
      <span className="text-right">
        <span
          className={cn(
            'block text-sm font-extrabold tabular-nums',
            pnlTextClass(deal),
          )}
        >
          {fmtPct(deal.pnlPerc)}
        </span>
        <span className="block text-xs tabular-nums text-muted-foreground/70">
          {fmtUsd(deal.pnlUsd)}
        </span>
      </span>
    </button>
  );
}

// ── detail row ──────────────────────────────────────────────────────────────

interface DetailRowProps {
  label: string;
  value: string;
  tone?: 'up' | 'down' | 'neutral';
}

function DetailRow({ label, value, tone = 'neutral' }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-sm font-bold tabular-nums',
          tone === 'up'
            ? 'text-profit'
            : tone === 'down'
              ? 'text-loss'
              : 'text-foreground',
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

// ── ladder row ──────────────────────────────────────────────────────────────

interface LadderRowProps {
  lvl: string | number;
  dev: string;
  price: string;
  filled: boolean;
  label?: string;
}

function LadderRow({ lvl, dev, price, filled, label }: LadderRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_1fr_auto] items-center gap-x-3.5 py-1.5',
        filled ? 'opacity-100' : 'opacity-45',
      )}
    >
      <span
        className={cn(
          'grid size-[18px] place-items-center rounded-[5px] text-xs font-extrabold',
          filled
            ? 'bg-primary/10 text-primary'
            : 'bg-foreground/[0.06] text-muted-foreground',
        )}
      >
        {lvl}
      </span>
      <span className="text-sm tabular-nums text-muted-foreground">
        {dev}
        {label ? ' · ' + label : ''}
      </span>
      <span className="text-right text-sm font-semibold tabular-nums text-foreground">
        {price}
      </span>
      <span
        className={cn(
          'text-right text-xs font-bold',
          filled ? 'text-profit' : 'text-muted-foreground/70',
        )}
      >
        {filled ? 'Filled' : '—'}
      </span>
    </div>
  );
}

// ── main tab ────────────────────────────────────────────────────────────────

export interface RedesignDealsTabProps {
  vm: BacktestViewModel;
}

export function RedesignDealsTab({ vm }: RedesignDealsTabProps) {
  const deals = vm.dealList;
  const total = deals.length;

  const [sel, setSel] = useState<number>(() => pickDefaultIndex(deals));

  // Chart overlay visibility toggles (order lines / fill icons).
  const [showLines, setShowLines] = useState(true);
  const [showIcons, setShowIcons] = useState(true);

  // Re-seat the selection if the deal list identity changes (new run).
  useEffect(() => {
    setSel(pickDefaultIndex(deals));
  }, [deals]);

  const go = useCallback(
    (dir: -1 | 1) => {
      if (total === 0) return;
      setSel((cur) => {
        const next = cur + dir;
        if (next < 0) return 0;
        if (next > total - 1) return total - 1;
        return next;
      });
    },
    [total],
  );

  // ArrowLeft / ArrowRight nav — skipped while typing in a form control.
  useEffect(() => {
    if (total === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      go(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, total]);

  const deal = deals[sel];

  // Raw deal parallel-indexed with `dealList` — drives the real chart embed.
  const rawDeal = vm.raw.deals?.[sel];

  // Symbol + interval are constant across deals in a run, so we keep ONE
  // chart widget and only swap its per-deal lines/markers/timeframe.
  const intervalResolution = useMemo(
    () => intervalToResolution(vm.raw.interval),
    [vm.raw.interval],
  );

  const chartRef = useRef<TradingViewChartRef>(null);

  // Candles for the whole run window (symbol + interval are constant across
  // deals). They let `dealToTradingView` clip each order line at the real price
  // cross — the robust way to know when a resting order actually leaves the
  // book — instead of trusting the backtester's overloaded `filledTime`. Loaded
  // independently (its own `Candles` instance) so it never couples to the live
  // chart datafeed; lines fall back to the filled-order heuristic until ready.
  const sym = rawDeal?.symbol;
  const symKey = sym?.pair && sym.exchange ? `${sym.pair}@${sym.exchange}` : '';
  const [candles, setCandles] = useState<ClipCandle[] | undefined>(undefined);
  useEffect(() => {
    if (!sym?.pair || !sym.exchange || !(vm.to > vm.from)) {
      setCandles(undefined);
      return;
    }
    const instance = new Candles(sym.exchange);
    let cancelled = false;
    void (async () => {
      try {
        const bars = await instance.getCandles({
          symbol: sym.pair,
          interval: vm.raw.interval as ExchangeIntervals,
          period: {
            from: Math.floor(vm.from / 1000),
            to: Math.ceil(vm.to / 1000),
            countBack: 0,
            firstDataRequest: true,
          },
          baseAsset: sym.baseAsset?.name ?? '',
          quoteAsset: sym.quoteAsset?.name ?? '',
        });
        if (!cancelled) setCandles(bars);
      } catch (err) {
        logger.warn('[RedesignDealsTab] candle load for line clipping failed', err);
        if (!cancelled) setCandles(undefined);
      }
    })();
    return () => {
      cancelled = true;
      instance.stop = true;
    };
    // symKey collapses pair+exchange; interval/window complete the cache key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symKey, vm.raw.interval, vm.from, vm.to]);

  // Per-deal chart props. `candles` (when loaded) clip order lines at the real
  // price cross; until then the filled-order heuristic renders.
  const chartProps = useMemo(
    () =>
      rawDeal
        ? dealToTradingView(rawDeal, intervalResolution, vm.to, candles)
        : null,
    [rawDeal, intervalResolution, vm.to, candles],
  );

  // On deal switch, frame the existing widget to the new deal's entry→close
  // span (open deals fall back to the run end) so short deals stay readable.
  useEffect(() => {
    if (!rawDeal?.startTime) return;
    chartRef.current?.centerAtTimestampMs(
      rawDeal.startTime,
      rawDeal.closedTime ?? vm.to,
    );
  }, [rawDeal?.startTime, rawDeal?.closedTime, sel, vm.to]);

  // Empty state — no deals on this result (saved/stripped history) or the
  // selected deal lacks a resolvable symbol/pair.
  if (total === 0 || !deal || !rawDeal || !chartProps || !chartProps.symbol) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center">
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            No deal data available
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Per-deal details are only available right after a fresh backtest
            run.
          </p>
        </div>
      </div>
    );
  }

  const atFirst = sel <= 0;
  const atLast = sel >= total - 1;
  const pnlTone: DetailRowProps['tone'] =
    deal.out === 'win' ? 'up' : deal.out === 'loss' ? 'down' : 'neutral';

  return (
    <div className="flex flex-col gap-3.5 lg:h-full lg:flex-row">
      {/* ── left rail (full-width above the inspector on mobile) ────────── */}
      <Inset className="flex max-h-56 w-full shrink-0 flex-col overflow-hidden lg:max-h-none lg:w-[296px]">
        <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-3">
          <span className="text-sm font-extrabold text-foreground">
            Deals
            <span className="ml-1.5 text-muted-foreground/70">{total}</span>
          </span>
          <span className="rounded-md bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium text-muted-foreground">
            All
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {deals.map((dd, i) => (
            <RailRow
              key={dd.id || i}
              deal={dd}
              active={i === sel}
              onSelect={() => setSel(i)}
            />
          ))}
        </div>
      </Inset>

      {/* ── right inspector ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        {/* deal header */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-extrabold text-foreground">
            Deal {deal.no}
          </span>
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-semibold capitalize',
              deal.out === 'win'
                ? 'bg-profit/10 text-profit'
                : deal.out === 'loss'
                  ? 'bg-loss/10 text-loss'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {deal.status} ·{' '}
            {deal.out === 'win'
              ? 'Profit'
              : deal.out === 'loss'
                ? 'Loss'
                : 'Open'}
          </span>
          <span className="text-sm text-muted-foreground">
            {fmtTime(deal.startTime)} → {fmtTime(deal.closeTime)}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={showLines}
                onCheckedChange={(v) => setShowLines(v === true)}
              />
              Lines
            </label>
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={showIcons}
                onCheckedChange={(v) => setShowIcons(v === true)}
              />
              Icons
            </label>
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={atFirst}
              aria-label="Previous deal"
              className="grid size-[30px] place-items-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm tabular-nums text-muted-foreground/70">
              {sel + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={atLast}
              aria-label="Next deal"
              className="grid size-[30px] place-items-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {/* price chart — one persistent TradingView widget; deal switches
            only update its lines / markers / timeframe (symbol + interval are
            constant for the whole run). */}
        <div className="h-[320px] shrink-0 overflow-hidden rounded-xl lg:h-auto lg:min-h-0 lg:flex-1">
          <TradingViewChart
            ref={chartRef}
            widgetId="backtest-deal-chart"
            symbol={chartProps.symbol}
            availableSymbols={chartProps.availableSymbols}
            interval={chartProps.interval}
            initialTimeframe={chartProps.initialTimeframe}
            transactions={chartProps.transactions}
            ordersForDrawing={chartProps.ordersForDrawing}
            enableAutoSave={false}
            enableLoadLastChart={false}
            enableSeparateDrawingsStorage={false}
            showPastOrders={showLines}
            showTransactions={showIcons}
          />
        </div>

        {/* detail + execution + ladder — stacked on mobile, 3 fixed-height
            columns ≥md (170px; the ladder scrolls internally) so the chart
            above takes the remaining height. */}
        <div className="flex flex-none flex-col gap-3.5 md:h-[170px] md:flex-row">
          {/* col 1 — P&L + prices */}
          <Inset className="min-w-0 flex-1 p-3.5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Deal detail
            </div>
            <DetailRow
              label="P&L"
              value={`${fmtPct(deal.pnlPerc)} · ${fmtUsd(deal.pnlUsd)}`}
              tone={pnlTone}
            />
            <DetailRow label="Entry price" value={fmtPx(deal.entry)} />
            <DetailRow label="Avg price" value={fmtPx(deal.avg)} />
            <DetailRow label="Close price" value={fmtPx(deal.closePrice)} />
          </Inset>

          {/* col 2 — execution facts */}
          <Inset className="min-w-0 flex-1 p-3.5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Execution
            </div>
            <DetailRow label="Duration" value={fmtDur(deal.durationH)} />
            <DetailRow label="Volume" value={fmtUsd(deal.volume)} />
            <DetailRow
              label="DCA filled"
              value={`${deal.filled} / ${deal.maxSo}`}
            />
          </Inset>

          {/* col 3 — safety-order ladder */}
          <Inset className="flex min-w-0 flex-[1.6] flex-col overflow-hidden p-3.5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              DCA ladder
            </div>
            <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-3.5 pb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground/70">
              <span>Lvl</span>
              <span>Deviation</span>
              <span className="text-right">Price</span>
              <span className="text-right">Status</span>
            </div>
            <div className="flex max-h-full flex-col overflow-y-auto">
              <LadderRow
                lvl="E"
                dev="—"
                price={fmtPx(deal.entry)}
                filled
                label="Entry"
              />
              {deal.safety.map((s) => (
                <LadderRow
                  key={s.idx}
                  lvl={s.idx}
                  dev={'-' + s.dev.toFixed(2) + '%'}
                  price={fmtPx(s.price)}
                  filled={s.filled}
                />
              ))}
            </div>
          </Inset>
        </div>
      </div>
    </div>
  );
}
