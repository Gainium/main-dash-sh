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
 * - the socket reports `closed` for a pending Start: the engine refused to
 *   start the bot (an existing position with other leverage or margin, not
 *   enough credits, …) and stopped it again. The toast names the reason the
 *   engine recorded, looked up through `findRefusal`;
 * - the request itself fails (the mutation clears it; it toasts the failure);
 * - `TRANSITION_TIMEOUT_MS` passes with no confirmation (error toast, and the
 *   bot's real status is re-fetched through `onTimeout`). A Start whose
 *   refusal was recorded meanwhile still reports that refusal.
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
  /**
   * Why the engine refused a Start: the newest error or warning it recorded
   * for the bot at or after `since` (ms), or undefined when there is none.
   */
  findRefusal?: (since: number) => Promise<string | undefined>;
}

export const TRANSITION_TIMEOUT_MS = 90_000;

/**
 * After the engine confirms a status over the socket, a bot-list or by-id
 * response can still carry the old one (it was read before the engine wrote
 * it). For this long the confirmed status wins over a differing response,
 * until a response agrees with it.
 */
export const CONFIRM_GRACE_MS = 30_000;

/**
 * How far before the click a recorded refusal still counts: the event time is
 * the server's clock, the click time this browser's.
 */
export const REFUSAL_LOOKBACK_MS = 60_000;

/** The engine may report `closed` before its warning is stored: look again. */
export const REFUSAL_RETRY_MS = 1_500;

/** Long enough to read a refusal that says what to change. */
const REFUSAL_TOAST_MS = 12_000;

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
const refusalLookups = new Map<
  string,
  NonNullable<BeginOptions['findRefusal']>
>();
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

// Refusals of many bots at once (a bulk run) are reported in one toast.
interface Refusal {
  transition: BotStatusTransition;
  findRefusal: BeginOptions['findRefusal'];
}
let refused: Refusal[] = [];
let refusalFlush: ReturnType<typeof setTimeout> | null = null;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The reason the engine recorded for refusing this Start, if any. */
async function lookUpRefusal(
  transition: BotStatusTransition,
  findRefusal: BeginOptions['findRefusal'],
  retry: boolean
): Promise<string | undefined> {
  if (!findRefusal) return undefined;
  const since = transition.startedAt - REFUSAL_LOOKBACK_MS;
  const attempt = () => findRefusal(since).catch(() => undefined);
  const reason = await attempt();
  if (reason || !retry) return reason;
  await wait(REFUSAL_RETRY_MS);
  return attempt();
}

function refusalToast(transition: BotStatusTransition, reason?: string) {
  toast.error(
    reason
      ? `${quote(transition.name)} could not start. ${reason}`
      : `${quote(transition.name)} could not start. Check its events for the reason.`,
    { duration: REFUSAL_TOAST_MS }
  );
}

async function flushRefusals() {
  refusalFlush = null;
  const batch = refused;
  refused = [];
  if (batch.length === 0) return;
  if (batch.length === 1) {
    const [only] = batch;
    refusalToast(
      only.transition,
      await lookUpRefusal(only.transition, only.findRefusal, true)
    );
    return;
  }
  toast.error(
    `${batch.length} bots could not start. Check their events for the reason.`,
    { duration: REFUSAL_TOAST_MS }
  );
}

function queueRefusal(refusal: Refusal) {
  refused.push(refusal);
  if (!refusalFlush) refusalFlush = setTimeout(flushRefusals, 500);
}

function queueTimeout(expired: BotStatusTransition) {
  timedOut.push(expired);
  if (!timeoutFlush) timeoutFlush = setTimeout(flushTimeouts, 500);
}

function remove(id: string): BotStatusTransition | undefined {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  refusalLookups.delete(id);
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
  const { findRefusal } = options;
  if (findRefusal) refusalLookups.set(id, findRefusal);
  timers.set(
    id,
    setTimeout(() => {
      const expired = remove(id);
      if (!expired) return;
      options.onTimeout?.();
      // The engine's `closed` may never have reached this tab (a dropped
      // socket): a refusal it recorded is still the answer to give.
      if (expired.target !== 'open' || !findRefusal) {
        queueTimeout(expired);
        return;
      }
      void lookUpRefusal(expired, findRefusal, false).then((reason) => {
        if (reason) refusalToast(expired, reason);
        else queueTimeout(expired);
      });
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
  // of `closed` or an error ends the transition.
  if (source === 'socket' && pending.target === 'open' && status === 'closed') {
    // The engine stopped the bot it was asked to start: it refused, and has
    // recorded why.
    const findRefusal = refusalLookups.get(id);
    remove(id);
    queueRefusal({ transition: pending, findRefusal });
    return undefined;
  }
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
  refusalLookups.clear();
  confirmed.clear();
  if (timeoutFlush) clearTimeout(timeoutFlush);
  timeoutFlush = null;
  timedOut = [];
  if (refusalFlush) clearTimeout(refusalFlush);
  refusalFlush = null;
  refused = [];
  useBotStatusTransitionStore.setState({ transitions: {} });
}
