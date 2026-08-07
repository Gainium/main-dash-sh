import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, Mail, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LogoLockup } from '@/components/common/LogoLockup';
import {
  useConsumeMagicLink,
  type ConsumeMagicLinkData,
} from '@/hooks/useMagicLink';
import { RealAuthService } from '@/lib/realAuthService';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';

/**
 * Consumes a magic-link token: exchanges it for a JWT via `consumeMagicLink`,
 * fetches the user profile, then routes to the requested redirect path
 * (defaulting to `/overview`).
 *
 * Three response branches:
 *   - data.token present → signed in (existing user or new user that just
 *     accepted ToS in a prior call). Store the JWT and navigate.
 *   - data.pendingTerms === true → unknown email; render an inline
 * "Welcome to Gainium" card with a ToS checkbox + "Create my account"
 *     button that re-calls consume with termsAccepted=true.
 *   - error / NOTOK → surface the message and offer "Request a new link".
 */
const MagicLinkConsume: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const consumeMagicLink = useConsumeMagicLink();

  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(true);
  const [pendingTermsEmail, setPendingTermsEmail] = useState<string | null>(
    null
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const consumedRef = useRef(false);

  const redirect = searchParams.get('redirect') || '/overview';
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const finishSignIn = async (data: ConsumeMagicLinkData) => {
    if (!data.token) {
      throw new Error('Sign-in token missing in response');
    }
    const jwt = data.token;
    const user = await RealAuthService.getUserInfo(jwt);
    login(jwt, user);
    if (data.isNewUser) {
      toast.success('Welcome to Gainium!');
    }
    navigate(redirect, { replace: true });
  };

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;

    const run = async () => {
      if (!token) {
        setError('No sign-in token provided.');
        setIsWorking(false);
        return;
      }

      try {
        const result = await consumeMagicLink.mutateAsync({
          token,
          timezone,
        });
        const data = result.data;
        if (!data) {
          throw new Error(result.reason || 'Sign-in link is invalid or expired.');
        }
        if (data.pendingTerms === true) {
          setPendingTermsEmail(data.email ?? null);
          setIsWorking(false);
          return;
        }
        await finishSignIn(data);
      } catch (err) {
        logger.error('Magic link consume failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        setError(
          err instanceof Error
            ? err.message
            : 'Could not complete sign-in. Please request a new link.'
        );
        setIsWorking(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreateAccount = async () => {
    if (!token || !termsAccepted) return;
    setIsCreating(true);
    setError(null);
    try {
      const result = await consumeMagicLink.mutateAsync({
        token,
        timezone,
        termsAccepted: true,
      });
      const data = result.data;
      if (!data) {
        throw new Error(result.reason || 'Could not create your account.');
      }
      await finishSignIn(data);
    } catch (err) {
      logger.error('Magic link sign-up failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create your account. Please request a new link.'
      );
      setIsCreating(false);
    }
  };

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
                <p className="text-sm">Signing you in…</p>
              </div>
            ) : pendingTermsEmail ? (
              <div className="space-y-md">
                <div className="text-center space-y-xs">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <h1 className="text-xl font-bold text-foreground">
                    Welcome to Gainium
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    You're about to create a new account for:
                  </p>
                  <p className="text-sm font-medium text-foreground break-all">
                    {pendingTermsEmail}
                  </p>
                </div>

                <div className="flex items-start gap-sm">
                  <Checkbox
                    id="terms"
                    checked={termsAccepted}
                    onCheckedChange={(v) => setTermsAccepted(v === true)}
                    disabled={isCreating}
                    className="mt-1"
                  />
                  <Label
                    htmlFor="terms"
                    className="text-sm text-foreground leading-relaxed cursor-pointer"
                  >
                    I accept the{' '}
                    <a
                      href="https://gainium.io/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline hover:no-underline"
                    >
                      Terms of Service and Privacy Policy
                    </a>
                  </Label>
                </div>

                {error && (
                  <p className="text-sm text-red-500 text-center">{error}</p>
                )}

                <Button
                  variant="gradient"
                  onClick={handleCreateAccount}
                  disabled={!termsAccepted || isCreating}
                  className="w-full"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating account…
                    </>
                  ) : (
                    'Create my account'
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-md text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-500/10 rounded-lg">
                  <ShieldAlert className="w-6 h-6 text-red-500" />
                </div>
                <h1 className="text-xl font-bold text-foreground">
                  Sign-in failed
                </h1>
                <p className="text-sm text-muted-foreground">
                  {error || 'Your sign-in link could not be used.'}
                </p>
                <Button
                  variant="gradient"
                  onClick={() => navigate('/login')}
                  className="w-full"
                >
                  Request a new link
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default MagicLinkConsume;
