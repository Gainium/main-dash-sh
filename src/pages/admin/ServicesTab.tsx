import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Play,
  RotateCw,
  ScrollText,
  Square,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useAdminContainerAction,
  useAdminContainers,
} from './useAdminApi';
import type { AdminContainer } from '@/lib/api/adminClient';
import { LogsDialog } from './LogsDialog';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getMeta,
  type ServiceCategory,
} from './serviceCatalog';

type Verb = 'start' | 'stop' | 'restart';

function StatePill({ state }: { state: string }) {
  const variant =
    state === 'running'
      ? 'default'
      : state === 'exited'
        ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {state}
    </Badge>
  );
}

function ServiceRow({
  c,
  pending,
  onAction,
  selected,
  onToggleSelect,
  onOpenLogs,
}: {
  c: AdminContainer;
  pending: { name: string; verb: string } | null;
  onAction: (name: string, verb: Verb) => void;
  selected: boolean;
  onToggleSelect: (name: string) => void;
  onOpenLogs: (name: string) => void;
}) {
  const meta = getMeta(c.service);
  const name = c.service || c.name;
  const busy = pending?.name === name;

  return (
    <Card
      compact
      className={`px-md py-sm transition-colors ${
        selected ? 'ring-2 ring-primary/30' : ''
      }`}
    >
      <div className="flex items-start gap-md">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(name)}
          aria-label={`Select ${meta.label ?? name}`}
          className="mt-0.5"
        />

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-sm flex-wrap">
            <span className="font-semibold text-sm">
              {meta.label ?? name}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {name}
            </span>
            <StatePill state={c.state} />
          </div>
          {meta.description ? (
            <div className="text-xs text-muted-foreground leading-snug">
              {meta.description}
            </div>
          ) : null}
          <div className="text-xs font-mono text-muted-foreground truncate">
            {c.image} · {c.status}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenLogs(name)}
            title="View logs"
            aria-label="View logs"
          >
            <ScrollText className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || c.state === 'running'}
            onClick={() => onAction(name, 'start')}
            title="Start"
            aria-label="Start"
          >
            {busy && pending?.verb === 'start' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={
              busy || c.state !== 'running' || meta.hideStop === true
            }
            onClick={() => onAction(name, 'stop')}
            title={
              meta.hideStop
                ? 'Critical service — stop via the host shell if you really need to'
                : 'Stop'
            }
            aria-label="Stop"
          >
            {busy && pending?.verb === 'stop' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAction(name, 'restart')}
            title="Restart"
            aria-label="Restart"
          >
            {busy && pending?.verb === 'restart' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BulkToolbar({
  total,
  selectedCount,
  stopEligibleCount,
  bulkBusy,
  bulkVerb,
  onSelectAll,
  onClear,
  onBulk,
}: {
  total: number;
  selectedCount: number;
  stopEligibleCount: number;
  bulkBusy: boolean;
  bulkVerb: Verb | null;
  onSelectAll: () => void;
  onClear: () => void;
  onBulk: (verb: Verb) => void;
}) {
  const empty = selectedCount === 0;

  return (
    <Card compact className="px-md py-sm">
      <div className="flex items-center justify-between gap-md flex-wrap">
        <div className="flex items-center gap-sm">
          <Checkbox
            checked={selectedCount > 0 && selectedCount === total}
            onCheckedChange={(v) => (v ? onSelectAll() : onClear())}
            aria-label={empty ? 'Select all' : 'Clear selection'}
          />
          <span className="text-sm">
            {empty ? (
              <span className="text-muted-foreground">
                Select services for bulk actions
              </span>
            ) : (
              <>
                <span className="font-medium">{selectedCount}</span>{' '}
                <span className="text-muted-foreground">
                  of {total} selected
                </span>
              </>
            )}
          </span>
          {!empty ? (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={empty || bulkBusy}
            onClick={() => onBulk('start')}
            title="Start selected"
          >
            {bulkBusy && bulkVerb === 'start' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={empty || stopEligibleCount === 0 || bulkBusy}
            onClick={() => onBulk('stop')}
            title={
              stopEligibleCount < selectedCount
                ? `${selectedCount - stopEligibleCount} critical service${
                    selectedCount - stopEligibleCount === 1 ? '' : 's'
                  } will be skipped`
                : 'Stop selected'
            }
          >
            {bulkBusy && bulkVerb === 'stop' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Square className="w-4 h-4 mr-2" />
            )}
            Stop
            {stopEligibleCount < selectedCount && stopEligibleCount > 0 ? (
              <span className="ml-1 text-xs opacity-75">
                ({stopEligibleCount})
              </span>
            ) : null}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={empty || bulkBusy}
            onClick={() => onBulk('restart')}
            title="Restart selected"
          >
            {bulkBusy && bulkVerb === 'restart' ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RotateCw className="w-4 h-4 mr-2" />
            )}
            Restart
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function ServicesTab() {
  const { data, isLoading, error, refetch, isFetching } = useAdminContainers();
  const action = useAdminContainerAction();
  const [pending, setPending] = useState<{ name: string; verb: Verb } | null>(
    null
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkVerb, setBulkVerb] = useState<Verb | null>(null);

  // Stabilize the array identity so the grouped useMemo doesn't refire
  // on every render of the parent. Filter out services flagged `hidden`
  // (e.g. cli-runner) — they're one-shot utilities with nothing useful
  // to do in this view.
  const containers = useMemo<AdminContainer[]>(
    () => (data ?? []).filter((c) => !getMeta(c.service).hidden),
    [data]
  );
  const total = containers.length;
  const [logsService, setLogsService] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<ServiceCategory, AdminContainer[]>();
    for (const c of containers) {
      const cat = getMeta(c.service).category;
      const arr = map.get(cat) ?? [];
      arr.push(c);
      map.set(cat, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) =>
        (a.service || a.name).localeCompare(b.service || b.name)
      );
    }
    return map;
  }, [containers]);

  const stopEligibleCount = useMemo(() => {
    let n = 0;
    for (const svc of selected) {
      if (!getMeta(svc).hideStop) n += 1;
    }
    return n;
  }, [selected]);

  async function runOne(name: string, verb: Verb) {
    setPending({ name, verb });
    try {
      await action.mutateAsync({ name, action: verb });
    } finally {
      setPending(null);
    }
  }

  async function runBulk(verb: Verb) {
    setBulkVerb(verb);
    try {
      // Stop skips critical services. Start/restart are safe on everything.
      const targets = Array.from(selected).filter(
        (svc) => !(verb === 'stop' && getMeta(svc).hideStop),
      );
      for (const svc of targets) {
        setPending({ name: svc, verb });
        try {
          await action.mutateAsync({ name: svc, action: verb });
        } catch {
          // Continue with the next; the per-mutation error surfaces in
          // action.error below the list.
        }
      }
      setSelected(new Set());
    } finally {
      setPending(null);
      setBulkVerb(null);
    }
  }

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(containers.map((c) => c.service || c.name)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-lg text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading services…
      </div>
    );
  }

  if (error) {
    return (
      <Card compact className="p-md text-destructive">
        Failed to load services: {(error as Error).message}
        <div className="">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const bulkBusy = bulkVerb !== null;

  return (
    <div className="space-y-md">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} container{total === 1 ? '' : 's'} in this deployment
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching || bulkBusy}
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
      </div>

      <BulkToolbar
        total={total}
        selectedCount={selected.size}
        stopEligibleCount={stopEligibleCount}
        bulkBusy={bulkBusy}
        bulkVerb={bulkVerb}
        onSelectAll={selectAll}
        onClear={clearSelection}
        onBulk={runBulk}
      />

      {/* Scroll container — keeps the page header/toolbar pinned and lets
          the categories scroll independently. Category headers are sticky
          relative to this container. */}
      <div className="max-h-[calc(100vh-360px)] overflow-y-auto pr-2 -mr-2 space-y-md">
        {CATEGORY_ORDER.map((cat) => {
          const rows = grouped.get(cat);
          if (!rows?.length) return null;
          return (
            <section key={cat} className="space-y-sm">
              <header className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex items-baseline gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {rows.length}
                </span>
              </header>
              <div className="grid grid-cols-1 gap-sm">
                {rows.map((c) => {
                  const name = c.service || c.name;
                  return (
                    <ServiceRow
                      key={c.id}
                      c={c}
                      pending={pending}
                      onAction={runOne}
                      selected={selected.has(name)}
                      onToggleSelect={toggleSelect}
                      onOpenLogs={setLogsService}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {action.error ? (
        <Card compact className="p-md text-destructive text-sm">
          Last action failed: {(action.error as Error).message}
        </Card>
      ) : null}

      <LogsDialog
        open={logsService !== null}
        service={logsService}
        onOpenChange={(v) => {
          if (!v) setLogsService(null);
        }}
      />
    </div>
  );
}
