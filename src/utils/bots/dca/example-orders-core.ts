import { globalVariablesStore } from '@/stores/globalVariablesStore';
import {
  BaseSlOnEnum,
  BotMarginTypeEnum,
  BotOrderSideEnum,
  BotTypesEnum,
  CloseConditionEnum,
  DCAConditionEnum,
  DCAOrderTypeEnum,
  DcaVolumeRequiredChangeRef,
  DCAVolumeType,
  ExchangeEnum,
  FuturesStrategyEnum,
  IndicatorAction,
  IndicatorSection,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  ScaleDcaTypeEnum,
  StrategyEnum,
  TerminalDealTypeEnum,
  type DCABotSettings as _DCABotSettingsCommon,
  type BotSettings as _BotSettingsCommon,
  type Asset,
  type BotVars,
  type ComboMinigrid,
  type Currency,
  type DCACustom,
  type DCAGrid,
  type DynamicArPrices,
  type Grid,
  type GridBreakpoint,
  type GridType,
  type MultiTP,
  type SettingsIndicators,
  type Symbols,
} from '@/types';
import type { BotFormErrors } from '@/types/bots';
import { math } from '@/utils/math';

/**
 * Chart label for a projected DCA level whose price is derived purely from the
 * startDca indicator's "Minimum % from last filled order". These are NOT smart
 * orders — nothing is placed on the exchange until the indicator fires.
 */
export const DCA_MIN_PERC_LABEL = 'DCA (min. %)';
/** Chart label for `dcaByMarket` levels — price-triggered market orders. */
export const DCA_BY_MARKET_LABEL = 'DCA by market';

export type DCABotSettings = Pick<
  _DCABotSettingsCommon,
  | 'indicators'
  | 'dcaCustom'
  | 'multiTp'
  | 'multiSl'
  | 'baseOrderSize'
  | 'orderSize'
  | 'tpPerc'
  | 'slPerc'
  | 'step'
  | 'stepScale'
  | 'minimumDeviation'
  | 'volumeScale'
  | 'activeOrdersCount'
  | 'useTp'
  | 'dealCloseCondition'
  | 'useSl'
  | 'dealCloseConditionSL'
  | 'orderSizeType'
  | 'coinm'
  | 'useDca'
  | 'dcaCondition'
  | 'dcaByMarket'
  | 'scaleDcaType'
  | 'dcaVolumeBaseOn'
  | 'dcaVolumeRequiredChange'
  | 'dcaVolumeMaxValue'
  | 'ordersCount'
  | 'futures'
  | 'strategy'
  | 'useMultiTp'
  | 'profitCurrency'
  | 'trailingTp'
  | 'fixedTpPrice'
  | 'fixedSlPrice'
  | 'useFixedTPPrices'
  | 'useFixedSLPrices'
  | 'marginType'
  | 'leverage'
  | 'terminalDealType'
  | 'useSmartOrders'
  | 'dcaVolumeRequiredChangeRef'
  | 'moveSL'
  | 'baseSlOn'
  | 'trailingSl'
  | 'useMultiSl'
  | 'baseStep'
  | 'comboUseSmartGrids'
  | 'comboSmartGridsCount'
  | 'comboActiveMinigrids'
  | 'useActiveMinigrids'
  | 'feeOrder'
  | 'gridLevel'
  | 'baseGridLevels'
>;

export type BotSettings = Pick<
  _BotSettingsCommon,
  | 'topPrice'
  | 'lowPrice'
  | 'budget'
  | 'levels'
  | 'useStartPrice'
  | 'startPrice'
  | 'updatedBudget'
  | 'sellDisplacement'
  | 'gridType'
  | 'futures'
  | 'profitCurrency'
  | 'orderFixedIn'
  | 'coinm'
  | 'futuresStrategy'
  | 'ordersInAdvance'
  | 'useOrderInAdvance'
  | 'feeOrder'
>;

export type ExampleOrdersStoreContext = {
  botType: BotTypesEnum;
  settings: DCABotSettings | null;
  gridSettings: BotSettings | null;
  symbol: Symbols | null;
  errors: BotFormErrors;
  botVars: BotVars | null | undefined;
  usdPrice: number;
  inputLatestPrice: number;
  breakpoints: GridBreakpoint[];
  balances: Asset[] | null;
  tpSlTargetFilled: string[];
  dcaArValues: DynamicArPrices[];
  _minigrids: ComboMinigrid[];
  userFee: number;
  percOrderSize: number;
  baseOrderPrice?: string;
  startOrderType?: OrderTypeEnum;
  useLimitPrice?: boolean;
  onDrag?: (
    price: number,
    type: DCAOrderTypeEnum,
    index?: number,
    meta?: {
      prevPrice?: number;
      entryPrice?: number;
      latestPrice?: number;
      /** For grid bots: which bound of the range the dragged line
       *  represents. Set on the top and bottom grid lines only. */
      gridBound?: 'top' | 'low';
    }
  ) => void;
};

export type UpdateOrdersParams = {
  all?: boolean | undefined;
  outsideSl?: boolean | undefined;
  noCheck?: boolean | undefined;
  slFromFinalBreakeven?: boolean | undefined;
  updatedComboAdjustments?: boolean | undefined;
  newSell?: boolean | undefined;
  futuresPrecision?: boolean | undefined;
  forceLocal?: boolean | undefined;
  initialPrice?: number | undefined;
  nosplice?: boolean | undefined;
  withoutErrorCheck?: boolean | undefined;
};

export const defaultContext: ExampleOrdersStoreContext = {
  botType: BotTypesEnum.dca,
  settings: null,
  gridSettings: null,
  symbol: null,
  errors: {},
  botVars: null,
  usdPrice: 0,
  inputLatestPrice: 0,
  breakpoints: [],
  balances: null,
  tpSlTargetFilled: [],
  dcaArValues: [],
  _minigrids: [],
  userFee: 0,
  percOrderSize: 0,
  baseOrderPrice: undefined,
  startOrderType: OrderTypeEnum.market,
  useLimitPrice: false,
};

type LocalDCASettings = NonNullable<ExampleOrdersStoreContext['settings']>;

async function replaceInputVars<T>(
  botVars: BotVars | null | undefined,
  path: string,
  value: T
): Promise<T> {
  if (!botVars) {
    return value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return value;
  }
  const findPath = botVars?.paths.find((p) => p.path === path);
  if (findPath) {
    const get =
      (await globalVariablesStore.getVariablesByIds(findPath.variable))?.[0] ??
      null;
    if (typeof value === 'number') {
      const num = +(get?.value ?? value) as number;
      if (isNaN(num) || !isFinite(num)) {
        return value;
      }
      value = num as unknown as T;
    }
    if (typeof value === 'string') {
      value = `${get?.value ?? value}` as unknown as T;
    }
  }
  return value;
}
async function _baseReplaceVarsInSettings<T extends { uuid: string }>(
  settings: T[] | undefined | null,
  botVars: BotVars | null | undefined,
  pathPrefix: string
): Promise<T[]> {
  const result: T[] = [];
  for (const _item of settings ?? []) {
    const item = JSON.parse(JSON.stringify(_item)) as T;
    const keys = Object.keys(item) as (keyof T)[];
    for (const key of keys) {
      (item[key] as T[typeof key]) = await replaceInputVars(
        botVars,
        `${pathPrefix}.${item.uuid}.${String(key)}`,
        item[key]
      );
    }
    result.push(item);
  }
  return result;
}
async function replaceVarsInIndicatorSettings(
  settings: SettingsIndicators[] | undefined | null,
  botVars: BotVars | null | undefined
): Promise<SettingsIndicators[]> {
  return _baseReplaceVarsInSettings(settings, botVars, 'indicators');
}
async function replaceVarsInDCACustomSettings(
  settings: DCACustom[] | undefined | null,
  botVars: BotVars | null | undefined
): Promise<DCACustom[]> {
  return _baseReplaceVarsInSettings(settings, botVars, 'dcaCustom');
}
async function replaceVarsInMultiTpSettings(
  settings: MultiTP[] | undefined | null,
  botVars: BotVars | null | undefined,
  section: 'tp' | 'sl'
): Promise<MultiTP[]> {
  const pathPrefix = section === 'tp' ? 'multiTp' : 'multiSl';
  return _baseReplaceVarsInSettings(settings, botVars, pathPrefix);
}
async function replaceVarsInSettings(
  settings: LocalDCASettings,
  botVars: BotVars | null | undefined
): Promise<LocalDCASettings> {
  const s = JSON.parse(JSON.stringify(settings)) as NonNullable<
    ExampleOrdersStoreContext['settings']
  >;
  s.indicators = await replaceVarsInIndicatorSettings(s.indicators, botVars);
  s.dcaCustom = await replaceVarsInDCACustomSettings(s.dcaCustom, botVars);
  s.multiTp = await replaceVarsInMultiTpSettings(s.multiTp, botVars, 'tp');
  s.multiSl = await replaceVarsInMultiTpSettings(s.multiSl, botVars, 'sl');
  return s;
}
function getAssetPrecision(symbol: Symbols, type: 'base' | 'quote') {
  if (!symbol) {
    return 8;
  }
  let use =
    type === 'base'
      ? `${symbol.baseAsset.step}`
      : `${symbol.quoteAsset.minAmount}`;
  if (use.indexOf('e-') !== -1) {
    const split = use.split('e-')[1];
    use = Number(symbol.baseAsset.step).toFixed(parseFloat(split));
  }
  if (use.indexOf('1') === -1) {
    const dec = use.replace('0.', '');
    const numbers = dec.replace(/0/g, '');
    const place = dec.indexOf(numbers);
    if (place <= 1) {
      return place;
    }
    use = `0.${'0'.repeat(place)}1`;
  }
  return use.indexOf('1') === 0
    ? 0
    : symbol.exchange === ExchangeEnum.kucoin ||
        symbol.exchange === ExchangeEnum.paperKucoin
      ? use.replace('0.', '').length
      : use.replace('0.', '').indexOf('1') + 1;
}
function id(length: number): string {
  let result = '';
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
export async function createDCAOrders(
  params: UpdateOrdersParams | undefined = {},
  context: ExampleOrdersStoreContext = defaultContext
): Promise<DCAGrid[]> {
  const {
    all = false,
    outsideSl = false,
    noCheck = false,
    slFromFinalBreakeven = false,
  } = params;
  const {
    settings: _settings,
    symbol,
    errors,
    botVars,
    usdPrice,
    inputLatestPrice,
    balances,
    dcaArValues,
    userFee,
    breakpoints,
    tpSlTargetFilled,
    percOrderSize,
    onDrag,
  } = context;
  if (!_settings) {
    return [];
  }
  if (!Object.entries(errors).filter(([_k, v]) => !!v).length || noCheck) {
    let settings = JSON.parse(JSON.stringify(_settings)) as LocalDCASettings;
    await globalVariablesStore.getVariablesByIds(botVars?.list ?? []);
    settings = await replaceVarsInSettings(settings, botVars);
    const baseOrderSize = parseFloat(settings.baseOrderSize);
    const _orderSize = parseFloat(settings.orderSize);
    const tpPerc = parseFloat(settings.tpPerc) / 100;
    const slPerc = parseFloat(settings.slPerc) / 100;
    const precision = symbol ? getAssetPrecision(symbol, 'base') : 8;
    const step = parseFloat(settings.step) / 100;
    const stepScale = parseFloat(settings.stepScale);
    const minimumDeviation = +(settings.minimumDeviation ?? '0') / 100;
    const volumeScale = parseFloat(settings.volumeScale);

    const {
      activeOrdersCount,
      useTp: _useTp,
      dealCloseCondition,
      useSmartOrders,
      useSl: _useSl,
      dealCloseConditionSL,
      orderSizeType,
      coinm,
      useFixedSLPrices,
      useFixedTPPrices,
      fixedTpPrice,
      fixedSlPrice,
    } = settings;
    const scaleAr =
      (settings?.dcaCondition === DCAConditionEnum.percentage ||
        !settings?.dcaCondition) &&
      [ScaleDcaTypeEnum.adr, ScaleDcaTypeEnum.atr].includes(
        settings?.scaleDcaType ?? ScaleDcaTypeEnum.percentage
      ) &&
      settings?.useDca;
    const useTp = _useTp && dealCloseCondition === CloseConditionEnum.tp;
    const useArTp =
      _useTp && dealCloseCondition === CloseConditionEnum.dynamicAr;
    const useSl = _useSl && dealCloseConditionSL === CloseConditionEnum.tp;
    const useArSl =
      _useSl && dealCloseConditionSL === CloseConditionEnum.dynamicAr;
    // Use a synthetic price when no market price is available so example orders
    // still produce a usable graph with correct relative spacing.
    const latestPrice = math.round(
      inputLatestPrice || 100,
      symbol?.priceAssetPrecision ?? 8
    );

    let baseQty =
      orderSizeType === OrderSizeTypeEnum.usd
        ? math.round(baseOrderSize / (usdPrice * latestPrice), precision, true)
        : orderSizeType === OrderSizeTypeEnum.base
          ? math.round(baseOrderSize, precision, true)
          : orderSizeType === OrderSizeTypeEnum.quote
            ? math.round(
                (baseOrderSize *
                  (coinm ? (symbol?.quoteAsset.minAmount ?? 1) : 1)) /
                  latestPrice,
                precision,
                true
              )
            : math.round(
                symbol?.quoteAsset.minAmount
                  ? symbol.quoteAsset.minAmount / latestPrice
                  : (symbol?.baseAsset.minAmount ?? 0),
                precision,
                true
              );
    let qtyToUse = 0;
    if (
      (orderSizeType === OrderSizeTypeEnum.percFree ||
        orderSizeType === OrderSizeTypeEnum.percTotal) &&
      symbol
    ) {
      const findBalance = (balances ?? []).find(
        (b) =>
          b.asset ===
          (settings.futures
            ? settings.coinm
              ? symbol.baseAsset.name
              : symbol.quoteAsset.name
            : settings.terminalDealType === TerminalDealTypeEnum.import
              ? settings.strategy === StrategyEnum.long
                ? symbol.baseAsset.name
                : symbol.quoteAsset.name
              : settings.strategy === StrategyEnum.short
                ? symbol.baseAsset.name
                : symbol.quoteAsset.name)
      );
      qtyToUse = findBalance
        ? orderSizeType === OrderSizeTypeEnum.percFree
          ? +findBalance.free
          : +findBalance.locked + +findBalance.free
        : 0;
      if (settings.futures) {
        qtyToUse *=
          settings.marginType !== BotMarginTypeEnum.inherit
            ? (settings.leverage ?? 1)
            : 1;
      }
      baseQty = math.round(
        Math.max(
          symbol.quoteAsset.minAmount
            ? symbol.quoteAsset.minAmount / latestPrice
            : symbol.baseAsset.minAmount,
          (qtyToUse * (baseOrderSize / 100)) /
            (settings.futures
              ? settings.coinm
                ? 1
                : latestPrice
              : settings.terminalDealType === TerminalDealTypeEnum.import
                ? settings.strategy === StrategyEnum.long
                  ? 1
                  : latestPrice
                : settings.strategy === StrategyEnum.short
                  ? 1
                  : latestPrice)
        ),
        precision,
        true
      );
    }
    const long = settings.strategy === StrategyEnum.long;
    const ordersSide = long ? BotOrderSideEnum.buy : BotOrderSideEnum.sell;
    let tpPrice = math.round(
      fixedTpPrice && useFixedTPPrices
        ? +fixedTpPrice
        : latestPrice *
            (1 + (settings.strategy === StrategyEnum.long ? 1 : -1) * tpPerc),
      symbol?.priceAssetPrecision ?? 8
    );
    if (tpPrice === latestPrice) {
      tpPrice = math.round(
        latestPrice +
          (settings.strategy === StrategyEnum.long ? 1 : -1) *
            Number(`${1}e-${symbol?.priceAssetPrecision ?? 8}`),
        symbol?.priceAssetPrecision ?? 8
      );
    }
    if (useArTp) {
      const indicator = settings.indicators.find(
        (ind) =>
          ind.indicatorAction === IndicatorAction.closeDeal &&
          ind.section !== IndicatorSection.sl
      );
      if (indicator) {
        let value = dcaArValues.find((d) => d.id === indicator.uuid)?.value;
        if (value && !isNaN(value) && isFinite(value)) {
          value *= +(indicator.dynamicArFactor || '1');
          tpPrice = math.round(
            latestPrice +
              value * (settings.strategy === StrategyEnum.long ? 1 : -1),

            symbol?.priceAssetPrecision ?? 8
          );
        }
      }
    }

    // Add limit order price line only when base order type is LIMIT and a limit price is set
    const limitOrders: DCAGrid[] = [];
    const hasValidLimitPrice =
      context.useLimitPrice &&
      context.startOrderType === OrderTypeEnum.limit &&
      context.baseOrderPrice &&
      context.baseOrderPrice.trim().length > 0;

    // Don't show start order line when limit order is active
    const shouldShowBaseOrder = !hasValidLimitPrice;

    const baseOrder: DCAGrid = {
      qty: baseQty,
      price: latestPrice,
      type: DCAOrderTypeEnum.bo,
      side: ordersSide,
      id: id(20),
      priceDeviation: '0%',
      avgPrice: latestPrice,
      requiredPrice: useTp ? tpPrice : undefined,
      pair: symbol?.pair ?? '',
      strategy: settings.strategy,
      exchange: symbol?.exchange,
    };

    if (hasValidLimitPrice) {
      const limitPrice = Number.parseFloat(String(context.baseOrderPrice));
      if (
        !Number.isNaN(limitPrice) &&
        Number.isFinite(limitPrice) &&
        limitPrice > 0
      ) {
        limitOrders.push({
          qty: baseQty,
          price: limitPrice,
          type: DCAOrderTypeEnum.limit,
          side: ordersSide,
          id: id(20),
          label: '⋮⋮  Limit order',
          pair: symbol?.pair ?? '',
          strategy: settings.strategy,
          exchange: symbol?.exchange,
          onPriceChange: onDrag
            ? (price: number) => {
                context.onDrag?.(price, DCAOrderTypeEnum.limit);
              }
            : undefined,
          draggable: !!onDrag,
        });
      }
    }
    const sellDisplacement = userFee * 2;
    const priceDisplacement = settings.futures
      ? 1 + (userFee ?? 0) * 2 * (long ? 1 : -1)
      : 1 + (long ? 1 : -1) * sellDisplacement;
    if (symbol && baseOrder.qty < symbol.baseAsset.minAmount) {
      baseOrder.qty = math.round(
        symbol.baseAsset.minAmount,
        precision,
        false,
        true
      );
    }
    if (
      symbol &&
      baseOrder.price * baseOrder.qty < symbol.quoteAsset.minAmount
    ) {
      baseOrder.qty = math.round(
        symbol.quoteAsset.minAmount / baseOrder.price,
        precision,
        false,
        true
      );
    }
    if (settings.coinm && symbol) {
      const cont =
        (baseOrder.price * baseOrder.qty) / symbol.quoteAsset.minAmount;
      if (cont < 1) {
        baseOrder.qty = math.round(
          symbol.quoteAsset.minAmount / baseOrder.price,
          precision,
          false,
          true
        );
      } else if (cont % 1 > Number.EPSILON) {
        baseOrder.qty = math.round(
          (math.round(cont, 0) * symbol.quoteAsset.minAmount) / baseOrder.price,
          precision,
          false,
          true
        );
      }
    }
    const mod = baseOrder.qty % (symbol?.baseAsset.step ?? 0);
    if (mod > Number.EPSILON && symbol) {
      baseOrder.qty = math.round(
        baseOrder.qty - mod + symbol.baseAsset.step,
        precision,
        false,
        true
      );
    }
    baseOrder.base = baseOrder.qty;
    baseOrder.quote = math.round(
      baseOrder.qty * latestPrice,
      symbol?.priceAssetPrecision ?? 8
    );
    const tpOrder: DCAGrid = {
      qty: baseOrder.qty,
      price: tpPrice,
      type: DCAOrderTypeEnum.tp,
      side:
        settings.strategy === StrategyEnum.long
          ? BotOrderSideEnum.sell
          : BotOrderSideEnum.buy,
      id: id(20),
      label: settings.trailingTp ? 'Trailing take profit start' : 'TP order',
      pair: symbol?.pair ?? '',
      strategy: settings.strategy,
      exchange: symbol?.exchange,
      onPriceChange: onDrag
        ? (price: number) => {
            context.onDrag?.(price, DCAOrderTypeEnum.tp, undefined, {
              latestPrice,
            });
          }
        : undefined,
      // Dynamic AR take-profit price is derived from the ATR/ADR value, so the
      // line must not be user-draggable.
      draggable: !!onDrag && !useArTp,
    };
    if (
      symbol &&
      tpOrder.price * tpOrder.qty < symbol.quoteAsset.minAmount &&
      !settings.futures
    ) {
      tpOrder.qty = math.round(
        symbol.quoteAsset.minAmount / tpOrder.price,
        precision,
        false,
        true
      );
    }
    let tpOrders = [tpOrder];
    if (settings.useMultiTp && symbol) {
      let restQty = tpOrder.qty;
      let end = false;
      tpOrders = [];
      [...(settings.multiTp ?? [])]
        .sort((a, b) => +a.target - +b.target)
        .map((tp, i) => {
          if (end) {
            return null;
          }
          let price = math.round(
            tp.fixed && useFixedTPPrices
              ? +tp.fixed
              : latestPrice *
                  (1 +
                    (settings.strategy === StrategyEnum.long ? 1 : -1) *
                      (+tp.target / 100)) *
                  (useFixedTPPrices ? 1 : priceDisplacement),
            symbol.priceAssetPrecision
          );
          if (price === latestPrice) {
            price = math.round(
              latestPrice +
                (settings.strategy === StrategyEnum.long ? 1 : -1) *
                  Number(`${1}e-${symbol.priceAssetPrecision}`),
              symbol.priceAssetPrecision
            );
          }
          let qty = math.round(
            baseOrder.qty * (+tp.amount / 100),
            precision,
            true
          );
          if (qty > restQty) {
            qty = math.round(restQty, precision, true);
          }
          if (qty < symbol.baseAsset.minAmount) {
            qty = math.round(symbol.baseAsset.minAmount, precision, true);
          }
          if (price * qty < symbol.quoteAsset.minAmount && !settings.futures) {
            qty = math.round(
              symbol.quoteAsset.minAmount / price,
              precision,
              true
            );
          }

          const modQty = math.remainder(qty, symbol.baseAsset.step);
          if (modQty !== 0) {
            qty = math.round(
              qty - modQty + symbol.baseAsset.step,
              precision,
              true
            );
          }
          restQty -= qty;
          if (
            restQty < symbol.baseAsset.minAmount ||
            restQty * price < symbol.quoteAsset.minAmount ||
            restQty < 0
          ) {
            end = true;
            qty =
              restQty > 0 && restQty > symbol.baseAsset.step
                ? math.round(qty + restQty, precision, true)
                : qty;
          }
          return {
            ...tpOrder,
            qty,
            price,
            id: id(20),
            label: `TP order ${i + 1}`,
            tpSlTarget: tp.uuid,
            onPriceChange: onDrag
              ? (price: number) => {
                  context.onDrag?.(price, DCAOrderTypeEnum.tp, i, {
                    latestPrice,
                  });
                }
              : undefined,
            draggable: !!onDrag && !useArTp,
          };
        })
        .forEach((o) => {
          if (o) {
            tpOrders.push(o);
          }
        });
    }
    if (settings.profitCurrency === 'base') {
      const qty = math.round(
        (baseOrder.qty * latestPrice) / tpOrder.price,
        precision
      );
      tpOrder.qty =
        settings.strategy === StrategyEnum.long
          ? Math.min(tpOrder.qty, qty)
          : Math.max(tpOrder.qty, qty);
    }

    const gridStep = latestPrice * step;
    const minGridStep =
      settings.dcaCondition === DCAConditionEnum.percentage &&
      (settings.scaleDcaType === ScaleDcaTypeEnum.atr ||
        settings.scaleDcaType === ScaleDcaTypeEnum.adr)
        ? latestPrice * minimumDeviation
        : 0;
    let orders: DCAGrid[] = [];
    if (settings.useDca && symbol) {
      const ordersCount =
        settings.dcaCondition === DCAConditionEnum.indicators
          ? settings.indicators.filter(
              (i) => i.indicatorAction === IndicatorAction.startDca
            ).length
          : settings.dcaCondition === DCAConditionEnum.custom
            ? (settings.dcaCustom ?? []).length
            : parseInt(settings.ordersCount);
      const useVolumeChange =
        settings.dcaVolumeBaseOn === DCAVolumeType.change &&
        settings.useTp &&
        settings.dealCloseCondition === CloseConditionEnum.tp &&
        settings.tpPerc &&
        !settings.useMultiTp &&
        ![OrderSizeTypeEnum.percFree, OrderSizeTypeEnum.percTotal].includes(
          orderSizeType
        );
      const volumeChangeValue =
        +(settings.dcaVolumeRequiredChange ?? tpPerc * 100) *
        (long ? 1 + Math.min(0.02, tpPerc) : 1 - Math.min(0.02, tpPerc));
      let maxVolumeSize = +(settings.dcaVolumeMaxValue ?? '-1');
      if (maxVolumeSize < 0) {
        maxVolumeSize = Infinity;
      }

      for (let i = 1; i <= ordersCount; i++) {
        if (scaleAr && !dcaArValues.length) {
          continue;
        }
        const stepVal =
          settings.dcaCondition === DCAConditionEnum.indicators ||
          settings.dcaCondition === DCAConditionEnum.custom
            ? 1
            : stepScale ** (i - 1);
        const volumeVal =
          settings.dcaCondition === DCAConditionEnum.indicators ||
          settings.dcaCondition === DCAConditionEnum.custom ||
          useVolumeChange
            ? 1
            : volumeScale ** (i - 1);
        let price = math.round(
          (i === 1 ? latestPrice : (orders[orders.length - 1]?.price ?? 0)) -
            (settings.strategy === StrategyEnum.long ? 1 : -1) *
              gridStep *
              stepVal,
          symbol.priceAssetPrecision
        );
        if (settings.dcaCondition === DCAConditionEnum.indicators) {
          const indicatorValue =
            +(
              settings.indicators.filter(
                (ind) => ind.indicatorAction === IndicatorAction.startDca
              )[i - 1]?.minPercFromLast ?? '100'
            ) / 100;
          price = math.round(
            (i === 1 ? latestPrice : orders[orders.length - 1].price) *
              (settings.strategy === StrategyEnum.long
                ? 1 - indicatorValue
                : 1 + indicatorValue),

            symbol.priceAssetPrecision
          );
        }
        if (scaleAr) {
          const indicator = settings.indicators.find(
            (ind) => ind.indicatorAction === IndicatorAction.startDca
          );
          if (indicator) {
            let value = dcaArValues.find((d) => d.id === indicator.uuid)?.value;
            if (value && !isNaN(value) && isFinite(value)) {
              const stepAr = i < 2 ? 1 : stepScale ** (i - 2);
              value *= +(indicator.dynamicArFactor || '1') * stepAr;
              const lastPrice =
                i === 1 ? latestPrice : (orders[orders.length - 1]?.price ?? 0);
              price = math.round(
                lastPrice +
                  value * (settings.strategy === StrategyEnum.long ? -1 : 1),
                symbol.priceAssetPrecision
              );
              const priceMinDeviation = minGridStep
                ? math.round(
                    lastPrice +
                      (settings.strategy === StrategyEnum.long ? -1 : 1) *
                        minGridStep *
                        stepVal,
                    symbol.priceAssetPrecision
                  )
                : 0;
              if (priceMinDeviation) {
                price =
                  settings.strategy === StrategyEnum.long
                    ? Math.min(price, priceMinDeviation)
                    : Math.max(price, priceMinDeviation);
              }
            }
          } else {
            continue;
          }
        }
        if (settings.dcaCondition === DCAConditionEnum.custom) {
          const dcaCustomValue =
            +((settings.dcaCustom ?? [])[i - 1]?.step ?? '1') / 100;
          price = math.round(
            (i === 1 ? latestPrice : orders[orders.length - 1].price) *
              (settings.strategy === StrategyEnum.long
                ? 1 - dcaCustomValue
                : 1 + dcaCustomValue),

            symbol.priceAssetPrecision
          );
        }
        if (i === 1) {
          if (price === baseOrder.price) {
            price = math.round(
              baseOrder.price +
                (settings.strategy === StrategyEnum.long ? -1 : 1) *
                  Number(`${1}e-${symbol.priceAssetPrecision}`),
              symbol.priceAssetPrecision
            );
          }
        }
        if (i > 1) {
          if (price === orders[orders.length - 1].price) {
            price = math.round(
              orders[orders.length - 1].price +
                (settings.strategy === StrategyEnum.long ? -1 : 1) *
                  Number(`${1}e-${symbol.priceAssetPrecision}`),
              symbol.priceAssetPrecision
            );
          }
        }
        if (price <= 0) {
          break;
        }
        const findBreakpoint = breakpoints
          .sort((a, b) => (long ? b.price - a.price : a.price - b.price))
          .find((b) => b.price === price);
        if (findBreakpoint) {
          price = math.round(
            findBreakpoint.displacedPrice,
            symbol.priceAssetPrecision
          );
        }
        let orderSize = _orderSize;
        if (
          settings.dcaCondition === DCAConditionEnum.indicators &&
          !useVolumeChange
        ) {
          orderSize =
            +(
              settings.indicators.filter(
                (ind) => ind.indicatorAction === IndicatorAction.startDca
              )[i - 1]?.orderSize ?? '0'
            ) || _orderSize;
        }
        if (
          settings.dcaCondition === DCAConditionEnum.custom &&
          !useVolumeChange
        ) {
          orderSize =
            +((settings.dcaCustom ?? [])[i - 1]?.size ?? '0') || _orderSize;
        }
        if (useVolumeChange) {
          const quote =
            baseOrder.price * baseOrder.qty +
            orders.reduce((acc, v) => acc + v.price * v.qty, 0);
          const base =
            baseOrder.qty + orders.reduce((acc, v) => acc + v.qty, 0);
          if (
            settings.dcaVolumeRequiredChangeRef ===
            DcaVolumeRequiredChangeRef.avg
          ) {
            const newAvg =
              price * (1 + (volumeChangeValue / 100) * (long ? 1 : -1));
            const deno = long ? price - newAvg : newAvg - price;
            orderSize = (newAvg * base - quote) / deno;
          } else {
            const c =
              ((volumeChangeValue / 100 + 1) * price) /
              (1 + tpPerc * (long ? 1 : -1));
            const deno = long ? price - c : c - price;
            orderSize = (c * base - quote) / deno;
          }
          if (orderSizeType === OrderSizeTypeEnum.quote) {
            orderSize *= price;
          }
          orderSize = Math.min(maxVolumeSize, orderSize);
        }
        let qty =
          orderSizeType === OrderSizeTypeEnum.usd
            ? math.round(orderSize / (usdPrice * latestPrice), precision)
            : orderSizeType === OrderSizeTypeEnum.quote
              ? math.round(
                  ((orderSize * (coinm ? symbol.quoteAsset.minAmount : 1)) /
                    price) *
                    volumeVal,
                  precision
                )
              : orderSizeType === OrderSizeTypeEnum.base
                ? math.round(orderSize * volumeVal, precision)
                : orderSizeType === OrderSizeTypeEnum.percFree ||
                    orderSizeType === OrderSizeTypeEnum.percTotal
                  ? percOrderSize !== 0
                    ? math.round(percOrderSize * volumeVal, precision)
                    : math.round(
                        ((qtyToUse * (+orderSize / 100)) /
                          (settings.futures
                            ? settings.coinm
                              ? 1
                              : price
                            : settings.terminalDealType ===
                                TerminalDealTypeEnum.import
                              ? settings.strategy === StrategyEnum.long
                                ? 1
                                : price
                              : settings.strategy === StrategyEnum.short
                                ? 1
                                : price)) *
                          volumeVal,
                        precision
                      )
                  : math.round(
                      Math.max(
                        symbol.quoteAsset.minAmount
                          ? symbol.quoteAsset.minAmount / latestPrice
                          : symbol.baseAsset.minAmount,
                        (qtyToUse * orderSize) / 100 / latestPrice
                      ),
                      precision
                    );
        if (symbol.baseAsset.maxAmount && qty > symbol.baseAsset.maxAmount) {
          break;
        }
        if (qty < symbol.baseAsset.minAmount) {
          qty = symbol.baseAsset.minAmount;
        }
        if (price * qty < symbol.quoteAsset.minAmount) {
          qty = math.round(
            symbol.quoteAsset.minAmount / price,
            precision,
            false,
            true
          );
        }
        if (settings.coinm) {
          const cont = (price * qty) / symbol.quoteAsset.minAmount;
          if (cont < 1) {
            qty = math.round(
              symbol.quoteAsset.minAmount / price,
              precision,
              false,
              true
            );
          } else if (cont % 1 > Number.EPSILON) {
            qty = math.round(
              (math.round(cont, 0) * symbol.quoteAsset.minAmount) / price,
              precision,
              false,
              true
            );
          }
        }
        const modQty = qty % symbol.baseAsset.step;
        if (modQty !== 0) {
          qty = math.round(
            qty - modQty + symbol.baseAsset.step,
            precision,
            false,
            true
          );
        }
        const base =
          baseOrder.qty + orders.reduce((acc, v) => acc + v.qty, 0) + qty;
        const quote =
          baseOrder.price * baseOrder.qty +
          orders.reduce((acc, v) => acc + v.price * v.qty, 0) +
          qty * price;
        const avgPrice = math.round(quote / base, symbol.priceAssetPrecision);
        // Only make DCA lines draggable in custom mode, not scaled mode
        const isCustomMode = settings.dcaCondition === DCAConditionEnum.custom;
        const prevPriceForDrag =
          i === 1
            ? baseOrder.price
            : orders.length > 0
              ? orders[orders.length - 1].price
              : baseOrder.price;
        orders.push({
          qty,
          price,
          type: DCAOrderTypeEnum.dca,
          side: ordersSide,
          id: id(20),
          priceDeviation: `${math.round(
            ((latestPrice - price) / latestPrice) * 100,
            2
          )}%`,
          avgPrice,
          requiredPrice: useTp
            ? math.round(
                avgPrice * (1 + tpPerc * (long ? 1 : -1)),
                symbol.priceAssetPrecision
              )
            : undefined,
          note:
            price < 0
              ? `This order won't be placed, because price deviation more than 100%`
              : qty * price < symbol.quoteAsset.minAmount
                ? `This order won't be placed, because order amount is less than min allowed by the exchange: ${symbol.quoteAsset.minAmount} ${symbol.quoteAsset.name}`
                : '',
          base: math.round(base, precision),
          quote: math.round(quote, symbol.priceAssetPrecision),
          pair: symbol?.pair ?? '',
          strategy: settings.strategy,
          exchange: symbol?.exchange,
          onPriceChange:
            onDrag && isCustomMode
              ? (p: number, _id?: string, _idx?: number) => {
                  // We compute the DCA order index based on iteration (i) below when consuming orders
                  // For simplicity, call onDrag with the DCA type and the current iteration index (i-1)
                  // (the caller will pass the index when it registers lines)
                  // Here we just forward price and type; the example-orders caller will attach index where known
                  context.onDrag?.(p, DCAOrderTypeEnum.dca, i - 1, {
                    prevPrice: prevPriceForDrag,
                    entryPrice: baseOrder.price,
                    latestPrice,
                  });
                }
              : undefined,
          draggable: !!(onDrag && isCustomMode),
        });
      }
      if (!all && settings.dcaCondition === DCAConditionEnum.indicators) {
        // Indicator-driven DCA never rests on the exchange: the bot fires a
        // MARKET order once a startDca indicator triggers AND price has moved
        // at least `minPercFromLast` from the last fill. So every level here is
        // a projected threshold, not a resting order — `useSmartOrders` /
        // `activeOrdersCount` have no effect for this condition (the backend
        // strips dealRegular orders outright, see dcaHelper
        // `generateCurrentDealOrders`). Mark them all as projections and label
        // them for what they are rather than falling through to "Smart order".
        orders = orders.map((o) => ({
          ...o,
          grey: true,
          greyLabel: DCA_MIN_PERC_LABEL,
        }));
      } else if (!all && useSmartOrders) {
        const sorted = [...orders].sort((a, b) =>
          settings.strategy === StrategyEnum.long
            ? b.price - a.price
            : a.price - b.price
        );
        const activeCount = parseInt(activeOrdersCount);
        const active = sorted.slice(0, activeCount);
        const smart = sorted.slice(activeCount).map((o) => ({
          ...o,
          grey: true,
          // `dcaByMarket` levels are triggered by price and sent as market
          // orders too, so they aren't smart orders either (legacy main-dash
          // labelled these "DCA by market" — keep parity).
          ...(settings.dcaByMarket ? { greyLabel: DCA_BY_MARKET_LABEL } : {}),
        }));
        orders = [...active, ...smart];
      }
    }
    const useOutsideSl = settings.useSl && !settings.moveSL;
    let finalBreakeven =
      orders.length && slFromFinalBreakeven
        ? (orders[orders.length - 1].avgPrice ?? latestPrice)
        : latestPrice;
    const baseSlOn =
      settings.baseSlOn && !settings.trailingSl && !settings.moveSL
        ? settings.baseSlOn
        : BaseSlOnEnum.avg;
    const slOrder: DCAGrid = {
      ...tpOrder,
      label: undefined,
      price: math.round(
        fixedSlPrice && useFixedSLPrices
          ? +fixedSlPrice
          : (baseSlOn === BaseSlOnEnum.avg
              ? finalBreakeven
              : inputLatestPrice) *
              (1 +
                (settings.strategy === StrategyEnum.long ? 1 : -1) * slPerc +
                (useFixedSLPrices || settings.trailingSl ? 0 : userFee * 2)),
        symbol?.priceAssetPrecision ?? 8
      ),
      type: DCAOrderTypeEnum.sl,
      id: id(20),
      onPriceChange: onDrag
        ? (price: number) => {
            context.onDrag?.(price, DCAOrderTypeEnum.sl, undefined, {
              latestPrice,
            });
          }
        : undefined,
      // Dynamic AR stop-loss price is derived from the ATR/ADR value, so the
      // line must not be user-draggable.
      draggable: !!onDrag && !useArSl,
    };
    if (useArSl) {
      const indicator = settings.indicators.find(
        (ind) =>
          ind.indicatorAction === IndicatorAction.closeDeal &&
          ind.section === IndicatorSection.sl
      );
      if (indicator) {
        let value = dcaArValues.find((d) => d.id === indicator.uuid)?.value;
        if (value && !isNaN(value) && isFinite(value)) {
          value *= +(indicator.dynamicArFactor || '1');
          slOrder.price = math.round(
            latestPrice +
              value * (settings.strategy === StrategyEnum.long ? -1 : 1),

            symbol?.priceAssetPrecision ?? 8
          );
        }
      }
    }
    if (orders.length && slFromFinalBreakeven && useOutsideSl && outsideSl) {
      /*  const tempOrders = [...orders] */
      let i = 0;
      for (const o of orders) {
        const order = orders[i];
        finalBreakeven = order.avgPrice ?? latestPrice;
        slOrder.price = math.round(
          useArSl
            ? slOrder.price
            : fixedSlPrice && useFixedSLPrices
              ? +fixedSlPrice
              : (baseSlOn === BaseSlOnEnum.avg
                  ? finalBreakeven
                  : inputLatestPrice) *
                (1 +
                  (settings.strategy === StrategyEnum.long ? 1 : -1) * slPerc +
                  (useFixedSLPrices ? 0 : userFee * 2)),
          symbol?.priceAssetPrecision ?? 8
        );
        const leftOrders = orders.filter(
          (_o) =>
            _o.id !== o.id &&
            o.type === DCAOrderTypeEnum.dca &&
            (long
              ? o.price > _o.price && _o.price > slOrder.price
              : o.price < _o.price && _o.price < slOrder.price)
        );
        if (leftOrders.length === 0) {
          break;
        }
        i++;
      }
    }
    let slOrders = [slOrder];
    if (
      settings.useMultiSl &&
      symbol &&
      settings.dealCloseConditionSL === CloseConditionEnum.tp
    ) {
      let restQty = slOrder.qty;
      let end = false;
      slOrders = [];
      [...(settings.multiSl ?? [])]
        .sort((a, b) => +b.target - +a.target)
        .filter((tp) => !(tpSlTargetFilled ?? []).includes(tp.uuid))
        .map((tp, i) => {
          if (end) {
            return null;
          }
          let price = math.round(
            tp.fixed && useFixedSLPrices
              ? +tp.fixed
              : latestPrice *
                  (1 +
                    (settings.strategy === StrategyEnum.long ? 1 : -1) *
                      (+tp.target / 100)) *
                  (useFixedSLPrices ? 1 : priceDisplacement),
            symbol.priceAssetPrecision
          );
          if (price === latestPrice) {
            price = math.round(
              latestPrice +
                (settings.strategy === StrategyEnum.long ? 1 : -1) *
                  Number(`${1}e-${symbol.priceAssetPrecision}`),
              symbol.priceAssetPrecision
            );
          }
          let qty = math.round(
            baseOrder.qty * (+tp.amount / 100),
            precision,
            true
          );
          if (qty > restQty) {
            qty = math.round(restQty, precision, true);
          }
          if (qty < symbol.baseAsset.minAmount) {
            qty = math.round(symbol.baseAsset.minAmount, precision, true);
          }
          if (price * qty < symbol.quoteAsset.minAmount && !settings.futures) {
            qty = math.round(
              symbol.quoteAsset.minAmount / price,
              precision,
              true
            );
          }

          const modQty = math.remainder(qty, symbol.baseAsset.step);
          if (modQty !== 0) {
            qty = math.round(
              qty - modQty + symbol.baseAsset.step,
              precision,
              true
            );
          }
          restQty -= qty;

          if (
            restQty < symbol.baseAsset.minAmount ||
            restQty * price < symbol.quoteAsset.minAmount ||
            restQty < 0
          ) {
            end = true;
            qty =
              restQty > 0 && restQty > symbol.baseAsset.step
                ? math.round(qty + restQty, precision, true)
                : qty;
          }

          return {
            ...slOrder,
            qty,
            price,
            id: id(20),
            label: `SL order ${i + 1}`,
            tpSlTarget: tp.uuid,
            onPriceChange: onDrag
              ? (price: number) => {
                  context.onDrag?.(price, DCAOrderTypeEnum.sl, i, {
                    latestPrice,
                  });
                }
              : undefined,
            draggable: !!onDrag && !useArSl,
          };
        })
        .forEach((o) => {
          if (o) {
            slOrders.push(o);
          }
        });
    }
    const result = [
      ...orders,
      ...(shouldShowBaseOrder ? [baseOrder] : []),
      ...limitOrders,
      ...tpOrders,
      ...slOrders,
    ]
      .filter(
        (o) =>
          (!useTp && !useArTp ? o.type !== DCAOrderTypeEnum.tp : true) &&
          (!useSl && !useArSl ? o.type !== DCAOrderTypeEnum.sl : true)
      )
      .flat()
      .sort((a, b) =>
        settings.strategy === StrategyEnum.long
          ? b.price - a.price
          : a.price - b.price
      );
    if ((useOutsideSl && outsideSl) || useArSl) {
      const slLevel = result
        .filter((o) => o.type === DCAOrderTypeEnum.sl)
        .sort((a, b) =>
          long ? b.price - a.price : a.price - b.price
        )[0]?.price;
      if (slLevel) {
        orders = result.map((r) => ({
          ...r,
          note:
            r.type === DCAOrderTypeEnum.dca &&
            (long ? r.price <= slLevel : r.price >= slLevel)
              ? 'Order wont be placed, because SL level is reached'
              : '',
        }));
        return orders;
      }
    }
    return result;
  }
  return [];
}
export async function createComboOrders(
  params: UpdateOrdersParams | undefined = {},
  context: ExampleOrdersStoreContext = defaultContext
): Promise<DCAGrid[]> {
  const {
    all = false,
    outsideSl = false,
    updatedComboAdjustments = false,
    newSell = true,
    futuresPrecision = true,
  } = params;
  const {
    settings: _settings,
    symbol,
    errors,
    botVars,
    usdPrice,
    inputLatestPrice,
    balances,
    userFee,
    breakpoints,
    percOrderSize,
    _minigrids,
  } = context;
  if (!Object.entries(errors).filter(([_k, v]) => !!v).length) {
    let settings = JSON.parse(JSON.stringify(_settings)) as LocalDCASettings;
    settings = await replaceVarsInSettings(settings, botVars);
    const baseOrderSize = parseFloat(settings.baseOrderSize);
    const orderSize = parseFloat(settings.orderSize);
    const precision = symbol ? getAssetPrecision(symbol, 'base') : 8;
    const quotePrecision = symbol ? symbol.priceAssetPrecision : 8;
    const step = parseFloat(settings.step) / 100;
    const baseStep = parseFloat(settings.baseStep ?? settings.step) / 100;
    const stepScale = parseFloat(settings.stepScale);
    const volumeScale = parseFloat(settings.volumeScale);
    const feeFactor = 1 + (settings.futures ? 0 : userFee);
    const { comboUseSmartGrids } = settings;
    const comboSmartGridsCount = parseFloat(
      settings.comboSmartGridsCount ?? '0'
    );
    const mingrids = [..._minigrids].sort((a, b) =>
      settings.strategy === StrategyEnum.long
        ? a.settings.lowPrice - b.settings.lowPrice
        : b.settings.lowPrice - a.settings.lowPrice
    );
    const {
      activeOrdersCount,
      useTp: _useTp,
      dealCloseCondition,
      useSmartOrders,
      useSl: _useSl,
      dealCloseConditionSL,
      orderSizeType,
      coinm,
      comboActiveMinigrids,
      useActiveMinigrids,
    } = settings;
    const useTp = _useTp && dealCloseCondition === CloseConditionEnum.tp;
    const useSl = _useSl && dealCloseConditionSL === CloseConditionEnum.tp;
    const latestPrice = math.round(
      inputLatestPrice || 100,
      symbol?.priceAssetPrecision ?? 8
    );
    const feeOrder = settings.futures
      ? undefined
      : typeof settings.feeOrder !== 'undefined' && settings.feeOrder
        ? false
        : undefined;
    let baseQty =
      orderSizeType === OrderSizeTypeEnum.usd
        ? math.round(baseOrderSize / (usdPrice * latestPrice), precision, true)
        : orderSizeType === OrderSizeTypeEnum.base
          ? math.round(baseOrderSize, precision, true)
          : orderSizeType === OrderSizeTypeEnum.quote
            ? math.round(
                (baseOrderSize *
                  (coinm ? (symbol?.quoteAsset.minAmount ?? 1) : 1)) /
                  latestPrice,
                precision,
                true
              )
            : math.round(
                symbol?.quoteAsset.minAmount
                  ? symbol.quoteAsset.minAmount / latestPrice
                  : (symbol?.baseAsset.minAmount ?? 0),
                precision,
                true
              );
    let qtyToUse = 0;
    if (
      orderSizeType === OrderSizeTypeEnum.percFree ||
      orderSizeType === OrderSizeTypeEnum.percTotal
    ) {
      const findBalance = (balances ?? []).find(
        (b) =>
          b.asset ===
          (settings.futures
            ? coinm
              ? symbol?.baseAsset.name
              : symbol?.quoteAsset.name
            : settings.terminalDealType === TerminalDealTypeEnum.import
              ? settings.strategy === StrategyEnum.long
                ? symbol?.baseAsset.name
                : symbol?.quoteAsset.name
              : settings.strategy === StrategyEnum.short
                ? symbol?.baseAsset.name
                : symbol?.quoteAsset.name)
      );
      qtyToUse = findBalance
        ? orderSizeType === OrderSizeTypeEnum.percFree
          ? +findBalance.free
          : +findBalance.locked + +findBalance.free
        : 0;
      if (settings.futures) {
        qtyToUse *=
          settings.marginType !== BotMarginTypeEnum.inherit
            ? (settings.leverage ?? 1)
            : 1;
      }
      baseQty = math.round(
        Math.max(
          symbol?.quoteAsset.minAmount
            ? symbol.quoteAsset.minAmount / latestPrice
            : (symbol?.baseAsset.minAmount ?? 0),
          (qtyToUse * (baseOrderSize / 100)) /
            (settings.futures
              ? coinm
                ? 1
                : latestPrice
              : settings.terminalDealType === TerminalDealTypeEnum.import
                ? settings.strategy === StrategyEnum.long
                  ? 1
                  : latestPrice
                : settings.strategy === StrategyEnum.short
                  ? 1
                  : latestPrice)
        ),
        precision,
        true
      );
    }
    const long = settings.strategy === StrategyEnum.long;
    const ordersSide = long ? BotOrderSideEnum.buy : BotOrderSideEnum.sell;
    const baseOrder: DCAGrid = {
      qty: baseQty,
      price: latestPrice,
      type: DCAOrderTypeEnum.bo,
      side: ordersSide,
      id: id(20),
      priceDeviation: '0%',
      avgPrice: latestPrice,
      requiredPrice: undefined,
      pair: symbol?.pair ?? '',
      strategy: settings.strategy,
      exchange: symbol?.exchange,
    };
    if (
      symbol &&
      baseOrder.price * baseOrder.qty < symbol.quoteAsset.minAmount
    ) {
      baseOrder.qty = math.round(
        symbol.quoteAsset.minAmount / baseOrder.price,
        precision,
        false,
        true
      );
    }

    if (coinm && symbol) {
      const cont =
        (baseOrder.price * baseOrder.qty) / symbol.quoteAsset.minAmount;
      if (cont < 1) {
        baseOrder.qty = math.round(
          symbol.quoteAsset.minAmount / baseOrder.price,
          precision,
          false,
          true
        );
      } else if (cont % 1 > Number.EPSILON) {
        baseOrder.qty = math.round(
          (math.round(cont, 0) * symbol.quoteAsset.minAmount) / baseOrder.price,
          precision,
          false,
          true
        );
      }
    }
    const mod = baseOrder.qty % (symbol?.baseAsset.step ?? 0);
    if (mod > Number.EPSILON && symbol) {
      baseOrder.qty = math.round(
        baseOrder.qty - mod + symbol.baseAsset.step,
        precision,
        false,
        true
      );
    }
    baseOrder.base = baseOrder.qty;
    baseOrder.quote = math.round(
      baseOrder.qty * latestPrice,
      symbol?.priceAssetPrecision ?? 8
    );
    baseOrder.minigridBudget =
      +(coinm ? baseOrder.base : (baseOrder.quote ?? '0')) *
      (settings.futures ? 1 : !long ? 2 - feeFactor : 1);

    const gridSettings = {
      lowPrice: long ? `${baseOrder.price}` : `${baseOrder.price * (1 - step)}`,
      topPrice: long ? `${baseOrder.price * (1 + step)}` : `${baseOrder.price}`,
      budget: `${baseOrder.minigridBudget}`,
      levels: `${+(settings.gridLevel ?? '1')}`,
      useStartPrice: false,
      startPrice: undefined,
      updatedBudget: true,
      forceLocal: false,
      symbol,
      _latestPrice: baseOrder.price,
      userFee,
      sellDisplacement: `${
        (mingrids?.[0]?.settings.sellDisplacement ?? userFee * 2) * 100
      }`,
      gridType: 'arithmetic' as const,
      initialPrice: baseOrder.price,
      futures: !!settings.futures,
      profitCurrency: settings.futures
        ? 'quote'
        : settings.profitCurrency /*  'quote' as const */,
      orderFixedIn: settings.futures
        ? settings.coinm
          ? ('quote' as const)
          : ('base' as const)
        : settings.profitCurrency === 'quote'
          ? ('base' as const)
          : ('quote' as const),
      coinm: !!coinm,
      futuresStrategy: long
        ? FuturesStrategyEnum.long
        : FuturesStrategyEnum.short,
      useOrderInAdvance: false,
      combo: true,
    };
    const gridErrors = errors;
    const baseGridSettings = {
      ...gridSettings,
      lowPrice: long
        ? `${baseOrder.price}`
        : `${baseOrder.price * (1 - baseStep)}`,
      topPrice: long
        ? `${baseOrder.price * (1 + baseStep)}`
        : `${baseOrder.price}`,
      levels: `${+(settings.baseGridLevels ?? '1')}`,
    };
    let grids: DCAGrid[] = createGridOrders(
      baseGridSettings,
      gridErrors,
      true,
      false,
      false,
      true,
      feeOrder,
      newSell
    ).map((g) => ({
      ...g,
      type: DCAOrderTypeEnum.grid,
      relatedToLevel: 0,
      pair: symbol?.pair ?? '',
      strategy: settings.strategy,
      exchange: symbol?.exchange,
    }));
    const gridStep = latestPrice * step;
    const useBase = long;

    if (coinm && symbol) {
      const qtyByGrids = math.round(
        (grids.reduce(
          (acc, v) =>
            acc +
            Math.max(
              math.round(
                (v.qty * v.price) / symbol.quoteAsset.minAmount,
                0,
                true
              ),
              0
            ),
          0
        ) *
          symbol.quoteAsset.minAmount) /
          latestPrice,
        precision
      );
      baseOrder.qty = qtyByGrids;
      baseOrder.quote = math.round(
        baseOrder.qty * baseOrder.price,
        symbol.priceAssetPrecision
      );
      baseOrder.base = baseOrder.qty;
    } else {
      const qtyByGrids =
        useBase || settings.futures
          ? math.round(
              grids.reduce((acc, v) => acc + v.qty, 0) *
                (settings.futures ? 1 : feeFactor),
              precision,
              false,
              !settings.futures
            )
          : math.round(
              grids.reduce((acc, v) => acc + v.qty * v.price, 0),
              quotePrecision,
              false,
              true
            );
      if (
        (useBase && qtyByGrids > baseOrder.qty) ||
        (!useBase && qtyByGrids > baseOrder.quote * (2 - feeFactor)) ||
        settings.futures
      ) {
        grids =
          settings.futures || !useBase
            ? grids
            : createGridOrders(
                {
                  ...baseGridSettings,
                  budget: `${
                    coinm ? qtyByGrids : baseOrder.price * qtyByGrids
                  }`,
                },
                gridErrors,
                true,
                undefined,
                undefined,
                undefined,
                feeOrder,
                newSell
              ).map((g) => ({
                ...g,
                type: DCAOrderTypeEnum.grid,
                relatedToLevel: 0,
                pair: symbol?.pair ?? '',
                strategy: settings.strategy,
                exchange: symbol?.exchange,
              }));
        baseOrder.qty =
          useBase || settings.futures
            ? updatedComboAdjustments
              ? math.round(
                  qtyByGrids * feeFactor,
                  precision,
                  false,
                  futuresPrecision ? !settings.futures : true
                )
              : qtyByGrids
            : math.round(
                (qtyByGrids / baseOrder.price) * feeFactor,
                precision,
                false,
                true
              );
        baseOrder.quote =
          useBase || settings.futures
            ? math.round(
                baseOrder.qty * baseOrder.price,
                symbol?.priceAssetPrecision ?? 8
              )
            : qtyByGrids * feeFactor;
        baseOrder.base = baseOrder.qty;
      }
    }
    let orders: DCAGrid[] = [];
    if (settings.useDca && symbol) {
      for (let i = 1; i <= parseInt(settings.ordersCount); i++) {
        const stepVal = stepScale ** (i - 1);
        const volumeVal = volumeScale ** (i - 1);
        let price = math.round(
          (i === 1 ? latestPrice : orders[orders.length - 1].price) -
            (settings.strategy === StrategyEnum.long ? 1 : -1) *
              gridStep *
              stepVal,
          symbol.priceAssetPrecision
        );
        if (i === 1) {
          if (price === baseOrder.price) {
            price = math.round(
              baseOrder.price +
                (settings.strategy === StrategyEnum.long ? -1 : 1) *
                  Number(`${1}e-${symbol.priceAssetPrecision}`),
              symbol.priceAssetPrecision
            );
          }
        }
        if (i > 1) {
          if (price === orders[orders.length - 1].price) {
            price = math.round(
              orders[orders.length - 1].price +
                (settings.strategy === StrategyEnum.long ? -1 : 1) *
                  Number(`${1}e-${symbol.priceAssetPrecision}`),
              symbol.priceAssetPrecision
            );
          }
        }
        if (price <= 0) {
          break;
        }
        const findBreakpoint = breakpoints
          .sort((a, b) => (long ? b.price - a.price : a.price - b.price))
          .find((b) => b.price === price);
        if (findBreakpoint) {
          price = math.round(
            findBreakpoint.displacedPrice,
            symbol.priceAssetPrecision
          );
        }
        let qty =
          orderSizeType === OrderSizeTypeEnum.usd
            ? math.round(
                baseOrderSize / (usdPrice * latestPrice),
                precision,
                true
              )
            : orderSizeType === OrderSizeTypeEnum.quote
              ? math.round(
                  ((orderSize * (coinm ? symbol.quoteAsset.minAmount : 1)) /
                    price) *
                    volumeVal,
                  precision
                )
              : orderSizeType === OrderSizeTypeEnum.base
                ? math.round(orderSize * volumeVal, precision)
                : orderSizeType === OrderSizeTypeEnum.percFree ||
                    orderSizeType === OrderSizeTypeEnum.percTotal
                  ? percOrderSize !== 0
                    ? math.round(percOrderSize * volumeVal, precision)
                    : math.round(
                        ((qtyToUse * (+orderSize / 100)) /
                          (settings.futures
                            ? coinm
                              ? 1
                              : price
                            : settings.terminalDealType ===
                                TerminalDealTypeEnum.import
                              ? settings.strategy === StrategyEnum.long
                                ? 1
                                : price
                              : settings.strategy === StrategyEnum.short
                                ? 1
                                : price)) *
                          volumeVal,
                        precision
                      )
                  : math.round(
                      Math.max(
                        symbol.quoteAsset.minAmount
                          ? symbol.quoteAsset.minAmount / price
                          : symbol.baseAsset.minAmount,
                        (qtyToUse * orderSize) / 100 / price
                      ),
                      precision
                    );
        if (qty < symbol.baseAsset.minAmount) {
          qty = symbol.baseAsset.minAmount;
        }
        if (price * qty < symbol.quoteAsset.minAmount) {
          qty = math.round(
            symbol.quoteAsset.minAmount / price,
            precision,
            false,
            true
          );
        }
        if (coinm) {
          const cont = (price * qty) / symbol.quoteAsset.minAmount;
          if (cont < 1) {
            qty = math.round(
              symbol.quoteAsset.minAmount / price,
              precision,
              false,
              true
            );
          } else if (cont % 1 > Number.EPSILON) {
            qty = math.round(
              (math.round(cont, 0) * symbol.quoteAsset.minAmount) / price,
              precision,
              false,
              true
            );
          }
        }
        const modQty = math.remainder(qty, symbol.baseAsset.step);
        if (modQty !== 0) {
          qty = math.round(
            qty - modQty + symbol.baseAsset.step,
            precision,
            false,
            true
          );
        }
        const baseAdditional = 0; /*  ??
            (settings.futures
              ? 0
              : symbol.baseAsset.minAmount *
                  +(settings.baseGridLevels || settings.gridLevel || '1') +
                symbol.baseAsset.minAmount *
                  (1 + orders.length) *
                  +(settings.gridLevel || '1')) */
        const quoteAdditional = 0; /* ??
            (settings.futures
              ? 0
              : symbol.baseAsset.minAmount *
                  baseOrder.price *
                  +(settings.baseGridLevels || settings.gridLevel || '1') +
                orders.reduce(
                  (acc, v) =>
                    acc +
                    v.price *
                      symbol.baseAsset.minAmount *
                      +(settings.gridLevel || '1'),
                  0
                ) +
                price *
                  symbol.baseAsset.minAmount *
                  +(settings.gridLevel || '1')) */
        let base =
          (i === 1 ? baseOrder.qty : 0) +
          (orders?.[orders.length - 1]?.base ?? 0) +
          qty +
          baseAdditional;
        let quote =
          (i === 1 ? baseOrder.qty * baseOrder.price : 0) +
          (orders?.[orders.length - 1]?.quote ?? 0) +
          qty * price +
          quoteAdditional;
        const avgPrice = math.round(quote / base, symbol.priceAssetPrecision);
        const minigridBudget =
          (coinm ? qty : qty * price) *
          (settings.futures ? 1 : !long ? 2 - feeFactor : 1);
        const isActiveMinigrid = !!(
          useActiveMinigrids &&
          typeof comboActiveMinigrids !== 'undefined' &&
          i <= +comboActiveMinigrids
        );
        let dcaMinigridOrders: DCAGrid[] = createGridOrders(
          {
            ...gridSettings,
            lowPrice: long ? `${price}` : `${price - gridStep * stepVal}`,
            topPrice: long ? `${price + gridStep * stepVal}` : `${price}`,
            _latestPrice: isActiveMinigrid ? baseOrder.price : price,
            initialPrice: isActiveMinigrid ? baseOrder.price : price,
            budget: `${minigridBudget}`,
            sellDisplacement: `${
              (mingrids?.[i]?.settings.sellDisplacement ?? userFee * 2) * 100
            }`,
          },
          gridErrors,
          true,
          false,
          false,
          true,
          feeOrder,
          newSell
        ).map((g) => ({
          ...g,
          type: DCAOrderTypeEnum.grid,
          grey: !isActiveMinigrid,
          greyLabel: isActiveMinigrid ? undefined : 'Grid',
          noLabel: !isActiveMinigrid,
          pair: symbol?.pair ?? '',
          strategy: settings.strategy,
          exchange: symbol?.exchange,
        }));
        if (settings.coinm) {
          const qtyByGrids = math.round(
            (dcaMinigridOrders.reduce(
              (acc, v) =>
                acc +
                Math.max(
                  math.round(
                    (v.qty * v.price) / symbol.quoteAsset.minAmount,
                    0,
                    true
                  ),
                  0
                ),
              0
            ) *
              symbol.quoteAsset.minAmount) /
              price,
            precision,
            false,
            true
          );
          qty = qtyByGrids;
          quote =
            baseOrder.price * baseOrder.qty +
            orders.reduce((acc, v) => acc + v.price * v.qty, 0) +
            qty * price +
            quoteAdditional;
          base =
            baseOrder.qty +
            orders.reduce((acc, v) => acc + v.qty, 0) +
            qty +
            baseAdditional;
        } else {
          const dcaQtyByGrids =
            useBase || settings.futures
              ? math.round(
                  dcaMinigridOrders.reduce((acc, v) => acc + v.qty, 0) *
                    (settings.futures ? 1 : feeFactor),
                  precision,
                  false,
                  !settings.futures
                )
              : math.round(
                  dcaMinigridOrders.reduce(
                    (acc, v) => acc + v.qty * v.price,
                    0
                  ),
                  quotePrecision,
                  false,
                  true
                );
          if (
            (useBase && dcaQtyByGrids > qty) ||
            (!useBase && dcaQtyByGrids > qty * price * (2 - feeFactor)) ||
            settings.futures
          ) {
            dcaMinigridOrders = (
              updatedComboAdjustments
                ? settings.futures || useBase
                : settings.futures || !useBase
            )
              ? dcaMinigridOrders
              : createGridOrders(
                  {
                    ...gridSettings,
                    lowPrice: long
                      ? `${price}`
                      : `${price - gridStep * stepVal}`,
                    topPrice: long
                      ? `${price + gridStep * stepVal}`
                      : `${price}`,
                    _latestPrice: isActiveMinigrid ? baseOrder.price : price,
                    initialPrice: isActiveMinigrid ? baseOrder.price : price,
                    budget: `${
                      (coinm ? dcaQtyByGrids : dcaQtyByGrids * price) *
                      (!long ? 2 - feeFactor : 1)
                    }`,
                    sellDisplacement: `${
                      (mingrids?.[i]?.settings.sellDisplacement ??
                        userFee * 2) * 100
                    }`,
                  },
                  gridErrors,
                  true,
                  undefined,
                  undefined,
                  undefined,
                  feeOrder,
                  newSell
                ).map((g) => ({
                  ...g,
                  type: DCAOrderTypeEnum.grid,
                  grey: !isActiveMinigrid,
                  greyLabel: isActiveMinigrid ? undefined : 'Grid',
                  noLabel: !isActiveMinigrid,
                  pair: symbol?.pair ?? '',
                  strategy: settings.strategy,
                }));
            qty =
              useBase || settings.futures
                ? updatedComboAdjustments
                  ? math.round(
                      dcaQtyByGrids * (settings.futures ? 1 : feeFactor),
                      precision,
                      false,
                      futuresPrecision ? !settings.futures : true
                    )
                  : dcaQtyByGrids
                : math.round(
                    (dcaQtyByGrids / price) *
                      (settings.futures ? 1 : feeFactor),
                    precision,
                    false,
                    true
                  );
            quote =
              (i === 1 ? baseOrder.qty * baseOrder.price : 0) +
              (orders?.[orders.length - 1]?.quote ?? 0) +
              (isActiveMinigrid && !settings.futures
                ? dcaMinigridOrders.reduce((acc, o) => acc + o.qty * o.price, 0)
                : qty * price) +
              quoteAdditional;
            base =
              (i === 1 ? baseOrder.qty : 0) +
              (orders?.[orders.length - 1]?.base ?? 0) +
              (isActiveMinigrid && !settings.futures
                ? dcaMinigridOrders.reduce((acc, o) => acc + o.qty, 0)
                : qty) +
              baseAdditional;
          }
        }
        orders.push({
          qty,
          price,
          type: DCAOrderTypeEnum.dca,
          side: ordersSide,
          id: id(20),
          priceDeviation: `${math.round(
            ((latestPrice - price) / latestPrice) * 100,
            0
          )}%`,
          avgPrice,
          requiredPrice: undefined,
          note:
            price < 0
              ? `This order won't be placed, because price deviation more than 100%`
              : qty * price < symbol.quoteAsset.minAmount
                ? `This order won't be placed, because order amount is less than min allowed by the exchange: ${symbol.quoteAsset.minAmount} ${symbol.quoteAsset.name}`
                : '',
          base: math.round(base, precision),
          quote: math.round(quote, symbol.priceAssetPrecision),
          minigridBudget,
          hide: isActiveMinigrid,
          pair: symbol?.pair ?? '',
          strategy: settings.strategy,
          exchange: symbol?.exchange,
        });

        for (const o of dcaMinigridOrders) {
          grids.push({ ...o, relatedToLevel: i });
        }
      }
      if (!all && useSmartOrders) {
        const sorted = [...orders].sort((a, b) =>
          settings.strategy === StrategyEnum.long
            ? b.price - a.price
            : a.price - b.price
        );
        const start = useActiveMinigrids ? +(comboActiveMinigrids ?? '0') : 0;
        const activeCount = parseInt(activeOrdersCount);
        const active = sorted.slice(start, start + activeCount);
        const smartBefore = sorted.slice(0, start).map((o) => ({ ...o, grey: true }));
        const smartAfter = sorted.slice(start + activeCount).map((o) => ({ ...o, grey: true }));
        orders = [...active, ...smartBefore, ...smartAfter];
      }
    }
    if (comboUseSmartGrids && comboSmartGridsCount && !all) {
      const activeOrders: DCAGrid[] = [];
      const greyOrders: DCAGrid[] = [];
      for (const g of grids) {
        if (g.grey) {
          greyOrders.push(g);
        } else {
          activeOrders.push(g);
        }
      }
      const smartOrders: DCAGrid[] = [];
      for (const o of activeOrders.sort(
        (a, b) =>
          Math.abs(latestPrice - a.price) - Math.abs(latestPrice - b.price)
      )) {
        if (smartOrders.length < comboSmartGridsCount) {
          smartOrders.push(o);
        }
      }
      grids = [...smartOrders, ...greyOrders];
    }
    const result = [...orders, baseOrder, ...grids]
      .filter(
        (o) =>
          (!useTp ? o.type !== DCAOrderTypeEnum.tp : true) &&
          (!useSl ? o.type !== DCAOrderTypeEnum.sl : true)
      )
      .flat()
      .sort((a, b) =>
        settings.strategy === StrategyEnum.long
          ? b.price - a.price
          : a.price - b.price
      );
    const useOutsideSl = settings.useSl && !settings.moveSL;
    if (useOutsideSl && outsideSl) {
      const slLevel = result
        .filter((o) => o.type === DCAOrderTypeEnum.sl)
        .sort((a, b) =>
          long ? b.price - a.price : a.price - b.price
        )[0]?.price;
      if (slLevel) {
        orders = result.filter((r) => {
          return r.type === DCAOrderTypeEnum.dca
            ? long
              ? r.price > slLevel
              : r.price < slLevel
            : true;
        });
        return orders;
      }
    }
    return result;
  }
  return [];
}
function createGridOrders(
  {
    lowPrice,
    topPrice,
    budget,
    levels,
    useStartPrice,
    startPrice,
    updatedBudget,
    forceLocal,
    symbol,
    _latestPrice,
    userFee,
    sellDisplacement,
    gridType,
    initialPrice,
    futures,
    profitCurrency,
    orderFixedIn,
    coinm,
    futuresStrategy,
    _ordersInAdvance,
    useOrderInAdvance,
    combo,
  }: {
    lowPrice: string;
    topPrice: string;
    budget: string;
    levels: string;
    useStartPrice?: boolean;
    startPrice?: string;
    updatedBudget?: boolean;
    forceLocal: boolean;
    symbol?: Symbols | null;
    _latestPrice: number;
    userFee: number;
    sellDisplacement: string;
    gridType: GridType;
    initialPrice: number;
    futures: boolean;
    profitCurrency: Currency;
    orderFixedIn: Currency;
    coinm: boolean;
    futuresStrategy?: FuturesStrategyEnum;
    _ordersInAdvance?: string;
    useOrderInAdvance: boolean;
    combo?: boolean;
  },
  errors: BotFormErrors = {},
  all = false,
  nosplice = false,
  withoutErrorCheck = false,
  feeToSell = false,
  overrideRound?: boolean,
  newSell = false
): Grid[] {
  if (
    Object.entries(errors).filter(([_k, v]) => !!v).length &&
    !withoutErrorCheck
  ) {
    return [];
  }
  if (!symbol) {
    return [];
  }
  const useStart =
    !forceLocal &&
    useStartPrice &&
    startPrice &&
    startPrice !== '' &&
    startPrice !== '0';
  const latestPrice = useStart ? +startPrice : _latestPrice;
  const low = parseFloat(lowPrice);
  const top = parseFloat(topPrice);
  const B = updatedBudget ? +budget : parseFloat(budget) / (1 + userFee * 100);
  const f =
    typeof overrideRound !== 'undefined' ? 1 : futures ? 1 : 1 + userFee;
  let grids: Grid[] = [];
  const quotedAssetPrecision = getAssetPrecision(symbol, 'base');
  let qty = 0;
  let buyQty = 0;
  let sellQty = 0;
  let quoteAmount = 0;
  let baseAmount = 0;
  const prices = getPrices({
    lowPrice,
    topPrice,
    levels,
    symbol,
    sellDisplacement,
    gridType,
  });
  const gs = (top / low) ** (1 / parseFloat(levels)) - 1;
  const { sellCount, buyCount, buys, sells } = getSellBuyCount(prices, {
    useStartPrice,
    startPrice,
    forceLocal,
    initialPrice,
    levels: +levels,
  });
  const initPrice = useStart ? +startPrice : initialPrice;
  if (profitCurrency === 'base') {
    if (orderFixedIn === 'base') {
      let tempSellQty = math.round(
        B /
          (initPrice * sellCount +
            buys.reduce((acc, v) => (acc += v.buy), 0) * (1 + gs)),
        quotedAssetPrecision,
        true
      );
      if (tempSellQty < symbol.quoteAsset.minAmount / prices[0].buy) {
        tempSellQty = math.round(
          (symbol.quoteAsset.minAmount * 1.1) / prices[0].buy,
          quotedAssetPrecision,
          false,
          true
        );
      }
      sellQty = tempSellQty;
      if (sellQty < symbol.baseAsset.minAmount) {
        sellQty = symbol.baseAsset.minAmount;
      }
      buyQty = math.round(
        tempSellQty * (1 + gs) * f,
        quotedAssetPrecision,
        false,
        true
      );
      if (buyQty < symbol.baseAsset.minAmount) {
        buyQty = math.round(
          symbol.baseAsset.minAmount * f,
          quotedAssetPrecision,
          false,
          true
        );
      }
    }
  }
  const baseQuote = profitCurrency === 'base' && orderFixedIn === 'quote';
  if ((profitCurrency === 'quote' && orderFixedIn === 'quote') || baseQuote) {
    quoteAmount =
      B /
      (sells.reduce((acc, v) => (acc += 1 / v.sell), 0) *
        (sellCount && newSell && baseQuote
          ? sells.reduce((acc, a) => acc + a.sell, 0) / sellCount
          : initPrice) +
        buyCount * f);
    if (isNaN(quoteAmount) || !isFinite(quoteAmount) || !quoteAmount) {
      quoteAmount =
        B /
        (sells.reduce((acc, v) => (acc += 1 / v.sell), 0) * initPrice +
          buyCount * f);
    }
    if (quoteAmount < symbol.quoteAsset.minAmount) {
      quoteAmount = symbol.quoteAsset.minAmount * f;
    }
  }
  if (profitCurrency === 'quote') {
    if (orderFixedIn === 'base') {
      const lowest = [...prices].sort((a, b) => a.buy - b.buy)[0]?.buy || 0;
      baseAmount = futures
        ? B /
          (buys.reduce((acc, v) => acc + v.buy, 0) +
            sells.reduce((acc, v) => acc + v.sell, 0))
        : B / (sellCount * initPrice + buys.reduce((acc, v) => acc + v.buy, 0));
      const round = math.round(baseAmount, quotedAssetPrecision, combo);
      if (round < symbol.quoteAsset.minAmount / lowest) {
        baseAmount = math.round(
          symbol.quoteAsset.minAmount / lowest,
          quotedAssetPrecision,
          false,
          true
        );
      }
    }
  }
  if (coinm) {
    baseAmount = B / +levels;
  }
  prices.map((pr, i) => {
    const side =
      pr.buy > latestPrice ? BotOrderSideEnum.sell : BotOrderSideEnum.buy;
    const p = side === BotOrderSideEnum.buy ? pr.buy : pr.sell;
    const same =
      (combo ? !futures : true) &&
      (profitCurrency === orderFixedIn ||
        (profitCurrency === 'base' && orderFixedIn === 'quote'));
    if (profitCurrency === 'base') {
      if (orderFixedIn === 'quote') {
        buyQty = math.round(
          (quoteAmount / p) * f,
          quotedAssetPrecision,
          false,
          overrideRound ?? !futures
        );
        if (buyQty < symbol.baseAsset.minAmount) {
          buyQty = math.round(
            symbol.baseAsset.minAmount * f,
            quotedAssetPrecision,
            false,
            overrideRound ?? !futures
          );
        }
        if (i !== 0) {
          const prevBuyQty = math.round(
            quoteAmount / prices[i - 1].buy,
            quotedAssetPrecision,
            false,
            overrideRound ?? !futures
          );
          sellQty = math.round(
            (prevBuyQty * prices[i - 1].buy) / p,
            quotedAssetPrecision
          );
          if (prevBuyQty - sellQty < symbol.baseAsset.step) {
            sellQty = math.round(
              prevBuyQty - symbol.baseAsset.step,
              quotedAssetPrecision
            );
          }
          if (sellQty < symbol.baseAsset.minAmount) {
            sellQty = symbol.baseAsset.minAmount;
          }
        }
      }
    }
    if (profitCurrency === 'quote') {
      if (orderFixedIn === 'quote') {
        buyQty = math.round(
          (quoteAmount / p) * (feeToSell ? 1 : f),
          quotedAssetPrecision,
          overrideRound ?? (!futures && feeToSell),
          overrideRound ?? !futures
        );
        if (buyQty * p < symbol.quoteAsset.minAmount) {
          buyQty = math.round(
            (symbol.quoteAsset.minAmount / p) * (feeToSell ? 1 : f),
            quotedAssetPrecision,
            overrideRound ?? (!futures && feeToSell),
            overrideRound ?? !futures
          );
        }
        if (buyQty < symbol.baseAsset.minAmount) {
          buyQty = math.round(
            symbol.baseAsset.minAmount * (feeToSell ? 1 : f),
            quotedAssetPrecision,
            overrideRound ?? (!futures && feeToSell),
            overrideRound ?? !futures
          );
        }
        if (i !== 0) {
          sellQty = math.round(
            (quoteAmount / prices[i - 1].buy) * (feeToSell ? 2 - f : 1),
            quotedAssetPrecision,
            overrideRound ?? !futures
          );
          if (sellQty * p < symbol.quoteAsset.minAmount) {
            sellQty = math.round(
              (symbol.quoteAsset.minAmount / prices[i - 1].buy) *
                (feeToSell ? 2 - f : 1),
              quotedAssetPrecision,
              overrideRound ?? !futures
            );
          }
        } else {
          sellQty = math.round(
            ((buyQty * (1 + gs)) / (feeToSell ? 1 : f)) *
              (feeToSell ? 2 - f : 1),
            quotedAssetPrecision,
            overrideRound ?? !futures
          );
        }
        if (sellQty < symbol.baseAsset.minAmount) {
          sellQty = symbol.baseAsset.minAmount;
        }
      }
    }
    if (profitCurrency === 'quote') {
      if (orderFixedIn === 'base') {
        qty = math.round(
          baseAmount,
          quotedAssetPrecision,
          combo,
          overrideRound ?? !futures
        );
      }
    }
    if (coinm) {
      qty = math.round(baseAmount, quotedAssetPrecision);
    }

    if (qty < symbol.baseAsset.minAmount) {
      qty = symbol.baseAsset.minAmount;
    }
    if (side === 'BUY' && !futures) {
      qty = math.round(
        qty * f,
        quotedAssetPrecision,
        false,
        overrideRound ?? !futures
      );
    }
    let gridQty = same ? (side === 'SELL' ? sellQty : buyQty) : qty;
    const mod = math.remainder(gridQty, symbol.baseAsset.step);
    if (mod > Number.EPSILON) {
      gridQty = math.round(
        gridQty - mod + symbol.baseAsset.step,
        quotedAssetPrecision,
        false,
        overrideRound ?? true
      );
    }
    const grid = {
      price: p,
      side,
      qty: gridQty,
      id: id(20),
    };
    if (grid.qty * grid.price < symbol.quoteAsset.minAmount) {
      grid.qty = math.round(
        symbol.quoteAsset.minAmount / grid.price,
        quotedAssetPrecision,
        false,
        true
      );
    }
    if (grid.qty < symbol.baseAsset.minAmount) {
      grid.qty = symbol.baseAsset.minAmount;
    }
    if (coinm) {
      const cont = (grid.price * grid.qty) / symbol.quoteAsset.minAmount;
      if (cont < 1) {
        grid.qty = math.round(
          symbol.quoteAsset.minAmount / grid.price,
          quotedAssetPrecision,
          false,
          true
        );
      } else if (cont % 1 > Number.EPSILON) {
        grid.qty = math.round(
          (math.round(cont, 0) * symbol.quoteAsset.minAmount) / grid.price,
          quotedAssetPrecision,
          false,
          true
        );
      }
    }
    grids.push(grid);
  });
  if (!nosplice) {
    /** find nearest grid to latest price */
    let diff = Infinity;
    let gridIndex = -1;
    grids.map((grid, index) => {
      if (Math.abs(grid.price - latestPrice) < diff) {
        diff = Math.abs(grid.price - latestPrice);
        gridIndex = index;
      }
    });
    /** remove nearest */
    grids.splice(gridIndex, 1);
  }
  if (!all) {
    if (
      futures &&
      futuresStrategy &&
      futuresStrategy !== FuturesStrategyEnum.neutral
    ) {
      const fullGrids = grids;
      grids = [
        ...findClosestGrids(
          {
            lowPrice,
            topPrice,
            levels,
            symbol,
            sellDisplacement,
            gridType,
            _ordersInAdvance,
            useOrderInAdvance,
          },
          errors,
          grids,
          latestPrice,
          undefined,
          withoutErrorCheck
        ).filter(
          (g) =>
            g.side !==
            (futuresStrategy === FuturesStrategyEnum.long
              ? BotOrderSideEnum.sell
              : BotOrderSideEnum.buy)
        ),
        ...fullGrids.filter(
          (g) =>
            g.side ===
            (futuresStrategy === FuturesStrategyEnum.long
              ? BotOrderSideEnum.sell
              : BotOrderSideEnum.buy)
        ),
      ];
    } else {
      grids = findClosestGrids(
        {
          lowPrice,
          topPrice,
          levels,
          symbol,
          sellDisplacement,
          gridType,
          _ordersInAdvance,
          useOrderInAdvance,
        },
        errors,
        grids,
        latestPrice,
        undefined,
        withoutErrorCheck
      );
    }
  }
  return grids.sort((a, b) => a.price - b.price);
}
function getPrices({
  lowPrice,
  topPrice,
  levels,
  symbol,
  sellDisplacement,
  gridType,
}: {
  lowPrice: string;
  topPrice: string;
  levels: string;
  symbol: Symbols;
  sellDisplacement: string;
  gridType: GridType;
}) {
  const low = parseFloat(lowPrice);
  const top = parseFloat(topPrice);
  const newGS = (top / low) ** (1 / parseFloat(levels)) - 1;
  const prices: { buy: number; sell: number }[] = [];
  let sellD = parseFloat(sellDisplacement);
  sellD = isNaN(sellD) ? 0 : sellD / 100;
  if (gridType === 'arithmetic') {
    const step = (top - low) / parseFloat(levels);
    for (let i = 0; i <= parseFloat(levels); i++) {
      const p = math.round(
        Math.max(
          low + step * i,
          symbol.priceAssetPrecision === 0
            ? 1
            : +`0.${'0'.repeat(symbol.priceAssetPrecision - 1)}1`
        ),
        symbol.priceAssetPrecision
      );
      prices.push({
        buy: math.round(p, symbol.priceAssetPrecision),
        sell: math.round(p * (1 + sellD), symbol.priceAssetPrecision),
      });
    }
  } else if (gridType === 'geometric') {
    for (
      let i = math.round(
        Math.max(
          low,
          symbol.priceAssetPrecision === 0
            ? 1
            : +`0.${'0'.repeat(symbol.priceAssetPrecision - 1)}1`
        ),
        symbol.priceAssetPrecision
      );
      i <= top * (1 + newGS / 2);
      i *= 1 + newGS
    ) {
      prices.push({
        buy: math.round(i, symbol.priceAssetPrecision),
        sell: math.round(i * (1 + sellD), symbol.priceAssetPrecision),
      });
    }
  }
  return prices;
}
function getSellBuyCount(
  prices: ReturnType<typeof getPrices>,
  {
    useStartPrice,
    startPrice,
    forceLocal,
    initialPrice,
    levels,
  }: {
    useStartPrice?: boolean;
    startPrice?: string;
    forceLocal: boolean;
    initialPrice: number;
    levels: number;
  }
) {
  const useStart =
    !forceLocal &&
    useStartPrice &&
    startPrice &&
    startPrice !== '' &&
    startPrice !== '0';
  const initPrice = useStart ? +startPrice : +initialPrice;

  const sells = prices.filter((p) => p.buy >= initPrice);
  const buys = prices.filter((p) => p.buy < initPrice);
  let sellCount = sells.length;
  let buyCount = buys.length;
  if (sellCount > 0 && buyCount > 0) {
    if (
      Math.abs(sells[0].sell - initPrice) >
      Math.abs(buys[buys.length - 1].buy - initPrice)
    ) {
      buys.splice(buys.length - 1, 1);
    } else {
      sells.splice(0, 1);
    }
  }
  if (sellCount > 0 && buyCount === 0 && sellCount > levels) {
    sells.splice(0, 1);
  }
  if (buyCount > 0 && sellCount === 0 && buyCount > levels) {
    buys.splice(buys.length - 1, 1);
  }
  sellCount = sells.length;
  buyCount = buys.length;
  return { sellCount, buyCount, buys, sells };
}
function findClosestGrids(
  {
    lowPrice,
    topPrice,
    levels,
    symbol,
    sellDisplacement,
    gridType,
    _ordersInAdvance,
    useOrderInAdvance,
  }: {
    _ordersInAdvance?: string;
    useOrderInAdvance: boolean;
    lowPrice: string;
    topPrice: string;
    levels: string;
    symbol: Symbols;
    sellDisplacement: string;
    gridType: GridType;
  },
  errors: BotFormErrors,
  grids: Grid[],
  latestPrice: number,
  n?: number,
  withoutErrorCheck = false
) {
  if (
    (_ordersInAdvance &&
      useOrderInAdvance &&
      (!Object.entries(errors).filter(([_k, v]) => !!v).length ||
        withoutErrorCheck)) ||
    n
  ) {
    let arrayResult: Grid[] = [];
    let copyArray = [...grids].sort((a, b) => a.price - b.price);
    const ordersInAdvance =
      n || (_ordersInAdvance ? parseInt(_ordersInAdvance) : 0);
    const maxNumber =
      ordersInAdvance > copyArray.length ? copyArray.length : ordersInAdvance;

    do {
      const result = copyArray.sort((a, b) => {
        return (
          Math.abs(latestPrice - a.price) - Math.abs(latestPrice - b.price)
        );
      });
      copyArray = copyArray.filter((v) => v !== result[0]);
      arrayResult.push(result[0]);
    } while (arrayResult.length < maxNumber);
    let sellCount = 0;
    let buyCount = 0;
    arrayResult = arrayResult.sort((a, b) => a.price - b.price);
    arrayResult.map((r) => {
      if (r.side === 'SELL') {
        sellCount++;
      } else {
        buyCount++;
      }
    });
    const prices = getPrices({
      lowPrice,
      topPrice,
      levels,
      symbol,
      sellDisplacement,
      gridType,
    });
    let num =
      (ordersInAdvance % 2 === 0 ? ordersInAdvance : ordersInAdvance - 1) / 2;
    copyArray = [...copyArray.sort((a, b) => a.price - b.price)];
    if ((buyCount < num || sellCount < num) && prices.length > num) {
      const sellLeft = prices.filter((p) => p.buy > latestPrice).length;
      const buyLeft = prices.filter((p) => p.buy < latestPrice).length;
      num = Math.min(sellLeft, num);
      if (
        prices[prices.length - num] &&
        prices[prices.length - num].buy > latestPrice &&
        sellCount < num
      ) {
        const neededSell = num - sellCount;
        const sellArray = copyArray.filter((o) => o.side === 'SELL');
        arrayResult.splice(0, neededSell);
        arrayResult = [...arrayResult, ...sellArray.splice(0, neededSell)];
      }
      num = Math.min(buyLeft, num);
      if (prices[num] && prices[num].buy < latestPrice && buyCount < num) {
        const neededBuy = num - buyCount;
        const buyArray = copyArray.filter((o) => o.side === 'BUY');
        arrayResult.splice(arrayResult.length - neededBuy, neededBuy);
        arrayResult = [
          ...arrayResult,
          ...buyArray.splice(buyArray.length - neededBuy, neededBuy),
        ];
      }
    }
    return arrayResult.sort((a, b) => a.price - b.price);
  }
  return grids;
}
export function createGridBotOrders(
  params: UpdateOrdersParams | undefined,
  context: ExampleOrdersStoreContext = defaultContext
): DCAGrid[] {
  const {
    gridSettings: settings,
    symbol,
    inputLatestPrice: latestPrice,
    userFee,
    errors,
  } = context;
  if (!settings) {
    return [];
  }
  const { all, forceLocal, nosplice, withoutErrorCheck, initialPrice } =
    params || {};
  const {
    lowPrice,
    topPrice,
    budget,
    levels,
    useStartPrice,
    startPrice,
    updatedBudget,
    sellDisplacement,
    gridType,
    futures,
    profitCurrency,
    orderFixedIn,
    coinm,
    futuresStrategy,
    ordersInAdvance,
    useOrderInAdvance,
  } = settings;
  const feeOrder = settings.futures
    ? undefined
    : typeof settings.feeOrder !== 'undefined' && settings.feeOrder
      ? false
      : undefined;
  const gridParams = {
    lowPrice: `${lowPrice}`,
    topPrice: `${topPrice}`,
    budget: `${budget}`,
    levels: `${levels}`,
    useStartPrice,
    startPrice,
    updatedBudget,
    forceLocal: !!forceLocal,
    symbol,
    _latestPrice: latestPrice,
    userFee,
    sellDisplacement: `${sellDisplacement}`,
    gridType,
    initialPrice: initialPrice || 0,
    futures: !!futures,
    profitCurrency,
    orderFixedIn,
    coinm: !!coinm,
    futuresStrategy,
    _ordersInAdvance: `${ordersInAdvance}`,
    useOrderInAdvance,
  };

  // Get the active (filtered) orders
  const activeResult = createGridOrders(
    gridParams,
    errors,
    all,
    nosplice,
    withoutErrorCheck,
    undefined,
    feeOrder
  );

  // When useOrderInAdvance is enabled and not requesting all,
  // also get ALL orders so we can show the non-active ones as grey (smart orders)
  const showSmartOrders = useOrderInAdvance && !all;
  let result: (Grid & { grey?: boolean; greyLabel?: string })[];
  if (showSmartOrders) {
    const allGrids = createGridOrders(
      gridParams,
      errors,
      true, // all = true
      nosplice,
      withoutErrorCheck,
      undefined,
      feeOrder
    );
    // Build a set of active order keys for fast lookup
    const activeSet = new Set(
      (activeResult || []).map(
        (o) => `${o.price}_${o.side}_${o.qty}`
      )
    );
    // Determine the active price range boundaries
    const sortedActive = [...(activeResult || [])].sort(
      (a, b) => a.price - b.price
    );
    const lowestActive = sortedActive[0]?.price ?? 0;
    const highestActive =
      sortedActive[sortedActive.length - 1]?.price ?? Infinity;
    result = (allGrids || []).map((o) => {
      const isActive = activeSet.has(`${o.price}_${o.side}_${o.qty}`);
      if (isActive) return o;
      // Only show smart orders outside the active range (matching legacy behavior)
      if (o.price < lowestActive || o.price > highestActive) {
        return { ...o, grey: true };
      }
      return o;
    });
  } else {
    result = activeResult;
  }

  // Mark the top and bottom of the *active* range as draggable so the
  // user can drag them on the chart to adjust formData.grid.topPrice /
  // lowPrice — mirroring the TP/SL drag affordance on DCA. We pick the
  // bounds from the active (non-grey) set so dragging always edits the
  // live range, not a smart-order line outside it.
  const onDrag = context.onDrag;
  let lowBoundPrice = Number.POSITIVE_INFINITY;
  let topBoundPrice = Number.NEGATIVE_INFINITY;
  if (onDrag) {
    for (const o of result || []) {
      if (o.grey) continue;
      if (o.price < lowBoundPrice) lowBoundPrice = o.price;
      if (o.price > topBoundPrice) topBoundPrice = o.price;
    }
  }
  return (result || []).map((o) => {
    const base = {
      ...o,
      pair: symbol?.pair ?? '',
      strategy: StrategyEnum.long,
      exchange: symbol?.exchange,
    };
    if (!onDrag || o.grey) return base;
    if (o.price === topBoundPrice && o.price === lowBoundPrice) {
      // Edge case: only one active order — let it act as the top bound.
      return {
        ...base,
        draggable: true,
        onPriceChange: (price: number) =>
          onDrag(price, DCAOrderTypeEnum.grid, undefined, {
            gridBound: 'top',
          }),
      };
    }
    if (o.price === topBoundPrice) {
      return {
        ...base,
        draggable: true,
        onPriceChange: (price: number) =>
          onDrag(price, DCAOrderTypeEnum.grid, undefined, {
            gridBound: 'top',
          }),
      };
    }
    if (o.price === lowBoundPrice) {
      return {
        ...base,
        draggable: true,
        onPriceChange: (price: number) =>
          onDrag(price, DCAOrderTypeEnum.grid, undefined, {
            gridBound: 'low',
          }),
      };
    }
    return base;
  });
}
export function getEstimateGridBalance(
  _grids: Grid[],
  settings: _BotSettingsCommon,
  symbol: Symbols,
  number?: number,
  forceSeparate = false
) {
  const basePrecision = getAssetPrecision(symbol, 'base');
  const grids = _grids
    .filter((g) =>
      number
        ? settings.strategy === StrategyEnum.short
          ? g.side === 'BUY'
          : g.side === 'SELL'
        : true
    )
    .slice(0, number ?? _grids.length);
  let res = { sell: { qty: 0, qtyQuote: 0 }, buy: { qty: 0, qtyBase: 0 } };
  if (settings.futures && !forceSeparate) {
    res = grids.reduce(
      (acc, grid) => {
        return {
          ...acc,
          buy: {
            qty: acc.buy.qty + grid.qty * grid.price,
            qtyBase: acc.buy.qtyBase + grid.qty,
          },
        };
      },
      { sell: { qty: 0, qtyQuote: 0 }, buy: { qty: 0, qtyBase: 0 } } as {
        sell: { qty: number; qtyQuote: number };
        buy: { qty: number; qtyBase: number };
      }
    ) || { sell: { qty: 0, qtyQuote: 0 }, buy: { qty: 0, qtyBase: 0 } };
    res.buy.qty /=
      settings.marginType !== BotMarginTypeEnum.inherit
        ? (settings.leverage ?? 1)
        : 1;
    if (settings.coinm) {
      res = grids.reduce(
        (acc, grid) => {
          return {
            ...acc,
            sell: {
              qty: acc.sell.qty + grid.qty,
              qtyQuote: acc.sell.qtyQuote + grid.qty * grid.price,
            },
          };
        },
        {
          sell: { qty: 0, qtyQuote: 0 },
          buy: { qty: 0, qtyBase: 0 },
        } as {
          sell: { qty: number; qtyQuote: number };
          buy: { qty: number; qtyBase: number };
        }
      ) || { sell: { qty: 0, qtyQuote: 0 }, buy: { qty: 0, qtyBase: 0 } };
      res.sell.qty /=
        settings.marginType !== BotMarginTypeEnum.inherit
          ? (settings.leverage ?? 1)
          : 1;
    }
  } else {
    const useMaxGrids =
      (settings.strategy === StrategyEnum.long &&
        settings.profitCurrency === 'base' &&
        grids.filter((g) => g.side === BotOrderSideEnum.sell).length) ||
      (settings.strategy === StrategyEnum.short &&
        settings.profitCurrency === 'quote' &&
        grids.filter((g) => g.side === BotOrderSideEnum.buy).length);

    res = grids.reduce(
      (acc, grid) => {
        if (grid.side && grid.side === 'SELL' && grid.qty) {
          return {
            ...acc,
            sell: {
              qty: acc.sell.qty + grid.qty,
              qtyQuote: acc.sell.qtyQuote + grid.qty * grid.price,
            },
          };
        }
        if (grid.side && grid.side === 'BUY' && grid.qty) {
          return {
            ...acc,
            buy: {
              qty: acc.buy.qty + grid.qty * grid.price,
              qtyBase: acc.buy.qtyBase + grid.qty,
            },
          };
        }
        return acc;
      },
      { sell: { qty: 0, qtyQuote: 0 }, buy: { qty: 0, qtyBase: 0 } } as {
        sell: { qty: number; qtyQuote: number };
        buy: { qty: number; qtyBase: number };
      }
    ) || { sell: { qty: 0, qtyQuote: 0 }, buy: { qty: 0, qtyBase: 0 } };

    if (useMaxGrids) {
      const maxGrids = createGridBotOrders(
        {
          all: true,
          nosplice: false,
          withoutErrorCheck: true,
        },
        {
          ...defaultContext,
          gridSettings: settings,
          symbol: symbol,
          inputLatestPrice:
            settings.strategy !== StrategyEnum.short
              ? +settings.topPrice * 1.1
              : +settings.lowPrice * 0.9,
        }
      );
      if (settings.strategy !== StrategyEnum.short) {
        const quote = math.round(
          res.buy.qty,
          symbol.priceAssetPrecision,
          false,
          true
        );
        const base = math.round(
          maxGrids
            .sort((a, b) => b.price - a.price)
            .slice(
              0,
              grids.filter((g) => g.side === BotOrderSideEnum.sell).length
            )
            .reduce((acc, v) => acc + v.qty, 0),
          basePrecision,
          false,
          true
        );
        return { base, quote };
      }
      if (settings.strategy === StrategyEnum.short) {
        const base = math.round(res.sell.qty, basePrecision, false, true);
        const quote = math.round(
          maxGrids
            .sort((a, b) => a.price - b.price)
            .slice(
              0,
              grids.filter((g) => g.side === BotOrderSideEnum.buy).length
            )
            .reduce((acc, v) => acc + v.qty * v.price, 0),
          symbol.priceAssetPrecision,
          false,
          true
        );
        return { base, quote };
      }
    }
  }
  const base = math.round(res.sell.qty, basePrecision, false, true);
  const quote = math.round(
    res.buy.qty,
    symbol.priceAssetPrecision,
    false,
    true
  );

  return {
    base,
    quote,
  };
}
