import { isHyperliquidAgentRejection } from '@/utils/hyperliquidRenewal';

/** The system notice the Hyperliquid API-wallet expiry sync writes. */
const isHyperliquidAgentNotice = (n: {
  botId?: string | undefined;
  message?: string | undefined;
}) =>
  n.botId === 'system' && /Hyperliquid API wallet/.test(`${n.message ?? ''}`);

/**
 * Where a bot notification leads: the bot it belongs to, or null for system
 * rows. A Hyperliquid API-wallet expiry notice — and a bot message carrying
 * Hyperliquid's refusal of an expired wallet — leads to the renewal instead,
 * because renewing is the one thing that fixes it.
 */
export function botUrlFor(notification: {
  botId?: string | undefined;
  botType?: string | undefined;
  message?: string | undefined;
}): string | null {
  if (
    isHyperliquidAgentNotice(notification) ||
    isHyperliquidAgentRejection(notification.message)
  ) {
    return '/exchanges?renew=hyperliquid';
  }
  if (!notification.botId || notification.botId === 'system') return null;
  switch (notification.botType) {
    case 'hedgeCombo':
      return `/hedge/combo/view/${notification.botId}`;
    case 'hedgeDca':
      return `/hedge/bot/view/${notification.botId}`;
    case 'grid':
      return `/grid/view/${notification.botId}`;
    case 'combo':
      return `/combo/view/${notification.botId}`;
    default:
      return `/bot/view/${notification.botId}`;
  }
}
