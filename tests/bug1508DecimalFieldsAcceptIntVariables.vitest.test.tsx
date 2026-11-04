/**
 * Runner note: Vitest (jsdom), run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/bug1508DecimalFieldsAcceptIntVariables.vitest.test.tsx`
 *
 * Spec `specs/145.decimal-fields-hide-int-variables.md`.
 * §1 reads each bot-form binding's `varType` from source (the call site is the
 * defect — the picker itself is covered by bug1508VariablePickerAllAndSearch);
 * §2 renders the picker with the reporter's variable shape.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const VARS = [
  { id: 'a', name: 'over_v', type: 'int', value: '5', botAmount: 0 },
  { id: 'b', name: 'under_v', type: 'int', value: '5', botAmount: 926 },
  { id: 'c', name: 'min_tp', type: 'float', value: '2.0', botAmount: 926 },
];

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  class FakeClient {
    async request() {
      return {
        getGlobalVariables: {
          status: 'OK',
          reason: null,
          total: VARS.length,
          data: VARS,
        },
      };
    }
  }
  return { ...actual, GraphQLClient: FakeClient };
});

import { VariableSearch } from '@/components/global-variables/GlobalVariableSearch';
import { useAuthStore } from '@/stores/authStore';
import type { VarToSearchType } from '@/types';

const ROOT = resolve(__dirname, '../src/features/bots');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** varType of the binding whose path/varBindingPath is `binding`. */
const varTypeOf = (src: string, binding: string): string[] => {
  const out: string[] = [];
  const re = new RegExp(
    `(?:path|varBindingPath)=(?:"${binding}"|\\{${binding}\\})[\\s\\S]{0,200}?varType="(\\w+)"`,
    'g'
  );
  for (const m of src.matchAll(re)) out.push(m[1] as string);
  return out;
};

const DEAL_START = 'bot-types/dca/form/sections/DealStartSettings.tsx';
// V1 binds each of these with varType="number" (spec §1.1).
const NUMBER_FIELDS: Array<[string, string]> = [
  [DEAL_START, 'dynamicPriceFilterOverValue'],
  [DEAL_START, 'dynamicPriceFilterUnderValue'],
  [DEAL_START, 'minOpenDeal'],
  [DEAL_START, 'maxOpenDeal'],
  ['shared/sections/TakeProfitSettings.tsx', 'tpPerc'],
  ['shared/sections/TakeProfitSettings.tsx', 'minTp'],
  ['shared/components/MultiTarget.tsx', 'percentagePath'],
  ['shared/components/MultiTarget.tsx', 'amountPath'],
  ['bot-types/dca/form/sections/DCASettings.tsx', 'step'],
  ['bot-types/dca/form/sections/DCASettings.tsx', 'stepScale'],
  ['bot-types/dca/form/sections/DCASettings.tsx', 'volumeScale'],
  ['bot-types/dca/form/sections/DCASettings.tsx', 'stepVariablePath'],
  ['bot-types/dca/form/sections/DCASettings.tsx', 'minPercVariablePath'],
  ['shared/sections/StrategySettings.tsx', 'baseOrderSize'],
  ['shared/sections/StrategySettings.tsx', 'baseStep'],
  ['shared/sections/StrategySettings.tsx', 'riskReductionValue'],
  ['shared/sections/StrategySettings.tsx', 'reinvestValue'],
  ...[
    'rrSlFixedValue',
    'riskSlAmountPerc',
    'riskSlAmountValue',
    'riskTpRatio',
    'riskMinSl',
    'riskMaxSl',
    'riskMinPositionSize',
    'riskMaxPositionSize',
  ].map(
    (p) =>
      ['bot-types/dca/form/sections/RiskRewardSettings.tsx', p] as [
        string,
        string,
      ]
  ),
];

const renderPicker = (varType: VarToSearchType) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <VariableSearch varType={varType} onSelect={() => {}} />
    </QueryClientProvider>
  );

beforeEach(() => {
  useAuthStore.setState({ tokens: { accessToken: 'test-token' } } as never);
});
afterEach(() => cleanup());

describe('bug #1508 — decimal fields accept int variables (spec 145)', () => {
  test.each(NUMBER_FIELDS)('§1.1 %s %s binds varType="number"', (f, p) => {
    const types = varTypeOf(read(f), p);
    expect(types.length).toBeGreaterThan(0);
    expect(new Set(types)).toEqual(new Set(['number']));
  });

  test('§1.3 whole-number fields keep varType="int"', () => {
    const src = read(DEAL_START);
    expect(varTypeOf(src, 'maxNumberOfOpenDeals')).toEqual(['int']);
    for (const p of ['cooldownAfterDealStartInterval', 'cooldownAfterDealStopInterval']) {
      for (const t of varTypeOf(src, p)) expect(t).toBe('int');
    }
  });

  test('§2 Over Value picker (number) lists the int variable over_v', async () => {
    const [overType] = varTypeOf(read(DEAL_START), 'dynamicPriceFilterOverValue');
    renderPicker(overType as VarToSearchType);
    await screen.findByText('min_tp');
    expect(screen.getByText('over_v')).toBeTruthy();
    expect(screen.getByText('under_v')).toBeTruthy();
  });
});
