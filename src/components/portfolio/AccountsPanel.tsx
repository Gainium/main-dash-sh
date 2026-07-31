/* eslint-disable @typescript-eslint/no-explicit-any */
import { isReadOnly } from '@/lib/demoMode';
import { Edit, Plus, RotateCcw, Settings, Trash2 } from 'lucide-react';
import React from 'react';
import { usePortfolioContext } from '../../hooks/usePortfolioContext';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../ui/button';
import Widget from '../ui/widget';
import ExchangeIcon from '../widgets/shared/ExchangeIcon';
import { RotationChip } from '../ui/chip/RotationChip';

import { useTransformedExchangesFromContext } from '@/contexts/ExchangeDataContext';
import type { ExchangeInUser } from '../../types/exchange.types';

interface AccountsPanelProps {
  settingsDialog: {
    isOpen: boolean;
    exchangeId: string | null;
  };
  setSettingsDialog: React.Dispatch<
    React.SetStateAction<{
      isOpen: boolean;
      exchangeId: string | null;
    }>
  >;
  addExchangeDialog: boolean;
  setAddExchangeDialog: React.Dispatch<React.SetStateAction<boolean>>;
  newExchange: {
    exchange: string;
    apiKey: string;
    apiSecret: string;
  };
  setNewExchange: React.Dispatch<
    React.SetStateAction<{
      exchange: string;
      apiKey: string;
      apiSecret: string;
    }>
  >;
  exchangeSettings: {
    [key: string]: {
      name: string;
      hedgeMode: boolean;
      ignoreFees: boolean;
    };
  };
  setExchangeSettings: React.Dispatch<
    React.SetStateAction<{
      [key: string]: {
        name: string;
        hedgeMode: boolean;
        ignoreFees: boolean;
      };
    }>
  >;
  onEditExchange?: (exchangeData: ExchangeInUser) => void;
  handleDeleteExchange: (exchange: ExchangeInUser) => void;
  updateExchangeBalance: (exchange: ExchangeInUser) => Promise<unknown>;
  isUpdatingBalance: boolean;
  updateAllBalances: () => Promise<unknown>;
}

export const AccountsPanel: React.FC<AccountsPanelProps> = ({
  //setSettingsDialog,
  setAddExchangeDialog,
  onEditExchange,
  handleDeleteExchange,
  updateExchangeBalance,
  updateAllBalances,
  isUpdatingBalance,
}) => {
  // Use shared exchange selection from Portfolio context (multi-select)
  const { selectedExchanges, setSelectedExchanges } = usePortfolioContext();

  // Get privacy mode state and check if in demo mode
  const privacyMode = useUIStore((s) => s.privacyMode);
  const readOnly = isReadOnly();

  // Use shared exchange data from context
  const { exchanges, isLoading } = useTransformedExchangesFromContext();

  // Track per-exchange loading state for refresh buttons
  const [loadingUuids, setLoadingUuids] = React.useState<string[]>([]);

  const handleExchangeSelect = (exchangeId: string) => {
    if (exchangeId === 'ALL') {
      setSelectedExchanges(['ALL']);
      return;
    }

    // Toggle selection
    if (selectedExchanges.includes(exchangeId)) {
      const next = selectedExchanges.filter((e) => e !== exchangeId);
      if (next.length === 0) {
        setSelectedExchanges(['ALL']);
      } else {
        setSelectedExchanges(next);
      }
    } else {
      const next = selectedExchanges.filter((e) => e !== 'ALL');
      setSelectedExchanges([...next, exchangeId]);
    }
  };

  const handleEditExchange = (exchange: any, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent exchange selection

    // Convert UIExchange to ExchangeInUser format for editing
    const exchangeData: ExchangeInUser = {
      uuid: exchange.id,
      name: exchange.name,
      provider: exchange.provider,
      key: exchange.key || '',
      secret: '',
      status: exchange.status,
      balance: exchange.balance,
    };

    if (onEditExchange) {
      onEditExchange(exchangeData);
    }
  };

  const handleDeleteExchangeClick = (exchange: any, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent exchange selection

    // Convert UIExchange to ExchangeInUser format for deletion
    const exchangeData: ExchangeInUser = {
      uuid: exchange.id,
      name: exchange.name,
      provider: exchange.provider,
      key: exchange.key || '',
      secret: '',
      status: exchange.status,
      balance: exchange.balance,
    };

    handleDeleteExchange(exchangeData);
  };

  const handleRefreshBalance = async (exchange: any, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent exchange selection

    // Convert UIExchange to ExchangeInUser format
    const exchangeData: ExchangeInUser = {
      uuid: exchange.id,
      name: exchange.name,
      provider: exchange.provider,
      key: exchange.key || '',
      secret: '',
      status: exchange.status,
      balance: exchange.balance,
    };

    // Show per-exchange spinner while the refresh is in progress
    setLoadingUuids((prev) => [...prev, exchange.id]);
    try {
      // Call update for that exchange (backend updates all balances but we only show per-exchange spinner)
      await updateExchangeBalance(exchangeData);
    } finally {
      setLoadingUuids((prev) => prev.filter((u) => u !== exchange.id));
    }
  };

  const handleRefreshAll = async () => {
    // Show global loading state (mark all exchanges)
    setLoadingUuids((prev) => [...prev, 'ALL']);
    try {
      await updateAllBalances();
    } finally {
      setLoadingUuids((prev) => prev.filter((u) => u !== 'ALL'));
    }
  };

  if (isLoading) {
    return (
      <Widget className="p-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">My Accounts</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddExchangeDialog(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRefreshAll()}
              disabled={isUpdatingBalance || loadingUuids.includes('ALL')}
              title="Refresh balances"
            >
              <RotateCcw
                className={`w-4 h-4 ${isUpdatingBalance || loadingUuids.includes('ALL') ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>
        <div className="text-center py-4 text-muted-foreground">
          Loading exchanges...
        </div>
      </Widget>
    );
  }

  return (
    <Widget className="p-sm">
      <div className="flex items-center justify-between mb-3 sm:mb-4 shrink-0">
        <h3 className="font-semibold text-sm sm:text-base">My Accounts</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAddExchangeDialog(true)}
            className="h-8 w-8 p-0 sm:h-9 sm:w-9 sm:p-xs"
            disabled={readOnly}
            title={
              readOnly
                ? 'Adding exchanges is not available in demo mode'
                : 'Add exchange'
            }
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 sm:h-9 sm:w-9 sm:p-xs"
            onClick={() => handleRefreshAll()}
            disabled={isUpdatingBalance || loadingUuids.includes('ALL')}
            title="Refresh balances"
          >
            <RotateCcw
              className={`w-3 h-3 sm:w-4 sm:h-4 ${isUpdatingBalance || loadingUuids.includes('ALL') ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      <div className="space-y-1.5 sm:space-y-xs flex-1 min-h-0 overflow-y-auto">
        {exchanges.map((exchange) => (
          <div
            key={exchange.id}
            className={`group p-xs sm:p-sm rounded-lg cursor-pointer transition-colors ${
              selectedExchanges.includes(exchange.id)
                ? 'bg-inner-container'
                : 'hover:bg-card/50'
            }`}
            onClick={() => handleExchangeSelect(exchange.id)}
          >
            <div className="flex items-center justify-between relative">
              <div className="flex items-center gap-xs min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-medium flex items-center gap-xs min-w-0">
                  <span className="shrink-0">
                    <ExchangeIcon
                      icon={exchange.icon}
                      size="w-3 h-3 sm:w-4 sm:h-4"
                    />
                  </span>
                  <span className="truncate">{exchange.name}</span>
                  <RotationChip
                    rotationRequired={exchange.rotationRequired}
                    provider={exchange.provider}
                    compact
                    onClick={(e) => handleEditExchange(exchange, e)}
                  />
                </div>
              </div>

              {/* Balance and Actions Container */}
              <div className="flex items-center gap-xs">
                {/* Balance */}
                {exchange.balance != null &&
                  (exchange.balance > 0 || privacyMode) && (
                    <div className="text-right transition-transform duration-200 group-hover:sm:-translate-x-20">
                      <div className="text-xs sm:text-sm font-medium">
                        {privacyMode
                          ? '***'
                          : `$${exchange.balance.toLocaleString()}`}
                      </div>
                    </div>
                  )}
              </div>

              {/* Desktop Hover Menu - Only visible on desktop with hover */}
              {exchange.type === 'exchange' && (
                <div className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-background/90 backdrop-blur-sm rounded-md p-1 border border-border/50 shadow-sm">
                  <button
                    onClick={(e) => handleRefreshBalance(exchange, e)}
                    className="p-1.5 rounded hover:bg-muted/70 transition-colors"
                    title="Refresh Balance"
                    disabled={
                      loadingUuids.includes('ALL') ||
                      loadingUuids.includes(exchange.id)
                    }
                  >
                    <RotateCcw
                      className={`w-3 h-3 text-muted-foreground hover:text-foreground ${loadingUuids.includes('ALL') || loadingUuids.includes(exchange.id) ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    onClick={(e) => handleEditExchange(exchange, e)}
                    className="p-1.5 rounded hover:bg-muted/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      readOnly
                        ? 'Editing is not available in demo mode'
                        : 'Edit Exchange'
                    }
                    disabled={readOnly}
                  >
                    <Edit className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button
                    onClick={(e) => handleEditExchange(exchange, e)}
                    className="p-1.5 rounded hover:bg-muted/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      readOnly
                        ? 'Settings not available in demo mode'
                        : 'Exchange Settings'
                    }
                    disabled={readOnly}
                  >
                    <Settings className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteExchangeClick(exchange, e)}
                    className="p-1.5 rounded hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      readOnly
                        ? 'Deletion not available in demo mode'
                        : 'Delete Exchange'
                    }
                    disabled={readOnly}
                  >
                    <Trash2 className="w-3 h-3 text-destructive hover:text-destructive/80" />
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Always-Visible Action Buttons - Only visible on mobile */}
            {exchange.type === 'exchange' && (
              <div className="sm:hidden flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/30">
                <button
                  onClick={(e) => handleRefreshBalance(exchange, e)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-muted/70 transition-colors"
                  title="Refresh Balance"
                  disabled={
                    loadingUuids.includes('ALL') ||
                    loadingUuids.includes(exchange.id)
                  }
                >
                  <RotateCcw
                    className={`w-3 h-3 text-muted-foreground ${loadingUuids.includes('ALL') || loadingUuids.includes(exchange.id) ? 'animate-spin' : ''}`}
                  />
                  <span className="text-xs">Refresh</span>
                </button>
                <button
                  onClick={(e) => handleEditExchange(exchange, e)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-muted/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    readOnly
                      ? 'Editing not available in demo mode'
                      : 'Edit Exchange'
                  }
                  disabled={readOnly}
                >
                  <Edit className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs">Edit</span>
                </button>
                <button
                  onClick={(e) => handleEditExchange(exchange, e)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-muted/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    readOnly
                      ? 'Settings not available in demo mode'
                      : 'Settings'
                  }
                  disabled={readOnly}
                >
                  <Settings className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs">Settings</span>
                </button>
                <button
                  onClick={(e) => handleDeleteExchangeClick(exchange, e)}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded hover:bg-destructive/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    readOnly
                      ? 'Deletion not available in demo mode'
                      : 'Delete Exchange'
                  }
                  disabled={readOnly}
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                  <span className="text-xs text-destructive">Delete</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Widget>
  );
};
