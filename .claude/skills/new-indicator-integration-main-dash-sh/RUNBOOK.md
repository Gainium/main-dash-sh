# main-dash-sh — new indicator runbook

Canonical source: `new-indicator-integration` (private `skills` repo). This
is a scoped excerpt — see [SKILL.md](SKILL.md) and the global
`new-indicator-integration` skill's `RUNBOOK.md` for the full order.

## Where this sits

**Step 5.** Depends on `indicators` (step 1, for the algorithm to
re-implement as a chart study) and `backtester` (step 2, for client-side
backtesting to work through the catalog entry). Unlocks `main-dash-redesign`
(step 6, a pure pointer bump) and `content` (step 7, needs the help-URL
slug this repo's catalog entry declares).

## Checklist

```
[ ] src/types/index.ts               (IndicatorEnum + supporting enums + config type fields)
[ ] src/utils/tradingView/customIndicators.js   (TradingView study, registered in loadCustomIndicators())
[ ] TradingViewChart/indicatorStudyConfig.ts    (STUDY_NAME_MAP + buildInputs() case)
[ ] src/types/indicators/indicatorCatalog.ts    (INDICATOR_CATALOG entry with fields, INDICATOR_DOCUMENTATION_URLS, BOT_CONTROLLER_EXCLUSIONS if a filter)
[ ] CHANGELOG + version bump
```

## Verify before calling it done

- Add the indicator to a bot through the real bot-settings UI in a local
  build — the catalog's `fields` array should render correctly with no
  hand-written JSX needed; if it doesn't render as expected, the field
  builder call is probably wrong, not missing UI code.
- The chart study actually draws — open a chart, add the indicator, and
  compare visually against the source Pine Script (or reference
  implementation) if one exists. If Step 0 flagged a drawing-primitive gap,
  confirm the approximation is reasonable, not confirm it's identical (it
  won't be).
- Run a backtest for a bot using this indicator from the dashboard and
  compare its result to the same backtest run server-side (via `app`) —
  they must match exactly.
- Click the help link; confirm it resolves to a real page in `content`
  (may not exist yet if `content`'s step hasn't landed — track it, don't
  ship a permanently-dead link).
