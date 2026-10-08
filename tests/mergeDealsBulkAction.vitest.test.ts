import { describe, expect, it } from 'vitest';

import { createSharedDealBulkActions } from '@/components/deals/actions/createSharedDealBulkActions';

/**
 * Merge Deals is offered for non-combo deals on one pair and exchange, across
 * bots too — terminal deals each have their own bot. A combo position lives in
 * its minigrids and cannot be merged; the backend refuses it.
 */
type Row = {
  symbol: string;
  exchange: string;
  botId?: string;
  type: string;
};

const row = (over: Partial<Row> = {}): Row => ({
  symbol: 'BTCUSDT',
  exchange: 'binance',
  botId: 'bot-1',
  type: 'DCA',
  ...over,
});

const noop = () => undefined;

const mergeShown = (rows: Row[]) => {
  const merge = createSharedDealBulkActions<Row>({
    onMerge: noop,
    onAddToJournal: noop,
    onAddFunds: noop,
    onReduceFunds: noop,
    onEdit: noop,
    onMoveToTerminal: noop,
    onCancel: noop,
    onClose: noop,
    canMoveToTerminal: () => false,
    canMerge: (r) => r.type !== 'Combo' && r.type !== 'Hedge Combo',
    getSymbol: (r) => r.symbol,
  }).find((a) => a.id === 'merge');
  return merge?.shouldShow?.(rows) ?? true;
};

describe('Merge Deals bulk action', () => {
  it('is offered for two DCA deals of one bot on one pair', () => {
    expect(mergeShown([row(), row()])).toBe(true);
  });

  it('is not offered for combo or hedge-combo deals', () => {
    expect(mergeShown([row({ type: 'Combo' }), row({ type: 'Combo' })])).toBe(
      false
    );
    expect(
      mergeShown([row({ type: 'Hedge Combo' }), row({ type: 'Hedge Combo' })])
    ).toBe(false);
  });

  it('is offered across bots, e.g. two terminal deals', () => {
    expect(
      mergeShown([
        row({ type: 'Terminal', botId: 'term-1' }),
        row({ type: 'Terminal', botId: 'term-2' }),
      ])
    ).toBe(true);
  });

  it('still requires one pair and one exchange, and two deals', () => {
    expect(mergeShown([row(), row({ symbol: 'ETHUSDT' })])).toBe(false);
    expect(mergeShown([row(), row({ exchange: 'bybit' })])).toBe(false);
    expect(mergeShown([row()])).toBe(false);
  });
});
