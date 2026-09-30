import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';

import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';

const API_ENDPOINT =
  (import.meta.env.VITE_API_ENDPOINT as string) || 'http://localhost:7503';

interface ConsentParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  resource?: string;
}

function readParams(): ConsentParams {
  const q = new URLSearchParams(window.location.search);
  return {
    clientId: q.get('client_id') ?? '',
    redirectUri: q.get('redirect_uri') ?? '',
    scope: q.get('scope') ?? 'read',
    codeChallenge: q.get('code_challenge') ?? '',
    codeChallengeMethod: q.get('code_challenge_method') ?? 'S256',
    state: q.get('state') ?? undefined,
    resource: q.get('resource') ?? undefined,
  };
}

/** The registered client, as the backend knows it. */
interface RegisteredClient {
  name: string;
  redirectUri: string;
}

/** Where the browser goes after the decision, in words a user can check. */
function describeRedirect(uri: string): string {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return u.host;
    if (u.protocol === 'http:') return `an app on this computer (${u.host})`;
    return `an app on this computer (${u.protocol}//)`;
  } catch {
    return uri;
  }
}

/**
 * OAuth consent screen. The backend's GET /authorize validated the request and
 * redirected the browser here. We authenticate the user via the existing
 * session (authStore), let them choose scope + restrictions, and POST the
 * decision back to /oauth/authorize/decision with the session token. The
 * backend mints the code and returns the redirect URL back to the client.
 *
 * The app name is looked up from the backend, never read from this page's
 * URL: anyone can craft a consent link, so a name taken from it could claim to
 * be any app.
 */
const OAuthConsent: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, tokens } = useAuthStore();
  // eslint-disable-next-line react-hooks/use-memo
  const params = useMemo(readParams, []);

  const writeRequested = params.scope.split(/\s+/).includes('write');
  const [allowWrite, setAllowWrite] = useState(false);
  const [paperOnly, setPaperOnly] = useState(false);
  const [botId, setBotId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<RegisteredClient | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Not signed in → bounce to login, preserving this full URL so we come back.
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const here = window.location.pathname + window.location.search;
      navigate(`/login?redirectTo=${encodeURIComponent(here)}`, {
        replace: true,
      });
    }
  }, [isLoading, isAuthenticated, navigate]);

  const invalid =
    !params.clientId || !params.redirectUri || !params.codeChallenge;

  // Resolve the registered client; the backend also refuses a redirect_uri the
  // client did not register, so a tampered request never reaches the buttons.
  useEffect(() => {
    if (invalid || !isAuthenticated) return;
    let cancelled = false;
    const q = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
    });
    fetch(`${API_ENDPOINT}/oauth/authorize/client?${q}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error || typeof data.client_name !== 'string') {
          setLookupError('This authorization request is not valid.');
          return;
        }
        setClient({ name: data.client_name, redirectUri: params.redirectUri });
      })
      .catch(() => {
        if (!cancelled)
          setLookupError('Could not load this authorization request.');
      });
    return () => {
      cancelled = true;
    };
  }, [invalid, isAuthenticated, params.clientId, params.redirectUri]);

  async function submit(approved: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_ENDPOINT}/oauth/authorize/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: tokens?.accessToken ?? '',
        },
        body: JSON.stringify({
          client_id: params.clientId,
          redirect_uri: params.redirectUri,
          scope:
            approved && writeRequested && allowWrite ? params.scope : 'read',
          code_challenge: params.codeChallenge,
          code_challenge_method: params.codeChallengeMethod,
          state: params.state,
          resource: params.resource,
          approved,
          paper_context: approved && paperOnly ? true : undefined,
          bot_id: approved && botId.trim() ? botId.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(
          data.error_description || data.error || 'Authorization failed'
        );
        setSubmitting(false);
        return;
      }
      // Leave the SPA — hand control back to the OAuth client.
      window.location.href = data.redirect;
    } catch (e) {
      setError((e as Error)?.message ?? 'Network error');
      setSubmitting(false);
    }
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-md">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-xs">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Authorize access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-lg">
          {invalid ? (
            <p className="text-sm text-destructive">
              This authorization request is missing required parameters.
            </p>
          ) : lookupError ? (
            <p className="text-sm text-destructive">
              {lookupError} Start the connection again from the app.
            </p>
          ) : !client ? (
            <div className="flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {client.name}
                </span>{' '}
                wants to access your Gainium account through the API.
              </p>
              <p className="text-xs text-muted-foreground">
                After you decide, you will be sent to{' '}
                <span className="font-medium text-foreground break-all">
                  {describeRedirect(client.redirectUri)}
                </span>
                . Only continue if you started this connection there.
              </p>

              <div className="space-y-md">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Read access</Label>
                    <p className="text-xs text-muted-foreground">
                      View bots, deals, balances and account data.
                    </p>
                  </div>
                  <Switch checked disabled />
                </div>

                {writeRequested && (
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Trading (write) access</Label>
                      <p className="text-xs text-muted-foreground">
                        Create, start, stop and modify bots and deals.
                      </p>
                    </div>
                    <Switch
                      checked={allowWrite}
                      onCheckedChange={setAllowWrite}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Paper trading only</Label>
                    <p className="text-xs text-muted-foreground">
                      Restrict this connection to paper trading.
                    </p>
                  </div>
                  <Switch checked={paperOnly} onCheckedChange={setPaperOnly} />
                </div>

                <div className="space-y-xs">
                  <Label>Restrict to bot ID (optional)</Label>
                  <Input
                    value={botId}
                    onChange={(e) => setBotId(e.target.value)}
                    placeholder="Leave empty for all bots"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-sm">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => submit(false)}
                >
                  Deny
                </Button>
                <Button
                  className="flex-1"
                  disabled={submitting}
                  onClick={() => submit(true)}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Authorize'
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OAuthConsent;
