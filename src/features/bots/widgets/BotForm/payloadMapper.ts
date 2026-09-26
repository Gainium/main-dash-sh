import type { BotExperienceDescriptor } from '@/features/bots/catalog/types';
import {
  mapFormDataToPayload,
  type MapFormDataToPayloadOptions,
  type MapFormDataToPayloadResult,
  type MapGridFormDataToPayloadResult,
  type UpdateDCABotPayload,
} from '@/mappers/bots/dca/map-form-data-to-payload';
import { mapGridFormDataToPayload } from '@/mappers/bots/grid/map-grid-form-data-to-payload';
import type { BotVars, DCABotSettings, ExchangeInUser } from '@/types';
import type { BotFormData } from '@/types/bots/form';

export type BotFormPayloadMapper = (
  formState: BotFormData,
  options: MapFormDataToPayloadOptions,
  vars?: BotVars | undefined | null,
  exchange?: ExchangeInUser | undefined | null
) => MapFormDataToPayloadResult | MapGridFormDataToPayloadResult;

/**
 * The form → save-payload mapper the bot form hands to `useFormHandlers`.
 * Grid bots use the grid mapper; DCA/Combo create uses `mapFormDataToPayload`,
 * and edit goes through the bot type's own `mapFormToBackend` adapter.
 * Returns `undefined` when the bot type has no adapter (the handlers then
 * fall back to `mapFormDataToPayload`).
 */
export const buildBotFormPayloadMapper = (
  isGridBot: boolean,
  experienceAdapters: BotExperienceDescriptor['adapters'] | undefined
): BotFormPayloadMapper | undefined => {
  if (isGridBot) {
    return (formState, options, vars, exchange) =>
      mapGridFormDataToPayload(formState, options, vars, exchange);
  }

  if (!experienceAdapters?.mapFormToBackend) {
    return undefined;
  }

  return (formState, options, vars, exchange) => {
    if (options.mode === 'create') {
      return mapFormDataToPayload(formState, options, vars, exchange);
    }

    try {
      const updatePayload = (experienceAdapters.mapFormToBackend?.(
        formState,
        vars,
        exchange
      ) ?? {}) as Partial<DCABotSettings>;
      const up: UpdateDCABotPayload = {
        ...updatePayload,
        ordersCount: updatePayload.ordersCount
          ? Number(updatePayload.ordersCount)
          : 0,
        activeOrdersCount: updatePayload.activeOrdersCount
          ? Number(updatePayload.activeOrdersCount)
          : 0,
      };

      return {
        success: true,
        updatePayload: up,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to generate bot payload.';

      return {
        success: false,
        errors: [message],
        warnings: [],
      };
    }
  };
};
