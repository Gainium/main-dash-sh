import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  DECLARED_BY_COMBO_ONLY,
  UNDECLARED_BY_ALL_INPUTS,
  UNDECLARED_GRID_FORM_FIELDS,
  denylistFor,
  stripUndeclaredUpdateFields,
  type UpdatePayloadBotType,
} from '@/mappers/bots/dca/update-payload-denylist';
import { mapGridFormDataToPayload } from '@/mappers/bots/grid/map-grid-form-data-to-payload';
import {
  BotMarginTypeEnum,
  BotTypesEnum,
  StartConditionEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
} from '@/types';
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
  grid: 'changeBotInput',
};

/**
 * Only the change-inputs constrain an update payload.
 *
 * The snapshot also carries the create-inputs, which are a DIFFERENT contract:
 * create sends its payload verbatim with no deny-list, and `createDCABotInput`
 * legitimately declares `useMulti`, `type`, `useLimitPrice`, `terminalDealType`
 * and `importFrom` — the very fields an update has to strip. So the rationale
 * checks below must ask "declared by no CHANGE-input", not "by no input at
 * all", or they would fail on a correct schema.
 */
const CHANGE_INPUTS = Object.values(INPUT_FOR);

const declaredByAnyChangeInput = (field: string): string[] =>
  CHANGE_INPUTS.filter((input) => snapshot.inputs[input].fields.includes(field));

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

/**
 * Grid is a separate mapper (`mapGridFormDataToPayload`) against a much smaller
 * input — 42 fields against DCA's 163 — and it validates the price range, so a
 * bare-defaults payload is rejected outright rather than mapped. Every config
 * therefore starts from a coherent range instead of `GRID_FORM_DEFAULTS`.
 */
const gridBaseline = (): Record<string, unknown> => ({
  ...GRID_FORM_DEFAULTS,
  lowPrice: 100,
  topPrice: 200,
  levels: 10,
  gridStep: 1,
  budget: 1000,
});

const GRID_CONFIGS: { name: string; overrides: Record<string, unknown> }[] = [
  { name: 'plain range', overrides: {} },
  {
    name: 'take-profit + stop-loss on',
    overrides: { tpSl: true, sl: true, tpSlLimit: true, slLimit: true },
  },
  { name: 'start price', overrides: { useStartPrice: true, startPrice: '150' } },
  {
    name: 'futures',
    overrides: {
      futures: true,
      leverage: 5,
      marginType: BotMarginTypeEnum.cross,
      strategy: StrategyEnum.short,
    },
  },
  {
    name: 'orders in advance',
    overrides: { useOrderInAdvance: true, ordersInAdvance: 6 },
  },
  { name: 'arithmetic grid', overrides: { gridType: 'arithmetic', feeOrder: false } },
];

/** Grid equivalent of `wirePayload`, through the grid mapper. */
const gridWirePayload = (
  overrides: Record<string, unknown>
): Record<string, unknown> => {
  const formData = {
    ...SHARED_FORM_DEFAULTS,
    type: BotTypesEnum.grid,
    exchangeUUID: 'exchange-uuid',
    dca: { ...DCA_FORM_DEFAULTS },
    combo: { ...COMBO_FORM_DEFAULTS },
    grid: { ...gridBaseline(), ...overrides },
  } as unknown as BotFormData;

  const result = mapGridFormDataToPayload(formData, { mode: 'edit' });
  expect(
    result.success,
    `grid mapper rejected the payload: ${(result.errors ?? []).join('; ')}`
  ).toBe(true);

  return stripUndeclaredUpdateFields(
    (result.updatePayload ?? {}) as Record<string, unknown>,
    { botType: 'grid', stripPair: false }
  );
};

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

test.describe(`grid save payload vs ${INPUT_FOR.grid}`, () => {
  for (const { name, overrides } of GRID_CONFIGS) {
    test(`${name}: every key is declared`, () => {
      const declared = declaredFields('grid');
      const undeclared = Object.keys(gridWirePayload(overrides)).filter(
        (k) => !declared.has(k)
      );

      expect(
        undeclared,
        `These keys reach the ${INPUT_FOR.grid} mutation but are not declared ` +
          `by it, so prod Apollo will reject the whole save with ` +
          `BAD_USER_INPUT — every grid bot save breaks.\n\n` +
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
   * The grid mapper does not emit `updatedBudget` / `newProfit` today, so the
   * subset assertions above never exercise their strip. The grid branch carried
   * those two deletes anyway, because `useFormHandlers` accepts a custom
   * `payloadMapper` that can pass them through. Assert the strip directly so it
   * cannot quietly decay into a no-op, and pin that `pair` survives — grid is
   * the one bot type that keeps it.
   */
  test('grid bookkeeping flags are stripped when a payload does carry them', () => {
    const stripped = stripUndeclaredUpdateFields(
      {
        budget: 1000,
        updatedBudget: true,
        newProfit: true,
        pair: 'BTC/USDT',
      },
      { botType: 'grid', stripPair: false }
    );
    expect(Object.keys(stripped).sort()).toEqual(['budget', 'pair']);
  });

  // Vacuity guard, as above. changeBotInput is only 42 fields wide and the
  // baseline reaches 34, so the floor is set well under that.
  test('the configurations actually exercise the payload', () => {
    const union = new Set<string>();
    for (const { overrides } of GRID_CONFIGS) {
      for (const key of Object.keys(gridWirePayload(overrides))) union.add(key);
    }
    expect(
      union.size,
      `Only ${union.size} keys emitted across all grid configurations — the ` +
        `subset assertions above are passing vacuously.`
    ).toBeGreaterThan(25);
  });
});

/**
 * The deny-list carries a claim about WHY each field is on it. If main-app ever
 * declares one of them, the entry becomes dead weight that silently drops a
 * field the backend would now accept — the quiet failure mode, and the one the
 * subset assertions above cannot see.
 */
test.describe('deny-list rationale still matches the schema', () => {
  test('the always-stripped fields are declared by no change-input', () => {
    const nowDeclared = UNDECLARED_BY_ALL_INPUTS.flatMap((field) =>
      declaredByAnyChangeInput(field).map((input) => `${field} (now in ${input})`)
    );
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

  test('the grid-form fields are declared by no change-input', () => {
    const nowDeclared = UNDECLARED_GRID_FORM_FIELDS.flatMap((field) =>
      declaredByAnyChangeInput(field).map((input) => `${field} (now in ${input})`)
    );
    expect(
      nowDeclared,
      'updatedBudget / newProfit are stripped from grid saves as undeclared, ' +
        'but the schema now declares them — the strip is silently discarding a ' +
        'field the backend would accept.'
    ).toEqual([]);
  });

  test('pair is declared everywhere, so stripping it is behavioural', () => {
    // Documents the one deny-list entry that is NOT schema-driven: the DCA and
    // combo resolvers reject a pair change on a non-multi bot, and that
    // rejection kills every sibling field in the same payload. Grid's
    // changeBot ignores pair instead, which is why grid never strips it.
    for (const botType of ['dca', 'combo', 'grid'] as const) {
      expect(declaredFields(botType).has('pair')).toBe(true);
    }
    expect(denylistFor('dca', true)).toContain('pair');
    expect(denylistFor('dca', false)).not.toContain('pair');
    expect(denylistFor('grid', false)).not.toContain('pair');
  });
});
