import logger from '@/lib/loggerInstance';
import { createQueuedIndexedDBStorage } from '@/lib/zustand-indexeddb-storage';
import { boundPerBot, newestEntries } from './persistBounds';

/** Transactions per bot kept in the persisted cache (newest first). */
const PERSISTED_PER_BOT = 200;
/** A bot's in-memory map is trimmed back to WS_KEEP once websocket appends
 *  push it past WS_TRIM_AT (a fetch replaces the bucket anyway). */
const WS_KEEP = 1000;
const WS_TRIM_AT = 1200;
import type { Transaction } from '@/types';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Migration function to convert array-based transactions to object-based
const migrateTransactionData = (
  data:
    | Record<string, Record<string, Transaction>>
    | Record<string, Transaction[]>
): Record<string, Record<string, Transaction>> => {
  if (!data || typeof data !== 'object') return {};

  const migrated: Record<string, Record<string, Transaction>> = {};

  Object.entries(data).forEach(([botId, transactions]) => {
    if (Array.isArray(transactions)) {
      // Old format: array of transactions - convert to object keyed by transaction ID
      migrated[botId] = {};
      transactions.forEach((transaction: Transaction) => {
        if (transaction && transaction._id) {
          migrated[botId][transaction._id] = transaction;
        }
      });
    } else if (transactions && typeof transactions === 'object') {
      // New format: already object keyed by transaction ID
      migrated[botId] = transactions as Record<string, Transaction>;
    } else {
      // Initialize empty object for invalid data
      migrated[botId] = {};
    }
  });

  return migrated;
};

interface TransactionsStoreState {
  // Transactions by bot ID - each bot has transactions keyed by transaction ID
  transactions: Record<string, Record<string, Transaction>>;

  // Loading states
  loading: Record<string, boolean>;

  // Error states
  errors: Record<string, string | null>;

  /** True once IndexedDB rehydration has completed. Lets consumers
   *  distinguish "transactions not loaded yet" from "fetched and there really
   *  are none" so the table doesn't flash empty during the IDB read window. */
  _hasHydrated: boolean;

  // Actions
  updateTransaction: (transaction: Transaction) => void;
  updateTransactionFromWebSocket: (update: {
    botId: string;
    data: Transaction;
  }) => void;
  updateTransactions: (botId: string, transactions: Transaction[]) => void;
  removeTransaction: (botId: string, transactionId: string) => void;
  setTransactionsLoading: (botId: string, loading: boolean) => void;
  setTransactionsError: (botId: string, error: string | null) => void;
  setHasHydrated: (state: boolean) => void;
  clearTransactions: (botId: string) => void;
  clearAllTransactions: () => void;

  // Selectors
  getTransactions: (botId: string) => Transaction[];
  getAllTransactions: () => Record<string, Transaction[]>;
  getTransaction: (botId: string, transactionId: string) => Transaction | null;
  isTransactionsLoading: (botId: string) => boolean;
  getTransactionsError: (botId: string) => string | null;
}

export const useTransactionsStore = create<TransactionsStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        transactions: {},
        loading: {},
        errors: {},
        _hasHydrated: false,

        updateTransaction: (transaction: Transaction) => {
          const { botId } = transaction;
          set((state) => {
            const currentTransactions = state.transactions[botId] || {};
            let nextBucket: Record<string, Transaction> = {
              ...currentTransactions,
              [transaction._id]: transaction,
            };
            if (Object.keys(nextBucket).length > WS_TRIM_AT) {
              nextBucket = newestEntries(nextBucket, WS_KEEP);
            }

            return {
              transactions: {
                ...state.transactions,
                [botId]: nextBucket,
              },
              loading: {
                ...state.loading,
                [botId]: false,
              },
              errors: {
                ...state.errors,
                [botId]: null,
              },
            };
          });
        },

        updateTransactionFromWebSocket: (update: {
          botId: string;
          data: Transaction;
        }) => {
          const { botId, data } = update;

          // Conflict resolution: Check if we already have this transaction
          const existingTransactions = get().transactions[botId] || {};
          const existingTransaction = existingTransactions[data._id];

          if (existingTransaction && data.updateTime) {
            // Compare updateTime (numbers in milliseconds)
            if (data.updateTime < existingTransaction.updateTime) {
              // WebSocket data is older, skip update
              logger.debug(
                `[TransactionsStore] Skipping stale WebSocket update for transaction ${data._id}`,
                {
                  wsTime: data.updateTime,
                  existingTime: existingTransaction.updateTime,
                }
              );
              return;
            }
          }

          get().updateTransaction({ ...data, botId });
        },

        updateTransactions: (botId: string, transactions: Transaction[]) => {
          // Convert array to object keyed by transaction ID
          const transactionsObj: Record<string, Transaction> = {};
          transactions.forEach((transaction) => {
            if (transaction._id) {
              transactionsObj[transaction._id] = transaction;
            }
          });

          set((state) => ({
            transactions: {
              ...state.transactions,
              [botId]: transactionsObj,
            },
            loading: {
              ...state.loading,
              [botId]: false,
            },
            errors: {
              ...state.errors,
              [botId]: null,
            },
          }));
        },

        removeTransaction: (botId: string, transactionId: string) => {
          set((state) => {
            const currentTransactions = state.transactions[botId] || {};
            const {
              [transactionId]: _removedTransaction,
              ...remainingTransactions
            } = currentTransactions;

            return {
              transactions: {
                ...state.transactions,
                [botId]: remainingTransactions,
              },
            };
          });
        },

        setTransactionsLoading: (botId: string, loading: boolean) => {
          set((state) => ({
            loading: {
              ...state.loading,
              [botId]: loading,
            },
          }));
        },

        setTransactionsError: (botId: string, error: string | null) => {
          set((state) => ({
            errors: {
              ...state.errors,
              [botId]: error,
            },
            loading: {
              ...state.loading,
              [botId]: false,
            },
          }));
        },

        clearTransactions: (botId: string) => {
          set((state) => {
            const { [botId]: _, ...remainingTransactions } = state.transactions;
            const { [botId]: __, ...remainingLoading } = state.loading;
            const { [botId]: ___, ...remainingErrors } = state.errors;

            return {
              transactions: remainingTransactions,
              loading: remainingLoading,
              errors: remainingErrors,
            };
          });
        },

        clearAllTransactions: () => {
          set({
            transactions: {},
            loading: {},
            errors: {},
          });
        },

        getTransactions: (botId: string) => {
          const transactionsObj = get().transactions[botId] || {};
          return Object.values(transactionsObj);
        },

        getAllTransactions: () => {
          const allTransactions = get().transactions;
          const result: Record<string, Transaction[]> = {};

          Object.entries(allTransactions).forEach(
            ([botId, transactionsObj]) => {
              result[botId] = Object.values(transactionsObj);
            }
          );

          return result;
        },

        getTransaction: (botId: string, transactionId: string) => {
          const botTransactions = get().transactions[botId] || {};
          return botTransactions[transactionId] || null;
        },

        isTransactionsLoading: (botId: string) => {
          return get().loading[botId] || false;
        },

        getTransactionsError: (botId: string) => {
          return get().errors[botId] || null;
        },

        setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
      }),
      {
        name: 'transactions-store',
        storage: createQueuedIndexedDBStorage('transactions-store', {
          prepare: (persisted) => {
            const p = persisted as Pick<TransactionsStoreState, 'transactions'>;
            return {
              transactions: boundPerBot(p.transactions ?? {}, PERSISTED_PER_BOT),
            };
          },
        }),
        // One-time cache bust: drop stale persisted transactions on upgrade.
        version: 1,
        migrate: () => ({ transactions: {} }),
        // Only persist bot data, not loading/error states
        partialize: (state) => ({
          transactions: state.transactions,
        }),
        // Merge persisted data with initial state and migrate if necessary
        merge: (persistedState, currentState) => {
          // Null on a fresh profile (nothing saved yet).
          const state = (persistedState ?? {}) as Partial<TransactionsStoreState>;
          let migratedTransactions = {};

          if (state.transactions) {
            try {
              migratedTransactions = migrateTransactionData(state.transactions);
              logger.info(
                '[TransactionsStore] Successfully migrated transaction data structure'
              );
            } catch (error) {
              logger.error(
                '[TransactionsStore] Failed to migrate transaction data:',
                error
              );
              migratedTransactions = {};
            }
          }

          return {
            ...currentState,
            ...state,
            transactions: migratedTransactions,
            // Reset loading/error states on hydration
            loading: {},
            errors: {},
          };
        },
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            logger.error('[TransactionsStore] Rehydration error:', error);
          }
          useTransactionsStore.getState().setHasHydrated(true);
        },
      }
    ),
    {
      name: 'transactions-store',
    }
  )
);
