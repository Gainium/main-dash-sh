/* eslint-disable spacing/no-hardcoded-font-size */
import {
    AdjustFundsDialog,
    CloseOptionsDialog,
    type AdjustFundsDialogMode,
} from '@/features/bots/shared/runtime';
import { useChartColors } from '@/hooks/useChartColors';
import { useDealActions, useMoveDealToTerminal } from '@/hooks/useDealActions';
import { useDealOrders } from '@/hooks/useDealOrders';
import { useDealPriceHistory } from '@/hooks/useDealPriceHistory';
import logger from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { cn, formatTradingPair } from '@/lib/utils';
import { useTradeJournalStore } from '@/stores/tradeJournalStore';
import {
    BotTypesEnum,
    CloseDCATypeEnum,
    DCADealStatusEnum,
    type AddFundsSettings,
} from '@/types';
import type { ViewOrder } from '@/types/bots';
import type { TransformedTrade } from '@/types/dcaDeal';
import { buildBotViewRoute } from '@/utils/bots/navigation';
import { formatNumber } from '@/utils/numberFormatter';
import { extractPairAssets } from '@/utils/pairs';
import { deriveTradeLevels } from '@/utils/trades/deriveTradeLevels';
import {
    ArrowRightLeft,
    BookOpen,
    Edit,
    ExternalLink,
    Eye,
    MinusCircle,
    MoreVertical,
    PlusCircle,
    X,
    XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Area,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import getLatestPrices from '../../helper/price';
import { ConfirmationDialog } from '../ui';
import { DualArcProgressGauge } from '../ui/DualArcProgressGauge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
    BotTypeChip,
    ExchangeChip,
    ProfitAndPerc,
    StatusChip,
    StrategyChip,
    TimeChip,
} from '../ui/chip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Tooltip as HelpTooltip } from '../ui/tooltip';
import CoinPair from '../widgets/shared/CoinPair';
import { TradeDetailDrawer } from './TradeDetailDrawer';

export interface TradeCardProps {
  terminal?: boolean;
  trade: TransformedTrade;
  onClick?: () => void;
  className?: string;
  privacyMode?: boolean;
  // Enhanced card options
  enableEnhancedView?: boolean;
  showChart?: boolean;
  // Option to show drawer with chart on left and details on right
  showTradeDrawer?: boolean;
  handleOpenDetailDrawer?: (trade: TransformedTrade) => void;
  filledOrders?: ViewOrder[];
  handleAdjustFundsConfirm?: (
    id: string,
    settings: AddFundsSettings,
    mode: AdjustFundsDialogMode
  ) => void;
  botType?: BotTypesEnum;
  handleEdit: (trade: TransformedTrade) => void;
}

/**
 * Formats a price for axis ticks / pills / tooltips with a sensible, magnitude
 * aware number of decimals and thousands separators (e.g. 88,096 / 105.01 /
 * 0.2345). Avoids the noisy 8-decimal output the raw domain produced.
 */
function formatAxisPrice(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Native SVG label for a Recharts `ReferenceLine`: a coloured price pill drawn
 * in the Y-axis column (far left), on top of the grey tick labels and aligned to
 * the line's height, plus a "% to reach" tag at the right end of the line. Drawn
 * in the SVG so it tracks the line exactly; `viewBox` is the line's plot-area
 * rect (x = plot left, width = plot width, y = the line).
 */
const ReferenceLineLabel = (props: {
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  priceText?: string;
  pctText?: string | null;
  color?: string;
}) => {
  const { viewBox, priceText = '', pctText, color = '#888' } = props;
  const lineX = viewBox?.x ?? 0;
  const y = viewBox?.y ?? 0;
  const width = viewBox?.width ?? 0;
  const pillH = 15;
  const padX = 4;
  const pillW = Math.max(priceText.length * 6.2 + padX * 2, 22);
  // Butt the pill's RIGHT edge against the line's start (plot-area left), so the
  // line appears to emanate from the pill (Cornix-style) — no gap between them.
  // It overlaps the grey tick column at this height; the opaque fill covers it.
  const pillX = Math.max(1, lineX - pillW);
  return (
    <g>
      <rect
        x={pillX}
        y={y - pillH / 2}
        rx={3}
        ry={3}
        width={pillW}
        height={pillH}
        fill={color}
      />
      <text
        x={pillX + padX}
        y={y}
        dominantBaseline="central"
        fontSize={10.5}
        fontWeight={600}
        fill="#ffffff"
      >
        {priceText}
      </text>
      {pctText ? (
        <text
          x={lineX + width - 4}
          y={y - 7}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={10.5}
          fontWeight={700}
          fill={color}
        >
          {pctText}
        </text>
      ) : null}
    </g>
  );
};

/**
 * Horizontal range track showing where the deal's current P/L sits between its
 * worst drawdown (left extreme) and best run-up (right extreme). The extremes
 * are the deal's max adverse / favorable excursion; the marker is the live P/L.
 * Renders nothing when neither extreme is known (no stats yet).
 */
const PnlRangeTrack: React.FC<{
  /** Current P/L as a percentage (unrealized or realized ROI). */
  current: number;
  /** Worst drawdown magnitude (positive %). */
  drawdown: number;
  /** Best run-up magnitude (positive %). */
  runUp: number;
}> = ({ current, drawdown, runUp }) => {
  const min = -Math.abs(drawdown);
  const max = Math.abs(runUp);
  const span = max - min;
  if (span <= 0) return null;
  const toPct = (v: number) =>
    Math.min(100, Math.max(0, ((v - min) / span) * 100));
  const markerPos = toPct(current);
  const zeroPos = toPct(0);
  const isLoss = current < 0;
  return (
    <div className="mt-2">
      <div className="relative h-2.5">
        {/* Track: loss-tinted up to break-even, profit-tinted beyond. */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full overflow-hidden bg-muted">
          <div
            className="absolute inset-y-0 left-0 bg-loss/25"
            style={{ width: `${zeroPos}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-profit/25"
            style={{ width: `${100 - zeroPos}%` }}
          />
        </div>
        {/* Break-even tick. */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-px h-2.5 bg-border"
          style={{ left: `${zeroPos}%` }}
        />
        {/* Current-P/L marker. */}
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ring-2 ring-card',
            isLoss ? 'bg-loss' : 'bg-profit'
          )}
          style={{ left: `${markerPos}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] font-medium tabular-nums leading-none">
        <span className="text-loss">{min.toFixed(2)}%</span>
        <span className="text-profit">+{max.toFixed(2)}%</span>
      </div>
    </div>
  );
};

const LOG_PREFIX = 'EnhancedCard';

const EnhancedCard = React.memo(
  ({
    trade,
    privacyMode = false,
    showChart = false,
    tradingPair,
    symbolAssets,
    botTypeForChip,
    isLongTrade,
    avgPriceLabel,
    avgPriceDisplay,
    initialPriceLabel,
    initialPriceDisplay,
    currentPriceDisplay,
    currentPrice = null,
    handleOpenDetailDrawer,
    filledOrders,
    handleAdjustFundsConfirm: _handleAdjustFundsConfirm,
    botType,
    handleEdit: _handleEdit,
    terminal,
  }: TradeCardProps & {
    tradingPair: string;
    symbolAssets: {
      baseAsset: string;
      quoteAsset: string;
      symbolString: string;
    };
    botTypeForChip: BotTypesEnum;
    isLongTrade: boolean;
    avgPriceLabel: string;
    avgPriceDisplay: string;
    initialPriceLabel: string;
    initialPriceDisplay: string;
    currentPriceDisplay: string | null;
    currentPrice?: number | null;
  }) => {
    const handleEdit = useCallback(() => {
      _handleEdit(trade);
    }, [_handleEdit, trade]);
    const [adjustFundsDialog, setAdjustFundsDialog] =
      useState<AdjustFundsDialogMode | null>(null);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [closeDialogOpen, setCloseDialogOpen] = useState(false);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const handleAddFunds = () => {
      setAdjustFundsDialog('add');
    };
    const handleAdjustFundsConfirm = useCallback(
      (settings: AddFundsSettings) => {
        if (!_handleAdjustFundsConfirm) {
          return;
        }
        if (!adjustFundsDialog) {
          return;
        }
        _handleAdjustFundsConfirm(trade.id, settings, adjustFundsDialog);
        setAdjustFundsDialog(null);
      },
      [_handleAdjustFundsConfirm, trade.id, adjustFundsDialog]
    );

    const handleReduceFunds = () => {
      setAdjustFundsDialog('reduce');
    };
    const addToJournal = useTradeJournalStore((state) => state.addTrade);
    const handleAddToJournal = async () => {
      if (!filledOrders || !handleOpenDetailDrawer) {
        return;
      }
      try {
        // Filter orders for this specific deal and only FILLED orders
        const dealOrders = filledOrders.filter(
          (order) => order.dealId === trade.id
        );

        // Transform orders into executions
        const executions = dealOrders.map((order) => ({
          id: order.clientOrderId,
          action: (order.side === 'buy' ? 'buy' : 'sell') as 'buy' | 'sell',
          timestamp: order.time,
          quantity: Number(order.executedQty || order.origQty || 0),
          price: Number(order.price || 0),
          fee: 0,
          cost:
            Number(order.executedQty || order.origQty || 0) *
            Number(order.price || 0),
        }));

        const entryTime = trade.created
          ? new Date(trade.created).getTime()
          : Date.now();

        const isOpenTrade = ['open', 'active', 'start'].includes(
          trade.status.toLowerCase()
        );
        const isCancelledTrade = ['canceled', 'cancelled'].includes(
          trade.status.toLowerCase()
        );

        const profitUsd = trade.profit?.totalUsd || 0;
        // Cost basis in quote terms. Shorts hold base, so trade.cost and
        // usage.current.quote are 0; value the base position instead (mirrors
        // investedAmount used for the card ROI).
        const initialInvestment =
          trade.cost ||
          (!isLongTrade
            ? (trade.usage?.current?.base || 0) *
              (currentPrice || trade.avgPrice || trade.entryPrice || 0)
            : trade.usage?.current?.quote || 0);
        const calculatedROI =
          initialInvestment > 0 ? (profitUsd / initialInvestment) * 100 : 0;

        const symbolString =
          typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const journalEntry: any = {
          symbol: symbolString,
          exchange: trade.exchange,
          direction: (trade.side?.toUpperCase() === 'LONG' ||
          trade.side?.toUpperCase() === 'BUY'
            ? 'long'
            : 'short') as 'long' | 'short',
          entryPrice: trade.entryPrice || trade.avgPrice || 0,
          entryTime: entryTime,
          amount: trade.size || trade.currentBalance.base || 0,
          pnl: profitUsd,
          roi: calculatedROI,
          marketType: (trade.dealType === 'FUTURES' ? 'futures' : 'spot') as
            | 'spot'
            | 'futures',
          notes: `Deal from ${trade.type} bot${trade.botName ? ` (${trade.botName})` : ''}${isOpenTrade ? ' (Open - Unrealized PNL)' : ''}${isCancelledTrade ? ' (Cancelled)' : ''}`,
          executions: executions.length > 0 ? executions : undefined,
        };

        // Note: exitPrice/exitTime not available on TransformedTrade type for deals
        // Only add exit data if explicitly available

        const journalId = addToJournal(journalEntry);
        logger.info(`${LOG_PREFIX}: Added deal to journal`, {
          dealId: trade.id,
          journalId,
          symbol: symbolString,
          executionsCount: executions.length,
        });
        toast.success(
          `Deal ${symbolString} added to journal with ${executions.length} execution(s)`
        );
      } catch (error) {
        logger.error(`${LOG_PREFIX}: Failed to add deal to journal`, {
          error,
          dealId: trade.id,
        });
        toast.error('Failed to add deal to journal');
      }
    };
    // Hook for theme colors
    const colors = useChartColors();

    // Helper function to determine gauge color based on percentage
    const getGaugeColor = useCallback(
      (percentage: number): string => {
        const roundedPercentage = Math.round(percentage);
        if (roundedPercentage >= 100) return colors.destructive; // Error color for 100%
        if (roundedPercentage > 80) return colors.warning; // Caution color for >80%
        return colors.success; // Default success color
      },
      [colors.destructive, colors.success, colors.warning]
    );

    // Each open-deal card loads its own orders (the dashboard store isn't
    // pre-populated for all deals). Gate on showChart && active so closed or
    // chart-less cards don't fire a query.
    const ordersEnabled = Boolean(showChart && trade.active);
    const { orders } = useDealOrders(
      ordersEnabled ? (trade.botId ?? '') : '',
      ordersEnabled ? (trade.id ?? '') : '',
      botType ?? BotTypesEnum.dca
    );

    // Candle history + live `now` tail point for the sparkline.
    const { priceData } = useDealPriceHistory(trade, currentPrice ?? null);

    // Reference lines derived from the deal's live open orders, each tagged
    // with the order side that produced it.
    const { topLine, topSide, bottomLine, bottomSide } = useMemo(
      () => deriveTradeLevels(trade, orders, currentPrice ?? null),
      [trade, orders, currentPrice]
    );

    // Colour each line by ORDER SIDE: SELL = red, BUY = green. (TP/SL on a long
    // are sells -> red; safety buys -> green. Works for shorts too.)
    const topColor = topSide === 'BUY' ? colors.success : colors.destructive;
    const bottomColor =
      bottomSide === 'SELL' ? colors.destructive : colors.success;

    // How far the price must move from "now" to reach a reference line.
    const pctToReach = (line?: number): string | null => {
      if (
        typeof line !== 'number' ||
        currentPrice == null ||
        !Number.isFinite(currentPrice) ||
        currentPrice === 0
      ) {
        return null;
      }
      const pct = ((line - currentPrice) / currentPrice) * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    };

    // The hook appends a lone live tail when there are no candles; the chart
    // only makes sense once we have real candle history (>1 point).
    const hasPriceData = useMemo(() => priceData.length > 1, [priceData]);

    // Map the derived levels onto the existing TP/SL JSX so colors / reference
    // lines keep working unchanged: topLine = green TP, bottomLine = red SL.
    const takeProfitPrice = useMemo(
      () => (typeof topLine === 'number' ? topLine : undefined),
      [topLine]
    );
    const stopLossPrice = useMemo(
      () => (typeof bottomLine === 'number' ? bottomLine : undefined),
      [bottomLine]
    );

    // Grid / combo bots have no averaging-down TP to evolve; instead we show
    // their sell fills (red dots) alongside buy fills (green dots).
    const isGridOrCombo = useMemo(
      () => ['Combo', 'Hedge Combo', 'Grid'].includes(trade.type),
      [trade.type]
    );

    // Evolving take-profit. As filled BUY orders (base + DCA safety orders) lower
    // the average entry, the TP (= avg × (1 + tp%)) steps DOWN. We reconstruct
    // that history per candle so the chart shows the TP dropping at each fill,
    // with a marker at each fill. tp% is inferred from the current open TP sell
    // vs the current average entry. Adds `tp` and `fillMarker` to each point.
    const chartData = useMemo(() => {
      const entry = Number(trade.entryPrice || trade.avgPrice || 0);
      const tpPct =
        typeof topLine === 'number' && entry > 0 ? topLine / entry - 1 : null;
      const fills = orders
        .filter(
          (o) => o.side === 'BUY' && String(o.status).toUpperCase() === 'FILLED'
        )
        .map((o) => ({
          ts: Number(o.updateTime || o.time || 0),
          price: Number(o.price),
          qty: Number(o.executedQty || o.origQty || 0),
        }))
        .filter(
          (f) =>
            f.ts > 0 && Number.isFinite(f.price) && f.price > 0 && f.qty > 0
        )
        .sort((a, b) => a.ts - b.ts);

      // Filled SELL orders (for grid/combo sell markers). Timestamps only — we
      // just mark the candle where a sell executed.
      const sellTimes = orders
        .filter(
          (o) =>
            o.side === 'SELL' && String(o.status).toUpperCase() === 'FILLED'
        )
        .map((o) => Number(o.updateTime || o.time || 0))
        .filter((ts) => ts > 0)
        .sort((a, b) => a - b);

      // The reconstructed running average (from fill price×qty) won't exactly
      // match the deal's real current average (fees/rounding/partial fills).
      // Scale the whole reconstructed series so its FINAL value equals the real
      // current average — the TP curve then lands precisely on the current-TP
      // line AND stays monotonic (only steps down), with no end-of-line jump.
      let totalCost = 0;
      let totalQty = 0;
      for (const f of fills) {
        totalCost += f.price * f.qty;
        totalQty += f.qty;
      }
      const reconFinalAvg = totalQty > 0 ? totalCost / totalQty : 0;
      const scale = reconFinalAvg > 0 && entry > 0 ? entry / reconFinalAvg : 1;

      let fi = 0;
      let si = 0;
      let cost = 0;
      let qty = 0;
      return priceData.map((p) => {
        let buyFilledHere = false;
        while (fi < fills.length && fills[fi].ts <= p.ts) {
          cost += fills[fi].price * fills[fi].qty;
          qty += fills[fi].qty;
          fi += 1;
          buyFilledHere = true;
        }
        let sellFilledHere = false;
        while (si < sellTimes.length && sellTimes[si] <= p.ts) {
          si += 1;
          sellFilledHere = true;
        }
        // TP exists only once a position is open (a buy has filled).
        const tp =
          tpPct !== null && qty > 0 ? (cost / qty) * scale * (1 + tpPct) : null;
        return {
          ...p,
          tp,
          fillMarker: buyFilledHere ? p.price : null,
          sellMarker: sellFilledHere ? p.price : null,
        };
      });
    }, [priceData, orders, topLine, trade.entryPrice, trade.avgPrice]);

    // Y-axis domain. Zoom from the TOP anchor (entry / TP / evolving TP / candle
    // high, whichever is highest) to the BOTTOM anchor (lowest candle price or
    // next DCA/buy line), so every line — including the early, higher TP — fits.
    const { yMin, yMax } = useMemo(() => {
      const candle = chartData
        .map((d) => d.price)
        .filter((p) => Number.isFinite(p) && p > 0);
      const tps = chartData
        .map((d) => d.tp)
        .filter(
          (v): v is number =>
            typeof v === 'number' && Number.isFinite(v) && v > 0
        );
      const entry = Number(trade.entryPrice || trade.avgPrice || 0);
      const tops = [
        topLine,
        entry > 0 ? entry : undefined,
        ...tps,
        ...candle,
      ].filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
      );
      const bottoms = [bottomLine, ...candle].filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
      );
      if (tops.length === 0 || bottoms.length === 0) {
        return { yMin: 0, yMax: 1 };
      }
      const top = Math.max(...tops);
      const bottom = Math.min(...bottoms);
      const span = top - bottom;
      // Tight zoom: small relative padding so TP sits near the top and DCA near
      // the bottom. Magnitude-relative so sub-$1 assets aren't blown out.
      const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(top) * 0.02, 1e-9);
      let yMin = bottom - pad;
      const yMax = top + pad;
      if (bottom >= 0 && yMin < 0) yMin = 0; // prices are never negative
      return { yMin, yMax };
    }, [chartData, topLine, bottomLine, trade.entryPrice, trade.avgPrice]);

    // Evenly-spaced grey Y-axis ticks across the full domain (Cornix-style).
    const yTicks = useMemo(() => {
      const steps = 4;
      return Array.from(
        { length: steps + 1 },
        (_, i) => yMin + ((yMax - yMin) * i) / steps
      );
    }, [yMin, yMax]);

    // Quote-denominated cost basis used as the ROI denominator and the
    // "Cost (Invested)" display. A SHORT spot position holds BASE (its
    // usage.current.quote is 0), so the old `trade.cost || trade.value || …`
    // fell through to trade.value — the *realized profit* in USD — yielding
    // absurd ROIs (e.g. -10 USD ÷ 0.24 = -4273%) and a "0.24 DOGE" label.
    // Value the base position in quote terms instead.
    const investedAmount = useMemo(() => {
      if (trade.cost) return trade.cost;
      if (!isLongTrade) {
        const baseQty = trade.usage?.current?.base || 0;
        const px = currentPrice || trade.avgPrice || trade.entryPrice || 0;
        if (baseQty > 0 && px > 0) return baseQty * px;
      }
      return trade.usage?.current?.quote || 0;
    }, [
      trade.cost,
      trade.usage,
      trade.avgPrice,
      trade.entryPrice,
      isLongTrade,
      currentPrice,
    ]);
    // investedAmount is always quote-denominated, so label it in the quote asset
    // for both long and short (a short previously mislabelled a USD figure as
    // the base coin, e.g. "0.24 DOGE").
    const investedCurrencySymbol = symbolAssets.quoteAsset;
    const investedDisplay = useMemo(
      () =>
        privacyMode
          ? '***'
          : `${formatNumber(investedAmount, false)} ${investedCurrencySymbol}`,
      [investedAmount, investedCurrencySymbol, privacyMode]
    );
    // Inputs for the sparkline's compact hover tooltip (unrealized P/L at the
    // hovered price). Precomputed here so the tooltip closure stays cheap.
    const avgEntry = useMemo(
      () => Number(trade.entryPrice || trade.avgPrice || 0),
      [trade.entryPrice, trade.avgPrice]
    );
    const positionSize = useMemo(
      () => Number(trade.size || trade.currentBalance?.base || 0),
      [trade.size, trade.currentBalance?.base]
    );
    const realizedRoi = useMemo(() => {
      const base = investedAmount || 0;
      if (base <= 0) return 0;
      if (typeof trade.pnl === 'number') {
        return (trade.pnl / base) * 100;
      }
      if (typeof trade.profit?.totalUsd === 'number') {
        return (trade.profit.totalUsd / base) * 100;
      }
      return 0;
    }, [investedAmount, trade.pnl, trade.profit?.totalUsd]);
    const unrealizedRoi = useMemo(() => {
      const base = investedAmount || 0;
      if (base <= 0) return 0;
      return ((trade.unrealizedProfit || 0) / base) * 100;
    }, [investedAmount, trade.unrealizedProfit]);

    // A deal with a single order (just the base buy) has no DCA ladder, so its
    // usage gauge would always read ~100% — meaningless. Hide it in that case.
    const hasDca = (trade.levels?.all ?? 0) > 1;

    // The P/L summary box shows realized P/L for closed deals, unrealized for
    // open ones — exactly one applies per card.
    const isClosedDeal = !trade.active;
    const pnlBoxValue = isClosedDeal
      ? trade.pnl || 0
      : trade.unrealizedProfit || 0;
    const pnlBoxRoi = isClosedDeal ? realizedRoi : unrealizedRoi;
    const pnlBoxLabel = isClosedDeal ? 'Realized' : 'Unrealized';
    const baseSymbol = useMemo(
      () => (typeof trade.symbol === 'string' ? '' : trade.symbol.baseAsset),
      [trade.symbol]
    );

    const quoteSymbol = useMemo(
      () => (typeof trade.symbol === 'string' ? '' : trade.symbol.quoteAsset),
      [trade.symbol]
    );

    const symbolString = useMemo(
      () =>
        typeof trade.symbol === 'string' ? trade.symbol : trade.symbol.symbol,
      [trade.symbol]
    );
    const closeDealMutation = useDealActions();
    const moveDealToTerminalMutation = useMoveDealToTerminal();
    const canShowMoveToTerminal = useMemo(
      () =>
        botType === BotTypesEnum.dca &&
        trade.type === 'DCA' &&
        typeof trade.botId === 'string' &&
        trade.botId.length > 0,
      [botType, trade.botId, trade.type]
    );
    const canMoveToTerminal = useMemo(
      () =>
        canShowMoveToTerminal &&
        String(trade.status || '').toLowerCase() === DCADealStatusEnum.open,
      [canShowMoveToTerminal, trade.status]
    );
    const handleCancelConfirm = () => {
      if (!trade.botId) {
        logger.error(`${LOG_PREFIX}: Cannot cancel deal - missing botId`, {
          dealId: trade.id,
        });
        toast.error('Cannot cancel deal - missing bot ID');
        return;
      }

      const q =
        botType === BotTypesEnum.combo
          ? closeDealMutation.closeComboDeal
          : closeDealMutation.closeDCADeal;

      q(
        { dealId: trade.id, botId: trade.botId, type: CloseDCATypeEnum.cancel },
        {
          onSuccess: () => {
            logger.info(`${LOG_PREFIX}: Deal canceled successfully`, {
              dealId: trade.id,
              botId: trade.botId,
            });
            toast.success('Deal canceled successfully');
            setCancelDialogOpen(false);
          },
          onError: (error) => {
            logger.error(`${LOG_PREFIX}: Failed to cancel deal`, {
              dealId: trade.id,
              botId: trade.botId,
              error,
            });
            toast.error('Failed to cancel deal');
            setCancelDialogOpen(false);
          },
        }
      );
    };

    const handleCloseConfirm = (type: CloseDCATypeEnum) => {
      if (!trade.botId) {
        logger.error(`${LOG_PREFIX}: Cannot close deal - missing botId`, {
          dealId: trade.id,
        });
        toast.error('Cannot close deal - missing bot ID');
        return;
      }

      const q =
        botType === BotTypesEnum.combo
          ? closeDealMutation.closeComboDeal
          : closeDealMutation.closeDCADeal;

      q(
        { dealId: trade.id, botId: trade.botId, type },
        {
          onSuccess: () => {
            logger.info(`${LOG_PREFIX}: Deal canceled successfully`, {
              dealId: trade.id,
              botId: trade.botId,
            });
            toast.success('Deal canceled successfully');
            setCancelDialogOpen(false);
          },
          onError: (error) => {
            logger.error(`${LOG_PREFIX}: Failed to cancel deal`, {
              dealId: trade.id,
              botId: trade.botId,
              error,
            });
            toast.error('Failed to cancel deal');
            setCancelDialogOpen(false);
          },
        }
      );
    };
    const viewDetails = useCallback(
      () =>
        handleOpenDetailDrawer ? handleOpenDetailDrawer(trade) : undefined,
      [handleOpenDetailDrawer, trade]
    );
    const handleMoveToTerminalConfirm = useCallback(async () => {
      if (!canShowMoveToTerminal || !trade.botId) {
        toast.error('Only DCA bot deals can be moved to terminal');
        return;
      }

      try {
        const response = await moveDealToTerminalMutation.mutateAsync({
          dealId: trade.id,
          botId: trade.botId,
          combo: false,
        });

        toast.success(
          typeof response.data === 'string'
            ? response.data
            : 'Deal moved to terminal successfully'
        );
      } catch (error) {
        logger.error(`${LOG_PREFIX}: Failed to move deal to terminal`, {
          error,
          dealId: trade.id,
          botId: trade.botId,
        });
        toast.error('Failed to move deal to terminal');
      } finally {
        setMoveDialogOpen(false);
      }
    }, [
      canShowMoveToTerminal,
      moveDealToTerminalMutation,
      trade.botId,
      trade.id,
    ]);
    return (
      <>
        <AdjustFundsDialog
          open={!!adjustFundsDialog}
          mode={adjustFundsDialog || 'add'}
          onOpenChange={() => setAdjustFundsDialog(null)}
          onConfirm={handleAdjustFundsConfirm}
          baseAsset={baseSymbol}
          quoteAsset={quoteSymbol}
        />
        <ConfirmationDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          title="Cancel Deal"
          description={`Are you sure you want to cancel the deal for ${symbolString}? This action cannot be undone.`}
          confirmText="Cancel Deal"
          cancelText="Keep Deal"
          variant="destructive"
          onConfirm={handleCancelConfirm}
        />
        <CloseOptionsDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          onConfirm={handleCloseConfirm}
          defaultCloseType={CloseDCATypeEnum.closeByMarket}
          ignoreOptions={[CloseDCATypeEnum.leave]}
          mode="deal"
        />
        <ConfirmationDialog
          open={moveDialogOpen}
          onOpenChange={setMoveDialogOpen}
          title="Move deal to terminal"
          description={`Are you sure you want to move the deal (${trade.id}) to the terminal? After moving a deal to terminal, the bot may open a new deal immediately if slots are available (especially with ASAP start conditions). Consider adjusting max deals and max deals per pair settings if needed.`}
          confirmText="Confirm"
          cancelText="Cancel"
          onConfirm={handleMoveToTerminalConfirm}
        />
        <CardContent className="p-md relative" style={{ isolation: 'isolate' }}>
          {/* Floating actions — hover-reveal on desktop, always visible on
              mobile (matches BotCard / WidgetWrapper pattern) */}
          <div
            className={cn(
              'absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border/60 bg-muted/95 px-1 py-0.5 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out z-10',
              'opacity-100 translate-x-0 pointer-events-auto',
              'sm:pointer-events-none sm:opacity-0 sm:translate-x-3 sm:group-hover/card:pointer-events-auto sm:group-hover/card:opacity-100 sm:group-hover/card:translate-x-0 sm:group-focus-within/card:pointer-events-auto sm:group-focus-within/card:opacity-100 sm:group-focus-within/card:translate-x-0'
            )}
          >
            {trade.botId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    buildBotViewRoute(botTypeForChip, trade.botId),
                    '_blank'
                  );
                }}
                aria-label="Open bot in new tab"
                className="shrink-0 p-1 rounded hover:bg-muted/60"
                title="Open bot in new tab"
              >
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={viewDetails} disabled={terminal}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddToJournal}>
                  <BookOpen className="w-4 h-4 mr-2" />
                  Add to Journal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleAddFunds}>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Add Funds
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleReduceFunds}>
                  <MinusCircle className="w-4 h-4 mr-2" />
                  Reduce Funds
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleEdit}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                {canShowMoveToTerminal && (
                  <DropdownMenuItem
                    onClick={() => setMoveDialogOpen(true)}
                    disabled={!canMoveToTerminal}
                  >
                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                    Move to Terminal
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setCancelDialogOpen(true)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setCloseDialogOpen(true)}
                  className="text-destructive"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Close
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Header — pair, chips, bot name (no inline external-link; that
              lives in the floating pill above) */}
          <div className="flex flex-col gap-xs mb-3 min-w-0">
            <div className="flex items-center gap-xs min-w-0">
              <CoinPair
                baseAsset={symbolAssets.baseAsset}
                quoteAsset={symbolAssets.quoteAsset}
                pair={tradingPair}
                iconSize="md"
                showText={true}
                className="text-2xl font-bold"
                layout="horizontal"
              />
              <StatusChip status={trade.status} size="sm" dotOnly={true} />
            </div>

            <div className="flex items-center gap-xs flex-wrap">
              <BotTypeChip
                botType={botTypeForChip}
                size="xs"
                chipStyle="soft"
              />
              <StrategyChip
                strategy={trade.strategy}
                size="xs"
                chipStyle="solid"
              />
            </div>

            {trade.botName && (
              <div className="text-base font-semibold text-foreground truncate">
                {trade.botName}
              </div>
            )}
          </div>

          {/* Progress gauge on left and P&L boxes on right */}
          {trade.usagePercentage !== undefined &&
            trade.pnl !== undefined &&
            trade.cost !== undefined && (
              <div className="mb-4">
                <div className="flex items-start gap-md mb-4">
                  {/* Left side - Usage gauge (only meaningful when a DCA ladder
                      exists; a single-order deal would always read ~100%). */}
                  {hasDca && (
                    <div className="shrink-0 w-20">
                      <div className="text-xs text-muted-foreground mb-2">
                        Usage
                      </div>
                      <DualArcProgressGauge
                        size={72}
                        outerPercentage={trade.outerGaugePercent || 0}
                        innerPercentage={0}
                        outerProgressColor={getGaugeColor(
                          trade.outerGaugePercent || 0
                        )}
                        innerProgressColor={colors.warning}
                        trailColor="var(--color-border)"
                        centerText={`${(trade.outerGaugePercent || 0).toFixed(0)}%`}
                        label={`${trade.levels.complete}/${trade.levels.all}`}
                        animate={true}
                        showInnerGauge={trade.showInnerGauge || false}
                      />
                    </div>
                  )}

                  {/* Right side - compact P&L: value + % inline, with a range
                      track placing current P/L between drawdown & run-up. */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">
                      {pnlBoxLabel}
                    </div>
                    <ProfitAndPerc
                      value={pnlBoxValue}
                      percentage={pnlBoxRoi}
                      privacyMode={privacyMode}
                      chipPosition="right"
                      size="md"
                    />
                    <PnlRangeTrack
                      current={pnlBoxRoi}
                      drawdown={trade.drawdown || 0}
                      runUp={trade.runUp || 0}
                    />
                  </div>
                </div>

                {/* Financial Price Chart */}
                {showChart && hasPriceData && (
                  <div className="h-32 mb-2 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chartData}
                        margin={{ top: 10, right: 6, left: 2, bottom: 10 }}
                      >
                        <defs>
                          <linearGradient
                            id={`spark-fill-${trade.id}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={colors.chart3}
                              stopOpacity={0.18}
                            />
                            <stop
                              offset="100%"
                              stopColor={colors.chart3}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>

                        {typeof takeProfitPrice === 'number' && (
                          <ReferenceLine
                            y={takeProfitPrice}
                            stroke={topColor}
                            strokeWidth={2}
                            strokeDasharray="none"
                            label={
                              <ReferenceLineLabel
                                priceText={formatAxisPrice(takeProfitPrice)}
                                pctText={pctToReach(takeProfitPrice)}
                                color={topColor}
                              />
                            }
                          />
                        )}
                        {typeof stopLossPrice === 'number' && (
                          <ReferenceLine
                            y={stopLossPrice}
                            stroke={bottomColor}
                            strokeWidth={2}
                            strokeDasharray="none"
                            label={
                              <ReferenceLineLabel
                                priceText={formatAxisPrice(stopLossPrice)}
                                pctText={pctToReach(stopLossPrice)}
                                color={bottomColor}
                              />
                            }
                          />
                        )}

                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="none"
                          fill={`url(#spark-fill-${trade.id})`}
                          isAnimationActive={false}
                          activeDot={false}
                        />

                        {/* Evolving take-profit (DCA only): steps DOWN as buys
                            fill. Grid/combo have no averaging-down TP. */}
                        {!isGridOrCombo && (
                          <Line
                            type="stepAfter"
                            dataKey="tp"
                            stroke={topColor}
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            strokeOpacity={0.85}
                            dot={false}
                            activeDot={false}
                            connectNulls
                            isAnimationActive={false}
                          />
                        )}

                        {/* isAnimationActive must stay false on every series
                            in this sparkline: recharts' JavascriptAnimate
                            calls setState from its unmount cleanup, and a
                            batch of cards unmounting mid-animation (e.g.
                            closing deals from card view) trips React's
                            nested-update limit (minified error #185). */}
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke={colors.chart3}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                          activeDot={{
                            r: 4,
                            fill: colors.chart3,
                            stroke: 'white',
                            strokeWidth: 2,
                          }}
                        />

                        {/* Markers where a DCA / base buy order filled. */}
                        <Line
                          type="monotone"
                          dataKey="fillMarker"
                          stroke="none"
                          isAnimationActive={false}
                          activeDot={false}
                          dot={(props: {
                            cx?: number;
                            cy?: number;
                            value?: number | null;
                            index?: number;
                          }) => {
                            const { cx, cy, value, index } = props;
                            if (
                              value == null ||
                              typeof cx !== 'number' ||
                              typeof cy !== 'number'
                            ) {
                              return <g key={index} />;
                            }
                            return (
                              <g key={index}>
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={3.5}
                                  fill={colors.success}
                                  stroke="#ffffff"
                                  strokeWidth={1.5}
                                />
                              </g>
                            );
                          }}
                        />

                        {/* Grid/combo: markers where a SELL order filled. */}
                        {isGridOrCombo && (
                          <Line
                            type="monotone"
                            dataKey="sellMarker"
                            stroke="none"
                            isAnimationActive={false}
                            activeDot={false}
                            dot={(props: {
                              cx?: number;
                              cy?: number;
                              value?: number | null;
                              index?: number;
                            }) => {
                              const { cx, cy, value, index } = props;
                              if (
                                value == null ||
                                typeof cx !== 'number' ||
                                typeof cy !== 'number'
                              ) {
                                return <g key={index} />;
                              }
                              return (
                                <g key={index}>
                                  <circle
                                    cx={cx}
                                    cy={cy}
                                    r={3.5}
                                    fill={colors.destructive}
                                    stroke="#ffffff"
                                    strokeWidth={1.5}
                                  />
                                </g>
                              );
                            }}
                          />
                        )}

                        <Tooltip
                          wrapperStyle={{ zIndex: 30, outline: 'none' }}
                          cursor={{
                            stroke: 'var(--color-muted-foreground)',
                            strokeDasharray: '3 3',
                          }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload || payload.length === 0) {
                              return null;
                            }
                            // Multiple series share the tooltip (price, tp,
                            // fillMarker) — pick the price series explicitly.
                            const pricePoint =
                              payload.find((p) => p.dataKey === 'price') ??
                              payload[0];
                            const price = Number(pricePoint?.value);
                            if (!Number.isFinite(price)) return null;
                            const when =
                              (typeof label === 'string' && label) ||
                              (pricePoint?.payload as { time?: string })
                                ?.time ||
                              '';
                            const pnl = isLongTrade
                              ? (price - avgEntry) * positionSize
                              : (avgEntry - price) * positionSize;
                            const roi =
                              investedAmount > 0
                                ? (pnl / investedAmount) * 100
                                : 0;
                            const pnlColor =
                              pnl < 0 ? colors.destructive : colors.success;
                            return (
                              <div className="rounded-md bg-popover text-popover-foreground shadow-lg px-2.5 py-1.5 text-xs">
                                <div className="text-[10px] text-muted-foreground">
                                  {when}
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">
                                    Price
                                  </span>
                                  <span className="font-medium tabular-nums">
                                    {formatAxisPrice(price)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">
                                    P/L
                                  </span>
                                  <span
                                    className="font-semibold tabular-nums"
                                    style={{ color: pnlColor }}
                                  >
                                    {privacyMode
                                      ? '••••'
                                      : `${pnl >= 0 ? '+' : '-'}${Math.abs(
                                          pnl
                                        ).toFixed(
                                          2
                                        )} ${symbolAssets.quoteAsset} (${
                                          roi >= 0 ? '+' : ''
                                        }${roi.toFixed(2)}%)`}
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        />

                        <XAxis
                          dataKey="time"
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 11,
                            fill: 'var(--color-muted-foreground)',
                          }}
                          height={20}
                        />

                        <YAxis
                          domain={[yMin, yMax]}
                          ticks={yTicks}
                          interval={0}
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 11,
                            fill: 'var(--color-muted-foreground)',
                          }}
                          tickFormatter={(value) => formatAxisPrice(value)}
                          width={44}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {showChart && !hasPriceData && (
                  <div className="h-32 mb-2 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded">
                    Chart data unavailable
                  </div>
                )}
              </div>
            )}

          {/* Invested and Avg Price */}
          <div className="grid grid-cols-2 gap-md mb-4">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Cost (Invested)
              </div>
              <div className="text-lg font-semibold">{investedDisplay}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                {avgPriceLabel}
              </div>
              <div className="text-lg font-semibold">{avgPriceDisplay}</div>
            </div>
          </div>

          {/* Additional Info Section */}
          <div className="grid grid-cols-2 gap-md mb-4 pt-2 border-t border-border">
            <div>
              <div className="text-xs text-muted-foreground">
                {initialPriceLabel}
              </div>
              <div className="text-sm font-medium">{initialPriceDisplay}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Current Price</div>
              <div className="text-sm font-medium">
                {currentPriceDisplay !== null ? (
                  currentPriceDisplay
                ) : (
                  <span className="text-muted-foreground">Loading...</span>
                )}
              </div>
            </div>
          </div>

          {/* Footer with exchange chip and trade-duration chip. The creation
              date/time lives in the duration tooltip rather than its own cell. */}
          <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <ExchangeChip
              exchangeId={trade.exchangeUUID || trade.exchange}
              size="xs"
              chipStyle="ghost"
              layout="stacked"
            />
            {trade.workingTime &&
              (() => {
                const createdDate =
                  trade.createdTime ??
                  (trade.created ? new Date(trade.created) : null);
                const durationChip = (
                  <TimeChip
                    time={trade.workingTime}
                    size="xs"
                    chipStyle="ghost"
                  />
                );
                if (!createdDate) return durationChip;
                const createdLabel = `Created ${createdDate.toLocaleDateString()} · ${createdDate.toLocaleTimeString(
                  [],
                  { hour: '2-digit', minute: '2-digit' }
                )}`;
                return (
                  <HelpTooltip tooltip={createdLabel}>
                    {durationChip}
                  </HelpTooltip>
                );
              })()}
          </div>
        </CardContent>
      </>
    );
  }
);

const SimpleCard = React.memo(
  ({
    trade,
    tradingPair,
    symbolAssets,
    avgPriceLabel,
    avgPriceDisplay,
    initialPriceLabel,
    initialPriceDisplay,
    currentPriceDisplay,
    botTypeForChip,
    privacyMode = false,
  }: TradeCardProps & {
    tradingPair: string;
    symbolAssets: {
      baseAsset: string;
      quoteAsset: string;
      symbolString: string;
    };
    botTypeForChip: BotTypesEnum;
    avgPriceLabel: string;
    avgPriceDisplay: string;
    initialPriceLabel: string;
    initialPriceDisplay: string;
    currentPriceDisplay: string | null;
  }) => {
    const realizedProfitDisplay = useMemo(
      () =>
        privacyMode
          ? '***'
          : `${formatNumber(trade.profit?.totalUsd || 0, true)} ${symbolAssets.quoteAsset}`,
      [privacyMode, trade.profit, symbolAssets.quoteAsset]
    );
    const unrealizedProfitDisplay = useMemo(
      () =>
        privacyMode
          ? '***'
          : `${formatNumber(trade.unrealizedProfit || 0, true)} ${symbolAssets.quoteAsset}`,
      [privacyMode, trade.unrealizedProfit, symbolAssets.quoteAsset]
    );
    const fundingDisplay = useMemo(
      () =>
        privacyMode
          ? '***'
          : `${formatNumber(trade.funding?.totalUsd || 0, true)} ${symbolAssets.quoteAsset}`,
      [privacyMode, trade.funding, symbolAssets.quoteAsset]
    );
    return (
      <>
        {/* Header Section */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col gap-xs">
            <div className="flex items-center gap-xs">
              <CoinPair
                baseAsset={symbolAssets.baseAsset}
                quoteAsset={symbolAssets.quoteAsset}
                pair={tradingPair}
                iconSize="lg"
                showText={true}
                className="text-2xl font-bold"
              />
              <StatusChip status={trade.status} size="sm" dotOnly={true} />
            </div>

            <div className="flex items-center gap-xs">
              <BotTypeChip
                botType={botTypeForChip}
                size="xs"
                chipStyle="solid"
              />
              <StrategyChip
                strategy={trade.strategy}
                size="xs"
                chipStyle="solid"
              />
            </div>

            {/* Bot Name */}
            {trade.botName && (
              <div className="flex items-center gap-xs text-sm font-medium text-muted-foreground truncate">
                {trade.botName}
                {trade.botId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(
                        buildBotViewRoute(botTypeForChip, trade.botId),
                        '_blank'
                      );
                    }}
                    className="p-1 rounded hover:bg-muted/30"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* P&L Display */}
          <div className="grid grid-cols-2 gap-xs">
            {/* Realized P&L Box */}
            {!trade.active && (
              <div
                className={`p-1 rounded-md border text-center ${
                  (trade.profit?.totalUsd || 0) < 0
                    ? 'bg-loss/10 border-loss/20'
                    : 'bg-profit/10 border-profit/20'
                }`}
              >
                <div className="text-xs text-muted-foreground">Realized</div>
                <div
                  className={`text-sm font-semibold ${
                    (trade.profit?.totalUsd || 0) < 0
                      ? 'text-loss'
                      : 'text-profit'
                  }`}
                >
                  {realizedProfitDisplay}
                </div>
              </div>
            )}
            {/* Unrealized P&L Box */}
            {trade.active && (
              <div
                className={`p-1 rounded-md border text-center ${
                  (trade.unrealizedProfit || 0) < 0
                    ? 'bg-loss/10 border-loss/20'
                    : 'bg-profit/10 border-profit/20'
                }`}
              >
                <div className="text-xs text-muted-foreground">Unrealized</div>
                <div
                  className={`text-sm font-semibold ${
                    (trade.unrealizedProfit || 0) < 0
                      ? 'text-loss'
                      : 'text-profit'
                  }`}
                >
                  {unrealizedProfitDisplay}
                </div>
              </div>
            )}
            {/* Funding Fees Box (only when funding has accrued) */}
            {!!trade.funding?.totalUsd && (
              <div
                className={`p-1 rounded-md border text-center ${
                  trade.funding.totalUsd < 0
                    ? 'bg-loss/10 border-loss/20'
                    : 'bg-profit/10 border-profit/20'
                }`}
              >
                <div className="text-xs text-muted-foreground">Funding</div>
                <div
                  className={`text-sm font-semibold ${
                    trade.funding.totalUsd < 0 ? 'text-loss' : 'text-profit'
                  }`}
                >
                  {fundingDisplay}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Exchange and Avg Price Section */}
        <div className="space-y-sm">
          <div className="flex items-center justify-between">
            <ExchangeChip
              exchangeId={trade.exchangeUUID || trade.exchange}
              size="xs"
              chipStyle="ghost"
            />
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                {avgPriceLabel}
              </div>
              <div className="font-medium">{avgPriceDisplay}</div>
            </div>
          </div>
          {/* Additional Info Section */}
          <div className="grid grid-cols-2 gap-md pt-2 border-t border-border">
            <div>
              <div className="text-xs text-muted-foreground">
                {initialPriceLabel}
              </div>
              <div className="text-sm font-medium">{initialPriceDisplay}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Current Price</div>
              <div className="text-sm font-medium">
                {currentPriceDisplay !== null ? (
                  currentPriceDisplay
                ) : (
                  <span className="text-muted-foreground">Loading...</span>
                )}
              </div>
            </div>
          </div>{' '}
          {/* Creation Time */}
          {trade.createdTime && (
            <div className="pt-2 border-t border-border mt-2">
              <div className="text-xs text-muted-foreground">Created</div>
              <div className="text-sm font-medium">
                {trade.createdTime.toLocaleDateString()} at{' '}
                {trade.createdTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }
);

export const TradeCard: React.FC<TradeCardProps> = React.memo((props) => {
  const { trade, onClick, className, enableEnhancedView, showTradeDrawer } =
    useMemo(
      () => ({
        trade: props.trade,
        onClick: props.onClick,
        className: props.className,
        privacyMode: props.privacyMode ?? false,
        enableEnhancedView: props.enableEnhancedView ?? false,
        showTradeDrawer: props.showTradeDrawer ?? false,
      }),
      [props]
    );
  // Helper function to extract base and quote assets from symbol
  const getSymbolAssets = useCallback(
    (
      symbol: string | { symbol: string; baseAsset: string; quoteAsset: string }
    ) => {
      if (typeof symbol === 'object' && symbol.baseAsset && symbol.quoteAsset) {
        return {
          baseAsset: symbol.baseAsset,
          quoteAsset: symbol.quoteAsset,
          symbolString: symbol.symbol,
        };
      }

      // Fallback for string symbols
      const symbolString = typeof symbol === 'string' ? symbol : '';

      const { baseAsset: parsedBase, quoteAsset: parsedQuote } =
        extractPairAssets(symbolString);
      const baseAsset = parsedBase;
      const quoteAsset = parsedQuote || 'USDT';

      return {
        baseAsset,
        quoteAsset,
        symbolString,
      };
    },
    []
  );

  const symbolAssets = useMemo(
    () => getSymbolAssets(trade.symbol),
    [trade.symbol, getSymbolAssets]
  );
  const tradingPair = useMemo(
    () => formatTradingPair(symbolAssets.symbolString),
    [symbolAssets.symbolString]
  );
  // State for current market price
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // Subscribe to price updates to get current market price
  useEffect(() => {
    const unsubscribe = getLatestPrices(
      (result) => {
        if (result.status === 'OK') {
          // Find the price for this trade's symbol
          const symbolPrice = result.data.find(
            (price) =>
              price.symbol ===
              (typeof trade.symbol === 'string'
                ? trade.symbol
                : trade.symbol.symbol)
          );
          if (symbolPrice) {
            setCurrentPrice(symbolPrice.price);
          }
        }
      },
      false // don't load US exchanges
    );

    return () => {
      unsubscribe();
    };
  }, [trade.symbol]);
  // Enhanced bot type conversion for better chip compatibility
  const getBotTypeForChip = useCallback((type: string) => {
    const typeMap: Record<string, BotTypesEnum> = {
      DCA: BotTypesEnum.dca,
      Combo: BotTypesEnum.combo,
      'Hedge DCA': BotTypesEnum.hedgeDca,
      'Hedge Combo': BotTypesEnum.hedgeCombo,
      Grid: BotTypesEnum.grid,
      Terminal: BotTypesEnum.terminal,
      dca: BotTypesEnum.dca,
      combo: BotTypesEnum.combo,
      hedgeDca: BotTypesEnum.hedgeDca,
      hedgeCombo: BotTypesEnum.hedgeCombo,
      grid: BotTypesEnum.grid,
      terminal: BotTypesEnum.terminal,
    };
    return typeMap[type] || BotTypesEnum.dca;
  }, []);

  const isLongTrade = useMemo(
    () =>
      trade.strategy?.toUpperCase().includes('LONG') || trade.side === 'BUY',
    [trade.strategy, trade.side]
  );

  const avgPriceValue = useMemo(
    () => trade.avgPrice || trade.entryPrice || 0,
    [trade.avgPrice, trade.entryPrice]
  );
  const avgPriceDisplay = useMemo(
    () => `${formatNumber(avgPriceValue, true)} ${symbolAssets.quoteAsset}`,
    [avgPriceValue, symbolAssets.quoteAsset]
  );
  const initialPriceValue = useMemo(
    () => trade.initialPrice || trade.entryPrice || trade.avgPrice || 0,
    [trade.initialPrice, trade.entryPrice, trade.avgPrice]
  );
  const initialPriceDisplay = useMemo(
    () => `${formatNumber(initialPriceValue, true)} ${symbolAssets.quoteAsset}`,
    [initialPriceValue, symbolAssets.quoteAsset]
  );
  const currentPriceDisplay = useMemo(
    () =>
      currentPrice !== null
        ? `${formatNumber(currentPrice, true)} ${symbolAssets.quoteAsset}`
        : null,
    [currentPrice, symbolAssets.quoteAsset]
  );

  const avgPriceLabel = useMemo(
    () => (isLongTrade ? 'Avg Buy Price' : 'Avg Sell Price'),
    [isLongTrade]
  );
  const initialPriceLabel = useMemo(
    () => (isLongTrade ? 'Initial Buy Price' : 'Initial Sell Price'),
    [isLongTrade]
  );
  const tradeType = useMemo(
    () => getBotTypeForChip(trade.type),
    [getBotTypeForChip, trade.type]
  );
  const cardContent = useMemo(
    () =>
      enableEnhancedView ? (
        <EnhancedCard
          {...props}
          tradingPair={tradingPair}
          symbolAssets={symbolAssets}
          botTypeForChip={tradeType}
          isLongTrade={isLongTrade}
          avgPriceLabel={avgPriceLabel}
          avgPriceDisplay={avgPriceDisplay}
          initialPriceLabel={initialPriceLabel}
          initialPriceDisplay={initialPriceDisplay}
          currentPriceDisplay={currentPriceDisplay}
          currentPrice={currentPrice}
        />
      ) : (
        <div className="p-md">
          <SimpleCard
            {...props}
            tradingPair={tradingPair}
            symbolAssets={symbolAssets}
            botTypeForChip={tradeType}
            avgPriceLabel={avgPriceLabel}
            avgPriceDisplay={avgPriceDisplay}
            initialPriceLabel={initialPriceLabel}
            initialPriceDisplay={initialPriceDisplay}
            currentPriceDisplay={currentPriceDisplay}
          />
        </div>
      ),
    [
      enableEnhancedView,
      props,
      tradingPair,
      symbolAssets,
      tradeType,
      isLongTrade,
      avgPriceLabel,
      avgPriceDisplay,
      initialPriceLabel,
      initialPriceDisplay,
      currentPriceDisplay,
      currentPrice,
    ]
  );

  const cardComponent = useMemo(
    () => (
      <Card
        className={cn(
          'cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20 group/card max-w-[400px]',
          className
        )}
        position={1}
        onClick={onClick}
      >
        {cardContent}
      </Card>
    ),
    [cardContent, className, onClick]
  );

  // Wrap with TradeDetailDrawer if enabled (with chart on left, details on right)
  if (showTradeDrawer) {
    return <TradeDetailDrawer trade={trade}>{cardComponent}</TradeDetailDrawer>;
  }

  return cardComponent;
});
