import { type ColumnDef } from '@tanstack/react-table';
import {
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import { ExchangeDialog } from '../components/exchanges';
import DeleteExchangeDialog from '../components/exchanges/DeleteExchangeDialog';
import EmptyStateExchanges from '../components/exchanges/EmptyStateExchanges';
import ExchangeErrorBoundary from '../components/exchanges/ExchangeErrorBoundary';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import { Button } from '../components/ui/button';
import { DataTable } from '../components/ui/data-table/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { RotationChip } from '../components/ui/chip/RotationChip';
import ExchangeCard from '../components/widgets/ExchangeCard';
import { useExchangeActions } from '../hooks/useExchangeActions';
import { type UIExchange } from '../hooks/useTransformedExchanges';
import { logger } from '../lib/loggerInstance';
import { useExchangesStore } from '../stores/exchangesStore';
import type { ExchangeEnum, ExchangeInUser } from '../types/exchange.types';
import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';

// Look up the full `ExchangeInUser` from the store by uuid. The table
// rows only carry the trimmed `UIExchange` shape — synthesizing a
// partial here drops `hedge` / `zeroFee` / credentials, which is why
// the edit dialog rendered toggles as `false` even when the server had
// them on.
const resolveExchangeData = (exchange: UIExchange): ExchangeInUser => {
  const full = useExchangesStore.getState().getExchange(exchange.id);
  if (full) return full;
  return {
    uuid: exchange.id,
    name: exchange.name,
    provider: exchange.provider as ExchangeEnum,
    key: '',
    secret: '',
    status: true,
    balance: exchange.balance || 0,
  };
};

const Exchanges: React.FC = () => {
  const {
    updateExchangeBalance,
    isUpdatingBalance,
    deleteConfirmation,
    confirmDeleteExchange,
    cancelDeleteExchange,
    isDeletingExchange,
    handleDeleteExchange,
  } = useExchangeActions();

  const [addExchangeDialog, setAddExchangeDialog] = useState(false);
  const [editExchangeDialog, setEditExchangeDialog] = useState<{
    isOpen: boolean;
    exchangeData: ExchangeInUser | null;
  }>({ isOpen: false, exchangeData: null });

  // Exchange dialog handlers
  const handleAddExchangeSuccess = (exchange: ExchangeInUser) => {
    logger.info('Exchange added successfully:', exchange);
    setAddExchangeDialog(false);
  };

  const handleEditExchangeSuccess = (exchange: ExchangeInUser) => {
    logger.info('Exchange updated successfully:', exchange);
    setEditExchangeDialog({ isOpen: false, exchangeData: null });
  };

  const handleEditExchange = (exchangeData: ExchangeInUser) => {
    setEditExchangeDialog({ isOpen: true, exchangeData });
  };

  return (
    <MainLayout pageTitle="Exchanges" activePage="/exchanges">
      <WidgetContainer layout="flex">
        <ExchangeCardsGrid
          onEdit={handleEditExchange}
          onDelete={handleDeleteExchange}
          onRefresh={updateExchangeBalance}
          isRefreshing={isUpdatingBalance}
          onAddExchange={() => setAddExchangeDialog(true)}
        />
      </WidgetContainer>

      {/* Exchange Dialogs */}
      <ExchangeErrorBoundary
        fallbackTitle="Exchange Management Error"
        fallbackMessage="There was an error with the exchange management system."
      >
        <ExchangeDialog
          open={addExchangeDialog}
          onClose={() => setAddExchangeDialog(false)}
          mode="add"
          onSuccess={handleAddExchangeSuccess}
        />

        <ExchangeDialog
          open={editExchangeDialog.isOpen}
          onClose={() =>
            setEditExchangeDialog({ isOpen: false, exchangeData: null })
          }
          mode="edit"
          exchangeData={editExchangeDialog.exchangeData ?? undefined}
          onSuccess={handleEditExchangeSuccess}
        />
      </ExchangeErrorBoundary>

      {/* Delete Exchange Confirmation Dialog */}
      <DeleteExchangeDialog
        open={deleteConfirmation.isOpen}
        exchange={deleteConfirmation.exchange}
        onConfirm={confirmDeleteExchange}
        onCancel={cancelDeleteExchange}
        isDeleting={isDeletingExchange}
      />
    </MainLayout>
  );
};

export default Exchanges;

const ExchangeCardsGrid: React.FC<{
  onEdit: (exchangeData: ExchangeInUser) => void;
  onDelete: (exchangeData: ExchangeInUser) => void;
  onRefresh: (exchangeData: ExchangeInUser) => Promise<unknown>;
  isRefreshing: boolean;
  onAddExchange: () => void;
}> = ({ onEdit, onDelete, onRefresh, isRefreshing, onAddExchange }) => {
  const { exchanges, isLoading } = useTransformedExchangesFromContext();

  // Filter out the ALL exchanges entry
  const filteredExchanges = React.useMemo(
    () => exchanges.filter((ex) => ex.id !== 'ALL'),
    [exchanges]
  );

  const columns = React.useMemo<ColumnDef<UIExchange>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Exchange',
        cell: ({ getValue, row }) => {
          const name = String(getValue());
          if (name === 'ALL') {
            return (
              <div className="flex items-center gap-xs">
                <Zap className="w-4 h-4 text-yellow-500" />
                All Exchanges
              </div>
            );
          }
          const exchange = row.original;
          return (
            <div className="flex items-center gap-xs min-w-0">
              <span className="truncate">{name}</span>
              <RotationChip
                rotationRequired={exchange.rotationRequired}
                provider={exchange.provider}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(resolveExchangeData(exchange));
                }}
              />
            </div>
          );
        },
      },
      {
        accessorKey: 'balance',
        header: 'Balance',
        cell: ({ getValue }) => {
          const val = getValue() as number | undefined;
          return val != null ? `$${val.toLocaleString()}` : '—';
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const exchange = row.original;
          const exchangeData = resolveExchangeData(exchange);

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onRefresh(exchangeData)}
                  disabled={isRefreshing}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  />
                  Refresh
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(exchangeData)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onDelete(exchangeData)}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [onEdit, onDelete, onRefresh, isRefreshing]
  );

  // Keep current values in refs so ExchangeCardWrapper can read the latest values
  // without recreating the component type (which causes all cards to remount).
  const onEditRef = React.useRef(onEdit);
  onEditRef.current = onEdit;
  const onDeleteRef = React.useRef(onDelete);
  onDeleteRef.current = onDelete;
  const onRefreshRef = React.useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const isRefreshingRef = React.useRef(isRefreshing);
  isRefreshingRef.current = isRefreshing;

  // Stable reference via useMemo([]) — never recreated so cards never remount
  const ExchangeCardWrapper = React.useMemo(
    () =>
      ({ item }: { item: UIExchange; index: number }) => (
        <div className="min-h-[400px]">
          <ExchangeCard
            exchangeId={item.id}
            height={400}
            onEdit={onEditRef.current}
            onDelete={onDeleteRef.current}
            onRefresh={onRefreshRef.current}
            isRefreshing={isRefreshingRef.current}
          />
        </div>
      ),

    [] // Never recreate — refs keep values current without changing component identity
  );

  // Custom add exchange button for the toolbar
  const addExchangeButton = (
    <Button
      onClick={onAddExchange}
      variant="default"
      size="sm"
      className="h-9 gap-2 px-3"
    >
      <Plus className="h-4 w-4" />
      <span>Add Exchange</span>
    </Button>
  );
  const addExchangeButtonCompact = (
    <Button
      onClick={onAddExchange}
      variant="default"
      size="icon"
      className="h-9 w-9"
      title="Add Exchange"
      aria-label="Add exchange"
    >
      <Plus className="h-4 w-4" />
    </Button>
  );
  // Show empty state when there are no user exchanges (excluding ALL) and the hook has finished loading
  if (!isLoading && filteredExchanges.length === 0) {
    return <EmptyStateExchanges onAddExchange={onAddExchange} />;
  }

  return (
    <DataTable
        tableId="exchanges-list"
        columns={columns}
        data={filteredExchanges}
        enableCardView={true}
        defaultView="cards"
        cardComponent={ExchangeCardWrapper}
        enableGlobalFilter={false}
        enableColumnFilters={false}
        enableSorting={false}
        showPagination={false}
        initialPageSize={9999}
        cardViewBreakpoints={{ default: 1, 1024: 2 }}
        firstToolbarActions={addExchangeButton}
        firstToolbarActionsCompact={addExchangeButtonCompact}
        defaultPinnedColumns={{ left: [], right: ['actions'] }}
      />
  );
};
