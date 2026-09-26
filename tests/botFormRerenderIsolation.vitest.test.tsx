/**
 * Runner note: `.vitest.test.tsx`, run from the parent:
 *   NODE_ENV=development npx vitest run core/tests/botFormRerenderIsolation.vitest.test.tsx
 *
 * specs/066 — a keystroke in the bot form must re-render only what depends on
 * the edited value. These tests mount the REAL BotFormProvider and count
 * renders of the consumers that used to subscribe to the whole form store.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  act,
  createElement,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import {
  BotFormProvider,
  useBotFormActions,
  useBotFormContext,
  useBotFormEditing,
  useBotFormFeatures,
  useBotFormFieldLock,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider';
import { riskRewardRuntimeStore } from '@/contexts/bots/dca/RiskRewardRuntimeContext';
import { BotFormRegistryContext } from '@/features/bots/widgets/BotForm/context';
import { useBotVarBinding } from '@/hooks/bots/global-variables/useBotVarBinding';
import { createIndicatorStore } from '@/stores/indicatorStore';
import { BotTypesEnum } from '@/types';

const renders = new Map<string, number>();
const bump = (key: string) => {
  renders.set(key, (renders.get(key) ?? 0) + 1);
};
const count = (key: string) => renders.get(key) ?? 0;

// Filled from effects (a component may not reassign outer variables in render).
const probe: {
  actions: ReturnType<typeof useBotFormActions> | null;
  rerenderParent: (() => void) | null;
} = { actions: null, rerenderParent: null };
const actions = () => {
  if (!probe.actions) throw new Error('actions missing');
  return probe.actions;
};
const rerenderParent = () => {
  if (!probe.rerenderParent) throw new Error('parent missing');
  probe.rerenderParent();
};

const VarBound = () => {
  useBotVarBinding('tpPerc');
  bump('varBinding');
  return null;
};
const FeatureReader = () => {
  useBotFormFeatures();
  useBotFormFieldLock();
  useBotFormEditing();
  bump('featureReaders');
  return null;
};
const ContextReader = () => {
  useBotFormContext();
  bump('context');
  return null;
};
const Dispatcher = () => {
  const a = useBotFormActions();
  useEffect(() => {
    probe.actions = a;
  });
  return null;
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const Parent = ({ mode }: { mode: BotFormMode }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    probe.rerenderParent = () => setTick((t) => t + 1);
  });
  // A fresh props object (and fresh initialFormData) on every parent render,
  // exactly like a host that re-renders for its own reasons.
  return createElement(
    BotFormProvider,
    {
      mode,
      botType: BotTypesEnum.dca,
      initialFormData: { name: `seed-${tick >= 0 ? 'x' : 'y'}` },
      children: [
        createElement(VarBound, { key: 'a' }),
        createElement(FeatureReader, { key: 'b' }),
        createElement(ContextReader, { key: 'c' }),
        createElement(Dispatcher, { key: 'd' }),
      ] as ReactNode,
    }
  );
};

const mount = async (mode: BotFormMode = 'create') => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  await act(async () => {
    r.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          BotFormRegistryContext.Provider,
          {
            value: {
              botExperience: { id: BotTypesEnum.dca } as never,
              widgetId: 'test',
            },
          },
          createElement(Parent, { mode })
        )
      )
    );
  });
};

describe('bot form re-render isolation (specs/066)', () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    renders.clear();
  });
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    probe.actions = null;
    probe.rerenderParent = null;
  });

  it('§1.1 a keystroke does not re-render variable bindings or flag readers', async () => {
    await mount();
    const before = new Map(renders);
    for (const v of ['1', '12', '12.', '12.5']) {
      await act(async () => {
        actions().updateFormData('tpPerc', v);
      });
    }
    await act(async () => {
      actions().updateFormData('name', 'typed name');
    });
    expect(count('varBinding')).toBe(before.get('varBinding'));
    expect(count('featureReaders')).toBe(before.get('featureReaders'));
    expect(count('context')).toBe(before.get('context'));
  });

  it('§1.6 a parent re-render does not change the form context', async () => {
    await mount();
    const before = new Map(renders);
    await act(async () => {
      rerenderParent();
    });
    await act(async () => {
      rerenderParent();
    });
    // The children are re-created by the parent, so they render; what must not
    // happen is a context-driven render of a memoized consumer. The context
    // reader is not memoized here, so compare the action callbacks instead.
    const resetBefore = actions().resetFormData;
    await act(async () => {
      rerenderParent();
    });
    expect(actions().resetFormData).toBe(resetBefore);
    expect(count('context') - (before.get('context') ?? 0)).toBe(3);
  });

  it('§1.5 a scroll-spy tab change does not re-render context consumers', async () => {
    await mount();
    const before = new Map(renders);
    await act(async () => {
      actions().setActiveTab('take-profit');
    });
    await act(async () => {
      actions().setActiveTab('stop-loss');
    });
    expect(count('context')).toBe(before.get('context'));
    expect(count('varBinding')).toBe(before.get('varBinding'));
  });
});

describe('side-effect stores (specs/066 §1.8)', () => {
  it('IndicatorStore ignores the list it already holds', async () => {
    const store = createIndicatorStore();
    const listener = vi.fn();
    store.subscribe(listener);
    listener.mockClear();
    const list = [] as never[];
    store.setIndicators(list);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    store.setIndicators(list);
    store.setIndicators(list);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('risk/reward runtime does not notify on a patch that changes nothing', () => {
    riskRewardRuntimeStore.reset();
    const listener = vi.fn();
    const unsubscribe = riskRewardRuntimeStore.subscribe(listener);
    riskRewardRuntimeStore.setState({ stopLossPrice: 100, atrValue: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    riskRewardRuntimeStore.setState({ stopLossPrice: 100, atrValue: 2 });
    riskRewardRuntimeStore.setState({ stopLossPrice: 100 });
    expect(listener).toHaveBeenCalledTimes(1);
    riskRewardRuntimeStore.setState({ stopLossPrice: 101 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
