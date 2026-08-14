import { test, expect } from '@playwright/test';

import * as GainiumTypes from '@/types';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import { mapGridBotSettingsToFormData } from '@/mappers/bots/grid/map-grid-bot-settings-to-form-data';
import { mapGridFormDataToPayload } from '@/mappers/bots/grid/map-grid-form-data-to-payload';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Save round-trip coverage for the bot form.
 *
 * The form's own bindings are checked statically (scripts/verify-form-bindings.mjs).
 * This covers the other half: a field that binds correctly but does not survive
 * form -> payload -> form. That is the "I saved it and it didn't stick" class,
 * and it is invisible to both type-check and the binding checker because the
 * mappers are two independently-written field lists that can silently drift.
 *
 * Method: build a baseline with every feature gate ON (so gated fields actually
 * serialize), then for each field set it to a distinctive value on its own, run
 * the round trip, and assert the value comes back. One probe per field keeps a
 * failure attributable to that field instead of to some upstream toggle.
 *
 * A field that legitimately does not round-trip belongs in KNOWN_NOT_PERSISTED
 * with the reason. Anything not listed there is expected to survive.
 */

type Section = 'dca' | 'combo' | 'grid';

/** Enum member lookup, so a string field can be probed with a sibling value. */
const ENUMS: Record<string, string>[] = Object.values(
  GainiumTypes as unknown as Record<string, unknown>
).filter(
  (v): v is Record<string, string> =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.values(v).length > 1 &&
    Object.values(v).every((m) => typeof m === 'string')
);

const siblingEnumValue = (current: string): string | undefined => {
  for (const e of ENUMS) {
    const members = Object.values(e);
    if (members.includes(current)) {
      const other = members.find((m) => m !== current);
      if (other) return other;
    }
  }
  return undefined;
};

/**
 * Fields whose value cannot be probed generically. A union type that is not a
 * TS enum has no member list to draw a sibling from, so the value is named here.
 */
const PROBE_OVERRIDES: Record<string, unknown> = {
  profitCurrency: 'base',
  orderFixedIn: 'base',
  orderSizeReference: 'cost',
  stopStatus: 'open',
  prioritize: 'amount',
  gridType: 'arithmetic',
  tpSlCondition: 'priceChanged',
  slCondition: 'priceChanged',
  tpSlAction: 'close',
  slAction: 'close',
  hodlAt: '18:30',
  name: 'Round Trip Probe',
  pair: ['ETHUSDT'],
  // 'gt' appears in several enums; the generic sibling lookup picks the wrong
  // one. The mapper names the valid set: "Must be one of: gt, lt".
  closeAfterXprofitCond: 'lt',
  startBotPriceCondition: 'lt',
  stopBotPriceCondition: 'lt',
  stopStatus: 'monitoring',
  // Cross-field constraints the generic +3 would violate.
  moveSLValue: '0.3', // must stay below moveSLTrigger (0.5)
  dcaVolumeMaxValue: '5', // must be -1 (disabled) or positive
};

/**
 * Gates that cannot be turned on without a structured fixture (an indicator
 * list, TP/SL targets). Probing them just re-tests the mapper's validation.
 */
const NEEDS_FIXTURE: Record<string, string> = {
  useRiskReward: 'requires at least one indicator',
  dcaCondition: 'the sibling value (technical indicators) requires an indicator',
  useMultiTp: 'requires a multiTp target array',
  useMultiSl: 'requires a multiSl target array',
  useFixedTPPrices: 'requires a fixed TP price list',
  useFixedSLPrices: 'requires a fixed SL price list',
};

/**
 * Fields that are not expected to survive the round trip, with the reason.
 * Anything here is excluded from the assertion but still reported, so the list
 * stays honest as the mappers change.
 */
const KNOWN_NOT_PERSISTED: Record<string, string> = {
  // Client-only form state — never sent to the backend.
  indicators: 'structured; probed by the indicator-specific tests',
  indicatorGroups: 'structured; probed by the indicator-specific tests',
  multiTp: 'structured array; needs a shaped fixture',
  multiSl: 'structured array; needs a shaped fixture',
  dcaCustom: 'structured array; needs a shaped fixture',
  importFrom: 'client-only: names the preset a form was seeded from',
  askToReset: 'client-only: controls a confirmation dialog',
  dcaOrderGuard: 'client-only: guards DCA order edits mid-session',
  pairMetadata: 'client-only: exchange metadata cache',
  pairPrecisionMap: 'client-only: exchange metadata cache',
  userFee: 'client-only: fee lookup for previews',
  favoriteIndicators: 'stored on the user, not the bot',
  originalBot: 'client-only: the pre-edit snapshot',
  terminal: 'client-only: marks the terminal form, not a bot setting',
  avgPrice: 'deal-edit only; stripped from the bot payload by design',
  useExperimental:
    'stripped from the payload by design (map-form-data-to-payload.ts)',
};

/**
 * Known mapper asymmetries: the payload carries the value, the reverse mapper
 * has no read for it. Listed rather than fixed because the fix is a product
 * call, not a mechanical one. Excluded from the assertion but still printed,
 * so they stay visible instead of turning into a silent skip.
 */
const KNOWN_DRIFT: Record<string, Record<string, string>> = {
  grid: {
    feeOrder:
      'reaches the grid payload but no grid UI sets it; restoring it means deciding whether grid bots carry the setting at all',
    skipBalanceCheck: 'same as feeOrder — payload-only, no grid control',
  },
};

const numericString = (v: string): boolean => v.trim() !== '' && !isNaN(Number(v));

/** A value distinct from `current` but still valid for the field. */
const probeValue = (
  key: string,
  current: unknown
): { value: unknown } | { skip: string } => {
  if (key in NEEDS_FIXTURE) return { skip: NEEDS_FIXTURE[key] };
  if (key in PROBE_OVERRIDES) return { value: PROBE_OVERRIDES[key] };
  if (typeof current === 'boolean') return { value: !current };
  if (typeof current === 'number') {
    // Keep the sign: a field defaulting to -10 is a percentage floor.
    return { value: current < 0 ? current - 3 : current + 3 };
  }
  if (typeof current === 'string') {
    if (numericString(current)) {
      const n = Number(current);
      return { value: String(n < 0 ? n - 3 : n + 3) };
    }
    const sibling = siblingEnumValue(current);
    if (sibling) return { value: sibling };
    if (current === '') return { skip: 'empty default with no known value set' };
    return { skip: `no sibling value known for "${current}"` };
  }
  if (Array.isArray(current)) return { skip: 'array; needs a shaped fixture' };
  if (current && typeof current === 'object') {
    return { skip: 'object; needs a shaped fixture' };
  }
  return { skip: `unsupported type ${typeof current}` };
};

/** Baseline with every feature gate on, so gated fields reach the payload. */
const dcaBaseline = (defaults: Record<string, unknown>) => {
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'boolean' && k.startsWith('use')) out[k] = true;
  }
  // Gates that do not follow the `use*` convention.
  Object.assign(out, {
    cooldownAfterDealStart: true,
    cooldownAfterDealStop: true,
    moveSL: true,
    trailingTp: true,
    trailingSl: true,
    closeByTimer: true,
    // Keep validation satisfied. These gates each require a structured array
    // (indicators, TP/SL targets, fixed prices) that this baseline does not
    // build, so the mapper rejects the payload outright when they are on.
    startCondition: GainiumTypes.StartConditionEnum.asap,
    useRiskReward: false,
    useMultiTp: false,
    useMultiSl: false,
    useFixedTPPrices: false,
    useFixedSLPrices: false,
  });
  return out;
};

const gridBaseline = () => ({
  ...GRID_FORM_DEFAULTS,
  // Grid mapping validates the range, so give it a coherent one.
  lowPrice: 100,
  topPrice: 200,
  levels: 10,
  gridStep: 1,
  budget: 1000,
  tpSl: true,
  sl: true,
  useStartPrice: true,
  startPrice: '150',
});

const buildFormData = (section: Section, overrides: Record<string, unknown>) => {
  const dca = section === 'dca' ? overrides : dcaBaseline(DCA_FORM_DEFAULTS);
  const combo = section === 'combo' ? overrides : dcaBaseline(COMBO_FORM_DEFAULTS);
  const grid = section === 'grid' ? overrides : gridBaseline();
  const type =
    section === 'combo'
      ? BotTypesEnum.combo
      : section === 'grid'
        ? BotTypesEnum.grid
        : BotTypesEnum.dca;

  return {
    ...SHARED_FORM_DEFAULTS,
    type,
    exchangeUUID: 'exchange-uuid',
    dca,
    combo,
    grid,
  } as unknown as BotFormData;
};

type Trip =
  | { ok: true; back: Record<string, unknown>; payload: Record<string, unknown> }
  | { ok: false; errors: string[] };

/** form -> payload -> form, returning both the payload and the section that came back. */
const roundTrip = (section: Section, formData: BotFormData): Trip => {
  if (section === 'grid') {
    const result = mapGridFormDataToPayload(formData, { mode: 'edit' });
    if (!result.success) return { ok: false, errors: result.errors ?? ['failed'] };
    const payload = (result.updatePayload ?? result.createPayload ?? {}) as Record<
      string,
      unknown
    >;
    const back = mapGridBotSettingsToFormData(payload).formData;
    return {
      ok: true,
      payload,
      back: back.grid as unknown as Record<string, unknown>,
    };
  }

  const result = mapFormDataToPayload(formData, { mode: 'edit' });
  if (!result.success) return { ok: false, errors: result.errors ?? ['failed'] };
  const payload = (result.updatePayload ?? {}) as Record<string, unknown>;
  const botType = section === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca;
  const back = mapBotSettingsToFormData(botType, payload).formData;
  return {
    ok: true,
    payload,
    back: back[section] as unknown as Record<string, unknown>,
  };
};

/** '5' and 5 are the same saved value; the drift is reported separately. */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return String(a) === String(b);
};

/**
 * Fields that NO mapper writes — i.e. the mappers' coverage gap.
 *
 * READ THIS BEFORE INTERPRETING THE LIST. It used to mean "the fields that
 * silently revert on save", because the payload was assembled as
 * `{ ...DCA_FORM_DEFAULTS, ...finalData }` — a field the mappers skipped did
 * not arrive absent, it arrived as the FACTORY DEFAULT and overwrote whatever
 * the user chose. That is no longer so: the fallback layer is now the live
 * form slice, so an unmapped field ships the value the user is looking at.
 * The revert is prevented structurally, and pinned by the "no mapper gap can
 * revert a field to its factory default" test in formDefaultLeaks.unit.test.ts.
 *
 * So this list is now a COVERAGE pin, not a bug list. Being on it means only
 * that no mapper normalizes or validates the field — its value is passed
 * through. `debugInfo.fieldsMapped` is literally `Object.keys(finalData)`, so
 * anything missing from it is a field the mappers leave to the fallback.
 *
 * It still earns its place. A field arriving here means it lost its mapper,
 * and with it any gating, coercion or validation that mapper performed — which
 * is a real regression even though the user's value now survives.
 * `closeOrderType` was the motivating case: TakeProfitSettings offers it for
 * every non-combo, non-hedge bot with no dependence on the close condition,
 * while the mapper only wrote it under `techInd`/`dynamicAr` — so on the
 * default take-profit condition a user's MARKET was rewritten to LIMIT.
 *
 * This list is pinned in BOTH directions on purpose. A new entry means a field
 * just lost its mapper. A removed entry means one gained one and the list
 * should shrink to record it. Do not "update the pin" to make the suite pass
 * without establishing which of the two happened.
 */
/**
 * Verdict for every field in NEVER_MAPPED, established by driving
 * `mapFormDataToBackend` with each field's feature switched ON and checking
 * `debugInfo.fieldsMapped` and the mapper's own errors:
 *
 *   'bug'       — control is reachable, no validation error, value discarded.
 *                 Since the fallback layer became the form slice, a gap alone
 *                 no longer discards the value, so this verdict now means the
 *                 field needs the mapper's normalization/gating and isn't
 *                 getting it — not merely that no mapper writes it.
 *   'by-design' — deliberately stripped before the payload is built.
 *   'no-ui'     — nothing in the app writes it; not user-reachable.
 *   'gated:x'   — the mapper writes it once x is active, and the UI only
 *                 offers the control there. Correct.
 *
 * Every pinned field must appear here — the suite fails otherwise, so a field
 * cannot join the list without someone deciding which of the four it is.
 */
const VERDICT: Record<string, string> = {
  // --- Were bugs; mapped as of 2.43.19, so they now behave like any other
  //     gated field: written once their feature is on. useFixedSLPrices,
  //     startBotLogic and stopBotLogic are written unconditionally and have
  //     left this list entirely. ---
  fixedSlPrice: 'gated:useFixedSLPrices — was unmapped entirely until 2.43.19',
  // 2.43.19 fixed only the forward direction for these two: they reached the
  // payload but map-bot-settings-to-form-data had no read, so the value saved
  // and then came back as the default on the next load. The reverse read was
  // added in 2.43.20 alongside the fallback-layer fix.
  rrSlType: 'gated:useRiskReward — forward mapped 2.43.19, reverse read 2.43.20',
  rrSlFixedValue:
    'gated:useRiskReward — forward mapped 2.43.19, reverse read 2.43.20',

  // --- Deliberately not sent. ---
  avgPrice: 'by-design: deal-edit breakeven override, stripped in map-form-data-to-payload',
  useExperimental: 'by-design: stripped alongside avgPrice',
  importFrom: 'by-design: client-only record of the preset a form was seeded from',

  // --- No control writes these. ---
  autoRebalancing: 'no-ui: nothing in the app sets it',
  ignoreStartDeals:
    'no-ui: nothing in the app sets it, but the reverse mapper reads it (2.43.20) so a stored value is no longer reset by an unrelated save',

  // --- Correctly gated (verified by running the mapper with the gate on). ---
  useRiskReward: 'gated:useRiskReward + a riskReward indicator',
  riskSlType: 'gated:useRiskReward',
  riskSlAmountPerc: 'gated:useRiskReward',
  riskSlAmountValue: 'gated:useRiskReward',
  riskUseTpRatio: 'gated:useRiskReward',
  riskTpRatio: 'gated:useRiskReward',
  riskMinSl: 'gated:useRiskReward',
  riskMaxSl: 'gated:useRiskReward',
  riskMinPositionSize: 'gated:useRiskReward',
  riskMaxPositionSize: 'gated:useRiskReward',
  minOpenDeal: 'gated:useStaticPriceFilter',
  maxOpenDeal: 'gated:useStaticPriceFilter',
  volumeTop: 'gated:volumeValue=custom',
  relativeVolumeTop: 'gated:relativeVolumeValue=custom',
  dynamicPriceFilterOverValue: 'gated:direction=over (symmetric with UnderValue)',
  baseOrderPrice: 'gated:useLimitPrice',
  startBotPriceCondition: 'gated:botActualStart=price',
  startBotPriceValue: 'gated:botActualStart=price',
  stopBotPriceCondition: 'gated:botStart=price',
  stopBotPriceValue: 'gated:botStart=price',
  closeDealType: 'gated:dealCloseCondition=techInd|dynamicAr, UI in those panels',
  stopDealLogic: 'gated:dealCloseCondition=techInd, UI behind isTechIndicatorClose',
  dynamicArLockValue: 'gated:dealCloseCondition=dynamicAr',

  // --- Correctly gated, read from the mapper guard rather than executed. ---
  stopDealSlLogic: 'gated:SL close condition — guard read, not executed',
  multiTp: 'gated:useMultiTp — guard read, not executed',
  multiSl: 'gated:useMultiSl — guard read, not executed',
  dcaCustom: 'gated:dcaCondition=custom — guard read, not executed',
  hodlAt: 'gated:scheduled start condition — guard read, not executed',
  hodlDay: 'gated:scheduled start condition — guard read, not executed',
  hodlHourly: 'gated:scheduled start condition — guard read, not executed',
  hodlNextBuy: 'gated:scheduled start condition — guard read, not executed',
  gridLevel: 'gated:combo/smart-grid bot — guard read, not executed',
  baseStep: 'gated:combo/smart-grid bot — guard read, not executed',
  baseGridLevels: 'gated:combo/smart-grid bot — guard read, not executed',
  useActiveMinigrids: 'gated:combo bot — guard read, not executed',
  comboActiveMinigrids: 'gated:combo bot — guard read, not executed',
  comboSmartGridsCount: 'gated:combo bot — guard read, not executed',
  comboUseSmartGrids: 'gated:combo bot — guard read, not executed',
  comboTpBase: 'gated:combo bot — guard read, not executed',
  comboTpLimit: 'gated:combo bot — guard read, not executed',
  comboSlLimit: 'gated:combo bot — guard read, not executed',
  fixedTpPrice: 'gated:useFixedTPPrices (combo list only)',
  remainderFullAmount: 'gated:combo remainder handling — guard read, not executed',
};

const NEVER_MAPPED: Record<'dca' | 'combo', string[]> = {
  dca: [
    'avgPrice', 'autoRebalancing', 'baseGridLevels', 'baseOrderPrice',
    'baseStep', 'closeDealType', 'comboActiveMinigrids', 'comboSlLimit',
    'comboSmartGridsCount', 'comboTpBase', 'comboTpLimit', 'comboUseSmartGrids',
    'dcaCustom', 'dynamicArLockValue', 'dynamicPriceFilterOverValue',
    'fixedSlPrice', 'fixedTpPrice', 'gridLevel', 'hodlAt', 'hodlDay',
    'hodlHourly', 'hodlNextBuy', 'ignoreStartDeals', 'importFrom', 'maxOpenDeal',
    'minOpenDeal', 'multiSl', 'multiTp', 'relativeVolumeTop', 'riskMaxPositionSize',
    'riskMaxSl', 'riskMinPositionSize', 'riskMinSl', 'riskSlAmountPerc',
    'riskSlAmountValue', 'riskSlType', 'riskTpRatio', 'riskUseTpRatio',
    'rrSlFixedValue', 'rrSlType', 'startBotPriceCondition',
    'startBotPriceValue', 'stopBotPriceCondition',
    'stopBotPriceValue', 'stopDealLogic', 'stopDealSlLogic', 'useActiveMinigrids',
    'useExperimental', 'useRiskReward', 'volumeTop',
  ].sort(),
  combo: [
    'avgPrice', 'baseOrderPrice', 'closeDealType', 'comboSmartGridsCount',
    'dcaCustom', 'dynamicArLockValue', 'dynamicPriceFilterOverValue',
    'fixedSlPrice', 'fixedTpPrice', 'hodlAt', 'hodlDay', 'hodlHourly',
    'hodlNextBuy', 'ignoreStartDeals', 'importFrom', 'maxOpenDeal', 'minOpenDeal',
    'multiSl', 'multiTp', 'relativeVolumeTop', 'remainderFullAmount',
    'riskMaxPositionSize', 'riskMaxSl', 'riskMinPositionSize', 'riskMinSl',
    'riskSlAmountPerc', 'riskSlAmountValue', 'riskSlType', 'riskTpRatio',
    'riskUseTpRatio', 'rrSlFixedValue', 'rrSlType',
    'startBotPriceCondition', 'startBotPriceValue',
    'stopBotPriceCondition', 'stopBotPriceValue', 'stopDealLogic',
    'stopDealSlLogic', 'useExperimental', 'useRiskReward',
    'volumeTop',
  ].sort(),
};

/**
 * Fields absent from the payload under the all-gates-on baseline. See the
 * "set of fields not reaching the payload" test for what this list is for.
 * Regenerate by running with UPDATE_PIN=1 and pasting the logged output.
 */
const NOT_IN_PAYLOAD: Record<Section, string[]> = {
  // All six are empty-string defaults: the mapper omits an unset optional
  // rather than sending "".
  dca: [
    'fixedSlPrice',
    'fixedTpPrice',
    'maxOpenDeal',
    'minOpenDeal',
    'startBotPriceValue',
    'stopBotPriceValue',
  ],
  combo: [
    'fixedSlPrice',
    'fixedTpPrice',
    'maxOpenDeal',
    'minOpenDeal',
    'startBotPriceValue',
    'stopBotPriceValue',
  ],
  // The grid payload derives these rather than carrying them through.
  grid: ['newProfit', 'strategy', 'updatedBudget'],
};

const SECTIONS: { section: Section; defaults: Record<string, unknown> }[] = [
  { section: 'dca', defaults: dcaBaseline(DCA_FORM_DEFAULTS) },
  { section: 'combo', defaults: dcaBaseline(COMBO_FORM_DEFAULTS) },
  { section: 'grid', defaults: gridBaseline() },
];

for (const { section, defaults } of SECTIONS) {
  test.describe(`${section} form save round trip`, () => {
    /**
     * The hard assertion, and the reason it is phrased this way:
     *
     * The forward mapper does not omit a field it considers inapplicable — it
     * writes a normalized default (leverage 1 when futures is off, hodlDay 7
     * when the start condition isn't scheduled). So "the key is in the payload"
     * does NOT mean the value was accepted, and asserting on presence alone
     * flags ~45 correctly-gated fields per bot type.
     *
     * The unambiguous defect is narrower: the payload carries EXACTLY the value
     * that was set, and the form still gets something else back. The forward
     * mapper accepted the edit and the reverse mapper dropped it — the user's
     * change is written and then lost on reload. No configuration makes that
     * correct.
     *
     * Where the payload carries something other than what was set, the forward
     * mapper normalized it; that is gating, and it's reported, not failed.
     */
    test('a value the payload accepts is not lost on the way back', () => {
      const failures: string[] = [];
      const drift: string[] = [];
      const normalized: string[] = [];
      const rejected: string[] = [];
      const notSerialized: string[] = [];
      const skipped: string[] = [];

      for (const [key, current] of Object.entries(defaults)) {
        if (key in KNOWN_NOT_PERSISTED) continue;

        const probe = probeValue(key, current);
        if ('skip' in probe) {
          skipped.push(`${key}: ${probe.skip}`);
          continue;
        }

        const formData = buildFormData(section, { ...defaults, [key]: probe.value });
        const trip = roundTrip(section, formData);
        if (!trip.ok) {
          rejected.push(`${key}: ${trip.errors.join('; ')}`);
          continue;
        }

        // Absent from the payload means this configuration doesn't send the
        // field (a gate is off, or it belongs to another bot type). That is a
        // coverage gap, not a defect — pinned by the next test.
        if (!(key in trip.payload)) {
          notSerialized.push(key);
          continue;
        }

        // The forward mapper normalized the value away — it is gated on a
        // configuration this baseline doesn't build. Not a defect.
        if (!sameValue(probe.value, trip.payload[key])) {
          normalized.push(
            `${key}: sent ${JSON.stringify(probe.value)}, payload carried ${JSON.stringify(trip.payload[key])}`
          );
          continue;
        }

        if (!sameValue(probe.value, trip.back[key])) {
          const known = KNOWN_DRIFT[section]?.[key];
          if (known) {
            drift.push(`${key}: ${known}`);
            continue;
          }
          failures.push(
            `${key}: payload carried ${JSON.stringify(trip.payload[key])}, form got back ${JSON.stringify(trip.back[key])}`
          );
        }
      }

      console.log(
        `[${section}] probed ${Object.keys(defaults).length} fields — ` +
        `${normalized.length} normalized by the forward mapper, ` +
        `${notSerialized.length} not serialized, ${skipped.length} unprobeable, ` +
        `${rejected.length} rejected as invalid`
      );
      if (rejected.length) {
        console.log(`[${section}] rejected:\n  ${rejected.join('\n  ')}`);
      }
      if (drift.length) {
        console.log(`[${section}] KNOWN DRIFT (not failed):\n  ${drift.join('\n  ')}`);
      }

      expect(
        failures,
        `the payload carried the edited value but the form did not get it back:\n${failures.join('\n')}`
      ).toEqual([]);
    });

    /**
     * The coverage pin. Fields that never reach the payload under an
     * all-gates-on baseline are listed here by name. The list is not a bug
     * list — most are gated on a configuration this baseline doesn't build
     * (futures, hodl scheduling, combo-only fields). It exists so that a field
     * silently FALLING OUT of the payload shows up as a diff in review.
     */
    if (section !== 'grid') {
      /**
       * The check that would have caught the `closeOrderType` report.
       *
       * An earlier version of this file compared the probe value against the
       * payload and, when they differed, concluded the forward mapper had
       * "normalized" the value and treated it as correct gating. That bucket
       * silently swallowed every field in the list above — including
       * `closeOrderType`, which reached a customer. Whether a value was
       * legitimately gated or silently dropped is NOT decidable by comparing
       * values, because both look identical from the outside: the payload
       * carries the default either way.
       *
       * `debugInfo.fieldsMapped` decides it directly — it names the fields a
       * mapper actually wrote — so the set is pinned instead of inferred.
       */
      test('the set of fields no mapper writes is unchanged', () => {
        const trip = mapFormDataToPayload(buildFormData(section, defaults), {
          mode: 'edit',
        });
        expect(trip.success, JSON.stringify(trip.errors)).toBe(true);

        const mapped = new Set(trip.mappingResult?.debugInfo?.fieldsMapped ?? []);
        const never = Object.keys(defaults)
          .filter((k) => !mapped.has(k))
          .sort();

        const added = never.filter((k) => !NEVER_MAPPED[section].includes(k));
        const removed = NEVER_MAPPED[section].filter((k) => !never.includes(k));

        expect(
          added,
          `these fields stopped being persisted — a user's edit to them is now silently reverted on save:\n${added.join('\n')}`
        ).toEqual([]);
        expect(
          removed,
          `these fields are persisted now; shrink NEVER_MAPPED.${section} to record the fix:\n${removed.join('\n')}`
        ).toEqual([]);
      });

      test('every field that does not persist carries a verdict', () => {
        // Without this, a field can be added to the pin to make the suite pass
        // and never be looked at again — which is how closeOrderType survived.
        const unclassified = NEVER_MAPPED[section].filter((k) => !VERDICT[k]);
        expect(
          unclassified,
          `classify these in VERDICT (bug / by-design / no-ui / gated:x):\n${unclassified.join('\n')}`
        ).toEqual([]);
      });
    }

    test('the set of fields not reaching the payload is unchanged', () => {
      const trip = roundTrip(section, buildFormData(section, defaults));
      expect(trip.ok, JSON.stringify(!trip.ok && trip.errors)).toBe(true);
      if (!trip.ok) return;

      const absent = Object.keys(defaults)
        .filter((k) => !(k in KNOWN_NOT_PERSISTED) && !(k in trip.payload))
        .sort();

      console.log(`PIN[${section}] = ${JSON.stringify(absent)}`);
      expect(absent).toEqual(NOT_IN_PAYLOAD[section]);
    });
  });
}
