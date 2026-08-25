/**
 * Shared presentational atoms for the redesign's statistics surfaces.
 *
 * These were originally defined inline in two places:
 *   - `backtest/redesign/tabs/RedesignOverviewTab.tsx` (Kpi / Donut / Panel /
 *     MetricRow — the KPI-row + donut + metric-list look)
 *   - `backtest/BacktestStatsTab.tsx` (StatsSection / StatItem /
 *     StatItemWithChip — the masonry of label:value cards)
 *
 * The live-bot Statistics tab (`stats/`) renders the SAME visual language
 * against bot data instead of backtest data — exactly as legacy main-dash did
 * by importing `components/backtesting/result/*` into `botStats.tsx`. Rather
 * than copy the atoms a third time they live here, moved verbatim, so the
 * backtest and live-bot surfaces cannot visually drift apart.
 *
 * Borders are avoided per DESIGN_SYSTEM §3 — surface contrast (bg-card vs
 * bg-muted) carries the separation.
 */

import { Card } from '@/components/ui/card';
import { ProfitLossPercChip } from '@/components/ui/chip';
import type React from 'react';

// ── KPI tile ────────────────────────────────────────────────────────────────

export type KpiTone = 'up' | 'down' | 'neutral';

export interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
  /** Larger value type for the headline (Net Result) tile. */
  big?: boolean;
  /** Quiet, fixed-width tile on the muted surface (deal-duration tiles). */
  grey?: boolean;
}

/**
 * Headline KPI tile. Sits on `bg-muted` (a same-level inset on the card-level
 * modal body) by default; the "down" tone tints the whole tile with a soft
 * loss wash. The `grey` flag is now only a sizing variant (the surface is
 * `bg-muted` either way). No borders — elevation + color carry it.
 */
export const Kpi: React.FC<KpiProps> = ({
  label,
  value,
  sub,
  tone = 'neutral',
  big = false,
  grey = false,
}) => {
  const valueColor =
    tone === 'up'
      ? 'text-profit'
      : tone === 'down'
        ? 'text-loss'
        : 'text-foreground';

  // Surface: down → soft loss wash; otherwise the muted inset surface.
  const surface = tone === 'down' ? 'bg-loss/10' : 'bg-muted';

  return (
    <div
      className={`flex flex-col rounded-xl px-md py-sm ${surface} ${
        grey ? 'shrink-0 min-w-[150px]' : 'flex-1 min-w-[130px]'
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1.5 font-extrabold tabular-nums tracking-tight ${
          big ? 'text-2xl' : 'text-xl'
        } ${valueColor}`}
      >
        {value}
      </div>
      {sub != null && (
        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground/70">
          {sub}
        </div>
      )}
    </div>
  );
};

// ── donut (win rate / profit factor) ────────────────────────────────────────

export interface DonutSegment {
  value: number;
  /** A CSS color string referencing a real token, e.g. 'var(--color-profit)'. */
  color: string;
}

export interface DonutProps {
  value: string;
  label: string;
  segments: DonutSegment[];
  size?: number;
}

/**
 * Hand-rolled thin-ring donut (matches the prototype's exact look). The track
 * is `bg-muted`; segments stroke the real profit/loss/muted tokens. Center
 * shows the headline value + a small label.
 */
export const Donut: React.FC<DonutProps> = ({ value, label, segments, size = 150 }) => {
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;

  // Precompute each segment's fraction and its cumulative start offset (the
  // fraction of the circle that precedes it) as a pure reduce, so the render
  // below is a side-effect-free map — no mutation of an outer variable.
  const arcs = segments.reduce<
    Array<DonutSegment & { frac: number; start: number }>
  >((acc, s) => {
    const frac = s.value / total;
    const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].frac : 0;
    acc.push({ ...s, frac, start });
    return acc;
  }, []);

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="color-mix(in oklch, var(--color-foreground) 10%, transparent)"
        strokeWidth="12"
      />
      {arcs.map((s, i) => {
        const dash = s.frac * circ;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="12"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-s.start * circ}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
      })}
      <text
        x={cx}
        y={cy - 1}
        textAnchor="middle"
        fontSize="22"
        fontWeight="800"
        fill="var(--color-foreground)"
        className="tabular-nums"
      >
        {value}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        fontSize="10.5"
        fill="var(--color-muted-foreground)"
      >
        {label}
      </text>
    </svg>
  );
};

// ── card + metric row primitives ────────────────────────────────────────────

export interface PanelProps {
  title: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * A titled inner panel on the `bg-card` modal body. Uses `bg-muted`
 * (surface-muted) for the panel surface — the same-level inner-fill token —
 * so the panels read as insets distinct from the card-level body in BOTH
 * themes (muted is 0.955 vs the white body in light mode, and 0.245 — darker —
 * vs the 0.205 card body in dark mode). Surface contrast carries the
 * separation; no border, per DESIGN_SYSTEM §3.
 */
export const Panel: React.FC<PanelProps> = ({ title, className, children }) => (
  <div className={`flex flex-col rounded-xl bg-muted p-md ${className ?? ''}`}>
    <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </div>
    {children}
  </div>
);

export interface MetricRowProps {
  k: string;
  v: string | number;
  tone?: KpiTone;
}

export const MetricRow: React.FC<MetricRowProps> = ({ k, v, tone = 'neutral' }) => {
  const color =
    tone === 'up'
      ? 'text-profit'
      : tone === 'down'
        ? 'text-loss'
        : 'text-foreground';
  return (
    <div className="flex items-center justify-between py-[5px]">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{v}</span>
    </div>
  );
};


// ── label:value rows + section card (moved from BacktestStatsTab) ───────────

export interface StatItemProps {
  label: string;
  value: string | number;
  valueClassName?: string;
  info?: React.ReactNode;
}

export const StatItem: React.FC<StatItemProps> = ({
  label,
  value,
  valueClassName,
  info,
}) => (
  <div className="flex items-start justify-between gap-sm">
    <span className="text-sm text-muted-foreground flex items-center gap-1">
      {label}
      {info && <span className="inline-flex">{info}</span>}
    </span>
    <span
      className={`text-sm font-medium text-right ${valueClassName || 'text-foreground'}`}
    >
      {value}
    </span>
  </div>
);

export interface StatItemWithChipProps {
  label: string;
  value: number | null | undefined;
  additionalText?: string;
}

export const StatItemWithChip: React.FC<StatItemWithChipProps> = ({
  label,
  value,
  additionalText,
}) => (
  <div className="flex items-start justify-between gap-sm">
    <span className="text-sm text-muted-foreground">{label}</span>
    <div className="flex items-center gap-xs">
      {additionalText && (
        <span className="text-sm font-medium text-foreground">
          {additionalText}
        </span>
      )}
      {value !== null && value !== undefined && (
        <ProfitLossPercChip value={value} size="xs" showSign={false} />
      )}
    </div>
  </div>
);

export interface StatsSectionProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

export const StatsSection: React.FC<StatsSectionProps> = ({
  title,
  icon: Icon,
  children,
}) => (
  <Card position={2} className="p-md">
    <div className="flex items-center gap-xs mb-4">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
    {children}
  </Card>
);
