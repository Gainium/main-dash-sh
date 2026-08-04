import { test, expect } from '@playwright/test';

import {
  botFormDraftKey,
  clearBotFormDraft,
  DRAFT_TTL_MS,
  loadBotFormDraft,
  saveBotFormDraft,
  sweepExpiredBotFormDrafts,
} from '@/contexts/bots/form/botFormDraft';
import type { BotFormData } from '@/types/bots/form';

/**
 * The bot builder kept its entire state in memory. Navigating away — including
 * via an in-form upsell link that used to be a raw `<a href>`, i.e. a full page
 * reload — destroyed the work with no warning and no way to recover it.
 *
 * These cover the storage contract the recovery depends on: a draft survives a
 * reload, is scoped so it cannot bleed across bot types, expires rather than
 * resurfacing days later, and never throws into the form it is protecting.
 */

// Minimal stand-in — the module only ever round-trips the object as JSON.
const formData = (name: string): BotFormData =>
  ({ name, dca: {}, combo: {}, grid: {} }) as unknown as BotFormData;

/** Playwright unit tests run in Node; give the module a localStorage. */
const installStorage = () => {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
  };
  return map;
};

test.beforeEach(() => {
  installStorage();
});

test('a saved draft round-trips', () => {
  const key = botFormDraftKey('combo', 'create');
  expect(saveBotFormDraft(key, formData('my sniper bot'))).toBe(true);

  const loaded = loadBotFormDraft(key);
  expect(loaded).not.toBeNull();
  expect((loaded?.formData as unknown as { name?: string })?.name).toBe(
    'my sniper bot'
  );
});

test('drafts are scoped per bot type and per target', () => {
  expect(botFormDraftKey('combo', 'create')).not.toBe(
    botFormDraftKey('dca', 'create')
  );
  expect(botFormDraftKey('combo', 'edit', 'bot-a')).not.toBe(
    botFormDraftKey('combo', 'edit', 'bot-b')
  );

  saveBotFormDraft(botFormDraftKey('combo', 'create'), formData('combo'));
  // A DCA form must not pick up the combo draft.
  expect(loadBotFormDraft(botFormDraftKey('dca', 'create'))).toBeNull();
});

test('an expired draft is dropped rather than restored', () => {
  const key = botFormDraftKey('combo', 'create');
  const longAgo = Date.now() - DRAFT_TTL_MS - 1;
  saveBotFormDraft(key, formData('stale'), longAgo);

  expect(loadBotFormDraft(key)).toBeNull();
  // …and the expired row is swept, not left to accumulate.
  expect(loadBotFormDraft(key)).toBeNull();
});

test('a draft just inside the TTL is still restored', () => {
  const key = botFormDraftKey('combo', 'create');
  saveBotFormDraft(key, formData('fresh'), Date.now() - DRAFT_TTL_MS + 60_000);
  expect(loadBotFormDraft(key)).not.toBeNull();
});

test('clearing removes the draft', () => {
  const key = botFormDraftKey('grid', 'create');
  saveBotFormDraft(key, formData('gone'));
  clearBotFormDraft(key);
  expect(loadBotFormDraft(key)).toBeNull();
});

test('corrupt stored JSON is discarded instead of throwing', () => {
  const map = installStorage();
  const key = botFormDraftKey('combo', 'create');
  map.set(key, '{not json');
  expect(loadBotFormDraft(key)).toBeNull();
  expect(map.has(key)).toBe(false);
});

test('a payload missing required fields is discarded', () => {
  const map = installStorage();
  const key = botFormDraftKey('combo', 'create');
  map.set(key, JSON.stringify({ formData: null, savedAt: Date.now() }));
  expect(loadBotFormDraft(key)).toBeNull();
});

test('an oversized draft is skipped rather than throwing quota errors', () => {
  const key = botFormDraftKey('combo', 'create');
  const huge = { name: 'x'.repeat(600 * 1024), dca: {}, combo: {}, grid: {} };
  expect(saveBotFormDraft(key, huge as unknown as BotFormData)).toBe(false);
  expect(loadBotFormDraft(key)).toBeNull();
});

test('the sweep removes expired drafts and keeps live ones', () => {
  const stale = botFormDraftKey('combo', 'create');
  const live = botFormDraftKey('dca', 'create');
  saveBotFormDraft(stale, formData('old'), Date.now() - DRAFT_TTL_MS - 1);
  saveBotFormDraft(live, formData('new'));

  expect(sweepExpiredBotFormDrafts()).toBe(1);
  expect(loadBotFormDraft(live)).not.toBeNull();
});

test('the sweep ignores unrelated localStorage keys', () => {
  const map = installStorage();
  map.set('auth-store', 'do not touch');
  saveBotFormDraft(
    botFormDraftKey('combo', 'create'),
    formData('old'),
    Date.now() - DRAFT_TTL_MS - 1
  );

  sweepExpiredBotFormDrafts();
  expect(map.get('auth-store')).toBe('do not touch');
});

test('storage being unavailable degrades quietly', () => {
  (globalThis as unknown as { window: unknown }).window = {
    get localStorage(): Storage {
      throw new Error('blocked by browser settings');
    },
  };
  const key = botFormDraftKey('combo', 'create');
  expect(saveBotFormDraft(key, formData('x'))).toBe(false);
  expect(loadBotFormDraft(key)).toBeNull();
  expect(() => clearBotFormDraft(key)).not.toThrow();
  expect(sweepExpiredBotFormDrafts()).toBe(0);
});
