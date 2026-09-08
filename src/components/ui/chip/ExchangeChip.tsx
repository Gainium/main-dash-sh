import ExchangeIcon from '@/components/widgets/shared/ExchangeIcon';
import { cn } from '@/lib/utils';
import type { ExchangeEnum } from '@/types';
import { formatExchangeProvider, getProviderIcon } from '@/utils/exchangeUtils';
import React, { useMemo } from 'react';
import { Chip } from './chip';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';

/**
 * Returns true when the value looks like a raw UUID or MongoDB ObjectId
 * rather than a human-readable exchange provider name.
 */
const looksLikeId = (value: string): boolean =>
  // Standard UUID:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value) ||
  // MongoDB ObjectId: 24 hex chars
  /^[0-9a-f]{24}$/i.test(value);

interface ExchangeChipProps {
  exchangeId: string;
  displayName?: string;
  provider?: ExchangeEnum;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  chipStyle?: 'solid' | 'outline' | 'ghost' | 'soft';
  showIcon?: boolean;
  /** Render only the icon in a square box (no text) */
  iconOnly?: boolean;
  layout?: 'inline' | 'stacked'; // New prop for layout type
  className?: string;
}

export const ExchangeChip: React.FC<ExchangeChipProps> = ({
  exchangeId,
  displayName,
  size = 'sm',
  chipStyle = 'soft',
  showIcon = true,
  iconOnly = false,
  layout = 'inline',
  className,
  provider,
}) => {
  const { exchanges, isLoading } = useTransformedExchangesFromContext();

  // Resolve the user's account by UUID ONLY.
  //
  // There used to be a `find(ex => ex.provider === exchangeId)` fallback here,
  // so a caller passing a bare provider ("binance") would resolve to whichever
  // account happened to sit first in the user's list. For anyone holding more
  // than one account on the same venue that is a coin flip presented as fact:
  // the chip rendered a real, specific, WRONG account name with no visual hint
  // that it had guessed. Terminal and Grid rows hit exactly this — they never
  // carried `exchangeUUID`, so every one of them was labelled with the user's
  // first account on that venue.
  //
  // A provider is not an account. When we only know the venue we now say only
  // the venue ("Binance") and name no account at all. Do not reintroduce a
  // "best guess" here: pass the real `exchangeUUID`, or accept the venue-only
  // label.
  const userExchange = useMemo(
    () => exchanges.find((ex) => ex.id === exchangeId),
    [exchanges, exchangeId]
  );
  const userCustomName = useMemo(
    () => userExchange?.name,
    [userExchange?.name]
  );

  // True when the exchange lookup failed and the ID looks like a raw UUID/ObjectId.
  // This happens during async IndexedDB rehydration, after cache expiry, or while
  // the API fetch is in-flight.  We never want to render a raw ID to the user.
  const isUnresolved = useMemo(
    () => !userExchange && looksLikeId(exchangeId),
    [userExchange, exchangeId]
  );

  // Use the provider from the found exchange, or fall back to the exchangeId
  const providerForIcon = useMemo(
    () =>
      userExchange?.provider ||
      provider ||
      (isUnresolved ? undefined : exchangeId),
    [userExchange, provider, exchangeId, isUnresolved]
  );
  const icon = useMemo(
    () => getProviderIcon(providerForIcon ?? ''),
    [providerForIcon]
  );

  const formattedProviderInfo = useMemo(
    () =>
      providerForIcon ? formatExchangeProvider(providerForIcon) : 'Exchange\n',
    [providerForIcon]
  );

  const [providerName, exchangeDetails] = useMemo(
    () => formattedProviderInfo.split('\n').map((s) => s.trim()),
    [formattedProviderInfo]
  );

  const inlineLabel = useMemo(() => {
    // While the exchange UUID hasn't been resolved yet, show a generic placeholder
    if (isUnresolved) {
      return isLoading ? 'Loading…' : 'Exchange';
    }

    if (userCustomName) {
      return `${userCustomName} • ${providerName} ${exchangeDetails}`;
    }

    if (displayName) {
      return `${displayName} • ${exchangeDetails}`;
    }

    return `${providerName} ${exchangeDetails}`;
  }, [
    displayName,
    exchangeDetails,
    isLoading,
    isUnresolved,
    providerName,
    userCustomName,
  ]);

  const stackedSecondaryLine = useMemo(() => {
    if (userCustomName) {
      return `${providerName} ⟡ ${exchangeDetails}`;
    }

    return exchangeDetails;
  }, [exchangeDetails, providerName, userCustomName]);
  const boxSizeMap = useMemo(
    () =>
      cn(
        size === 'xs' && 'w-6 h-6',
        size === 'sm' && 'w-7 h-7',
        size === 'md' && 'w-8 h-8',
        size === 'lg' && 'w-9 h-9',
        size === 'xl' && 'w-10 h-10'
      ),
    [size]
  );

  if (layout === 'stacked') {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        {/* Column 1: Icon (bigger size) */}
        {showIcon && (
          <ExchangeIcon
            icon={icon}
            size={cn(
              size === 'xs' && 'w-6 h-6',
              size === 'sm' && 'w-7 h-7',
              size === 'md' && 'w-8 h-8',
              size === 'lg' && 'w-9 h-9',
              size === 'xl' && 'w-10 h-10'
            )}
          />
        )}

        {/* Column 2: User's custom name (top) and provider name (bottom) stacked */}
        <div className="flex flex-col min-w-0">
          <span
            className={cn(
              'font-medium text-foreground truncate',
              size === 'xs' && 'text-xs',
              size === 'sm' && 'text-sm',
              size === 'md' && 'text-sm',
              size === 'lg' && 'text-base',
              size === 'xl' && 'text-lg'
            )}
          >
            {isUnresolved
              ? isLoading
                ? 'Loading…'
                : 'Exchange'
              : userCustomName || providerName || exchangeId}
          </span>
          {stackedSecondaryLine && (
            <span
              className={cn(
                'text-muted-foreground truncate',
                size === 'xs' && 'text-xs',
                size === 'sm' && 'text-xs',
                size === 'md' && 'text-xs',
                size === 'lg' && 'text-sm',
                size === 'xl' && 'text-sm'
              )}
            >
              {stackedSecondaryLine}
            </span>
          )}
        </div>
      </div>
    );
  }
  // iconOnly: render only the exchange icon in a square box matching BotTypeChip icon-only sizing
  if (iconOnly) {
    return (
      <div
        className={cn(
          'rounded-lg flex items-center justify-center',
          boxSizeMap,
          className
        )}
      >
        <ExchangeIcon icon={icon} size={boxSizeMap} />
      </div>
    );
  }

  // Default inline layout
  return (
    <Chip
      variant="default"
      size={size}
      chipStyle={chipStyle}
      className={cn('max-w-full min-w-0 text-muted-foreground', className)}
    >
      {showIcon && (
        <ExchangeIcon
          className="shrink-0"
          icon={icon}
          size={cn(
            size === 'xs' && 'w-6 h-6',
            size === 'sm' && 'w-7 h-7',
            size === 'md' && 'w-8 h-8',
            size === 'lg' && 'w-9 h-9',
            size === 'xl' && 'w-10 h-10'
          )}
        />
      )}
      <span className="min-w-0 truncate">{inlineLabel}</span>
    </Chip>
  );
};
