import { usePositionEntriesLabel } from '@/hooks/useSinglePosition';

/**
 * A deal's filled/total levels — or, for the open position of a
 * single-position bot, its entries ("Entries 3/5", "Entries 3" when the
 * position has no entry limit). Entries replace safety orders there, so the
 * level count would always read 1/1.
 */
export function DealLevelsText({
  dealId,
  levels,
  separator = ' / ',
}: {
  dealId: string | undefined;
  levels: { complete: number; all: number } | undefined;
  separator?: string;
}) {
  const entries = usePositionEntriesLabel(dealId);
  if (entries) {
    return (
      <span title="Entries in this single position, counting the base order">
        Entries {entries}
      </span>
    );
  }
  return (
    <>
      {levels?.complete ?? 0}
      {separator}
      {levels?.all ?? 0}
    </>
  );
}

export default DealLevelsText;
