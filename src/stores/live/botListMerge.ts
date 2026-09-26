import { consultBotTombstone, isIncomingBotStale } from './staleWriteGuard';

/**
 * What a bot-list response covers. A store may drop a bot it holds only when
 * the response was COMPLETE for a scope that includes that bot — otherwise the
 * bot's absence says nothing (it is on another page, or has a status this
 * query did not ask for).
 */
export interface BotListScope {
  /** Trading context the response was fetched for. */
  paperContext: boolean;
  /** Statuses the query requested. */
  statuses: readonly string[];
  /**
   * The response holds every matching bot (`rows >= total`). A server-capped
   * or paged response is partial and never removes anything.
   */
  complete: boolean;
}

interface MergeableBot {
  _id: string;
  status?: string;
  paperContext?: boolean;
  updated?: string | number | Date;
}

function updatedMs(bot: MergeableBot): number | undefined {
  if (!bot.updated) return undefined;
  const ms = new Date(bot.updated).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Merge a bot-list response into a store record.
 *
 * - Every incoming bot is upserted, except one older than what the store
 *   holds (stale cache replay: the held copy is kept) or one tombstoned by a
 *   recent local delete (stays deleted).
 * - A held bot absent from the response is removed only when `scope` says the
 *   response is complete AND the bot belongs to that scope (same context,
 *   status among the requested ones). That is how a deleted or archived bot
 *   leaves the store without a differently-filtered or partial list wiping
 *   bots it never covered.
 * - With no `scope`, nothing is removed (upsert only).
 *
 * Returns the SAME record object when nothing changed, so a no-op response
 * doesn't wake every subscriber.
 */
export function mergeBotListSnapshot<B extends MergeableBot>(
  existing: Record<string, B>,
  incoming: readonly B[],
  scope?: BotListScope
): Record<string, B> {
  const upserts = new Map<string, B>();
  const removals = new Set<string>();
  const seen = new Set<string>();

  for (const bot of incoming) {
    if (!bot || !bot._id) continue;
    seen.add(bot._id);
    const prior = existing[bot._id];
    if (prior && isIncomingBotStale(prior as never, bot as never)) continue;
    if (consultBotTombstone(bot._id, updatedMs(bot)) === 'reject') {
      if (prior) removals.add(bot._id);
      continue;
    }
    if (prior !== bot) upserts.set(bot._id, bot);
  }

  if (scope?.complete) {
    const statuses = new Set(scope.statuses);
    for (const id of Object.keys(existing)) {
      if (seen.has(id)) continue;
      const held = existing[id];
      const inContext =
        typeof held.paperContext !== 'boolean' ||
        held.paperContext === scope.paperContext;
      const inStatus = !held.status || statuses.has(held.status);
      if (inContext && inStatus) removals.add(id);
    }
  }

  if (!upserts.size && !removals.size) return existing;
  const next: Record<string, B> = {};
  for (const [id, bot] of Object.entries(existing)) {
    if (!removals.has(id)) next[id] = upserts.get(id) ?? bot;
  }
  for (const [id, bot] of upserts) {
    if (!(id in next) && !removals.has(id)) next[id] = bot;
  }
  return next;
}

/** Scope helper for a response with `rows` rows and a server `total`. */
export function botListScope(
  paperContext: boolean,
  statuses: readonly string[],
  rows: number,
  total: number | null | undefined
): BotListScope {
  return {
    paperContext,
    statuses,
    complete: typeof total !== 'number' || !Number.isFinite(total) || rows >= total,
  };
}
