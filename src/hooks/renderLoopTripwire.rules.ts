/**
 * The render-loop tripwire's tunables and its judgement — the whole of what
 * decides whether a burst of renders is a defect or normal traffic.
 *
 * Deliberately a separate, DEPENDENCY-FREE module: the hook itself pulls in the
 * logger, the auth store and a GraphQL client, none of which a test of this
 * decision should have to stand up. See tests/renderLoopTripwire.unit.test.ts.
 */

/** Renders are counted in fixed windows of this length. */
export const WINDOW_MS = 1000;

/**
 * Renders per window that mark it "elevated".
 *
 * This was 25, and 25 is BELOW the rate at which this app's own data arrives.
 *
 * On live pages (/bot/view?tab=deals, /grid/edit, /combo/view) the socket
 * delivers a burst of store writes, each one re-rendering the subscribing
 * subtree. Measured over the 21 days to 2026-08-14: of the 60 trips in the
 * error feed, all 34 production trips carrying socket breadcrumbs filled the
 * 30-entry breadcrumb buffer in 137-933ms — 32 to 219 messages per second — and
 * every one of them changed props on every render. The wire was reporting the
 * socket tick rate, not a loop.
 *
 * That cost eight issues on ResponsiveButtonRow alone (#119 #259 #355 #356 #381
 * #394 #411 #412) which fixed six call sites and found no defect, because no
 * call site can render slower than the data it renders. Zero React #185 crashes
 * in that window involved a component this wire had reported.
 *
 * 300 sits above the fastest observed data rate with headroom and far below a
 * real runaway: React's own ceiling is ~50 NESTED updates, which a genuine #185
 * reaches inside a single frame — thousands per second, not hundreds. The wire
 * was always best-effort against an instant crash; this only stops it firing on
 * traffic that is merely fast.
 */
export const WINDOW_LIMIT = 300;

/**
 * Require the elevated rate to persist across at least this many CONSECUTIVE
 * windows before reporting. A single mount/hydration burst reliably settles
 * within ~1s (one window), so a one-off spike does not trip the wire. A genuine
 * runaway keeps blowing past the limit window after window, so it still trips
 * almost immediately.
 */
export const CONSECUTIVE_WINDOWS = 2;

/**
 * Share of a window's renders that must have changed NO props before the wire
 * reports.
 *
 * A render whose props are all identical is the shape of a SELF-driven loop:
 * something inside the component set state and came straight back. A render
 * with changed props is the app doing work — new data arrived. Only the first
 * kind is evidence of the defect this wire exists to catch, and telling them
 * apart is what a bare renders-per-second threshold cannot do. In the sample
 * above this alone would have suppressed 34 of the 37 production trips.
 *
 * Caveat, deliberately accepted: on a component that is NOT memoised, a parent
 * re-render always re-renders the child regardless of props, so "no prop
 * change" is common and benign there too. It is still directionally right — a
 * component rendering past WINDOW_LIMIT with unchanged props is pathological
 * either way — and it is paired with the raised limit, not relied on alone.
 */
export const SELF_DRIVEN_RATIO = 0.5;

/** How many render diffs to keep for the report. */
export const HISTORY_LEN = 10;

/**
 * StrictMode double-invokes render in development, so a dev window counts twice
 * the renders a user's browser would — the effective threshold there is half.
 * 23 of the 60 trips in the sample above were mode:"development" from a single
 * machine. Correct the threshold rather than disarming the wire in dev, so a
 * local runaway still trips.
 */
export const renderLimit = (isDev: boolean): number =>
  isDev ? WINDOW_LIMIT * 2 : WINDOW_LIMIT;

/**
 * Whether the current window is worth reporting.
 *
 * @param w      renders so far in the window, how many of them changed no
 *               props, and how many consecutive prior windows were elevated
 * @param limit  renders/window that count as elevated (see `renderLimit`)
 */
export function isReportableBurst(
  w: { count: number; selfDriven: number; elevatedWindows: number },
  limit: number
): boolean {
  // Fast enough to matter…
  if (w.count <= limit) return false;
  // …sustained, not a one-off mount/hydration spike…
  if (w.elevatedWindows < CONSECUTIVE_WINDOWS - 1) return false;
  // …and driven from INSIDE, not by data arriving from outside.
  return w.selfDriven >= w.count * SELF_DRIVEN_RATIO;
}
