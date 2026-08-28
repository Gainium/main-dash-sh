import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import {
  COMBO_ONLY_DEAL_SETTING_KEYS,
  mapFromDataToDealSettings,
} from '@/components/deals/dealEditSettingsDiff';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { BotTypesEnum, type DCADealsSettings } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Guard for the DEAL-edit payload, the sibling of botSavePayloadSchema.
 *
 * `DealEditDrawer` diffs the form slice against the deal (or the bot) and sends
 * whatever differs as `input.settings`. That object is type-constrained:
 * `changeDCADealSettings` takes `dcaDealSettingsInputSet`,
 * `changeComboDealSettings` takes `comboDealSettingsInputSet`, and the two are
 * NOT the same set — eleven fields are combo-only. An undeclared input field is
 * a hard GraphQL validation error, so ONE stray key fails the entire save:
 *
 *   Field "gridLevel" is not defined by type "dcaDealSettingsInputSet".
 *
 * That is exactly what shipped. The drawer's `keys` array is hand-curated and
 * SHARED by both bot types; core 5c75abd added `gridLevel` to it for the combo
 * control that renders under `isComboBot`, and from that commit every DCA deal
 * edit — single and bulk — failed with a 400. It survived review because the
 * key was reasoned about as read-only ("it never differs from the original, so
 * it never ships"), which is true for combo, where the original comes from
 * combo bot settings that carry `gridLevel`, and false for DCA, where neither
 * `dcaBotSettingsFragment` nor `dcaDealFragment` selects it. `original` was
 * `undefined`, the slice held `DCA_FORM_DEFAULTS.gridLevel` ('5'), and the diff
 * found a change on every save.
 *
 * So don't reason about reachability — drive the real diff and check the keys
 * against what main-app actually declares.
 *
 * Declared fields come from `fixtures/graphql-bot-input-fields.json`, the same
 * committed snapshot the bot-save guard reads (main-app is a separate repo and
 * this one is the open-source self-hosted dashboard, so the guard has to run
 * with no main-app checkout and no network). Refresh it with
 * `node scripts/refresh-graphql-input-snapshot.mjs`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

interface SnapshotInput {
  mutation: string;
  fieldCount: number;
  fields: string[];
}

interface Snapshot {
  source: { repo: string; path: string; commitShort: string };
  inputs: Record<string, SnapshotInput>;
}

const snapshot: Snapshot = JSON.parse(
  readFileSync(path.join(here, 'fixtures/graphql-bot-input-fields.json'), 'utf8')
);

type DealBotType = 'dca' | 'combo';

const INPUT_FOR: Record<DealBotType, string> = {
  dca: 'dcaDealSettingsInputSet',
  combo: 'comboDealSettingsInputSet',
};

/**
 * A missing input is a real failure, not a skip: it means the snapshot predates
 * this guard and was never refreshed, and a `new Set([])` would pass every
 * assertion below vacuously.
 */
const inputNamed = (name: string): SnapshotInput => {
  const found = snapshot.inputs[name];
  if (!found) {
    throw new Error(
      `${name} is missing from the GraphQL input snapshot. Re-run ` +
        'node scripts/refresh-graphql-input-snapshot.mjs against a main-app checkout.'
    );
  }
  return found;
};

const declaredFields = (botType: DealBotType): Set<string> =>
  new Set(inputNamed(INPUT_FOR[botType]).fields);

/**
 * The form state the drawer actually starts from.
 *
 * Mirrors `createDefaultFormState(mode, terminal)` in BotFormProvider for the
 * `deal-edit` / `deal-mass-edit` modes: BOTH slices are seeded from their full
 * defaults regardless of which one is in play. That is load-bearing here — it
 * is why `formData.dca.gridLevel` is `'5'` on a DCA deal that has never heard
 * of grid levels. Rebuilt inline rather than imported because
 * BotFormProvider.tsx pulls in the whole React tree.
 */
const dealEditFormData = (
  botType: DealBotType,
  overrides: Record<string, unknown> = {}
): BotFormData =>
  ({
    ...SHARED_FORM_DEFAULTS,
    type: botType === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca,
    exchangeUUID: 'exchange-uuid',
    dca: {
      ...DCA_FORM_DEFAULTS,
      ...(botType === 'dca' ? overrides : {}),
    },
    combo: {
      ...COMBO_FORM_DEFAULTS,
      ...(botType === 'combo' ? overrides : {}),
    },
    grid: {},
  }) as unknown as BotFormData;

/**
 * A deal's own `settings`, as the mass-edit path passes them in (`t.settings`).
 *
 * Deliberately sparse: a real deal document carries only what the engine has
 * written on it, and neither DCA fragment selects a combo field. Filling this
 * in from `DCA_FORM_DEFAULTS` would make `original` equal `newValue` for every
 * key and the diff would emit nothing — the test would pass vacuously against
 * the very bug it exists to catch.
 */
const dealSettings = (extra: Record<string, unknown> = {}): DCADealsSettings =>
  ({
    tpPerc: '1',
    slPerc: '-10',
    ordersCount: 5,
    ...extra,
  }) as unknown as DCADealsSettings;

/**
 * The user-visible actions that reach the mutation. "TP and SL off" is the one
 * from the report: bulk-editing open deals to disable take-profit and
 * stop-loss.
 */
const ACTIONS: { name: string; overrides: Record<string, unknown> }[] = [
  { name: 'no edits (the diff still runs on save)', overrides: {} },
  { name: 'TP and SL off', overrides: { useTp: false, useSl: false } },
  { name: 'TP percentage changed', overrides: { tpPerc: '3.5' } },
  { name: 'SL percentage changed', overrides: { useSl: true, slPerc: '-4' } },
  {
    name: 'trailing TP on',
    overrides: { trailingTp: true, trailingTpPerc: '0.7' },
  },
  {
    name: 'move SL on',
    overrides: { moveSL: true, moveSLTrigger: '1', moveSLValue: '0.4' },
  },
  { name: 'DCA off', overrides: { useDca: false } },
  {
    name: 'futures',
    overrides: { futures: true, leverage: 5, coinm: false },
  },
];

/**
 * Both call shapes in `handleSubmit`. Single-deal edit passes no
 * `originalTradeSettings` and falls back to the bot's settings; bulk edit
 * passes each deal's own. They diff against different originals, so a key can
 * ship in one and not the other — both broke on `gridLevel`, for different
 * reasons.
 */
const CALL_SHAPES: {
  name: string;
  isMultiple: boolean;
  original: (botType: DealBotType) => DCADealsSettings | undefined;
}[] = [
  { name: 'single deal', isMultiple: false, original: () => undefined },
  {
    name: 'bulk edit',
    isMultiple: true,
    original: () => dealSettings(),
  },
];

for (const botType of ['dca', 'combo'] as DealBotType[]) {
  test.describe(`${botType} deal-edit payload vs ${INPUT_FOR[botType]}`, () => {
    for (const shape of CALL_SHAPES) {
      for (const { name, overrides } of ACTIONS) {
        test(`${shape.name} / ${name}: every key is declared`, () => {
          const declared = declaredFields(botType);
          const settings = mapFromDataToDealSettings(
            dealEditFormData(botType, overrides),
            shape.isMultiple,
            false,
            shape.original(botType)
          );
          const undeclared = Object.keys(settings).filter(
            (k) => !declared.has(k)
          );

          expect(
            undeclared,
            `These keys reach ${inputNamed(INPUT_FOR[botType]).mutation} ` +
              `but are not declared by ${INPUT_FOR[botType]}, so Apollo rejects ` +
              `the whole operation with BAD_USER_INPUT — every ${botType} deal ` +
              `edit breaks with "Failed to edit deal: HTTP error! status: 400".` +
              `\n\nFix: if the field should persist on a ${botType} deal, ` +
              `declare it on ${INPUT_FOR[botType]} in main-app ` +
              `core/src/graphql/schema.ts and re-run ` +
              `scripts/refresh-graphql-input-snapshot.mjs. If it belongs only ` +
              `to the other bot type, add it to COMBO_ONLY_DEAL_SETTING_KEYS ` +
              `in src/components/deals/dealEditSettingsDiff.ts.` +
              `\n\nUndeclared: ${undeclared.join(', ')}`
          ).toEqual([]);
        });
      }
    }

    /**
     * Vacuity guard. Every assertion above passes if the diff emits nothing, so
     * pin a floor: the union across the actions has to stay broad. Loose on
     * purpose — this catches "it collapsed", not the exact count.
     */
    test('the actions actually exercise the payload', () => {
      const union = new Set<string>();
      for (const shape of CALL_SHAPES) {
        for (const { overrides } of ACTIONS) {
          for (const key of Object.keys(
            mapFromDataToDealSettings(
              dealEditFormData(botType, overrides),
              shape.isMultiple,
              false,
              shape.original(botType)
            )
          )) {
            union.add(key);
          }
        }
      }
      expect(
        union.size,
        `Only ${union.size} distinct keys were emitted across every action, ` +
          `so the subset assertions above prove almost nothing. Either the ` +
          `diff stopped emitting or the fixtures stopped differing from the ` +
          `form slice.`
      ).toBeGreaterThan(15);
    });
  });
}

test.describe('COMBO_ONLY_DEAL_SETTING_KEYS', () => {
  /**
   * The runtime filter is a hardcoded set; the snapshot is the truth. This
   * proves the set is not claiming something false, and — more usefully —
   * fails when main-app moves a field from one input to the other.
   */
  test('every member really is combo-only in main-app', () => {
    const dca = new Set(inputNamed('dcaDealSettingsInputSet').fields);
    const combo = new Set(inputNamed('comboDealSettingsInputSet').fields);

    for (const key of COMBO_ONLY_DEAL_SETTING_KEYS) {
      expect(
        combo.has(key),
        `${key} is filtered out of DCA deal edits as "combo-only", but ` +
          `comboDealSettingsInputSet does not declare it either — so it is ` +
          `dead everywhere and should come off the drawer's keys array.`
      ).toBe(true);
      expect(
        dca.has(key),
        `${key} is filtered out of DCA deal edits, but ` +
          `dcaDealSettingsInputSet DOES declare it now. Drop it from ` +
          `COMBO_ONLY_DEAL_SETTING_KEYS or DCA deals silently lose the field.`
      ).toBe(false);
    }
  });

  /**
   * The pin for the actual regression, stated in the terms the failure had:
   * `gridLevel` must not ride out on a DCA deal, and must still be able to on
   * a combo one (an over-broad filter would make it silently unsaveable —
   * the other failure mode the drawer's keys array exists to prevent).
   */
  test('gridLevel is dropped for DCA and kept for combo', () => {
    const dcaKeys = Object.keys(
      mapFromDataToDealSettings(
        dealEditFormData('dca'),
        true,
        false,
        dealSettings()
      )
    );
    expect(dcaKeys).not.toContain('gridLevel');

    const comboKeys = Object.keys(
      mapFromDataToDealSettings(
        dealEditFormData('combo', { gridLevel: '9' }),
        true,
        false,
        dealSettings({ gridLevel: '5' })
      )
    );
    expect(comboKeys).toContain('gridLevel');
  });
});
