import type { AdminUpdate } from '@/lib/api/adminClient';

export const UPDATES_HREF = '/admin?tab=updates';

/** The dashboard's own version, stamped in at build time. */
export function runningFrontendVersion(): string | null {
  return typeof __APP_CACHE_VERSION__ !== 'undefined'
    ? __APP_CACHE_VERSION__
    : null;
}

/**
 * Identifies the set of newer images on offer. A dismissal is stored against
 * it, so publishing any further version brings the notice back.
 */
export function updatesSignature(updates: AdminUpdate[]): string {
  const tags = new Set<string>();
  for (const u of updates) {
    if (u.hasUpdate) tags.add(`${u.repo ?? u.service}@${u.latest ?? '?'}`);
  }
  return [...tags].sort().join(',');
}
