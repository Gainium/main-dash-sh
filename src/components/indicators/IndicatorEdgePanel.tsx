/**
 * Price behaviour vs random entries for an indicator help article: one row per
 * tested setting on the chosen timeframe, with Apply when the article was
 * opened from the indicator dialog of the same indicator.
 */
import { ExternalLink } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoIcon, Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type {
  IndicatorEdge,
  IndicatorEdgeCell,
  IndicatorEdgeSetting,
  IndicatorEdgeVerdict,
} from '@/types/helpCenter';
import {
  EDGE_VERDICT_BADGE as VERDICT_BADGE,
  EDGE_VERDICT_LABEL,
  edgeForSide,
  edgeRowsFor,
  edgeSideNote,
  edgeTimeframes,
  type EdgeSide,
  formatEdgeDay,
  formatEdgePct,
} from '@/utils/indicatorEdge';
import {
  isApplicableEdgeBot,
  type EdgeApplyRequest,
} from '@/utils/indicators/edgeApply';


const VERDICT_TONE: Record<IndicatorEdgeVerdict, string> = {
  edge: 'text-profit',
  fragile: 'text-warning',
  none: 'text-foreground',
  worse: 'text-loss',
  'fragile-worse': 'text-warning',
  few: 'text-muted-foreground',
};

export const EDGE_DISCLAIMER =
  'Past price behaviour on BTC, ETH and SOL — not financial advice.';

/** Said when the panel is in a bot context but the condition's side is not known. */
const UNKNOWN_SIDE_NOTE =
  "This condition's trading side is not known here, so each setting shows the side it was tested on.";

function methodTooltip(edge: IndicatorEdge, sideUnknown: boolean): string {
  const m = edge.method;
  const parts = [
    `Each signal opens a hypothetical deal at the close of the signal candle. Edge is the average price move ${m.horizon} candles later minus the move after a random candle, in the deal's favour.`,
    `The luck band is the range up to ${m.randomDraws} random copies of the same entries reach by luck (5th to 95th percentile).`,
    `A likely edge, or a worse-than-random result, has to hold without its strongest move and at another horizon (${m.horizons.join(', ')} candles); fragile means it did not.`,
  ];
  if (edge.settings.some((s) => s.regimes)) {
    parts.push(
      `Uptrend and downtrend: the pair's daily close above or below its ${m.regime?.sma ?? 200}-day average when the setting fired, each compared with random candles from the same trend.`
    );
  }
  parts.push(
    `Too few signals: fewer than ${m.minEpisodes} separate moves.`,
    'Entry timing only: no take profit, DCA orders or stop loss.',
    `Data: ${m.source} ${m.pairs.join(', ')}, ${formatEdgeDay(m.from)} to ${formatEdgeDay(m.to)}. Updated ${formatEdgeDay(edge.updatedAt)}.`
  );
  if (sideUnknown) parts.push(UNKNOWN_SIDE_NOTE);
  return parts.join(' ');
}

export const EdgeValue: React.FC<{ cell: IndicatorEdgeCell; className?: string }> = ({
  cell,
  className,
}) => (
  <span
    className={cn('tabular-nums', VERDICT_TONE[cell.verdict], className)}
  >
    {formatEdgePct(cell.edge)}
  </span>
);

const RegimeChipBody: React.FC<{ name: string; cell: IndicatorEdgeCell }> = ({
  name,
  cell,
}) => (
  <span
    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border/60 px-1.5 py-px text-xs text-muted-foreground"
    data-testid="edge-regime"
  >
    {name}
    <EdgeValue cell={cell} />
  </span>
);

/** Uptrend/downtrend chip; `plain` drops its own tooltip (inside another one). */
export const RegimeChip: React.FC<{
  name: string;
  cell: IndicatorEdgeCell;
  plain?: boolean;
}> = ({ name, cell, plain = false }) =>
  plain ? (
    <RegimeChipBody name={name} cell={cell} />
  ) : (
    <Tooltip tooltip={`${name}: ${EDGE_VERDICT_LABEL[cell.verdict]}`}>
      <RegimeChipBody name={name} cell={cell} />
    </Tooltip>
  );

interface EdgeRowProps {
  setting: IndicatorEdgeSetting;
  horizon: number;
  onApply?: (() => void) | undefined;
}

const EdgeRow: React.FC<EdgeRowProps> = ({ setting, horizon, onApply }) => {
  const { pooled, regimes } = setting;
  return (
    <li
      className="flex flex-wrap items-center gap-x-sm gap-y-1 py-2"
      data-testid="edge-row"
      data-setting={setting.id}
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm text-foreground">
          {setting.label}{' '}
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            · {setting.side === 'long' ? 'Long' : 'Short'}
          </span>
        </p>
        {regimes ? (
          <div className="mt-1 flex flex-wrap gap-1">
            <RegimeChip name="Uptrend" cell={regimes.up} />
            <RegimeChip name="Downtrend" cell={regimes.down} />
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-xs">
        <Tooltip
          tooltip={[
            `Edge after ${horizon} candles. Luck band ${formatEdgePct(pooled.chance[0])} to ${formatEdgePct(pooled.chance[1])}. ${pooled.entries.toLocaleString('en-US')} signals in ${pooled.episodes.toLocaleString('en-US')} moves.`,
            edgeSideNote(setting),
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <EdgeValue
            cell={pooled}
            className="inline-block min-w-14 text-right text-sm"
          />
        </Tooltip>
        <Badge variant={VERDICT_BADGE[pooled.verdict]}>
          {EDGE_VERDICT_LABEL[pooled.verdict]}
        </Badge>
        {onApply ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={onApply}
            aria-label={`Apply ${setting.label} on ${setting.tf}`}
          >
            Apply
          </Button>
        ) : null}
      </div>
    </li>
  );
};

export interface IndicatorEdgePanelProps {
  edge: IndicatorEdge;
  /** Article slug, for the link to the full analysis. */
  slug: string;
  /** Present when opened from the indicator dialog. */
  onApplySetting?: ((request: EdgeApplyRequest) => void) | undefined;
  /** The dialog's indicator type; Apply shows only for a matching config. */
  indicatorType?: string | undefined;
  /** Draw its own border and fill (default); off inside a dialog. */
  framed?: boolean;
  /** Timeframe to open on when it has rows; else the data's default. */
  initialTf?: string | undefined;
  /**
   * The side the condition trades in the bot: every result is shown from
   * that side (mirrored when it was tested on the other). `null` = a bot
   * context where the side is unknown (shown as tested, and said so);
   * omitted = no bot context (help article), shown as tested.
   */
  side?: EdgeSide | null;
}

export const IndicatorEdgePanel: React.FC<IndicatorEdgePanelProps> = ({
  edge,
  slug,
  onApplySetting,
  indicatorType,
  framed = true,
  initialTf,
  side,
}) => {
  const view = useMemo(() => edgeForSide(edge, side), [edge, side]);
  const tfs = edgeTimeframes(edge);
  const [tf, setTf] = useState(
    initialTf && tfs.includes(initialTf) ? initialTf : edge.defaultTf
  );
  const active = tfs.includes(tf) ? tf : edge.defaultTf;
  const rows = edgeRowsFor(view, active);

  return (
    <section
      className={cn(framed && 'rounded-lg border border-border/60 bg-muted/20 p-sm')}
      aria-label="Price behaviour vs random entries"
      data-testid="indicator-edge-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-sm gap-y-1">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold text-foreground">
            Price behaviour vs random entries
          </h3>
          <Tooltip tooltip={methodTooltip(edge, side === null)}>
            <InfoIcon />
          </Tooltip>
        </div>
        <a
          href={`https://gainium.io/indicators/${encodeURIComponent(slug)}#edge`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          Full analysis
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {tfs.length > 1 ? (
        <Tabs value={active} onValueChange={setTf} className="mt-xs">
          <TabsList
            fullWidth={false}
            className="inline-grid"
            style={{ gridTemplateColumns: `repeat(${tfs.length}, minmax(0, 1fr))` }}
          >
            {tfs.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      <ul className="mt-xs divide-y divide-border/40">
        {rows.map((setting) => {
          const bot = setting.bot;
          const canApply =
            !!onApplySetting &&
            !!bot &&
            bot.type === indicatorType &&
            isApplicableEdgeBot(bot);
          return (
            <EdgeRow
              key={`${setting.tf}-${setting.id}`}
              setting={setting}
              horizon={edge.method.horizon}
              onApply={
                canApply
                  ? () => onApplySetting({ bot, tf: setting.tf })
                  : undefined
              }
            />
          );
        })}
      </ul>

      <p className="mt-xs text-xs text-muted-foreground">{EDGE_DISCLAIMER}</p>
    </section>
  );
};
