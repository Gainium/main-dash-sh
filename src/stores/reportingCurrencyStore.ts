import {
  buildCurrencies,
  getCurrencyInfo,
  type Currency,
  type FiatRate,
} from '@/utils/currencyUtils';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The user's reporting currency — the fiat every USD value in the dashboard is
 * shown in. `code` is what the user picked (saved on the account, mirrored
 * here); `currency` is what is actually in effect: the picked code with its
 * live rate, or USD while that rate is unknown. There is no guessed rate.
 *
 * Persisted so the first paint after a reload uses the last known currency
 * instead of flashing USD; `ReportingCurrencySync` refreshes both fields.
 */
interface ReportingCurrencyState {
  code: string;
  currency: Currency;
  rates: FiatRate[];
  setCode: (code: string) => void;
  setRates: (rates: FiatRate[]) => void;
}

const resolve = (code: string, rates: FiatRate[]): Currency =>
  getCurrencyInfo(code, buildCurrencies(rates));

export const useReportingCurrencyStore = create<ReportingCurrencyState>()(
  persist(
    (set, get) => ({
      code: 'USD',
      currency: resolve('USD', []),
      rates: [],
      setCode: (code) => {
        if (code === get().code) return;
        set({ code, currency: resolve(code, get().rates) });
      },
      setRates: (rates) => set({ rates, currency: resolve(get().code, rates) }),
    }),
    {
      name: 'reporting-currency-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ code: s.code, rates: s.rates }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ReportingCurrencyState>;
        const code = typeof p.code === 'string' ? p.code : current.code;
        const rates = Array.isArray(p.rates) ? p.rates : current.rates;
        return { ...current, code, rates, currency: resolve(code, rates) };
      },
    }
  )
);
