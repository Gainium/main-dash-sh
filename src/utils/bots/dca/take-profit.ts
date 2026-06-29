import type { MultiTP } from '@/types';

const EPSILON = 1e-6;
const MAX_TARGET_PERCENTAGE = 100;
const MULTI_TP_ID_PREFIX = 'tp-target';

export const formatNumericString = (value: number, precision = 3): string => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const fixed = value.toFixed(precision);
  return fixed.replace(/\.0+$/, '').replace(/\.(?=0*$)/, '') || '0';
};

export const sanitizePercentageInput = (
  value: string | number | null | undefined,
  minimum: number,
  maximum: number = 100
): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    return minimum;
  }

  const clamped = Math.min(Math.max(parsed, minimum), maximum);
  return Number.parseFloat(clamped.toFixed(3));
};

export const sanitizeAmountInput = (
  value: string | number | null | undefined,
  minimum: number,
  maximum: number
): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    return minimum;
  }

  const clamped = Math.min(Math.max(parsed, minimum), maximum);
  return Number.parseFloat(clamped.toFixed(3));
};

export const sanitizeFixedInput = (
  value: string | number | null | undefined
): string => {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(String(value ?? '').replace(',', '.'));

  if (!Number.isFinite(parsed) || parsed < 0) {
    return '0';
  }

  return formatNumericString(parsed, 8);
};

export const calculateValueFromPercent = (
  isShort: boolean,
  percentage: string,
  latestPrice: number
): string => {
  const percentValue = Number.parseFloat(percentage) || 0;
  const price = Number.isFinite(latestPrice) ? latestPrice : 0;

  if (price <= 0) {
    return '0';
  }

  const multiplier = isShort ? 1 - percentValue / 100 : 1 + percentValue / 100;
  const result = price * multiplier;

  return formatNumericString(result, 8);
};

export const calculatePercentFromValue = (
  isShort: boolean,
  value: string,
  latestPrice: number
): string => {
  const priceValue = Number.parseFloat(value) || 0;
  const price = Number.isFinite(latestPrice) ? latestPrice : 0;

  if (price <= 0 || priceValue <= 0) {
    return '0';
  }

  const diff = isShort
    ? ((price - priceValue) / price) * 100
    : ((priceValue - price) / price) * 100;

  return formatNumericString(diff, 3);
};

interface ResolveTpReferencePriceOptions {
  shouldUseLimitPrice?: boolean;
  limitOrderPrice?: number | string | null;
  fallbackLimitPrice?: number | string | null;
}

const normalizePriceInput = (price: number | string | null | undefined) => {
  if (typeof price === 'number') {
    return Number.isFinite(price) && price > 0 ? price : undefined;
  }

  if (typeof price === 'string') {
    const trimmed = price.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number.parseFloat(trimmed.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

export const resolveTpReferencePrice = (
  latestPrice: number,
  options: ResolveTpReferencePriceOptions = {}
): number => {
  const normalizedLatestPrice = Number.isFinite(latestPrice) ? latestPrice : 0;

  const candidates = [options.limitOrderPrice, options.fallbackLimitPrice]
    .map(normalizePriceInput)
    .filter((value): value is number => typeof value === 'number');

  const limitPrice = candidates.length > 0 ? candidates[0] : undefined;

  if (options.shouldUseLimitPrice && typeof limitPrice === 'number') {
    return limitPrice;
  }

  if (normalizedLatestPrice > 0) {
    return normalizedLatestPrice;
  }

  if (typeof limitPrice === 'number') {
    return limitPrice;
  }

  return 0;
};

// Take-profit targets are independent price-distance levels, NOT position
// allocations, so they are never capped to a shared total nor bounded above.
// This pass only floors each target at the minimum; the upper bound is open so
// high-leverage users can set very large targets. (Allocation sum-to-100 is
// enforced separately on target.amount via clampTargetAmountsToTotal.)
export const clampTargetsToTotal = (
  targets: MultiTP[],
  minimum: number
): MultiTP[] =>
  targets.map((target) => ({
    ...target,
    target: formatNumericString(
      sanitizePercentageInput(target.target, minimum, Number.POSITIVE_INFINITY)
    ),
  }));

const extractNumericSuffix = (value: string): number | null => {
  const match = value.match(/(\d+)$/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const reserveIdentifier = (
  value: string | null | undefined,
  usedIdentifiers: Set<string>,
  usedNumericSuffixes: Set<number>,
  allowDuplicateWith?: string
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (usedIdentifiers.has(trimmed) && trimmed !== allowDuplicateWith) {
    return undefined;
  }

  usedIdentifiers.add(trimmed);
  const numeric = extractNumericSuffix(trimmed);
  if (numeric !== null) {
    usedNumericSuffixes.add(numeric);
  }

  return trimmed;
};

const allocateIdentifier = (
  usedIdentifiers: Set<string>,
  usedNumericSuffixes: Set<number>,
  prefix: string
): string => {
  let counter = 1;
  let candidate = `${prefix}-${counter}`;

  while (usedIdentifiers.has(candidate)) {
    counter += 1;
    candidate = `${prefix}-${counter}`;
  }

  usedIdentifiers.add(candidate);
  usedNumericSuffixes.add(counter);
  return candidate;
};

export const getNextMultiTpId = (
  targets: MultiTP[] | null | undefined,
  options: { prefix?: string } = {}
): string => {
  const prefix = options.prefix ?? MULTI_TP_ID_PREFIX;
  const usedIdentifiers = new Set<string>();
  const usedNumericSuffixes = new Set<number>();

  (targets ?? []).forEach((target) => {
    if (!target) {
      return;
    }
    const identifiers = [target.uuid];
    identifiers.forEach((value) => {
      reserveIdentifier(
        value ?? undefined,
        usedIdentifiers,
        usedNumericSuffixes
      );
    });
  });

  return allocateIdentifier(usedIdentifiers, usedNumericSuffixes, prefix);
};

const normalizeTarget = (
  t: MultiTP,
  usedIdentifiers: Set<string>,
  usedNumericSuffixes: Set<number>,
  options: { prefix: string }
): MultiTP | null => {
  if (!t) {
    return null;
  }

  const prefix = options.prefix;

  let id = reserveIdentifier(t.uuid, usedIdentifiers, usedNumericSuffixes);
  let uuid = reserveIdentifier(
    t.uuid,
    usedIdentifiers,
    usedNumericSuffixes,
    id
  );

  if (!id) {
    if (uuid) {
      id = uuid;
    } else {
      id = allocateIdentifier(usedIdentifiers, usedNumericSuffixes, prefix);
    }

    reserveIdentifier(id, usedIdentifiers, usedNumericSuffixes, id);
  }

  if (!uuid) {
    uuid = id;
    reserveIdentifier(uuid, usedIdentifiers, usedNumericSuffixes, id);
  }

  const rawTarget = Number.parseFloat(String(t.target ?? '0'));
  // No upper cap on the TP target value (high-leverage users may target
  // thousands of %). Keep the lower floor so stop-loss magnitudes (negative
  // targets) stay bounded.
  const clampedTarget = Number.isFinite(rawTarget)
    ? Math.max(-MAX_TARGET_PERCENTAGE, rawTarget)
    : 0;

  const target = formatNumericString(clampedTarget, 3);

  const amount = formatNumericString(
    sanitizeAmountInput(t.amount ?? 0, 0, MAX_TARGET_PERCENTAGE)
  );

  const normalized: MultiTP = {
    ...t,
    uuid,
    target,
    amount,
  };

  return normalized;
};

const areTargetsEqual = (a: MultiTP, b: MultiTP): boolean => {
  if (a === b) {
    return true;
  }

  return (
    a.uuid === b.uuid &&
    a.target === b.target &&
    a.amount === b.amount &&
    (a.fixed ?? undefined) === (b.fixed ?? undefined)
  );
};

export const normalizeMultiTpTargets = (
  targets: MultiTP[] | null | undefined,
  options: { prefix?: string } = {}
): MultiTP[] => {
  const prefix = options.prefix ?? MULTI_TP_ID_PREFIX;

  if (!Array.isArray(targets)) {
    return [];
  }

  if (targets.length === 0) {
    return targets as MultiTP[];
  }

  const usedIdentifiers = new Set<string>();
  const usedNumericSuffixes = new Set<number>();
  let mutated = false;
  const normalizedTargets: MultiTP[] = [];

  targets.forEach((target) => {
    const normalized = target
      ? normalizeTarget(target, usedIdentifiers, usedNumericSuffixes, {
          prefix,
        })
      : null;

    if (!normalized) {
      mutated = true;
      return;
    }

    normalizedTargets.push(normalized);
  });

  if (!mutated && normalizedTargets.length === targets.length) {
    for (let index = 0; index < targets.length; index += 1) {
      const original = targets[index];
      const next = normalizedTargets[index];
      if (!original || !next || !areTargetsEqual(original, next)) {
        mutated = true;
        break;
      }
    }
  }

  return mutated ? normalizedTargets : (targets as MultiTP[]);
};

export const hasConfiguredMultiTpTargets = (
  targets: MultiTP[] | null | undefined
): boolean => {
  if (!Array.isArray(targets)) {
    return false;
  }

  return targets.some((t) => {
    if (!t) {
      return false;
    }

    const target = Number(t.target);
    const amount = Number(t.amount);
    const hasPercentage = Number.isFinite(target) && target > 1e-3;
    const hasAmount = Number.isFinite(amount) && amount > 1e-3;

    return hasPercentage || hasAmount;
  });
};

export const clampTargetAmountsToTotal = (
  targets: MultiTP[],
  changedIndex: number,
  maximum: number,
  boundAmountPaths: Set<string>,
  getPath: (targetId: string) => string
): MultiTP[] => {
  const normalized = targets.map((target) => ({
    ...target,
    amount: formatNumericString(
      sanitizeAmountInput(target.amount ?? 0, 0, maximum)
    ),
  }));

  const total = normalized.reduce(
    (sum, target) => sum + (Number.parseFloat(target.amount) || 0),
    0
  );

  let overflow = total - maximum;
  if (overflow <= EPSILON) {
    return normalized;
  }

  const adjustmentOrder = normalized.reduce<number[]>((order, _, index) => {
    if (index === changedIndex) {
      order.unshift(index);
      return order;
    }
    order.push(index);
    return order;
  }, []);

  for (const index of adjustmentOrder) {
    if (overflow <= EPSILON) {
      break;
    }

    if (index < 0 || index >= normalized.length) {
      continue;
    }

    const target = normalized[index];
    const path = getPath(target.uuid);
    if (boundAmountPaths.has(path)) {
      continue;
    }

    const currentValue = Number.parseFloat(target.amount) || 0;
    const reducible = Math.max(0, currentValue);

    if (reducible <= EPSILON) {
      continue;
    }

    const deduction = Math.min(reducible, overflow);
    const nextValue = currentValue - deduction;
    normalized[index] = {
      ...target,
      amount: formatNumericString(nextValue),
    };

    overflow -= deduction;
  }

  return normalized;
};

export const validateTpTarget = (
  value: string,
  minimum: number,
  maximum: number,
  isBound: boolean,
  previousTargetValue?: number
): {
  isValid: boolean;
  message: string;
} => {
  if (isBound) {
    return { isValid: true, message: '' };
  }

  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) {
    return {
      isValid: false,
      message: Number.isFinite(maximum)
        ? `Enter a take profit between ${minimum.toFixed(2)}% and ${maximum.toFixed(2)}%`
        : `Enter a take profit of at least ${minimum.toFixed(2)}%`,
    };
  }

  // Check minimum gap from previous target
  if (
    previousTargetValue !== undefined &&
    Number.isFinite(previousTargetValue)
  ) {
    const minRequired = previousTargetValue + 0.5;
    if (numericValue < minRequired - EPSILON) {
      return {
        isValid: false,
        message: `Must be at least 0.5% higher than previous target (${previousTargetValue.toFixed(2)}%)`,
      };
    }
  }

  if (numericValue < minimum - EPSILON) {
    return {
      isValid: false,
      message: `Minimum take profit is ${minimum.toFixed(2)}%`,
    };
  }

  if (numericValue > maximum + EPSILON) {
    return {
      isValid: false,
      message: `Maximum take profit is ${maximum.toFixed(2)}%`,
    };
  }

  return { isValid: true, message: '' };
};
