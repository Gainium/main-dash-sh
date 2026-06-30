import React, { useEffect, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { useSetBacktestPermanent } from '@/hooks/useSetBacktestPermanent';
import type { BotTypesEnum } from '@/types';

export interface BacktestPermanentCheckboxProps {
  /** Server `_id` of the backtest row. */
  id: string;
  /** Bot family — picks the matching GraphQL mutation. */
  type: BotTypesEnum;
  /** Current persisted value of the `savePermanent` flag. */
  checked: boolean;
  /** Disable for purely-local rows (no server record to keep). */
  disabled?: boolean;
  /** Called with the new value after the toggle is persisted. Used by lists
   *  that aren't React-Query backed (e.g. the hedge runner's local history)
   *  to patch their own state in place; DCA/combo/grid don't need it (the
   *  hook patches the query + IndexedDB caches). */
  onToggled?: (savePermanent: boolean) => void;
}

/**
 * Inline checkbox cell for the backtest history table. Toggling it flags the
 * backtest as "save permanently" so the server cleanup job won't auto-delete
 * it. Optimistically reflects the new value and reverts on error. Replaces the
 * old read-only "yes/no" text and mirrors the per-row switch in legacy
 * main-dash.
 */
export const BacktestPermanentCheckbox: React.FC<
  BacktestPermanentCheckboxProps
> = ({ id, type, checked, disabled, onToggled }) => {
  const mutation = useSetBacktestPermanent();
  const [optimistic, setOptimistic] = useState(checked);

  // Re-sync when the underlying row value changes (e.g. after a refetch
  // following the mutation, or when the table data is replaced).
  useEffect(() => {
    setOptimistic(checked);
  }, [checked]);

  const handleChange = (next: boolean) => {
    if (!id) return;
    const prev = optimistic;
    setOptimistic(next);
    mutation.mutate(
      { id, savePermanent: next, type },
      {
        onError: () => setOptimistic(prev),
        onSuccess: () => onToggled?.(next),
      }
    );
  };

  return (
    <Checkbox
      checked={optimistic}
      disabled={disabled || mutation.isPending || !id}
      onCheckedChange={(value) => handleChange(value === true)}
      // Don't let the toggle bubble up to the row click (which opens the
      // backtest results modal / selects the row).
      onClick={(e) => e.stopPropagation()}
      aria-label="Save permanently"
    />
  );
};

export default BacktestPermanentCheckbox;
