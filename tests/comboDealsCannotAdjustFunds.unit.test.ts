import { test, expect } from '@playwright/test';

import {
  canAdjustDealFunds,
  isComboFundsTarget,
  type BulkAdjustFundsTarget,
} from '@/components/deals/actions/bulkAdjustFundsTargets';
import { BotTypesEnum } from '@/types';

/**
 * Spec 046. Add/Reduce Funds runs `addDealFunds`/`reduceDealFunds`, which
 * resolve the bot out of the DCA collection only — a combo bot's id is not
 * there, so the mutation answers "Bot not found" and nothing is placed. Every
 * surface that offers the control must therefore exclude combo deals.
 *
 * A deal row carries its bot type in one of two shapes and the rule has to read
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

// §1.1, §5.2 — the type string, which is what the tables and the bulk path read.
test('a combo deal is a combo funds target, recognised from the deal type string', () => {
  expect(isComboFundsTarget('Combo')).toBe(true);
});

// §5.2 — hedge combo bots live in their own collection too, so the same
// DCA-only lookup misses them identically.
test('a hedge combo deal is a combo funds target too', () => {
  expect(isComboFundsTarget('Hedge Combo')).toBe(true);
});

// §5.2 — the drawer's case. Its deals carry no type of their own, so a gate
// written on the type string alone would hide nothing in the card view.
test('a combo deal is recognised from the bot type enum alone (the drawer case)', () => {
  expect(isComboFundsTarget(undefined, BotTypesEnum.combo)).toBe(true);
  expect(isComboFundsTarget('', BotTypesEnum.combo)).toBe(true);
  // The drawer hands down the bot's type while the deal still says 'DCA'.
  expect(isComboFundsTarget('DCA', BotTypesEnum.combo)).toBe(true);
  expect(isComboFundsTarget(undefined, BotTypesEnum.hedgeCombo)).toBe(true);
});

// §5.4 — the whole point of the gate is that it is a combo test and nothing
// else. DCA deals must be untouched.
test('a DCA deal is not a combo funds target, in either representation', () => {
  expect(isComboFundsTarget('DCA')).toBe(false);
  expect(isComboFundsTarget('DCA', BotTypesEnum.dca)).toBe(false);
  expect(isComboFundsTarget(undefined)).toBe(false);
  expect(isComboFundsTarget('Grid')).toBe(false);
  expect(isComboFundsTarget('Terminal', BotTypesEnum.terminal)).toBe(false);
  // 'Hedge DCA' legs are DCA deals — not excluded.
  expect(isComboFundsTarget('Hedge DCA', BotTypesEnum.hedgeDca)).toBe(false);
});

// §5.1 — canAdjustDealFunds is re-expressed in terms of the predicate; its
// behaviour must not move.
test('canAdjustDealFunds still refuses a combo deal', () => {
  expect(canAdjustDealFunds(target({ type: 'Combo' }))).toBe(false);
  expect(canAdjustDealFunds(target({ type: 'Hedge Combo' }))).toBe(false);
});

test('canAdjustDealFunds still turns on open/botId for a DCA deal', () => {
  expect(canAdjustDealFunds(target({}))).toBe(true);
  expect(canAdjustDealFunds(target({ status: 'closed' }))).toBe(false);
  expect(canAdjustDealFunds(target({ botId: undefined }))).toBe(false);
  expect(canAdjustDealFunds(target({ dealId: '' }))).toBe(false);
});
