import { RefreshCw } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MasonryLayout } from '@/components/ui/MasonryLayout';
import { NumberInput } from '@/components/ui/number-input';
import { Tooltip } from '@/components/ui/tooltip';
import CoinPair from '@/components/widgets/shared/CoinPair';
import { CoinFilter } from '@/components/widgets/shared/CoinSelect';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormSelector,
  useBotFormState,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider';
import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import {
  processPairsPaste,
  type ProcessPairsPasteContext,
  type ProcessPairsPasteDependencies,
} from '@/features/bots/bot-types/dca/form/utils/pastePairs';
import { NameInput } from '@/features/bots/shared/components/NameInput';
import { unitAdornment } from '@/features/bots/shared/utils/unit-adornment';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { useGridForm } from '@/hooks/bots/grid/useGridForm';
import { type TradingPair } from '@/hooks/useTradingPairs';
import { cn } from '@/lib/utils';
import { useBalanceStore } from '@/stores/live/balanceStore';
import type { BotFormData, ExchangeBotForm } from '@/types/bots/form';
import {
  resolveExchangeLockState,
  resolvePairsLockState,
} from '@/utils/bots/dca/basic-settings';
import ExchangeSelector from '../../../dca/form/components/exchangeSelector';

const HELPER_TOKEN_PATTERN = /^[A-Z0-9]+_ALL$/u;

interface GridBasicSettingsProps {
  currentExchange: ExchangeBotForm | null;
  exchangesLoading?: boolean | undefined;
  onUpdateBalances?: (() => void) | undefined;
  mode: BotFormMode;
  exchangesData?: ExchangeBotForm[] | undefined;
  /**
   * Quick mode auto-fills `formData.name` from the preset + pair, so
   * the bare NameInput row is hidden. Mirrors DCA's BasicSettings.
   */
  hideName?: boolean;
  /**
   * Quick mode never lets the user set the historical purchase price —
   * grid calibration runs against latestPrice. Hide the row entirely.
   */
  hideInitialPrice?: boolean;
}

const normalizePairInput = (raw: string): string =>
  raw.replace(/[\s\-/]/g, '').toUpperCase();

const KNOWN_QUOTES = [
  'USDT',
  'USDC',
  'BTC',
  'ETH',
  'BNB',
  'BUSD',
  'USDP',
  'USD',
];

const splitPairParts = (raw: string): { base: string; quote: string } => {
  const trimmed = raw?.trim().toUpperCase() ?? '';
  if (!trimmed) {
    return { base: '', quote: '' };
  }

  const explicitSeparatorMatch = trimmed.split(/[-/]/u).filter(Boolean);
  if (explicitSeparatorMatch.length === 2) {
    const [base, quote] = explicitSeparatorMatch;
    return {
      base: base ?? '',
      quote: quote ?? '',
    };
  }

  const normalized = trimmed.replace(/[^A-Z0-9]/g, '');
  const matchedQuote = KNOWN_QUOTES.find(
    (quote) => normalized.length > quote.length && normalized.endsWith(quote)
  );

  if (matchedQuote) {
    return {
      base: normalized.slice(0, normalized.length - matchedQuote.length),
      quote: matchedQuote,
    };
  }

  if (normalized.length > 3) {
    return {
      base: normalized.slice(0, normalized.length - 3),
      quote: normalized.slice(-3),
    };
  }

  return { base: normalized, quote: '' };
};

const toSelectionSymbol = (raw: string): string => {
  const { base, quote } = splitPairParts(raw);
  if (!base) {
    return '';
  }
  return quote ? `${base}-${quote}` : base;
};

export const GridBasicSettings: React.FC<GridBasicSettingsProps> = ({
  currentExchange,
  exchangesLoading,
  mode,
  exchangesData,
  hideName = false,
  hideInitialPrice = false,
}) => {
  const {
    formState: { formData, updateFormData, errors, isFieldLocked, setErrors },
    baseAsset,
    quoteAsset,
  } = useGridForm();
  const [isBalanceLoading, setIsBalanceLoading] = React.useState(
    useBalanceStore.getState().loading
  );
  const [showSpinner, setShowSpinner] = React.useState(false);
  const clickFallbackTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const unsubscribe = useBalanceStore.subscribe((state) => {
      setIsBalanceLoading(state.loading);
    });

    setIsBalanceLoading(useBalanceStore.getState().loading);

    return () => {
      unsubscribe();
      if (clickFallbackTimerRef.current) {
        window.clearTimeout(clickFallbackTimerRef.current);
        clickFallbackTimerRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    let hideTimer: number | null = null;

    if (isBalanceLoading) {
      setShowSpinner(true);
      if (clickFallbackTimerRef.current) {
        window.clearTimeout(clickFallbackTimerRef.current);
        clickFallbackTimerRef.current = null;
      }
    } else if (showSpinner) {
      hideTimer = window.setTimeout(() => {
        setShowSpinner(false);
      }, 600);
    }

    return () => {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
    };
  }, [isBalanceLoading, showSpinner]);

  const pairs = React.useMemo(
    () => (Array.isArray(formData.pair) ? formData.pair : []),
    [formData.pair]
  );

  const { pairsByExchange } = useTradingPairsFromContext();
  const livePairsIndex = React.useMemo(() => {
    const aggregated: Record<string, TradingPair> = {};
    const byExchange: Record<string, Record<string, TradingPair>> = {};

    Object.entries(pairsByExchange ?? {}).forEach(([exchangeName, entries]) => {
      const normalizedExchange = exchangeName.toUpperCase();
      if (!byExchange[normalizedExchange]) {
        byExchange[normalizedExchange] = {};
      }

      entries.forEach((entry) => {
        const base = entry.baseAsset?.name?.toUpperCase?.();
        const quote = entry.quoteAsset?.name?.toUpperCase?.();
        if (!base || !quote) {
          return;
        }
        const key = `${base}${quote}`;
        if (!(key in aggregated)) {
          aggregated[key] = entry;
        }
        if (!(key in byExchange[normalizedExchange])) {
          byExchange[normalizedExchange][key] = entry;
        }
      });
    });

    return { aggregated, byExchange };
  }, [pairsByExchange]);

  const { pairMetadata } = useBotFormQuery();
  const pairMetadataStringRef = React.useRef<string>('');
  const precisionMapStringRef = React.useRef<string>('');

  const isExchangeLocked = React.useMemo(() => {
    return resolveExchangeLockState({
      lockedOverride: isFieldLocked?.('exchangeUUID'),
      mode,
    }).locked;
  }, [isFieldLocked, mode]);

  const isPairsLocked = React.useMemo(() => {
    return resolvePairsLockState({
      externallyLocked: isFieldLocked?.('pair'),
      mode,
      useMulti: false,
    }).locked;
  }, [isFieldLocked, mode]);

  const exchangeProvider = React.useMemo(
    () => currentExchange?.provider,
    [currentExchange]
  );

  const normalizedExchangeProvider = React.useMemo(
    () => exchangeProvider?.toUpperCase?.(),
    [exchangeProvider]
  );

  const scopedFormPairMetadata = React.useMemo(() => {
    const metadata = formData.pairMetadata;
    if (!metadata) {
      return null;
    }

    if (!normalizedExchangeProvider) {
      return metadata;
    }

    const filtered: Record<string, TradingPair> = {};
    Object.entries(metadata).forEach(([key, value]) => {
      const exchangeValue = value?.exchange?.toUpperCase?.();
      if (!exchangeValue || exchangeValue === normalizedExchangeProvider) {
        filtered[key] = value;
      }
    });

    return Object.keys(filtered).length ? filtered : null;
  }, [formData.pairMetadata, normalizedExchangeProvider]);

  const activeLivePairsMap = React.useMemo(() => {
    if (normalizedExchangeProvider) {
      const scoped = livePairsIndex.byExchange[normalizedExchangeProvider];
      if (scoped) {
        return scoped;
      }
    }
    return livePairsIndex.aggregated;
  }, [livePairsIndex, normalizedExchangeProvider]);

  const normalizePair = React.useCallback((pair: string) => {
    return normalizePairInput(pair);
  }, []);

  const normalizeAssetSymbol = React.useCallback((value?: string | null) => {
    if (!value) {
      return undefined;
    }
    const normalized = value.toString().trim().toUpperCase();
    return normalized && normalized !== '?' ? normalized : undefined;
  }, []);

  const resolvePairMetadata = React.useCallback(
    (pairKey: string): TradingPair | undefined => {
      if (!pairKey) {
        return undefined;
      }

      const normalized = normalizePair(pairKey);

      if (pairMetadata.byPair[normalized]) {
        return pairMetadata.byPair[normalized];
      }

      if (scopedFormPairMetadata?.[normalized]) {
        return scopedFormPairMetadata[normalized];
      }

      if (activeLivePairsMap[normalized]) {
        return activeLivePairsMap[normalized];
      }

      return undefined;
    },
    [
      activeLivePairsMap,
      normalizePair,
      pairMetadata.byPair,
      scopedFormPairMetadata,
    ]
  );

  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');

  const selectTargetAsset = React.useCallback(
    (
      metadata: TradingPair | undefined,
      fallbackBase?: string,
      fallbackQuote?: string
    ) => {
      const base =
        normalizeAssetSymbol(metadata?.baseAsset?.name) ||
        normalizeAssetSymbol(fallbackBase);
      const quote =
        normalizeAssetSymbol(metadata?.quoteAsset?.name) ||
        normalizeAssetSymbol(fallbackQuote);

      if (futures) {
        return normalizeAssetSymbol(coinm ? base : quote) ?? null;
      }

      return normalizeAssetSymbol(quote) ?? null;
    },
    [coinm, futures, normalizeAssetSymbol]
  );

  const baseLabel = baseAsset || 'Base';
  const quoteLabel = quoteAsset || 'Quote';

  const clearPairError = React.useCallback(() => {
    if (errors['pair']) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next['pair'];
        return next;
      });
    }
  }, [errors, setErrors]);

  const handleRemovePair = React.useCallback(
    (pairSymbol: string) => {
      if (isPairsLocked) {
        return;
      }

      const sanitized = normalizePair(pairSymbol);
      const nextPairs = pairs.filter(
        (existing) => normalizePair(existing) !== sanitized
      );
      updateFormData('pair', nextPairs);
      clearPairError();
    },
    [clearPairError, isPairsLocked, normalizePair, pairs, updateFormData]
  );

  const precisionMap = React.useMemo(() => {
    return Object.entries(pairMetadata.byPair).reduce<
      BotFormData['pairPrecisionMap']
    >(
      (acc, [key, value]) => {
        const baseStep = value.baseAsset?.step ?? 0;
        const baseMin = value.baseAsset?.minAmount ?? 0;
        const quoteMin = value.quoteAsset?.minAmount ?? 0;

        acc[key] = {
          pricePrecision: value.priceAssetPrecision ?? 0,
          baseStep,
          minBaseAmount: baseMin,
          minQuoteAmount: quoteMin,
        };
        return acc;
      },
      {} as BotFormData['pairPrecisionMap']
    );
  }, [pairMetadata]);

  React.useEffect(() => {
    const metadataPayload = pairMetadata.byPair;
    const serialized = JSON.stringify(metadataPayload);

    if (pairMetadataStringRef.current !== serialized) {
      pairMetadataStringRef.current = serialized;
      updateFormData('pairMetadata', metadataPayload);
    }
  }, [pairMetadata, updateFormData]);

  React.useEffect(() => {
    const serialized = JSON.stringify(precisionMap);
    if (precisionMapStringRef.current !== serialized) {
      precisionMapStringRef.current = serialized;
      updateFormData('pairPrecisionMap', precisionMap);
    }
  }, [precisionMap, updateFormData]);

  const pasteDependencies = React.useMemo<ProcessPairsPasteDependencies>(
    () => ({
      normalizePair,
      resolvePairMetadata,
      selectTargetAsset,
      splitPair: (pair: string) => {
        const { base, quote } = splitPairParts(pair);
        return [base || '', quote || ''] as const;
      },
      determineAnchorForPairs: () => null,
      resolveHelperToken: () => null,
    }),
    [normalizePair, resolvePairMetadata, selectTargetAsset]
  );

  const applyPairsInput = React.useCallback(
    (rawValue: string) => {
      if (isPairsLocked) {
        return null;
      }

      const context: ProcessPairsPasteContext = {
        raw: rawValue,
        existingPairs: pairs,
        maxAllowedPairs: 1,
        useMulti: false,
        isPairsLocked,
        multiAssetAnchor: '',
        multiAssetConstraintLabel: '',
      };

      const result = processPairsPaste(context, pasteDependencies);

      if (!result) {
        return null;
      }

      if (result.shouldUpdatePairs && result.nextPairs) {
        updateFormData('pair', result.nextPairs);
        clearPairError();
      }

      if (typeof result.error === 'string' && result.error) {
        setErrors((prev) => ({ ...prev, pair: result.error }));
      } else {
        clearPairError();
      }

      return result;
    },
    [
      clearPairError,
      isPairsLocked,
      pairs,
      pasteDependencies,
      updateFormData,
      setErrors,
    ]
  );

  const handlePairsPaste = React.useCallback(
    (raw: string) => {
      applyPairsInput(raw);
    },
    [applyPairsInput]
  );

  const handleCoinToggle = React.useCallback(
    (pairSymbol: string) => {
      if (isPairsLocked) {
        return;
      }

      if (!pairSymbol) {
        return;
      }

      const normalizedSymbol = pairSymbol.toUpperCase();

      if (HELPER_TOKEN_PATTERN.test(normalizedSymbol)) {
        applyPairsInput(normalizedSymbol);
        return;
      }

      if (normalizedSymbol === 'ALL') {
        setErrors((prev) => ({
          ...prev,
          pair: 'Selecting "All pairs" is not supported for this bot. Choose specific pairs.',
        }));
        return;
      }

      const sanitized = normalizePair(pairSymbol);
      const exists = pairs.some(
        (existing) => normalizePair(existing) === sanitized
      );

      if (exists) {
        handleRemovePair(pairSymbol);
        return;
      }

      clearPairError();

      const nextPairs = [sanitized];

      updateFormData('pair', nextPairs);
    },
    [
      applyPairsInput,
      clearPairError,
      handleRemovePair,
      isPairsLocked,
      normalizePair,
      pairs,
      updateFormData,
      setErrors,
    ]
  );

  const selectedPairSymbols = React.useMemo(() => {
    const unique = new Set<string>();
    pairs.forEach((pair) => {
      const token = toSelectionSymbol(pair);
      if (token) {
        unique.add(token);
      }
    });
    return Array.from(unique);
  }, [pairs]);

  const lockedPairs = React.useMemo(() => {
    return pairs.map((pair, index) => {
      const { base, quote } = splitPairParts(pair);
      const label = quote ? `${base}/${quote}` : base;
      return {
        key: `${pair}-${index}`,
        base,
        quote,
        label,
      };
    });
  }, [pairs]);

  const handleInitialPriceReset = () => {
    updateFormData('initialPrice', '');
    updateFormData('initialPriceFrom', 'user');
  };

  const handleInitialPriceChange = React.useCallback(
    (value: number | string) => {
      if (value === '') {
        updateFormData('initialPrice', '');
        return;
      }

      updateFormData(
        'initialPrice',
        typeof value === 'string' ? value : value.toString()
      );
    },
    [updateFormData]
  );

  const initialPriceDescription = React.useMemo(() => {
    const mapper: Record<string, string> = {
      start: 'Price at bot start computed from existing base balance',
      swap: 'Price paid for the initial swap when the bot started',
      user: 'Custom value provided by the user',
    };

    if (!formData.initialPriceFrom) {
      return 'Provide the purchase price to calculate break-even levels accurately.';
    }

    return mapper[formData.initialPriceFrom] ?? 'User-provided initial price';
  }, [formData.initialPriceFrom]);

  return (
    <MasonryLayout
      gap={16}
      containerBreakpoints={{
        default: 1,
        640: 2,
        1024: 3,
      }}
    >
      {!hideName && <NameInput />}

      <div data-tour="botForm.exchange">
        <ExchangeSelector
          isExchangeLocked={isExchangeLocked}
          currentExchange={currentExchange}
          formData={formData}
          updateFormData={updateFormData}
          exchangesLoading={exchangesLoading}
          exchangesData={exchangesData}
          tooltip="Select the exchange account to use for this bot"
          mode={mode}
        />
      </div>

      <div data-tour="botForm.pair">
      <SettingsRow
        name="Trading Pairs"
        tooltip="Configure the trading pairs used by this bot"
        alerts={useBotFormState().alerts?.pair ?? []}
        navId="pair"
      >
        <div className="space-y-xs">
          {isPairsLocked ? (
            <div className="space-y-sm rounded-lg border border-border bg-muted/30 p-sm">
              {lockedPairs.length ? (
                <div className="flex flex-wrap gap-xs">
                  {lockedPairs.map(({ key, base, quote, label }) => {
                    // Resolve asset class + venue so tokenized stocks show their
                    // real logo (not a letter tile) in this read-only view.
                    const tp =
                      livePairsIndex.byExchange[
                        normalizedExchangeProvider ?? ''
                      ]?.[`${base}${quote}`.toUpperCase()] ??
                      livePairsIndex.aggregated[
                        `${base}${quote}`.toUpperCase()
                      ];
                    return (
                    <div
                      key={key}
                      className="flex min-w-0 items-center gap-xs rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm"
                    >
                      <CoinPair
                        baseAsset={base || '?'}
                        quoteAsset={quote || ''}
                        assetClass={tp?.assetCategory}
                        exchange={tp?.exchange}
                        iconSize="sm"
                        showText={false}
                      />
                      <span className="truncate">{label || 'Not set'}</span>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-xs text-sm text-muted-foreground">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                    <span className="text-xs">?</span>
                  </div>
                  <span>No pairs configured</span>
                </div>
              )}
              <Badge variant="outline" className="text-xs">
                Locked
              </Badge>
            </div>
          ) : (
            <>
              <CoinFilter
                selectedCoins={selectedPairSymbols}
                onCoinToggle={handleCoinToggle}
                onRemoveCoin={handleRemovePair}
                mode="pairs"
                {...(currentExchange?.provider
                  ? { exchangeProvider: currentExchange.provider }
                  : {})}
                onPairsPaste={handlePairsPaste}
                showAllOption={false}
                shouldShowAddButton={false}
              />
            </>
          )}
          <p className="text-xs text-muted-foreground">
            The grid range and funding currency will use {baseLabel || 'base'}{' '}
            / {quoteLabel || 'quote'} assets from the selected pair.
          </p>
          {/* Pair errors are surfaced via SettingsRow alerts (validator-driven) */}
        </div>
      </SettingsRow>
      </div>

      {!hideInitialPrice && (
        <SettingsRow
          name={`Initial purchase price (Optional)`}
          tooltip="Purchased price of the base used in this grid bot. This reference price is used to calculate grid profitability metrics."
        >
          <div className="space-y-xs">
            <div className="flex gap-xs">
              <NumberInput
                id="grid-initial-price"
                value={formData.initialPrice || ''}
                onChange={handleInitialPriceChange}
                placeholder="Enter initial price"
                className="flex-1"
                showControls={false}
                endAdornment={unitAdornment(quoteLabel, {
                  size: 'sm',
                  className: 'whitespace-nowrap',
                })}
              />
              <Tooltip tooltip="Reset the initial price to a user-provided value">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleInitialPriceReset}
                  aria-label="Reset initial price"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </Tooltip>
            </div>
            <p
              className={cn(
                'text-xs',
                formData.initialPrice ? 'text-muted-foreground' : 'text-warning'
              )}
            >
              {initialPriceDescription}
            </p>
          </div>
        </SettingsRow>
      )}
    </MasonryLayout>
  );
};
