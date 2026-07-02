import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useQuantRulesStatus,
  type ActiveQuantRulesCooldown,
} from '@/hooks/useQuantRulesStatus';
import { useExchangesStore } from '@/stores/exchangesStore';
import { formatDuration } from '@/utils/formatters';

const LEARN_MORE_URL =
  'https://www.binance.com/en/support/faq/4f462ebe6ff445d4a170be7d9e897272';

// localStorage key holding the max `untilMs` the user last dismissed. The
// banner reappears automatically once a NEW (further-reaching) cooldown starts,
// because that raises the max above the dismissed value.
const DISMISS_KEY = 'quantRulesBannerDismissedUntil';

function readDismissedUntil(): number {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

function formatRemaining(untilMs: number): string {
  const delta = untilMs - Date.now();
  if (delta <= 0) return 'shortly';
  return formatDuration(delta);
}

const QuantRulesBanner = () => {
  const { cooldowns, hasActive } = useQuantRulesStatus();
  const getExchange = useExchangesStore((s) => s.getExchange);
  const [expanded, setExpanded] = useState(false);

  // The furthest-reaching active expiry — the identity of the current cooldown
  // "window" for dismiss purposes.
  const maxUntil = useMemo(
    () => cooldowns.reduce((m, c) => Math.max(m, c.untilMs), 0),
    [cooldowns]
  );

  const [dismissedUntil, setDismissedUntil] = useState<number>(() =>
    readDismissedUntil()
  );

  const resolveAccountName = (uuid: string | null): string => {
    if (!uuid) return 'Binance';
    const ex = getExchange(uuid);
    return ex?.name || 'Binance';
  };

  if (!hasActive) return null;
  // Dismissed for this (or a longer) window already — stay hidden until a new
  // cooldown pushes maxUntil past what was dismissed.
  if (maxUntil > 0 && dismissedUntil >= maxUntil) return null;

  const onDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(maxUntil));
    } catch {
      // ignore persistence failures — banner just re-shows next mount
    }
    setDismissedUntil(maxUntil);
  };

  const accountCooldowns = cooldowns.filter(
    (c) => c.scope === 'account' || c.symbol == null
  );
  const symbolCooldowns = cooldowns.filter(
    (c) => c.scope !== 'account' && c.symbol != null
  );

  const accountWide = accountCooldowns[0];

  return (
    <div className="flex flex-wrap items-start justify-between gap-sm text-warning bg-warning/10 border-b border-warning/20 px-md py-xs">
      <div className="flex items-start gap-xs min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="min-w-0">
          {accountWide ? (
            <AccountWideBody
              cooldown={accountWide}
              accountName={resolveAccountName(accountWide.exchangeUUID)}
            />
          ) : (
            <SymbolBody
              cooldowns={symbolCooldowns}
              accountName={resolveAccountName(
                symbolCooldowns[0]?.exchangeUUID ?? null
              )}
              expanded={expanded}
              onToggle={() => setExpanded((v) => !v)}
              resolveAccountName={resolveAccountName}
            />
          )}
          <div className="text-xs opacity-90 mt-0.5">
            <a
              href={LEARN_MORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline hover:opacity-100"
            >
              Learn more
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 hover:bg-warning/20 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

function AccountWideBody({
  cooldown,
  accountName,
}: {
  cooldown: ActiveQuantRulesCooldown;
  accountName: string;
}) {
  return (
    <>
      <div className="font-semibold text-sm">
        {accountName}: Binance temporarily restricted this futures account to
        reduce-only
      </div>
      <div className="text-xs opacity-90">
        Binance Quantitative Rules (level {cooldown.level ?? 3}). New and
        position-increasing orders are paused until{' '}
        {formatTime(cooldown.untilMs)} (~{formatRemaining(cooldown.untilMs)});
        bots resume automatically. Closing or reducing positions still works.
      </div>
    </>
  );
}

function SymbolBody({
  cooldowns,
  accountName,
  expanded,
  onToggle,
  resolveAccountName,
}: {
  cooldowns: ActiveQuantRulesCooldown[];
  accountName: string;
  expanded: boolean;
  onToggle: () => void;
  resolveAccountName: (uuid: string | null) => string;
}) {
  const symbols = cooldowns
    .map((c) => c.symbol)
    .filter((s): s is string => !!s);
  const shown = symbols.slice(0, 3);
  const extra = symbols.length - shown.length;
  const symbolList =
    shown.join(', ') + (extra > 0 ? `, +${extra} more` : '');
  // Latest expiry across the symbol cooldowns.
  const latestUntil = cooldowns.reduce((m, c) => Math.max(m, c.untilMs), 0);

  return (
    <>
      <div className="font-semibold text-sm">
        Binance Quantitative Rules cooldown on {accountName}
      </div>
      <div className="text-xs opacity-90">
        {symbols.length} symbol{symbols.length === 1 ? '' : 's'} restricted (
        {symbolList}) until {formatTime(latestUntil)}. New orders on{' '}
        {symbols.length === 1 ? 'this symbol' : 'those symbols'} are delayed and
        resume automatically; closing positions still works.{' '}
        {cooldowns.length > 0 && (
          <button
            type="button"
            onClick={onToggle}
            className="underline hover:opacity-100"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        )}
      </div>
      {expanded && (
        <ul className="text-xs opacity-90 mt-0.5 space-y-0.5">
          {cooldowns.map((c, i) => (
            <li key={`${c.exchangeUUID}:${c.symbol}:${i}`}>
              <span className="font-medium">{c.symbol}</span>
              {' — '}
              {resolveAccountName(c.exchangeUUID)} · level {c.level ?? '?'} ·
              until {formatTime(c.untilMs)} (~{formatRemaining(c.untilMs)})
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default QuantRulesBanner;
