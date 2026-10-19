import { create } from 'zustand';

import { toast } from '@/lib/toast';

/**
 * Pending Start/Stop transitions, keyed by bot id.
 *
 * `changeStatus` returns as soon as the API has accepted the request; the bot
 * engine acts afterwards. Until the server reports the requested status (the
 * `bot sends settings` socket event or a bot-list response), the bot is
 * "Starting…" / "Stopping…": its badge says so, Start/Stop stay disabled, and
 * a list refetch carrying the old status cannot flip the badge back.
 *
 * A transition ends when:
 * - the server reports the target status (success toast unless `notify` is
 *   off — bulk runs toast their own summary);
 * - the socket reports `error` (error toast);
 * - the request itself fails (the mutation clears it; it toasts the failure);
 * - `TRANSITION_TIMEOUT_MS` passes with no confirmation (error toast, and the
 *   bot's real status is re-fetched through `onTimeout`).
 */

export type TransitionTarget = 'open' | 'closed';

export interface BotStatusTransition {
  target: TransitionTarget;
  name?: string;
  notify: boolean;
  startedAt: number;
}

interface BeginOptions {
  name?: string;
  notify?: boolean;
  /** Runs once if the transition times out (e.g. re-fetch the bot lists). */
  onTimeout?: () => void;
}

export const TRANSITION_TIMEOUT_MS = 90_000;

/**
 * After the engine confirms a status over the socket, a bot-list or by-id
 * response can still carry the old one (it was read before the engine wrote
 * it). For this long the confirmed status wins over a differing response,
 * until a response agrees with it.
 */
export const CONFIRM_GRACE_MS = 30_000;

/** Statuses that mean a bot is running (grid reports range/monitoring). */
const RUNNING = new Set(['open', 'range', 'monitoring']);

export function statusMatchesTarget(
  status: string | null | undefined,
  target: TransitionTarget
): boolean {
  if (!status) return false;
  return target === 'open' ? RUNNING.has(status) : status === 'closed';
}

export function transitionLabel(target: TransitionTarget): string {
  return target === 'open' ? 'Starting…' : 'Stopping…';
}

interface TransitionState {
  transitions: Record<string, BotStatusTransition>;
}

export const useBotStatusTransitionStore = create<TransitionState>()(() => ({
  transitions: {},
}));

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const confirmed = new Map<
  string,
  { target: TransitionTarget; until: number }
>();

const quote = (name?: string) => (name ? `Bot "${name}"` : 'The bot');

// Timeouts of many bots at once (a bulk run) are reported in one toast.
let timedOut: BotStatusTransition[] = [];
let timeoutFlush: ReturnType<typeof setTimeout> | null = null;

function flushTimeouts() {
  timeoutFlush = null;
  const batch = timedOut;
  timedOut = [];
  if (batch.length === 0) return;
  if (batch.length === 1) {
    const [only] = batch;
    toast.error(
      `${quote(only.name)} has not confirmed it ${only.target === 'open' ? 'started' : 'stopped'}. Check its status before trying again.`,
      { duration: 8000 }
    );
    return;
  }
  toast.error(
    `${batch.length} bots have not confirmed the status change. Check their status before trying again.`,
    { duration: 8000 }
  );
}

function remove(id: string): BotStatusTransition | undefined {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  const current = useBotStatusTransitionStore.getState().transitions[id];
  if (!current) return undefined;
  useBotStatusTransitionStore.setState((state) => ({
    transitions: Object.fromEntries(
      Object.entries(state.transitions).filter(([key]) => key !== id)
    ),
  }));
  return current;
}

export function beginBotTransition(
  id: string,
  target: TransitionTarget,
  options: BeginOptions = {}
): void {
  remove(id);
  confirmed.delete(id);
  const entry: BotStatusTransition = {
    target,
    ...(options.name ? { name: options.name } : {}),
    notify: options.notify ?? true,
    startedAt: Date.now(),
  };
  useBotStatusTransitionStore.setState((state) => ({
    transitions: { ...state.transitions, [id]: entry },
  }));
  timers.set(
    id,
    setTimeout(() => {
      const expired = remove(id);
      if (!expired) return;
      options.onTimeout?.();
      timedOut.push(expired);
      if (!timeoutFlush) timeoutFlush = setTimeout(flushTimeouts, 500);
    }, TRANSITION_TIMEOUT_MS)
  );
}

/** Drop a transition without a toast (the request failed and toasted). */
export function clearBotTransition(id: string): void {
  remove(id);
}

export function getBotTransition(id: string): BotStatusTransition | undefined {
  return useBotStatusTransitionStore.getState().transitions[id];
}

/**
 * A server-sourced status for a bot. Ends its transition when it is the
 * target (or, from the engine, `error`). Returns the transition still pending
 * afterwards, so a caller can keep the optimistic status over a stale one.
 */
export function reportBotStatus(
  id: string,
  status: string | null | undefined,
  source: 'socket' | 'list'
): BotStatusTransition | undefined {
  const pending = getBotTransition(id);
  if (!pending || !status) return pending;
  if (statusMatchesTarget(status, pending.target)) {
    remove(id);
    if (source === 'socket') {
      confirmed.set(id, {
        target: pending.target,
        until: Date.now() + CONFIRM_GRACE_MS,
      });
    }
    if (pending.notify) {
      toast.success(
        `${quote(pending.name)} ${pending.target === 'open' ? 'started' : 'stopped'}`
      );
    }
    return undefined;
  }
  // A list response may predate the request; only the engine's own report
  // of an error ends the transition.
  if (source === 'socket' && status === 'error') {
    remove(id);
    toast.error(
      `${quote(pending.name)} could not ${pending.target === 'open' ? 'start' : 'stop'}. Check its status for details.`
    );
    return undefined;
  }
  return pending;
}

/**
 * The status to store for a bot from a server response (bot list or by-id
 * fetch) that may have been read before the engine acted. While a Start/Stop
 * is pending, or briefly after the engine confirmed it, a response with a
 * different status keeps the `held` one. Returns `incoming` otherwise.
 */
export function resolveFetchedBotStatus<S extends string | undefined>(
  id: string,
  incoming: S,
  held: S
): S {
  if (!incoming) return incoming;
  const pending = reportBotStatus(id, incoming, 'list');
  if (pending) return held ?? incoming;
  const settled = confirmed.get(id);
  if (!settled) return incoming;
  if (
    Date.now() > settled.until ||
    statusMatchesTarget(incoming, settled.target)
  ) {
    confirmed.delete(id);
    return incoming;
  }
  return held && statusMatchesTarget(held, settled.target) ? held : incoming;
}

/** A pending or just-confirmed status change: list responses may lag it. */
export function isBotStatusHeld(id: string): boolean {
  if (getBotTransition(id)) return true;
  const settled = confirmed.get(id);
  return !!settled && Date.now() <= settled.until;
}

/** The pending transition for one bot (re-renders only for that bot). */
export function useBotTransition(
  id: string | null | undefined
): BotStatusTransition | undefined {
  return useBotStatusTransitionStore((state) =>
    id ? state.transitions[id] : undefined
  );
}

/** Test helper: drop every transition and timer. */
export function resetBotTransitions(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  confirmed.clear();
  if (timeoutFlush) clearTimeout(timeoutFlush);
  timeoutFlush = null;
  timedOut = [];
  useBotStatusTransitionStore.setState({ transitions: {} });
}
