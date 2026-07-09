import type { ComponentType, ReactElement } from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import { BotViewRedirect } from '../../../components/routing/BotViewRedirect';
import TradingBots from '../../../pages/TradingBots';
import TradingBotNew from '../../../pages/bots/TradingBotNew';
import TradingBotEdit from '../../../pages/bots/TradingBotEdit';
import ComboBots from '../../../pages/ComboBots';
import ComboBotNew from '../../../pages/bots/ComboBotNew';
import ComboBotEdit from '../../../pages/bots/ComboBotEdit';
import GridBots from '../../../pages/GridBots';
import GridBotNew from '../../../pages/bots/GridBotNew';
import GridBotEdit from '../../../pages/bots/GridBotEdit';
import HedgeDcaBots from '../../../pages/hedge-bots/HedgeDcaBots';
import HedgeDcaBotNew from '../../../pages/hedge-bots/HedgeDcaBotNew';
import HedgeDcaBotEdit from '../../../pages/hedge-bots/HedgeDcaBotEdit';
import HedgeComboBots from '../../../pages/hedge-bots/HedgeComboBots';
import HedgeComboBotNew from '../../../pages/hedge-bots/HedgeComboBotNew';
import HedgeComboBotEdit from '../../../pages/hedge-bots/HedgeComboBotEdit';

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
  /** Rendered by `{base}/new` and, when hasBacktests, `{base}/backtests`. */
  newPage: ComponentType;
  /** Rendered by `{base}/edit/:id`. */
  editPage: ComponentType;
  /** dca/combo/grid → true; hedge types → false. */
  hasBacktests: boolean;
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
    hasBacktests: true,
  },
  {
    basePath: '/combo',
    listPage: ComboBots,
    newPage: ComboBotNew,
    editPage: ComboBotEdit,
    hasBacktests: true,
  },
  {
    basePath: '/grid',
    listPage: GridBots,
    newPage: GridBotNew,
    editPage: GridBotEdit,
    hasBacktests: true,
  },
  {
    basePath: '/hedge/bot',
    listPage: HedgeDcaBots,
    newPage: HedgeDcaBotNew,
    editPage: HedgeDcaBotEdit,
    hasBacktests: false,
  },
  {
    basePath: '/hedge/combo',
    listPage: HedgeComboBots,
    newPage: HedgeComboBotNew,
    editPage: HedgeComboBotEdit,
    hasBacktests: false,
  },
] as const;

/**
 * Emit the common `<Route>` elements for one bot type, in the same order the
 * hand-written tables used: base → new → edit → drawer-view →
 * (optional) shared-backtest landing → legacy `:id` redirect.
 *
 * Note the asymmetry preserved here: base and view render the LIST page; new
 * and backtests render the NEW page; edit renders the EDIT page.
 */
function botTypeRoutes(spec: BotRouteSpec): ReactElement[] {
  const { basePath, listPage: List, newPage: New, editPage: Edit, hasBacktests } = spec;
  const routes: ReactElement[] = [
    <Route
      key={basePath}
      path={basePath}
      element={
        <ProtectedRoute>
          <List />
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${basePath}/new`}
      path={`${basePath}/new`}
      element={
        <ProtectedRoute>
          <New />
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${basePath}/edit/:id`}
      path={`${basePath}/edit/:id`}
      element={
        <ProtectedRoute>
          <Edit />
        </ProtectedRoute>
      }
    />,
    <Route
      key={`${basePath}/view/:id`}
      path={`${basePath}/view/:id`}
      element={
        <ProtectedRoute>
          <List />
        </ProtectedRoute>
      }
    />,
  ];

  if (hasBacktests) {
    routes.push(
      <Route
        key={`${basePath}/backtests`}
        path={`${basePath}/backtests`}
        element={
          <ProtectedRoute>
            <New />
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
