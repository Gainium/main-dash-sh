import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ExchangeIcon from '@/components/widgets/shared/ExchangeIcon';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import type { BotFormMode, BotFormUpdateValue, Fields } from '@/features/bots';
import type { ExchangeInUser } from '@/types';
import { ExchangeEnum, OKXSource } from '@/types/exchange.types';
import type { BotFormData } from '@/types/bots';
import { getProviderIcon, isFuturesExchange } from '@/utils/exchangeUtils';
import { useLocalUserSettingsStore } from '@/stores/localUserSettingsStore';
import { useIsBetaUser } from '@/hooks/useIsBetaUser';
import { cn } from '@/lib/utils';
import { Star } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

type ExchangeSelectorProps = {
  isExchangeLocked: boolean;
  currentExchange: ExchangeInUser | null;
  formData: BotFormData;
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  exchangesLoading?: boolean;
  exchangesData: ExchangeInUser[] | undefined;
  tooltip?: string;
  tooltipURL?: string;
  mode: BotFormMode;
  /**
   * Disable futures-provider exchange options (terminal Simple deal type is
   * spot-only — legacy getOptionDisabled, TerminalBotSettings.tsx:857-860).
   * Defaults to false so all other callers are unaffected.
   */
  disableFutures?: boolean;
};

const ExchangeSelector = ({
  isExchangeLocked,
  currentExchange,
  formData,
  updateFormData,
  exchangesLoading,
  exchangesData,
  tooltip,
  tooltipURL,
  mode,
  disableFutures = false,
}: ExchangeSelectorProps) => {
  const defaultExchangeUuid = useLocalUserSettingsStore(
    (s) => s.settings.defaultExchangeUuid
  );
  const setDefaultExchangeUuid = useLocalUserSettingsStore(
    (s) => s.setDefaultExchangeUuid
  );
  const exchangeDisplayName = useMemo(
    () =>
      currentExchange?.name || currentExchange?.provider || 'Unknown exchange',
    [currentExchange?.name, currentExchange?.provider]
  );
  const formatUsdAmount = useCallback((value?: number) => {
    if (!value || Number.isNaN(value)) {
      return null;
    }
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    })}`;
  }, []);

  // OKX Europe (my.okx.com) linear futures are the X-Perps — in BETA, so
  // okxLinear EU accounts show only for the 'Alpha' group. The EU venue has
  // no coin-margined product, so a legacy okxInverse+EU sub-account stays
  // hidden for everyone. Never hide the one already selected, so an existing
  // bot pinned to it resolves. Drop the beta filter at GA.
  const okxEuFuturesAllowed = useIsBetaUser();
  const visibleExchanges = useMemo(() => {
    const hiddenEuProviders = okxEuFuturesAllowed
      ? [ExchangeEnum.okxInverse]
      : [
          ExchangeEnum.okxInverse,
          ExchangeEnum.okxLinear,
          ExchangeEnum.paperOkxInverse,
          ExchangeEnum.paperOkxLinear,
        ];
    return exchangesData?.filter(
      (exchange) =>
        exchange.uuid === currentExchange?.uuid ||
        !(
          exchange.okxSource === OKXSource.my &&
          hiddenEuProviders.includes(exchange.provider)
        )
    );
  }, [exchangesData, currentExchange?.uuid, okxEuFuturesAllowed]);

  // The uuid we last auto-dispatched. `updateFormData` writes to the bot-form
  // store asynchronously, so between the dispatch and `formData.exchangeUUID`
  // reflecting it the effect can re-run (Smart Terminal re-renders on every
  // price tick, and `visibleExchanges`/`updateFormData` are fresh identities
  // each render). Without this in-flight latch the effect would re-dispatch
  // the SAME selection on every one of those interim renders — the React #185
  // "maximum update depth exceeded" loop reported on /terminal?dealType=smart.
  const pendingSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'create') {
      return;
    }
    if (isExchangeLocked) {
      return;
    }
    // The current selection is already valid — nothing to auto-pick. Clear the
    // latch so a genuine future re-selection (e.g. the selected exchange gets
    // deleted) can dispatch again.
    if (formData.exchangeUUID) {
      const isExistExchange = visibleExchanges?.find(
        (exchange) => exchange.uuid === formData.exchangeUUID
      );
      if (isExistExchange) {
        pendingSelectionRef.current = null;
        return;
      }
    }
    if (!visibleExchanges?.length) {
      return;
    }
    // Honor the user's chosen default exchange (the starred one) when it
    // still exists, regardless of recency.
    let target: string | undefined;
    if (defaultExchangeUuid) {
      const preferred = visibleExchanges.find(
        (exchange) => exchange.uuid === defaultExchangeUuid
      );
      if (preferred) {
        target = preferred.uuid;
      }
    }
    if (!target) {
      // No (or stale) persisted exchange — pick the most-recently-active one
      // by `lastUpdated`. Falls back to the last entry in the list (most
      // exchange APIs append new accounts), then to the first as a last
      // resort. This avoids the common case where the API returns the
      // user's oldest exchange (e.g. Hyperliquid) first and it gets stuck
      // as the default forever.
      const sortedByRecency = [...visibleExchanges].sort((a, b) => {
        const aT = typeof a.lastUpdated === 'number' ? a.lastUpdated : -1;
        const bT = typeof b.lastUpdated === 'number' ? b.lastUpdated : -1;
        return bT - aT;
      });
      const fallback =
        sortedByRecency[0]?.lastUpdated !== undefined
          ? sortedByRecency[0]
          : visibleExchanges[visibleExchanges.length - 1];
      target = fallback?.uuid;
    }
    if (!target) {
      return;
    }
    // Idempotency guard: never re-dispatch a selection that is already the
    // current value or one we just dispatched and are still waiting to see
    // reflected in `formData`. This is what converges the effect and stops the
    // update-depth loop under unstable `visibleExchanges`/`updateFormData`
    // identities.
    if (target === formData.exchangeUUID || target === pendingSelectionRef.current) {
      return;
    }
    pendingSelectionRef.current = target;
    updateFormData('exchangeUUID', target);
  }, [
    mode,
    isExchangeLocked,
    formData.exchangeUUID,
    visibleExchanges,
    updateFormData,
    defaultExchangeUuid,
  ]);

  return (
    <SettingsRow name="Exchange" tooltip={tooltip} tooltipURL={tooltipURL}>
      <div className="space-y-sm">
        {isExchangeLocked ? (
          <div className="flex items-center gap-xs rounded-lg bg-muted px-3 py-2">
            {!formData.exchangeUUID ? (
              <div className="flex items-center gap-xs">
                <div className="w-5 h-5 bg-muted rounded-sm flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">?</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  No exchange set
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-xs">
                <ExchangeIcon
                  icon={getProviderIcon(currentExchange?.provider ?? '')}
                  size="w-5 h-5"
                />
                <span
                  className="text-sm font-medium truncate"
                  title={exchangeDisplayName}
                >
                  {exchangeDisplayName}
                </span>
              </div>
            )}
          </div>
        ) : (
          <Select
            value={currentExchange?.uuid || ''}
            onValueChange={(value) => updateFormData('exchangeUUID', value)}
            disabled={!!exchangesLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  exchangesLoading ? 'Loading exchanges...' : 'Select exchange'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {visibleExchanges?.map((exchange) => {
                const balanceValue =
                  typeof exchange.balance === 'number' &&
                  Number.isFinite(exchange.balance)
                    ? exchange.balance
                    : undefined;
                const balanceLabel =
                  typeof balanceValue === 'number'
                    ? formatUsdAmount(balanceValue)
                    : null;
                const providerIcon = getProviderIcon(exchange.provider ?? '');
                const optionDisabled =
                  disableFutures && isFuturesExchange(exchange.provider ?? '');
                const isDefault = exchange.uuid === defaultExchangeUuid;

                return (
                  <SelectItem
                    key={exchange.uuid}
                    value={exchange.uuid}
                    disabled={optionDisabled}
                  >
                    <div className="flex items-center justify-between gap-sm">
                      <div className="flex items-center gap-xs min-w-0">
                        <ExchangeIcon
                          icon={providerIcon}
                          size="w-5 h-5"
                          className="shrink-0"
                        />
                        <span className="truncate">
                          {exchange.name || exchange.provider}
                        </span>
                      </div>
                      <div className="flex items-center gap-xs">
                        {balanceLabel && (
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {balanceLabel}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={
                            isDefault
                              ? 'Remove as default exchange'
                              : 'Set as default exchange'
                          }
                          aria-pressed={isDefault}
                          title={
                            isDefault
                              ? 'Default exchange — new bots start here'
                              : 'Set as default exchange'
                          }
                          // Toggle the default without selecting the item or
                          // closing the dropdown (Radix selects on pointer-up).
                          onPointerDown={(e) => e.stopPropagation()}
                          onPointerUp={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setDefaultExchangeUuid(exchange.uuid);
                          }}
                          className={cn(
                            'shrink-0 rounded-md p-1 transition-all hover:bg-foreground/10',
                            isDefault
                              ? 'opacity-100'
                              : 'opacity-40 hover:opacity-100'
                          )}
                        >
                          <Star
                            className={cn(
                              'size-4',
                              isDefault
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground'
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  </SelectItem>
                );
              })}
              {!visibleExchanges?.length && (
                <SelectItem value="__no-exchanges__" disabled>
                  No exchanges available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        )}
      </div>
    </SettingsRow>
  );
};

export default ExchangeSelector;
