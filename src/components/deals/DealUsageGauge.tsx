import { useDealPositionRing } from '@/hooks/useSinglePosition';
import { DualArcProgressGauge } from '../ui/DualArcProgressGauge';

/**
 * The deals table's small usage ring: cost-vs-max with the filled / total
 * levels, or the entries of a single-position deal (`positionUsageRing`).
 */
export function DealUsageGauge({
  dealId,
  percent,
  levels,
  color,
}: {
  dealId: string | undefined;
  percent: number;
  levels: { complete: number; all: number };
  color: string;
}) {
  const ring = useDealPositionRing(dealId);
  return (
    <DualArcProgressGauge
      size={40}
      outerPercentage={ring ? ring.percent : percent}
      innerPercentage={0}
      outerProgressColor={color}
      centerText={ring ? ring.centerText : `${percent.toFixed(0)}%`}
      label={ring ? ring.label : `${levels.complete}/${levels.all}`}
      showInnerGauge={false}
    />
  );
}

export default DealUsageGauge;
