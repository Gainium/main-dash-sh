import { Loader2, RefreshCw, Zap } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { NOT_CALCULATED_TOOLTIP } from '../../../lib/largeAccount/largeAccount';
import { Tooltip } from '../tooltip';

export interface NotCalculatedProps {
  /** Tooltip text. Defaults to the standard large-account explanation. */
  reason?: string;
  /**
   * Bounded one-shot computation. When given, a "Calculate now" action is
   * shown; it runs this once, shows progress, and reports a failure.
   * The caller renders the value once the promise resolves.
   */
  onCalculate?: () => Promise<void>;
  /** Label of the calculate action. */
  calculateLabel?: string;
  /** Hide the "Large account" chip text, keeping the icon (tight cells). */
  compact?: boolean;
  className?: string;
}

/**
 * A value the app deliberately does not calculate in large-account mode.
 *
 * Renders a muted em-dash in the value's own slot plus a "Large account" chip
 * with a tooltip saying why — never `0`, never an empty cell, never nothing.
 */
export const NotCalculated: React.FC<NotCalculatedProps> = ({
  reason = NOT_CALCULATED_TOOLTIP,
  onCalculate,
  calculateLabel = 'Calculate now',
  compact = false,
  className,
}) => {
  const [state, setState] = useState<'idle' | 'running' | 'failed'>('idle');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onCalculate || state === 'running') return;
      setState('running');
      try {
        await onCalculate();
        if (mounted.current) setState('idle');
      } catch {
        if (mounted.current) setState('failed');
      }
    },
    [onCalculate, state]
  );

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 align-middle', className)}
      data-testid="not-calculated"
    >
      <span className="text-muted-foreground" aria-label="Not calculated">
        —
      </span>
      <Tooltip tooltip={reason} side="top" delay={150}>
        <span
          className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium leading-none text-muted-foreground cursor-help whitespace-nowrap"
          data-testid="large-account-chip"
        >
          <Zap className="h-2.5 w-2.5" aria-hidden="true" />
          {compact ? (
            <span className="sr-only">Large account</span>
          ) : (
            'Large account'
          )}
        </span>
      </Tooltip>
      {onCalculate && (
        <button
          type="button"
          onClick={run}
          disabled={state === 'running'}
          className="inline-flex items-center gap-1 rounded-md px-1 text-xs font-medium text-primary hover:underline disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap"
        >
          {state === 'running' ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Calculating…
            </>
          ) : state === 'failed' ? (
            <>
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Couldn't calculate — try again
            </>
          ) : (
            calculateLabel
          )}
        </button>
      )}
    </span>
  );
};

export default NotCalculated;
