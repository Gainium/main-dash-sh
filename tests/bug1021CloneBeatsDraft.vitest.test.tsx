/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/bug1021CloneBeatsDraft.vitest.test.tsx
 *
 * Cloning a bot (`/<type>/new?load=<id>`) seeds the create form with the
 * source bot's settings. The create form also restores an unsaved draft from
 * localStorage on mount, and that draft is layered OVER the seed — so an older
 * half-built bot replaced the clone's settings and showed "Restored your
 * unsaved bot". See specs/079.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import type { BotFormData } from '@/types/bots/form';

const captured = vi.hoisted(() => ({
  formData: null as null | Record<string, unknown>,
}));

vi.mock('@/components/bots/workbench/BotPageBoundary', () => ({
  BotPageBoundary: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useBotConfigPreload', () => ({
  useBotConfigPreload: () => null,
}));

// The source bot every `?load=` fetch returns.
vi.mock('@/hooks/useGraphQL', () => ({
  useGraphQL: (_name: string, _q: unknown, opts?: { enabled?: boolean }) =>
    opts?.enabled
      ? {
          isLoading: false,
          error: null,
          data: {
            status: 'OK',
            data: { exchange: 'paperBinance', exchangeUUID: 'ex-1', settings: {} },
          },
        }
      : { isLoading: false, error: null, data: undefined },
}));

const SOURCE = { name: 'Source bot', tpPerc: '2.4', exchangeUUID: 'ex-1' };
vi.mock('@/mappers/bots/dca/map-bot-settings-to-form-data', () => ({
  mapBotSettingsToFormData: () => ({ formData: { ...SOURCE } }),
}));
vi.mock('@/mappers/bots/grid/map-grid-bot-settings-to-form-data', () => ({
  mapGridBotSettingsToFormData: () => ({ formData: { ...SOURCE } }),
}));

// Mount the REAL form provider the way the workbench does: not at all while
// the seed is pending, then once with the seed.
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
      isSeedPending: boolean;
    }) =>
      props.isSeedPending
        ? null
        : h(
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
          ),
  };
});

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import TradingBotNew from '@/pages/bots/TradingBotNew';
import ComboBotNew from '@/pages/bots/ComboBotNew';
import GridBotNew from '@/pages/bots/GridBotNew';
import {
  botFormDraftKey,
  loadBotFormDraft,
  saveBotFormDraft,
} from '@/contexts/bots/form/botFormDraft';

const PAGES = [
  { type: 'dca', path: '/bot/new', Page: TradingBotNew },
  { type: 'combo', path: '/combo/new', Page: ComboBotNew },
  { type: 'grid', path: '/grid/new', Page: GridBotNew },
] as const;

let container: HTMLDivElement;
let root: Root;

const renderPage = (Page: () => unknown, url: string) =>
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [url] },
        createElement(Page as never)
      )
    );
  });

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  captured.formData = null;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  window.localStorage.clear();
});

describe.each(PAGES)(
  'bug 1021: cloning a $type bot is not overwritten by a draft (specs/079)',
  ({ type, path, Page }) => {
    const DRAFT_KEY = botFormDraftKey(type, 'create');
    const saveDraft = () =>
      saveBotFormDraft(DRAFT_KEY, {
        name: 'Half-built draft',
        tpPerc: '7',
      } as unknown as BotFormData);

    it('§2 a plain open still restores the unsaved draft', async () => {
      saveDraft();
      await renderPage(Page, path);
      expect(captured.formData?.['name']).toBe('Half-built draft');
      expect(captured.formData?.['tpPerc']).toBe('7');
    });

    it('§1 a clone opens with the source settings, not the draft', async () => {
      saveDraft();
      await renderPage(Page, `${path}?load=bot-1`);
      expect(captured.formData?.['name']).toBe('Source bot (Clone)');
      expect(captured.formData?.['tpPerc']).toBe('2.4');
      expect(loadBotFormDraft(DRAFT_KEY)).toBeNull();
    });
  }
);
