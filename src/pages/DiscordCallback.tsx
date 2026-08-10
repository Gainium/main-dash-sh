import TwoFactorAuth from '@/components/auth/TwoFactorAuth';
import { LogoLockup } from '@/components/common/LogoLockup';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { logger } from '@/lib/loggerInstance';
import { RealAuthService } from '@/lib/realAuthService';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, ShieldAlert } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface OTPRequiredError extends Error {
  temporaryToken?: string;
}

/**
 * Lands here from Discord's OAuth2 implicit-grant redirect
 * (`/auth/discord#access_token=…&state=…`). Verifies the CSRF nonce
 * set by DiscordLoginButton, exchanges the Discord access token for a
 * Gainium JWT via the shared oauth mutation, then routes to the
 * requested redirect (default /overview). Existing accounts with 2FA
 * get the OTP step, same as Google.
 */
const DiscordCallback: React.FC = () => {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(true);
  const [temporaryToken, setTemporaryToken] = useState<string | null>(null);
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;

    const run = async () => {
      // Token arrives in the URL fragment so it never reaches any
      // server logs. Strip it from the address bar immediately.
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get('access_token');
      const state = hash.get('state');
      window.history.replaceState(null, '', '/auth/discord');

      if (!accessToken) {
        setError(
          hash.get('error_description') ||
            'Discord did not return an access token.'
        );
        setIsWorking(false);
        return;
      }

      // CSRF check: the state nonce must match what our button stored.
      let redirect = '/overview';
      try {
        const parsed = JSON.parse(atob(state || '')) as {
          n?: string;
          r?: string;
        };
        const expected = sessionStorage.getItem('discord-oauth-nonce');
        sessionStorage.removeItem('discord-oauth-nonce');
        if (!expected || parsed.n !== expected) {
          throw new Error('state mismatch');
        }
        if (parsed.r && parsed.r.startsWith('/')) {
          redirect = parsed.r;
        }
      } catch {
        setError(
          'Sign-in request could not be verified. Please try again from the login page.'
        );
        setIsWorking(false);
        return;
      }

      try {
        const { accessToken: jwt, user } =
          await RealAuthService.loginWithDiscord(accessToken);
        login(jwt, user);
        navigate(redirect, { replace: true });
      } catch (err) {
        if (err instanceof Error && err.message === 'OTP_REQUIRED') {
          const tempToken = (err as OTPRequiredError).temporaryToken;
          if (tempToken) {
            setTemporaryToken(tempToken);
            setIsWorking(false);
            return;
          }
        }
        logger.error('Discord login failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        setError(
          err instanceof Error
            ? err.message
            : 'Could not complete Discord sign-in.'
        );
        setIsWorking(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (temporaryToken) {
    return (
      <TwoFactorAuth
        temporaryToken={temporaryToken}
        onBack={() => navigate('/login', { replace: true })}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-md">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl">
          <div className="p-xl">
            <div className="text-center">
              <div className="inline-flex items-center gap-xs">
                <LogoLockup className="w-50 h-8" />
              </div>
            </div>

            {isWorking ? (
              <div className="flex flex-col items-center justify-center gap-md text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">Signing you in with Discord…</p>
              </div>
            ) : (
              <div className="space-y-md text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-500/10 rounded-lg">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <h1 className="text-xl font-bold text-foreground">
                  Discord sign-in failed
                </h1>
                <p className="text-sm text-muted-foreground">
                  {error || 'Something went wrong. Please try again.'}
                </p>
                <Button
                  variant="gradient"
                  onClick={() => navigate('/login')}
                  className="w-full"
                >
                  Back to login
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DiscordCallback;
