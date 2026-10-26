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
import {
  ExchangeEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorStartConditionEnum,
} from '@/types';
import type { IndicatorEdge } from '@/types/helpCenter';
import { getIndicatorDefinition } from '@/types/indicators/indicatorLogic';
import type { IndicatorParamsState } from '@/types/indicators/indicatorParams';
import {
  edgeRowsFor,
  edgeTimeframes,
  sanitizeIndicatorEdge,
} from '@/utils/indicatorEdge';
import {
  buildEdgeAppliedParams,
  isApplicableEdgeBot,
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
    expect(within(first).getByText('Likely edge')).toBeTruthy();
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

describe('published bot configs', () => {
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

// ─── From the indicator editors ──────────────────────────────────────────────

describe('Apply from the help article', () => {
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

  beforeEach(() => {
    const routes: Record<string, unknown> = {
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
        const body = routes[new URL(input, 'http://dashboard.local').pathname];
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

  test('fills the setting into the dialog and closes the article', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: /Relative Strength Index|Rsi/ }));
    const panel = await screen.findByTestId('indicator-edge-panel');
    const row = within(panel)
      .getAllByTestId('edge-row')
      .find((r) => r.dataset['setting'] === 'rsi14-up30') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^Apply/ }));

    await waitFor(() => expect(screen.queryByTestId('indicator-edge-panel')).toBeNull());
    expect((screen.getByLabelText('Length') as HTMLInputElement).value).toBe('14');
    expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe('30');

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

  // The bot form edits indicators inline in IndicatorList rows; the row's
  // help pill opens the article and Apply goes back to that indicator.
  const rsiRow = {
    type: IndicatorEnum.rsi,
    uuid: 'rsi-1',
    groupId: 'g-1',
    indicatorLength: 7,
    indicatorInterval: ExchangeIntervals.oneH,
    indicatorCondition: IndicatorStartConditionEnum.cd,
    indicatorValue: '70',
  } as unknown as IndicatorParamsState;

  const openRowArticle = async (
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
    fireEvent.click(await screen.findByRole('button', { name: /Relative Strength Index|Rsi/ }));
    return screen.findByTestId('indicator-edge-panel');
  };

  test('an inline editor row hands Apply back with its indicator', async () => {
    const onApply = vi.fn();
    const panel = await openRowArticle(onApply);
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

  test('a list without the callback shows the panel without Apply', async () => {
    const panel = await openRowArticle();
    expect(within(panel).getAllByTestId('edge-row').length).toBeGreaterThan(0);
    expect(within(panel).queryByRole('button', { name: /^Apply/ })).toBeNull();
  });
});
