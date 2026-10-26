// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { IndicatorEdgePanel } from '@/components/indicators/IndicatorEdgePanel';
import { IndicatorConfigurationModal } from '@/components/indicators/IndicatorConfigurationModal';
import { IndicatorList } from '@/components/indicators/IndicatorList';
import { IndicatorEdgeMatchBadge } from '@/components/indicators/IndicatorEdgeControls';
import { HelpArticleModal } from '@/components/modals/HelpArticleModal';
import { resetIndicatorEdgeCache } from '@/hooks/useIndicatorEdge';
import {
  ExchangeEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
  StrategyEnum,
} from '@/types';
import type { IndicatorEdge } from '@/types/helpCenter';
import {
  getIndicatorDefaultParams,
  getIndicatorDefinition,
} from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
  edgeRowsFor,
  edgeSettingForSide,
  edgeSideNote,
  edgeTimeframes,
  mirrorEdgeCell,
  sanitizeIndicatorEdge,
} from '@/utils/indicatorEdge';
import {
  buildEdgeAppliedParams,
  edgeSideForCondition,
  isApplicableEdgeBot,
  matchEdgeSetting,
} from '@/utils/indicators/edgeApply';
import { withFavoritePreset } from '@/utils/indicators/favoritePresetScope';
import realBots from './fixtures/indicatorEdgeBots.json';

/**
 * The price-behaviour panel of an indicator help article (main-app spec 054
 * §4b): sanitized data, rows per timeframe, and Apply filling a tested
 * setting into the indicator dialog.
 */

const cell = (edge: number, verdict: string, episodes = 300) => ({
  entries: episodes * 6,
  episodes,
  draws: 100,
  edge,
  chance: [-0.2, 0.2],
  verdict,
});

const rsiBot = (length: number, condition: string, value: number) => ({
  type: 'RSI',
  params: {
    indicatorLength: length,
    indicatorCondition: condition,
    indicatorValue: value,
  },
});

const setting = (
  id: string,
  tf: string,
  label: string,
  side: string,
  pooled: ReturnType<typeof cell>,
  extra: Record<string, unknown> = {}
) => ({
  id,
  tf,
  label,
  side,
  featured: false,
  pooled: { ...pooled, path: [0, pooled.edge], band: [[-0.1, 0.1], [-0.2, 0.2]] },
  coins: { BTC: pooled, ETH: pooled, SOL: pooled },
  regimes: { up: cell(0.05, 'none'), down: cell(-0.31, 'worse') },
  ...extra,
});

const rawEdge = () => ({
  indicator: 'rsi',
  defaultTf: '4h',
  updatedAt: '2026-10-25',
  summary: 'Summary.',
  verdicts: [],
  notes: [],
  method: {
    horizon: 20,
    horizons: [10, 20, 50, 100],
    randomDraws: 500,
    minEpisodes: 30,
    source: 'Binance spot',
    pairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    from: '2020-09-01',
    to: '2026-10-24',
    regime: { by: 'pair close vs its 200-day SMA', sma: 200 },
  },
  settings: [
    setting('rsi14-lt30', '1h', 'RSI(14) below 30', 'long', cell(-0.01, 'none'), {
      bot: rsiBot(14, 'lt', 30),
    }),
    setting('rsi14-gt70', '1h', 'RSI(14) above 70', 'short', cell(-0.4, 'worse'), {
      bot: rsiBot(14, 'gt', 70),
    }),
    setting('rsi14-lt30', '4h', 'RSI(14) below 30', 'long', cell(-0.32, 'none'), {
      bot: rsiBot(14, 'lt', 30),
    }),
    setting('rsi7-few', '4h', 'RSI(7) below 10', 'long', cell(0.9, 'few', 10), {
      bot: null,
    }),
    setting('rsi14-gt70', '4h', 'RSI(14) above 70', 'short', cell(-0.5, 'worse')),
    setting('rsi14-down70', '4h', 'RSI(14) crossing down 70', 'short', cell(-0.3, 'fragile-worse'), {
      bot: rsiBot(14, 'cd', 70),
    }),
    setting('rsi14-gt50', '4h', 'RSI(14) above 50', 'long', cell(0.45, 'fragile'), {
      bot: rsiBot(14, 'gt', 50),
    }),
    setting('rsi14-up30', '4h', 'RSI(14) crossing up 30', 'long', cell(0.6, 'edge'), {
      bot: rsiBot(14, 'cu', 30),
    }),
    setting('rsi14-lt30', '1d', 'RSI(14) below 30', 'long', cell(0.1, 'none'), {
      bot: rsiBot(14, 'lt', 30),
    }),
  ],
});

const edge = (): IndicatorEdge => {
  const out = sanitizeIndicatorEdge(rawEdge());
  if (!out) throw new Error('fixture should be valid');
  return out;
};

const rowIds = () =>
  screen.getAllByTestId('edge-row').map((row) => row.dataset['setting']);

beforeAll(() => {
  // jsdom has no ResizeObserver; the tab list measures itself with one
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(cleanup);

// ─── Sanitizer ───────────────────────────────────────────────────────────────

describe('sanitizeIndicatorEdge', () => {
  test('keeps the known fields only', () => {
    const out = edge();
    expect(Object.keys(out).sort()).toEqual(
      ['defaultTf', 'method', 'settings', 'updatedAt'].sort()
    );
    const first = out.settings[0];
    expect(Object.keys(first).sort()).toEqual(
      ['bot', 'id', 'label', 'pooled', 'regimes', 'side', 'tf'].sort()
    );
    expect(Object.keys(first.pooled).sort()).toEqual(
      ['chance', 'edge', 'entries', 'episodes', 'verdict'].sort()
    );
    expect(first.bot).toEqual(rsiBot(14, 'lt', 30));
    expect(out.method.regime).toEqual({ sma: 200 });
  });

  test('a missing bot reads as null', () => {
    const out = edge();
    const gt70 = out.settings.find((s) => s.tf === '4h' && s.id === 'rsi14-gt70');
    expect(gt70?.bot).toBeNull();
  });

  test('a malformed bot drops only itself', () => {
    const raw = rawEdge();
    Object.assign(raw.settings[0], { bot: { type: 'NOPE', params: {} } });
    Object.assign(raw.settings[1], {
      bot: { type: 'RSI', params: { indicatorLength: { nested: 1 } } },
    });
    Object.assign(raw.settings[2], { bot: { type: 'RSI', params: [] } });
    const out = sanitizeIndicatorEdge(raw);
    expect(out?.settings).toHaveLength(raw.settings.length);
    expect(out?.settings.slice(0, 3).map((s) => s.bot)).toEqual([null, null, null]);
  });

  test('a malformed trend split drops only itself', () => {
    const raw = rawEdge();
    Object.assign(raw.settings[0], { regimes: { up: cell(0.1, 'none'), down: {} } });
    const out = sanitizeIndicatorEdge(raw);
    expect(out?.settings[0].regimes).toBeUndefined();
    expect(out?.settings[1].regimes).toBeDefined();
  });

  test.each([
    ['not an object', () => 'edge'],
    ['an array', () => []],
    ['no settings', () => ({ ...rawEdge(), settings: [] })],
    ['a default timeframe without rows', () => ({ ...rawEdge(), defaultTf: '15m' })],
    ['a bad date', () => ({ ...rawEdge(), updatedAt: 'last month' })],
    ['no horizon', () => ({ ...rawEdge(), method: { ...rawEdge().method, horizon: 0 } })],
    [
      'an unknown verdict',
      () => {
        const raw = rawEdge();
        raw.settings[3].pooled.verdict = 'maybe';
        return raw;
      },
    ],
    [
      'a NaN edge',
      () => {
        const raw = rawEdge();
        raw.settings[3].pooled.edge = Number.NaN;
        return raw;
      },
    ],
    [
      'an inverted luck band',
      () => {
        const raw = rawEdge();
        raw.settings[3].pooled.chance = [0.3, -0.3];
        return raw;
      },
    ],
    [
      'a bad side',
      () => {
        const raw = rawEdge();
        raw.settings[3].side = 'both';
        return raw;
      },
    ],
  ])('drops the whole edge on %s', (_name, make) => {
    expect(sanitizeIndicatorEdge(make())).toBeUndefined();
  });
});

describe('row order', () => {
  test('timeframes run 1h, 4h, 1d', () => {
    expect(edgeTimeframes(edge())).toEqual(['1h', '4h', '1d']);
  });

  test('edge, fragile, none, fragile-worse, worse, few', () => {
    expect(edgeRowsFor(edge(), '4h').map((s) => s.pooled.verdict)).toEqual([
      'edge',
      'fragile',
      'none',
      'fragile-worse',
      'worse',
      'few',
    ]);
  });
});

// ─── Panel ───────────────────────────────────────────────────────────────────

const renderPanel = (props: Partial<React.ComponentProps<typeof IndicatorEdgePanel>> = {}) =>
  render(
    <MemoryRouter>
      <IndicatorEdgePanel edge={edge()} slug="rsi" {...props} />
    </MemoryRouter>
  );

describe('IndicatorEdgePanel', () => {
  test('shows the default timeframe, sorted, with trend chips and the disclaimer', () => {
    renderPanel();
    expect(screen.getByText('Price behaviour vs random entries')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['1h', '4h', '1d']);
    expect(screen.getByRole('tab', { name: '4h' }).getAttribute('aria-selected')).toBe('true');
    expect(rowIds()).toEqual([
      'rsi14-up30',
      'rsi14-gt50',
      'rsi14-lt30',
      'rsi14-down70',
      'rsi14-gt70',
      'rsi7-few',
    ]);
    const first = screen.getAllByTestId('edge-row')[0];
    expect(within(first).getByText('+0.60%')).toBeTruthy();
    expect(within(first).getByText('Beat random')).toBeTruthy();
    expect(within(first).getAllByTestId('edge-regime').map((c) => c.textContent)).toEqual([
      'Uptrend+0.05%',
      'Downtrend−0.31%',
    ]);
    expect(
      screen.getByText('Past price behaviour on BTC, ETH and SOL — not financial advice.')
    ).toBeTruthy();
    const link = screen.getByRole('link', { name: /Full analysis/ });
    expect(link.getAttribute('href')).toBe('https://gainium.io/indicators/rsi#edge');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  test('switching the tab shows that timeframe', () => {
    renderPanel();
    fireEvent.mouseDown(screen.getByRole('tab', { name: '1h' }), { button: 0 });
    expect(rowIds()).toEqual(['rsi14-lt30', 'rsi14-gt70']);
    expect(screen.getByText('Worse than random')).toBeTruthy();
  });

  test('no Apply without a callback', () => {
    renderPanel({ indicatorType: IndicatorEnum.rsi });
    expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();
  });

  test('no Apply when the dialog is another indicator', () => {
    renderPanel({ onApplySetting: vi.fn(), indicatorType: IndicatorEnum.macd });
    expect(screen.queryByRole('button', { name: /^Apply/ })).toBeNull();
  });

  test('Apply only on rows with a bot config, and it hands over bot + timeframe', () => {
    const onApply = vi.fn();
    renderPanel({ onApplySetting: onApply, indicatorType: IndicatorEnum.rsi });
    const rows = screen.getAllByTestId('edge-row');
    const withApply = rows
      .filter((row) => within(row).queryByRole('button', { name: /^Apply/ }))
      .map((row) => row.dataset['setting']);
    // gt70 has no `bot`, the few-signals row has `bot: null`
    expect(withApply).toEqual(['rsi14-up30', 'rsi14-gt50', 'rsi14-lt30', 'rsi14-down70']);

    fireEvent.click(within(rows[0]).getByRole('button', { name: /^Apply/ }));
    expect(onApply).toHaveBeenCalledWith({ bot: rsiBot(14, 'cu', 30), tf: '4h' });
  });

  test('no Apply for a config with a field this catalog does not know', () => {
    const raw = rawEdge();
    raw.settings = raw.settings.filter((s) => s.tf === '4h');
    Object.assign(raw.settings[0], {
      bot: { type: 'RSI', params: { indicatorLength: 14, futureField: 1 } },
    });
    render(
      <MemoryRouter>
        <IndicatorEdgePanel
          edge={sanitizeIndicatorEdge(raw) as IndicatorEdge}
          slug="rsi"
          onApplySetting={vi.fn()}
          indicatorType={IndicatorEnum.rsi}
        />
      </MemoryRouter>
    );
    const row = screen
      .getAllByTestId('edge-row')
      .find((r) => r.dataset['setting'] === 'rsi14-lt30') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /^Apply/ })).toBeNull();
  });
});

// ─── Apply → params ──────────────────────────────────────────────────────────

describe('buildEdgeAppliedParams', () => {
  const definition = getIndicatorDefinition(IndicatorEnum.rsi);
  const current = {
    type: IndicatorEnum.rsi,
    indicatorAction: IndicatorAction.startDeal,
    uuid: 'u-1',
    groupId: 'g-1',
    indicatorLength: 21,
    indicatorValue: '55',
    indicatorCondition: IndicatorStartConditionEnum.bw,
    indicatorValue2: '60',
    indicatorInterval: ExchangeIntervals.fifteenM,
    percentile: true,
  } as unknown as IndicatorParamsState;

  test('catalog defaults + bot params + the tab interval, keeping the indicator identity', () => {
    const out = buildEdgeAppliedParams({
      definition,
      action: IndicatorAction.startDeal,
      current,
      request: { bot: rsiBot(14, 'lt', 30), tf: '4h' },
      exchange: ExchangeEnum.binance,
    }) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({
      type: IndicatorEnum.rsi,
      indicatorAction: IndicatorAction.startDeal,
      uuid: 'u-1',
      groupId: 'g-1',
      indicatorLength: 14,
      indicatorCondition: 'lt',
      indicatorValue: 30,
      indicatorInterval: ExchangeIntervals.fourH,
    });
    // what the user had set before is back to the catalog default
    expect(out['percentile']).not.toBe(true);
  });

  test("an interval the exchange does not offer keeps the dialog's interval", () => {
    const out = buildEdgeAppliedParams({
      definition,
      action: IndicatorAction.startDeal,
      current,
      request: { bot: rsiBot(14, 'lt', 30), tf: '4h' },
      exchange: ExchangeEnum.coinbase,
    });
    expect(out.indicatorInterval).toBe(ExchangeIntervals.fifteenM);
    expect(out.indicatorLength).toBe(14);
  });

  test('every interval field takes the tab: MA vs MA on 4h', () => {
    const ma = getIndicatorDefinition(IndicatorEnum.ma);
    const out = buildEdgeAppliedParams({
      definition: ma,
      action: IndicatorAction.startDeal,
      current: null,
      request: {
        bot: {
          type: 'MA',
          params: {
            maType: 'sma',
            indicatorLength: 50,
            indicatorCondition: 'cu',
            maCrossingValue: 'sma',
            maCrossingLength: 200,
          },
        },
        tf: '4h',
      },
      exchange: ExchangeEnum.binance,
    }) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({
      indicatorLength: 50,
      maCrossingLength: 200,
      indicatorInterval: ExchangeIntervals.fourH,
      maCrossingInterval: ExchangeIntervals.fourH,
    });
  });

  test('every interval field takes the tab: oscillator crossover on 1d', () => {
    const out = buildEdgeAppliedParams({
      definition: getIndicatorDefinition(IndicatorEnum.xo),
      action: IndicatorAction.startDeal,
      current: null,
      request: {
        bot: {
          type: 'XO',
          params: { xOscillator1: 'RSI', indicatorCondition: 'cu', xOscillator2: 'MFI' },
        },
        tf: '1d',
      },
      exchange: ExchangeEnum.binance,
    }) as unknown as Record<string, unknown>;
    expect(out['indicatorInterval']).toBe(ExchangeIntervals.oneD);
    expect(out['xOscillator2Interval']).toBe(ExchangeIntervals.oneD);
  });

  test("a favorite's saved settings never leak into the applied setting", () => {
    let out: Record<string, unknown> = {};
    withFavoritePreset(
      IndicatorEnum.rsi,
      { percentile: true, smoothing: 'sma', indicatorLength: 3 } as never,
      () => {
        out = buildEdgeAppliedParams({
          definition,
          action: IndicatorAction.startDeal,
          current: null,
          request: {
            bot: { type: 'RSI', params: { indicatorCondition: 'lt', indicatorValue: 30 } },
            tf: '1h',
          },
          exchange: ExchangeEnum.binance,
        }) as unknown as Record<string, unknown>;
      }
    );
    expect(out['percentile']).not.toBe(true);
    expect(out['smoothing']).not.toBe('sma');
    // RSI(7) is the catalog default length, so its config does not carry one
    expect(out['indicatorLength']).toBe(7);
  });

  test("an interval below the editor's shortest one keeps the current interval", () => {
    const out = buildEdgeAppliedParams({
      definition,
      action: IndicatorAction.startDeal,
      current,
      request: { bot: rsiBot(14, 'lt', 30), tf: '1h' },
      exchange: ExchangeEnum.binance,
      minIntervalMs: 4 * 60 * 60 * 1000,
    });
    expect(out.indicatorInterval).toBe(ExchangeIntervals.fifteenM);
  });
});

// ─── Every published bot config ──────────────────────────────────────────────

// `bot` blocks of every indicator page's edge data (tf, id, bot only)
const pages = realBots as Record<
  string,
  Array<{ tf: string; id: string; bot: unknown }>
>;
const asEdge = (settings: Array<{ tf: string; id: string; bot: unknown }>) =>
  sanitizeIndicatorEdge({
    ...rawEdge(),
    defaultTf: settings[0].tf,
    settings: settings.map((s) =>
      setting(s.id, s.tf, s.id, 'long', cell(0.1, 'none'), { bot: s.bot })
    ),
  });

describe('published bot configs', () => {
  test.each(Object.keys(pages))('%s: every config survives and applies exactly', (slug) => {
    const edge = asEdge(pages[slug]);
    expect(edge).toBeDefined();
    pages[slug].forEach((raw, i) => {
      const bot = edge?.settings[i].bot ?? null;
      expect(bot === null).toBe(raw.bot === null);
      if (!bot) return;
      expect(isApplicableEdgeBot(bot)).toBe(true);
      const definition = getIndicatorDefinition(bot.type as IndicatorEnum);
      const out = buildEdgeAppliedParams({
        definition,
        action: IndicatorAction.startDeal,
        current: null,
        request: { bot, tf: raw.tf },
        exchange: ExchangeEnum.binance,
      }) as unknown as Record<string, unknown>;
      expect(out).toMatchObject(bot.params);
      for (const field of [...definition.fields, ...(definition.advancedFields ?? [])]) {
        if (field.type === 'interval' && !field.multiple) {
          expect(out[field.key as string]).toBe(raw.tf);
        }
      }
    });
  });
});

// ─── Which tested setting the editor reproduces ──────────────────────────────

describe('matchEdgeSetting', () => {
  const match = (type: IndicatorEnum, slug: string, over: Record<string, unknown>) => {
    const definition = getIndicatorDefinition(type);
    const edge = asEdge(pages[slug]);
    if (!edge) throw new Error('fixture should be valid');
    return (
      matchEdgeSetting({
        definition,
        action: IndicatorAction.startDeal,
        params: {
          ...getIndicatorDefaultParams(type, IndicatorAction.startDeal),
          ...over,
        } as IndicatorParamsState,
        settings: edge.settings,
      })?.id ?? null
    );
  };
  const rsi = (over: Record<string, unknown>) => match(IndicatorEnum.rsi, 'rsi', over);
  const ma = (over: Record<string, unknown>) =>
    match(IndicatorEnum.ma, 'moving-averages', over);

  test('the catalog default fills what a config leaves out', () => {
    const below30 = { indicatorCondition: 'lt', indicatorValue: '30' };
    expect(rsi({ ...below30, indicatorLength: 7 })).toBe('rsi7-lt30');
    expect(rsi({ ...below30, indicatorLength: '14' })).toBe('rsi14-lt30');
    expect(rsi({ ...below30, indicatorLength: 21 })).toBeNull();
  });

  test('values compare as the editor shows them', () => {
    const above70 = { indicatorLength: 14, indicatorCondition: 'gt' };
    expect(rsi({ ...above70, indicatorValue: '70' })).toBe('rsi14-gt70');
    expect(rsi({ ...above70, indicatorValue: 70 })).toBe('rsi14-gt70');
    expect(rsi({ ...above70, indicatorValue: '71' })).toBeNull();
  });

  test('the interval has to be a tested timeframe', () => {
    const above70 = { indicatorLength: 14, indicatorCondition: 'gt', indicatorValue: 70 };
    expect(rsi({ ...above70, indicatorInterval: '4h' })).toBe('rsi14-gt70');
    expect(rsi({ ...above70, indicatorInterval: '15m' })).toBeNull();
  });

  test('a modifier the test did not use breaks the match', () => {
    expect(
      rsi({ indicatorLength: 14, indicatorCondition: 'gt', indicatorValue: 70, smoothing: 'ema' })
    ).toBeNull();
  });

  test('a second MA has to be on the same interval', () => {
    const golden = {
      maType: 'sma',
      indicatorLength: 50,
      indicatorCondition: 'cu',
      maCrossingValue: 'sma',
      maCrossingLength: 200,
      indicatorInterval: '4h',
    };
    expect(ma({ ...golden, maCrossingInterval: '4h' })).toBe('sma50-up-sma200');
    expect(ma({ ...golden, maCrossingInterval: '1h' })).toBeNull();
  });

  test('a hidden second interval does not count', () => {
    expect(
      ma({
        indicatorCondition: 'cd',
        maCrossingValue: 'price',
        indicatorInterval: '4h',
        maCrossingInterval: '1h',
      })
    ).toBe('ema20-down-price');
  });
});

// ─── The side a condition trades ─────────────────────────────────────────────

describe('reading a result from the side the condition trades', () => {
  test('mirroring negates the edge and flips the luck band', () => {
    const out = mirrorEdgeCell({
      entries: 10,
      episodes: 5,
      edge: -0.36,
      chance: [-0.2, 0.19],
      verdict: 'worse',
    });
    expect(out.edge).toBe(0.36);
    expect(out.chance).toEqual([-0.19, 0.2]);
    expect(out.verdict).toBe('edge');
    expect(out.entries).toBe(10);
    expect(Object.is(mirrorEdgeCell({ ...out, edge: 0 }).edge, -0)).toBe(false);
  });

  test.each([
    ['edge', 'worse'],
    ['worse', 'edge'],
    ['fragile', 'fragile-worse'],
    ['fragile-worse', 'fragile'],
    ['none', 'none'],
    ['few', 'few'],
  ] as const)('verdict %s reads as %s from the other side', (from, to) => {
    expect(
      mirrorEdgeCell({ entries: 1, episodes: 1, edge: 0.1, chance: [0, 0.2], verdict: from })
        .verdict
    ).toBe(to);
  });

  test('a mirrored setting shows the bot side, its trend cells mirrored, and says so', () => {
    const tested = edge().settings.find((s) => s.tf === '1h' && s.id === 'rsi14-gt70');
    if (!tested) throw new Error('fixture');
    const view = edgeSettingForSide(tested, 'long');
    expect(view.side).toBe('long');
    expect(view.testedSide).toBe('short');
    expect(view.pooled.verdict).toBe('edge');
    expect(view.regimes?.down.verdict).toBe('edge');
    expect(view.regimes?.down.edge).toBe(0.31);
    expect(view.bot).toEqual(tested.bot);
    expect(edgeSideNote(view)).toBe(
      'Tested on short entries; shown for your long bot.'
    );
    expect(edgeSettingForSide(tested, 'short')).toBe(tested);
    expect(edgeSettingForSide(tested, null)).toBe(tested);
    expect(edgeSideNote(tested)).toBeNull();
  });

  test('entries trade the bot side, exits the opposite, others are unknown', () => {
    const { startDeal, startDca, closeDeal, startBot, stopBot, riskReward } = IndicatorAction;
    expect(edgeSideForCondition(startDeal, StrategyEnum.long)).toBe('long');
    expect(edgeSideForCondition(startDca, StrategyEnum.short)).toBe('short');
    expect(edgeSideForCondition(closeDeal, StrategyEnum.long)).toBe('short');
    expect(edgeSideForCondition(closeDeal, StrategyEnum.short)).toBe('long');
    for (const action of [startBot, stopBot, riskReward]) {
      expect(edgeSideForCondition(action, StrategyEnum.long)).toBeNull();
    }
    expect(edgeSideForCondition(startDeal, undefined)).toBeNull();
  });
});

// ─── In the bot form's indicator editors ─────────────────────────────────────

describe('indicator editors', () => {
  const indicatorMeta = {
    slug: 'rsi',
    name: 'Relative Strength Index (RSI)',
    kind: 'native',
    aliases: [],
    category: 'momentum',
    description: '',
    tldr: '',
    catalogKeys: ['rsi'],
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  let routes: Record<string, unknown>;
  let requested: string[];

  beforeEach(() => {
    resetIndicatorEdgeCache();
    requested = [];
    routes = {
      '/indicators': {
        data: [indicatorMeta],
        pagination: { total: 1, page: 1, limit: 100, totalPages: 1, hasNext: false, hasPrev: false },
      },
      '/help': {
        data: [],
        pagination: { total: 0, page: 1, limit: 100, totalPages: 1, hasNext: false, hasPrev: false },
      },
      '/indicators/rsi': { metadata: indicatorMeta, content: 'RSI body', edge: rawEdge() },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const { pathname } = new URL(input, 'http://dashboard.local');
        requested.push(pathname);
        const body = routes[pathname];
        if (body === 'fail') return new Response('boom', { status: 500 });
        return body === undefined
          ? new Response('Not found', { status: 404 })
          : new Response(JSON.stringify(body), { status: 200 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  const rsiDefaults = () =>
    getIndicatorDefaultParams(IndicatorEnum.rsi, IndicatorAction.startDeal);
  const rsiParams = (over: Record<string, unknown>) =>
    ({ ...rsiDefaults(), ...over }) as IndicatorParamsState;

  test('the badge shows the tested verdict and follows each edit', async () => {
    const definition = getIndicatorDefinition(IndicatorEnum.rsi);
    const above70 = {
      indicatorLength: 14,
      indicatorInterval: '1h',
      indicatorCondition: 'gt',
      indicatorValue: '70',
    };
    const view = (over: Record<string, unknown>) => (
      <IndicatorEdgeMatchBadge
        definition={definition}
        params={rsiParams(over)}
        action={IndicatorAction.startDeal}
      />
    );
    const { rerender } = render(view(above70));

    const badge = await screen.findByTestId('edge-match');
    expect(badge.dataset['setting']).toBe('rsi14-gt70');
    expect(within(badge).getByText('Worse than random')).toBeTruthy();
    expect(within(badge).getAllByTestId('edge-regime')).toHaveLength(2);

    rerender(view({ ...above70, indicatorValue: '71' }));
    expect(screen.queryByTestId('edge-match')).toBeNull();

    rerender(
      view({ ...above70, indicatorInterval: '4h', indicatorCondition: 'lt', indicatorValue: 30 })
    );
    expect(screen.getByTestId('edge-match').dataset['setting']).toBe('rsi14-lt30');
    expect(screen.getByText('Same as random')).toBeTruthy();

    rerender(view({ ...above70, indicatorInterval: '15m' }));
    expect(screen.queryByTestId('edge-match')).toBeNull();
  });

  test.each([
    ['a long bot entry', IndicatorAction.startDeal, StrategyEnum.long, 'Beat random'],
    ['a short bot entry', IndicatorAction.startDeal, StrategyEnum.short, 'Worse than random'],
    ['a long bot exit', IndicatorAction.closeDeal, StrategyEnum.long, 'Worse than random'],
    ['an unknown side', IndicatorAction.startDeal, undefined, 'Worse than random'],
  ])('RSI(14) above 70 (tested short) reads for %s', async (_name, action, strategy, text) => {
    render(
      <IndicatorEdgeMatchBadge
        definition={getIndicatorDefinition(IndicatorEnum.rsi)}
        params={rsiParams({
          indicatorLength: 14,
          indicatorInterval: '1h',
          indicatorCondition: 'gt',
          indicatorValue: 70,
        })}
        action={action}
        side={edgeSideForCondition(action, strategy)}
      />
    );
    const badge = await screen.findByTestId('edge-match');
    expect(within(badge).getByText(text)).toBeTruthy();
  });

  test('the tested settings read for the bot side: values, labels, chips and order', () => {
    render(
      <MemoryRouter>
        <IndicatorEdgePanel edge={edge()} slug="rsi" side="long" initialTf="1h" />
      </MemoryRouter>
    );
    // rsi14-gt70 was worse as a short: as a long it leads the list as an edge
    expect(rowIds()).toEqual(['rsi14-gt70', 'rsi14-lt30']);
    const first = screen.getAllByTestId('edge-row')[0];
    expect(within(first).getByText('+0.40%')).toBeTruthy();
    expect(within(first).getByText('Beat random')).toBeTruthy();
    expect(within(first).getByText(/· Long/)).toBeTruthy();
    expect(within(first).getAllByTestId('edge-regime').map((c) => c.textContent)).toEqual([
      'Uptrend−0.05%',
      'Downtrend+0.31%',
    ]);
  });

  test('one request per indicator page, however many editors read it', async () => {
    const definition = getIndicatorDefinition(IndicatorEnum.rsi);
    const params = rsiParams({ indicatorLength: 14, indicatorCondition: 'gt', indicatorValue: 70 });
    render(
      <>
        {[1, 2, 3].map((i) => (
          <IndicatorEdgeMatchBadge
            key={i}
            definition={definition}
            params={params}
            action={IndicatorAction.startDeal}
          />
        ))}
      </>
    );
    await waitFor(() => expect(screen.getAllByTestId('edge-match')).toHaveLength(3));
    expect(requested.filter((p) => p === '/indicators/rsi')).toHaveLength(1);
  });

  // The bot form edits indicators inline in IndicatorList rows.
  const rsiRow = {
    type: IndicatorEnum.rsi,
    uuid: 'rsi-1',
    groupId: 'g-1',
    indicatorLength: 7,
    indicatorInterval: ExchangeIntervals.oneH,
    indicatorCondition: IndicatorStartConditionEnum.cd,
    indicatorValue: '70',
  } as unknown as IndicatorParamsState;

  const openRow = (
    onApplyEdgeSetting?: React.ComponentProps<typeof IndicatorList>['onApplyEdgeSetting']
  ) => {
    render(
      <MemoryRouter>
        <IndicatorList
          indicators={[rsiRow]}
          renderExtras={() => <div>inline editor</div>}
          {...(onApplyEdgeSetting ? { onApplyEdgeSetting } : {})}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
  };

  test('Tested settings: Apply hands the setting back to that indicator and closes', async () => {
    const onApply = vi.fn();
    openRow(onApply);
    fireEvent.click(await screen.findByRole('button', { name: 'Price behaviour' }));
    const panel = await screen.findByTestId('indicator-edge-panel');
    // opens on the editor's interval (1h), not the data's default (4h)
    expect(within(panel).getByRole('tab', { name: '1h' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    fireEvent.mouseDown(within(panel).getByRole('tab', { name: '4h' }), { button: 0 });
    const row = within(panel)
      .getAllByTestId('edge-row')
      .find((r) => r.dataset['setting'] === 'rsi14-up30') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^Apply/ }));

    expect(onApply).toHaveBeenCalledWith(rsiRow, {
      bot: rsiBot(14, 'cu', 30),
      tf: '4h',
    });
    await waitFor(() => expect(screen.queryByTestId('indicator-edge-panel')).toBeNull());
  });

  test.each([
    ['a page without edge data', () => ({ metadata: indicatorMeta, content: 'RSI body' })],
    ['a missing page', () => undefined],
    ['a failing request', () => 'fail'],
  ])('no Tested settings for %s', async (_name, body) => {
    routes['/indicators/rsi'] = body();
    openRow(vi.fn());
    await waitFor(() => expect(requested).toContain('/indicators/rsi'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('button', { name: 'Price behaviour' })).toBeNull();
    expect(screen.getByText('inline editor')).toBeTruthy();
  });

  test('no Tested settings when the list cannot apply', async () => {
    openRow();
    await waitFor(() => expect(screen.getByText('inline editor')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('button', { name: 'Price behaviour' })).toBeNull();
  });

  test('the help article shows the panel without Apply', async () => {
    render(
      <MemoryRouter>
        <HelpArticleModal slug="rsi" onClose={() => undefined} />
      </MemoryRouter>
    );
    const panel = await screen.findByTestId('indicator-edge-panel');
    expect(within(panel).getAllByTestId('edge-row').length).toBeGreaterThan(0);
    expect(within(panel).queryByRole('button', { name: /^Apply/ })).toBeNull();
  });

  test('the dialog: Apply from Tested settings fills the fields and the badge follows', async () => {
    const onSubmit = vi.fn();
    render(
      <MemoryRouter>
        <IndicatorConfigurationModal
          open
          onOpenChange={() => undefined}
          definition={getIndicatorDefinition(IndicatorEnum.rsi)}
          initialParams={
            {
              type: IndicatorEnum.rsi,
              indicatorLength: 21,
              indicatorInterval: ExchangeIntervals.fifteenM,
            } as unknown as IndicatorParamsState
          }
          onSubmit={onSubmit}
          action={IndicatorAction.startDeal}
          exchange={ExchangeEnum.binance}
        />
      </MemoryRouter>
    );

    expect((screen.getByLabelText('Length') as HTMLInputElement).value).toBe('21');
    expect(screen.queryByTestId('edge-match')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Price behaviour' }));
    const panel = await screen.findByTestId('indicator-edge-panel');
    const row = within(panel)
      .getAllByTestId('edge-row')
      .find((r) => r.dataset['setting'] === 'rsi14-up30') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^Apply/ }));

    await waitFor(() => expect(screen.queryByTestId('indicator-edge-panel')).toBeNull());
    expect((screen.getByLabelText('Length') as HTMLInputElement).value).toBe('14');
    expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe('30');
    const badge = screen.getByTestId('edge-match');
    expect(badge.dataset['setting']).toBe('rsi14-up30');
    expect(within(badge).getByText('Beat random')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save indicator' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        indicatorLength: 14,
        indicatorCondition: 'cu',
        indicatorValue: 30,
        indicatorInterval: ExchangeIntervals.fourH,
      })
    );
  });
});
