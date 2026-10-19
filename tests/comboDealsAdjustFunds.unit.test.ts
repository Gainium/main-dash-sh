import { test, expect } from '@playwright/test';

import {
  canAdjustDealFunds,
  isComboFundsTarget,
  type BulkAdjustFundsTarget,
} from '@/components/deals/actions/bulkAdjustFundsTargets';
import { BotTypesEnum } from '@/types';

/**
 * Add/Reduce Funds is offered on DCA and combo deals. A combo deal scales every
 * DCA level by one factor (the engine resolves combo bots since main-app's
 * combo funds path). Hedge combo legs have no funds path, so every surface
 * that offers the control still excludes them.
 *
 * A deal row carries its bot type in one of two shapes and the rule reads
 * both: the string the tables render, and the `BotTypesEnum` the card views get
 * as a prop. Inside the bot drawer only the second one is populated.
 */

const target = (over: Partial<BulkAdjustFundsTarget>): BulkAdjustFundsTarget => ({
  dealId: 'd',
  botId: 'b',
  status: 'open',
  type: 'DCA',
  ...over,
});

test('a combo deal takes funds, in either representation', () => {
  expect(isComboFundsTarget('Combo')).toBe(false);
  expect(isComboFundsTarget(undefined, BotTypesEnum.combo)).toBe(false);
  expect(canAdjustDealFunds(target({ type: 'Combo' }))).toBe(true);
});

test('a hedge combo leg is excluded, recognised from the type string or the bot type', () => {
  expect(isComboFundsTarget('Hedge Combo')).toBe(true);
  expect(isComboFundsTarget(undefined, BotTypesEnum.hedgeCombo)).toBe(true);
  // The drawer hands down the bot's type while the deal still says 'DCA'.
  expect(isComboFundsTarget('DCA', BotTypesEnum.hedgeCombo)).toBe(true);
  expect(canAdjustDealFunds(target({ type: 'Hedge Combo' }))).toBe(false);
});

test('DCA, terminal and hedge DCA deals are untouched', () => {
  expect(isComboFundsTarget('DCA')).toBe(false);
  expect(isComboFundsTarget('DCA', BotTypesEnum.dca)).toBe(false);
  expect(isComboFundsTarget(undefined)).toBe(false);
  expect(isComboFundsTarget('Terminal', BotTypesEnum.terminal)).toBe(false);
  expect(isComboFundsTarget('Hedge DCA', BotTypesEnum.hedgeDca)).toBe(false);
});

test('canAdjustDealFunds still turns on open/botId', () => {
  expect(canAdjustDealFunds(target({}))).toBe(true);
  expect(canAdjustDealFunds(target({ status: 'closed' }))).toBe(false);
  expect(canAdjustDealFunds(target({ botId: undefined }))).toBe(false);
  expect(canAdjustDealFunds(target({ dealId: '' }))).toBe(false);
});
