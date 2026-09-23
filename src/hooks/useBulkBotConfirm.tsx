import { useCallback, useState } from 'react';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/lib/toast';
import {
  filterRestartableBots,
  isBotArchivable,
} from '@/utils/botStatusUtils';

type BulkBot = { id: string; status: string };

interface PendingConfirm {
  title: string;
  description: string;
  confirmText: string;
  variant: 'default' | 'destructive';
  run: () => void | Promise<void>;
}

const botsLabel = (n: number) => `${n} bot${n === 1 ? '' : 's'}`;

/**
 * Confirmation step for the bot-list bulk actions that have no dedicated
 * dialog (Restart, Archive / Unarchive). Filters the selection to the bots
 * the action applies to and states how many selected bots are skipped.
 *
 * Render `confirmDialog` once in the page.
 */
export function useBulkBotConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const skippedSuffix = (skipped: number, reason: string) =>
    skipped > 0
      ? ` ${skipped} selected ${skipped === 1 ? 'bot is' : 'bots are'} ${reason} and will be skipped.`
      : '';

  const confirmRestart = useCallback(
    <T extends BulkBot>(
      bots: T[],
      run: (targets: T[]) => void | Promise<void>
    ) => {
      const targets = filterRestartableBots(bots);
      if (targets.length === 0) {
        toast.info('No active bots selected');
        return;
      }
      setPending({
        title: `Restart ${botsLabel(targets.length)}`,
        description: `Are you sure you want to restart ${botsLabel(targets.length)}?${skippedSuffix(bots.length - targets.length, 'not running')}`,
        confirmText: `Restart ${targets.length === 1 ? 'Bot' : 'Bots'}`,
        variant: 'default',
        run: () => run(targets),
      });
    },
    []
  );

  const confirmArchive = useCallback(
    <T extends BulkBot>(
      bots: T[],
      archive: boolean,
      run: (targets: T[]) => void | Promise<void>
    ) => {
      // Archive: only stopped bots (the backend rejects running ones).
      // Unarchive: only archived bots.
      const targets = archive
        ? bots.filter(
            (b) =>
              isBotArchivable(b.status) &&
              !['archive', 'archived'].includes(b.status)
          )
        : bots.filter((b) => ['archive', 'archived'].includes(b.status));
      if (targets.length === 0) {
        toast.info(
          archive
            ? 'Only stopped bots can be archived. Stop the bots first.'
            : 'No archived bots selected'
        );
        return;
      }
      const verb = archive ? 'Archive' : 'Unarchive';
      setPending({
        title: `${verb} ${botsLabel(targets.length)}`,
        description: `Are you sure you want to ${verb.toLowerCase()} ${botsLabel(targets.length)}?${skippedSuffix(
          bots.length - targets.length,
          archive ? 'still running' : 'not archived'
        )}`,
        confirmText: `${verb} ${targets.length === 1 ? 'Bot' : 'Bots'}`,
        variant: 'default',
        run: () => run(targets),
      });
    },
    []
  );

  const confirmDialog = (
    <ConfirmationDialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title={pending?.title ?? ''}
      description={pending?.description ?? ''}
      confirmText={pending?.confirmText}
      variant={pending?.variant}
      onConfirm={() => {
        void pending?.run();
      }}
    />
  );

  return { confirmRestart, confirmArchive, confirmDialog };
}
