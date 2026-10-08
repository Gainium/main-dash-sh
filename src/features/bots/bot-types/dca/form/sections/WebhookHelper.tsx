import React from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
/* import { Label } from '@/components/ui/label'; */
import { Separator } from '@/components/ui/separator';
/* import { Switch } from '@/components/ui/switch'; */
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface WebhookPayloadEntry {
  title: string;
  payload: string;
  description?: string;
  /** Shown behind an info icon next to the title. */
  tooltip?: string;
  copyLabel?: string;
  trackingId?: string;
  headerControls?: React.ReactNode;
}

export interface WebhookPayloadGroup {
  title: string;
  description?: string;
  payloads: WebhookPayloadEntry[];
}

interface MetadataHandlers {
  includeMetadata: boolean;
  onToggleMetadata: (checked: boolean) => void;
  includeSignature: boolean;
  onToggleSignature: (checked: boolean) => void;
}

interface WebhookHelperProps {
  webhookUrl: string;
  urlCopyLabel?: string;
  onCopy: (value: string, trackingId?: string) => void;
  copiedId: string | null;
  payloadGroups: WebhookPayloadGroup[];
  isPaper: boolean;
  missingBotId: boolean;
  resolvedBotId: string;
  documentationUrl?: string;
  showMetadataToggles?: boolean;
  metadataHandlers?: MetadataHandlers;
}

const WEBHOOK_TRACKING_ID = 'webhook-url';

const WebhookHelper: React.FC<WebhookHelperProps> = ({
  webhookUrl,
  urlCopyLabel = 'Copy webhook URL',
  onCopy,
  copiedId,
  payloadGroups,
  isPaper,
  missingBotId,
  resolvedBotId,
  documentationUrl,
  /* showMetadataToggles = false,
  metadataHandlers, */
}) => {
  const renderCopyButton = (
    label: string,
    trackingId: string,
    value: string,
    variant: 'default' | 'outline' = 'outline'
  ) => (
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={() => onCopy(value, trackingId)}
      className="flex items-center gap-xs"
    >
      {copiedId === trackingId ? (
        <>
          <Check className="h-4 w-4" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );

  return (
    <div className="space-y-md">
      <Card position={2} className="space-y-md">
        <CardHeader className="p-0">
          <div className="flex flex-col gap-sm sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-base">Webhook endpoint</CardTitle>
              <CardDescription>
                Use this URL to trigger bot lifecycle and deal actions from
                external systems.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-xs">
              <Badge variant={isPaper ? 'outline' : 'default'}>
                {isPaper ? 'Paper trading' : 'Live trading'}
              </Badge>
              <Badge variant="secondary">Bot ID: {resolvedBotId}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-sm px-0">
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/40 p-sm text-xs font-mono">
            <div className="break-all text-xs sm:text-sm">{webhookUrl}</div>
          </div>
          <div className="flex flex-wrap items-center gap-xs">
            {renderCopyButton(
              urlCopyLabel,
              WEBHOOK_TRACKING_ID,
              webhookUrl,
              'default'
            )}
            {documentationUrl ? (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="flex items-center gap-xs"
              >
                <a
                  href={documentationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-xs"
                >
                  <ExternalLink className="h-4 w-4" />
                  View docs
                </a>
              </Button>
            ) : null}
          </div>
          {missingBotId ? (
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTitle className="text-sm font-semibold">
                Bot ID required
              </AlertTitle>
              <AlertDescription className="text-xs sm:text-sm">
                Save the bot first to generate a persistent identifier. Webhook
                payloads need a valid bot UUID.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {/* {showMetadataToggles && metadataHandlers ? (
        <Card position={2} className="space-y-md">
          <CardHeader className="p-0">
            <CardTitle className="text-base">Payload options</CardTitle>
            <CardDescription>
              Adjust the default metadata included with lifecycle webhook
              payloads.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-md px-0">
            <div className="flex items-center justify-between gap-sm rounded-lg border border-border/60 bg-muted/30 p-sm">
              <div>
                <Label
                  htmlFor="webhook-include-metadata"
                  className="text-sm font-medium"
                >
                  Include metadata snapshot
                </Label>
                <p className="text-xs text-muted-foreground">
                  Embeds current controller configuration for auditing and
                  context.
                </p>
              </div>
              <Switch
                id="webhook-include-metadata"
                checked={metadataHandlers.includeMetadata}
                onCheckedChange={metadataHandlers.onToggleMetadata}
              />
            </div>
            <div className="flex items-center justify-between gap-sm rounded-lg border border-border/60 bg-muted/30 p-sm">
              <div>
                <Label
                  htmlFor="webhook-include-signature"
                  className="text-sm font-medium"
                >
                  Include signature placeholder
                </Label>
                <p className="text-xs text-muted-foreground">
                  Adds an HMAC field you can replace with a server-side
                  signature.
                </p>
              </div>
              <Switch
                id="webhook-include-signature"
                checked={metadataHandlers.includeSignature}
                onCheckedChange={metadataHandlers.onToggleSignature}
              />
            </div>
          </CardContent>
        </Card>
      ) : null} */}

      <div className="space-y-lg">
        {payloadGroups.map((group, groupIndex) => (
          <Card
            key={`${group.title}-${groupIndex}`}
            position={2}
            className="space-y-md"
          >
            <CardHeader className="p-0">
              <div className="flex flex-col gap-xs sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  {group.description ? (
                    <CardDescription>{group.description}</CardDescription>
                  ) : null}
                </div>
                <Badge variant="outline" className="self-start sm:self-auto">
                  {group.payloads.length} payload
                  {group.payloads.length === 1 ? '' : 's'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-md px-0">
              {group.payloads.map((entry, entryIndex) => {
                const trackingId =
                  entry.trackingId ??
                  `${groupIndex}-${entryIndex}-${entry.title}`;

                return (
                  <div
                    key={trackingId}
                    className="space-y-sm rounded-lg border border-border/70 bg-background p-md shadow-sm"
                  >
                    <div className="flex flex-col gap-xs sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight">
                          {entry.title}
                        </p>
                        {entry.description ? (
                          <p className="text-xs text-muted-foreground">
                            {entry.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex w-full shrink-0 items-center justify-between gap-xs sm:w-auto sm:justify-end">
                        {entry.headerControls ? (
                          <div className="mr-2">{entry.headerControls}</div>
                        ) : null}
                        <Tooltip tooltip="Copies the payload JSON to your clipboard">
                          <div className="flex w-full shrink-0 justify-start sm:w-auto sm:justify-end">
                            {renderCopyButton(
                              entry.copyLabel ?? 'Copy payload',
                              trackingId,
                              entry.payload
                            )}
                          </div>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="space-y-xs">
                      <Separator />
                      <div className="max-h-64 w-full overflow-auto rounded-md bg-muted/40">
                        <pre
                          className={cn(
                            'font-mono text-xs leading-relaxed text-foreground/90',
                            'whitespace-pre-wrap wrap=break-words break-all p-sm'
                          )}
                        >
                          {entry.payload}
                        </pre>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default WebhookHelper;
