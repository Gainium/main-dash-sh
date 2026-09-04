/* eslint-disable spacing/no-hardcoded-font-size */
/* eslint-disable @typescript-eslint/no-explicit-any */
import logger from '@/lib/loggerInstance';
import { formatBalance, formatPercentage } from '@/utils/numberFormatter';
import {
  formatLiquidationPrice,
  type LadderLiquidation,
} from '@/utils/bots/dca/liquidation';
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DealOverviewGraphCompactProps {
  orders: Array<{
    number: number;
    price: number;
    side: string;
    quantity: number;
    type: string;
    priceDeviation?: string | null;
    avgPrice: number | undefined;
    requiredPrice: number | undefined;
    requiredPricePercent: string;
    totalBase: number | undefined;
    totalQuote: number | undefined;
  }>;
  /**
   * When true, the component will ensure it takes up extra vertical space
   * (min-height 500px) so it can be used inside larger layouts.
   */
  full?: boolean;

  /** When false, hides TP overlay lines/labels. */
  showTpLines?: boolean;

  /** When true, shows an indicator notice and "min % from prev" separation labels */
  indicatorMode?: boolean;

  /** Fallback TP % to display when orders have no requiredPricePercent (e.g. techInd close mode) */
  fallbackTpPercent?: number;

  /**
   * Estimated liquidation projection for this ladder. When supplied (futures
   * bots with leverage > 1) the graph draws a dashed liquidation line at the
   * fully-deployed liquidation price and stretches its Y range to fit it.
   */
  liquidation?: LadderLiquidation | null;
}

const DealOverviewGraphCompact: React.FC<DealOverviewGraphCompactProps> = ({
  orders,
  full = false,
  showTpLines = true,
  indicatorMode = false,
  fallbackTpPercent,
  liquidation = null,
}) => {
  const liquidationPrice = liquidation?.effective?.liquidationPrice ?? null;
  const {
    buyOrders,
    sellOrders,
    pyramidData,
    maxY,
    minY,
    referencePrice,
    isShort,
  } = useMemo(() => {
    // Use order type to classify: entry/DCA orders vs exit orders.
    // For SHORT strategy, entry orders have side='SELL', so filtering by side alone breaks.
    const entryTypes = ['Start order', 'DCA order', 'Smart order'];
    const buyOrders = orders.filter((o) => entryTypes.includes(o.type));
    const sellOrders = orders.filter((o) => !entryTypes.includes(o.type));

    if (buyOrders.length === 0) {
      return {
        buyOrders: [],
        sellOrders: [],
        pyramidData: [],
        maxY: 0,
        minY: 0,
        isShort: false,
      };
    }

    // Reference price is the first buy order (base order)
    const referencePrice = buyOrders[0].price;

    // Safe deviation calculation: guard against referencePrice === 0
    const safeDeviation = (price: number, ref: number): number => {
      if (ref === 0) {
        // Fallback: use absolute price difference scaled to make graph usable
        // Find the max price among all orders to create a synthetic range
        const maxPrice = Math.max(...orders.map((o) => o.price), 1);
        return (price / maxPrice) * 100;
      }
      return ((price - ref) / ref) * 100;
    };

    // Detect SHORT strategy: DCA orders go UP from base (positive deviations)
    const lastEntry = buyOrders[buyOrders.length - 1];
    const isShort = buyOrders.length > 1 && lastEntry.price > referencePrice;

    // Calculate total capital needed
    const totalCapital =
      buyOrders[buyOrders.length - 1]?.totalQuote ||
      buyOrders[0]?.totalQuote ||
      0;

    // Build pyramid data for buy orders
    let cumulativeCapital = 0;
    const pyramidData = buyOrders.map((order, idx) => {
      const rawDeviation = safeDeviation(order.price, referencePrice);
      // For SHORT, negate deviation so pyramid grows downward (same visual as LONG)
      const priceDeviation = isShort ? -rawDeviation : rawDeviation;

      // Calculate incremental capital for this order
      const prevCapital = idx > 0 ? buyOrders[idx - 1].totalQuote || 0 : 0;
      const orderCapital = (order.totalQuote || 0) - prevCapital;

      const prevPercentage =
        totalCapital > 0 ? (cumulativeCapital / totalCapital) * 100 : 0;
      // eslint-disable-next-line react-hooks/immutability
      cumulativeCapital += orderCapital;
      const currentPercentage =
        totalCapital > 0 ? (cumulativeCapital / totalCapital) * 100 : 0;

      const prevDeviation =
        idx > 0
          ? (() => {
              const raw = safeDeviation(
                buyOrders[idx - 1].price,
                referencePrice
              );
              return isShort ? -raw : raw;
            })()
          : 0;

      return {
        order,
        priceDeviation,
        prevDeviation,
        topX: prevPercentage,
        bottomX: currentPercentage,
        orderCapital,
        index: idx,
      };
    });

    // Biggest single incremental DCA as percent of total capital
    const biggestIncrementPercent =
      pyramidData.length > 0 && totalCapital > 0
        ? Math.max(
            ...pyramidData.map((d) => (d.orderCapital / totalCapital) * 100)
          )
        : 0;

    // Calculate Y-axis range (include sell orders for full range)
    const allDeviations = orders.map((o) => {
      const raw = safeDeviation(o.price, referencePrice);
      return isShort ? -raw : raw;
    });
    let maxY = Math.max(...allDeviations);
    let minY = Math.min(...allDeviations);

    // Liquidation sits beyond the deepest safety order (below for long, above
    // for short — which `isShort` folds into the same downward direction), so
    // the Y range has to stretch or the line clamps onto the axis.
    if (liquidationPrice != null && liquidationPrice > 0) {
      const rawLiq = safeDeviation(liquidationPrice, referencePrice);
      const liqDeviation = isShort ? -rawLiq : rawLiq;
      if (Number.isFinite(liqDeviation)) {
        minY = Math.min(minY, liqDeviation);
        maxY = Math.max(maxY, liqDeviation);
      }
    }

    // Ensure some headroom for the base order triangle apex if it's at the top
    if (maxY < 2) {
      maxY = Math.max(maxY, 2);
    }

    logger.debug('Pyramid calculation', {
      totalCapital,
      biggestIncrementPercent,
      maxY,
      minY,
      isShort,
      pyramidDataLength: pyramidData.length,
    });

    return {
      buyOrders,
      sellOrders,
      pyramidData,
      maxY,
      minY,
      referencePrice,
      isShort,
    };
  }, [orders, liquidationPrice]);

  // Get effective TP % for an order, using fallbackTpPercent when the order has none
  const getEffectiveTpPercent = (
    order: DealOverviewGraphCompactProps['orders'][number]
  ): number => {
    const parsed = parseFloat(order.requiredPricePercent as any);
    if (!isNaN(parsed) && parsed !== 0) return parsed;
    if (fallbackTpPercent != null && fallbackTpPercent !== 0)
      return fallbackTpPercent;
    return 0;
  };

  const padding = 12; // Increased padding for better spacing from scales

  // Convert price deviation to Y coordinate (base order at top, DCA orders below)
  // Map to the usable area within padding
  const getYCoord = (deviation: number): number => {
    const range = maxY - minY;
    if (range === 0) return 50;
    if (!Number.isFinite(range)) return 50;
    const usableHeight = 100 - 2 * padding;
    const normalizedPos = (maxY - deviation) / range; // 0 to 1
    return padding + normalizedPos * usableHeight;
  };

  // Convert an absolute price to the internal deviation used by getYCoord
  const priceToDeviation = (price: number): number => {
    if (!referencePrice || referencePrice === 0) return 0;
    const raw = ((price - referencePrice) / referencePrice) * 100;
    return isShort ? -raw : raw;
  };

  // Get color for buy orders (darker green as coverage widens)
  const getBuyColor = (index: number, total: number): string => {
    // Base order is lightest, last DCA is darkest
    const intensity = 0.3 + (index / (total - 1 || 1)) * 0.5; // 0.3 to 0.8
    return `oklch(from var(--color-profit) ${0.9 - intensity * 0.3} ${0.15 + intensity * 0.1} h / ${0.6 + intensity * 0.3})`;
  };

  const getSellColor = (): string => {
    return `oklch(from var(--color-loss) l c h / 0.7)`;
  };

  type OrderType = DealOverviewGraphCompactProps['orders'][number];
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipData, setTooltipData] = useState<{
    order: OrderType;
    x: number;
    y: number;
    index?: number; // zero-based DCA index for display
  } | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<{
    left: number;
    top: number;
    placement: 'right' | 'left';
  } | null>(null);

  // Hover state used to dim unrelated TPs / DCAs when hovering
  const [hoverState, setHoverState] = useState<{
    type: 'dca' | 'tp';
    index: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!tooltipData) {
      setTooltipStyle(null);
      return;
    }

    // Larger offset so tooltip doesn't sit on top of the mouse. Prefer placing to the left of the cursor.
    const offset = 20;

    if (!tooltipRef.current) {
      // Provisional placement: prefer left of the cursor with extra gap, fall back to staying inside window
      const provisionalLeft = Math.max(
        8,
        Math.min(window.innerWidth - 8, tooltipData.x - offset - 160)
      );
      const provisionalTop = Math.max(
        8,
        Math.min(tooltipData.y - 40, window.innerHeight - 8)
      );

      setTooltipStyle(
        (prev) =>
          prev ?? {
            left: provisionalLeft,
            top: provisionalTop,
            placement: 'left',
          }
      );
      return;
    }

    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();

    const spaceRight = window.innerWidth - tooltipData.x - offset;
    const spaceLeft = tooltipData.x - offset;

    const placeLeft = spaceLeft >= rect.width + 8;
    const placeRight = !placeLeft && spaceRight >= rect.width + 8;

    let left: number;
    let placement: 'left' | 'right';

    if (placeLeft) {
      left = Math.max(8, tooltipData.x - offset - rect.width);
      placement = 'left';
    } else if (placeRight) {
      left = Math.min(
        window.innerWidth - rect.width - 8,
        tooltipData.x + offset
      );
      placement = 'right';
    } else {
      // No room on either side: clamp inside viewport but bias left of the cursor with extra gap
      left = Math.max(
        8,
        Math.min(
          window.innerWidth - rect.width - 8,
          tooltipData.x - offset - rect.width
        )
      );
      placement = 'left';
    }

    let top = tooltipData.y - rect.height / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));

    setTooltipStyle({ left, top, placement });
  }, [tooltipData]);

  // Helpers for layout and rounded trapezoid paths
  const clamp = (v: number, a: number, b: number) =>
    Math.max(a, Math.min(b, v));

  const buildRoundedTrapezoidPath = (
    topLeft: number,
    topRight: number,
    bottomRight: number,
    bottomLeft: number,
    topY: number,
    bottomY: number,
    r = 0.6
  ) => {
    // Validate inputs - return empty path if any value is NaN
    if (
      !Number.isFinite(topLeft) ||
      !Number.isFinite(topRight) ||
      !Number.isFinite(bottomRight) ||
      !Number.isFinite(bottomLeft) ||
      !Number.isFinite(topY) ||
      !Number.isFinite(bottomY)
    ) {
      logger.warn('[DealOverviewGraphCompact] Invalid trapezoid coordinates', {
        topLeft,
        topRight,
        bottomRight,
        bottomLeft,
        topY,
        bottomY,
      });
      return '';
    }

    // Compute half-sizes
    const topWidth = Math.abs(topRight - topLeft);
    const bottomWidth = Math.abs(bottomRight - bottomLeft);
    const height = Math.abs(bottomY - topY);

    // Overall max radius limited by geometry
    const maxR = Math.min(r, topWidth / 2, bottomWidth / 2, height / 2);

    // Use smaller top radius when top is narrow to avoid odd arcs at the apex
    const topR = Math.min(maxR, topWidth / 4);
    const bottomR = Math.min(maxR, bottomWidth / 4);

    // If there isn't room for rounding, draw simple polygon
    if (maxR <= 0.08) {
      return `M ${topLeft} ${topY} L ${topRight} ${topY} L ${bottomRight} ${bottomY} L ${bottomLeft} ${bottomY} Z`;
    }

    // Start at top-left + topR
    const tlx = topLeft + topR;
    const trx = topRight - topR;
    const brx = bottomRight - bottomR;
    const blx = bottomLeft + bottomR;

    const tly = topY;
    const tlyr = topY + topR;
    const bry = bottomY;
    const bryr = bottomY - bottomR;

    // Build path with optional arcs on top and bottom corners
    let path = `M ${tlx} ${tly}`;

    // top edge
    path += ` L ${trx} ${tly}`;
    if (topR > 0.09) path += ` A ${topR} ${topR} 0 0 1 ${topRight} ${tlyr}`;
    else path += ` L ${topRight} ${tlyr}`;

    // right edge
    path += ` L ${bottomRight} ${bryr}`;
    if (bottomR > 0.09) path += ` A ${bottomR} ${bottomR} 0 0 1 ${brx} ${bry}`;
    else path += ` L ${brx} ${bry}`;

    // bottom edge
    path += ` L ${blx} ${bry}`;
    if (bottomR > 0.09)
      path += ` A ${bottomR} ${bottomR} 0 0 1 ${bottomLeft} ${bryr}`;
    else path += ` L ${bottomLeft} ${bryr}`;

    // left edge
    path += ` L ${topLeft} ${tlyr}`;
    if (topR > 0.09) path += ` A ${topR} ${topR} 0 0 1 ${tlx} ${tly}`;
    else path += ` L ${tlx} ${tly}`;

    path += ' Z';
    return path;
  };

  const buildRoundedTrianglePath = (
    apexX: number,
    apexY: number,
    baseLeftX: number,
    baseRightX: number,
    baseY: number,
    r = 0.6
  ) => {
    // Validate inputs - return empty path if any value is NaN
    if (
      !Number.isFinite(apexX) ||
      !Number.isFinite(apexY) ||
      !Number.isFinite(baseLeftX) ||
      !Number.isFinite(baseRightX) ||
      !Number.isFinite(baseY)
    ) {
      logger.warn('[DealOverviewGraphCompact] Invalid triangle coordinates', {
        apexX,
        apexY,
        baseLeftX,
        baseRightX,
        baseY,
      });
      return '';
    }

    // Compute geometry
    const baseWidth = Math.abs(baseRightX - baseLeftX);
    const height = Math.abs(baseY - apexY);

    // Limit radius by geometry
    const maxR = Math.min(r, baseWidth / 2, height / 2);

    // If there's not enough room for rounding, fallback to simple triangle
    if (maxR <= 0.08) {
      return `M ${apexX} ${apexY} L ${baseRightX} ${baseY} L ${baseLeftX} ${baseY} Z`;
    }

    const apexR = Math.min(maxR, baseWidth / 6);
    const baseR = Math.min(maxR, baseWidth / 4);

    // Helper: normalize vector
    const norm = (vx: number, vy: number) => {
      const l = Math.hypot(vx, vy) || 1;
      return { x: vx / l, y: vy / l };
    };

    // Points offset from apex toward base corners (to start/finish apex arc)
    const toBR = norm(baseRightX - apexX, baseY - apexY);
    const toBL = norm(baseLeftX - apexX, baseY - apexY);
    const a_to_br = { x: apexX + toBR.x * apexR, y: apexY + toBR.y * apexR };
    const a_to_bl = { x: apexX + toBL.x * apexR, y: apexY + toBL.y * apexR };

    // Points offset from base corners toward apex and along base (for base corner arcs)
    const br_to_a = norm(apexX - baseRightX, apexY - baseY);
    const br_to_bl = norm(baseLeftX - baseRightX, 0);
    const br_in1 = {
      x: baseRightX + br_to_a.x * baseR,
      y: baseY + br_to_a.y * baseR,
    };
    const br_in2 = {
      x: baseRightX + br_to_bl.x * baseR,
      y: baseY + br_to_bl.y * baseR,
    };

    const bl_to_a = norm(apexX - baseLeftX, apexY - baseY);
    const bl_to_br = norm(baseRightX - baseLeftX, 0);
    const bl_in1 = {
      x: baseLeftX + bl_to_br.x * baseR,
      y: baseY + bl_to_br.y * baseR,
    };
    const bl_in2 = {
      x: baseLeftX + bl_to_a.x * baseR,
      y: baseY + bl_to_a.y * baseR,
    };

    // Build path going clockwise from apex->baseRight side
    let path = `M ${a_to_br.x} ${a_to_br.y}`;

    // Line toward base-right inner point
    path += ` L ${br_in1.x} ${br_in1.y}`;
    // Arc around base-right corner
    path += ` A ${baseR} ${baseR} 0 0 1 ${br_in2.x} ${br_in2.y}`;

    // Line along base toward base-left inner point
    path += ` L ${bl_in1.x} ${bl_in1.y}`;
    // Arc around base-left corner
    path += ` A ${baseR} ${baseR} 0 0 1 ${bl_in2.x} ${bl_in2.y}`;

    // Line up toward apex inner point
    path += ` L ${a_to_bl.x} ${a_to_bl.y}`;
    // Small arc around apex
    path += ` A ${apexR} ${apexR} 0 0 1 ${a_to_br.x} ${a_to_br.y}`;

    path += ' Z';
    return path;
  };

  if (buyOrders.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
        No orders
      </div>
    );
  }

  // No active right-side label should be highlighted on hover; keep all labels dimmed during hover uniformly

  return (
    <div
      className={`w-full h-full relative overflow-hidden ${full ? 'min-h-[400px]' : ''}`}
      data-testid="deal-overview-graph"
    >
      {/* Graph */}
      <div className="absolute inset-0 p-xs">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Grid pattern */}
            <pattern
              id="grid"
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 10 0 L 0 0 0 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.2"
                className="text-border/30"
              />
            </pattern>

            {/* Clip path for pyramid area */}
            <clipPath id="pyramid-clip">
              <rect
                x={padding}
                y={padding}
                width={100 - 2 * padding}
                height={100 - 2 * padding}
              />
            </clipPath>

            {/* Gradients for each trapezoid */}
            {pyramidData.map((data) => {
              const baseColor = getBuyColor(data.index, pyramidData.length);
              const gradientId = `gradient-${data.order.number}`;
              return (
                <linearGradient
                  key={gradientId}
                  id={gradientId}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  {/* Transparent at the top (0%), solid color at the bottom (100%) */}
                  <stop offset="0%" stopColor={baseColor} stopOpacity="0" />
                  <stop offset="60%" stopColor={baseColor} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={baseColor} stopOpacity="1" />
                </linearGradient>
              );
            })}
          </defs>

          {/* Background grid */}
          <rect width="100" height="100" fill="url(#grid)" />

          {/* Y-axis labels (left side - price deviation %) */}
          <g className="text-[3px] fill-muted-foreground font-mono">
            {(() => {
              const labels: React.ReactNode[] = [];
              const range = maxY - minY;
              if (!Number.isFinite(range) || range <= 0) return null;

              // Pick a step that yields ~6-10 labels
              const rawStep = range / 7;
              const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
              const nice = [1, 2, 5, 10, 20, 25, 50, 100];
              const labelStep =
                (nice.find((n) => n * magnitude >= rawStep) ?? 0) * magnitude ||
                5;

              const minLabel = Math.floor(minY / labelStep) * labelStep;
              const maxLabel = Math.ceil(maxY / labelStep) * labelStep;

              for (let val = maxLabel; val >= minLabel; val -= labelStep) {
                const yPos = getYCoord(val);
                // For SHORT, internal values are negated; display the original sign
                const displayVal = isShort ? -val : val;
                const sign = displayVal > 0 ? '+' : '';
                const labelOpacity = hoverState ? 0.25 : 1;
                labels.push(
                  <text
                    key={`left-${val}`}
                    x="3"
                    y={yPos + 1}
                    textAnchor="start"
                    style={{ opacity: labelOpacity }}
                  >
                    {sign}
                    {Math.round(displayVal)}%
                  </text>
                );
              }
              return labels;
            })()}
          </g>

          {/* Right-side absolute prices are rendered later (above overlays) */}

          {/* X-axis labels (bottom - accumulated capital %) */}
          <g className="text-[3px] fill-muted-foreground font-mono">
            <text x={padding} y="98" textAnchor="start">
              0%
            </text>
            <text x={50} y="98" textAnchor="middle">
              50%
            </text>
            <text x={100 - padding} y="98" textAnchor="end">
              100%
            </text>
          </g>

          {/* Zero line indicator (if in range) */}
          {minY < 0 && maxY > 0 && (
            <line
              x1={padding}
              y1={getYCoord(0)}
              x2={100 - padding}
              y2={getYCoord(0)}
              stroke="currentColor"
              strokeWidth="0.3"
              strokeDasharray="1,1"
              className="text-muted-foreground/50"
            />
          )}

          {/* Per-DCA TP lines and hover connectors (render behind DCAs so they don't block hover) */}
          {showTpLines ? (
            <g>
              {/* Hover dotted connector (render behind TP labels so it doesn't cover them) */}
              {hoverState
                ? (() => {
                    const hd = pyramidData[hoverState.index];
                    if (!hd) return null;

                    const isLast = hd.index === pyramidData.length - 1;
                    const sideMargin = 1.5;
                    const usableWidth = 100 - 2 * (padding + sideMargin);
                    const width = isLast
                      ? usableWidth
                      : (hd.bottomX / 100) * usableWidth;
                    const centerX = 50;

                    let xStart = isLast
                      ? padding + sideMargin
                      : centerX - width / 2;
                    let xEnd = isLast
                      ? 100 - padding - sideMargin
                      : centerX + width / 2;
                    const minX = padding + sideMargin;
                    const maxX = 100 - padding - sideMargin;
                    xStart = clamp(xStart, minX, maxX);
                    xEnd = clamp(xEnd, minX, maxX);
                    const labelX = (xStart + xEnd) / 2;

                    const dcaY = getYCoord(hd.priceDeviation);

                    const reqPercent = getEffectiveTpPercent(hd.order);
                    // Only show connector if we have a valid, non-zero TP
                    if (reqPercent === 0) return null;

                    const tpPrice = hd.order.price * (1 + reqPercent / 100);
                    const tpY =
                      tpPrice && referencePrice
                        ? getYCoord(priceToDeviation(tpPrice))
                        : undefined;

                    if (tpY == null) return null;
                    if (Math.abs(dcaY - tpY) < 0.4) return null;

                    const midX = (centerX + labelX) / 2;
                    const midY = (dcaY + tpY) / 2;

                    const changeLabel = `${reqPercent.toFixed(2)}%`;

                    return (
                      <g pointerEvents="none">
                        <line
                          x1={centerX}
                          y1={dcaY}
                          x2={labelX}
                          y2={tpY}
                          stroke="currentColor"
                          strokeWidth={0.7}
                          strokeDasharray="1,1"
                          strokeLinecap="round"
                          className="text-green-300"
                          opacity={0.95}
                        />
                        <rect
                          x={midX - 6}
                          y={midY - 2.2}
                          width={12}
                          height={3.6}
                          rx={0.6}
                          fill="black"
                          opacity={0.55}
                        />
                        <text
                          x={midX}
                          y={midY + 0.9}
                          textAnchor="middle"
                          className="text-[2.5px] font-medium"
                          style={{ fill: '#e6ffed' }}
                        >
                          {changeLabel}
                        </text>
                        <circle
                          cx={centerX}
                          cy={dcaY}
                          r={0.6}
                          fill="currentColor"
                          className="text-green-300"
                        />
                        <circle
                          cx={labelX}
                          cy={tpY}
                          r={0.6}
                          fill="currentColor"
                          className="text-green-300"
                        />
                      </g>
                    );
                  })()
                : null}

              {/* Per-DCA TP lines: one per buy order, width = cumulative capital %, position = required change from that DCA */}
              {pyramidData.map((data) => {
                const reqPercent = getEffectiveTpPercent(data.order);
                if (reqPercent === 0) {
                  return null;
                }

                const tpPrice = data.order.price * (1 + reqPercent / 100);
                const deviation = priceToDeviation(tpPrice);
                const yRaw = getYCoord(deviation);

                // Clamp Y coordinate to be within the graph bounds (account for stroke)
                const strokeHalf = 0.9;
                const y = clamp(
                  yRaw,
                  padding + strokeHalf,
                  100 - padding - strokeHalf
                );

                // Width is cumulative capital bottomX; center the TP line horizontally
                const sideMargin = 1.5;
                const usableWidth = 100 - 2 * (padding + sideMargin);

                // For the last TP (last DCA), use 100% width
                const isLast = data.index === pyramidData.length - 1;
                const width = isLast
                  ? usableWidth
                  : (data.bottomX / 100) * usableWidth;
                const centerX = 50;

                let xStart = isLast
                  ? padding + sideMargin
                  : centerX - width / 2;
                let xEnd = isLast
                  ? 100 - padding - sideMargin
                  : centerX + width / 2;

                // Clamp so TP lines don't overflow the graph area
                const minX = padding + sideMargin;
                const maxX = 100 - padding - sideMargin;
                xStart = clamp(xStart, minX, maxX);
                xEnd = clamp(xEnd, minX, maxX);

                if (xEnd - xStart <= 0.5) return null;

                // Only render TP label/line if this DCA has a valid TP %
                if (reqPercent === 0) return null;

                const labelText =
                  data.index === 0 ? 'TP Base' : `TP DCA #${data.index}`;
                const labelX = (xStart + xEnd) / 2;

                // Dim TP lines when hovering another DCA (so DCAs can still dim TPs)
                const tpDimmed =
                  hoverState &&
                  hoverState.type === 'dca' &&
                  hoverState.index !== data.index;

                return (
                  <g key={`tp-dca-${data.order.number}`} pointerEvents="none">
                    <line
                      x1={xStart}
                      y1={y}
                      x2={xEnd}
                      y2={y}
                      stroke={getSellColor()}
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeOpacity={tpDimmed ? 0.25 : 1}
                    />
                    <text
                      x={labelX}
                      y={y + 1}
                      textAnchor="middle"
                      className="text-[2.5px] font-bold"
                      style={{ fill: '#fff', opacity: tpDimmed ? 0.4 : 1 }}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })}
            </g>
          ) : null}

          <g clipPath="url(#pyramid-clip)">
            {pyramidData
              .slice()
              .reverse()
              .map((data) => {
                // Base order is the tip of the pyramid; render it as a triangle (apex at topY).

                // Map cumulative capital % to usable width (within padding + side margin)
                const sideMargin = 1.5; // margin from axis lines
                const usableWidth = 100 - 2 * (padding + sideMargin); // percent units in viewBox
                const centerX = 50; // center of the viewBox

                // topX and bottomX are already 0-100% of total capital.
                // For the base order (index 0) the "top" width should be 0 so the segment becomes a triangle.
                const topWidthView =
                  data.index === 0 ? 0 : (data.topX / 100) * usableWidth;
                let bottomWidthView = (data.bottomX / 100) * usableWidth;

                // Center the trapezoids
                let topLeft = centerX - topWidthView / 2;
                let topRight = centerX + topWidthView / 2;
                let bottomLeft = centerX - bottomWidthView / 2;
                let bottomRight = centerX + bottomWidthView / 2;

                // Clamp left/right to avoid touching axis
                const minX = padding + sideMargin;
                const maxX = 100 - padding - sideMargin;
                topLeft = clamp(topLeft, minX, maxX);
                topRight = clamp(topRight, minX, maxX);
                bottomLeft = clamp(bottomLeft, minX, maxX);
                bottomRight = clamp(bottomRight, minX, maxX);

                // vertical positions come from deviations: top = previous order's deviation, bottom = this order's deviation
                // Add small margin between trapezoids and keep some top/bottom spacing from axes
                const layerMargin = 0.25;
                const topMargin = 1.2;
                const bottomMargin = 1.2;

                // Special handling for base order: base at base price, apex halfway toward TP
                let topY = getYCoord(data.prevDeviation) + layerMargin;
                let bottomY = getYCoord(data.priceDeviation) - layerMargin;

                if (data.index === 0) {
                  // Ensure base width visibility
                  const minBaseWidth = 3.0;
                  const bwRaw = (data.bottomX / 100) * usableWidth;
                  bottomWidthView = Math.max(bwRaw, minBaseWidth);
                  bottomLeft = centerX - bottomWidthView / 2;
                  bottomRight = centerX + bottomWidthView / 2;

                  // Base line is at the base order price
                  const baseYRaw = getYCoord(data.priceDeviation);
                  const minTriHeight = 6.0; // Increased for better visibility

                  const yMin = padding + topMargin;
                  const yMax = 100 - padding - bottomMargin;

                  // Apex should be toward TP if available; otherwise use a fixed offset (upwards)
                  const reqPercent = getEffectiveTpPercent(data.order);

                  // Check if we have a valid TP (non-zero and finite)
                  const hasValidTP = reqPercent !== 0 && referencePrice;

                  // Preferred direction: toward TP when available, otherwise upward (-1)
                  let prefDirection = -1;
                  let desiredApexY: number;

                  if (hasValidTP) {
                    const tpPrice = data.order.price * (1 + reqPercent / 100);
                    const tpY = getYCoord(priceToDeviation(tpPrice));

                    prefDirection = Math.sign(tpY - baseYRaw) || -1;
                    desiredApexY = (baseYRaw + tpY) / 2;

                    // Ensure a minimum visible height toward TP
                    if (Math.abs(baseYRaw - desiredApexY) < minTriHeight) {
                      desiredApexY = baseYRaw + prefDirection * minTriHeight;
                    }
                  } else {
                    // No TP: force a visible apex offset using the preferred direction (upward)
                    desiredApexY = baseYRaw - minTriHeight;
                  }

                  // Clamp within graph bounds
                  const baseY = clamp(baseYRaw, yMin, yMax);
                  let apexY = clamp(desiredApexY, yMin, yMax);

                  // If clamping collapsed the visible height below minimum, try the opposite direction
                  if (Math.abs(baseY - apexY) < minTriHeight) {
                    const opposite = clamp(
                      baseY - prefDirection * minTriHeight,
                      yMin,
                      yMax
                    );

                    if (Math.abs(baseY - opposite) >= minTriHeight) {
                      apexY = opposite;
                    } else {
                      // Last resort: place apex minTriHeight away from base if possible
                      if (baseY - minTriHeight >= yMin) {
                        apexY = baseY - minTriHeight;
                      } else if (baseY + minTriHeight <= yMax) {
                        apexY = baseY + minTriHeight;
                      } // else leave apexY as-is (cannot satisfy minimum)
                    }
                  }

                  topY = apexY; // apex
                  bottomY = baseY; // base
                  topLeft = centerX;
                  topRight = centerX;
                  bottomLeft = clamp(bottomLeft, minX, maxX);
                  bottomRight = clamp(bottomRight, minX, maxX);
                } else {
                  // Clamp vertical positions so trapezoids don't touch axes
                  topY = clamp(
                    topY,
                    padding + topMargin,
                    100 - padding - bottomMargin - 0.5
                  );
                  bottomY = clamp(
                    bottomY,
                    padding + topMargin + 0.5,
                    100 - padding - bottomMargin
                  );

                  // Ensure a minimum height
                  if (bottomY - topY < 0.8) {
                    const mid = (topY + bottomY) / 2;
                    topY = mid - 0.4;
                    bottomY = mid + 0.4;
                  }
                }

                const gradientId = `gradient-${data.order.number}`;

                const pathD =
                  data.index === 0
                    ? buildRoundedTrianglePath(
                        centerX,
                        topY,
                        bottomLeft,
                        bottomRight,
                        bottomY,
                        0.6
                      )
                    : buildRoundedTrapezoidPath(
                        topLeft,
                        topRight,
                        bottomRight,
                        bottomLeft,
                        topY,
                        bottomY,
                        0.6
                      );

                // Skip rendering if path is invalid
                if (!pathD || pathD.length === 0) {
                  logger.warn(
                    '[DealOverviewGraphCompact] Skipping invalid path',
                    { orderNumber: data.order.number, index: data.index }
                  );
                  return null;
                }

                // Dim DCAs if hovering a TP or when hovering another DCA (so non-focused DCAs are subdued)
                const isDimmedDca =
                  (hoverState &&
                    hoverState.type === 'tp' &&
                    hoverState.index !== data.index) ||
                  (hoverState &&
                    hoverState.type === 'dca' &&
                    hoverState.index !== data.index);
                const dcaOpacity = isDimmedDca ? 0.25 : 1;

                return (
                  <g
                    key={`buy-${data.order.number}`}
                    onMouseEnter={(e) => {
                      setTooltipData({
                        order: data.order,
                        x: e.clientX,
                        y: e.clientY,
                        index: data.index,
                      });
                      setHoverState({ type: 'dca', index: data.index });
                    }}
                    onMouseMove={(e) =>
                      setTooltipData((prev) =>
                        prev
                          ? { ...prev, x: e.clientX, y: e.clientY }
                          : {
                              order: data.order,
                              x: e.clientX,
                              y: e.clientY,
                              index: data.index,
                            }
                      )
                    }
                    onMouseLeave={() => {
                      setTooltipData(null);
                      setHoverState(null);
                    }}
                    className="cursor-pointer"
                    style={{ opacity: dcaOpacity }}
                  >
                    {/* Trapezoid / triangle block with rounded corners and gradient */}
                    <path
                      d={pathD}
                      fill={`url(#${gradientId})`}
                      stroke="none"
                    />

                    {/* Add subtle inner highlight */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="rgba(255,255,255,0.03)"
                      strokeWidth="0.2"
                    />
                  </g>
                );
              })}
          </g>

          {/* Separation labels between consecutive DCA orders (min % from prev) */}
          {indicatorMode && pyramidData.length > 1 && (
            <g
              className="text-[2.5px] fill-muted-foreground font-mono"
              pointerEvents="none"
            >
              {pyramidData.slice(1).map((data) => {
                const stepPercent = Math.abs(
                  data.priceDeviation - data.prevDeviation
                );
                if (stepPercent < 0.001) return null;

                const midY =
                  (getYCoord(data.priceDeviation) +
                    getYCoord(data.prevDeviation)) /
                  2;

                const labelX = padding + 2;

                return (
                  <g key={`sep-${data.order.number}`}>
                    {/* Background pill */}
                    <rect
                      x={labelX - 0.5}
                      y={midY - 2}
                      width={16}
                      height={3.6}
                      rx={0.6}
                      fill="currentColor"
                      className="text-muted/60"
                    />
                    <text
                      x={labelX + 7.5}
                      y={midY + 0.3}
                      textAnchor="middle"
                      className="text-[2.2px] font-medium"
                      style={{ fill: 'var(--color-muted-foreground)' }}
                    >
                      min {stepPercent.toFixed(2)}%
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Draw per-DCA TP lines and existing TP/SL orders */}
          <g>
            {/* Hover highlights (avg price line + dotted connector from DCA to its TP) */}
            {hoverState
              ? (() => {
                  const hd = pyramidData[hoverState.index];
                  if (!hd) return null;

                  // Average price horizontal line only
                  const avgPrice = hd.order.avgPrice;

                  // Only render visuals if we have needed numbers
                  return (
                    <g pointerEvents="none">
                      {/* Average price line */}
                      {avgPrice != null && referencePrice
                        ? (() => {
                            const avgDev = priceToDeviation(avgPrice);
                            const yAvg = clamp(
                              getYCoord(avgDev),
                              padding + 0.6,
                              100 - padding - 0.6
                            );
                            return (
                              <g>
                                <line
                                  x1={padding}
                                  x2={100 - padding - 1.6}
                                  y1={yAvg}
                                  y2={yAvg}
                                  stroke="currentColor"
                                  strokeWidth={0.9}
                                  strokeDasharray="1,2"
                                  className="text-yellow-300"
                                  opacity={0.95}
                                />
                                <text
                                  x={100 - padding + 0.6}
                                  y={yAvg + 1}
                                  textAnchor="start"
                                  className="text-[2.5px] font-semibold"
                                  style={{ fill: 'white' }}
                                >
                                  Avg: ${avgPrice.toFixed(2)}
                                </text>

                                {/* Render required-price label on top of avg line to ensure visibility */}
                                {(() => {
                                  const reqPercent = getEffectiveTpPercent(
                                    hd.order
                                  );
                                  if (reqPercent === 0) return null;

                                  const tpPrice =
                                    hd.order.price * (1 + reqPercent / 100);
                                  const tpY = referencePrice
                                    ? getYCoord(priceToDeviation(tpPrice))
                                    : undefined;
                                  if (tpY == null) return null;

                                  const isLast =
                                    hd.index === pyramidData.length - 1;
                                  const sideMargin = 1.5;
                                  const usableWidth =
                                    100 - 2 * (padding + sideMargin);
                                  const width = isLast
                                    ? usableWidth
                                    : (hd.bottomX / 100) * usableWidth;
                                  const centerX = 50;

                                  let xStart = isLast
                                    ? padding + sideMargin
                                    : centerX - width / 2;
                                  let xEnd = isLast
                                    ? 100 - padding - sideMargin
                                    : centerX + width / 2;
                                  const minX = padding + sideMargin;
                                  const maxX = 100 - padding - sideMargin;
                                  xStart = clamp(xStart, minX, maxX);
                                  xEnd = clamp(xEnd, minX, maxX);
                                  const labelX = (xStart + xEnd) / 2;

                                  const dcaY = getYCoord(hd.priceDeviation);
                                  const midX = (centerX + labelX) / 2;
                                  const midY = (dcaY + tpY) / 2;

                                  const changeLabel = `${reqPercent.toFixed(2)}%`;

                                  return (
                                    <g pointerEvents="none">
                                      <rect
                                        x={midX - 6}
                                        y={midY - 2.2}
                                        width={12}
                                        height={3.6}
                                        rx={0.6}
                                        fill="black"
                                        opacity={0.55}
                                      />
                                      <text
                                        x={midX}
                                        y={midY + 0.9}
                                        textAnchor="middle"
                                        className="text-[2.5px] font-medium"
                                        style={{ fill: '#e6ffed' }}
                                      >
                                        {changeLabel}
                                      </text>
                                    </g>
                                  );
                                })()}
                              </g>
                            );
                          })()
                        : null}
                    </g>
                  );
                })()
              : null}

            {/* Existing TP/SL orders (kept for completeness) */}
            {sellOrders.map((order) => {
              // Skip original full-width TP orders (we render per-DCA TP lines instead)
              if (order.type === 'TP order') return null;

              const ref = buyOrders[0].price;
              const rawDev = ref !== 0 ? ((order.price - ref) / ref) * 100 : 0;
              const deviation = isShort ? -rawDev : rawDev;
              const yRaw = getYCoord(deviation);
              // Clamp Y coordinate to be within the graph bounds, account for stroke half-width
              const strokeHalf = 0.9;
              const y = Math.max(
                padding + strokeHalf,
                Math.min(100 - padding - strokeHalf, yRaw)
              );
              const color = getSellColor();

              // Draw as a thick line inside the graph area at full width
              const xStart = padding;
              const xEnd = 100 - padding;

              return (
                <g key={`sell-${order.number}`}>
                  <line
                    x1={xStart}
                    y1={y}
                    x2={xEnd}
                    y2={y}
                    stroke={color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <title>
                      {order.type || 'Exit'}
                      {'\n'}Price: ${order.price.toFixed(2)}
                      {'\n'}Deviation: {deviation.toFixed(2)}%
                    </title>
                  </line>
                  {/* Small label aligned right and white, centered vertically */}
                  <text
                    x={xEnd - 1.5}
                    y={y + 1}
                    textAnchor="end"
                    className="text-[2.5px] font-bold"
                    style={{ fill: '#fff' }}
                  >
                    {order.type === 'TP order' ? 'TP' : 'SL'}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Right-side absolute prices (aligned with Y labels) */}
          <g
            className="text-[3px] fill-muted-foreground font-mono"
            pointerEvents="none"
          >
            {(() => {
              const labels: React.ReactNode[] = [];
              const range = maxY - minY;
              if (!Number.isFinite(range) || range <= 0) return null;

              const rawStep = range / 7;
              const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
              const nice = [1, 2, 5, 10, 20, 25, 50, 100];
              const labelStep =
                (nice.find((n) => n * magnitude >= rawStep) ?? 0) * magnitude ||
                5;

              const minLabel = Math.floor(minY / labelStep) * labelStep;
              const maxLabel = Math.ceil(maxY / labelStep) * labelStep;

              const labelX = 100 - padding + 3.5;

              for (let val = maxLabel; val >= minLabel; val -= labelStep) {
                const yPos = getYCoord(val);
                const actualDeviation = isShort ? -val : val;
                const price = referencePrice
                  ? referencePrice * (1 + actualDeviation / 100)
                  : null;

                const labelOpacity = hoverState ? 0.25 : 1;

                labels.push(
                  <text
                    key={`right-${val}`}
                    x={labelX}
                    y={yPos + 1}
                    textAnchor="start"
                    style={{ opacity: labelOpacity }}
                  >
                    {price != null && Number.isFinite(price)
                      ? `$${price.toFixed(2)}`
                      : '—'}
                  </text>
                );
              }
              return labels;
            })()}
          </g>

          {/* Estimated liquidation line — where the fully-deployed ladder
              liquidates. Dashed red, spanning the plot, with the price and the
              buffer from the last safety order on the label. */}
          {liquidationPrice != null && liquidationPrice > 0
            ? (() => {
                const liqY = clamp(
                  getYCoord(priceToDeviation(liquidationPrice)),
                  padding + 0.6,
                  100 - padding - 0.6
                );
                const cascade = (liquidation?.cascadeSteps.length ?? 0) > 0;
                return (
                  <g pointerEvents="none">
                    <line
                      x1={padding}
                      x2={100 - padding}
                      y1={liqY}
                      y2={liqY}
                      stroke="currentColor"
                      strokeWidth={cascade ? 0.9 : 0.7}
                      strokeDasharray="2,1.5"
                      className="text-loss"
                      opacity={0.95}
                    />
                    <text
                      x={padding + 0.6}
                      y={liqY - 1.2}
                      textAnchor="start"
                      className="text-[2.8px] font-semibold fill-loss"
                    >
                      {cascade ? '\u26a0 ' : ''}Est. liquidation{' '}
                      {formatLiquidationPrice(liquidationPrice)}
                    </text>
                    <text
                      x={100 - padding - 0.6}
                      y={liqY - 1.2}
                      textAnchor="end"
                      className="text-[2.5px] fill-loss/80"
                    >
                      {cascade && liquidation?.effective
                        ? `after order #${liquidation.effective.index + 1} fills`
                        : liquidation?.effective?.bufferPercent != null
                          ? `${liquidation.effective.bufferPercent.toFixed(1)}% past the last order`
                          : ''}
                    </text>
                  </g>
                );
              })()
            : null}

          {/* Border frame - left and bottom only */}
          <line
            x1={padding}
            y1={padding}
            x2={padding}
            y2={100 - padding}
            stroke="currentColor"
            strokeWidth="0.4"
            className="text-border"
          />
          <line
            x1={padding}
            y1={100 - padding}
            x2={100 - padding}
            y2={100 - padding}
            stroke="currentColor"
            strokeWidth="0.4"
            className="text-border"
          />
        </svg>
        {tooltipData
          ? createPortal(
              <div
                ref={tooltipRef}
                className="bg-popover border rounded-lg p-md text-xs shadow-xl pointer-events-none"
                style={{
                  position: 'fixed',
                  left:
                    tooltipStyle?.left ??
                    Math.min(window.innerWidth - 8, tooltipData.x + 12),
                  top:
                    tooltipStyle?.top ??
                    Math.max(
                      8,
                      Math.min(tooltipData.y - 40, window.innerHeight - 8)
                    ),
                  zIndex: 9999,
                  maxWidth: 320,
                }}
              >
                <div className="space-y-xs">
                  <div className="flex items-center justify-between gap-lg">
                    <span className="text-muted-foreground">Order:</span>
                    <span className="font-semibold">
                      {tooltipData.index != null
                        ? tooltipData.index === 0
                          ? 'Base'
                          : `DCA ${tooltipData.index}`
                        : `DCA ${tooltipData.order.number}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-lg">
                    <span className="text-muted-foreground">Price:</span>
                    <span className="font-mono">
                      ${tooltipData.order.price.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-lg">
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="font-mono">
                      {formatBalance(tooltipData.order.quantity, 'USDT')} USDT
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-lg">
                    <span className="text-muted-foreground">Cumulative:</span>
                    <span className="font-mono">
                      ${tooltipData.order.totalQuote?.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-lg">
                    <span className="text-muted-foreground">Avg Price:</span>
                    <span className="font-mono">
                      ${tooltipData.order.avgPrice?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  {(() => {
                    const reqPercent = getEffectiveTpPercent(tooltipData.order);
                    const hasValidTP = reqPercent !== 0;
                    return hasValidTP ? (
                      <>
                        <div className="flex items-center justify-between gap-lg">
                          <span className="text-muted-foreground">
                            TP Target:
                          </span>
                          <span className="font-mono">
                            $
                            {(
                              tooltipData.order.requiredPrice ??
                              tooltipData.order.price * (1 + reqPercent / 100)
                            ).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-lg">
                          <span className="text-muted-foreground">
                            Required change:
                          </span>
                          <span className="font-mono">
                            {formatPercentage(reqPercent)}
                          </span>
                        </div>
                      </>
                    ) : null;
                  })()}
                </div>
              </div>,
              document.body
            )
          : null}
      </div>
      {indicatorMode && (
        <div className="px-sm">
          <div className="rounded bg-muted/50 border border-border/50 px-sm py-xs text-xs text-muted-foreground">
            Separation shown is the minimum % from previous order. Actual
            separation will depend on indicator signals at runtime.
          </div>
        </div>
      )}
    </div>
  );
};

export default DealOverviewGraphCompact;
