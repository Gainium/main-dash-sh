import { test, expect } from '@playwright/test';

import {
  BOT_ACTION_IDS,
  BOT_ACTION_SURFACES,
  DEMO_MODE_REASON,
  VIEW_ONLY_REASON,
  botActions,
  buildBotBulkActions,
  buildSurfaceItems,
  chooseStatusDialog,
  isBotActionVisible,
  type BotActionContext,
  type BotActionId,
  type BotActionSurfaceId,
  type BotKind,
  type BotRef,
} from '@/features/bots/actions/botActions';
import { toBotRef, toHedgeDrawerBotRef } from '@/features/bots/actions/botRef';

/**
 * Bot action parity: every bot surface (cards, rows, drawer menu + footer,
 * name cell, bot form, hedge form) builds its items from one registry. A
 * surface only declares what it opts OUT of, so for any bot the items it
 * renders must be exactly "what the registry shows for this bot" minus that
 * opt-out list. Adding a registry action therefore puts it on every surface
 * unless a surface excludes it — and a surface-handled action (a dialog
 * only the surface can open) fails here until each surface that would show
 * it either provides the handler or opts out.
 */

const KINDS: BotKind[] = ['dca', 'combo', 'grid', 'hedgeDca', 'hedgeCombo'];
const STATUSES = ['open', 'error', 'range', 'monitoring', 'closed', 'archive', 'archived'];

const ref = (kind: BotKind, status: string, over: Partial<BotRef> = {}): BotRef => ({
  ...toBotRef({ _id: 'bot-1', status, settings: { name: 'Bot' } }, kind),
  ...over,
});

const ctxVariants = {
  normal: { readOnly: false, viewOnly: false, starred: false, pending: {} },
  demo: { readOnly: true, viewOnly: false, starred: true, pending: {} },
  viewOnly: { readOnly: false, viewOnly: true, starred: false, pending: {} },
  formEdit: {
    readOnly: false,
    viewOnly: false,
    starred: false,
    pending: {},
    form: { mode: 'edit' },
  },
  formCreate: {
    readOnly: false,
    viewOnly: false,
    starred: false,
    pending: {},
    form: { mode: 'create' },
  },
} satisfies Record<string, BotActionContext>;

const SURFACES = Object.keys(BOT_ACTION_SURFACES) as BotActionSurfaceId[];

const registryVisible = (bot: BotRef, ctx: BotActionContext): BotActionId[] =>
  botActions.filter((def) => isBotActionVisible(def, bot, ctx)).map((d) => d.id);

test.describe('bot actions parity', () => {
  for (const kind of KINDS) {
    for (const status of STATUSES) {
      for (const paper of [false, true]) {
        for (const [ctxName, ctx] of Object.entries(
          ctxVariants
        ) as [string, BotActionContext][]) {
          test(`${kind} ${status} ${paper ? 'paper' : 'live'} ${ctxName}: surfaces = registry − opt-outs`, () => {
            const bot = ref(kind, status, { paper });
            const visible = registryVisible(bot, ctx);
            for (const surface of SURFACES) {
              const { exclude } = BOT_ACTION_SURFACES[surface];
              const expected = visible.filter((id) => !exclude.includes(id)).sort();
              const actual = buildSurfaceItems(surface, bot, ctx)
                .map((item) => item.id)
                .sort();
              expect(actual, surface).toEqual(expected);
            }
          });
        }
      }
    }
  }

  test('surface opt-outs only name real actions', () => {
    for (const surface of SURFACES) {
      for (const id of BOT_ACTION_SURFACES[surface].exclude) {
        expect(BOT_ACTION_IDS, `${surface} excludes ${id}`).toContain(id);
      }
    }
  });

  test('a surface that can show a surface-handled action provides its handler', () => {
    const surfaceHandled = botActions.filter((d) => d.handler === 'surface');
    for (const surface of SURFACES) {
      const { exclude, providesHandlers = [] } = BOT_ACTION_SURFACES[surface];
      for (const def of surfaceHandled) {
        if (exclude.includes(def.id)) continue;
        expect(providesHandlers, `${surface} must handle or exclude ${def.id}`).toContain(def.id);
      }
    }
  });

  test('every registry action is offered on at least one surface', () => {
    for (const id of BOT_ACTION_IDS) {
      const shownSomewhere = SURFACES.some(
        (s) => !BOT_ACTION_SURFACES[s].exclude.includes(id)
      );
      expect(shownSomewhere, id).toBe(true);
    }
  });
});

test.describe('bot actions gating', () => {
  const normal: BotActionContext = ctxVariants.normal;
  const ids = (
    surface: BotActionSurfaceId,
    bot: BotRef,
    ctx: BotActionContext = normal
  ) =>
    buildSurfaceItems(surface, bot, ctx);

  test('delete on a running bot is shown disabled with its reason', () => {
    const del = ids('card', ref('dca', 'open')).find((i) => i.id === 'delete');
    expect(del?.disabled).toBe(true);
    expect(del?.disabledReason).toMatch(/Stop the bot first/);
  });

  test('archive on a running bot is disabled; archived bots show unarchive', () => {
    const running = ids('card', ref('combo', 'open'));
    expect(running.find((i) => i.id === 'archive')?.disabled).toBe(true);
    expect(running.some((i) => i.id === 'unarchive')).toBe(false);
    for (const status of ['archive', 'archived']) {
      const items = ids('card', ref('combo', status));
      expect(items.some((i) => i.id === 'archive')).toBe(false);
      expect(items.find((i) => i.id === 'unarchive')?.disabled).toBe(false);
    }
  });

  test('start/stop show the side matching the status', () => {
    const running = ids('card', ref('grid', 'range')).map((i) => i.id);
    expect(running).toContain('stop');
    expect(running).not.toContain('start');
    const stopped = ids('card', ref('grid', 'closed')).map((i) => i.id);
    expect(stopped).toContain('start');
    expect(stopped).not.toContain('stop');
  });

  test('archived bots cannot be started or edited (disabled with reason)', () => {
    const items = ids('drawerFooter', ref('dca', 'archived'));
    expect(items.find((i) => i.id === 'start')?.disabledReason).toMatch(/Unarchive/);
    expect(items.find((i) => i.id === 'edit')?.disabledReason).toMatch(/Unarchive/);
  });

  test('demo / view-only disable every mutating action, star stays usable', () => {
    for (const [ctx, reason] of [
      [ctxVariants.demo, DEMO_MODE_REASON],
      [ctxVariants.viewOnly, VIEW_ONLY_REASON],
    ] as const) {
      const items = ids('card', ref('dca', 'closed'), ctx);
      for (const item of items) {
        const def = botActions.find((d) => d.id === item.id);
        if (def?.mutating) {
          expect(item.disabled, item.id).toBe(true);
          expect(item.disabledReason, item.id).toBe(reason);
        }
      }
      expect(items.find((i) => i.id === 'star')?.disabled).toBe(false);
    }
  });

  test('hedge bots: no duplicate to the other mode on any surface', () => {
    for (const kind of ['hedgeDca', 'hedgeCombo'] as const) {
      for (const surface of SURFACES) {
        const items = ids(surface, ref(kind, 'closed'));
        expect(items.some((i) => i.id === 'duplicateToOtherMode'), surface).toBe(false);
      }
    }
    expect(
      ids('card', ref('dca', 'closed', { paper: true })).find(
        (i) => i.id === 'duplicateToOtherMode'
      )?.label
    ).toBe('Duplicate to live');
  });

  test('hedge drawer acts on the wrapper, not the displayed leg', () => {
    const bot = toHedgeDrawerBotRef({
      kind: 'hedgeDca',
      wrapperId: 'wrapper',
      wrapperStatus: 'closed',
      name: 'Hedge',
      legs: [
        { _id: 'long', status: 'open', settings: { strategy: 'LONG' }, dealsInBot: { active: 2 } },
        { _id: 'short', status: 'open', settings: { strategy: 'SHORT' }, dealsInBot: { active: 1 } },
      ],
    });
    expect(bot.id).toBe('wrapper');
    expect(bot.kind).toBe('hedgeDca');
    expect(bot.active).toBe(false);
    expect(bot.activeDeals).toBe(3);
  });

  test('grid stop context and open levels come from one adapter', () => {
    const grid = toBotRef(
      {
        _id: 'g',
        status: 'range',
        exchange: 'binanceUsdm',
        position: { price: 10, side: 'SHORT' },
        levels: { active: { buy: 2, sell: 3 } },
        dealsInBot: { active: 99 },
      },
      'grid'
    );
    expect(grid.activeDeals).toBe(5);
    expect(grid.grid).toEqual({ futures: true, hasOpenPosition: true, isShort: true });
  });

  test('form surface: create mode shows only the form-local entries', () => {
    const unsaved = { ...ref('dca', 'closed'), id: '' };
    const create = buildSurfaceItems('form', unsaved, ctxVariants.formCreate).map((i) => i.id);
    expect(create).toEqual(['importExport', 'resetDefaults']);
    const edit = buildSurfaceItems('form', ref('grid', 'closed'), ctxVariants.formEdit);
    expect(edit.map((i) => i.id)).toEqual([
      'importExport',
      'resetDefaults',
      'shareAccess',
      'clone',
      'backtest',
      'archive',
      'addFunds',
      'reduceFunds',
    ]);
    expect(edit.find((i) => i.id === 'resetDefaults')?.disabled).toBe(true);
  });

  test('status dialog choice per flow', () => {
    expect(chooseStatusDialog({ kind: 'grid', active: false, activeDeals: 0 }, 'confirm')).toBe('confirm');
    expect(chooseStatusDialog({ kind: 'grid', active: false, activeDeals: 0 }, 'form')).toBe('gridStart');
    expect(chooseStatusDialog({ kind: 'grid', active: true, activeDeals: 0 }, 'form')).toBe('gridStop');
    expect(chooseStatusDialog({ kind: 'dca', active: true, activeDeals: 2 }, 'form')).toBe('closeOptions');
    expect(chooseStatusDialog({ kind: 'dca', active: true, activeDeals: 0 }, 'form')).toBe('none');
  });
});

test.describe('bot bulk actions', () => {
  const rows = (...specs: [BotKind, string][]) =>
    specs.map(([kind, status], i) => ref(kind, status, { id: `b${i}` }));
  const build = (readOnly = false) =>
    buildBotBulkActions<BotRef>({
      toRef: (r) => r,
      ctx: { readOnly, viewOnly: false },
      onAction: () => {},
    });
  const offered = (selection: BotRef[]) =>
    build()
      .filter((a) => a.shouldShow(selection))
      .map((a) => a.id);

  test('bulk entries come from the registry bulk metadata', () => {
    expect(build().map((a) => a.id)).toEqual(
      botActions.filter((d) => d.bulk).map((d) => d.id)
    );
  });

  test('"any" actions need one eligible bot, delete needs all', () => {
    expect(offered(rows(['dca', 'open'], ['dca', 'closed']))).toEqual([
      'start',
      'stop',
      'restart',
      'edit',
      'archive',
    ]);
    expect(offered(rows(['dca', 'closed'], ['grid', 'archived']))).toEqual([
      'start',
      'edit',
      'archive',
      'unarchive',
      'delete',
    ]);
  });

  test('demo mode disables mutating bulk actions with the reason', () => {
    for (const action of build(true)) {
      expect(action.disabled, action.id).toBe(true);
      expect(action.disabledReason).toBe(DEMO_MODE_REASON);
    }
  });
});
