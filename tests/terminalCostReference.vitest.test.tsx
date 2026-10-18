/**
 * Runner note: renders a React hook in jsdom, so it is a Vitest file. Run from
 * the parent, with `NODE_ENV=development` (a production React build has no
 * `React.act`):
 * `NODE_ENV=development npx vitest run core/tests/terminalCostReference.vitest.test.tsx`
 *
 * Spec: `main-dash-redesign/specs/125.terminal-cost-reference-display.md`.
 *
 * The stored `baseOrderSize` is always the notional. Under the futures "Cost"
 * order-size reference the terminal's Amount / Total fields and their max
 * figures must read notional ÷ leverage (§1.1), a typed cost must still store
 * cost × leverage (§1.2, §1.4), and Notional must be untouched (§1.3).
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCallback, useState } from 'react';

type FormState = Record<string, unknown>;
const store: { current: FormState } = { current: {} };

// The real form provider hands out stable identities; fresh ones per render
// would turn the hook's sync effects into a render loop. `vi.hoisted` keeps
// them reachable from the hoisted `vi.mock` factories.
const stable = vi.hoisted(() => ({
  formContext: { setErrors: () => {}, mode: 'create' },
  isFieldLocked: () => false,
  query: { exchanges: [] },
  varBinding: { isBound: false, unbindVariable: () => {} },
  graphQL: {
    data: undefined,
    error: null,
    isLoading: false,
    isFetching: false,
  },
  balanceRefresh: {
    canTriggerBalanceRefresh: false,
    handleRefreshBalances: () => {},
  },
  pooled: { pooledUsd: null },
  trading: {
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    aggregatedBalances: {
      base: { free: 0, locked: 0 },
      quote: { free: 1000, locked: 0 },
    },
    latestPrice: 50000,
    selectedPairs: [],
    usdPrice: 1,
    quoteMinAmount: 1,
    provider: 'binanceUsdm',
    fee: 0,
  },
}));

vi.mock('@/features/bots', () => ({
  useBotFormContext: () => stable.formContext,
  useBotFormFieldLock: () => stable.isFieldLocked,
  useBotFormSelector: (field: string) => store.current[field],
}));
vi.mock(
  '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider',
  () => ({ useBotFormQuery: () => stable.query }),
);
vi.mock('@/contexts/bots/form/HedgeBotFormProvider', () => ({
  useHedgeBotFormOptional: () => undefined,
}));
vi.mock('@/hooks/bots/dca/useDcaTradingContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useDcaTradingContext: () => stable.trading,
}));
vi.mock('@/hooks/bots/global-variables/useBotVarBinding', () => ({
  default: () => stable.varBinding,
}));
vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: () => stable.graphQL,
}));
vi.mock('@/stores/uiStore', () => ({
  useUIStore: (selector: (s: { isLiveTrading: boolean }) => unknown) =>
    selector({ isLiveTrading: false }),
}));
vi.mock(
  '@/features/bots/bot-types/dca/form/hooks/useBalanceRefreshControl',
  () => ({
    useBalanceRefreshControl: () => stable.balanceRefresh,
  }),
);
vi.mock('@/hooks/bots/dca/usePooledMarginUsd', () => ({
  usePooledMarginUsd: () => stable.pooled,
  poolCoversQuote: () => false,
}));

import { useStrategySettingsTab } from '@/features/bots/bot-types/dca/form/hooks/useStrategySettignsTab';
import type { StrategySettingsProps } from '@/features/bots/bot-types/dca/form/sections';

const renderTerminal = (initial: FormState) =>
  renderHook(() => {
    const [formData, setFormData] = useState<FormState>(initial);
    store.current = formData;
    const updateFormData = useCallback(
      (key: string, value: unknown) =>
        setFormData((prev) =>
          Object.is(prev[key], value) ? prev : { ...prev, [key]: value },
        ),
      [],
    );
    const tab = useStrategySettingsTab({
      formData,
      updateFormData,
    } as unknown as StrategySettingsProps);
    return { tab, formData, setFormData };
  });

const futures5x = {
  futures: true,
  leverage: 5,
  marginType: 'isolated',
  strategy: 'LONG',
  orderSizeType: 'quote',
  baseOrderSize: '100',
  orderSizeReference: 'value',
};

describe('terminal Amount/Total under the Cost order-size reference', () => {
  it('§1.3 Notional shows the stored notional', () => {
    const { result } = renderTerminal(futures5x);
    expect(result.current.tab.totalFieldValue).toBe(100);
    expect(result.current.tab.amountFieldValue).toBeCloseTo(0.002, 8);
  });

  it('§1.1 toggling to Cost shows notional ÷ leverage; stored size unchanged', () => {
    const { result } = renderTerminal(futures5x);
    const notionalMaxTotal = Number(result.current.tab.maxTotal);
    const notionalMaxAmount = Number(result.current.tab.maxAmount);

    act(() =>
      result.current.setFormData((p) => ({ ...p, orderSizeReference: 'cost' })),
    );

    expect(result.current.tab.totalFieldValue).toBe(20);
    expect(result.current.tab.amountFieldValue).toBeCloseTo(0.0004, 8);
    expect(Number(result.current.tab.maxTotal)).toBeCloseTo(
      notionalMaxTotal / 5,
      6,
    );
    expect(Number(result.current.tab.maxAmount)).toBeCloseTo(
      notionalMaxAmount / 5,
      8,
    );
    expect(result.current.formData.baseOrderSize).toBe('100');
  });

  it('§1.2/§1.4 typing 100 under Cost stores 500 and Total still shows 100', () => {
    const { result } = renderTerminal({
      ...futures5x,
      orderSizeReference: 'cost',
    });

    act(() => result.current.tab.handleTotalChange(100));

    expect(result.current.formData.baseOrderSize).toBe('500');
    expect(result.current.tab.totalFieldValue).toBe(100);
  });

  it('§1.4 committing the shown Total unedited (blur) keeps the stored size', () => {
    const { result } = renderTerminal({
      ...futures5x,
      orderSizeReference: 'cost',
    });

    // The field commits on blur whether or not it was edited.
    act(() =>
      result.current.tab.handleTotalChange(result.current.tab.totalFieldValue),
    );

    expect(Number(result.current.formData.baseOrderSize)).toBe(100);
  });

  it('§1.4 the % buttons still size off the notional max', () => {
    const { result } = renderTerminal(futures5x);
    const notionalMaxAmount = Number(result.current.tab.maxAmount);

    act(() =>
      result.current.setFormData((p) => ({ ...p, orderSizeReference: 'cost' })),
    );
    act(() => result.current.tab.setPercent(100)());

    expect(Number(result.current.formData.baseOrderSize)).toBeCloseTo(
      notionalMaxAmount,
      8,
    );
  });
});
