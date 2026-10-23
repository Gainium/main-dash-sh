import type { UnifiedNotification } from '@/stores/notificationsStore';

/**
 * Whether a notification gets its own "Mark as read" control.
 *
 * Updates (changelog) have no per-item read state: `readChangeLog` moves the
 * user's single read watermark to the newest Update, so a per-item control
 * would mark every Update read. They are cleared from their tab's mark-all.
 */
export function canMarkSingleRead(
  notification: Pick<UnifiedNotification, 'isRead' | 'notificationType'>
): boolean {
  return !notification.isRead && notification.notificationType !== 'changelog';
}
