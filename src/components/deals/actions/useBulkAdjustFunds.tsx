// Shared bulk "Add funds" / "Reduce funds" flow for deal tables.
//
// Consumed by the bot details drawer deals table (DrawerDealsTable) and by
// OpenOrdersWidget — which backs the Trading page Trades tab, the Trading
// dashboard Open Orders widget and the Trading Terminal panel. Keeping the
// eligibility rules, the per-deal fan-out and the aggregated reporting here
// means those surfaces can't drift apart.
import {
  AdjustFundsDialog,
  type AdjustFundsDialogMode,
} from '@/features/bots/shared/runtime';
import { useAdjustFunds } from '@/hooks/useDealActions';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { DCADealStatusEnum, type AddFundsSettings } from '@/types';
import React, { useCallback, useMemo, useState } from 'react';

const LOG_PREFIX = '[useBulkAdjustFunds]';

/** A selected deal row reduced to what the adjust-funds flow needs. */
export interface BulkAdjustFundsTarget {
  dealId: string;
  botId: string | undefined;
  /** Deal status — only open deals can take a funds adjustment. */
  status: string | undefined;
  /** Bot type as rendered in the tables ('DCA', 'Combo', 'Grid', …). */
  type: string | undefined;
  baseAsset?: string | undefined;
  quoteAsset?: string | undefined;
}

/** Combo legs are managed by the combo engine, not the deal funds mutation. */
const COMBO_TYPES = new Set(['Combo', 'Hedge Combo']);

/**
 * Same rule the per-row Add/Reduce Funds menu items apply: the deal must be
 * open, belong to a bot, and not be a combo deal.
 */
export function canAdjustDealFunds(target: BulkAdjustFundsTarget): boolean {
  return (
    !!target.dealId &&
    !!target.botId &&
    !COMBO_TYPES.has(String(target.type ?? '')) &&
    String(target.status ?? '').toLowerCase() === DCADealStatusEnum.open
  );
}

export interface UseBulkAdjustFundsResult {
  /** Opens the dialog for the eligible subset of `selected`. */
  open: (
    mode: AdjustFundsDialogMode,
    selected: BulkAdjustFundsTarget[]
  ) => void;
  /** Render once inside the consuming table. */
  dialog: React.ReactNode;
}

export function useBulkAdjustFunds(): UseBulkAdjustFundsResult {
  // Silent: every deal is awaited below and reported as one aggregate, so the
  // mutation must not toast per deal.
  const adjustFundsMutation = useAdjustFunds({ silent: true });
  const [mode, setMode] = useState<AdjustFundsDialogMode | null>(null);
  const [targets, setTargets] = useState<BulkAdjustFundsTarget[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const open = useCallback(
    (nextMode: AdjustFundsDialogMode, selected: BulkAdjustFundsTarget[]) => {
      const eligible = selected.filter(canAdjustDealFunds);

      if (eligible.length === 0) {
        toast.error(
          nextMode === 'add'
            ? 'Select at least one open deal to add funds to'
            : 'Select at least one open deal to reduce funds from'
        );
        return;
      }

      const skipped = selected.length - eligible.length;
      if (skipped > 0) {
        toast.info(
          `Skipping ${skipped} selected deal(s) that can't take a funds adjustment`
        );
      }

      logger.info(`${LOG_PREFIX}: Bulk ${nextMode} funds`, {
        selected: selected.length,
        eligible: eligible.length,
      });

      setTargets(eligible);
      setMode(nextMode);
    },
    []
  );

  const close = useCallback(() => {
    setMode(null);
    setTargets([]);
  }, []);

  // Naming the assets in the picker is only honest when every selected deal
  // shares the same pair; a mixed selection falls back to "Base/Quote asset".
  const { baseAsset, quoteAsset } = useMemo(() => {
    const bases = new Set(targets.map((target) => target.baseAsset ?? ''));
    const quotes = new Set(targets.map((target) => target.quoteAsset ?? ''));
    return {
      baseAsset: bases.size === 1 ? [...bases][0] : undefined,
      quoteAsset: quotes.size === 1 ? [...quotes][0] : undefined,
    };
  }, [targets]);

  const handleConfirm = useCallback(
    async (settings: AddFundsSettings) => {
      if (!mode || isProcessing) {
        return;
      }

      setIsProcessing(true);

      let successCount = 0;
      let errorCount = 0;
      let firstReason = '';

      // Sequential, matching the other bulk deal actions — these place real
      // exchange orders, so a burst of parallel requests is not worth it.
      for (const target of targets) {
        try {
          await adjustFundsMutation.mutateAsync({
            dealId: target.dealId,
            botId: target.botId as string,
            settings,
            mode,
          });
          successCount += 1;
        } catch (error) {
          errorCount += 1;
          if (!firstReason && error instanceof Error) {
            firstReason = error.message;
          }
          logger.error(`${LOG_PREFIX}: Failed bulk ${mode} funds`, {
            error,
            dealId: target.dealId,
            botId: target.botId,
          });
        }
      }

      setIsProcessing(false);
      close();

      const verb = mode === 'add' ? 'Add funds' : 'Reduce funds';
      if (successCount > 0) {
        // "scheduled", not "done" — an OK response only means the order was
        // queued; the exchange can still reject it asynchronously.
        toast.info(`${verb} scheduled for ${successCount} deal(s)`);
      }
      if (errorCount > 0) {
        toast.error(
          `${verb} failed for ${errorCount} deal(s)${
            firstReason ? `: ${firstReason}` : ''
          }`
        );
      }
    },
    [adjustFundsMutation, close, isProcessing, mode, targets]
  );

  const dialog = mode ? (
    <AdjustFundsDialog
      open
      mode={mode}
      targetCount={targets.length}
      isProcessing={isProcessing}
      onOpenChange={(next) => {
        if (!next && !isProcessing) {
          close();
        }
      }}
      onConfirm={handleConfirm}
      baseAsset={baseAsset}
      quoteAsset={quoteAsset}
    />
  ) : null;

  return { open, dialog };
}
