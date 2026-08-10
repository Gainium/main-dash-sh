/**
 * GlobalVariables Page Component
 *
 * A comprehensive page for managing global variables with full backend integration.
 * Features:
 * - Real-time data fetching with caching
 * - Advanced search, filtering, and sorting
 * - CRUD operations with immediate updates (Fixed: Edit mode now saves immediately)
 * - Bulk operations support
 * - Mobile-responsive design
 * - Related bots display
 * - Statistics and analytics
 * - Error handling and loading states
 * - Improved tooltip positioning for table cells
 */

import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Braces,
  Edit,
  Eye,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import { PremiumUpgrade } from '../components/license/PremiumUpgrade';
import { Widget } from '../components/ui';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { CardContent } from '../components/ui/card';
import {
  DataTable,
  type BulkAction,
} from '../components/ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import EmptyState from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useLicense } from '../lib/license';
import { logger } from '../lib/loggerInstance';
import { toast } from '../lib/toast';

// Custom components
import MobileVariableCard from '../components/global-variables/MobileVariableCard';
import RelatedBotsPopover from '../components/global-variables/RelatedBotsPopover';
import VariableForm from '../components/global-variables/VariableForm';
import VariableTypeChip from '../components/global-variables/VariableTypeChip';
// import VariableStatistics from '../components/global-variables/VariableStatistics';
import MobileConfirmDialog from '../components/global-variables/MobileConfirmDialog';

// Hooks and types
import {
  useGlobalVariableMutations,
  useGlobalVariables,
} from '../hooks/useGlobalVariables';
import { GlobalVariablesTypeEnum } from '../types';
import {
  DEFAULT_PAGE_SIZE,
  type FilterModel,
  type GlobalVariable,
  type GlobalVariableFormData,
  type SortModel,
  type VariableFormMode,
} from '../types/globalVariables';

// Page state interface
interface GlobalVariablesPageState {
  // Filtering
  sortModel: SortModel[];
  filterModel: FilterModel | null;

  // Pagination
  currentPage: number;
  pageSize: number;

  // Selection
  selectedVariables: Set<string>;

  // UI state
  showStatistics: boolean;

  // Dialog states
  formDialog: {
    isOpen: boolean;
    mode: VariableFormMode;
    variable: GlobalVariable | null;
  };

  deleteDialog: {
    isOpen: boolean;
    variable: GlobalVariable | null;
    isBulk: boolean;
  };

  relatedBotsPopover: {
    isOpen: boolean;
    variableId: string | null;
    variableName: string | null;
  };
}

import { useIsReadOnly } from '@/lib/demoMode';
import { useNavigate } from 'react-router-dom';

interface GlobalVariablesProps {
  isEmbedded?: boolean;
}

const GlobalVariables: React.FC<GlobalVariablesProps> = ({
  isEmbedded = false,
}) => {
  // Premium gate via the license adapter.
  // Read at the top with the other hooks; the conditional return is
  // at the bottom of the function so React's hook count stays stable.
  const { isPremium } = useLicense();
  const navigate = useNavigate();
  const isReadOnly = useIsReadOnly();

  // Redirect if in demo mode
  React.useEffect(() => {
    if (isReadOnly) {
      navigate('/', { replace: true });
    }
  }, [isReadOnly, navigate]);

  // Page state
  const [state, setState] = useState<GlobalVariablesPageState>({
    sortModel: [{ field: 'name', sort: 'asc' }],
    filterModel: null,
    currentPage: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    selectedVariables: new Set(),
    showStatistics: false, // Disabled until backend supports it
    formDialog: {
      isOpen: false,
      mode: 'create',
      variable: null,
    },
    deleteDialog: {
      isOpen: false,
      variable: null,
      isBulk: false,
    },
    relatedBotsPopover: {
      isOpen: false,
      variableId: null,
      variableName: null,
    },
  });

  // Batch save state (kept for bulk operations)
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, GlobalVariableFormData>
  >(new Map());
  // Pending new variables from import (keyed by temp ID)
  const [pendingNewVariables, setPendingNewVariables] = useState<
    Map<string, GlobalVariableFormData>
  >(new Map());
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data fetching
  const { variables, isLoading, error, refetch } = useGlobalVariables({
    page: 0,
    pageSize: 10000,
    sortModel: state.sortModel,
    ...(state.filterModel && { filterModel: state.filterModel }),
  });

  // Mutations
  const { createVariable, updateVariable, deleteVariable, bulkDelete } =
    useGlobalVariableMutations();

  // Update state helper
  const updateState = useCallback(
    (updates: Partial<GlobalVariablesPageState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Handle selection
  const handleSelectVariable = useCallback(
    (variableId: string, selected: boolean) => {
      setState((prev) => {
        const newSelected = new Set(prev.selectedVariables);
        if (selected) {
          newSelected.add(variableId);
        } else {
          newSelected.delete(variableId);
        }
        return { ...prev, selectedVariables: newSelected };
      });
    },
    []
  );

  // Form dialog handlers
  const openCreateDialog = useCallback(() => {
    updateState({
      formDialog: {
        isOpen: true,
        mode: 'create',
        variable: null,
      },
    });
  }, [updateState]);

  const openEditDialog = useCallback(
    (variable: GlobalVariable) => {
      updateState({
        deleteDialog: {
          isOpen: false,
          variable: null,
          isBulk: false,
        },
        formDialog: {
          isOpen: true,
          mode: 'edit',
          variable,
        },
      });
    },
    [updateState]
  );

  const openViewDialog = useCallback(
    (variable: GlobalVariable) => {
      updateState({
        formDialog: {
          isOpen: true,
          mode: 'view',
          variable,
        },
      });
    },
    [updateState]
  );

  const closeFormDialog = useCallback(() => {
    updateState({
      formDialog: {
        isOpen: false,
        mode: 'create',
        variable: null,
      },
    });
  }, [updateState]);

  // Delete dialog handlers
  const openDeleteDialog = useCallback(
    (variable: GlobalVariable) => {
      updateState({
        formDialog: {
          isOpen: false,
          mode: 'create',
          variable: null,
        },
        deleteDialog: {
          isOpen: true,
          variable,
          isBulk: false,
        },
      });
    },
    [updateState]
  );

  const closeDeleteDialog = useCallback(() => {
    updateState({
      deleteDialog: {
        isOpen: false,
        variable: null,
        isBulk: false,
      },
    });
  }, [updateState]);

  // Related bots popover handlers
  const openRelatedBotsPopover = useCallback(
    (variableId: string, variableName: string) => {
      updateState({
        relatedBotsPopover: {
          isOpen: true,
          variableId,
          variableName,
        },
      });
    },
    [updateState]
  );

  const closeRelatedBotsPopover = useCallback(() => {
    updateState({
      relatedBotsPopover: {
        isOpen: false,
        variableId: null,
        variableName: null,
      },
    });
  }, [updateState]);

  // Remove pending change helper (currently unused but kept for future use)
  // const removePendingChange = useCallback((variableId: string) => {
  //   setPendingChanges(prev => {
  //     const newMap = new Map(prev);
  //     newMap.delete(variableId);
  //     return newMap;
  //   });
  // }, []);

  const handleBatchSave = useCallback(async () => {
    if (pendingChanges.size === 0 && pendingNewVariables.size === 0) return;

    setIsBatchSaving(true);
    try {
      const changes = Array.from(pendingChanges.entries());
      const newVars = Array.from(pendingNewVariables.entries());

      // Execute updates in parallel using Promise.allSettled
      const updateResults = await Promise.allSettled(
        changes.map(([id, data]) => updateVariable.mutateAsync({ id, ...data }))
      );

      // Execute creates in parallel using Promise.allSettled
      const createResults = await Promise.allSettled(
        newVars.map(([, data]) => createVariable.mutateAsync(data))
      );

      // Collect success and failure results for updates
      const successfulUpdates: string[] = [];
      const failedUpdates: Array<{ id: string; error: string }> = [];

      updateResults.forEach((result, index) => {
        const [id] = changes[index];
        if (result.status === 'fulfilled') {
          successfulUpdates.push(id);
        } else {
          failedUpdates.push({
            id,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      // Collect success and failure results for creates
      const successfulCreates: string[] = [];
      const failedCreates: Array<{ id: string; error: string }> = [];

      createResults.forEach((result, index) => {
        const [id] = newVars[index];
        if (result.status === 'fulfilled') {
          successfulCreates.push(id);
        } else {
          failedCreates.push({
            id,
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      // Remove successfully updated variables from pending changes
      if (successfulUpdates.length > 0) {
        setPendingChanges((prev) => {
          const newMap = new Map(prev);
          successfulUpdates.forEach((id) => newMap.delete(id));
          return newMap;
        });
      }

      // Remove successfully created variables from pending new variables
      if (successfulCreates.length > 0) {
        setPendingNewVariables((prev) => {
          const newMap = new Map(prev);
          successfulCreates.forEach((id) => newMap.delete(id));
          return newMap;
        });
      }

      // Provide user feedback
      const totalSuccess = successfulUpdates.length + successfulCreates.length;
      const totalFailed = failedUpdates.length + failedCreates.length;

      if (totalSuccess > 0) {
        const parts: string[] = [];
        if (successfulUpdates.length > 0) {
          parts.push(`${successfulUpdates.length} updated`);
        }
        if (successfulCreates.length > 0) {
          parts.push(`${successfulCreates.length} created`);
        }
        toast.success(
          `${parts.join(', ')} successfully. Associated bots will be restarted.`
        );
      }
      if (totalFailed > 0) {
        const allFailed = [...failedUpdates, ...failedCreates];
        logger.error('[GlobalVariables] Some variables failed to save', {
          failed: allFailed,
        });
        toast.error(
          `${totalFailed} variable${totalFailed > 1 ? 's' : ''} failed to save. Please try again.`
        );
      }
    } catch (error) {
      logger.error('[GlobalVariables] Batch save failed', { error });
      toast.error('Failed to save variables. Please try again.');
    } finally {
      setIsBatchSaving(false);
    }
  }, [pendingChanges, pendingNewVariables, updateVariable, createVariable]);

  // Import handler
  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          let importedVars: Array<{
            name: string;
            type: string;
            value: string;
          }>;

          if (file.name.endsWith('.json')) {
            const parsed = JSON.parse(content);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            importedVars = arr.map((item: Record<string, unknown>) => ({
              name: String(item['name'] || ''),
              type: String(item['type'] || GlobalVariablesTypeEnum.text),
              value: String(item['value'] ?? ''),
            }));
          } else if (file.name.endsWith('.csv')) {
            const lines = content.split('\n').filter((l) => l.trim());
            if (lines.length < 2) {
              toast.error(
                'CSV file must have a header row and at least one data row.'
              );
              return;
            }
            // Skip header row
            importedVars = lines.slice(1).map((line) => {
              // Parse CSV respecting quoted fields
              const fields: string[] = [];
              let current = '';
              let inQuotes = false;
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                  if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                  } else {
                    inQuotes = !inQuotes;
                  }
                } else if (char === ',' && !inQuotes) {
                  fields.push(current);
                  current = '';
                } else {
                  current += char;
                }
              }
              fields.push(current);
              return {
                name: fields[0]?.trim() || '',
                type: fields[1]?.trim() || GlobalVariablesTypeEnum.text,
                value: fields[2]?.trim() || '',
              };
            });
          } else {
            toast.error(
              'Unsupported file format. Please use .json or .csv files.'
            );
            return;
          }

          // Validate and filter
          const validVars = importedVars.filter((v) => {
            if (!v.name) return false;
            const validTypes = Object.values(
              GlobalVariablesTypeEnum
            ) as string[];
            if (!validTypes.includes(v.type)) {
              v.type = GlobalVariablesTypeEnum.text;
            }
            return true;
          });

          if (validVars.length === 0) {
            toast.error('No valid variables found in the imported file.');
            return;
          }

          // Match by name: existing -> pending edit, new -> pending create
          let updatedCount = 0;
          let newCount = 0;
          const existingByName = new Map(
            variables.map((v) => [v.name.toLowerCase(), v])
          );

          const newPendingChanges = new Map(pendingChanges);
          const newPendingNew = new Map(pendingNewVariables);

          for (const imported of validVars) {
            const formData: GlobalVariableFormData = {
              name: imported.name,
              type: imported.type as GlobalVariablesTypeEnum,
              value: imported.value,
            };

            const existing = existingByName.get(imported.name.toLowerCase());
            if (existing) {
              // Existing variable -> stage as pending update
              newPendingChanges.set(existing.id, formData);
              updatedCount++;
            } else {
              // Check if already pending as new (by name)
              let foundExistingNew = false;
              for (const [tempId, pendingNew] of newPendingNew) {
                if (
                  pendingNew.name.toLowerCase() === imported.name.toLowerCase()
                ) {
                  newPendingNew.set(tempId, formData);
                  foundExistingNew = true;
                  break;
                }
              }
              if (!foundExistingNew) {
                const tempId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                newPendingNew.set(tempId, formData);
              }
              newCount++;
            }
          }

          setPendingChanges(newPendingChanges);
          setPendingNewVariables(newPendingNew);

          const parts: string[] = [];
          if (updatedCount > 0) parts.push(`${updatedCount} to update`);
          if (newCount > 0) parts.push(`${newCount} new`);
          toast.success(
            `Imported ${validVars.length} variable${validVars.length > 1 ? 's' : ''} (${parts.join(', ')}). Review and save changes.`
          );

          logger.info('[GlobalVariables] Variables imported', {
            total: validVars.length,
            updates: updatedCount,
            creates: newCount,
            fileName: file.name,
          });
        } catch (error) {
          logger.error('[GlobalVariables] Import failed', { error });
          toast.error(
            'Failed to parse import file. Please check the file format.'
          );
        }
      };

      reader.readAsText(file);
      // Reset file input so the same file can be re-imported
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [variables, pendingChanges, pendingNewVariables]
  );

  // Form submission handlers
  const handleFormSubmit = useCallback(
    async (data: GlobalVariableFormData) => {
      try {
        logger.info('[GlobalVariables] Form submission started', {
          mode: state.formDialog.mode,
          variableId: state.formDialog.variable?.id,
          data: { ...data, value: '[REDACTED]' },
        });

        if (state.formDialog.mode === 'create') {
          // Use mutateAsync for proper async/await handling
          await createVariable.mutateAsync(data);
          logger.info('[GlobalVariables] Variable created successfully');
          closeFormDialog();
        } else if (
          state.formDialog.mode === 'edit' &&
          state.formDialog.variable
        ) {
          // For edit mode, add to pending changes for bulk save
          const variableId = state.formDialog.variable.id;
          setPendingChanges((prev) => {
            const newMap = new Map(prev);
            newMap.set(variableId, data);
            return newMap;
          });
          logger.info(
            '[GlobalVariables] Variable added to pending changes for bulk save',
            { variableId }
          );
          closeFormDialog();
        }
      } catch (error) {
        logger.error('[GlobalVariables] Form submission failed', {
          error,
          mode: state.formDialog.mode,
          variableId: state.formDialog.variable?.id,
        });
        // Error handling is done in the mutation hooks
      }
    },
    [state.formDialog, createVariable, closeFormDialog]
  );

  // Delete handlers
  const handleDelete = useCallback(async () => {
    try {
      if (state.deleteDialog.isBulk) {
        await bulkDelete.mutate({
          ids: Array.from(state.selectedVariables),
        });
        updateState({ selectedVariables: new Set() });
      } else if (state.deleteDialog.variable) {
        await deleteVariable.mutate(state.deleteDialog.variable.id);
      }
      closeDeleteDialog();
    } catch (error) {
      logger.error('[GlobalVariables] Delete failed', { error });
      // Error handling is done in the mutation hooks
    }
  }, [
    state.deleteDialog,
    state.selectedVariables,
    bulkDelete,
    deleteVariable,
    closeDeleteDialog,
    updateState,
  ]);

  // Refresh data
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Handle bulk export
  const handleBulkExport = useCallback(
    (variables: GlobalVariable[], format: 'json' | 'csv') => {
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `global-variables-${timestamp}.${format}`;

      let content: string;
      let mimeType: string;

      if (format === 'json') {
        content = JSON.stringify(variables, null, 2);
        mimeType = 'application/json';
      } else {
        // CSV format
        const headers = ['Name', 'Type', 'Value', 'Associated Bots'];
        const rows = variables.map((v) => [
          v.name,
          v.type,
          v.value,
          v.botAmount.toString(),
        ]);
        content = [headers, ...rows]
          .map((row) =>
            row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')
          )
          .join('\n');
        mimeType = 'text/csv';
      }

      // Create and download file
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      logger.info('[GlobalVariables] Exported variables', {
        count: variables.length,
        format,
        filename,
      });
    },
    []
  );

  // Table columns definition
  const columns: ColumnDef<GlobalVariable>[] = useMemo(
    () => [
      // Name column
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const variable = row.original as GlobalVariable & {
            isPending?: boolean;
          };
          const isNewImport = variable.id.startsWith('import-');
          const pendingData =
            pendingChanges.get(variable.id) ||
            pendingNewVariables.get(variable.id);

          return (
            <div className="flex items-center gap-xs">
              <div className="font-mono text-sm font-medium">
                {pendingData?.name || row.getValue('name')}
              </div>
              {isNewImport && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-green-100 text-green-800 border-green-200"
                >
                  New
                </Badge>
              )}
              {variable.isPending && !isNewImport && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-orange-100 text-orange-800 border-orange-200"
                >
                  Pending
                </Badge>
              )}
            </div>
          );
        },
        enableSorting: true,
        meta: { filterType: 'string' },
      },
      // Type column
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const variable = row.original as GlobalVariable & {
            isPending?: boolean;
          };
          const pendingData =
            pendingChanges.get(variable.id) ||
            pendingNewVariables.get(variable.id);

          return (
            <VariableTypeChip
              type={pendingData?.type || row.getValue('type')}
              showTooltip={true}
              size="sm"
            />
          );
        },
        enableSorting: true,
        meta: { filterType: 'select' },
      },
      // Value column
      {
        accessorKey: 'value',
        header: 'Value',
        cell: ({ row }) => {
          const variable = row.original as GlobalVariable & {
            isPending?: boolean;
          };
          const pendingData =
            pendingChanges.get(variable.id) ||
            pendingNewVariables.get(variable.id);
          const value = pendingData?.value || (row.getValue('value') as string);
          const type = pendingData?.type || row.original.type;

          return (
            <div className="font-mono text-sm max-w-[200px]">
              {type === GlobalVariablesTypeEnum.text && value.length > 50 ? (
                <span title={value}>{value.substring(0, 50)}...</span>
              ) : (
                <span title={value}>{value}</span>
              )}
            </div>
          );
        },
        enableSorting: false,
        meta: { filterType: 'string' },
      },
      // Associated Bots column
      {
        accessorKey: 'botAmount',
        header: 'Associated Bots',
        cell: ({ row }) => {
          const botAmount = row.getValue('botAmount') as number;
          const variable = row.original;

          return (
            <div className="flex items-center gap-xs">
              <Badge variant="secondary" className="font-medium">
                {botAmount} bot{botAmount !== 1 ? 's' : ''}
              </Badge>
              {botAmount > 0 && (
                <RelatedBotsPopover
                  variableId={variable.id}
                  variableName={variable.name}
                  isOpen={
                    state.relatedBotsPopover.isOpen &&
                    state.relatedBotsPopover.variableId === variable.id
                  }
                  onOpenChange={(open) => {
                    if (open) {
                      openRelatedBotsPopover(variable.id, variable.name);
                    } else {
                      closeRelatedBotsPopover();
                    }
                  }}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="p-0"
                    onClick={() =>
                      openRelatedBotsPopover(variable.id, variable.name)
                    }
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                </RelatedBotsPopover>
              )}
            </div>
          );
        },
        enableSorting: true,
        meta: { filterType: 'number' },
      },
      // Actions column
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const variable = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openViewDialog(variable)}>
                  <Eye className="h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openEditDialog(variable)}>
                  <Edit className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => openDeleteDialog(variable)}
                  className="text-red-600"
                  disabled={variable.botAmount > 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        enableSorting: false,
        enableHiding: false,
        size: 60,
      },
    ],
    [
      state.relatedBotsPopover,
      openRelatedBotsPopover,
      closeRelatedBotsPopover,
      openViewDialog,
      openEditDialog,
      openDeleteDialog,
      pendingChanges,
      pendingNewVariables,
    ]
  );

  // Bulk actions
  const selectedCount = state.selectedVariables.size;

  const bulkActions: BulkAction<GlobalVariable>[] = useMemo(
    () => [
      {
        id: 'export-json',
        label: 'Export selected as JSON',
        onAction: (selectedRows) => handleBulkExport(selectedRows, 'json'),
      },
      {
        id: 'export-csv',
        label: 'Export selected as CSV',
        onAction: (selectedRows) => handleBulkExport(selectedRows, 'csv'),
      },
      {
        id: 'delete-selected',
        label: 'Delete selected',
        icon: Trash2,
        destructive: true,
        onAction: (selectedRows) => {
          updateState({
            selectedVariables: new Set(selectedRows.map((row) => row.id)),
            deleteDialog: {
              isOpen: true,
              variable: null,
              isBulk: true,
            },
          });
        },
      },
    ],
    [handleBulkExport, updateState]
  );

  const primaryToolbarActions = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleRefresh}
        disabled={isLoading}
        className="h-9 gap-2 px-3"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        <span>Refresh</span>
      </Button>
    ),
    [handleRefresh, isLoading]
  );
  const primaryToolbarActionsCompact = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleRefresh}
        disabled={isLoading}
        className="h-9 w-9"
        title="Refresh"
        aria-label="Refresh"
      >
        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
      </Button>
    ),
    [handleRefresh, isLoading]
  );

  const totalPendingCount = pendingChanges.size + pendingNewVariables.size;

  const pendingChangesToolbarActions = useMemo(() => {
    if (totalPendingCount === 0) {
      return null;
    }

    return (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleBatchSave}
          disabled={isBatchSaving}
          className="h-9 gap-2 px-3"
        >
          <RefreshCw
            className={`h-4 w-4 ${isBatchSaving ? 'animate-spin' : ''}`}
          />
          <span>Save Changes ({totalPendingCount})</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPendingChanges(new Map());
            setPendingNewVariables(new Map());
            toast.success('Pending changes cleared');
          }}
          disabled={isBatchSaving}
          className="h-9 gap-2 px-3"
        >
          <X className="h-4 w-4" />
          <span>Cancel</span>
        </Button>
      </div>
    );
  }, [handleBatchSave, isBatchSaving, totalPendingCount]);
  const pendingChangesToolbarActionsCompact = useMemo(() => {
    if (totalPendingCount === 0) {
      return null;
    }
    return (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={handleBatchSave}
          disabled={isBatchSaving}
          className="h-9 gap-2 px-3"
          title={`Save ${totalPendingCount} pending changes`}
        >
          <RefreshCw
            className={`h-4 w-4 ${isBatchSaving ? 'animate-spin' : ''}`}
          />
          <span>Save ({totalPendingCount})</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            setPendingChanges(new Map());
            setPendingNewVariables(new Map());
            toast.success('Pending changes cleared');
          }}
          disabled={isBatchSaving}
          className="h-9 w-9"
          title="Cancel pending changes"
          aria-label="Cancel pending changes"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }, [handleBatchSave, isBatchSaving, totalPendingCount]);

  const addVariableToolbarAction = useMemo(
    () => (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 gap-2 px-3"
        >
          <Upload className="h-4 w-4" />
          <span>Import</span>
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={openCreateDialog}
          className="h-9 gap-2 px-3"
        >
          <Plus className="h-4 w-4" />
          <span>Add Variable</span>
        </Button>
      </div>
    ),
    [openCreateDialog]
  );
  // Compact form: drop label text on the secondary "Import" action and keep
  // the primary "Add Variable" CTA fully labeled so the primary action is
  // always discoverable.
  const addVariableToolbarActionCompact = useMemo(
    () => (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 w-9"
          title="Import variables"
          aria-label="Import variables"
        >
          <Upload className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="default"
          size="icon"
          onClick={openCreateDialog}
          className="h-9 w-9"
          title="Add variable"
          aria-label="Add variable"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    ),
    [openCreateDialog]
  );

  // Note: Removed global loading screen to show skeleton widgets instead

  // Keep current values in refs so VariableCardWrapper can read the latest values
  // without recreating the component type (which causes all cards to remount).
  const pendingChangesRef = useRef(pendingChanges);
  pendingChangesRef.current = pendingChanges;
  const selectedVariablesRef = useRef(state.selectedVariables);
  selectedVariablesRef.current = state.selectedVariables;
  const relatedBotsPopoverRef = useRef(state.relatedBotsPopover);
  relatedBotsPopoverRef.current = state.relatedBotsPopover;
  const handleSelectVariableRef = useRef(handleSelectVariable);
  handleSelectVariableRef.current = handleSelectVariable;
  const openViewDialogRef = useRef(openViewDialog);
  openViewDialogRef.current = openViewDialog;
  const openEditDialogRef = useRef(openEditDialog);
  openEditDialogRef.current = openEditDialog;
  const openDeleteDialogRef = useRef(openDeleteDialog);
  openDeleteDialogRef.current = openDeleteDialog;
  const openRelatedBotsPopoverRef = useRef(openRelatedBotsPopover);
  openRelatedBotsPopoverRef.current = openRelatedBotsPopover;
  const closeRelatedBotsPopoverRef = useRef(closeRelatedBotsPopover);
  closeRelatedBotsPopoverRef.current = closeRelatedBotsPopover;

  // Stable card component — useMemo([]) so reference never changes and cards never remount
  const VariableCardWrapper = useMemo(
    () =>
      ({
        item: variable,
        index,
      }: {
        item: GlobalVariable & { isPending?: boolean };
        index: number;
      }) => (
        <MobileVariableCard
          variable={{
            ...variable,
            isPending: pendingChangesRef.current.has(variable.id),
          }}
          isSelected={selectedVariablesRef.current.has(variable.id)}
          onSelect={(selected) =>
            handleSelectVariableRef.current(variable.id, selected)
          }
          onView={() => openViewDialogRef.current(variable)}
          onEdit={() => openEditDialogRef.current(variable)}
          onDelete={() => openDeleteDialogRef.current(variable)}
          onViewRelatedBots={() =>
            openRelatedBotsPopoverRef.current(variable.id, variable.name)
          }
          relatedBotsPopoverOpen={
            relatedBotsPopoverRef.current.isOpen &&
            relatedBotsPopoverRef.current.variableId === variable.id
          }
          onRelatedBotsPopoverChange={closeRelatedBotsPopoverRef.current}
          index={index || 0}
        />
      ),
    [] // Never recreate — refs keep values current without changing component identity
  );

  // Show error state
  if (error) {
    return (
      <MainLayout pageTitle="Global Variables" activePage="global-variables">
        <div className="min-h-full p-sm space-y-md">
          <div className="flex flex-col items-center justify-center space-y-lg">
            <div className="p-md rounded-full bg-red-50 dark:bg-red-950">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <div className="text-center space-y-xs">
              <h2 className="text-lg font-semibold">
                Failed to load global variables
              </h2>
              <p className="text-sm text-muted-foreground max-w-md">
                We encountered an error while loading your global variables.
                This could be due to a network issue or temporary server
                problem.
              </p>
            </div>
            <div className="flex gap-xs">
              <Button onClick={handleRefresh} variant="default">
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  const mainContent = (
    <WidgetContainer layout="flex" verticalGap>
      {/* Main Content */}
      <Widget>
        <CardContent className="p-0">
          {/* Responsive Variable List */}
          {isLoading && variables.length === 0 ? (
            <div className="p-lg space-y-md" aria-busy="true">
              <div className="flex items-center justify-between">
                <div className="space-y-xs">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex gap-xs">
                  <Skeleton className="h-10 w-20" />
                  <Skeleton className="h-10 w-24" />
                </div>
              </div>
              <div className="space-y-sm">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`skeleton-row-${index}`}
                    className="flex items-center gap-md p-md rounded-lg bg-muted/40"
                  >
                    <Skeleton className="h-4 w-4" />
                    <div className="flex-1 space-y-xs">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <DataTable
              tableId="global-variables"
              columns={columns}
              data={[
                ...variables.map((variable) => ({
                  ...variable,
                  isPending: pendingChanges.has(variable.id),
                })),
                // Include pending new variables (from import) as temporary rows
                ...Array.from(pendingNewVariables.entries()).map(
                  ([tempId, data]) => ({
                    id: tempId,
                    name: data.name,
                    type: data.type,
                    value: data.value,
                    botAmount: 0,
                    isPending: true,
                  })
                ),
              ]}
              enableGlobalFilter={true}
              enableColumnFilters={false}
              enableSorting={true}
              enableColumnVisibility={true}
              enableCardView={true}
              showPagination={true}
              defaultPinnedColumns={{ left: [], right: ['actions'] }}
              emptyMessage="No global variables found"
              emptyContent={
                <EmptyState
                  size="page"
                  icon={<Braces className="w-6 h-6" />}
                  title="No global variables yet"
                  description="Global variables let multiple bots share state — like a shared budget or signal flag. Add one to reference it from any bot."
                  action={{
                    label: 'Add variable',
                    onClick: openCreateDialog,
                    icon: <Plus className="w-5 h-5" />,
                  }}
                />
              }
              className="border-0"
              firstToolbarActions={primaryToolbarActions}
              firstToolbarActionsCompact={primaryToolbarActionsCompact}
              customToolbarActions={pendingChangesToolbarActions}
              customToolbarActionsCompact={pendingChangesToolbarActionsCompact}
              finalToolbarActions={addVariableToolbarAction}
              finalToolbarActionsCompact={addVariableToolbarActionCompact}
              finalToolbarActionsOverflow={{
                menuLabel: 'Add Variable',
                menuIcon: Plus,
                onMenuClick: openCreateDialog,
              }}
              bulkActions={bulkActions}
              getRowId={(row) => row.id}
              cardViewBreakpoints={{
                default: 1,
                640: 2,
                1024: 3,
                1280: 4,
              }}
              cardViewGap={16}
              onRowClick={() => {}}
              cardComponent={VariableCardWrapper}
            />
          )}
        </CardContent>
      </Widget>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        className="hidden"
        onChange={handleImport}
      />

      {/* Form Dialog */}
      <VariableForm
        isOpen={state.formDialog.isOpen}
        onClose={closeFormDialog}
        onSubmit={handleFormSubmit}
        mode={state.formDialog.mode}
        initialData={state.formDialog.variable}
        isLoading={createVariable.isLoading || updateVariable.isLoading}
      />

      {/* Delete Confirmation Dialog */}
      <MobileConfirmDialog
        isOpen={state.deleteDialog.isOpen}
        onClose={closeDeleteDialog}
        onConfirm={handleDelete}
        title={
          state.deleteDialog.isBulk
            ? 'Delete Selected Variables'
            : 'Delete Global Variable'
        }
        description={
          state.deleteDialog.isBulk
            ? 'This action cannot be undone. All selected variables will be permanently removed.'
            : 'This action cannot be undone. The variable will be permanently removed.'
        }
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        additionalInfo={{
          ...(state.deleteDialog.variable?.name && {
            variableName: state.deleteDialog.variable.name,
          }),
          ...(state.deleteDialog.isBulk &&
            selectedCount > 0 && { selectedCount }),
          ...(state.deleteDialog.variable?.botAmount &&
            state.deleteDialog.variable.botAmount > 0 && {
              warningMessage: `This variable is used by ${state.deleteDialog.variable.botAmount} bot${state.deleteDialog.variable.botAmount > 1 ? 's' : ''}. Deletion is not allowed.`,
            }),
        }}
      />
    </WidgetContainer>
  );

  if (!isPremium) {
    const upgradeContent = (
      <PremiumUpgrade
        feature="Global variables"
        description="Reusable variables for bot settings require a premium license."
      />
    );
    if (isEmbedded) {
      return <>{upgradeContent}</>;
    }
    return (
      <MainLayout pageTitle="Global Variables" activePage="global-variables">
        {upgradeContent}
      </MainLayout>
    );
  }

  if (isEmbedded) {
    return <>{mainContent}</>;
  }

  return (
    <MainLayout pageTitle="Global Variables" activePage="global-variables">
      {mainContent}
    </MainLayout>
  );
};

export default GlobalVariables;
