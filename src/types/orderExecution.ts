/**
 * How an order is executed — one shape for the base order, DCA orders and
 * every place a position is closed (take profit, stop loss, manual close).
 *
 * Mirrors `OrderExecution` in main-app `core/types.ts`; keep the two identical.
 */

export type ExecutionMode = 'market' | 'limit' | 'chase' | 'split';

/** iceberg: next slice goes up once the previous one fills. twap: on a timer. */
export type ExecutionSplitPace = 'iceberg' | 'twap';

/**
 * limit: each slice rests at the trigger price (level triggers only — the
 * first slice is in the order book before price gets there).
 */
export type ExecutionSliceMode = 'market' | 'chase' | 'limit';

/** What a split does when price moves past its floor. */
export type ExecutionFloorAction = 'pause' | 'market';

export type ExecutionStage =
  | 'entry'
  | 'dca'
  | 'tp'
  | 'sl'
  | 'close'
  /** A manual add to a running deal (Add funds dialog). */
  | 'addFunds'
  /** A manual withdrawal from a running deal: market or limit only. */
  | 'reduceFunds';

/**
 * What starts the order. `level`: a price the bot knows in advance
 * (percentage, ATR/ADR, scaled DCA levels) — a limit can rest in the order
 * book ahead of time. `indicator` / `webhook` / `start` / `manual`: an event at
 * an unknown time — nothing can rest beforehand.
 */
export type ExecutionTrigger =
  'level' | 'indicator' | 'webhook' | 'start' | 'manual';

export interface OrderExecution {
  mode: ExecutionMode;
  /** chase: seconds between re-prices. */
  repriceSec?: number;
  /** chase: never re-price further than this % from the trigger price. 0 = no cap. */
  maxChasePerc?: number;
  /** limit / chase ("Enter market timeout"): seconds unfilled before the rest fills at market. 0 = never. */
  timeoutSec?: number;
  /** split: number of slices. */
  slices?: number;
  pace?: ExecutionSplitPace;
  /** split: seconds between slices. */
  sliceIntervalSec?: number;
  sliceMode?: ExecutionSliceMode;
  /** split: stop placing slices when price moves this % against the trigger. 0 = no floor. */
  floorPerc?: number;
  onFloor?: ExecutionFloorAction;
}

export const EXECUTION_LIMITS = {
  repriceSec: { min: 5, max: 600 },
  maxChasePerc: { min: 0, max: 20 },
  timeoutSec: { min: 0, max: 86_400 },
  slices: { min: 2, max: 50 },
  sliceIntervalSec: { min: 5, max: 3_600 },
  floorPerc: { min: 0, max: 50 },
} as const;

/** Defaults a field takes when the user first switches into a mode. */
export const EXECUTION_MODE_DEFAULTS: Record<ExecutionMode, OrderExecution> = {
  market: { mode: 'market' },
  limit: { mode: 'limit', timeoutSec: 0 },
  chase: {
    mode: 'chase',
    repriceSec: 10,
    maxChasePerc: 1,
    timeoutSec: 35,
  },
  split: {
    mode: 'split',
    slices: 5,
    pace: 'iceberg',
    sliceIntervalSec: 30,
    sliceMode: 'chase',
    repriceSec: 10,
    maxChasePerc: 1,
    floorPerc: 2,
    onFloor: 'pause',
  },
};

/**
 * Modes offered for a stage and trigger.
 *
 * - A known price level already gets the best limit price by resting in the
 *   book, so chasing adds nothing there.
 * - A stop loss never waits at a fixed price.
 */
export interface ExecutionModeContext {
  /** Combo / hedge-combo bots: no partial close, signal-like exits. */
  isCombo?: boolean;
  /** Take profit with several targets: no split, no resting timeout. */
  multiTarget?: boolean;
  /**
   * The base order's size is owned by another mechanism (risk/reward sizing,
   * short spot base funding): no split.
   */
  entrySplitBlocked?: boolean;
}

/**
 * Modes offered for a stage and trigger — only what the engine executes.
 *
 * - A known price level already gets the best limit price by resting in the
 *   book, so chasing adds nothing there.
 * - A stop loss never waits at a fixed price.
 * - Split order exists for the base order, take profit and stop loss on DCA
 *   bots (a single take-profit target); not for DCA orders or combo bots.
 * - Indicator DCA orders are always sent at market.
 */
export const availableExecutionModes = (
  stage: ExecutionStage,
  trigger: ExecutionTrigger,
  ctx: ExecutionModeContext = {}
): ExecutionMode[] => {
  const isLevel = trigger === 'level';
  if (stage === 'addFunds') {
    return ctx.isCombo ? ['market'] : ['market', 'limit', 'chase', 'split'];
  }
  if (stage === 'reduceFunds') {
    return ctx.isCombo ? ['market'] : ['market', 'limit'];
  }
  if (stage === 'dca') {
    return isLevel ? ['market', 'limit'] : ['market'];
  }
  if (stage === 'entry') {
    return ctx.entrySplitBlocked || ctx.isCombo
      ? ['market', 'limit', 'chase']
      : ['market', 'limit', 'chase', 'split'];
  }
  if (ctx.isCombo) {
    return ['market', 'chase'];
  }
  const split: ExecutionMode[] =
    stage === 'tp' && ctx.multiTarget ? [] : ['split'];
  if (stage === 'sl') {
    // A stop sits on the wrong side of the price, so nothing can rest in
    // advance: every option starts once the stop is reached.
    return ['market', 'chase', ...split];
  }
  return isLevel
    ? ['market', 'limit', ...split]
    : ['market', 'limit', 'chase', ...split];
};

/** Whether the "Enter market timeout" applies to this stage's limit. */
export const limitTimeoutSupported = (
  stage: ExecutionStage,
  trigger: ExecutionTrigger,
  ctx: ExecutionModeContext = {}
): boolean => {
  // A manual add/reduce limit rests until it fills or is cancelled.
  if (stage === 'dca' || stage === 'addFunds' || stage === 'reduceFunds') {
    return false;
  }
  if (stage === 'tp' && trigger === 'level' && ctx.multiTarget) {
    return false;
  }
  return true;
};

/** Slice modes offered for a trigger: a known level can rest, a signal cannot. */
export const availableSliceModes = (
  trigger: ExecutionTrigger,
  stage: ExecutionStage
): ExecutionSliceMode[] =>
  // A stop loss sits on the wrong side of the price: a limit there fills
  // immediately, so its slices can only start once the stop is reached.
  trigger === 'level' && stage !== 'sl'
    ? ['limit', 'market']
    : ['chase', 'market'];

/** Keep a split's slice mode valid for the trigger. */
export const fitSliceMode = (
  value: OrderExecution,
  trigger: ExecutionTrigger,
  stage: ExecutionStage
): OrderExecution => {
  if (value.mode !== 'split') {
    return value;
  }
  const allowed = availableSliceModes(trigger, stage);
  const sliceMode = value.sliceMode ?? 'chase';
  if (allowed.includes(sliceMode)) {
    return value;
  }
  return {
    ...value,
    sliceMode: sliceMode === 'market' ? 'market' : allowed[0],
  };
};

export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
  market: 'Market',
  limit: 'Limit',
  chase: 'Chasing limit',
  split: 'Split order',
};

/** Fill every field the mode needs, keeping what the user already set. */
export const normalizeExecution = (value: OrderExecution): OrderExecution => ({
  ...EXECUTION_MODE_DEFAULTS[value.mode],
  ...value,
});

/**
 * The closest mode offered when the stored one is not available for the
 * trigger (e.g. a chasing limit on a percentage take profit → limit).
 */
export const fitExecutionToModes = (
  value: OrderExecution,
  modes: ExecutionMode[]
): OrderExecution => {
  if (modes.includes(value.mode)) {
    return value;
  }
  if (value.mode === 'chase' && modes.includes('limit')) {
    return normalizeExecution({ mode: 'limit', timeoutSec: value.timeoutSec });
  }
  if (value.mode === 'limit' && modes.includes('chase')) {
    return normalizeExecution({ mode: 'chase', timeoutSec: value.timeoutSec });
  }
  return EXECUTION_MODE_DEFAULTS.market;
};

export interface LegacyExecutionFields {
  closeOrderType?: string | null;
  comboTpLimit?: boolean | null;
  comboSlLimit?: boolean | null;
  closeDealType?: string | null;
  limitTimeout?: string | null;
  useLimitTimeout?: boolean | null;
  startOrderType?: string | null;
  notUseLimitReposition?: boolean | null;
  dcaByMarket?: boolean | null;
}

const legacyTimeout = (legacy: LegacyExecutionFields, fallback: number) => {
  const timeout = Number(legacy.limitTimeout);
  return legacy.useLimitTimeout && Number.isFinite(timeout) && timeout > 0
    ? timeout
    : fallback;
};

/**
 * What a bot saved before the execution fields existed actually does,
 * expressed as an OrderExecution. Used to show existing bots faithfully.
 */
export const resolveLegacyExecution = (
  stage: ExecutionStage,
  legacy: LegacyExecutionFields,
  isCombo: boolean
): OrderExecution => {
  const isMarket = (v: string | null | undefined, fallback: string) =>
    String(v ?? fallback).toUpperCase() === 'MARKET';
  const closeChase = () =>
    normalizeExecution({
      mode: 'chase',
      timeoutSec: legacyTimeout(legacy, 35),
    });

  switch (stage) {
    case 'entry':
      if (isMarket(legacy.startOrderType, isCombo ? 'MARKET' : 'LIMIT')) {
        return EXECUTION_MODE_DEFAULTS.market;
      }
      // A limit entry re-prices every 10 s with no distance cap, and only
      // goes to market when "Enter market timeout" is on.
      return legacy.notUseLimitReposition
        ? normalizeExecution({
            mode: 'limit',
            timeoutSec: legacyTimeout(legacy, 0),
          })
        : normalizeExecution({
            mode: 'chase',
            repriceSec: 10,
            maxChasePerc: 0,
            timeoutSec: legacyTimeout(legacy, 0),
          });
    case 'dca':
      return legacy.dcaByMarket
        ? EXECUTION_MODE_DEFAULTS.market
        : normalizeExecution({ mode: 'limit', timeoutSec: 0 });
    case 'tp':
      if (isCombo) {
        return legacy.comboTpLimit
          ? closeChase()
          : EXECUTION_MODE_DEFAULTS.market;
      }
      // DCA: a LIMIT take profit rests on the exchange at its price.
      return isMarket(legacy.closeOrderType, 'LIMIT')
        ? EXECUTION_MODE_DEFAULTS.market
        : normalizeExecution({ mode: 'limit', timeoutSec: 0 });
    case 'sl':
      return isCombo && legacy.comboSlLimit
        ? closeChase()
        : EXECUTION_MODE_DEFAULTS.market;
    default:
      return legacy.closeDealType === 'closeByLimit'
        ? closeChase()
        : EXECUTION_MODE_DEFAULTS.market;
  }
};

export const triggerFromCloseCondition = (
  condition: string | null | undefined
): ExecutionTrigger => {
  switch (condition) {
    case 'techInd':
      return 'indicator';
    case 'webhook':
      return 'webhook';
    case 'manual':
      return 'manual';
    default:
      return 'level';
  }
};

const secs = (n: number) => `${n} second${n === 1 ? '' : 's'}`;

interface StageWords {
  /** "the take profit price" */
  levelName: string;
  /** "When price reaches the take profit price" etc. */
  when: (trigger: ExecutionTrigger) => string;
  /** "the position closes" */
  fills: string;
  /** what is split: "the position is closed" */
  splitWhat: string;
  /** "the rest closes at market" */
  restAtMarket: string;
}

const STAGE_WORDS: Record<ExecutionStage, StageWords> = {
  entry: {
    levelName: 'the entry price',
    when: (t) =>
      t === 'indicator'
        ? 'When the deal start indicator condition is met'
        : t === 'webhook'
          ? 'When the start webhook signal arrives'
          : 'When a deal starts',
    fills: 'the base order is executed',
    splitWhat: 'the base order is placed',
    restAtMarket: 'the rest is executed at market',
  },
  dca: {
    levelName: 'its DCA level',
    when: (t) =>
      t === 'level'
        ? 'When price reaches a DCA level'
        : 'When the DCA indicator condition is met',
    fills: 'the DCA order is executed',
    splitWhat: 'each DCA order is placed',
    restAtMarket: 'the rest is executed at market',
  },
  tp: {
    levelName: 'the take profit price',
    when: (t) =>
      t === 'indicator'
        ? 'When the take profit indicator condition is met'
        : t === 'webhook'
          ? 'When the take profit webhook signal arrives'
          : 'When price reaches the take profit price',
    fills: 'the position is closed',
    splitWhat: 'the position is closed',
    restAtMarket: 'the rest is executed at market',
  },
  sl: {
    levelName: 'the stop loss price',
    when: (t) =>
      t === 'indicator'
        ? 'When the stop loss indicator condition is met'
        : t === 'webhook'
          ? 'When the stop loss webhook signal arrives'
          : 'When price reaches the stop loss price',
    fills: 'the position is closed',
    splitWhat: 'the position is closed',
    restAtMarket: 'the rest is executed at market',
  },
  addFunds: {
    levelName: 'the limit price',
    when: () => 'When you confirm',
    fills: 'the funds are added',
    splitWhat: 'the funds are added',
    restAtMarket: 'the rest is added at market',
  },
  reduceFunds: {
    levelName: 'the limit price',
    when: () => 'When you confirm',
    fills: 'the funds are withdrawn',
    splitWhat: 'the funds are withdrawn',
    restAtMarket: 'the rest is withdrawn at market',
  },
  close: {
    levelName: 'the close price',
    when: () => 'When you confirm the close',
    fills: 'the position is closed',
    splitWhat: 'the position is closed',
    restAtMarket: 'the rest is executed at market',
  },
};

/**
 * Plain-language summary of what the chosen execution does for this stage and
 * trigger. Shown in the summary panel under the options.
 */
export const summarizeExecution = (
  stage: ExecutionStage,
  value: OrderExecution,
  trigger: ExecutionTrigger,
  /** A limit at a chosen price instead of the current one (manual close). */
  limitPrice?: number
): string[] => {
  const e = normalizeExecution(value);
  const w = STAGE_WORDS[stage];
  const when = w.when(trigger);
  const nothingRests =
    trigger === 'level' ? 'Nothing rests in the order book beforehand. ' : '';
  const timeout = (from: string) =>
    e.timeoutSec && e.timeoutSec > 0
      ? `If it is still not filled ${secs(e.timeoutSec)} ${from}, it is cancelled and ${w.restAtMarket}.`
      : 'It stays open until it fills.';
  const chaseCap = e.maxChasePerc
    ? `, never more than ${e.maxChasePerc}% from the price at which it was triggered`
    : '';

  switch (e.mode) {
    case 'market':
      return [`${when}, ${w.fills} immediately at market.`];
    case 'limit':
      if (trigger === 'level') {
        const what =
          stage === 'dca' ? 'Each DCA limit order' : 'The limit order';
        return [
          `${what} is placed on the exchange in advance, at ${w.levelName}, and rests in the order book until price reaches it.`,
          timeout('after it first fills partly'),
        ];
      }
      return [
        limitPrice && limitPrice > 0
          ? `${when}, a limit order is placed at ${limitPrice} and stays at that price.`
          : `${when}, a limit order is placed at the current price and stays at that price.`,
        timeout('after it is placed'),
      ];
    case 'chase':
      return [
        `${when}, a limit order is placed at the current price and moved to the new price every ${secs(e.repriceSec ?? 10)}${chaseCap}.`,
        timeout('after it is first placed'),
      ];
    case 'split': {
      const slices = e.slices ?? 5;
      const share = `about ${Math.round(100 / slices)}% each`;
      const interval = secs(e.sliceIntervalSec ?? 30);
      const floor = e.floorPerc
        ? e.onFloor === 'market'
          ? `If price moves more than ${e.floorPerc}% against the trigger price, ${w.restAtMarket}.`
          : `If price moves more than ${e.floorPerc}% against the trigger price, no new slices are placed until it comes back.`
        : null;
      if (trigger === 'level' && e.sliceMode === 'limit') {
        return [
          `Nothing rests in the order book beforehand. ${when}, the position is closed in ${slices} slices (${share}), each placed at ${w.levelName}.`,
          e.pace === 'twap'
            ? `A new slice is placed at that price every ${interval}.`
            : `Only one slice is in the order book at a time; the next is placed at that price ${interval} after the previous one fills.`,
          ...(floor ? [floor] : []),
        ];
      }
      const pace =
        e.pace === 'twap'
          ? `A new slice is placed every ${interval}.`
          : `Only one slice is in the order book at a time; the next is placed ${interval} after the previous one fills.`;
      const each =
        e.sliceMode === 'market'
          ? 'Each slice fills at market.'
          : `Each slice is a chasing limit, moved every ${secs(e.repriceSec ?? 10)}${chaseCap}.`;
      return [
        `${nothingRests}${when}, ${w.splitWhat} in ${slices} slices of ${share}.`,
        pace,
        each,
        ...(floor ? [floor] : []),
      ];
    }
    default:
      return [];
  }
};

const EXECUTION_KEYS = [
  'mode',
  'repriceSec',
  'maxChasePerc',
  'timeoutSec',
  'slices',
  'pace',
  'sliceIntervalSec',
  'sliceMode',
  'floorPerc',
  'onFloor',
] as const;

const EXECUTION_MODES: ExecutionMode[] = ['market', 'limit', 'chase', 'split'];

/**
 * Normalise an execution object coming from the API (or any untyped source):
 * keeps only known keys, drops nulls and `__typename`, and returns null when
 * there is no valid mode — null means "derive from the legacy fields".
 */
export const sanitizeExecution = (raw: unknown): OrderExecution | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const source = raw as Record<string, unknown>;
  if (!EXECUTION_MODES.includes(source['mode'] as ExecutionMode)) {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const key of EXECUTION_KEYS) {
    const v = source[key];
    if (v !== null && v !== undefined) {
      out[key] = v;
    }
  }
  return out as unknown as OrderExecution;
};

