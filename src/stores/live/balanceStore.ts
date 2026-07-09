import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { BalanceUpdate } from '../../services/websocket/BotWebSocketManager';

export interface BalanceData {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue?: number;
  exchangeUUID: string;
  [key: string]: unknown;
}

interface BalanceStoreState {
  // Balance data
  balances: BalanceData[];

  // Loading state
  loading: boolean;

  // Error state
  error: string | null;

  // Actions
  updateBalances: (balances: BalanceData[]) => void;
  updateBalanceFromWebSocket: (update: BalanceUpdate) => void;
  updateSingleBalance: (asset: string, balance: Partial<BalanceData>) => void;
  setBalanceLoading: (loading: boolean) => void;
  setBalanceError: (error: string | null) => void;
  clearBalances: () => void;

  // Selectors
  getBalances: () => BalanceData[];
  getBalance: (asset: string) => BalanceData | null;
  getTotalUsdValue: () => number;
  isBalanceLoading: () => boolean;
  getBalanceError: () => string | null;
}

export const useBalanceStore = create<BalanceStoreState>()(
  devtools(
    (set, get) => ({
      balances: [],
      loading: false,
      error: null,

      updateBalances: (balances: BalanceData[]) => {
        set({
          balances,
          loading: false,
          error: null,
        });
      },

      updateBalanceFromWebSocket: (update: BalanceUpdate) => {
        const { data } = update;

        // Transform WebSocket data to BalanceData format
        const incoming: BalanceData[] = data.map(
          (balance: Record<string, unknown>) => ({
            asset: (balance['asset'] as string) || '',
            free: (balance['free'] as number) || 0,
            locked: (balance['locked'] as number) || 0,
            total: (balance['total'] as number) || 0,
            usdValue: balance['usdValue'] as number,
            exchangeUUID: balance['exchangeUUID'] as string,
            ...balance,
          })
        );

        // MERGE, don't replace. A `balance` notification carries only the
        // exchange(s) that had activity (every entry is tagged with its
        // exchangeUUID). The old code called updateBalances() here, which
        // wholesale-replaced the cross-exchange store — so a balance event for
        // one exchange wiped every *other* exchange's balances, and the bot
        // form (which reads the selected exchange's free balance out of this
        // store) showed "BAL 0" for any exchange that wasn't in the event.
        // Upsert per (exchangeUUID, asset) so only the assets in the event
        // change; all other exchanges and assets are preserved.
        set((state) => {
          const keyOf = (b: { exchangeUUID?: string; asset?: string }) =>
            `${b.exchangeUUID ?? ''}::${(b.asset ?? '').toUpperCase()}`;
          const byKey = new Map(state.balances.map((b) => [keyOf(b), b]));
          for (const b of incoming) {
            byKey.set(keyOf(b), b);
          }
          return {
            balances: Array.from(byKey.values()),
            loading: false,
            error: null,
          };
        });
      },

      updateSingleBalance: (
        asset: string,
        balanceUpdate: Partial<BalanceData>,
        exchangeUUID: string
      ) => {
        set((state) => {
          const existingIndex = state.balances.findIndex(
            (b) => b.asset === asset
          );

          if (existingIndex >= 0) {
            // Update existing balance
            const updatedBalances = [...state.balances];
            updatedBalances[existingIndex] = {
              ...updatedBalances[existingIndex],
              ...balanceUpdate,
            };
            return { balances: updatedBalances };
          } else {
            // Add new balance
            const newBalance: BalanceData = {
              asset,
              free: 0,
              locked: 0,
              total: 0,
              exchangeUUID,
              ...balanceUpdate,
            };
            return { balances: [...state.balances, newBalance] };
          }
        });
      },

      setBalanceLoading: (loading: boolean) => {
        set({ loading });
      },

      setBalanceError: (error: string | null) => {
        set({
          error,
          loading: false,
        });
      },

      clearBalances: () => {
        set({
          balances: [],
          loading: false,
          error: null,
        });
      },

      getBalances: () => {
        return get().balances;
      },

      getBalance: (asset: string) => {
        return get().balances.find((b) => b.asset === asset) || null;
      },

      getTotalUsdValue: () => {
        return get().balances.reduce((total, balance) => {
          return total + (balance.usdValue || 0);
        }, 0);
      },

      isBalanceLoading: () => {
        return get().loading;
      },

      getBalanceError: () => {
        return get().error;
      },
    }),
    {
      name: 'balance-store',
    }
  )
);
