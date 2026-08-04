// Aliased: `Link` in this file is the lucide icon.
import { Link as RouterLink } from 'react-router-dom';

import { useWebhookEligibility } from '@/hooks/useWebhookEligibility';
import {
  trackWebhookCopyInteraction,
  trackWebhookSurfaceView,
  trackWebhookUpgradeClick,
} from '@/services/telemetry/webhookTelemetry';
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Info,
  Link,
  Lock,
  Webhook,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  copyToClipboard,
  formatActionName,
  generateWebhookPayload,
  generateWebhookUrl,
  getActionDescription,
  getAvailableActions,
  getBotSymbol,
} from '../../lib/webhookUtils';
import {
  WEBHOOK_ACTION_CATEGORIES,
  WebhookActionEnum,
  type WebhookPayload,
} from '../../types/webhook';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import type { DCABot } from '@/types';

export interface WebhookConfigurationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: DCABot;
}

export const WebhookConfigurationModal: React.FC<
  WebhookConfigurationModalProps
> = ({ open, onOpenChange, bot }) => {
  const [selectedTab, setSelectedTab] = useState<'config' | 'examples'>(
    'config'
  );
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const eligibility = useWebhookEligibility({
    bot,
    isEditMode: true,
    context: 'modal',
  });
  const { canInteract, showUpgradeMessage, showDowngradeWarning } = eligibility;
  const botId = bot?._id ?? null;
  const viewTrackedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      viewTrackedRef.current = false;
      return;
    }

    if (viewTrackedRef.current) {
      return;
    }

    trackWebhookSurfaceView(eligibility, {
      surface: 'modal',
      botId,
    });

    viewTrackedRef.current = true;
  }, [open, eligibility, botId]);

  useEffect(() => {
    if (!canInteract && selectedTab !== 'config') {
      setSelectedTab('config');
    }
  }, [canInteract, selectedTab]);

  // Generate webhook configuration
  const webhookUrl = useMemo(() => generateWebhookUrl(), []);
  const availableActions = useMemo(
    () => (bot ? getAvailableActions(bot) : []),
    [bot]
  );
  const botSymbol = useMemo(
    () => (bot ? getBotSymbol(bot) : 'BTC_USDT'),
    [bot]
  );

  // Handle copy operations
  const handleCopy = useCallback(
    async (text: string, itemId: string) => {
      const metadata = {
        surface: 'modal',
        botId,
        target: itemId,
      };

      if (!canInteract) {
        trackWebhookCopyInteraction(eligibility, {
          ...metadata,
          success: false,
          reason: 'locked',
        });
        return;
      }

      const success = await copyToClipboard(text);

      trackWebhookCopyInteraction(eligibility, {
        ...metadata,
        success,
        ...(success ? {} : { reason: 'clipboard-error' }),
      });

      if (success) {
        setCopiedItem(itemId);
        setTimeout(() => setCopiedItem(null), 2000);
      }
    },
    [botId, canInteract, eligibility]
  );

  const handleTabChange = useCallback((value: string) => {
    setSelectedTab(value === 'examples' ? 'examples' : 'config');
  }, []);

  const emitUpgradeClick = useCallback(
    (source: string) => {
      trackWebhookUpgradeClick(eligibility, {
        surface: 'modal',
        botId,
        source,
      });
    },
    [eligibility, botId]
  );

  // Generate payloads for examples
  const examplePayloads = useMemo(() => {
    if (!bot) return {};

    const payloads: Record<string, WebhookPayload> = {};
    availableActions.forEach((action) => {
      const basePayload = generateWebhookPayload(action, bot.uuid);
      payloads[action] = basePayload;

      // Add symbol-specific examples for relevant actions
      if (
        [
          WebhookActionEnum.start,
          WebhookActionEnum.close,
          WebhookActionEnum.closeSl,
        ].includes(action)
      ) {
        payloads[`${action}_symbol`] = generateWebhookPayload(action, bot.uuid, {
          symbol: botSymbol,
        });
      }

      // Add asset-specific examples for fund management
      if (
        [WebhookActionEnum.addFunds, WebhookActionEnum.reduceFunds].includes(
          action
        )
      ) {
        payloads[`${action}_quote`] = generateWebhookPayload(action, bot.uuid, {
          asset: 'quote',
          symbol: botSymbol,
        });
      }
    });

    return payloads;
  }, [bot, availableActions, botSymbol]);

  const shouldShowAlert = showUpgradeMessage || showDowngradeWarning;
  const alertTitle = showUpgradeMessage
    ? 'Webhook configuration is locked'
    : 'Webhook configuration is read-only';
  const alertDescription = showUpgradeMessage ? (
    <>
      Webhook automation for terminal bots is available on paid plans.{' '}
      <RouterLink
        to="/subscription"
        onClick={() => emitUpgradeClick('modal-upsell-link')}
        className="inline-flex items-center font-medium underline transition hover:text-amber-700 dark:hover:text-amber-200"
      >
        Upgrade your plan
        <Lock className="ml-1 h-3 w-3" />
      </RouterLink>{' '}
      to unlock TradingView integrations and automated exits.
    </>
  ) : (
    <>
      Your current plan no longer includes webhook automation. Existing payloads
      remain visible, but interactions such as copying are disabled until you
      upgrade.{' '}
      <RouterLink
        to="/subscription"
        onClick={() => emitUpgradeClick('modal-downgrade-link')}
        className="inline-flex items-center font-medium underline transition hover:text-amber-700 dark:hover:text-amber-200"
      >
        Review plans
        <Lock className="ml-1 h-3 w-3" />
      </RouterLink>
      .
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs">
            <Link className="w-5 h-5 text-white" />
            Webhook Configuration
          </DialogTitle>
          <DialogDescription>
            Configure webhook settings for {bot?.settings?.name || 'this bot'}{' '}
            to integrate with TradingView alerts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6 pb-6 space-y-md">
          {shouldShowAlert ? (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm font-semibold">
                {alertTitle}
              </AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                {alertDescription}
              </AlertDescription>
            </Alert>
          ) : null}

          <Tabs
            value={selectedTab}
            onValueChange={handleTabChange}
            className="h-full flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="examples" disabled={!canInteract}>
                Examples
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="config"
              className="space-y-md overflow-y-auto flex-1 custom-scrollbar"
            >
              {/* Webhook URL Section */}
              <div className="space-y-xs">
                <label className="text-sm font-medium">Webhook URL</label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-xs">
                  <code className="flex-1 p-sm bg-muted rounded text-xs sm:text-sm font-mono break-all">
                    {webhookUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(webhookUrl, 'url')}
                    disabled={!canInteract}
                    className="w-full sm:w-auto sm:px-3"
                  >
                    {copiedItem === 'url' ? (
                      <CheckCircle className="w-4 h-4 text-green-600 sm:mr-0 mr-2" />
                    ) : (
                      <Copy className="w-4 h-4 sm:mr-0 mr-2" />
                    )}
                    <span className="sm:hidden">Copy URL</span>
                  </Button>
                </div>
              </div>

              {/* Bot Information */}
              <div className="space-y-xs">
                <label className="text-sm font-medium">Bot Information</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Bot UUID:
                    </span>
                    <div className="font-mono bg-muted px-2 py-1 rounded mt-1 break-all text-xs sm:text-sm">
                      {bot.uuid}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Symbol:
                    </span>
                    <div className="font-mono bg-muted px-2 py-1 rounded mt-1 text-xs sm:text-sm">
                      {botSymbol}
                    </div>
                  </div>
                </div>
              </div>

              {/* Available Actions */}
              <div className="space-y-xs">
                <label className="text-sm font-medium">
                  Available Actions ({availableActions.length})
                </label>
                <div className="flex flex-wrap gap-xs">
                  {availableActions.map((action) => {
                    const payload = examplePayloads[action];
                    const payloadText = JSON.stringify(payload, null, 2);
                    const itemId = `action_${action}`;

                    if (!canInteract) {
                      return (
                        <Button
                          key={action}
                          size="sm"
                          variant="secondary"
                          className="text-xs h-6 px-2 py-1 opacity-60 cursor-not-allowed"
                          disabled
                        >
                          {formatActionName(action)}
                        </Button>
                      );
                    }

                    return (
                      <Popover key={action}>
                        <PopoverTrigger asChild>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-xs h-6 px-2 py-1 cursor-pointer hover:bg-secondary/80 transition-colors"
                            onClick={() => handleCopy(payloadText, itemId)}
                          >
                            {copiedItem === itemId ? (
                              <div className="flex items-center gap-1">
                                <CheckCircle className="w-3 h-3 text-green-600" />
                                <span>Copied!</span>
                              </div>
                            ) : (
                              formatActionName(action)
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-80 p-sm"
                          side="top"
                          align="center"
                        >
                          <div className="space-y-xs">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold">
                                {formatActionName(action)}
                              </h4>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="p-0"
                                onClick={() => handleCopy(payloadText, itemId)}
                              >
                                {copiedItem === itemId ? (
                                  <CheckCircle className="w-3 h-3 text-green-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {getActionDescription(action)}
                            </p>
                            <pre className="p-xs bg-muted rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-32 overflow-y-auto border">
                              {payloadText}
                            </pre>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
                {availableActions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No actions available for this bot type
                  </p>
                )}
                {availableActions.length > 0 && canInteract && (
                  <p className="text-sm text-muted-foreground">
                    Hover to preview payload • Click to copy to clipboard
                  </p>
                )}
                {availableActions.length > 0 && !canInteract && (
                  <p className="text-sm text-muted-foreground">
                    Upgrade your plan to preview and copy webhook payloads
                    directly from here.
                  </p>
                )}
              </div>

              {/* Quick Setup Guide */}
              <Alert className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/50">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>TradingView Setup:</strong> Copy the webhook URL above
                  and paste it into your TradingView alert. Use the payload
                  examples in the Examples tab for different actions.
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent
              value="examples"
              className="overflow-y-auto flex-1 custom-scrollbar max-h-96"
            >
              <div className="space-y-md">
                {WEBHOOK_ACTION_CATEGORIES.map((category) => {
                  const categoryActions = category.actions.filter((action) =>
                    availableActions.includes(action)
                  );

                  if (categoryActions.length === 0) return null;

                  return (
                    <div key={category.name} className="space-y-sm">
                      <div className="flex items-center gap-xs">
                        <h4 className="text-sm font-semibold">
                          {category.name}
                        </h4>
                        <Badge variant="outline" className="text-xs">
                          {categoryActions.length}
                        </Badge>
                      </div>

                      {categoryActions.map((action) => {
                        const payload = examplePayloads[action];
                        const payloadText = JSON.stringify(payload, null, 2);
                        const itemId = `payload_${action}`;

                        return (
                          <div key={action} className="space-y-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-xs">
                              <div className="flex-1">
                                <span className="text-sm font-medium">
                                  {formatActionName(action)}
                                </span>
                                <p className="text-xs text-muted-foreground">
                                  {getActionDescription(action)}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopy(payloadText, itemId)}
                                className="w-full sm:w-auto sm:px-3"
                                disabled={!canInteract}
                              >
                                {copiedItem === itemId ? (
                                  <CheckCircle className="w-4 h-4 text-green-600 sm:mr-0 mr-2" />
                                ) : (
                                  <Copy className="w-4 h-4 sm:mr-0 mr-2" />
                                )}
                                <span className="sm:hidden">Copy Payload</span>
                              </Button>
                            </div>
                            <pre className="p-sm bg-muted rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap wrap-break-word">
                              {payloadText}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {availableActions.length === 0 && (
                  <div className="text-center py-8">
                    <Webhook className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">
                      No webhook examples available for this bot configuration
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WebhookConfigurationModal;
