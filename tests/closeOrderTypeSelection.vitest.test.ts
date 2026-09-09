import { test, expect } from 'vitest';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import {
  botSettings,
  comboBotSettingsFragment,
  comboDealFragment,
  dcaBotSettingsFragment,
  dcaDealFragment,
} from '@/lib/api/GraphQLQueries-fragments';
import { mapBotSettingsToFormData } from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import { BotTypesEnum, OrderTypeEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * The bot form can only restore a setting the query asked for.
 *
 * `closeOrderType` (Take Profit -> Close order type) is stored, is declared on
 * the bot-settings GraphQL types, and both mappers handle it — yet a bot saved
 * as MARKET reopened as LIMIT, and the next save wrote LIMIT back. Neither
 * mapper was at fault: no selection set ever requested the field, so the
 * response had no key, the read path could not tell "unset" from "not asked
 * for" and substituted `OrderTypeEnum.limit`, and the write path (correctly,
 * and unconditionally since core 50ba1eb/baabc97) persisted that phantom.
 *
 * `botFormRoundTrip.unit.test.ts` probes this field among its 163 and has
 * always been green, because it hands the mapper a settings object directly.
 * The wire is the blind spot, so these tests model it: project a saved payload
 * through the fragment's OWN top-level field list — the server returns nothing
 * else — and only then map it back.
 *
 * The last test is the opposite guard. The shared `botSettings` const resolves
 * to the grid `botSettings` type, which does NOT declare the field:
 *   Cannot query field "closeOrderType" on type "botSettings".
 * Selecting it there fails the whole query, so that const must stay clean.
 */

/**
 * The field names a GraphQL selection set requests at its top level.
 *
 * Nested blocks (`multiTp { … }`, `dcaBot { … }`) are dropped wholesale: their
 * inner names are fields of a different type and would otherwise leak into the
 * projection and mask a missing top-level scalar.
 */
const topLevelFields = (selectionSet: string): Set<string> => {
  const out = new Set<string>();
  let depth = 0;
  let token = '';

  const flush = (openingBlock: boolean) => {
    if (token && depth === 0 && !openingBlock) out.add(token);
    token = '';
  };

  for (const ch of selectionSet) {
    if (/[A-Za-z0-9_]/.test(ch)) {
      token += ch;
      continue;
    }
    if (ch === '{') {
      flush(true);
      depth += 1;
    } else if (ch === '}') {
      token = '';
      depth -= 1;
    } else {
      flush(false);
    }
  }
  flush(false);
  return out;
};

/**
 * The CONTENTS of the `settings { … }` block a deal fragment nests one level
 * down — the braces themselves are stripped so `topLevelFields` sees the
 * settings fields at depth 0 rather than one level in.
 */
const dealSettingsBlock = (fragment: string): string => {
  const start = fragment.indexOf('settings {');
  expect(start, 'deal fragment has a settings block').toBeGreaterThan(-1);
  const open = fragment.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < fragment.length; i += 1) {
    if (fragment[i] === '{') depth += 1;
    else if (fragment[i] === '}') {
      depth -= 1;
      if (depth === 0) return fragment.slice(open + 1, i);
    }
  }
  throw new Error('unterminated settings block');
};

const buildFormData = (
  section: 'dca' | 'combo',
  overrides: Record<string, unknown>
) =>
  ({
    ...SHARED_FORM_DEFAULTS,
    type: section === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca,
    exchangeUUID: 'exchange-uuid',
    dca: { ...DCA_FORM_DEFAULTS, ...(section === 'dca' ? overrides : {}) },
    combo: { ...COMBO_FORM_DEFAULTS, ...(section === 'combo' ? overrides : {}) },
  }) as unknown as BotFormData;

/** Serialize a form -> the settings object main-app stores. */
const save = (formData: BotFormData): Record<string, unknown> => {
  const result = mapFormDataToPayload(formData, { mode: 'edit' });
  expect(result.success, result.errors?.join('; ')).toBe(true);
  return (result.updatePayload ?? {}) as Record<string, unknown>;
};

/** Stored settings -> what the dashboard actually receives for this fragment. */
const overTheWire = (
  stored: Record<string, unknown>,
  selectionSet: string
): Record<string, unknown> => {
  const requested = topLevelFields(selectionSet);
  return Object.fromEntries(
    Object.entries(stored).filter(([key]) => requested.has(key))
  );
};

for (const section of ['dca', 'combo'] as const) {
  const botType =
    section === 'combo' ? BotTypesEnum.combo : BotTypesEnum.dca;
  const fragment =
    section === 'combo' ? comboBotSettingsFragment : dcaBotSettingsFragment;

  test(`${section}: a saved MARKET close order type survives the wire projection`, () => {
    // §1.1.1 / §1.2.1 / §2.3 — the user picked Market and saved.
    const stored = save(
      buildFormData(section, { closeOrderType: OrderTypeEnum.market })
    );
    expect(stored.closeOrderType, 'precondition: the save persists MARKET').toBe(
      OrderTypeEnum.market
    );

    // Reopening the bot: only what the fragment selects comes back.
    const received = overTheWire(stored, fragment);
    const reopened = mapBotSettingsToFormData(botType, received).formData;

    expect(reopened[section].closeOrderType).toBe(OrderTypeEnum.market);
  });

  test(`${section}: an unrelated-field save does not rewrite the close order type`, () => {
    // §1.1.2 / §1.2.2 / §2.4 — reopen, change something else, save again.
    const stored = save(
      buildFormData(section, { closeOrderType: OrderTypeEnum.market })
    );
    const reopened = mapBotSettingsToFormData(
      botType,
      overTheWire(stored, fragment)
    ).formData;

    const editedAgain = buildFormData(section, {
      ...(reopened[section] as unknown as Record<string, unknown>),
      minTp: '4.5',
    });
    const resaved = save(editedAgain);

    expect(resaved.minTp, 'precondition: the unrelated edit did save').toBe(
      '4.5'
    );
    expect(resaved.closeOrderType).toBe(OrderTypeEnum.market);
  });
}

test('the deal fragments select the close order type on their own settings', () => {
  // §2.5 — a deal-level override is shown by TakeProfitSettings inside
  // DealEditDrawer, which seeds from `{ ...deal.dcaBot.settings, ...deal.settings }`.
  for (const [name, fragment] of [
    ['dcaDealFragment', dcaDealFragment],
    ['comboDealFragment', comboDealFragment],
  ] as const) {
    expect(
      topLevelFields(dealSettingsBlock(fragment)),
      `${name}.settings selects closeOrderType`
    ).toContain('closeOrderType');
  }
});

test('the shared grid botSettings selection must NOT ask for the close order type', () => {
  // §2.5 — the grid `botSettings` GraphQL type does not declare the field.
  // Selecting it is not a harmless extra: GraphQL rejects the whole operation,
  // so `botFragment` and `getGridBotSettings` would fail outright.
  expect(topLevelFields(botSettings)).not.toContain('closeOrderType');
});
