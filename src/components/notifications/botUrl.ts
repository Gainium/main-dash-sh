/** Route of the bot a bot notification belongs to, or null for system rows. */
export function botUrlFor(notification: {
  botId?: string | undefined;
  botType?: string | undefined;
}): string | null {
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
