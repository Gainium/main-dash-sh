import React from 'react';
import { WalletCards } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExchangesStore } from '@/stores/exchangesStore';
import { useHyperliquidRenewStore } from '@/stores/hyperliquidRenewStore';
import { agentRenewal, isLiveHyperliquid } from '@/utils/hyperliquidRenewal';
import { Tooltip } from '../tooltip';
import { Chip } from './chip';

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

interface HyperliquidAgentChipProps {
  /** Connection uuid; the chip reads the rest from the exchanges store. */
  uuid: string;
  size?: 'xs' | 'sm' | 'md';
  /** Icon only, for dense rows like the Portfolio accounts list. */
  compact?: boolean;
  className?: string;
}

/**
 * Hyperliquid API-wallet expiry marker. `Renew wallet` (error) once the agent
 * has expired — the bots on it cannot trade — and `Expires in N d` (warning)
 * in the last two weeks. Renders nothing otherwise, and nothing for any other
 * exchange. Click opens the renewal dialog.
 */
export const HyperliquidAgentChip: React.FC<HyperliquidAgentChipProps> = ({
  uuid,
  size = 'xs',
  compact = false,
  className,
}) => {
  const exchange = useExchangesStore((s) => s.exchanges[uuid]);
  const open = useHyperliquidRenewStore((s) => s.open);
  if (!exchange || !isLiveHyperliquid(exchange.provider)) return null;
  const renewal = agentRenewal(exchange.hlAgent, Date.now());
  if (renewal.status === 'ok') return null;

  const expired = renewal.status === 'expired';
  const label = expired ? 'Renew wallet' : `Expires in ${renewal.daysLeft}d`;
  const tooltip = expired
    ? `This connection's Hyperliquid API wallet expired on ${formatDate(renewal.expiresAt)}, so Hyperliquid refuses its bots' orders. Renew it with one signature in your wallet; the bots resume on their own.`
    : `This connection's Hyperliquid API wallet expires on ${formatDate(renewal.expiresAt)}. Renew it now with one signature in your wallet and the bots keep running without a break.`;
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    open(uuid);
  };
  const tone = expired ? 'error' : 'warning';

  const body = compact ? (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full cursor-pointer transition-colors',
        expired
          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          : 'bg-warning/10 text-warning hover:bg-warning/20',
        size === 'xs' ? 'w-4 h-4' : 'w-5 h-5',
        className
      )}
      role="button"
      aria-label={`${label}. ${tooltip}`}
      onClick={onClick}
    >
      <WalletCards className={size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
    </span>
  ) : (
    <Chip
      variant={tone}
      chipStyle="soft"
      size={size}
      className={cn(
        'gap-1 shrink-0 whitespace-nowrap cursor-pointer transition-colors',
        expired ? 'hover:bg-destructive/20' : 'hover:bg-warning/20',
        className
      )}
      role="button"
      aria-label={`${label}. ${tooltip}`}
      onClick={onClick}
    >
      <WalletCards className="w-3 h-3" />
      {label}
    </Chip>
  );

  return <Tooltip tooltip={tooltip}>{body}</Tooltip>;
};
