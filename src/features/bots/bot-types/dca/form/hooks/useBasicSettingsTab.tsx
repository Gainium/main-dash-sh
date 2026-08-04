import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import { type TradingPair } from '@/hooks/useTradingPairs';
import useUserProfile from '@/hooks/useUserProfile';
import type { BotFormData } from '@/types/bots';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findMissingPairs,
  isFreeOrTrialPlan,
  normalizePairKey,
  resolveMaxAllowedPairs,
  resolveMultiToggleMessageDescriptor,
  resolveMultiToggleState,
  resolvePairsLockState,
  shouldRestrictMulti,
} from '../utils/basicSettings';
import type { BasicSettingsProps } from '../sections';
import { Link, useParams } from 'react-router-dom';
import { StrategyEnum } from '@/types';
import {
  processPairsPaste,
  type ProcessPairsPasteContext,
  type ProcessPairsPasteDependencies,
} from '../utils/pastePairs';
import { useBotFormSelector } from '@/contexts/bots/form/BotFormProvider';
import { useTradingPairsFromContext } from '@/contexts/ExchangeDataContext';
import {
  resolvePairSelectionSymbol,
  resolveStoredPairSymbol,
} from '@/utils/pairs';

const HELPER_TOKEN_PATTERN = /^[A-Z0-9]+_ALL$/u;

interface QuickSelectOption {
  token: string;
  label: string;
  description: string;
  normalizedPairs: string[];
  anchor: string;
}

export const useBasicSettingsTab = (
  props: Omit<BasicSettingsProps, 'errors' | 'exchangesData'> & {
    formData: BotFormData;
  }
) => {
  const { currentExchange, formData, updateFormData, mode, isFieldLocked } =
    props;
  const { id } = useParams<{ id: string }>();
  const { pairsByExchange, isLoading: tradingPairsLoading } =
    useTradingPairsFromContext();

  const { pairMetadata } = useBotFormQuery();
  const { userProfile } = useUserProfile();

  const pairMetadataStringRef = useRef<string>('');
  const precisionMapStringRef = useRef<string>('');
  const previousExchangeProviderRef = useRef<string | undefined>(undefined);
  const [exchangePendingValidation, setExchangePendingValidation] = useState<
    string | null
  >(null);
  const [pairError, setPairError] = useState('');

  const livePairsIndex = useMemo(() => {
    const aggregated: Record<string, TradingPair> = {};
    const byExchange: Record<string, Record<string, TradingPair>> = {};

    Object.entries(pairsByExchange ?? {}).forEach(([exchangeName, pairs]) => {
      const normalizedExchange = exchangeName.toUpperCase();
      if (!byExchange[normalizedExchange]) {
        byExchange[normalizedExchange] = {};
      }

      pairs.forEach((pair) => {
        const base = pair.baseAsset?.name?.toUpperCase?.();
        const quote = pair.quoteAsset?.name?.toUpperCase?.();

        if (!base || !quote) {
          return;
        }

        // Key on the same identity `pairMetadata.byPair` uses, so a contract
        // pair (`BTCUSD_PERP`) is findable here too instead of being filed
        // under `BTCUSD` — where the venue's plain BTC/USD contract would
        // shadow it and hand back the wrong precision/assets.
        const key = normalizePairKey(
          resolvePairSelectionSymbol(pair.pair, base, quote)
        );
        if (!(key in aggregated)) {
          aggregated[key] = pair;
        }
        if (!(key in byExchange[normalizedExchange])) {
          byExchange[normalizedExchange][key] = pair;
        }
      });
    });

    return { aggregated, byExchange };
  }, [pairsByExchange]);

  const exchangeProvider = useMemo(
    () => currentExchange?.provider,
    [currentExchange]
  );

  const normalizedExchangeProvider = useMemo(
    () => exchangeProvider?.toUpperCase?.(),
    [exchangeProvider]
  );

  const activeLivePairsMap = useMemo(() => {
    if (normalizedExchangeProvider) {
      const scoped = livePairsIndex.byExchange[normalizedExchangeProvider];
      if (scoped) {
        return scoped;
      }
    }
    return livePairsIndex.aggregated;
  }, [livePairsIndex, normalizedExchangeProvider]);

  const scopedFormPairMetadata = useMemo(() => {
    if (!formData.pairMetadata) {
      return null;
    }

    if (!normalizedExchangeProvider) {
      return formData.pairMetadata;
    }

    const entries = Object.entries(formData.pairMetadata).reduce<
      NonNullable<BotFormData['pairMetadata']>
    >(
      (acc, [key, value]) => {
        const exchangeValue = (
          value as TradingPair | undefined
        )?.exchange?.toUpperCase?.();
        if (!exchangeValue || exchangeValue === normalizedExchangeProvider) {
          acc[key] = value;
        }
        return acc;
      },
      {} as NonNullable<BotFormData['pairMetadata']>
    );

    return Object.keys(entries).length ? entries : null;
  }, [formData.pairMetadata, normalizedExchangeProvider]);

  const subscriptionPlanName = useMemo(
    () => userProfile?.subscription?.subscriptionPlanName ?? null,
    [userProfile?.subscription?.subscriptionPlanName]
  );

  const isFreePlan = useMemo(
    () => isFreeOrTrialPlan(subscriptionPlanName),
    [subscriptionPlanName]
  );
  const useMulti = useBotFormSelector('useMulti');
  const futures = useBotFormSelector('futures');
  const coinm = useBotFormSelector('coinm');
  const strategy = useBotFormSelector('strategy');
  const maxAllowedPairs = useMemo(
    () =>
      resolveMaxAllowedPairs({
        isFreePlan,
        useMulti: Boolean(useMulti),
      }),
    [useMulti, isFreePlan]
  );

  const isUseMultiLocked = useMemo(
    () => isFieldLocked?.('useMulti') ?? mode === 'edit',
    [isFieldLocked, mode]
  );
  const isComboBot = useMemo(() => formData.type === 'combo', [formData.type]);
  const planRestrictsMulti = useMemo(
    () => shouldRestrictMulti(subscriptionPlanName, !!useMulti),
    [useMulti, subscriptionPlanName]
  );
  const multiToggleState = useMemo(
    () =>
      resolveMultiToggleState({
        isUseMultiLocked,
        isComboBot,
        planRestrictsMulti,
      }),
    [isComboBot, isUseMultiLocked, planRestrictsMulti]
  );

  const multiToggleDescriptor = useMemo(
    () => resolveMultiToggleMessageDescriptor(multiToggleState),
    [multiToggleState]
  );

  const multiToggleMessage = useMemo<React.ReactNode | null>(() => {
    if (!multiToggleDescriptor) {
      return null;
    }

    if (multiToggleDescriptor.ctaHref && multiToggleDescriptor.ctaLabel) {
      return (
        <>
          {multiToggleDescriptor.message}{' '}
          <a
            href={multiToggleDescriptor.ctaHref}
            className="text-primary underline hover:text-primary/80 transition-colors"
          >
            {multiToggleDescriptor.ctaLabel}
          </a>{' '}
          to enable this feature.
        </>
      );
    }

    return multiToggleDescriptor.message;
  }, [multiToggleDescriptor]);

  const pairLockState = useMemo(
    () =>
      resolvePairsLockState({
        externallyLocked: isFieldLocked?.('pair'),
        mode,
        useMulti: Boolean(useMulti),
      }),
    [useMulti, isFieldLocked, mode]
  );

  const isExchangeLocked = useMemo(() => !!id, [id]);

  const pairs = useMemo(
    () => (Array.isArray(formData.pair) ? formData.pair : []),
    [formData.pair]
  );

  const normalizePair = useCallback(
    (pair: string) => normalizePairKey(pair),
    []
  );

  const normalizeAssetSymbol = useCallback((value?: string | null) => {
    if (!value) {
      return undefined;
    }
    const normalized = value.toString().trim().toUpperCase();
    return normalized && normalized !== '?' ? normalized : undefined;
  }, []);

  const resolvePairMetadata = useCallback(
    (pairKey: string): TradingPair | undefined => {
      if (!pairKey) {
        return undefined;
      }

      const normalized = normalizePair(pairKey);

      if (pairMetadata.byPair[normalized]) {
        return pairMetadata.byPair[normalized];
      }

      const storedMetadata = scopedFormPairMetadata?.[normalized];
      if (storedMetadata && typeof storedMetadata === 'object') {
        return storedMetadata as TradingPair;
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

  const selectTargetAsset = useCallback(
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

      const isShort = strategy === StrategyEnum.short;
      return normalizeAssetSymbol(isShort ? base : quote) ?? null;
    },
    [coinm, strategy, futures, normalizeAssetSymbol]
  );

  const parseSelectionSymbol = useCallback(
    (selectionSymbol: string) => {
      const [rawBase, rawQuote] = selectionSymbol.split('-');
      return [
        normalizeAssetSymbol(rawBase),
        normalizeAssetSymbol(rawQuote),
      ] as const;
    },
    [normalizeAssetSymbol]
  );
  const limitReached = pairs.length >= maxAllowedPairs;

  const canAddMorePairs = pairs.length < maxAllowedPairs;

  const planLimitMessage = useMemo(() => {
    if (!useMulti) {
      return null;
    }

    const base = `Maximum pairs to choose is ${maxAllowedPairs}.`;

    if (isFreePlan) {
      return (
        <>
          {base}{' '}
          {/* Router link, not a raw <a>: a plain anchor is a full browser
              navigation, which tears down the SPA and takes the half-built
              bot with it. */}
          <Link
            to="/subscription"
            className="text-primary underline hover:text-primary/80 transition-colors"
          >
            Upgrade account
          </Link>{' '}
          for higher limits.
        </>
      );
    }

    return base;
  }, [useMulti, isFreePlan, maxAllowedPairs]);

  const missingPairs = useMemo(() => {
    const metadataSources: Array<Record<string, unknown> | null> = [
      pairMetadata.byPair,
      scopedFormPairMetadata,
      Object.keys(activeLivePairsMap).length ? activeLivePairsMap : null,
    ];

    const hasMetadata = metadataSources.some(
      (source) => source && Object.keys(source).length > 0
    );

    if (!hasMetadata) {
      return [] as string[];
    }

    return findMissingPairs(pairs, metadataSources);
  }, [activeLivePairsMap, pairMetadata.byPair, pairs, scopedFormPairMetadata]);

  const splitPair = useCallback(
    (pair: string) => {
      if (!pair) {
        return ['?', 'USDT'] as const;
      }
      // Prefer the loaded pair's own assets — string-splitting a contract
      // symbol has no chance of being right ("BTCUSD_PERP" fell through to the
      // last-three-characters guess and rendered as "BTCUSD_P/ERP"). The
      // heuristics below stay as the fallback for pairs we have no metadata
      // for (free-typed input, a pair from another exchange).
      const metadata = resolvePairMetadata(pair);
      const metadataBase = metadata?.baseAsset?.name;
      const metadataQuote = metadata?.quoteAsset?.name;
      if (metadataBase && metadataQuote) {
        return [metadataBase, metadataQuote] as const;
      }
      // Pairs may be stored slash- OR dash-separated (e.g. "BTC/USDT", and
      // "PGx-USD" for Kraken xStocks). Split on either separator so a dash-pair
      // base isn't left with a trailing "-" — that stray dash broke the
      // live-pairs index lookup (→ assetClass lost → stock icon fell back) and
      // the "BASE/QUOTE" label (rendered "PGX-/USD"). Mirrors GRID's splitPairParts.
      const parts = pair.split(/[-/]/).filter(Boolean);
      if (parts.length === 2) {
        return [parts[0] || '?', parts[1] || 'USDT'] as const;
      }

      const normalized = pair.toUpperCase();
      const knownQuotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB', 'BUSD'];
      for (const quote of knownQuotes) {
        if (normalized.endsWith(quote)) {
          return [
            normalized.slice(0, normalized.length - quote.length) || '?',
            quote,
          ] as const;
        }
      }
      if (normalized.length > 3) {
        return [normalized.slice(0, -3), normalized.slice(-3)] as const;
      }
      return [normalized, 'USDT'] as const;
    },
    [resolvePairMetadata]
  );

  const multiAssetDimension = useMemo<'base' | 'quote' | null>(() => {
    if (!useMulti) {
      return null;
    }

    if (futures) {
      return coinm ? 'base' : 'quote';
    }

    return strategy === StrategyEnum.short ? 'base' : 'quote';
  }, [coinm, strategy, futures, useMulti]);

  const determineAnchorForPairs = useCallback(
    (pairList: string[]) => {
      if (!useMulti || pairList.length === 0) {
        return null;
      }

      const firstPair = pairList[0];
      const metadata = resolvePairMetadata(firstPair);
      const [fallbackBase, fallbackQuote] = splitPair(firstPair);

      return selectTargetAsset(metadata, fallbackBase, fallbackQuote);
    },
    [useMulti, resolvePairMetadata, selectTargetAsset, splitPair]
  );

  const multiAssetAnchor = useMemo(
    () => determineAnchorForPairs(pairs),
    [determineAnchorForPairs, pairs]
  );

  const multiAssetConstraintLabel = useMemo(() => {
    if (!multiAssetDimension) {
      return null;
    }

    return multiAssetDimension === 'base' ? 'base asset' : 'quote asset';
  }, [multiAssetDimension]);

  // Constraint used to filter the add-pairs modal: pairs must share the
  // quote asset (longs) or base asset (shorts/coinm) with the current
  // selection. Unlike `multiAssetDimension` this is NOT gated on multi
  // mode — a single-pair long bot should still only browse same-quote
  // pairs. Anchor comes from the first selected pair via the same
  // direction-aware `selectTargetAsset` used everywhere else.
  const pairSelectionFilter = useMemo<{
    dimension: 'base' | 'quote';
    anchor: string;
  } | null>(() => {
    if (!pairs.length) {
      return null;
    }
    const dimension: 'base' | 'quote' = futures
      ? coinm
        ? 'base'
        : 'quote'
      : strategy === StrategyEnum.short
        ? 'base'
        : 'quote';
    const firstPair = pairs[0];
    const metadata = resolvePairMetadata(firstPair);
    const [fallbackBase, fallbackQuote] = splitPair(firstPair);
    const anchor = selectTargetAsset(metadata, fallbackBase, fallbackQuote);
    if (!anchor) {
      return null;
    }
    return { dimension, anchor: anchor.toUpperCase() };
  }, [
    pairs,
    futures,
    coinm,
    strategy,
    resolvePairMetadata,
    splitPair,
    selectTargetAsset,
  ]);

  const formattedMissingPairs = useMemo(() => {
    return missingPairs.map((pair) => {
      const [baseAssetSymbol, quoteAssetSymbol] = splitPair(pair);
      return `${baseAssetSymbol}/${quoteAssetSymbol}`;
    });
  }, [missingPairs, splitPair]);

  const missingPairsExchangeLabel = useMemo(
    () => currentExchange?.name ?? currentExchange?.provider ?? 'this exchange',
    [currentExchange?.name, currentExchange?.provider]
  );

  const convertPairToSelectionSymbol = useCallback(
    (pair: string) => {
      // Must produce the same identity the picker built in
      // BotFormQueryProvider, or the selected chip never matches its row. For a
      // contract pair that identity IS the native symbol, not `BASE-QUOTE`.
      const metadata = resolvePairMetadata(pair);
      if (metadata?.pair) {
        return resolvePairSelectionSymbol(
          metadata.pair,
          metadata.baseAsset?.name,
          metadata.quoteAsset?.name
        );
      }
      const [baseAsset, quoteAsset] = splitPair(pair);
      return `${baseAsset}-${quoteAsset}`;
    },
    [resolvePairMetadata, splitPair]
  );

  const selectedPairSymbols = useMemo(
    () => pairs.map((pair) => convertPairToSelectionSymbol(pair)),
    [pairs, convertPairToSelectionSymbol]
  );

  const collectPairsForAnchor = useCallback(
    (targetAsset?: string | null) => {
      if (!targetAsset) {
        return [] as string[];
      }
      if (!multiAssetDimension) {
        return [] as string[];
      }

      const normalizedTarget = targetAsset.toUpperCase();

      return Object.entries(pairMetadata.byPair)
        .filter(([, metadata]) => {
          const pairExchange = metadata.exchange?.toUpperCase?.();
          if (
            normalizedExchangeProvider &&
            pairExchange &&
            pairExchange !== normalizedExchangeProvider
          ) {
            return false;
          }

          const base = metadata.baseAsset?.name?.toUpperCase?.();
          const quote = metadata.quoteAsset?.name?.toUpperCase?.();

          return multiAssetDimension === 'base'
            ? base === normalizedTarget
            : quote === normalizedTarget;
        })
        .map(([normalizedKey]) => normalizedKey);
    },
    [multiAssetDimension, normalizedExchangeProvider, pairMetadata.byPair]
  );

  const quickSelectOptions = useMemo<QuickSelectOption[]>(() => {
    if (!useMulti) {
      return [];
    }
    if (!multiAssetDimension) {
      return [];
    }

    const anchor = multiAssetAnchor ?? null;
    if (!anchor) {
      return [];
    }

    const normalizedAnchor = anchor.toUpperCase();
    const normalizedPairs = collectPairsForAnchor(normalizedAnchor);

    if (!normalizedPairs.length) {
      return [];
    }

    const isBaseDimension = multiAssetDimension === 'base';
    const assetLabel = isBaseDimension ? 'base' : 'quote';
    const token = `${normalizedAnchor}_ALL`;

    return [
      {
        token,
        label: isBaseDimension
          ? `Select all ${normalizedAnchor} base pairs`
          : `Select all ${normalizedAnchor} quote pairs`,
        description: `Adds every pair sharing the ${assetLabel} asset ${normalizedAnchor}.`,
        normalizedPairs,
        anchor: normalizedAnchor,
      },
    ];
  }, [collectPairsForAnchor, useMulti, multiAssetAnchor, multiAssetDimension]);

  const quickSelectOptionMap = useMemo(() => {
    const map = new Map<string, QuickSelectOption>();
    quickSelectOptions.forEach((option) => {
      map.set(option.token.toUpperCase(), option);
    });
    return map;
  }, [quickSelectOptions]);

  const activeQuickSelectOption = useMemo(
    () => quickSelectOptions[0] ?? null,
    [quickSelectOptions]
  );

  const resolveHelperToken = useCallback(
    (token: string) =>
      quickSelectOptionMap.get(token.toUpperCase())?.normalizedPairs ?? null,
    [quickSelectOptionMap]
  );

  const pasteDependencies = useMemo<ProcessPairsPasteDependencies>(
    () => ({
      normalizePair,
      resolvePairMetadata,
      selectTargetAsset,
      splitPair,
      determineAnchorForPairs,
      resolveHelperToken,
    }),
    [
      determineAnchorForPairs,
      normalizePair,
      resolveHelperToken,
      resolvePairMetadata,
      selectTargetAsset,
      splitPair,
    ]
  );

  const applyPairsInput = useCallback(
    (rawValue: string) => {
      if (pairLockState.locked) {
        return null;
      }

      const context: ProcessPairsPasteContext = {
        raw: rawValue,
        existingPairs: pairs,
        maxAllowedPairs,
        useMulti: Boolean(useMulti),
        isPairsLocked: pairLockState.locked,
        multiAssetAnchor,
        multiAssetConstraintLabel,
      };

      const result = processPairsPaste(context, pasteDependencies);

      if (!result) {
        return null;
      }

      if (result.shouldUpdatePairs && result.nextPairs) {
        updateFormData('pair', result.nextPairs);
      }

      if (result.error !== undefined) {
        setPairError(result.error);
      }

      return result;
    },
    [
      useMulti,
      pairLockState.locked,
      maxAllowedPairs,
      multiAssetAnchor,
      multiAssetConstraintLabel,
      pairs,
      pasteDependencies,
      setPairError,
      updateFormData,
    ]
  );

  const precisionMap = useMemo(() => {
    return Object.entries(pairMetadata.byPair).reduce<
      BotFormData['pairPrecisionMap']
    >(
      (acc, [key, pair]) => {
        const baseStep = pair.baseAsset?.step ?? 0;
        const baseMin = pair.baseAsset?.minAmount ?? 0;
        const quoteMin = pair.quoteAsset?.minAmount ?? 0;

        acc[key] = {
          pricePrecision: pair.priceAssetPrecision ?? 0,
          baseStep,
          minBaseAmount: baseMin,
          minQuoteAmount: quoteMin,
        };
        return acc;
      },
      {} as BotFormData['pairPrecisionMap']
    );
  }, [pairMetadata]);

  const handleRemovePair = useCallback(
    (pair: string) => {
      if (pairLockState.locked) {
        return;
      }
      const sanitized = normalizePair(pair);
      const nextPairs = pairs.filter(
        (item) => normalizePair(item) !== sanitized
      );
      updateFormData('pair', nextPairs);
      setPairError('');
    },
    [pairLockState.locked, normalizePair, pairs, updateFormData]
  );

  const handleCoinToggle = useCallback(
    (pairSymbol: string) => {
      if (pairLockState.locked) {
        return;
      }
      const normalizedSymbol = pairSymbol.toUpperCase();

      if (HELPER_TOKEN_PATTERN.test(normalizedSymbol)) {
        applyPairsInput(normalizedSymbol);
        return;
      }

      if (normalizedSymbol === 'ALL') {
        setPairError(
          'Selecting "All pairs" isn\'t supported for this bot. Choose specific pairs.'
        );
        return;
      }

      // `sanitized` stays the comparison / de-dupe key; `storedSymbol` is what
      // actually lands in `formData.pair` and is forwarded to the exchange, so
      // a contract pair keeps its native symbol instead of being flattened.
      const sanitized = normalizePair(pairSymbol);
      const selectionMetadata =
        pairMetadata.bySelectionSymbol[pairSymbol] ??
        resolvePairMetadata(sanitized);
      const storedSymbol = resolveStoredPairSymbol(
        pairSymbol,
        selectionMetadata
      );
      const exists = pairs.some((item) => normalizePair(item) === sanitized);

      if (exists) {
        handleRemovePair(pairSymbol);
        return;
      }

      if (useMulti && pairs.length > 0) {
        const candidateMetadata = selectionMetadata;
        const [selectionBase, selectionQuote] =
          parseSelectionSymbol(pairSymbol);
        const [fallbackBase, fallbackQuote] = splitPair(sanitized);
        const candidateTarget = selectTargetAsset(
          candidateMetadata,
          selectionBase ?? fallbackBase,
          selectionQuote ?? fallbackQuote
        );

        if (
          multiAssetAnchor &&
          candidateTarget &&
          candidateTarget !== multiAssetAnchor
        ) {
          const label = multiAssetConstraintLabel ?? 'asset';
          setPairError(
            `All selected pairs must share the same ${label} (${multiAssetAnchor}).`
          );
          return;
        }

        if (multiAssetAnchor && !candidateTarget) {
          const label = multiAssetConstraintLabel ?? 'asset';
          setPairError(
            `Could not verify ${label} for ${pairSymbol}. Select pairs that match ${multiAssetAnchor}.`
          );
          return;
        }
      }

      if (!canAddMorePairs) {
        if (useMulti) {
          setPairError(
            `Maximum pairs to choose is ${maxAllowedPairs}. Upgrade your plan for higher limits.`
          );
        } else {
          // Auto-enable multi-mode when trying to add a second pair
          if (!multiToggleState.disabled && pairs.length >= 1) {
            updateFormData('useMulti', true);
            // Try again after enabling multi-mode
            setPairError('');
            updateFormData('pair', [...pairs, storedSymbol]);
            return;
          }
        }
        return;
      }

      setPairError('');

      // Auto-enable multi-mode when adding a second pair
      if (!useMulti && pairs.length >= 1 && !multiToggleState.disabled) {
        updateFormData('useMulti', true);
      }

      updateFormData('pair', [...pairs, storedSymbol]);
    },
    [
      applyPairsInput,
      canAddMorePairs,
      useMulti,
      handleRemovePair,
      pairLockState.locked,
      maxAllowedPairs,
      multiAssetAnchor,
      multiAssetConstraintLabel,
      multiToggleState.disabled,
      normalizePair,
      pairMetadata.bySelectionSymbol,
      pairs,
      parseSelectionSymbol,
      resolvePairMetadata,
      selectTargetAsset,
      splitPair,
      updateFormData,
    ]
  );

  const handlePairsPaste = useCallback(
    (raw: string) => {
      applyPairsInput(raw);
    },
    [applyPairsInput]
  );

  const handleSelectAllMatching = useCallback(() => {
    if (pairLockState.locked) {
      return;
    }

    if (!activeQuickSelectOption) {
      setPairError(
        'Add at least one compatible pair to enable the Select All helper.'
      );
      return;
    }

    applyPairsInput(activeQuickSelectOption.token);
  }, [
    activeQuickSelectOption,
    applyPairsInput,
    pairLockState.locked,
    setPairError,
  ]);

  const handleClearPairs = useCallback(() => {
    if (pairLockState.locked) {
      return;
    }
    if (!pairs.length) {
      return;
    }
    updateFormData('pair', []);
    setPairError('');
  }, [pairLockState.locked, pairs, updateFormData]);

  useEffect(() => {
    const previous = previousExchangeProviderRef.current;
    if (
      normalizedExchangeProvider &&
      previous &&
      normalizedExchangeProvider !== previous
    ) {
      setExchangePendingValidation(normalizedExchangeProvider);
    }
    previousExchangeProviderRef.current =
      normalizedExchangeProvider ?? undefined;
  }, [
    normalizedExchangeProvider,
    setExchangePendingValidation,
    previousExchangeProviderRef,
  ]);

  useEffect(() => {
    if (mode !== 'create') {
      return;
    }
    if (pairLockState.locked) {
      return;
    }

    if (!useMulti && Array.isArray(formData.pair) && formData.pair.length > 1) {
      updateFormData('pair', [formData.pair[0]]);
    }
  }, [mode, pairLockState.locked, useMulti, formData.pair, updateFormData]);

  useEffect(() => {
    if (
      !exchangePendingValidation ||
      !normalizedExchangeProvider ||
      exchangePendingValidation !== normalizedExchangeProvider
    ) {
      return;
    }

    if (tradingPairsLoading) {
      return;
    }

    if (!missingPairs.length) {
      setExchangePendingValidation(null);
      return;
    }

    const sanitizedMissing = new Set(
      missingPairs.map((pair) => normalizePair(pair))
    );
    const filteredPairs = pairs.filter(
      (pair) => !sanitizedMissing.has(normalizePair(pair))
    );

    if (filteredPairs.length !== pairs.length) {
      updateFormData('pair', filteredPairs);
      setPairError(
        `Removed ${missingPairs.length} ${
          missingPairs.length === 1 ? 'pair' : 'pairs'
        } unsupported on ${
          currentExchange?.name ??
          currentExchange?.provider ??
          'selected exchange'
        }`
      );
    }

    setExchangePendingValidation(null);
  }, [
    currentExchange?.name,
    currentExchange?.provider,
    exchangePendingValidation,
    missingPairs,
    normalizePair,
    normalizedExchangeProvider,
    pairs,
    tradingPairsLoading,
    updateFormData,
    setExchangePendingValidation,
    setPairError,
  ]);

  useEffect(() => {
    const metadataPayload = pairMetadata.byPair;
    const serialized = JSON.stringify(metadataPayload);

    if (pairMetadataStringRef.current !== serialized) {
      pairMetadataStringRef.current = serialized;
      updateFormData('pairMetadata', metadataPayload);
    }
  }, [pairMetadata, updateFormData, pairMetadataStringRef]);

  useEffect(() => {
    const serialized = JSON.stringify(precisionMap);
    if (precisionMapStringRef.current !== serialized) {
      precisionMapStringRef.current = serialized;
      updateFormData('pairPrecisionMap', precisionMap);
    }
  }, [precisionMap, updateFormData, precisionMapStringRef]);

  return {
    livePairsIndex,
    tradingPairsLoading,
    pairMetadata,
    pairMetadataStringRef,
    precisionMapStringRef,
    previousExchangeProviderRef,
    exchangePendingValidation,
    setExchangePendingValidation,
    pairError,
    setPairError,
    exchangeProvider,
    normalizedExchangeProvider,
    activeLivePairsMap,
    scopedFormPairMetadata,
    isFreePlan,
    maxAllowedPairs,
    isUseMultiLocked,
    isComboBot,
    planRestrictsMulti,
    multiToggleState,
    multiToggleMessage,
    pairLockState,
    limitReached,
    canAddMorePairs,
    planLimitMessage,
    missingPairs,
    formattedMissingPairs,
    missingPairsExchangeLabel,
    splitPair,
    normalizePair,
    normalizeAssetSymbol,
    resolvePairMetadata,
    selectTargetAsset,
    parseSelectionSymbol,
    quickSelectOptions,
    quickSelectOptionMap,
    activeQuickSelectOption,
    multiAssetAnchor,
    multiAssetConstraintLabel,
    pairSelectionFilter,
    applyPairsInput,
    handleCoinToggle,
    handlePairsPaste,
    handleSelectAllMatching,
    handleClearPairs,
    precisionMap,
    handleRemovePair,
    isExchangeLocked,
    pairs,
    selectedPairSymbols,
  };
};
