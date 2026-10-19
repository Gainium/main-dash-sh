/**
 * An add / reduce funds request is answered "scheduled" at once; whether the
 * engine then refuses it (below the exchange minimum, limit price on a combo
 * deal, a previous request still in flight…) arrives seconds later as a bot
 * message. A routine 3-second warning toast titled with the bot's name was
 * easy to miss, so for a short window after a request the bot's funds
 * messages are surfaced as the request's own outcome instead.
 */
export const FUNDS_WATCH_MS = 30_000;

export interface FundsWatch {
  botId: string;
  mode: 'add' | 'reduce';
  until: number;
}

/** What the engine says about a funds request, refusal or not. */
const FUNDS_MESSAGE =
  /\b(add|reduce) funds\b|^funds can only be|due to exchange minimum requirements|^reduce qty is not a number|^order qty is not a number/i;

/** Of those, the ones that mean nothing was done. */
const REFUSAL =
  /refused|less than exchange minimum|qty is 0|not a number|not supported|can only be|cannot find deal/i;

let watches: FundsWatch[] = [];

export function watchFundsRequest(
  botId: string,
  mode: FundsWatch['mode'],
  now = Date.now()
): void {
  if (!botId) return;
  watches = [
    ...watches.filter((w) => w.until > now),
    { botId, mode, until: now + FUNDS_WATCH_MS },
  ];
}

/**
 * The open watch this bot message answers, consumed so one request claims one
 * message; null when the message is not about a watched request.
 */
export function claimFundsMessage(
  botId: string | undefined,
  message: string,
  now = Date.now()
): (FundsWatch & { refused: boolean }) | null {
  watches = watches.filter((w) => w.until > now);
  if (!botId || !FUNDS_MESSAGE.test(message.trim())) return null;
  const index = watches.findIndex((w) => w.botId === botId);
  if (index === -1) return null;
  const [watch] = watches.splice(index, 1);
  return watch ? { ...watch, refused: REFUSAL.test(message) } : null;
}

/** Test seam. */
export function resetFundsWatches(): void {
  watches = [];
}
