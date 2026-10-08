/**
 * Runner note: `.vitest.test.tsx` because it renders a hook and mocks modules.
 * Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/botActionRunnerRouting.vitest.test.tsx`.
 *
 * The parity test checks WHICH actions a bot offers. This one checks what the
 * shared runner (`useBotActions`) SENDS: the bot id (the hedge WRAPPER id for
 * hedge bots, never a leg's), the bot type the mutation is built for, and the
 * close parameters (grid: `closeGridType` + `cancelPartiallyFilled`; the rest:
 * `closeType`). It also pins the refs the bot form, the hedge edit page and
 * the hedge drawer build, since an empty or leg id there is what silently
 * breaks Start/Stop.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

const captured = vi.hoisted(() => ({
  calls: [] as Array<{
    mutation: string;
    type?: string;
    input: Record<string, unknown>;
  }>,
  toasts: [] as Array<{ kind: string; message: string }>,
}));

vi.mock('../src/hooks/useBotMutations', () => {
  const mutation = (name: string, type?: string) => ({
    mutate: (
      input: Record<string, unknown>,
      options?: { onSuccess?: () => void }
    ) => {
      captured.calls.push({ mutation: name, ...(type ? { type } : {}), input });
      options?.onSuccess?.();
    },
    mutateAsync: async (input: Record<string, unknown>) => {
      captured.calls.push({ mutation: name, input });
    },
    isPending: false,
  });
  return {
    useBotStatusToggle: (type: string) => mutation('changeStatus', type),
    useBotRestart: () => mutation('restart'),
    useBotDelete: () => mutation('delete'),
    useBotArchive: () => mutation('archive'),
  };
});

vi.mock('../src/hooks/usePaperContext', () => ({
  usePaperContext: () => ({ setLiveTrading: vi.fn() }),
}));

vi.mock('../src/lib/toast', () => {
  const push = (kind: string) => (message: string) => {
    captured.toasts.push({ kind, message });
  };
  return {
    toast: {
      success: push('success'),
      error: push('error'),
      info: push('info'),
      warning: push('warning'),
    },
  };
});

import { useBotActions } from '../src/hooks/useBotActions';
import {
  formBotRef,
  toBotRef,
  toHedgeDrawerBotRef,
} from '../src/features/bots/actions/botRef';
import {
  buildSurfaceItems,
  type BotActionContext,
  type BotRef,
} from '../src/features/bots/actions/botActions';
import {
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  StrategyEnum,
} from '../src/types';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(MemoryRouter, null, children);

const mountActions = (ref: BotRef) =>
  renderHook(() => useBotActions(ref), { wrapper });

const statusCalls = () =>
  captured.calls.filter((c) => c.mutation === 'changeStatus');

afterEach(() => {
  captured.calls = [];
  captured.toasts = [];
});

const dcaBot = {
  _id: 'dca-1',
  status: 'open',
  settings: { name: 'DCA one' },
  usage: { current: { quote: 100 } },
  dealsInBot: { active: 2 },
};
const gridBot = {
  _id: 'grid-1',
  status: 'open',
  exchange: 'binance',
  settings: { name: 'Grid one' },
  levels: { active: { buy: 3, sell: 2 } },
  position: { price: 0 },
};
const legLong = {
  _id: 'leg-long',
  settings: { name: 'Hedge one', strategy: StrategyEnum.long },
  dealsInBot: { active: 1 },
};
const legShort = {
  _id: 'leg-short',
  settings: { name: 'Hedge one', strategy: StrategyEnum.short },
  dealsInBot: { active: 1 },
};
const hedgeWrapper = {
  _id: 'hedge-1',
  status: 'open',
  bots: [legLong, legShort],
  sharedSettings: { useTp: true, tpPerc: '3' },
};

describe('bot action runner routing', () => {
  it('stops a DCA bot with its close type', () => {
    const { result } = mountActions(toBotRef(dcaBot, 'dca'));
    act(() =>
      result.current.changeStatus({
        nextStatus: 'closed',
        closeType: CloseDCATypeEnum.closeByMarket,
      })
    );
    expect(statusCalls()).toEqual([
      {
        mutation: 'changeStatus',
        type: 'dca',
        input: {
          id: 'dca-1',
          status: 'closed',
          closeType: CloseDCATypeEnum.closeByMarket,
        },
      },
    ]);
  });

  it('starts a combo bot as combo', () => {
    const { result } = mountActions(
      toBotRef({ ...dcaBot, _id: 'combo-1', status: 'closed' }, 'combo')
    );
    act(() => result.current.changeStatus({ nextStatus: 'open' }));
    expect(statusCalls()).toEqual([
      {
        mutation: 'changeStatus',
        type: 'combo',
        input: { id: 'combo-1', status: 'open' },
      },
    ]);
  });

  it('stops a grid bot through the dialog with the grid close options', () => {
    const { result } = mountActions(toBotRef(gridBot, 'grid'));
    act(() => result.current.run('stop'));
    expect(result.current.modalProps.statusModalOpen).toBe(true);
    act(() =>
      result.current.modalProps.onConfirmStatusChange(
        CloseGRIDTypeEnum.closeByMarket,
        true
      )
    );
    expect(statusCalls()).toEqual([
      {
        mutation: 'changeStatus',
        type: 'grid',
        input: {
          id: 'grid-1',
          status: 'closed',
          closeGridType: CloseGRIDTypeEnum.closeByMarket,
          cancelPartiallyFilled: true,
        },
      },
    ]);
  });

  it('stops a DCA bot through the dialog with closeType, not the grid fields', () => {
    const { result } = mountActions(toBotRef(dcaBot, 'dca'));
    act(() => result.current.run('stop'));
    act(() =>
      result.current.modalProps.onConfirmStatusChange(
        CloseDCATypeEnum.leave,
        undefined
      )
    );
    expect(statusCalls()[0]?.input).toEqual({
      id: 'dca-1',
      status: 'closed',
      closeType: CloseDCATypeEnum.leave,
    });
  });

  it.each(['hedgeDca', 'hedgeCombo'] as const)(
    'targets the %s wrapper from the drawer, not the leg',
    (kind) => {
      const { result } = mountActions(
        toHedgeDrawerBotRef({
          kind,
          wrapperId: 'hedge-1',
          wrapperStatus: 'open',
          name: 'Hedge one',
          legs: [legLong, legShort],
          wrapper: hedgeWrapper,
        })
      );
      act(() =>
        result.current.changeStatus({
          nextStatus: 'closed',
          closeType: CloseDCATypeEnum.cancel,
        })
      );
      act(() => result.current.run('restart'));
      expect(captured.calls).toEqual([
        {
          mutation: 'changeStatus',
          type: kind,
          input: {
            id: 'hedge-1',
            status: 'closed',
            closeType: CloseDCATypeEnum.cancel,
          },
        },
        { mutation: 'restart', input: { id: 'hedge-1', type: kind } },
      ]);
      // Both legs' deals count toward the stop dialog.
      expect(result.current.bot.activeDeals).toBe(2);
    }
  );

  it('toasts a status change, unless the caller asks for silence', () => {
    const { result } = mountActions(toBotRef(dcaBot, 'dca'));
    act(() => result.current.changeStatus({ nextStatus: 'closed' }));
    expect(captured.toasts).toEqual([
      { kind: 'success', message: 'Bot "DCA one" stopped successfully' },
    ]);
    captured.toasts = [];
    act(() =>
      result.current.changeStatus({ nextStatus: 'closed', silent: true })
    );
    expect(captured.toasts).toEqual([]);
  });

  it('copies the full hedge bot from the drawer, shared settings included', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { result } = mountActions(
      toHedgeDrawerBotRef({
        kind: 'hedgeDca',
        wrapperId: 'hedge-1',
        wrapperStatus: 'open',
        name: 'Hedge one',
        legs: [legLong, legShort],
        wrapper: hedgeWrapper,
      })
    );
    await act(async () => result.current.run('shareConfig'));
    expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual(
      hedgeWrapper
    );
  });
});

describe('form surface refs', () => {
  const formCtx = (mode: 'create' | 'edit'): BotActionContext => ({
    readOnly: false,
    viewOnly: false,
    starred: false,
    pending: {},
    form: { mode },
  });

  it('gives a grid edit form the route id, though grid bots have no usage', () => {
    const ref = formBotRef({
      bot: gridBot,
      kind: 'grid',
      mode: 'edit',
      botId: 'grid-1',
    });
    expect(ref.id).toBe('grid-1');
    expect(ref.kind).toBe('grid');
    const ids = buildSurfaceItems('form', ref, formCtx('edit')).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['addFunds', 'reduceFunds']));
  });

  it('starts a grid bot from the edit form with the real id', () => {
    const { result } = mountActions(
      formBotRef({
        bot: { ...gridBot, status: 'closed' },
        kind: 'grid',
        mode: 'edit',
        botId: 'grid-1',
      })
    );
    act(() =>
      result.current.changeStatus({ nextStatus: 'open', silent: true })
    );
    expect(statusCalls()[0]).toMatchObject({
      type: 'grid',
      input: { id: 'grid-1', status: 'open' },
    });
  });

  it('gives the create form (and an id-less route) no id', () => {
    expect(
      formBotRef({ bot: null, kind: 'dca', mode: 'create', botId: 'x' }).id
    ).toBe('');
    expect(
      formBotRef({ bot: dcaBot, kind: 'dca', mode: 'edit', botId: undefined }).id
    ).toBe('');
    const ids = buildSurfaceItems(
      'form',
      formBotRef({ bot: null, kind: 'grid', mode: 'create', botId: null }),
      formCtx('create')
    ).map((i) => i.id);
    expect(ids).not.toContain('addFunds');
    expect(ids).not.toContain('archive');
  });

  it('addresses the hedge edit page by the wrapper id with the hedge type', () => {
    const ref = formBotRef({
      bot: hedgeWrapper,
      kind: 'hedgeCombo',
      mode: 'edit',
      botId: 'hedge-1',
    });
    expect(ref).toMatchObject({ id: 'hedge-1', kind: 'hedgeCombo', activeDeals: 2 });
  });

  it('addresses the hedge drawer by the wrapper id, not a leg', () => {
    const ref = toHedgeDrawerBotRef({
      kind: 'hedgeDca',
      wrapperId: 'hedge-1',
      wrapperStatus: 'closed',
      name: 'Hedge one',
      legs: [legLong, legShort],
      wrapper: hedgeWrapper,
    });
    expect(ref).toMatchObject({
      id: 'hedge-1',
      kind: 'hedgeDca',
      status: 'closed',
      raw: hedgeWrapper,
    });
  });
});
