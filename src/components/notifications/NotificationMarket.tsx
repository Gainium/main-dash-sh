import { ExchangeChip } from '@/components/ui/chip/ExchangeChip';
import CoinPair from '@/components/widgets/shared/CoinPair';
import type { ExchangeEnum } from '@/types/exchange.types';
import React from 'react';

/**
 * Pair + exchange of a bot notification, in the same visual language as bot
 * cards: the coin-pair icon with its ticker, then the exchange chip. Bot
 * messages carry the venue (`exchange`) but not the account UUID, so the chip
 * names the venue only — see ExchangeChip on why it must not guess an account.
 */
export const NotificationMarket: React.FC<{
  symbol?: string | undefined;
  exchange?: string | undefined;
}> = ({ symbol, exchange }) => {
  if (!symbol && !exchange) return null;
  return (
    <div className="flex flex-wrap items-center gap-sm">
      {symbol && <CoinPair pair={symbol} iconSize="sm" showText layout="horizontal" />}
      {exchange && (
        <ExchangeChip
          exchangeId={exchange}
          provider={exchange as ExchangeEnum}
          size="xs"
          chipStyle="soft"
        />
      )}
    </div>
  );
};

export default NotificationMarket;
