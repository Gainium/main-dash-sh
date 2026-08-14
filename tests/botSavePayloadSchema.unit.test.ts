import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  DECLARED_BY_COMBO_ONLY,
  UNDECLARED_BY_ALL_INPUTS,
  denylistFor,
  stripUndeclaredUpdateFields,
  type UpdatePayloadBotType,
} from '@/mappers/bots/dca/update-payload-denylist';
import { BotTypesEnum, StartConditionEnum, TerminalDealTypeEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Guard for the bot-save deny-list.
 *
 * `mapFormDataToPayload` emits every field the form knows about; the GraphQL
 * change-mutations accept a strictly smaller set, and prod Apollo rejects an
 * undeclared input field outright:
 *
 *   Field "__bogusUndeclaredField__" is not defined by type "getCMCDataInput".
 *   code: BAD_USER_INPUT
 *
 * The gap is closed by a DENY-list in `update-payload-denylist.ts`, which is the
 * fragile direction: add a form field that no change-input declares and it is
 * NOT stripped, so EVERY save of that bot type fails. That is a total outage of
 * bot saving produced by an ordinary frontend change, and nothing else catches
 * it before release — type-check can't, because the payload is cast, and the
 * mapper is happy to emit a field the schema has never heard of.
 *
 * So: drive the real mapper across configurations, apply the real deny-list,
 * and assert what is left is a SUBSET of the fields main-app actually declares.
 *
 * The declared fields come from `fixtures/graphql-bot-input-fields.json`, a
 * committed snapshot of main-app's `core/src/graphql/schema.ts`. It is a
 * snapshot rather than a live introspection query because main-app is a
 * separate repo and this one is the open-source self-hosted dashboard: the
 * guard has to run with no main-app checkout, no network, and no Gainium
 * credentials. Refresh it with `node scripts/refresh-graphql-input-snapshot.mjs`
 * when main-app's inputs change.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

interface Snapshot {
  source: { repo: string; path: string; commitShort: string };
  inputs: Record<string, { mutation: string; fieldCount: number; fields: string[] }>;
}

const snapshot: Snapshot = JSON.parse(
  readFileSync(path.join(here, 'fixtures/graphql-bot-input-fields.json'), 'utf8')
);

const INPUT_FOR: Record<UpdatePayloadBotType, string> = {
  dca: 'changeDCABotInput',
  combo: 'changeComboBotInput',
};

const declaredFields = (botType: UpdatePayloadBotType): Set<string> =>
  new Set(snapshot.inputs[INPUT_FOR[botType]].fields);

/**
 * Baseline with every feature gate on, so gated fields actually reach the
 * payload. Mirrors `botFormRoundTrip.unit.test.ts` — a payload built from bare
 * defaults exercises only a fraction of the keys, which would let an undeclared
 * field hide behind a gate that happens to be off.
 */
const gatesOn = (defaults: Record<string, unknown>): Record<string, unknown> => {
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
    // These gates each need a structured array the baseline does not build, so
    // the mapper rejects the payload outright when they are on.
    startCondition: StartConditionEnum.asap,
    useRiskReward: false,
    useMultiTp: false,
    useMultiSl: false,
    useFixedTPPrices: false,
    useFixedSLPrices: false,
  });
  return out;
};

const buildFormData = (
  botType: UpdatePayloadBotType,
  overrides: Record<string, unknown>
): BotFormData => {
  const base = botType === 'combo' ? COMBO_FORM_DEFAULTS : DCA_FORM_DEFAULTS;
  const section = { ...gatesOn(base as Record<string, unknown>), ...overrides };
  return {
    ...SHARED_FORM_DEFAULTS,
    type: botType === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca,
    exchangeUUID: 'exchange-uuid',
    dca: botType === 'dca' ? section : gatesOn(DCA_FORM_DEFAULTS as Record<string, unknown>),
    combo:
      botType === 'combo' ? section : gatesOn(COMBO_FORM_DEFAULTS as Record<string, unknown>),
    grid: {},
  } as unknown as BotFormData;
};

/**
 * Configurations to drive. Each turns on a different slice of the form so the
 * union of emitted keys is as wide as the mapper can make it.
 */
const CONFIGS: { name: string; overrides: Record<string, unknown> }[] = [
  { name: 'factory defaults', overrides: {} },
  { name: 'all gates on', overrides: { useMulti: false } },
  { name: 'multi-pair', overrides: { useMulti: true } },
  {
    name: 'terminal deal',
    overrides: { terminalDealType: TerminalDealTypeEnum.import, useMulti: false },
  },
  {
    name: 'stop-loss + trailing off',
    overrides: { useSl: false, trailingSl: false, moveSL: false, useMulti: false },
  },
  {
    name: 'take-profit off',
    overrides: { useTp: false, trailingTp: false, useMulti: false },
  },
];

const BOT_TYPES: UpdatePayloadBotType[] = ['dca', 'combo'];

/** Run one configuration through the real save path, up to the mutation call. */
const wirePayload = (
  botType: UpdatePayloadBotType,
  overrides: Record<string, unknown>
): Record<string, unknown> => {
  const formData =
    Object.keys(overrides).length === 0
      ? ({
          ...SHARED_FORM_DEFAULTS,
          type: botType === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca,
          exchangeUUID: 'exchange-uuid',
          dca: { ...DCA_FORM_DEFAULTS },
          combo: { ...COMBO_FORM_DEFAULTS },
          grid: {},
        } as unknown as BotFormData)
      : buildFormData(botType, overrides);

  const result = mapFormDataToPayload(formData, { mode: 'edit' });
  expect(
    result.success,
    `mapper rejected the payload: ${(result.errors ?? []).join('; ')}`
  ).toBe(true);

  const updatePayload = (result.updatePayload ?? {}) as Record<string, unknown>;
  const useMulti = Boolean(
    (formData[botType] as unknown as Record<string, unknown>)?.['useMulti']
  );

  return stripUndeclaredUpdateFields(updatePayload, {
    botType,
    stripPair: botType === 'combo' ? true : !useMulti,
  });
};

for (const botType of BOT_TYPES) {
  test.describe(`${botType} save payload vs ${INPUT_FOR[botType]}`, () => {
    for (const { name, overrides } of CONFIGS) {
      test(`${name}: every key is declared`, () => {
        const declared = declaredFields(botType);
        const payload = wirePayload(botType, overrides);
        const undeclared = Object.keys(payload).filter((k) => !declared.has(k));

        expect(
          undeclared,
          `These keys reach the ${INPUT_FOR[botType]} mutation but are not ` +
            `declared by it, so prod Apollo will reject the whole save with ` +
            `BAD_USER_INPUT — every ${botType} bot save breaks.\n\n` +
            `Fix: if the field should persist, declare it in main-app ` +
            `core/src/graphql/schema.ts and re-run ` +
            `scripts/refresh-graphql-input-snapshot.mjs. If it is client-only, ` +
            `add it to the deny-list in ` +
            `src/mappers/bots/dca/update-payload-denylist.ts.\n\n` +
            `Undeclared: ${undeclared.join(', ')}`
        ).toEqual([]);
      });
    }

    /**
     * Vacuity guard. Every assertion above passes trivially if the mapper stops
     * emitting anything, so pin the floor: the union across configurations has
     * to stay broad. The round-trip suite proves the mapper reaches all 163
     * flat fields; this only needs to catch "it collapsed", not track the exact
     * number, so the floor is deliberately loose.
     */
    test('the configurations actually exercise the payload', () => {
      const union = new Set<string>();
      for (const { overrides } of CONFIGS) {
        for (const key of Object.keys(wirePayload(botType, overrides))) union.add(key);
      }
      expect(
        union.size,
        `Only ${union.size} keys emitted across all configurations — the subset ` +
          `assertions above are passing vacuously.`
      ).toBeGreaterThan(80);
    });
  });
}

/**
 * The deny-list carries a claim about WHY each field is on it. If main-app ever
 * declares one of them, the entry becomes dead weight that silently drops a
 * field the backend would now accept — the quiet failure mode, and the one the
 * subset assertions above cannot see.
 */
test.describe('deny-list rationale still matches the schema', () => {
  test('the always-stripped fields are declared by no change-input', () => {
    const nowDeclared: string[] = [];
    for (const field of UNDECLARED_BY_ALL_INPUTS) {
      for (const [input, { fields }] of Object.entries(snapshot.inputs)) {
        if (fields.includes(field)) nowDeclared.push(`${field} (now in ${input})`);
      }
    }
    expect(
      nowDeclared,
      'These are stripped from every save as undeclared, but the schema now ' +
        'declares them — so the strip is silently discarding a field the ' +
        'backend would accept. Remove them from UNDECLARED_BY_ALL_INPUTS.'
    ).toEqual([]);
  });

  test('the combo-only fields are declared by combo and not by DCA', () => {
    const dca = declaredFields('dca');
    const combo = declaredFields('combo');
    const wrong = DECLARED_BY_COMBO_ONLY.filter((f) => !combo.has(f) || dca.has(f));
    expect(
      wrong,
      'DECLARED_BY_COMBO_ONLY exists because changeComboBotInput declares these ' +
        'and changeDCABotInput does not. That is no longer true for: ' +
        `${wrong.join(', ')}. If DCA now declares one, stop stripping it.`
    ).toEqual([]);
  });

  test('pair is declared by both, so stripping it is behavioural', () => {
    // Documents the one deny-list entry that is NOT schema-driven: both
    // resolvers reject a pair change on a non-multi bot, and that rejection
    // kills every sibling field in the same payload.
    expect(declaredFields('dca').has('pair')).toBe(true);
    expect(declaredFields('combo').has('pair')).toBe(true);
    expect(denylistFor('dca', true)).toContain('pair');
    expect(denylistFor('dca', false)).not.toContain('pair');
  });
});
