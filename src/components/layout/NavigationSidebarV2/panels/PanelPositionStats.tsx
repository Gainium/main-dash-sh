import { NotCalculated } from '@/components/ui/large-account';
import {
  MenuPanelStatsBoxes,
  type MenuStatBox,
} from '@/components/ui/MenuPanelStatsBoxes';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import {
  usePositionTotals,
  type PositionTotalsScope,
} from '@/hooks/usePositionTotals';
import { formatCurrency } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import React from 'react';

interface PanelPositionStatsProps {
  /** Bot types whose open positions count toward "Money in Positions". */
  positions: readonly PositionTotalsScope[];
  /** Bot types whose unrealized P&L is summed. Empty = no uPnL box. */
  pnl: readonly PositionTotalsScope[];
}

/**
 * The sidebar panels' headline numbers, from the server's per-type totals
 * (the same source as the dashboard's balance card).
 *
 * The panels used to mount two deal-list hooks and three bot lists each and
 * re-price every open deal in the browser, and showed "PnL today" (profit of
 * open deals created today) and "Total PnL" (realized profit of OPEN deals
 * only, plus uPnL) — neither measured what its label said, so both are gone.
 */
const PanelPositionStats: React.FC<PanelPositionStatsProps> = ({
  positions,
  pnl,
}) => {
  const privacyMode = useUIStore((s) => s.privacyMode);
  const totals = usePositionTotals({ positions, pnl });

  const inPositions: React.ReactNode = privacyMode ? (
    '***'
  ) : totals.inPositionsUsd === null ? (
    <NotCalculated
      compact
      reason="Your server does not report the value of open positions yet. Update it to see this number."
    />
  ) : totals.inPositionsUsd === undefined ? (
    <Skeleton className="h-4 w-16" />
  ) : totals.inPositionsUnpriced > 0 ? (
    <Tooltip
      tooltip={`${totals.inPositionsUnpriced.toLocaleString()} of ${totals.inPositionsCount.toLocaleString()} positions could not be priced in USD and are not included.`}
      side="top"
    >
      <span>
        {formatCurrency(totals.inPositionsUsd, 2)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          *
        </span>
      </span>
    </Tooltip>
  ) : (
    formatCurrency(totals.inPositionsUsd, 2)
  );

  const boxes: MenuStatBox[] = [
    {
      title: 'Money in Positions',
      value: inPositions,
      colorClass: 'from-indigo-500 to-indigo-600',
    },
  ];
  if (pnl.length > 0) {
    boxes.push({
      title: 'uPnL',
      value: privacyMode ? (
        '***'
      ) : totals.unrealizedUsd === undefined ? (
        <Skeleton className="h-4 w-16" />
      ) : (
        formatCurrency(totals.unrealizedUsd, 2)
      ),
      colorClass: 'from-yellow-500 to-yellow-600',
    });
  }

  return (
    <MenuPanelStatsBoxes
      boxes={boxes}
      title="Stats"
      className="p-1"
      cols={boxes.length}
    />
  );
};

export default React.memo(PanelPositionStats);
