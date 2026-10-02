import { FlaskConical } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  BacktestLimitationAction,
  BacktestLimitationGroupStyle,
  BacktestLimitationItem,
} from '@/lib/extensions/backtestLimitations';
import { cn } from '@/lib/utils';

export interface BacktestLimitationGroup {
  key: string;
  style: BacktestLimitationGroupStyle;
  items: BacktestLimitationItem[];
}

interface BacktestLimitationsDialogProps {
  open: boolean;
  groups: BacktestLimitationGroup[];
  /** `dontRemind`: the user ticked "Don't remind me again". */
  onRun: (dontRemind: boolean) => void;
  onCancel: () => void;
  /** An item's action was chosen: close without running, then act. */
  onAction?: (action: BacktestLimitationAction) => void;
}

const STATUS_LABEL: Record<BacktestLimitationItem['status'], string> = {
  ignored: 'Not simulated',
  partial: 'Partly simulated',
};

function GroupIcon({ group }: { group: BacktestLimitationGroupStyle }) {
  const Icon = group.icon;
  if (!Icon) return null;
  return group.tone === 'accent' ? (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-ai-assistant text-white"
      aria-hidden
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      aria-hidden
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function LimitationGroup({
  group,
  onAction,
}: {
  group: BacktestLimitationGroup;
  onAction?: ((action: BacktestLimitationAction) => void) | undefined;
}) {
  const accent = group.style.tone === 'accent';
  return (
    <section
      data-backtest-limitation-group={group.key}
      className={cn(
        'rounded-lg p-3',
        accent ? 'border border-ai-border bg-ai-surface' : 'bg-muted'
      )}
    >
      <div className="flex items-start gap-2">
        <GroupIcon group={group.style} />
        <div className="min-w-0">
          <h3
            className={cn(
              'text-sm font-semibold leading-6',
              accent ? 'text-ai-foreground' : 'text-foreground'
            )}
          >
            {group.style.title}
          </h3>
          {group.style.description && (
            <p className="text-xs text-muted-foreground">
              {group.style.description}
            </p>
          )}
        </div>
      </div>
      <ul className="mt-2 space-y-2">
        {group.items.map((item) => (
          <li
            key={item.key}
            data-backtest-limitation={item.key}
            className="flex gap-2"
          >
            <span
              className={cn(
                'mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full',
                accent ? 'bg-ai-foreground' : 'bg-muted-foreground'
              )}
              aria-hidden
            />
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-foreground">
                  {item.label}
                </span>
                {!accent && (
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      item.status === 'ignored'
                        ? 'text-warning'
                        : 'text-muted-foreground'
                    )}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">{item.explanation}</p>
              {item.action && onAction && (
                <ItemAction action={item.action} onAction={onAction} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemAction({
  action,
  onAction,
}: {
  action: BacktestLimitationAction;
  onAction: (action: BacktestLimitationAction) => void;
}) {
  const Icon = action.icon;
  return (
    <Button
      size="sm"
      variant="outline"
      className="mt-2 h-8 gap-1.5"
      data-backtest-limitation-action
      onClick={() => onAction(action)}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {action.label}
    </Button>
  );
}

/**
 * Informational: lists the active settings a backtest cannot simulate. It
 * never blocks the run — "Run backtest" proceeds, "Cancel" just closes.
 */
export const BacktestLimitationsDialog: React.FC<
  BacktestLimitationsDialogProps
> = ({ open, groups, onRun, onCancel, onAction }) => {
  const [dontRemind, setDontRemind] = useState(false);
  useEffect(() => {
    if (open) setDontRemind(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-lg" zIndex={80} onClose={onCancel}>
        <div data-backtest-limitations-dialog>
          <DialogHeader className="pr-8">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
                aria-hidden
              >
                <FlaskConical className="h-4 w-4" />
              </span>
              <DialogTitle>Backtest limitations</DialogTitle>
            </div>
            <DialogDescription>
              These settings can&apos;t be fully simulated in a backtest, so
              the results may differ from how this bot trades live.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {groups.map((group) => (
              <LimitationGroup
                key={group.key}
                group={group}
                onAction={onAction}
              />
            ))}
          </div>
          <DialogFooter className="mt-4 flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={dontRemind}
                onCheckedChange={(v) => setDontRemind(v === true)}
                aria-label="Don't remind me again"
              />
              Don&apos;t remind me again
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={() => onRun(dontRemind)} autoFocus>
                Run backtest
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
