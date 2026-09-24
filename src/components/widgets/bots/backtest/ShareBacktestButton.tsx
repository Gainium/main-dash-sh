import { Share2 } from 'lucide-react';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useShareBacktest } from '@/hooks/useBacktestDataManagement';
import { buildBacktestShareUrl, isStoredBacktest } from '@/lib/shareLinks';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';

export type ShareBacktestKind = 'dca' | 'combo' | 'grid';

export interface ShareBacktestButtonProps {
  /** Mongo `_id` of the backtest to share. */
  backtestId: string;
  /** Existing shareId on the backtest if already shared — skips remint. */
  existingShareId?: string | null;
  /** Backtest kind, drives which share mutation runs. */
  backtestType: ShareBacktestKind;
  /** Route path where shared visitors land (e.g. `/bot/backtests`). */
  sharePath: string;
  /**
   * Only render when true. Callers compute owner check
   * (`backtest.userId === user.id`) and pass it in.
   */
  canShare: boolean;
  /** Optional override label (default "Share"). */
  label?: string;
  /** Optional icon-only mode for tight headers. */
  iconOnly?: boolean;
  /** Visual size, defaults to "sm". */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  className?: string;
}

/**
 * Generate (or fetch) a backtest share URL and copy it to the clipboard.
 *
 * The actual URL is built through `buildBacktestShareUrl` which lets
 * the cloud overlay decorate the link with affiliate / source params
 * via `registerShareUrlDecorator`. Sh-only builds copy the plain URL.
 */
export function ShareBacktestButton(props: ShareBacktestButtonProps) {
  const {
    backtestId,
    existingShareId,
    backtestType,
    sharePath,
    canShare,
    label = 'Share',
    iconOnly = false,
    size = 'sm',
    variant = 'ghost',
    className,
  } = props;

  const shareBacktestMutation = useShareBacktest();
  const isPending = shareBacktestMutation.isPending;

  const handleClick = useCallback(async () => {
    try {
      const result = await shareBacktestMutation.mutateAsync({
        id: backtestId,
        shareId: existingShareId ?? undefined,
        backtestType,
      });
      const url = buildBacktestShareUrl({
        path: sharePath,
        shareId: result.shareId,
        subKind: backtestType,
      });
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied');
      } catch (copyErr) {
        // Clipboard may be unavailable in non-secure contexts; surface
        // the URL so the user can copy it manually.
        logger.warn(
          '[ShareBacktestButton] Clipboard write failed; falling back to alert',
          {
            error:
              copyErr instanceof Error ? copyErr.message : String(copyErr),
          }
        );
        toast.info(url);
      }
    } catch (error) {
      logger.error('[ShareBacktestButton] Share failed', {
        error: error instanceof Error ? error.message : String(error),
        backtestId,
        backtestType,
      });
      toast.error(
        error instanceof Error ? error.message : 'Failed to share backtest'
      );
    }
  }, [
    backtestId,
    backtestType,
    existingShareId,
    sharePath,
    shareBacktestMutation,
  ]);

  // A result held only in this browser has no server copy to share.
  if (
    !canShare ||
    !isStoredBacktest({ _id: backtestId, shareId: existingShareId })
  )
    return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly ? 'icon' : size}
      disabled={isPending}
      onClick={handleClick}
      className={className}
      title={isPending ? 'Generating share link…' : 'Copy share link'}
    >
      <Share2 className={iconOnly ? 'h-4 w-4' : 'mr-2 h-4 w-4'} />
      {!iconOnly && <span>{label}</span>}
    </Button>
  );
}

export default ShareBacktestButton;
