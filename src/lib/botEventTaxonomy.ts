/**
 * Canonical bot-event taxonomy.
 *
 * The backend (`main-app`) stores bot events as free-text documents — `event`
 * is an un-enumerated string ("Order", "Status", "Change", "Buy dialog", …) and
 * the only structured signals are `type` (error/warning/info) and the presence
 * of a `deal` id. Direction (buy/sell) and the specific action (created/filled/
 * cancelled) live only inside the human `description` prose.
 *
 * Historically the UI reverse-engineered all of that with `.includes()` keyword
 * sniffing over the concatenated `event + description + metadata`. That produced
 * arbitrary results — e.g. a settings change whose diff contained "stopLoss"
 * matched `.includes('stop')` and was mislabelled "Bot Status".
 *
 * This module replaces the guessing with a single lookup keyed on the actual
 * `event` names the backend emits (enumerated from the backend source + live
 * data). Each entry yields a human title + a short state label + a colour
 * variant + an icon key. Free-text parsing is kept, but scoped: we only parse a
 * description when the event name tells us the shape to expect (Order/Deal),
 * never to decide the category of an arbitrary event.
 *
 * Lives in `core/` so both the self-hosted and cloud builds get it.
 */
import type { BotEvent } from '@/hooks/useBotEvents';

export type EventVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'profit'
  | 'loss';

export type EventIconKey =
  | 'buy'
  | 'sell'
  | 'filled'
  | 'placed'
  | 'cancelled'
  | 'error'
  | 'warning'
  | 'dealOpen'
  | 'dealClose'
  | 'takeProfit'
  | 'stopLoss'
  | 'statusStarted'
  | 'statusStopped'
  | 'settings'
  | 'share'
  | 'restart'
  | 'delete'
  | 'webhook'
  | 'manualBuy'
  | 'merge'
  | 'reset'
  | 'info';

export type TradeSide = 'buy' | 'sell';

export interface ClassifiedBotEvent {
  /** Headline subject shown as the timeline row title, e.g. "Order", "Deal". */
  title: string;
  /** Short uppercase state pill, e.g. "Filled", "Stopped". Omitted when noise. */
  label?: string;
  variant: EventVariant;
  iconKey: EventIconKey;
  /** Resolved buy/sell direction, only when the backend actually provides it. */
  side: TradeSide | null;
}

const lc = (v: unknown): string =>
  typeof v === 'string' ? v.toLowerCase() : '';

/**
 * Direction is only trustworthy when the backend spells it out (`side: sell`,
 * or an explicit "buy"/"sell"/"long"/"short" word). Many bots/exchanges leave
 * `side:` blank (e.g. HIP3 perps), in which case we return null rather than
 * inventing a direction from unrelated words like "close" or "exit".
 */
const parseSide = (event: BotEvent): TradeSide | null => {
  const desc = lc(event.description);
  const explicit = desc.match(/side:\s*(buy|sell|long|short)/);
  if (explicit) {
    return explicit[1] === 'buy' || explicit[1] === 'long' ? 'buy' : 'sell';
  }
  if (/\b(sell|short)\b/.test(desc)) return 'sell';
  if (/\b(buy|long)\b/.test(desc)) return 'buy';
  return null;
};

const orderAction = (
  desc: string
): { label: string; iconKey: EventIconKey; variant: EventVariant } => {
  if (desc.includes('cancel'))
    return { label: 'Cancelled', iconKey: 'cancelled', variant: 'default' };
  if (desc.includes('partial') && desc.includes('fill'))
    return { label: 'Partially filled', iconKey: 'filled', variant: 'success' };
  if (
    desc.includes('fill') ||
    desc.includes('fulfilled') ||
    desc.includes('executed')
  )
    return { label: 'Filled', iconKey: 'filled', variant: 'success' };
  if (desc.includes('expire') || desc.includes('timeout'))
    return { label: 'Expired', iconKey: 'cancelled', variant: 'warning' };
  // "Order created, orderId: …" and anything else placement-shaped.
  return { label: 'Placed', iconKey: 'placed', variant: 'info' };
};

/** Pick profit/loss colouring from a "profit: 1.23$" / "profit: -4.5$" tail. */
const profitVariant = (desc: string): EventVariant => {
  const m = desc.match(/profit:\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return 'success';
  return Number(m[1]) < 0 ? 'loss' : 'profit';
};

/**
 * Classify a single bot event into display fields. Keyed on the backend `event`
 * name first; `description`/`type` only refine an already-known shape.
 */
export function classifyBotEvent(event: BotEvent): ClassifiedBotEvent {
  const name = (event.event ?? '').trim();
  const key = name.toLowerCase();
  const desc = lc(event.description);

  // Error/warning severity always wins — never render an alert as a trade.
  if (event.type === 'error') {
    return {
      title: name || 'Error',
      label: 'Error',
      variant: 'error',
      iconKey: 'error',
      side: null,
    };
  }
  if (event.type === 'warning') {
    return {
      title: name || 'Warning',
      label: 'Warning',
      variant: 'warning',
      iconKey: 'warning',
      side: null,
    };
  }

  switch (key) {
    case 'order': {
      const side = parseSide(event);
      const { label, iconKey, variant } = orderAction(desc);
      const sideLabel = side ? (side === 'buy' ? 'Buy' : 'Sell') : '';
      return {
        title: 'Order',
        label: sideLabel ? `${sideLabel} ${label.toLowerCase()}` : label,
        variant: side === 'buy' ? 'profit' : side === 'sell' ? 'loss' : variant,
        iconKey: side === 'buy' ? 'buy' : side === 'sell' ? 'sell' : iconKey,
        side,
      };
    }
    case 'order error':
      return {
        title: 'Order',
        label: 'Error',
        variant: 'error',
        iconKey: 'error',
        side: null,
      };

    case 'take profit':
      return {
        title: 'Take profit',
        label: 'Filled',
        variant: 'profit',
        iconKey: 'takeProfit',
        side: 'sell',
      };
    case 'stop loss':
      return {
        title: 'Stop loss',
        label: 'Filled',
        variant: 'loss',
        iconKey: 'stopLoss',
        side: 'sell',
      };

    case 'open dca deal':
    case 'open combo deal':
      return {
        title: 'Deal',
        label: 'Opened',
        variant: 'info',
        iconKey: 'dealOpen',
        side: null,
      };
    case 'close dca deal':
    case 'close combo deal':
      return {
        title: 'Deal',
        label: 'Closed',
        variant: profitVariant(desc),
        iconKey: 'dealClose',
        side: null,
      };
    case 'deal': {
      // Generic deal lifecycle line: "Deal closed, id: …, profit: …".
      if (desc.includes('open'))
        return {
          title: 'Deal',
          label: 'Opened',
          variant: 'info',
          iconKey: 'dealOpen',
          side: null,
        };
      return {
        title: 'Deal',
        label: 'Closed',
        variant: profitVariant(desc),
        iconKey: 'dealClose',
        side: null,
      };
    }
    case 'deal change':
      return {
        title: 'Deal settings',
        label: 'Changed',
        variant: 'info',
        iconKey: 'settings',
        side: null,
      };
    case 'merge dca deals':
    case 'merge combo deals':
      return {
        title: 'Deals',
        label: 'Merged',
        variant: 'info',
        iconKey: 'merge',
        side: null,
      };
    case 'reset dca deal settings':
    case 'reset combo deal settings':
      return {
        title: 'Deal settings',
        label: 'Reset',
        variant: 'info',
        iconKey: 'reset',
        side: null,
      };

    case 'status': {
      // "<from> -> <to>" — colour/label by the target state, NOT by substring.
      const to = desc.split('->').pop()?.trim() ?? '';
      if (to.startsWith('close') || to.includes('stop'))
        return {
          title: 'Bot',
          label: 'Stopped',
          variant: 'default',
          iconKey: 'statusStopped',
          side: null,
        };
      if (to.startsWith('pause'))
        return {
          title: 'Bot',
          label: 'Paused',
          variant: 'warning',
          iconKey: 'statusStopped',
          side: null,
        };
      return {
        title: 'Bot',
        label: 'Started',
        variant: 'success',
        iconKey: 'statusStarted',
        side: null,
      };
    }
    case 'restart':
      return {
        title: 'Bot',
        label: 'Restarted',
        variant: 'success',
        iconKey: 'restart',
        side: null,
      };
    case 'delete':
      return {
        title: 'Bot',
        label: 'Deleted',
        variant: 'default',
        iconKey: 'delete',
        side: null,
      };

    // Settings/config changes — these used to be mislabelled "Bot Status"
    // whenever their diff text happened to contain "start"/"stop".
    case 'change':
      return {
        title: 'Settings',
        label: 'Changed',
        variant: 'info',
        iconKey: 'settings',
        side: null,
      };
    case 'change bot share':
      return {
        title: 'Sharing',
        label: 'Changed',
        variant: 'info',
        iconKey: 'share',
        side: null,
      };

    case 'webhook':
      return {
        title: 'Webhook',
        label: 'Received',
        variant: 'info',
        iconKey: 'webhook',
        side: null,
      };

    // Grid manual-buy dialog. Note: the backend emits this from the shared
    // `changeStatus` path without a bot-type guard, so it can appear on DCA
    // bots too (a backend bug, tracked separately). Render it cleanly either
    // way rather than leaking the internal "Buy dialog" string.
    case 'buy dialog':
      return {
        title: 'Manual buy',
        label: 'Triggered',
        variant: 'info',
        iconKey: 'manualBuy',
        side: null,
      };

    default:
      return {
        title: name || 'Event',
        variant: 'info',
        iconKey: 'info',
        side: null,
      };
  }
}
