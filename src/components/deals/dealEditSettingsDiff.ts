import {
  BotTypesEnum,
  type ComboBotSettings,
  type DCABotSettings,
  type DCADealsSettings,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * The deal-edit diff: form state in, the settings object the editDeal mutation
 * carries out.
 *
 * Lives in its own module (rather than inside DealEditDrawer.tsx) so it can be
 * driven directly by tests/dealEditPayloadSchema.unit.test.ts — the same reason
 * `bulkAdjustFundsTargets.ts` sits beside its dialog. Nothing here is React.
 */

/**
 * Keys the deal-edit diff may emit for a COMBO deal but never for a DCA one.
 *
 * The wire contract, not a UI preference: main-app's `dcaDealSettingsInputSet`
 * does not declare these, and GraphQL rejects an undeclared input field for the
 * whole operation, so one stray key fails the entire save with a 400. Keep this
 * in sync with `comboDealSettingsInputSet` minus `dcaDealSettingsInputSet` in
 * main-app `core/src/graphql/schema.ts`; as of 2026-08-28 `gridLevel` is the
 * only member the drawer's `keys` array can produce.
 */
export const COMBO_ONLY_DEAL_SETTING_KEYS = new Set<string>(['gridLevel']);

/**
 * Exported for tests/dealEditPayloadSchema.unit.test.ts, which asserts the
 * emitted settings object is a subset of what main-app's
 * `{dca,combo}DealSettingsInputSet` declares. Not part of the component's API.
 */
export const mapFromDataToDealSettings = (
  formData: BotFormData,
  isMultiple: boolean,
  reset?: boolean,
  originalTradeSettings?: DCADealsSettings
) => {
  const newState =
    formData.type === BotTypesEnum.combo ? formData.combo : formData.dca;
  const originalState =
    originalTradeSettings ??
    ((formData.originalBot?.type === formData.type
      ? formData.originalBot.settings
      : undefined) as DCABotSettings | ComboBotSettings | undefined);
  const keys = [
    'avgPrice',
    'ordersCount',
    'step',
    'baseOrderPrice',
    'useLimitPrice',
    'startOrderType',
    'tpPerc',
    'profitCurrency',
    'baseOrderSize',
    'orderSize',
    'useTp',
    'useDca',
    'useSmartOrders',
    'activeOrdersCount',
    'volumeScale',
    'stepScale',
    'minimumDeviation',
    'useSl',
    'slPerc',
    'trailingSl',
    'moveSL',
    'moveSLTrigger',
    'moveSLValue',
    'moveSLForAll',
    'trailingTp',
    'trailingTpPerc',
    'useMinTP',
    'minTp',
    'orderSizeType',
    'useMultiSl',
    'multiSl',
    'useMultiTp',
    'multiTp',
    'dealCloseCondition',
    'dealCloseConditionSL',
    'closeDealType',
    'futures',
    'coinm',
    'marginType',
    'leverage',
    // This array is the only thing that decides what reaches the editDeal
    // mutation, so a field the UI can change and this list omits is silently
    // unsaveable — the drawer closes as if it had saved and the deal keeps its
    // old value.
    //
    // `gridLevel` is COMBO-ONLY and is filtered out below for a DCA deal.
    // It is declared on `comboDealSettingsInputSet` and NOT on
    // `dcaDealSettingsInputSet`, so shipping it to `changeDCADealSettings`
    // is not a no-op — GraphQL rejects the whole variable before the resolver
    // runs and the save fails outright with
    //   Field "gridLevel" is not defined by type "dcaDealSettingsInputSet".
    //
    // It is on the list at all because DCASettings renders the combo "DCA
    // grid levels" input under `isComboBot` with no deal-edit guard, and the
    // drawer now takes its bot type from the caller's `botType` prop so that
    // branch really does fire for a combo deal. Covered by
    // tests-e2e/specs/deal-edit-gridlevel.e2e.test.ts.
    //
    // ⚠️ Do NOT rely on "the input is read-only, so it never differs from the
    // original and never ships" — that reasoning held for combo and was false
    // for DCA, which is how this broke. Read-only freezes `newValue` at
    // whatever SEEDED the slice; it says nothing about `original`. On a DCA
    // deal nothing seeds it, so the slice keeps `DCA_FORM_DEFAULTS.gridLevel`
    // ('5') while `original` is `undefined` — neither the DCA bot-settings
    // fragment nor the DCA deal fragment selects `gridLevel` — so the diff
    // below found a change on every single save. `orderSize` and `step` are
    // genuinely inert (both input sets declare them); `gridLevel` was not.
    'gridLevel',
    'useFixedTPPrices',
    'useFixedSLPrices',
    'dcaCondition',
    'closeByTimer',
    'closeByTimerUnits',
    'closeByTimerValue',
    'dcaCustom',
    'comboTpBase',
    'fixedSlPrice',
    'fixedTpPrice',
    'comboUseSmartGrids',
    'comboSmartGridsCount',
    'baseSlOn',
    'dcaVolumeBaseOn',
    'dcaVolumeRequiredChangeRef',
    'dcaVolumeMaxValue',
    'dcaVolumeRequiredChange',
    // ── Declared on DCADealsSettings but DELIBERATELY absent from this list.
    // Checked 2026-08-14; don't re-derive, and don't add them "for symmetry".
    //
    // `scaleDcaType` — DCASettings renders its control inside a
    //   `{!isComboBot && !isDealEdit && …}` guard, so it is unreachable in
    //   both `deal-edit` and `deal-mass-edit`.
    //
    // `useRiskReward`, `riskUseTpRatio` — written only by RiskRewardSettings,
    //   which is mounted only by RiskRewardSettingsTab, which appears only in
    //   the full bot-form tab registries (bot-types/{dca,combo}/form/tabs).
    //   This drawer builds its own `visibleDescriptors` — a literal
    //   `useMemo(…, [])` of exactly strategy / take-profit / stop-loss / dca,
    //   with no branch on mode — so there is no Risk:Reward section in either
    //   drawer mode. (`sectionToggleMap` still maps 'risk-reward' →
    //   'useRiskReward'; that entry is dead, no descriptor has that id.)
    //   Confirmed in the running app against a real open deal: the drawer
    //   renders those four sections and no Risk:Reward anywhere.
    //
    //   Adding them would be a behaviour change, not a fix. `useRiskReward`
    //   IS set per-deal (types/dcaDeal.ts reads `deal.settings.useRiskReward`
    //   as `riskBased`), so on a risk-based deal whose bot has it off, the
    //   diff below would find new ≠ original and start shipping
    //   `useRiskReward` on every save of a control the user cannot see.
  ].filter((k) => {
    // Combo-only fields must never reach `changeDCADealSettings`: they are
    // absent from `dcaDealSettingsInputSet`, and an undeclared input field is
    // a hard GraphQL validation error (HTTP 400), not a silently ignored one.
    // See the `gridLevel` note above for how that broke every DCA deal edit.
    if (
      COMBO_ONLY_DEAL_SETTING_KEYS.has(k) &&
      formData.type !== BotTypesEnum.combo
    ) {
      return false;
    }
    return isMultiple ? k !== 'baseOrderSize' && k !== 'orderSize' : true;
  }) as (keyof DCADealsSettings)[];
  const result: Partial<DCADealsSettings> = keys.reduce((acc, key) => {
    const k = key as keyof DCADealsSettings;
    if (!(k in newState)) {
      return acc;
    }
    const original =
      originalState && k in originalState
        ? originalState[k as keyof typeof originalState]
        : undefined;
    let newValue = newState[k as keyof typeof newState];
    if (
      newValue === original ||
      (`${newValue}` === 'undefined' && `${original}` === 'null') ||
      (`${original}` === 'undefined' && `${newValue}` === 'null') ||
      ((typeof newValue === 'number' && typeof original === 'string') ||
      (typeof newValue === 'string' && typeof original === 'number')
        ? `${newValue}` === `${original}`
        : false)
    ) {
      return acc;
    }
    if (typeof original === 'number' && typeof newValue === 'string') {
      newValue = parseFloat(newValue);
    }
    //@ts-expect-error accumulator typing
    acc[k] = reset ? (original ?? newValue) : (newValue ?? original);
    return acc;
  }, {} as DCADealsSettings);
  return result;
};
