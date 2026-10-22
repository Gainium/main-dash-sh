/**
 * Runner note: renders a React component in jsdom, so it is a Vitest file.
 * Run from the parent with a development React build:
 *   NODE_ENV=development npx vitest run core/tests/dcaOrderSizeCostReference.vitest.test.tsx
 *
 * Spec: `main-dash-redesign/specs/129.dca-order-size-cost-reference.md`.
 *
 * With the futures "Cost" order-size reference selected, a DCA order amount is
 * typed as margin and stored as notional (amount × leverage), like the Base
 * Order field. The control used to store the typed number as-is, so 50 at 20x
 * saved 50 instead of 1000.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let selectorState: Record<string, unknown> = {};

vi.mock('@/contexts/bots/form/BotFormProvider', () => ({
  useBotFormSelector: (key: string) => selectorState[key],
  useOptionalBotFormState: () => undefined,
  useOptionalBotFormContext: () => undefined,
  useOptionalBotFormBinding: () => null,
  useOptionalBotFormTopLevelSelector: () => undefined,
}));
vi.mock('@/hooks/bots/global-variables/useBotVarBinding', () => ({
  useBotVarBinding: () => ({ isBound: false }),
}));
vi.mock('@/components/ui/field-variable-binding', () => ({
  FieldVariableBinding: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@/components/widgets/shared/CoinIcon', () => ({
  default: () => null,
}));
vi.mock('@/features/bots/shared/sections/useBaseFundingState', () => ({
  useBaseFundingState: () => ({ active: false }),
}));

import { DcaOrderSizingControl } from '@/features/bots/bot-types/dca/form/sections/DcaOrderSizingControl';
import { costReferenceMultiplier } from '@/utils/bots/dca/order-size-reference';
import { BotTypesEnum, StrategyEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

const tradingContext = {
  baseAsset: 'SOL',
  quoteAsset: 'USDT',
  latestPrice: 150,
  aggregatedBalances: {
    base: { free: 0, locked: 0, total: 0 },
    quote: { free: 10000, locked: 0, total: 10000 },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  selectorState = {
    futures: true,
    coinm: false,
    strategy: StrategyEnum.short,
    orderSizeType: 'quote',
    baseOrderSize: '1000',
    leverage: 20,
    marginType: 'isolated',
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const field = () => container.querySelector('input') as HTMLInputElement;

const nativeSetValue = (el: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
    el,
    value
  );
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const paste = (value: string) =>
  act(() => {
    nativeSetValue(field(), value);
  });

/** Host for the regular DCA amount: `updateFormData('orderSize')` feeds back into formData. */
const renderRegular = (
  reference: 'notional' | 'cost' | undefined,
  initial: string,
  writes: string[]
) => {
  const Host = () => {
    const [orderSize, setOrderSize] = useState(initial);
    const formData = {
      type: BotTypesEnum.dca,
      orderSizeReference: reference,
      dca: { orderSize },
      combo: {},
    } as unknown as BotFormData;
    return (
      <DcaOrderSizingControl
        formData={formData}
        mode={'edit' as never}
        updateFormData={(f, v) => {
          if (f === 'orderSize') {
            writes.push(String(v));
            setOrderSize(String(v));
          }
        }}
        errors={{} as never}
        tradingContext={tradingContext}
        idPrefix="scaled"
      />
    );
  };
  act(() => root.render(<Host />));
};

/** Host for custom / indicator DCA sizes: the value flows through `value` + `onValueChange`. */
const renderCustom = (
  reference: 'notional' | 'cost',
  initial: string,
  writes: string[]
) => {
  const Host = () => {
    const [size, setSize] = useState(initial);
    const formData = {
      type: BotTypesEnum.dca,
      orderSizeReference: reference,
      dca: {},
      combo: {},
    } as unknown as BotFormData;
    return (
      <DcaOrderSizingControl
        formData={formData}
        mode={'edit' as never}
        updateFormData={() => {
          throw new Error('custom sizes must write through onValueChange');
        }}
        errors={{} as never}
        tradingContext={tradingContext}
        idPrefix="custom-x"
        variablePath={'dcaCustom.x.size' as never}
        value={size}
        onValueChange={(next) => {
          writes.push(next);
          setSize(next);
        }}
      />
    );
  };
  act(() => root.render(<Host />));
};

describe('§1.2 Cost reference on the DCA order amount', () => {
  it('stores typed × leverage: 50 at 20x Cost saves 1000', () => {
    const writes: string[] = [];
    renderRegular('cost', '', writes);
    paste('50');
    expect(writes.at(-1)).toBe('1000');
  });

  it('shows a stored notional as cost: 1000 at 20x displays 50', () => {
    renderRegular('cost', '1000', []);
    expect(Number(field().value)).toBe(50);
  });

  it('applies to custom/indicator DCA sizes written through onValueChange', () => {
    const writes: string[] = [];
    renderCustom('cost', '', writes);
    paste('50');
    expect(writes.at(-1)).toBe('1000');
  });
});

describe('§1.4 unchanged paths', () => {
  it('Notional stores and shows the typed value as-is', () => {
    const writes: string[] = [];
    renderRegular('notional', '1000', writes);
    expect(Number(field().value)).toBe(1000);
    paste('50');
    expect(writes.at(-1)).toBe('50');
  });

  it('no reference set (bot reopened) behaves as Notional', () => {
    renderRegular(undefined, '1000', []);
    expect(Number(field().value)).toBe(1000);
  });

  it('percentage references are not scaled', () => {
    expect(
      costReferenceMultiplier({
        futures: true,
        orderSizeType: 'percFree',
        orderSizeReference: 'cost',
        marginType: 'isolated',
        leverage: 20,
      })
    ).toBe(1);
  });

  it('spot and inherit margin are not scaled', () => {
    const base = {
      futures: true,
      orderSizeType: 'quote',
      orderSizeReference: 'cost' as const,
      marginType: 'isolated',
      leverage: 20,
    };
    expect(costReferenceMultiplier(base)).toBe(20);
    expect(costReferenceMultiplier({ ...base, futures: false })).toBe(1);
    expect(costReferenceMultiplier({ ...base, marginType: 'inherit' })).toBe(1);
  });
});
