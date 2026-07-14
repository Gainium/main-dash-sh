import React from 'react';

import {
  BotStatusConfirmationModal,
  DeleteConfirmationModal,
  SuccessFeedbackModal,
} from '@/components/modals';
import { getTargetStatus } from '@/utils/botStatusUtils';
import { BotTypesEnum } from '@/types';
import type { BotActionsModalProps } from '@/hooks/useBotActions';

/**
 * The three confirmation/feedback modals every bot surface needs, driven
 * entirely by the state `useBotActions` owns. Spread the hook's `modalProps`:
 *
 * ```tsx
 * const botActions = useBotActions({ … });
 * // …
 * <BotActionsMenuItems bot={{ id, name, type, status }} {...botActions.menuProps} />
 * <BotActionsModals {...botActions.modalProps} />
 * ```
 *
 * A hook can't render JSX and stay a hook, and each surface used to hand-roll
 * these three modals (with subtly different props). This is the shared render
 * half of the pair.
 */
export const BotActionsModals: React.FC<BotActionsModalProps> = ({
  botName,
  status,
  botType,
  statusModalOpen,
  onStatusModalOpenChange,
  onConfirmStatusChange,
  hasActiveDeals,
  statusPending,
  gridFutures,
  gridHasOpenPosition,
  gridIsShort,
  deleteModalOpen,
  onDeleteModalOpenChange,
  onConfirmDelete,
  deletePending,
  deleteTitle,
  deleteDescription,
  deleteActiveDeals,
  deleteTotalValue,
  deleteCurrency,
  deleteLastActivity,
  successModalOpen,
  onSuccessModalOpenChange,
  successType,
  successNewItemId,
}) => {
  const isGrid = botType === BotTypesEnum.grid;

  return (
    <>
      <BotStatusConfirmationModal
        open={statusModalOpen}
        onOpenChange={onStatusModalOpenChange}
        onConfirm={onConfirmStatusChange}
        botName={botName}
        currentStatus={status}
        targetStatus={getTargetStatus(status)}
        hasActiveDeals={hasActiveDeals}
        botType={isGrid ? BotTypesEnum.grid : undefined}
        gridFutures={isGrid ? gridFutures : undefined}
        gridHasOpenPosition={isGrid ? gridHasOpenPosition : undefined}
        gridIsShort={isGrid ? gridIsShort : undefined}
        isLoading={statusPending}
      />

      <DeleteConfirmationModal
        open={deleteModalOpen}
        onOpenChange={onDeleteModalOpenChange}
        onConfirm={onConfirmDelete}
        title={deleteTitle}
        description={deleteDescription}
        itemName={botName}
        itemType="bot"
        additionalInfo={{
          activeDeals: deleteActiveDeals,
          totalValue: deleteTotalValue,
          currency: deleteCurrency,
          lastActivity: deleteLastActivity,
        }}
        isLoading={deletePending}
        requireConfirmation={false}
      />

      <SuccessFeedbackModal
        open={successModalOpen}
        onOpenChange={onSuccessModalOpenChange}
        type={successType}
        itemName={botName}
        itemType="bot"
        newItemId={successNewItemId}
        details={
          successType === 'clone'
            ? {
                originalName: botName,
                newName: `${botName} (Clone)`,
                botTypeId: botType,
              }
            : undefined
        }
      />
    </>
  );
};

export default BotActionsModals;
