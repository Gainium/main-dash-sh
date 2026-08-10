import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Radio,
  XCircle,
} from 'lucide-react';
import { useAdminDiagnostics } from './useAdminApi';
import type {
  AdminExchangeFeed,
  AdminServiceHealth,
} from '@/lib/api/adminClient';

function FeedRow({ f }: { f: AdminExchangeFeed }) {
  return (
    <Card
      compact
      className={`px-md py-sm ${
        f.enabled && !f.live ? 'ring-1 ring-destructive/40' : ''
      }`}
    >
      <div className="flex items-center gap-md">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-sm flex-wrap">
            <span className="font-semibold text-sm font-mono">
              {f.exchange}
            </span>
            {f.enabled ? (
              <Badge variant="secondary" className="text-[10px]">
                enabled
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                disabled
              </Badge>
            )}
            {f.live ? (
              <Badge variant="default" className="text-[10px]">
                live
              </Badge>
            ) : f.enabled ? (
              <Badge variant="destructive" className="text-[10px]">
                no ticks
              </Badge>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground font-mono truncate">
            {f.tradeMsgs} trades · {f.candleMsgs} candles
            {f.lastSymbol ? ` · last ${f.lastSymbol}` : ''}
          </div>
        </div>
        {f.live ? (
          <Radio className="w-4 h-4 text-primary shrink-0" />
        ) : f.enabled ? (
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        ) : null}
      </div>
    </Card>
  );
}

function ServiceChip({ s }: { s: AdminServiceHealth }) {
  const bad = !s.up || s.health === 'unhealthy';
  return (
    <Badge
      variant={bad ? 'destructive' : 'secondary'}
      className="font-mono text-[11px] gap-1"
      title={`${s.state}${s.health ? ` · ${s.health}` : ''}`}
    >
      {s.up ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {s.service}
    </Badge>
  );
}

export function DiagnosticsTab() {
  const { data, isLoading, error, refetch, isFetching } = useAdminDiagnostics();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-lg text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Running diagnostics…
      </div>
    );
  }

  if (error) {
    return (
      <Card compact className="p-md text-destructive">
        Failed to run diagnostics: {(error as Error).message}
        <div className="">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const downServices = data.services.filter(
    (s) => !s.up || s.health === 'unhealthy'
  );
  const feeds = data.feeds;
  const connectors = data.feedConnectors ?? [];
  // Explicit false (not undefined) means an admin-sh >= 1.3.0 confirmed no
  // ticker-role connector is running — the config cause of "no ticks".
  const tickerMissing = data.tickerRoleRunning === false;
  const tickerOnly = new Set(data.tickerOnlyExchanges ?? []);

  return (
    <div className="space-y-md">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Live health snapshot · feed probe window {feeds.windowMs} ms
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Running
            </>
          ) : (
            'Re-run'
          )}
        </Button>
      </div>

      {/* Root config cause: no connector is producing the ticker feed that
          paper/live fills consume. This is the 4872 condition. */}
      {tickerMissing ? (
        <Card compact className="p-md border-destructive/40">
          <div className="flex items-start gap-sm">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-sm">
                No price connector is running the ticker feed
              </div>
              <p className="text-xs text-muted-foreground">
                Every running price connector is in a candle-only role, so the{' '}
                <span className="font-mono">trade@</span> ticker feed that
                paper and live order-filling depend on is never produced —
                bots won't place orders. Set the price connector to the{' '}
                <span className="font-mono">all</span> role (it produces both
                candle streams and the ticker feed) and recreate it.
                {tickerOnly.size > 0 ? (
                  <>
                    {' '}
                    Ticker-only exchanges (
                    <span className="font-mono">
                      {[...tickerOnly].join(', ')}
                    </span>
                    ) produce nothing at all without it.
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Headline: enabled exchanges with no live feed — the "bot not
          trading because prices aren't flowing" smoking gun. */}
      {feeds.stalled.length > 0 ? (
        <Card compact className="p-md border-destructive/40">
          <div className="flex items-start gap-sm">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-sm">
                {feeds.stalled.length} enabled exchange
                {feeds.stalled.length === 1 ? '' : 's'} with no live price feed
              </div>
              <p className="text-xs text-muted-foreground">
                No trades or candles arrived for{' '}
                <span className="font-mono">{feeds.stalled.join(', ')}</span>{' '}
                during the probe. Simulated and live orders on these exchanges
                won't fill until the feed recovers — check the{' '}
                <span className="font-mono">websocket-connector</span> service
                and that the exchange is reachable.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card compact className="p-md">
          <div className="flex items-center gap-sm text-sm">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            All {feeds.liveCount} enabled exchange
            {feeds.liveCount === 1 ? '' : 's'} are receiving live price data.
          </div>
        </Card>
      )}

      {/* Infra strip: Redis + service health. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
        <Card compact className="p-md space-y-2">
          <div className="flex items-center gap-sm text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="w-3.5 h-3.5" /> Infrastructure
          </div>
          <div className="flex items-center gap-sm text-sm">
            {data.redis.ok ? (
              <CheckCircle2 className="w-4 h-4 text-primary" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
            Redis{' '}
            {data.redis.ok ? (
              <span className="text-muted-foreground">
                · {data.redis.latencyMs} ms
              </span>
            ) : (
              <span className="text-destructive">
                · {data.redis.error ?? 'unreachable'}
              </span>
            )}
          </div>
        </Card>

        <Card compact className="p-md space-y-2">
          <div className="flex items-center gap-sm text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="w-3.5 h-3.5" /> Services
          </div>
          {downServices.length === 0 ? (
            <div className="flex items-center gap-sm text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              All {data.services.length} services running
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {downServices.map((s) => (
                <ServiceChip key={s.service} s={s} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Price feed connectors + their role (candle vs ticker). Surfaces the
          config that decides whether the ticker feed exists at all. */}
      {connectors.length > 0 ? (
        <section className="space-y-sm">
          <header className="flex items-baseline gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Price feed connectors
            </h2>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
            {connectors.map((c) => (
              <Card key={c.service} compact className="px-md py-sm">
                <div className="flex items-center gap-md">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-sm flex-wrap">
                      <span className="font-semibold text-sm font-mono">
                        {c.service}
                      </span>
                      <Badge
                        variant={c.running ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {c.running ? 'running' : 'stopped'}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        role: {c.role}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      ticker {c.producesTicker ? '✓' : '✗'} · candle{' '}
                      {c.producesCandle ? '✓' : '✗'}
                      {c.exchanges.length
                        ? ` · ${c.exchanges.length} exchange${c.exchanges.length === 1 ? '' : 's'}`
                        : ''}
                    </div>
                  </div>
                  {c.running && c.producesTicker ? (
                    <Radio className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Per-exchange feed liveness. */}
      <section className="space-y-sm">
        <header className="flex items-baseline gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Market-data feeds
          </h2>
          <span className="text-xs text-muted-foreground">
            {feeds.liveCount}/{feeds.perExchange.filter((f) => f.enabled).length}{' '}
            enabled live
          </span>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
          {feeds.perExchange.map((f) => (
            <FeedRow key={f.exchange} f={f} />
          ))}
        </div>
      </section>
    </div>
  );
}
