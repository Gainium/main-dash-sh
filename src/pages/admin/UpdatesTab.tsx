import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminUpdates, useAdminUpgrade } from './useAdminApi';
import {
  adminApi,
  type AdminSelfUpgradeStatus,
  type AdminUpdate,
} from '@/lib/api/adminClient';
import { getMeta } from './serviceCatalog';

type Row = AdminUpdate & { groupKey: string };

// admin-sh recreates its own container, so it must be upgraded last (any
// later upgrade in the same run would hit the restarting container) and its
// outcome can only be confirmed by polling after it comes back.
const ADMIN_SH = 'admin-sh';

// The self-upgrade poll UI walks through: nothing → waiting for admin-sh to
// come back → a terminal success/failure.
type SelfUpgradeUi =
  | { kind: 'idle' }
  | { kind: 'polling'; targetTag: string; manualFallback: string }
  | { kind: 'done'; status: AdminSelfUpgradeStatus };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Dedupe across services that share an image (e.g. all bots-* share
// main-app). The first row keeps the canonical group key; the rest get
// deduped by repo+current so the operator clicks Upgrade once.
function groupRows(rows: AdminUpdate[]): Row[] {
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = r.repo ? `${r.repo}:${r.current ?? ''}` : r.containerId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, groupKey: key });
  }
  return out;
}

export function UpdatesTab() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isFetching } = useAdminUpdates();
  const upgrade = useAdminUpgrade();
  const [pending, setPending] = useState<string | null>(null);
  const [self, setSelf] = useState<SelfUpgradeUi>({ kind: 'idle' });

  const rows = useMemo(() => groupRows(data ?? []), [data]);
  const upgradable = useMemo(() => rows.filter((r) => r.hasUpdate), [rows]);
  const busy = pending !== null || self.kind === 'polling';

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-lg text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking the registry for updates…
      </div>
    );
  }

  if (error) {
    return (
      <Card compact className="p-md text-destructive">
        Failed to load updates: {(error as Error).message}
        <div className="">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  // admin-sh dies mid-swap while recreating itself, so POST /api/upgrade
  // only reports "pending". Poll /self-status until it reconciles a real
  // success/failure (tolerating the brief window where admin-sh is
  // unreachable), then refresh the panels.
  async function pollSelfUpgrade(targetTag: string, manualFallback: string) {
    setSelf({ kind: 'polling', targetTag, manualFallback });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await sleep(3000);
      let status: AdminSelfUpgradeStatus;
      try {
        status = await adminApi.getSelfUpgradeStatus();
      } catch {
        // admin-sh is briefly down while it restarts — keep waiting.
        continue;
      }
      if (status.state === 'success' || status.state === 'failed') {
        setSelf({ kind: 'done', status });
        qc.invalidateQueries({ queryKey: ['admin'] });
        return;
      }
    }
    setSelf({
      kind: 'done',
      status: {
        state: 'failed',
        targetTag,
        fromTag: null,
        currentTag: null,
        startedAt: null,
        finishedAt: null,
        exitCode: null,
        error:
          'Timed out waiting for admin-sh to come back after the self-upgrade. Check the admin-sh container, then run the manual fallback if it stayed on the old version.',
        manualFallback,
      },
    });
  }

  async function run(service: string, tag: string) {
    setPending(service);
    try {
      const res = await upgrade.mutateAsync({ service, tag });
      const pendingSelf = res.results.find(
        (r) => r.selfUpgrade?.pending
      )?.selfUpgrade;
      if (pendingSelf) {
        void pollSelfUpgrade(
          pendingSelf.targetTag,
          pendingSelf.manualFallback
        );
      }
    } finally {
      setPending(null);
    }
  }

  async function runAll() {
    setPending('all');
    try {
      // Always upgrade admin-sh last — it restarts itself and would sever
      // any upgrades queued after it.
      const ordered = [...upgradable].sort((a, b) =>
        a.service === ADMIN_SH ? 1 : b.service === ADMIN_SH ? -1 : 0
      );
      for (const r of ordered) {
        if (!r.latest) continue;
        const res = await upgrade.mutateAsync({
          service: r.service,
          tag: r.latest,
        });
        const pendingSelf = res.results.find(
          (x) => x.selfUpgrade?.pending
        )?.selfUpgrade;
        if (pendingSelf) {
          void pollSelfUpgrade(
            pendingSelf.targetTag,
            pendingSelf.manualFallback
          );
          break; // admin-sh is going down; nothing after it would land.
        }
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-lg">
      <div className="flex items-center justify-between flex-wrap gap-sm">
        <p className="text-sm text-muted-foreground">
          {upgradable.length === 0
            ? `All ${rows.length} image groups are up to date.`
            : `${upgradable.length} of ${rows.length} image groups have updates.`}
        </p>
        <div className="flex items-center gap-sm">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching || busy}
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Refreshing
              </>
            ) : (
              'Refresh'
            )}
          </Button>
          <Button
            size="sm"
            onClick={runAll}
            disabled={!upgradable.length || busy}
          >
            {pending === 'all' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowUpCircle className="w-4 h-4 mr-2" />
            )}
            Upgrade all
          </Button>
        </div>
      </div>

      <SelfUpgradeNotice self={self} />

      <div className="grid grid-cols-1 gap-sm">
        {rows.map((r) => {
          const meta = getMeta(r.service);
          return (
            <Card key={r.groupKey} compact className="px-md py-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-md">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-sm flex-wrap">
                    <span className="font-semibold text-sm">
                      {meta.label ?? r.service}
                    </span>
                    {r.hasUpdate ? (
                      <Badge variant="default">update available</Badge>
                    ) : (
                      <Badge variant="secondary">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        up to date
                      </Badge>
                    )}
                  </div>
                  {meta.description ? (
                    <div className="text-xs text-muted-foreground leading-snug">
                      {meta.description}
                    </div>
                  ) : null}
                  <div className="text-xs font-mono text-muted-foreground break-all">
                    {r.repo ?? r.image}
                  </div>
                  <div className="text-xs">
                    current:{' '}
                    <span className="font-mono">{r.current ?? '?'}</span>
                    {r.latest && r.latest !== r.current ? (
                      <>
                        {' '}
                        → latest:{' '}
                        <span className="font-mono text-primary">
                          {r.latest}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {r.error ? (
                    <div className="text-xs text-destructive">{r.error}</div>
                  ) : null}
                </div>
                <div className="shrink-0">
                  <Button
                    size="sm"
                    disabled={!r.hasUpdate || !r.latest || busy}
                    onClick={() => r.latest && run(r.service, r.latest)}
                  >
                    {pending === r.service ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Upgrade
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {upgrade.error ? (
        <Card compact className="p-md text-destructive text-sm">
          Last upgrade failed: {(upgrade.error as Error).message}
        </Card>
      ) : null}
    </div>
  );
}

// The admin-sh self-upgrade is the one upgrade whose result the POST can't
// report (admin-sh restarts itself), so it gets its own status banner.
function SelfUpgradeNotice({ self }: { self: SelfUpgradeUi }) {
  if (self.kind === 'polling') {
    return (
      <Card compact className="p-md text-sm flex items-start gap-sm">
        <Loader2 className="w-4 h-4 animate-spin mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">
            Upgrading admin-sh to{' '}
            <span className="font-mono">{self.targetTag}</span>…
          </div>
          <div className="text-muted-foreground text-xs mt-0.5">
            The admin service restarts itself — this page may briefly lose
            connection. Waiting for it to come back to confirm the new
            version.
          </div>
        </div>
      </Card>
    );
  }

  if (self.kind === 'done' && self.status.state === 'success') {
    return (
      <Card compact className="p-md text-sm flex items-start gap-sm">
        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          admin-sh upgraded to{' '}
          <span className="font-mono">
            {self.status.currentTag ?? self.status.targetTag}
          </span>
          .
        </div>
      </Card>
    );
  }

  if (self.kind === 'done' && self.status.state === 'failed') {
    return (
      <Card compact className="p-md text-sm space-y-sm">
        <div className="flex items-center gap-sm text-destructive font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          admin-sh self-upgrade failed
        </div>
        {self.status.error ? (
          <div className="text-xs text-destructive whitespace-pre-wrap">
            {self.status.error}
          </div>
        ) : null}
        <div className="text-xs">
          Run this on the host to finish the upgrade:
          <div className="mt-1 flex items-center gap-sm">
            <code className="px-2 py-1 rounded bg-inner-container font-mono break-all flex-1">
              {self.status.manualFallback}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigator.clipboard?.writeText(self.status.manualFallback)
              }
            >
              Copy
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return null;
}
