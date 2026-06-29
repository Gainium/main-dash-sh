import { useMemo, useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useDcaBots } from '@/hooks/useDcaBots';
import { useMoveDealToBot } from '@/hooks/useDealActions';
import { isBotActive } from '@/utils/botStatusUtils';
import { BotTypesEnum, DCATypeEnum } from '@/types';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';

/** Minimal description of the terminal deal being moved. */
export interface MoveDealToBotTarget {
  dealId: string;
  /** The terminal bot currently hosting the deal. */
  sourceBotId: string;
  /** Trading pair symbol, e.g. `BTCUSDT`. */
  symbol: string;
  exchange: string;
  exchangeUUID?: string | undefined;
  /** `LONG` / `SHORT`. */
  strategy: string;
}

interface MoveDealToBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: MoveDealToBotTarget | null;
}

/** Strip separators / casing so `BTC/USDT` and `BTCUSDT` compare equal. */
const normalizeSymbol = (s: string): string =>
  s.replace(/[^a-z0-9]/gi, '').toUpperCase();

/**
 * Pick an existing DCA bot to move a terminal deal into. Only bots that can
 * legitimately adopt the position are listed: same exchange + account, same
 * strategy direction, and trading the deal's pair. Market type (spot / futures
 * / coin-m) rides along with the exchange, so an exchange match covers it.
 */
export function MoveDealToBotDialog({
  open,
  onOpenChange,
  deal,
}: MoveDealToBotDialogProps) {
  const [selectedBotId, setSelectedBotId] = useState<string>('');
  const moveDealToBot = useMoveDealToBot();
  const { bots, isLoading } = useDcaBots();

  // Reset the selection whenever a different deal is opened.
  useEffect(() => {
    setSelectedBotId('');
  }, [deal?.dealId]);

  const compatibleBots = useMemo(() => {
    if (!deal) return [];
    const wantSymbol = normalizeSymbol(deal.symbol);
    const wantStrategy = deal.strategy.toUpperCase();
    return bots.filter((bot) => {
      if (bot._id === deal.sourceBotId) return false;
      if (bot.type === BotTypesEnum.terminal) return false;
      if (bot.settings?.type === DCATypeEnum.terminal) return false;
      if (!isBotActive(bot.status)) return false;
      if (String(bot.exchange) !== String(deal.exchange)) return false;
      if (deal.exchangeUUID && bot.exchangeUUID !== deal.exchangeUUID) {
        return false;
      }
      if (String(bot.settings?.strategy).toUpperCase() !== wantStrategy) {
        return false;
      }
      const pairs = bot.settings?.pair ?? [];
      return pairs.some((p) => normalizeSymbol(p) === wantSymbol);
    });
  }, [bots, deal]);

  const handleConfirm = async () => {
    if (!deal || !selectedBotId) return;
    try {
      const response = await moveDealToBot.mutateAsync({
        dealId: deal.dealId,
        targetBotId: selectedBotId,
        sourceBotId: deal.sourceBotId,
      });
      toast.success(
        typeof response.data === 'string'
          ? response.data
          : 'Deal moved to bot successfully'
      );
      onOpenChange(false);
    } catch (error) {
      logger.error('[MoveDealToBotDialog] Failed to move deal to bot', {
        dealId: deal.dealId,
        targetBotId: selectedBotId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(
        error instanceof Error ? error.message : 'Failed to move deal to bot'
      );
    }
  };

  const hasCandidates = compatibleBots.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move deal to bot</DialogTitle>
          <DialogDescription>
            {deal ? (
              <>
                Move the {deal.symbol} terminal deal into one of your existing{' '}
                {deal.strategy.toUpperCase() === 'SHORT' ? 'short' : 'long'} DCA
                bots on the same exchange and account. The position is adopted
                into the bot and starts following that bot&apos;s take-profit,
                stop-loss and safety-order settings. The terminal entry is then
                removed.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading bots…</p>
        ) : hasCandidates ? (
          <Select value={selectedBotId} onValueChange={setSelectedBotId}>
            <SelectTrigger aria-label="Target bot">
              <SelectValue placeholder="Select a bot" />
            </SelectTrigger>
            <SelectContent>
              {compatibleBots.map((bot) => (
                <SelectItem key={bot._id} value={bot._id}>
                  {bot.settings?.name || bot._id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            No compatible bot found. You need a running DCA bot on the same
            exchange and account, with the same direction, that already trades{' '}
            {deal?.symbol}.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !hasCandidates || !selectedBotId || moveDealToBot.isPending
            }
          >
            {moveDealToBot.isPending ? 'Moving…' : 'Move to bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MoveDealToBotDialog;
