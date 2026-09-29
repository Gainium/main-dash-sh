/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug1008DuplicateToOtherMode.vitest.test.tsx
 *
 * "Duplicate to paper/live" staged the raw settings for `/bot/new` without
 * switching the trading mode, so the form opened in the SAME mode, in Quick
 * (whose auto risk profile replaced the settings and the name), on the first
 * account of the source provider. It now stages a mapped form for the other
 * mode, switches mode, and opens that bot type's create page in Manual on a
 * matching account of the target mode.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';

import type { BotFormData } from '@/types/bots/form';

const captured = vi.hoisted(() => ({
  formData: null as null | Record<string, unknown>,
  mode: null as null | string,
  path: null as null | string,
  setLiveTrading: vi.fn(),
}));

vi.mock('@/components/bots/workbench/BotPageBoundary', () => ({
  BotPageBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: () => ({ isLoading: false, error: null, data: undefined }),
}));

vi.mock('@/hooks/usePaperContext', () => ({
  usePaperContext: () => ({ setLiveTrading: captured.setLiveTrading }),
}));

vi.mock('@/hooks/useBotMutations', () => ({
  useBotStatusToggle: () => ({ mutate: vi.fn(), isPending: false }),
  useBotRestart: () => ({ mutate: vi.fn(), isPending: false }),
  useBotDelete: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Mount the REAL form provider the way the workbench does, and hold it while
// the seed is pending (the workbench renders no form until then).
vi.mock('@/components/bots/workbench/BotWorkbench', async () => {
  const { createElement: h, useEffect } = await import('react');
  const { BotFormProvider, useBotFormState } =
    await import('@/contexts/bots/form/BotFormProvider');
  const { BotFormRegistryContext } =
    await import('@/features/bots/widgets/BotForm/context');
  const Probe = () => {
    const { formData, quickSetupMode } = useBotFormState();
    useEffect(() => {
      captured.formData = formData as unknown as Record<string, unknown>;
      captured.mode = quickSetupMode;
    });
    return null;
  };
  return {
    BotWorkbench: (props: {
      descriptor: { botType: string };
      initialFormData?: Partial<BotFormData>;
      isSeedPending?: boolean;
      openInManual?: boolean;
    }) =>
      props.isSeedPending
        ? null
        : h(
            BotFormRegistryContext.Provider,
            { value: { botExperience: {} as never, widgetId: 'test' } },
            h(
              BotFormProvider,
              {
                mode: 'create',
                botType: props.descriptor.botType as never,
                openInManual: Boolean(props.openInManual),
                ...(props.initialFormData
                  ? { initialFormData: props.initialFormData }
                  : {}),
              },
              h(Probe)
            )
          ),
  };
});

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import TradingBotNew from '@/pages/bots/TradingBotNew';
import { useBotActions } from '@/hooks/useBotActions';
import { stageDuplicateToOtherMode } from '@/hooks/useBotConfigPreload';
import { useExchangesStore } from '@/stores/exchangesStore';
import { useUIStore } from '@/stores/uiStore';
import { BotTypesEnum } from '@/types';
import type { ExchangeInUser } from '@/types/exchange.types';

const liveBot = {
  exchange: 'bybitLinear',
  exchangeUUID: 'live-2',
  settings: {
    name: 'long (40% OS) (V1)',
    pair: ['AAVEUSDT', 'ACHUSDT'],
    strategy: 'LONG',
    startCondition: 'TechnicalIndicators',
    ordersCount: '14',
  },
};

const ex = (uuid: string, provider: string) =>
  ({ uuid, provider, name: uuid }) as unknown as ExchangeInUser;
const LIVE = [ex('live-1', 'bybitLinear'), ex('live-2', 'bybitLinear')];
const PAPER = [ex('paper-1', 'paperBybit'), ex('paper-2', 'paperBybitLinear')];

const setExchanges = (list: ExchangeInUser[]) =>
  act(() => {
    useExchangesStore.setState({
      exchanges: Object.fromEntries(list.map((e) => [e.uuid, e])),
      _hasHydrated: true,
      initialLoaded: true,
      error: null,
    });
  });

let container: HTMLDivElement;
let root: Root;

const render = (node: ReactNode, path: string) =>
  act(() => {
    root.render(
      createElement(MemoryRouter, { initialEntries: [path] }, node as never)
    );
  });

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  window.sessionStorage.clear();
  captured.formData = null;
  captured.mode = null;
  captured.path = null;
  captured.setLiveTrading.mockReset();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('bug 1008: Duplicate to paper/live', () => {
  it('the menu action stages the bot, switches mode and opens its type create page', async () => {
    act(() => useUIStore.setState({ isLiveTrading: true }));
    const hook = { onCopy: () => {} };
    const Host = () => {
      const path = useLocation().pathname;
      const { onCopyToLive } = useBotActions({
        botId: 'b1',
        botType: BotTypesEnum.combo,
        botName: 'x',
        status: 'open',
        botData: liveBot,
      }).menuProps;
      useEffect(() => {
        captured.path = path;
        hook.onCopy = onCopyToLive;
      });
      return null;
    };
    await render(createElement(Host), '/combo');

    act(() => hook.onCopy());

    expect(captured.setLiveTrading).toHaveBeenCalledWith(false);
    expect(captured.path).toBe('/combo/new');
    const staged = JSON.parse(window.sessionStorage.getItem('botConfig') ?? 'null');
    expect(staged.type).toBe(BotTypesEnum.combo);
    expect(staged.exchange).toBe('paperBybitLinear');
    expect(staged.formData.name).toBe('long (40% OS) (V1) (Paper)');
  });

  it('live → paper: waits out the stale live accounts, then seeds the paper form in Manual', async () => {
    // The mode has just switched; the store still holds the live accounts.
    act(() => useUIStore.setState({ isLiveTrading: false }));
    setExchanges(LIVE);
    stageDuplicateToOtherMode(BotTypesEnum.dca, liveBot, false);

    await render(createElement(TradingBotNew), '/bot/new');
    expect(captured.formData).toBeNull();

    setExchanges(PAPER);

    expect(captured.formData?.['exchangeUUID']).toBe('paper-2');
    expect(captured.formData?.['name']).toBe('long (40% OS) (V1) (Paper)');
    expect(captured.formData?.['pair']).toEqual(['AAVEUSDT', 'ACHUSDT']);
    const slice = captured.formData?.['dca'] as Record<string, unknown>;
    expect(slice['startCondition']).toBe('TechnicalIndicators');
    expect(String(slice['ordersCount'])).toBe('14');
    expect(captured.mode).toBe('manual');
  });

  it('paper → live: never resolves to a stale paper account', async () => {
    act(() => useUIStore.setState({ isLiveTrading: true }));
    setExchanges(PAPER);
    stageDuplicateToOtherMode(
      BotTypesEnum.dca,
      { ...liveBot, exchange: 'paperBybitLinear' },
      true
    );

    await render(createElement(TradingBotNew), '/bot/new');
    expect(captured.formData).toBeNull();

    setExchanges(LIVE);

    expect(captured.formData?.['exchangeUUID']).toBe('live-1');
    expect(captured.formData?.['name']).toBe('long (40% OS) (V1) (Live)');
    expect(captured.mode).toBe('manual');
  });
});
