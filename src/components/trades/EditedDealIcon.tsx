import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SlidersHorizontal } from 'lucide-react';
import React from 'react';

/**
 * Readable names for deal settings, for the "edited" tooltip. Anything not
 * listed falls back to its key split into words.
 */
const SETTING_LABELS: Record<string, string> = {
  tpPerc: 'Take profit',
  useTp: 'Take profit on/off',
  dealCloseCondition: 'Take profit type',
  // Legacy mirrors of the execution blocks: same setting to a person.
  closeOrderType: 'Take profit execution',
  closeDealType: 'Take profit execution',
  comboTpLimit: 'Take profit execution',
  comboSlLimit: 'Stop loss execution',
  tpExecution: 'Take profit execution',
  useMultiTp: 'Multiple take profits',
  multiTp: 'Take profit targets',
  trailingTp: 'Trailing take profit',
  trailingTpPerc: 'Trailing take profit deviation',
  useMinTP: 'Minimum take profit',
  minTp: 'Minimum take profit',
  fixedTpPrice: 'Take profit price',
  slPerc: 'Stop loss',
  useSl: 'Stop loss on/off',
  dealCloseConditionSL: 'Stop loss type',
  slExecution: 'Stop loss execution',
  useMultiSl: 'Multiple stop losses',
  multiSl: 'Stop loss targets',
  trailingSl: 'Trailing stop loss',
  moveSL: 'Move stop loss',
  moveSLTrigger: 'Move stop loss trigger',
  moveSLValue: 'Move stop loss value',
  moveSLForAll: 'Move stop loss for all',
  fixedSlPrice: 'Stop loss price',
  useDca: 'DCA on/off',
  ordersCount: 'DCA orders',
  activeOrdersCount: 'Active DCA orders',
  orderSize: 'DCA order size',
  step: 'Order step',
  stepScale: 'Step scale',
  volumeScale: 'Volume scale',
  minimumDeviation: 'Minimum deviation',
  useSmartOrders: 'Smart orders',
  dcaByMarket: 'DCA by market',
  dcaExecution: 'DCA order execution',
  dcaCondition: 'DCA type',
  dcaIndicatorLevels: 'DCA levels',
  dcaCustom: 'Custom DCA levels',
  dcaLevelsCap: 'DCA levels',
  baseOrderSize: 'Base order size',
  baseOrderPrice: 'Base order price',
  startOrderType: 'Base order type',
  orderSizeType: 'Order size type',
  profitCurrency: 'Profit currency',
  leverage: 'Leverage',
  marginType: 'Margin type',
  closeByTimer: 'Close by timer',
  closeByTimerValue: 'Close by timer',
  closeByTimerUnits: 'Close by timer',
  gridLevel: 'Grid levels',
};

const humanize = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

const editedSettingLabels = (keys: string[]): string[] => [
  ...new Set(keys.map((k) => SETTING_LABELS[k] ?? humanize(k))),
];

interface EditedDealIconProps {
  /** Deal settings an edit left different from the bot's (spec 250). */
  keys?: string[] | null;
  className?: string;
}

/**
 * Marks a deal whose settings were edited by hand and now differ from its
 * bot's. Renders nothing otherwise. The tooltip names what differs.
 */
export const EditedDealIcon: React.FC<EditedDealIconProps> = ({
  keys,
  className,
}) => {
  if (!keys || keys.length === 0) {
    return null;
  }
  const labels = editedSettingLabels(keys);
  return (
    <Tooltip
      tooltip={`Edited — differs from the bot: ${labels.join(', ')}`}
    >
      {/* A status label, not a control: a bare pencil next to the name read
          as "rename". */}
      <span
        className={cn(
          'inline-flex shrink-0 cursor-default select-none items-center gap-1 rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground',
          className
        )}
        aria-label={`Edited deal: ${labels.join(', ')}`}
        data-testid="edited-deal-icon"
      >
        <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
        Edited
      </span>
    </Tooltip>
  );
};

export default EditedDealIcon;
