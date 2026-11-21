import { describe, expect, it } from 'vitest';

import { resolveIndicatorVars } from '../src/hooks/bots/global-variables/botVarBindingUtils';
import type { BotVars } from '../src/types';

// The chart and the settings card must show the value the engine evaluates:
// a field bound to a global variable carries the variable's value, not the
// literal saved on the bot when it was bound.
const ath = {
  uuid: 'ath-1',
  type: 'ATH',
  indicatorValue: '80',
  indicatorCondition: 'gt',
  athLookback: 2190,
};
const paths = [
  { path: 'indicators.ath-1.indicatorValue', variable: 'v-ath' },
  { path: 'cooldownAfterDealStopInterval', variable: 'v-cd' },
] as BotVars['paths'];
const variables = [
  { id: 'v-ath', value: '50' },
  { id: 'v-cd', value: '8' },
];

describe('resolveIndicatorVars', () => {
  it('replaces a bound indicator field with the variable value', () => {
    const resolved = resolveIndicatorVars(ath, paths, variables);
    expect(resolved.indicatorValue).toBe('50');
    expect(resolved.athLookback).toBe(2190);
    expect(ath.indicatorValue).toBe('80'); // input not mutated
  });

  it('leaves indicators of other uuids untouched (same object)', () => {
    const other = { ...ath, uuid: 'ath-2' };
    expect(resolveIndicatorVars(other, paths, variables)).toBe(other);
  });

  it('keeps the saved value until the variables have loaded', () => {
    expect(resolveIndicatorVars(ath, paths, [])).toBe(ath);
  });

  it('ignores a binding whose variable is missing', () => {
    const resolved = resolveIndicatorVars(ath, paths, [
      { id: 'v-cd', value: '8' },
    ]);
    expect(resolved).toBe(ath);
  });
});
