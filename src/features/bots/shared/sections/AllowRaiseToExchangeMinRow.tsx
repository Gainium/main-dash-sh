import { Switch } from '@/components/ui/switch';
import SettingsRow from '@/components/widgets/shared/SettingsRow';
import {
  useBotFormSelector,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';

/**
 * The exchange-minimum switch. One component for every form whose bot runs on
 * the DCA engine: DCA, combo, both sides of a hedge bot, and terminal deals.
 */
export const AllowRaiseToExchangeMinRow = ({
  updateFormData,
}: {
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
}) => {
  const allowRaiseToExchangeMin = useBotFormSelector('allowRaiseToExchangeMin');
  return (
    <SettingsRow
      name="Allow increasing orders to exchange minimum"
      tooltip="If a Base or Safety Order is smaller than the exchange's minimum order size for a pair, the bot won't open a deal on that pair and will notify you, so your configured sizes are never exceeded. Turn this on to let the bot increase those orders to the exchange minimum instead. Increases of up to 10% (rounding) are always allowed."
      trailing={
        <Switch
          id="allow-raise-to-exchange-min"
          checked={!!allowRaiseToExchangeMin}
          onCheckedChange={(checked) =>
            updateFormData('allowRaiseToExchangeMin', checked)
          }
        />
      }
    />
  );
};
