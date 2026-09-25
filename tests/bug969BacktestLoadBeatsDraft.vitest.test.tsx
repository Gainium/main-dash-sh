/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug969BacktestLoadBeatsDraft.vitest.test.tsx
 *
 * "Load in Settings" on a new-bot page's backtest row remounts the create form
 * with the backtest's settings as its seed. The create form also restores an
 * unsaved draft from localStorage on mount, and that draft is layered OVER the
 * seed — so whenever a draft existed, the load toasted success and changed
 * nothing. See specs/060.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import type { BotFormData } from '@/types/bots/form';

// Capture what the page hands the workbench, and mount the REAL form
// provider exactly the way the workbench does (keyed on formReloadKey).
const captured = vi.hoisted(() => ({
  onLoad: null as null | ((bt: unknown) => void),
  formData: null as null | Record<string, unknown>,
}));

vi.mock('@/components/bots/workbench/BotPageBoundary', () => ({
  BotPageBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useBotConfigPreload', () => ({
  useBotConfigPreload: () => null,
}));

vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: () => ({ isLoading: false, error: null, data: undefined }),
}));

vi.mock('@/components/bots/workbench/BotWorkbench', async () => {
  const { createElement: h, useEffect } = await import('react');
  const { BotFormProvider, useBotFormState } =
    await import('@/contexts/bots/form/BotFormProvider');
  const { BotFormRegistryContext } =
    await import('@/features/bots/widgets/BotForm/context');
  const Probe = () => {
    const { formData } = useBotFormState();
    useEffect(() => {
      captured.formData = formData as unknown as Record<string, unknown>;
    });
    return null;
  };
  return {
    BotWorkbench: (props: {
      descriptor: { botType: string };
      initialFormData?: Partial<BotFormData>;
      formReloadKey: number;
      onLoadBacktestIntoForm: (bt: unknown) => void;
    }) => {
      captured.onLoad = props.onLoadBacktestIntoForm;
      return h(
        BotFormRegistryContext.Provider,
        { value: { botExperience: {} as never, widgetId: 'test' } },
        h(
          BotFormProvider,
          {
            key: `create-form-${props.formReloadKey}`,
            mode: 'create',
            botType: props.descriptor.botType as never,
            ...(props.initialFormData
              ? { initialFormData: props.initialFormData }
              : {}),
          },
          h(Probe)
        )
      );
    },
  };
});

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import TradingBotNew from '@/pages/bots/TradingBotNew';
import ComboBotNew from '@/pages/bots/ComboBotNew';
import {
  botFormDraftKey,
  loadBotFormDraft,
  saveBotFormDraft,
} from '@/contexts/bots/form/botFormDraft';

const PAGES = [
  { type: 'dca', Page: TradingBotNew },
  { type: 'combo', Page: ComboBotNew },
] as const;

const backtest = {
  _id: 'bt1',
  exchangeUUID: 'ex-uuid-1',
  settings: {
    name: 'Backtested bot',
    pair: ['BTC_USDT'],
    startCondition: 'TradingviewSignals',
    tpPerc: '3.3',
  },
};

let container: HTMLDivElement;
let root: Root;

const renderPage = (Page: () => unknown) =>
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/bot/new'] },
        createElement(Page as never)
      )
    );
  });

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  captured.onLoad = null;
  captured.formData = null;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  window.localStorage.clear();
});

describe.each(PAGES)(
  'bug 969: "Load in Settings" fills the new $type bot form (specs/060)',
  ({ type, Page }) => {
    const DRAFT_KEY = botFormDraftKey(type, 'create');

    it('§2 a plain open still restores the unsaved draft', async () => {
      saveBotFormDraft(DRAFT_KEY, {
        name: 'Half-built draft',
      } as unknown as BotFormData);

      await renderPage(Page);

      expect(captured.formData?.['name']).toBe('Half-built draft');
    });

    it('§1 an explicit backtest load wins over an existing draft', async () => {
      saveBotFormDraft(DRAFT_KEY, {
        name: 'Half-built draft',
        startCondition: 'ASAP',
      } as unknown as BotFormData);

      await renderPage(Page);
      expect(captured.formData?.['name']).toBe('Half-built draft');

      await act(async () => {
        captured.onLoad?.(backtest);
      });

      expect(captured.formData?.['name']).toBe('Backtested bot');
      expect(captured.formData?.['exchangeUUID']).toBe('ex-uuid-1');
      // The replaced draft must not resurface on the next plain open either.
      expect(loadBotFormDraft(DRAFT_KEY)).toBeNull();
    });

    it('§1 a backtest load with no draft present fills the form', async () => {
      await renderPage(Page);
      await act(async () => {
        captured.onLoad?.(backtest);
      });
      expect(captured.formData?.['name']).toBe('Backtested bot');
    });
  }
);

describe('bug 969: a loaded backtest is not overwritten by Quick mode (specs/060 §4)', () => {
  const renderProvider = async (openInManual?: boolean) => {
    const { BotFormProvider, useBotFormState } =
      await import('@/contexts/bots/form/BotFormProvider');
    const { BotFormRegistryContext } =
      await import('@/features/bots/widgets/BotForm/context');
    const seen: { mode: string | null } = { mode: null };
    const { useEffect } = await import('react');
    const Probe = () => {
      const { quickSetupMode } = useBotFormState();
      useEffect(() => {
        seen.mode = quickSetupMode;
      });
      return null;
    };
    await act(() => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ['/bot/new'] },
          createElement(
            BotFormRegistryContext.Provider,
            { value: { botExperience: {} as never, widgetId: 'test' } },
            createElement(
              BotFormProvider,
              {
                mode: 'create',
                botType: 'dca' as never,
                ...(openInManual !== undefined ? { openInManual } : {}),
              },
              createElement(Probe)
            )
          )
        )
      );
    });
    return seen.mode;
  };

  it('§4 a plain create form still opens in Quick', async () => {
    expect(await renderProvider()).toBe('quick');
  });

  it('§4 a backtest-loaded create form opens in Manual', async () => {
    expect(await renderProvider(true)).toBe('manual');
  });
});
