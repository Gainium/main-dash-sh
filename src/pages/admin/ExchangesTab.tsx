import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ExchangeEnum } from '@/types/exchange.types';
import { CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAdminExchanges, useAdminSetExchanges } from './useAdminApi';

// Group variants visually so the operator can disable e.g. all Binance
// futures without scanning a flat list. Variants are pulled from
// ExchangeEnum so the strings written to Redis are exactly the wire
// values the connectors check against — keying off the TS enum names
// instead would silently desync for entries where the enum key differs
// from its value (e.g. `bybitCoinm` = `'bybitInverse'`).
const GROUPS: { label: string; variants: ExchangeEnum[]; hint?: string }[] = [
  {
    label: 'Binance',
    variants: [
      ExchangeEnum.binance,
      ExchangeEnum.binanceUS,
      ExchangeEnum.binanceUsdm,
      ExchangeEnum.binanceCoinm,
    ],
    hint: 'Spot, US-region spot, USD-M perp, Coin-M perp.',
  },
  {
    label: 'KuCoin',
    variants: [
      ExchangeEnum.kucoin,
      ExchangeEnum.kucoinLinear,
      ExchangeEnum.kucoinInverse,
    ],
    hint: 'Spot, linear futures, inverse futures.',
  },
  {
    label: 'Bybit',
    variants: [
      ExchangeEnum.bybit,
      ExchangeEnum.bybitUsdm,
      ExchangeEnum.bybitCoinm,
    ],
    hint: 'Spot, USD-M perp (linear), Coin-M perp (inverse).',
  },
  {
    label: 'OKX',
    variants: [
      ExchangeEnum.okx,
      ExchangeEnum.okxLinear,
      ExchangeEnum.okxInverse,
    ],
    hint: 'Spot, USD-M swap, Coin-M swap.',
  },
  {
    label: 'Bitget',
    variants: [
      ExchangeEnum.bitget,
      ExchangeEnum.bitgetUsdm,
      ExchangeEnum.bitgetCoinm,
    ],
    hint: 'Spot, USD-M perp, Coin-M perp.',
  },
  {
    label: 'Hyperliquid',
    variants: [ExchangeEnum.hyperliquid, ExchangeEnum.hyperliquidLinear],
    hint: 'Spot, perp.',
  },
  {
    label: 'Kraken',
    variants: [ExchangeEnum.kraken, ExchangeEnum.krakenUsdm],
    hint: 'Spot, USD-M perp.',
  },
  {
    label: 'Coinbase',
    variants: [ExchangeEnum.coinbase],
  },
];

export function ExchangesTab() {
  const { data, isLoading, error, refetch } = useAdminExchanges();
  const save = useAdminSetExchanges();

  const [draft, setDraft] = useState<Set<string> | null>(null);

  const known = useMemo<readonly string[]>(
    () => data?.known ?? [],
    [data?.known]
  );

  useEffect(() => {
    if (!data) return;
    setDraft(new Set(data.enabled === null ? known : data.enabled));
  }, [data, known]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const server = new Set(data.enabled ?? known);
    if (server.size !== draft.size) return true;
    for (const v of draft) if (!server.has(v)) return true;
    return false;
  }, [data, draft, known]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-lg text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading exchange config…
      </div>
    );
  }

  if (error) {
    return (
      <Card compact className="p-md text-destructive">
        Failed to load exchange config: {(error as Error).message}
        <div className="">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  function toggle(name: string) {
    setDraft((prev) => {
      const next = new Set(prev ?? known);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleGroup(variants: string[]) {
    setDraft((prev) => {
      const next = new Set(prev ?? known);
      const allOn = variants.every((v) => next.has(v));
      for (const v of variants) {
        if (allOn) next.delete(v);
        else next.add(v);
      }
      return next;
    });
  }

  async function onSave() {
    if (!draft) return;
    const enabled =
      draft.size === known.length ? null : Array.from(draft).sort();
    await save.mutateAsync(enabled);
  }

  function onReset() {
    if (!data) return;
    setDraft(data.enabled === null ? new Set(known) : new Set(data.enabled));
  }

  const enabledCount = draft?.size ?? 0;

  return (
    <div className="space-y-lg">
      <Card
        compact
        className="p-md flex items-start gap-sm text-sm text-muted-foreground"
      >
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <div className="space-y-1">
          <div>
            Disabling an exchange tells the connectors to stop opening WS
            streams and rejects exchange-connector calls with 503.
          </div>
          <div className="text-xs">
            Changes take effect on save — no recompose needed.{' '}
            <span className="font-medium">{enabledCount}</span> of{' '}
            <span className="font-medium">{known.length}</span> variants
            enabled.
          </div>
        </div>
      </Card>

      <div className="space-y-md">
        {GROUPS.map((group) => {
          const variants = group.variants.filter((v) => known.includes(v));
          if (!variants.length) return null;
          const allOn = variants.every((v) => draft?.has(v));
          const someOn = variants.some((v) => draft?.has(v));
          return (
            <Card key={group.label} compact className="px-md py-sm">
              <div className="flex items-center justify-between gap-sm">
                <div>
                  <div className="font-semibold text-sm">{group.label}</div>
                  {group.hint ? (
                    <div className="text-xs text-muted-foreground">
                      {group.hint}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline shrink-0"
                  onClick={() => toggleGroup(variants)}
                >
                  {allOn
                    ? 'Disable all'
                    : someOn
                      ? 'Enable rest'
                      : 'Enable all'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-sm">
                {variants.map((v) => (
                  <label
                    key={v}
                    className="flex items-center gap-sm cursor-pointer rounded-md px-2 py-1 hover:bg-inner-container"
                  >
                    <Checkbox
                      checked={draft?.has(v) ?? false}
                      onCheckedChange={() => toggle(v)}
                    />
                    <span className="text-sm font-mono truncate">{v}</span>
                  </label>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-sm sticky bottom-0 py-sm bg-background/95 backdrop-blur border-t px-lg">
        <Button onClick={onSave} disabled={!dirty || save.isPending}>
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : null}
          Save
        </Button>
        <Button variant="outline" onClick={onReset} disabled={!dirty}>
          Reset
        </Button>
        {save.isSuccess && !dirty ? (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Saved.
          </span>
        ) : null}
        {save.error ? (
          <span className="text-sm text-destructive">
            {(save.error as Error).message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
