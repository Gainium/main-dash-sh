import {
  useBotFormActions,
  useBotFormSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { CloseDCATypeEnum, OrderTypeEnum } from '@/types';
import {
  EXECUTION_MODE_DEFAULTS,
  resolveLegacyExecution,
  type ExecutionStage,
  type OrderExecution,
} from '@/types/orderExecution';
import { useCallback, useMemo } from 'react';

type FormStage = 'entry' | 'dca' | 'tp' | 'sl';

const FIELD = {
  entry: 'entryExecution',
  dca: 'dcaExecution',
  tp: 'tpExecution',
  sl: 'slExecution',
} as const;

/**
 * Read/write the execution of one stage of the bot form.
 *
 * A bot saved before the field existed shows what its legacy fields actually
 * do. Writing also keeps those legacy fields in step, so an engine that does
 * not read the new field yet still gets the closest equivalent.
 */
export const useExitExecution = (
  stage: FormStage,
  isCombo: boolean
): [OrderExecution, (next: OrderExecution) => void] => {
  const { updateFormData } = useBotFormActions();
  const stored = useBotFormSelector(FIELD[stage]);
  const closeOrderType = useBotFormSelector('closeOrderType');
  const comboTpLimit = useBotFormSelector('comboTpLimit');
  const comboSlLimit = useBotFormSelector('comboSlLimit');
  const limitTimeout = useBotFormSelector('limitTimeout');
  const useLimitTimeout = useBotFormSelector('useLimitTimeout');
  const closeDealType = useBotFormSelector('closeDealType');
  const startOrderType = useBotFormSelector('startOrderType');
  const notUseLimitReposition = useBotFormSelector('notUseLimitReposition');
  const dcaByMarket = useBotFormSelector('dcaByMarket');
  const tpCondition = useBotFormSelector('dealCloseCondition');
  const slCondition = useBotFormSelector('dealCloseConditionSL');
  const dcaCondition = useBotFormSelector('dcaCondition');
  // Which old field holds the behaviour (checked against the engine):
  // - indicator / webhook take profits close through closeDealType;
  // - indicator stop losses close through closeDealType (webhook and ATR
  //   stop losses are always market);
  // - indicator DCA orders are always market.
  const legacyStage: ExecutionStage =
    (stage === 'tp' &&
      !isCombo &&
      (tpCondition === 'techInd' || tpCondition === 'webhook')) ||
    (stage === 'sl' && !isCombo && slCondition === 'techInd')
      ? 'close'
      : stage;
  const legacyAlwaysMarket =
    (stage === 'dca' && dcaCondition === 'indicators') ||
    (stage === 'sl' &&
      !isCombo &&
      (slCondition === 'webhook' || slCondition === 'dynamicAr'));

  const value = useMemo<OrderExecution>(
    () =>
      stored ??
      (legacyAlwaysMarket
        ? EXECUTION_MODE_DEFAULTS.market
        : resolveLegacyExecution(
            legacyStage,
            {
              closeOrderType,
              closeDealType,
              comboTpLimit,
              comboSlLimit,
              limitTimeout,
              useLimitTimeout,
              startOrderType,
              notUseLimitReposition,
              dcaByMarket,
            },
            isCombo
          )),
    [
      stored,
      legacyAlwaysMarket,
      legacyStage,
      closeOrderType,
      closeDealType,
      comboTpLimit,
      comboSlLimit,
      limitTimeout,
      useLimitTimeout,
      startOrderType,
      notUseLimitReposition,
      dcaByMarket,
      isCombo,
    ]
  );

  const setValue = useCallback(
    (next: OrderExecution) => {
      const isMarket = next.mode === 'market';
      updateFormData(FIELD[stage], next);
      switch (stage) {
        case 'entry': {
          updateFormData(
            'startOrderType',
            isMarket ? OrderTypeEnum.market : OrderTypeEnum.limit
          );
          updateFormData('notUseLimitReposition', next.mode === 'limit');
          const timeout = next.timeoutSec ?? 0;
          updateFormData('useLimitTimeout', !isMarket && timeout > 0);
          updateFormData('limitTimeout', timeout > 0 ? String(timeout) : '0');
          return;
        }
        case 'dca':
          updateFormData('dcaByMarket', isMarket);
          return;
        case 'tp':
          if (isCombo) {
            updateFormData('comboTpLimit', !isMarket);
          } else if (legacyStage === 'close') {
            updateFormData(
              'closeDealType',
              isMarket
                ? CloseDCATypeEnum.closeByMarket
                : CloseDCATypeEnum.closeByLimit
            );
          } else {
            updateFormData(
              'closeOrderType',
              isMarket ? OrderTypeEnum.market : OrderTypeEnum.limit
            );
          }
          return;
        case 'sl':
          if (isCombo) {
            updateFormData('comboSlLimit', !isMarket);
          } else if (legacyStage === 'close') {
            updateFormData(
              'closeDealType',
              isMarket
                ? CloseDCATypeEnum.closeByMarket
                : CloseDCATypeEnum.closeByLimit
            );
          }
          return;
        default:
      }
    },
    [stage, isCombo, legacyStage, updateFormData]
  );

  return [value, setValue];
};
