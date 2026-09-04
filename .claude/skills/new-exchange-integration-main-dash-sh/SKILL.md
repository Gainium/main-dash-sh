---
name: new-exchange-integration-main-dash-sh
description: This repo's slice of adding a brand-new exchange to Gainium — the dashboard core's ExchangeEnum, exchange config/entitlements, and connect forms. Use when scoping or implementing a new-exchange PR in main-dash-sh.
---

# New exchange integration — main-dash-sh's part

Canonical source: `new-exchange-integration` in Gainium's internal `skills`
repo (private — this file is a scoped copy synced from there; edit the
source, not this copy, if it needs updating).

## Global objective

Gainium supports trading on multiple exchanges through a common internal
`Exchange` interface — one adapter per exchange (in `exchange-connector-sh`)
so the rest of the platform never has to know which exchange it's talking
to. This repo is the dashboard's core: it defines what a user sees and can
configure when adding this exchange.

## This repo's part

- **`src/types/exchange.types.ts`** — add the `ExchangeEnum` members (this
  repo is one of several places the enum is independently declared). The
  dashboard layer typically uses an *extended* variant set beyond the
  connector's own enum — umbrella/selection ids like `<name>All` ("spot &
  futures" selection) and `<name>Spot` (pins spot), on top of the plain
  live/paper variants. Check the existing pattern for another exchange here
  before assuming the exact set.
- **Exchange config/entitlements** — an `ExchangeProviderConfig`-shaped
  entry per variant (display name, category, whether paper trading is
  supported, whether a passphrase/extra field is required, which key types
  are accepted, whether host selection is offered). This drives the
  add-exchange dialog a user sees.
- **Connect forms/dialogs** — for a plain key/secret exchange, the standard
  form usually just needs the config entry above. A **non-standard
  fee/auth/entitlement model** (Web3 wallet auth, builder fees, a referral
  requirement) needs real form/dialog work here, not just config — check
  whether this exchange has any of that before assuming "enum only."

## Sister repos

All public, same repo family as this one:

- **exchange-connector-sh** — the adapter whose capabilities (futures
  support, key types) this repo's config entries should accurately reflect.
- **websocket-connector-sh** — the streams behind the dashboard's live
  price/chart data.
- **app-sh** — the GraphQL API this repo's dashboard build consumes; its
  enum must match what this repo declares.
- **paper-trading-sh** — backs this repo's paper-account UI.
- **backtester** — the client-side backtest lib the dashboard bundles; its
  `ExchangeEnum` must include this exchange before dashboard backtest code
  can drop its `@ts-expect-error` placeholders.
- **content** — the "connect via API keys" guide this repo's connect dialog
  links to — broken/missing link is a common launch-day bug.
- **docker-sh** — the self-hosted release bundle this repo ships inside of.

Gainium's cloud SaaS wires a few more pieces on top of this stack
(paid-plan gating, an internal monitoring/admin layer, marketing pages) —
not part of the self-hosted deployment, not this repo's concern.
