import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import {
  isWebAuthnSupported,
  useAuthenticatePasskey,
} from '@/hooks/useWebAuthn';
import { useAuthStore } from '@/stores/authStore';
import { RealAuthService } from '@/lib/realAuthService';
import { logger } from '@/lib/loggerInstance';

interface PasskeyLoginButtonProps {
  termsAccepted?: boolean;
  className?: string;
  onError?: (message: string) => void;
  /** Show short label "Passkey" instead of "Sign in with passkey" */
  compactLabel?: boolean;
}

/**
 * One-click passkey sign-in. Gated by `window.PublicKeyCredential`.
 * Uses resident-credential / discoverable-credential flow: backend
 * returns an empty `allowCredentials` list when no email is provided,
 * so the browser surfaces the user's own saved passkeys natively.
 * No email lookup needed.
 */
export const PasskeyLoginButton: React.FC<PasskeyLoginButtonProps> = ({
  termsAccepted = true,
  className,
  onError,
  compactLabel = false,
}) => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const authenticate = useAuthenticatePasskey();
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isWebAuthnSupported()) return null;

  const reportError = (msg: string) => {
    setLocalError(msg);
    onError?.(msg);
  };

  const handleClick = async () => {
    setLocalError(null);
    if (!termsAccepted) {
      reportError('Please accept the terms and conditions first');
      return;
    }
    try {
      const { token } = await authenticate.mutateAsync({});
      const user = await RealAuthService.getUserInfo(token);
      login(token, user);
      navigate('/overview');
    } catch (err) {
      // Browser cancels (user closed prompt) surface as DOMException
      // NotAllowedError — don't treat as a failure worth logging loudly.
      const msg =
        err instanceof Error ? err.message : 'Passkey sign-in failed';
      if (msg.includes('NotAllowedError') || msg.includes('cancel')) {
        return;
      }
      logger.error('Passkey login failed', { error: msg });
      reportError(msg);
    }
  };

  return (
    <>
      <Tooltip
        tooltip={
          !termsAccepted
            ? 'Please accept the terms and conditions first'
            : undefined
        }
        side="top"
        triggerClassName="w-full"
      >
        <Button
          type="button"
          variant="outline"
          onClick={handleClick}
          disabled={!termsAccepted || authenticate.isPending}
          className={className}
        >
          {authenticate.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Fingerprint className="w-4 h-4 text-white" />
          )}
          {compactLabel ? 'Passkey' : 'Sign in with passkey'}
        </Button>
      </Tooltip>
      {localError && (
        <p className="text-xs text-red-500">{localError}</p>
      )}
    </>
  );
};

export default PasskeyLoginButton;
