import {
  DEFAULT_READ_TIMEOUT_MS,
  GraphQLClient,
  GraphQlQuery,
  type ReturnResult,
} from '@/lib/api';
import { useFiatCurrencies } from '@/hooks/useFiatCurrencies';
import { useAuthStore } from '@/stores/authStore';
import { useReportingCurrencyStore } from '@/stores/reportingCurrencyStore';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

export const REPORTING_CURRENCY_QUERY_KEY = ['user-reporting-currency'];

/**
 * Keeps the reporting-currency store in step with the account setting and the
 * backend's fiat rates. Renders nothing; mount once near the app root.
 */
export function ReportingCurrencySync() {
  const accessToken = useAuthStore((s) => s.tokens?.accessToken);
  const setCode = useReportingCurrencyStore((s) => s.setCode);
  const setRates = useReportingCurrencyStore((s) => s.setRates);
  const { rates } = useFiatCurrencies();

  useEffect(() => {
    if (rates.length) setRates(rates);
  }, [rates, setRates]);

  const { data } = useQuery({
    queryKey: REPORTING_CURRENCY_QUERY_KEY,
    queryFn: async () => {
      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const client = new GraphQLClient(endpoint, accessToken ?? '', true);
      const { query } = GraphQlQuery.userReportingCurrency();
      const resp = await client.request<{
        user: ReturnResult<{ reportingCurrency?: string | null }>;
      }>(query, undefined, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });
      if (resp?.user?.status !== 'OK') return null;
      return resp.user.data?.reportingCurrency || 'USD';
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (data) setCode(data);
  }, [data, setCode]);

  return null;
}

export default ReportingCurrencySync;
