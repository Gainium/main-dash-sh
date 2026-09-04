# main-dash-sh — new exchange runbook

Canonical source: `new-exchange-integration` (private `skills` repo). This
is a scoped excerpt — see [SKILL.md](SKILL.md) for the narrative version.

## Where this sits

Repo **6 of the public pipeline** (exchange-connector-sh →
websocket-connector-sh → app-sh → paper-trading-sh → backtester →
**main-dash-sh** → content → docker-sh). Depends on `app-sh`'s GraphQL
schema (this repo's dashboard build consumes it) and `backtester`'s
`ExchangeEnum` bump (needed before the dashboard's backtest wrapper code
can drop its placeholder type errors). `content`'s connect guide should
exist, or link, before this repo's connect dialog ships pointing at it.

## Checklist

```
[ ] src/types/exchange.types.ts   (ExchangeEnum, incl. *All/*Spot selection ids)
[ ] exchange config/entitlements  (ExchangeProviderConfig per variant)
[ ] connect forms/dialogs         (only if non-standard fee/auth/entitlement model)
[ ] CHANGELOG + version bump
```

## Verify before calling it done

- The add-exchange dialog for this exchange actually renders and submits
  correctly in a local dashboard build — this is UI-facing work, a type
  check passing isn't the same as it working.
- The config entry's `category`/`supportsPaperTrading`/`supportsKeyTypes`
  fields accurately reflect what the connector actually supports — check
  against `exchange-connector-sh`'s adapter capabilities, don't guess.
- The connect dialog's link to `content`'s guide resolves (not a dead link).
