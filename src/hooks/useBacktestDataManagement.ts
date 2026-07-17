/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GraphQLClient, getGraphQLConfig } from '@/lib/api';
import { botQueries } from '@/lib/api/GraphQLQueries-bot-queries';
import { logger } from '../lib/loggerInstance';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { dispatchBacktestDbEvent } from '@/constants/backtest';
import type { BacktestData } from './useBacktests';
import { useGraphQL } from './useGraphQL';
import {
  getAllFull as getAllLocalBacktestsFromDB,
  getById as getLocalBacktestById,
  removeId as removeBacktestIdFromDB,
  save as saveBacktestInDB,
} from '@/utils/backtest/db';
import { pouchDBSync } from '@/lib/pouchdbSync';
import type { BotTypesEnum, ExchangeEnum, StoreBacktest } from '@/types';

export interface BacktestDeleteInput {
  ids: string[];
  backtestType?: 'dca' | 'combo' | 'grid';
}

export interface BacktestExportInput {
  ids: string[];
  // Base download filename (without extension). Defaults to `backtests_<date>`.
  filename?: string;
  // When true, return Blob but do not trigger an automatic download
  skipDownload?: boolean;
}

export interface BacktestImportInput {
  data: BacktestData[];
}

export interface StorageStats {
  totalBacktests: number;
  totalSize: number;
  profitableBacktests: number;
  serverSideBacktests: number;
  localBacktests: number;
  oldestBacktest?: string;
  newestBacktest?: string;
}

export interface BacktestCleanupInput {
  olderThan?: string; // ISO date string
  unprofitableOnly?: boolean;
  maxCount?: number;
}

export interface BacktestShareInput {
  id: string;
  shareId?: string;
  backtestType?: 'dca' | 'combo' | 'grid';
}

export interface BacktestImportAsPaperInput {
  id: string;
  backtestType?: 'dca' | 'combo' | 'grid';
  exchange: ExchangeEnum;
  from?: number;
  to?: number;
  trades?: boolean;
}

export interface LoadBacktestDetailsInput {
  id: string;
}

export interface LoadBacktestDetailsResult {
  id: string;
  saved: boolean;
}

const getAuthenticatedClient = () => {
  const endpoint =
    import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
  const { tokens } = useAuthStore.getState();
  const { isLiveTrading } = useUIStore.getState();

  if (!tokens?.accessToken) {
    throw new Error('Authentication required. Please log in again.');
  }

  const config = getGraphQLConfig(tokens, isLiveTrading);
  return new GraphQLClient(endpoint, config.token, config.paperContext);
};

// Hook for deleting backtests
export function useDeleteBacktests() {
  const queryClient = useQueryClient();

  const resolveLocalBacktestIds = async (
    targetIds: string[]
  ): Promise<Set<string>> => {
    const normalizedTargets = new Set(
      targetIds
        .filter((value): value is string => typeof value === 'string')
        .map((value) => `${value}`)
    );

    const resolvedIds = new Set<string>(normalizedTargets);

    if (normalizedTargets.size === 0) {
      return resolvedIds;
    }

    const localEntries = await getAllLocalBacktestsFromDB();

    for (const entry of localEntries) {
      if (normalizedTargets.has(entry.id)) {
        resolvedIds.add(entry.id);
        continue;
      }

      if (!entry.data) {
        continue;
      }

      try {
        const parsed = JSON.parse(entry.data) as {
          _id?: unknown;
          id?: unknown;
        };
        const remoteId =
          parsed._id !== undefined
            ? `${parsed._id}`
            : parsed.id !== undefined
              ? `${parsed.id}`
              : null;

        if (remoteId && normalizedTargets.has(remoteId)) {
          resolvedIds.add(entry.id);
        }
      } catch {
        // Ignore malformed local payloads; continue with known ids.
      }
    }

    return resolvedIds;
  };

  const isBacktestQuery = (queryKey: readonly unknown[]) => {
    const root = queryKey[0];
    if (typeof root !== 'string') return false;

    const knownKeys = new Set([
      'backtests',
      'comboBacktests',
      'gridBacktests',
      'getBacktests',
      'getComboBacktests',
      'getGridBacktests',
      'user',
    ]);

    if (knownKeys.has(root)) return true;
    return root.toLowerCase().includes('backtest');
  };

  return useMutation<
    { success: boolean; deletedCount: number },
    Error,
    BacktestDeleteInput
  >({
    mutationFn: async (input: BacktestDeleteInput) => {
      const backtestType = input.backtestType ?? 'dca';
      logger.info('[useDeleteBacktests] Deleting backtests:', {
        trace: 'PUSHING_DELETION_TRACE',
        count: input.ids.length,
        ids: input.ids,
        backtestType,
      });

      const client = getAuthenticatedClient();
      const { query, variables } =
        backtestType === 'combo'
          ? botQueries.deleteComboBacktests({ ids: input.ids })
          : botQueries.deleteBacktests({ ids: input.ids });

      const operationName =
        backtestType === 'combo' ? 'deleteComboBacktests' : 'deleteBacktests';

      const response = await client.request<{
        [K in typeof operationName]: {
          status: string;
          reason?: string;
          data?: { deletedCount?: number };
        };
      }>(query, variables);

      const payload = response[operationName];
      if (payload?.status !== 'OK') {
        throw new Error(payload?.reason || 'Failed to delete backtests');
      }

      return {
        success: true,
        deletedCount: payload?.data?.deletedCount ?? input.ids.length,
      };
    },
    onSuccess: async (data, variables) => {
      logger.info('[useDeleteBacktests] Delete mutation successful:', {
        trace: 'PUSHING_DELETION_TRACE',
        deletedCount: data.deletedCount,
        requestedIds: variables.ids,
      });

      const resolvedLocalIds = await resolveLocalBacktestIds(variables.ids);
      const idsToDelete = Array.from(resolvedLocalIds);

      logger.debug('[useDeleteBacktests] Resolved local deletion ids', {
        trace: 'PUSHING_DELETION_TRACE',
        requestedIds: variables.ids,
        resolvedIds: idsToDelete,
      });

      // Remove locally cached full backtest payloads so merged lists cannot resurrect rows.
      const removeResults = await Promise.allSettled(
        idsToDelete.map((id) => removeBacktestIdFromDB(id))
      );

      const localDeleteFailures = removeResults.filter(
        (result) => result.status === 'rejected'
      ).length;
      if (localDeleteFailures > 0) {
        logger.warn(
          '[useDeleteBacktests] Failed to remove some local entries',
          {
            localDeleteFailures,
            totalRequested: idsToDelete.length,
          }
        );
      }

      // Create tombstones in local PouchDB so deletions can propagate to CouchDB.
      if (pouchDBSync.isReady()) {
        try {
          logger.info(
            '[useDeleteBacktests] PUSHING_DELETION_TRACE deleteDocuments',
            {
              ids: idsToDelete,
              category: 'backtests',
            }
          );
          await pouchDBSync.deleteDocuments('backtests', idsToDelete);

          // Best effort: push just backtest category immediately so remote cannot resurrect deleted docs.
          logger.info('[useDeleteBacktests] PUSHING_DELETION_TRACE forcePush', {
            categories: ['backtests'],
            ids: idsToDelete,
          });
          await pouchDBSync.forcePush(undefined, ['backtests']);
        } catch (error) {
          logger.warn(
            '[useDeleteBacktests] Failed to propagate PouchDB tombstones',
            {
              trace: 'PUSHING_DELETION_TRACE',
              ids: idsToDelete,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      // Notify local-db consumers (useLocalBacktestsByType) to reload.
      dispatchBacktestDbEvent();

      // Invalidate and actively refetch all backtest-related queries.
      await queryClient.invalidateQueries({
        predicate: (query) => isBacktestQuery(query.queryKey),
      });
      await queryClient.refetchQueries({
        predicate: (query) => isBacktestQuery(query.queryKey),
        type: 'active',
      });
    },
    onError: (error) => {
      logger.error('[useDeleteBacktests] Delete mutation failed:', {
        error: error.message,
      });
    },
  });
}

export function useShareBacktest() {
  return useMutation<
    { success: boolean; shareId: string },
    Error,
    BacktestShareInput
  >({
    mutationFn: async (input: BacktestShareInput) => {
      const backtestType = input.backtestType ?? 'dca';
      if (input.shareId && input.shareId.trim().length > 0) {
        return { success: true, shareId: input.shareId };
      }

      const client = getAuthenticatedClient();
      const { query, variables } =
        backtestType === 'combo'
          ? botQueries.shareComboBacktest({ _id: input.id })
          : backtestType === 'grid'
            ? botQueries.shareGridBacktest({ _id: input.id })
            : botQueries.shareBacktest({ _id: input.id });

      const operationName =
        backtestType === 'combo'
          ? 'shareComboBacktest'
          : backtestType === 'grid'
            ? 'shareGridBacktest'
            : 'shareBacktest';

      const response = await client.request<{
        [K in typeof operationName]: {
          status: string;
          reason?: string;
          data?: string;
        };
      }>(query, variables);

      const payload = response[operationName];
      if (payload?.status !== 'OK' || !payload?.data) {
        throw new Error(payload?.reason || 'Failed to share backtest');
      }

      return { success: true, shareId: payload.data };
    },
  });
}

export function useImportBacktestAsPaper() {
  return useMutation<
    { success: boolean; message: string },
    Error,
    BacktestImportAsPaperInput
  >({
    mutationFn: async (input: BacktestImportAsPaperInput) => {
      const client = getAuthenticatedClient();
      const botType: BotTypesEnum =
        input.backtestType === 'combo'
          ? ('combo' as BotTypesEnum)
          : ('dca' as BotTypesEnum);

      const { query, variables } = botQueries.requestOnboardingBacktest({
        presets: [
          {
            id: input.id,
            type: botType,
            exchange: input.exchange,
            from: input.from,
            to: input.to,
            fromBacktest: true,
            trades: input.trades,
          },
        ],
      });

      const response = await client.request<{
        requestOnboardingBacktest: {
          status: string;
          reason?: string;
          data?: string;
        };
      }>(query, variables);

      const payload = response.requestOnboardingBacktest;
      if (payload?.status !== 'OK') {
        throw new Error(
          payload?.reason || 'Failed to import backtest as paper bot'
        );
      }

      return { success: true, message: payload?.data || 'Import requested' };
    },
  });
}

export function useLoadBacktestDetails() {
  return useMutation<
    LoadBacktestDetailsResult,
    Error,
    LoadBacktestDetailsInput
  >({
    mutationFn: async (input: LoadBacktestDetailsInput) => {
      const { tokens } = useAuthStore.getState();

      if (!tokens?.accessToken) {
        throw new Error('Authentication required. Please log in again.');
      }

      const baseEndpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const endpoint = baseEndpoint.endsWith('/')
        ? baseEndpoint
        : `${baseEndpoint}/`;

      const response = await fetch(
        `${endpoint}api/loadBacktestDetails/${input.id}`,
        {
          headers: {
            token: tokens.accessToken,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to load backtest details');
      }

      const payload = (await response.json()) as StoreBacktest | undefined;
      if (!payload) {
        throw new Error('Backtest details payload is empty');
      }

      const entry: StoreBacktest = {
        ...payload,
        size: payload.size ?? payload.data?.length ?? 0,
      };

      const saved = await saveBacktestInDB(entry);
      if (!saved) {
        throw new Error('Failed to save backtest details locally');
      }

      dispatchBacktestDbEvent();
      return { id: input.id, saved: true };
    },
  });
}

// Hook for exporting backtests
export function useExportBacktests() {
  const queryClient = useQueryClient();

  return useMutation<Blob, Error, BacktestExportInput>({
    mutationFn: async (input: BacktestExportInput) => {
      logger.info('[useExportBacktests] Exporting backtests:', {
        count: input.ids.length,
      });

      // Try to gather backtests from react-query cache (getBacktests/comboBacktests/gridBacktests)
      const queries = queryClient.getQueriesData({ queryKey: [] });

      const extractArray = (d: unknown): BacktestData[] => {
        if (!d) return [];
        // GraphQL result shape
        if (typeof d === 'object' && d !== null) {
          if (Array.isArray((d as any).getBacktests?.data))
            return (d as any).getBacktests.data;
          if (Array.isArray((d as any).backtests)) return (d as any).backtests;
          // Generic data array
          if (Array.isArray((d as any).data)) return (d as any).data;
        }
        if (Array.isArray(d)) return d as BacktestData[];
        return [];
      };

      const allBacktestsMap = new Map<string, BacktestData>();

      for (const [, data] of queries) {
        const arr = extractArray(data);
        for (const bt of arr) {
          if (bt && bt._id) allBacktestsMap.set(bt._id, bt);
        }
      }

      // Backtests that ran client-side live only in the local IndexedDB store
      // (the react-query cache holds server summaries). For any requested id we
      // couldn't find in the cache, pull its full payload from local storage so
      // locally-run backtests export their complete, re-importable data.
      const missingIds = input.ids.filter((id) => !allBacktestsMap.has(id));
      for (const id of missingIds) {
        try {
          const entry = await getLocalBacktestById(id, true);
          if (!entry?.data) continue;
          const parsed =
            typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data;
          if (parsed && typeof parsed === 'object') {
            const bt = {
              ...(parsed as BacktestData),
              _id: (parsed as { _id?: string })._id ?? entry.id,
            } as BacktestData;
            allBacktestsMap.set(id, bt);
          }
        } catch (error) {
          logger.error('[useExportBacktests] Failed to read local backtest', {
            id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const allBacktests = Array.from(allBacktestsMap.values());

      const selected = allBacktests.filter((bt) => input.ids.includes(bt._id));

      if (selected.length === 0) {
        throw new Error('No exportable data found for the selected backtest(s)');
      }

      // Build export content (JSON, wrapped for import compatibility)
      const baseName =
        input.filename?.trim() ||
        `backtests_${new Date().toISOString().split('T')[0]}`;
      const filename = `${baseName}.json`;
      const exportData = {
        category: 'backtests',
        data: selected,
        exportedAt: new Date().toISOString(),
        count: selected.length,
      };
      const content = JSON.stringify(exportData, null, 2);

      const blob = new Blob([content], { type: 'application/json' });

      // If not explicitly requested to skip download, trigger download
      if (!input.skipDownload) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      logger.info('[useExportBacktests] Export completed:', {
        filename,
        size: blob.size,
        exportedCount: selected.length,
      });

      return blob;
    },
    onError: (error) => {
      logger.error('[useExportBacktests] Export failed:', {
        error: error.message,
      });
    },
  });
}

// Hook for importing backtests
export function useImportBacktests() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; importedCount: number }, Error, File>({
    mutationFn: async (file: File) => {
      logger.info('[useImportBacktests] Importing backtests:', {
        filename: file.name,
        size: file.size,
      });

      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const content = e.target?.result as string;
            let backtests: BacktestData[];

            if (file.name.endsWith('.json')) {
              backtests = JSON.parse(content);
            } else if (file.name.endsWith('.csv')) {
              // Simple CSV parsing - in production, use a proper CSV parser
              const lines = content.split('\n');
              // const headers = lines[0].split(',');
              backtests = lines
                .slice(1)
                .map((line) => {
                  const values = line.split(',');
                  return {
                    _id: values[0] || '',
                    settings: {
                      name: values[1] || '',
                      pair: [values[2] || ''],
                      strategy: values[3] || '',
                    },
                    financial: {
                      netProfitTotal: parseFloat(values[4]) || 0,
                      annualizedReturn: parseFloat(values[5]) || 0,
                      maxDrawDown: parseFloat(values[6]) || 0,
                    },
                    created: values[7] || new Date().toISOString(),
                  };
                })
                .filter((bt) => bt._id); // Filter out empty rows
            } else {
              throw new Error(
                'Unsupported file format. Please use JSON or CSV files.'
              );
            }

            // TODO: Implement actual import to backend
            // For now, just simulate success

            logger.info('[useImportBacktests] Import completed:', {
              importedCount: backtests.length,
            });

            resolve({
              success: true,
              importedCount: backtests.length,
            });
          } catch (error) {
            reject(
              new Error(
                `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );
          }
        };

        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
      });
    },
    onSuccess: (data) => {
      logger.info('[useImportBacktests] Import mutation successful:', {
        importedCount: data.importedCount,
      });

      // Invalidate backtest queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['backtests'] });
      queryClient.invalidateQueries({ queryKey: ['comboBacktests'] });
      queryClient.invalidateQueries({ queryKey: ['gridBacktests'] });
    },
    onError: (error) => {
      logger.error('[useImportBacktests] Import mutation failed:', {
        error: error.message,
      });
    },
  });
}

// Hook for getting storage statistics
export function useBacktestStorageStats() {
  return useGraphQL<{ getBacktestStorageStats: StorageStats }>(
    'user',
    {
      query: `
      query GetBacktestStorageStats {
        getBacktestStorageStats {
          totalBacktests
          totalSize
          profitableBacktests
          serverSideBacktests
          localBacktests
          oldestBacktest
          newestBacktest
        }
      }
    `,
    },
    {
      queryKey: ['backtestStorageStats'],
      staleTime: 5 * 60 * 1000, // 5 minutes
      // For now, return mock data since the backend endpoint doesn't exist yet
      enabled: false,
    }
  );
}

// Hook for cleaning up old backtests
export function useCleanupBacktests() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; deletedCount: number },
    Error,
    BacktestCleanupInput
  >({
    mutationFn: async (input: BacktestCleanupInput) => {
      logger.info('[useCleanupBacktests] Cleaning up backtests:', input);

      // TODO: Implement actual cleanup logic with backend
      // For now, simulate cleanup

      const deletedCount = Math.floor(Math.random() * 10); // Mock deletion count

      logger.info('[useCleanupBacktests] Cleanup completed:', {
        deletedCount,
      });

      return {
        success: true,
        deletedCount,
      };
    },
    onSuccess: (data) => {
      logger.info('[useCleanupBacktests] Cleanup mutation successful:', {
        deletedCount: data.deletedCount,
      });

      // Invalidate backtest queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['backtests'] });
      queryClient.invalidateQueries({ queryKey: ['comboBacktests'] });
      queryClient.invalidateQueries({ queryKey: ['gridBacktests'] });
      queryClient.invalidateQueries({ queryKey: ['backtestStorageStats'] });
    },
    onError: (error) => {
      logger.error('[useCleanupBacktests] Cleanup mutation failed:', {
        error: error.message,
      });
    },
  });
}
