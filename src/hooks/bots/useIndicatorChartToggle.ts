import { useMemo } from 'react';
import {
  useOptionalBotFormStoreApi,
  useOptionalBotFormUpdate,
} from '@/contexts/bots/form/BotFormProvider';
import { useIndicatorStore } from '@/contexts/bots/form/formStoreContexts';
import { BotTypesEnum } from '@/types';
import type { IndicatorConfig } from '@/types/indicators';
import { sameChartIndicatorUuids } from '@/utils/indicators/chartIndicatorUtils';

/**
 * Show / hide an indicator on the chart from any bot-form section.
 *
 * The chart draws one study per chart identity (`chartIndicatorKey`), so the
 * same RSI used as a deal start and as a DCA condition is one study. Toggling
 * it from either row sets `hideOnChart` on every copy, so all the rows agree
 * with what the chart shows.
 *
 * `undefined` outside a bot form: the row then offers no toggle.
 */
export function useIndicatorChartToggle():
  | ((indicator: IndicatorConfig) => void)
  | undefined {
  const store = useOptionalBotFormStoreApi();
  const updateFormData = useOptionalBotFormUpdate();
  const indicatorStore = useIndicatorStore();
  return useMemo(() => {
    if (!store || !updateFormData) return undefined;
    return (indicator: IndicatorConfig) => {
      const formData = store.getState().formData;
      const section =
        formData.type === BotTypesEnum.combo
          ? formData.combo
          : formData.type === BotTypesEnum.grid
            ? undefined
            : formData.dca;
      const indicators = (section?.indicators ?? []) as IndicatorConfig[];
      const same = new Set(
        sameChartIndicatorUuids(
          indicators,
          indicator.uuid,
          indicatorStore.getChartIndicatorsContext()
        )
      );
      const hideOnChart = !indicator.hideOnChart;
      updateFormData(
        'indicators',
        indicators.map((i) => (same.has(i.uuid) ? { ...i, hideOnChart } : i))
      );
    };
  }, [store, updateFormData, indicatorStore]);
}
