import { cn } from '@/lib/utils';
import { ExchangeEnum } from '@/types/exchange.types';
import { KeyRound } from 'lucide-react';
import React from 'react';
import { Tooltip } from '../tooltip';
import { Chip } from './chip';

/**
 * "Replace key" marker for an exchange connection whose API key the operator
 * has asked the user to replace and which has not been replaced yet.
 *
 * Deliberately a `warning` soft chip and not an `error` one. Nothing is broken:
 * the connection works, the bots attached to it keep running, and the user is
 * being asked to do maintenance — not told their account has failed. Reading as
 * an outage would be both wrong and needlessly alarming.
 *
 * The chip disappears on its own the moment the credential is replaced; the
 * server recomputes `rotationRequired` from the stored flag on every read.
 */

const HELP_URL = 'https://gainium.io/help/enhancing-security';

const isHyperliquid = (provider?: string): boolean =>
  !!provider && provider.toLowerCase().startsWith(ExchangeEnum.hyperliquid);

/**
 * Hyperliquid has no API key to recreate and no IP allowlist — the Connect Web3
 * Wallet button swaps the agent wallet in place — so sending those users after
 * "read and trade permissions" would point them at a screen that does not
 * exist. Same split as the notification copy.
 */
const tooltipFor = (provider?: string): string =>
  isHyperliquid(provider)
    ? 'This key was connected before 31 July, when we detected unauthorised access to one of our servers. Edit the connection and click Connect Web3 Wallet again — your previous agent wallet is replaced automatically and your bots keep running.'
    : `This key was connected before 31 July, when we detected unauthorised access to one of our servers. Create a new key on your exchange with read and trade permissions only, then EDIT this connection with it — don't delete it, that stops the bots attached to it. Full steps: ${HELP_URL}`;

interface RotationChipProps {
  /** Nothing renders when false — callers can pass the flag straight through. */
  rotationRequired?: boolean;
  provider?: string;
  size?: 'xs' | 'sm' | 'md';
  /** Icon only, for dense rows like the Portfolio accounts list. */
  compact?: boolean;
  className?: string;
  /** Usually opens the edit dialog for this connection. */
  onClick?: (e: React.MouseEvent) => void;
}

export const RotationChip: React.FC<RotationChipProps> = ({
  rotationRequired,
  provider,
  size = 'xs',
  compact = false,
  className,
  onClick,
}) => {
  if (!rotationRequired) return null;

  const tooltip = tooltipFor(provider);
  const label = 'Replace key';
  // The tooltip carries the instructions, so the visible chip must still stand
  // alone for anyone who never hovers (and for screen readers).
  const aria = `${label}. ${tooltip}`;

  const body = compact ? (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full',
        'bg-warning/10 text-warning',
        size === 'xs' ? 'w-4 h-4' : 'w-5 h-5',
        onClick && 'cursor-pointer hover:bg-warning/20 transition-colors',
        className
      )}
      role={onClick ? 'button' : 'img'}
      aria-label={aria}
      onClick={onClick}
    >
      <KeyRound className={size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
    </span>
  ) : (
    <Chip
      variant="warning"
      chipStyle="soft"
      size={size}
      className={cn(
        'gap-1 shrink-0',
        onClick && 'cursor-pointer hover:bg-warning/20 transition-colors',
        className
      )}
      role={onClick ? 'button' : undefined}
      aria-label={aria}
      onClick={onClick}
    >
      <KeyRound className="w-3 h-3" />
      {label}
    </Chip>
  );

  return <Tooltip tooltip={tooltip}>{body}</Tooltip>;
};
