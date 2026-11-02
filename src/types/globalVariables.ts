/**
 * Enhanced TypeScript types for Global Variables functionality
 *
 * This module provides comprehensive type definitions for global variables,
 * including form validation, API responses, and UI state management.
 */

import { GlobalVariablesTypeEnum } from './index';

// Core Global Variable Types
export interface GlobalVariable {
  id: string;
  name: string;
  type: GlobalVariablesTypeEnum;
  value: string;
  botAmount: number;
  createdAt?: string;
  updatedAt?: string;
}

// Extended Global Variable with additional metadata
export interface GlobalVariableExtended extends GlobalVariable {
  relatedBots?: RelatedBot[];
  usageHistory?: VariableUsageHistory[];
  lastModifiedBy?: string;
  isSystemVariable?: boolean;
}

// Related Bot Information
export interface RelatedBot {
  _id: string;
  name: string;
  type: BotType;
  status: BotStatus;
  exchange?: string;
  paperContext: boolean;
}

export type BotType = 'dca' | 'grid' | 'combo' | 'hedge' | 'signal';
export type BotStatus = 'active' | 'paused' | 'stopped' | 'error';

// Bot Groups for Related Bots Display
export interface BotGroup {
  type: BotType;
  total: number;
  bots: RelatedBot[];
  hasMore?: boolean;
}

// Variable Usage History
export interface VariableUsageHistory {
  timestamp: string;
  action: 'created' | 'updated' | 'deleted' | 'used';
  botId?: string;
  botName?: string;
  oldValue?: string;
  newValue?: string;
  userId?: string;
}

// Form Types
export interface GlobalVariableFormData {
  name: string;
  type: GlobalVariablesTypeEnum;
  value: string;
}

export interface GlobalVariableFormErrors {
  name?: string;
  type?: string;
  value?: string;
  general?: string;
}

// API Request/Response Types
export interface GetGlobalVariablesRequest {
  page?: number;
  pageSize?: number;
  sortModel?: SortModel[];
  filterModel?: FilterModel;
}

export interface SortModel {
  field: string;
  sort: 'asc' | 'desc';
}

export interface FilterModel {
  items: FilterItem[];
  logicOperator?: 'and' | 'or';
}

export interface FilterItem {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean;
}

export type FilterOperator =
  | 'equals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual';

export interface GetGlobalVariablesResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: GlobalVariable[];
  total: number;
}

export interface CreateGlobalVariableRequest {
  name: string;
  type: GlobalVariablesTypeEnum;
  value: string;
}

export interface CreateGlobalVariableResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: GlobalVariable | null;
}

export interface UpdateGlobalVariableRequest {
  id: string;
  name: string;
  type: GlobalVariablesTypeEnum;
  value: string;
}

export interface UpdateGlobalVariableResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data?: GlobalVariable;
}

export interface DeleteGlobalVariableRequest {
  id: string;
}

export interface DeleteGlobalVariableResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
}

export interface GetRelatedBotsRequest {
  id: string;
}

export interface GetRelatedBotsResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: BotGroup[];
}

// Bulk Operations
export interface BulkUpdateRequest {
  variables: Array<{
    id: string;
    name: string;
    type: GlobalVariablesTypeEnum;
    value: string;
  }>;
}

export interface BulkUpdateResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: {
    successful: string[];
    failed: Array<{
      id: string;
      reason: string;
    }>;
  };
}

export interface BulkDeleteRequest {
  ids: string[];
}

export interface BulkDeleteResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: {
    successful: string[];
    failed: Array<{
      id: string;
      reason: string;
    }>;
  };
}

// Validation Types
export interface VariableNameValidationRequest {
  name: string;
  excludeId?: string;
}

export interface VariableNameValidationResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: {
    isValid: boolean;
    suggestion?: string;
  };
}

// Statistics Types
export interface GlobalVariablesStats {
  totalVariables: number;
  totalBotReferences: number;
  variablesByType: Array<{
    type: GlobalVariablesTypeEnum;
    count: number;
  }>;
  mostUsedVariables: Array<{
    id: string;
    name: string;
    botAmount: number;
  }>;
  unusedVariables: Array<{
    id: string;
    name: string;
  }>;
}

export interface GetStatsResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: GlobalVariablesStats;
}

// UI State Types
export interface GlobalVariablesUIState {
  selectedVariables: string[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  currentPage: number;
  pageSize: number;
  sortModel: SortModel[];
  filterModel: FilterModel | null;
  showDeleteConfirmation: boolean;
  showBulkActions: boolean;
  editingVariable: GlobalVariable | null;
  relatedBotsPopover: {
    isOpen: boolean;
    variableId: string | null;
    anchorEl: HTMLElement | null;
  };
}

// Table Column Types
export interface VariableTableColumn {
  id: keyof GlobalVariable | 'actions';
  label: string;
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  filterable?: boolean;
  format?: (value: unknown) => string;
}

// Export/Import Types
export interface ExportVariablesRequest {
  variableIds?: string[];
  format: 'json' | 'csv' | 'xlsx';
  includeMetadata?: boolean;
}

export interface ImportVariablesRequest {
  data: string | ArrayBuffer;
  format: 'json' | 'csv' | 'xlsx';
  overwriteExisting?: boolean;
}

export interface ImportVariablesResponse {
  status: 'OK' | 'NOTOK';
  reason: string | null;
  data: {
    imported: number;
    skipped: number;
    errors: Array<{
      row: number;
      reason: string;
    }>;
  };
}

// Utility Types
export type VariableTypeColor = {
  [K in GlobalVariablesTypeEnum]: {
    background: string;
    text: string;
    border: string;
  };
};

export type VariableFormMode = 'create' | 'edit' | 'view';

export type VariableAction =
  | 'create'
  | 'edit'
  | 'delete'
  | 'bulk-delete'
  | 'export'
  | 'import'
  | 'view-related-bots';

// Hook Return Types
export interface UseGlobalVariablesReturn {
  variables: GlobalVariable[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface UseGlobalVariableMutationsReturn {
  createVariable: {
    mutate: (data: CreateGlobalVariableRequest) => void;
    mutateAsync: (
      data: CreateGlobalVariableRequest
    ) => Promise<CreateGlobalVariableResponse>;
    isLoading: boolean;
    error: Error | null;
  };
  updateVariable: {
    mutate: (data: UpdateGlobalVariableRequest) => void;
    mutateAsync: (
      data: UpdateGlobalVariableRequest
    ) => Promise<UpdateGlobalVariableResponse>;
    isLoading: boolean;
    error: Error | null;
  };
  deleteVariable: {
    mutate: (id: string) => void;
    mutateAsync: (id: string) => Promise<DeleteGlobalVariableResponse>;
    isLoading: boolean;
    error: Error | null;
  };
  bulkUpdate: {
    mutate: (data: BulkUpdateRequest) => void;
    mutateAsync: (data: BulkUpdateRequest) => Promise<BulkUpdateResponse>;
    isLoading: boolean;
    error: Error | null;
  };
  bulkDelete: {
    mutate: (data: BulkDeleteRequest) => void;
    mutateAsync: (data: BulkDeleteRequest) => Promise<BulkDeleteResponse>;
    isLoading: boolean;
    error: Error | null;
  };
}

// Constants
export const VARIABLE_TYPE_COLORS: VariableTypeColor = {
  [GlobalVariablesTypeEnum.float]: {
    background: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  [GlobalVariablesTypeEnum.int]: {
    background: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
  [GlobalVariablesTypeEnum.text]: {
    background: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
  },
};

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const VARIABLE_NAME_MAX_LENGTH = 50;
export const VARIABLE_VALUE_MAX_LENGTH = 1000;
