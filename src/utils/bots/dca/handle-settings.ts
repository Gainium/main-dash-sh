import type { BotFormUpdateValue, Fields } from '@/features/bots';
import { math, trimNumber, verifyNumber } from '@/lib/utils/math';
import {
  BotStartTypeEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  DCAVolumeType,
  DynamicPriceFilterDirectionEnum,
  ExchangeIntervals,
  IndicatorAction,
  IndicatorEnum,
  IndicatorSection,
  IndicatorsLogicEnum,
  MIN_DCA_TP,
  OrderSizeTypeEnum,
  RRSlTypeEnum,
  ScaleDcaTypeEnum,
  StartConditionEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
  type DCABotSettings,
  type SettingsIndicatorGroup,
  type SettingsIndicators,
} from '@/types';
import { getIndicatorDefaultParams } from '@/types/indicators/indicatorLogic';
import type { BotFormData } from '@/types/bots';

export type HandleSettingsUpdateResult = Partial<Omit<BotFormData, 'dca'>> & {
  dca: Partial<DCABotSettings>;
};

export const handleSettingsUpdate = (
  formData: BotFormData,
  field: Fields,
  value: BotFormUpdateValue,
  latestPrice?: number
): HandleSettingsUpdateResult => {
  const { dca: settings, pairMetadata, pair } = formData;
  const updates: HandleSettingsUpdateResult = { dca: {} };
  if (settings) {
    const {
      orderSize,
      step,
      ordersCount,
      activeOrdersCount,
      dynamicPriceFilterDirection,
      maxNumberOfOpenDeals,
      closeAfterXopen,
      dealCloseCondition,
      dealCloseConditionSL,
      futures,
      coinm,
      useMulti,
      useRelativeVolumeFilter,
      useVolumeFilter,
      dcaCondition,
      riskSlAmountPerc,
      riskSlAmountValue,
      scaleDcaType,
      orderSizeType,
      rrSlFixedValue,
      riskUseTpRatio,
      useCloseAfterXopen,
      botStart,
      botActualStart,
      useRiskReward,
      indicators,
      indicatorGroups,
    } = settings;
    updates.dca.indicators = settings.indicators
      ? [...settings.indicators]
      : [];
    updates.dca.indicatorGroups = settings.indicatorGroups
      ? [...settings.indicatorGroups]
      : [];
    // Terminal deal-type side effects (legacy index.tsx:3332-3412).
    // Switching to Simple disables DCA/TP/SL (the futures-exchange swap lives
    // at the exchange-selection layer, not in settings).
    if (
      field === 'terminalDealType' &&
      value === TerminalDealTypeEnum.simple
    ) {
      updates.dca.useDca = false;
      updates.dca.useTp = false;
      updates.dca.useSl = false;
    }
    // Import TP% auto-calc (legacy index.tsx:3362-3384). Uses the incoming
    // strategy (legacy `set.strategy`) for the multiplier.
    if (
      settings.terminalDealType === TerminalDealTypeEnum.import &&
      settings.baseOrderPrice &&
      latestPrice &&
      !isNaN(+(settings.baseOrderPrice ?? '')) &&
      !isNaN(+(latestPrice ?? '')) &&
      field !== 'tpPerc' &&
      ['terminalDealType', 'strategy', 'useTp'].includes(field)
    ) {
      const multiplier = settings.strategy === StrategyEnum.long ? 1 : -1;
      updates.dca.tpPerc = `${Math.max(
        math.round(
          ((+latestPrice - +settings.baseOrderPrice) /
            +settings.baseOrderPrice) *
            100 +
            MIN_DCA_TP * 100 * multiplier,
          1,
          false,
          true
        ) * multiplier,
        MIN_DCA_TP * 100
      )}`;
    }
    // Import SL% auto-calc (legacy index.tsx:3385-3404).
    if (
      settings.terminalDealType === TerminalDealTypeEnum.import &&
      settings.baseOrderPrice &&
      latestPrice &&
      !isNaN(+(settings.baseOrderPrice ?? '')) &&
      !isNaN(+(latestPrice ?? '')) &&
      field !== 'slPerc' &&
      ['terminalDealType', 'strategy', 'useSl'].includes(field)
    ) {
      const multiplier = settings.strategy === StrategyEnum.long ? 1 : -1;
      updates.dca.slPerc = `${math.round(
        ((+latestPrice - +settings.baseOrderPrice) /
          +settings.baseOrderPrice) *
          100 *
          multiplier +
          MIN_DCA_TP * 100 * -1,
        1,
        true
      )}`;
    }
    // Leaving Import resets a positive SL% to the floor (legacy 3405-3412).
    if (
      field === 'terminalDealType' &&
      value !== TerminalDealTypeEnum.import &&
      settings.slPerc &&
      +settings.slPerc > 0
    ) {
      updates.dca.slPerc = `${MIN_DCA_TP * 100 * -1}`;
    }
    if (field === 'dcaVolumeBaseOn' && value === DCAVolumeType.change) {
      updates.dca.tpPerc = '5';
      updates.dca.dcaVolumeRequiredChange = '5';
      updates.dca.dcaVolumeMaxValue = `${+orderSize * 20}`;
      if (
        isNaN(+updates.dca.dcaVolumeMaxValue) ||
        !isFinite(+updates.dca.dcaVolumeMaxValue)
      ) {
        updates.dca.dcaVolumeMaxValue = '-1';
      }
      const deviation = +ordersCount * +step;
      if (deviation < 10) {
        updates.dca.step = `${math.round(10 / +ordersCount, 2)}`;
      }
    }
    if (field === 'gridLevel' && verifyNumber(value as string)) {
      updates.dca.comboSmartGridsCount = `${+trimNumber(value as string, true) + 1}`;
    }
    if (field === 'ordersCount' && verifyNumber(value as string)) {
      const v = trimNumber(value as string, true);
      if (v < activeOrdersCount && v !== '') {
        updates.dca.activeOrdersCount = v;
      }
      if (activeOrdersCount === '0') {
        updates.dca.activeOrdersCount = '1';
      }
    }
    if (field === 'useVolumeFilter') {
      updates.dca.useVolumeFilter = !!value;
      updates.dca.useRelativeVolumeFilter = useVolumeFilter
        ? false
        : useRelativeVolumeFilter;
    }
    if (field === 'useRelativeVolumeFilter') {
      updates.dca.useRelativeVolumeFilter = !!value;
      updates.dca.useVolumeFilter = useRelativeVolumeFilter
        ? false
        : useVolumeFilter;
    }
    if (field === 'useMulti') {
      updates.dca.useMulti = !!value;
      if (!useMulti) {
        updates.dca.pair = [pair[0]];
        field = 'pair';
        value = pair;
      }
    }
    if (field === 'useDca' && !value) {
      updates.dca.dcaCondition = DCAConditionEnum.percentage;
      updates.dca.scaleDcaType = ScaleDcaTypeEnum.percentage;
    }
    // Legacy onChangeInput integer-normalizes these two count fields on commit
    // (trimNumber(value, true)), gating to '' on an invalid number. Other count
    // fields are stored raw.
    if (field === 'closeAfterX') {
      updates.dca.closeAfterX = verifyNumber(value as string)
        ? trimNumber(value as string, true)
        : '';
    }
    if (field === 'closeAfterXopen') {
      updates.dca.closeAfterXopen = verifyNumber(value as string)
        ? trimNumber(value as string, true)
        : '';
    }
    if (
      dcaCondition !== DCAConditionEnum.percentage ||
      (updates.dca.dcaCondition &&
        updates.dca.dcaCondition !== DCAConditionEnum.percentage)
    ) {
      updates.dca.scaleDcaType = ScaleDcaTypeEnum.percentage;
    }
    // The two DCA-mode cleanups below (start-DCA indicators / dcaCustom) are
    // normalizations for the mode the form is SETTLED in. They used to read the
    // PRE-update `settings`, so switching the DCA-type tab *back* to
    // Indicators/Custom evaluated the mode being left and wiped the config the
    // user just returned to. Read the post-update mode instead (legacy V1
    // reassigns its locals the same way — useSettingsComponent.ts:2604-2611),
    // and never let the mode selector itself trigger its own cleanup, so a
    // round-trip through another tab is lossless in both directions.
    // `useDca` counts as a mode switch too: turning DCA off rewrites
    // dcaCondition to `percentage` above, which would otherwise make the
    // post-update read wipe the list the user is only toggling away from.
    const isDcaTypeSwitch =
      field === 'dcaCondition' ||
      field === 'scaleDcaType' ||
      field === 'useDca';
    const nextDcaCondition = updates.dca.dcaCondition ?? dcaCondition;
    const nextScaleDcaType = updates.dca.scaleDcaType ?? scaleDcaType;
    if (field === 'strategy' && !settings.futures) {
      if (
        value === StrategyEnum.short &&
        (orderSizeType === OrderSizeTypeEnum.quote ||
          orderSizeType === OrderSizeTypeEnum.usd)
      ) {
        updates.dca.orderSizeType = OrderSizeTypeEnum.base;
      }
      if (
        value === StrategyEnum.long &&
        orderSizeType === OrderSizeTypeEnum.base
      ) {
        updates.dca.orderSizeType = OrderSizeTypeEnum.quote;
      }
    }
    if (
      field === 'useTp' &&
      !!value &&
      dealCloseCondition !== CloseConditionEnum.tp
    ) {
      updates.dca.dealCloseCondition = CloseConditionEnum.tp;
    }
    if (
      field === 'useTp' &&
      !value &&
      dealCloseCondition !== CloseConditionEnum.manual
    ) {
      updates.dca.dealCloseCondition = CloseConditionEnum.manual;
      updates.dca.indicators = indicators?.filter(
        (i) =>
          !(
            i.indicatorAction === IndicatorAction.closeDeal &&
            i.section !== IndicatorSection.sl
          )
      );
      updates.dca.indicatorGroups = indicatorGroups?.filter(
        (ig) =>
          !(
            ig.action === IndicatorAction.closeDeal &&
            ig.section !== IndicatorSection.sl
          )
      );
    }
    if (
      field === 'useSl' &&
      !!value &&
      dealCloseConditionSL !== CloseConditionEnum.tp
    ) {
      updates.dca.dealCloseConditionSL = CloseConditionEnum.tp;
    }
    if (
      field === 'useSl' &&
      !value &&
      dealCloseConditionSL !== CloseConditionEnum.manual
    ) {
      updates.dca.dealCloseConditionSL = CloseConditionEnum.manual;
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) =>
          !(
            i.indicatorAction === IndicatorAction.closeDeal &&
            i.section === IndicatorSection.sl
          )
      );
      updates.dca.indicatorGroups = (updates.dca.indicatorGroups ?? []).filter(
        (ig) =>
          !(
            ig.action === IndicatorAction.closeDeal &&
            ig.section === IndicatorSection.sl
          )
      );
    }
    if (
      field === 'startCondition' &&
      (value as StartConditionEnum) !== StartConditionEnum.ti
    ) {
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.startDeal
      );
    }
    // NOTE: changing `dealCloseCondition` / `dealCloseConditionSL` used to
    // delete that section's close indicators and groups here (six blocks,
    // one of which read the SL condition but filtered the TP indicators).
    // Mode switching is now lossless — the form keeps every configuration
    // so the user gets it back on switching mode again, and the payload
    // mapper drops the indicators the active mode cannot use on save.
    // See `isCloseIndicatorUsedByCondition` in indicatorConfigUtils.
    if (
      !isDcaTypeSwitch &&
      nextDcaCondition !== DCAConditionEnum.indicators &&
      (nextScaleDcaType === ScaleDcaTypeEnum.percentage || !nextScaleDcaType)
    ) {
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.startDca
      );
    }
    if (
      (field === 'useRiskReward' && !value) ||
      (useRiskReward && field === 'rrSlType' && value === RRSlTypeEnum.fixed)
    ) {
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.riskReward
      );
    }
    if (field === 'useMultiTp' && !value) {
      updates.dca.multiTp = [];
    }
    if (field === 'useMultiSl' && !value) {
      updates.dca.multiSl = [];
    }
    if (field === 'strategy') {
      updates.dca.dynamicPriceFilterDirection =
        dynamicPriceFilterDirection ===
        DynamicPriceFilterDirectionEnum.overAndUnder
          ? dynamicPriceFilterDirection
          : value === StrategyEnum.long
            ? DynamicPriceFilterDirectionEnum.under
            : DynamicPriceFilterDirectionEnum.over;
    }
    if (field === 'useRiskReward' && !!value) {
      updates.dca.useSl = false;
      updates.dca.useDca = false;
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) =>
          i.indicatorAction !== IndicatorAction.startDca &&
          !(
            i.indicatorAction === IndicatorAction.closeDeal &&
            i.section === IndicatorSection.sl
          )
      );
      if (!riskSlAmountPerc) {
        updates.dca.riskSlAmountPerc = '1';
      }
      if (!riskSlAmountValue) {
        updates.dca.riskSlAmountValue = '0';
      }
      if (!rrSlFixedValue) {
        updates.dca.rrSlFixedValue = '-1';
      }
      if (riskUseTpRatio) {
        updates.dca.useTp = false;
        updates.dca.indicators = (updates.dca.indicators ?? []).filter(
          (i) => i.indicatorAction !== IndicatorAction.closeDeal
        );
      }
    }
    if (field === 'riskUseTpRatio' && !!value) {
      updates.dca.useTp = false;
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.closeDeal
      );
    }
    if (!isDcaTypeSwitch && nextDcaCondition !== DCAConditionEnum.custom) {
      updates.dca.dcaCustom = [];
    }
    if (
      maxNumberOfOpenDeals &&
      closeAfterXopen &&
      useCloseAfterXopen &&
      +maxNumberOfOpenDeals > +closeAfterXopen &&
      field !== 'closeAfterXopen'
    ) {
      updates.dca.closeAfterXopen = maxNumberOfOpenDeals;
    }
    if (useMulti && field === 'strategy') {
      if (
        value === StrategyEnum.long &&
        orderSizeType === OrderSizeTypeEnum.base
      ) {
        updates.dca.orderSizeType = OrderSizeTypeEnum.quote;
      }
      if (
        value === StrategyEnum.short &&
        orderSizeType === OrderSizeTypeEnum.quote
      ) {
        updates.dca.orderSizeType = OrderSizeTypeEnum.base;
      }
      if (futures) {
        updates.dca.orderSizeType = OrderSizeTypeEnum.quote;
      }
      if (coinm) {
        updates.dca.orderSizeType = OrderSizeTypeEnum.base;
      }
      if ([pair].flat().length > 0 && field === 'strategy' && !futures) {
        const firstMeta =
          pairMetadata[[pair].flat()[0]]?.[
            value === StrategyEnum.long ? 'quoteAsset' : 'baseAsset'
          ]?.name ?? null;
        updates.pair = [pair].flat().filter((s) => {
          const meta = pairMetadata[s];
          if (!meta) {
            return false;
          }
          return value === StrategyEnum.long
            ? meta.quoteAsset.name === firstMeta
            : meta.baseAsset.name === firstMeta;
        });
      }
    }
    if (field === 'useMulti' && !!value) {
      if (botStart === BotStartTypeEnum.price) {
        updates.dca.botStart = BotStartTypeEnum.manual;
      }
      if (botActualStart === BotStartTypeEnum.price) {
        updates.dca.botActualStart = BotStartTypeEnum.manual;
      }
    }
    if (
      (field === 'botStart' && value !== BotStartTypeEnum.indicators) ||
      (field === 'useBotController' && !value)
    ) {
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.stopBot
      );
      updates.dca.indicatorGroups = (updates.dca.indicatorGroups ?? []).filter(
        (ig) => ig.action !== IndicatorAction.stopBot
      );
    }
    if (
      (field === 'botActualStart' && value !== BotStartTypeEnum.indicators) ||
      (field === 'useBotController' && !value)
    ) {
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.startBot
      );
      updates.dca.indicatorGroups = (updates.dca.indicatorGroups ?? []).filter(
        (ig) => ig.action !== IndicatorAction.startBot
      );
    }
    // Auto-seed the first indicator + group when switching into an indicators
    // mode (or enabling the controller while a mode is already 'indicators').
    // Mirrors legacy addIndicator(IndicatorAction.startBot|stopBot, …, true).
    // Note the legacy asymmetry: `botStart` drives stopBot indicators and
    // `botActualStart` drives startBot indicators.
    const seedControllerIndicator = (action: IndicatorAction) => {
      const generateId = (): string =>
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `controller-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const group: SettingsIndicatorGroup = {
        id: generateId(),
        logic: IndicatorsLogicEnum.and,
        action,
      };
      const type = IndicatorEnum.adx;
      const defaults = getIndicatorDefaultParams(type, action);
      const seeded: SettingsIndicators = {
        ...(defaults as unknown as SettingsIndicators),
        type,
        indicatorAction: action,
        uuid: generateId(),
        maUUID: generateId(),
        xoUUID: generateId(),
        groupId: group.id,
      };
      updates.dca.indicators = [...(updates.dca.indicators ?? []), seeded];
      updates.dca.indicatorGroups = [
        ...(updates.dca.indicatorGroups ?? []),
        group,
      ];
    };
    const nextBotStart =
      field === 'botStart' ? (value as BotStartTypeEnum) : botStart;
    const nextBotActualStart =
      field === 'botActualStart' ? (value as BotStartTypeEnum) : botActualStart;
    if (
      ((field === 'botStart' && value === BotStartTypeEnum.indicators) ||
        (field === 'useBotController' &&
          value &&
          nextBotStart === BotStartTypeEnum.indicators)) &&
      (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction === IndicatorAction.stopBot
      ).length === 0
    ) {
      seedControllerIndicator(IndicatorAction.stopBot);
    }
    if (
      ((field === 'botActualStart' &&
        value === BotStartTypeEnum.indicators) ||
        (field === 'useBotController' &&
          value &&
          nextBotActualStart === BotStartTypeEnum.indicators)) &&
      (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction === IndicatorAction.startBot
      ).length === 0
    ) {
      seedControllerIndicator(IndicatorAction.startBot);
    }
    if (field === 'scaleDcaType' && value === ScaleDcaTypeEnum.percentage) {
      updates.dca.indicators = (updates.dca.indicators ?? []).filter(
        (i) => i.indicatorAction !== IndicatorAction.startDca
      );
    }
    // Dynamic ATR/ADR scaling: when switching `scaleDcaType` to atr/adr, legacy
    // forces a single startDca indicator (DcaModeSettings.tsx:940-970 +
    // DCATechnicalIndicators addIndicator with `dynamicAr ? IndicatorEnum.atr`).
    // Seed one if none exists; otherwise just realign its type to the new
    // scaling mode (atr↔adr).
    if (
      field === 'scaleDcaType' &&
      (value === ScaleDcaTypeEnum.atr || value === ScaleDcaTypeEnum.adr)
    ) {
      const dynamicArType =
        value === ScaleDcaTypeEnum.adr
          ? IndicatorEnum.adr
          : IndicatorEnum.atr;
      const baseIndicators = (settings.indicators ?? []) as SettingsIndicators[];
      const existing = baseIndicators.find(
        (i) => i.indicatorAction === IndicatorAction.startDca
      );
      if (existing) {
        if (existing.type !== dynamicArType) {
          updates.dca.indicators = baseIndicators.map((i) =>
            i.uuid === existing.uuid ? { ...i, type: dynamicArType } : i
          );
        }
      } else {
        const generateId = (): string =>
          typeof crypto !== 'undefined' &&
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `dca-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const existingGroups = (settings.indicatorGroups ??
          []) as SettingsIndicatorGroup[];
        let group = existingGroups.find(
          (g) => g.action === IndicatorAction.startDca
        );
        if (!group) {
          group = {
            id: generateId(),
            logic: IndicatorsLogicEnum.and,
            action: IndicatorAction.startDca,
            section: IndicatorSection.dca,
          };
          updates.dca.indicatorGroups = [...existingGroups, group];
        }
        const defaults = getIndicatorDefaultParams(
          dynamicArType,
          IndicatorAction.startDca,
          IndicatorSection.dca
        );
        const seeded: SettingsIndicators = {
          ...(defaults as unknown as SettingsIndicators),
          type: dynamicArType,
          indicatorAction: IndicatorAction.startDca,
          section: IndicatorSection.dca,
          indicatorInterval: ExchangeIntervals.oneH,
          dynamicArFactor: '1',
          minPercFromLast: '1',
          uuid: generateId(),
          groupId: group.id,
        };
        updates.dca.indicators = [...baseIndicators, seeded];
      }
    }
    if (
      JSON.stringify(updates.dca.indicators) ===
      JSON.stringify(settings.indicators)
    ) {
      delete updates.dca.indicators;
    }
    if (
      JSON.stringify(updates.dca.indicatorGroups) ===
      JSON.stringify(settings.indicatorGroups)
    ) {
      delete updates.dca.indicatorGroups;
    }
    if ((updates.dca.indicators ?? []).length) {
      updates.dca.indicatorGroups = (
        updates.dca.indicatorGroups ?? settings.indicatorGroups ?? []
      ).filter(
        (ig) =>
          (updates.dca.indicators ?? []).filter((i) => i.groupId === ig.id)
            .length > 0
      );
    }
  }
  return updates;
};
