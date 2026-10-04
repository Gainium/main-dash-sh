import type { BotFormMode } from '@/contexts/bots/form/BotFormProvider';

interface ChartPairLike {
  pair?: string;
  exchange?: string;
}

interface ResolveChartSymbolInput {
  mode: BotFormMode;
  /** The pair the chart should follow (clicked chip, else the first pair). */
  primaryPair: string | undefined;
  /** `primaryPair` resolved through the form's pair metadata, if found. */
  selectedPair: ChartPairLike | undefined;
  /** `selectedPair`, or the exchange's default pair when none is selected. */
  chartPair: ChartPairLike | undefined;
  /** The form's current exchange provider. */
  provider: string | undefined;
}

/**
 * The symbol the bot form hands the chart, or `undefined` to send none.
 *
 * A pair resolved from the current exchange's pair list wins (it carries the
 * exchange-native symbol). In edit mode the saved pair is sent even when the
 * pair list has not resolved it — still loading, failed, or briefly wiped by
 * the settings re-map — because sending nothing makes the chart fall back to
 * BTCUSDT on the bot's exchange. The candle request maps the saved pair to the
 * exchange's native form.
 */
export const resolveChartSymbol = ({
  mode,
  primaryPair,
  selectedPair,
  chartPair,
  provider,
}: ResolveChartSymbolInput): string | undefined => {
  if (chartPair?.exchange === provider && typeof chartPair?.pair === 'string') {
    return chartPair.pair;
  }
  if (mode === 'edit' && primaryPair && !selectedPair) {
    return primaryPair;
  }
  return undefined;
};
