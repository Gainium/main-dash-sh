import { Tooltip } from '@/components/ui/tooltip';
import { NO_DEAL_CLOSED } from './noDealClosed';

/** The cell shown instead of a 0% return when no deal closed. */
export function NoDealClosedCell({
  open,
  unrealized,
}: {
  open: number;
  unrealized: number;
}) {
  const u = Number(unrealized.toFixed(8));
  return (
    <Tooltip
      tooltip={`No deal closed in this period: ${open} deal${open === 1 ? '' : 's'} still open, unrealized ${u > 0 ? '+' : ''}${u}. Returns count closed deals only.`}
    >
      <span className="text-xs text-muted-foreground" data-no-deal-closed>
        {NO_DEAL_CLOSED}
      </span>
    </Tooltip>
  );
}
