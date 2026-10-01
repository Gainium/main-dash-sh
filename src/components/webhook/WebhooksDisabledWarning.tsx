import { AlertTriangle } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useWebhooksDisabled } from '@/hooks/useUserSettings';

/**
 * Shown under a bot setting that acts only on webhook signals (deal start,
 * take profit or stop loss = Webhook) while the account-wide "Disable all
 * webhook actions" switch is on — otherwise the user configures a trigger
 * that the backend will refuse. Renders nothing when webhooks are enabled
 * or on self-hosted, which has no such switch.
 */
const WebhooksDisabledWarning: React.FC<{ className?: string }> = ({
  className,
}) => {
  const webhooksDisabled = useWebhooksDisabled();
  if (!webhooksDisabled) return null;
  return (
    <Alert
      className={`border-warning/60 bg-warning/10 text-warning ${className ?? ''}`}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="text-sm font-semibold">
        Webhook actions are disabled for your account
      </AlertTitle>
      <AlertDescription className="text-sm">
        Webhook signals sent to this bot will be refused. Re-enable them in{' '}
        <Link to="/settings/login-security" className="underline">
          Settings → Login &amp; Security
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
};

export default WebhooksDisabledWarning;
