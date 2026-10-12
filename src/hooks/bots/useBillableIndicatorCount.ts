import { useMemo } from 'react';
import { useBotFormSelector } from '@/contexts/bots/form/BotFormProvider';
import { billableIndicators } from '@/utils/bots/credits';

/**
 * The bot form's indicator count against `indicatorsLimit`: the DCA by
 * indicators ladder counts as one indicator, every other indicator once.
 */
export const useBillableIndicatorCount = (): number => {
  const indicators = useBotFormSelector('indicators');
  const dcaCondition = useBotFormSelector('dcaCondition');
  return useMemo(
    () => billableIndicators(indicators, dcaCondition),
    [indicators, dcaCondition]
  );
};
