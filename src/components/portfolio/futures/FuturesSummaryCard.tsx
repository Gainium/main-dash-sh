import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import ExchangeIcon from '@/components/widgets/shared/ExchangeIcon';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';
import { getProviderIcon } from '@/utils/exchangeUtils';

import type { FuturesSummary } from './futuresSummary';
import { useFuturesSummary } from './useFuturesSummary';

export const POSITIONS_HREF = '/terminal?view=positions';

const usd = (v: number, signed = false) => {
  const abs = Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (!signed) return `${v < 0 ? '−' : ''}$${abs}`;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}$${abs}`;
};

const tone = (v: number | null) =>
  v === null || v === 0 ? '' : v > 0 ? 'text-profit' : 'text-loss';

function Money({
  value,
  signed = false,
  colored = false,
}: {
  value: number | null;
  signed?: boolean;
  colored?: boolean;
}) {
  const privacyMode = useUIStore((s) => s.privacyMode);
  if (privacyMode) return <span>***</span>;
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('tabular-nums', colored && tone(value))}>
      {usd(value, signed)}
    </span>
  );
}

const pct = (v: number, scale: number) =>
  scale > 0 ? `${Math.min(50, (Math.abs(v) / scale) * 50)}%` : '0%';

/**
 * One exposure row. The bar diverges from the centre: faint long (right) and
 * faint short (left) totals behind a solid net. Without `long`/`short` (the
 * "Other" sum) or with `showBar` false, only the value is shown.
 */
function ExposureLine({
  label,
  sides,
  row,
  scale,
  showBar = true,
  total = false,
}: {
  label: React.ReactNode;
  /** Captions under the bar: short under the left half, long under the right. */
  sides?: { short: React.ReactNode; long: React.ReactNode };
  row: { net: number; long?: number; short?: number };
  scale: number;
  /** False for the "Other" sum: it would dwarf every single asset (§2.3.3). */
  showBar?: boolean;
  total?: boolean;
}) {
  return (
    <div
      data-testid="exposure-row"
      data-total={total ? 'true' : undefined}
      className={cn(
        'grid grid-cols-[5rem_minmax(0,1fr)_7rem] sm:grid-cols-[9rem_minmax(0,1fr)_7rem] items-center gap-xs text-sm py-0.5',
        total && 'font-medium'
      )}
    >
      <div className="min-w-0 truncate">{label}</div>
      {!showBar ? (
        <div aria-hidden="true" />
      ) : (
        <div className="relative h-2.5 rounded-sm bg-card" aria-hidden="true">
          {row.long !== undefined && row.long > 0 && (
            <div
              data-testid="exposure-long"
              className="absolute top-0 h-full bg-profit/25 rounded-r-sm"
              style={{ left: '50%', width: pct(row.long, scale) }}
            />
          )}
          {row.short !== undefined && row.short > 0 && (
            <div
              data-testid="exposure-short"
              className="absolute top-0 h-full bg-loss/25 rounded-l-sm"
              style={{ right: '50%', width: pct(row.short, scale) }}
            />
          )}
          <div
            data-testid="exposure-bar"
            className={cn(
              'absolute top-0 h-full',
              row.net >= 0 ? 'bg-profit rounded-r-sm' : 'bg-loss rounded-l-sm'
            )}
            style={
              row.net >= 0
                ? { left: '50%', width: pct(row.net, scale) }
                : { right: '50%', width: pct(row.net, scale) }
            }
          />
          <div className="absolute inset-y-[-2px] left-1/2 w-px bg-border" />
        </div>
      )}
      <div className="text-right">
        <Money value={row.net} signed colored />
      </div>
      {sides && (
        <>
          <div />
          <div className="flex justify-between gap-xs text-xs font-normal text-muted-foreground">
            <span>{sides.short}</span>
            <span>{sides.long}</span>
          </div>
          <div />
        </>
      )}
    </div>
  );
}

export function FuturesSummaryView({
  summary,
  error,
  isLoading = false,
}: {
  summary: FuturesSummary;
  error: Error | null;
  isLoading?: boolean;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const { rows, total, exposure, openPositions } = summary;
  // Scale to the largest long or short of any single asset; the "Other" sum
  // has no bar and the Total row uses its own scale.
  const scale = Math.max(0, ...exposure.top.map((r) => Math.max(r.long, r.short)));
  const totalScale = Math.max(exposure.grossLong, exposure.grossShort);

  return (
    <section
      className="bg-card text-card-foreground rounded-xl p-md flex flex-col gap-sm min-w-0"
      aria-label="Futures"
    >
      <div className="flex items-center justify-between gap-xs">
        <div className="flex items-center gap-xs">
          <h3 className="text-base font-semibold">Futures</h3>
          {!error && !isLoading && (
            <span className="text-xs text-muted-foreground bg-muted rounded-md px-2 py-0.5">
              {openPositions === 1
                ? '1 open position'
                : `${openPositions} open positions`}
            </span>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={POSITIONS_HREF}>
            Manage in Terminal <ArrowRight />
          </Link>
        </Button>
      </div>

      {error && (
        <p className="text-xs text-muted-foreground" role="status">
          Couldn't load open positions, so unrealized PnL and exposure are
          unavailable.
        </p>
      )}

      <div className="text-sm">
        <div className="hidden sm:grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-xs text-xs text-muted-foreground pb-1">
          <span>Account</span>
          <span className="text-right">Wallet balance</span>
          <span className="text-right">Unrealized PnL</span>
          <span className="text-right">Equity</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            data-testid="futures-account-row"
            className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-x-xs gap-y-0.5 py-1.5 border-t border-border items-center"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <ExchangeIcon icon={getProviderIcon(r.provider)} size="w-4 h-4" />
              <span className="truncate">{r.name}</span>
            </span>
            <span className="hidden sm:block text-right">
              <Money value={r.wallet} />
            </span>
            <span className="hidden sm:block text-right">
              <Money value={r.upnl} signed colored />
            </span>
            <span className="text-right font-medium sm:font-normal">
              <Money value={r.equity} />
            </span>
            <span className="sm:hidden col-span-2 text-xs text-muted-foreground">
              Wallet <Money value={r.wallet} /> · PnL{' '}
              <Money value={r.upnl} signed colored />
            </span>
          </div>
        ))}
        {rows.length > 1 && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-xs py-1.5 border-t border-border font-medium">
            <span>Total</span>
            <span className="hidden sm:block text-right">
              <Money value={total.wallet} />
            </span>
            <span className="hidden sm:block text-right">
              <Money value={total.upnl} signed colored />
            </span>
            <span className="text-right">
              <Money value={total.equity} />
            </span>
          </div>
        )}
      </div>

      {!error && (
        <div
          data-testid="exposure-section"
          className="bg-muted rounded-lg p-sm flex flex-col gap-xs"
        >
          <div className="flex items-baseline justify-between gap-xs flex-wrap">
            <h4 className="text-sm font-semibold">Net exposure</h4>
            <span className="text-xs text-muted-foreground">
              notional at mark · not added to totals
            </span>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading positions…</p>
          ) : openPositions === 0 ? (
            <p className="text-sm text-muted-foreground">No open positions</p>
          ) : exposure.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No live prices for these positions yet
            </p>
          ) : (
            <>
              {exposure.top.map((r) => (
                <ExposureLine key={r.asset} label={r.asset} row={r} scale={scale} />
              ))}
              {exposure.other && (
                <>
                  <ExposureLine
                    label={
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        aria-expanded={otherOpen}
                        onClick={() => setOtherOpen((o) => !o)}
                      >
                        Other {exposure.other.count}
                        {otherOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    }
                    row={exposure.other}
                    scale={scale}
                    showBar={false}
                  />
                  {otherOpen && (
                    <div className="pl-sm" data-testid="futures-exposure-other">
                      {exposure.other.rows.map((r) => (
                        <ExposureLine
                          key={r.asset}
                          label={
                            <span className="text-muted-foreground">{r.asset}</span>
                          }
                          row={r}
                          scale={scale}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="border-t border-border/60 mt-1 pt-1">
                <ExposureLine
                  total
                  label="Total"
                  sides={{
                    short: (
                      <>
                        Short <Money value={exposure.grossShort} />
                      </>
                    ),
                    long: (
                      <>
                        Long <Money value={exposure.grossLong} />
                      </>
                    ),
                  }}
                  row={{
                    net: exposure.net,
                    long: exposure.grossLong,
                    short: exposure.grossShort,
                  }}
                  scale={totalScale}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Read-only futures summary on the Portfolio page: per-account wallet /
 * unrealized PnL / equity and net exposure. Positions are managed in the
 * terminal; this card only links there. Follows the My Accounts selection
 * like the other Portfolio widgets, and renders nothing when that selection
 * (or the user) has no futures account.
 */
export default function FuturesSummaryCard() {
  const { hasSelectedFutures, summary, error, isLoading } = useFuturesSummary();
  if (!hasSelectedFutures) return null;
  return (
    <FuturesSummaryView summary={summary} error={error} isLoading={isLoading} />
  );
}
