import { useAuthStore } from '@/stores/authStore';
import { getValidTimezone } from '@/utils/timeUtils';

/**
 * The zone a calendar DAY means for this account — the `TIME ZONE` field in
 * Settings, which is the platform's canonical per-user day boundary:
 * `getProfitByUser` buckets daily profit by it, and the Overview Profit and
 * Hero Balance widgets send it by name.
 *
 * Every surface that turns an instant into a day has to agree on this, or one
 * deal ends up filed under two different days by one dashboard — which is
 * exactly what the data-table date columns did while they rendered and
 * filtered in the BROWSER's zone.
 *
 * Falls back to the browser's own resolved zone when the account never set the
 * field or stored something `Intl` rejects (`getValidTimezone`), so an account
 * without a usable setting keeps behaving exactly as it did.
 */
export function useAccountTimeZone(): string {
  return useAuthStore((s) => getValidTimezone(s.user?.timezone));
}
