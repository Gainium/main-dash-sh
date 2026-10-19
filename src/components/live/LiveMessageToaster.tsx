import { useEffect, useRef } from 'react';
import { useMessageStore } from '@/stores/live';
import { toast } from '@/lib/toast';
import { claimFundsMessage } from '@/features/bots/shared/runtime/dialogs/fundsRefusalWatch';

/** Long enough to read a refusal that explains what to do instead. */
const FUNDS_TOAST_MS = 12_000;

/**
 * Headless listener that surfaces live bot error/warning messages as toasts.
 *
 * Bot messages pushed over the `bot sends message` websocket land in the
 * message store (see LiveUpdateContext), but nothing renders them unless a
 * MessageWidget happens to be mounted — so users got no live feedback when a
 * bot reported something. The most important case: an add-funds order that
 * was "scheduled" synchronously, then rejected by the exchange (insufficient
 * balance, min notional, ...) — the backend emits that rejection here with
 * `type: 'error'`, and previously nothing in the terminal showed it.
 *
 * Only messages that arrive after mount are toasted; any history already in
 * the store is marked as seen so we don't replay a burst of stale toasts.
 */
export function LiveMessageToaster(): null {
  const messages = useMessageStore((s) => s.messages);
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    // First run: treat everything already in the store as history, not new.
    if (!initialized.current) {
      initialized.current = true;
      for (const msg of messages) {
        seenIds.current.add(msg.id);
      }
      return;
    }

    for (const msg of messages) {
      if (seenIds.current.has(msg.id)) continue;
      seenIds.current.add(msg.id);
      if (msg.dismissed) continue;
      // The outcome of an add / reduce funds request the user just made: shown
      // as that request's result, long enough to read, whatever its severity.
      const funds = claimFundsMessage(msg.botId, msg.message);
      if (funds) {
        toast[funds.refused ? 'error' : 'warning'](msg.message, {
          duration: FUNDS_TOAST_MS,
        });
        continue;
      }
      // Only surface actionable severities as toasts. Routine info/success
      // bot chatter (SO fills, TP hits, ...) would be noisy — it still lands
      // in the message store for a notification panel to render. Errors and
      // warnings — e.g. an add-funds order rejected by the exchange after it
      // was scheduled — are what the user must not miss.
      if (msg.type !== 'error' && msg.type !== 'warning') continue;
      const text = msg.title ? `${msg.title}: ${msg.message}` : msg.message;
      toast[msg.type](text);
    }
  }, [messages]);

  return null;
}

export default LiveMessageToaster;
