import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { resolveOrderSizeDecimals } from '@/features/bots/shared/utils/order-guard';
import {
  computeInvestmentFromDca,
  distributeInvestmentToDca,
} from '@/features/bots/widgets/BotForm/components/quickSetupPresets';
import {
  BotTypesEnum,
  CloseConditionEnum,
  type HedgeBotSettings,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

export type HedgeQuickPresetId = 'conservative' | 'balanced' | 'aggressive';

export interface HedgeQuickPreset {
  id: HedgeQuickPresetId;
  label: string;
  tagline: string;
  /** Hedge-level shared TP/SL. Applied to `sharedSettings`. */
  shared: Partial<HedgeBotSettings>;
  /** Per-leg DCA overrides. Applied on top of DCA_FORM_DEFAULTS to seed
   *  both the long and short leg formData. */
  legValues: Partial<BotFormData['dca']>;
}

/**
 * Pure risk-allocation presets for hedge bots. Each preset configures
 * both the shared hedge controller (TP/SL applied to both legs at once)
 * and identical per-leg DCA settings — the strategy direction of each
 * leg is enforced separately by the hedge layout.
 */
export const HEDGE_QUICK_PRESETS: HedgeQuickPreset[] = [
  {
    id: 'conservative',
    label: 'Conservative',
    tagline: 'Small TP, light averaging on both legs.',
    shared: {
      useTp: true,
      tpPerc: '1.5',
      useSl: false,
      slPerc: '-10',
      dealCloseCondition: CloseConditionEnum.tp,
    },
    legValues: {
      tpPerc: '1.5',
      ordersCount: '4',
      activeOrdersCount: '1',
      step: '1',
      stepScale: '1.1',
      volumeScale: '1.2',
      maxNumberOfOpenDeals: '3',
      maxDealsPerPair: '1',
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    tagline: 'Moderate TP and averaging across both legs.',
    shared: {
      useTp: true,
      tpPerc: '3',
      useSl: false,
      slPerc: '-10',
      dealCloseCondition: CloseConditionEnum.tp,
    },
    legValues: {
      tpPerc: '3',
      ordersCount: '8',
      activeOrdersCount: '2',
      step: '2',
      stepScale: '1.2',
      volumeScale: '1.5',
      maxNumberOfOpenDeals: '5',
      maxDealsPerPair: '1',
    },
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    tagline: 'Wider TP, deep averaging on each leg.',
    shared: {
      useTp: true,
      tpPerc: '6',
      useSl: false,
      slPerc: '-10',
      dealCloseCondition: CloseConditionEnum.tp,
    },
    legValues: {
      tpPerc: '6',
      ordersCount: '15',
      activeOrdersCount: '3',
      step: '3',
      stepScale: '1.3',
      volumeScale: '1.8',
      maxNumberOfOpenDeals: '5',
      maxDealsPerPair: '1',
    },
  },
];

export const getHedgeQuickPreset = (
  id: string | null
): HedgeQuickPreset | undefined =>
  HEDGE_QUICK_PRESETS.find((p) => p.id === id);

/** Full dca state a preset produces for one leg: defaults overlaid
 *  with the preset's legValues. */
export const getHedgeLegDcaState = (
  preset: HedgeQuickPreset
): BotFormData['dca'] =>
  ({
    ...DCA_FORM_DEFAULTS,
    ...preset.legValues,
  }) as BotFormData['dca'];

/**
 * One Quick leg's formData after applying a preset. A Hedge DCA leg keeps its
 * settings under `formData.dca`, a Hedge Combo leg under `formData.combo`
 * (overlaid on the combo defaults), so the preset lands in the slice the leg's
 * save and backtest read. The leg's total investment is preserved
 * (redistributed over the preset's new orders ladder), and its pinned
 * strategy / order-size denomination survive.
 */
export const applyHedgePresetToLeg = (
  prev: BotFormData,
  preset: HedgeQuickPreset
): BotFormData => {
  const slice = prev.type === BotTypesEnum.combo ? 'combo' : 'dca';
  const prevDca = prev[slice];
  const presetState =
    slice === 'combo'
      ? { ...COMBO_FORM_DEFAULTS, ...preset.legValues }
      : getHedgeLegDcaState(preset);
  const currentInvestment = computeInvestmentFromDca(prevDca);
  // Derive from the pair's real order-size scale; the old base?8:2
  // ternary rounded quote-denominated sizes to 2dp, zeroing sub-0.01
  // sizes on BTC-/ETH-quoted pairs (bug #467).
  const prevPair = Array.isArray(prev.pair) ? prev.pair[0] : prev.pair;
  const precision = resolveOrderSizeDecimals(
    prevDca.orderSizeType,
    prevPair ? prev.pairPrecisionMap?.[prevPair] : undefined
  );
  const merged = {
    ...presetState,
    strategy: prevDca.strategy,
    orderSizeType: prevDca.orderSizeType,
  } as BotFormData['dca'];
  const { baseOrderSize, orderSize } = distributeInvestmentToDca(
    currentInvestment,
    merged,
    precision
  );
  return {
    ...prev,
    [slice]: { ...merged, baseOrderSize, orderSize },
  };
};
