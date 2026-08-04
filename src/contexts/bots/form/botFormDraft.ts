import type { BotFormData } from '@/types/bots/form';

/**
 * Local draft persistence for the bot builder.
 *
 * The bot form held its entire state in memory only: no autosave, no
 * unsaved-changes guard, and the only `beforeunload` handler in the app lives
 * in Reports. Any navigation away from a half-built bot — including clicking
 * an in-form upsell link, which used to be a raw `<a href>` and therefore a
 * full browser reload — silently destroyed the work, with no warning and no
 * way to get it back.
 *
 * A draft is written while the form is dirty and dropped as soon as it is
 * saved, so the stored copy only ever represents work that is NOT yet on the
 * server. Storage is `localStorage` (survives a full reload and a tab close,
 * unlike `sessionStorage`) with a TTL so a forgotten draft cannot resurface
 * days later looking like a bug.
 */

const PREFIX = 'gainium:bot-form-draft:v1';

/** Older drafts are ignored and swept on next access. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Skip persisting anything pathologically large rather than risk throwing
 * `QuotaExceededError` on every keystroke burst.
 */
export const DRAFT_MAX_BYTES = 512 * 1024;

export interface BotFormDraft {
  formData: BotFormData;
  savedAt: number;
}

/**
 * Drafts are scoped per bot type AND per target, so a new combo bot cannot
 * restore over a DCA bot, and editing bot A cannot restore bot B's draft.
 */
export const botFormDraftKey = (
  botType: string,
  mode: string,
  botId?: string
): string => `${PREFIX}:${botType}:${mode}:${botId || 'new'}`;

const storage = (): Storage | null => {
  try {
    // Absent in SSR/tests; throws outright under "block all cookies".
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const saveBotFormDraft = (
  key: string,
  formData: BotFormData,
  now: number = Date.now()
): boolean => {
  const store = storage();
  if (!store) return false;
  try {
    const payload = JSON.stringify({ formData, savedAt: now });
    if (payload.length > DRAFT_MAX_BYTES) return false;
    store.setItem(key, payload);
    return true;
  } catch {
    // Quota exceeded or serialization cycle — a draft is a convenience, it
    // must never break the form it is trying to protect.
    return false;
  }
};

export const loadBotFormDraft = (
  key: string,
  now: number = Date.now()
): BotFormDraft | null => {
  const store = storage();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<BotFormDraft>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.formData ||
      typeof parsed.savedAt !== 'number'
    ) {
      clearBotFormDraft(key);
      return null;
    }
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      clearBotFormDraft(key);
      return null;
    }
    return { formData: parsed.formData as BotFormData, savedAt: parsed.savedAt };
  } catch {
    clearBotFormDraft(key);
    return null;
  }
};

export const clearBotFormDraft = (key: string): void => {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
};

/**
 * Drop every expired draft. Cheap (the form-draft keyspace is tiny) and keeps
 * abandoned builds from accumulating in localStorage indefinitely.
 */
export const sweepExpiredBotFormDrafts = (now: number = Date.now()): number => {
  const store = storage();
  if (!store) return 0;
  let removed = 0;
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key || !key.startsWith(`${PREFIX}:`)) continue;
      const raw = store.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Partial<BotFormDraft>;
        if (typeof parsed?.savedAt !== 'number' || now - parsed.savedAt > DRAFT_TTL_MS) {
          stale.push(key);
        }
      } catch {
        stale.push(key);
      }
    }
    for (const key of stale) {
      store.removeItem(key);
      removed += 1;
    }
  } catch {
    /* best effort */
  }
  return removed;
};

/**
 * Throttle window for draft writes. Long enough that a burst of typing costs
 * one `JSON.stringify` + `setItem`, short enough that almost nothing is lost
 * if the tab dies mid-edit.
 */
export const DRAFT_SAVE_DEBOUNCE_MS = 800;
