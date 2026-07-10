/**
 * Lets cloud-only code (scheduled maintenance) tell the general PWA update flow
 * to apply a pending bundle update more eagerly than the default idle window.
 *
 * Kept in core (not the cloud overlay) so `usePWAUpdate` can read it without a
 * cloud -> core dependency, but it's inert for self-hosted: nothing there sets
 * an urgent value, so the default idle threshold always applies.
 */

let urgentIdleMs: number | null = null;
const listeners = new Set<() => void>();

/** Set (or clear, with `null`) the urgent input-idle threshold in ms. */
export function setPwaUpdateUrgentIdleMs(ms: number | null): void {
  if (urgentIdleMs === ms) return;
  urgentIdleMs = ms;
  listeners.forEach((l) => l());
}

/** Current urgent idle threshold, or `null` when no urgency is active. */
export function getPwaUpdateUrgentIdleMs(): number | null {
  return urgentIdleMs;
}

/** Subscribe to urgency changes (for `useSyncExternalStore`). */
export function subscribePwaUpdateUrgency(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
