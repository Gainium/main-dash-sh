// Single position per pair — the backend reads and writes.
//
// Compatibility with an older main-app (self-hosted instances update the
// dashboard and the backend separately): a GraphQL document that selects a
// field the schema does not know fails WHOLE, so none of the new fields
// (`singlePosition`, `maxPositionEntries`, `positionEntries`) is added to the
// shared bot or deal fragments. They are read here, in their own small
// documents, and a schema rejection of those documents is the signal that the
// backend predates the feature ('old'): the dashboard then hides the setting
// and sends none of it. Bot and deal loading never depend on these documents.
import { dealQueries } from '@/lib/api/GraphQLQueries-deal-queries';
import type { GraphQLClient } from '@/lib/api/GraphQLClient';
import { isSchemaRejection } from '@/lib/largeAccount/largeAccount';
import type { PreviewDeal } from './singlePosition';

export type SinglePositionBackend = 'new' | 'old' | 'unknown';

export interface BotSinglePositionSettings {
  singlePosition: boolean;
  /** '' = no limit (the stored '0' is read back as ''). */
  maxPositionEntries: string;
}

export interface SinglePositionSettingsResult {
  backend: Exclude<SinglePositionBackend, 'unknown'>;
  byBot: Record<string, BotSinglePositionSettings>;
}

/** Never matches a bot; used when there is no bot to ask about (create mode). */
export const PROBE_BOT_ID = '000000000000000000000000';

/** Bots asked about per request; the aliases share one round trip. */
const MAX_BOTS_PER_REQUEST = 50;

/**
 * One document, one aliased `getDCABotSettings` per bot, selecting only the
 * single-position fields. Variables carry the ids.
 */
export const buildSinglePositionSettingsDocument = (botIds: string[]) => {
  const ids = botIds.length > 0 ? botIds : [PROBE_BOT_ID];
  const params = ids.map((_, i) => `$b${i}: getBotSettingsInput!`).join(', ');
  const fields = ids
    .map(
      (_, i) =>
        `b${i}: getDCABotSettings(input: $b${i}) { status data { settings { singlePosition maxPositionEntries } } }`
    )
    .join('\n  ');
  const query = `query singlePositionSettings(${params}) {\n  ${fields}\n}`;
  const variables = Object.fromEntries(
    ids.map((id, i) => [`b${i}`, { botId: id }])
  );
  return { query, variables, ids };
};

type SettingsAnswer = Record<
  string,
  {
    status?: string;
    data?: {
      settings?: {
        singlePosition?: boolean | null;
        maxPositionEntries?: string | number | null;
      } | null;
    } | null;
  } | null
>;

/**
 * How a failed request reads: a schema rejection means an older backend; any
 * other GraphQL execution error means the schema accepted the document (so the
 * feature exists) but the resolver refused this particular bot.
 */
export const classifySinglePositionError = (
  error: unknown
): 'old' | 'new' | 'transport' => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (isSchemaRejection(message)) return 'old';
  if (/^GraphQL errors:/.test(message)) return 'new';
  return 'transport';
};

export const parseSinglePositionAnswer = (
  ids: string[],
  answer: SettingsAnswer | null | undefined
): Record<string, BotSinglePositionSettings> => {
  const byBot: Record<string, BotSinglePositionSettings> = {};
  ids.forEach((id, i) => {
    if (id === PROBE_BOT_ID) return;
    const settings = answer?.[`b${i}`]?.data?.settings;
    if (!settings) return;
    const raw = settings.maxPositionEntries;
    const max = raw === null || raw === undefined ? '' : String(raw).trim();
    byBot[id] = {
      singlePosition: settings.singlePosition === true,
      maxPositionEntries: max === '0' ? '' : max,
    };
  });
  return byBot;
};

/**
 * The single-position settings of `botIds` (or just the capability probe when
 * empty). Throws only on a transport failure, so a caller can retry later
 * instead of caching "old" for the session.
 */
export async function fetchSinglePositionSettings(
  client: GraphQLClient,
  botIds: string[]
): Promise<SinglePositionSettingsResult> {
  const unique = [...new Set(botIds.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += MAX_BOTS_PER_REQUEST) {
    chunks.push(unique.slice(i, i + MAX_BOTS_PER_REQUEST));
  }
  if (chunks.length === 0) chunks.push([]);

  const byBot: Record<string, BotSinglePositionSettings> = {};
  for (const chunk of chunks) {
    const { query, variables, ids } = buildSinglePositionSettingsDocument(chunk);
    try {
      const answer = await client.request<SettingsAnswer>(query, variables);
      Object.assign(byBot, parseSinglePositionAnswer(ids, answer));
    } catch (error) {
      const kind = classifySinglePositionError(error);
      if (kind === 'old') return { backend: 'old', byBot: {} };
      if (kind === 'transport') throw error;
      // 'new': the schema has the fields; this chunk's bots are unreadable.
    }
  }
  return { backend: 'new', byBot };
}

/** Fields of an open deal the adoption preview needs — all long-standing. */
const OPEN_DEAL_FIELDS = `_id
  botId
  status
  createTime
  avgPrice
  strategy
  symbol { symbol baseAsset quoteAsset }
  initialBalances { base quote }
  currentBalances { base quote }
  levels { all complete }
  settings { tpPerc useTp }`;

export interface OpenDealForPreview extends PreviewDeal {
  botId?: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
}

interface RawOpenDeal extends Omit<OpenDealForPreview, 'symbol'> {
  symbol?: { symbol?: string; baseAsset?: string; quoteAsset?: string } | string;
}

/** The bot's open deals (open / start / error). `terminal` for a terminal deal's own bot. */
export async function fetchBotOpenDeals(
  client: GraphQLClient,
  botId: string,
  { terminal = false }: { terminal?: boolean } = {}
): Promise<OpenDealForPreview[]> {
  const { query, variables } = dealQueries.dcaDealList(
    {
      botId,
      terminal,
      dataGridInput: { page: 0, pageSize: 500 },
    },
    OPEN_DEAL_FIELDS
  );
  const answer = await client.request<{
    dcaDealList: {
      status: string;
      reason?: string | null;
      data?: { result?: RawOpenDeal[] | null } | null;
    };
  }>(query, variables);
  if (answer.dcaDealList?.status !== 'OK') {
    throw new Error(answer.dcaDealList?.reason || 'Failed to load open deals');
  }
  return (answer.dcaDealList.data?.result ?? [])
    .filter((d) => !d.botId || d.botId === botId)
    .map((d) => {
      const symbolObject = typeof d.symbol === 'object' ? d.symbol : undefined;
      const symbol =
        typeof d.symbol === 'string' ? d.symbol : (symbolObject?.symbol ?? '');
      return {
        ...d,
        symbol,
        ...(symbolObject?.baseAsset ? { baseAsset: symbolObject.baseAsset } : {}),
        ...(symbolObject?.quoteAsset
          ? { quoteAsset: symbolObject.quoteAsset }
          : {}),
      } as OpenDealForPreview;
    });
}

export interface PositionEntriesInfo {
  botId: string;
  entries: number;
  /** '' = no limit. */
  maxPositionEntries: string;
}

/**
 * `positionEntries` of the open deals of single-position bots, by deal id.
 * Returns null on an older backend. Two light documents: the open deals'
 * `positionEntries`, then the settings of the bots holding them.
 */
export async function fetchPositionEntriesIndex(
  client: GraphQLClient
): Promise<Record<string, PositionEntriesInfo> | null> {
  const { query, variables } = dealQueries.dcaDealList(
    { dataGridInput: { page: 0, pageSize: 1000 } },
    `_id
  botId
  positionEntries`
  );
  let deals: { _id: string; botId?: string; positionEntries?: number | null }[];
  try {
    const answer = await client.request<{
      dcaDealList: {
        status: string;
        data?: {
          result?:
            | { _id: string; botId?: string; positionEntries?: number | null }[]
            | null;
        } | null;
      };
    }>(query, variables);
    deals = answer.dcaDealList?.data?.result ?? [];
  } catch (error) {
    if (classifySinglePositionError(error) === 'old') return null;
    throw error;
  }
  const withEntries = deals.filter(
    (d) => d.botId && typeof d.positionEntries === 'number' && d.positionEntries > 0
  );
  if (withEntries.length === 0) return {};
  const settings = await fetchSinglePositionSettings(
    client,
    withEntries.map((d) => d.botId as string)
  );
  const index: Record<string, PositionEntriesInfo> = {};
  for (const deal of withEntries) {
    const bot = settings.byBot[deal.botId as string];
    if (!bot?.singlePosition) continue;
    index[deal._id] = {
      botId: deal.botId as string,
      entries: deal.positionEntries as number,
      maxPositionEntries: bot.maxPositionEntries,
    };
  }
  return index;
}

export interface AdoptDealsInput {
  botId: string;
  targetDealId: string;
  dealIds: string[];
}

export interface AdoptDealsResult {
  status: string;
  reason?: string | null;
  data?: unknown;
}

/** §4 / §5.2: fold `dealIds` into the bot's open position `targetDealId`. */
export async function adoptDeals(
  client: GraphQLClient,
  input: AdoptDealsInput
): Promise<AdoptDealsResult> {
  const { query, variables } = dealQueries.adoptDeals(input);
  const answer = await client.request<{ adoptDeals: AdoptDealsResult }>(
    query,
    variables
  );
  const result = answer.adoptDeals;
  if (!result || result.status !== 'OK') {
    throw new Error(result?.reason || 'Failed to merge into the open position');
  }
  return result;
}

type DealOrderRow = {
  typeOrder?: string | null;
  status?: string | null;
  price?: string | number | null;
  sl?: boolean | null;
  reduceFundsId?: string | null;
};

/**
 * The take-profit price resting on the exchange for `dealId`, or null (no TP,
 * or the orders did not load). With several TP targets the nearest one — the
 * first to fill — is returned.
 */
export async function fetchRestingTpPrice(
  client: GraphQLClient,
  botId: string,
  dealId: string,
  strategy: unknown
): Promise<number | null> {
  try {
    const { query, variables } = dealQueries.getDealOrders({ id: botId, dealId, all: true });
    const answer = await client.request<{
      getDealOrders: { status: string; data?: DealOrderRow[] | null };
    }>(query, variables);
    if (answer.getDealOrders?.status !== 'OK') return null;
    const prices = (answer.getDealOrders.data ?? [])
      .filter(
        (o) =>
          o.typeOrder === 'dealTP' &&
          (o.status === 'NEW' || o.status === 'PARTIALLY_FILLED') &&
          !o.sl &&
          !o.reduceFundsId
      )
      .map((o) => Number(o.price))
      .filter((p) => Number.isFinite(p) && p > 0);
    if (prices.length === 0) return null;
    return String(strategy ?? '').toUpperCase() === 'SHORT'
      ? Math.max(...prices)
      : Math.min(...prices);
  } catch {
    return null;
  }
}

/** `deals` with the resting TP of each of `dealIds` attached (§5.1.3 preview). */
export async function withRestingTpPrices<T extends PreviewDeal & { botId?: string }>(
  client: GraphQLClient,
  botId: string,
  deals: T[],
  dealIds: string[],
  strategy: unknown
): Promise<T[]> {
  const wanted = new Set(dealIds);
  const prices = new Map<string, number | null>();
  await Promise.all(
    deals
      .filter((d) => wanted.has(d._id))
      .map(async (d) => {
        const price = await fetchRestingTpPrice(
          client,
          d.botId || botId,
          d._id,
          d.strategy ?? strategy
        );
        prices.set(d._id, price);
      })
  );
  return deals.map((d) =>
    prices.has(d._id) ? { ...d, restingTpPrice: prices.get(d._id) ?? null } : d
  );
}
