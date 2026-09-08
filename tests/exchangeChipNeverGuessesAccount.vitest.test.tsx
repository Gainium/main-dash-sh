/**
 * Runner note: renders a component in jsdom and mocks a module, so this is a
 * Vitest file, not one of core's Playwright `.unit.test.ts` pure-function
 * tests. Run from the parent:
 * `npx vitest run core/tests/exchangeChipNeverGuessesAccount.vitest.test.tsx`.
 */

/**
 * The Trades list labelled Terminal and Grid rows with the WRONG exchange
 * account — consistently, and with a real account name rather than a blank.
 *
 * Two defects compounded:
 *
 *  1. `pages/Trading.tsx` builds a row per deal type. The DCA, Combo, Hedge
 *     Combo and Hedge DCA blocks all copied `exchangeUUID` onto the row; the
 *     Terminal and Grid blocks set only `exchange` (the provider). So those
 *     rows reached the chip carrying "binance" where an account UUID belonged.
 *
 *  2. `ExchangeChip` answered a provider by *guessing*: after the UUID lookup
 *     missed it ran `find(ex => ex.provider === exchangeId)`, which returns
 *     whichever account sits first in the user's list. For a user with several
 *     accounts on one venue that is a coin flip rendered as fact — the chip
 *     named a real, specific, wrong account, with nothing to signal a guess.
 *     A user re-created the same position repeatedly trying to shake it off,
 *     because every attempt was mislabelled identically.
 *
 * The guess is gone. A provider is not an account: when only the venue is
 * known the chip now names only the venue. These tests pin both halves — that
 * a UUID still resolves to its account, and that a bare provider resolves to
 * NO account name, even when the user holds exactly one account on that venue
 * (where guessing would happen to be right, and would quietly creep back in).
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// `vi.mock` below is hoisted above this import by Vitest, so the component
// picks up the mocked context.
import { ExchangeChip } from '@/components/ui/chip/ExchangeChip';

const ACCOUNT_FIRST = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_SECOND = '22222222-2222-4222-8222-222222222222';

type TransformedExchange = { id: string; name: string; provider: string };

const FIRST_ACCOUNT: TransformedExchange = {
  id: ACCOUNT_FIRST,
  name: 'First Added Account',
  provider: 'binance',
};
const SECOND_ACCOUNT: TransformedExchange = {
  id: ACCOUNT_SECOND,
  name: 'Second Added Account',
  provider: 'binance',
};

/** Two accounts on ONE venue — the case the old fallback got wrong. */
const TWO_BINANCE: TransformedExchange[] = [FIRST_ACCOUNT, SECOND_ACCOUNT];

let mockExchanges: TransformedExchange[] = TWO_BINANCE;

vi.mock('@/contexts/ExchangeDataContext', () => ({
  useTransformedExchangesFromContext: () => ({
    exchanges: mockExchanges,
    isLoading: false,
  }),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderChip(exchangeId: string): string {
  const mount = document.createElement('div');
  document.body.appendChild(mount);
  const mountedRoot = createRoot(mount);
  container = mount;
  root = mountedRoot;
  act(() => {
    mountedRoot.render(createElement(ExchangeChip, { exchangeId }));
  });
  return mount.textContent ?? '';
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  mockExchanges = TWO_BINANCE;
});

describe('ExchangeChip never guesses which account it is looking at', () => {
  it('resolves an account UUID to that account, not the first one', () => {
    const text = renderChip(ACCOUNT_SECOND);
    expect(text).toContain('Second Added Account');
    expect(text).not.toContain('First Added Account');
  });

  it('names NO account when given a bare provider', () => {
    const text = renderChip('binance');
    // The old fallback rendered whichever account came first.
    expect(text).not.toContain('First Added Account');
    expect(text).not.toContain('Second Added Account');
    // The venue itself is still honest information, and is still shown.
    expect(text.toLowerCase()).toContain('binance');
  });

  it('still names no account for a provider when the user has only one', () => {
    // Guessing would be *correct* here, which is exactly why it is tempting.
    // It must stay absent so the behaviour cannot regress into a coin flip
    // the moment the user adds a second account on the venue.
    mockExchanges = [FIRST_ACCOUNT];
    const text = renderChip('binance');
    expect(text).not.toContain('First Added Account');
    expect(text.toLowerCase()).toContain('binance');
  });
});
