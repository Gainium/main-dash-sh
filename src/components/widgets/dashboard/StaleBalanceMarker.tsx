import { Clock } from 'lucide-react';
import React, { useState } from 'react';

import { useExchangeMutations } from '@/hooks/useExchangeMutations';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';

import type { EnhancedBalanceData } from '../../../types/enhancedBalance.types';
import {
  formatAge,
  isBalanceStale,
} from '../../../utils/balanceStaleness';
import { Button } from '../../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';

/**
 * A small clock next to a balance whose backend row is older than the
 * staleness threshold. Nothing is rendered for a fresh row, or when the
 * backend did not send `updated` at all — a permanent marker would be
 * ignored within a day; one that only appears when something is actually
 * stale is a signal people act on. The popover names when the row was last
 * confirmed and offers the same REST refresh as the Accounts panel, scoped to
 * the row's venue (or every venue for a summed asset). It does not claim the
 * live connection stopped: streams only write a row when its amount changes,
 * so a quiet holding ages past the threshold on a healthy connection too.
 */
export const StaleBalanceMarker: React.FC<{ balance: EnhancedBalanceData }> = ({
  balance,
}) => {
  const [open, setOpen] = useState(false);
  const { updateBalance, isUpdatingBalance } = useExchangeMutations();
  if (!isBalanceStale(balance.updatedAt)) return null;

  const confirmedAt = balance.updatedAt
    ? new Date(balance.updatedAt).toLocaleString()
    : 'unknown';
  const where = balance.exchangeName || balance.exchange || 'the exchange';

  const refresh = async () => {
    try {
      await updateBalance.mutateAsync({
        skipSnapshot: false,
        ...(balance.exchangeUUID ? { uuid: balance.exchangeUUID } : {}),
      });
      toast.success('Balances refreshed');
      setOpen(false);
    } catch (error) {
      logger.error('Stale balance refresh failed:', error);
      toast.error('Could not refresh balances');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-0 h-4 w-4 text-warning"
          aria-label={`Balance last confirmed ${formatAge(balance.updatedAt)}`}
          title={`Last confirmed ${formatAge(balance.updatedAt)} — click for details`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          <Clock className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-xs">
          <h4 className="font-medium text-sm">Balance may be out of date</h4>
          <p className="text-xs text-muted-foreground">
            Last confirmed by {where} {formatAge(balance.updatedAt)} ({confirmedAt}).
            Balances update when the amount changes, so a holding that hasn&apos;t
            moved can show this even while the connection is working. Refresh to
            confirm the latest figure from the exchange.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={isUpdatingBalance}
            onClick={refresh}
          >
            {isUpdatingBalance ? 'Refreshing…' : 'Refresh balance'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default StaleBalanceMarker;
