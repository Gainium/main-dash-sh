import { useAuthStore } from '@/stores/authStore';

/**
 * Whether the signed-in user is in the beta-tester group.
 *
 * 'Alpha' is the historical group name used to gate new-exchange launches
 * (Coinbase 2024, Kraken 2026, OKX Europe X-Perps 2026) — membership is set
 * on the user document by an admin. Same signal the Navbar uses for the beta
 * badge.
 */
export const useIsBetaUser = (): boolean =>
  useAuthStore((s) => (s.user?.groups ?? []).includes('Alpha'));
