import { KeyRound, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useDeploymentSecurity } from '@/hooks/useDeploymentSecurity';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'gainium.notice.encryptionKey.dismissed';

const DOCS_URL =
  'https://github.com/Gainium/docker-sh/blob/main/DEPLOYMENT.md#encryption-key';

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Private mode / storage disabled — show it, it is one line.
    return false;
  }
};

/**
 * Recommends setting a per-installation encryption key when this deployment
 * is still using the one that ships with the build.
 *
 * Self-hosted only, and only shown when the API reports the key is not
 * configured — {@link useDeploymentSecurity} does not even run the query on
 * cloud. Deliberately understated: it is a hardening recommendation the
 * operator can act on whenever they like, not a fault, so it is one line, it
 * is dismissible, and the dismissal sticks. The detail lives in the linked
 * documentation rather than in the banner.
 */
export function EncryptionKeyNotice({ className }: { className?: string }) {
  const security = useDeploymentSecurity();
  const [dismissed, setDismissed] = useState(readDismissed);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Dismissal just won't persist. Not worth surfacing.
    }
  }, []);

  // `undefined` while loading, or when the API predates the query.
  if (dismissed || security?.encryptionKeyConfigured !== false) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-sm rounded-lg border border-border bg-inner-container p-sm text-sm',
        className
      )}
    >
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 text-muted-foreground">
        This installation is using the default encryption key for stored
        exchange API credentials. Setting your own is recommended —{' '}
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
        >
          how to set it
        </a>
        .
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="-my-1 -mr-1 h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss encryption key notice"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default EncryptionKeyNotice;
