import { describe, expect, it } from 'vitest';

import { buildDealBulkActions } from '@/features/deals/actions/dealActionRegistry';
import { dealRefFromTrade } from '@/features/deals/actions/dealRef';
import type { TransformedTrade } from '@/types/dcaDeal';

/**
 * Merge Deals is offered for non-combo deals on one pair and exchange, across
 * bots too — terminal deals each have their own bot. A combo position lives in
 * its minigrids and cannot be merged; the backend refuses it.
 */
type Row = TransformedTrade;

let nextId = 0;
const row = (over: Partial<Row> = {}): Row => ({
  id: `deal-${(nextId += 1)}`,
  symbol: 'BTCUSDT',
  exchange: 'binance',
  botId: 'bot-1',
  type: 'DCA',
  status: 'open',
  strategy: 'LONG',
  active: true,
  currentBalance: { base: 0, quote: 0 },
  usage: { current: { base: 0, quote: 0 } },
  levels: { complete: 1, all: 1 },
  ...over,
});

const mergeShown = (rows: Row[]) => {
  const merge = buildDealBulkActions<Row>({
    toDeal: dealRefFromTrade,
    run: () => undefined,
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
    expect(
      mergeShown([
        row({ type: 'Combo', hedge: true }),
        row({ type: 'Combo', hedge: true }),
      ])
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
