/**
 * Runner note: renders a React component in jsdom, so this is a Vitest file
 * (`*.vitest.test.tsx`), not one of core's Playwright `.unit.test.ts` tests.
 * Run from the parent, with `NODE_ENV=development` (a production React build
 * has no `React.act`):
 * `NODE_ENV=development npx vitest run core/tests/bug1470DcaOrderUsdUnitLabel.vitest.test.tsx`
 */

/**
 * Spec: `main-dash-redesign/specs/` bug-fix for "DCA order amount shows USDT
 * while Base Order Size shows USD".
 *
 * The Base Order Size field (StrategySettings) labels its unit with
 * `resolveBaseOrderContext(...).currencyLabel`. The DCA order amount field
 * labelled its unit with the coin-ICON symbol, which for the `usd` reference
 * is `USDT` (an icon stand-in for "a dollar"), so the two fields of the same
 * form named different currencies for the same amount unit. The icon may keep
 * using the stand-in; the text must match the base order field.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const formState: Record<string, unknown> = {};

vi.mock('@/contexts/bots/form/BotFormProvider', () => ({
  useBotFormSelector: (key: string) => formState[key],
  useOptionalBotFormState: () => undefined,
  useOptionalBotFormContext: () => undefined,
  useOptionalBotFormBinding: () => null,
  useOptionalBotFormTopLevelSelector: () => undefined,
}));
vi.mock('@/hooks/bots/global-variables/useBotVarBinding', () => ({
  useBotVarBinding: () => ({ isBound: false }),
}));
vi.mock('@/components/ui/field-variable-binding', () => ({
  FieldVariableBinding: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('@/components/widgets/shared/CoinIcon', () => ({
  default: ({ symbol }: { symbol: string }) => (
    <i data-testid="coin-icon" data-symbol={symbol} />
  ),
}));
vi.mock('@/features/bots/shared/sections/useBaseFundingState', () => ({
  useBaseFundingState: () => ({ active: false }),
}));

import { DcaOrderSizingControl } from '@/features/bots/bot-types/dca/form/sections/DcaOrderSizingControl';
import { resolveBaseOrderContext } from '@/utils/bots/dca/base-order-context';
import { StrategyEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

const snapshot = (free: number) => ({ free, locked: 0, total: free, usd: free });

const render = (
  orderSizeType: BotFormData['dca']['orderSizeType'],
  baseAsset: string,
  quoteAsset: string
) => {
  Object.assign(formState, {
    strategy: StrategyEnum.long,
    futures: false,
    coinm: false,
    orderSizeType,
    baseOrderSize: '10',
    leverage: 1,
    marginType: undefined,
  });
  const tradingContext = {
    selectedPairs: [],
    baseAsset,
    quoteAsset,
    aggregatedBalances: { base: snapshot(1), quote: snapshot(1000) },
    latestPrice: 100,
  };
  act(() => {
    root.render(
      <DcaOrderSizingControl
        formData={
          {
            type: 'dca',
            dca: { orderSizeType, orderSize: '10', baseOrderSize: '10' },
            strategy: StrategyEnum.long,
          } as unknown as BotFormData
        }
        mode={'create' as never}
        updateFormData={() => {}}
        errors={{} as never}
        tradingContext={tradingContext as never}
        idPrefix="t"
      />
    );
  });
  const baseOrderLabel = resolveBaseOrderContext({
    currencyReference: orderSizeType,
    strategy: StrategyEnum.long,
    aggregatedBalances: tradingContext.aggregatedBalances as never,
    futures: false,
    coinm: false,
    baseAsset,
    quoteAsset,
    latestPrice: 100,
  }).currencyLabel;
  const unitSpan = container.querySelector(
    'span.text-xs.font-semibold.text-muted-foreground[title]'
  ) as HTMLSpanElement | null;
  const icon = container.querySelector('[data-testid="coin-icon"]');
  return {
    dcaUnit: unitSpan?.textContent ?? null,
    baseOrderLabel,
    iconSymbol: icon?.getAttribute('data-symbol') ?? null,
  };
};

describe('DCA order amount unit label matches Base Order Size', () => {
  it('USD reference on an X/USD pair shows USD, not USDT', () => {
    const r = render('usd', 'BTC', 'USD');
    expect(r.baseOrderLabel).toBe('USD');
    expect(r.dcaUnit).toBe(r.baseOrderLabel);
  });

  it('USD reference on an X/USDT pair shows USD, like the base order field', () => {
    const r = render('usd', 'ETH', 'USDT');
    expect(r.dcaUnit).toBe('USD');
    expect(r.dcaUnit).toBe(r.baseOrderLabel);
  });

  it('the coin icon is unchanged (still the USD stand-in icon)', () => {
    const r = render('usd', 'BTC', 'USD');
    expect(r.iconSymbol).toBe('USDT');
  });

  it.each([
    ['quote', 'BTC', 'USDC', 'USDC'],
    ['base', 'BTC', 'USDC', 'BTC'],
  ] as const)('%s reference keeps the asset label', (type, b, q, want) => {
    const r = render(type, b, q);
    expect(r.dcaUnit).toBe(want);
    expect(r.dcaUnit).toBe(r.baseOrderLabel);
  });
});
