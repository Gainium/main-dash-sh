import type { BotFormMode } from '@/contexts/bots/form/BotFormProvider';
import { getPlanLimits } from '@/lib/planLimits';
import { normalizePairKey } from '@/utils/pairs';

export { normalizePairKey };

/**
 * Whether the user's plan is the free / trial tier. Delegates to the
 * plan-limits adapter — sh returns `false` (no plan tiers), cloud
 * inspects the plan name.
 */
export const isFreeOrTrialPlan = (planName?: string | null): boolean =>
  getPlanLimits(planName).isFreePlan;

/**
 * Whether the user's plan disallows enabling multi-pair mode. Returns
 * `false` when `useMulti` is already on (we don't take away what was
 * already enabled) and `false` in sh by default (no plan restrictions).
 */
export const shouldRestrictMulti = (
  planName: string | null | undefined,
  useMulti: boolean
): boolean => {
  if (useMulti) {
    return false;
  }
  return getPlanLimits(planName).multiPairRestricted;
};

export const findMissingPairs = (
  pairs: string[],
  metadataSources: Array<Record<string, unknown> | null | undefined>
): string[] => {
  const knownPairs = new Set<string>();

  metadataSources.forEach((source) => {
    if (!source) {
      return;
    }

    Object.keys(source).forEach((key) => {
      knownPairs.add(normalizePairKey(key));
    });
  });

  const seenPairs = new Set<string>();

  return pairs.reduce<string[]>((acc, pair) => {
    const normalized = normalizePairKey(pair);
    if (seenPairs.has(normalized)) {
      return acc;
    }
    seenPairs.add(normalized);

    if (!knownPairs.has(normalized)) {
      acc.push(pair);
    }

    return acc;
  }, []);
};

export type MultiToggleMessageKey =
  | 'locked-edit'
  | 'combo-blocked'
  | 'plan-upgrade'
  | null;

export interface ResolveMultiToggleStateInput {
  isUseMultiLocked: boolean;
  isComboBot: boolean;
  planRestrictsMulti: boolean;
}

export interface ResolveMultiToggleStateResult {
  disabled: boolean;
  messageKey: Exclude<MultiToggleMessageKey, null> | null;
}

export const resolveMultiToggleState = (
  input: ResolveMultiToggleStateInput
): ResolveMultiToggleStateResult => {
  if (input.isUseMultiLocked) {
    return { disabled: true, messageKey: 'locked-edit' };
  }

  if (input.isComboBot) {
    return { disabled: true, messageKey: 'combo-blocked' };
  }

  if (input.planRestrictsMulti) {
    return { disabled: true, messageKey: 'plan-upgrade' };
  }

  return { disabled: false, messageKey: null };
};

export interface MultiToggleMessageDescriptor {
  message: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export const resolveMultiToggleMessageDescriptor = (
  state: ResolveMultiToggleStateResult
): MultiToggleMessageDescriptor | null => {
  switch (state.messageKey) {
    case 'locked-edit':
      return {
        message:
          'Multiple pairs configuration is locked while editing existing bots.',
      };
    case 'combo-blocked':
      return {
        message: /* 'Multiple pairs are not available for combo bots.' */ '',
      };
    case 'plan-upgrade':
      return {
        message: 'Multiple pairs are available on paid plans.',
        ctaHref: '/subscription',
        ctaLabel: 'Upgrade account',
      };
    default:
      return null;
  }
};

export interface PlanLimitMessageDescriptor {
  message: string;
  ctaHref?: string;
  ctaLabel?: string;
  ctaSuffix?: string;
}

export interface ResolvePlanLimitMessageDescriptorInput {
  useMulti: boolean;
  isFreePlan: boolean;
  maxAllowedPairs: number;
}

export const resolvePlanLimitMessageDescriptor = (
  input: ResolvePlanLimitMessageDescriptorInput
): PlanLimitMessageDescriptor | null => {
  if (!input.useMulti) {
    return null;
  }

  // No finite cap → no message (sh path, where the plan-limits adapter
  // returns `Infinity`).
  if (!Number.isFinite(input.maxAllowedPairs)) {
    return null;
  }

  const baseMessage = `Maximum pairs to choose is ${input.maxAllowedPairs}.`;

  if (input.isFreePlan) {
    return {
      message: baseMessage,
      ctaHref: '/subscription',
      ctaLabel: 'Upgrade account',
      ctaSuffix: 'for higher limits.',
    };
  }

  return {
    message: baseMessage,
  };
};

export type PairLockReason = 'external-lock' | 'edit-single-pair' | null;

export interface ResolvePairsLockStateInput {
  externallyLocked: boolean | null | undefined;
  mode: BotFormMode;
  useMulti: boolean;
}

export interface ResolvePairsLockStateResult {
  locked: boolean;
  reason: PairLockReason;
}

export const resolvePairsLockState = (
  input: ResolvePairsLockStateInput
): ResolvePairsLockStateResult => {
  if (typeof input.externallyLocked === 'boolean') {
    return {
      locked: input.externallyLocked,
      reason: input.externallyLocked ? 'external-lock' : null,
    };
  }

  if (input.mode === 'edit') {
    return { locked: false, reason: null };
  }

  return { locked: false, reason: null };
};

export interface ResolveMaxAllowedPairsInput {
  /**
   * Plan name from the user profile. The plan-limits adapter resolves
   * the actual cap; in sh the cap is unbounded so this value is
   * effectively ignored.
   */
  planName?: string | null;
  /** Legacy free-plan flag — kept so existing call sites compile. When
   *  present and `planName` is omitted, treated as "free plan" to keep
   *  cloud's previous behavior. */
  isFreePlan?: boolean;
  useMulti: boolean;
}

export const resolveMaxAllowedPairs = (
  input: ResolveMaxAllowedPairsInput
): number => {
  if (!input.useMulti) {
    return 1;
  }

  // Prefer the plan name when provided; fall back to the legacy
  // `isFreePlan` boolean (cloud still passes this through some flows).
  if (input.planName !== undefined) {
    return getPlanLimits(input.planName).maxAllowedPairs;
  }
  // `'paid'` (not null) for the non-free legacy path: the resolver treats an
  // empty/null name as free-tier, which would cap paying users at the free
  // pair limit. Any non-free sentinel resolves to the paid cap.
  return getPlanLimits(input.isFreePlan ? 'free' : 'paid').maxAllowedPairs;
};

export type ExchangeLockReason = 'explicit-lock' | 'edit-mode' | null;

export interface ResolveExchangeLockStateInput {
  lockedOverride: boolean | null | undefined;
  mode: 'create' | 'edit';
}

export interface ResolveExchangeLockStateResult {
  locked: boolean;
  reason: ExchangeLockReason;
}

export const resolveExchangeLockState = (
  input: ResolveExchangeLockStateInput
): ResolveExchangeLockStateResult => {
  if (input.lockedOverride === true) {
    return { locked: true, reason: 'explicit-lock' };
  }

  if (input.lockedOverride === false) {
    return { locked: false, reason: null };
  }

  if (input.mode === 'edit') {
    return { locked: true, reason: 'edit-mode' };
  }

  return { locked: false, reason: null };
};
