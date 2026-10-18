// Base funding (short spot DCA / combo) — the backend reads.
//
// Same compatibility rule as single position (see `singlePositionApi`): a
// self-hosted main-app may predate `baseFunding`, and a document selecting a
// field the schema does not know fails WHOLE. So the setting is read in its own
// small document, never through the shared bot fragments; a schema rejection
// of that document means the backend is 'old', and the dashboard then neither
// shows nor sends the setting.
import type { GraphQLClient } from '@/lib/api/GraphQLClient';
import { isSchemaRejection } from '@/lib/largeAccount/largeAccount';
import { BaseFundingEnum } from '@/types';

export type BaseFundingBackend = 'new' | 'old' | 'unknown';

export type BaseFundingBotKind = 'dca' | 'combo';

/** The bot settings an add-DCA estimate needs, read with the setting. */
export interface BotBaseFundingSettings {
  baseFunding: BaseFundingEnum;
  orderSize: string;
  orderSizeType: string;
  volumeScale: string;
}

export interface BaseFundingSettingsResult {
  backend: Exclude<BaseFundingBackend, 'unknown'>;
  /** Absent in create mode (the probe asks about no bot). */
  settings?: BotBaseFundingSettings;
}

/** Never matches a bot; the capability probe in create mode. */
const PROBE_BOT_ID = '000000000000000000000000';

const SETTINGS_QUERY: Record<BaseFundingBotKind, string> = {
  dca: 'getDCABotSettings',
  combo: 'getComboBotSettings',
};

export const buildBaseFundingSettingsDocument = (
  botId: string | undefined,
  kind: BaseFundingBotKind
) => ({
  query: `query baseFundingSettings($input: getBotSettingsInput!) {
  settings: ${SETTINGS_QUERY[kind]}(input: $input) { status data { settings { baseFunding orderSize orderSizeType volumeScale } } }
}`,
  variables: { input: { botId: botId || PROBE_BOT_ID } },
});

type SettingsAnswer = {
  settings?: {
    data?: {
      settings?: {
        baseFunding?: string | null;
        orderSize?: string | number | null;
        orderSizeType?: string | null;
        volumeScale?: string | number | null;
      } | null;
    } | null;
  } | null;
};

export const toBaseFundingMode = (value: unknown): BaseFundingEnum =>
  value === BaseFundingEnum.auto || value === BaseFundingEnum.botOnly
    ? value
    : BaseFundingEnum.require;

/**
 * The bot's base-funding settings (or the capability probe alone without a
 * bot). Throws only on a transport failure, so the caller retries instead of
 * caching 'old'.
 */
export async function fetchBaseFundingSettings(
  client: GraphQLClient,
  botId: string | undefined,
  kind: BaseFundingBotKind
): Promise<BaseFundingSettingsResult> {
  const { query, variables } = buildBaseFundingSettingsDocument(botId, kind);
  try {
    const answer = await client.request<SettingsAnswer>(query, variables);
    const s = answer?.settings?.data?.settings;
    if (!botId || !s) return { backend: 'new' };
    return {
      backend: 'new',
      settings: {
        baseFunding: toBaseFundingMode(s.baseFunding),
        orderSize: String(s.orderSize ?? ''),
        orderSizeType: String(s.orderSizeType ?? ''),
        volumeScale: String(s.volumeScale ?? '1'),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (isSchemaRejection(message)) return { backend: 'old' };
    // A resolver refusal (this bot unreadable): the schema has the field.
    if (/^GraphQL errors:/.test(message)) return { backend: 'new' };
    throw error;
  }
}

export interface PreviewFundingInput {
  exchangeUUID: string;
  exchange: string;
  pair: string;
  mode: BaseFundingEnum;
  /** The deal's base order in base; 0 for an add-DCA preview. */
  baseOrderQty: number;
  /** Safety orders the deal commits to, in base. */
  safetyQty: number;
  price: number;
  /** Add-DCA preview: the deal whose resting sells already cover part. */
  dealId?: string;
}

export interface FundingPreview {
  /** held: runs on the account's own base; fund: the bot buys; refuse: not enough quote. */
  kind: 'held' | 'fund' | 'refuse';
  baseAsset: string;
  quoteAsset: string;
  freeBase: number;
  freeQuote: number;
  reservedQuote: number;
  virtualEntryQty?: number | null;
  quoteReserved?: number | null;
  heldUsed?: number | null;
  quoteNeeded?: number | null;
  buyQty: number;
  buyQuote: number;
  raisedToMin: boolean;
  sourcedByBot?: boolean | null;
  required?: number | null;
  available?: number | null;
  inOrders?: number | null;
  shortfall?: number | null;
}

const PREVIEW_QUERY = `query previewFunding($input: previewFundingInput!) {
  previewFunding(input: $input) {
    status
    reason
    data {
      kind baseAsset quoteAsset freeBase freeQuote reservedQuote
      virtualEntryQty quoteReserved heldUsed quoteNeeded
      buyQty buyQuote raisedToMin sourcedByBot
      required available inOrders shortfall
    }
  }
}`;

type PreviewAnswer = {
  previewFunding?: {
    status?: string;
    reason?: string | null;
    data?: FundingPreview | null;
  } | null;
};

/** The planner's answer for a deal, or null when the backend has none. */
export async function fetchFundingPreview(
  client: GraphQLClient,
  input: PreviewFundingInput
): Promise<FundingPreview | null> {
  const answer = await client.request<PreviewAnswer>(PREVIEW_QUERY, { input });
  const res = answer?.previewFunding;
  if (!res || res.status !== 'OK' || !res.data) return null;
  return res.data;
}
