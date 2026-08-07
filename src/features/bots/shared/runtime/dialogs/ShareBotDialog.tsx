import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useBotShareToggle } from '@/hooks/useBotMutations';
import { toast } from '@/lib/toast';
import { buildBotShareUrl } from '@/lib/shareLinks';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import { Copy, Globe, Share2, Shield } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

export interface ShareBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botId?: string | null;
  botName?: string | null;
  botType?: BotTypesEnum | null;
  initialShareEnabled?: boolean;
  initialShareId?: string | null;
  /**
   * Optional URL decorator. The dialog builds the canonical share URL
   * (`/<botPath>/<id>?share=<shareId>&env=<env>`) and then runs it
   * through this hook. Used by the cloud overlay to append affiliate
   * tracking params (`&a=<affiliateId>&aid=share-bot`) without forking
   * the dialog component.
   */
  decorateUrl?: (url: string) => string;
}

const buildShareUrl = (
  botId: string,
  shareId: string,
  options: { environment: 'live' | 'paper'; botType?: BotTypesEnum | null }
) => {
  let basePath = '/bot';
  let subKind = 'dca';
  switch (options.botType) {
    case BotTypesEnum.combo:
      basePath = '/combo';
      subKind = 'combo';
      break;
    case BotTypesEnum.grid:
      basePath = '/grid';
      subKind = 'grid';
      break;
    case BotTypesEnum.hedgeDca:
      basePath = '/hedge/bot';
      subKind = 'hedge-dca';
      break;
    case BotTypesEnum.hedgeCombo:
      basePath = '/hedge/combo';
      subKind = 'hedge-combo';
      break;
    default:
      basePath = '/bot';
      subKind = 'dca';
      break;
  }

  // buildBotShareUrl runs the URL through the registered cloud decorator
  // (if any), which appends `&a=<affiliateId>&aid=share-bot` in cloud.
  // Then we append `&env=` since the dialog includes a paper/live hint.
  const base = buildBotShareUrl({
    path: `${basePath}/${botId}`,
    shareId,
    subKind,
  });
  const url = new URL(base);
  url.searchParams.set('env', options.environment);
  return url.toString();
};

/**
 * Shared share-link dialog so DCA, grid, and hedge bots reuse identical copy and flows.
 */
export const ShareBotDialog: React.FC<ShareBotDialogProps> = ({
  open,
  onOpenChange,
  botId,
  botName,
  botType,
  initialShareEnabled = false,
  initialShareId = null,
  decorateUrl,
}) => {
  const [shareEnabled, setShareEnabled] =
    useState<boolean>(initialShareEnabled);
  const [shareId, setShareId] = useState<string | null>(initialShareId);
  const [copyLabel, setCopyLabel] = useState<string>('Copy link');
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const shareToggle = useBotShareToggle();

  useEffect(() => {
    if (open) {
      setShareEnabled(initialShareEnabled);
      setShareId(initialShareId ?? null);
      setCopyLabel('Copy link');
    }
  }, [open, initialShareEnabled, initialShareId]);

  const shareUrl = useMemo(() => {
    if (!botId || !shareId) {
      return '';
    }

    const base = buildShareUrl(botId, shareId, {
      environment: isLiveTrading ? 'live' : 'paper',
      botType: botType ?? BotTypesEnum.dca,
    });
    return decorateUrl ? decorateUrl(base) : base;
  }, [botId, shareId, isLiveTrading, botType, decorateUrl]);

  const handleToggleShare = async (nextValue: boolean) => {
    if (!botId) {
      toast.error('Bot ID missing. Unable to update share settings.');
      return;
    }

    setShareEnabled(nextValue);

    try {
      const result = await shareToggle.mutateAsync({
        id: botId,
        share: nextValue,
        type: botType ?? BotTypesEnum.dca,
      });

      setShareEnabled(result?.share ?? nextValue);
      setShareId(result?.shareId ?? null);

      if (nextValue && !result?.shareId) {
        toast.warning(
          'Share enabled but no share ID returned. The link may not be accessible yet.'
        );
      }
    } catch (error) {
      console.error('[ShareBotDialog] Failed to toggle share', error);
      setShareEnabled(!nextValue);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel('Copied!');
      toast.success('Share link copied to clipboard.');
      setTimeout(() => setCopyLabel('Copy link'), 1500);
    } catch (error) {
      console.error('[ShareBotDialog] Failed to copy share URL', error);
      toast.error('Unable to copy link. Try selecting it manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <Share2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            Share bot access
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Allow other people to view "{botName ?? 'Your bot'}" with a secure
            read-only link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-1">
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 px-4 py-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Share link</Label>
              <p className="text-xs text-muted-foreground">
                Anyone with the link can view bot settings in{' '}
                {isLiveTrading ? 'live' : 'paper'} context.
              </p>
            </div>
            <div className="flex items-center gap-xs">
              <Switch
                id="share-toggle"
                checked={shareEnabled}
                disabled={!botId || shareToggle.isPending}
                onCheckedChange={handleToggleShare}
              />
              <span className="text-xs font-medium text-muted-foreground uppercase">
                {shareEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {shareEnabled ? (
            <div className="space-y-sm rounded-lg border border-border/60 bg-muted/20 p-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-xs text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="font-medium uppercase">Public link</span>
                </div>
                <Badge variant="outline" className="text-xs sm:text-xs">
                  {isLiveTrading ? 'Live trading mode' : 'Paper trading mode'}
                </Badge>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center">
                <Input
                  readOnly
                  value={shareUrl}
                  className="font-mono text-xs sm:text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!shareUrl}
                  onClick={handleCopy}
                  className="mt-2 sm:mt-0"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {copyLabel}
                </Button>
              </div>

              <Alert className="border-border/60 bg-muted/30">
                <AlertDescription className="text-xs sm:text-sm">
                  Shared bots are read-only. Only you can modify settings or
                  execute runtime actions.
                </AlertDescription>
              </Alert>

              {!shareId ? (
                <Alert className="border-warning/60 bg-warning/10 text-warning-foreground">
                  <AlertDescription className="text-xs sm:text-sm">
                    Share is enabled but the backend has not returned a share ID
                    yet. Copy link once it appears.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <Alert className="border-border/60 bg-muted/15">
              <AlertDescription className="text-xs sm:text-sm">
                Sharing is disabled. Turn it on to generate a secure read-only
                link for collaborators.
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border border-border/50 bg-muted/10 p-md space-y-xs text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-xs font-medium text-foreground">
              <Shield className="h-3.5 w-3.5" />
              Keep sensitive data safe
            </div>
            <p>
              Share links never expose API keys or trading credentials. Revoke
              access anytime by toggling sharing off.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCopy}
            disabled={!shareEnabled || !shareUrl || shareToggle.isPending}
            className="w-full sm:w-auto"
          >
            <Copy className="h-4 w-4 mr-2" />
            {copyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareBotDialog;
