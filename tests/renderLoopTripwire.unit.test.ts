import { test, expect } from '@playwright/test';

import {
  isReportableBurst,
  renderLimit,
} from '@/hooks/renderLoopTripwire.rules';

/**
 * The render-loop tripwire's judgement, pinned against real measured traffic.
 *
 * Background: the wire's threshold was 25 renders/second, which is BELOW the
 * rate at which this dashboard's own data arrives. Measured over the 21 days to
 * 2026-08-14, every production trip carrying socket breadcrumbs showed the
 * socket delivering 32-219 messages/second, each one re-rendering the
 * subscribing subtree with CHANGED props. The wire was reporting the socket
 * tick rate. It cost eight issues on ResponsiveButtonRow (#119 #259 #355 #356
 * #381 #394 #411 #412) which fixed six call sites and found no defect.
 *
 * These tests exist so the next person who touches the threshold has to move
 * them deliberately.
 */
test.describe('renderLimit', () => {
  test('development doubles the limit to absorb StrictMode', () => {
    // StrictMode double-invokes render, so a dev window counts twice the
    // renders a user's browser would. 23 of the 60 trips in the sample above
    // were dev builds on one machine.
    expect(renderLimit(true)).toBe(renderLimit(false) * 2);
  });

  test('the production limit clears the fastest observed data rate', () => {
    // Fastest measured socket burst: 30 breadcrumbs in 137ms = 219/s.
    expect(renderLimit(false)).toBeGreaterThan(219);
  });
});

test.describe('isReportableBurst', () => {
  const limit = renderLimit(false);

  test('socket-driven churn does not report, however fast', () => {
    // The exact shape of all 34 production trips that had socket breadcrumbs:
    // over the limit, sustained, and every render carried changed props.
    expect(
      isReportableBurst(
        { count: limit + 200, selfDriven: 0, elevatedWindows: 1 },
        limit
      )
    ).toBe(false);
  });

  test('a genuine self-driven loop still reports', () => {
    // A component setting state from its own render/effect comes straight back
    // with identical props. This is the failure the wire is for.
    expect(
      isReportableBurst(
        { count: limit + 200, selfDriven: limit + 200, elevatedWindows: 1 },
        limit
      )
    ).toBe(true);
  });

  test('a resize burst on a memoised row does not report at these rates', () => {
    // Issue #412: 26 renders with no prop change, following seven real window
    // resizes. Self-driven by the ratio, but nowhere near the render rate a
    // runaway produces — the raised limit is what disqualifies it.
    expect(
      isReportableBurst({ count: 26, selfDriven: 26, elevatedWindows: 1 }, limit)
    ).toBe(false);
  });

  test('a single elevated window is not enough — the burst must be sustained', () => {
    expect(
      isReportableBurst(
        { count: limit + 200, selfDriven: limit + 200, elevatedWindows: 0 },
        limit
      )
    ).toBe(false);
  });

  test('a mixed burst reports only once self-driven renders are the majority', () => {
    const count = limit + 100;
    expect(
      isReportableBurst(
        { count, selfDriven: Math.floor(count * 0.49), elevatedWindows: 1 },
        limit
      )
    ).toBe(false);
    expect(
      isReportableBurst(
        { count, selfDriven: Math.ceil(count * 0.51), elevatedWindows: 1 },
        limit
      )
    ).toBe(true);
  });

  test('a quiet window never reports', () => {
    expect(
      isReportableBurst({ count: 5, selfDriven: 5, elevatedWindows: 9 }, limit)
    ).toBe(false);
  });
});
