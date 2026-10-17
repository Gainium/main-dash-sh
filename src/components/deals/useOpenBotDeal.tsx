// "Open new deal" for one bot: the max-active-deals check, the pair picker a
// multi-pair bot needs, and the open mutation, with their dialogs. Shared by
// the bot drawer's deal list and the bot edit page's Deals tab.
import { Check, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useOpenDeal } from '@/hooks/useOpenDeal';
import { logger } from '@/lib/loggerInstance';
import { toast } from '@/lib/toast';
import { BotTypesEnum, type DCABot } from '@/types';

const LOG_PREFIX = 'useOpenBotDeal';

export interface UseOpenBotDealOptions {
  botId: string | undefined;
  /** The bot's settings/symbols; read for multi-pair and max-deals. */
  bot: Pick<DCABot, 'settings' | 'symbol'> | undefined;
  isComboBot: boolean;
  activeDealsCount: number;
}

export interface UseOpenBotDealResult {
  openNewDeal: () => void;
  isPending: boolean;
  /** Pair picker + max-deals dialogs; mount once next to the button. */
  dialogs: ReactNode;
}

export function useOpenBotDeal({
  botId,
  bot,
  isComboBot,
  activeDealsCount,
}: UseOpenBotDealOptions): UseOpenBotDealResult {
  const { openDeal, isPending: isOpenDealPending } = useOpenDeal(
    isComboBot ? BotTypesEnum.combo : BotTypesEnum.dca
  );

  // State for pair selection dialog (for multi-coin bots)
  const [pairSelectDialogOpen, setPairSelectDialogOpen] = useState(false);
  const [selectedPairForDeal, setSelectedPairForDeal] = useState<string | null>(
    null
  );
  const [pairSearchQuery, setPairSearchQuery] = useState('');

  // State for max active deals validation dialog
  const [maxActiveDialog, setMaxActiveDialog] = useState<
    'bot' | 'symbol' | null
  >(null);

  // Determine if bot is multi-coin and get available pairs
  const isMultiCoin = bot?.settings?.useMulti === true;

  const availablePairs = useMemo(() => {
    // Get pairs from bot settings or symbol array
    const settingsPairs = bot?.settings?.pair;
    if (
      settingsPairs &&
      Array.isArray(settingsPairs) &&
      settingsPairs.length > 0
    ) {
      return settingsPairs;
    }
    // Fallback to symbol array
    const symbolPairs = bot?.symbol?.map((s) => s.value?.symbol || s.key);
    return symbolPairs || [];
  }, [bot]);

  // Filter pairs based on search query
  const filteredPairs = useMemo(() => {
    if (!pairSearchQuery.trim()) {
      return availablePairs;
    }
    const query = pairSearchQuery.toLowerCase();
    return availablePairs.filter((pair) => pair.toLowerCase().includes(query));
  }, [availablePairs, pairSearchQuery]);

  // Initialize selected pair when dialog opens and reset search
  useEffect(() => {
    if (pairSelectDialogOpen) {
      setPairSearchQuery('');
      if (availablePairs.length > 0 && !selectedPairForDeal) {
        setSelectedPairForDeal(availablePairs[0]);
      }
    }
  }, [pairSelectDialogOpen, availablePairs, selectedPairForDeal]);

  // Shows the pair picker for multi-coin bots
  const openNewDeal = useCallback(() => {
    if (!botId) {
      logger.error(`${LOG_PREFIX}: Cannot open deal - missing botId`);
      toast.error('Cannot open deal - missing bot ID');
      return;
    }

    const maxNumberOfOpenDeals = bot?.settings?.maxNumberOfOpenDeals;
    const maxReached =
      !!maxNumberOfOpenDeals &&
      maxNumberOfOpenDeals !== '' &&
      maxNumberOfOpenDeals !== '0' &&
      activeDealsCount >= parseFloat(maxNumberOfOpenDeals);

    if (maxReached) {
      logger.info(`${LOG_PREFIX}: Max active deals reached for bot`, {
        botId,
        activeDealsCount,
        maxNumberOfOpenDeals,
      });
      setMaxActiveDialog('bot');
      return;
    }

    if (isMultiCoin && availablePairs.length > 1) {
      logger.info(
        `${LOG_PREFIX}: Multi-coin bot - opening pair selection dialog`,
        { botId, availablePairs }
      );
      setPairSelectDialogOpen(true);
      return;
    }

    // For single-pair bots, open deal directly
    logger.info(`${LOG_PREFIX}: Opening new deal`, { botId, isComboBot });
    openDeal({ botId });
  }, [
    botId,
    bot,
    isComboBot,
    isMultiCoin,
    availablePairs,
    activeDealsCount,
    openDeal,
  ]);

  // Opens the deal for the pair picked in the dialog
  const handleConfirmOpenDeal = useCallback(() => {
    if (!botId) {
      toast.error('Cannot open deal - missing bot ID');
      return;
    }

    logger.info(`${LOG_PREFIX}: Opening deal for selected pair`, {
      botId,
      selectedPair: selectedPairForDeal,
      isComboBot,
    });

    openDeal({ botId, symbol: selectedPairForDeal || undefined });
    setPairSelectDialogOpen(false);
    setSelectedPairForDeal(null);
  }, [botId, selectedPairForDeal, isComboBot, openDeal]);

  const dialogs = (
    <>
      {/* Pair Selection Dialog for Multi-Coin Bots */}
      <Dialog
        open={pairSelectDialogOpen}
        onOpenChange={setPairSelectDialogOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Trading Pair</DialogTitle>
            <DialogDescription>
              Choose which trading pair to open a new deal for.
              {availablePairs.length > 10 && (
                <span className="text-xs ml-1">
                  ({availablePairs.length} pairs available)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {/* Search Input */}
            <div className="mb-3">
              <Input
                placeholder="Search pairs..."
                value={pairSearchQuery}
                onChange={(e) => setPairSearchQuery(e.target.value)}
                startAdornment={
                  <Search className="w-4 h-4 text-muted-foreground" />
                }
                className="w-full"
              />
            </div>
            {/* Pair List */}
            <div className="max-h-64 overflow-y-auto border rounded-md">
              {filteredPairs.length > 0 ? (
                filteredPairs.map((pair) => (
                  <div
                    key={pair}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent transition-colors ${
                      selectedPairForDeal === pair ? 'bg-accent' : ''
                    }`}
                    onClick={() => setSelectedPairForDeal(pair)}
                  >
                    <span className="font-medium text-sm">{pair}</span>
                    {selectedPairForDeal === pair && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-center text-muted-foreground text-sm">
                  No pairs found matching "{pairSearchQuery}"
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPairSelectDialogOpen(false);
                setSelectedPairForDeal(null);
                setPairSearchQuery('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmOpenDeal}
              disabled={!selectedPairForDeal || isOpenDealPending}
            >
              {isOpenDealPending ? 'Opening...' : 'Open Deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Max Active Deals Reached Dialog */}
      <Dialog
        open={!!maxActiveDialog}
        onOpenChange={() => setMaxActiveDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Information</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Maximum active deals reached for this {maxActiveDialog}. You can
              update settings to open more deals.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMaxActiveDialog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { openNewDeal, isPending: isOpenDealPending, dialogs };
}
