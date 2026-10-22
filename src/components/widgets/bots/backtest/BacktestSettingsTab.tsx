import ReadOnlyBotForm from '@/features/bots/widgets/BotForm/ReadOnlyBotForm';
import { BotTypesEnum, type ComboBot, type DCABot } from '@/types';
import type { GridBot } from '@/types/gridBot';

export interface BacktestSettingsTabProps {
  /** The backtest's own `settings`, `exchange` and `exchangeUUID` seed the form. */
  backtest: {
    settings?: unknown;
    exchange?: unknown;
    exchangeUUID?: string;
  };
  kind: 'dca' | 'combo' | 'grid';
}

const BOT_TYPE_BY_KIND = {
  dca: BotTypesEnum.dca,
  combo: BotTypesEnum.combo,
  grid: BotTypesEnum.grid,
} as const;

/**
 * Read-only bot settings a backtest ran with — the same form the bot drawer's
 * Settings tab shows, so two shared backtests can be compared field by field.
 */
export function BacktestSettingsTab({ backtest, kind }: BacktestSettingsTabProps) {
  if (!backtest.settings) return null;
  return (
    <ReadOnlyBotForm
      bot={backtest as unknown as DCABot | ComboBot | GridBot}
      botType={BOT_TYPE_BY_KIND[kind]}
    />
  );
}
