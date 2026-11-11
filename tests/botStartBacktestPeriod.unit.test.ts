// Spec: main-dash-redesign specs/149.backtest-period-from-bot-start.md
// Run: (cd core && npx playwright test --config=playwright.unit.config.ts tests/botStartBacktestPeriod.unit.test.ts)
import { test, expect } from '@playwright/test';

import {
  botStartBacktestPeriod,
  botStartTime,
} from '@/features/bots/widgets/BotForm/botStartBacktestPeriod';

const CREATED = '2026-09-25T10:15:00.000Z';
const CREATED_MS = Date.parse(CREATED);
const NOW = Date.parse('2026-11-11T12:00:00.000Z');

test.describe('botStartTime (§2.1)', () => {
  test('reads the ISO `created` of a DCA / combo / hedge bot', () => {
    expect(botStartTime({ created: CREATED })).toBe(CREATED_MS);
  });

  test('reads the numeric `createdAt` of the mapped grid shape', () => {
    expect(botStartTime({ createdAt: CREATED_MS })).toBe(CREATED_MS);
  });

  test('accepts an epoch-ms string', () => {
    expect(botStartTime({ created: String(CREATED_MS) })).toBe(CREATED_MS);
  });

  test('no bot / no usable date → null (default window stays)', () => {
    expect(botStartTime(null)).toBeNull();
    expect(botStartTime(undefined)).toBeNull();
    expect(botStartTime({})).toBeNull();
    expect(botStartTime({ created: '' })).toBeNull();
    expect(botStartTime({ created: 'not a date' })).toBeNull();
    expect(botStartTime({ createdAt: 0 })).toBeNull();
  });
});

test.describe('botStartBacktestPeriod (§2.2)', () => {
  test('window runs from the bot start to now', () => {
    const p = botStartBacktestPeriod(CREATED_MS, NOW);
    expect(p?.from.getTime()).toBe(CREATED_MS);
    expect(p?.to.getTime()).toBe(NOW);
  });

  test('missing or future start → null', () => {
    expect(botStartBacktestPeriod(null, NOW)).toBeNull();
    expect(botStartBacktestPeriod(undefined, NOW)).toBeNull();
    expect(botStartBacktestPeriod(NOW + 1000, NOW)).toBeNull();
    expect(botStartBacktestPeriod(NaN, NOW)).toBeNull();
  });
});
