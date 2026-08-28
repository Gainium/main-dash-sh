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
import { type AddFundsSettings } from '@/types';
import {
  canAdjustDealFunds,
  sharedTargetValue,
  type BulkAdjustFundsTarget,
} from './bulkAdjustFundsTargets';
import React, { useCallback, useMemo, useState } from 'react';

const LOG_PREFIX = '[useBulkAdjustFunds]';

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
  //
  // The symbol and venue follow exactly the same rule, and for the same
  // reason. This path is not only reached by multi-select: picking Add funds
  // from a single row's menu in the table view arrives here with one target,
  // and withholding the symbol there cost that user the market-price default
  // the card view already gave them.
  const { baseAsset, quoteAsset, symbol, exchange, percentBasis } = useMemo(
    () => ({
      baseAsset: sharedTargetValue(targets, (target) => target.baseAsset),
      quoteAsset: sharedTargetValue(targets, (target) => target.quoteAsset),
      symbol: sharedTargetValue(targets, (target) => target.symbol),
      exchange: sharedTargetValue(targets, (target) => target.exchange),
      // Not collapsible like the rest: two deals on the same pair still hold
      // different positions, so a percentage resolves to a different base
      // amount for each. Only a single selection has one right answer.
      percentBasis: targets.length === 1 ? targets[0]?.percentBasis : undefined,
    }),
    [targets]
  );

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
      symbol={symbol}
      exchange={exchange}
      percentBasis={percentBasis}
    />
  ) : null;

  return { open, dialog };
}
