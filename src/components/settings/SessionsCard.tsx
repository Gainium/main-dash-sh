import { useState } from 'react';
import { Loader2, LogOut, Monitor, Smartphone } from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { toast } from '@/lib/toast';
import {
  useSessionOperations,
  type UserSession,
} from '@/hooks/useSessions';

/** Friendly label for the login method that minted a session. */
function methodLabel(source: string | null): string {
  switch (source) {
    case 'web':
      return 'Password';
    case 'email':
      return 'Email link';
    case 'webauthn':
      return 'Passkey';
    case 'google':
      return 'Google';
    case 'discord':
      return 'Discord';
    case null:
    case '':
      return '';
    default:
      return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

/** True when the device label looks like a phone/tablet. */
function isMobileDevice(device: string | null): boolean {
  return !!device && /iOS|Android/i.test(device);
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString() : '—';

function SessionRow({
  session,
  onRevoke,
  revoking,
}: {
  session: UserSession;
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  const mobile = isMobileDevice(session.device);
  const method = methodLabel(session.source);
  // Secondary line: location · IP · via method · signed-in time.
  const meta = [
    session.location,
    session.ip,
    method ? `via ${method}` : null,
    `Signed in ${fmt(session.createdAt)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex items-center justify-between gap-md py-sm">
      <div className="flex items-center gap-sm min-w-0">
        {mobile ? (
          <Smartphone className="w-4 h-4 shrink-0 text-muted-foreground" />
        ) : (
          <Monitor className="w-4 h-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground flex items-center gap-xs">
            {session.device || 'Unknown device'}
            {session.current && (
              <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                (this device)
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground truncate">{meta}</p>
        </div>
      </div>
      {session.current ? (
        <span className="text-xs text-muted-foreground shrink-0">Active</span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={revoking}
          onClick={() => onRevoke(session.id)}
        >
          {revoking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Log out'
          )}
        </Button>
      )}
    </div>
  );
}

/**
 * Active sessions — lists the user's live login sessions and lets them revoke
 * any one of them or log out everywhere except the current device. Admin
 * impersonation sessions are filtered out on the backend, so a support agent
 * checking the account never shows up here.
 *
 * Lives in core so both the self-hosted and cloud editions get it.
 */
const SessionsCard: React.FC = () => {
  const {
    sessions,
    isLoading,
    revokeSession,
    revokingId,
    logoutOtherSessions,
    isLoggingOutOthers,
  } = useSessionOperations();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const otherCount = sessions.filter((s) => !s.current).length;

  const handleRevoke = (id: string) =>
    revokeSession(id, {
      onSuccess: () => toast.success('Session logged out'),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : 'Could not log out session'),
    });

  const handleLogoutOthers = () =>
    logoutOtherSessions(undefined, {
      onSuccess: () => toast.success('Logged out all other sessions'),
      onError: (e) =>
        toast.error(
          e instanceof Error ? e.message : 'Could not log out other sessions'
        ),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-xs text-primary">
          <Monitor className="w-4 h-4" />
          Active sessions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-md">
        <p className="text-sm text-muted-foreground">
          Devices and browsers currently signed in to your account. If you see
          something you don&apos;t recognize, log it out.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-sm text-sm text-muted-foreground py-md">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-md">
            No active sessions found.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onRevoke={handleRevoke}
                revoking={revokingId === s.id}
              />
            ))}
          </div>
        )}

        {otherCount > 0 && (
          <div className="">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={isLoggingOutOthers}
              onClick={() => setConfirmOpen(true)}
            >
              {isLoggingOutOthers ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              Log out all other sessions
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Log out all other sessions?"
        description="This signs out every device except the one you're using now. You'll stay signed in here."
        confirmText="Log out others"
        variant="destructive"
        onConfirm={handleLogoutOthers}
      />
    </Card>
  );
};

export default SessionsCard;
