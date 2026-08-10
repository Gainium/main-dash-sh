import type { BulkAction } from '@/components/ui/data-table/data-table';
import {
  ArrowRightLeft,
  BookOpen,
  Edit,
  Handshake,
  MinusCircle,
  PlusCircle,
  X,
  XCircle,
} from 'lucide-react';

export interface SharedDealActionRow {
  symbol: unknown;
  exchange: string;
}

interface CreateSharedDealBulkActionsOptions<T extends SharedDealActionRow> {
  onMerge: (selectedDeals: T[]) => Promise<void> | void;
  onAddToJournal: (selectedDeals: T[]) => Promise<void> | void;
  onAddFunds: (selectedDeals: T[]) => Promise<void> | void;
  onReduceFunds: (selectedDeals: T[]) => Promise<void> | void;
  onEdit: (selectedDeals: T[]) => Promise<void> | void;
  onMoveToTerminal: (selectedDeals: T[]) => Promise<void> | void;
  onCancel: (selectedDeals: T[]) => Promise<void> | void;
  onClose: (selectedDeals: T[]) => Promise<void> | void;
  canMoveToTerminal: (deal: T) => boolean;
  /**
   * Whether a deal can take a funds adjustment (see `canAdjustDealFunds`).
   * Omit to always offer the Add/Reduce Funds actions.
   */
  canAdjustFunds?: (deal: T) => boolean;
  getSymbol: (deal: T) => string;
}

export function createSharedDealBulkActions<T extends SharedDealActionRow>(
  options: CreateSharedDealBulkActionsOptions<T>
): BulkAction<T>[] {
  const {
    onMerge,
    onAddToJournal,
    onAddFunds,
    onReduceFunds,
    onEdit,
    onMoveToTerminal,
    onCancel,
    onClose,
    canMoveToTerminal,
    canAdjustFunds,
    getSymbol,
  } = options;

  // Offer the funds actions only while at least one selected deal can take
  // one — the flow itself skips the rest and says so.
  const showAdjustFunds = canAdjustFunds
    ? { shouldShow: (selectedDeals: T[]) => selectedDeals.some(canAdjustFunds) }
    : {};

  return [
    {
      id: 'merge',
      label: 'Merge Deals',
      icon: Handshake,
      onAction: onMerge,
      shouldShow: (selectedDeals: T[]) => {
        if (selectedDeals.length < 2) {
          return false;
        }

        const firstSymbol = getSymbol(selectedDeals[0]);
        const firstExchange = selectedDeals[0].exchange;

        const allSameSymbol = selectedDeals.every(
          (deal: T) => getSymbol(deal) === firstSymbol
        );

        const allSameExchange = selectedDeals.every(
          (deal: T) => deal.exchange === firstExchange
        );

        return allSameSymbol && allSameExchange;
      },
    },
    {
      id: 'add-to-journal',
      label: 'Add to Journal',
      icon: BookOpen,
      onAction: onAddToJournal,
    },
    {
      id: 'add-funds',
      label: 'Add Funds',
      icon: PlusCircle,
      onAction: onAddFunds,
      ...showAdjustFunds,
    },
    {
      id: 'reduce-funds',
      label: 'Reduce Funds',
      icon: MinusCircle,
      onAction: onReduceFunds,
      ...showAdjustFunds,
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: Edit,
      onAction: onEdit,
    },
    {
      id: 'move-to-terminal',
      label: 'Move to Terminal',
      icon: ArrowRightLeft,
      onAction: onMoveToTerminal,
      shouldShow: (selectedDeals: T[]) => {
        if (selectedDeals.length === 0) {
          return false;
        }
        return selectedDeals.every(canMoveToTerminal);
      },
    },
    {
      id: 'cancel',
      label: 'Cancel',
      icon: X,
      onAction: onCancel,
    },
    {
      id: 'close',
      label: 'Close',
      icon: XCircle,
      destructive: true,
      onAction: onClose,
    },
  ];
}
