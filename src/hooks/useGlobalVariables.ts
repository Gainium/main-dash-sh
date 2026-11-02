/**
 * Custom hooks for Global Variables data management
 *
 * This module provides comprehensive hooks for managing global variables:
 * - Data fetching with caching and pagination
 * - CRUD operations with optimistic updates
 * - Real-time validation and error handling
 * - Bulk operations support
 */

import { GraphQLClient, type ReturnResult } from '@/lib/api';
import GraphQlQuery from '@/lib/api/GraphQLQueries';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { GlobalVariablesTypeEnum } from '@/types';
import {
  type BulkDeleteRequest,
  type BulkDeleteResponse,
  type BulkUpdateRequest,
  type BulkUpdateResponse,
  type CreateGlobalVariableRequest,
  type CreateGlobalVariableResponse,
  type DeleteGlobalVariableResponse,
  type GetGlobalVariablesRequest,
  type GetGlobalVariablesResponse,
  type GetRelatedBotsResponse,
  type GetStatsResponse,
  type GlobalVariable,
  type GlobalVariableFormData,
  type UpdateGlobalVariableRequest,
  type UpdateGlobalVariableResponse,
  type UseGlobalVariableMutationsReturn,
  type UseGlobalVariablesReturn,
  type VariableNameValidationResponse,
} from '@/types/globalVariables';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

// Query Keys
const QUERY_KEYS = {
  globalVariables: 'globalVariables',
  globalVariableStats: 'globalVariableStats',
  relatedBots: 'relatedBots',
  validateName: 'validateVariableName',
} as const;

/**
 * Hook for fetching global variables with advanced filtering and pagination
 */
export function useGlobalVariables(
  options: GetGlobalVariablesRequest = {}
): UseGlobalVariablesReturn {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  const {
    page = 0,
    pageSize = 10000,
    sortModel = [],
    filterModel = null,
  } = options;

  const queryKey = [
    QUERY_KEYS.globalVariables,
    { page, pageSize, sortModel, filterModel },
  ];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<GetGlobalVariablesResponse> => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      // `GetGlobalVariablesInput` has no `search` field — sending one fails the
      // whole request with BAD_USER_INPUT. Callers filter by name client-side.
      const { query, variables } = GraphQlQuery.getGlobalVariables({
        page,
        pageSize,
        ...(sortModel.length > 0 && { sortModel }),
        ...(filterModel && {
          filterModel: {
            items: filterModel.items.map((item) => ({
              field: item.field,
              operator: item.operator,
              value: String(item.value),
            })),
          },
        }),
      });

      logger.info('[useGlobalVariables] Fetching variables', {
        page,
        pageSize,
        sortModel,
        filterModel,
      });

      const result = await client.request<{
        getGlobalVariables: ReturnResult<GlobalVariable[]>;
      }>(query, variables);

      if (result.getGlobalVariables.status !== 'OK') {
        throw new Error(
          result.getGlobalVariables.reason || 'Failed to fetch global variables'
        );
      }

      return {
        status: result.getGlobalVariables.status,
        reason: result.getGlobalVariables.reason,
        data: result.getGlobalVariables.data || [],
        total: result.getGlobalVariables.total || 0,
      };
    },
    enabled: !!tokens?.accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if (error.message.includes('Authentication')) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return useMemo(
    () => ({
      variables: data?.data || [],
      total: data?.total || 0,
      isLoading,
      error,
      refetch,
      hasNextPage: data ? (page + 1) * pageSize < data.total : false,
      hasPreviousPage: page > 0,
    }),
    [data, isLoading, error, refetch, page, pageSize]
  );
}

/**
 * Hook for global variables statistics
 */
export function useGlobalVariablesStats() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useQuery({
    queryKey: [QUERY_KEYS.globalVariableStats],
    queryFn: async (): Promise<GetStatsResponse> => {
      if (!tokens?.accessToken) {
        throw new Error('Authentication required');
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      const { query } = GraphQlQuery.getGlobalVariablesStats();

      const result = await client.request<{
        getGlobalVariablesStats: ReturnResult<GetStatsResponse['data']>;
      }>(query);

      if (result.getGlobalVariablesStats.status !== 'OK') {
        throw new Error(
          result.getGlobalVariablesStats.reason || 'Failed to fetch statistics'
        );
      }

      return {
        status: result.getGlobalVariablesStats.status,
        reason: result.getGlobalVariablesStats.reason,
        data: result.getGlobalVariablesStats.data,
      };
    },
    enabled: !!tokens?.accessToken,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 20 * 60 * 1000, // 20 minutes
  });
}

/**
 * Hook for fetching related bots for a specific variable
 */
export function useRelatedBots(
  variableId: string | null,
  options: { page?: number; pageSize?: number } = {}
) {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);
  const { page = 0, pageSize = 30 } = options;

  return useQuery({
    queryKey: [QUERY_KEYS.relatedBots, variableId, page, pageSize],
    queryFn: async (): Promise<GetRelatedBotsResponse> => {
      if (!tokens?.accessToken || !variableId) {
        throw new Error(
          'Authentication required and variable ID must be provided'
        );
      }

      const endpoint =
        import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
      const paperContext = !isLiveTrading;
      const client = new GraphQLClient(
        endpoint,
        tokens.accessToken,
        paperContext
      );

      try {
        const { query, variables } = GraphQlQuery.getGlobalVariableRelatedBots({
          id: variableId,
          page,
          pageSize,
        });

        const pagedResult = await client.request<{
          getGlobalVariableRelatedBots: ReturnResult<
            GetRelatedBotsResponse['data']
          >;
        }>(query, variables);

        if (pagedResult.getGlobalVariableRelatedBots.status !== 'OK') {
          throw new Error(
            pagedResult.getGlobalVariableRelatedBots.reason ||
              'Failed to fetch related bots'
          );
        }

        return {
          status: pagedResult.getGlobalVariableRelatedBots.status,
          reason: pagedResult.getGlobalVariableRelatedBots.reason,
          data: pagedResult.getGlobalVariableRelatedBots.data || [],
        };
      } catch (paginationError) {
        logger.warn(
          '[useRelatedBots] Pagination input not supported, using single request',
          {
            variableId,
            error: paginationError,
          }
        );

        const { query, variables } = GraphQlQuery.getGlobalVariableRelatedBots({
          id: variableId,
        });

        const fallbackResult = await client.request<{
          getGlobalVariableRelatedBots: ReturnResult<
            GetRelatedBotsResponse['data']
          >;
        }>(query, variables);

        if (fallbackResult.getGlobalVariableRelatedBots.status !== 'OK') {
          throw new Error(
            fallbackResult.getGlobalVariableRelatedBots.reason ||
              'Failed to fetch related bots'
          );
        }

        return {
          status: fallbackResult.getGlobalVariableRelatedBots.status,
          reason: fallbackResult.getGlobalVariableRelatedBots.reason,
          data: fallbackResult.getGlobalVariableRelatedBots.data || [],
        };
      }
    },
    enabled: !!tokens?.accessToken && !!variableId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for validating variable names in real-time
 */
export function useValidateVariableName() {
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  return useCallback(
    async (name: string, excludeId?: string): Promise<boolean> => {
      if (!tokens?.accessToken || !name.trim()) {
        return true; // Allow empty names to be handled by form validation
      }

      try {
        const endpoint =
          import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
        const paperContext = !isLiveTrading;
        const client = new GraphQLClient(
          endpoint,
          tokens.accessToken,
          paperContext
        );

        const { query, variables } = GraphQlQuery.validateGlobalVariableName({
          name: name.trim(),
          ...(excludeId && { excludeId }),
        });

        const result = await client.request<{
          validateGlobalVariableName: ReturnResult<
            VariableNameValidationResponse['data']
          >;
        }>(query, variables);

        return (
          result.validateGlobalVariableName.status === 'OK' &&
          result.validateGlobalVariableName.data?.isValid === true
        );
      } catch (error) {
        logger.error('[useValidateVariableName] Validation failed', {
          name,
          error,
        });
        // Return true on error to avoid blocking the user - let the backend handle validation
        return true;
      }
    },
    [tokens?.accessToken, isLiveTrading]
  );
}

/**
 * Hook for all global variable mutations (CRUD operations)
 */
export function useGlobalVariableMutations(): UseGlobalVariableMutationsReturn {
  const queryClient = useQueryClient();
  const { tokens } = useAuthStore();
  const isLiveTrading = useUIStore((s) => s.isLiveTrading);

  // Helper function to get GraphQL client
  const getClient = useCallback(() => {
    if (!tokens?.accessToken) {
      throw new Error('Authentication required');
    }
    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const paperContext = !isLiveTrading;
    return new GraphQLClient(endpoint, tokens.accessToken, paperContext);
  }, [tokens?.accessToken, isLiveTrading]);

  // Helper function to invalidate queries
  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.globalVariables] });
    queryClient.invalidateQueries({
      queryKey: [QUERY_KEYS.globalVariableStats],
    });
  }, [queryClient]);

  // Create Variable Mutation
  const createVariable = useMutation({
    mutationFn: async (
      input: CreateGlobalVariableRequest
    ): Promise<CreateGlobalVariableResponse> => {
      const client = getClient();
      const { query, variables } = GraphQlQuery.createGlobalVariable(input);

      logger.info('[useGlobalVariableMutations] Creating variable', {
        name: input.name,
        type: input.type,
      });

      const result = await client.request<{
        createGlobalVariable: ReturnResult<GlobalVariable>;
      }>(query, variables);

      if (result.createGlobalVariable.status !== 'OK') {
        throw new Error(
          result.createGlobalVariable.reason || 'Failed to create variable'
        );
      }

      return {
        status: result.createGlobalVariable.status,
        reason: result.createGlobalVariable.reason,
        data: result.createGlobalVariable.data,
      };
    },
    onSuccess: (data) => {
      invalidateQueries();
      toast.success(
        `Global variable "${data.data?.name}" created successfully`
      );
      logger.info(
        '[useGlobalVariableMutations] Variable created successfully',
        { data }
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to create variable: ${error.message}`);
      logger.error('[useGlobalVariableMutations] Create variable failed', {
        error,
      });
    },
  });

  // Update Variable Mutation
  const updateVariable = useMutation({
    mutationFn: async (
      input: UpdateGlobalVariableRequest
    ): Promise<UpdateGlobalVariableResponse> => {
      const client = getClient();
      const { query, variables } = GraphQlQuery.updateGlobalVariable(input);

      logger.info('[useGlobalVariableMutations] Updating variable', {
        id: input.id,
        name: input.name,
      });

      const result = await client.request<{
        updateGlobalVariable: ReturnResult<null>;
      }>(query, variables);

      if (result.updateGlobalVariable.status !== 'OK') {
        throw new Error(
          result.updateGlobalVariable.reason || 'Failed to update variable'
        );
      }

      return {
        status: result.updateGlobalVariable.status,
        reason: result.updateGlobalVariable.reason,
      };
    },
    onSuccess: (data, variables) => {
      invalidateQueries();
      toast.success(
        `Global variable "${variables.name}" updated successfully. Associated bots will be restarted.`
      );
      logger.info(
        '[useGlobalVariableMutations] Variable updated successfully',
        { data, variables }
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to update variable: ${error.message}`);
      logger.error('[useGlobalVariableMutations] Update variable failed', {
        error,
      });
    },
  });

  // Delete Variable Mutation
  const deleteVariable = useMutation({
    mutationFn: async (id: string): Promise<DeleteGlobalVariableResponse> => {
      const client = getClient();
      const { query, variables } = GraphQlQuery.deleteGlobalVariable({ id });

      logger.info('[useGlobalVariableMutations] Deleting variable', { id });

      const result = await client.request<{
        deleteGlobalVariable: ReturnResult<null>;
      }>(query, variables);

      if (result.deleteGlobalVariable.status !== 'OK') {
        throw new Error(
          result.deleteGlobalVariable.reason || 'Failed to delete variable'
        );
      }

      return {
        status: result.deleteGlobalVariable.status,
        reason: result.deleteGlobalVariable.reason,
      };
    },
    onSuccess: (_, id) => {
      invalidateQueries();
      toast.success('Global variable deleted successfully');
      logger.info(
        '[useGlobalVariableMutations] Variable deleted successfully',
        { id }
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete variable: ${error.message}`);
      logger.error('[useGlobalVariableMutations] Delete variable failed', {
        error,
      });
    },
  });

  // Bulk Update Mutation
  const bulkUpdate = useMutation({
    mutationFn: async (
      input: BulkUpdateRequest
    ): Promise<BulkUpdateResponse> => {
      const client = getClient();
      const { query, variables } =
        GraphQlQuery.updateMultipleGlobalVariables(input);

      logger.info('[useGlobalVariableMutations] Bulk updating variables', {
        count: input.variables.length,
      });

      const result = await client.request<{
        updateMultipleGlobalVariables: ReturnResult<BulkUpdateResponse['data']>;
      }>(query, variables);

      if (result.updateMultipleGlobalVariables.status !== 'OK') {
        throw new Error(
          result.updateMultipleGlobalVariables.reason ||
            'Failed to update variables'
        );
      }

      return {
        status: result.updateMultipleGlobalVariables.status,
        reason: result.updateMultipleGlobalVariables.reason,
        data: result.updateMultipleGlobalVariables.data,
      };
    },
    onSuccess: (data) => {
      invalidateQueries();
      const { successful, failed } = data.data;
      if (successful.length > 0) {
        toast.success(
          `${successful.length} variables updated successfully. Associated bots will be restarted.`
        );
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} variables failed to update`);
      }
      logger.info('[useGlobalVariableMutations] Bulk update completed', {
        data,
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update variables: ${error.message}`);
      logger.error('[useGlobalVariableMutations] Bulk update failed', {
        error,
      });
    },
  });

  // Bulk Delete Mutation
  const bulkDelete = useMutation({
    mutationFn: async (
      input: BulkDeleteRequest
    ): Promise<BulkDeleteResponse> => {
      const client = getClient();
      const { query, variables } =
        GraphQlQuery.deleteMultipleGlobalVariables(input);

      logger.info('[useGlobalVariableMutations] Bulk deleting variables', {
        count: input.ids.length,
      });

      const result = await client.request<{
        deleteMultipleGlobalVariables: ReturnResult<BulkDeleteResponse['data']>;
      }>(query, variables);

      if (result.deleteMultipleGlobalVariables.status !== 'OK') {
        throw new Error(
          result.deleteMultipleGlobalVariables.reason ||
            'Failed to delete variables'
        );
      }

      return {
        status: result.deleteMultipleGlobalVariables.status,
        reason: result.deleteMultipleGlobalVariables.reason,
        data: result.deleteMultipleGlobalVariables.data,
      };
    },
    onSuccess: (data) => {
      invalidateQueries();
      const { successful, failed } = data.data;
      if (successful.length > 0) {
        toast.success(`${successful.length} variables deleted successfully`);
      }
      if (failed.length > 0) {
        toast.error(
          `${failed.length} variables failed to delete (may be in use by active bots)`
        );
      }
      logger.info('[useGlobalVariableMutations] Bulk delete completed', {
        data,
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete variables: ${error.message}`);
      logger.error('[useGlobalVariableMutations] Bulk delete failed', {
        error,
      });
    },
  });

  return useMemo(
    () => ({
      createVariable: {
        mutate: createVariable.mutate,
        mutateAsync: createVariable.mutateAsync,
        isLoading: createVariable.isPending,
        error: createVariable.error,
      },
      updateVariable: {
        mutate: updateVariable.mutate,
        mutateAsync: updateVariable.mutateAsync,
        isLoading: updateVariable.isPending,
        error: updateVariable.error,
      },
      deleteVariable: {
        mutate: deleteVariable.mutate,
        mutateAsync: deleteVariable.mutateAsync,
        isLoading: deleteVariable.isPending,
        error: deleteVariable.error,
      },
      bulkUpdate: {
        mutate: bulkUpdate.mutate,
        mutateAsync: bulkUpdate.mutateAsync,
        isLoading: bulkUpdate.isPending,
        error: bulkUpdate.error,
      },
      bulkDelete: {
        mutate: bulkDelete.mutate,
        mutateAsync: bulkDelete.mutateAsync,
        isLoading: bulkDelete.isPending,
        error: bulkDelete.error,
      },
    }),
    [createVariable, updateVariable, deleteVariable, bulkUpdate, bulkDelete]
  );
}

/**
 * Hook for form validation with real-time feedback
 */
export function useVariableFormValidation() {
  const validateName = useValidateVariableName();

  const validateValue = useCallback(
    (value: string, type: GlobalVariablesTypeEnum): string | null => {
      if (!value.trim()) {
        return 'Value is required';
      }

      switch (type) {
        case GlobalVariablesTypeEnum.int:
          if (!/^-?\d+$/.test(value.trim())) {
            return 'Value must be a valid integer (e.g., 123, -456)';
          }
          break;
        case GlobalVariablesTypeEnum.float:
          if (!/^-?\d*\.?\d+$/.test(value.trim())) {
            return 'Value must be a valid decimal number (e.g., 123.45, -67.89)';
          }
          break;
        case GlobalVariablesTypeEnum.text:
          if (value.trim().length > 1000) {
            return 'Text value cannot exceed 1000 characters';
          }
          break;
      }

      return null;
    },
    []
  );

  const validateForm = useCallback(
    async (
      data: GlobalVariableFormData,
      excludeId?: string
    ): Promise<{ isValid: boolean; errors: Record<string, string> }> => {
      const errors: Record<string, string> = {};

      // Validate name
      if (!data.name.trim()) {
        errors['name'] = 'Variable name is required';
      } else if (data.name.trim().length > 50) {
        errors['name'] = 'Variable name cannot exceed 50 characters';
      } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.name.trim())) {
        errors['name'] =
          'Variable name must start with a letter or underscore and contain only letters, numbers, and underscores';
      } else {
        const isNameValid = await validateName(data.name.trim(), excludeId);
        if (!isNameValid) {
          errors['name'] = 'Variable name already exists';
        }
      }

      // Validate value
      const valueError = validateValue(data.value, data.type);
      if (valueError) {
        errors['value'] = valueError;
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
      };
    },
    [validateName, validateValue]
  );

  return {
    validateName,
    validateValue,
    validateForm,
  };
}
