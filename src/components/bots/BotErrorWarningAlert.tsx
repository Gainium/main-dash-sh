import { Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useResetShowError } from '@/hooks/useBotMutations';
import { cn } from '@/lib/utils';
import type { BotTypesEnum } from '@/types';

export interface BotErrorWarningTarget {
  id: string;
  type: BotTypesEnum;
}

interface BotErrorWarningAlertProps {
  /**
   * Highest severity across the bot(s): 'error' wins over 'warning'. 'info' is a
   * calm/informational notice (e.g. an auto-archive notice) and must render in a
   * neutral/blue tone, never like an error or warning.
   */
  severity: 'error' | 'warning' | 'info';
  /**
   * Bot(s) whose `showErrorWarning` flag this alert clears when dismissed.
   * Non-hedge passes a single bot; hedge passes both legs.
   */
  targets: BotErrorWarningTarget[];
  /**
   * When provided, renders a link that jumps to the bot's events view (e.g. the
   * drawer's Events tab). Omit where no events view is reachable — the edit
   * form has no in-page events widget.
   */
  onReviewEvents?: () => void;
  className?: string;
}

/**
 * Dismissible banner shown when a running bot has logged error/warning-level
 * events (backend `showErrorWarning` flag). Mirrors the legacy main-dash
 * snackbar: it points the user at the bot's events and, on dismiss, calls
 * `resetShowError` to clear the flag server-side. See {@link useResetShowError}.
 */
export function BotErrorWarningAlert({
  severity,
  targets,
  onReviewEvents,
  className,
}: BotErrorWarningAlertProps) {
  const resetShowError = useResetShowError();
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = useCallback(() => {
    if (!targets.length) return;
    // Hide immediately; restore if the backend reset fails (the hook toasts).
    setDismissed(true);
    resetShowError.mutate(
      { data: targets },
      { onError: () => setDismissed(false) }
    );
  }, [resetShowError, targets]);

  if (dismissed || !targets.length) return null;

  const isError = severity === 'error';
  const isInfo = severity === 'info';
  const noun = isError ? 'errors' : isInfo ? 'notices' : 'warnings';
  const Icon = isInfo ? Info : TriangleAlert;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-sm rounded-lg border p-sm text-sm md:p-md',
        isError
          ? 'border-destructive/30 bg-destructive/10'
          : isInfo
            ? 'border-info/30 bg-info/10'
            : 'border-warning/30 bg-warning/10',
        className
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          isError ? 'text-destructive' : isInfo ? 'text-info' : 'text-warning'
        )}
      />
      <div className="flex-1 text-foreground">
        There are bot {noun}.{' '}
        {onReviewEvents ? (
          <button
            type="button"
            onClick={onReviewEvents}
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            Review the bot events
          </button>
        ) : (
          'Review the bot events'
        )}{' '}
        for details.
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="-my-1 -mr-1 h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label={`Dismiss bot ${noun}`}
        onClick={handleDismiss}
        disabled={resetShowError.isPending}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
