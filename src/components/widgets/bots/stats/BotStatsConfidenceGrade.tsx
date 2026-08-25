/**
 * Confidence Grade — the A+ … F badge plus the deal-count scale.
 *
 * Port of legacy `main-dash/components/backtesting/result/confidenceGradDev.tsx`
 * (a disabled MUI Slider with fixed marks) as a plain, non-interactive scale so
 * the redesign doesn't pull a slider in just to draw a read-only ruler.
 *
 * The letter itself comes from the backend (`stats.numerical.general
 * .confidenceGrade`); the scale is purely illustrative — it shows how close
 * this bot's closed-deal count is to the next confidence tier. The mark
 * positions and the /385 denominator are the legacy values, kept so the two
 * dashboards grade identically.
 */

import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import type React from 'react';

/** Legacy mark positions on the 0–100 scale. */
const GRADE_MARKS: Array<{ pos: number; label: string }> = [
  { pos: 0, label: 'F' },
  { pos: 27, label: 'E' },
  { pos: 34, label: 'D' },
  { pos: 42, label: 'C' },
  { pos: 54, label: 'B' },
  { pos: 71, label: 'A' },
  { pos: 100, label: 'A+' },
];

/** Deal count that pins the scale to its right edge, per legacy. */
const FULL_CONFIDENCE_DEALS = 385;

export interface BotStatsConfidenceGradeProps {
  grade: string;
  deals: number;
}

export const BotStatsConfidenceGrade: React.FC<
  BotStatsConfidenceGradeProps
> = ({ grade, deals }) => {
  const pos = Math.min(100, Math.max(0, (deals / FULL_CONFIDENCE_DEALS) * 100));

  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl bg-muted px-md py-sm">
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Confidence Grade
        <Tooltip
          tooltip="A grading system (A+ to F) for your results based on deal count. Higher deal counts lead to higher confidence levels, giving you a clearer perspective on strategy robustness."
          tooltipURL="https://gainium.io/help/confidence-grade"
        >
          <InfoIcon className="h-3.5 w-3.5" />
        </Tooltip>
      </div>

      <div className="my-2 text-5xl font-extrabold leading-none text-foreground">
        {grade || 'F'}
      </div>

      <div className="relative mt-4 w-full pt-5">
        {/* deal-count bubble, pinned above the current position */}
        <div
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground"
          style={{ left: `${pos}%` }}
        >
          {deals} deals
        </div>

        {/* track */}
        <div className="relative h-[3px] w-full rounded-full bg-foreground/10">
          {GRADE_MARKS.map((m) => (
            <span
              key={m.label}
              className="absolute top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
              style={{ left: `${m.pos}%` }}
            />
          ))}
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `${pos}%` }}
          />
        </div>

        {/* mark labels */}
        <div className="relative mt-1.5 h-4 w-full">
          {GRADE_MARKS.map((m) => (
            <span
              key={m.label}
              className="absolute -translate-x-1/2 text-xs text-muted-foreground"
              style={{ left: `${m.pos}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
