/**
 * Utility functions for bot status management
 * Centralized logic for determining if bots can be started/stopped
 * and calculating target statuses
 */

import type { BotStatus } from '@/types';

/**
 * Active statuses - bots that are running and can be stopped
 * - open: Bot is actively trading
 * - error: Bot encountered an error but is still considered active
 * - range: Bot is in range mode (grid bots)
 * - monitoring: Bot is monitoring the market
 */
export const ACTIVE_STATUSES: string[] = [
  'open',
  'error',
  'range',
  'monitoring',
];

/**
 * Inactive statuses - bots that are stopped and can be started
 * - closed: Bot is stopped
 * - archive: Bot is archived (can still be started)
 */
export const INACTIVE_STATUSES: string[] = ['closed', 'archive', 'archived'];

/**
 * Statuses that allow bot deletion.
 * Note: some API responses may return 'archived' instead of 'archive'.
 */
export const DELETABLE_STATUSES: string[] = ['closed', 'archive', 'archived'];

/**
 * Statuses that allow archiving / unarchiving.
 * Legacy rule (enforced by the backend): only a stopped bot can be archived,
 * and an archived bot can be unarchived. Archiving a running bot is rejected
 * server-side, so the action must be blocked for active statuses here too.
 * Note: some API responses may return 'archived' instead of 'archive'.
 */
export const ARCHIVABLE_STATUSES: string[] = ['closed', 'archive', 'archived'];

/**
 * Statuses that allow bot restart.
 * Restart is only available for active bots.
 */
export const RESTARTABLE_STATUSES: string[] = [...ACTIVE_STATUSES];

function normalizeStatus(status: BotStatus | string): string {
  return String(status || '').toLowerCase();
}

/**
 * Check if a bot status is considered active (can be stopped)
 */
export function isBotActive(status: BotStatus | string): boolean {
  return ACTIVE_STATUSES.includes(normalizeStatus(status));
}

/**
 * Check if a bot status is considered inactive (can be started)
 */
export function isBotInactive(status: BotStatus | string): boolean {
  return INACTIVE_STATUSES.includes(normalizeStatus(status));
}

/**
 * Check if a bot can be restarted.
 * Only active bots are restartable.
 */
export function isBotRestartable(status: BotStatus | string): boolean {
  return RESTARTABLE_STATUSES.includes(normalizeStatus(status));
}

/**
 * Check if a bot can be deleted.
 * Only closed/archived bots are deletable.
 */
export function isBotDeletable(status: BotStatus | string): boolean {
  return DELETABLE_STATUSES.includes(normalizeStatus(status));
}

/**
 * Helper message explaining why delete is blocked.
 */
export function getDeleteBlockedReason(
  status: BotStatus | string
): string | undefined {
  if (isBotDeletable(status)) {
    return undefined;
  }

  return 'Only closed or archived bots can be deleted. Stop the bot first.';
}

/**
 * Check if a bot can be archived or unarchived.
 * Only stopped/archived bots qualify; running bots must be stopped first.
 */
export function isBotArchivable(status: BotStatus | string): boolean {
  return ARCHIVABLE_STATUSES.includes(normalizeStatus(status));
}

/**
 * Helper message explaining why archive is blocked.
 */
export function getArchiveBlockedReason(
  status: BotStatus | string
): string | undefined {
  if (isBotArchivable(status)) {
    return undefined;
  }

  return 'Only stopped bots can be archived. Stop the bot first.';
}

/**
 * Check if a bot can be toggled (started or stopped)
 * Returns true for all valid statuses
 */
export function canToggleBotStatus(status: BotStatus | string): boolean {
  return isBotActive(status) || isBotInactive(status);
}

/**
 * Get the target status when toggling a bot
 * Active bots -> closed
 * Inactive bots -> open
 */
export function getTargetStatus(currentStatus: BotStatus | string): BotStatus {
  return isBotActive(currentStatus) ? 'closed' : 'open';
}

/**
 * Check if the action is a stop action (vs start action)
 */
export function isStopAction(currentStatus: BotStatus | string): boolean {
  return isBotActive(currentStatus);
}

/**
 * Get display text for the action
 */
export function getActionText(currentStatus: BotStatus | string): string {
  return isStopAction(currentStatus) ? 'Stop' : 'Start';
}

/**
 * Get past tense action text for notifications
 */
export function getActionPastTense(currentStatus: BotStatus | string): string {
  return isStopAction(currentStatus) ? 'stopped' : 'started';
}

/**
 * Get present participle action text for loading states
 */
export function getActionPresent(currentStatus: BotStatus | string): string {
  return isStopAction(currentStatus) ? 'Stopping' : 'Starting';
}

/**
 * Filter bots that can be started (inactive bots)
 */
export function filterStartableBots<T extends { status: string }>(
  bots: T[]
): T[] {
  return bots.filter((b) => isBotInactive(b.status));
}

/**
 * Filter bots that can be stopped (active bots)
 */
export function filterStoppableBots<T extends { status: string }>(
  bots: T[]
): T[] {
  return bots.filter((b) => isBotActive(b.status));
}

/**
 * Filter bots that can be restarted (active bots).
 */
export function filterRestartableBots<T extends { status: string }>(
  bots: T[]
): T[] {
  return bots.filter((b) => isBotRestartable(b.status));
}

/**
 * Filter bots that can be deleted.
 */
export function filterDeletableBots<T extends { status: string }>(
  bots: T[]
): T[] {
  return bots.filter((b) => isBotDeletable(b.status));
}

/**
 * Check whether every selected bot can be deleted.
 */
export function areAllBotsDeletable<T extends { status: string }>(
  bots: T[]
): boolean {
  return bots.length > 0 && bots.every((b) => isBotDeletable(b.status));
}
