import { test, expect } from '@playwright/test';

import {
  MAX_PERCENT,
  fromAmountMode,
  toAmountMode,
  type AmountMode,
} from '@/features/bots/shared/runtime/dialogs/adjustFundsAmount';
import { AddFundsTypeEnum, OrderSizeTypeEnum } from '@/types';

/**
 * The Add/Reduce funds dialog shows ONE selector for what the user reads as a
 * single question — "how am I expressing this amount?" — but the payload it
 * builds has two independent fields, `asset` and `type`. These lock the map
 * between them, because every way of getting it wrong sends a real order for
 * the wrong size:
 *
 *  - picking `%` but leaving `type: fixed` reduces a 1000-SOL position by
 *    33 SOL instead of 330;
 *  - reaching for `OrderSizeTypeEnum.percTotal` / `percFree` — the two enum
 *    members that also read as "percent" — sizes off the exchange BALANCE
 *    rather than the deal's own position, a different number entirely.
 *
 * The engine's percentage branch lives in main-app core `dcaHelper`
 * (`addDealFunds` / `reduceDealFunds`) and keys on `AddFundsTypeEnum.perc`
 * alone.
 */

const MODES: AmountMode[] = ['base', 'quote', 'perc'];

test('percent maps to AddFundsTypeEnum.perc, never to a balance percentage', () => {
  const { type, asset } = fromAmountMode('perc');

  expect(type).toBe(AddFundsTypeEnum.perc);
  expect(asset).not.toBe(OrderSizeTypeEnum.percTotal);
  expect(asset).not.toBe(OrderSizeTypeEnum.percFree);
});

test('percent still pins a concrete asset, because the API validates it', () => {
  // `addDealFundsInput.asset` is `String!`, and the public REST validator
  // type-checks `asset` whenever it is present, so the percentage path cannot
  // leave it undefined even though the engine ignores it there.
  expect([OrderSizeTypeEnum.base, OrderSizeTypeEnum.quote]).toContain(
    fromAmountMode('perc').asset
  );
});

test('base and quote stay fixed-quantity orders', () => {
  expect(fromAmountMode('base')).toEqual({
    asset: OrderSizeTypeEnum.base,
    type: AddFundsTypeEnum.fixed,
  });
  expect(fromAmountMode('quote')).toEqual({
    asset: OrderSizeTypeEnum.quote,
    type: AddFundsTypeEnum.fixed,
  });
});

test('every mode round-trips through the payload it builds', () => {
  for (const mode of MODES) {
    const { asset, type } = fromAmountMode(mode);
    expect(toAmountMode(asset, type)).toBe(mode);
  }
});

test('a stored perc payload reads back as perc whatever the asset says', () => {
  // Webhook and public-API callers can send any `asset` alongside
  // `type: perc`, so the selector has to follow `type`, not `asset`.
  expect(toAmountMode(OrderSizeTypeEnum.quote, AddFundsTypeEnum.perc)).toBe(
    'perc'
  );
  expect(toAmountMode(OrderSizeTypeEnum.base, AddFundsTypeEnum.perc)).toBe(
    'perc'
  );
});

test('the percentage ceiling is shared by both validators', () => {
  // Confirm used to allow 1000 while the live validator allowed 100, so the
  // button enforced a limit the submit path did not share.
  expect(MAX_PERCENT).toBe(100);
});
