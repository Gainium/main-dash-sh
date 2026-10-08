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
import { useLargeAccount } from '@/hooks/useLargeAccount';
import { useServerPagedBots } from '@/hooks/useServerPagedBots';
import { CANONICAL_DCA_STATUSES } from '@/lib/botList/botListWindow';
import { useMoveDealToBot } from '@/hooks/useDealActions';
import { isBotActive } from '@/utils/botStatusUtils';
import { BotTypesEnum, DCATypeEnum, type DCABot } from '@/types';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/loggerInstance';
import { AdoptionPreviewRows } from '@/components/deals/SinglePositionAdoptionDialog';
import {
  useInvalidateSinglePosition,
  useSinglePositionClient,
  useSinglePositionTargets,
} from '@/hooks/useSinglePosition';
import {
  ADOPTION_IRREVERSIBLE_SENTENCE,
  mergesIntoPositionLabel,
  planMoveIntoBot,
  previewAdoption,
  type AdoptionPreviewRow,
} from '@/lib/singlePosition/singlePosition';
import {
  fetchBotOpenDeals,
  fetchRestingTpPrice,
} from '@/lib/singlePosition/singlePositionApi';

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
  /** Single position per pair: the before/after shown before adopting. */
  const [preview, setPreview] = useState<{
    row: AdoptionPreviewRow;
    targetDealId: string;
    baseAsset?: string | undefined;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { make } = useSinglePositionClient();
  const invalidateSinglePosition = useInvalidateSinglePosition();
  const moveDealToBot = useMoveDealToBot();
  const canonical = useDcaBots();
  // A capped bot list (or a large account) can't be filtered client-side:
  // ask the server for the compatible bots directly, so a deal can move to
  // any bot, not just one of the first loaded window.
  const largeAccount = useLargeAccount();
  const serverLookup = (largeAccount.active || canonical.isPartial) && !!deal;
  const serverFilters = useMemo(
    () =>
      deal
        ? [
            ...(deal.exchangeUUID
              ? [{ field: 'exchangeUUID', operator: 'equals', value: deal.exchangeUUID }]
              : []),
            {
              field: 'settings.strategy',
              operator: 'equals',
              value: deal.strategy.toUpperCase(),
            },
            {
              field: 'status',
              operator: 'isAnyOf',
              value: 'open,range,monitoring,error',
            },
          ]
        : [],
    [deal]
  );
  const serverBots = useServerPagedBots<DCABot>({
    type: 'dca',
    statuses: CANONICAL_DCA_STATUSES,
    enabled: open && serverLookup,
    pageIndex: 0,
    pageSize: 100,
    filters: serverFilters,
  });
  const bots = useMemo(() => {
    if (!serverLookup) return canonical.bots;
    const seen = new Set(canonical.bots.map((b) => b._id));
    return [...canonical.bots, ...serverBots.bots.filter((b) => !seen.has(b._id))];
  }, [serverLookup, canonical.bots, serverBots.bots]);
  const isLoading = canonical.isLoading || (serverLookup && serverBots.isLoading);

  // Reset the selection whenever a different deal is opened.
  useEffect(() => {
    setSelectedBotId('');
    setPreview(null);
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

  // Single-position bots that already hold this pair adopt the deal into
  // that position instead of opening a new deal (spec 139 §5.2).
  const compatibleBotIds = useMemo(
    () => compatibleBots.map((b) => b._id),
    [compatibleBots]
  );
  const { settingsByBot, positionByBot } = useSinglePositionTargets(
    compatibleBotIds,
    deal?.symbol,
    open
  );
  const selectedPlan = selectedBotId
    ? planMoveIntoBot(selectedBotId, settingsByBot, positionByBot)
    : ({ mode: 'merge' } as const);

  /** Adopting: show the before/after first. */
  const openPreview = async (targetDealId: string) => {
    if (!deal) return;
    const bot = compatibleBots.find((b) => b._id === selectedBotId);
    const position = positionByBot[selectedBotId];
    if (!bot || !position) return;
    setPreviewLoading(true);
    try {
      const terminalDeals = await fetchBotOpenDeals(make(), deal.sourceBotId, {
        terminal: true,
      });
      const incoming = terminalDeals.find((d) => d._id === deal.dealId);
      const restingTpPrice = await fetchRestingTpPrice(
        make(),
        selectedBotId,
        position._id,
        position.strategy ?? bot.settings?.strategy ?? deal.strategy
      );
      const target = { ...position, restingTpPrice };
      const row = previewAdoption(target, incoming ? [incoming] : [], {
        strategy: bot.settings?.strategy ?? deal.strategy,
        tpPerc: bot.settings?.tpPerc,
        useTp: bot.settings?.useTp,
      });
      // The incoming deal always counts, even when its figures did not load.
      setPreview({
        row: {
          ...row,
          kind: 'adopt',
          dealCount: 2,
          sourceDealIds: [deal.dealId],
        },
        targetDealId,
        baseAsset: position.baseAsset,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load the position'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!deal || !selectedBotId) return;
    if (selectedPlan.mode === 'adopt' && !preview) {
      await openPreview(selectedPlan.targetDealId);
      return;
    }
    try {
      const response = await moveDealToBot.mutateAsync({
        dealId: deal.dealId,
        targetBotId: selectedBotId,
        sourceBotId: deal.sourceBotId,
        ...(preview ? { targetDealId: preview.targetDealId } : {}),
      });
      if (preview) invalidateSinglePosition();
      setPreview(null);
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

        {preview ? (
          <div className="space-y-md">
            <p className="text-sm text-muted-foreground">
              {mergesIntoPositionLabel(deal?.symbol ?? '')} in{' '}
              {compatibleBots.find((b) => b._id === selectedBotId)?.settings
                ?.name ?? 'the bot'}
            </p>
            <AdoptionPreviewRows
              rows={[preview.row]}
              baseAssetOf={() => preview.baseAsset}
            />
            <p className="text-sm text-destructive">
              {ADOPTION_IRREVERSIBLE_SENTENCE}
            </p>
          </div>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading bots…</p>
        ) : hasCandidates ? (
          <Select value={selectedBotId} onValueChange={setSelectedBotId}>
            <SelectTrigger aria-label="Target bot">
              <SelectValue placeholder="Select a bot" />
            </SelectTrigger>
            <SelectContent>
              {compatibleBots.map((bot) => {
                const merges =
                  planMoveIntoBot(bot._id, settingsByBot, positionByBot)
                    .mode === 'adopt';
                return (
                  <SelectItem key={bot._id} value={bot._id}>
                    {bot.settings?.name || bot._id}
                    {merges && deal ? (
                      <span className="ml-xs text-xs text-muted-foreground">
                        — {mergesIntoPositionLabel(deal.symbol)}
                      </span>
                    ) : null}
                  </SelectItem>
                );
              })}
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
          <Button
            variant="outline"
            onClick={() =>
              preview ? setPreview(null) : onOpenChange(false)
            }
          >
            {preview ? 'Back' : 'Cancel'}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !hasCandidates ||
              !selectedBotId ||
              moveDealToBot.isPending ||
              previewLoading
            }
          >
            {moveDealToBot.isPending
              ? 'Moving…'
              : previewLoading
                ? 'Loading…'
                : preview
                  ? 'Confirm merge'
                  : 'Move to bot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MoveDealToBotDialog;
