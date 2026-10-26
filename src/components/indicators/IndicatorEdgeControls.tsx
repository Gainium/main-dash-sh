/**
 * Price behaviour in the bot form's indicator editors: the verdict of the
 * tested setting the editor currently reproduces, and the tested settings
 * picker with Apply.
 */
import { FlaskConical } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  IndicatorEdgePanel,
  RegimeChip,
} from '@/components/indicators/IndicatorEdgePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip } from '@/components/ui/tooltip';
import { useIndicatorEdge } from '@/hooks/useIndicatorEdge';
import type { IndicatorAction, IndicatorSection } from '@/types';
import type { IndicatorEdge, IndicatorEdgeSetting } from '@/types/helpCenter';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import type { IndicatorDefinition } from '@/types/indicators/indicatorTypes';
import {
  EDGE_VERDICT_BADGE as VERDICT_BADGE,
  EDGE_VERDICT_LABEL,
  formatEdgePct,
} from '@/utils/indicatorEdge';
import {
  matchEdgeSetting,
  type EdgeApplyRequest,
} from '@/utils/indicators/edgeApply';

const fullAnalysisUrl = (slug: string) =>
  `https://gainium.io/indicators/${encodeURIComponent(slug)}#edge`;

function badgeTooltip(edge: IndicatorEdge, setting: IndicatorEdgeSetting) {
  const { pooled, regimes } = setting;
  const lines = [
    `${setting.label} · ${setting.tf} · ${setting.side === 'long' ? 'Long' : 'Short'}`,
    `Edge after ${edge.method.horizon} candles: ${formatEdgePct(pooled.edge)} (luck band ${formatEdgePct(pooled.chance[0])} to ${formatEdgePct(pooled.chance[1])})`,
    `${pooled.entries.toLocaleString('en-US')} signals in ${pooled.episodes.toLocaleString('en-US')} moves`,
  ];
  if (regimes) {
    lines.push(
      `Uptrend ${formatEdgePct(regimes.up.edge)} (${EDGE_VERDICT_LABEL[regimes.up.verdict]}) · Downtrend ${formatEdgePct(regimes.down.edge)} (${EDGE_VERDICT_LABEL[regimes.down.verdict]})`
    );
  }
  lines.push('Past price behaviour on BTC, ETH and SOL, not financial advice.');
  return lines.join('\n');
}

interface MatchBadgeProps {
  definition: IndicatorDefinition;
  params: IndicatorParamsState;
  action: IndicatorAction;
  section?: IndicatorSection | undefined;
}

/**
 * The verdict of the tested setting the editor's params reproduce. Renders
 * nothing when they reproduce none, or the indicator has no data.
 */
export const IndicatorEdgeMatchBadge: React.FC<MatchBadgeProps> = ({
  definition,
  params,
  action,
  section,
}) => {
  const { edge, slug } = useIndicatorEdge(definition);
  const setting = useMemo(
    () =>
      edge
        ? matchEdgeSetting({
            definition,
            action,
            section,
            params,
            settings: edge.settings,
          })
        : null,
    [edge, definition, action, section, params]
  );
  if (!edge || !setting || !slug) return null;
  const verdict = setting.pooled.verdict;
  return (
    <div
      className="space-y-1"
      data-testid="edge-match"
      data-setting={setting.id}
    >
      <Tooltip
        tooltip={badgeTooltip(edge, setting)}
        tooltipURL={fullAnalysisUrl(slug)}
        tooltipURLLabel="Full analysis"
      >
        <Badge variant={VERDICT_BADGE[verdict]} className="cursor-help">
          {`Tested: ${EDGE_VERDICT_LABEL[verdict]}`}
        </Badge>
      </Tooltip>
      {setting.regimes ? (
        <div className="flex flex-wrap gap-1">
          <RegimeChip name="Uptrend" cell={setting.regimes.up} plain />
          <RegimeChip name="Downtrend" cell={setting.regimes.down} plain />
        </div>
      ) : null}
    </div>
  );
};

interface TestedSettingsButtonProps {
  definition: IndicatorDefinition;
  onApply: (request: EdgeApplyRequest) => void;
  /** The editor's interval; the picker opens on that timeframe when tested. */
  interval?: string | undefined;
}

/**
 * "Tested" in an indicator editor's action row: opens the indicator's tested
 * settings with Apply. Renders nothing when the indicator has no data.
 */
export const TestedSettingsButton: React.FC<TestedSettingsButtonProps> = ({
  definition,
  onApply,
  interval,
}) => {
  const { edge, slug } = useIndicatorEdge(definition);
  const [open, setOpen] = useState(false);
  if (!edge || !slug) return null;
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label="Tested settings"
      >
        <FlaskConical className="mr-1 h-3.5 w-3.5" />
        Tested
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          zIndex={90}
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {definition.shortLabel || definition.label} tested settings
            </DialogTitle>
          </DialogHeader>
          <IndicatorEdgePanel
            edge={edge}
            slug={slug}
            framed={false}
            initialTf={interval}
            indicatorType={definition.type}
            onApplySetting={(request) => {
              onApply(request);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
