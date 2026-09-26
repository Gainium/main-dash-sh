/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/botFormSavedPayload.vitest.test.tsx
 *
 * Save-payload contract for the bot form (specs/066 §1.10). The form's save
 * path — the REAL BotFormProvider, the REAL `useFormHandlers`, the payload
 * mapper the form shell builds, the per-bot-type validators — is driven with
 * representative DCA, Grid and Combo configurations in create and edit mode,
 * and what reaches the create/update mutation (or the validation errors, when
 * the config is refused) is pinned in a snapshot.
 *
 * The snapshot was recorded BEFORE the re-render isolation work (066) and must
 * not move: that work changes how and when the form reads its state, never
 * what it saves.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import type { BotFormData } from '@/types/bots/form';

const EXCHANGE = vi.hoisted(() => ({
  uuid: 'ex-uuid-1',
  provider: 'binance',
  name: 'Binance',
}));

const toasts = vi.hoisted(() => [] as Array<[string, string]>);

vi.mock('@/features/bots/widgets/BotForm/providers/BotFormQueryProvider', () => ({
  useBotFormQuery: () => ({ currentExchange: EXCHANGE, hasStoredPair: false }),
}));

vi.mock('@/hooks/useBacktestMutations', () => ({
  prepareBacktestInput: () => ({}),
  useRunBacktest: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({ track: () => undefined }));

vi.mock('@/lib/toast', () => ({
  toast: {
    success: (m: string) => toasts.push(['success', m]),
    error: (m: string) => toasts.push(['error', m]),
    warning: (m: string) => toasts.push(['warning', m]),
    info: (m: string) => toasts.push(['info', m]),
  },
}));

// Load the registry first: the bot modules and the registry import each other,
// and entering the cycle from a module leaves STATIC_MODULES half-initialised.
import '@/features/bots/registry';
import {
  BotFormProvider,
  useBotFormContext,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider';
import { BotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import { buildBotFormPayloadMapper } from '@/features/bots/widgets/BotForm/payloadMapper';
import { comboExperience } from '@/features/bots/modules/comboModule';
import { dcaExperience } from '@/features/bots/modules/dcaModule';
import { gridExperience } from '@/features/bots/modules/gridModule';
import { useFormHandlers } from '@/hooks/bots/dca/useFormHandlers';
import { BotTypesEnum } from '@/types';
import { validateDcaFormData } from '@/utils/bots/dca/validation';
import { validateGridFormData } from '@/utils/bots/grid/validation';

type Experience = typeof dcaExperience;

interface Captured {
  created: unknown[];
  updated: unknown[];
}

// Filled by the harness's effect (a component may not reassign outer
// variables during render).
const probe: {
  save: (() => Promise<void>) | null;
  update: ((field: string, value: unknown) => void) | null;
} = { save: null, update: null };

const must = <T,>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) throw new Error(`${what} missing`);
  return value;
};

const Harness = ({
  mode,
  experience,
  captured,
}: {
  mode: BotFormMode;
  experience: Experience;
  captured: Captured;
}) => {
  const isGrid = experience.id === BotTypesEnum.grid;
  const state = useBotFormContext();
  const handlers = useFormHandlers(
    state.setFormData,
    state.setIsDirty,
    state.setErrors,
    mode === 'edit' ? { _id: 'bot-1' } : null,
    {
      mutateAsync: async (p) => {
        captured.updated.push(p);
        return {};
      },
    },
    {
      mode,
      validate: (isGrid ? validateGridFormData : validateDcaFormData) as never,
      createMutation: {
        mutateAsync: async (p) => {
          captured.created.push(p);
          return { _id: 'new-bot' };
        },
      },
      ...(buildBotFormPayloadMapper(isGrid, experience.adapters)
        ? {
            payloadMapper: buildBotFormPayloadMapper(
              isGrid,
              experience.adapters
            ),
          }
        : {}),
    },
    false
  );
  useEffect(() => {
    probe.save = () => handlers.handleSave();
    probe.update = state.updateFormData as never;
  });
  return null;
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const render = async (node: ReactNode) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(node);
  });
};

const saveWith = async (
  experience: Experience,
  botType: BotTypesEnum,
  mode: BotFormMode,
  initialFormData: Partial<BotFormData>,
  edits: Array<[string, unknown]> = []
) => {
  const captured: Captured = { created: [], updated: [] };
  await render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        BotFormRegistryContext.Provider,
        { value: { botExperience: experience, widgetId: 'test' } },
        createElement(
          BotFormProvider,
          { mode, botType, initialFormData, children: null },
          createElement(Harness, { mode, experience, captured })
        )
      )
    )
  );
  for (const [field, value] of edits) {
    await act(async () => {
      must(probe.update, 'updateFormData')(field, value);
    });
  }
  await act(async () => {
    await must(probe.save, 'handleSave')();
  });
  return { ...captured, toasts: toasts.splice(0) };
};

const SHARED = {
  name: 'Payload probe',
  exchange: 'binance',
  exchangeUUID: EXCHANGE.uuid,
  pair: ['BTC/USDT'],
} as unknown as Partial<BotFormData>;

const DCA_CONFIG = {
  ...SHARED,
  dca: {
    strategy: 'LONG',
    baseOrderSize: '25',
    orderSize: '50',
    orderSizeType: 'quote',
    startOrderType: 'market',
    startCondition: 'ASAP',
    useTp: true,
    tpPerc: '2.5',
    useSl: true,
    slPerc: '-12',
    useDca: true,
    ordersCount: 6,
    activeOrdersCount: 2,
    step: '1.5',
    stepScale: '1.1',
    volumeScale: '1.4',
    maxNumberOfOpenDeals: '3',
  },
} as unknown as Partial<BotFormData>;

const COMBO_CONFIG = {
  ...SHARED,
  combo: {
    strategy: 'LONG',
    baseOrderSize: '30',
    orderSize: '30',
    orderSizeType: 'quote',
    startOrderType: 'market',
    startCondition: 'ASAP',
    useTp: true,
    tpPerc: '3',
    useSl: false,
    useDca: true,
    ordersCount: 5,
    activeOrdersCount: 5,
    step: '2',
    gridLevel: '5',
    baseStep: '0.5',
    baseGridLevels: '5',
    maxNumberOfOpenDeals: '1',
  },
} as unknown as Partial<BotFormData>;

const GRID_CONFIG = {
  ...SHARED,
  grid: {
    topPrice: 80000,
    lowPrice: 50000,
    levels: 40,
    budget: 1000,
    gridType: 'geometric',
    strategy: 'LONG',
    tpSl: true,
    tpPerc: 5,
    sl: true,
    slPerc: -10,
  },
} as unknown as Partial<BotFormData>;

const deepMerge = (
  experienceDefaults: Partial<BotFormData>,
  slice: 'dca' | 'combo' | 'grid'
) => experienceDefaults[slice];

describe('bot form save payload (specs/066 §1.10)', () => {
  beforeEach(() => {
    localStorage.clear();
    toasts.length = 0;
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    probe.save = null;
    probe.update = null;
  });

  const cases: Array<
    [string, Experience, BotTypesEnum, 'dca' | 'combo' | 'grid', Partial<BotFormData>]
  > = [
    ['DCA', dcaExperience, BotTypesEnum.dca, 'dca', DCA_CONFIG],
    ['Combo', comboExperience, BotTypesEnum.combo, 'combo', COMBO_CONFIG],
    ['Grid', gridExperience, BotTypesEnum.grid, 'grid', GRID_CONFIG],
  ];

  for (const [label, experience, botType, slice, config] of cases) {
    for (const mode of ['create', 'edit'] as const) {
      it(`${label} ${mode}`, async () => {
        // Edit mode starts from empty slices (the provider leaves hydration to
        // the bot mapper), so seed the full defaults + config explicitly.
        const { DCA_FORM_DEFAULTS, COMBO_FORM_DEFAULTS, GRID_FORM_DEFAULTS } =
          await import('@/contexts/bots/form/formDefaults');
        const defaults = {
          dca: DCA_FORM_DEFAULTS,
          combo: COMBO_FORM_DEFAULTS,
          grid: GRID_FORM_DEFAULTS,
        } as unknown as Partial<BotFormData>;
        const seeded = {
          ...config,
          [slice]: {
            ...deepMerge(defaults, slice),
            ...(config[slice] as object),
          },
        } as Partial<BotFormData>;
        const result = await saveWith(experience, botType, mode, seeded);
        expect(result).toMatchSnapshot();
      });
    }
  }

  // The user types, then saves: the save must carry what was typed.
  it('DCA edit after keystrokes', async () => {
    const { DCA_FORM_DEFAULTS } = await import('@/contexts/bots/form/formDefaults');
    const seeded = {
      ...DCA_CONFIG,
      dca: { ...DCA_FORM_DEFAULTS, ...(DCA_CONFIG.dca as object) },
    } as Partial<BotFormData>;
    const result = await saveWith(dcaExperience, BotTypesEnum.dca, 'edit', seeded, [
      ['tpPerc', '4'],
      ['tpPerc', '4.2'],
      ['baseOrderSize', '31'],
      ['name', 'Payload probe renamed'],
    ]);
    expect(result).toMatchSnapshot();
  });

  it('Grid create after keystrokes', async () => {
    const { GRID_FORM_DEFAULTS } = await import('@/contexts/bots/form/formDefaults');
    const seeded = {
      ...GRID_CONFIG,
      grid: { ...GRID_FORM_DEFAULTS, ...(GRID_CONFIG.grid as object) },
    } as Partial<BotFormData>;
    const result = await saveWith(gridExperience, BotTypesEnum.grid, 'create', seeded, [
      ['levels', 55],
      ['budget', 1500],
    ]);
    expect(result).toMatchSnapshot();
  });
});
