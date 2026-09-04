---
name: new-indicator-integration-main-dash-sh
description: This repo's slice of adding a brand-new indicator to Gainium — the TradingView chart study, the declarative indicator catalog that renders bot-settings UI automatically, and where a Pine Script's drawing-primitive limits actually bite. Use when scoping or implementing a new-indicator PR in main-dash-sh.
---

# New indicator integration — main-dash-sh's part

Canonical source: `new-indicator-integration` in Gainium's internal
`skills` repo (private — this file is a scoped copy synced from there; edit
the source, not this copy, if it needs updating).

## Global objective

Gainium's indicator math is written once in `@gainium/indicators` and
consumed four times. This repo is the dashboard's core: it draws the
indicator on the chart and renders the bot-settings UI a user configures
it with. **All indicator code for the current dashboard lives here** — the
outer `main-dash-redesign` repo has none of its own.

## This repo's part

| File | What to add |
|---|---|
| `src/types/index.ts` | `IndicatorEnum` entry + supporting enums + optional fields on the chart indicator config type |
| `src/utils/tradingView/customIndicators.js` | the TradingView study (`export const <Name> = (r, callback) => ({ metainfo, plots, inputs, constructor })`), added to the `loadCustomIndicators()` array |
| `src/components/widgets/shared/TradingViewChart/indicatorStudyConfig.ts` | `STUDY_NAME_MAP` entry + a `buildInputs()` case mapping stored config → study inputs |
| `src/types/indicators/indicatorCatalog.ts` | the big one — `INDICATOR_CATALOG[IndicatorEnum.<x>]`: `label`, `category`, `description`, `supportedActions`, `fields: [...]` (built with `makeNumberField`/`makeSelectField`/`makeIntervalField` — these render the bot-settings UI automatically). Also `INDICATOR_DOCUMENTATION_URLS`, and `BOT_CONTROLLER_EXCLUSIONS` if it's a filter that shouldn't appear there. |

**`customIndicators.js` is where a Pine Script's drawing limits actually
bite.** This chart study is a from-scratch re-implementation of the
algorithm in TradingView's own `r.Std.*` primitives — it does not import
`@gainium/indicators`. It can express `plot`/`line` series and a
`bg_colorer` (see how Long Wick plots two level lines, and Session uses a
background colorer). It **cannot** express arbitrary Pine Script v5
drawing objects (`label.new`, `box.new`, drawing-primitive `line.new`,
`polyline.new`, `table.new`). If whoever scoped this integration flagged a
"Go-with-gaps" verdict for the chart visual, this is the file where that
gap becomes concrete — build the closest `plot`/`line`/`bg_colorer`
approximation you can, and don't silently claim a faithful port in the PR
description if it isn't one.

Backtesting on the dashboard "just works" once the indicator is in
`customIndicators.js` + the `@gainium/backtester` bump lands — no separate
client wiring needed for that part.

## Sister repos

All public, same repo family as this one:

- **indicators** — the source-of-truth math this repo's chart study
  independently re-implements in TradingView primitives; keep the two in
  sync by hand, there's no shared import.
- **backtester** — the client-side backtest engine this repo bundles;
  needs the version that added this indicator before its catalog entry's
  backtesting can actually run.
- **app-sh** — the GraphQL schema this repo's dashboard build consumes;
  its enum must match what this repo declares.
- **content** — the help doc `INDICATOR_DOCUMENTATION_URLS` links to;
  confirm the slug matches before merging, a broken help link is a common
  launch-day miss.

Gainium's main-dash-redesign outer app (bumps this repo as `core/`, ships
as part of the self-hosted bundle too) picks up everything here with a
pointer bump — no indicator-specific code on its side.
