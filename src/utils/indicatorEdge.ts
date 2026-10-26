/**
 * Price behaviour vs random entries for an indicator page (content API
 * `GET /indicators/:slug` → `edge`): sanitizing, row order and labels.
 */
import { IndicatorEnum } from '@/types';
import type {
  IndicatorEdge,
  IndicatorEdgeBotConfig,
  IndicatorEdgeCell,
  IndicatorEdgeMethod,
  IndicatorEdgeSetting,
  IndicatorEdgeVerdict,
} from '@/types/helpCenter';

/** Row order: what holds up first, then chance, then what did worse, then too few to judge. */
export const EDGE_VERDICT_ORDER: IndicatorEdgeVerdict[] = [
  'edge',
  'fragile',
  'none',
  'fragile-worse',
  'worse',
  'few',
];

export const EDGE_VERDICT_LABEL: Record<IndicatorEdgeVerdict, string> = {
  edge: 'Beat random',
  fragile: 'Beat random, fragile',
  none: 'Same as random',
  worse: 'Worse than random',
  'fragile-worse': 'Worse, fragile',
  few: 'Too few signals',
};

/** Badge variant per verdict, in the dashboard's badge palette. */
export const EDGE_VERDICT_BADGE: Record<
  IndicatorEdgeVerdict,
  'success' | 'warning' | 'secondary' | 'error' | 'outline'
> = {
  edge: 'success',
  fragile: 'warning',
  none: 'secondary',
  worse: 'error',
  'fragile-worse': 'warning',
  few: 'outline',
};

/** Timeframes in this order first; any other comes after, in data order. */
const TF_ORDER = ['1h', '4h', '1d'];

const INDICATOR_TYPES = new Set<string>(Object.values(IndicatorEnum));

/* eslint-disable @typescript-eslint/no-explicit-any -- reads untyped JSON */
const isObject = (v: unknown): v is any =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const num = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0;
const positiveInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) > 0;
const range = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) && v[0] <= v[1];
const isoDay = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isVerdict = (v: unknown): v is IndicatorEdgeVerdict =>
  EDGE_VERDICT_ORDER.includes(v as IndicatorEdgeVerdict);

class MalformedEdge extends Error {}

/** The value, or a throw on the first malformed field. */
function need<T>(ok: boolean, value: T): T {
  if (!ok) throw new MalformedEdge('malformed edge data');
  return value;
}

function toCell(c: any): IndicatorEdgeCell {
  return {
    entries: need(count(c?.entries), c?.entries),
    episodes: need(count(c?.episodes), c?.episodes),
    edge: need(num(c?.edge), c?.edge),
    chance: need(range(c?.chance), [c?.chance?.[0], c?.chance?.[1]] as [
      number,
      number,
    ]),
    verdict: need(isVerdict(c?.verdict), c?.verdict),
  };
}

/** A setting's trend split, or undefined when absent or malformed: it drops alone. */
function toRegimes(r: unknown): IndicatorEdgeSetting['regimes'] {
  if (!isObject(r)) return undefined;
  try {
    return { up: toCell(r.up), down: toCell(r.down) };
  } catch {
    return undefined;
  }
}

const isParamValue = (
  v: unknown
): v is IndicatorEdgeBotConfig['params'][string] =>
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  num(v) ||
  (Array.isArray(v) &&
    (v.every((x) => typeof x === 'string') || v.every((x) => num(x))));

/**
 * The bot-form config of a setting, or null. A missing or malformed `bot`
 * only removes Apply from that row: the price data does not depend on it.
 */
function toBot(b: unknown): IndicatorEdgeBotConfig | null {
  if (!isObject(b) || !INDICATOR_TYPES.has(b.type) || !isObject(b.params)) {
    return null;
  }
  const entries = Object.entries(b.params);
  if (!entries.every(([key, value]) => str(key) && isParamValue(value))) {
    return null;
  }
  return {
    type: b.type,
    params: Object.fromEntries(
      entries.map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value] : value,
      ])
    ) as IndicatorEdgeBotConfig['params'],
  };
}

function toSetting(s: any): IndicatorEdgeSetting {
  const setting: IndicatorEdgeSetting = {
    id: need(str(s?.id), s?.id),
    tf: need(str(s?.tf), s?.tf),
    label: need(str(s?.label), s?.label),
    side: need(s?.side === 'long' || s?.side === 'short', s?.side),
    pooled: toCell(s?.pooled),
    bot: toBot(s?.bot),
  };
  const regimes = toRegimes(s?.regimes);
  if (regimes) setting.regimes = regimes;
  return setting;
}

function toMethod(m: any): IndicatorEdgeMethod {
  const method: IndicatorEdgeMethod = {
    horizon: need(positiveInt(m?.horizon), m?.horizon),
    horizons: need(
      Array.isArray(m?.horizons) &&
        m.horizons.length > 0 &&
        m.horizons.every(positiveInt),
      Array.isArray(m?.horizons) ? [...m.horizons] : []
    ),
    randomDraws: need(positiveInt(m?.randomDraws), m?.randomDraws),
    minEpisodes: need(positiveInt(m?.minEpisodes), m?.minEpisodes),
    source: need(str(m?.source), m?.source),
    pairs: need(
      Array.isArray(m?.pairs) && m.pairs.length > 0 && m.pairs.every(str),
      Array.isArray(m?.pairs) ? [...m.pairs] : []
    ),
    from: need(isoDay(m?.from), m?.from),
    to: need(isoDay(m?.to), m?.to),
  };
  if (positiveInt(m?.regime?.sma)) method.regime = { sma: m.regime.sma };
  return method;
}

/**
 * The page's edge data, rebuilt from the fields the panel reads. Anything
 * malformed drops the whole panel (a half-valid table would misreport) and
 * never the article. Two parts drop alone instead: a setting's trend split
 * and its bot config, since the rest of the row does not depend on them.
 */
export function sanitizeIndicatorEdge(raw: unknown): IndicatorEdge | undefined {
  if (!isObject(raw)) return undefined;
  try {
    const settings = need(
      Array.isArray(raw.settings) && raw.settings.length > 0,
      raw.settings as unknown[]
    ).map(toSetting);
    const tfs = new Set(settings.map((s) => s.tf));
    return {
      updatedAt: need(isoDay(raw.updatedAt), raw.updatedAt),
      defaultTf: need(tfs.has(raw.defaultTf), raw.defaultTf),
      method: toMethod(raw.method),
      settings,
    };
  } catch (err) {
    if (err instanceof MalformedEdge) return undefined;
    throw err;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The timeframes that have rows: 1h, 4h, 1d first, then any other. */
export function edgeTimeframes(edge: IndicatorEdge): string[] {
  const present = [...new Set(edge.settings.map((s) => s.tf))];
  return [
    ...TF_ORDER.filter((tf) => present.includes(tf)),
    ...present.filter((tf) => !TF_ORDER.includes(tf)),
  ];
}

/** One timeframe's rows by verdict; data order within a verdict. */
export function edgeRowsFor(
  edge: IndicatorEdge,
  tf: string
): IndicatorEdgeSetting[] {
  return edge.settings
    .filter((s) => s.tf === tf)
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        EDGE_VERDICT_ORDER.indexOf(a.s.pooled.verdict) -
          EDGE_VERDICT_ORDER.indexOf(b.s.pooled.verdict) || a.i - b.i
    )
    .map(({ s }) => s);
}

// ─── Side ─────────────────────────────────────────────────────────────────────

export type EdgeSide = 'long' | 'short';

const MIRRORED_VERDICT: Record<IndicatorEdgeVerdict, IndicatorEdgeVerdict> = {
  edge: 'worse',
  worse: 'edge',
  fragile: 'fragile-worse',
  'fragile-worse': 'fragile',
  none: 'none',
  few: 'few',
};

const negate = (v: number) => (v === 0 ? 0 : -v);

/**
 * A result seen from the other side. Flipping the side flips the sign of
 * both the entries' move and the random baseline, so the edge and the luck
 * band negate exactly ([lo, hi] → [−hi, −lo]) and better/worse swap.
 */
export function mirrorEdgeCell(cell: IndicatorEdgeCell): IndicatorEdgeCell {
  return {
    ...cell,
    edge: negate(cell.edge),
    chance: [negate(cell.chance[1]), negate(cell.chance[0])],
    verdict: MIRRORED_VERDICT[cell.verdict],
  };
}

/**
 * A setting as it reads for a condition that trades `side`: unchanged when
 * the side is unknown or is the tested one, else mirrored and marked with
 * the side it was tested on.
 */
export function edgeSettingForSide(
  setting: IndicatorEdgeSetting,
  side: EdgeSide | null | undefined
): IndicatorEdgeSetting {
  if (!side || side === setting.side) return setting;
  const view: IndicatorEdgeSetting = {
    ...setting,
    side,
    testedSide: setting.side,
    pooled: mirrorEdgeCell(setting.pooled),
  };
  if (setting.regimes) {
    view.regimes = {
      up: mirrorEdgeCell(setting.regimes.up),
      down: mirrorEdgeCell(setting.regimes.down),
    };
  }
  return view;
}

/** Every setting as it reads for `side` (see `edgeSettingForSide`). */
export function edgeForSide(
  edge: IndicatorEdge,
  side: EdgeSide | null | undefined
): IndicatorEdge {
  if (!side) return edge;
  return {
    ...edge,
    settings: edge.settings.map((s) => edgeSettingForSide(s, side)),
  };
}

const sideWord = (side: EdgeSide) => (side === 'long' ? 'long' : 'short');

/** The tooltip line for a mirrored view, or null. */
export function edgeSideNote(setting: IndicatorEdgeSetting): string | null {
  return setting.testedSide
    ? `Tested on ${sideWord(setting.testedSide)} entries; shown for your ${sideWord(setting.side)} bot.`
    : null;
}

/** `+0.12%`, `−0.12%`, `0.00%`. */
export function formatEdgePct(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(2)}%`;
}

/** `2026-10-25` → `Oct 25, 2026`. */
export function formatEdgeDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
