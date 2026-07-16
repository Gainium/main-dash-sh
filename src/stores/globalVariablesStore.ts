import type { GlobalVariable } from '@/types/globalVariables';
import { useAuthStore } from './authStore';
import { useUIStore } from './uiStore';
import {
  GraphQLClient,
  GraphQlQuery,
  DEFAULT_READ_TIMEOUT_MS,
  type ReturnResult,
} from '@/lib/api';

class GlobalVariablesStore {
  private globalVariables: Map<string, GlobalVariable>;
  constructor() {
    this.globalVariables = new Map();
  }

  private async getVariablesByIdsFromBackend(
    variableIds: string[] | string | null
  ): Promise<GlobalVariable[] | undefined> {
    if (!variableIds || [variableIds].flat().length === 0) {
      return;
    }
    const { tokens } = useAuthStore.getState();
    if (!tokens?.accessToken) {
      throw new Error('Authentication required');
    }
    const { isLiveTrading } = useUIStore.getState();
    const endpoint =
      import.meta.env['VITE_API_ENDPOINT'] || 'http://localhost:4000';
    const paperContext = !isLiveTrading;
    const client = new GraphQLClient(
      endpoint,
      tokens.accessToken,
      paperContext
    );
    const { query, variables } = GraphQlQuery.getGlobalVariablesByIds({
      ids: [variableIds].flat(),
    });

    const response = await client.request<{
      getGlobalVariablesByIds: ReturnResult<GlobalVariable[]>;
    }>(query, variables, { timeoutMs: DEFAULT_READ_TIMEOUT_MS });

    if (response.getGlobalVariablesByIds.status !== 'OK') {
      throw new Error(
        response.getGlobalVariablesByIds.reason ||
          'Failed to fetch global variable'
      );
    }
    response.getGlobalVariablesByIds.data?.forEach((variable) => {
      this.globalVariables.set(variable.id, variable);
    });

    return response.getGlobalVariablesByIds.data;
  }

  async getVariablesByIds(
    id: string | string[] | null
  ): Promise<GlobalVariable[] | undefined> {
    if (!id || [id].flat().length === 0) {
      return undefined;
    }
    const ids = [id].flat();
    const result: GlobalVariable[] = [];
    for (const variableId of ids) {
      const variable =
        this.globalVariables.get(variableId) ||
        (await this.getVariablesByIdsFromBackend(variableId));
      if (variable) {
        result.push(...[variable].flat());
      }
    }
    return result;
  }

  getAllVariables(): GlobalVariable[] {
    return Array.from(this.globalVariables.values());
  }
}

export const globalVariablesStore = new GlobalVariablesStore();
