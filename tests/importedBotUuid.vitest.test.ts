/**
 * Runner note: Vitest. Run from the parent:
 * `npx vitest run core/tests/importedBotUuid.vitest.test.ts`.
 *
 * A bot's `uuid` is the key a webhook signal is routed by, and the server
 * mints it. Settings imported from a file are spread into the form slice, so a
 * `uuid` in that file must never reach the create or update payload.
 */
import { describe, expect, it } from 'vitest';

import {
  COMBO_FORM_DEFAULTS,
  DCA_FORM_DEFAULTS,
  SHARED_FORM_DEFAULTS,
} from '@/contexts/bots/form/formDefaults';
import { mapFormDataToPayload } from '@/mappers/bots/dca/map-form-data-to-payload';
import { BotTypesEnum, type ExchangeInUser } from '@/types';
import type { BotFormData } from '@/types/bots/form';

const IMPORTED = '11111111-2222-4333-8444-555555555555';

const formWithImportedUuid = (type: BotTypesEnum.dca | BotTypesEnum.combo) =>
  ({
    ...SHARED_FORM_DEFAULTS,
    type,
    pair: ['BTC_USDT'],
    pairMetadata: {
      BTC_USDT: {
        pair: 'BTC_USDT',
        baseAsset: { name: 'BTC' },
        quoteAsset: { name: 'USDT' },
      },
    },
    exchangeUUID: 'exchange-uuid',
    dca: { ...DCA_FORM_DEFAULTS, uuid: IMPORTED },
    combo: { ...COMBO_FORM_DEFAULTS, uuid: IMPORTED },
    grid: {},
  }) as unknown as BotFormData;

const exchange = {
  uuid: 'exchange-uuid',
  provider: 'binance',
} as unknown as ExchangeInUser;

describe('imported bot uuid', () => {
  for (const type of [BotTypesEnum.dca, BotTypesEnum.combo] as const) {
    it(`is not sent when creating a ${type} bot`, () => {
      const r = mapFormDataToPayload(
        formWithImportedUuid(type),
        { mode: 'create' },
        null,
        exchange
      );
      expect(r.success).toBe(true);
      expect(r.createPayload).toBeDefined();
      expect(r.createPayload).not.toHaveProperty('uuid');
    });

    it(`is not sent when saving a ${type} bot`, () => {
      const r = mapFormDataToPayload(formWithImportedUuid(type), {
        mode: 'edit',
      });
      expect(r.success).toBe(true);
      expect(r.updatePayload).not.toHaveProperty('uuid');
    });
  }
});
