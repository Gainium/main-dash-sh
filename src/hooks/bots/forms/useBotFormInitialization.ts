import { useEffect } from 'react';

import {
  useBotFormState,
  type BotFormMode,
} from '@/contexts/bots/form/BotFormProvider';
import {
  mapBotSettingsToFormData,
  type MapBotSettingsToFormDataResult,
} from '@/mappers/bots/dca/map-bot-settings-to-form-data';
import { BotTypesEnum, type BotVars, type DCABot } from '@/types';
import type { BotFormData } from '@/types/bots/form';
import type { VarBindingPath } from '../global-variables/useBotVarBinding';

export interface BotSettingsMapperContext {
  bot?: unknown;
  debug?: boolean;
}

export type BotSettingsMapperResult = Pick<
  MapBotSettingsToFormDataResult,
  'formData'
>;

export type BotSettingsMapper = (
  botType: BotTypesEnum,
  settings: unknown,
  context: BotSettingsMapperContext
) => BotSettingsMapperResult;

export interface UseBotFormInitializationOptions {
  botType: BotTypesEnum;
  mode: BotFormMode;
  bot?: unknown;
  botSettings?: unknown;
  mapper?: BotSettingsMapper;
  debug?: boolean;
}

const defaultMapper: BotSettingsMapper = (botType, settings, context) => {
  const mapperOptions: Parameters<typeof mapBotSettingsToFormData>[2] = {
    bot: (context.bot as DCABot | null) ?? null,
  };

  if (context.debug !== undefined) {
    mapperOptions.debug = context.debug;
  }

  return mapBotSettingsToFormData(botType, settings, mapperOptions);
};

const normalizeBotVarsPaths = (vars: BotVars | null): BotVars | null => {
  if (!vars) {
    return null;
  }

  let mutated = false;

  const normalizedEntries = vars.paths.reduce<{
    paths: { path: VarBindingPath; variable: string }[];
    seen: Set<string>;
  }>(
    (acc, entry) => {
      const nextPath = entry.path;

      if (acc.seen.has(nextPath)) {
        mutated = true;
        return acc;
      }

      acc.seen.add(nextPath);
      acc.paths.push({ path: nextPath, variable: entry.variable });
      mutated = mutated || nextPath !== entry.path;
      return acc;
    },
    { paths: [], seen: new Set<string>() }
  );

  const dedupedPaths = normalizedEntries.paths;

  if (dedupedPaths.length === 0) {
    return null;
  }

  if (!mutated) {
    return vars;
  }

  const nextList = Array.from(
    new Set(dedupedPaths.map((entry) => entry.variable))
  );

  return {
    list: nextList,
    paths: dedupedPaths,
  };
};

export const useBotFormInitialization = (
  options: UseBotFormInitializationOptions
): void => {
  const { mode, bot, botSettings, mapper, debug, botType } = options;

  const { setFormData, setErrors, setIsDirty, setIsLoading, setBotVars } =
    useBotFormState();

  useEffect(() => {
    if (mode === 'create') {
      setIsLoading(false);
      setBotVars(null);
      return;
    }

    if (!bot && !botSettings) {
      return;
    }

    const settingsSource =
      botSettings ?? (bot as { settings?: unknown } | undefined)?.settings;

    if (!settingsSource) {
      return;
    }

    try {
      const mapperFn = mapper ?? defaultMapper;
      const mapperContext: BotSettingsMapperContext = { bot };

      if (debug !== undefined) {
        mapperContext.debug = debug;
      }

      const mappingResult = mapperFn(botType, settingsSource, mapperContext);

      const resolvedVars =
        (botSettings as { vars?: BotVars | null } | undefined)?.vars ??
        (bot as { vars?: BotVars | null } | undefined)?.vars ??
        null;

      const normalizedVars = normalizeBotVarsPaths(resolvedVars);

      setFormData((previous) => {
        const nextFormState: BotFormData = {
          ...previous,
          ...mappingResult.formData,
        };

        // `pairPrecisionMap` is DERIVED from the live exchange pair lookup, not
        // from the bot's saved settings — the mappers can only seed it as `{}`.
        // Spreading that empty seed over the form state wiped a map the lookup
        // had already resolved whenever it won the race (a plain cache-warmth
        // coin flip), and the lookup's one-shot dedupe ref meant it was never
        // re-written: `createOrderGuard` then produced a guard with no
        // `decimals`/`min`, so every DCA order amount field fell back to 2
        // decimals and rendered a saved 0.00011 BTC order size as "0".
        // Keep whatever the lookup already resolved; the empty seed only wins
        // when there is nothing to keep.
        if (
          Object.keys(mappingResult.formData.pairPrecisionMap ?? {}).length ===
          0
        ) {
          nextFormState.pairPrecisionMap = previous.pairPrecisionMap;
        }

        nextFormState.originalBot =
          nextFormState.type === BotTypesEnum.dca
            ? {
                type: BotTypesEnum.dca,
                settings: JSON.parse(JSON.stringify(nextFormState.dca)),
              }
            : nextFormState.type === BotTypesEnum.combo
              ? {
                  type: BotTypesEnum.combo,
                  settings: JSON.parse(JSON.stringify(nextFormState.combo)),
                }
              : nextFormState.type === BotTypesEnum.grid
                ? {
                    type: BotTypesEnum.grid,
                    settings: JSON.parse(JSON.stringify(nextFormState.grid)),
                  }
                : undefined;

        return nextFormState;
      });

      setBotVars(normalizedVars);

      setErrors({});
      setIsDirty(false);

      if (debug) {
        console.log('[useBotFormInitialization] Form data initialised', {
          mode,
        });
      }
    } catch (error) {
      if (debug) {
        console.error(
          '[useBotFormInitialization] Failed to map bot settings',
          error
        );
      }
    } finally {
      setIsLoading(false);
      if (!botSettings && !bot) {
        setBotVars(null);
      }
    }
  }, [
    mode,
    bot,
    botSettings,
    mapper,
    debug,
    setFormData,
    setErrors,
    setIsDirty,
    setIsLoading,
    setBotVars,
    botType,
  ]);
};
