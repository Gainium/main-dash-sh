/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug970BacktestsPageLoadInSettings.vitest.test.tsx
 *
 * "Load in settings" on the standalone Backtests page (and on a bot's edit
 * page) stages the backtest for the next `/new` mount through the
 * `botConfig` preload. The raw settings used to be filed under the form's
 * type slice, the create-draft was laid over the seed, and the form opened in
 * Quick — so nothing of the backtest reached the form. See specs/061.
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
  mode: null as null | string,
}));

vi.mock('@/components/bots/workbench/BotPageBoundary', () => ({
  BotPageBoundary: ({ children }: { children: ReactNode }) => children,
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
      formReloadKey: number;
      openInManual?: boolean;
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
            openInManual: props.formReloadKey > 0 || Boolean(props.openInManual),
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
import { stageBacktestLoad } from '@/hooks/useBotConfigPreload';
import { BotTypesEnum } from '@/types';

const PAGES = [
  { type: BotTypesEnum.dca, path: '/bot/new', Page: TradingBotNew },
  { type: BotTypesEnum.combo, path: '/combo/new', Page: ComboBotNew },
] as const;

const backtest = {
  _id: 'bt1',
  exchangeUUID: 'ex-uuid-1',
  settings: {
    name: 'Short (40% OS) (R1 V1) (copy)',
    pair: ['RARE_USDT'],
    strategy: 'SHORT',
    startCondition: 'TechnicalIndicators',
    maxNumberOfOpenDeals: '4',
    ordersCount: '40',
    tpPerc: '3.3',
  },
};

let container: HTMLDivElement;
let root: Root;

const renderPage = (Page: () => unknown, path: string) =>
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(Page as never)
      )
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
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe.each(PAGES)(
  'bug 970: Backtests-page "Load in settings" fills the new $type bot form (specs/061)',
  ({ type, path, Page }) => {
    const DRAFT_KEY = botFormDraftKey(type, 'create');

    it('§1 the staged backtest reaches the form, in Manual, over a stored draft', async () => {
      saveBotFormDraft(DRAFT_KEY, {
        name: 'Half-built draft',
        startCondition: 'ASAP',
      } as unknown as BotFormData);

      stageBacktestLoad(type, backtest);
      await renderPage(Page, path);

      expect(captured.formData?.['name']).toBe('Short (40% OS) (R1 V1) (copy)');
      expect(captured.formData?.['pair']).toEqual(['RARE_USDT']);
      expect(captured.formData?.['exchangeUUID']).toBe('ex-uuid-1');
      // Strategy settings live in the form's per-type slice.
      const slice = captured.formData?.[type] as Record<string, unknown>;
      expect(slice['startCondition']).toBe('TechnicalIndicators');
      expect(slice['strategy']).toBe('SHORT');
      expect(String(slice['maxNumberOfOpenDeals'])).toBe('4');
      expect(String(slice['ordersCount'])).toBe('40');
      expect(captured.mode).toBe('manual');
      expect(loadBotFormDraft(DRAFT_KEY)).toBeNull();
    });

    it('§2 a plain open still restores the draft and opens in Quick', async () => {
      saveBotFormDraft(DRAFT_KEY, {
        name: 'Half-built draft',
      } as unknown as BotFormData);

      await renderPage(Page, path);

      expect(captured.formData?.['name']).toBe('Half-built draft');
      expect(captured.mode).toBe('quick');
    });

    it('§2 a settings-only staging ("Copy to live" shape) still opens in Quick', async () => {
      window.sessionStorage.setItem(
        'botConfig',
        JSON.stringify({ type, settings: { tpPerc: '7' } })
      );

      await renderPage(Page, path);

      expect(captured.mode).toBe('quick');
    });
  }
);
