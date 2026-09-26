import type { ComponentType, ReactElement } from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import { BotViewRedirect } from '../../../components/routing/BotViewRedirect';
import {
  lazyNamed,
  lazyPage,
  PageSuspense,
  registerRoutePreload,
  type PageComponent,
} from '../../../lib/lazyPage';

// Pages are route-level lazy chunks (see lib/lazyPage).
const TradingBots = lazyPage(() => import('../../../pages/TradingBots'), {
  prefetch: true,
});
const TradingBotNew = lazyPage(
  () => import('../../../pages/bots/TradingBotNew')
);
const TradingBotEdit = lazyPage(
  () => import('../../../pages/bots/TradingBotEdit')
);
const ComboBots = lazyPage(() => import('../../../pages/ComboBots'));
const ComboBotNew = lazyPage(() => import('../../../pages/bots/ComboBotNew'));
const ComboBotEdit = lazyPage(() => import('../../../pages/bots/ComboBotEdit'));
const GridBots = lazyPage(() => import('../../../pages/GridBots'));
const GridBotNew = lazyPage(() => import('../../../pages/bots/GridBotNew'));
const GridBotEdit = lazyPage(() => import('../../../pages/bots/GridBotEdit'));
const HedgeDcaBots = lazyPage(
  () => import('../../../pages/hedge-bots/HedgeDcaBots')
);
const HedgeDcaBotNew = lazyPage(
  () => import('../../../pages/hedge-bots/HedgeDcaBotNew')
);
const HedgeDcaBotEdit = lazyPage(
  () => import('../../../pages/hedge-bots/HedgeDcaBotEdit')
);
const HedgeComboBots = lazyPage(
  () => import('../../../pages/hedge-bots/HedgeComboBots')
);
const HedgeComboBotNew = lazyPage(
  () => import('../../../pages/hedge-bots/HedgeComboBotNew')
);
const HedgeComboBotEdit = lazyPage(
  () => import('../../../pages/hedge-bots/HedgeComboBotEdit')
);
const loadBotBacktests = () => import('../../../pages/bots/BotBacktests');
const TradingBotBacktests = lazyNamed(loadBotBacktests, 'TradingBotBacktests');
const ComboBotBacktests = lazyNamed(loadBotBacktests, 'ComboBotBacktests');
const GridBotBacktests = lazyNamed(loadBotBacktests, 'GridBotBacktests');
const BacktestsRoute = lazyNamed(loadBotBacktests, 'BacktestsRoute');
const loadHedgeBacktests = () =>
  import('../../../pages/hedge-bots/HedgeBotBacktests');
const HedgeDcaBotBacktests = lazyNamed(
  loadHedgeBacktests,
  'HedgeDcaBotBacktests'
);
const HedgeComboBotBacktests = lazyNamed(
  loadHedgeBacktests,
  'HedgeComboBotBacktests'
);

/**
 * Descriptor for one bot type's route family. The common per-type route
 * shape (list / new / edit / drawer-view / optional shared-backtest landing /
 * legacy `:id` redirect) is identical across all five bot types and is
 * generated from this descriptor by {@link botRoutes}.
 */
export interface BotRouteSpec {
  /** URL prefix, no trailing slash: '/bot', '/combo', '/grid', '/hedge/bot', '/hedge/combo'. */
  basePath: string;
  /** Rendered by `{base}` and `{base}/view/:id` (the drawer route). */
  listPage: ComponentType;
  /**
   * Rendered by `{base}/new`, and by `{base}/backtests` when the URL carries
   * `?backtestShare=` (the shared-backtest viewer).
   */
  newPage: ComponentType;
  /** Rendered by `{base}/edit/:id`. */
  editPage: ComponentType;
  /**
   * Backtests list rendered by `{base}/backtests` (no share param).
   */
  backtestsPage?: ComponentType;
}

/**
 * Single source of truth for the common bot route families. Order matches
 * the historical hand-written route tables (dca, combo, grid, hedgeDca,
 * hedgeCombo); order is cosmetic under react-router v6/v7 ranking, but kept
 * for reviewability.
 */
export const BOT_ROUTE_SPECS: readonly BotRouteSpec[] = [
  {
    basePath: '/bot',
    listPage: TradingBots,
    newPage: TradingBotNew,
    editPage: TradingBotEdit,
    backtestsPage: TradingBotBacktests,
  },
  {
    basePath: '/combo',
    listPage: ComboBots,
    newPage: ComboBotNew,
    editPage: ComboBotEdit,
    backtestsPage: ComboBotBacktests,
  },
  {
    basePath: '/grid',
    listPage: GridBots,
    newPage: GridBotNew,
    editPage: GridBotEdit,
    backtestsPage: GridBotBacktests,
  },
  {
    basePath: '/hedge/bot',
    listPage: HedgeDcaBots,
    newPage: HedgeDcaBotNew,
    editPage: HedgeDcaBotEdit,
    backtestsPage: HedgeDcaBotBacktests,
  },
  {
    basePath: '/hedge/combo',
    listPage: HedgeComboBots,
    newPage: HedgeComboBotNew,
    editPage: HedgeComboBotEdit,
    backtestsPage: HedgeComboBotBacktests,
  },
] as const;

// Boot-time preload of the page for the URL being opened (see preloadRoute).
const esc = (p: string) => p.replace(/\//g, '\\/');
for (const spec of BOT_ROUTE_SPECS) {
  const b = esc(spec.basePath);
  const pre = (c: unknown) => (c as Partial<PageComponent<object>>).preload;
  const list = pre(spec.listPage);
  const create = pre(spec.newPage);
  const edit = pre(spec.editPage);
  if (list) registerRoutePreload(new RegExp(`^${b}(/view/[^/]+)?/?$`), list);
  if (create) registerRoutePreload(new RegExp(`^${b}/new/?$`), create);
  if (edit) registerRoutePreload(new RegExp(`^${b}/edit/[^/]+/?$`), edit);
}

/**
 * Emit the common `<Route>` elements for one bot type, in the same order the
 * hand-written tables used: base → new → edit → drawer-view →
 * (optional) shared-backtest landing → legacy `:id` redirect.
 *
 * Note the asymmetry preserved here: base and view render the LIST page; new
 * (and a `?backtestShare=` backtests link) render the NEW page; edit renders
 * the EDIT page.
 */
function botTypeRoutes(spec: BotRouteSpec): ReactElement[] {
  const {
    basePath,
    listPage: List,
    newPage: New,
    editPage: Edit,
    backtestsPage,
  } = spec;
  const routes: ReactElement[] = [
    <Route
      key={basePath}
      path={basePath}
      element={
        <ProtectedRoute>
          <PageSuspense>
            <List />
          </PageSuspense>
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${basePath}/new`}
      path={`${basePath}/new`}
      element={
        <ProtectedRoute>
          <PageSuspense>
            <New />
          </PageSuspense>
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${basePath}/edit/:id`}
      path={`${basePath}/edit/:id`}
      element={
        <ProtectedRoute>
          <PageSuspense>
            <Edit />
          </PageSuspense>
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${basePath}/view/:id`}
      path={`${basePath}/view/:id`}
      element={
        <ProtectedRoute>
          <PageSuspense>
            <List />
          </PageSuspense>
        </ProtectedRoute>
      }
    />,
  ];

  if (backtestsPage) {
    routes.push(
      <Route
        key={`${basePath}/backtests`}
        path={`${basePath}/backtests`}
        element={
          <ProtectedRoute>
            <PageSuspense>
              <BacktestsRoute newPage={New} listPage={backtestsPage} />
            </PageSuspense>
          </ProtectedRoute>
        }
      />
    );
  }

  routes.push(
    <Route
      key={`${basePath}/:id`}
      path={`${basePath}/:id`}
      element={<BotViewRedirect basePath={basePath} />}
    />
  );

  return routes;
}

/**
 * All common per-type bot routes for all five bot types, in table order.
 * Consume inside `<Routes>` as a bare expression: `{botRoutes()}`. It returns
 * a flat array of `<Route>` elements (each with a stable key) — the only form
 * `<Routes>` walks; a Fragment or wrapper component would be silently ignored.
 */
export function botRoutes(): ReactElement[] {
  return BOT_ROUTE_SPECS.flatMap(botTypeRoutes);
}

/**
 * Path prefixes whose pages self-report analytics pageviews (view + edit
 * only). Intentionally an explicit list — base/new/backtests/`:id` must NOT
 * appear, or the general `analyticsPageview()` for list pages would be
 * suppressed.
 */
const ANALYTICS_SKIP_PREFIXES = [
  '/bot/view/',
  '/bot/edit/',
  '/grid/view/',
  '/grid/edit/',
  '/combo/view/',
  '/combo/edit/',
  '/hedge/bot/view/',
  '/hedge/bot/edit/',
  '/hedge/combo/view/',
  '/hedge/combo/edit/',
];

/** True when pathname is a bot view/edit page that tracks its own pageview. */
export function isBotPath(pathname: string): boolean {
  return ANALYTICS_SKIP_PREFIXES.some((p) => pathname.startsWith(p));
}
