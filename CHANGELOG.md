# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.32.3] - 2026-07-14

### Fixed

- Archiving a bot from the bot detail/view page (`/…/view/:id`) now works. The view-page action menu never wired its Archive action, so clicking Archive there did nothing; it now archives (and shows the read-only warning when the cold-store UX is enabled), matching the bot-list menus.

## [2.32.2] - 2026-07-14

### Fixed

- Notification sounds now actually play when you turn on "Enable sounds". Previously that master switch was a no-op unless you had also enabled a per-type sound on the Settings page (all off by default), so it looked broken. Turning it on now seeds the default deal/order sounds, and enabling any per-type sound automatically un-mutes the master. Added a matching "Notification sounds" master switch to Settings → Notification Preferences so its state is visible where sounds are configured.

## [2.32.1] - 2026-07-14

### Fixed

- Order/deal price displays now show adaptive decimal precision for sub-$1 "penny" coins. Prices like DOGE render `$0.07120` (and smaller coins get more significant digits) instead of collapsing to `$0.07`, in the deal orders list, bot drawer orders table, and trade detail. Prices ≥ 1 are unchanged.

## [2.32.0] - 2026-07-12

### Added

- Bot details drawer: show a dismissible alert when a running bot has logged error or warning events, with a link that jumps to the bot's Events tab. Dismissing it clears the flag. Mirrors the error/warning notice the legacy dashboard showed.

## [2.31.1] - 2026-07-11

### Added

- Extend the archive read-only warning to the bot edit page's Archive action (previously only the bot-list menus warned). Same flag gate (`VITE_COLD_STORE_ENABLED`).

## [2.31.0] - 2026-07-11

### Added

- Archiving a bot now warns that archived bots become read-only (a new confirmation on the Grid/DCA/Combo bot menus): the trade history is preserved but the bot can't be started again — clone it to reuse. Cold-store (read-only) archived bots also hide their un-archive action. Ships behind `VITE_COLD_STORE_ENABLED` (off by default) in lock-step with the backend cold-store rollout.

## [2.30.32] - 2026-07-11

### Fixed

- Bots on dash-separated exchanges (Coinbase, Kraken, OKX, KuCoin) with a non-USD quote asset (e.g. a SOL/EUR grid) no longer show a Current Funds value of $0.00 and a wildly wrong Total P&L. The USD-rate lookup only matched concatenated ticker symbols (`EURUSDT`), so it never found a USD bridge for exchanges whose symbols use a separator (`USDT-EUR`), returning a rate of 0. It now matches all separator forms, so current-funds value, Total P&L, and unrealized PnL are correct. Also fixes the USDT→USD leg for every exchange.

## [2.30.31] - 2026-07-11

### Fixed

- DCA / Combo / Futures bots: Risk:Reward settings can be saved again. Enabling Risk:Reward and picking a stop-loss indicator failed with "At least one indicator is required when Risk:Reward is enabled" (and silently dropped every risk setting on edit), because the indicator lookup collected a single match but then required an array. It now collects all matching indicators, so the whole Risk:Reward configuration round-trips correctly on create and edit.
- DCA / Combo bots: paying subscribers get the full multi-pair limit again. In multi-pair mode the pair selector was capping paid users at the free-tier maximum (50) instead of the paid maximum (500), because the plan lookup fell back to a free-tier default when only the free/paid flag (not a plan name) was available.

## [2.30.30] - 2026-07-11

### Fixed

- Combo & Grid bots: a grid/minigrid order's price line no longer lingers on the performance chart after that order fills. When an order executed, its filled copy was cached but the stale pending copy was left behind, so the chart's pending-orders filter kept drawing the line (e.g. a combo minigrid sell line staying after the sell). The line now disappears as soon as the order fills.

## [2.30.29] - 2026-07-11

### Fixed

- DCA bots: the Minimum take profit filter (shown for Indicator/Webhook close conditions) can again be edited when editing an existing bot. Its toggle and percentage field were incorrectly locked — and the whole row hidden when the filter was off — on existing bots; they now behave the same as when creating a bot.

## [2.30.28] - 2026-07-11

### Fixed

- Hedge Combo & Hedge DCA bots: corrected the combined Take Profit / Stop Loss tooltips. The combined TP/SL is a portfolio-level close on the hedge's combined PnL that runs *in addition to* each leg's own TP/SL (whichever triggers first closes); it does not replace the per-leg TP/SL as the previous wording implied. Also clarifies that the combined Stop Loss takes a negative percentage.

## [2.30.27] - 2026-07-11

### Fixed

- Hedge Combo & Hedge DCA bots: the combined Stop Loss now accepts a negative percentage (a loss threshold on the hedge's combined PnL), matching the engine and the DCA/combo/grid convention. It previously required a value greater than 0, so a normal stop such as `-25%` could not be saved — and any positive value the form did accept was already satisfied the moment a deal opened, closing the position instantly.

## [2.30.26] - 2026-07-11

### Fixed

- Cloning a hedge combo bot no longer inherits the source bot's state. Previously, cloning a bot that had open deals wrongly reported the clone as having "active deals" and locked leverage, margin and other settings, and the base-order balance stayed at $0 (with "value exceeds the available balance") when a different exchange was picked — the "Update balance" button couldn't fix it. A clone is now treated as a brand-new bot: deal-based locks only apply when actually editing a live bot, and the base-order balance follows the exchange you select in the form.

## [2.30.25] - 2026-07-10

### Fixed

- Bot-creation charts on USD/USDC-quoted exchanges (Kraken futures, Hyperliquid) now render historical candles immediately instead of staying blank when the trading-pairs list is slow to load. The bot form seeds an exchange-appropriate default pair up front (BTC/USD for Kraken futures, BTC/USDC for Hyperliquid) rather than the generic BTC/USDT, which those exchanges don't list, so the chart no longer requests an unsupported pair while pairs load.

## [2.30.24] - 2026-07-10

### Fixed

- Hedge bots (Quick mode): the Investment field now shows a cleanly rounded amount instead of a long floating-point tail (e.g. `600.07828125`).
- Hedge Combo bots (Quick mode): the Investment field is editable again — it previously read the DCA leg's value while writes went to the combo leg, so it appeared frozen.

## [2.30.23] - 2026-07-10

### Fixed

- Kraken and Hyperliquid futures charts now receive live candle updates again — the exchange-native product id (`code`/`wsCode`) is threaded from the resolved symbol to the realtime streamer, which previously logged "product id missing" and never subscribed.

## [2.30.22] - 2026-07-10

### Fixed

- Hedge Combo bots in Quick mode now draw both legs' full grid + DCA ladder on the chart instead of only the DCA safety orders, so the combined view matches the single-leg Manual view.

## [2.30.21] - 2026-07-10

### Fixed

- Switching to another exchange or trading pair no longer freezes the price chart while the previous one is still loading candles — the in-flight request is cancelled immediately instead of blocking the chart until it times out (notably slow endpoints such as Hyperliquid).

### Changed

- During a scheduled maintenance window, tabs running an older build now pick up the new version sooner (still only while you're idle, never mid-interaction), so the maintenance notice and post-deploy code load in time.

## [2.30.20] - 2026-07-10

### Fixed

- Base Order Size now recalculates when you switch its denomination (e.g. quote/USD ↔ base token). Previously the raw number was kept and only re-labelled, so a $10 order became "10 tokens" (~10× price in notional). Affects the DCA, Combo, and Hedge bot forms, which share the base-order control.

## [2.30.19] - 2026-07-10

### Fixed

- Notional Value on leveraged futures deals now shows Cost × leverage instead of collapsing onto the Cost figure. Affected the open-orders table, deal cards, and the Trading page for every futures bot type (DCA, Combo, and Hedge Combo).

## [2.30.18] - 2026-07-10

### Changed

- App updates now apply automatically at the next idle moment — when you switch away from the tab or pause interacting — instead of only when you click the "update available" prompt. Long-lived tabs pick up new releases on their own, and the reload never interrupts an in-progress form or bot setup.

### Fixed

- Price chart now loads on the Hedge Combo create screen for OKX and Coinbase pairs (previously stuck on "Loading chart…" until the bot was saved and reopened).
- Exchange dropdown now scrolls when you have many accounts, instead of overflowing past the screen.

## [2.30.17] - 2026-07-09

### Added

- Hedge Quick chart now draws BOTH legs' base, safety (DCA), and take-profit orders together, instead of flickering between the long or short leg's orders.
- Hedge bot form now has a header validation-alerts button, and Quick mode shows an order-minimum "Min to run" hint plus per-leg below-minimum warnings.
- Hedge footer shows a "Backtest complete · View results" summary chip after a run.

### Fixed

- Hedge Quick risk profiles (Conservative / Balanced / Aggressive) now actually reconfigure both legs when selected — previously only the card highlight changed.
- Selecting a hedge risk profile no longer resets the form's scroll position.
- Hedge Quick now auto-selects the Balanced profile for a new bot.
- Saving a hedge bot now validates each leg's required fields and the shared take-profit / stop-loss, routing to the offending leg and field instead of a raw error toast.
- The hedge bot lists now honor Privacy Mode and disable the "New" button in demo / read-only sessions.
- The risk-profile cards wrap responsively instead of clipping their labels on narrow panels.

### Changed

- Hedge form loading now shows shaped skeletons, and the Quick / Manual toggle collapses to icons when the panel is narrow.

## [2.30.16] - 2026-07-09

### Fixed

- Terminal deals no longer show an "open bot" link. Terminal deals live in the terminal and have no bot page, so the external-link buttons on their cards and rows (and the edit-in-bot navigation) have been removed for them.

## [2.30.15] - 2026-07-09

### Changed

- Internal: the bot-form example-orders and indicator side-effect stores are now instance-scoped via `BotFormProvider` (opt-in `isolateStores`), instead of being shared module globals. Regular DCA, grid, combo, and hedge bots keep using the shared instance and behave identically; this is groundwork so two hedge legs can eventually co-mount one workbench without their order-estimation and indicator pipelines clobbering each other. Risk:Reward stores are intentionally out of scope.

## [2.30.14] - 2026-07-09

### Changed

- Bot edit pages (`/bot/edit`, `/combo/edit`, `/grid/edit`, `/hedge/bot/edit`, `/hedge/combo/edit`) now open ready to edit instead of starting locked behind a "Press Edit" step — reaching an edit page from the sidebar, a bot card, or the drawer always expresses intent to edit. The drawer view routes (`/…/view/:id`) remain the read-only surface, and the footer EDIT/CANCEL toggle still locks the form on demand.
- Unified the DCA, grid, combo, and hedge bot **new & edit** pages onto a shared workbench, page-descriptor, and route table. Cross-cutting concerns — the paper/live mode guard, premium gate, not-found handling, store resets, and the backtests panel — are now declared once per bot type instead of copy-pasted per page, so a bot type can no longer silently miss one. No change to which page renders at any path or to how bots behave.
- Demo / shared-link viewers are now redirected off **every** bot edit page back to the list (previously only grid bots did this; the other types left them on a form that looked editable but couldn't be saved).

### Removed

- Deleted the unused legacy bot detail pages (`TradingBotDetails`, `ComboBotDetails`, `GridBotDetails`) and the unreferenced `pages/bots` barrel; these were superseded by the drawer view routes and were no longer reachable.

## [2.30.13] - 2026-07-09

### Fixed

- Bot create/edit forms (`/bot/new`, `/combo/new`, `/grid/edit`, …): the form footer's action buttons no longer re-render on every live-price tick. `useDcaTradingContext` returned a brand-new object each render, which cascaded into the footer's button-config array and re-rendered the button row ~26×/second — the largest source of the render-loop tripwire in production. The trading context is now referentially stable, which also benefits every other consumer of that hook.
- Bot detail drawer (`/bot/view`, `/combo/view`, `/hedge/combo/view`): the footer Start/Stop/Restart/Edit buttons no longer rebuild on every live bot-stats/deal update — the button list and its handlers are now memoized, so the drawer stays idle while the bot streams data.
- Deal edit drawer: the Save/Reset action buttons no longer rebuild every render (the callbacks depended on the whole react-query mutation object instead of its stable `mutate` function).



### Fixed

- Data tables (e.g. the Trading page's bot/trade toolbar): the toolbar button row no longer re-renders on every live price/stats update. The table-preferences state was being rebuilt on every render (fresh default column-visibility/pinned-column objects fed in from the props normalizer), which churned the toolbar's button configs and re-rendered the responsive button row ~26×/second under live data — wasteful work that could push slower devices toward an out-of-memory crash. Default column-visibility and pinned-column inputs are now stable, the bulk-action list depends on a stable handler, and the column dropdown reads a stable table reference, so the toolbar stays idle while data streams.



### Fixed

- Hedge bots: opening or refreshing a hedge bot's edit or detail page while the global Live/Paper toggle is set to the other mode no longer shows a blank form with the exchange undetected. The page now realigns the toggle to the bot's real mode (as the other bot types already did), or shows a clear "Bot not found" notice if the bot exists in neither mode.

## [2.30.10] - 2026-07-09

### Fixed

- Keyboard shortcuts: a malformed or legacy saved shortcut (missing its key binding) no longer crashes the whole dashboard with a blank screen on every page. Such entries now fall back to their default key or are skipped.

## [2.30.9] - 2026-07-09

### Fixed

- Bot DCA Analysis: "Max Configured DCAs" now reflects the bot's real configured DCA orders for indicator- and custom-condition bots (the indicator DCA count / custom DCA table length) instead of the stale `ordersCount` field, which could show a much larger number (e.g. 32) than the bot actually uses. DCA coverage percentages use the same corrected count.

## [2.30.8] - 2026-07-08

### Added

- Backtest settings: custom period start/end now include a time-of-day (date + time), matching the legacy dashboard, instead of dates only.

### Fixed

- Backtest settings: saved periods can now be edited and deleted via a "Manage periods…" option in the period dropdown (the manager dialog was previously unreachable).

## [2.30.7] - 2026-07-08

### Removed

- New-bot page: removed the "Please help us improve this page!" DCA survey prompt pill and its dialog.

## [2.30.6] - 2026-07-08

### Added

- Bot detail sidebar: a bottom action bar with Stop/Start, Restart, and a full-width primary Edit button, shown for every bot type.

### Changed

- Bot detail sidebar: Start/Stop, Restart, and Edit moved out of the header ⋮ menu into the new footer action bar, so they are no longer duplicated. The ⋮ menu keeps Star, Clone, Share Configuration, Duplicate, Archive, and Delete.

## [2.30.5] - 2026-07-08

### Fixed

- Grid bot settings: "Grid step" and "Sell displacement" now display as a percentage (e.g. `1%`) instead of the raw decimal (`0.01`) when reading a bot's configuration — both in the read-only settings drawer and the edit form.
- Grid bot stop loss no longer rejects the negative percentage its own quick-buttons and default fill in. Grid stop loss is a negative drawdown, so a negative value is now accepted (an empty or zero value still prompts you to configure it).
- Grid bot stop-loss and take-profit "action" no longer offers an option that failed to save. "Close position" is now shown as the futures label on the existing "cancel orders and sell base" action rather than a separate option that the backend rejected.

## [2.30.4] - 2026-07-08

### Fixed

- Bot and trade sidebars no longer fetch unused backtest data when they open. The side chart panel never rendered backtest markers, so the request was pure overhead on every sidebar open (across grid, DCA, combo, and hedge bots).

## [2.30.3] - 2026-07-08

### Fixed

- Responsive toolbars (bot/combo deals tables, trades, form footers) no longer trigger a render loop that could freeze the page or crash it with "This page is having a problem / Out of Memory". Rebuilt `ResponsiveButtonRow` so button compaction/overflow recomputes only on a real container-size or button-set change, never on every parent re-render — a parent that recreates its button array on live-data ticks no longer drives the layout math or the parent layout-metrics callback.

## [2.30.2] - 2026-07-07

### Changed

- Wrap ResponsiveButtonRow and BotFormFooter in React.memo. Extract button props in TradeSetupPanel

## [2.30.1] - 2026-07-07

### Fixed

- Portfolio Balances now shows the logo and company name for tokenized-stock holdings (Kraken xStocks, Bybit spot xstocks, Hyperliquid spot RWA) instead of a blank first-letter tile. The row's asset class + venue + human-readable name are resolved from the loaded trading pairs and passed to the coin icon. `normalizeStockTicker` also strips Kraken's tokenized-ledger `.T` suffix (`PGx.T` → `PG`), and a new `balanceAssetToPairBase` maps a ledger code to its tradeable pair base. Paired with the main-app snapshot fix, these holdings also show a real USD value instead of $0.00.

## [2.30.0] - 2026-07-07

### Added

- Deal action menus now offer "Change DCA levels" for DCA and Combo bot deals (across the trades card view, trades table, and bot deals table), letting you raise or lower a running deal's max DCA safety orders — disabled for risk-based and non-open deals.

### Fixed

- "Move to Terminal" now appears on Combo and Grid bot deals as well as DCA (trades card view, trades table, bot deals table, and their bulk actions), matching the legacy dashboard; combo deals correctly pass the combo flag when moved.

## [2.29.3] - 2026-07-07

### Fixed

- A deal sitting exactly at breakeven (unrealized P&L of $0.00) showed "Price unavailable" instead of "$0.00". The deals-table transform treated a legitimate zero as a missing value. Most visible on Kraken tokenized stocks while the market is closed and the live price is frozen at the average entry price.


## [2.29.2] - 2026-07-07

### Fixed

- Kraken deals showed "Price unavailable" for unrealized P&L: the price fetcher's `essential` exchange list omitted Kraken (and the dynamic active-exchanges effect is disabled), so the dashboard never fetched Kraken prices. Added Kraken (spot + USD-M) to the fetch list.


## [2.29.1] - 2026-07-06

### Fixed

- Tokenized-stock (xStock) chart now shows data: stop uppercasing the pair on the chart path (`AAPLx`→`AAPLX` corrupted the case-sensitive Kraken candle symbol → no bars). xStock pairs are now preserved like `:`-prefixed HIP-3 pairs.
- Stock/ETF icons now render on EVERY surface (bot sidebar, tables, cards): `CoinPair` resolves the base asset's class/venue/name itself from the loaded pairs, so a call site no longer has to pass `assetClass`/`exchange` to get the right logo.


## [2.29.0] - 2026-07-06

### Added

- Human-readable asset names alongside tickers. The pair picker now shows the base asset's name under the ticker (e.g. "Apple Inc. · USD", "Bitcoin · USDT"), and bot/deal cards reveal it on hover — for all exchanges and asset classes (crypto + tokenized stocks/ETFs). Names come from the new `baseAsset.displayName` field on pairs (`getAllPairs`); the UI falls back to the ticker when a name isn't resolved yet.

## [2.28.3] - 2026-07-06

### Fixed

- Tokenized-stock (xStocks) icons: `normalizeStockTicker` now strips the `x`/`X` wrapper from dotted tickers (`BRK.Bx` → `BRK.B`) so the stock logo resolves instead of a letter monogram. Kept in lock-step with the main-app backend copy.


## [2.28.2] - 2026-07-06

### Fixed

- Add Custom Nav Item dialog: de-duplicate the icon picker so each Lucide icon appears only once (previously `Menu` and `Cloud` showed twice). The list is now deduplicated at render, so accidental repeats can't resurface.

## [2.28.1] - 2026-07-06

### Fixed

- Recent-items page tracking: narrow `MainLayout`'s subscription to the user-sessions store so the app chrome no longer re-renders on unrelated store writes. This removes the amplifier behind a rare navigation crash (React #185) on bot detail pages reached via a redirect.

### Changed

- Crash instrumentation: add an invocation-storm tripwire around page-visit tracking that files a single non-fatal diagnostic (with the recent navigation trail) if start/end-page-visit ever re-enters abnormally fast, and tune the render-loop tripwire to require a sustained burst across consecutive windows so a normal mount/hydration spike no longer reports. Both honor the existing `gainium:tripwire` kill switch.

## [2.28.0] - 2026-07-04

### Added

- Pair picker: "Canonical only" toggle (on by default) with a risk tooltip. Hides permissionless listings (Hyperliquid HIP-1 spot tokens that can impersonate real tickers or carry liquidity/rug risk) while keeping HL-native and Unit-bridged assets; toggle off to show and trade them. Only appears when the list contains non-canonical pairs, and never blocks selection. Applies to every pair-picking surface (DCA, Grid, Combo, Terminal).

## [2.27.2] - 2026-07-04

### Fixed

- Portfolio balances: price balance tokens whose exchange-normalized ticker differs from the snapshot asset name (e.g. Hyperliquid Unit aliases `UBTC`→`BTC`, `USDT0`→`USDT`). These previously rendered at `$0.00` in the enhanced balances table because the price map was keyed only by snapshot names; balance tokens are now also priced from the screener. USDC was unaffected (same name everywhere).

## [2.27.1] - 2026-07-04

### Fixed

- OKX Europe pair scoping: add the `source` field to the `useTradingPairs` `TradingPair` type so the bot-form pair filter type-checks under the production build (`tsc -b`); 2.27.0 built only under the looser dev typecheck.

## [2.27.0] - 2026-07-04

### Added

- OKX Europe support: adding an OKX account with the **my.okx.com** origin now shows a notice that EU accounts trade a restricted product set (USDC/EUR spot; USDT unavailable), and the bot-form pair selector scopes to that account's real universe — EU accounts see only their USDC/EUR pairs, other OKX accounts keep the global list.

## [2.26.4] - 2026-07-03

### Fixed

- Deal chart: the trade overlay now dedupes markers to one per price level per bar and merges any that would overlap on screen at the current zoom, so high-frequency (tight-grid) deals stay responsive without dropping any traded level. Builds on the visible-range filtering from 2.26.3.
- Reduced needless re-renders of the demo-mode prompt pill on every live update.

## [2.26.3] - 2026-07-03

### Fixed

- Deal chart: the trade overlay now draws only the transactions in the visible time range and re-filters as you pan/zoom, instead of drawing every trade at once. High-frequency deals with thousands of trades previously froze the chart and made panning progressively unresponsive; plotting is now bounded and scales with the visible window rather than the deal size.

## [2.26.2] - 2026-07-03

### Changed

- Bot actions menu: the Archive action is now disabled for running bots (open/range/monitoring/error) with a "Stop the bot first" tooltip, matching the backend rule that only stopped bots can be archived. Prevents the misleading "archived successfully" that used to hide a running bot locally until the next full reload. Applies to all bot types (DCA/Grid/Combo/Hedge Combo/Hedge DCA).

## [2.26.1] - 2026-07-02

### Fixed

- `getMaintenanceWarning` now requests `duration` so the maintenance message's `%duration%` placeholder resolves (requires the matching `main-app` schema field).

## [2.26.0] - 2026-07-02

### Added

- New `layout.maintenanceBanner` extension slot in `MainLayout` for a cloud-only scheduled-maintenance warning banner. Self-hosted builds render nothing.

### Fixed

- `getMaintenanceWarning` query requested a non-existent `textf` field; corrected to `text` so the maintenance message resolves.

## [2.25.8] - 2026-07-02

### Fixed

- Bot drawer performance tab: the equity, realized-profit and buy-and-hold series no longer animate on mount, matching every other chart in the app. This closes a class of crashes ("Something went wrong" / Maximum update depth exceeded) where a chart unmounting mid-animation would trip an internal render loop.
- All remaining charts now disable enter animation consistently, and a lint rule enforces that every new chart series makes this choice explicitly, so the crash class can't come back through a missed chart.

## [2.25.7] - 2026-07-02

### Changed

- Crash reports (the automatic error reporter behind the "Something went wrong" screen) now carry the deployed bundle hash, build mode, React error digest, and a short trail of the last route changes, clicks, resizes and live-update events leading up to a crash, so hard-to-reproduce production crashes can be pinpointed without asking the user to reproduce them. No payload or text content is captured.
- Added an internal render-loop tripwire on the responsive button toolbar: if a component starts re-rendering pathologically fast (the pattern behind "Maximum update depth exceeded"), it reports which props were changing before the page crashes, instead of after. Can be disabled with `localStorage['gainium:tripwire']='off'`.

## [2.25.6] - 2026-07-02

### Changed

- Leverage control (trading terminal and DCA/grid bot forms): redesigned into a single full-width row — the amount input, slider and current value sit together, with one compact row of quick-select presets below — instead of a cramped two-column layout. The slider track is now visible on filled surfaces, the preset buttons were trimmed to the common values (capped at the exchange max), and the bot-form container now uses a filled background to match the terminal.

## [2.25.5] - 2026-07-02

### Fixed

- Coin icons: map Binance's precious-metal commodity tickers (`XAU`/`XAG`/`XPT`/`XPD`) and Brent (`BZ`) onto the shipped metal/oil glyphs instead of the generic commodity badge, so stock/commodity perps show a proper icon.

## [2.25.4] - 2026-07-02

### Fixed

- Stopping a **grid bot** now asks how to handle the orders/position before stopping — cancel all orders, cancel and close the position by LIMIT or MARKET, or cancel except partially filled — matching the legacy dashboard. Previously grid bots stopped silently and left positions/orders open on the exchange. Applies to the bot list, the bot card, the details drawer, and bulk stop.

## [2.25.3] - 2026-07-02

### Fixed

- Grid **Start/Update bot** confirmation dialog: free balances and required amounts are now grouped into per-asset cards with aligned label/value rows, so "what you have" vs "what's needed" reads clearly instead of stacked prose.
- Self-hosted **Admin** page no longer shifts horizontally when switching between tabs — the main content scroll area now reserves a stable scrollbar gutter, so tall tabs (Services, Updates) and short tabs (Diagnostics, Exchanges) stay aligned.
- Opening or refreshing a **paper bot's** detail/edit page (grid, combo, DCA) no longer flips it to Live and shows "Unknown exchange" when your account default is Live — the page now stays in the bot's own paper/live mode.
- Opening a bot that doesn't exist in your paper **or** live account now shows a clear "Bot not found" message with a way back to the list, instead of a broken form with "Unknown exchange".

## [2.25.2] - 2026-07-02

### Fixed

- Starting, stopping, restarting, or deleting a bot no longer spins indefinitely when the bot worker is down, restarting, or backed up: the command now times out after 60s with a clear error toast and the button resets, instead of leaving the bot in limbo behind an endless spinner.

## [2.25.0] - 2026-07-02

### Added

- Admin → Diagnostics now shows the **price feed connectors** and their role, and warns when no connector is producing the ticker feed that paper/live order-filling needs — with a callout for ticker-only exchanges (e.g. Coinbase). Makes "enabled but no ticks" self-explanatory. Requires admin-sh ≥ 1.3.0; degrades cleanly on older backends.

## [2.24.0] - 2026-07-02

### Added

- Global warning banner when Binance temporarily restricts a futures account or symbol to reduce-only (Quantitative Rules cooldown): shows the affected account, restricted symbols with level and expiry, that new orders are delayed (not lost) and resume automatically, and that closing positions still works. Dismissable per cooldown window; only shown when a Binance account is connected.

## [2.23.0] - 2026-07-02

### Changed

- Admin → Updates: upgrading **admin-sh** now shows its real outcome. Because the admin service restarts itself, the page waits for it to come back and then confirms the new version instead of reporting "success" immediately. If the self-upgrade can't complete (e.g. `COMPOSE_DIR_HOST_PATH` not set), it now shows a clear error with a copy-paste manual command (`docker compose pull admin-sh && docker compose up -d --force-recreate admin-sh`). "Upgrade all" also upgrades admin-sh last so it can't cut off the other upgrades. Requires admin-sh ≥ 1.2.0.

## [2.22.3] - 2026-07-01

### Fixed

- Dashboard Overview: **normal deal count** and **unrealized P&L** (uPnL) no longer double-count. Grid bots have no DCA-style deals, but the widgets were still requesting DCA deal stats for the grid bot type — which the backend answers with the *DCA* dataset — and summing it on top of the real DCA numbers. Grid is now excluded from the deal-status/uPnL aggregation (matching the legacy dashboard), so the "normal", "in profit", and uPnL figures are correct again.

## [2.22.2] - 2026-07-01

### Fixed

- Asset-class picker: pairs now use their **own per-exchange** class, so a base that is a stock on one venue but crypto on another (e.g. `CAT`, `AAPL` on Hyperliquid) no longer shows under **Stocks** on the wrong exchange.

### Added

- Multi-asset icons for commodities (Au/Ag/Pt/Pd/Cu/Al, oil, gas, corn) and indices (S&P/N225/K200/…); forex reuses the fiat badges. Hyperliquid HIP-3 `dex:` prefixes are stripped for logo/badge lookup, and crypto-native metals (PAXG/XAUT) fall back to their coin logo. Non-crypto class icons are now shipped in `core` (self-hosted) as well as cloud.

## [2.22.1] - 2026-07-01

### Changed

- Quick mode (DCA, Combo, Grid) now shows the **Bot Name** field and auto-fills a meaningful default of `{pair} {strategy or bot type} {date}` (e.g. `BTCUSDT Mid-term 2026-07-01`) instead of the bare `New Bot`. Multi-pair DCA bots use a `{pair} +{n} …` prefix (e.g. `BTCUSDT +4 Mid-term 2026-07-01`). The name stays editable and is left untouched once you type your own.

## [2.22.0] - 2026-07-01

### Added

- Admin → **Diagnostics** tab (self-hosted): a live health snapshot showing per-exchange market-data feed liveness, Redis reachability, and service up/health state. Flags enabled exchanges that are receiving no live price data — the usual reason simulated or live orders silently stop filling.

## [2.21.4] - 2026-06-30

### Fixed

- Tokenized-stock pairs now show their real company logo (instead of a first-letter tile) on the bot cards, bot list rows and bot detail header — DCA, Grid and Hedge. The read-only views now resolve each pair's asset class + exchange from the loaded trading pairs, matching the bot edit page and pickers.

## [2.21.3] - 2026-06-30

### Added

- DCA & Combo Quick Setup show the minimum investment needed to run ("Min to run"), and the investment slider now floors at that minimum so it can't select a sub-minimum amount.
- Grid Quick Setup shows the minimum budget to run and floors the investment slider at it.

### Fixed

- Grid Manual mode restores the "Min budget is …" hint under the Investment field (ported from the legacy dashboard's budget-range calculation).

## [2.21.2] - 2026-06-30

### Fixed

- Tokenized-stock pairs now show their real company logo in the read-only (locked) Trading Pairs view on the bot edit page — DCA, Combo and Grid — instead of a generic letter tile. Previously the logo only appeared after clicking Edit; the locked view now resolves each pair's asset class + exchange the same way the edit picker does.

## [2.21.1] - 2026-06-30

### Fixed
- Tokenized-stock icons now show the real company logo for Bitget reality (`RAAPL`), Bybit-spot and Kraken xStock (`AAPLX`) pairs — including their paper twins — instead of a generic letter tile. `CoinIcon` venue-gates the ticker normalization and the pair's exchange is threaded through the pair pickers (`CoinPair`, `CoinSelect`, `ListModal`, `PairSelector`); clean tickers like `NFLX` are unaffected.

## [2.21.0] - 2026-06-30

### Added

- Asset-class filter in the coin/pair pickers (terminal + bot form): browse by Crypto / Stocks / Metals / Commodities (etc.) across exchanges. Only classes actually present render as chips; the market-data sort (crypto-only) hides for non-crypto classes.
- Multi-asset icons: stock/ETF logos load from our backend's self-hosted cache; crypto unchanged (CoinGecko). `CoinIcon`/`CoinPair` resolve icons by asset class, so stocks no longer show false-positive crypto icons.

## [2.20.0] - 2026-06-30

### Added

- Backtest history: a "Save Permanently" checkbox on every bot type's backtest table (DCA, Combo, Grid, and Hedge — both new and edit pages) lets you mark a backtest so it is not auto-deleted by the cleanup job. Previously this column was a read-only yes/no indicator. Toggling it updates immediately without reloading the table.

## [2.19.2] - 2026-06-30

### Added

- Bot create/edit and the bot details drawer: click a trading pair to load it on the chart. On the bot form (new, edit, and the quick/manual sidebar) clicking a selected pair chip switches the chart to that pair; in the bot details drawer clicking a pair in the Basic section (including the "+N more" list) does the same.

## [2.19.1] - 2026-06-30

### Fixed

- Trades page: fixed a crash ("unexpected error") that made the page fail to load whenever you had open trades and the table layout was selected. The trades table now renders correctly in both table and card views.
- Editing an exchange account: the Update button no longer silently fails to save, the exchange and passphrase fields now populate correctly when opening an existing account (including Bitget), and leaving the API secret or passphrase blank keeps the stored credentials instead of wiping them.

## [2.19.0] - 2026-06-29

### Added

- Move a terminal deal back into a bot. Open terminal deals now have a "Move to Bot" action (in the trades card menu and the terminal Open Orders table) that adopts the position into an existing DCA bot you choose. Only compatible bots are offered — same exchange, account, direction (long/short), and trading pair — and the now-empty terminal entry is removed afterward. The position is adopted bare and then follows the target bot's take-profit, stop-loss and safety-order settings.

## [2.18.12] - 2026-06-29

### Fixed

- Trading terminal "Import" deal type: the Purchased Price field no longer rejects an entry price above (long) or below (short) the current price. An import declares an already-held position at its historical entry, which can legitimately sit on either side of the current market price. Previously the limit-order direction rule wrongly blocked the price, leaving the deal to import at the wrong (current) price or fall through to a real buy order.
- Trading terminal: placing an order or importing a deal now runs a client-side balance check before submitting (legacy parity). When the account can't fund the order the submit is blocked with "Not enough assets to place order", instead of returning a premature success and then failing asynchronously in the engine ("Not enough balance to start new deal"). Imports of an existing futures position are exempt — they adopt the held position and require no free margin.

## [2.18.11] - 2026-06-29

### Fixed

- Take profit is no longer capped across all bot types (DCA, grid, combo, and hedge variants). High-leverage users can now set an arbitrarily large take profit target (e.g. 5000% on 100x), matching the legacy dashboard. The slider still tops out at 250% for practical use, but the typed value and stored target are uncapped. Previously combo/hedge TP capped at 250% and DCA TP at 100%.
- DCA multi-target take profit: the individual price-distance targets are no longer wrongly forced to sum to ≤100%. Each target is an independent price level (position allocation across targets still sums to 100% as before).
- Combo TP slider drag no longer silently clamps to 50%.

## [2.18.10] - 2026-06-29

### Fixed

- Profit dashboard widget no longer crashes the whole dashboard when the profit data contains a daily row with an unparseable date. Such rows are now skipped instead of throwing "Invalid time value".

## [2.18.9] - 2026-06-28

### Fixed

- Hedge bot Deals tab now refreshes immediately after merging deals. The merge action didn't invalidate the hedge deals query, so the drawer kept showing the stale pre-merge list (old child deals, no merged deal) until a manual page refresh.

## [2.18.8] - 2026-06-28

### Fixed

- Hedge combo/DCA bot details drawer: short-leg deals now show their orders. The drawer only fetched orders for the primary (long) leg, so a short-side deal's order timeline rendered empty ("No orders found") even though the orders existed on the exchange. It now fetches and merges both legs' orders, filtered per deal.

### Changed

- Deal details Orders section: now defaults to a sortable, paginated **table** view (with search and CSV/JSON export) and splits orders into **Pending** and **Completed** tabs. The previous card layout is preserved and available via the Table/Cards toggle.

## [2.18.7] - 2026-06-27

### Fixed

- Hedge bot details drawer: the read-only Settings → Hedge tab now shows the hedge-level Take Profit / Stop Loss from the bot's shared settings instead of always reading "Off". Previously it read these off a leg (which never carries them), so a configured hedge take-profit displayed as "Off" even though editing the bot showed the correct value.

## [2.18.6] - 2026-06-26

### Changed

- Hedge DCA and Combo bot tables: dropped an unused `unPnlMap` dependency from the column-definition memo so the table structure isn't rebuilt on every price tick. No visible change (the unrealized values are already baked into each row).

## [2.18.5] - 2026-06-26

### Changed

- Trading terminal: a futures account can now be selected for a **Simple** order instead of being disabled. Because a Simple order is a one-off market order with no position tracking, picking a futures account now shows a warning that it opens an unmanaged position (no automatic take-profit, stop-loss, or DCA) and to use Smart if you want Gainium to manage it.

### Fixed

- Hyperliquid spot BTC balances now show up in the trading terminal and bot creators. The BTC spot market trades as the `BTC-USDC` pair but Hyperliquid holds the position as `UBTC` (Unit BTC), so the per-asset balance never matched the pair and the terminal showed `0` available to sell — users couldn't sell their spot BTC. Wallet symbols are now canonicalized (`UBTC`/`SBTC` → `BTC`, `SUSD`/`SUSDT` → `USD`/`USDT`) when reconciling balances against the selected pair.

## [2.18.4] - 2026-06-26

### Fixed

- Hedge bots no longer show `$0.00` unrealized P&L and an empty deals drawer for some bots when an account has more than 500 open hedge deals. The hedge deal fetch stopped at the backend's 500-row page limit, so bots whose deals fell outside the most-recent 500 were dropped from the unrealized calculation (cards, list table, drawer) and the drawer's deals tab. It now pages through the full deal set.

## [2.18.3] - 2026-06-25

### Fixed

- Values derived from live market prices (Unrealized P&L, Net P&L, Current Value, and the sidebar uPnL/Total PnL totals) now show a loading skeleton while prices are still being fetched, instead of briefly displaying a misleading `0`. Applies to the deals and open-orders tables, the bot performance drawer, the DCA/Combo/Grid bot list tables, and the trading-bot sidebar panels.

## [2.18.2] - 2026-06-25

### Fixed

- DCA, Combo and Hedge bots can again set max open deals up to 200. The save-time field mapper was silently capping the value at 50 (rejecting anything higher with "Max open deals must be between 1 and 50"), even though the form validation and the previous dashboard both allowed up to 200. The mapper now matches at 200.

## [2.18.1] - 2026-06-25

### Fixed

- Kraken backtests work again on both spot and futures. Bot backtests (and the curated-preset return estimates) on Kraken pairs were silently returning no candle data and 0 deals because the candle request used the concatenated pair form (`BTCUSDT`) that Kraken's market-data API rejects. Candle requests now use Kraken's dashed native pair (`BTC-USDT` for spot, `BTC-USD` for USDⓈ-M futures), matching the existing KuCoin-spot handling.

## [2.18.0] - 2026-06-25

### Added

- Hedge bot details: a unified view that shows **both legs together** instead of a Long/Short switcher. The Overview has a combined stats block plus each leg; Deals lists both legs' deals in one table; Events is one merged feed; the chart is a single panel. Settings keeps a Hedge / Long / Short switch (Hedge shows the shared take-profit / stop-loss).

### Fixed

- Hedge bot combined and per-leg **Unrealized PnL / current value** no longer read $0.00 for bots on exchanges absent from the price feed (e.g. Kraken futures): the values are now taken from the server-computed deal data. Capital "cost" on each leg is likewise sourced from the deals so it no longer flickers.
- Clicking a deal in a hedge bot's Deals tab now opens it **in place** within the same drawer, matching the other bot types, instead of stacking a second drawer on top.
- Grid bots Quick form: the Investment now defaults to a sensible non-zero amount (sized so each grid level clears the exchange minimum, capped at your available balance) instead of 0, which previously tripped a per-level-minimum error on launch.

## [2.17.2] - 2026-06-25

### Fixed

- Hedge bots Quick form: Investment is now the **total** funds the leg deploys across the base order and every safety order, distributed using the same math as the standalone Quick bot — instead of being set as each individual order size (which over-committed by the order count). Editing the total redistributes it, and risk-profile presets keep the total constant while re-spreading it over the new orders ladder.

## [2.17.1] - 2026-06-25

### Fixed

- Hedge bots Quick form: a short leg on a USDⓈ-M futures account now shows its Investment in the settlement asset (e.g. USDT) instead of the base coin; the coin icon and unit label always match. COIN-M still shows the base coin, spot shorts the base asset.
- Hedge bots Quick form: the Investment slider now scales to the leg's actual available balance on its exchange, instead of a fixed 0–100 range. Both legs resolve their own balance even when they sit on different exchanges.

## [2.17.0] - 2026-06-25

### Added

- Paper `SPOT & Futures` accounts can now be funded independently per market: the Add Exchange form shows a separate asset + amount for each account it will create (SPOT / USDⓈ-M / COIN-M), with the COIN-M account coin-margined (BTC/ETH). Sent via the new `addExchange` `topUps` field.

### Changed

- Add Exchange paper dropdown de-duplicated: each exchange now lists one clear entry per market (SPOT / SPOT & Futures / Futures) instead of a redundant bare umbrella alongside an explicit variant. Hyperliquid's spot entry is labeled "SPOT"; Paper Bitget gains SPOT and SPOT & Futures entries.
- Paper top-up asset lists corrected per exchange from real tradeable-pair coverage (e.g. Kraken defaults to USD, not USDT; dropped delisted BUSD/TUSD/GUSD/PAX/DAI; Coinbase offers USD).
- A `SPOT & Futures` selection now shows the funding field and defaults the account name to the exchange brand (e.g. "Paper Kraken"), so created accounts read "Paper Kraken (Spot)" instead of "Paper Kraken SPOT & Futures (Spot)".

### Fixed

- "My Accounts" now refreshes immediately after adding a `SPOT & Futures` account (every created sub-account is added to the list, not just the first).

## [2.16.1] - 2026-06-25

### Fixed

- Hedge bots Quick form: creating a bot no longer fails with "Cannot read properties of undefined" — each leg's pair metadata is now preserved when the create payload is built.
- Hedge bots Quick form: Investment is set per leg in the correct asset — the long leg in quote (e.g. USDT) and the short leg in base (e.g. BTC) — instead of one shared number that landed as the wrong asset on the short leg. Each leg's slider is capped at that leg's available balance.
- Order-size coin icon could briefly show the wrong coin (e.g. a USDT logo labelled BTC) when the unit changed; the icon now always matches its label.

### Changed

- Order-size fields across all bot types now show the unit symbol (e.g. "USDT", "BTC") next to the coin icon.

## [2.16.0] - 2026-06-25

### Added

- Hedge DCA bots page: a "Deals" tab (next to "Bots") lists every open or closed deal across your hedge bots' legs, matching the Deals view already on the regular bots page.

### Fixed

- "Capital Deployed" now reflects the capital actually committed to open positions (the live cost shown in each bot's "Cost" column) instead of the larger reserved-budget figure, so the stat reconciles with the table. Applies to the DCA, Combo, Hedge DCA, and Hedge Combo bot lists and the combined Trading overview.

## [2.15.1] - 2026-06-23

### Fixed

- Hedge combo bot deals: unrealized profit no longer shows a wildly inflated figure for COIN-M (inverse) legs. The deal table now applies the combo profit formula to hedge-combo legs and converts via the quote asset, matching the value the backend reports.
- COIN-M unrealized profit on the dashboard treemap, bot cards, and DCA deal lists no longer shows an inflated figure — the shared calculation now converts via the quote asset for COIN-M positions too.

## [2.15.0] - 2026-06-23

### Added

- Sidebar edit mode: reorder navigation items by dragging, move them between sections, create and rename your own sections, and add custom links into any section. A "Reset to default" control restores the shipped layout. Open it from the pencil button in the sidebar header.

## [2.14.1] - 2026-06-23

### Fixed

- Bot events panel: events now show clean, consistent labels derived from the event type rather than guessed from message text. Settings changes are no longer mislabelled "Bot Status", buy/sell direction is only shown when the backend actually reports it, and raw internal names (e.g. "Buy dialog") render as readable titles.

## [2.14.0] - 2026-06-22

### Added

- Funding rate

## [2.13.0] - 2026-06-22

### Added

- Bot Webhooks section now has Incoming/Outgoing tabs. Outgoing webhooks (notify an external URL on bot start/stop and deal open/close) save to the bot immediately on add, edit, or delete and persist across reloads.

### Fixed

- Outgoing webhooks were previously held in local state only — never saved, did not mark the bot as modified, and were lost on reload. They now load from and persist to the backend.
- Usage column on the Trading Bots and Combo Bots tables now sorts and filters by the numeric usage percentage instead of the underlying object, so number filters and ordering work.
- Usage column in the bot drawer's deals table can now be filtered numerically.

## [2.12.4] - 2026-06-22

### Fixed

- Cloning a Combo or Grid bot now opens a pre-filled, unsaved create form where the exchange (and other settings) can still be changed — matching the legacy UI. Previously the clone landed on the saved bot's edit page, where the exchange was locked.

## [2.12.3] - 2026-06-18

### Fixed

- New-bot page: the Quick setup no longer crashes ("split is not a function") and blanks out when the selected trading pair value is malformed (non-string) — the form stays mounted and usable.

## [2.12.2] - 2026-06-18

### Fixed

- Overview: the Profit widget no longer crashes ("Invalid time value") when a profit row has a missing or malformed date — such rows now render with an empty tooltip date instead of taking down the widget.
- Bot tables: fixed an infinite render loop ("Maximum update depth exceeded") in the data table's selected-rows tracking that could spike CPU on pages with selectable tables (e.g. bot edit panels).

## [2.12.1] - 2026-06-17

### Fixed

- OAuth consent: forward the `resource` indicator to the authorization decision so the issued grant is bound to the target MCP resource. Combined with the backend scope clamp, the read-only connector (`mcp.gainium.io/read`) no longer shows or grants a write toggle.

## [2.12.0] - 2026-06-17

### Added

- Login & Security: "Allowed Login Methods" — choose which methods (password, Google, email link, passkey) can sign in to your account. Disabling a method blocks it everywhere; at least one method must stay enabled. (Cloud only.)

### Fixed

- Two-Factor Authentication: the setup flow now shows the scannable QR code (previously only the secret key was shown).
- Two-Factor Authentication: the 2FA toggle now reflects the real enabled state — the user query now fetches `otp.otp_enabled`, so enabling 2FA (in either dashboard) is reflected on refresh/login instead of always appearing off.

## [2.11.1] - 2026-06-17

### Changed

- Affiliate program: hide the Affiliate page and nav entry for users in the EU (the program is not available there), driven by the new `isEuRegion` user flag.

## [2.11.0] - 2026-06-16

### Added

- Hedge bots: Import / Export settings — export both legs plus the shared TP/SL settings to JSON (copy, download, or edit inline) and import them back, with a guard that rejects files from the wrong hedge type.
- Hedge bots: a footer options (⋮) menu, matching regular bots — Reset to defaults, plus full template support (Save as template, Load template, and global template hotkeys).
- Hedge bots: the Hedge (shared settings) tab now shows the same Backtest and Create/Save footer as the Long and Short leg tabs.

## [2.10.30] - 2026-06-15

### Changed

- Disable TradingView's built-in Google Analytics usage telemetry on the chart widget (it sent anonymized pageviews to a TradingView Google Analytics property). Analytics is handled exclusively through PostHog.

## [2.10.29] - 2026-06-15

### Changed

- Mark the app shell `noindex, nofollow`. The dashboard is logged-in and not meant to be indexed; this also clears the search-console "duplicate pages without canonical" warnings caused by PostHog `ph_distinct_id` / `ph_session_id` query params.

## [2.10.28] - 2026-06-16

### Fixed

- Bot performance chart: data points are now sorted by time, so the Equity / Realized Profit / Buy & Hold lines no longer zigzag and "Realized Profit" no longer appears to fall over time (the backend serves the points unsorted).
- Bot performance chart: the "Realized Profit" line and its hover tooltip now show the true realized profit (starting at 0) instead of a value offset by the bot's starting balance, and the right-hand axis it is plotted against is now visible — so the plotted line and the info box value finally agree.

## [2.10.27] - 2026-06-16

### Fixed

- Toast dismiss no longer throws "removeChild: not a child of this node" when a toast is removed while its parent container has already been detached (e.g. on the Combo bots page during rapid drawer open/close).
## [2.10.26] - 2026-06-15

### Fixed

- Hyperliquid "Add Exchange": the "Connect Web3 Wallet" button is shown for
  the Regular (paid) integration type again, not only for Free — paid users
  can set up Hyperliquid via their wallet without entering keys manually.
- A bot's closed deals are reachable again when it has no open deals. The
  Open/Closed filter now stays visible on the empty deals state, so closed
  deals are no longer stranded behind an empty "Open" tab.
- Deals overview "Close Time" column now shows the correct date — day and
  month are no longer swapped (the value was formatted to a locale string
  and then re-parsed ambiguously).
- Deals overview "Bot Name" falls back to the loaded bot's name when the
  deal record doesn't carry one, instead of rendering a bare "—".
- Deals overview "Bot Name" column is wider and shows the full name on
  hover, so longer bot names aren't cut off at ~15 characters.

## [2.10.25] - 2026-06-14

### Fixed

- Bot deals list now drops a deal from the Open list once its take-profit
  fills, instead of leaving a sold deal showing as open until the page is
  reloaded. The drawer re-checks its deals periodically so closed deals are
  reconciled away.
- Open and Closed deal lists now keep their column layout and sort order
  independently — hiding a column (e.g. Unrealized P&L) or changing the sort
  on one list no longer affects the other.
- Cached query data is now kept for 5 minutes instead of 24 hours, matching
  the persisted-cache window so a re-opened view can't briefly show a much
  older snapshot.
- Settings "Connected Apps" tab no longer hard-imports a cloud-only
  component, so the self-hosted build type-checks and builds again. The
  section is now rendered through the `settings.connectedApps` extension
  slot, empty on self-hosted (no OAuth provider).

## [2.10.24] - 2026-06-12

### Added

- Connect guide in the add-exchange dialog now also covers Bitget and Kraken
  (previously only Binance, Bybit, KuCoin, OKX, Coinbase and Hyperliquid).

### Removed

- Combo bot deal menu no longer shows "Add Funds" / "Reduce Funds" — combo
  bots don't support adjusting deal funds.

### Fixed

- Portfolio "My Accounts" list now scrolls, so exchanges past the bottom of
  the panel are reachable again.
- The connect guide is no longer shown for paper exchanges, which need no
  API connection.
- Editing a live exchange (e.g. renaming it) no longer forces re-entering the
  API secret.

## [2.10.23] - 2026-06-11

### Fixed

- DIV indicator logic.

## [2.10.22] - 2026-06-10

### Changed

- Backtester performance fix.

## [2.10.21] - 2026-06-10

### Changed

- Backtest results deal chart now fills its panel directly with rounded
  corners, instead of sitting inside a padded inner card.

### Fixed

- Bot detail side panels now use the base-canvas surface, so deal cards and
  overview widgets stay visually distinct from the panel instead of blending
  into it (regression from the 2.10.20 solid-panel change).
- Backtest results "Deals" list: the open deal now shows its unrealized P&L
  (coloured by sign) instead of a flat 0.00% / $0.00.
- Backtest results "Deals" header: add a little spacing between the "Deals"
  label and the deal count.
- Backtest results "DCA ladder": safety-order deviation now reads cumulatively
  from entry (and rung prices follow), instead of showing each order's step
  from the previous one — every rung past the first was sitting too close to
  entry.

## [2.10.20] - 2026-06-10

### Added

- Bot detail drawer "DCA Analysis" now shows the configured projection
  (deviation covered, average down power, capital needed) alongside the
  deal-level usage stats, and is shown for Combo bots too — not just DCA.

### Fixed

- DCA overview (coverage / average down power / total funds, plus the orders
  table and graph) no longer reads 0 / empty when viewing an existing bot's
  settings; it now projects the saved configuration, matching the create/edit
  form's figures for both DCA and Combo bots.

### Changed

- Bot detail side panels use a solid background instead of a translucent glass
  surface, so the form and content underneath are easier to read.

## [2.10.19] - 2026-06-10

### Added

- Bot tables (DCA, Combo, Grid, Hedge DCA, Hedge Combo) now expose a "BOT ID"
  column, hidden by default and toggleable from the Columns menu.

### Changed

- The deal table's "Deal ID" column is now hidden by default (still
  toggleable from the Columns menu) instead of always shown.
- Replaced the remaining native browser dialogs (confirm/alert/prompt) with
  in-app React dialogs and toasts across Global Variables, bot form reset and
  save-as-template, widget reset, tag editing, Notes link insertion, order
  notes, and API key rename/restrict/delete.

### Fixed

- Combo bot "Total Profit" in the bot table/card now matches the bot
  drawer. The table was showing the asset-blended `profit.total` figure
  under the "$" column instead of the USD value, so list and detail views
  disagreed.
- Global Variables: editing a variable no longer leaves the Type and Value
  fields blank. A stray empty change event from the type dropdown was
  clearing both when the edit dialog opened.

## [2.10.18] - 2026-06-10

### Fixed

- Closing several deals in a row from the deals card view no longer crashes
  the page (React error #185). The deal-card price sparkline and the bot-card
  equity chart had their mount animation enabled; recharts fires a state
  update from that animation's unmount cleanup, so a batch of cards
  unmounting mid-animation tripped React's nested-update limit.

### Changed

- The Bots/Deals toggle on the DCA and Combo bot pages is now reflected in
  the URL (`?view=deals`), so reloads, deep links, and closing the bot
  drawer land back on the same view. Legacy `?view=<botId>` links on the
  DCA page still redirect to the bot drawer.

## [2.10.17] - 2026-06-10

### Fixed

- Existing stale deals/bots now actually clear on upgrade. The stale-write
  guards (2.10.15–16) prevented _new_ contamination but couldn't evict
  entities already resurrected into the persisted caches before the fix
  shipped. This release busts both persisted layers on deploy: the live
  Zustand stores (deals + all bot types) wipe and refetch on version bump,
  and the React Query persisted cache is now keyed to the app version so a
  pre-deploy snapshot can no longer replay after an upgrade.
- The combo-deal list reconciliation now works against the production
  backend, which returns the full active set without pagination counts
  (`totalResults`/`totalPages` are null). Pruning was previously gated on a
  numeric `totalResults` and so never ran in production, leaving closed combo
  deals in the list. It now treats a response as complete unless it
  explicitly signals more pages, while still only pruning against a fresh
  snapshot.

## [2.10.16] - 2026-06-10

### Fixed

- Hardened deal-list reconciliation against stale cached responses: the
  absence-delete that prunes closed deals now runs only against a snapshot
  proven fresh (each query response is stamped with its network fetch time),
  and never removes a deal updated after that snapshot was taken. A replayed
  cache entry — even one that looks complete — can no longer prune live deals
  that arrived after it was cached. Closes the last window in which an open
  deal could briefly vanish on navigating back to a deals list.

## [2.10.15] - 2026-06-10

### Fixed

- Closed/canceled deals and stopped/deleted bots no longer reappear in lists
  after navigating away and back (or reloading within the cache window). The
  cached list responses replayed into the live stores could resurrect
  entities that were just mutated locally. All store write paths (query
  write-backs, websocket events) now go through freshness arbitration plus
  short-lived tombstones for locally closed deals / deleted bots, and
  close/stop/delete actions immediately patch the cached list responses
  themselves. Covers DCA, Combo, Grid, both Hedge bot types, and the bot and
  deal views.
- Deal lists now reconcile against the server snapshot: a deal the backend no
  longer returns as active is removed from the local store (previously stale
  Combo deals could linger indefinitely), without pruning when the response
  is known to be page-capped.

## [2.10.14] - 2026-06-10

### Fixed

- Editing and saving a DCA or Combo bot no longer fails with
  `Field "avgPrice" is not defined by type "changeDCABotInput"`. The
  deal-edit-only **Breakeven price** (`avgPrice`) seeded into the form
  defaults was leaking into the bot **update** payload — the same leak that
  2.10.9 fixed for bot **create**. It's now stripped (alongside
  `useExperimental`) before the update mutation. Grid bots and hedge legs are
  unaffected.
- The bot-create "insufficient credits" guard now reads the **bot credits**
  pool (`subscription.credits.balance` minus `locked`) instead of the
  consumable `user.credits` pool. Users who had bot credits but no consumable
  balance were wrongly blocked from creating bots.

## [2.10.13] - 2026-06-09

### Fixed

- New-bot page no longer gets stuck on "No trading pairs available" (and a
  0 available balance) until a hard refresh. When the trading-pairs cache was
  emptied — by the hourly cleanup or a live/paper context switch — while the
  pairs query result was still cached, the store wasn't being repopulated and
  stayed empty. `useTradingPairs` now re-syncs from the cached result the
  moment the store is marked stale, matching how exchanges already recover.

### Changed

- New-bot wizard: the combo bot card now describes it as blending DCA and grid
  strategies, and the selected bot-type card uses a ring highlight instead of a
  filled background.

## [2.10.12] - 2026-06-09

### Fixed

- Closed and canceled deals no longer report an unrealized P&L on the
  bot deals table — they show "-" instead of the stale value the server
  keeps after a deal closes, and sorting/totals treat them as neutral.

## [2.10.11] - 2026-06-09

### Fixed

- Replaced `document.body.removeChild(tmp)` with `tmp.remove()` in `getCSSVar` color-resolution utility to prevent a DOM exception when the temporary measurement element is no longer a direct child of `document.body`.
- Bot error messages now reach the live toast (the WS payload is
  unwrapped like every sibling event handler, and the toast header uses
  the bot name) and the Notifications panel refreshes on every open
  instead of serving a 5-minute stale cache.

## [2.10.10] - 2026-06-09

### Fixed

- Adding or reducing funds on a deal now reports "Add funds scheduled"
  (the backend's actual response) instead of falsely claiming the funds were
  added — the request is only queued at that point, and the order can still
  be rejected by the exchange.
- That later exchange-side rejection (insufficient balance, min notional,
  ...) is now surfaced in the terminal: live bot error/warning messages are
  shown as toasts as they arrive, instead of being swallowed. Routine
  info-level bot messages stay quiet (kept in the message store for a
  notification panel) to avoid noise.
- A synchronous add/reduce-funds failure (rejected before scheduling) now
  surfaces the backend reason instead of failing silently.

### Added

- Mutations can opt into global error feedback with
  `meta: { errorToast: true }` (toasts the thrown reason) or
  `meta: { errorToast: 'message' }` (fixed text), giving a single place to
  surface failures for fire-and-forget mutations.

## [2.10.9] - 2026-06-09

### Fixed

- Placing a Trading Terminal order (or creating a DCA/Combo bot) no longer
  fails with `Field "avgPrice" is not defined by type "createDCABotInput"`.
  The deal-edit-only **Breakeven price** (`avgPrice`) added in 2.10.7 was
  leaking from the form defaults into the bot-create payload; it's now
  stripped before the create mutation, alongside `useExperimental`.

## [2.10.8] - 2026-06-08

### Fixed

- Toolbar action rows no longer crash with "Maximum update depth exceeded"
  after a tab is left open in the background. `ResponsiveButtonRow` now
  rounds its measured button widths to whole pixels, so sub-pixel jitter
  from `getBoundingClientRect` can't defeat the change-detection guard and
  spin the measure→render loop forever. Affects the Overview tables, bot
  form footer, and every other consumer of the shared button row.

## [2.10.7] - 2026-06-08

### Added

- Deal Edit now exposes a **Strategy** section with the manual **Breakeven
  price** (single-deal edit, with a Reset to the live average) and the
  **Profit currency** selector, matching the legacy deal editor.
- The combo Stop Loss view now shows the weighted **Average stop loss**
  readout (already present on regular bots), so it appears for combo deals
  in Deal Edit too.
- Exchange connection form: Bybit and OKX **origin host** options now match
  the legacy dashboard (Bybit eu/com/tr/kz/ge; OKX my/app/com, including the
  new `app` origin), shown as bare origin URLs under an "OKX Origin" /
  "Bybit Origin" label.

### Changed

- Deal Edit tab bar now uses the same rounded floating style as the new bot
  form, and the section order is now Strategy, Take Profit, Stop Loss, DCA
  (DCA moved last).
- Deal Edit no longer shows the "Edit Deal" heading — the tab bar sits at the
  top of the drawer with the close button on the right.
- The bot form and Deal Edit now render section headers from a single shared
  `SectionHeader` component, so the two stay visually identical.

### Fixed

- The Actions column now stays pinned to the right even on tables with
  nested-accessor columns. The default column order and the resize lookup
  now mirror react-table's id resolution (`a.b` → `a_b`); the hedge bot
  tables pin Actions right; and a one-time table-preferences migration (v2)
  drops stale saved column order/pins so the right pin re-applies (widths,
  visibility, sorting, filters, pagination and view mode are kept).

## [2.10.6] - 2026-06-08

### Fixed

- The Actions column now stays pinned to the right edge of every data table.
  Columns with a nested accessor (e.g. `settings.startCondition`) were
  rendering to the right of Actions because the table built its default column
  order from the raw accessor key, while react-table registers nested keys
  with underscores (`settings_startCondition`) — so those columns looked
  "missing" and got appended past the right pin. The default order (and the
  resize lookup) now mirror react-table's id resolution. Also pinned Actions by
  default on the two hedge bot tables that were missing it, and reset saved
  column order/pins once (keeping widths, visibility, sorting, and filters) so
  existing layouts pick up the fix.

## [2.10.5] - 2026-06-07

### Fixed

- Grid bot edit page no longer crashes with a React "Maximum update depth
  exceeded" error. `BotFormWidget` mounted its own `GridPageProvider` even when
  the grid edit page already wrapped the whole layout in one, giving the page
  two `useGridPage` instances that fired duplicate queries and raced on the
  shared live stores — an infinite render loop. The form now reuses an existing
  provider and only mounts its own when there isn't one (e.g. the grid _new_
  page).
- Hardened several render-stability bugs surfaced while tracking the above:
  the bot-orders store-sync effect no longer depends on the whole (per-render)
  `options` object; `useGridBacktests` no longer returns a freshly-filtered
  array on every render; and the grid edit page's backtest table callbacks now
  depend on stable mutation references instead of the per-render mutation
  objects.

### Changed

- Crash reports now decode minified React error codes (e.g. "#185") into a
  human-readable description before they're logged, so production error
  reports are legible without cross-referencing react.dev.

## [2.10.4] - 2026-06-07

### Fixed

- Combo/short bot cards no longer show absurd unrealized P&L percentages
  (e.g. -4273%). For short positions the ROI is now measured against the
  quote value of the position instead of the realized profit, and the
  "Cost (Invested)" figure is shown in the quote asset.
- Dev only: localhost no longer renders a stale precached bundle. A leftover
  service worker is unregistered (with its caches cleared) at app entry, the
  app never registers a service worker in dev, and a service-worker update
  only forces a reload when it replaces an existing one (not on first visit).

## [2.10.3] - 2026-06-07

### Fixed

- TradingView chart: support an optional injected datafeed so a host app can
  supply its own data source per chart instance, and skip the shared-exchange
  history prefetch and global symbol-state writes when one is supplied;
  removed the manual-backtesting→Binance fallback alias from the shared
  candle path.
- IndexedDB persistence no longer freezes when a cached blob picks up a
  non-cloneable value: `setItem` now strips the offending data and retries,
  so manual-backtesting session deletes/creates (and other persisted-store
  writes) save reliably instead of silently failing on older caches.

## [2.10.2] - 2026-06-07

### Fixed

- Live and paper deals no longer mix, and already-closed deals no longer
  linger, after upgrading. Persisted deal/order/transaction/bot caches are
  now versioned and wiped once on load so each device refetches cleanly
  (the old cache held mis-tagged and stale deals from before the
  paperContext fix).

### Added

- Bot create submit is disabled when the account has insufficient credits.

## [2.10.1] - 2026-06-07

### Fixed

- Combo per-deal chart lines are now capped at each minigrid's close time and kept separate across minigrids that share the same price level. The backtest export now carries `minigridId` (and `type`) on order entries (backtester ≥ 1.6.2); DCA and grid charts are unaffected.

## [2.10.0] - 2026-06-06

### Added

- Grid and Combo bots now open in the redesigned full-screen results modal — on both the create and edit pages, and from the bot Backtests widget (which loads the full local result first) — replacing the old inline backtest result tabs. Grid shows Overview / Transactions / Equity / Stats; Combo shows the DCA tabs (Overview / Stats / Deals / Analysis). The per-deal chart draws orders and fills straight from the deal's order history (`filledOrders` / `ordersHistory`), matching the legacy main-dash deal chart for DCA.
- Grid bots now show a price chart in the backtest results Transactions tab: horizontal lines for each resting grid level plus buy/sell fill markers, with clickable transaction rows that pan the chart to that execution.

### Fixed

- Combo per-deal chart order lines are now robust. Resting orders are no longer deleted when a new minigrid opens (their exchange orders aren't cancelled, so the lines run on), and a buy line no longer continues past where it filled. Lines are reconstructed from the actual price path — `ordersHistory[].filledTime` conflates real fills with minigrid regrids — so each line ends where the price genuinely crosses it.
- DCA per-deal chart now renders the single take-profit as one stepping line (instead of a stack of separate TP lines) and ends each safety-order line at its fill, matching how DCA bots actually work.
- Changing the exchange or symbol on the new bot page no longer freezes the tab. The chart's symbol could ping-pong between the form's exchange (`hyperliquid`) and TradingView's resolved form (`hyperliquidLinear`) indefinitely; the prop-driven update now reacts only to genuine form changes and lets TradingView's resolution settle.

## [2.9.2] - 2026-06-06

### Fixed

- Profit widget on Overview crashes ("xe.split is not a function") when the backend returns a weekly or monthly date value as a number instead of a string; `as string` assertions replaced with `String()` runtime conversions.

## [2.9.1] - 2026-06-05

### Changed

- Backtest results Deals view now renders a real TradingView chart per deal — actual candles with a buy/sell icon for each filled order and the safety-order, averaged-entry, and take-profit levels drawn as time-bounded segments that step with each DCA fill; switching deals pans the chart to the new deal's window.
- Order-line segments on the TradingView chart now stay visible while panning as long as they cross the viewport, instead of vanishing once their start scrolls off-screen.
- The bot form footer's "View results" summary chip is now dismissible (× on the right), restoring the backtest run controls so another backtest can be run.
- The backtest results modal is now mobile-friendly: full-bleed (no margins) on phones, a taller deal chart, a deal list that stacks above the inspector, single-column detail panels, and a header whose close button sits top-right with the tabs wrapping below.

### Added

- Clicking a backtest row on the DCA bot create/edit page now opens the full-screen results modal instead of rendering the results inline in the widget; the same modal also opens from the backtest history table and the bot Backtests widget.

## [2.9.0] - 2026-06-05

### Added

- Redesigned full-screen backtest results modal for DCA bots, with an Overview tab (headline KPIs, win-rate and profit-factor donuts, equity curve, P&L scatter) and a split-inspector Deals view (selectable deal rail with prev/next and arrow-key navigation, per-deal price chart, deal detail, and safety-order ladder); Stats and Analysis reuse the existing tabs.
- "VIEW RESULTS" summary chip in the bot form footer: when a local DCA backtest finishes, the backtest controls morph into a chip showing net %, win rate, and deal count that opens the new results modal.

## [2.8.7] - 2026-06-05

### Added

- Shift-click range selection in data tables
- Strategy column in the bot deals drawer

### Fixed

- Restore the reports params in `getNavigationSections` (they were commented out while call sites still passed them, breaking the build)

## [2.8.6] - 2026-06-04

### Changed

- Capital-required popup: itemize the DCA section into one row per safety order
  (e.g. "DCA 1 (2%) — 100 USDT") with a "Total DCA orders" subtotal, instead of
  a single aggregate row.

### Fixed

- Terminal deal credit cost showed 50 instead of the backend's flat 10; the
  footer now keys the cost off the terminal flag so the chip matches what's
  actually charged.

## [2.8.5] - 2026-06-04

### Changed

- Bot forms always start from default values. Removed the "last used config"
  persistence that restored the previous bot's settings into new forms
  (terminal/DCA/combo/grid/both hedge legs), which surfaced stale values such
  as 5 max open deals in the terminal capital chip. Explicit seeds (curated
  presets, Copy to live, backtest load, clone) still apply via `initialFormData`
  / the `sessionStorage.botConfig` channel.

## [2.8.4] - 2026-06-04

### Fixed

- KuCoin spot candles: send the dashed native symbol (BTC-USDT) instead of the
  app's concatenated pair (BTCUSDT) at the `requestCandles` chokepoint, fixing
  `400100 Unsupported trading pair` on KuCoin backtests and the quick-panel
  risk/market-stats fetch. Other exchanges and KuCoin futures are unchanged.

## [2.8.3] - 2026-06-04

### Changed

- Trading terminal Simple/Smart/Import brought to legacy parity: Buy/Sell side
  buttons (Import inverts Buy→short / Sell→long); Import shows the full Take
  Profit / Stop Loss / DCA / Risk:Reward sections with a labeled entry-price
  field ("Purchased Price" / "Sold Price"); Simple drops Profit Currency and
  futures; the Quick/Manual toggle is shown only for Smart.
- Trading terminal: restore the legacy dual Amount/Total order-size fields
  (both visible, kept in sync via price; focus implies the unit) in place of the
  single Base Order Size field. Applies to Simple/Smart/Import.
- Bot form: move "what it does" helper text into field tooltips across the
  combo, DCA, and grid sections (Deal close type, Base Take Profit/Stop Loss On,
  grid direction/type/range/budget, Dynamic ATR/ADR). Constraints, ranges, and
  computed values stay inline.
- Combo grid strategy: drop the verbose section copy into a tooltip and fold the
  current grid spacing % into the spacing chip (always shown).

### Fixed

- Trading terminal: always keep a pair selected — default to BTC against
  USDT/USDC/USD (else the first available pair) when an exchange is chosen.
- Trading terminal percentage buttons (10–100%) now set the Amount in base
  units instead of applying the quote total as a base amount.
- Trading terminal: switching focus between the Amount and Total fields converts
  the size into the focused unit instead of reinterpreting the stored number.
- Trading terminal Import: balance/max now reads the correct wallet (base for a
  long holding, quote for a short).
- Trading terminal: the Amount field's USD estimate reflects the shown amount;
  tighten the spacing between the Deals/Exchange tabs and the table.
- Hide "Order Size Reference" in the bot form on spot exchanges — it only
  applies to leveraged/futures positions.
- Asset precision: `math.getPrecisionFromDecimalString` now matches the legacy
  `botUtils.getAssetPrecision` exactly — fixes an off-by-one in the multi-zero
  branch (e.g. `0.0003` now resolves to 4 decimals, not 3) and restores the
  Kucoin/paperKucoin path that keeps trailing zeros after the significant digit.
  Pass the pair's exchange to opt into the Kucoin behaviour.

## [2.8.0] - 2026-06-03

### Added

- Trading Terminal "Exchange Orders" tab: raw open exchange orders & positions
  with per-row Cancel / Import actions (import a position as a terminal deal,
  import an order into a smart terminal bot).

### Fixed

- DCA Bot Controller parity with legacy: newly added start/stop indicators are
  now tagged with their `indicatorAction` and `groupId`, so indicator-mode
  start/stop conditions are no longer silently dropped from the saved payload.
- Bot Controller now reconciles indicators when toggled or switched: enabling
  the controller (or switching Bot Start/Stop to indicators) auto-seeds a
  group + indicator, disabling/leaving indicator mode strips them, and empty
  groups are pruned — matching legacy.
- Integer-coerce `closeAfterX` / `closeAfterXopen` on commit; auto-clamp
  `closeAfterXopen` up to the max open deals and validate it is not lower.
- Narrow the multipair reset to only downgrade price-mode triggers to manual
  (indicator mode and entered price values are left intact).
- Restore legacy Bot Controller labels, `deals` / `$` input adornments,
  between-group AND/OR separators, and the global "add indicator (new group)"
  button.

## [2.7.10] - 2026-06-03

### Fixed

- Dynamic AR config missed in SL panel.
- ADR timeframe bug.

## [2.7.9] - 2026-06-03

### Added

- Pair preset selector: list + detail view with ROI / market-cap / volume / RSI
  sort, favorites, and filters. Lazy-loaded and cached, shared with the
  dashboard screener and indicator heatmap.
- Favorite (starred) pairs, persisted locally.
- Fiat currency icons for 30 currencies in the coin/pair icon component
  (previously only USD/EUR had icons; others fell back to first-letter circles).
- Dynamic ATR/ADR ("AR") take-profit / stop-loss mode in the DCA bot form, with
  an inline indicator config.

### Fixed

- Curated preset ROI now resolves on paper accounts — paper provider names
  (e.g. `paperBybit`) are normalized to their real exchange before the curated
  lookup, so risk-profile cards, the strategies drawer, and the curated strip
  all render ROI on both live and paper accounts.
- Dynamic-AR TP/SL now feeds ATR values into the order engine
  (`TP = price + ATR × multiplier`) instead of silently falling back to the
  percentage value.
- Dynamic-AR price study no longer draws its line on the price chart while still
  feeding order-line prices; TP/SL lines are non-draggable in AR mode.

### Changed

- Bot-form pair screener data now lazy-loads on dialog open (5-min cache) instead
  of walking the full screener in the background on bot-form mount.
- Compact ListModal rows with an expandable detail panel (price, 1h/24h/7d/30d
  changes, volume, market cap, RSI, volatility).

## [2.7.8] - 2026-06-02

### Added

- Hyperliquid builder fees.

## [2.7.7] - 2026-06-02

### Fixed

- Deal drawer chart opened from the Trading terminal no longer always shows "No
  chart data is available for the selected timeframe". The terminal passed the
  deal id as `botId`, breaking the bot lookup (and order/smart-order fetches);
  it now passes the real `botId`. The price chart also falls back to the deal's
  own exchange when the parent bot isn't in the live store (terminal deals,
  whose bots load with `terminal: false`), so the candlestick chart resolves.
- Exchange chip in the deal drawer truncates its label instead of overflowing
  the card when the exchange name is long.
- Bot-form investment slider now percentages off the real free balance of the
  selected asset (read from the live balance store), and never falls back to the
  exchange's total USD balance — that figure is denominated in the settlement
  asset and was wrong for a different quote asset (e.g. USDC vs USDT). A 0 now
  shows as a real 0.

## [2.7.6] - 2026-06-02

### Fixed

- Combo/DCA deal lists no longer merge live and paper deals on a trading-context
  switch. Deal queries now request the `paperContext` field (exposed by the
  backend) so each deal is scoped to its true context instead of being inferred
  from the active mode (which mis-tagged placeholder data during the switch).

### Added

- Trading-mode toggle (badge + sidebar/navbar switches) shows a spinner while
  the newly-selected context's data loads.

## [2.7.5] - 2026-06-02

### Fixed

- Base Order Size input now updates its coin icon when the currency reference
  is switched (base/quote/USD), matching the DCA order amount input. Both inputs
  share `resolveOrderSizeIconSymbol`.
- Footer "Capital required" chip now derives the whole-bot total from the same
  example-orders deal summary the DCA overview "Total Funds" tile uses (new
  `useBotDealCapital` hook), so the two agree when the order size is referenced
  in the base currency — previously the chip recomputed it standalone and
  mismatched.

## [2.7.4] - 2026-06-01

### Fixed

- Closing or canceling a deal now removes it from the active list immediately
  instead of waiting on a websocket update (there is no polling fallback):
  close/cancel/move optimistically update the deal store (cancel → canceled,
  leave/market-close → closed, move → dropped from the bot), and the deals
  list no longer resurrects a just-closed deal from its last-fetch snapshot.

### Changed

- Indicator configuration parity pass: interval-type fields filter their
  options to the selected exchange's supported candle intervals; STOCH band
  fields resolve the correct param key from `stochRange`; related bot-form
  section, indicator-dialog, and bot-card refactors.

## [2.7.3] - 2026-06-01

### Added

- Cancel button on a deal's pending DCA / add-funds / reduce-funds orders
  (parity with the legacy dashboard), with a confirmation dialog. Routes an
  add/reduce-funds order to `cancelPendingAddFundsDealOrder` and a plain
  order to `cancelTerminalDealOrder`, matching legacy.
- Deal detail is deep-linkable: opening a deal reflects `?dealId=` in the
  URL and a direct link re-opens it (one-shot, so Back/Close still work).
- Trial funnel analytics: a `trial_dialog_shown` event (with `source`)
  alongside `trial_started`, via a dedicated `trialEvents` registry.

### Fixed

- Canceling a deal order no longer fails with "Cannot access" — the cancel
  mutations now send the auth token + paper-context like every other call.
- An order canceled in another client no longer reappears — pending orders
  are re-fetched fresh and reconciled instead of restored stale from cache.

### Changed

- Deal cards in the bot drawer read clearly against the panel (elevation
  instead of blending into the glass surface).

## [2.7.2] - 2026-05-31

### Changed

- Bot form save row: cost moved out of the Create button into its own
  credits chip on the left (hover shows the per-component breakdown, now
  with decimals), added a "capital required" chip beside it (same
  token-icon-then-amount format; hover shows base orders / safety orders
  / available balance / % of available), and moved "Save as template"
  into the row's overflow (⋮) menu — so the save row now mirrors the
  backtest row's chips-left / button + menu-right layout. The capital
  chip follows the deposit side, showing the base coin + quantity for
  spot short / COIN-M futures instead of the quote amount.
- Help links across the bot form and the connect-exchange screen now
  render as `HelpArticlePill`s backed by a shared `helpUrl` parser;
  `Tooltip` was slimmed down to reuse them. Corrected/added help-article
  links on several settings rows (DCA type, smart grid orders, profit
  currency, reinvest).

### Fixed

- Saving a bot template with a hotkey no longer throws "Maximum update
  depth exceeded" — the template-shortcut sync effect no longer re-fires
  on the shortcut-store writes it triggers itself.

## [2.7.1] - 2026-05-31

### Added

- Bot events drawer: coin-pair icons and click-to-copy order/deal ID chips.

### Changed

- Bot events drawer now categorizes, searches, and paginates server-side
  (fetches a handful per tab via the `getBotEvents` `category`/`counts`
  fields). The "Recent" tab is the full activity feed; "Deals"/"Alerts" are
  filtered subsets. "Load more" is pinned at the bottom; event messages are
  click-to-expand.

### Fixed

- Bot events: order errors no longer render as completed "Sell Closed" trades;
  the event time is shown once (no longer duplicated); the year is hidden
  unless an event is over a year old.
- `copyToClipboard` falls back to `execCommand` when the async Clipboard API is
  unavailable or blocked, so copy works in more contexts.

## [2.7.0] - 2026-05-30

### Added

- Trial provider adapter (`useTrial` / `registerTrialProvider`) and an
  `exchange.trialPrompt` slot so the connect-exchange picker can offer
  premium exchanges behind a start-trial prompt for trial-eligible users.
- Error bots now surface their failure reason as a tooltip on the status
  chip (bot cards + Trading/Combo/Grid bot lists), via a new optional
  `tooltip` prop on `StatusChip`.

### Changed

- Premium exchanges are now selectable (tagged "Trial") for free users
  who still have a trial available; picking one opens the start-trial
  prompt instead of showing a disabled "(upgrade to use)" row. Once the
  trial is used up they revert to the disabled rows.
- Added `patch-package` with a `@radix-ui/react-compose-refs` patch that
  fixes ref-cleanup handling.

### Fixed

- DCA deal usage % now reads the base side for short spot / COIN-M deals
  instead of always the quote side, which made short combos and coin-m
  deals report 0% usage.

## [2.6.4] - 2026-05-30

### Added

- Top Deals widget on the Overview dashboard: ranks active deals by cost
  (default), value, unrealized PnL, PnL %, realized profit, or age, with a
  card/table view and the ranking selector in the table toolbar.

### Changed

- Login page now reads "Sign in or sign up" with a clearer subheading on
  cloud, so new users see they can create an account from the same page.
- Deal cards now surface the creation date/time as a tooltip on the
  trade-duration chip instead of a dedicated cell.

### Fixed

- Deal card hover actions are scoped per card again, so hovering one card no
  longer reveals every card's action buttons when shown inside a dashboard
  widget.

## [2.6.3] - 2026-05-29

### Added

- `isTrialAvailable` user query and an auth-store `refreshUser` action to
  re-fetch the user (subscription, balance, credits) after a plan change
  without clearing the session on a transient failure.

### Changed

- DCA "Total Funds" tile now shows base-currency funds for spot-short and
  coin-M futures bots (quote `$` figure unchanged for everything else).
- Base order section stays visible in DCA strategy settings even when
  editing a bot that has active deals.
- Error screen now includes the error stack and React component stack.

## [2.6.2] - 2026-05-29

### Changed

- Live stores hydration is now serialized through a single
  `liveStoreHydrationQueue` so the eight heavy IndexedDB-persisted
  stores (dca/combo/grid/hedge bots, transactions, deals, orders) read
  their blobs one at a time with a `requestIdleCallback` yield between
  each. Peak hydration heap drops from roughly the sum of all eight
  structured-clone payloads to roughly the largest single payload,
  which prevents the OOM tab crashes a heavy-trading user could hit on
  Windows Chrome (lower per-tab heap budget than macOS). No data or
  API change: existing stores just opt in via the new
  `createQueuedIndexedDBStorage` factory. Lightweight stores (UI
  settings, theme, etc.) keep `createIndexedDBStorage` — the queue
  overhead isn't worth it for small blobs.

## [2.6.1] - 2026-05-28

### Changed

- Bot forms: Quick / Manual toggle uses a clearly-visible primary-tinted
  pill for the selected option (matches the existing subtab pattern)
  instead of a subtle card-surface fill.
- Bot forms: when exchange/pair info loads, persisted amounts below the
  exchange minimum are now silently raised to the minimum (rounded up
  to the next valid step) instead of being shown as validation errors.
  Covers DCA base order + DCA step, Combo base + step, Grid budget,
  Terminal, and both Hedge legs. The bumped value is persisted back
  through the form's setter; values the user is editing are left
  alone. A single "Adjusted amounts to exchange minimum" info toast
  fires per bump pass.
- Info toasts trimmed across the app: removed the noisy "Downloading
  candles in background" and the per-pair "User fee for X is N%"
  notices (both fire during routine form interaction). Converted six
  user-action-with-caveat toasts from `info` to `warning`, and the
  backtest-requested confirmation to `success`. Added a Toasts policy
  section to `DESIGN_SYSTEM.md`.

## [2.6.0] - 2026-05-28

### Added

- Admin page to manage running containers, choose exchanges, and upgrade images.

## [2.5.2] - 2026-05-28

### Fixed

- Bot forms (DCA / Terminal / Combo / Grid / Hedge): removed unintended
  auto-focus on the budget / base-order input so opening a new or edit
  page no longer jumps to that field.
- Combo bot form: restored the Backtest period / timeframe / run row
  above the Save Bot button (it had stopped rendering for combo).
- Combo bot form: budget input now shows the actual quote symbol
  instead of the literal "Quote" / "BAL 0 QUOTE" placeholder — combo
  inherits the normalized pair-key lookup from DCA's trading context.
- Combo bot form: "Combo grid strategy" section no longer introduces a
  border / extra elevation inside the parent card; matches the
  surrounding form per DESIGN_SYSTEM.md.
- Combo bot form: DCA Overview Total funds now includes the notional
  cost reserved by minigrid orders, not just the base order.
- Combo bot form: DCA Overview defaults to the orders table and hides
  the price graph — the graph rendered minigrid lines as if they were
  stop-loss / take-profit and didn't scale to combos with many grids.
  DCA and Grid forms keep their graph.

## [2.5.1] - 2026-05-28

### Changed

- Grid bot strategy settings: on futures exchanges (linear or coin-m),
  Profit Currency and Order Fixed In are now auto-set to match the
  margin asset and the corresponding rows are hidden — the user can't
  earn or denominate orders in anything other than the margin asset.
  Linear futures: `profitCurrency='quote'`, `orderFixedIn='base'`.
  Coin-m futures: `profitCurrency='quote'`, `orderFixedIn='quote'`.
- Grid bot strategy settings: replaced the broken custom Leverage input
  with the same Margin & Leverage block DCA/Combo use — Margin Type
  selector (isolated/cross), leverage NumberInput + LeverageSlider,
  per-pair max-leverage cap from `getLeverageBracket`, paper-trading +
  active-deals locking, and the standard notices. Factored the JSX into
  a shared `<MarginLeverageBlock />` component so the three bot types
  stay in sync. Fixes the `Leverage ? [object Object]` rendering that
  came from stringifying the GridLeverageState object.

### Fixed

- CoinSelect: picking a new pair via the swap (↔) icon on the trading-
  pair chip now actually updates the chart, backtest button, example
  orders, and risk-profile prices. The dialog returned a dashed
  `BTC-USDT` and the replace path wrote it straight to `formData.pair`,
  but the rest of the form keys `pairMetadata` by the undashed form
  (`BTCUSDT`) — the downstream lookup missed and every dependent panel
  stayed on the old pair. Normalize the symbol on write to match the
  regular add-pair flow.
- DCA bot view dialog (`/bot/view/<id>?tab=settings`): "DCA order
  amount" fields showed the USDT icon regardless of the bot's actual
  quote asset (e.g. a Hyperliquid BTC-USDC bot still displayed USDT).
  Root cause: `DCASettings` called `useDcaTradingContext(formData)`
  without the `bot` fallback, so when `ReadOnlyBotForm` seeded an empty
  `formData.pairMetadata` (no exchange query in readonly), the trading
  context's `quoteAsset` resolved to `undefined` → CoinIcon defaulted to
  USDT. Strategy Settings already passed `bot` for the same fallback;
  DCA Settings now matches.

## [2.5.0] - 2026-05-28

### Added

- Unified bot-list KPI strip: a shared `BotListStatsBoxes` component
  rendering Active Bots / Total P&L / Capital Deployed across DCA,
  Grid, Combo, HedgeDca, HedgeCombo, and the Trading page. Single
  source of truth via `computeBotListStats` + `combineBotListStats`
  in `useBotListStats`; each bot type passes its records through a
  small adapter into the same normalized shape.
- Hedge DCA / Hedge Combo bot list pages: KPI stats strip in the
  header (was previously stats-less). Sums per-leg `profit/assets/
dealsInBot` since the hedge wrapper doesn't aggregate those.
- IndicatorConfigurationModal / InlineIndicatorConfig: per-field
  global-variable binding via `FieldVariableBinding` — bind indicator
  parameters to global variables instead of hard-coding values.
- DetailDrawer body: bottom spacer on mobile so the last item clears
  the floating bottom-nav and remains scrollable into view.

### Changed

- VariableChip: more compact layout (smaller padding, rounded-lg, no
  Link2 icon prefix) to fit denser indicator/setting rows.
- EmptyState placement on TradingBots / GridBots / ComboBots /
  HedgeDcaBots / HedgeComboBots: hoisted above the DataTable instead
  of being passed via `emptyContent`, matching the page-level
  empty-state pattern used elsewhere.
- DrawerDealsTable: trade-row clicks no longer force-open the detail
  drawer; respects the user's previously-selected drawer state.
- Exchanges page: `WidgetContainer layout="grid"` → `"flex"`; lets
  the inner exchange cards / table choose their own width without
  being stretched by an outer grid.

### Fixed

- ComboBots stats: "Accumulated Profit" and "Profit By Day" were both
  showing the same value as "Total Profit". Replaced with the unified
  KPI strip; the duplicate-value placeholders are gone.
- GridBots stats: "Accumulated Profit" duplicated "Total Profit", and
  "Profit By Day / Recent daily" was actually today's profit, not a
  daily average. Replaced with the unified KPI strip.
- DCA bot stats `activeBots` only counted `status === 'open'` — bots
  in `error/range/monitoring` were missing. Now uses canonical
  `isBotActive` from `botStatusUtils.ts`.
- Trading page stats aggregator: missing `'error'` from the active
  status list when fetching DCA/Combo/Grid bots — error-state bots
  were excluded from Total P&L and capital totals.
- Trading page Total Profit no longer drops Grid bots' unrealized
  PnL on the floor (the per-deal aggregator hardcoded `0` for Grid).
  Replaced with the bot-list aggregator that sums Grid profits in
  full.

## [2.4.2] - 2026-05-27

### Added

- NavigationSidebar: third "hidden" mode in addition to pinned /
  unpinned. Drag the right-edge handle further left from collapsed to
  fully hide; the sidebar reappears as an overlay when the cursor
  hovers the left viewport edge. Persisted via
  `navigationSidebarHidden` in `uiStore`. Short rightward drag from
  hidden restores hover-mode; long drag re-pins.
- OpenOrdersWidget: totals row footer for Realized P&L, Unrealized
  P&L, Net P&L, Cost, and Notional Value columns. Color-coded P&L
  totals (success/destructive) and respects privacy mode.
- BotForm: reset scroll to top when toggling between Quick and Manual
  modes so the scroll-spy doesn't promote whichever section happened
  to be visible at the previous offset.

### Fixed

- BotFormAlertSummary: long validation chips (e.g. "Base order amount
  must be more than 10 USDC") now truncate inside their parent row.
  Previous SettingsAlert-only fix didn't help because the chip lived
  inside a content-sized button → div chain where `max-w-full` had
  nothing definite to reference. Propagate `w-full min-w-0` down the
  alert summary's wrapper and trigger button so the chip's `max-w-full`
  resolves to the actual alerts-row width.

## [2.4.1] - 2026-05-27

### Fixed

- SettingsAlert: long warning/error chips (e.g. "Base order amount
  must be more than 10 USDC") now actually truncate inside their
  parent. Previous fix used `inline-flex max-w-full`, which doesn't
  reliably constrain when the parent has no explicit width — switched
  to `flex w-fit max-w-full` so the chip stays content-sized but is
  firmly capped at the parent's resolved width, and the inner span's
  `truncate` kicks in with an ellipsis.

## [2.4.0] - 2026-05-27

### Changed

- Single-bot Duplicate (DCA / Grid / Combo) now navigates to
  `/<route>/new?load=<id>` and opens the new-bot form pre-seeded from
  the source, matching the hedge clone flow. Previously the non-hedge
  flows silently created a new bot via API and only fired a toast.
  Bulk-clone paths (where they exist) keep the API-only behavior.

### Fixed

- DCA bot details "Clone" button navigated to `/bot/new?clone=<id>`,
  a param nothing read; switched to the `?load=` convention so it
  actually seeds the form.

## [2.3.0] - 2026-05-27

### Added

- `firstToolbarActionsCompact`, `customToolbarActionsCompact`,
  `finalToolbarActionsCompact` on DataTable — caller supplies a narrow
  variant of any toolbar action. When provided the responsive row swaps
  to the compact content under pressure instead of moving the action to
  the overflow menu, so caller-supplied buttons stay visible at any
  width.
- ResponsiveButtonRow publishes `onLayoutMetrics` with the actual width
  it needs to render every visible button at full size, letting the
  data-table size the inline search dynamically — no hard-coded width
  threshold.

### Changed

- ResponsiveButtonRow overflow algorithm simplified back to pure
  priority-based progression: compact lowest-priority buttons first,
  overflow lowest-priority first only after full compaction. The
  "smart single removal" heuristic was hiding caller-passed actions
  too eagerly; pure priority respects the caller's importance order.
- All custom toolbar actions across pages now share the ghost+labeled
  style with icon-only compact fallbacks: TradingBots / ComboBots /
  GridBots Archive toggles, GlobalVariables Refresh / Save / Cancel /
  Import / Add Variable, Exchanges Add Exchange, OpenOrdersWidget /
  DrawerDealsTable status filter and Open Deal button.

## [2.2.1] - 2026-05-27

### Changed

- Toolbar custom actions (Archive toggle on Trading/Combo/Grid bots,
  Refresh on Global Variables) now use the same ghost+labeled style
  as the standard toolbar buttons. Cards-mode Filters button on the
  bot listings switches to ghost too.
- Inline-search expansion threshold lowered from 900px to 400px so
  most tables show the expanded input by default; the icon-only fallback
  is reserved for genuinely cramped toolbars.

## [2.2.0] - 2026-05-27

### Added

- DataTable toolbar buttons now show icon + label (Resize, Filters,
  Columns, Cards) when there's room; compactContent stays icon-only
  for narrow widths.
- Search input collapses to a magnifying-glass button below a high
  toolbar-width threshold and expands as an absolute overlay on tap
  — overlay has rounded corners and ring border so it reads as a
  distinct element on any surface.

### Changed

- ResponsiveButtonRow overflow algorithm: progressive compaction is
  now interleaved with a single-button overflow probe. After each
  compaction step we re-check whether overflowing one wide hidable
  button alone would now fit — so labels drop one at a time and a
  wide caller-provided action overflows before utility icons.
- Responsive container switched to `flex-nowrap` + `min-w-0` so
  the row no longer briefly wraps to two lines during resize.
- All DataTable toolbar + pagination buttons use `variant="ghost"`
  (filter still uses `default` when active).
- DataTable toolbar button priorities reshuffled so card/list-view
  toggle sits just below column-visibility (which is neverOverflow).

### Fixed

- ResponsiveButtonRow no longer reserves overflow-menu space
  preemptively when there are no custom menu items; reservation
  happens only when a button actually needs to overflow.

## [2.1.3] - 2026-05-27

### Fixed

- Notifications: bot rows now mark-as-read server-side via
  `deleteBotMessage` (parity with legacy). Previously the single-row
  action sent `NaN` to `readPlatformNotificationByUser` and the bulk
  action only wrote to localStorage, leaving read state per-device
  and out of sync with the server.

### Removed

- `localStorage["readBotNotifications"]` client-side read tracking
  for bot notifications; bot read state is now backend-owned. The
  stale key is purged once on load.

## [2.1.2] - 2026-05-27

### Added

- Hedge bot tables (DCA + Combo): Name, Cost, Max cost, Avg daily,
  Annualized columns — closes the remaining gap with the standalone
  trading-bots table.

## [2.1.1] - 2026-05-27

### Changed

- Card primitive: no default border (surface contrast separates cards
  from the page background per DESIGN_SYSTEM.md §3); padding now uses
  spacing tokens (`py-md md:py-lg`, `px-md md:px-lg`) so it tracks
  compact / comfortable density.

### Fixed

- Card primitive: `min-w-0` so wide children (tables) shrink within
  constrained parents — their own `overflow-x-auto` actually scrolls
  instead of blowing out the layout.
- Settings page: horizontal-scroll bug on tablet / mobile when the
  API-keys or notification tables were visible.
- Settings page: spacing now matches Overview's density-toggle
  convention (`xs` compact ↔ `md` comfortable), outer page padding
  comes from `WidgetContainer` instead of being double-applied.
- Settings sidebar nav: rounded corners and outer margins on mobile.

## [2.1.0] - 2026-05-27

### Added

- Hedge bot card: full info parity with the standalone trading-bots
  card — Cost (current / max), Avg Daily, Annualized, total Deals; per
  leg now also shows Usage, Cost, Deals, Profit, and Unrealized PnL.
- Hedge bot card menu: full action set (Star, Start/Stop, Restart,
  Edit, Clone, View Backtests, Share Configuration, Duplicate, Archive,
  Delete) via the shared BotActionsMenuItems.
- Hedge bot tables (DCA + Combo): Long exchange, Short exchange, and
  Deals columns, plus a per-row actions cell mirroring the card menu.
- Hedge bot Clone: list-page Clone navigates to `/hedge/{bot|combo}/new?load=<id>`,
  the new-bot form fetches the source hedge bot, seeds both legs, and
  appends "(copy)" to each leg's name — matches the legacy duplicate
  flow.

### Changed

- Hedge bot card: leg tiles now use `bg-card` over the outer `bg-muted`
  (no border) per the surface ladder, replacing the previous
  border-heavy inset.
- HedgeBotFormProvider: `?load=<botId>` works in create mode too (the
  fetch was previously gated on edit mode, so clone-from-template was
  silently a no-op).
- useBotDelete: removes hedge bots from the hedge live stores so the
  list updates immediately on delete instead of waiting for a websocket
  refresh.
- computeHedgeUnPnl: also returns combined avgDaily / avgDailyPerc /
  annualizedReturn and per-leg cost, max cost, unrealized PnL, and
  utilisation so the card can render them without re-deriving.

## [2.0.2] - 2026-05-26

### Fixed

- SettingsAlert: long warning/error chips now truncate inside their
  container instead of overflowing the parent.
- NavigationSidebar: stop the hover-elevated sidebar from flickering on
  top of an open drawer/dialog while it is being resized — CSS
  `:has([role="dialog"][aria-modal="true"])` rule keeps the sidebar
  below the drawer whenever a modal is open.
- Bot drawer sticky tab nav: bumped z-index above the section content
  so inner Tabs labels (deal-start modes, take-profit type) no longer
  bleed through the translucent sticky bar.
- CoinSelect: drop the redesign-only quote/base filter that hid valid
  pairs when replacing the only configured pair.

### Changed

- SettingsRow: transparent by default. Stacked rows now rely on
  spacing/typography instead of an extra `bg-card` surface.
- Bot form sub-nav (`ScrollableFormTabNavigation`): square pill tabs
  (`rounded-md`) with `border-primary/60 bg-primary/10` active state;
  removed the double bottom-border and tightened padding/height.
- Read-only bot form sticky nav: floating rounded bar with translucent
  `bg-background/80` + `backdrop-blur` (matches the edit form pattern).
- DealStartSettings: shortened pair-prioritization descriptions to
  match the cleaner row spacing.

## [2.0.1] - 2026-05-26

### Fixed

- DataTable: actions column now renders last and stays pinned to the right
  edge. Two underlying bugs are addressed: `defaultColumnOrder` was emitting
  `accessorKey` strings react-table couldn't resolve (so it auto-appended
  mismatched columns past any right-pin), and the effective `state.columnOrder`
  did not reorder pinned columns. Pinned-right columns are also merged with
  defaults so stale persisted preferences no longer suppress a newly declared
  default pin.

## [2.0.0] - 2026-05-26

### Added

- First release of the v2 dashboard as `@gainium/main-dash-sh`. Vite/React SPA
  replacing the previous Next.js `main-dash` build (now shipped as the
  `frontend-legacy` image).
- Hedge bots: full Quick + Manual editor, local backtesting (no SSB variant),
  history table with bulk Delete + Export-as-JSON, Combined / Long / Short
  active view, DataTable-driven Backtests insights tab with count badge.
- Risk:Reward runtime: chart indicator callback wired through
  `RiskRewardRuntimeContext` so indicator-driven SL/TP updates land in the form.
- Backtest UX parity with DCA/Combo: footer inline progress, dialog progress,
  candle caching, profit-currency derived from `futures/coinm/profitCurrency`.
- TradingView chart: `iframe_loading_same_origin` enabled (load-bearing for
  v28 chunk loading); custom indicator value callback plumbed through
  `custom_indicators_getter`.
