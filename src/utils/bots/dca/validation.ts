import type { BotFormMode } from '@/features/bots';
import { mapFormDataToBackend } from '@/mappers/bots/dca/field-mapping';
import {
  isCloseIndicatorOfSection,
  isCloseIndicatorUsedByCondition,
} from '@/utils/indicators/indicatorConfigUtils';
import {
  BotMarginTypeEnum,
  BotStartTypeEnum,
  BotTypesEnum,
  DCAConditionEnum,
  DCATypeEnum,
  DCAVolumeType,
  DynamicPriceFilterDirectionEnum,
  IndicatorAction,
  IndicatorSection,
  MAX_DCA_ORDER_STEP,
  MAX_DCA_ORDERS,
  MAX_RESTING_EXCHANGE_ORDERS,
  MAX_DCA_VOLUME_SCALE,
  MIN_DCA_ORDER_STEP,
  MIN_DCA_ORDERS,
  MIN_DCA_TP,
  MIN_DCA_VOLUME_SCALE,
  OrderSizeTypeEnum,
  OrderTypeEnum,
  RiskSlTypeEnum,
  StartConditionEnum,
  TerminalDealTypeEnum,
  VolumeValueEnum,
  type BotVars,
  type DCABotSettings,
  type MultiTP,
} from '@/types';
import { CloseConditionEnum } from '@/types/bots';
import type { BotFormData, BotFormErrors } from '@/types/bots/form';

export interface DcaFormValidationResult {
  errors: BotFormErrors;
  alerts?: import('@/types/bots/form').BotFormAlerts;
}

const setAlert = (
  alerts: import('@/types/bots/form').BotFormAlerts,
  field: keyof import('@/types/bots/form').BotFormAlerts,
  alert: import('@/types/bots/form').BotFormAlert
) => {
  if (!alerts[field]) {
    alerts[field] = [];
  }
  (alerts[field] as import('@/types/bots/form').BotFormAlert[]).push(alert);
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseNumeric = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseFloat(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getNavIdForDcaField = (field: string): string => {
  switch (field) {
    case 'baseOrderSize':
      return 'baseOrderSize';
    case 'maxNumberOfOpenDeals':
      return 'max-open-deals';
    case 'maxDealsPerPair':
      return 'max-deals-per-pair';
    case 'step':
      return 'dca-step';
    case 'stepScale':
      return 'dca-step-scale';
    case 'riskMinSl':
    case 'riskMaxSl':
      return 'risk-sl-range';
    case 'riskSlAmountPerc':
    case 'riskSlAmountValue':
      return 'risk-amount';
    case 'riskMinPositionSize':
    case 'riskMaxPositionSize':
      return 'position-size-limits';
    case 'hodlDay':
    case 'hodlNextBuy':
      return 'hodlNextBuy';
    default:
      return field;
  }
};

const setError = (
  errors: BotFormErrors,
  field: keyof BotFormErrors,
  message: string
) => {
  if (!errors[field]) {
    errors[field] = message;
  }
};

const STRIP_SECTION_PREFIX = /^\[[^\]]+\]\s*/;

interface ErrorPattern {
  regex: RegExp;
  field: keyof BotFormErrors;
  transform?: (message: string) => string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    regex: /^\[multiTp\]/i,
    field: 'multiTp',
    transform: (message) => message.replace(/^\[multiTp\]\s*/i, ''),
  },
  {
    regex: /^\[multiSl\]/i,
    field: 'multiSl',
    transform: (message) => message.replace(/^\[multiSl\]\s*/i, ''),
  },
  { regex: /Bot name is required/i, field: 'name' },
  { regex: /Base order size must be greater than 0/i, field: 'baseOrderSize' },
  {
    regex: /Enter market timeout must be a non-negative number of seconds/i,
    field: 'limitTimeout',
  },
  {
    regex: /Timer interval must be a positive number/i,
    field: 'closeByTimerValue',
  },
  {
    regex: /Timer “open deal at” value must be in HH:MM format/i,
    field: 'closeByTimerValue',
  },
  { regex: /At least one trading pair is required/i, field: 'pair' },
  { regex: /maxDealsPerPair must/i, field: 'maxDealsPerPair' },
  { regex: /Orders count must be/i, field: 'ordersCount' },
  { regex: /Smart orders count must be/i, field: 'comboSmartGridsCount' },
  { regex: /Grid levels must be/i, field: 'gridLevel' },
  { regex: /Base grid levels must be/i, field: 'baseGridLevels' },
  { regex: /Base grid step must be/i, field: 'baseStep' },
  { regex: /Active minigrids count must be/i, field: 'useActiveMinigrids' },
  { regex: /Grid smart orders count must be/i, field: 'comboSmartGridsCount' },
  { regex: /Max open deals must be/i, field: 'maxNumberOfOpenDeals' },
  { regex: /Order size must be a non-negative number/i, field: 'orderSize' },
  { regex: /Order size type must be one of/i, field: 'orderSizeType' },
  {
    regex: /Order size reference must be either/i,
    field: 'orderSizeReference',
  },
  { regex: /Step must be between/i, field: 'step' },
  { regex: /Step scale must be between/i, field: 'stepScale' },
  { regex: /Volume scale must be between/i, field: 'volumeScale' },
  { regex: /Minimum deviation must be between/i, field: 'minimumDeviation' },
  { regex: /closeByTimerValue must be at least/i, field: 'closeByTimerValue' },
];

export const mapDcaErrorMessageToField = (
  errors: BotFormErrors,
  rawMessage: string,
  alerts?: import('@/types/bots/form').BotFormAlerts
) => {
  const normalized = rawMessage.trim();
  const stripped = normalized.replace(STRIP_SECTION_PREFIX, '').trim();

  const candidates: Array<{
    value: string;
    original: boolean;
  }> = [];

  if (normalized.length > 0) {
    candidates.push({ value: normalized, original: true });
  }

  if (stripped.length > 0 && stripped !== normalized) {
    candidates.push({ value: stripped, original: false });
  }

  for (const { regex, field, transform } of ERROR_PATTERNS) {
    for (const candidate of candidates) {
      if (!regex.test(candidate.value)) {
        continue;
      }

      const baseMessage = candidate.value;
      const resolvedMessage = transform
        ? transform(baseMessage)
        : candidate.original
          ? baseMessage.replace(STRIP_SECTION_PREFIX, '').trim()
          : baseMessage;

      setError(errors, field, resolvedMessage);
      if (alerts) {
        setAlert(alerts, field, {
          variant: 'error',
          message: resolvedMessage,
          navId: getNavIdForDcaField(String(field)),
        });
      }
      return;
    }
  }

  //setError(errors, '__form__', stripped.length > 0 ? stripped : normalized);
};

export const validateDcaFormData = (
  formData: BotFormData,
  vars?: BotVars | undefined
): DcaFormValidationResult => {
  const isComboBot = formData.type === BotTypesEnum.combo;
  const _baseOrderSize = isComboBot
    ? formData.combo.baseOrderSize
    : formData.dca.baseOrderSize;
  const useMultiTp = isComboBot
    ? formData.combo.useMultiTp
    : formData.dca.useMultiTp;
  const useSl = isComboBot ? formData.combo.useSl : formData.dca.useSl;
  const useMultiSl = isComboBot
    ? formData.combo.useMultiSl
    : formData.dca.useMultiSl;
  const useTp = isComboBot ? formData.combo.useTp : formData.dca.useTp;
  const _fixedTpPrice = isComboBot
    ? formData.combo.fixedTpPrice
    : formData.dca.fixedTpPrice;
  const _tpPerc = isComboBot ? formData.combo.tpPerc : formData.dca.tpPerc;
  const useFixedTPPrices = isComboBot
    ? formData.combo.useFixedTPPrices
    : formData.dca.useFixedTPPrices;
  const errors: BotFormErrors = {};
  const alerts: import('@/types/bots/form').BotFormAlerts = {};
  const addError = (field: keyof BotFormErrors, message: string) => {
    setError(errors, field, message);
    setAlert(alerts, field, {
      variant: 'error',
      message,
      navId: getNavIdForDcaField(String(field)),
    });
  };

  if (!isNonEmptyString(formData.name)) {
    addError('name', 'Bot name is required.');
  }

  if (!isNonEmptyString(formData.exchangeUUID)) {
    addError('exchangeUUID', 'Select an exchange account.');
  }

  const validPairs = Array.isArray(formData.pair)
    ? formData.pair.filter((pair) => isNonEmptyString(pair))
    : [];
  if (validPairs.length === 0) {
    addError('pair', 'Provide at least one trading pair.');
  }

  const baseOrderSize = parseNumeric(_baseOrderSize);
  if (baseOrderSize === null || baseOrderSize <= 0) {
    addError('baseOrderSize', 'Base order size must be greater than 0.');
  }

  const mappingResult = mapFormDataToBackend(formData, vars);

  for (const errorMessage of mappingResult.errors ?? []) {
    mapDcaErrorMessageToField(errors, errorMessage, alerts);
  }

  const multiTpEnabled = Boolean(useMultiTp);
  const normalizedMultiTp = mappingResult.data?.['multiTp'];
  const sanitizedMultiTp = Array.isArray(normalizedMultiTp)
    ? (normalizedMultiTp as MultiTP[])
    : [];

  if (multiTpEnabled && sanitizedMultiTp.length === 0) {
    addError(
      'multiTp',
      'Add at least one valid take profit target or disable multi-target mode.'
    );
  }

  sanitizedMultiTp.forEach((target, index) => {
    if (!target || errors['multiTp']) {
      return;
    }
    const targetIndex = index + 1;

    const hasPercentageBinding = !!vars?.paths.find(
      (p) => p.path === `multiTp.${target.uuid}.target`
    );
    const percentageValue = Number.parseFloat(target.target ?? '0');

    if (
      !hasPercentageBinding &&
      !(Number.isFinite(percentageValue) && percentageValue > 0)
    ) {
      addError(
        'multiTp',
        `Take profit target ${targetIndex} must define a percentage greater than 0% or bind to a variable.`
      );
    }
  });

  const multiSlEnabled = Boolean(useSl && useMultiSl);
  const normalizedMultiSl = mappingResult.data?.['multiSl'];
  const sanitizedMultiSl = Array.isArray(normalizedMultiSl)
    ? (normalizedMultiSl as MultiTP[])
    : [];

  if (multiSlEnabled && sanitizedMultiSl.length === 0) {
    addError(
      'multiSl',
      'Add at least one valid stop loss target or disable multi-target stop loss.'
    );
  }

  if (useTp) {
    const hasMultiTargets = multiTpEnabled && sanitizedMultiTp.length > 0;
    const tpPerc = parseNumeric(_tpPerc);
    const fixedTpPrice = parseNumeric(_fixedTpPrice);
    const fixedModeEnabled = Boolean(useFixedTPPrices);

    const hasValidPercentage = tpPerc !== null && tpPerc > 0;
    const hasValidFixed =
      fixedModeEnabled && fixedTpPrice !== null && fixedTpPrice > 0;

    if (!hasMultiTargets && !hasValidPercentage && !hasValidFixed) {
      addError(
        'tpPerc',
        'Configure a take profit percentage or provide a valid fixed TP price.'
      );
    }
  }

  // Ensure alerts are populated for any plain errors
  for (const [k, v] of Object.entries(errors)) {
    if (!alerts[k as keyof typeof alerts] && v) {
      setAlert(alerts, k as keyof typeof alerts, {
        variant: 'error',
        message: String(v),
        navId: getNavIdForDcaField(String(k)),
      });
    }
  }

  return { errors, alerts };
};

export const checkNumber = (num?: string) => {
  return num && num !== '' && !isNaN(+num);
};

export const hotValidateDcaFormData = ({
  dcaOrderGuard,
  dca,
  userFee,
  pair,
  mode,
}: Omit<
  Pick<BotFormData, 'dcaOrderGuard' | BotTypesEnum.dca | 'userFee' | 'pair'>,
  'dca'
> & {
  mode: BotFormMode;
  dca: Pick<
    DCABotSettings,
    | 'baseOrderSize'
    | 'orderSize'
    | 'tpPerc'
    | 'slPerc'
    | 'step'
    | 'volumeScale'
    | 'stepScale'
    | 'ordersCount'
    | 'activeOrdersCount'
    | 'minOpenDeal'
    | 'maxOpenDeal'
    | 'riskMinPositionSize'
    | 'riskMaxPositionSize'
    | 'riskMinSl'
    | 'riskMaxSl'
    | 'riskSlType'
    | 'riskSlAmountValue'
    | 'riskTpRatio'
    | 'orderSizeType'
    | 'baseOrderPrice'
    | 'startOrderType'
    | 'useLimitPrice'
    | 'cooldownAfterDealStart'
    | 'cooldownAfterDealStartInterval'
    | 'cooldownAfterDealStop'
    | 'cooldownAfterDealStopInterval'
    | 'useRiskReward'
    | 'riskUseTpRatio'
    | 'maxNumberOfOpenDeals'
    | 'maxDealsPerPair'
    | 'useTp'
    | 'maxDealsPerHigherTimeframe'
    | 'useMaxDealsPerHigherTimeframe'
    | 'maxDealsPerHigherTimeframe'
    | 'hodlDay'
    | 'startCondition'
    | 'useSl'
    | 'hodlDay'
    | 'hodlNextBuy'
    | 'useSmartOrders'
    | 'useDca'
    | 'useDynamicPriceFilter'
    | 'dynamicPriceFilterDirection'
    | 'dynamicPriceFilterOverValue'
    | 'dynamicPriceFilterUnderValue'
    | 'futures'
    | 'marginType'
    | 'terminalDealType'
    | 'dcaCondition'
    | 'ordersCount'
    | 'useMulti'
    | 'dcaCustom'
    | 'dcaVolumeBaseOn'
    | 'indicators'
    | 'botStart'
    | 'useBotController'
    | 'botActualStart'
    | 'dealCloseCondition'
    | 'dealCloseConditionSL'
    | 'type'
    | 'trailingTp'
    | 'trailingTpPerc'
    | 'useMinTP'
    | 'minTp'
    | 'useCloseAfterX'
    | 'closeAfterX'
    | 'useCloseAfterXloss'
    | 'closeAfterXloss'
    | 'useCloseAfterXwin'
    | 'closeAfterXwin'
    | 'useCloseAfterXprofit'
    | 'closeAfterXprofitValue'
    | 'stopBotPriceValue'
    | 'startBotPriceValue'
    | 'useCloseAfterXopen'
    | 'closeAfterXopen'
    | 'volumeTop'
    | 'volumeValue'
    | 'useVolumeFilter'
    | 'relativeVolumeTop'
    | 'useRelativeVolumeFilter'
    | 'relativeVolumeValue'
    | 'leverage'
  >;
}): DcaFormValidationResult => {
  const {
    baseOrderSize: _baseOrderSize,
    orderSize: _orderSize,
    tpPerc: _tpPerc,
    slPerc: _slPerc,
    step: _step,
    volumeScale: _volumeScale,
    stepScale: _stepScale,
    minOpenDeal: _minOpenDeal,
    maxOpenDeal: _maxOpenDeal,
    riskMinPositionSize: _riskMinPositionSize,
    riskMaxPositionSize: _riskMaxPositionSize,
    riskMinSl: _riskMinSl,
    riskSlType,
    riskSlAmountValue,
    riskMaxSl: _riskMaxSl,
    riskTpRatio: _riskTpRatio,
    orderSizeType,
    baseOrderPrice,
    startOrderType,
    useLimitPrice,
    cooldownAfterDealStart,
    cooldownAfterDealStartInterval,
    cooldownAfterDealStop,
    cooldownAfterDealStopInterval,
    useRiskReward,
    riskUseTpRatio,
    maxNumberOfOpenDeals,
    maxDealsPerPair,
    useTp,
    useMaxDealsPerHigherTimeframe,
    maxDealsPerHigherTimeframe,
    useSl,
    startCondition,
    hodlDay,
    hodlNextBuy,
    activeOrdersCount,
    useSmartOrders,
    useDca,
    useDynamicPriceFilter,
    dynamicPriceFilterDirection,
    dynamicPriceFilterOverValue,
    dynamicPriceFilterUnderValue,
    futures,
    marginType,
    terminalDealType,
    dcaCondition,
    ordersCount,
    useMulti,
    dcaCustom,
    dcaVolumeBaseOn,
    indicators,
    botStart,
    useBotController,
    botActualStart,
    dealCloseCondition,
    dealCloseConditionSL,
    type,
    trailingTp,
    trailingTpPerc,
    useMinTP,
    minTp,
    useCloseAfterX,
    closeAfterX,
    useCloseAfterXloss,
    closeAfterXloss,
    useCloseAfterXwin,
    closeAfterXwin,
    useCloseAfterXprofit,
    closeAfterXprofitValue,
    stopBotPriceValue,
    startBotPriceValue,
    useCloseAfterXopen,
    closeAfterXopen,
    volumeTop,
    volumeValue,
    useVolumeFilter,
    relativeVolumeTop,
    useRelativeVolumeFilter,
    relativeVolumeValue,
    leverage,
  } = dca;
  const errors: BotFormErrors = {};
  const alerts: import('@/types/bots/form').BotFormAlerts = {};
  const baseOrderSize = parseFloat(_baseOrderSize);
  const orderSize = parseFloat(_orderSize);
  const tpPerc = parseFloat(_tpPerc) / 100;
  const slPerc = parseFloat(_slPerc) / 100;
  const step = parseFloat(_step) / 100;
  const volumeScale = parseFloat(_volumeScale);
  const stepScale = parseFloat(_stepScale);
  const minOpenDeal = parseFloat(_minOpenDeal || '0');
  const maxOpenDeal = parseFloat(_maxOpenDeal || '0');
  const riskMinPositionSize = _riskMinPositionSize
    ? +_riskMinPositionSize
    : null;
  let riskMaxPositionSize = _riskMaxPositionSize ? +_riskMaxPositionSize : null;
  if (riskMaxPositionSize && riskMaxPositionSize === -1) {
    riskMaxPositionSize = Infinity;
  }
  const riskMinSl =
    typeof _riskMinSl !== 'undefined' && `${_riskMinSl}` !== 'null'
      ? Math.abs(+_riskMinSl)
      : riskSlType === RiskSlTypeEnum.perc && riskSlAmountValue
        ? Math.abs(+riskSlAmountValue)
        : null;
  const riskMaxSl = _riskMaxSl ? Math.abs(+_riskMaxSl) : null;
  const riskTpRatio = _riskTpRatio ? +_riskTpRatio : 0;
  const keys = Object.keys(dca) as (keyof typeof dca)[];
  if (useRiskReward && riskUseTpRatio && !riskTpRatio) {
    errors['riskTpRatio'] = 'Take profit ratio must be set';
  }
  if (
    checkNumber(maxNumberOfOpenDeals) &&
    +(maxNumberOfOpenDeals ?? '0') === 0
  ) {
    setError(
      errors,
      'maxNumberOfOpenDeals',
      'Max number of open deals must be at least 1'
    );
    setAlert(alerts, 'maxNumberOfOpenDeals', {
      variant: 'error',
      message: 'Max number of open deals must be at least 1',
      navId: 'max-open-deals',
    });
  }

  if (+(maxNumberOfOpenDeals ?? '0') > 200) {
    setError(
      errors,
      'maxNumberOfOpenDeals',
      'Max number of open deals must be less than 200'
    );
    setAlert(alerts, 'maxNumberOfOpenDeals', {
      variant: 'error',
      message: 'Max number of open deals must be less than 200',
      navId: 'max-open-deals',
    });
  }

  const maxDealsPerPairRaw = maxDealsPerPair;

  const GLOBAL_VAR_RE = /^\{\{[^}]+\}\}$/;

  if (useMulti) {
    // Allow binding to global variables like {{varName}}
    const isGlobalVar =
      typeof maxDealsPerPairRaw === 'string' &&
      GLOBAL_VAR_RE.test(maxDealsPerPairRaw.trim());

    let normalized = '';
    if (
      typeof maxDealsPerPairRaw === 'number' &&
      Number.isFinite(maxDealsPerPairRaw)
    ) {
      normalized = String(Math.trunc(maxDealsPerPairRaw));
    } else if (typeof maxDealsPerPairRaw === 'string') {
      normalized = maxDealsPerPairRaw.trim();
    }

    if (!normalized && !isGlobalVar) {
      setError(
        errors,
        'maxDealsPerPair',
        'Enter the maximum number of deals per pair.'
      );
      setAlert(alerts, 'maxDealsPerPair', {
        variant: 'error',
        message: 'Enter the maximum number of deals per pair.',
        navId: getNavIdForDcaField('maxDealsPerPair'),
      });
    } else if (!isGlobalVar && !/^[-]?\d+$/.test(normalized)) {
      setError(
        errors,
        'maxDealsPerPair',
        'Max deals per pair must be a whole number or a global variable.'
      );
      setAlert(alerts, 'maxDealsPerPair', {
        variant: 'error',
        message:
          'Max deals per pair must be a whole number or a global variable.',
        navId: getNavIdForDcaField('maxDealsPerPair'),
      });
    } else if (!isGlobalVar) {
      const parsed = Number.parseInt(normalized, 10);
      if (parsed === -1) {
        // unlimited allowed
      } else if (parsed < 1 || parsed > 200) {
        setError(
          errors,
          'maxDealsPerPair',
          'Max deals per pair must be between 1 and 200.'
        );
        setAlert(alerts, 'maxDealsPerPair', {
          variant: 'error',
          message: 'Max deals per pair must be between 1 and 200.',
          navId: getNavIdForDcaField('maxDealsPerPair'),
        });
      }
    }
  } else {
    // if not multi, ignore maxDealsPerPair
  }

  // Legacy check kept for numeric >200 (in case data arrives in another shape)
  if (+(maxDealsPerPair ?? '0') > 200) {
    errors['maxDealsPerPair'] =
      'Max number of deals per pair must be less than 200';
  }
  if (
    useRiskReward &&
    riskMaxPositionSize &&
    riskMinPositionSize &&
    riskMaxPositionSize < riskMinPositionSize
  ) {
    errors['riskMaxPositionSize'] =
      'Max position size must be more than min position size';
    errors['riskMinPositionSize'] =
      'Min position size must be less than max position size';
  }
  if (useRiskReward && riskMaxSl && riskMinSl && riskMaxSl < riskMinSl) {
    errors['riskMaxSl'] = 'Max SL must be more than min SL';
    errors['riskMinSl'] = 'Min SL must be less than max SL';
  }
  if (useRiskReward && riskMaxSl && riskMaxSl > 100) {
    setError(errors, 'riskMaxSl', 'Max SL must be more or equal than -100%');
    setAlert(alerts, 'riskMaxSl', {
      variant: 'error',
      message: 'Max SL must be more or equal than -100%',
      navId: 'risk-sl-range',
    });
  }
  const fieldLabels: Partial<Record<keyof DCABotSettings, string>> = {
    baseOrderSize: 'Base order size',
    orderSize: 'Order size',
    ordersCount: 'Orders count',
    step: 'Step',
    stepScale: 'Step scale',
    volumeScale: 'Volume scale',
    tpPerc: 'Take profit %',
    maxDealsPerHigherTimeframe: 'Max deals per higher timeframe',
    slPerc: 'Stop loss %',
    hodlDay: 'Timer day',
    hodlNextBuy: 'Timer time',
    activeOrdersCount: 'Active orders count',
  };

  keys.map((k) => {
    if (
      ([
        'baseOrderSize',
        'orderSize',
        'ordersCount',
        'step',
        'stepScale',
        'volumeScale',
      ].includes(k) &&
        dca[k] === '') ||
      (k === 'tpPerc' && useTp && _tpPerc === '') ||
      (k === 'maxDealsPerHigherTimeframe' &&
        useMaxDealsPerHigherTimeframe &&
        maxDealsPerHigherTimeframe === '') ||
      (k === 'slPerc' && useSl && _slPerc === '') ||
      (k === 'hodlDay' &&
        startCondition === StartConditionEnum.timer &&
        hodlDay === '') ||
      (k === 'hodlNextBuy' &&
        startCondition === StartConditionEnum.timer &&
        isNaN(hodlNextBuy)) ||
      (k === 'activeOrdersCount' && useSmartOrders && activeOrdersCount === '')
    ) {
      const label = fieldLabels[k] || k;
      errors[k] = `${label} must be set`;
    }
  });
  if (baseOrderSize === 0) {
    const message = 'Base order size must be set';
    setError(errors, 'baseOrderSize', message);
    setAlert(alerts, 'baseOrderSize', {
      variant: 'error',
      message,
      navId: 'baseOrderSize',
    });
  }
  if (useDca && orderSize === 0) {
    errors['orderSize'] = `Order size must be set`;
  }
  if (
    dcaOrderGuard?.min &&
    orderSizeType === OrderSizeTypeEnum.quote &&
    baseOrderSize < dcaOrderGuard.min
  ) {
    const message = `Base order amount must be more than ${
      dcaOrderGuard.min
    } ${dcaOrderGuard.unit}`;
    setError(errors, 'baseOrderSize', message);
    setAlert(alerts, 'baseOrderSize', {
      variant: 'error',
      message,
      navId: 'baseOrderSize',
    });
  }
  if (useDynamicPriceFilter) {
    if (
      dynamicPriceFilterDirection ===
        DynamicPriceFilterDirectionEnum.overAndUnder ||
      dynamicPriceFilterDirection === DynamicPriceFilterDirectionEnum.over
    ) {
      if (dynamicPriceFilterOverValue === '') {
        errors['dynamicPriceFilterOverValue'] =
          'Dynamic price filter over value must be set';
      }
      if (dynamicPriceFilterOverValue && +dynamicPriceFilterOverValue < 0.5) {
        errors['dynamicPriceFilterOverValue'] =
          'Dynamic price filter over value must be more than 0.5%';
      }
    }
    if (
      dynamicPriceFilterDirection ===
        DynamicPriceFilterDirectionEnum.overAndUnder ||
      dynamicPriceFilterDirection === DynamicPriceFilterDirectionEnum.under
    ) {
      if (dynamicPriceFilterUnderValue === '') {
        errors['dynamicPriceFilterUnderValue'] =
          'Dynamic price filter under value must be set';
      }
      if (dynamicPriceFilterUnderValue && +dynamicPriceFilterUnderValue < 0.5) {
        errors['dynamicPriceFilterUnderValue'] =
          'Dynamic price filter under value must be more than 0.5%';
      }
    }
  }
  if (useTp && tpPerc < MIN_DCA_TP) {
    errors['tpPerc'] = `Take profit % must be more than ${MIN_DCA_TP * 100}%`;
  }
  if (
    useSl &&
    ((futures && marginType !== BotMarginTypeEnum.cross) || !futures) &&
    slPerc < -2.5
  ) {
    errors['slPerc'] = `Stop loss % must be more than ${-2.5 * 100}%`;
  }
  if (
    useSl &&
    slPerc > -MIN_DCA_TP &&
    terminalDealType !== TerminalDealTypeEnum.import &&
    mode !== 'deal-edit' &&
    mode !== 'deal-mass-edit'
  ) {
    errors['slPerc'] = `Stop loss % must be less than ${-MIN_DCA_TP * 100}%`;
  }
  if (
    dcaOrderGuard?.min &&
    orderSizeType === OrderSizeTypeEnum.quote &&
    orderSize < dcaOrderGuard?.min &&
    useDca &&
    dcaCondition === DCAConditionEnum.percentage
  ) {
    errors['orderSize'] =
      `Order amount must be more than ${dcaOrderGuard?.min} ${dcaOrderGuard.unit}`;
  }
  if (
    (orderSizeType === OrderSizeTypeEnum.percFree ||
      orderSizeType === OrderSizeTypeEnum.percTotal) &&
    orderSize <= 0
  ) {
    errors['orderSize'] = `Order amount % must be more than 0`;
  }
  if (
    (orderSizeType === OrderSizeTypeEnum.percFree ||
      orderSizeType === OrderSizeTypeEnum.percTotal) &&
    orderSize > 100
  ) {
    errors['orderSize'] = `Order amount % must be less than 100`;
  }
  if (
    (orderSizeType === OrderSizeTypeEnum.percFree ||
      orderSizeType === OrderSizeTypeEnum.percTotal) &&
    baseOrderSize <= 0
  ) {
    const message = 'Order amount % must be more than 0';
    setError(errors, 'baseOrderSize', message);
    setAlert(alerts, 'baseOrderSize', {
      variant: 'error',
      message,
      navId: 'baseOrderSize',
    });
  }
  if (
    (orderSizeType === OrderSizeTypeEnum.percFree ||
      orderSizeType === OrderSizeTypeEnum.percTotal) &&
    baseOrderSize > 100
  ) {
    const message = 'Order amount % must be less than 100';
    setError(errors, 'baseOrderSize', message);
    setAlert(alerts, 'baseOrderSize', {
      variant: 'error',
      message,
      navId: 'baseOrderSize',
    });
  }
  if (
    dcaOrderGuard?.min &&
    orderSizeType === OrderSizeTypeEnum.base &&
    orderSize < dcaOrderGuard?.min
  ) {
    errors['orderSize'] =
      `Order amount must be more than ${dcaOrderGuard.min} ${dcaOrderGuard.unit}`;
  }
  const stepMin = Math.max(
    MIN_DCA_ORDER_STEP,
    userFee?.makerCommission ?? 0 * 2
  );
  if (step < stepMin) {
    const message = `Step value must be more than ${stepMin * 100}%`;
    setError(errors, 'step', message);
    setAlert(alerts, 'step', {
      variant: 'error',
      message,
      navId: 'dca-step',
    });
  }
  if (step > MAX_DCA_ORDER_STEP) {
    const message = `Step value must be less than ${MAX_DCA_ORDER_STEP * 100}%`;
    setError(errors, 'step', message);
    setAlert(alerts, 'step', {
      variant: 'error',
      message,
      navId: 'dca-step',
    });
  }
  if (parseInt(ordersCount) < MIN_DCA_ORDERS) {
    errors['ordersCount'] = `Orders count must be more than ${MIN_DCA_ORDERS}`;
  }
  // How many orders one deal may rest on the exchange, given how many deals can
  // run at once. Without smart orders every ladder level rests, so ladder depth
  // is what has to fit; with them on, only `activeOrdersCount` does (below).
  const maxOrders = Math.floor(
    useMulti
      ? MAX_RESTING_EXCHANGE_ORDERS / Math.max(1, +(maxDealsPerPair || '1'))
      : MAX_RESTING_EXCHANGE_ORDERS / Math.max(1, +(maxNumberOfOpenDeals || '1'))
  );
  if (parseInt(ordersCount) > MAX_DCA_ORDERS) {
    errors['ordersCount'] =
      `Orders count must be ${MAX_DCA_ORDERS} or less.`;
  } else if (!useSmartOrders && parseInt(ordersCount) > maxOrders) {
    const concurrency = useMulti
      ? 'max deals per pair'
      : 'max open deals';
    errors['ordersCount'] =
      `Without smart orders every level rests on the exchange, so orders count × ${concurrency} must stay within the exchange's ${MAX_RESTING_EXCHANGE_ORDERS} open-order limit — ${maxOrders} or fewer here. Enable smart orders to run a deeper ladder.`;
  }
  if (parseInt(activeOrdersCount) < MIN_DCA_ORDERS) {
    errors['activeOrdersCount'] =
      `Active orders count must be more than ${MIN_DCA_ORDERS}`;
  }

  // Hot-validate maxDealsPerPair for quick feedback (same rules as full validation)
  if (useMulti) {
    const raw = maxDealsPerPair;
    const GLOBAL_VAR_RE = /^\{\{[^}]+\}\}$/;
    const isGlobalVar =
      typeof raw === 'string' && GLOBAL_VAR_RE.test(raw.trim());

    let normalized = '';
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      normalized = String(Math.trunc(raw));
    } else if (typeof raw === 'string') {
      normalized = raw.trim();
    }

    if (!normalized && !isGlobalVar) {
      errors['maxDealsPerPair'] = 'Enter the maximum number of deals per pair.';
      setAlert(alerts, 'maxDealsPerPair', {
        variant: 'error',
        message: 'Enter the maximum number of deals per pair.',
        navId: getNavIdForDcaField('maxDealsPerPair'),
      });
    } else if (!isGlobalVar && !/^[-]?\d+$/.test(normalized)) {
      errors['maxDealsPerPair'] =
        'Max deals per pair must be a whole number or a global variable.';
      setAlert(alerts, 'maxDealsPerPair', {
        variant: 'error',
        message:
          'Max deals per pair must be a whole number or a global variable.',
        navId: getNavIdForDcaField('maxDealsPerPair'),
      });
    } else if (!isGlobalVar) {
      const parsed = Number.parseInt(normalized, 10);
      if (parsed !== -1 && (parsed < 1 || parsed > 200)) {
        errors['maxDealsPerPair'] =
          'Max deals per pair must be between 1 and 200.';
        setAlert(alerts, 'maxDealsPerPair', {
          variant: 'error',
          message: 'Max deals per pair must be between 1 and 200.',
          navId: getNavIdForDcaField('maxDealsPerPair'),
        });
      }
    }
  }
  if (useSmartOrders) {
    const maxActiveOrders = Math.min(
      dcaCondition === DCAConditionEnum.custom
        ? (dcaCustom?.length ?? MIN_DCA_ORDERS)
        : +ordersCount,
      Math.floor(maxOrders)
    );
    if (parseInt(activeOrdersCount) > maxActiveOrders) {
      errors['activeOrdersCount'] =
        `Active orders count must be ${maxActiveOrders} or less — these rest on the exchange, and every concurrent deal places its own set.`;
    }
  }
  if (
    volumeScale < MIN_DCA_VOLUME_SCALE &&
    dcaVolumeBaseOn === DCAVolumeType.scale
  ) {
    errors['volumeScale'] =
      `Volume scale value must be more than ${MIN_DCA_VOLUME_SCALE}`;
  }
  if (
    volumeScale > MAX_DCA_VOLUME_SCALE &&
    dcaVolumeBaseOn === DCAVolumeType.scale
  ) {
    errors['volumeScale'] =
      `Volume scale value must be less than ${MAX_DCA_VOLUME_SCALE}`;
  }
  if (stepScale < MIN_DCA_VOLUME_SCALE) {
    const message = `Step scale value must be more than ${MIN_DCA_VOLUME_SCALE}`;
    setError(errors, 'stepScale', message);
    setAlert(alerts, 'stepScale', {
      variant: 'error',
      message,
      navId: 'dca-step-scale',
    });
  }
  if (stepScale > MAX_DCA_VOLUME_SCALE) {
    const message = `Step scale value must be less than ${MAX_DCA_VOLUME_SCALE}`;
    setError(errors, 'stepScale', message);
    setAlert(alerts, 'stepScale', {
      variant: 'error',
      message,
      navId: 'dca-step-scale',
    });
  }
  if (
    !isNaN(minOpenDeal) &&
    !isNaN(maxOpenDeal) &&
    minOpenDeal !== 0 &&
    maxOpenDeal !== 0
  ) {
    if (maxOpenDeal <= minOpenDeal) {
      errors['maxOpenDeal'] =
        'Max open deal price must be more than min open deal price';
      errors['minOpenDeal'] =
        'Min open deal price must be less than max open deal price';
    }
  }
  if (
    startCondition === StartConditionEnum.ti &&
    indicators.filter((i) => i.indicatorAction === IndicatorAction.startDeal)
      .length === 0
  ) {
    errors['indicators'] =
      `You need to select at least 1 indicator to start a deal`;
  }
  if (
    botStart === BotStartTypeEnum.indicators &&
    useBotController &&
    indicators.filter((i) => i.indicatorAction === IndicatorAction.stopBot)
      .length === 0
  ) {
    errors['stopIndicators'] =
      `You need to select at least 1 indicator to stop the bot`;
  }
  if (
    botActualStart === BotStartTypeEnum.indicators &&
    useBotController &&
    indicators.filter((i) => i.indicatorAction === IndicatorAction.startBot)
      .length === 0
  ) {
    errors['startIndicators'] =
      `You need to select at least 1 indicator to start the bot`;
  }
  // Count only the indicators the ACTIVE close condition can use — the same
  // set the payload mapper saves. Mode switching is lossless, so a section
  // may still hold the other mode's leftovers, and counting those would let
  // a bot with no usable close indicator through.
  const usableCloseIndicators = (
    section: IndicatorSection.tp | IndicatorSection.sl,
    condition: CloseConditionEnum | undefined
  ) =>
    indicators.filter(
      (i) =>
        isCloseIndicatorOfSection(i, section) &&
        isCloseIndicatorUsedByCondition(i, condition)
    );

  if (
    dealCloseCondition === CloseConditionEnum.techInd &&
    usableCloseIndicators(IndicatorSection.tp, dealCloseCondition).length ===
      0 &&
    useTp
  ) {
    errors['indicatorsClose'] =
      `You need to select at least 1 indicator to close the deal by take profit`;
  }
  if (
    dealCloseCondition === CloseConditionEnum.dynamicAr &&
    usableCloseIndicators(IndicatorSection.tp, dealCloseCondition).length ===
      0 &&
    useTp
  ) {
    errors['indicatorsClose'] =
      `You need to add at least 1 ATR or ADR indicator to close the deal by dynamic take profit`;
  }
  if (
    (dcaCondition === DCAConditionEnum.indicators ||
      dcaCondition === DCAConditionEnum.dynamicAr) &&
    indicators.filter((i) => i.indicatorAction === IndicatorAction.startDca)
      .length === 0 &&
    useDca
  ) {
    errors['indicatorsDca'] = `You need to select at least 1 DCA indicator`;
  }
  if (
    dcaCondition === DCAConditionEnum.custom &&
    dcaCustom?.length === 0 &&
    useDca
  ) {
    errors['dcaCustom'] = `You need to add at least 1 DCA order`;
  }
  if (
    dcaCondition === DCAConditionEnum.custom &&
    (dcaCustom ?? []).filter((d) => +d.size === 0 || isNaN(+d.size)).length &&
    useDca
  ) {
    errors['dcaCustom'] = `All DCA orders must have valid size values`;
  }
  if (
    dealCloseConditionSL === CloseConditionEnum.techInd &&
    usableCloseIndicators(IndicatorSection.sl, dealCloseConditionSL).length ===
      0 &&
    useSl
  ) {
    errors['indicatorsCloseSL'] =
      `You need to select at least 1 indicator to close the deal by stop loss`;
  }
  if (
    dealCloseConditionSL === CloseConditionEnum.dynamicAr &&
    usableCloseIndicators(IndicatorSection.sl, dealCloseConditionSL).length ===
      0 &&
    useSl
  ) {
    errors['indicatorsCloseSL'] =
      `You need to add at least 1 ATR or ADR indicator to close the deal by dynamic stop loss`;
  }
  if (
    type === DCATypeEnum.terminal &&
    startOrderType === OrderTypeEnum.limit &&
    useLimitPrice &&
    (!baseOrderPrice || baseOrderPrice === '' || +baseOrderPrice === 0)
  ) {
    errors['baseOrderPrice'] = `Base order price must be provided`;
  }
  // Note: Directional validation for limit price (must be <= current for longs, >= current for shorts)
  // is handled in the LimitPriceInput component since we need access to latestPrice from context
  if (cooldownAfterDealStart && (cooldownAfterDealStartInterval ?? 0) <= 0) {
    errors['cooldownAfterDealStartInterval'] =
      `Cooldown after deal start interval must be greater than 0`;
  }
  if (cooldownAfterDealStop && (cooldownAfterDealStopInterval ?? 0) <= 0) {
    errors['cooldownAfterDealStopInterval'] =
      `Cooldown after deal stop interval must be greater than 0`;
  }
  if (!useDca) {
    delete errors.activeOrdersCount;
    delete errors.orderSize;
    delete errors.ordersCount;
    delete errors.step;
    delete errors.stepScale;
    delete errors.volumeScale;
  }
  if (
    trailingTp &&
    useTp &&
    (!checkNumber(trailingTpPerc) ||
      (checkNumber(trailingTpPerc) && trailingTpPerc === '0'))
  ) {
    errors['trailingTpPerc'] = `Trailing take profit % must be set`;
  }
  if (
    useMinTP &&
    useTp &&
    dealCloseCondition === CloseConditionEnum.techInd &&
    !checkNumber(minTp)
  ) {
    errors['minTp'] = `Minimum take profit must be set`;
  }
  if (useCloseAfterX && !checkNumber(closeAfterX)) {
    errors['closeAfterX'] = `Close after X seconds must be set`;
  }
  if (useCloseAfterXloss && !checkNumber(closeAfterXloss)) {
    errors['closeAfterXloss'] = `Close after X losses must be set`;
  }
  if (useCloseAfterXwin && !checkNumber(closeAfterXwin)) {
    errors['closeAfterXwin'] = `Close after X wins must be set`;
  }
  if (useCloseAfterXprofit && !checkNumber(closeAfterXprofitValue)) {
    errors['closeAfterXprofitValue'] = `Close after X profit must be set`;
  }
  if (
    useBotController &&
    botStart === BotStartTypeEnum.price &&
    !checkNumber(stopBotPriceValue)
  ) {
    errors['stopBotPriceValue'] = `Stop bot price must be set`;
  }
  if (
    useBotController &&
    botActualStart === BotStartTypeEnum.price &&
    !checkNumber(startBotPriceValue)
  ) {
    errors['startBotPriceValue'] = `Start bot price must be set`;
  }
  if (useCloseAfterXopen && !checkNumber(closeAfterXopen)) {
    errors['closeAfterXopen'] = `Close after X open deals must be set`;
  }
  if (
    useCloseAfterXopen &&
    closeAfterXopen &&
    checkNumber(closeAfterXopen) &&
    maxNumberOfOpenDeals &&
    checkNumber(maxNumberOfOpenDeals) &&
    +closeAfterXopen < +maxNumberOfOpenDeals
  ) {
    errors['closeAfterXopen'] =
      `Close after X opened should be more than max opened deals`;
  }
  if (pair.length === 0) {
    errors['pair'] = `Trading pair must be set`;
  }
  if (
    (volumeTop === '' || volumeTop === '0') &&
    volumeValue === VolumeValueEnum.custom &&
    useVolumeFilter
  ) {
    errors['volumeTop'] = `Volume top value must be set`;
  }
  if (
    (relativeVolumeTop === '' || relativeVolumeTop === '0') &&
    relativeVolumeValue === VolumeValueEnum.custom &&
    useRelativeVolumeFilter
  ) {
    errors['relativeVolumeTop'] = `Relative volume top value must be set`;
  }
  if (leverage && leverage < 1 && marginType !== BotMarginTypeEnum.inherit) {
    errors['leverage'] = `Leverage should be more than 1`;
  }
  if (leverage && leverage > 125 && marginType !== BotMarginTypeEnum.inherit) {
    errors['leverage'] = `Leverage should be less than 125`;
  }

  // Populate alerts from any plain errors
  for (const [k, v] of Object.entries(errors)) {
    if (!alerts[k as keyof typeof alerts] && v) {
      setAlert(alerts, k as keyof typeof alerts, {
        variant: 'error',
        message: String(v),
        navId: getNavIdForDcaField(String(k)),
      });
    }
  }

  return { errors, alerts };
};
