import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { useEffect, useState } from 'react';
import type { ExchangeInUser } from '../types/exchange.types';
import { useExchangeMutations } from './useExchangeMutations';

/**
 * Hook for handling exchange actions like delete, hedge mode, zero fee, etc.
 * Provides confirmation dialogs and loading states for better UX
 */
export function useExchangeActions() {
  const {
    deleteExchange,
    setHedgeMode,
    setZeroFee,
    updateBalance,
    isDeletingExchange,
    isUpdatingBalance,
  } = useExchangeMutations();

  // State for confirmation dialogs
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    exchange: ExchangeInUser | null;
  }>({ isOpen: false, exchange: null });

  // Log when deleteConfirmation state changes
  useEffect(() => {
    logger.info(
      '[delete-exchange] deleteConfirmation state changed:',
      deleteConfirmation
    );
  }, [deleteConfirmation]);

  // Delete exchange with confirmation
  const handleDeleteExchange = (exchange: ExchangeInUser) => {
    logger.info(
      '[delete-exchange] handleDeleteExchange called with exchange:',
      exchange
    );
    setDeleteConfirmation({ isOpen: true, exchange });
    logger.info('[delete-exchange] setDeleteConfirmation called with:', {
      isOpen: true,
      exchange,
    });
    logger.info('[delete-exchange] Delete confirmation dialog opened');
  };

  const confirmDeleteExchange = async () => {
    logger.info('[delete-exchange] confirmDeleteExchange called');

    if (!deleteConfirmation.exchange) {
      logger.warn(
        '[delete-exchange] No exchange in deleteConfirmation, returning'
      );
      return;
    }

    logger.info(
      '[delete-exchange] Deleting exchange:',
      deleteConfirmation.exchange
    );

    try {
      logger.info(
        '[delete-exchange] Calling deleteExchange.mutateAsync with uuid:',
        deleteConfirmation.exchange.uuid
      );
      await deleteExchange.mutateAsync({
        uuid: deleteConfirmation.exchange.uuid,
      });
      setDeleteConfirmation({ isOpen: false, exchange: null });
      logger.info('[delete-exchange] Exchange deleted successfully');
    } catch (error) {
      logger.error('[delete-exchange] Failed to delete exchange:', error);
      // Error is handled by the mutation hook
    }
  };

  const cancelDeleteExchange = () => {
    logger.info('[delete-exchange] cancelDeleteExchange called');
    setDeleteConfirmation({ isOpen: false, exchange: null });
  };

  // Toggle hedge mode
  const toggleHedgeMode = async (exchange: ExchangeInUser) => {
    try {
      await setHedgeMode.mutateAsync({
        uuid: exchange.uuid,
        hedge: !exchange.hedge,
      });
      logger.info(
        `Hedge mode ${!exchange.hedge ? 'enabled' : 'disabled'} for ${exchange.name}`
      );
    } catch (error) {
      logger.error('Failed to toggle hedge mode:', error);
    }
  };

  // Toggle zero fee
  const toggleZeroFee = async (exchange: ExchangeInUser) => {
    try {
      await setZeroFee.mutateAsync({
        uuid: exchange.uuid,
        value: !exchange.zeroFee,
      });
      logger.info(
        `Zero fee ${!exchange.zeroFee ? 'enabled' : 'disabled'} for ${exchange.name}`
      );
    } catch (error) {
      logger.error('Failed to toggle zero fee:', error);
    }
  };

  // Update balance for specific exchange. Passing `uuid` makes the backend
  // re-fetch only this exchange from the venue instead of every connected
  // exchange (snapshot totals still recompute server-side).
  const updateExchangeBalance = async (exchange: ExchangeInUser) => {
    try {
      logger.info(
        '[update-exchange-balance] requested for uuid:',
        exchange.uuid
      );
      await updateBalance.mutateAsync({
        skipSnapshot: false,
        uuid: exchange.uuid,
      });
      logger.info(`Balance update requested for ${exchange.name}`);
      toast.success('Balances updated successfully');
      return { status: 'ok' } as const;
    } catch (error) {
      logger.error('Failed to update balance:', error);
      toast.error('Failed to refresh balances');
      return { status: 'error', reason: 'refresh failed' } as const;
    }
  };

  // Update all exchange balances
  const updateAllBalances = async () => {
    try {
      await updateBalance.mutateAsync({
        skipSnapshot: false,
      });
      logger.info('All balances updated');
      toast.success('Balances updated successfully');
      return { status: 'ok' } as const;
    } catch (error) {
      logger.error('Failed to update all balances:', error);
      toast.error('Failed to refresh balances');
      return { status: 'error', reason: 'refresh failed' } as const;
    }
  };

  return {
    // Delete actions
    handleDeleteExchange,
    confirmDeleteExchange,
    cancelDeleteExchange,
    deleteConfirmation,
    isDeletingExchange,

    // Toggle actions
    toggleHedgeMode,
    toggleZeroFee,

    // Balance actions
    updateExchangeBalance,
    updateAllBalances,
    isUpdatingBalance,

    // Loading states for individual actions
    isTogglingHedge: setHedgeMode.isPending,
    isTogglingFee: setZeroFee.isPending,
  };
}
