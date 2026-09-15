// Vitest, not Playwright: the mutation builders import the query fragments,
// which read `import.meta.env`, so this needs the project's own Vite pipeline
// (see the note in vitest.config.ts about the `*.vitest.test.*` suffix).
import { test, expect } from 'vitest';

import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import { mapFromDataToDealSettings } from '@/components/deals/dealEditSettingsDiff';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { BotTypesEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Guard for the WIRE TYPE of the deal-edit settings payload — the sibling
 * concern to dealEditPayloadSchema.unit.test.ts, which guards which KEYS may
 * appear. This one guards what those keys' values must be.
 *
 * main-app declares `ordersCount` and `activeOrdersCount` as `Int` on
 * `dcaDealSettingsInputSet` / `comboDealSettingsInputSet`. Every other member
 * of those sets is String/Float/Boolean/an enum. GraphQL does not coerce a
 * string into an `Int`, so sending one fails variable validation outright:
 *
 *   Variable "$input" got invalid value … at "input.settings.ordersCount";
 *   Int cannot represent non-integer value: "5"
 *
 * That is a BAD_USER_INPUT rejection of the WHOLE operation before the
 * resolver runs — the deal is never touched and the user sees only a generic
 * "failed" toast, with no server-side trace (main-app logs no GraphQL ops).
 *
 * It shipped because the builders' input type was `Partial<DCADealsSettings>`,
 * which picks from the form-shaped `DCABotSettings` where numeric fields are
 * `string` so they can back a text input. The type therefore REQUIRED the
 * "Change DCA levels" dialogs to stringify their number, and they did.
 *
 * Assert on the builder output, because that is the one choke point every
 * deal-edit path (the three dialogs, the edit drawer) funnels through.
 */

const dcaLevelsDialogSettings = (newMax: number) =>
  // The exact object TradeCard / DrawerDealsTable / OpenOrdersWidget build in
  // their `handleChangeDcaConfirm`.
  newMax === 0
    ? ({ useDca: false } as const)
    : ({ useDca: true, ordersCount: newMax } as const);

test('changeDCADealSettings puts ordersCount on the wire as a number', () => {
  const { variables } = dealQueries.changeDCADealSettings({
    botId: 'b',
    dealId: 'd',
    settings: dcaLevelsDialogSettings(5),
  });

  expect(typeof variables.input.settings.ordersCount).toBe('number');
  expect(variables.input.settings.ordersCount).toBe(5);
});

test('changeComboDealSettings puts ordersCount on the wire as a number', () => {
  const { variables } = dealQueries.changeComboDealSettings({
    botId: 'b',
    dealId: 'd',
    settings: dcaLevelsDialogSettings(5),
  });

  expect(typeof variables.input.settings.ordersCount).toBe('number');
  expect(variables.input.settings.ordersCount).toBe(5);
});

test('the 0 branch still disables DCA and carries no ordersCount', () => {
  // Setting the level count to 0 takes a different branch — it sends
  // `useDca: false` and no `ordersCount` at all, which is why it was the one
  // value that worked while every other value failed. Keep it that way.
  const settings = dcaLevelsDialogSettings(0);
  expect(settings).toEqual({ useDca: false });

  const { variables } = dealQueries.changeDCADealSettings({
    botId: 'b',
    dealId: 'd',
    settings,
  });
  expect(variables.input.settings).toEqual({ useDca: false });
  expect('ordersCount' in variables.input.settings).toBe(false);
});

test('the builder coerces a form-shaped string, whatever the caller passed', () => {
  const { variables } = dealQueries.changeDCADealSettings({
    botId: 'b',
    dealId: 'd',
    // The deal-edit diff assembles its result over a form-shaped accumulator
    // with `@ts-expect-error`, so the compiler cannot be the only guarantee.
    settings: { ordersCount: '7', activeOrdersCount: '2' } as never,
  });

  expect(variables.input.settings.ordersCount).toBe(7);
  expect(variables.input.settings.activeOrdersCount).toBe(2);
});

test('a value that cannot parse is dropped, not sent as null', () => {
  // `parseFloat('')` is NaN and JSON.stringify turns NaN into null; `Int` is
  // nullable here, so sending it would blank the setting rather than leave it
  // alone. Dropping the key leaves the deal's current value untouched.
  const { variables } = dealQueries.changeDCADealSettings({
    botId: 'b',
    dealId: 'd',
    settings: { useDca: true, ordersCount: '' } as never,
  });

  expect('ordersCount' in variables.input.settings).toBe(false);
  expect(variables.input.settings.useDca).toBe(true);
});

test('the edit drawer emits a numeric ordersCount when diffed against bot settings', () => {
  // On a SINGLE-deal save the drawer diffs against `formData.originalBot`
  // — the BOT's settings, where the form keeps `ordersCount` as a string — so
  // the diff's existing "original is a number" coercion never fired and the
  // drawer shipped a string too.
  const formData = {
    ...SHARED_FORM_DEFAULTS,
    type: BotTypesEnum.dca,
    dca: { ...DCA_FORM_DEFAULTS, ordersCount: '9' },
    combo: { ...COMBO_FORM_DEFAULTS },
    originalBot: {
      type: BotTypesEnum.dca,
      settings: { ...DCA_FORM_DEFAULTS, ordersCount: '4' },
    },
  } as unknown as BotFormData;

  const settings = mapFromDataToDealSettings(formData, false);

  expect(settings.ordersCount).toBe(9);
  expect(typeof settings.ordersCount).toBe('number');
});
