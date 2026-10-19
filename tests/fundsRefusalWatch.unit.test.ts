import { test, expect } from '@playwright/test';

import {
  FUNDS_WATCH_MS,
  claimFundsMessage,
  resetFundsWatches,
  watchFundsRequest,
} from '@/features/bots/shared/runtime/dialogs/fundsRefusalWatch';

/**
 * A funds request is answered "scheduled"; the engine's refusal arrives later
 * as a bot message, which must be surfaced as that request's outcome.
 */
test.beforeEach(() => resetFundsWatches());

test('a refusal for the watched bot is claimed once, as a refusal', () => {
  watchFundsRequest('bot1', 'add', 1000);
  const msg =
    "Add funds refused: the order for the deal's position, 0.008 ETH, is below the exchange minimum order size";
  expect(claimFundsMessage('bot2', msg, 2000)).toBeNull();
  const claimed = claimFundsMessage('bot1', msg, 2000);
  expect(claimed?.refused).toBe(true);
  expect(claimFundsMessage('bot1', msg, 2100)).toBeNull();
});

test('a close notice is claimed but is not a refusal', () => {
  watchFundsRequest('bot1', 'reduce', 0);
  const claimed = claimFundsMessage(
    'bot1',
    'Reduce funds covers the whole deal, so the deal will be closed',
    10
  );
  expect(claimed?.refused).toBe(false);
});

test('the DCA engine wording is recognised as a refusal', () => {
  watchFundsRequest('bot1', 'add', 0);
  expect(
    claimFundsMessage(
      'bot1',
      'Add funds order qty is less than exchange minimum requirements',
      10
    )?.refused
  ).toBe(true);
});

test('unrelated messages and expired watches are left alone', () => {
  watchFundsRequest('bot1', 'add', 0);
  expect(claimFundsMessage('bot1', 'Not enough USDT to fund this deal', 10)).toBeNull();
  expect(
    claimFundsMessage('bot1', 'Add funds refused: cannot get price', FUNDS_WATCH_MS + 1)
  ).toBeNull();
});
