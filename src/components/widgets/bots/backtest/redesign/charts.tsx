/**
 * charts.tsx — hand-rolled SVG charts for the redesigned backtest results
 * modal. No external chart library: self-contained `<svg>` so the visual
 * frame matches the prototype (chart.jsx) 1:1 while sourcing all colors from
 * the REAL design tokens (var(--color-profit), var(--color-loss),
 * var(--color-info), var(--primary), var(--color-foreground)…) so light +
 * dark both render correctly.
 *
 * Two components:
 *  - CandleChart — per-deal price frame: y-grid + x-date labels, horizontal
 *    reference lines (entry/avg/tp/close) with right-edge price tags, and
 *    entry/DCA(diamond)/TP/close markers. Renders the reconstructed price
 *    path as a connected line+area by default (no real OHLC exists on the
 *    backtest result); if a non-degenerate `candles` array is supplied it
 *    additionally draws thin OHLC bars.
 *  - EquityChart — portfolio equity area + buy&hold line, with clickable
 *    deal dots along the curve for timeline navigation (onPick/activeIdx).
 *
 * The price path itself comes from `dealToChart` (see dealToChart.ts); this
 * file is pure presentation against typed props — no data shaping.
 */

import type React from 'react';
import type { RandomBand } from '@/lib/backtester/randomRuns/math';

import type { DealCandleVM, EquityPointVM } from './viewModel';

// ── token references (kept identical to the contract token table) ───────────
const GRID = 'color-mix(in oklch, var(--color-foreground) 9%, transparent)';
const AXIS = 'var(--color-muted-foreground)';
const SURFACE = 'var(--surface-base)'; // marker stroke (canvas color) — punches
//                                        a hole so markers read on any line

// ── shared formatters (mirror the prototype's GX.fmt* helpers) ──────────────
const fmtPx = (v: number): string =>
  v.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const fmtDate = (t: number): string =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Nice" axis ticks — ported verbatim from chart.jsx::niceTicks. */
function niceTicks(min: number, max: number, n: number): number[] {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

// ── CandleChart types ───────────────────────────────────────────────────────

/** A horizontal reference line drawn across the chart with a right-edge tag. */
export interface PriceLineVM {
  price: number;
  /** A CSS color string referencing a real token, e.g. 'var(--color-profit)'. */
  color: string;
  label: string;
  /** SVG strokeDasharray, e.g. '4 3'. '0' (default) = solid. */
  dash?: string;
  /** Render at reduced opacity (planned/unfilled reference). */
  faint?: boolean;
}

export type MarkerKind = 'entry' | 'dca' | 'tp' | 'close';

/** An event marker (entry / DCA fill / take-profit / close) on the price path. */
export interface MarkerVM {
  /** epoch ms — mapped to the nearest candle index for x-position. */
  t: number;
  price: number;
  kind: MarkerKind;
  /** for kind==='close': true if the deal closed in profit (green vs red). */
  win?: boolean;
}

export interface CandleChartProps {
  candles: DealCandleVM[];
  lines?: PriceLineVM[];
  markers?: MarkerVM[];
  width?: number;
  height?: number;
  padT?: number;
  padR?: number;
  padB?: number;
  padL?: number;
  showAxis?: boolean;
  /**
   * Draw thin OHLC bars in addition to the price line. Only meaningful when
   * the candles carry real high/low spread; defaults to off because the
   * reconstructed series is degenerate (o=h=l=c).
   */
  showBars?: boolean;
  className?: string;
}

/**
 * Per-deal price chart. Renders a connected line+area for the reconstructed
 * price path plus the prototype's overlay system (reference lines + markers).
 */
export const CandleChart: React.FC<CandleChartProps> = ({
  candles,
  lines = [],
  markers = [],
  width = 700,
  height = 380,
  padT = 14,
  padR = 84,
  padB = 26,
  padL = 8,
  showAxis = true,
  showBars = false,
  className,
}) => {
  const n = candles.length;

  // y-range from candles + reference lines so every line is in frame, even
  // when the price series is sparse (one transaction → flat path).
  const prices: number[] = [];
  for (const c of candles) {
    prices.push(c.l, c.h);
  }
  for (const l of lines) prices.push(l.price);

  // Empty frame fallback — never blank, never NaN.
  if (n === 0 && prices.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className={className}
        style={{ display: 'block' }}
      />
    );
  }

  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  // When every value is equal (flat) give the band artificial height so the
  // reference lines don't collapse onto one row.
  const rawPad = (hi - lo) * 0.08;
  const pad = rawPad > 0 ? rawPad : Math.max(Math.abs(hi) * 0.02, 1);
  const yMin = lo - pad;
  const yMax = hi + pad;

  const iw = width - padL - padR;
  const ih = height - padT - padB;
  // x maps a candle index to its column centre. Guard n===0 (lines-only frame).
  const x = (k: number): number => padL + (iw * (k + 0.5)) / Math.max(n, 1);
  const y = (p: number): number =>
    padT + ih * (1 - (p - yMin) / (yMax - yMin || 1));
  const cw = Math.max(2, (iw / Math.max(n, 1)) * 0.62);

  const ticks = niceTicks(yMin, yMax, 4);

  const markerColor = (m: MarkerVM): string =>
    m.kind === 'tp'
      ? 'var(--color-loss)'
      : m.kind === 'close'
        ? m.win
          ? 'var(--color-profit)'
          : 'var(--color-loss)'
        : 'var(--primary)';

  // Connected price path (line) + filled area underneath. Built only when we
  // have ≥1 candle; the close color drives the path tint.
  const last = candles[n - 1];
  const pathStroke =
    n > 0 && last.c >= candles[0].o
      ? 'var(--color-profit)'
      : 'var(--color-loss)';
  const linePath =
    n > 0
      ? candles
          .map((c, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)} ${y(c.c).toFixed(1)}`)
          .join(' ')
      : '';
  const areaPath =
    n > 0
      ? `${linePath} L${x(n - 1).toFixed(1)} ${(padT + ih).toFixed(1)} L${x(0).toFixed(1)} ${(padT + ih).toFixed(1)} Z`
      : '';

  // Map a marker time → nearest candle index (first candle with t >= marker
  // time, clamped). Falls back to last index when all candles precede it.
  const markerIdx = (t: number): number => {
    if (n === 0) return 0;
    for (let k = 0; k < n; k++) if (candles[k].t >= t) return k;
    return n - 1;
  };

  const gradId = `cc-grad-${Math.round(yMin)}-${Math.round(yMax)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pathStroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={pathStroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* y grid + labels */}
      {showAxis &&
        ticks.map((tk, i) => (
          <g key={`y${i}`}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(tk)}
              y2={y(tk)}
              stroke={GRID}
              strokeWidth="1"
            />
            <text
              x={width - padR + 6}
              y={y(tk) + 3}
              fill={AXIS}
              fontSize="10"
              className="tabular-nums"
            >
              {fmtPx(tk)}
            </text>
          </g>
        ))}

      {/* x date labels */}
      {showAxis &&
        n > 0 &&
        [0, Math.floor(n / 2), n - 1].map((k, i) => (
          <text
            key={`x${i}`}
            x={x(k)}
            y={height - 8}
            fill={AXIS}
            fontSize="10"
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
          >
            {fmtDate(candles[k].t)}
          </text>
        ))}

      {/* price path: area + line (the default render — no real OHLC) */}
      {n > 0 && (
        <>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={pathStroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}

      {/* optional thin OHLC bars (only when candles carry real spread) */}
      {showBars &&
        candles.map((c, k) => {
          const up = c.c >= c.o;
          const col = up ? 'var(--color-profit)' : 'var(--color-loss)';
          const yo = y(c.o);
          const yc = y(c.c);
          return (
            <g key={`bar${k}`}>
              <line
                x1={x(k)}
                x2={x(k)}
                y1={y(c.h)}
                y2={y(c.l)}
                stroke={col}
                strokeWidth="1"
                opacity="0.9"
              />
              <rect
                x={x(k) - cw / 2}
                y={Math.min(yo, yc)}
                width={cw}
                height={Math.max(1.2, Math.abs(yc - yo))}
                fill={col}
                rx="0.5"
              />
            </g>
          );
        })}

      {/* deal reference lines (entry / avg / tp / close) with right-edge tags */}
      {lines.map((l, i) => (
        <g key={`line${i}`}>
          <line
            x1={padL}
            x2={width - padR}
            y1={y(l.price)}
            y2={y(l.price)}
            stroke={l.color}
            strokeWidth="1.3"
            strokeDasharray={l.dash || '0'}
            opacity={l.faint ? 0.5 : 0.95}
          />
          <g transform={`translate(${width - padR + 2}, ${y(l.price)})`}>
            <rect x="0" y="-9" width={padR - 4} height="18" rx="4" fill={l.color} />
            <text x="6" y="3.5" fill="#fff" fontSize="10" fontWeight="700">
              {l.label}
            </text>
            <text
              x={padR - 8}
              y="3.5"
              fill="#fff"
              fontSize="9.5"
              textAnchor="end"
              className="tabular-nums"
              opacity="0.92"
            >
              {fmtPx(l.price)}
            </text>
          </g>
        </g>
      ))}

      {/* markers: entry triangle / DCA diamond / close flag */}
      {markers.map((m, i) => {
        const mx = x(markerIdx(m.t));
        const my = y(m.price);
        const col = markerColor(m);
        if (m.kind === 'dca') {
          return (
            <g key={`m${i}`} transform={`translate(${mx},${my})`}>
              <rect
                x="-3.4"
                y="-3.4"
                width="6.8"
                height="6.8"
                transform="rotate(45)"
                fill="var(--primary)"
                stroke={SURFACE}
                strokeWidth="1"
              />
            </g>
          );
        }
        return (
          <g key={`m${i}`} transform={`translate(${mx},${my})`}>
            <circle r="6.5" fill={col} stroke={SURFACE} strokeWidth="1.5" />
            <path
              d={
                m.kind === 'close'
                  ? 'M-2.6 0 L0 2.6 L2.6 0 L0 -2.6 Z'
                  : 'M0 -3 L2.7 2 L-2.7 2 Z'
              }
              fill="#fff"
            />
          </g>
        );
      })}
    </svg>
  );
};

// ── EquityChart types ───────────────────────────────────────────────────────

/** A deal anchor along the equity curve, used for timeline navigation. */
export interface EquityDealMarker {
  /** index into the equity `data` array where this deal closed. */
  endIdx: number;
  out: 'win' | 'loss' | 'open';
}

export interface EquityChartProps {
  data: EquityPointVM[];
  width?: number;
  height?: number;
  padT?: number;
  padR?: number;
  padB?: number;
  padL?: number;
  /** Deal dots overlaid on the curve; null/[] hides them. */
  dealMarkers?: EquityDealMarker[] | null;
  /** Index of the active (selected) deal marker, or -1 for none. */
  activeIdx?: number;
  /** Click handler for a deal marker (receives its index). */
  onPick?: ((idx: number) => void) | null;
  /** Draw the buy&hold comparison line. */
  showBH?: boolean;
  /** Random-entry band (spec 150), aligned to `data`'s points. */
  band?: RandomBand | null;
  className?: string;
}

/**
 * Portfolio equity area chart with optional buy&hold line and clickable deal
 * dots. Stroke color tracks net result: green if the curve ends above its
 * start, red otherwise.
 */
export const EquityChart: React.FC<EquityChartProps> = ({
  data,
  width = 560,
  height = 230,
  padT = 12,
  padR = 8,
  padB = 22,
  padL = 34,
  dealMarkers = null,
  activeIdx = -1,
  onPick = null,
  showBH = true,
  band = null,
  className,
}) => {
  if (data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className={className}
        style={{ display: 'block' }}
      />
    );
  }

  const eqs = data.map((d) => d.eq);
  // buy&hold values may be null per-point; only fold in non-null ones for the
  // y-range and only draw the line when the whole series is present.
  const bhs = data
    .map((d) => d.bh)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const hasBH = showBH && bhs.length === data.length;
  const hasBand = !!band && band.lo.length === data.length;
  const bandVals = hasBand
    ? [...band.lo, ...band.hi].filter((v) => Number.isFinite(v))
    : [];
  const all = [...eqs, ...(hasBH ? bhs : []), ...bandVals];

  const yMin = Math.min(...all) * 0.99;
  const yMax = Math.max(...all) * 1.01;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const denom = data.length - 1 || 1;
  const x = (i: number): number => padL + (iw * i) / denom;
  const y = (v: number): number =>
    padT + ih * (1 - (v - yMin) / (yMax - yMin || 1));

  const eqLine = data
    .map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.eq).toFixed(1)}`)
    .join(' ');
  const bhLine = hasBH
    ? data
        .map(
          (d, i) =>
            `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.bh as number).toFixed(1)}`,
        )
        .join(' ')
    : '';
  const bandPath = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
  const bandArea = hasBand
    ? [
        ...bandPath(band.hi),
        ...bandPath(band.lo)
          .map((p) => `L${p.slice(1)}`)
          .reverse(),
        'Z',
      ].join(' ')
    : '';
  const bandMid = hasBand ? bandPath(band.mid).join(' ') : '';
  const area = `${eqLine} L${x(data.length - 1).toFixed(1)} ${(padT + ih).toFixed(1)} L${padL.toFixed(1)} ${(padT + ih).toFixed(1)} Z`;

  const ticks = niceTicks(yMin, yMax, 3);
  const start = data[0].eq;
  const final = data[data.length - 1].eq;
  // net-result tint: up vs the curve's own starting equity (no hardcoded 300).
  const stroke = final >= start ? 'var(--color-profit)' : 'var(--color-loss)';

  const gradId = `eq-grad-${Math.round(yMin)}-${Math.round(yMax)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((tk, i) => (
        <g key={`y${i}`}>
          <line
            x1={padL}
            x2={width - padR}
            y1={y(tk)}
            y2={y(tk)}
            stroke={GRID}
            strokeDasharray="3 3"
          />
          <text
            x={padL - 6}
            y={y(tk) + 3}
            fill={AXIS}
            fontSize="9.5"
            textAnchor="end"
            className="tabular-nums"
          >
            {Math.round(tk)}
          </text>
        </g>
      ))}

      {[0, Math.floor(data.length / 2), data.length - 1].map((k, i) => (
        <text
          key={`x${i}`}
          x={x(k)}
          y={height - 6}
          fill={AXIS}
          fontSize="9.5"
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
        >
          {fmtDate(data[k].t)}
        </text>
      ))}

      <path d={area} fill={`url(#${gradId})`} />
      {hasBand && (
        <>
          <path
            d={bandArea}
            fill="var(--color-muted-foreground)"
            opacity="0.16"
          />
          <path
            d={bandMid}
            fill="none"
            stroke="var(--color-muted-foreground)"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />
        </>
      )}
      {hasBH && (
        <path
          d={bhLine}
          fill="none"
          stroke="var(--color-info)"
          strokeWidth="1.4"
          opacity="0.85"
        />
      )}
      <path
        d={eqLine}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* deal markers along the equity curve (timeline navigation) */}
      {dealMarkers &&
        dealMarkers.map((d, i) => {
          const pt = data[d.endIdx] ?? data[data.length - 1];
          const cx = x(Math.min(d.endIdx, data.length - 1));
          const cy = y(pt.eq);
          const col =
            d.out === 'win'
              ? 'var(--color-profit)'
              : d.out === 'loss'
                ? 'var(--color-loss)'
                : 'var(--color-muted-foreground)';
          const active = i === activeIdx;
          return (
            <g
              key={`d${i}`}
              transform={`translate(${cx},${cy})`}
              style={{ cursor: onPick ? 'pointer' : 'default' }}
              onClick={onPick ? () => onPick(i) : undefined}
            >
              {active && <circle r="9" fill={col} opacity="0.22" />}
              <circle
                r={active ? 5 : 3.4}
                fill={col}
                stroke={SURFACE}
                strokeWidth="1.4"
              />
            </g>
          );
        })}
    </svg>
  );
};
