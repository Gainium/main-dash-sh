// Keeps "Add to journal" from creating a second entry for a deal that is
// already in the trade journal (bulk-adding a bot's closed deals twice used to
// duplicate every one of them).

interface JournalTradeLike {
  sourceDealId?: string;
  symbol?: string;
  exchange?: string;
  entryTime?: number;
  notes?: string;
}

export interface JournalDealKey {
  dealId?: string;
  symbol: string;
  exchange?: string;
  entryTime: number;
}

// Entries created from a deal before sourceDealId existed carry only these
// auto-generated notes; match them on symbol + exchange + deal open time.
const DEAL_NOTE_PREFIXES = ['Deal from ', 'Terminal trade from '];

const isLegacyDealEntry = ({ sourceDealId, notes }: JournalTradeLike) =>
  !sourceDealId &&
  !!notes &&
  DEAL_NOTE_PREFIXES.some((prefix) => notes.startsWith(prefix));

export const isDealInJournal = (
  trades: readonly JournalTradeLike[],
  deal: JournalDealKey
): boolean =>
  trades.some((trade) => {
    if (deal.dealId && trade.sourceDealId) {
      return trade.sourceDealId === deal.dealId;
    }
    return (
      isLegacyDealEntry(trade) &&
      trade.symbol === deal.symbol &&
      trade.exchange === deal.exchange &&
      trade.entryTime === deal.entryTime
    );
  });
