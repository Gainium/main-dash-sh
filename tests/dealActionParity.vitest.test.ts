import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { canExecuteNextDca } from '@/features/bots/shared/runtime/dialogs/executeNextDcaEligibility';
import {
  DEAL_ACTIONS,
  DEAL_ACTION_SURFACES,
  buildDealBulkActions,
  getDealActionItems,
  type DealActionId,
  type DealActionSurfaceId,
} from '@/features/deals/actions/dealActionRegistry';
import {
  DEAL_KINDS,
  dealKindLabel,
  dealRefFromHistoryRow,
  dealRefFromTrade,
  runsOnComboEngine,
  type DealKind,
  type DealRef,
} from '@/features/deals/actions/dealRef';
import { BotTypesEnum } from '@/types';
import type { TransformedTrade } from '@/types/dcaDeal';

/**
 * Every surface that shows a deal's actions draws them from one registry. These
 * tests pin that down: a surface shows exactly the registry's applicable
 * actions minus what it declares it leaves out, and an action added to the
 * registry fails here until every surface either shows it or opts out of it.
 */

// The registry's actions, in menu order. Adding one means deciding, for each
// surface in DEAL_ACTION_SURFACES, whether it shows it — then updating this.
const MENU_ACTIONS: DealActionId[] = [
  'view',
  'journal',
  'addFunds',
  'reduceFunds',
  'edit',
  'executeNextDca',
  'restart',
  'changeDcaLevels',
  'moveToTerminal',
  'moveToBot',
  'restore',
  'cancel',
  'close',
];
const BULK_ACTIONS: DealActionId[] = [
  'merge',
  'journal',
  'addFunds',
  'reduceFunds',
  'edit',
  'restart',
  'moveToTerminal',
  'restore',
  'cancel',
  'close',
];

const STATUSES = ['open', 'start', 'error', 'closed', 'canceled'] as const;

let nextId = 0;
const trade = (over: Partial<TransformedTrade> = {}): TransformedTrade => ({
  id: `deal-${(nextId += 1)}`,
  active: true,
  type: 'DCA',
  symbol: 'BTCUSDT',
  strategy: 'LONG',
  status: 'open',
  exchange: 'binance',
  botId: 'bot-1',
  currentBalance: { base: 0, quote: 0 },
  usage: { current: { base: 0, quote: 0 } },
  levels: { complete: 2, all: 5 },
  ...over,
});

/** A trade row of a kind, built the way the tables build them. */
const tradeOfKind = (
  kind: DealKind,
  over: Partial<TransformedTrade> = {}
): TransformedTrade => {
  switch (kind) {
    // Hedge rows keep their leg's plain type and carry the hedge flag.
    case 'hedgeDca':
      return trade({ type: 'DCA', hedge: true, ...over });
    case 'hedgeCombo':
      return trade({ type: 'Combo', hedge: true, ...over });
    case 'terminal':
      return trade({ type: 'Terminal', terminal: true, ...over });
    default:
      return trade({ type: dealKindLabel(kind), ...over });
  }
};

const fixtures: DealRef[] = DEAL_KINDS.flatMap((kind) =>
  STATUSES.map((status) => dealRefFromTrade(tradeOfKind(kind, { status })))
);

const ids = (deal: DealRef, surface: DealActionSurfaceId) =>
  getDealActionItems(deal, surface).map((item) => item.id);

describe('deal action registry', () => {
  it('lists the actions the surfaces were reviewed against', () => {
    expect(DEAL_ACTIONS.filter((a) => a.menu).map((a) => a.id)).toEqual(
      MENU_ACTIONS
    );
    expect(DEAL_ACTIONS.filter((a) => a.bulk).map((a) => a.id)).toEqual(
      BULK_ACTIONS
    );
  });

  it('adapts every kind of row to its kind', () => {
    for (const kind of DEAL_KINDS) {
      expect(dealRefFromTrade(tradeOfKind(kind)).kind).toBe(kind);
    }
    // A terminal deal labelled by its strategy is still terminal.
    expect(dealRefFromTrade(trade({ type: 'DCA', terminal: true })).kind).toBe(
      'terminal'
    );
    expect(
      dealRefFromHistoryRow(
        {
          id: 'd',
          botId: 'b',
          status: 'open',
          symbol: 'BTCUSDT',
          long: true,
          futures: false,
        },
        BotTypesEnum.combo
      ).kind
    ).toBe('combo');
  });
});

describe('surfaces', () => {
  const surfaces = Object.keys(DEAL_ACTION_SURFACES) as DealActionSurfaceId[];

  it.each(surfaces)(
    '%s shows the registry actions minus its own exclusions',
    (surface) => {
      const exclude: readonly DealActionId[] =
        DEAL_ACTION_SURFACES[surface].exclude;
      for (const deal of fixtures) {
        const expected = DEAL_ACTIONS.filter(
          (a) => a.menu && a.visible(deal) && !exclude.includes(a.id)
        ).map((a) => a.id);
        expect(ids(deal, surface)).toEqual(expected);
      }
    }
  );

  it.each(surfaces)(
    '%s either shows or explicitly excludes every action',
    (surface) => {
      const exclude: readonly DealActionId[] =
        DEAL_ACTION_SURFACES[surface].exclude;
      const shown = new Set(fixtures.flatMap((deal) => ids(deal, surface)));
      for (const id of MENU_ACTIONS) {
        expect(
          shown.has(id) || exclude.includes(id),
          `${surface} neither shows nor excludes "${id}"`
        ).toBe(true);
      }
      for (const id of exclude) {
        expect(MENU_ACTIONS).toContain(id);
      }
    }
  );

  // The surfaces render through the registry's menu components only; none of
  // them may wire a deal action of its own.
  const SURFACE_FILES: Record<string, DealActionSurfaceId | null> = {
    'src/components/widgets/shared/OpenOrdersWidget.tsx': 'tradesTable',
    'src/components/trades/TradeCard.tsx': 'tradeCard',
    'src/components/widgets/bots/drawer/DrawerDealsTable.tsx': 'drawerTable',
    'src/components/widgets/bots/EditDealHistory.tsx': 'dealHistory',
    'src/components/widgets/dashboard/TopDeals.tsx': null,
  };
  const ACTION_PLUMBING =
    /\b(useRestartDeal|useRestoreDeal|useMoveDealToTerminal|useExecuteNextDca|useAdjustFunds|useDealActions|useMergeSmartOrders|AdjustFundsDialog|CloseOptionsDialog|ChangeDcaLevelsDialog|ExecuteNextDcaDialog|MoveDealToBotDialog|createSharedDealBulkActions)\b/;

  it.each(Object.entries(SURFACE_FILES))(
    '%s renders deal actions through the registry only',
    (file, surface) => {
      const source = readFileSync(resolve(__dirname, '..', file), 'utf8');
      expect(source).not.toMatch(ACTION_PLUMBING);
      if (surface) {
        expect(source).toContain(`surface="${surface}"`);
      }
    }
  );
});

describe('gating', () => {
  const deal = (kind: DealKind, status = 'open', over = {}) =>
    dealRefFromTrade(tradeOfKind(kind, { status, ...over }));
  const item = (d: DealRef, id: DealActionId) =>
    getDealActionItems(d, 'tradeCard').find((i) => i.id === id);

  it('offers Restart on DCA and combo deals, hedge ones included', () => {
    for (const kind of ['dca', 'combo', 'hedgeDca', 'hedgeCombo'] as const) {
      expect(item(deal(kind), 'restart')?.disabledReason).toBeNull();
      expect(item(deal(kind, 'error'), 'restart')?.disabledReason).toBeNull();
      expect(item(deal(kind, 'closed'), 'restart')?.disabledReason).toEqual(
        expect.any(String)
      );
    }
    expect(item(deal('terminal'), 'restart')).toBeUndefined();
    expect(item(deal('grid'), 'restart')).toBeUndefined();
    // The trades table shows it too — the gap this registry closes.
    expect(ids(deal('dca'), 'tradesTable')).toContain('restart');
    expect(ids(deal('dca'), 'drawerTable')).toContain('restart');
  });

  it('gives hedge deals the hedge actions, not the plain DCA ones', () => {
    // Moving one leg's deal out would detach it from its pair.
    for (const kind of ['hedgeDca', 'hedgeCombo'] as const) {
      expect(item(deal(kind), 'moveToTerminal')).toBeUndefined();
    }
    // Restore works by the leg's own bot id, as for DCA; combo never.
    expect(
      item(deal('hedgeDca', 'canceled'), 'restore')?.disabledReason
    ).toBeNull();
    expect(item(deal('hedgeCombo', 'canceled'), 'restore')).toBeUndefined();
    expect(item(deal('combo', 'canceled'), 'restore')).toBeUndefined();
    expect(item(deal('hedgeCombo'), 'addFunds')).toBeUndefined();
    expect(item(deal('hedgeDca'), 'addFunds')?.disabledReason).toBeNull();
  });

  it('routes combo and hedge-combo deals to the combo engine', () => {
    expect(DEAL_KINDS.filter(runsOnComboEngine)).toEqual([
      'combo',
      'hedgeCombo',
    ]);
  });

  it('moves DCA and combo deals to the terminal, never grid', () => {
    expect(item(deal('dca'), 'moveToTerminal')?.disabledReason).toBeNull();
    expect(item(deal('combo'), 'moveToTerminal')?.disabledReason).toBeNull();
    expect(item(deal('grid'), 'moveToTerminal')).toBeUndefined();
    expect(item(deal('terminal'), 'moveToTerminal')).toBeUndefined();
    expect(item(deal('terminal'), 'moveToBot')?.disabledReason).toBeNull();
  });

  it('shows state-blocked actions disabled, with a reason', () => {
    const closed = deal('dca', 'closed');
    for (const id of ['addFunds', 'edit', 'cancel', 'close'] as const) {
      expect(item(closed, id)?.disabledReason).toEqual(expect.any(String));
    }
    // Cancel reaches a deal the engine is still starting or that errored;
    // close by market/limit only acts on an open one.
    expect(item(deal('dca', 'start'), 'cancel')?.disabledReason).toBeNull();
    expect(item(deal('dca', 'error'), 'cancel')?.disabledReason).toBeNull();
    expect(item(deal('dca', 'error'), 'close')?.disabledReason).toEqual(
      expect.any(String)
    );
    expect(item(deal('dca', 'canceled'), 'restore')?.disabledReason).toBeNull();
    expect(item(deal('dca', 'open'), 'restore')?.disabledReason).toEqual(
      expect.any(String)
    );
    expect(item(deal('dca', 'open', { botId: undefined }), 'close')?.disabledReason).toEqual(
      expect.any(String)
    );
  });

  it('enables Execute next DCA exactly where canExecuteNextDca allows it', () => {
    const cases: Partial<TransformedTrade>[] = [
      { status: 'open' },
      { status: 'closed' },
      { status: 'open', riskBased: true },
      { status: 'open', levels: { complete: 5, all: 5 } },
      { status: 'open', levels: { complete: 0, all: 5 } },
    ];
    for (const over of cases) {
      const row = tradeOfKind('dca', over);
      expect(
        item(dealRefFromTrade(row), 'executeNextDca')?.disabledReason === null
      ).toBe(canExecuteNextDca(row));
    }
  });
});

describe('bulk actions', () => {
  const run = () => undefined;
  const bulk = buildDealBulkActions<TransformedTrade>({
    toDeal: dealRefFromTrade,
    run,
  });

  it('derive from the registry metadata', () => {
    expect(bulk.map((a) => a.id)).toEqual(BULK_ACTIONS);
  });

  it('offer an action for one deal exactly when its menu would enable it', () => {
    for (const kind of DEAL_KINDS) {
      for (const status of STATUSES) {
        const row = tradeOfKind(kind, { status });
        const d = dealRefFromTrade(row);
        for (const action of bulk) {
          if (action.id === 'merge') continue;
          const menuItem = getDealActionItems(d, 'tradeCard').find(
            (i) => i.id === action.id
          );
          expect(action.shouldShow?.([row]), `${action.id} ${kind} ${status}`).toBe(
            !!menuItem && menuItem.disabledReason === null
          );
        }
      }
    }
  });

  it('run only on the deals that can take the action', () => {
    const received: string[][] = [];
    const actions = buildDealBulkActions<TransformedTrade>({
      toDeal: dealRefFromTrade,
      run: (_id, deals) => received.push(deals.map((d) => d.id)),
    });
    const open = tradeOfKind('dca', { status: 'open', id: 'a' });
    const closed = tradeOfKind('dca', { status: 'closed', id: 'b' });
    actions.find((a) => a.id === 'restart')?.onAction([open, closed]);
    expect(received).toEqual([['a']]);
    // Move to Terminal is all-or-nothing.
    expect(
      actions.find((a) => a.id === 'moveToTerminal')?.shouldShow?.([open, closed])
    ).toBe(false);
  });
});
