// Whether base funding is available to the session user (see
// `@/lib/baseFunding/baseFundingAccess`). One cached answer per session token
// and trading context, shared by every caller and kept outside React Query
// so any component can ask without a provider. Until the answer arrives the
// answer is "no": every surface then behaves as it did before base funding.
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { useSinglePositionClient } from '@/hooks/useSinglePosition';
import { fetchBaseFundingAccess } from '@/lib/baseFunding/baseFundingAccess';
import { useAuthStore } from '@/stores/authStore';

/** How long an answer is kept. */
const TTL_MS = 5 * 60_000;
/** A transport failure is asked again after this long. */
const RETRY_MS = 30_000;

interface Entry {
  available: boolean;
  /** When to ask again. */
  expires: number;
  inflight: boolean;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Test hook: forget every answer. */
export const __resetBaseFundingAccessForTests = () => {
  entries.clear();
  notify();
};

export function useBaseFundingAccess(): boolean {
  const { make, enabled, paperContext } = useSinglePositionClient();
  const token = useAuthStore((s) => s.tokens?.accessToken ?? '');
  const key = enabled && token ? `${paperContext ? 'paper' : 'live'}:${token}` : '';
  const makeRef = useRef(make);
  makeRef.current = make;

  const available = useSyncExternalStore(
    subscribe,
    () => (key ? (entries.get(key)?.available ?? false) : false),
    () => false
  );

  useEffect(() => {
    if (!key) return;
    const entry = entries.get(key);
    if (entry && (entry.inflight || entry.expires > Date.now())) return;
    const previous = entry?.available ?? false;
    entries.set(key, { available: previous, expires: 0, inflight: true });
    // Bounded: a token change leaves the old key behind.
    if (entries.size > 8) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined && oldest !== key) entries.delete(oldest);
    }
    fetchBaseFundingAccess(makeRef.current())
      .then((value) => {
        entries.set(key, { available: value, expires: Date.now() + TTL_MS, inflight: false });
      })
      .catch(() => {
        entries.set(key, {
          available: previous,
          expires: Date.now() + RETRY_MS,
          inflight: false,
        });
      })
      .finally(notify);
  }, [key]);

  return available;
}
