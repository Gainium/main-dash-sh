import { ArrowUpCircle, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { IS_CLOUD } from '@/config/mode';
import { isAdminApiConfigured } from '@/lib/api/adminClient';
import { cn } from '@/lib/utils';
import { useAdminUpdates } from '@/pages/admin/useAdminApi';

import {
  runningFrontendVersion,
  UPDATES_HREF,
  updatesSignature,
} from './updateAvailable';

const DISMISS_KEY = 'gainium.notice.updateAvailable.dismissed';

// admin-sh asks the image registry on every /api/updates call, so the layout
// checks a few times a day at most, not on every page change.
const CHECK_INTERVAL_MS = 6 * 60 * 60_000;

const readDismissed = (): string | null => {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};

/**
 * Tells a self-hosted operator that newer images are published for this
 * installation, and which dashboard version they are running now.
 *
 * Every signed-in user of a self-hosted install is its admin, so this shows
 * to anyone there. Cloud never shows it: there is no admin-sh to ask, and the
 * query is not even sent. One line and dismissible — the detail and the
 * upgrade buttons live on the Updates tab it links to.
 */
export function UpdateAvailableNotice({ className }: { className?: string }) {
  const enabled = !IS_CLOUD && isAdminApiConfigured();
  const { pathname } = useLocation();
  const { data } = useAdminUpdates({
    staleTime: CHECK_INTERVAL_MS,
    // An older admin-sh, or a brief outage: nothing to say, not worth retries.
    retry: false,
  });
  const [dismissed, setDismissed] = useState(readDismissed);

  const signature = useMemo(() => updatesSignature(data ?? []), [data]);
  const count = useMemo(
    () => new Set(data?.filter((u) => u.hasUpdate).map((u) => u.service)).size,
    [data]
  );

  const handleDismiss = useCallback(() => {
    setDismissed(signature);
    try {
      localStorage.setItem(DISMISS_KEY, signature);
    } catch {
      // Dismissal just won't persist. Not worth surfacing.
    }
  }, [signature]);

  if (!enabled || !signature || dismissed === signature) return null;
  // The admin page lists the same updates in full.
  if (pathname === '/admin') return null;

  const version = runningFrontendVersion();

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-sm rounded-lg border border-border bg-inner-container p-sm text-sm',
        className
      )}
    >
      <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 text-muted-foreground">
        {count === 1
          ? 'Update available for 1 service'
          : `Updates available for ${count} services`}
        {version ? (
          <>
            {' '}
            · running dashboard <span className="font-mono">{version}</span>
          </>
        ) : null}{' '}
        —{' '}
        <Link
          to={UPDATES_HREF}
          className="font-medium text-foreground underline underline-offset-2 hover:opacity-80"
        >
          view updates
        </Link>
        .
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="-my-1 -mr-1 h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss update notice"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default UpdateAvailableNotice;
