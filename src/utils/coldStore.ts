/**
 * Cold-store archive UX gate.
 *
 * The backend moves an archived bot's order/transaction history to ClickHouse
 * when its own `COLD_STORE_ENABLED` flag is on. Archiving is REVERSIBLE
 * (PART 2): un-archive rehydrates the history back to Mongo. The dashboard
 * mirrors the backend with `VITE_COLD_STORE_ENABLED`: when true, archiving shows
 * the cold-storage confirmation dialog. Off by default so the UX ships dark and
 * flips in lock-step with the backend at rollout.
 */
export function isColdStoreArchiveUx(): boolean {
  const v = import.meta.env['VITE_COLD_STORE_ENABLED'] as string | undefined;
  return v === 'true' || v === '1';
}

/** A bot whose history has moved to cold storage (ClickHouse). Informational
 *  only — archiving is reversible, so this no longer gates any action.
 *  `coldArchived` comes from the bot GraphQL query. */
export function isColdArchivedBot(
  bot: { coldArchived?: boolean | null } | null | undefined,
): boolean {
  return !!bot?.coldArchived;
}
