import {
  useBotFormEditing,
  useBotFormSelector,
  useBotFormState,
  type BotFormMode,
  type BotFormUpdateValue,
  type Fields,
} from '@/contexts/bots/form/BotFormProvider';
import { useBotFormQuery } from '@/features/bots/widgets/BotForm/providers/BotFormQueryProvider';
import {
  prepareBacktestInput,
  useRunBacktest,
  type SSBinput,
} from '@/hooks/useBacktestMutations';
import { GraphQLHttpError } from '@/lib/api/GraphQLClient';
import { logger } from '@/lib/loggerInstance';
import { track as analyticsTrack } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import {
  mapFormDataToPayload,
  type CreateDCABotPayload,
  type CreateGridBotPayload,
  type MapFormDataToPayloadOptions,
  type MapFormDataToPayloadResult,
  type MapGridFormDataToPayloadResult,
  type UpdateDCABotPayload,
} from '@/mappers/bots/dca/map-form-data-to-payload';
import {
  BotTypesEnum,
  ExchangeIntervals,
  TerminalDealTypeEnum,
  type BotVars,
  type ExchangeInUser,
} from '@/types';
import type { BotFormData, BotFormErrors } from '@/types/bots/form';
import { mapDcaErrorMessageToField } from '@/utils/bots/dca/validation';
import { useCallback } from 'react';
import type { VarBindingPath } from '../global-variables/useBotVarBinding';

interface Bot {
  _id: string;
  settings?: unknown;
}

interface UpdateMutation {
  mutateAsync: (params: {
    id: string;
    settings: UpdateDCABotPayload;
    vars?: BotVars | null;
  }) => Promise<unknown>;
  isPending?: boolean;
}

interface CreateMutation {
  mutateAsync: (
    config: CreateDCABotPayload | CreateGridBotPayload
  ) => Promise<unknown>;
  isPending?: boolean;
}

interface ValidationResult {
  errors: BotFormErrors;
}

type FormValidator = (formData: BotFormData) => ValidationResult;

interface UseFormHandlersOptions {
  mode?: BotFormMode;
  createMutation?: CreateMutation;
  onCreateSuccess?: (result: unknown) => void;
  validate?: FormValidator;
  payloadMapper?: (
    formData: BotFormData,
    options: MapFormDataToPayloadOptions,
    vars?: BotVars | undefined | null,
    exchange?: ExchangeInUser | undefined | null
  ) => MapFormDataToPayloadResult | MapGridFormDataToPayloadResult;
}

/**
 * What the backtest settings dialog collected, handed through to the server
 * mutation. Everything is optional and falls back to the constants below, so
 * a no-argument `handleBacktest()` behaves exactly as it always has.
 */
export interface BacktestOverrides {
  timeframe?: ExchangeIntervals;
  /** `YYYY-MM-DDTHH:mm` (dialog) or ISO — empty string means "Auto". */
  startDate?: string;
  endDate?: string;
  slippagePercent?: number;
  userFee?: string | number;
}

export interface UseFormHandlersReturn {
  updateFormData: (field: Fields, value: BotFormUpdateValue) => void;
  handleSave: (e?: React.FormEvent) => Promise<void>;
  handleBacktest: (overrides?: BacktestOverrides) => Promise<void>;
  backtestPending: boolean;
}

export const useFormHandlers = (
  formData: BotFormData,
  setFormData: React.Dispatch<React.SetStateAction<BotFormData>>,
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>,
  setErrors: React.Dispatch<React.SetStateAction<BotFormErrors>>,
  errors: BotFormErrors,
  bot: Bot | null,
  updateMutation: UpdateMutation,
  options: UseFormHandlersOptions = {},
  terminal: boolean
): UseFormHandlersReturn => {
  const mode: BotFormMode = options.mode ?? 'edit';
  const { botVars, setAlerts } = useBotFormState();
  const { currentExchange } = useBotFormQuery();
  // After a successful edit-mode save, flip the form back to view mode.
  // Without this the user sees the success toast but the toolbar stays
  // in edit mode with the (now-disabled, since `isDirty=false`) Save
  // Settings button stuck — there's no signal that the save landed.
  const { disableEditing } = useBotFormEditing();

  const normalizeBotVarsForPayload = useCallback(
    (vars: BotVars | null | undefined): BotVars => {
      if (!vars || !Array.isArray(vars.paths) || vars.paths.length === 0) {
        return {
          list: [],
          paths: [],
        };
      }

      const pathMap = new Map<
        string,
        { path: VarBindingPath; variable: string }
      >();
      for (const entry of vars.paths) {
        if (!entry?.path || !entry?.variable) {
          continue;
        }
        if (!pathMap.has(entry.path)) {
          pathMap.set(entry.path, {
            path: entry.path,
            variable: entry.variable,
          });
        }
      }

      const dedupedPaths = Array.from(pathMap.values());
      const dedupedList = Array.from(
        new Set(dedupedPaths.map((entry) => entry.variable))
      );

      return {
        list: dedupedList,
        paths: dedupedPaths,
      };
    },
    []
  );

  // Mutation to run server-backtest
  const backtestMutation = useRunBacktest();

  const updateFormData = useCallback(
    (field: Fields, value: BotFormUpdateValue) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (mode === 'edit') {
        setIsDirty(true);
      }
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: '' }));
      }
    },
    [errors, setFormData, setIsDirty, setErrors, mode]
  );

  const useMulti = useBotFormSelector('useMulti');

  const serializeSaveError = useCallback((error: unknown) => {
    if (error instanceof GraphQLHttpError) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        details: error.details,
      };
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { value: error };
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();

    logger.info('[BotForm] Save requested', {
      mode,
      botId: bot?._id,
    });

    if (mode === 'edit' && !bot) {
      toast.error('No bot to save');
      logger.warn('[BotForm] Aborted save due to missing bot reference');
      return;
    }

    try {
      if (options.validate) {
        const validation = options.validate(formData) as unknown as {
          errors: Record<string, string>;
          alerts?: import('@/types/bots/form').BotFormAlerts;
        };
        const validationErrors = validation?.errors ?? {};

        // Set alerts (may be undefined)
        setAlerts(validation.alerts ?? {});

        if (Object.keys(validationErrors).length > 0) {
          setErrors(validationErrors);
          const firstErrorMessage = Object.values(validationErrors)[0];
          toast.error(
            firstErrorMessage || 'Please resolve the highlighted fields.'
          );
          logger.warn('[BotForm] Client-side validation failed', {
            errors: validationErrors,
          });
          return;
        }

        setErrors({});
      }

      const mapper = options.payloadMapper ?? mapFormDataToPayload;
      const payloadResult = mapper(
        formData,
        { mode },
        botVars,
        currentExchange
      );

      if (!payloadResult.success || payloadResult.errors?.length) {
        const errorMessages = payloadResult.errors?.length
          ? payloadResult.errors
          : ['Unknown validation error'];

        const mappedErrors: Record<string, string> = {};
        const mappedAlerts: import('@/types/bots/form').BotFormAlerts = {};
        for (const message of errorMessages) {
          mapDcaErrorMessageToField(mappedErrors, message, mappedAlerts);
        }

        const firstErrorMessage =
          Object.values(mappedErrors)[0] ?? errorMessages[0];

        setErrors(mappedErrors);
        setAlerts(mappedAlerts);
        toast.error(`Validation failed: ${firstErrorMessage}`);
        logger.warn('[BotForm] Mapper validation failed', {
          errors: errorMessages,
        });
        return;
      }

      if (payloadResult.warnings?.length) {
        const [primaryWarning, ...additionalWarnings] = payloadResult.warnings;
        if (primaryWarning) {
          toast.warning(primaryWarning);
        }
        if (additionalWarnings.length > 0) {
          logger.warn('[BotForm] Additional mapper warnings', {
            warnings: additionalWarnings,
          });
        }
      }

      const normalizedBotVars = normalizeBotVarsForPayload(botVars);

      if (mode === 'create') {
        if (!options.createMutation) {
          toast.error('Create bot mutation is not available');
          logger.error('[BotForm] Missing createMutation in create mode');
          return;
        }

        const createPayload = payloadResult.createPayload;

        if (!createPayload) {
          toast.error('Failed to prepare bot configuration for creation');
          logger.error('[BotForm] Mapper did not produce a create payload');
          return;
        }

        logger.info('[BotForm] Create payload summary', {
          pairCount: Array.isArray(createPayload.pair)
            ? createPayload.pair.length
            : 0,
          baseAssetCount: Array.isArray(createPayload.baseAsset)
            ? createPayload.baseAsset.length
            : 0,
          quoteAssetCount: Array.isArray(createPayload.quoteAsset)
            ? createPayload.quoteAsset.length
            : 0,
          type:
            'type' in createPayload
              ? (createPayload as { type?: unknown }).type
              : undefined,
          terminalDealType:
            'terminalDealType' in createPayload
              ? (createPayload as { terminalDealType?: unknown })
                  .terminalDealType
              : undefined,
        });

        const createdBot = await options.createMutation.mutateAsync({
          ...createPayload,
          vars: normalizedBotVars,
        });

        // Track bot creation event
        const isComboBot = formData.type === BotTypesEnum.combo;
        const botStrategy = isComboBot
          ? formData.combo.strategy
          : formData.dca.strategy;
        const useMulti = isComboBot
          ? formData.combo.useMulti
          : formData.dca.useMulti;

        analyticsTrack('bot_created', {
          bot_id: (createdBot as { _id?: string })?._id,
          bot_type: terminal ? 'terminal' : formData.type,
          exchange: currentExchange?.provider ?? null,
          has_recording: false, // Recording is always false for new bots
          is_multi_pair: Boolean(useMulti),
          is_paper: Boolean(
            currentExchange?.provider &&
            String(currentExchange.provider).startsWith('paper')
          ),
          pair: Array.isArray(formData.pair)
            ? formData.pair[0] || ''
            : formData.pair || '',
          strategy: botStrategy,
        });

        toast.success(
          terminal
            ? formData.dca.terminalDealType === TerminalDealTypeEnum.import
              ? 'Deal succesfully imported'
              : 'Deal created, waiting to place orders'
            : 'Bot created successfully!'
        );
        options.onCreateSuccess?.(createdBot);
        setErrors({});
        setIsDirty(false);
        logger.info('[BotForm] Bot created successfully', {
          botId: (createdBot as { _id?: string })?._id,
        });
        return;
      }

      const updatePayloadBase = payloadResult.updatePayload ?? {};

      if (!bot) {
        throw new Error('Missing bot reference for update');
      }

      if (formData.type === BotTypesEnum.dca) {
        const upb = updatePayloadBase as UpdateDCABotPayload;
        if (!useMulti) {
          delete upb.pair;
        }
        delete upb.gridLevel;
        delete upb.useMulti;
        delete upb.baseStep;
        delete upb.baseGridLevels;
        delete upb.useActiveMinigrids;
        delete upb.comboActiveMinigrids;
        delete upb.feeOrder;
        delete upb.type;
        delete upb.useLimitPrice;
        delete upb.terminalDealType;
        delete upb.comboSlLimit;
        delete upb.comboTpLimit;
        //@ts-expect-error -- ignore ---
        delete upb.useExperimental;
        await updateMutation.mutateAsync({
          id: bot._id,
          settings: upb,
          vars: normalizedBotVars,
        });
      }
      if (formData.type === BotTypesEnum.combo) {
        const upb = updatePayloadBase as UpdateDCABotPayload;
        delete upb.useMulti;
        delete upb.type;
        delete upb.useLimitPrice;
        delete upb.terminalDealType;
        //@ts-expect-error -- ignore ---
        delete upb.useExperimental;
        delete upb.pair;
        await updateMutation.mutateAsync({
          id: bot._id,
          settings: upb,
          vars: normalizedBotVars,
        });
      }
      if (formData.type === BotTypesEnum.grid) {
        const upb = updatePayloadBase as UpdateDCABotPayload;
        //@ts-expect-error -- ignore ---
        delete upb.updatedBudget;
        //@ts-expect-error -- ignore ---
        delete upb.newProfit;
        await updateMutation.mutateAsync({
          id: bot._id,
          settings: upb,
          vars: normalizedBotVars,
        });
      }

      setErrors({});
      setIsDirty(false);
      disableEditing();
      toast.success('Bot updated successfully!');
      logger.info('[BotForm] Bot updated successfully', {
        botId: bot._id,
        fields: Object.keys(updatePayloadBase),
      });
    } catch (error: unknown) {
      const err = error as Error;
      const message = err?.message || 'Failed to update bot';
      logger.error('[BotForm] Save failed', serializeSaveError(error));
      toast.error(`Save failed: ${message}`);
    }
  };

  const handleBacktest = useCallback(async (overrides?: BacktestOverrides) => {
    try {
      if (options.validate) {
        const validation = options.validate(formData) as unknown as {
          errors: Record<string, string>;
          alerts?: import('@/types/bots/form').BotFormAlerts;
        };
        const validationErrors = validation?.errors ?? {};

        // Set alerts for backtest validation
        setAlerts(validation.alerts ?? {});

        if (Object.keys(validationErrors).length > 0) {
          setErrors(validationErrors);
          const firstErrorMessage = Object.values(validationErrors)[0];
          toast.error(
            firstErrorMessage ||
              'Please resolve the highlighted fields before backtesting.'
          );
          return;
        }

        setErrors({});
      }

      const mapper = options.payloadMapper ?? mapFormDataToPayload;
      const payloadResult = mapper(
        formData,
        { mode },
        botVars,
        currentExchange
      );

      if (!payloadResult.success || payloadResult.errors?.length) {
        const errorMessages = payloadResult.errors?.length
          ? payloadResult.errors
          : ['Unknown validation error'];

        const mappedErrors: Record<string, string> = {};
        const mappedAlerts: import('@/types/bots/form').BotFormAlerts = {};
        for (const message of errorMessages) {
          mapDcaErrorMessageToField(mappedErrors, message, mappedAlerts);
        }

        const firstErrorMessage =
          Object.values(mappedErrors)[0] ?? errorMessages[0];
        setErrors(mappedErrors);
        setAlerts(mappedAlerts);
        toast.error(`Validation failed: ${firstErrorMessage}`);
        return;
      }

      const rawPayload =
        payloadResult.createPayload ?? payloadResult.updatePayload;
      if (!rawPayload) {
        toast.error('Failed to prepare backtest payload');
        return;
      }

      // What the settings dialog collected wins; the constants below are only
      // the fallback for a no-argument call. `??` (not `||`) so an explicit
      // empty date — the dialog's "Auto" period — survives as "unset" rather
      // than silently reverting to the hardcoded 365-day window.
      const timeframe =
        overrides?.timeframe ?? /**Default to 60m */ ExchangeIntervals.oneH;
      const startDate =
        overrides?.startDate ??
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = overrides?.endDate ?? new Date().toISOString();
      const config = {
        startDate,
        endDate,
        timeframe,
        includeCommissions: true,
        slippagePercent: overrides?.slippagePercent ?? /** fallback to 0 */ 0,
      };

      if (mode === 'create' && !bot) {
        toast.error(
          'Please save the bot before requesting a server-side backtest.'
        );
        return;
      }

      // `startDate`/`endDate` are date STRINGS, so unary `+` on them is NaN,
      // not a timestamp — and the `? :` guard never helps because a non-empty
      // string is truthy. Parse them, exactly as the local (in-browser) path
      // does in BotForm/index.tsx, and leave the field unset when the value
      // isn't a real date: that is how "Auto" asks the backend to derive the
      // window itself.
      const firstDataTime = new Date(config.startDate).getTime();
      const lastDataTime = new Date(config.endDate).getTime();

      const input: SSBinput = prepareBacktestInput(
        formData,
        currentExchange,
        {
          userFee: `${overrides?.userFee ?? formData.userFee?.makerCommission ?? 0}`,
          slippage: `${config.slippagePercent}`,
          firstDataTime: Number.isFinite(firstDataTime)
            ? firstDataTime
            : undefined,
          lastDataTime: Number.isFinite(lastDataTime) ? lastDataTime : undefined,
        },
        config.timeframe
      );

      await backtestMutation.mutateAsync(input);
      toast.success(
        'Backtest requested; results will be available when processing completes.'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Backtest failed: ${message}`);
    }
  }, [
    formData,
    mode,
    botVars,
    currentExchange,
    backtestMutation,
    bot,
    setErrors,
    options,
    setAlerts,
  ]);

  const backtestPending = backtestMutation?.isPending ?? false;

  return {
    updateFormData,
    handleSave,
    handleBacktest,
    backtestPending,
  };
};
