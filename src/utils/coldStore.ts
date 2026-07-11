/**
 * Cold-store archive UX gate.
 *
 * The backend moves an archived bot's order/transaction history to ClickHouse
 * and makes the bot READ-ONLY / one-way (design phase 3), but only when its
 * own `COLD_STORE_ENABLED` flag is on. The dashboard mirrors that with
 * `VITE_COLD_STORE_ENABLED`: when true, archiving shows the read-only warning
 * and cold-archived bots hide their un-archive action. Off by default so the UX
 * ships dark and flips in lock-step with the backend at rollout.
 */
export function isColdStoreArchiveUx(): boolean {
  const v = import.meta.env['VITE_COLD_STORE_ENABLED'] as string | undefined;
  return v === 'true' || v === '1';
}

/** A bot whose history has moved to cold storage — read-only / one-way
 *  (cannot be un-archived; clone to reuse). `coldArchived` comes from the
 *  bot GraphQL query; absent/false = grandfathered (still reversible). */
export function isColdArchivedBot(
  bot: { coldArchived?: boolean | null } | null | undefined,
): boolean {
  return !!bot?.coldArchived;
}
