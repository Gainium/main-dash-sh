import { TerminalButtonStack } from '@/components/ui/terminal-button-stack';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { toBaseFundingMode } from '@/lib/baseFunding/baseFundingApi';
import { BaseFundingEnum } from '@/types';
import { useBaseFundingState } from './useBaseFundingState';

const OPTIONS = [
  { value: BaseFundingEnum.require, label: 'Require' },
  { value: BaseFundingEnum.auto, label: 'Auto' },
  { value: BaseFundingEnum.botOnly, label: 'Bot only' },
];

const TOOLTIP =
  'What a deal does when your free base coin does not cover it. Require: the deal is skipped. Auto: the bot uses your free base coin for the Safety Orders and buys only what is missing, at market, when the deal opens. Bot only: the bot never uses your own base coin and buys everything the Safety Orders need. In both cases the Base Order is recorded at the current price without a trade, and the quote it represents stays reserved until the deal closes, because the take profit spends it to buy the coin back. Market Base Orders sized in base, quote or USD only.';

/**
 * Base funding for short spot DCA / combo bots (main-app spec 044). Shown only
 * where the engine applies it and only once the backend is known to have it.
 */
export const BaseFundingRow = ({
  updateFormData,
}: {
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
}) => {
  const { applies, mode } = useBaseFundingState();
  if (!applies) return null;
  return (
    <SettingsRow name="Base funding" tooltip={TOOLTIP}>
      <TerminalButtonStack
        value={mode}
        onValueChange={(value) =>
          updateFormData('baseFunding', toBaseFundingMode(value))
        }
        options={OPTIONS}
        className="w-full"
      />
    </SettingsRow>
  );
};
