import type { TradingPair } from '@/hooks/useTradingPairs';
import { resolveStoredPairSymbol } from '@/utils/pairs';

type NormalizePairFn = (pair: string) => string;
type ResolvePairMetadataFn = (pairKey: string) => TradingPair | undefined;
type SelectTargetAssetFn = (
  metadata: TradingPair | undefined,
  fallbackBase?: string,
  fallbackQuote?: string
) => string | null;
type SplitPairFn = (pair: string) => readonly [string, string];
type DetermineAnchorFn = (pairs: string[]) => string | null;
type ResolveHelperTokenFn = (token: string) => readonly string[] | null;

export interface ProcessPairsPasteContext {
  raw: string;
  existingPairs: string[];
  maxAllowedPairs: number;
  useMulti: boolean;
  isPairsLocked: boolean;
  multiAssetAnchor: string | null;
  multiAssetConstraintLabel: string | null;
}

export interface ProcessPairsPasteDependencies {
  normalizePair: NormalizePairFn;
  resolvePairMetadata: ResolvePairMetadataFn;
  selectTargetAsset: SelectTargetAssetFn;
  splitPair: SplitPairFn;
  determineAnchorForPairs: DetermineAnchorFn;
  resolveHelperToken?: ResolveHelperTokenFn;
}

export interface ProcessPairsPasteResult {
  shouldUpdatePairs: boolean;
  nextPairs?: string[];
  error?: string;
  addedCount: number;
  truncated: boolean;
  invalidPairs: string[];
  mismatchedPairs: string[];
}

export const processPairsPaste = (
  context: ProcessPairsPasteContext,
  dependencies: ProcessPairsPasteDependencies
): ProcessPairsPasteResult | null => {
  const {
    raw,
    existingPairs,
    maxAllowedPairs,
    useMulti,
    isPairsLocked,
    multiAssetAnchor,
    multiAssetConstraintLabel,
  } = context;

  const {
    normalizePair,
    resolvePairMetadata,
    selectTargetAsset,
    splitPair,
    determineAnchorForPairs,
    resolveHelperToken,
  } = dependencies;

  if (isPairsLocked) {
    return null;
  }

  const tokens = raw
    .split(/[\s,;\n\r\t]+/u)
    .map((token) => token.replace(/['"]/g, '').trim())
    .filter(Boolean);

  if (!tokens.length) {
    return null;
  }

  const uniqueTokens = Array.from(new Set(tokens));
  const validPairs: string[] = [];
  const invalidPairs: string[] = [];
  const normalizedToOriginal = new Map<string, string>();

  const helperTokenPattern = /^[A-Z0-9]+_ALL$/u;

  uniqueTokens.forEach((token) => {
    const normalizedToken = token.toUpperCase();

    if (resolveHelperToken && helperTokenPattern.test(normalizedToken)) {
      const helperPairs = resolveHelperToken(normalizedToken);

      if (helperPairs?.length) {
        helperPairs.forEach((helperPair) => {
          validPairs.push(helperPair);
          normalizedToOriginal.set(helperPair, helperPair);
        });
      } else {
        invalidPairs.push(normalizedToken);
      }
      return;
    }

    const normalized = normalizePair(token);
    const metadata = resolvePairMetadata(normalized);

    if (metadata) {
      validPairs.push(normalized);
      normalizedToOriginal.set(normalized, normalizedToken);
    } else {
      invalidPairs.push(normalizedToken);
    }
  });

  if (!validPairs.length) {
    return {
      shouldUpdatePairs: false,
      error: 'No matching pairs were found in the pasted value.',
      addedCount: 0,
      truncated: false,
      invalidPairs,
      mismatchedPairs: [],
    };
  }

  const nextPairs = [...existingPairs];
  const existing = new Set(nextPairs.map((item) => normalizePair(item)));
  let truncated = false;
  let addedCount = 0;
  const mismatchedPairs: string[] = [];

  let anchorDuringPaste = determineAnchorForPairs(nextPairs);

  validPairs.forEach((normalized) => {
    if (existing.has(normalized)) {
      return;
    }

    if (useMulti) {
      const metadata = resolvePairMetadata(normalized);
      const [fallbackBase, fallbackQuote] = splitPair(normalized);
      const candidateTarget = selectTargetAsset(
        metadata,
        fallbackBase,
        fallbackQuote
      );

      if (
        anchorDuringPaste &&
        (!candidateTarget || candidateTarget !== anchorDuringPaste)
      ) {
        mismatchedPairs.push(
          normalizedToOriginal.get(normalized) ?? normalized
        );
        return;
      }

      if (!anchorDuringPaste) {
        anchorDuringPaste = candidateTarget ?? anchorDuringPaste;
      }
    }

    if (nextPairs.length >= maxAllowedPairs) {
      truncated = true;
      return;
    }

    existing.add(normalized);
    // De-dupe on the normalized key, but STORE the exchange-native symbol when
    // the pair can't be rebuilt from its assets — `BTCUSD_PERP` must not be
    // flattened to `BTCUSDPERP` on its way into `formData.pair`.
    nextPairs.push(
      resolveStoredPairSymbol(normalized, resolvePairMetadata(normalized))
    );
    addedCount += 1;
  });

  if (addedCount === 0) {
    if (mismatchedPairs.length) {
      const sample = mismatchedPairs.slice(0, 3).join(', ');
      const suffix = mismatchedPairs.length > 3 ? '…' : '';
      const label = multiAssetConstraintLabel ?? 'asset';
      const anchorLabel = multiAssetAnchor ? ` (${multiAssetAnchor})` : '';
      return {
        shouldUpdatePairs: false,
        error: `Pairs must share the same ${label}${anchorLabel}. Skipped ${mismatchedPairs.length} ${mismatchedPairs.length === 1 ? 'pair' : 'pairs'} (${sample}${suffix}).`,
        addedCount,
        truncated,
        invalidPairs,
        mismatchedPairs,
      };
    }

    if (truncated) {
      return {
        shouldUpdatePairs: false,
        error: `Maximum pairs to choose is ${maxAllowedPairs}. Some pairs were not added.`,
        addedCount,
        truncated,
        invalidPairs,
        mismatchedPairs,
      };
    }

    if (invalidPairs.length) {
      const sample = invalidPairs.slice(0, 3).join(', ');
      const suffix = invalidPairs.length > 3 ? '…' : '';
      return {
        shouldUpdatePairs: false,
        error: `${invalidPairs.length} ${invalidPairs.length === 1 ? 'pair' : 'pairs'} not recognized (${sample}${suffix}).`,
        addedCount,
        truncated,
        invalidPairs,
        mismatchedPairs,
      };
    }

    return {
      shouldUpdatePairs: false,
      error: 'All pasted pairs are already selected.',
      addedCount,
      truncated,
      invalidPairs,
      mismatchedPairs,
    };
  }

  let error: string | undefined;

  if (mismatchedPairs.length) {
    const sample = mismatchedPairs.slice(0, 3).join(', ');
    const suffix = mismatchedPairs.length > 3 ? '…' : '';
    const label = multiAssetConstraintLabel ?? 'asset';
    const anchorLabel = multiAssetAnchor ? ` (${multiAssetAnchor})` : '';
    error = `Skipped ${mismatchedPairs.length} ${mismatchedPairs.length === 1 ? 'pair' : 'pairs'} due to different ${label}${anchorLabel}: ${sample}${suffix}.`;
  } else if (invalidPairs.length && truncated) {
    error = `Added ${addedCount} ${addedCount === 1 ? 'pair' : 'pairs'}. ${invalidPairs.length} not recognized and maximum of ${maxAllowedPairs} pairs reached.`;
  } else if (invalidPairs.length) {
    const sample = invalidPairs.slice(0, 3).join(', ');
    const suffix = invalidPairs.length > 3 ? '…' : '';
    error = `${invalidPairs.length} ${invalidPairs.length === 1 ? 'pair' : 'pairs'} not recognized (${sample}${suffix}).`;
  } else if (truncated) {
    error = `Maximum pairs to choose is ${maxAllowedPairs}. Some pairs were not added.`;
  } else {
    error = '';
  }

  return {
    shouldUpdatePairs: true,
    nextPairs,
    error,
    addedCount,
    truncated,
    invalidPairs,
    mismatchedPairs,
  };
};
