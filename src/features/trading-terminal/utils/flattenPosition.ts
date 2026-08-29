import type { GraphQLClient } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { exchangeQueries } from '@/lib/api/GraphQLQueries-exchange-queries';
import { otherQueries } from '@/lib/api/GraphQLQueries-other-queries';
import {
  BotTypesEnum,
  CloseDCATypeEnum,
  CloseGRIDTypeEnum,
  type GeneralOpenPosition,
  type LinkedPositionBot,
} from '@/types';

/** A venue position is considered flat once it is within this of zero. */
const QTY_EPSILON_RATIO = 0.005;
const CONVERGE_TIMEOUT_MS = 60_000;
const CONVERGE_POLL_MS = 2_500;

export interface FlattenTarget {
  positionId: string;
  exchangeUUID: string;
  symbol: string;
  quantity: string;
  linkedBots: LinkedPositionBot[];
  /** Venue quantity not held by any linked deal. */
  residualQty: number;
}

export interface FlattenOptions {
  /** Stop bots that would re-open a deal right after this close. */
  stopReopeningBots: boolean;
  /** Progress line for the UI; called at each stage. */
  onProgress?: (message: string) => void;
}

export interface FlattenResult {
  closedDeals: number;
  stoppedBots: number;
  /**
   * What the venue still shows once the linked deals have closed — the part no
   * Gainium deal owned. The caller imports and closes this as its own terminal
   * deal, so the remainder gets a record too. Absent once the position is gone.
   */
  remainingPosition?: GeneralOpenPosition;
  /** Set when the venue position did not shrink as expected in time. */
  warning?: string;
}

interface DealResult {
  status: 'OK' | 'NOTOK';
  reason?: string;
  data?: unknown;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Flatten a venue position the honest way.
 *
 * A venue position is one netted lot that several Gainium deals plus the user's
 * own manual trading can all sit inside. Sending a single reduce-only market
 * order for the whole quantity would flatten it in one shot, but every linked
 * bot would then believe it still holds a position until its own reconcile
 * caught up — wrong P&L, wrong TP sizing, in the meantime.
 *
 * So we go deal-first:
 *
 *   1. Stop the bots that would immediately re-open (opt-in). This happens
 *      BEFORE anything closes, or an ASAP bot opens a fresh deal into the gap.
 *      Stopping uses `leave`, so the bot's deals on other symbols are untouched
 *      — it simply stops opening new ones.
 *   2. Close each linked deal at market, so each bot closes its own share and
 *      records it. Grid bots have no deal to close; they are stopped with
 *      `closeGridType: closeByMarket`, which closes their position instead.
 *   3. Wait for the venue position to actually shrink to the residual. We do
 *      NOT skip this: the closes run through the bot workers, and firing the
 *      residual order early would close the bots' share too and double up when
 *      their own orders land.
 *   4. Hand whatever is left back to the caller, which imports it as a
 *      terminal deal and closes that — so the part nobody owned ends up in the
 *      deal history as well, rather than being flattened off the venue with no
 *      record. By this point the venue position IS just that remainder, so the
 *      import adopts exactly the right size.
 *
 * If step 3 doesn't converge, step 4 is deliberately skipped and the caller is
 * told, rather than guessing at a quantity.
 */
export async function flattenPosition(
  client: GraphQLClient,
  target: FlattenTarget,
  options: FlattenOptions
): Promise<FlattenResult> {
  const { onProgress } = options;
  const result: FlattenResult = {
    closedDeals: 0,
    stoppedBots: 0,
  };

  const reopening = options.stopReopeningBots
    ? target.linkedBots.filter(isReopening)
    : [];

  // 1. Stop the re-openers first.
  for (const bot of reopening) {
    onProgress?.(`Stopping ${bot.botName || bot.botId}…`);
    const { query, variables } = otherQueries.changeStatus({
      id: `${bot.botId}`,
      status: 'closed',
      // `leave` = do nothing to this bot's deals. Its positions on other
      // symbols stay exactly as they are; it just stops opening new deals.
      closeType: CloseDCATypeEnum.leave,
      ...(bot.botType ? { type: bot.botType as BotTypesEnum } : {}),
    });
    const res = await client.request<{ changeStatus: DealResult }>(
      query,
      variables
    );
    if (res.changeStatus.status === 'OK') result.stoppedBots += 1;
  }

  // 2. Close each linked deal at market.
  for (const bot of target.linkedBots) {
    if (bot.dealId) {
      onProgress?.(`Closing ${bot.botName || bot.botId}'s deal at market…`);
      const { query, variables } = botQueries.closeDCADeal({
        botId: bot.botId,
        dealId: bot.dealId,
        type: CloseDCATypeEnum.closeByMarket,
      });
      const res = await client.request<{ closeDCADeal: DealResult }>(
        query,
        variables
      );
      if (res.closeDCADeal.status === 'OK') result.closedDeals += 1;
      continue;
    }
    // Grid bots hold a position rather than a deal. There is no way to close
    // that position and leave the bot running, so this necessarily stops it —
    // the confirm dialog says as much before we get here.
    onProgress?.(`Closing ${bot.botName || bot.botId}'s grid position…`);
    const { query, variables } = otherQueries.changeStatus({
      id: `${bot.botId}`,
      status: 'closed',
      type: BotTypesEnum.grid,
      closeGridType: CloseGRIDTypeEnum.closeByMarket,
    });
    const res = await client.request<{ changeStatus: DealResult }>(
      query,
      variables
    );
    if (res.changeStatus.status === 'OK') result.closedDeals += 1;
  }

  // 3. Wait for the venue to reflect those closes.
  const startQty = Math.abs(+target.quantity);
  const epsilon = Math.max(startQty * QTY_EPSILON_RATIO, 0);
  const wantQty = target.residualQty;
  if (result.closedDeals > 0) {
    onProgress?.('Waiting for the exchange to reflect the closes…');
    const deadline = Date.now() + CONVERGE_TIMEOUT_MS;
    let converged = false;
    for (;;) {
      const qty = await venueQuantity(client, target);
      if (qty === undefined || qty <= wantQty + epsilon) {
        converged = true;
        break;
      }
      if (Date.now() >= deadline) break;
      await wait(CONVERGE_POLL_MS);
    }
    if (!converged) {
      result.warning =
        'The deals were closed, but the exchange still shows more than the unaccounted remainder. The rest was left alone — re-check the position in a moment.';
      return result;
    }
  }

  // 4. Hand the remainder back for import-and-close.
  result.remainingPosition = await venuePosition(client, target);
  return result;
}

/**
 * The position as the venue currently reports it, or `undefined` once gone.
 * Exported so callers can confirm the outcome instead of assuming it.
 */
export async function readVenuePosition(
  client: GraphQLClient,
  target: Pick<FlattenTarget, 'positionId' | 'exchangeUUID'>
): Promise<GeneralOpenPosition | undefined> {
  return venuePosition(client, target as FlattenTarget);
}

/**
 * Reduce-only market close of whatever the venue still shows — the venue's own
 * "close position" primitive, sized from the live quantity.
 *
 * This is the last step of a flatten, never the first. Adopting a position into
 * a deal sizes the order from the account's real balance and rounds it to the
 * venue's step, so one adopt-and-close pass can leave a sub-step remainder
 * (observed on paper: 0.024 ETH adopted as 0.023, leaving 0.001). That
 * remainder was never part of any deal, so there is nothing to record for it —
 * but leaving it means "Close by market" did not flatten the position, and it
 * re-appears as a fresh unowned row. A reduce-only close exists precisely so a
 * position can always be closed out.
 */
export async function sweepRemainder(
  client: GraphQLClient,
  target: FlattenTarget
): Promise<boolean> {
  const { query, variables } = exchangeQueries.closePositionOnExchange({
    positionId: target.positionId,
    exchangeUUID: target.exchangeUUID,
  });
  const res = await client.request<{ closePositionOnExchange: DealResult }>(
    query,
    variables
  );
  return res.closePositionOnExchange.status === 'OK';
}

async function venuePosition(
  client: GraphQLClient,
  target: FlattenTarget
): Promise<GeneralOpenPosition | undefined> {
  const { query, variables } = otherQueries.getAllOpenPositions({
    exchangeUUID: target.exchangeUUID,
  });
  const res = await client.request<{
    getAllOpenPositions: { status: string; data?: GeneralOpenPosition[] | null };
  }>(query, variables);
  if (res.getAllOpenPositions.status !== 'OK') return undefined;
  return (res.getAllOpenPositions.data ?? []).find(
    (p) => p.positionId === target.positionId
  );
}

async function venueQuantity(
  client: GraphQLClient,
  target: FlattenTarget
): Promise<number | undefined> {
  const found = await venuePosition(client, target);
  return found ? Math.abs(+found.quantity) : undefined;
}

function isReopening(b: LinkedPositionBot): boolean {
  const running =
    b.botStatus === 'open' ||
    b.botStatus === 'range' ||
    b.botStatus === 'monitoring';
  return running && b.startCondition === 'ASAP';
}
