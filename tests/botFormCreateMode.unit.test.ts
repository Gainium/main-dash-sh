import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import * as GainiumTypes from '@/types';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  DECLARED_BY_COMBO_ONLY,
  UNDECLARED_BY_ALL_INPUTS,
} from '@/mappers/bots/dca/update-payload-denylist';
import {
  BotStartTypeEnum,
  BotTypesEnum,
  DCAConditionEnum,
  DCATypeEnum,
  IndicatorAction,
  IndicatorEnum,
  StartConditionEnum,
  type ExchangeInUser,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * CREATE-mode coverage for the bot-form save path.
 *
 * botFormRoundTrip.unit.test.ts probes 163 fields per bot type and every one of
 * them runs `mode: 'edit'`. So did every other test in this directory — before
 * this file, `grep -rn "mode: 'create'" tests/` returned nothing. That is a real
 * hole rather than a bookkeeping one, because create is not edit with a
 * different verb. It runs machinery edit never touches:
 *
 *   - `buildCreatePayload()` spreads the WHOLE raw form slice as the payload
 *     base, minus four fields it destructures away (`useExperimental`,
 *     `avgPrice`, `indicators`, `indicatorGroups`).
 *   - `mergeCreatePayload()` then spreads the mapper's output over that base.
 *     The layering direction is the whole ballgame: this function used to put
 *     the factory defaults ON TOP of the user's values, the same defect class as
 *     the fallback-layer bug fixed in core baabc97.
 *   - `sanitizeValue()` drops empty strings, nulls and EMPTY ARRAYS from the
 *     mapper's output, so for those keys the raw base layer is what ships.
 *   - combo create additionally does `delete createPayload.importFrom`.
 *   - and the backend stores a create VERBATIM (`prepareDCABot` does
 *     `settings: { ...settings, type }`) with no defaulting, where edit merges
 *     `{ ...oldSettings.settings, ...settings }`. On edit an omitted field keeps
 *     its stored value; on create an omitted field simply does not exist.
 *
 * The method here is differential: for the same form state, run the mapper
 * twice and diff `createPayload` against `updatePayload`. Edit is the direction
 * with 163 probes behind it, so any field that is right on edit and different on
 * create is a create-only defect — and the diff needs no per-field oracle, which
 * is what makes it affordable to run over every field at once.
 *
 * Result as of this commit: for all 158 probeable fields, on both DCA and combo,
 * create and edit agree exactly. The only systematic difference is the seven
 * empty-valued fields listed in CREATE_ONLY_EMPTY, which create ships as `""` /
 * `[]` from the raw base where edit omits them. That is pinned below rather
 * than asserted away, so it shows up as a diff if the set moves.
 */

type Section = 'dca' | 'combo';

/**
 * `buildCreatePayload` reads exactly two things off the exchange — `provider`
 * and `uuid` — and returns null without one, which makes the whole create
 * branch silently produce no payload. A minimal stand-in is enough.
 */
const EXCHANGE = {
  uuid: 'exchange-uuid',
  provider: 'paperKucoin',
  name: 'paper account',
} as unknown as ExchangeInUser;

/**
 * A pair with a separator, unlike the round-trip suite's `BTCUSDT`.
 *
 * This is a create-only constraint and worth stating: `resolvePairAssetTuple`
 * splits on `[/:_-]` and, with no `pairMetadata` to consult, cannot derive base
 * and quote from a concatenated symbol — so create fails validation with
 * "Unable to resolve quote asset" where edit does not care.
 */
const PAIR = 'BTC-USDT';
const PROBE_PAIR = 'ETH-USDT';

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

const RR_INDICATOR = {
  uuid: 'rr-probe-1',
  type: IndicatorEnum.atr,
  indicatorAction: IndicatorAction.riskReward,
  timeframe: '1h',
  period: '14',
};

const MULTI_TARGETS = [
  { uuid: 'mt-probe-1', target: '1.500', amount: '60' },
  { uuid: 'mt-probe-2', target: '3', amount: '40' },
];

const DCA_CUSTOM_STEPS = [
  { uuid: 'dc-probe-1', step: '1.5', size: '15' },
  { uuid: 'dc-probe-2', step: '3', size: '30' },
];

/**
 * Probe values and companions are deliberately the same set the round-trip
 * suite uses, minus `pair` (which needs a separator here, see PAIR above). The
 * whole point of this file is that the INPUT is identical and only the mode
 * differs — a probe that diverged from the edit suite's would weaken the diff.
 */
const PROBE_OVERRIDES: Record<string, unknown> = {
  multiTp: MULTI_TARGETS,
  multiSl: MULTI_TARGETS,
  dcaCustom: DCA_CUSTOM_STEPS,
  fixedTpPrice: '31000',
  fixedSlPrice: '25000',
  minOpenDeal: '100',
  maxOpenDeal: '200',
  startBotPriceValue: '100',
  stopBotPriceValue: '200',
  dcaVolumeRequiredChangeRef: 'avg',
  marginType: 'cross',
  useRiskReward: true,
  useMultiTp: true,
  useMultiSl: true,
  useFixedTPPrices: true,
  useFixedSLPrices: true,
  dcaCondition: DCAConditionEnum.custom,
  profitCurrency: 'base',
  orderFixedIn: 'base',
  orderSizeReference: 'cost',
  prioritize: 'amount',
  gridType: 'arithmetic',
  tpSlCondition: 'priceChanged',
  slCondition: 'priceChanged',
  tpSlAction: 'close',
  slAction: 'close',
  hodlAt: '18:30',
  name: 'Create Mode Probe',
  pair: [PROBE_PAIR],
  closeAfterXprofitCond: 'lt',
  startBotPriceCondition: 'lt',
  stopBotPriceCondition: 'lt',
  stopStatus: 'monitoring',
  moveSLValue: '0.3',
  dcaVolumeMaxValue: '5',
};

const PROBE_COMPANIONS: Record<string, Record<string, unknown>> = {
  useRiskReward: { indicators: [RR_INDICATOR] },
  useMultiTp: { useTp: true, multiTp: MULTI_TARGETS },
  useMultiSl: { useSl: true, useRiskReward: false, multiSl: MULTI_TARGETS },
  useFixedTPPrices: { fixedTpPrice: '31000' },
  useFixedSLPrices: { useSl: true, fixedSlPrice: '25000' },
  dcaCondition: { dcaCustom: DCA_CUSTOM_STEPS },
  multiTp: { useTp: true, useMultiTp: true },
  multiSl: { useSl: true, useRiskReward: false, useMultiSl: true },
  dcaCustom: { useDca: true, dcaCondition: DCAConditionEnum.custom },
  marginType: { futures: true },
  leverage: { futures: true },
  fixedTpPrice: { useFixedTPPrices: true },
  fixedSlPrice: { useSl: true, useFixedSLPrices: true },
  minOpenDeal: { useStaticPriceFilter: true },
  maxOpenDeal: { useStaticPriceFilter: true },
  startBotPriceValue: {
    useBotController: true,
    botActualStart: BotStartTypeEnum.price,
  },
  stopBotPriceValue: { useBotController: true, botStart: BotStartTypeEnum.price },
};

/** Client-only form state; neither mode sends it. Same list as the edit suite. */
const CLIENT_ONLY = new Set([
  'indicators',
  'indicatorGroups',
  'importFrom',
  'askToReset',
  'dcaOrderGuard',
  'pairMetadata',
  'pairPrecisionMap',
  'userFee',
  'favoriteIndicators',
  'originalBot',
  'terminal',
  'avgPrice',
  'tpSlTargetFilled',
  'useExperimental',
]);

/**
 * Keys that exist only because a payload is a CREATE payload. These are the
 * envelope `buildCreatePayload` adds around the settings — the account and
 * instrument the bot is being created on — so edit having no counterpart is
 * correct, not a gap. Excluded from the field-by-field diff.
 *
 * `indicators` / `indicatorGroups` are here for a different reason: create
 * always carries them (as `[]` when the bot has none) because the base seeds
 * empty placeholders, while edit omits an empty array via `sanitizeValue`. They
 * get their own test below rather than a diff entry.
 */
const CREATE_ENVELOPE = new Set([
  'exchange',
  'exchangeUUID',
  'baseAsset',
  'quoteAsset',
  'uuid',
  'vars',
  'indicators',
  'indicatorGroups',
]);

/**
 * The one systematic create/edit divergence, pinned by name.
 *
 * All seven default to an empty string (or, for `dcaCustom`, an empty array).
 * `sanitizeValue` strips those out of the mapper's output, so edit omits the
 * key entirely — which on edit means "leave the stored value alone", since the
 * backend merges. Create has no stored value to leave alone and its base layer
 * is the raw form slice, so the empty value ships as `""` / `[]`.
 *
 * Storing `""` is equivalent to storing nothing here: the reverse mapper reads
 * `""` back into the same empty control. So this is pinned, not failed. It is
 * still worth pinning — the list moving means the mapper's treatment of empties
 * changed, and this is the file that would notice.
 */
const CREATE_ONLY_EMPTY: Record<Section, string[]> = {
  dca: [
    'dcaCustom',
    'fixedSlPrice',
    'fixedTpPrice',
    'importFrom',
    'maxOpenDeal',
    'minOpenDeal',
    'startBotPriceValue',
    'stopBotPriceValue',
  ],
  // Identical, minus `importFrom` — combo deletes it from the create payload.
  combo: [
    'dcaCustom',
    'fixedSlPrice',
    'fixedTpPrice',
    'maxOpenDeal',
    'minOpenDeal',
    'startBotPriceValue',
    'stopBotPriceValue',
  ],
};

/**
 * The fields `useFormHandlers` deletes from an UPDATE immediately before the
 * mutation, because the change-inputs do not declare them. Imported from the
 * deny-list module rather than restated, so the two cannot drift.
 *
 * They matter disproportionately here. Edit cannot write them at all, so create
 * is the ONLY path that ever sets them — get one wrong and it is wrong for the
 * life of the bot, with no later save able to correct it. Nothing covered them
 * before this file: the edit suite exercises a payload they are stripped from,
 * and the e2e smoke test asserts only that the strip happened.
 *
 * Note what "reaches the create payload" does and does not prove. Verified
 * against the API on 2026-08-14: for a DCA bot the backend accepts the six
 * `DECLARED_BY_COMBO_ONLY` settings and stores them as null, because they are
 * combo/smart-grid concepts a DCA bot has no use for — which is why the DCA
 * form offers no control for them either (`feeOrder`'s "Reduce Dust" toggle is
 * `visible: isComboBot && !isFutures`). Carrying them is correct; the create
 * payload is shared between the two bot types and combo is where they land.
 */
const EDIT_DENY_LIST = [
  ...UNDECLARED_BY_ALL_INPUTS.filter(
    // The ones the create mapper strips for itself: `useExperimental` is a
    // redesign-only feature flag no bot input declares, `importFrom` is
    // dropped for combo only, and `tpSlTargetFilled` is deal-edit-only state
    // (which multi-TP targets a deal has already taken) that no bot input
    // declares either. They are asserted directly elsewhere in this file, so
    // excluding them here keeps this list to "edit cannot, create must".
    (f) =>
      f !== 'importFrom' &&
      f !== 'useExperimental' &&
      f !== 'tpSlTargetFilled'
  ),
  ...DECLARED_BY_COMBO_ONLY,
];

/**
 * The declared input fields of the create mutations, snapshotted from main-app
 * by `scripts/refresh-graphql-input-snapshot.mjs`.
 *
 * The create side needs this guard more than the update side that prompted the
 * snapshot. An update payload is filtered through the deny-list first; a create
 * payload is sent VERBATIM, and `buildCreatePayload` builds it by spreading the
 * WHOLE form slice — so every new form field is on the wire the moment it
 * exists. If the create input does not declare it, Apollo rejects the mutation
 * outright and NO bot can be created, for anyone, until it is removed.
 */
const CREATE_INPUT_FIELDS: Record<Section, string[]> = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  const snapshot = JSON.parse(
    readFileSync(
      resolve(here, 'fixtures/graphql-bot-input-fields.json'),
      'utf8'
    )
  ) as { inputs: Record<string, { fields: string[] }> };

  return {
    dca: snapshot.inputs['createDCABotInput']?.fields ?? [],
    combo: snapshot.inputs['createComboBotInput']?.fields ?? [],
  };
})();

const numericString = (v: string): boolean =>
  v.trim() !== '' && !isNaN(Number(v));

const probeValue = (
  key: string,
  current: unknown
): { value: unknown } | { skip: string } => {
  if (key in PROBE_OVERRIDES) return { value: PROBE_OVERRIDES[key] };
  if (typeof current === 'boolean') return { value: !current };
  if (typeof current === 'number') {
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
const baseline = (defaults: Record<string, unknown>) => {
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'boolean' && k.startsWith('use')) out[k] = true;
  }
  Object.assign(out, {
    cooldownAfterDealStart: true,
    cooldownAfterDealStop: true,
    moveSL: true,
    trailingTp: true,
    trailingSl: true,
    closeByTimer: true,
    startCondition: StartConditionEnum.asap,
    useRiskReward: false,
    useMultiTp: false,
    useMultiSl: false,
    useFixedTPPrices: false,
    useFixedSLPrices: false,
  });
  return out;
};

const DEFAULTS: Record<Section, Record<string, unknown>> = {
  dca: baseline(DCA_FORM_DEFAULTS),
  combo: baseline(COMBO_FORM_DEFAULTS),
};

const buildFormData = (
  section: Section,
  overrides: Record<string, unknown>,
  formOverrides: Record<string, unknown> = {}
): BotFormData =>
  ({
    ...SHARED_FORM_DEFAULTS,
    pair: [PAIR],
    type: section === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca,
    exchangeUUID: 'exchange-uuid',
    dca: section === 'dca' ? overrides : DEFAULTS.dca,
    combo: section === 'combo' ? overrides : DEFAULTS.combo,
    grid: {},
    ...formOverrides,
  }) as unknown as BotFormData;

const editPayload = (formData: BotFormData) => {
  const r = mapFormDataToPayload(formData, { mode: 'edit' });
  return {
    ok: r.success,
    errors: r.errors ?? [],
    payload: (r.updatePayload ?? {}) as Record<string, unknown>,
  };
};

const createPayload = (formData: BotFormData) => {
  const r = mapFormDataToPayload(
    formData,
    { mode: 'create' },
    undefined,
    EXCHANGE
  );
  return {
    ok: r.success,
    errors: r.errors ?? [],
    payload: (r.createPayload ?? {}) as Record<string, unknown>,
  };
};

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

for (const section of ['dca', 'combo'] as const) {
  const defaults = DEFAULTS[section];

  test.describe(`${section} create-mode payload`, () => {
    /**
     * The core assertion. For each field in turn, build the same form state the
     * edit suite would, map it BOTH ways, and require the two payloads to agree
     * on every settings key — not just on the probed one.
     *
     * Comparing whole payloads rather than the probed field is what makes this
     * worth running: a create-only defect does not have to live in the field
     * being probed. `mergeCreatePayload` layers two whole objects, so a bad
     * layering shows up on whatever key happens to be empty in one of them,
     * which is usually some other field entirely.
     */
    test('create agrees with edit on every field, for every probe', () => {
      const diffs = new Set<string>();
      const skipped: string[] = [];
      const createRejected: string[] = [];
      let probed = 0;

      for (const [key, current] of Object.entries(defaults)) {
        if (CLIENT_ONLY.has(key)) continue;

        const probe = probeValue(key, current);
        if ('skip' in probe) {
          skipped.push(`${key}: ${probe.skip}`);
          continue;
        }
        probed++;

        const formData = buildFormData(section, {
          ...defaults,
          [key]: probe.value,
          ...(PROBE_COMPANIONS[key] ?? {}),
        });

        const edit = editPayload(formData);
        // A state the edit mapper rejects is not a create-mode question; the
        // edit suite owns those.
        if (!edit.ok) continue;

        const create = createPayload(formData);
        if (!create.ok) {
          createRejected.push(`${key}: ${create.errors.join('; ')}`);
          continue;
        }

        for (const field of new Set([
          ...Object.keys(edit.payload),
          ...Object.keys(create.payload),
        ])) {
          if (CREATE_ENVELOPE.has(field)) continue;
          const inEdit = field in edit.payload;
          const inCreate = field in create.payload;

          if (inEdit && inCreate) {
            if (!same(edit.payload[field], create.payload[field])) {
              diffs.add(
                `[probe ${key}] ${field}: edit=${JSON.stringify(edit.payload[field])} create=${JSON.stringify(create.payload[field])}`
              );
            }
          } else if (inEdit && !inCreate) {
            // The dangerous direction: edit persists it, create drops it, and
            // because a create is stored verbatim the setting simply never
            // exists on the new bot.
            diffs.add(
              `[probe ${key}] ${field}: MISSING FROM CREATE (edit=${JSON.stringify(edit.payload[field])})`
            );
          } else if (!CREATE_ONLY_EMPTY[section].includes(field)) {
            diffs.add(
              `[probe ${key}] ${field}: CREATE-ONLY = ${JSON.stringify(create.payload[field])}`
            );
          }
        }
      }

      console.log(
        `[${section}] probed ${probed} fields in both modes — ` +
          `${skipped.length} unprobeable, ${createRejected.length} rejected by create only`
      );
      if (createRejected.length) {
        console.log(
          `[${section}] rejected by create but accepted by edit:\n  ${createRejected.join('\n  ')}`
        );
      }

      expect(
        [...diffs].sort(),
        'create-mode payload diverged from the edit payload the round-trip suite covers'
      ).toEqual([]);

      // Same blind-spot guard as the edit suite, for the same reason: a field
      // the probe cannot value is a field nothing here covers, and historically
      // that bucket is exactly where the customer-reported defects lived.
      expect(
        skipped,
        `these fields could not be probed, so nothing above covers them in create mode:\n${skipped.join('\n')}`
      ).toEqual([]);

      // Guards the guard: if the probe loop ever stops running, every set above
      // is trivially empty and the suite passes while testing nothing.
      expect(probed).toBeGreaterThan(150);
    });

    /**
     * The regression pin for the bug class named in this file's header.
     *
     * `mergeCreatePayload` used to spread the factory defaults OVER the mapper's
     * output, so a field no mapper writes was created at its default however the
     * user had set it — the create-side instance of the fallback-layer defect
     * fixed in core baabc97. These three fields are on the edit suite's
     * NEVER_MAPPED list (no mapper writes them) AND differ from their default
     * here, which is precisely the combination the old layering destroyed.
     */
    test('a field no mapper writes is created with the user value, not the factory default', () => {
      const edits: Record<string, unknown> = {
        autoRebalancing: !defaults['autoRebalancing'],
        ignoreStartDeals: !defaults['ignoreStartDeals'],
        baseOrderPrice: '12345',
      };
      const formData = buildFormData(section, {
        ...defaults,
        ...edits,
        useLimitPrice: true,
      });

      const create = createPayload(formData);
      expect(create.ok, create.errors.join('; ')).toBe(true);

      for (const [field, value] of Object.entries(edits)) {
        expect(
          create.payload[field],
          `${field} was reset to its factory default on create`
        ).toEqual(value);
      }
    });

    /**
     * The fields edit is not allowed to send. Create is their only writer, so
     * nothing else in the suite can catch them going missing.
     */
    test('every field the edit deny-list strips still reaches the create payload', () => {
      const create = createPayload(buildFormData(section, defaults));
      expect(create.ok, create.errors.join('; ')).toBe(true);

      const missing = EDIT_DENY_LIST.filter((k) => !(k in create.payload));
      expect(
        missing,
        `create is the only path that can set these, and it is not sending them:\n${missing.join('\n')}`
      ).toEqual([]);
    });

    /**
     * The create-side counterpart of `botSavePayloadSchema.unit.test.ts`.
     *
     * That guard covers updates, where a deny-list stands between the mapper
     * and the wire. Nothing stands there on create, so this is the only thing
     * between a newly added form field and every bot creation failing.
     */
    test('every key the create payload carries is declared by the create input', () => {
      const declared = CREATE_INPUT_FIELDS[section];
      expect(
        declared.length,
        'the create-input snapshot is empty — regenerate it with scripts/refresh-graphql-input-snapshot.mjs'
      ).toBeGreaterThan(100);

      const create = createPayload(buildFormData(section, defaults));
      expect(create.ok, create.errors.join('; ')).toBe(true);

      const undeclared = Object.keys(create.payload)
        .filter((k) => !declared.includes(k))
        .sort();

      expect(
        undeclared,
        `these keys are not declared by create${section === 'combo' ? 'Combo' : 'DCA'}BotInput; Apollo rejects the whole mutation, so NO bot can be created until they are stripped:\n${undeclared.join('\n')}`
      ).toEqual([]);
    });

    /**
     * `buildCreatePayload` destructures `indicators` / `indicatorGroups` out of
     * the raw slice and seeds `[]` in their place, precisely so the RAW entries
     * cannot ship: their catalog defaults are still numbers (`indicatorValue:
     * 70`, `keepConditionBars: 0`) where the schema wants strings. The mapper's
     * serialized output is meant to win the spread — but only because it is
     * non-empty, since `sanitizeValue` would drop an empty array and hand the
     * base layer back the win.
     */
    test('create serializes indicators instead of shipping raw catalog values', () => {
      const raw = [
        {
          uuid: 'create-probe-rsi',
          type: 'RSI',
          indicatorAction: 'startDeal',
          indicatorInterval: '1h',
          indicatorCondition: 'lt',
          // Deliberately numbers, as the catalog seeds them.
          indicatorValue: 70,
          keepConditionBars: 0,
          groupId: '',
        },
      ];
      const formData = buildFormData(section, {
        ...defaults,
        startCondition: StartConditionEnum.ti,
        indicators: raw,
      });

      const create = createPayload(formData);
      expect(create.ok, create.errors.join('; ')).toBe(true);

      const shipped = (create.payload['indicators'] ?? []) as Record<
        string,
        unknown
      >[];
      expect(shipped, 'the indicator did not reach the create payload').toHaveLength(
        1
      );
      expect(
        typeof shipped[0]?.['indicatorValue'],
        'raw numeric indicatorValue leaked past the mapper'
      ).toBe('string');
      expect(
        typeof shipped[0]?.['keepConditionBars'],
        'raw numeric keepConditionBars leaked past the mapper'
      ).toBe('string');
    });

    /**
     * A bot with no indicators must still create. The placeholders are what
     * make that true — without them the key would be absent, and a create is
     * stored verbatim.
     */
    test('a bot with no indicators creates with empty indicator arrays', () => {
      const create = createPayload(buildFormData(section, defaults));
      expect(create.ok, create.errors.join('; ')).toBe(true);
      expect(create.payload['indicators']).toEqual([]);
      expect(create.payload['indicatorGroups']).toEqual([]);
    });

    /**
     * The create payload is what the new bot IS — there is no stored settings
     * object underneath it to fill gaps. So the reload path has to be able to
     * reconstruct the form from the create payload alone, which is a stronger
     * requirement than the edit round trip and is not implied by it.
     */
    test('every value the create payload carries survives a reload', () => {
      const failures: string[] = [];
      const botType =
        section === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca;

      for (const [key, current] of Object.entries(defaults)) {
        if (CLIENT_ONLY.has(key)) continue;
        const probe = probeValue(key, current);
        if ('skip' in probe) continue;

        const formData = buildFormData(section, {
          ...defaults,
          [key]: probe.value,
          ...(PROBE_COMPANIONS[key] ?? {}),
        });
        const create = createPayload(formData);
        if (!create.ok) continue;

        // Only assert where the payload carries EXACTLY what was set. Anything
        // else was normalized by the forward mapper — that is gating, and the
        // edit suite already reports it.
        if (!same(probe.value, create.payload[key])) continue;

        const back = mapBotSettingsToFormData(
          botType,
          create.payload as never
        ).formData as unknown as Record<string, Record<string, unknown>>;
        const got = back[section]?.[key];

        if (!same(probe.value, got) && String(probe.value) !== String(got)) {
          failures.push(
            `${key}: created with ${JSON.stringify(create.payload[key])}, form loaded back ${JSON.stringify(got)}`
          );
        }
      }

      expect(
        failures,
        `these settings would be created correctly and then read back wrong:\n${failures.join('\n')}`
      ).toEqual([]);
    });
  });
}

/**
 * Create-only behaviors with no per-section counterpart.
 */
test.describe('create-mode specifics', () => {
  test('combo strips importFrom, DCA keeps it', () => {
    const dca = createPayload(buildFormData('dca', DEFAULTS.dca));
    const combo = createPayload(buildFormData('combo', DEFAULTS.combo));
    expect(dca.ok && combo.ok).toBe(true);

    // createComboBotInput does not declare importFrom; sending it fails the
    // whole mutation with BAD_USER_INPUT rather than degrading.
    expect(combo.payload).not.toHaveProperty('importFrom');
    expect(dca.payload).toHaveProperty('importFrom');
  });

  test('a terminal form creates a terminal-type bot', () => {
    const formData = buildFormData('dca', DEFAULTS.dca, { terminal: true });
    const create = createPayload(formData);
    expect(create.ok, create.errors.join('; ')).toBe(true);
    expect(create.payload['type']).toBe(DCATypeEnum.terminal);
  });

  test('the pair drives the base and quote assets the bot is created on', () => {
    const create = createPayload(buildFormData('dca', DEFAULTS.dca));
    expect(create.ok, create.errors.join('; ')).toBe(true);
    expect(create.payload['pair']).toEqual([PAIR]);
    expect(create.payload['baseAsset']).toEqual(['BTC']);
    expect(create.payload['quoteAsset']).toEqual(['USDT']);
    expect(create.payload['exchange']).toBe(EXCHANGE.provider);
    expect(create.payload['exchangeUUID']).toBe(EXCHANGE.uuid);
  });

  /**
   * The failure mode worth naming: with no exchange, `buildCreatePayload`
   * returns null, every `mode === 'create' && createPayload` guard below it is
   * skipped, and the call returns success WITHOUT a create payload. The caller
   * has to notice the missing payload rather than the missing success flag.
   */
  test('create without an exchange yields no create payload', () => {
    const formData = buildFormData('dca', DEFAULTS.dca);
    const result = mapFormDataToPayload(formData, { mode: 'create' });
    expect(result.createPayload).toBeUndefined();
  });

  test('create requires an exchange selection and at least one pair', () => {
    const noExchange = mapFormDataToPayload(
      buildFormData('dca', DEFAULTS.dca, { exchangeUUID: '' }),
      { mode: 'create' },
      undefined,
      EXCHANGE
    );
    expect(noExchange.success).toBe(false);
    expect(noExchange.errors?.join('; ')).toMatch(/exchange selection/i);

    // A concatenated symbol has no separator to split on and no pairMetadata
    // entry, so the assets cannot be resolved. Edit does not care; create does.
    const badPair = mapFormDataToPayload(
      buildFormData('dca', DEFAULTS.dca, { pair: ['BTCUSDT'] }),
      { mode: 'create' },
      undefined,
      EXCHANGE
    );
    expect(badPair.success).toBe(false);
    expect(badPair.errors?.join('; ')).toMatch(/quote asset|base asset/i);
  });
});
