import { describe, test, expect } from 'vitest';
import { resolveChartSymbol } from '@/features/bots/widgets/BotForm/chartSymbol';

// Spec: specs/084.edit-chart-btc-when-pair-list-unresolved.md
//
// The bot form decides which symbol to hand the chart. On an edit page the
// saved pair is known before the exchange's pair list has resolved it; sending
// no symbol in that window makes the chart fall back to BTCUSDT.

const eth = { pair: 'ETHUSDT', exchange: 'paperBinanceUsdm' };
const kucoinBtc = { pair: 'BTC-USDT', exchange: 'kucoin' };

describe('resolveChartSymbol', () => {
  test('§1.1 edit mode sends the saved pair while the pair list has not resolved it', () => {
    expect(
      resolveChartSymbol({
        mode: 'edit',
        primaryPair: 'ETHUSDT',
        selectedPair: undefined,
        chartPair: undefined,
        provider: 'paperBinanceUsdm',
      }),
    ).toBe('ETHUSDT');
  });

  test('§1.2 a resolved pair sends the exchange-native symbol', () => {
    expect(
      resolveChartSymbol({
        mode: 'edit',
        primaryPair: 'BTCUSDT',
        selectedPair: kucoinBtc,
        chartPair: kucoinBtc,
        provider: 'kucoin',
      }),
    ).toBe('BTC-USDT');
    expect(
      resolveChartSymbol({
        mode: 'edit',
        primaryPair: 'ETHUSDT',
        selectedPair: eth,
        chartPair: eth,
        provider: 'paperBinanceUsdm',
      }),
    ).toBe('ETHUSDT');
  });

  test('§1.3 create mode sends nothing for an unresolved selected pair', () => {
    expect(
      resolveChartSymbol({
        mode: 'create',
        primaryPair: 'BTCUSDT',
        selectedPair: undefined,
        chartPair: undefined,
        provider: 'krakenUsdm',
      }),
    ).toBeUndefined();
  });

  test('§1.3 create mode with no pair sends the exchange default pair', () => {
    expect(
      resolveChartSymbol({
        mode: 'create',
        primaryPair: undefined,
        selectedPair: undefined,
        chartPair: { pair: 'BTC-USDC', exchange: 'okx' },
        provider: 'okx',
      }),
    ).toBe('BTC-USDC');
  });

  test('§1.4 a resolved pair on another exchange is not sent', () => {
    expect(
      resolveChartSymbol({
        mode: 'edit',
        primaryPair: 'BTCUSDT',
        selectedPair: kucoinBtc,
        chartPair: kucoinBtc,
        provider: 'binance',
      }),
    ).toBeUndefined();
  });
});
