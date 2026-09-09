import type { BotFormFeatureFlags } from '@/contexts/bots/form/BotFormProvider';
import { StrategyEnum, type DCABotSettings } from '@/types';
import type { BotFormData } from '@/types/bots/form';

export type ExperimentalToggleKey = Extract<
  keyof DCABotSettings,
  'feeOrder' | 'autoRebalancing' | 'remainderFullAmount' | 'adaptiveClose'
>;

export interface ExperimentalToggleDefinition {
  id: ExperimentalToggleKey;
  label: string;
  description: string;
  helpUrl?: string;
  featureFlag?: string;
}

export const DEFAULT_EXPERIMENTAL_TOGGLES: ExperimentalToggleDefinition[] = [
  {
    id: 'feeOrder',
    label: 'Reduce Dust',
    description:
      'Automatically includes exchange fees in order calculation to reduce dust amounts',
    helpUrl: '/help/fee-order-reduce-dust',
    featureFlag: 'experimentalFeeOrder',
  },
  {
    id: 'autoRebalancing',
    label: 'Auto Rebalancing',
    description:
      'Automatically rebalances bot positions based on market conditions',
    featureFlag: 'experimentalAutoRebalancing',
  },
  {
    id: 'remainderFullAmount',
    label: 'Rescue partially filled orders',
    description:
      'Attempts to rescue partially filled orders by adjusting position size',
    featureFlag: 'experimentalRemainderFullAmount',
  },
  {
    id: 'adaptiveClose',
    label: 'Adaptive Close',
    description:
      'Dynamically adjusts closing conditions based on market volatility',
    helpUrl: '/help/adaptive-close',
    featureFlag: 'experimentalAdaptiveClose',
  },
];

export const DEFAULT_EXPERIMENTAL_TOGGLE_KEYS: ExperimentalToggleKey[] =
  DEFAULT_EXPERIMENTAL_TOGGLES.map((definition) => definition.id);

export const getExperimentalToggleKeys = (
  definitions: ExperimentalToggleDefinition[]
): ExperimentalToggleKey[] => {
  const keys = definitions.map((definition) => definition.id);
  return Array.from(
    new Set<ExperimentalToggleKey>([
      ...DEFAULT_EXPERIMENTAL_TOGGLE_KEYS,
      ...keys,
    ])
  );
};

export const deriveUseExperimentalState = (
  explicitValue: boolean,
  toggles: Partial<Record<ExperimentalToggleKey, boolean>>
): boolean => {
  if (explicitValue) {
    return true;
  }

  return Object.values(toggles).some((value) => value === true);
};

export const getTogglesToClear = (
  formData: Pick<BotFormData['dca'], ExperimentalToggleKey>,
  definitions: ExperimentalToggleDefinition[],
  lockedToggles?: Partial<
    Record<'useExperimental' | ExperimentalToggleKey, boolean>
  >
): ExperimentalToggleKey[] =>
  getExperimentalToggleKeys(definitions).filter(
    (key) => Boolean(formData[key]) && !lockedToggles?.[key]
  );

export interface ExperimentalToggleComputedState extends ExperimentalToggleDefinition {
  disabled: boolean;
  reasons: string[];
  effectiveValue: boolean;
  checked: boolean;
}

export interface ExperimentalSectionComputedState {
  toggles: ExperimentalToggleComputedState[];
  sectionDisabled: boolean;
  sectionDisabledReason?: string;
  lockedUseExperimental: boolean;
  hasActiveDealsInBot: boolean;
  isKucoin: boolean;
  isLong: boolean;
}

export interface ExperimentalSectionStateParams {
  formData: BotFormData;
  toggleDefinitions: ExperimentalToggleDefinition[];
  featureFlags: BotFormFeatureFlags;
  lockedToggles?: Partial<
    Record<'useExperimental' | ExperimentalToggleKey, boolean>
  >;
  isSectionDisabled?: boolean;
  sectionDisabledReason?: string;
  activeDealCount?: number;
  hasActiveDeals?: boolean;
  exchangeProvider?: string | undefined;
}

const LOCKED_TOGGLE_REASON = 'This field is locked in the current edit mode.';
const KUCOIN_ACTIVE_TOGGLE_REASON =
  'Disable Reduce Dust before using a KuCoin exchange.';
const KUCOIN_LONG_REASON = 'Not supported on KuCoin long bots.';
const ACTIVE_DEALS_REASON = 'Disable active deals before changing this option.';
const DEFAULT_SECTION_LOCK_REASON =
  'Experimental settings are locked for this bot.';

export const computeExperimentalSectionState = (
  params: ExperimentalSectionStateParams
): ExperimentalSectionComputedState => {
  const {
    formData,
    toggleDefinitions,
    featureFlags,
    lockedToggles = {},
    isSectionDisabled,
    sectionDisabledReason,
    activeDealCount,
    hasActiveDeals,
    exchangeProvider,
  } = params;

  const isComboBot = formData.type === 'combo';
  const isFutures = Boolean(
    isComboBot ? formData.combo.futures : formData.dca.futures
  );
  const isLong =
    (isComboBot ? formData.combo.strategy : formData.dca.strategy) ===
    StrategyEnum.long;
  const exchangeSlug = (formData.exchangeUUID || '').toLowerCase();
  const providerSlug = (exchangeProvider || exchangeSlug || '').toLowerCase();
  const isKucoin = providerSlug.includes('kucoin');

  const lockedUseExperimental = Boolean(lockedToggles.useExperimental);
  const derivedSectionDisabled = Boolean(
    isSectionDisabled || lockedUseExperimental
  );
  const derivedSectionDisabledReason =
    sectionDisabledReason ||
    (lockedUseExperimental ? DEFAULT_SECTION_LOCK_REASON : undefined);

  const normalizedActiveDeals =
    typeof activeDealCount === 'number' && !Number.isNaN(activeDealCount)
      ? activeDealCount
      : hasActiveDeals
        ? 1
        : 0;
  const hasActiveDealsInBot = normalizedActiveDeals > 0;

  const gatingRules: Record<
    ExperimentalToggleKey,
    {
      visible: boolean;
      disabled?: boolean;
      disabledReason?: string;
      checked: boolean;
    }
  > = {
    feeOrder: {
      visible: isComboBot && !isFutures,
      ...(isKucoin && isLong
        ? { disabled: true, disabledReason: KUCOIN_LONG_REASON }
        : {}),
      checked: isComboBot ? !!formData.combo.feeOrder : !!formData.dca.feeOrder,
    },
    autoRebalancing: {
      visible: isComboBot && !isFutures,
      checked: isComboBot
        ? !!formData.combo.autoRebalancing
        : !!formData.dca.autoRebalancing,
    },
    remainderFullAmount: {
      visible: !isComboBot,
      checked: isComboBot
        ? !!formData.combo.remainderFullAmount
        : !!formData.dca.remainderFullAmount,
    },
    // Spot only. Adaptive close re-sizes a refused close from the wallet's
    // free balance of the base asset, which is the closeable quantity on spot
    // and nothing of the sort on futures — a perp wallet holds collateral, not
    // the coin. The engine now refuses to run it on futures, so offering the
    // toggle there would advertise a setting that provably does nothing.
    adaptiveClose: {
      visible: !isFutures,
      checked: isComboBot
        ? !!formData.combo.adaptiveClose
        : !!formData.dca.adaptiveClose,
    },
  };

  const states: ExperimentalToggleComputedState[] = [];

  toggleDefinitions
    .filter((definition) => {
      if (!definition.featureFlag) {
        return true;
      }
      return featureFlags[definition.featureFlag] !== false;
    })
    .forEach((definition) => {
      const gating = gatingRules[definition.id];
      const visible = gating ? gating.visible !== false : true;

      if (!visible) {
        return;
      }

      let disabled = false;
      const reasons: string[] = [];

      if (derivedSectionDisabled) {
        disabled = true;
        if (derivedSectionDisabledReason) {
          reasons.push(derivedSectionDisabledReason);
        }
      }

      if (gating?.disabled) {
        disabled = true;
        if (gating.disabledReason) {
          reasons.push(gating.disabledReason);
        }
      }

      if (lockedToggles[definition.id]) {
        disabled = true;
        reasons.push(LOCKED_TOGGLE_REASON);
      }

      if (definition.id === 'feeOrder') {
        if (hasActiveDealsInBot) {
          disabled = true;
          reasons.push(ACTIVE_DEALS_REASON);
        }

        if (
          isKucoin &&
          (isComboBot ? formData.combo.feeOrder : formData.dca.feeOrder)
        ) {
          disabled = true;
          reasons.push(KUCOIN_ACTIVE_TOGGLE_REASON);
        }

        if (isKucoin && isLong) {
          disabled = true;
          reasons.push(KUCOIN_LONG_REASON);
        }
      }

      const uniqueReasons = Array.from(new Set(reasons));
      const effectiveValue =
        definition.id === 'feeOrder' && isKucoin && isLong
          ? false
          : isComboBot
            ? Boolean(formData['combo'][definition.id])
            : Boolean(formData['dca'][definition.id]);

      states.push({
        ...definition,
        disabled,
        reasons: uniqueReasons,
        effectiveValue,
        checked: gatingRules[definition.id].checked,
      });
    });

  return {
    toggles: states,
    sectionDisabled: derivedSectionDisabled,
    ...(derivedSectionDisabledReason !== undefined
      ? { sectionDisabledReason: derivedSectionDisabledReason }
      : {}),
    lockedUseExperimental,
    hasActiveDealsInBot,
    isKucoin,
    isLong,
  };
};
