import { test, expect } from '@playwright/test';

import {
  collectCrashState,
  registerCrashStateProvider,
} from '@/lib/crashBreadcrumbs';

/**
 * Crash state providers — the "what was the app CONFIGURED as" half of a crash
 * report.
 *
 * Background: a recurring React #185 render-loop report (#425 #449 #457 #503
 * #528 #575) kept being closed without a reproduction. The reports carried a
 * componentStack and a breadcrumb trail — what the user DID — but nothing about
 * which bot type, tab or preset was selected, which is the session-specific
 * data the repro needed.
 *
 * Two properties matter enough to pin: the collector must never let one bad
 * provider cost us the whole report, and it must bound its own size, because
 * the payload is smuggled through a rigid `sendError` string field into a
 * long-lived feed.
 */

test.describe('collectCrashState', () => {
  test('returns undefined when nothing is registered', () => {
    expect(collectCrashState()).toBeUndefined();
  });

  test('merges registered providers under their keys', () => {
    const off = registerCrashStateProvider('botForm:x', () => ({
      mode: 'create',
      activeTab: 'basic',
    }));
    expect(collectCrashState()).toEqual({
      'botForm:x': { mode: 'create', activeTab: 'basic' },
    });
    off();
    expect(collectCrashState()).toBeUndefined();
  });

  test('unregister removes only its own provider', () => {
    const offA = registerCrashStateProvider('a', () => ({ v: 1 }));
    const offB = registerCrashStateProvider('b', () => ({ v: 2 }));
    offA();
    expect(collectCrashState()).toEqual({ b: { v: 2 } });
    offB();
  });

  test('a throwing provider is isolated, not fatal to the report', () => {
    const offBad = registerCrashStateProvider('bad', () => {
      throw new Error('boom');
    });
    const offGood = registerCrashStateProvider('good', () => ({ ok: true }));

    const state = collectCrashState();
    // The good provider still lands — this is the whole point.
    expect(state?.['good']).toEqual({ ok: true });
    expect(state?.['bad']).toBe('[provider threw]');

    offBad();
    offGood();
  });

  test('long strings are truncated rather than dropped', () => {
    const off = registerCrashStateProvider('s', () => ({
      name: 'x'.repeat(500),
    }));
    const value = (collectCrashState()?.['s'] as Record<string, string>)[
      'name'
    ];
    // Still identifiable, but bounded.
    expect(value.length).toBeLessThanOrEqual(65);
    expect(value.endsWith('…')).toBe(true);
    off();
  });

  test('nesting is flattened at depth 1 so a whole store cannot be dumped', () => {
    const off = registerCrashStateProvider('deep', () => ({
      shallow: { a: 1 },
      deeper: { a: { b: { c: 1 } } },
    }));
    const state = collectCrashState()?.['deep'] as Record<string, unknown>;
    expect(state['shallow']).toEqual({ a: 1 });
    // One level down, objects are described rather than embedded.
    expect((state['deeper'] as Record<string, unknown>)['a']).toBe('[object]');
    off();
  });

  test('functions are described, never serialized', () => {
    const off = registerCrashStateProvider('fn', () => ({
      onChange: () => undefined,
    }));
    expect((collectCrashState()?.['fn'] as Record<string, unknown>)['onChange'])
      .toBe('[function]');
    off();
  });

  test('key truncation names what it dropped, never silently', () => {
    // Regression: the cap was 12 while the bot-form provider registered 14
    // fields, so `errorFields` vanished from every report and the payload still
    // looked complete. Verified live in the terminal preview before the fix.
    const off = registerCrashStateProvider('wide', () => {
      const bag: Record<string, number> = {};
      for (let i = 0; i < 30; i++) bag[`f${i}`] = i;
      return bag;
    });
    const state = collectCrashState()?.['wide'] as Record<string, unknown>;
    expect(state['f23']).toBe(23);
    expect(state['f24']).toBeUndefined();
    expect(state['_truncated']).toEqual(['f24', 'f25', 'f26', 'f27', 'f28', 'f29']);
    off();
  });

  test('a provider at the real registered width is not truncated', () => {
    // The bot-form provider's actual field count. If someone tightens the cap
    // again, this fails instead of the data quietly disappearing.
    const off = registerCrashStateProvider('botForm:x', () => ({
      botType: 'dca',
      mode: 'create',
      variant: 'panel',
      activeTab: 'basic',
      quickSetupMode: 'manual',
      isNestedLeg: false,
      isDirty: true,
      isReadOnly: false,
      isLoading: false,
      isEditable: true,
      hasRestoredDraft: false,
      pairCount: 1,
      errorFields: ['baseOrderSize'],
      hasActiveChartPair: false,
    }));
    const state = collectCrashState()?.['botForm:x'] as Record<string, unknown>;
    expect(state['_truncated']).toBeUndefined();
    expect(state['errorFields']).toEqual(['baseOrderSize']);
    expect(state['hasActiveChartPair']).toBe(false);
    off();
  });

  test('a single provider is already bounded by the per-value caps', () => {
    // Worth pinning: the string/key caps mean ONE provider cannot on its own
    // reach the block ceiling (12 keys x ~65 chars is well under 1500). The
    // ceiling exists for the multi-provider case below — a terminal form, a
    // page form and two hedge legs are all mounted at once.
    const off = registerCrashStateProvider('one', () => {
      const bag: Record<string, string> = {};
      for (let i = 0; i < 40; i++) bag[`k${i}`] = 'y'.repeat(200);
      return bag;
    });
    const serialized = JSON.stringify(collectCrashState());
    expect(serialized.length).toBeLessThanOrEqual(1500);
    off();
  });

  test('oversized providers are dropped whole, keeping the JSON parseable', () => {
    const offs = [0, 1, 2, 3].map((n) =>
      registerCrashStateProvider(`big${n}`, () => {
        const bag: Record<string, string> = {};
        for (let i = 0; i < 12; i++) bag[`k${i}`] = 'y'.repeat(200);
        return bag;
      })
    );
    const offSmall = registerCrashStateProvider('small', () => ({ v: 1 }));

    const state = collectCrashState();
    const serialized = JSON.stringify(state);
    expect(serialized.length).toBeLessThanOrEqual(1500);
    // The small provider survives — dropping is largest-first, not arbitrary.
    expect(state?.['small']).toEqual({ v: 1 });
    // Every dropped provider is named, so the report never silently omits one.
    const dropped = state?.['_dropped'] as string[];
    expect(Array.isArray(dropped)).toBe(true);
    expect(dropped.length).toBeGreaterThan(1);
    for (const key of dropped) expect(state?.[key]).toBeUndefined();
    // And the result is still valid JSON, not a truncated fragment.
    expect(() => JSON.parse(serialized)).not.toThrow();

    offs.forEach((off) => off());
    offSmall();
  });
});
