/**
 * Runner note: `.vitest.test.tsx` because it renders a hook and mocks modules.
 * Run from the parent:
 * `NODE_ENV=development npx vitest run core/tests/dealActionRunnerRouting.vitest.test.tsx`.
 *
 * The parity test checks WHICH actions a deal offers. This one checks what
 * the shared runner (`useDealActionHost`) actually SENDS when one runs: which
 * mutation, with which deal id, bot id, close type and combo flag, for every
 * deal kind. The observation points are the mutation hooks; the dialogs are
 * stubs that hand their `onConfirm` to the test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ mutation: string; input: Record<string, unknown> }>,
  confirm: null as null | (() => void),
  closeConfirm: null as null | ((type: string) => void),
  adjustConfirm: null as null | ((settings: unknown) => void),
  toasts: [] as Array<{ kind: string; message: string }>,
}));

const record = (mutation: string) => (input: Record<string, unknown>) => {
  captured.calls.push({ mutation, input });
  return Promise.resolve({ status: 'OK', data: 'ok' });
};

vi.mock('../src/hooks/useDealActions', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useDealActions: () => ({
      closeDCADeal: record('closeDCADeal'),
      closeComboDeal: record('closeComboDeal'),
    }),
    useAdjustFunds: () => ({ mutate: record('adjustFunds'), isPending: false }),
    useExecuteNextDca: () => ({
      mutate: record('executeNextDca'),
      isPending: false,
    }),
    useEditDeal: () => ({ mutate: record('editDeal'), isPending: false }),
    useRestartDeal: (options?: { silent?: boolean }) => ({
      mutate: record(options?.silent ? 'restartDealSilent' : 'restartDeal'),
      mutateAsync: record(
        options?.silent ? 'restartDealSilent' : 'restartDeal'
      ),
    }),
    useRestoreDeal: () => ({ mutateAsync: record('restoreDeal') }),
    useMoveDealToTerminal: () => ({ mutateAsync: record('moveDealToTerminal') }),
  };
});

vi.mock('../src/features/bots/widgets/BotForm/hooks/useMergeSmartOrders', () => ({
  useMergeSmartOrders: () => ({ mutateAsync: record('mergeDeals') }),
}));

vi.mock('../src/components/deals/actions/useBulkAdjustFunds', () => ({
  useBulkAdjustFunds: () => ({ open: vi.fn(), dialog: null }),
}));

vi.mock('../src/components/deals/MoveDealToBotDialog', () => ({
  MoveDealToBotDialog: () => null,
}));

vi.mock('../src/components/ui/confirmation-dialog', () => ({
  ConfirmationDialog: ({ onConfirm }: { onConfirm: () => void }) => {
    captured.confirm = onConfirm;
    return null;
  },
}));

vi.mock('../src/features/bots/shared/runtime', () => ({
  CloseOptionsDialog: ({ onConfirm }: { onConfirm: (t: string) => void }) => {
    captured.closeConfirm = onConfirm;
    return null;
  },
  AdjustFundsDialog: ({ onConfirm }: { onConfirm: (s: unknown) => void }) => {
    captured.adjustConfirm = onConfirm;
    return null;
  },
  ExecuteNextDcaDialog: () => null,
  ChangeDcaLevelsDialog: () => null,
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

import { useDealActionHost } from '../src/features/deals/actions/useDealActionHost';
import { buildDealBulkActions } from '../src/features/deals/actions/dealActionRegistry';
import type { DealKind, DealRef } from '../src/features/deals/actions/dealRef';
import { CloseDCATypeEnum } from '../src/types';

const deal = (kind: DealKind, over: Partial<DealRef> = {}): DealRef => ({
  id: `deal-${kind}`,
  dealId: `deal-${kind}`,
  botId: `bot-${kind}`,
  kind,
  status: 'open',
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  exchange: 'binance',
  exchangeUUID: 'acct-1',
  strategy: 'LONG',
  long: true,
  futures: false,
  riskBased: false,
  levels: { complete: 1, all: 3 },
  percentBasis: undefined,
  trade: undefined,
  ...over,
});

/** Mount the host and keep its dialogs rendered as its state changes. */
const mountHost = () => {
  const hook = renderHook(() => useDealActionHost({}));
  const Dialogs = () => <>{hook.result.current.dialogs as ReactNode}</>;
  const view = render(<Dialogs />);
  const rerender = () => view.rerender(<Dialogs />);
  return {
    run: async (...args: Parameters<typeof hook.result.current.runner.run>) => {
      await act(async () => {
        hook.result.current.runner.run(...args);
      });
      rerender();
    },
  };
};

const flush = async (fn: () => void) => {
  await act(async () => {
    fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const ALL_KINDS: DealKind[] = [
  'dca',
  'combo',
  'hedgeDca',
  'hedgeCombo',
  'terminal',
  'grid',
];
const COMBO_ENGINE = new Set<DealKind>(['combo', 'hedgeCombo']);

afterEach(() => {
  captured.calls = [];
  captured.confirm = null;
  captured.closeConfirm = null;
  captured.adjustConfirm = null;
  captured.toasts = [];
});

describe('deal action runner routing', () => {
  it.each(ALL_KINDS)('closes a %s deal through the right mutation', async (kind) => {
    const host = mountHost();
    await host.run('close', [deal(kind)]);
    await flush(() => captured.closeConfirm?.(CloseDCATypeEnum.closeByMarket));
    expect(captured.calls).toEqual([
      {
        mutation: COMBO_ENGINE.has(kind) ? 'closeComboDeal' : 'closeDCADeal',
        input: {
          dealId: `deal-${kind}`,
          botId: `bot-${kind}`,
          type: CloseDCATypeEnum.closeByMarket,
        },
      },
    ]);
  });

  it.each(ALL_KINDS)('cancels a %s deal with the cancel close type', async (kind) => {
    const host = mountHost();
    await host.run('cancel', [deal(kind)]);
    await flush(() => captured.confirm?.());
    expect(captured.calls).toEqual([
      {
        mutation: COMBO_ENGINE.has(kind) ? 'closeComboDeal' : 'closeDCADeal',
        input: {
          dealId: `deal-${kind}`,
          botId: `bot-${kind}`,
          type: CloseDCATypeEnum.cancel,
        },
      },
    ]);
  });

  it.each(['dca', 'combo', 'hedgeDca', 'hedgeCombo'] as DealKind[])(
    'restarts a %s deal with the combo flag of its engine',
    async (kind) => {
      const host = mountHost();
      await host.run('restart', [deal(kind)]);
      await flush(() => captured.confirm?.());
      expect(captured.calls).toEqual([
        {
          mutation: 'restartDeal',
          input: {
            dealId: `deal-${kind}`,
            botId: `bot-${kind}`,
            combo: COMBO_ENGINE.has(kind),
          },
        },
      ]);
    }
  );

  it.each(['dca', 'combo'] as DealKind[])(
    'moves a %s deal to the terminal with its combo flag',
    async (kind) => {
      const host = mountHost();
      await host.run('moveToTerminal', [deal(kind)]);
      await flush(() => captured.confirm?.());
      expect(captured.calls).toEqual([
        {
          mutation: 'moveDealToTerminal',
          input: {
            dealId: `deal-${kind}`,
            botId: `bot-${kind}`,
            combo: kind === 'combo',
          },
        },
      ]);
    }
  );

  it.each(['dca', 'hedgeDca', 'terminal'] as DealKind[])(
    'restores a canceled %s deal by its own bot id',
    async (kind) => {
      const host = mountHost();
      await host.run('restore', [deal(kind, { status: 'canceled' })]);
      await flush(() => captured.confirm?.());
      expect(captured.calls).toEqual([
        {
          mutation: 'restoreDeal',
          input: { dealId: `deal-${kind}`, botId: `bot-${kind}` },
        },
      ]);
    }
  );

  it.each([
    ['addFunds', 'add'],
    ['reduceFunds', 'reduce'],
  ] as const)('%s sends the deal and bot id with mode %s', async (id, mode) => {
    const host = mountHost();
    await host.run(id, [deal('hedgeDca')]);
    const settings = { qty: '10', type: 'fixed', asset: 'quote' };
    await flush(() => captured.adjustConfirm?.(settings));
    expect(captured.calls).toEqual([
      {
        mutation: 'adjustFunds',
        input: {
          dealId: 'deal-hedgeDca',
          botId: 'bot-hedgeDca',
          settings,
          mode,
        },
      },
    ]);
  });
});

describe('deal bulk summaries', () => {
  it('reports skipped deals when bulk close leaves some out', async () => {
    const host = mountHost();
    const deals = [
      deal('dca', { id: 'a' }),
      deal('combo', { id: 'b' }),
      deal('dca', { id: 'c' }),
    ];
    await host.run('close', deals, { skipped: 2 });
    await flush(() => captured.closeConfirm?.(CloseDCATypeEnum.closeByMarket));
    expect(captured.calls.map((c) => c.mutation)).toEqual([
      'closeDCADeal',
      'closeComboDeal',
      'closeDCADeal',
    ]);
    expect(captured.toasts).toEqual([
      { kind: 'success', message: 'Closed 3 deal(s), skipped 2 not open' },
    ]);
  });

  it('keeps the bulk summary when one deal is left of a selection', async () => {
    const host = mountHost();
    await host.run('cancel', [deal('dca')], { skipped: 1 });
    await flush(() => captured.confirm?.());
    expect(captured.toasts).toEqual([
      { kind: 'success', message: 'Canceled 1 deal(s), skipped 1 already ended' },
    ]);
  });

  it('passes the skipped count from the bulk toolbar to the runner', () => {
    const run = vi.fn();
    const actions = buildDealBulkActions<DealRef>({ toDeal: (d) => d, run });
    const close = actions.find((a) => a.id === 'close');
    const open1 = deal('dca', { id: 'o1' });
    const open2 = deal('combo', { id: 'o2' });
    const ended = deal('dca', { id: 'x', status: 'closed' });
    close?.onAction([open1, ended, open2]);
    expect(run).toHaveBeenCalledWith('close', [open1, open2], { skipped: 1 });
  });
});
