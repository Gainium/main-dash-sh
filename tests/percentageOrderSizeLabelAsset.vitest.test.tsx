/**
 * Runner note: renders a React component in jsdom, so this is a Vitest file
 * (`*.vitest.test.tsx`), not one of core's Playwright `.unit.test.ts` tests.
 * Run from the parent, with `NODE_ENV=development` (a production React build
 * has no `React.act`):
 * `NODE_ENV=development npx vitest run core/tests/percentageOrderSizeLabelAsset.vitest.test.tsx`
 */

/**
 * Spec: `main-dash-redesign/specs/148.futures-percentage-order-size-label-asset.md`.
 *
 * The "% Free / % Total" order-size options must name the coin the bot engine
 * takes the percentage of. The engine (main-app dcaHelper, percFree/percTotal
 * branch) reads the quote balance on USDⓈ-M futures and the base balance on
 * COIN-M futures in BOTH directions; on spot it reads quote for a long and base
 * for a short. The labels used to follow direction only, so a USDC-margined
 * Short read "% Free BTC" while it sized from USDC (§2).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const formState: Record<string, unknown> = {};
let capturedOptions: Array<{ value: string; label: string }> = [];

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
  default: () => <i />,
}));
vi.mock('@/features/bots/shared/sections/useBaseFundingState', () => ({
  useBaseFundingState: () => ({ active: false }),
}));
vi.mock('@/components/ui/balance-input', () => ({
  BalanceInput: (props: {
    currencyReferenceOptions?: Array<{ value: string; label: string }>;
  }) => {
    capturedOptions = props.currencyReferenceOptions ?? [];
    return null;
  },
}));

import { DcaOrderSizingControl } from '@/features/bots/bot-types/dca/form/sections/DcaOrderSizingControl';
import { resolvePercentageBalanceSide } from '@/utils/bots/dca/base-order-context';
import { StrategyEnum } from '@/types';
import type { BotFormData } from '@/types/bots/form';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  capturedOptions = [];
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

const percentageLabels = (
  strategy: StrategyEnum,
  futures: boolean,
  coinm: boolean,
  baseAsset: string,
  quoteAsset: string
) => {
  Object.assign(formState, {
    strategy,
    futures,
    coinm,
    orderSizeType: 'percFree',
    baseOrderSize: '10',
    leverage: 1,
    marginType: undefined,
  });
  act(() => {
    root.render(
      <DcaOrderSizingControl
        formData={
          {
            type: 'dca',
            dca: { orderSizeType: 'percFree', orderSize: '10', baseOrderSize: '10' },
            strategy,
          } as unknown as BotFormData
        }
        mode={'edit' as never}
        updateFormData={() => {}}
        errors={{} as never}
        tradingContext={
          {
            selectedPairs: [],
            baseAsset,
            quoteAsset,
            aggregatedBalances: { base: snapshot(1), quote: snapshot(1000) },
            latestPrice: 100,
          } as never
        }
        idPrefix="t"
      />
    );
  });
  const label = (v: string) => capturedOptions.find((o) => o.value === v)?.label;
  return { free: label('percFree'), total: label('percTotal') };
};

describe('§2 DCA order "% Free / % Total" labels name the balance the engine uses', () => {
  it('USDⓈ-M futures Short (BTC-USDC) names USDC, not BTC', () => {
    expect(
      percentageLabels(StrategyEnum.short, true, false, 'BTC', 'USDC')
    ).toEqual({ free: '% Free USDC', total: '% Total USDC' });
  });

  it('USDⓈ-M futures Long names the quote', () => {
    expect(
      percentageLabels(StrategyEnum.long, true, false, 'BTC', 'USDC')
    ).toEqual({ free: '% Free USDC', total: '% Total USDC' });
  });

  it('COIN-M futures Long names the base coin', () => {
    expect(
      percentageLabels(StrategyEnum.long, true, true, 'BTC', 'USD')
    ).toEqual({ free: '% Free BTC', total: '% Total BTC' });
  });

  it('COIN-M futures Short names the base coin', () => {
    expect(
      percentageLabels(StrategyEnum.short, true, true, 'BTC', 'USD')
    ).toEqual({ free: '% Free BTC', total: '% Total BTC' });
  });

  it('spot Short keeps the base coin (unchanged)', () => {
    expect(
      percentageLabels(StrategyEnum.short, false, false, 'BTC', 'USDT')
    ).toEqual({ free: '% Free BTC', total: '% Total BTC' });
  });

  it('spot Long keeps the quote (unchanged)', () => {
    expect(
      percentageLabels(StrategyEnum.long, false, false, 'BTC', 'USDT')
    ).toEqual({ free: '% Free USDT', total: '% Total USDT' });
  });
});

describe('§3 resolvePercentageBalanceSide mirrors the engine choice', () => {
  it.each([
    [StrategyEnum.short, true, false, 'quote'],
    [StrategyEnum.long, true, false, 'quote'],
    [StrategyEnum.short, true, true, 'base'],
    [StrategyEnum.long, true, true, 'base'],
    [StrategyEnum.short, false, false, 'base'],
    [StrategyEnum.long, false, false, 'quote'],
  ] as const)('%s futures=%s coinm=%s -> %s', (strategy, futures, coinm, want) => {
    expect(resolvePercentageBalanceSide({ strategy, futures, coinm })).toBe(want);
  });
});
