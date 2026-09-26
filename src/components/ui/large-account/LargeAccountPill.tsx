import { Loader2, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { useLargeAccount } from '../../../hooks/useLargeAccount';
import {
  describeLargeAccountSignals,
  formatCount,
  LARGE_ACCOUNT_CHANGES,
  type LargeAccountState,
} from '../../../lib/largeAccount/largeAccount';
import { cn } from '../../../lib/utils';
import { Button } from '../button';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';

export interface LargeAccountPillViewProps {
  state: Pick<
    LargeAccountState,
    'active' | 'source' | 'reason' | 'counts' | 'thresholds' | 'canUserEnable'
  >;
  onTurnOn?: () => void | Promise<void>;
  isTurningOn?: boolean;
  /** Render the popover open (showcase / screenshots). */
  defaultOpen?: boolean;
  className?: string;
}

function reasonSentence(state: LargeAccountPillViewProps['state']): string {
  if (!state.active) {
    return 'Large account mode is off. Turn it on if the dashboard feels slow with many bots or deals.';
  }
  if (state.reason === 'override' || state.source === 'local') {
    return 'Large account mode is on because it was turned on for this account.';
  }
  return 'Large account mode turned on automatically because this account is over a size limit.';
}

/** Presentational pill + popover. Stateless so it can be showcased and tested. */
export const LargeAccountPillView: React.FC<LargeAccountPillViewProps> = ({
  state,
  onTurnOn,
  isTurningOn = false,
  defaultOpen,
  className,
}) => {
  const [open, setOpen] = useState(!!defaultOpen);
  const signals = state.counts
    ? describeLargeAccountSignals(state.counts, state.thresholds ?? undefined)
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            state.active ? 'Large account mode is on' : 'Large account mode'
          }
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium leading-none whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            state.active
              ? 'bg-warning/15 text-warning hover:bg-warning/25'
              : 'bg-muted text-muted-foreground hover:text-foreground',
            className
          )}
          data-testid="large-account-pill"
        >
          <Zap className="h-3 w-3" aria-hidden="true" />
          <span className="hidden sm:inline">Large account</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-sm text-sm">
        <div className="flex items-center gap-xs font-semibold">
          <Zap className="h-4 w-4 text-warning" aria-hidden="true" />
          Large account mode {state.active ? 'is on' : 'is off'}
        </div>
        <p className="text-muted-foreground">{reasonSentence(state)}</p>

        {signals && (
          <ul className="space-y-1" aria-label="Account size">
            {signals.map((s) => (
              <li
                key={s.key}
                className="flex items-center justify-between gap-sm tabular-nums"
              >
                <span className={s.over ? 'text-foreground' : 'text-muted-foreground'}>
                  {s.label}
                </span>
                <span className={s.over ? 'font-semibold text-warning' : 'text-muted-foreground'}>
                  {formatCount(s.count)}
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    / {formatCount(s.enter)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {state.active ? 'What changes' : 'What would change'}
          </div>
          <ul className="list-disc pl-md space-y-1 text-muted-foreground">
            {LARGE_ACCOUNT_CHANGES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing about trading changes: your bots run exactly the same.
        </p>

        {!state.active && state.canUserEnable && onTurnOn && (
          <div className="space-y-1">
            <Button
              size="sm"
              className="w-full"
              disabled={isTurningOn}
              onClick={() => void onTurnOn()}
            >
              {isTurningOn && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              Turn on large account mode
            </Button>
            <p className="text-xs text-muted-foreground">
              Once on, it stays on for this account.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/**
 * Navbar pill. Visible when the mode is on, or when the user may turn it on
 * (off, and the account is at least halfway to a threshold — below that the
 * pill would be noise for small accounts).
 */
export const LargeAccountPill: React.FC<{ className?: string }> = ({
  className,
}) => {
  const la = useLargeAccount();
  const nearThreshold =
    !!la.counts &&
    describeLargeAccountSignals(la.counts, la.thresholds ?? undefined).some(
      (s) => s.count >= s.enter / 2
    );
  if (!la.active && !(la.canUserEnable && nearThreshold)) return null;
  return (
    <LargeAccountPillView
      state={la}
      onTurnOn={la.turnOn}
      isTurningOn={la.isTurningOn}
      className={className}
    />
  );
};

export default LargeAccountPill;
