import { test, expect } from '@playwright/test';

import { mapDcaFields } from '@/mappers/bots/dca/field-mapping';
import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  GRID_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import {
  BotTypesEnum,
  DCAConditionEnum,
  IndicatorAction,
  IndicatorEnum,
} from '@/types';
import type { BotFormData } from '@/types/bots/form';

/**
 * Bug #255 — a MAR indicator on a bot LOADED FROM THE API arrives with explicit
 * `null`s for every MAR field the document never stored (the GraphQL indicator
 * selection asks for mar1type/mar2type/mar2length, so an absent one answers
 * `null`). The form renders those as the catalog defaults — EMA / Current price
 * / 20 — but saving must send them too, or the document comes back exactly as
 * incomplete as it went in.
 */

// A MAR row exactly as the API hands it back for a pre-fix document: only
// `mar1length` was ever stored, the RSI leftovers from the row's birth as RSI
// are still there, and the three MAR fields are explicit nulls.
const marFromApi = {
  uuid: 'mar-row-0',
  type: IndicatorEnum.mar,
  indicatorAction: IndicatorAction.startDca,
  indicatorInterval: '15m',
  mar1length: 20,
  mar1type: null,
  mar2type: null,
  mar2length: null,
  indicatorLength: 7,
  indicatorValue: '70',
  minPercFromLast: '1',
  orderSize: '100',
  groupId: '',
};

const makeFormData = (indicators: unknown[]): BotFormData =>
  ({
    type: BotTypesEnum.dca,
    dca: {
      ...DCA_FORM_DEFAULTS,
      useDca: true,
      dcaCondition: DCAConditionEnum.indicators,
      indicators,
    },
    combo: { ...COMBO_FORM_DEFAULTS },
    grid: { ...GRID_FORM_DEFAULTS },
  }) as unknown as BotFormData;

test.describe('bug #255 — serialized DCA indicator payload', () => {
  test('a MAR loaded from the API is sent with the fields the form displayed', () => {
    const result = mapDcaFields(makeFormData([marFromApi]));

    expect(result.success).toBeTruthy();
    const sent = (
      result.data?.indicators as unknown as Record<string, unknown>[]
    )?.[0];

    console.log('outgoing MAR:', JSON.stringify(sent));

    // The three holes the engine trips over.
    expect(sent?.mar1type, 'mar1type reaches the payload').toBe('ema');
    expect(sent?.mar2type, 'mar2type reaches the payload').toBe('price');
    expect(sent?.mar2length, 'mar2length reaches the payload').toBe(20);

    // indicatorLoader sizes MAR's warm-up with Math.max(mar1length, mar2length).
    expect(
      Math.max(Number(sent?.mar1length), Number(sent?.mar2length)),
      'warm-up depth is a number, not NaN'
    ).toBe(20);

    // MAR's constructor calls ma2Type.toLowerCase() on the raw argument.
    expect(() =>
      String(sent?.mar2type as string).toLowerCase()
    ).not.toThrow();
  });

  // A MAR row born as RSI and switched over holds no MAR field at all, not
  // even `mar1length`. Whatever gets filled in for it has to be the value the
  // engine was ALREADY using, or the save silently re-tunes the bot.
  test('a filled-in default matches the engine, it does not re-tune the bot', () => {
    const { mar1length: _unset, ...noBaseLength } = marFromApi;

    const sent = (
      mapDcaFields(makeFormData([noBaseLength])).data
        ?.indicators as unknown as Record<string, unknown>[]
    )?.[0];

    // dcaHelper: `const mar1length = +(_mar1length ?? 20)`; same 20 in
    // botDefaults' `indicatorConfigDefaults[mar]` and in legacy's.
    expect(sent?.mar1length, 'base MA length agrees with the engine').toBe(20);
    expect(sent?.mar2length).toBe(20);
  });

  test('values the user actually set are never overwritten by a default', () => {
    const userSet = {
      ...marFromApi,
      mar1type: 'sma', // catalog default is 'ema'
      mar1length: 55, // catalog default is 20
      mar2type: 'wma', // catalog default is 'price'
      mar2length: 100, // catalog default is 20
      indicatorInterval: '4h', // catalog default is 1h
    };

    const sent = (
      mapDcaFields(makeFormData([userSet])).data
        ?.indicators as unknown as Record<string, unknown>[]
    )?.[0];

    expect(sent?.mar1type).toBe('sma');
    expect(sent?.mar1length).toBe(55);
    expect(sent?.mar2type).toBe('wma');
    expect(sent?.mar2length).toBe(100);
    expect(sent?.indicatorInterval).toBe('4h');
    expect(sent?.orderSize).toBe('100');
    expect(sent?.minPercFromLast).toBe('1');
  });
});
