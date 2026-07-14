import { ProgressBar } from '@/components/ui/ProgressBar';
import { Loader2 } from 'lucide-react';
import React from 'react';

export interface BotPlacementProgressData {
  stage: number;
  total: number;
  text: string;
  isAllowedToCancel: boolean;
}

/**
 * Blocking progress panel shown while the bot engine places its grid orders.
 *
 * The backend streams a `progress` field ({ stage, total, text }) over the
 * `bot sends settings` socket event, incrementing `stage` as each order lands
 * and clearing it (null) when done. This mirrors the legacy dashboard, which
 * replaced the settings form with a determinate progress bar during placement
 * so the user can't edit a bot mid-way through order placement.
 */
export const BotPlacementProgress: React.FC<{
  progress: BotPlacementProgressData;
}> = ({ progress }) => {
  const { stage, total, text } = progress;
  const safeTotal = total > 0 ? total : 1;

  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-md px-md text-center">
      <Loader2 className="text-primary h-8 w-8 animate-spin" />
      <div className="space-y-xs">
        <p className="text-foreground text-base font-medium">
          {text || 'Placing orders'}
        </p>
        <p className="text-muted-foreground text-sm tabular-nums">
          {stage} / {total}
        </p>
      </div>
      <ProgressBar
        value={stage}
        max={safeTotal}
        variant="primary"
        size="md"
        className="w-full max-w-sm"
      />
      <p className="text-muted-foreground max-w-sm text-xs">
        The bot is placing its grid orders. Settings are locked until every
        order is placed.
      </p>
    </div>
  );
};
