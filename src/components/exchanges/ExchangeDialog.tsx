import { useEntitlements } from '@/lib/entitlements';
import { toast } from '@/lib/toast';
import NewBotWizard from '@/components/wizards/NewBotWizard';
import type { ExchangeInUser } from '@/types/exchange.types';
import React from 'react';
import { useExchangeMutations } from '../../hooks/useExchangeMutations';
import { useExchangesStore } from '../../stores/exchangesStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import ExchangeAddedCelebration from './ExchangeAddedCelebration';
import ExchangeErrorBoundary from './ExchangeErrorBoundary';
import ExchangeForm from './ExchangeForm';
import type { ExchangeDialogProps, ExchangeFormData } from './types';

const ExchangeDialog: React.FC<ExchangeDialogProps> = ({
  open,
  onClose,
  mode,
  exchangeData: exchangeDataProp,
  onSuccess,
  onModeChange,
  initialTradingMode = 'paper',
}) => {
  // Always prefer the live store entry over the prop. Callers that pass
  // `exchangeData` synthesise it from a leaner UI shape (UIExchange) and
  // can lag behind the store after a live hedge / zero-fee toggle. The
  // store, on the other hand, is updated by every exchange mutation,
  // so reading from it here keeps `hedgeMode` / `ignoreFees` accurate
  // every time the dialog (re)opens.
  const liveExchange = useExchangesStore((s) =>
    exchangeDataProp?.uuid ? s.exchanges[exchangeDataProp.uuid] : undefined
  );
  const exchangeData = liveExchange ?? exchangeDataProp;

  // Add-mode success moment. The created exchanges are held here so the
  // celebration can name them; the parent's `onSuccess`/`onClose` are
  // deliberately deferred until the user dismisses it (several callers —
  // notably the /add-exchange page — navigate away inside `onSuccess`,
  // which would tear the celebration down before it is seen).
  const [createdExchanges, setCreatedExchanges] = React.useState<
    ExchangeInUser[] | null
  >(null);
  const [showBotWizard, setShowBotWizard] = React.useState(false);
  // `Celebration` fires `onClose` right after the primary action's
  // `onClick`, so a state flag would still be stale there. This ref marks
  // "the user chose Create a bot" so the close handler keeps the parent
  // dialog alive to host the wizard.
  const wizardRequestedRef = React.useRef(false);

  const {
    addExchange,
    updateExchange,
    updateBalance,
    setHedgeMode,
    setZeroFee,
    isAddingExchange,
    isUpdatingExchange,
    formDataToAddExchangeInput,
    formDataToUpdateExchangeInput,
  } = useExchangeMutations();

  // Unified entitlements gate. Cloud reads `userProfile.subscription`
  // against `paidPlans`; sh reads `useLicense().isPremium`. The
  // adapter (lib/entitlements) hides the difference.
  const { isPaid: isPaidUser } = useEntitlements();

  // Convert ExchangeInUser to ExchangeFormData for editing
  const getInitialFormData = (): Partial<ExchangeFormData> | undefined => {
    if (mode === 'add' || !exchangeData) {
      return undefined;
    }

    const isPaper = exchangeData.provider.toString().includes('paper');

    return {
      name: exchangeData.name,
      provider: exchangeData.provider,
      // `key` is returned by the exchange fragment, but `secret` is NOT
      // (the backend never sends stored secrets to the client). Coalesce
      // both to '' so the form's string invariants hold — otherwise
      // `formData.secret` is `undefined` and `validateForm`'s
      // `secret.trim()` throws, silently killing the Update button.
      key: exchangeData.key ?? '',
      secret: exchangeData.secret ?? '',
      passphrase: exchangeData.passphrase || '',
      keysType: exchangeData.keysType || undefined,
      okxSource: exchangeData.okxSource || undefined,
      bybitHost: exchangeData.bybitHost || 'com',
      isPaperTrading: isPaper,
      stablecoinBalance: '10000', // Default value for topping up
      coinToTopUp: 'USDT', // Default - will be updated by ExchangeForm based on available assets
      hedgeMode: exchangeData.hedge || false,
      ignoreFees: exchangeData.zeroFee || false,
    };
  };

  // Handle form submission
  const handleFormSubmit = async (formData: ExchangeFormData) => {
    if (mode === 'add') {
      // Add new exchange (may return multiple exchanges for certain providers)
      const addInput = formDataToAddExchangeInput(formData, {
        shouldCheckAffiliate: formData.useApproveBuilderFees ?? !isPaidUser,
        subaccount: formData.subaccount ?? false,
      });
      const results = await addExchange.mutateAsync(addInput);

      // Celebrate first. `onSuccess`/`onClose` run from `finishAdd` once the
      // celebration (and the bot wizard, if the user took that path) is done.
      setCreatedExchanges(results ?? []);
      return;
    } else {
      // Update existing exchange
      if (!exchangeData?.uuid) {
        throw new Error('Exchange UUID is required for update');
      }
      const updateInput = formDataToUpdateExchangeInput(
        formData,
        exchangeData.uuid
      );
      const result = await updateExchange.mutateAsync(updateInput);

      // Hedge mode and zero-fee are NOT touched here — they fire on
      // their own toggles via the live handlers below, so by the time
      // the user clicks Update Exchange the server already reflects
      // those switches.

      // Refresh balances after a paper-trading top-up only. The form
      // clears `stablecoinBalance` when the user didn't enter a topUp
      // amount (see ExchangeForm.handleSubmit), so this guards against
      // refreshing on every save.
      const parsedBalance = parseFloat(formData.stablecoinBalance);
      const didTopUp =
        formData.isPaperTrading &&
        Number.isFinite(parsedBalance) &&
        parsedBalance > 0;
      if (didTopUp) {
        // Only re-fetch the edited account's balances — a full all-exchange
        // refresh here kept the dialog spinner up for the whole snapshot.
        await updateBalance.mutateAsync({ uuid: exchangeData.uuid });
        toast.success('Balances updated successfully');
      }

      onSuccess(result);
    }

    onClose();
  };

  // Hand control back to the caller: report the created exchange and close.
  const finishAdd = React.useCallback(() => {
    const results = createdExchanges;
    setCreatedExchanges(null);
    setShowBotWizard(false);
    wizardRequestedRef.current = false;
    if (results) {
      onSuccess(results[0]);
    }
    onClose();
  }, [createdExchanges, onClose, onSuccess]);

  const handleCelebrationCreateBot = () => {
    wizardRequestedRef.current = true;
    setShowBotWizard(true);
  };

  const handleCelebrationClose = () => {
    // Keep this component mounted so it can host the wizard.
    if (wizardRequestedRef.current) return;
    finishAdd();
  };

  const handleBotWizardOpenChange = (next: boolean) => {
    setShowBotWizard(next);
    if (!next) {
      // Either the wizard was cancelled or it navigated to the bot form.
      // Both cases end the add flow; a navigation issued by the wizard
      // runs after this and wins over any caller-side redirect.
      finishAdd();
    }
  };

  // Live hedge / zero-fee toggles. Edit mode only — in add mode the
  // exchange UUID doesn't exist yet, so the form keeps these in
  // `formData` and we'd need to apply them post-create (out of scope
  // for this dialog today; current backend `addExchange` accepts neither
  // field).
  const handleHedgeModeChange = async (value: boolean) => {
    if (!exchangeData?.uuid) return;
    await setHedgeMode.mutateAsync({
      uuid: exchangeData.uuid,
      hedge: value,
    });
  };

  const handleIgnoreFeesChange = async (value: boolean) => {
    if (!exchangeData?.uuid) return;
    await setZeroFee.mutateAsync({
      uuid: exchangeData.uuid,
      value,
    });
  };

  const dialogTitle = mode === 'add' ? 'Add New Exchange' : 'Edit Exchange';
  const dialogDescription =
    mode === 'add'
      ? 'Connect a new exchange to your portfolio. You can start with paper trading to test strategies risk-free.'
      : 'Update your exchange configuration and settings.';

  const isCelebrating = createdExchanges !== null;

  return (
    <>
      <Dialog open={open && !isCelebrating} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden w-[95vw] sm:w-full mx-2 sm:mx-4">
          <DialogHeader className="pb-2 sm:pb-4">
            <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {dialogDescription}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(95vh-8rem)] sm:max-h-[calc(90vh-8rem)] overflow-y-auto">
            <div className="px-4 sm:px-6 pb-2">
              <ExchangeErrorBoundary
                fallbackTitle="Exchange Form Error"
                fallbackMessage="There was an error loading the exchange form. Please try again."
              >
                <ExchangeForm
                  initialData={getInitialFormData()}
                  onSubmit={handleFormSubmit}
                  onCancel={onClose}
                  mode={mode}
                  isLoading={isAddingExchange || isUpdatingExchange}
                  {...(onModeChange && { onModeChange })}
                  initialTradingMode={initialTradingMode}
                  {...(mode === 'edit' && {
                    onHedgeModeChange: handleHedgeModeChange,
                    onIgnoreFeesChange: handleIgnoreFeesChange,
                    hedgeModePending: setHedgeMode.isPending,
                    ignoreFeesPending: setZeroFee.isPending,
                  })}
                />
              </ExchangeErrorBoundary>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ExchangeAddedCelebration
        open={isCelebrating && !showBotWizard}
        exchanges={createdExchanges ?? []}
        onClose={handleCelebrationClose}
        onCreateBot={handleCelebrationCreateBot}
      />

      <NewBotWizard
        open={showBotWizard}
        onOpenChange={handleBotWizardOpenChange}
      />
    </>
  );
};

export default ExchangeDialog;
