import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Merge,
  RefreshCcw,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  formatBalance,
  formatCurrency,
  formatNumber,
  formatPercentage,
} from '@/utils/numberFormatter';
import { formatDate } from '@/utils/formatters';

export interface SmartOrderMergeDeal {
  id: string;
  pair: string;
  baseAsset?: string;
  quoteAsset?: string;
  strategy?: string;
  status?: string;
  createdAt?: string;
  avgPrice?: number;
  profitUsd?: number;
  profitPct?: number;
  currentBase?: number;
  currentQuote?: number;
  initialBase?: number;
  initialQuote?: number;
  levelsComplete?: number;
  levelsAll?: number;
  label?: string;
  notes?: string;
}

export interface SmartOrderMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { dealIds: string[] }) => void | Promise<void>;
  deals: SmartOrderMergeDeal[];
  onCancel?: () => void;
  defaultSelectedIds?: string[];
  isProcessing?: boolean;
  botName?: string;
  extraMessage?: string;
}

const CARD_BASE_CLASSES =
  'flex cursor-pointer items-start gap-sm rounded-lg border px-4 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const METRIC_CONTAINER_CLASSES =
  'rounded-md border border-border/40 bg-background/50 px-2 py-1 text-xs';

export const SmartOrderMergeDialog: React.FC<SmartOrderMergeDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  deals,
  onCancel,
  defaultSelectedIds,
  isProcessing = false,
  botName,
  extraMessage,
}) => {
  const sortedDeals = useMemo(() => {
    return [...deals].sort((a, b) => {
      if (a.createdAt && b.createdAt) {
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
      return a.label?.localeCompare(b.label ?? '') ?? 0;
    });
  }, [deals]);

  const initialSelected = useMemo(() => {
    if (sortedDeals.length === 0) {
      return new Set<string>();
    }

    if (Array.isArray(defaultSelectedIds) && defaultSelectedIds.length > 0) {
      return new Set(defaultSelectedIds);
    }

    return new Set(sortedDeals.map((deal) => deal.id));
  }, [sortedDeals, defaultSelectedIds]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelected);
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  useEffect(() => {
    setSelectedIds(initialSelected);
  }, [initialSelected]);

  const toggleDealSelection = useCallback(
    (dealId: string, explicit?: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const shouldSelect = explicit ?? !next.has(dealId);

        if (shouldSelect) {
          next.add(dealId);
        } else {
          next.delete(dealId);
        }

        return next;
      });
    },
    []
  );

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === sortedDeals.length) {
        return new Set();
      }
      return new Set(sortedDeals.map((deal) => deal.id));
    });
  }, [sortedDeals]);

  const selectedDeals = useMemo(() => {
    if (selectedIds.size === 0) {
      return [] as SmartOrderMergeDeal[];
    }
    return sortedDeals.filter((deal) => selectedIds.has(deal.id));
  }, [sortedDeals, selectedIds]);

  const summary = useMemo(() => {
    const baseTotals = new Map<string, number>();
    const quoteTotals = new Map<string, number>();

    selectedDeals.forEach((deal) => {
      if (deal.currentBase != null) {
        const asset = deal.baseAsset ?? 'BASE';
        baseTotals.set(asset, (baseTotals.get(asset) ?? 0) + deal.currentBase);
      }
      if (deal.currentQuote != null) {
        const asset = deal.quoteAsset ?? 'QUOTE';
        quoteTotals.set(
          asset,
          (quoteTotals.get(asset) ?? 0) + deal.currentQuote
        );
      }
    });

    const pairSet = new Set(selectedDeals.map((deal) => deal.pair));
    const strategySet = new Set(
      selectedDeals.map((deal) => deal.strategy ?? '')
    );

    return {
      baseTotals,
      quoteTotals,
      pairMismatch: pairSet.size > 1,
      strategyMismatch:
        Array.from(strategySet).filter((item) => item !== '').length > 1,
    };
  }, [selectedDeals]);

  const confirmDisabled =
    isProcessing ||
    selectedDeals.length < 2 ||
    summary.pairMismatch ||
    summary.strategyMismatch;

  const handleConfirm = useCallback(() => {
    if (confirmDisabled) {
      return;
    }

    const dealIds = selectedDeals.map((deal) => deal.id);
    onConfirm({ dealIds });
  }, [confirmDisabled, selectedDeals, onConfirm]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        handleCancel();
      } else {
        onOpenChange(true);
      }
    },
    [handleCancel, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-xs text-base sm:text-lg">
            <Merge className="h-4 w-4 sm:h-5 sm:w-5" />
            Merge smart orders
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Combine multiple smart orders into a single active position
            {botName ? ` for ${botName}` : ''}. Select at least two orders to
            continue.
            {' '}
            {/* New tab: reading a help article must never cost the user
                whatever they have half-configured behind this dialog. */}
            <a
              href="/help/merge-deals"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline hover:text-primary/80"
            >
              Learn more
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-md">
          {extraMessage ? (
            <Alert className="border-border/60 bg-muted/20">
              <AlertDescription className="text-sm text-muted-foreground">
                {extraMessage}
              </AlertDescription>
            </Alert>
          ) : null}

          {sortedDeals.length === 0 ? (
            <Alert className="border-border/60 bg-muted/20">
              <AlertTitle>No smart orders available</AlertTitle>
              <AlertDescription className="text-sm text-muted-foreground">
                There are no eligible smart orders for this bot. Only open
                orders can be merged.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-sm">
              <div className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                <div className="flex items-center gap-xs text-muted-foreground">
                  <Layers className="h-4 w-4" />
                  <span>
                    {selectedDeals.length} of {sortedDeals.length} selected
                  </span>
                </div>
                <div className="flex items-center gap-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={toggleAll}
                    className="h-7 px-2 text-xs"
                  >
                    {selectedIds.size === sortedDeals.length
                      ? 'Clear selection'
                      : 'Select all'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAllMetrics((prev) => !prev)}
                    className="h-7 px-2 text-xs"
                  >
                    {showAllMetrics ? (
                      <>
                        <ChevronUp className="mr-1 h-3.5 w-3.5" /> Hide metrics
                      </>
                    ) : (
                      <>
                        <ChevronDown className="mr-1 h-3.5 w-3.5" /> Show
                        metrics
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="max-h-96 space-y-sm overflow-y-auto pr-1">
                {sortedDeals.map((deal) => {
                  const isSelected = selectedIds.has(deal.id);

                  return (
                    <div
                      key={deal.id}
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isSelected}
                      className={cn(
                        CARD_BASE_CLASSES,
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm hover:border-primary'
                          : 'border-border/60 bg-muted/10 hover:border-border'
                      )}
                      onClick={() => toggleDealSelection(deal.id)}
                      onKeyDown={(event) => {
                        if (event.key === ' ' || event.key === 'Enter') {
                          event.preventDefault();
                          toggleDealSelection(deal.id);
                        }
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          toggleDealSelection(deal.id, Boolean(checked));
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-1"
                        aria-label={`Select smart order ${deal.label ?? deal.pair}`}
                      />

                      <div className="flex flex-1 flex-col gap-xs">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                              {deal.label ?? deal.pair}
                            </p>
                            <div className="flex flex-wrap gap-x-sm gap-y-1 text-xs text-muted-foreground">
                              {deal.strategy ? (
                                <span>{deal.strategy}</span>
                              ) : null}
                              {deal.createdAt ? (
                                <span>{formatDate(deal.createdAt)}</span>
                              ) : null}
                              {deal.levelsAll ? (
                                <span>
                                  Levels {deal.levelsComplete ?? 0}/
                                  {deal.levelsAll}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {deal.status ? (
                            <Badge
                              variant={isSelected ? 'default' : 'outline'}
                              className="uppercase"
                            >
                              {deal.status}
                            </Badge>
                          ) : null}
                        </div>

                        {(deal.notes || showAllMetrics) && deal.notes ? (
                          <p className="text-xs text-muted-foreground">
                            {deal.notes}
                          </p>
                        ) : null}

                        <div className="grid gap-xs text-xs sm:grid-cols-3">
                          {deal.currentBase != null ? (
                            <div className={METRIC_CONTAINER_CLASSES}>
                              <p className="text-xs uppercase text-muted-foreground">
                                Current base
                              </p>
                              <p className="font-medium">
                                {formatBalance(
                                  deal.currentBase,
                                  deal.baseAsset
                                )}{' '}
                                {deal.baseAsset ?? ''}
                              </p>
                            </div>
                          ) : null}

                          {deal.currentQuote != null ? (
                            <div className={METRIC_CONTAINER_CLASSES}>
                              <p className="text-xs uppercase text-muted-foreground">
                                Current quote
                              </p>
                              <p className="font-medium">
                                {formatBalance(
                                  deal.currentQuote,
                                  deal.quoteAsset
                                )}{' '}
                                {deal.quoteAsset ?? ''}
                              </p>
                            </div>
                          ) : null}

                          {deal.avgPrice != null ? (
                            <div className={METRIC_CONTAINER_CLASSES}>
                              <p className="text-xs uppercase text-muted-foreground">
                                Average price
                              </p>
                              <p className="font-medium">
                                {formatNumber(deal.avgPrice, true)}{' '}
                                {deal.quoteAsset ?? ''}
                              </p>
                            </div>
                          ) : null}

                          {showAllMetrics && deal.initialBase != null ? (
                            <div className={METRIC_CONTAINER_CLASSES}>
                              <p className="text-xs uppercase text-muted-foreground">
                                Initial base
                              </p>
                              <p className="font-medium">
                                {formatBalance(
                                  deal.initialBase,
                                  deal.baseAsset
                                )}{' '}
                                {deal.baseAsset ?? ''}
                              </p>
                            </div>
                          ) : null}

                          {showAllMetrics && deal.initialQuote != null ? (
                            <div className={METRIC_CONTAINER_CLASSES}>
                              <p className="text-xs uppercase text-muted-foreground">
                                Initial quote
                              </p>
                              <p className="font-medium">
                                {formatBalance(
                                  deal.initialQuote,
                                  deal.quoteAsset
                                )}{' '}
                                {deal.quoteAsset ?? ''}
                              </p>
                            </div>
                          ) : null}

                          {deal.profitUsd != null ? (
                            <div className={METRIC_CONTAINER_CLASSES}>
                              <p className="text-xs uppercase text-muted-foreground">
                                Unrealized PnL
                              </p>
                              <p
                                className={cn(
                                  'font-medium',
                                  deal.profitUsd > 0
                                    ? 'text-success'
                                    : deal.profitUsd < 0
                                      ? 'text-destructive'
                                      : 'text-foreground'
                                )}
                              >
                                {formatCurrency(deal.profitUsd)}
                                {deal.profitPct != null
                                  ? ` (${formatPercentage(deal.profitPct)})`
                                  : ''}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-xs rounded-lg border border-border/60 bg-muted/20 p-md text-xs text-muted-foreground">
                <div className="flex items-center gap-xs text-sm font-medium text-foreground">
                  <RefreshCcw className="h-4 w-4" />
                  Combined selection snapshot
                </div>
                <Separator className="bg-border/60" />
                <div className="space-y-1">
                  <p>
                    {selectedDeals.length > 0
                      ? `${selectedDeals.length} smart orders ready to merge`
                      : 'No smart orders selected'}
                  </p>

                  {[...summary.baseTotals.entries()].map(([asset, value]) => (
                    <p key={`base-${asset}`}>
                      Base total: {formatBalance(value, asset)} {asset}
                    </p>
                  ))}

                  {[...summary.quoteTotals.entries()].map(([asset, value]) => (
                    <p key={`quote-${asset}`}>
                      Quote total: {formatBalance(value, asset)} {asset}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {summary.pairMismatch || summary.strategyMismatch ? (
            <Alert className="border-warning/60 bg-warning/10 text-warning-foreground">
              <AlertTitle>
                Orders must share the same pair and strategy
              </AlertTitle>
              <AlertDescription className="text-sm">
                Select smart orders that trade the same pair with the same
                strategy before merging.
              </AlertDescription>
            </Alert>
          ) : null}

          {selectedDeals.length > 0 && selectedDeals.length < 2 ? (
            <Alert className="border-border/60 bg-muted/20">
              <AlertDescription className="text-sm">
                Select at least two smart orders to enable merging.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-sm sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Merging…' : 'Merge selected orders'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SmartOrderMergeDialog;
