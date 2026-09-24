import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyStateExchanges from '../components/exchanges/EmptyStateExchanges';
import { ExchangeDialog } from '../components/exchanges';
import DeleteExchangeDialog from '../components/exchanges/DeleteExchangeDialog';
import ExchangeErrorBoundary from '../components/exchanges/ExchangeErrorBoundary';
import MainLayout from '../components/layout/MainLayout';
import WidgetContainer from '../components/layout/WidgetContainer';
import {
  AccountsPanel,
  EnhancedPortfolioBalances,
  PortfolioAllocation,
  PortfolioExchangeDistribution,
  PortfolioValue,
} from '../components/portfolio';
import FuturesSummaryCard from '../components/portfolio/futures/FuturesSummaryCard';
import { Slot } from '../lib/extensions';
import { Button } from '../components/ui/button';
import { useTransformedExchangesFromContext } from '../contexts/ExchangeDataContext';
import { PortfolioProvider } from '../contexts/PortfolioContext';
import { useExchangeActions } from '../hooks/useExchangeActions';
import { logger } from '../lib/loggerInstance';
import { useExchangesStore } from '../stores/exchangesStore';
import { type ExchangeInUser } from '../types/exchange.types';

const Portfolio: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { exchanges, isLoading: exchangesLoading } =
    useTransformedExchangesFromContext();
  const initialLoaded = useExchangesStore((s) => s.initialLoaded);
  const filteredExchanges = useMemo(
    () => exchanges.filter((ex) => ex.id !== 'ALL'),
    [exchanges]
  );
  // Same gate as Overview: wait for the first load cycle before declaring
  // "no exchanges" so we don't flash the empty state during initial bootstrap.
  const showEmptyState =
    initialLoaded && !exchangesLoading && filteredExchanges.length === 0;

  const {
    updateAllBalances,
    isUpdatingBalance,
    deleteConfirmation,
    confirmDeleteExchange,
    cancelDeleteExchange,
    isDeletingExchange,
    handleDeleteExchange,
    updateExchangeBalance,
  } = useExchangeActions();

  // The Settings quick-action button on the AccountsPanel used to open
  // an inline dialog whose "Save & Close" was a no-op (purely local
  // state, no mutation). Both the desktop and mobile Settings buttons
  // now reuse the same `handleEditExchange` flow that the Edit button
  // does, which mounts the proper `ExchangeDialog` (uses
  // `useExchangeMutations`'s `updateExchange`). The leftover state
  // below is kept only to satisfy the `AccountsPanel` API surface; the
  // values are never read here anymore.
  const [settingsDialog, setSettingsDialog] = useState<{
    isOpen: boolean;
    exchangeId: string | null;
  }>({ isOpen: false, exchangeId: null });
  const [addExchangeDialog, setAddExchangeDialog] = useState(false);
  const [editExchangeDialog, setEditExchangeDialog] = useState<{
    isOpen: boolean;
    exchangeData: ExchangeInUser | null;
  }>({ isOpen: false, exchangeData: null });
  const [newExchange, setNewExchange] = useState({
    exchange: '',
    apiKey: '',
    apiSecret: '',
  });
  const [exchangeSettings, setExchangeSettings] = useState<{
    [key: string]: {
      name: string;
      hedgeMode: boolean;
      ignoreFees: boolean;
    };
  }>({});

  // Exchange dialog handlers
  const handleAddExchangeSuccess = (exchange: ExchangeInUser) => {
    logger.info('Exchange added successfully:', exchange);
    // Here you would typically update your exchanges list
    // For now, we'll just close the dialog
    setAddExchangeDialog(false);
  };

  const handleEditExchangeSuccess = (exchange: ExchangeInUser) => {
    logger.info('Exchange updated successfully:', exchange);
    // Here you would typically update your exchanges list
    // For now, we'll just close the dialog
    setEditExchangeDialog({ isOpen: false, exchangeData: null });
  };

  const handleEditExchange = (exchangeData: ExchangeInUser) => {
    setEditExchangeDialog({ isOpen: true, exchangeData });
  };

  // Handle refresh balances
  const handleRefreshBalances = async () => {
    // The futures card reads live positions; refresh them with the balances.
    void queryClient.invalidateQueries({
      queryKey: ['getAllOpenPositions'],
    });
    try {
      await updateAllBalances();
    } catch (error) {
      logger.error('Failed to refresh balances:', error);
    }
  };

  // Page-specific actions for the navbar (refresh button)
  const pageActions = (
    <Button
      variant="ghost"
      size="sm"
      className="p-1 h-8 w-8"
      onClick={handleRefreshBalances}
      disabled={isUpdatingBalance}
      title="Refresh balances"
    >
      <RefreshCw
        className={`w-4 h-4 ${isUpdatingBalance ? 'animate-spin' : ''}`}
      />
    </Button>
  );

  if (showEmptyState) {
    return (
      <PortfolioProvider>
        <MainLayout
          pageTitle="Portfolio"
          activePage="/portfolio"
          pageActions={pageActions}
        >
          <EmptyStateExchanges
            onAddExchange={() => navigate('/add-exchange')}
          />
        </MainLayout>
      </PortfolioProvider>
    );
  }

  return (
    <PortfolioProvider>
      <MainLayout
        pageTitle="Portfolio"
        activePage="/portfolio"
        pageActions={pageActions}
      >
        <WidgetContainer layout="grid" columns={{ xs: 1, sm: 1, md: 1, lg: 4 }}>
          {/* Mobile-First Layout: Accounts Panel */}
          <div className="lg:col-span-1 order-1 lg:order-1">
            <div className="lg:sticky lg:top-2 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
              <ExchangeErrorBoundary
                fallbackTitle="Accounts Panel Error"
                fallbackMessage="There was an error loading your exchange accounts."
              >
                <AccountsPanel
                  settingsDialog={settingsDialog}
                  setSettingsDialog={setSettingsDialog}
                  addExchangeDialog={addExchangeDialog}
                  setAddExchangeDialog={setAddExchangeDialog}
                  newExchange={newExchange}
                  setNewExchange={setNewExchange}
                  exchangeSettings={exchangeSettings}
                  setExchangeSettings={setExchangeSettings}
                  onEditExchange={handleEditExchange}
                  handleDeleteExchange={handleDeleteExchange}
                  updateExchangeBalance={updateExchangeBalance}
                  updateAllBalances={updateAllBalances}
                  isUpdatingBalance={isUpdatingBalance}
                />
              </ExchangeErrorBoundary>
            </div>
          </div>

          {/* Main Content - Responsive Order */}
          <div className="lg:col-span-3 order-2 lg:order-2">
            <WidgetContainer layout="flex" noPadding>
              {/* Portfolio Chart - Responsive Height */}
              <PortfolioValue
                widgetId="portfolio-value-page"
                height="600px"
                className="w-full"
              />

              {/* Futures summary — renders nothing without a futures account. */}
              <FuturesSummaryCard />

              {/* Portfolio Analytics Grid - 2x3 on Desktop, Stacked on Mobile */}
              <WidgetContainer
                layout="grid"
                columns={{ xs: 1, sm: 1, md: 1, lg: 2 }}
                noPadding
              >
                {/* Portfolio Allocation - First on Mobile */}
                <PortfolioAllocation
                  widgetId="portfolio-allocation-page"
                  height="450px"
                  className="w-full order-1"
                />

                {/* Exchange Distribution - Second on Mobile (replaced Categories) */}
                <PortfolioExchangeDistribution
                  widgetId="portfolio-exchange-distribution-page"
                  height="450px"
                  className="w-full order-2"
                />

                {/* Market Cap Analysis - filled by host build via slot. */}
                <Slot
                  name="portfolio.marketCapAnalysis"
                  widgetId="portfolio-market-cap-analysis-page"
                />

                {/* Performance Analysis - filled by host build via slot. */}
                <Slot
                  name="portfolio.performanceAnalysis"
                  widgetId="portfolio-performance-analysis-page"
                />

                {/* Exchange Distribution - Fifth on Mobile */}
                {/* <PortfolioExchangeDistribution
                  widgetId="portfolio-exchange-distribution-page"
                  height="450px"
                  className="w-full order-5"
                /> */}

                {/* Enhanced Portfolio Balances - Sixth on Mobile, spans full width */}
                <div className="lg:col-span-2 order-6">
                  <EnhancedPortfolioBalances
                    widgetId="enhanced-portfolio-balances-page"
                    className="w-full"
                    showPagination={true}
                  />
                </div>
              </WidgetContainer>
            </WidgetContainer>
          </div>
        </WidgetContainer>

        {/* Enhanced Exchange Dialogs */}
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
    </PortfolioProvider>
  );
};

export default Portfolio;
